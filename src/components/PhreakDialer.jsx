import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Phone, Play, Mic, Zap, ChevronDown } from 'lucide-react';

const PhreakDialer = () => {
  // State
  const [mode, setMode] = useState('DTMF'); // DTMF or MF
  const [toneSequence, setToneSequence] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [detectedTones, setDetectedTones] = useState([]);
  const [currentTone, setCurrentTone] = useState(null);
  const [terminalLog, setTerminalLog] = useState(['PhreakDialer initialized']);
  const [logExpanded, setLogExpanded] = useState(false);
  
  // Audio refs
  const audioContextRef = useRef(null);
  const oscillatorsRef = useRef([]);
  const micStreamRef = useRef(null);
  const analyserRef = useRef(null);
  const listenerFrameRef = useRef(null);
  const audioUnlockedRef = useRef(false);

  // Tone definitions
  const tones = {
    dtmf: {
      '1': [697, 1209], '2': [697, 1336], '3': [697, 1477], 'A': [697, 1633],
      '4': [770, 1209], '5': [770, 1336], '6': [770, 1477], 'B': [770, 1633],
      '7': [852, 1209], '8': [852, 1336], '9': [852, 1477], 'C': [852, 1633],
      '*': [941, 1209], '0': [941, 1336], '#': [941, 1477], 'D': [941, 1633]
    },
    mf: {
      '1': [700, 900], '2': [700, 1100], '3': [900, 1100],
      '4': [700, 1300], '5': [900, 1300], '6': [1100, 1300],
      '7': [700, 1500], '8': [900, 1500], '9': [1100, 1500],
      '0': [1300, 1500],
      '11': [700, 1700], '12': [900, 1700],
      'KP': [1100, 1700], 'ST': [1500, 1700],
      'KP2': [1300, 1700], 'ST2': [1700, 2200], 'ST3': [1500, 2200]
    },
    special: {
      'SF2600': [2600],
      'NICKEL': [2200],
      'DIME': [2200],
      'QUARTER': [2200],
      'TRUNK_SEIZE': [2600, 2400],
      'TRUNK_CLEAR': [2400]
    }
  };

  // Log helper
  const logMessage = (msg) => {
    const time = new Date().toLocaleTimeString();
    setTerminalLog(prev => [`[${time}] ${msg}`, ...prev].slice(0, 100));
  };

  // iOS Safari audio unlock
  useEffect(() => {
    const unlockAudio = () => {
      if (audioUnlockedRef.current) return;
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!audioContextRef.current) {
          audioContextRef.current = new AudioContext();
        }
        const ctx = audioContextRef.current;
        if (ctx.state === 'suspended') ctx.resume();
        const buf = ctx.createBuffer(1, 1, ctx.sampleRate);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start(0);
        audioUnlockedRef.current = true;
      } catch (e) {
        // Silent
      }
    };
    
    document.addEventListener('touchstart', unlockAudio, { once: false, passive: true });
    document.addEventListener('mousedown', unlockAudio, { once: false, passive: true });
    
    return () => {
      document.removeEventListener('touchstart', unlockAudio);
      document.removeEventListener('mousedown', unlockAudio);
      stopAllTones();
    };
  }, []);

  // Ensure audio context
  const ensureAudioContext = () => {
    if (!audioContextRef.current) {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioContextRef.current = new AudioContext();
      } catch (e) {
        logMessage('Audio initialization failed');
        return false;
      }
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    return true;
  };

  // Generate tone with envelope shaping
  const generateTone = (frequencies, duration = 300) => {
    if (!ensureAudioContext()) return;
    
    stopAllTones();
    
    const ctx = audioContextRef.current;
    const now = ctx.currentTime;
    
    // Gain node with envelope
    const gainNode = ctx.createGain();
    gainNode.gain.value = 0;
    gainNode.connect(ctx.destination);
    
    // Attack: 10ms
    gainNode.gain.linearRampToValueAtTime(0.5, now + 0.01);
    
    // Release: 10ms at the end
    if (duration) {
      const toneDuration = duration / 1000;
      gainNode.gain.setValueAtTime(0.5, now + toneDuration - 0.01);
      gainNode.gain.linearRampToValueAtTime(0, now + toneDuration);
    }
    
    // Create oscillators
    const newOscillators = [];
    frequencies.forEach(freq => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(gainNode);
      osc.start(now);
      newOscillators.push(osc);
    });
    
    oscillatorsRef.current = newOscillators;
    
    if (duration) {
      setTimeout(() => stopAllTones(), duration);
    }
  };

  // Stop all tones
  const stopAllTones = () => {
    oscillatorsRef.current.forEach(osc => {
      try {
        osc.stop();
        osc.disconnect();
      } catch (e) {
        // Already stopped
      }
    });
    oscillatorsRef.current = [];
  };

  // 2600Hz special handling: hold to play
  const handle2600MouseDown = () => {
    if (!ensureAudioContext()) return;
    stopAllTones();
    
    const ctx = audioContextRef.current;
    const gainNode = ctx.createGain();
    gainNode.gain.value = 0.5;
    gainNode.connect(ctx.destination);
    
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 2600;
    osc.connect(gainNode);
    osc.start(ctx.currentTime);
    
    oscillatorsRef.current = [osc];
    logMessage('2600Hz tone started (hold)');
    
    if (navigator.vibrate) navigator.vibrate(10);
  };

  const handle2600MouseUp = () => {
    stopAllTones();
    logMessage('2600Hz tone released');
  };

  // Play tone
  const playTone = (tone) => {
    let frequencies;
    
    if (mode === 'DTMF' && tones.dtmf[tone]) {
      frequencies = tones.dtmf[tone];
      logMessage(`DTMF: ${tone}`);
    } else if (mode === 'MF' && tones.mf[tone]) {
      frequencies = tones.mf[tone];
      logMessage(`MF: ${tone}`);
    } else {
      return;
    }
    
    generateTone(frequencies);
    setToneSequence(prev => prev + (prev ? ' ' : '') + tone);
    
    if (navigator.vibrate) navigator.vibrate(10);
  };

  // Special tones
  const playSpecialTone = (toneName, label) => {
    const frequencies = tones.special[toneName];
    if (!frequencies) return;
    
    let duration = 300;
    if (toneName === 'NICKEL') {
      generateTone([2200], 66);
      duration = 66;
    } else if (toneName === 'DIME') {
      generateTone([2200], 66);
      setTimeout(() => generateTone([2200], 66), 132);
      duration = 264;
    } else if (toneName === 'QUARTER') {
      for (let i = 0; i < 5; i++) {
        setTimeout(() => generateTone([2200], 33), i * 66);
      }
      duration = 330;
    } else {
      generateTone(frequencies, duration);
    }
    
    logMessage(label);
    setToneSequence(prev => prev + (prev ? ' ' : '') + label);
    
    if (navigator.vibrate) navigator.vibrate(10);
  };

  // Play sequence
  const playSequence = () => {
    if (!toneSequence) {
      logMessage('No sequence to play');
      return;
    }
    
    logMessage(`Playing: ${toneSequence}`);
    
    const toneArray = toneSequence.split(' ');
    
    toneArray.forEach((tone, index) => {
      setTimeout(() => {
        let frequencies;
        
        if (tone === 'SF2600') {
          frequencies = tones.special['SF2600'];
        } else if (tone === 'NICKEL') {
          generateTone([2200], 66);
          return;
        } else if (tone === 'DIME') {
          generateTone([2200], 66);
          setTimeout(() => generateTone([2200], 66), 132);
          return;
        } else if (tone === 'QUARTER') {
          for (let i = 0; i < 5; i++) {
            setTimeout(() => generateTone([2200], 33), i * 66);
          }
          return;
        } else if (tones.dtmf[tone]) {
          frequencies = tones.dtmf[tone];
        } else if (tones.mf[tone]) {
          frequencies = tones.mf[tone];
        } else {
          return;
        }
        
        if (frequencies) generateTone(frequencies);
      }, index * 500);
    });
  };

  // Clear sequence
  const clearSequence = () => {
    setToneSequence('');
    logMessage('Sequence cleared');
  };

  // Goertzel algorithm
  const TARGET_FREQS = [
    697, 770, 852, 941,
    1209, 1336, 1477, 1633,
    700, 900, 1100, 1300, 1500, 1700,
    2200, 2600, 2400
  ];

  const goertzel = (samples, sampleRate, targetFreq) => {
    const N = samples.length;
    const k = Math.round(N * targetFreq / sampleRate);
    const w = (2 * Math.PI * k) / N;
    const coeff = 2 * Math.cos(w);
    let s0 = 0, s1 = 0, s2 = 0;
    for (let i = 0; i < N; i++) {
      s0 = samples[i] + coeff * s1 - s2;
      s2 = s1;
      s1 = s0;
    }
    return Math.sqrt(s1 * s1 + s2 * s2 - coeff * s1 * s2);
  };

  // Identify tone
  const identifyTone = (magnitudes, sampleRate) => {
    const threshold = 0.02;
    const detected = [];
    
    TARGET_FREQS.forEach(freq => {
      if (magnitudes[freq] > threshold) {
        detected.push({ freq, mag: magnitudes[freq] });
      }
    });

    if (detected.length === 0) return null;
    detected.sort((a, b) => b.mag - a.mag);
    const top = detected.slice(0, 3);

    // DTMF
    const dtmfRows = { 697: 0, 770: 1, 852: 2, 941: 3 };
    const dtmfCols = { 1209: 0, 1336: 1, 1477: 2, 1633: 3 };
    const dtmfGrid = [
      ['1', '2', '3', 'A'],
      ['4', '5', '6', 'B'],
      ['7', '8', '9', 'C'],
      ['*', '0', '#', 'D'],
    ];
    
    for (const f1 of top) {
      for (const f2 of top) {
        if (f1.freq in dtmfRows && f2.freq in dtmfCols) {
          return { type: 'DTMF', key: dtmfGrid[dtmfRows[f1.freq]][dtmfCols[f2.freq]], freqs: [f1.freq, f2.freq] };
        }
      }
    }

    // MF
    const mfFreqs = [700, 900, 1100, 1300, 1500, 1700];
    const mfPairs = {
      '700,900': '1', '700,1100': '2', '900,1100': '3',
      '700,1300': '4', '900,1300': '5', '1100,1300': '6',
      '700,1500': '7', '900,1500': '8', '1100,1500': '9',
      '1300,1500': '0',
      '700,1700': '11', '900,1700': '12',
      '1100,1700': 'KP', '1500,1700': 'ST',
      '1300,1700': 'KP2',
    };
    
    const detectedMF = top.filter(d => mfFreqs.includes(d.freq)).map(d => d.freq).sort((a, b) => a - b);
    if (detectedMF.length >= 2) {
      const key = `${detectedMF[0]},${detectedMF[1]}`;
      if (mfPairs[key]) return { type: 'MF', key: mfPairs[key], freqs: detectedMF.slice(0, 2) };
    }

    // SF 2600Hz
    if (top[0].freq === 2600 && top[0].mag > threshold * 2) {
      return { type: 'SF', key: '2600Hz', freqs: [2600] };
    }

    // Red Box 2200Hz
    if (top[0].freq === 2200 && top[0].mag > threshold * 2) {
      return { type: 'RED BOX', key: '2200Hz', freqs: [2200] };
    }

    // CCITT5
    if (top.length >= 2) {
      const freqSet = new Set(top.map(t => t.freq));
      if (freqSet.has(2600) && freqSet.has(2400)) {
        return { type: 'CCITT5', key: 'Trunk Seize', freqs: [2600, 2400] };
      }
    }

    return null;
  };

  // Toggle listener
  const toggleListener = useCallback(async () => {
    if (isListening) {
      if (listenerFrameRef.current) cancelAnimationFrame(listenerFrameRef.current);
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(t => t.stop());
        micStreamRef.current = null;
      }
      setIsListening(false);
      setCurrentTone(null);
      logMessage('Listener stopped');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      ensureAudioContext();
      const ctx = audioContextRef.current;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      source.connect(analyser);
      analyserRef.current = analyser;

      const bufLen = analyser.fftSize;
      const buffer = new Float32Array(bufLen);
      let lastDetected = null;
      let lastTime = 0;

      const detect = () => {
        analyser.getFloatTimeDomainData(buffer);
        
        const magnitudes = {};
        TARGET_FREQS.forEach(freq => {
          magnitudes[freq] = goertzel(buffer, ctx.sampleRate, freq);
        });

        const tone = identifyTone(magnitudes, ctx.sampleRate);
        const now = Date.now();

        if (tone) {
          setCurrentTone(tone);
          const toneKey = `${tone.type}:${tone.key}`;
          if (toneKey !== lastDetected || now - lastTime > 300) {
            lastDetected = toneKey;
            lastTime = now;
            logMessage(`Detected ${tone.type}: ${tone.key}`);
            setDetectedTones(prev => [...prev.slice(-49), { ...tone, time: now }]);
          }
        } else {
          setCurrentTone(null);
          lastDetected = null;
        }

        listenerFrameRef.current = requestAnimationFrame(detect);
      };

      detect();
      setIsListening(true);
      logMessage('Listener started');
    } catch (e) {
      logMessage('Microphone access denied');
    }
  }, [isListening]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (listenerFrameRef.current) cancelAnimationFrame(listenerFrameRef.current);
      if (micStreamRef.current) micStreamRef.current.getTracks().forEach(t => t.stop());
    };
  }, []);

  // Export WAV
  const exportWAV = async () => {
    if (!toneSequence) {
      logMessage('No sequence to export');
      return;
    }

    logMessage('Rendering WAV...');

    try {
      const toneArray = toneSequence.split(' ');
      const toneDuration = 0.3;
      const gapDuration = 0.2;
      const totalDuration = toneArray.length * (toneDuration + gapDuration);
      
      const sampleRate = 44100;
      const offlineCtx = new OfflineAudioContext(1, Math.ceil(sampleRate * totalDuration), sampleRate);
      
      let currentTime = 0;
      
      toneArray.forEach(tone => {
        let frequencies = null;
        
        if (tones.dtmf[tone]) frequencies = tones.dtmf[tone];
        else if (tones.mf[tone]) frequencies = tones.mf[tone];
        else if (tone === 'SF2600') frequencies = [2600];
        else if (['NICKEL', 'DIME', 'QUARTER'].includes(tone)) frequencies = [2200];
        
        if (frequencies) {
          const gainNode = offlineCtx.createGain();
          gainNode.gain.setValueAtTime(0, currentTime);
          gainNode.gain.linearRampToValueAtTime(0.5, currentTime + 0.01);
          gainNode.gain.setValueAtTime(0.5, currentTime + toneDuration - 0.01);
          gainNode.gain.linearRampToValueAtTime(0, currentTime + toneDuration);
          gainNode.connect(offlineCtx.destination);
          
          frequencies.forEach(freq => {
            const osc = offlineCtx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = freq;
            osc.connect(gainNode);
            osc.start(currentTime);
            osc.stop(currentTime + toneDuration);
          });
        }
        
        currentTime += toneDuration + gapDuration;
      });
      
      const audioBuffer = await offlineCtx.startRendering();
      const wav = audioBufferToWAV(audioBuffer);
      
      const link = document.createElement('a');
      link.href = URL.createObjectURL(wav);
      link.download = 'phreakdialer.wav';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      logMessage('WAV exported');
    } catch (e) {
      logMessage('Export failed');
    }
  };

  // WAV encoder
  const audioBufferToWAV = (audioBuffer) => {
    const numberOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const bitDepth = 16;
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numberOfChannels * bytesPerSample;
    const dataLength = audioBuffer.length * blockAlign;
    const fileLength = 36 + dataLength;
    
    const arrayBuffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(arrayBuffer);
    
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, fileLength, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(36, 'data');
    view.setUint32(40, dataLength, true);
    
    const channelData = audioBuffer.getChannelData(0);
    let offset = 44;
    for (let i = 0; i < audioBuffer.length; i++) {
      const sample = Math.max(-1, Math.min(1, channelData[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
    
    return new Blob([arrayBuffer], { type: 'audio/wav' });
  };

  // Styles
  const colors = {
    bg: '#0a0a14',
    panel: '#1a1a2e',
    accent: '#00ff88',
    blue: '#0055ff',
    red: '#ff3333',
    orange: '#ff8800',
    text: '#e0e0e0',
    dimText: '#808080'
  };

  return (
    <div style={{
      backgroundColor: colors.bg,
      color: colors.text,
      minHeight: '100vh',
      padding: '16px',
      fontFamily: 'Share Tech Mono, monospace'
    }}>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        {/* HEADER */}
        <div style={{
          backgroundColor: colors.panel,
          padding: '16px',
          borderRadius: '4px',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          borderLeft: `4px solid ${colors.accent}`
        }}>
          <Phone color={colors.accent} size={32} style={{ marginRight: '12px' }} />
          <h1 style={{ margin: 0, fontSize: '32px', fontWeight: 'bold', letterSpacing: '2px' }}>
            PHREAKDIALER
          </h1>
        </div>

        {/* MODE SWITCHER */}
        <div style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '16px'
        }}>
          <button
            onClick={() => setMode('DTMF')}
            style={{
              backgroundColor: mode === 'DTMF' ? colors.blue : colors.panel,
              color: colors.text,
              border: `1px solid ${mode === 'DTMF' ? colors.blue : colors.dimText}`,
              padding: '10px 20px',
              borderRadius: '4px',
              fontSize: '14px',
              fontWeight: 'bold',
              cursor: 'pointer',
              flex: 1,
              transition: 'all 0.2s'
            }}
          >
            [DTMF]
          </button>
          <button
            onClick={() => setMode('MF')}
            style={{
              backgroundColor: mode === 'MF' ? colors.blue : colors.panel,
              color: colors.text,
              border: `1px solid ${mode === 'MF' ? colors.blue : colors.dimText}`,
              padding: '10px 20px',
              borderRadius: '4px',
              fontSize: '14px',
              fontWeight: 'bold',
              cursor: 'pointer',
              flex: 1,
              transition: 'all 0.2s'
            }}
          >
            [MF TONES]
          </button>
        </div>

        {/* SEQUENCE BUFFER */}
        <div style={{
          backgroundColor: colors.panel,
          padding: '12px 16px',
          borderRadius: '4px',
          marginBottom: '16px',
          borderLeft: `4px solid ${colors.accent}`
        }}>
          <div style={{ fontSize: '10px', color: colors.dimText, marginBottom: '8px', textTransform: 'uppercase' }}>
            Sequence Buffer
          </div>
          <div style={{
            backgroundColor: '#000',
            padding: '12px',
            borderRadius: '2px',
            marginBottom: '12px',
            minHeight: '32px',
            fontFamily: 'monospace',
            fontSize: '14px',
            wordBreak: 'break-all'
          }}>
            {toneSequence || <span style={{ color: colors.dimText }}>[ EMPTY ]</span>}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={playSequence}
              style={{
                backgroundColor: colors.blue,
                color: colors.text,
                border: 'none',
                padding: '8px 16px',
                borderRadius: '2px',
                fontSize: '12px',
                fontWeight: 'bold',
                cursor: 'pointer',
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              <Play size={14} /> PLAY
            </button>
            <button
              onClick={clearSequence}
              style={{
                backgroundColor: colors.red,
                color: colors.text,
                border: 'none',
                padding: '8px 16px',
                borderRadius: '2px',
                fontSize: '12px',
                fontWeight: 'bold',
                cursor: 'pointer',
                flex: 1
              }}
            >
              CLEAR
            </button>
            <button
              onClick={exportWAV}
              style={{
                backgroundColor: colors.orange,
                color: colors.text,
                border: 'none',
                padding: '8px 16px',
                borderRadius: '2px',
                fontSize: '12px',
                fontWeight: 'bold',
                cursor: 'pointer',
                flex: 1
              }}
            >
              WAV
            </button>
          </div>
        </div>

        {/* DIALPAD */}
        <div style={{
          backgroundColor: colors.panel,
          padding: '16px',
          borderRadius: '4px',
          marginBottom: '16px',
          borderLeft: `4px solid ${colors.blue}`
        }}>
          <div style={{ fontSize: '10px', color: colors.dimText, marginBottom: '12px', textTransform: 'uppercase' }}>
            Dialpad [{mode}]
          </div>
          
          {mode === 'DTMF' ? (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '8px'
            }}>
              {['1', '2', '3', 'A', '4', '5', '6', 'B', '7', '8', '9', 'C', '*', '0', '#', 'D'].map(key => (
                <button
                  key={key}
                  onClick={() => playTone(key)}
                  style={{
                    backgroundColor: ['A', 'B', 'C', 'D'].includes(key) ? colors.red : colors.panel,
                    color: colors.text,
                    border: `1px solid ${colors.blue}`,
                    padding: '16px',
                    borderRadius: '2px',
                    fontSize: '18px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    transition: 'all 0.1s'
                  }}
                  onMouseDown={(e) => e.target.style.opacity = '0.7'}
                  onMouseUp={(e) => e.target.style.opacity = '1'}
                >
                  {key}
                </button>
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '8px',
                flex: 3
              }}>
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '11', '0', '12'].map(key => (
                  <button
                    key={key}
                    onClick={() => playTone(key)}
                    style={{
                      backgroundColor: colors.panel,
                      color: colors.text,
                      border: `1px solid ${colors.blue}`,
                      padding: '16px',
                      borderRadius: '2px',
                      fontSize: '16px',
                      fontWeight: 'bold',
                      cursor: 'pointer'
                    }}
                    onMouseDown={(e) => e.target.style.opacity = '0.7'}
                    onMouseUp={(e) => e.target.style.opacity = '1'}
                  >
                    {key}
                  </button>
                ))}
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr',
                gap: '8px',
                flex: 1
              }}>
                {['KP', 'KP2', 'ST', 'ST2', 'ST3'].map(key => (
                  <button
                    key={key}
                    onClick={() => playTone(key)}
                    style={{
                      backgroundColor: colors.red,
                      color: colors.text,
                      border: `1px solid ${colors.red}`,
                      padding: '12px',
                      borderRadius: '2px',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      cursor: 'pointer'
                    }}
                    onMouseDown={(e) => e.target.style.opacity = '0.7'}
                    onMouseUp={(e) => e.target.style.opacity = '1'}
                  >
                    {key}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* SPECIAL TONES */}
        <div style={{
          backgroundColor: colors.panel,
          padding: '16px',
          borderRadius: '4px',
          marginBottom: '16px',
          borderLeft: `4px solid ${colors.red}`
        }}>
          <div style={{ fontSize: '10px', color: colors.dimText, marginBottom: '12px', textTransform: 'uppercase' }}>
            Special Tones
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px' }}>
            <button
              onMouseDown={handle2600MouseDown}
              onMouseUp={handle2600MouseUp}
              onTouchStart={handle2600MouseDown}
              onTouchEnd={handle2600MouseUp}
              style={{
                backgroundColor: colors.red,
                color: colors.text,
                border: `1px solid ${colors.red}`,
                padding: '12px',
                borderRadius: '2px',
                fontSize: '12px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              2600Hz<br/><span style={{ fontSize: '10px' }}>(HOLD)</span>
            </button>
            <button
              onClick={() => playSpecialTone('NICKEL', 'NICKEL')}
              style={{
                backgroundColor: colors.orange,
                color: colors.text,
                border: `1px solid ${colors.orange}`,
                padding: '12px',
                borderRadius: '2px',
                fontSize: '12px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              NICKEL<br/><span style={{ fontSize: '10px' }}>5¢</span>
            </button>
            <button
              onClick={() => playSpecialTone('DIME', 'DIME')}
              style={{
                backgroundColor: colors.orange,
                color: colors.text,
                border: `1px solid ${colors.orange}`,
                padding: '12px',
                borderRadius: '2px',
                fontSize: '12px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              DIME<br/><span style={{ fontSize: '10px' }}>10¢</span>
            </button>
            <button
              onClick={() => playSpecialTone('QUARTER', 'QUARTER')}
              style={{
                backgroundColor: colors.orange,
                color: colors.text,
                border: `1px solid ${colors.orange}`,
                padding: '12px',
                borderRadius: '2px',
                fontSize: '12px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              QUARTER<br/><span style={{ fontSize: '10px' }}>25¢</span>
            </button>
            <button
              onClick={() => playSpecialTone('TRUNK_SEIZE', 'SEIZE')}
              style={{
                backgroundColor: colors.red,
                color: colors.text,
                border: `1px solid ${colors.red}`,
                padding: '12px',
                borderRadius: '2px',
                fontSize: '12px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              TRUNK<br/><span style={{ fontSize: '10px' }}>SEIZE</span>
            </button>
            <button
              onClick={() => playSpecialTone('TRUNK_CLEAR', 'CLEAR')}
              style={{
                backgroundColor: colors.red,
                color: colors.text,
                border: `1px solid ${colors.red}`,
                padding: '12px',
                borderRadius: '2px',
                fontSize: '12px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              TRUNK<br/><span style={{ fontSize: '10px' }}>CLEAR</span>
            </button>
          </div>
        </div>

        {/* TONE LISTENER */}
        <div style={{
          backgroundColor: colors.panel,
          padding: '16px',
          borderRadius: '4px',
          marginBottom: '16px',
          borderLeft: `4px solid ${colors.orange}`
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '12px'
          }}>
            <div style={{ fontSize: '10px', color: colors.dimText, textTransform: 'uppercase' }}>
              Tone Listener
            </div>
            <button
              onClick={toggleListener}
              style={{
                backgroundColor: isListening ? colors.red : colors.orange,
                color: colors.text,
                border: 'none',
                padding: '6px 12px',
                borderRadius: '2px',
                fontSize: '12px',
                fontWeight: 'bold',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Mic size={12} /> {isListening ? 'STOP' : 'LISTEN'}
            </button>
          </div>

          {/* Current tone display */}
          <div style={{
            backgroundColor: '#000',
            padding: '16px',
            borderRadius: '2px',
            textAlign: 'center',
            minHeight: '60px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '12px',
            border: currentTone ? `1px solid ${colors.orange}` : '1px solid #333'
          }}>
            {isListening ? (
              currentTone ? (
                <>
                  <div style={{ fontSize: '11px', color: colors.dimText, marginBottom: '4px' }}>
                    {currentTone.type}
                  </div>
                  <div style={{
                    fontSize: '32px',
                    fontWeight: 'bold',
                    color: colors.orange,
                    letterSpacing: '2px'
                  }}>
                    {currentTone.key}
                  </div>
                  <div style={{ fontSize: '11px', color: colors.dimText, marginTop: '4px' }}>
                    {currentTone.freqs.map(f => f + 'Hz').join(' + ')}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: '14px', color: colors.dimText }}>🎤 Listening...</div>
              )
            ) : (
              <div style={{ fontSize: '14px', color: colors.dimText }}>Press LISTEN to start</div>
            )}
          </div>

          {/* Detected tones log */}
          <div style={{
            backgroundColor: '#000',
            padding: '12px',
            borderRadius: '2px',
            maxHeight: '150px',
            overflowY: 'auto',
            fontSize: '11px',
            fontFamily: 'monospace'
          }}>
            {detectedTones.length === 0 ? (
              <div style={{ color: colors.dimText }}>No tones detected</div>
            ) : (
              detectedTones
                .slice()
                .reverse()
                .slice(0, 20)
                .map((t, i) => (
                  <div
                    key={i}
                    style={{
                      padding: '4px 0',
                      borderBottom: '1px solid #222',
                      display: 'flex',
                      justifyContent: 'space-between'
                    }}
                  >
                    <span>
                      <span style={{ color: colors.orange, fontWeight: 'bold' }}>
                        {t.type}
                      </span>
                      {' '}
                      {t.key}
                    </span>
                    <span style={{ color: colors.dimText }}>
                      {t.freqs.map(f => f + 'Hz').join('+')}
                    </span>
                  </div>
                ))
            )}
          </div>
        </div>

        {/* TERMINAL LOG */}
        <div style={{
          backgroundColor: colors.panel,
          padding: '12px 16px',
          borderRadius: '4px',
          borderLeft: `4px solid ${colors.accent}`
        }}>
          <button
            onClick={() => setLogExpanded(!logExpanded)}
            style={{
              backgroundColor: 'transparent',
              color: colors.dimText,
              border: 'none',
              padding: '0 0 8px 0',
              fontSize: '10px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              marginBottom: logExpanded ? '8px' : '0',
              width: '100%',
              textTransform: 'uppercase'
            }}
          >
            <ChevronDown
              size={12}
              style={{
                transform: logExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                transition: 'transform 0.2s'
              }}
            />
            Terminal [{terminalLog.length} events]
          </button>
          
          {logExpanded && (
            <div style={{
              backgroundColor: '#000',
              padding: '12px',
              borderRadius: '2px',
              maxHeight: '200px',
              overflowY: 'auto',
              fontSize: '10px',
              fontFamily: 'monospace',
              color: colors.dimText,
              lineHeight: '1.4'
            }}>
              {terminalLog.slice(0, 50).map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          )}
          {!logExpanded && (
            <div style={{
              fontSize: '10px',
              fontFamily: 'monospace',
              color: colors.dimText
            }}>
              {terminalLog[0]}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          textAlign: 'center',
          fontSize: '10px',
          color: colors.dimText,
          marginTop: '16px',
          textTransform: 'uppercase'
        }}>
          PhreakDialer • Educational Use Only
        </div>
      </div>
    </div>
  );
};

export default PhreakDialer;
