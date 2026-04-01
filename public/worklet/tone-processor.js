/**
 * AudioWorklet processor for detecting DTMF, MF, SF, Red Box, and CCITT5 tones.
 * Goertzel algorithm with noise rejection (dominance ratio + energy floor).
 * Based on nhollmann/DTMF-Tool approach, extended for phreaking tones.
 */

const DTMF_ROW = [697, 770, 852, 941];
const DTMF_COL = [1209, 1336, 1477, 1633];
const DTMF_KEYS = "123A456B789C*0#D".split('');

const MF_FREQS = [700, 900, 1100, 1300, 1500, 1700];
const MF_PAIRS = {
  '700,900': '1', '700,1100': '2', '900,1100': '3',
  '700,1300': '4', '900,1300': '5', '1100,1300': '6',
  '700,1500': '7', '900,1500': '8', '1100,1500': '9',
  '1300,1500': '0',
  '700,1700': '11', '900,1700': '12',
  '1100,1700': 'KP', '1500,1700': 'ST',
  '1300,1700': 'KP2'
};

const ALL_FREQS = [...new Set([...DTMF_ROW, ...DTMF_COL, ...MF_FREQS, 2200, 2400, 2600])];

// Tuning constants
const MIN_SAMPLES = 1024;
const HISTORY_LEN = 12;        // require 12 consistent frames
const HISTORY_AGREE = 8;       // at least 8 of 12 must agree
const MAG_FLOOR = 0.08;        // absolute minimum magnitude (was 0.04)
const DOMINANCE_RATIO = 2.0;   // winner must be 2x the runner-up in its group
const ENERGY_FLOOR = 0.005;    // minimum RMS energy to even bother checking

class ToneProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.samples = new Float32Array(MIN_SAMPLES * 2);
    this.sampleCount = 0;
    this.history = [];
    this.lastEmitted = null;
    this.silenceCount = 0;
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;

    for (let i = 0; i < input.length; i++) {
      this.samples[this.sampleCount++] = input[i];
    }

    if (this.sampleCount < MIN_SAMPLES) return true;

    const count = this.sampleCount;
    this.sampleCount = 0;

    // Check RMS energy first — skip silent/quiet frames entirely
    let sumSq = 0;
    for (let i = 0; i < count; i++) sumSq += this.samples[i] * this.samples[i];
    const rms = Math.sqrt(sumSq / count);
    if (rms < ENERGY_FLOOR) {
      this.history.push(null);
      if (this.history.length > HISTORY_LEN) this.history.shift();
      this.silenceCount++;
      if (this.silenceCount > 5) this.lastEmitted = null;
      return true;
    }
    this.silenceCount = 0;

    // Compute Goertzel magnitude for each target frequency
    const mags = {};
    for (const freq of ALL_FREQS) {
      mags[freq] = this.goertzel(freq, sampleRate, this.samples, count);
    }

    const tone = this.identify(mags);

    this.history.push(tone ? `${tone.type}:${tone.key}` : null);
    if (this.history.length > HISTORY_LEN) this.history.shift();

    // Count agreement in recent history
    if (tone) {
      const target = `${tone.type}:${tone.key}`;
      const agree = this.history.filter(h => h === target).length;
      if (agree >= HISTORY_AGREE && target !== this.lastEmitted) {
        this.lastEmitted = target;
        this.port.postMessage(tone);
      }
    }

    return true;
  }

  goertzel(freq, sr, samples, count) {
    const k = Math.round(count * freq / sr);
    const w = (2 * Math.PI * k) / count;
    const cos = Math.cos(w);
    const sin = Math.sin(w);
    const coeff = 2 * cos;
    let q0 = 0, q1 = 0, q2 = 0;
    for (let i = 0; i < count; i++) {
      q0 = coeff * q1 - q2 + samples[i];
      q2 = q1;
      q1 = q0;
    }
    const real = q1 - q2 * cos;
    const imag = q2 * sin;
    return Math.sqrt(real * real + imag * imag);
  }

  identify(mags) {
    // === DTMF: highest row + highest col, both dominant ===
    const rows = DTMF_ROW.map((f, i) => ({ i, f, m: mags[f] })).sort((a, b) => b.m - a.m);
    const cols = DTMF_COL.map((f, i) => ({ i, f, m: mags[f] })).sort((a, b) => b.m - a.m);

    const bestRow = rows[0];
    const bestCol = cols[0];
    const rowDominant = bestRow.m > MAG_FLOOR && (rows.length < 2 || bestRow.m > rows[1].m * DOMINANCE_RATIO);
    const colDominant = bestCol.m > MAG_FLOOR && (cols.length < 2 || bestCol.m > cols[1].m * DOMINANCE_RATIO);

    if (rowDominant && colDominant) {
      const idx = bestRow.i * 4 + bestCol.i;
      return { type: 'DTMF', key: DTMF_KEYS[idx], freqs: [bestRow.f, bestCol.f] };
    }

    // === MF: two strongest MF freqs, both dominant over the rest ===
    const mfSorted = MF_FREQS.map(f => ({ f, m: mags[f] })).sort((a, b) => b.m - a.m);
    if (mfSorted[0].m > MAG_FLOOR && mfSorted[1].m > MAG_FLOOR &&
        (mfSorted.length < 3 || mfSorted[1].m > mfSorted[2].m * DOMINANCE_RATIO)) {
      const pair = [mfSorted[0].f, mfSorted[1].f].sort((a, b) => a - b).join(',');
      if (MF_PAIRS[pair]) return { type: 'MF', key: MF_PAIRS[pair], freqs: [mfSorted[0].f, mfSorted[1].f] };
    }

    // === Single-frequency tones (need high magnitude + no competing DTMF) ===
    const maxDtmf = Math.max(...DTMF_ROW.map(f => mags[f]), ...DTMF_COL.map(f => mags[f]));
    const highThresh = MAG_FLOOR * 3;

    // CCITT5: 2600 + 2400 together
    if (mags[2600] > highThresh && mags[2400] > highThresh && mags[2600] > maxDtmf && mags[2400] > maxDtmf) {
      return { type: 'CCITT5', key: 'TRUNK', freqs: [2600, 2400] };
    }

    // SF 2600 (must be clearly dominant over everything else)
    if (mags[2600] > highThresh && mags[2600] > maxDtmf * 1.5) {
      return { type: 'SF', key: '2600', freqs: [2600] };
    }

    // Red Box 2200
    if (mags[2200] > highThresh && mags[2200] > maxDtmf * 1.5) {
      return { type: 'REDBOX', key: '2200', freqs: [2200] };
    }

    return null;
  }
}

registerProcessor('tone-processor', ToneProcessor);
