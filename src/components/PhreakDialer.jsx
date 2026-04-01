import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Phone, Mic, MicOff, Play, X, Download, ChevronDown, ChevronUp, Copy, RotateCcw } from 'lucide-react';

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

// ── Cyberpunk Styles ────────────────────────────────────
const S = {
  bg: '#050510', panel: '#0a0a14', border: '#1a1a2e',
  green: '#00ff88', greenDim: 'rgba(0,255,136,.15)',
  cyan: '#00e5ff', pink: '#ff2d7b', orange: '#ff8800',
  text: '#c0c0d0', dim: '#444460', mono: "'Share Tech Mono', 'Courier New', monospace",
};

// ── Matrix Rain Canvas Component (Switchboard) ──────────
const MatrixRain = () => {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    const chars = 'ｦｧｨｩｪｫｬｭｮｯ01ｾｿ';
    const cols = Math.floor(canvas.width / 15);
    const drops = Array(cols).fill(0).map(() => Math.random() * canvas.height);
    
    const draw = () => {
      ctx.fillStyle = 'rgba(5, 5, 16, 0.08)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#00ff8833';
      ctx.font = '15px "Share Tech Mono"';
      
      for (let i = 0; i < cols; i++) {
        const char = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillText(char, i * 15, drops[i] * canvas.height);
        drops[i] += 0.01;
        if (drops[i] * canvas.height > canvas.height) drops[i] = 0;
      }
      requestAnimationFrame(draw);
    };
    draw();
    
    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  return <canvas ref={canvasRef} style={{ position: 'fixed', top: 0, left: 0, zIndex: 0, opacity: 0.5, pointerEvents: 'none' }} />;
};

