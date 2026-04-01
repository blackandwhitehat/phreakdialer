import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Phone, Mic, MicOff, Play, X, Download, ChevronDown, ChevronUp } from 'lucide-react';

// ── Frequency Tables ──────────────────────────────────────
const DTMF = {
  '1':[697,1209],'2':[697,1336],'3':[697,1477],'A':[697,1633],
  '4':[770,1209],'5':[770,1336],'6':[770,1477],'B':[770,1633],
  '7':[852,1209],'8':[852,1336],'9':[852,1477],'C':[852,1633],
  '*':[941,1209],'0':[941,1336],'#':[941,1477],'D':[941,1633],
};
const MF = {
  '1':[700,900],'2':[700,1100],'3':[900,1100],
  '4':[700,1300],'5':[900,1300],'6':[1100,1300],
  '7':[700,1500],'8':[900,1500],'9':[1100,1500],
  '0':[1300,1500],'11':[700,1700],'12':[900,1700],
  'KP':[1100,1700],'ST':[1500,1700],'KP2':[1300,1700],
  'ST2':[1700,2200],'ST3':[1500,2200],
};

// ── Styles ──────────────────────────────────────
const S = {
  bg: '#0a0a14', panel: '#0e0e1c', border: '#1a1a30',
  green: '#00ff88', greenDim: 'rgba(0,255,136,.15)',
  blue: '#0055ff', red: '#ff3333', orange: '#ff8800',
  text: '#e0e0f0', dim: '#555570', mono: "'Share Tech Mono', 'Courier New', monospace",
};

