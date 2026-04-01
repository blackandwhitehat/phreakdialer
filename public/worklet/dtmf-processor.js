/**
 * DTMF/MF/SF Tone Detector using Goertzel Algorithm
 * AudioWorkletProcessor for real-time tone detection
 */

class DTMFProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // All frequencies to detect
    this.TARGET_FREQS = [
      // DTMF rows
      697, 770, 852, 941,
      // DTMF columns
      1209, 1336, 1477, 1633,
      // MF frequencies
      700, 900, 1100, 1300, 1500, 1700,
      // Special tones
      2200, 2600, 2400
    ];

    // Sample buffer for Goertzel
    this.sampleBuffer = new Float32Array(512);
    this.sampleIndex = 0;
    this.processingThreshold = 512;

    // Debounce detected tones
    this.lastDetectedTone = null;
    this.lastDetectionTime = 0;
    this.debounceMs = 300;

    // Listen for port messages (if needed)
    this.port.onmessage = (event) => {
      // Reserved for future control messages
    };
  }

  /**
   * Goertzel Algorithm: compute magnitude of a specific frequency
   * in a given buffer
   */
  goertzel(samples, sampleRate, targetFreq) {
    const N = samples.length;
    const k = Math.round((N * targetFreq) / sampleRate);
    const w = (2 * Math.PI * k) / N;
    const coeff = 2 * Math.cos(w);

    let s0 = 0;
    let s1 = 0;
    let s2 = 0;

    for (let i = 0; i < N; i++) {
      s0 = samples[i] + coeff * s1 - s2;
      s2 = s1;
      s1 = s0;
    }

    const real = s1 - s2 * Math.cos(w);
    const imag = s2 * Math.sin(w);
    return Math.sqrt(real * real + imag * imag);
  }

  /**
   * Identify tone from detected frequencies
   */
  identifyTone(magnitudes, sampleRate) {
    const threshold = 0.02;

    // Find all frequencies above threshold
    const detected = [];
    this.TARGET_FREQS.forEach((freq) => {
      if (magnitudes[freq] && magnitudes[freq] > threshold) {
        detected.push({ freq, mag: magnitudes[freq] });
      }
    });

    if (detected.length === 0) return null;

    // Sort by magnitude (highest first)
    detected.sort((a, b) => b.mag - a.mag);
    const top = detected.slice(0, 3);

    // Try DTMF match (row + column)
    const dtmfRows = { 697: 0, 770: 1, 852: 2, 941: 3 };
    const dtmfCols = { 1209: 0, 1336: 1, 1477: 2, 1633: 3 };
    const dtmfGrid = [
      ['1', '2', '3', 'A'],
      ['4', '5', '6', 'B'],
      ['7', '8', '9', 'C'],
      ['*', '0', '#', 'D']
    ];

    for (const f1 of top) {
      for (const f2 of top) {
        if (f1.freq in dtmfRows && f2.freq in dtmfCols) {
          return {
            type: 'DTMF',
            key: dtmfGrid[dtmfRows[f1.freq]][dtmfCols[f2.freq]],
            freqs: [f1.freq, f2.freq]
          };
        }
      }
    }

    // Try MF match (two MF frequencies)
    const mfFreqs = [700, 900, 1100, 1300, 1500, 1700];
    const mfPairs = {
      '700,900': '1',
      '700,1100': '2',
      '900,1100': '3',
      '700,1300': '4',
      '900,1300': '5',
      '1100,1300': '6',
      '700,1500': '7',
      '900,1500': '8',
      '1100,1500': '9',
      '1300,1500': '0',
      '700,1700': '11',
      '900,1700': '12',
      '1100,1700': 'KP',
      '1500,1700': 'ST',
      '1300,1700': 'KP2'
    };

    const detectedMF = top
      .filter((d) => mfFreqs.includes(d.freq))
      .map((d) => d.freq)
      .sort((a, b) => a - b);

    if (detectedMF.length >= 2) {
      const key = `${detectedMF[0]},${detectedMF[1]}`;
      if (mfPairs[key]) {
        return {
          type: 'MF',
          key: mfPairs[key],
          freqs: detectedMF.slice(0, 2)
        };
      }
    }

    // SF 2600Hz
    if (top[0].freq === 2600 && top[0].mag > threshold * 2) {
      return {
        type: 'SF',
        key: '2600Hz',
        freqs: [2600]
      };
    }

    // Red Box 2200Hz
    if (top[0].freq === 2200 && top[0].mag > threshold * 2) {
      return {
        type: 'RED BOX',
        key: '2200Hz',
        freqs: [2200]
      };
    }

    // CCITT5 (2600 + 2400)
    if (top.length >= 2) {
      const freqSet = new Set(top.map((t) => t.freq));
      if (freqSet.has(2600) && freqSet.has(2400)) {
        return {
          type: 'CCITT5',
          key: 'Trunk Seize',
          freqs: [2600, 2400]
        };
      }
    }

    return null;
  }

  /**
   * AudioWorkletProcessor callback
   * Called every 128 samples (default buffer size)
   */
  process(inputs, outputs, parameters) {
    const input = inputs[0];

    if (!input || input.length === 0 || !input[0]) {
      return true;
    }

    const channel = input[0]; // Mono
    const sampleRate = sampleRate || 44100;

    // Buffer samples
    for (let i = 0; i < channel.length; i++) {
      this.sampleBuffer[this.sampleIndex++] = channel[i];

      // Process when buffer is full
      if (this.sampleIndex >= this.processingThreshold) {
        this.detectAndReport(sampleRate);
        this.sampleIndex = 0;
      }
    }

    return true;
  }

  /**
   * Detect tones and report to main thread
   */
  detectAndReport(sampleRate) {
    // Run Goertzel on each target frequency
    const magnitudes = {};
    this.TARGET_FREQS.forEach((freq) => {
      magnitudes[freq] = this.goertzel(this.sampleBuffer, sampleRate, freq);
    });

    // Identify tone
    const tone = this.identifyTone(magnitudes, sampleRate);
    const now = Date.now();

    if (tone) {
      const toneKey = `${tone.type}:${tone.key}`;

      // Debounce: only report if different tone or timeout elapsed
      if (toneKey !== this.lastDetectedTone || now - this.lastDetectionTime > this.debounceMs) {
        this.lastDetectedTone = toneKey;
        this.lastDetectionTime = now;

        // Send to main thread
        this.port.postMessage({
          type: 'tone',
          tone: tone,
          timestamp: now
        });
      }
    } else {
      this.lastDetectedTone = null;
    }
  }
}

registerProcessor('dtmf-processor', DTMFProcessor);