// ── Boot Sequence Animation (Phantom) ──────────────────
const BootSequence = ({ onComplete }) => {
  const [messages, setMessages] = useState([]);
  const bootMessages = [
    'PHREAKDIALER v2.6',
    'INITIALIZING AUDIO SUBSYSTEM... OK',
    'LOADING FREQUENCY TABLES... OK',
    'SCANNING TONE DETECTION WORKLET... OK',
    'ENGAGING MATRIX OVERLAY... OK',
    'CALIBRATING CRT SCANLINES... OK',
    'READY FOR PHREAKING',
  ];

  useEffect(() => {
    let idx = 0;
    const interval = setInterval(() => {
      if (idx < bootMessages.length) {
        setMessages(prev => [...prev, bootMessages[idx]]);
        idx++;
      } else {
        clearInterval(interval);
        setTimeout(() => onComplete(), 600);
      }
    }, 120);
    return () => clearInterval(interval);
  }, [onComplete]);

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
      background: '#050510', zIndex: 1000, display: 'flex', flexDirection: 'column',
      justifyContent: 'center', alignItems: 'center', fontFamily: "'Orbitron', monospace",
      padding: '20px', color: '#00ff88',
    }}>
      <div style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '40px', letterSpacing: '2px' }}>
        > PHREAKDIALER
      </div>
      <div style={{ maxWidth: '400px', fontSize: '.9rem', lineHeight: '2', fontFamily: S.mono }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ animation: 'fadeInDown 0.4s ease-out' }}>
            {msg}
          </div>
        ))}
      </div>
    </div>
  );
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
  const [bootComplete, setBootComplete] = useState(false);
  const [toneFlash, setToneFlash] = useState(false);

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

  // Detected tone flash effect (Phantom)
  const triggerToneFlash = () => {
    setToneFlash(true);
    setTimeout(() => setToneFlash(false), 150);
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
      // Use a dedicated AudioContext for the listener to avoid worklet caching issues
      const AC = window.AudioContext || window.webkitAudioContext;
      const listenerCtx = new AC();
      if (listenerCtx.state === 'suspended') await listenerCtx.resume();

      // Try AudioWorklet first, fall back to AnalyserNode
      let usingWorklet = false;
      try {
        await listenerCtx.audioWorklet.addModule(process.env.PUBLIC_URL + '/worklet/tone-processor.js?v=' + Date.now());
        const source = listenerCtx.createMediaStreamSource(stream);
        const worklet = new AudioWorkletNode(listenerCtx, 'tone-processor');
        worklet.port.onmessage = (ev) => {
          if (ev.data) {
            setDetected(ev.data);
            setDetectedLog(prev => [ev.data, ...prev.slice(0, 49)]);
            addLog(`Detected ${ev.data.type}: ${ev.data.key} [${ev.data.freqs.join('+')}Hz]`);
            triggerToneFlash();
          }
        };
        source.connect(worklet);
        worklet.connect(listenerCtx.destination);
        usingWorklet = true;
      } catch (e) {
        // AudioWorklet not supported, use fallback
        addLog('AudioWorklet unavailable, using fallback decoder');
      }

      if (!usingWorklet) {
        // Fallback: AnalyserNode + main-thread Goertzel (with noise rejection)
        const source = listenerCtx.createMediaStreamSource(stream);
        const analyser = listenerCtx.createAnalyser();
        analyser.fftSize = 4096;
        source.connect(analyser);
        const buf = new Float32Array(analyser.fftSize);
        const targetFreqs = [697,770,852,941,1209,1336,1477,1633,700,900,1100,1300,1500,1700,2200,2400,2600];
        const goertzel = (f) => {
          const N = buf.length;
          const k = Math.round(N * f / listenerCtx.sampleRate);
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
          const candidates = [];
          // DTMF
          const rows = [697,770,852,941].map((f,i) => ({i,f,m:m[f]})).sort((a,b) => b.m - a.m);
          const cols = [1209,1336,1477,1633].map((f,i) => ({i,f,m:m[f]})).sort((a,b) => b.m - a.m);
          if (rows[0].m > TH && cols[0].m > TH && rows[0].m > rows[1].m * DOM && cols[0].m > cols[1].m * DOM) {
            const keys = "123A456B789C*0#D";
            candidates.push({ type:'DTMF', key:keys[rows[0].i*4+cols[0].i], freqs:[rows[0].f,cols[0].f], s:rows[0].m+cols[0].m });
          }
          // MF
          const mfF = [700,900,1100,1300,1500,1700];
          const mfP = {'700,900':'1','700,1100':'2','900,1100':'3','700,1300':'4','900,1300':'5','1100,1300':'6','700,1500':'7','900,1500':'8','1100,1500':'9','1300,1500':'0','700,1700':'11','900,1700':'12','1100,1700':'KP','1500,1700':'ST','1300,1700':'KP2'};
          const mfS = mfF.map(f => ({f,m:m[f]})).sort((a,b) => b.m - a.m);
          if (mfS[0].m > TH && mfS[1].m > TH && (mfS.length < 3 || mfS[2].m < mfS[1].m * 0.6)) {
            const pair = [mfS[0].f,mfS[1].f].sort((a,b) => a-b).join(',');
            if (mfP[pair]) candidates.push({ type:'MF', key:mfP[pair], freqs:[mfS[0].f,mfS[1].f], s:mfS[0].m+mfS[1].m });
          }
          // SF/RedBox/CCITT5
          if (m[2600] > TH*1.5 && m[2400] > TH*1.5) candidates.push({ type:'CCITT5', key:'TRUNK', freqs:[2600,2400], s:m[2600]+m[2400] });
          if (m[2600] > TH*1.5) candidates.push({ type:'SF', key:'2600', freqs:[2600], s:m[2600] });
          if (m[2200] > TH*1.5) candidates.push({ type:'REDBOX', key:'2200', freqs:[2200], s:m[2200] });
          // Disambiguate DTMF vs MF (697≈700, overlapping bins)
          const fbDTMF = candidates.find(c => c.type === 'DTMF');
          const fbMF = candidates.find(c => c.type === 'MF');
          if (fbDTMF && fbMF && fbMF.s >= fbDTMF.s * 0.7) {
            candidates.splice(candidates.indexOf(fbDTMF), 1);
          }
          candidates.sort((a,b) => b.s - a.s);
          const tone = candidates[0] ? { type:candidates[0].type, key:candidates[0].key, freqs:candidates[0].freqs } : null;
          const toneKey = tone ? `${tone.type}:${tone.key}` : null;
          fbHistory.push(toneKey);
          if (fbHistory.length > FB_HIST) fbHistory.shift();
          const agree = fbHistory.filter(h => h === toneKey).length;
          if (tone && agree >= 5 && toneKey !== lastKey) {
            lastKey = toneKey;
            setDetected(tone);
            setDetectedLog(prev => [tone, ...prev.slice(0, 49)]);
            addLog(`Detected ${tone.type}: ${tone.key}`);
            triggerToneFlash();
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

  // ── Cyberpunk Button Component (Switchboard + Phantom) ──
  const Btn = ({ children, onClick, onMouseDown, onMouseUp, onTouchStart, onTouchEnd, color = S.green, big, style: sx, ...rest }) => (
    <button
      onClick={onClick} onMouseDown={onMouseDown} onMouseUp={onMouseUp}
      onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
      style={{
        background: `linear-gradient(135deg, ${S.panel}, #0a0a14)`,
        border: `1px solid ${color}44`, color,
        fontFamily: S.mono, fontSize: big ? '1.2rem' : '.85rem', fontWeight: 'bold',
        padding: big ? '14px' : '10px 12px', cursor: 'pointer', borderRadius: '3px',
        transition: 'all 0.15s', userSelect: 'none',
        WebkitTapHighlightColor: 'transparent', textTransform: 'uppercase', letterSpacing: '0.5px',
        boxShadow: `0 0 12px ${color}33, inset 0 0 8px ${color}11`,
        ...sx,
      }}
      onPointerDown={e => { e.currentTarget.style.boxShadow = `0 0 20px ${color}88, 0 0 30px ${color}44, inset 0 0 12px ${color}33`; e.currentTarget.style.transform = 'scale(0.97)'; }}
      onPointerUp={e => { e.currentTarget.style.boxShadow = `0 0 12px ${color}33, inset 0 0 8px ${color}11`; e.currentTarget.style.transform = 'scale(1)'; }}
      onPointerLeave={e => { e.currentTarget.style.boxShadow = `0 0 12px ${color}33, inset 0 0 8px ${color}11`; e.currentTarget.style.transform = 'scale(1)'; }}
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

  // Animations & Keyframes (Marcus + Phantom)
  const animationStyles = `
    @keyframes fadeInDown {
      from { opacity: 0; transform: translateY(-20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes neonGlow {
      0%, 100% { text-shadow: 0 0 10px #00ff88, 0 0 20px #00ff8844; }
      50% { text-shadow: 0 0 20px #00ff88, 0 0 40px #00ff8877, 0 0 60px #00ff8844; }
    }
    @keyframes glitch {
      0%, 100% { clip-path: inset(0); }
      20% { clip-path: inset(0 0 65% 0); }
      40% { clip-path: inset(25% 0 58% 0); }
      60% { clip-path: inset(54% 0 7% 0); }
      80% { clip-path: inset(63% 0 12% 0); }
    }
    @keyframes buttonPress {
      0% { transform: scale(1); }
      50% { transform: scale(0.95); }
      100% { transform: scale(1); }
    }
    @keyframes toneFlash {
      0% { background: rgba(255, 45, 123, 0.4); }
      100% { background: rgba(255, 45, 123, 0); }
    }
    @keyframes cursorBlink {
      0%, 50% { opacity: 1; }
      51%, 100% { opacity: 0; }
    }
    @keyframes fadeInStaggered {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `;

  return (
    <>
      <style>{animationStyles}</style>
      {!bootComplete && <BootSequence onComplete={() => setBootComplete(true)} />}
      <MatrixRain />
      
      {/* CRT Scanlines Overlay (Switchboard) */}
      <div style={{
        position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
        backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,.15), rgba(0,0,0,.15) 1px, transparent 1px, transparent 2px)',
        pointerEvents: 'none', zIndex: 100,
      }} />
      
      {/* Tone Detection Flash (Phantom) */}
      {toneFlash && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          animation: 'toneFlash 0.15s ease-out', pointerEvents: 'none', zIndex: 99,
        }} />
      )}

      <div style={{
        background: S.bg, color: S.text, minHeight: '100vh', fontFamily: S.mono,
        padding: '12px', position: 'relative', zIndex: 1,
      }}>
        <div style={{ maxWidth: '480px', margin: '0 auto' }}>

          {/* Header with Neon Glow + Glitch (Phantom) */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 0',
            borderBottom: `1px solid ${S.border}`, marginBottom: '12px',
            animation: 'fadeInStaggered 0.6s ease-out',
          }}>
            <Phone size={22} color={S.green} style={{ filter: `drop-shadow(0 0 8px ${S.green})` }} />
            <span style={{
              fontSize: '1.3rem', fontWeight: '900', letterSpacing: '3px',
              fontFamily: "'Orbitron', monospace", animation: 'neonGlow 2.5s ease-in-out infinite',
            }}>
              PHREAK<span style={{ color: S.green }}>DIALER</span>
            </span>
          </div>

          {/* Mode Switcher + Duration */}
          <div style={{
            display: 'flex', gap: '6px', marginBottom: '12px', alignItems: 'center',
            animation: 'fadeInStaggered 0.6s ease-out 0.1s backwards',
          }}>
            {['DTMF', 'MF'].map(m => (
              <button key={m} onClick={() => setMode(m)} style={{
                background: mode === m ? `linear-gradient(135deg, ${S.cyan}22, ${S.cyan}11)` : 'transparent',
                border: `2px solid ${mode === m ? S.cyan : S.border}`,
                color: mode === m ? S.cyan : S.dim, fontFamily: "'Orbitron', monospace",
                fontSize: '.75rem', fontWeight: 'bold', padding: '6px 16px',
                cursor: 'pointer', letterSpacing: '1px', borderRadius: '3px',
                boxShadow: mode === m ? `0 0 12px ${S.cyan}44` : 'none',
                transition: 'all 0.3s ease-out',
              }}>{m}</button>
            ))}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '.6rem', color: S.dim, fontFamily: "'Orbitron', monospace" }}>{toneDur}ms</span>
              <input type="range" min="50" max="1000" step="50" value={toneDur}
                onChange={e => { const v = Number(e.target.value); setToneDur(v); toneDurRef.current = v; }}
                style={{ width: '80px', accentColor: S.green, cursor: 'pointer' }}
              />
            </div>
          </div>

          {/* Section Divider (Marcus) */}
          <div style={{
            height: '1px', background: `linear-gradient(90deg, ${S.green}44, transparent)`,
            margin: '12px 0', animation: 'fadeInStaggered 0.6s ease-out 0.2s backwards',
          }} />

          {/* Sequence Buffer */}
          <div style={{
            background: 'linear-gradient(135deg, #000, #050510)',
            border: `1px solid ${S.green}33`, borderRadius: '4px', padding: '10px 12px',
            marginBottom: '12px', animation: 'fadeInStaggered 0.6s ease-out 0.2s backwards',
            boxShadow: `inset 0 0 12px ${S.green}11`,
          }}>
            <div style={{
              fontSize: '.65rem', color: S.dim, marginBottom: '4px', letterSpacing: '1px',
              fontFamily: "'Orbitron', monospace",
            }}>SEQUENCE</div>
            <div style={{
              fontSize: '1rem', fontWeight: 'bold', minHeight: '22px', color: seq ? S.green : S.dim,
              overflowX: 'auto', whiteSpace: 'nowrap', letterSpacing: '1px',
            }}>
              {seq || '[ EMPTY ]'}{seq && <span style={{ animation: 'cursorBlink 1s step-end infinite' }}>▮</span>}
            </div>
            <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
              <Btn onClick={playSeq} color={S.green} style={{ flex: 1, display:'flex', alignItems:'center', justifyContent:'center', gap:'4px' }}>
                <Play size={13}/> PLAY
              </Btn>
              <Btn onClick={() => { setSeq(''); addLog('Cleared'); }} color={S.orange} style={{ flex: 1, display:'flex', alignItems:'center', justifyContent:'center', gap:'4px' }}>
                <X size={13}/> CLEAR
              </Btn>
              <Btn onClick={exportWAV} color={S.cyan} style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'4px' }}>
                <Download size={13}/> WAV
              </Btn>
            </div>
          </div>

          {/* Section Divider */}
          <div style={{
            height: '1px', background: `linear-gradient(90deg, ${S.green}44, transparent)`,
            margin: '12px 0',
          }} />

          {/* Dialpad */}
          <div style={{ animation: 'fadeInStaggered 0.6s ease-out 0.3s backwards' }}>
            {mode === 'DTMF' ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '12px' }}>
                {dtmfKeys.map(k => (
                  <Btn key={k} onClick={() => playTone(k)} big color={['A','B','C','D'].includes(k) ? S.cyan : S.green}>{k}</Btn>
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', flex: 3 }}>
                  {mfMain.map(k => (
                    <Btn key={k} onClick={() => playTone(k)} big color={S.green}>{k}</Btn>
                  ))}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                  {mfSide.map(k => (
                    <Btn key={k} onClick={() => playTone(k)} color={S.cyan} style={{ flex: 1, fontSize: '.7rem' }}>{k}</Btn>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Section Divider */}
          <div style={{
            height: '1px', background: `linear-gradient(90deg, ${S.pink}44, transparent)`,
            margin: '12px 0',
          }} />

          {/* Special Tones */}
          <div style={{
            border: `1px solid ${S.pink}33`, borderRadius: '4px', padding: '10px',
            marginBottom: '12px', background: 'linear-gradient(135deg, #050510, #0a0a14)',
            boxShadow: `inset 0 0 12px ${S.pink}11`,
            animation: 'fadeInStaggered 0.6s ease-out 0.4s backwards',
          }}>
            <div style={{
              fontSize: '.65rem', color: S.dim, marginBottom: '8px', letterSpacing: '1px',
              fontFamily: "'Orbitron', monospace",
            }}>SPECIAL TONES</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginBottom: '8px' }}>
              <Btn onClick={() => playCoin('NICKEL')} color={S.pink}>5¢</Btn>
              <Btn onClick={() => playCoin('DIME')} color={S.pink}>10¢</Btn>
              <Btn onClick={() => playCoin('QUARTER')} color={S.pink}>25¢</Btn>
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

          {/* Section Divider */}
          <div style={{
            height: '1px', background: `linear-gradient(90deg, ${S.orange}44, transparent)`,
            margin: '12px 0',
          }} />

          {/* Tone Listener */}
          <div style={{
            border: `1px solid ${listening ? S.orange : S.border}`, borderRadius: '4px', padding: '10px',
            marginBottom: '12px', transition: 'border-color .2s', background: 'linear-gradient(135deg, #050510, #0a0a14)',
            boxShadow: listening ? `inset 0 0 12px ${S.orange}11` : 'none',
            animation: 'fadeInStaggered 0.6s ease-out 0.5s backwards',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{
                fontSize: '.65rem', color: S.dim, letterSpacing: '1px',
                fontFamily: "'Orbitron', monospace",
              }}>TONE LISTENER</div>
              <Btn onClick={toggleListen} color={listening ? S.red : S.orange}
                style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px' }}>
                {listening ? <><MicOff size={13}/> STOP</> : <><Mic size={13}/> LISTEN</>}
              </Btn>
            </div>
            <div style={{
              background: 'linear-gradient(135deg, #000, #050510)', borderRadius: '4px', padding: '12px',
              textAlign: 'center', minHeight: '50px', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              border: detected ? `2px solid ${S.orange}` : '1px solid #222', transition: 'all .15s',
              boxShadow: detected ? `0 0 16px ${S.orange}33, inset 0 0 12px ${S.orange}11` : 'none',
            }}>
              {listening ? (
                detected ? (
                  <>
                    <div style={{ fontSize: '.6rem', color: S.dim, fontFamily: "'Orbitron', monospace" }}>{detected.type}</div>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: S.orange, fontFamily: "'Orbitron', monospace" }}>
                      {detected.key}
                    </div>
                    <div style={{ fontSize: '.6rem', color: S.dim }}>{detected.freqs.join(' + ')}Hz</div>
                  </>
                ) : <div style={{ color: S.dim, fontSize: '.8rem' }}>🎤 Listening...</div>
              ) : <div style={{ color: S.dim, fontSize: '.8rem' }}>Tap LISTEN to identify tones</div>}
            </div>
          {/* Captured sequence display */}
          {detectedLog.length > 0 && (
            <>
              {/* Decoded string */}
              <div style={{
                background: 'linear-gradient(135deg, #000, #050510)', border: `1px solid ${S.orange}33`,
                borderRadius: '4px', padding: '8px 10px', marginTop: '8px', boxShadow: `inset 0 0 8px ${S.orange}11`,
              }}>
                <div style={{
                  fontSize: '.6rem', color: S.dim, marginBottom: '4px', letterSpacing: '1px',
                  fontFamily: "'Orbitron', monospace",
                }}>CAPTURED SEQUENCE</div>
                <div style={{
                  fontSize: '.9rem', fontWeight: 'bold', color: S.orange, wordBreak: 'break-all',
                  letterSpacing: '2px', fontFamily: S.mono,
                }}>
                  {detectedLog.slice().reverse().map(t => t.key).join(' ')}
                </div>
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                <Btn onClick={() => {
                  const captured = detectedLog.slice().reverse().map(t => t.key).join(' ');
                  setSeq(captured);
                  addLog('Loaded captured sequence into player');
                }} color={S.green} style={{ flex: 1, display:'flex', alignItems:'center', justifyContent:'center', gap:'4px', fontSize: '.7rem' }}>
                  <Play size={12}/> REPLAY
                </Btn>
                <Btn onClick={() => {
                  const lines = detectedLog.slice().reverse().map((t, i) =>
                    `${String(i+1).padStart(3)} | ${t.type.padEnd(6)} | ${t.key.padEnd(5)} | ${t.freqs.join('+')}Hz`
                  );
                  const header = `PhreakDialer Capture - ${new Date().toISOString()}\n${'='.repeat(50)}\n  #  | Type   | Key   | Frequencies\n${'-'.repeat(50)}`;
                  const footer = `${'-'.repeat(50)}\nSequence: ${detectedLog.slice().reverse().map(t => t.key).join(' ')}\nTotal: ${detectedLog.length} tones`;
                  const text = [header, ...lines, footer].join('\n');
                  const blob = new Blob([text], { type: 'text/plain' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a'); a.href = url; a.download = 'phreakdialer_capture.txt'; a.click();
                  URL.revokeObjectURL(url);
                  addLog('Capture log exported');
                }} color={S.cyan} style={{ flex: 1, display:'flex', alignItems:'center', justifyContent:'center', gap:'4px', fontSize: '.7rem' }}>
                  <Download size={12}/> SAVE LOG
                </Btn>
                <Btn onClick={() => {
                  const captured = detectedLog.slice().reverse().map(t => t.key).join(' ');
                  navigator.clipboard?.writeText(captured);
                  addLog('Sequence copied to clipboard');
                }} color={S.cyan} style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'4px', fontSize: '.7rem' }}>
                  <Copy size={12}/>
                </Btn>
                <Btn onClick={() => {
                  setDetectedLog([]);
                  setDetected(null);
                  addLog('Capture cleared');
                }} color={S.orange} style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'4px', fontSize: '.7rem' }}>
                  <RotateCcw size={12}/>
                </Btn>
              </div>

              {/* Detailed log */}
              <div style={{
                maxHeight: '120px', overflowY: 'auto', marginTop: '8px', fontSize: '.7rem',
                background: '#000', border: `1px solid ${S.dim}33`, borderRadius: '3px', padding: '6px',
              }}>
                {detectedLog.map((t, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', borderBottom: '1px solid #111' }}>
                    <span><span style={{ color: S.orange, fontFamily: "'Orbitron', monospace" }}>{t.type}</span> {t.key}</span>
                    <span style={{ color: S.dim }}>{t.freqs.join('+')}Hz</span>
                  </div>
                ))}
              </div>
            </>
          )}
          </div>

          {/* Section Divider */}
          <div style={{
            height: '1px', background: `linear-gradient(90deg, ${S.dim}44, transparent)`,
            margin: '12px 0',
          }} />

          {/* Terminal Log (collapsible) */}
          <div style={{
            border: `1px solid ${S.border}`, borderRadius: '4px', overflow: 'hidden',
            animation: 'fadeInStaggered 0.6s ease-out 0.6s backwards',
            background: 'linear-gradient(135deg, #050510, #0a0a14)',
          }}>
            <div onClick={() => setLogOpen(!logOpen)} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '8px 10px', cursor: 'pointer', background: S.panel,
              transition: 'all 0.2s ease-out',
            }}>
              <div style={{
                fontSize: '.7rem', color: S.dim, overflow: 'hidden', textOverflow: 'ellipsis',
                whiteSpace: 'nowrap', flex: 1, fontFamily: S.mono,
              }}>
                {log[0] || 'Ready'}
              </div>
              {logOpen ? <ChevronUp size={14} color={S.dim}/> : <ChevronDown size={14} color={S.dim}/>}
            </div>
            {logOpen && (
              <div style={{
                background: '#000', padding: '8px 10px', maxHeight: '150px', overflowY: 'auto',
                fontSize: '.7rem', borderTop: `1px solid ${S.border}`,
              }}>
                {log.map((l, i) => (
                  <div key={i} style={{ padding: '1px 0', color: i === 0 ? S.green : S.dim, fontFamily: S.mono }}>
                    {l}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{
            textAlign: 'center', padding: '16px 0 8px',
            animation: 'fadeInStaggered 0.6s ease-out 0.7s backwards',
          }}>
            <a href="https://bamboosec.com" target="_blank" rel="noopener noreferrer">
              <img
                src="/panda-logo.png"
                alt="Panda"
                style={{
                  display: 'block', margin: '0 auto 8px', width: '48px', height: '48px',
                  filter: `drop-shadow(0 0 10px ${S.accent}33)`,
                  transition: 'all 0.4s',
                }}
                onMouseEnter={e => { e.target.style.transform = 'scale(1.08)'; e.target.style.filter = `drop-shadow(0 0 18px ${S.accent}55) drop-shadow(0 0 35px rgba(0,200,255,.15))`; }}
                onMouseLeave={e => { e.target.style.transform = 'scale(1)'; e.target.style.filter = `drop-shadow(0 0 10px ${S.accent}33)`; }}
              />
            </a>
            <div style={{
              fontSize: '.6rem', color: S.dim, letterSpacing: '1px',
              fontFamily: "'Orbitron', monospace",
            }}>
              PHREAKDIALER • EDUCATIONAL USE ONLY
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default PhreakDialer;