const PhreakDialer = () => {
  const [mode, setMode] = useState('DTMF');
  const [seq, setSeq] = useState('');
  const [log, setLog] = useState(['PhreakDialer initialized']);
  const [logOpen, setLogOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [detected, setDetected] = useState(null);
  const [detectedLog, setDetectedLog] = useState([]);
  const [toneDur, setToneDur] = useState(200);

  const ctxRef = useRef(null);
  const oscsRef = useRef([]);
  const unlocked = useRef(false);
  const streamRef = useRef(null);
  const sustainRef = useRef(null);
  const toneDurRef = useRef(200);

  // ── iOS Audio Unlock ──────────────────────────────────
  useEffect(() => {
    const unlock = () => {
      if (unlocked.current) return;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!ctxRef.current) ctxRef.current = new AC();
        const ctx = ctxRef.current;
        if (ctx.state === 'suspended') ctx.resume();
        const buf = ctx.createBuffer(1, 1, ctx.sampleRate);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start(0);
        unlocked.current = true;
      } catch (e) {}
    };
    document.addEventListener('touchstart', unlock, { passive: true });
    document.addEventListener('mousedown', unlock, { passive: true });
    return () => {
      document.removeEventListener('touchstart', unlock);
      document.removeEventListener('mousedown', unlock);
    };
  }, []);

  // ── Keyboard Support ──────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT') return;
      const k = e.key.toUpperCase();
      if (mode === 'DTMF' && DTMF[k]) playTone(k);
      else if (mode === 'DTMF' && DTMF[e.key]) playTone(e.key);
      else if (mode === 'MF' && MF[k]) playTone(k);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode]);

  const addLog = (msg) => {
    const t = new Date().toLocaleTimeString();
    setLog(prev => [`[${t}] ${msg}`, ...prev.slice(0, 99)]);
  };

  // ── Audio Engine ──────────────────────────────────
  const ensureCtx = () => {
    if (!ctxRef.current) {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctxRef.current = new AC();
    }
    if (ctxRef.current.state === 'suspended') ctxRef.current.resume();
    return ctxRef.current;
  };

  const stopAll = () => {
    oscsRef.current.forEach(o => { try { o.stop(); o.disconnect(); } catch(e){} });
    oscsRef.current = [];
  };

  const genTone = (freqs, duration = null) => {
    if (duration === null) duration = toneDurRef.current;
    const ctx = ensureCtx();
    stopAll();
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.4, now + 0.01);
    gain.connect(ctx.destination);

    const newOscs = freqs.map(f => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      o.connect(gain);
      o.start(now);
      return o;
    });
    oscsRef.current = newOscs;

    if (duration > 0) {
      const dur = duration / 1000;
      gain.gain.setValueAtTime(0.4, now + dur - 0.01);
      gain.gain.linearRampToValueAtTime(0, now + dur);
      newOscs.forEach(o => o.stop(now + dur + 0.05));
      setTimeout(() => { oscsRef.current = []; }, duration + 60);
    }
    // If duration <= 0, tone sustains until stopAll()
  };

  const playTone = (key) => {
    const table = mode === 'DTMF' ? DTMF : MF;
    const freqs = table[key];
    if (!freqs) return;
    genTone(freqs);
    setSeq(prev => prev + (prev ? ' ' : '') + key);
    addLog(`${mode} ${key} [${freqs.join('+')}Hz]`);
    if (navigator.vibrate) navigator.vibrate(10);
  };

  const playSpecial = (label, freqs, dur) => {
    genTone(freqs, dur);
    setSeq(prev => prev + (prev ? ' ' : '') + label);
    addLog(`${label} [${freqs.join('+')}Hz]`);
    if (navigator.vibrate) navigator.vibrate(10);
  };

  // Red box coin tones
  const playCoin = (coin) => {
    addLog(`RED BOX: ${coin}`);
    setSeq(prev => prev + (prev ? ' ' : '') + coin);
    if (navigator.vibrate) navigator.vibrate(10);
    if (coin === 'NICKEL') { genTone([2200], 66); }
    else if (coin === 'DIME') {
      genTone([2200], 66);
      setTimeout(() => genTone([2200], 66), 132);
    } else if (coin === 'QUARTER') {
      for (let i = 0; i < 5; i++) setTimeout(() => genTone([2200], 33), i * 66);
    }
  };

  // 2600Hz sustain (hold to play, release anywhere to stop)
  const start2600 = () => {
    genTone([2600], 0); // 0 = sustain
    sustainRef.current = true;
    addLog('SF 2600Hz ON');
    // Listen on document so release works even if pointer leaves button
    const release = () => {
      if (sustainRef.current) {
        stopAll();
        sustainRef.current = false;
        setSeq(prev => prev + (prev ? ' ' : '') + '2600');
        addLog('SF 2600Hz OFF');
      }
      document.removeEventListener('mouseup', release);
      document.removeEventListener('touchend', release);
      document.removeEventListener('touchcancel', release);
    };
    document.addEventListener('mouseup', release);
    document.addEventListener('touchend', release);
    document.addEventListener('touchcancel', release);
  };

  // Play sequence
  const playSeq = () => {
    if (!seq.trim()) return;
    addLog(`Playing: ${seq}`);
    const tokens = seq.split(' ');
    const table = mode === 'DTMF' ? DTMF : MF;
    tokens.forEach((tok, i) => {
      setTimeout(() => {
        if (table[tok]) genTone(table[tok]);
        else if (tok === '2600') genTone([2600], 500);
        else if (tok === 'NICKEL') genTone([2200], 66);
        else if (tok === 'DIME') { genTone([2200], 66); setTimeout(() => genTone([2200], 66), 132); }
        else if (tok === 'QUARTER') { for (let j=0;j<5;j++) setTimeout(() => genTone([2200], 33), j*66); }
        else if (tok === 'TRUNK') genTone([2600, 2400], 800);
      }, i * 400);
    });
  };

  // WAV export
  const exportWAV = async () => {
    if (!seq.trim()) { addLog('No sequence to export'); return; }
    addLog('Rendering WAV...');
    try {
      const tokens = seq.split(' ');
      const table = mode === 'DTMF' ? DTMF : MF;
      const sr = 44100;
      const toneDur = 0.2, gap = 0.15;
      const total = tokens.length * (toneDur + gap);
      const offCtx = new OfflineAudioContext(1, Math.ceil(sr * total), sr);

      tokens.forEach((tok, i) => {
        let freqs = table[tok] || (tok === '2600' ? [2600] : tok === 'TRUNK' ? [2600, 2400] : [2200]);
        const start = i * (toneDur + gap);
        const g = offCtx.createGain();
        g.gain.setValueAtTime(0, start);
        g.gain.linearRampToValueAtTime(0.4, start + 0.005);
        g.gain.setValueAtTime(0.4, start + toneDur - 0.005);
        g.gain.linearRampToValueAtTime(0, start + toneDur);
        g.connect(offCtx.destination);
        freqs.forEach(f => {
          const o = offCtx.createOscillator();
          o.type = 'sine'; o.frequency.value = f;
          o.connect(g); o.start(start); o.stop(start + toneDur);
        });
      });

      const buf = await offCtx.startRendering();
      const data = buf.getChannelData(0);
      const wavBuf = new ArrayBuffer(44 + data.length * 2);
      const view = new DataView(wavBuf);
      const writeStr = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
      writeStr(0, 'RIFF'); view.setUint32(4, 36 + data.length * 2, true);
      writeStr(8, 'WAVE'); writeStr(12, 'fmt ');
      view.setUint32(16, 16, true); view.setUint16(20, 1, true);
      view.setUint16(22, 1, true); view.setUint32(24, sr, true);
      view.setUint32(28, sr * 2, true); view.setUint16(32, 2, true);
      view.setUint16(34, 16, true); writeStr(36, 'data');
      view.setUint32(40, data.length * 2, true);
      for (let i = 0; i < data.length; i++) {
        const s = Math.max(-1, Math.min(1, data[i]));
        view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      }
      const blob = new Blob([wavBuf], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'phreakdialer.wav'; a.click();
      URL.revokeObjectURL(url);
      addLog('WAV exported');
    } catch (e) { addLog('Export failed: ' + e.message); }
  };

  // ── Tone Listener (AudioWorklet) ──────────────────────
  const toggleListen = useCallback(async () => {
    if (listening) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      setListening(false);
      setDetected(null);
      addLog('Listener stopped');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ctx = ensureCtx();

      // Try AudioWorklet first, fall back to AnalyserNode
      let usingWorklet = false;
      try {
        await ctx.audioWorklet.addModule(process.env.PUBLIC_URL + '/worklet/tone-processor.js');
        const source = ctx.createMediaStreamSource(stream);
        const worklet = new AudioWorkletNode(ctx, 'tone-processor');
        worklet.port.onmessage = (ev) => {
          if (ev.data) {
            setDetected(ev.data);
            setDetectedLog(prev => [ev.data, ...prev.slice(0, 49)]);
            addLog(`Detected ${ev.data.type}: ${ev.data.key} [${ev.data.freqs.join('+')}Hz]`);
          }
        };
        source.connect(worklet);
        worklet.connect(ctx.destination);
        usingWorklet = true;
      } catch (e) {
        // AudioWorklet not supported, use fallback
        addLog('AudioWorklet unavailable, using fallback decoder');
      }

      if (!usingWorklet) {
        // Fallback: AnalyserNode + main-thread Goertzel (with noise rejection)
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 4096;
        source.connect(analyser);
        const buf = new Float32Array(analyser.fftSize);
        const targetFreqs = [697,770,852,941,1209,1336,1477,1633,700,900,1100,1300,1500,1700,2200,2400,2600];
        const goertzel = (f) => {
          const N = buf.length;
          const k = Math.round(N * f / ctx.sampleRate);
          const w = (2 * Math.PI * k) / N;
          const c = 2 * Math.cos(w);
          let s1 = 0, s2 = 0;
          for (let i = 0; i < N; i++) { const s0 = buf[i] + c * s1 - s2; s2 = s1; s1 = s0; }
          return Math.sqrt(s1*s1 + s2*s2 - c*s1*s2);
        };
        let lastKey = null;
        let fbHistory = [];
        const FB_HIST = 8;
        const detect = () => {
          if (!streamRef.current) return;
          analyser.getFloatTimeDomainData(buf);
          // RMS energy check
          let sumSq = 0;
          for (let i = 0; i < buf.length; i++) sumSq += buf[i] * buf[i];
          if (Math.sqrt(sumSq / buf.length) < 0.005) {
            fbHistory.push(null);
            if (fbHistory.length > FB_HIST) fbHistory.shift();
            requestAnimationFrame(detect);
            return;
          }
          const m = {};
          targetFreqs.forEach(f => { m[f] = goertzel(f); });
          const TH = 0.08;
          const DOM = 2.0;
          // DTMF with dominance
          const rows = [697,770,852,941].map((f,i) => ({i,f,m:m[f]})).sort((a,b) => b.m - a.m);
          const cols = [1209,1336,1477,1633].map((f,i) => ({i,f,m:m[f]})).sort((a,b) => b.m - a.m);
          let tone = null;
          if (rows[0].m > TH && cols[0].m > TH &&
              rows[0].m > rows[1].m * DOM && cols[0].m > cols[1].m * DOM) {
            const keys = "123A456B789C*0#D";
            tone = { type:'DTMF', key:keys[rows[0].i*4+cols[0].i], freqs:[rows[0].f, cols[0].f] };
          }
          if (!tone) {
            const maxDtmf = Math.max(...[697,770,852,941,1209,1336,1477,1633].map(f => m[f]));
            const HT = TH * 3;
            if (m[2600] > HT && m[2600] > maxDtmf * 1.5) tone = { type:'SF', key:'2600', freqs:[2600] };
            else if (m[2200] > HT && m[2200] > maxDtmf * 1.5) tone = { type:'REDBOX', key:'2200', freqs:[2200] };
          }
          const toneKey = tone ? `${tone.type}:${tone.key}` : null;
          fbHistory.push(toneKey);
          if (fbHistory.length > FB_HIST) fbHistory.shift();
          const agree = fbHistory.filter(h => h === toneKey).length;
          if (tone && agree >= 5 && toneKey !== lastKey) {
            lastKey = toneKey;
            setDetected(tone);
            setDetectedLog(prev => [tone, ...prev.slice(0, 49)]);
            addLog(`Detected ${tone.type}: ${tone.key}`);
          } else if (!tone && fbHistory.every(h => h === null)) {
            lastKey = null;
            setDetected(null);
          }
          requestAnimationFrame(detect);
        };
        detect();
      }

      setListening(true);
      addLog('Listener started');
    } catch (e) { addLog('Mic denied: ' + e.message); }
  }, [listening]);

  useEffect(() => {
    return () => { if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop()); };
  }, []);

  // ── Button Component ──────────────────────────────────
  const Btn = ({ children, onClick, onMouseDown, onMouseUp, onTouchStart, onTouchEnd, color = S.green, big, style: sx, ...rest }) => (
    <button
      onClick={onClick} onMouseDown={onMouseDown} onMouseUp={onMouseUp}
      onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
      style={{
        background: S.panel, border: `1px solid ${S.border}`, color,
        fontFamily: S.mono, fontSize: big ? '1.2rem' : '.85rem', fontWeight: 'bold',
        padding: big ? '14px' : '10px 12px', cursor: 'pointer', borderRadius: '4px',
        transition: 'all .1s', userSelect: 'none', WebkitTapHighlightColor: 'transparent',
        ...sx,
      }}
      onPointerDown={e => { e.currentTarget.style.background = color + '22'; e.currentTarget.style.borderColor = color; }}
      onPointerUp={e => { e.currentTarget.style.background = S.panel; e.currentTarget.style.borderColor = S.border; }}
      onPointerLeave={e => { e.currentTarget.style.background = S.panel; e.currentTarget.style.borderColor = S.border; }}
      {...rest}
    >
      {children}
    </button>
  );

  // ── Render ──────────────────────────────────
  const tbl = mode === 'DTMF' ? DTMF : MF;
  const dtmfKeys = ['1','2','3','A','4','5','6','B','7','8','9','C','*','0','#','D'];
  const mfMain = ['1','2','3','4','5','6','7','8','9','11','0','12'];
  const mfSide = ['KP','KP2','ST','ST2','ST3'];

  return (
    <div style={{ background: S.bg, color: S.text, minHeight: '100vh', fontFamily: S.mono, padding: '12px' }}>
      <div style={{ maxWidth: '480px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 0', borderBottom: `1px solid ${S.border}`, marginBottom: '12px' }}>
          <Phone size={22} color={S.green} />
          <span style={{ fontSize: '1.3rem', fontWeight: 'bold', letterSpacing: '3px' }}>
            PHREAK<span style={{ color: S.green }}>DIALER</span>
          </span>
        </div>

        {/* Mode Switcher + Duration */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', alignItems: 'center' }}>
          {['DTMF', 'MF'].map(m => (
            <button key={m} onClick={() => setMode(m)} style={{
              background: mode === m ? S.blue + '33' : 'transparent',
              border: `1px solid ${mode === m ? S.blue : S.border}`,
              color: mode === m ? '#fff' : S.dim, fontFamily: S.mono,
              fontSize: '.75rem', fontWeight: 'bold', padding: '6px 16px',
              cursor: 'pointer', letterSpacing: '1px', borderRadius: '3px',
            }}>{m}</button>
          ))}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '.6rem', color: S.dim }}>{toneDur}ms</span>
            <input type="range" min="50" max="1000" step="50" value={toneDur}
              onChange={e => { const v = Number(e.target.value); setToneDur(v); toneDurRef.current = v; }}
              style={{ width: '80px', accentColor: S.green, cursor: 'pointer' }}
            />
          </div>
        </div>

        {/* Sequence Buffer */}
        <div style={{ background: '#000', border: `1px solid ${S.border}`, borderRadius: '4px', padding: '10px 12px', marginBottom: '12px' }}>
          <div style={{ fontSize: '.65rem', color: S.dim, marginBottom: '4px', letterSpacing: '1px' }}>SEQUENCE</div>
          <div style={{ fontSize: '1rem', fontWeight: 'bold', minHeight: '22px', color: seq ? '#fff' : S.dim, overflowX: 'auto', whiteSpace: 'nowrap' }}>
            {seq || '[ EMPTY ]'}
          </div>
          <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
            <Btn onClick={playSeq} color={S.green} style={{ flex: 1, display:'flex', alignItems:'center', justifyContent:'center', gap:'4px' }}>
              <Play size={13}/> PLAY
            </Btn>
            <Btn onClick={() => { setSeq(''); addLog('Cleared'); }} color={S.dim} style={{ flex: 1, display:'flex', alignItems:'center', justifyContent:'center', gap:'4px' }}>
              <X size={13}/> CLEAR
            </Btn>
            <Btn onClick={exportWAV} color={S.dim} style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'4px' }}>
              <Download size={13}/> WAV
            </Btn>
          </div>
        </div>

        {/* Dialpad */}
        {mode === 'DTMF' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '12px' }}>
            {dtmfKeys.map(k => (
              <Btn key={k} onClick={() => playTone(k)} big color={['A','B','C','D'].includes(k) ? S.blue : S.green}>{k}</Btn>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', flex: 3 }}>
              {mfMain.map(k => (
                <Btn key={k} onClick={() => playTone(k)} big>{k}</Btn>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
              {mfSide.map(k => (
                <Btn key={k} onClick={() => playTone(k)} color={S.blue} style={{ flex: 1, fontSize: '.7rem' }}>{k}</Btn>
              ))}
            </div>
          </div>
        )}

        {/* Special Tones */}
        <div style={{ border: `1px solid ${S.border}`, borderRadius: '4px', padding: '10px', marginBottom: '12px' }}>
          <div style={{ fontSize: '.65rem', color: S.dim, marginBottom: '8px', letterSpacing: '1px' }}>SPECIAL TONES</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginBottom: '8px' }}>
            <Btn onClick={() => playCoin('NICKEL')} color={S.red}>5¢</Btn>
            <Btn onClick={() => playCoin('DIME')} color={S.red}>10¢</Btn>
            <Btn onClick={() => playCoin('QUARTER')} color={S.red}>25¢</Btn>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
            <Btn
              onMouseDown={start2600}
              onTouchStart={e => { e.preventDefault(); start2600(); }}
              color={S.orange} style={{ fontSize: '.75rem' }}
            >2600Hz</Btn>
            <Btn onClick={() => playSpecial('TRUNK', [2600, 2400], 800)} color={S.orange} style={{ fontSize: '.7rem' }}>SEIZE</Btn>
            <Btn onClick={() => playSpecial('CLEAR', [2400], 800)} color={S.orange} style={{ fontSize: '.7rem' }}>CLEAR</Btn>
          </div>
        </div>

        {/* Tone Listener */}
        <div style={{ border: `1px solid ${listening ? S.orange : S.border}`, borderRadius: '4px', padding: '10px', marginBottom: '12px', transition: 'border-color .2s' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ fontSize: '.65rem', color: S.dim, letterSpacing: '1px' }}>TONE LISTENER</div>
            <Btn onClick={toggleListen} color={listening ? S.red : S.orange}
              style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px' }}>
              {listening ? <><MicOff size={13}/> STOP</> : <><Mic size={13}/> LISTEN</>}
            </Btn>
          </div>
          <div style={{
            background: '#000', borderRadius: '4px', padding: '12px', textAlign: 'center',
            minHeight: '50px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            border: detected ? `1px solid ${S.orange}` : '1px solid #222', transition: 'all .15s',
          }}>
            {listening ? (
              detected ? (
                <>
                  <div style={{ fontSize: '.6rem', color: S.dim }}>{detected.type}</div>
                  <div style={{ fontSize: '2rem', fontWeight: 'bold', color: S.orange }}>{detected.key}</div>
                  <div style={{ fontSize: '.6rem', color: S.dim }}>{detected.freqs.join(' + ')}Hz</div>
                </>
              ) : <div style={{ color: S.dim, fontSize: '.8rem' }}>🎤 Listening...</div>
            ) : <div style={{ color: S.dim, fontSize: '.8rem' }}>Tap LISTEN to identify tones</div>}
          </div>
          {detectedLog.length > 0 && (
            <div style={{ maxHeight: '100px', overflowY: 'auto', marginTop: '8px', fontSize: '.7rem' }}>
              {detectedLog.map((t, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', borderBottom: '1px solid #111' }}>
                  <span><span style={{ color: S.orange }}>{t.type}</span> {t.key}</span>
                  <span style={{ color: S.dim }}>{t.freqs.join('+')}Hz</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Terminal Log (collapsible) */}
        <div style={{ border: `1px solid ${S.border}`, borderRadius: '4px', overflow: 'hidden' }}>
          <div onClick={() => setLogOpen(!logOpen)} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '8px 10px', cursor: 'pointer', background: S.panel,
          }}>
            <div style={{ fontSize: '.7rem', color: S.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
              {log[0] || 'Ready'}
            </div>
            {logOpen ? <ChevronUp size={14} color={S.dim}/> : <ChevronDown size={14} color={S.dim}/>}
          </div>
          {logOpen && (
            <div style={{ background: '#000', padding: '8px 10px', maxHeight: '150px', overflowY: 'auto', fontSize: '.7rem' }}>
              {log.map((l, i) => <div key={i} style={{ padding: '1px 0', color: i === 0 ? S.green : S.dim }}>{l}</div>)}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ textAlign: 'center', fontSize: '.6rem', color: S.dim, padding: '12px 0', letterSpacing: '1px' }}>
          PHREAKDIALER • EDUCATIONAL USE ONLY
        </div>
      </div>
    </div>
  );
};

export default PhreakDialer;
