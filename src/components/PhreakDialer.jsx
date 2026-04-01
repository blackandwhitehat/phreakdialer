import React, { useState, useEffect, useRef } from 'react';
import { Phone, Monitor, Terminal, Wrench, Play } from 'lucide-react';

const PhreakDialer = () => {
  const [activeTab, setActiveTab] = useState('blueBox');
  const [toneSequence, setToneSequence] = useState('');
  const [output, setOutput] = useState('PhreakDialer initialized');
  const [selectedSystem, setSelectedSystem] = useState('DTMF');
  
  // Audio context and oscillators
  const audioContextRef = useRef(null);
  const oscillatorsRef = useRef([]);

  const audioUnlockedRef = useRef(false);

  // iOS Safari nuclear unlock: play a silent buffer via native touchstart event.
  // React synthetic events don't always count as "user gestures" on iOS Safari.
  // This native handler fires BEFORE React's onClick and unlocks the AudioContext.
  useEffect(() => {
    const unlockAudio = () => {
      if (audioUnlockedRef.current) return;
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!audioContextRef.current) {
          audioContextRef.current = new AudioContext();
        }
        const ctx = audioContextRef.current;
        // Resume if suspended
        if (ctx.state === 'suspended') ctx.resume();
        // Play a silent buffer — this is THE iOS Safari unlock trick.
        // iOS requires an AudioBufferSourceNode.start() in a user gesture.
        const buf = ctx.createBuffer(1, 1, ctx.sampleRate);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start(0);
        src.onended = () => {
          audioUnlockedRef.current = true;
          logMessage("Audio unlocked (iOS)");
        };
        // Also mark as unlocked immediately for non-iOS
        audioUnlockedRef.current = true;
      } catch (e) {
        // Silently fail, will retry on next touch
      }
    };
    // Use native touchstart + mousedown — fires before React synthetic events
    document.addEventListener('touchstart', unlockAudio, { once: false, passive: true });
    document.addEventListener('mousedown', unlockAudio, { once: false, passive: true });
    return () => {
      document.removeEventListener('touchstart', unlockAudio);
      document.removeEventListener('mousedown', unlockAudio);
      stopAllTones();
    };
  }, []);

  // Ensure audio context exists and is running
  const ensureAudioContext = () => {
    if (!audioContextRef.current) {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioContextRef.current = new AudioContext();
      } catch (e) {
        logMessage("Audio initialization failed: " + e.message);
        return false;
      }
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    return true;
  };

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
    sf: {
      '2600': [2600]
    },
    redBox: {
      'NICKEL': [2200],
      'DIME': [2200, 2200],
      'QUARTER': [2200, 2200, 2200, 2200, 2200]
    }
  };

  // Generate audio tone with envelope shaping — synchronous for iOS Safari
  const generateTone = (frequencies, duration = 300) => {
    // Ensure audio context is initialized and resumed (iOS Safari fix)
    const ready = ensureAudioContext();
    if (!ready) {
      logMessage("Audio context not available");
      return;
    }
    
    // Stop any currently playing tones
    stopAllTones();
    
    const ctx = audioContextRef.current;
    const now = ctx.currentTime;
    
    // Create gain node for envelope shaping
    const gainNode = ctx.createGain();
    gainNode.gain.value = 0;  // Start at 0 to prevent clicks
    gainNode.connect(ctx.destination);
    
    // Attack: ramp up to 0.5 over 10ms to prevent clicks
    gainNode.gain.linearRampToValueAtTime(0.5, now + 0.01);
    
    // Release: ramp down to 0 for last 10ms to prevent pops
    if (duration) {
      const releaseDuration = 0.01;
      const toneDuration = duration / 1000;
      gainNode.gain.setValueAtTime(0.5, now + toneDuration - releaseDuration);
      gainNode.gain.linearRampToValueAtTime(0, now + toneDuration);
    }
    
    // Create oscillators for each frequency
    const newOscillators = [];
    frequencies.forEach(freq => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(gainNode);
      osc.start(now);
      newOscillators.push(osc);
    });
    
    // Store oscillators
    oscillatorsRef.current = newOscillators;
    
    // Stop after duration
    if (duration) {
      setTimeout(() => {
        stopAllTones();
      }, duration);
    }
  };

  // Stop all tones
  const stopAllTones = () => {
    oscillatorsRef.current.forEach(osc => {
      try {
        osc.stop();
        osc.disconnect();
      } catch (e) {
        // Oscillator may have already been stopped
      }
    });
    oscillatorsRef.current = [];
  };

  // Export sequence as real WAV file using OfflineAudioContext
  const exportSequenceAsWAV = async () => {
    if (!toneSequence) {
      logMessage("No sequence to export");
      return;
    }

    logMessage("Rendering sequence to WAV...");

    try {
      // Parse the tone sequence
      const toneArray = toneSequence.split(' ');
      
      // Calculate total duration: 300ms per tone + 200ms gap = 500ms per tone
      const toneDuration = 0.3;  // 300ms
      const gapDuration = 0.2;   // 200ms
      const totalDuration = toneArray.length * (toneDuration + gapDuration);
      
      // Create OfflineAudioContext (sample rate 44100 Hz, stereo, duration)
      const sampleRate = 44100;
      const channels = 1;  // Mono
      const offlineCtx = new OfflineAudioContext(channels, Math.ceil(sampleRate * totalDuration), sampleRate);
      
      let currentTime = 0;
      
      // Generate all tones in the sequence
      toneArray.forEach(tone => {
        let frequencies = null;
        
        if (tone === '2600') {
          frequencies = tones.sf['2600'];
        } else if (selectedSystem === 'DTMF' && tones.dtmf[tone]) {
          frequencies = tones.dtmf[tone];
        } else if (selectedSystem === 'MF' && tones.mf[tone]) {
          frequencies = tones.mf[tone];
        } else if (tone === 'NICKEL') {
          frequencies = [2200];
        } else if (tone === 'DIME') {
          frequencies = [2200];
        } else if (tone === 'QUARTER') {
          frequencies = [2200];
        }
        
        if (frequencies) {
          // Create gain node for this tone with envelope
          const gainNode = offlineCtx.createGain();
          gainNode.gain.setValueAtTime(0, currentTime);
          gainNode.gain.linearRampToValueAtTime(0.5, currentTime + 0.01);
          gainNode.gain.setValueAtTime(0.5, currentTime + toneDuration - 0.01);
          gainNode.gain.linearRampToValueAtTime(0, currentTime + toneDuration);
          gainNode.connect(offlineCtx.destination);
          
          // Create oscillators for each frequency
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
      
      // Render the audio
      const audioBuffer = await offlineCtx.startRendering();
      
      // Convert AudioBuffer to WAV
      const wavBlob = await audioBufferToWAV(audioBuffer);
      
      // Download the WAV file
      const link = document.createElement('a');
      link.href = URL.createObjectURL(wavBlob);
      link.download = 'phreakdialer_sequence.wav';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      logMessage("Sequence exported as phreakdialer_sequence.wav");
    } catch (e) {
      logMessage("WAV export failed: " + e.message);
    }
  };

  // Helper function: Convert AudioBuffer to WAV format (PCM 16-bit)
  const audioBufferToWAV = async (audioBuffer) => {
    const numberOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;

    const bytesPerSample = bitDepth / 8;
    const blockAlign = numberOfChannels * bytesPerSample;

    // Calculate WAV file size
    const dataLength = audioBuffer.length * blockAlign;
    const fileLength = 36 + dataLength;

    // Create ArrayBuffer for WAV file
    const arrayBuffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(arrayBuffer);

    // WAV header
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, fileLength, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // fmt chunk size
    view.setUint16(20, format, true); // format code
    view.setUint16(22, numberOfChannels, true); // number of channels
    view.setUint32(24, sampleRate, true); // sample rate
    view.setUint32(28, sampleRate * blockAlign, true); // byte rate
    view.setUint16(32, blockAlign, true); // block align
    view.setUint16(34, bitDepth, true); // bits per sample

    writeString(36, 'data');
    view.setUint32(40, dataLength, true);

    // Convert float samples to PCM 16-bit
    const channelData = audioBuffer.getChannelData(0);
    let offset = 44;
    for (let i = 0; i < audioBuffer.length; i++) {
      const sample = Math.max(-1, Math.min(1, channelData[i])); // clamp
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' });
  };

  // Simple log to console
  const logMessage = (message) => {
    const time = new Date().toLocaleTimeString();
    setOutput(prev => `[${time}] ${message}\n${prev}`);
  };

  // Play tone
  const playTone = (tone) => {
    let toneSet;
    let frequencies;
    
    if (tone === '2600') {
      frequencies = tones.sf['2600'];
      logMessage(`Playing 2600Hz tone`);
    } else if (selectedSystem === 'DTMF' && tones.dtmf[tone]) {
      frequencies = tones.dtmf[tone];
      logMessage(`Playing DTMF tone: ${tone}`);
    } else if (selectedSystem === 'MF' && tones.mf[tone]) {
      frequencies = tones.mf[tone];
      logMessage(`Playing MF tone: ${tone}`);
    } else if (['NICKEL', 'DIME', 'QUARTER'].includes(tone)) {
      playRedboxTone(tone);
      return;
    } else {
      logMessage(`Unknown tone: ${tone}`);
      return;
    }
    
    if (frequencies) {
      generateTone(frequencies);
      setToneSequence(prev => prev + (prev ? ' ' : '') + tone);
    }
  };
  
  // Special handling for redbox tones
  const playRedboxTone = (coin) => {
    logMessage(`Simulating ${coin} deposit...`);
    setToneSequence(prev => prev + (prev ? ' ' : '') + coin);
    
    switch (coin) {
      case 'NICKEL':
        generateTone([2200], 66);
        break;
      case 'DIME':
        generateTone([2200], 66);
        setTimeout(() => generateTone([2200], 66), 132);
        break;
      case 'QUARTER':
        // 5 pulses for a quarter
        for (let i = 0; i < 5; i++) {
          setTimeout(() => generateTone([2200], 33), i * 66);
        }
        break;
    }
  };

  // Play sequence
  const playSequence = () => {
    if (!toneSequence) {
      logMessage('No sequence to play');
      return;
    }
    
    // Disable the play button during playback
    const playButton = document.getElementById('play-sequence-button');
    if (playButton) {
      playButton.disabled = true;
      playButton.style.opacity = '0.5';
    }
    
    logMessage(`Playing sequence: ${toneSequence}`);
    
    // Parse the sequence and play each tone with a delay
    const toneArray = toneSequence.split(' ');
    let totalDuration = 0;
    
    toneArray.forEach((tone, index) => {
      setTimeout(() => {
        // Just play the tone without adding to sequence
        if (['NICKEL', 'DIME', 'QUARTER'].includes(tone)) {
          // Special handling for redbox tones
          if (tone === 'NICKEL') {
            generateTone([2200], 66);
          } else if (tone === 'DIME') {
            generateTone([2200], 66);
            setTimeout(() => generateTone([2200], 66), 132);
          } else if (tone === 'QUARTER') {
            for (let i = 0; i < 5; i++) {
              setTimeout(() => generateTone([2200], 33), i * 66);
            }
          }
        } else if (tone === '2600') {
          generateTone(tones.sf['2600']);
        } else if (selectedSystem === 'DTMF' && tones.dtmf[tone]) {
          generateTone(tones.dtmf[tone]);
        } else if (selectedSystem === 'MF' && tones.mf[tone]) {
          generateTone(tones.mf[tone]);
        }
        
        // If this is the last tone, re-enable the play button after it finishes
        if (index === toneArray.length - 1) {
          setTimeout(() => {
            if (playButton) {
              playButton.disabled = false;
              playButton.style.opacity = '1';
            }
            logMessage("Sequence playback complete");
          }, 500); // Wait for the last tone to finish
        }
      }, index * 500);
      
      totalDuration = (index + 1) * 500;
    });
  };

  // Clear sequence
  const clearSequence = () => {
    setToneSequence('');
    logMessage('Sequence cleared');
  };

  // Colors for each mode
  const blueStyle = {
    background: '#041636',
    panel: '#05234e', 
    button: '#0a3373',
    specialButton: '#05388c',
    accent: '#0055ff',
    text: '#3a9fff'
  };

  const redStyle = {
    background: '#360404',
    panel: '#4e0505',
    button: '#730a0a',
    specialButton: '#8c0505',
    accent: '#ff0000',
    text: '#ff3a3a'
  };

  const purpleStyle = {
    background: '#260336',
    panel: '#4e054e',
    button: '#560a73',
    specialButton: '#52058c',
    accent: '#8800ff',
    text: '#cc3aff'
  };

  const greenStyle = {
    background: '#0d0d0d',
    panel: '#0f1d0f',
    button: '#0a350a',
    specialButton: '#054205',
    accent: '#00ff00',
    text: '#3aff3a'
  };

  // Get current style based on active tab
  const getCurrentStyle = () => {
    switch (activeTab) {
      case 'blueBox': return blueStyle;
      case 'redBox': return redStyle;
      case 'advanced': return purpleStyle;
      case 'terminal': return greenStyle;
      default: return blueStyle;
    }
  };

  const style = getCurrentStyle();

  return (
    <div style={{
      backgroundColor: style.background,
      color: style.text,
      minHeight: '100vh',
      padding: '16px',
      fontFamily: 'monospace'
    }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{
          backgroundColor: style.panel,
          padding: '16px',
          borderRadius: '8px',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center'
        }}>
          <div style={{ 
            width: '40px', 
            height: '40px', 
            borderRadius: '50%', 
            backgroundColor: style.button,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: '16px'
          }}>
            <Phone color={style.text} size={20} />
          </div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold' }}>
            PHREAK<span style={{ color: style.accent }}>DIALER</span>
          </h1>
        </div>
        
        {/* Tabs */}
        <div style={{ display: 'flex', marginBottom: '16px' }}>
          <button 
            onClick={() => setActiveTab('blueBox')}
            style={{
              backgroundColor: activeTab === 'blueBox' ? blueStyle.panel : '#0c0c14',
              color: activeTab === 'blueBox' ? blueStyle.text : '#777',
              border: 'none',
              padding: '8px 16px',
              marginRight: '4px',
              cursor: 'pointer'
            }}
          >
            <Phone size={16} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
            BLUE BOX
          </button>
          
          <button 
            onClick={() => setActiveTab('redBox')}
            style={{
              backgroundColor: activeTab === 'redBox' ? redStyle.panel : '#0c0c14',
              color: activeTab === 'redBox' ? redStyle.text : '#777',
              border: 'none',
              padding: '8px 16px',
              marginRight: '4px',
              cursor: 'pointer'
            }}
          >
            <Monitor size={16} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
            RED BOX
          </button>
          
          <button 
            onClick={() => setActiveTab('advanced')}
            style={{
              backgroundColor: activeTab === 'advanced' ? purpleStyle.panel : '#0c0c14',
              color: activeTab === 'advanced' ? purpleStyle.text : '#777',
              border: 'none',
              padding: '8px 16px',
              marginRight: '4px',
              cursor: 'pointer'
            }}
          >
            <Wrench size={16} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
            ADVANCED
          </button>
          
          <button 
            onClick={() => setActiveTab('terminal')}
            style={{
              backgroundColor: activeTab === 'terminal' ? greenStyle.panel : '#0c0c14',
              color: activeTab === 'terminal' ? greenStyle.text : '#777',
              border: 'none',
              padding: '8px 16px',
              cursor: 'pointer'
            }}
          >
            <Terminal size={16} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
            TERMINAL
          </button>
        </div>
        
        {/* Main content */}
        <div style={{
          backgroundColor: style.panel,
          padding: '16px',
          borderRadius: '8px',
          marginBottom: '16px'
        }}>
          {/* Sequence display */}
          <div style={{
            backgroundColor: '#000',
            padding: '16px',
            borderRadius: '8px',
            marginBottom: '16px',
            border: `1px solid ${style.accent}`
          }}>
            <div style={{ fontSize: '12px', marginBottom: '8px' }}>SEQUENCE BUFFER</div>
            <div style={{ 
              fontSize: '18px', 
              fontWeight: 'bold', 
              marginBottom: '16px',
              minHeight: '24px'
            }}>
              {toneSequence || '[ EMPTY ]'}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                onClick={playSequence}
                id="play-sequence-button"
                style={{
                  backgroundColor: style.specialButton,
                  color: style.text,
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '4px',
                  flex: 1,
                  cursor: 'pointer'
                }}
              >
                <Play size={14} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                PLAY SEQUENCE
              </button>
              <button 
                onClick={clearSequence}
                style={{
                  backgroundColor: style.button,
                  color: style.text,
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '4px',
                  flex: 1,
                  cursor: 'pointer'
                }}
              >
                CLEAR
              </button>
            </div>
          </div>
          
          {/* Tab content */}
          {activeTab === 'blueBox' && (
            <div>
              <div style={{ marginBottom: '16px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontSize: '12px' }}>MODE:</span>
                <button
                  onClick={() => setSelectedSystem('DTMF')}
                  style={{
                    backgroundColor: selectedSystem === 'DTMF' ? blueStyle.specialButton : blueStyle.button,
                    color: blueStyle.text,
                    border: 'none',
                    padding: '4px 12px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  DTMF
                </button>
                <button
                  onClick={() => setSelectedSystem('MF')}
                  style={{
                    backgroundColor: selectedSystem === 'MF' ? blueStyle.specialButton : blueStyle.button,
                    color: blueStyle.text,
                    border: 'none',
                    padding: '4px 12px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  MF TONES
                </button>
              </div>
              
              {selectedSystem === 'DTMF' ? (
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
                        backgroundColor: ['A', 'B', 'C', 'D'].includes(key) ? blueStyle.specialButton : blueStyle.button,
                        color: blueStyle.text,
                        border: 'none',
                        padding: '12px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: 'bold'
                      }}
                    >
                      {key}
                    </button>
                  ))}
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '8px' }}>
                  {/* Main dialpad - 3x4 grid with only real MF digits */}
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(3, 1fr)', 
                    gap: '8px',
                    flex: '3'
                  }}>
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9', '11', '0', '12'].map(key => (
                      <button
                        key={key}
                        onClick={() => playTone(key)}
                        style={{
                          backgroundColor: blueStyle.button,
                          color: blueStyle.text,
                          border: 'none',
                          padding: '12px',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontWeight: 'bold'
                        }}
                      >
                        {key}
                      </button>
                    ))}
                  </div>
                  
                  {/* MF special keys - vertical column */}
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: '1fr', 
                    gap: '8px',
                    flex: '1'
                  }}>
                    <button
                      onClick={() => playTone('KP')}
                      style={{
                        backgroundColor: blueStyle.specialButton,
                        color: blueStyle.text,
                        border: 'none',
                        padding: '12px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: 'bold'
                      }}
                    >
                      KP
                    </button>
                    <button
                      onClick={() => playTone('KP2')}
                      style={{
                        backgroundColor: blueStyle.specialButton,
                        color: blueStyle.text,
                        border: 'none',
                        padding: '12px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: 'bold'
                      }}
                    >
                      KP2
                    </button>
                    <button
                      onClick={() => playTone('ST')}
                      style={{
                        backgroundColor: blueStyle.specialButton,
                        color: blueStyle.text,
                        border: 'none',
                        padding: '12px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: 'bold'
                      }}
                    >
                      ST
                    </button>
                    <button
                      onClick={() => playTone('ST2')}
                      style={{
                        backgroundColor: blueStyle.specialButton,
                        color: blueStyle.text,
                        border: 'none',
                        padding: '12px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: 'bold'
                      }}
                    >
                      ST2
                    </button>
                    <button
                      onClick={() => playTone('ST3')}
                      style={{
                        backgroundColor: blueStyle.specialButton,
                        color: blueStyle.text,
                        border: 'none',
                        padding: '12px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: 'bold'
                      }}
                    >
                      ST3
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          
          {activeTab === 'redBox' && (
            <div>
              <div style={{
                backgroundColor: '#220000',
                padding: '16px',
                borderRadius: '8px',
                marginBottom: '16px',
                border: `1px solid ${redStyle.accent}`
              }}>
                <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px' }}>
                  RED BOX SIMULATOR
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                  <button
                    onClick={() => playRedboxTone('NICKEL')}
                    style={{
                      backgroundColor: redStyle.button,
                      color: redStyle.text,
                      border: 'none',
                      padding: '12px',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{ fontWeight: 'bold' }}>NICKEL</div>
                    <div style={{ fontSize: '12px' }}>5¢</div>
                  </button>
                  <button
                    onClick={() => playRedboxTone('DIME')}
                    style={{
                      backgroundColor: redStyle.button,
                      color: redStyle.text,
                      border: 'none',
                      padding: '12px',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{ fontWeight: 'bold' }}>DIME</div>
                    <div style={{ fontSize: '12px' }}>10¢</div>
                  </button>
                  <button
                    onClick={() => playRedboxTone('QUARTER')}
                    style={{
                      backgroundColor: redStyle.specialButton,
                      color: redStyle.text,
                      border: 'none',
                      padding: '12px',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{ fontWeight: 'bold' }}>QUARTER</div>
                    <div style={{ fontSize: '12px' }}>25¢</div>
                  </button>
                </div>
              </div>
              
              <div style={{
                backgroundColor: '#220000',
                padding: '16px',
                borderRadius: '8px',
                border: `1px solid ${redStyle.accent}`
              }}>
                <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px' }}>
                  DIALER MODE
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map(key => (
                    <button
                      key={key}
                      onClick={() => playTone(key)}
                      style={{
                        backgroundColor: redStyle.button,
                        color: redStyle.text,
                        border: 'none',
                        padding: '12px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '20px',
                        fontWeight: 'bold'
                      }}
                    >
                      {key}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          
          {activeTab === 'terminal' && (
            <div style={{
              backgroundColor: '#001100',
              padding: '16px',
              borderRadius: '8px',
              border: `1px solid ${greenStyle.accent}`
            }}>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                marginBottom: '12px'
              }}>
                <div style={{ fontSize: '14px', fontWeight: 'bold' }}>
                  TERMINAL OUTPUT
                </div>
                <button
                  onClick={() => setOutput('')}
                  style={{
                    backgroundColor: greenStyle.button,
                    color: greenStyle.text,
                    border: 'none',
                    padding: '4px 12px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  CLEAR
                </button>
              </div>
              <div style={{
                backgroundColor: '#000',
                borderRadius: '4px',
                padding: '12px',
                height: '256px',
                overflowY: 'auto',
                fontFamily: 'monospace',
                fontSize: '12px',
                whiteSpace: 'pre-wrap'
              }}>
                {output || "System ready. Waiting for input..."}
              </div>
            </div>
          )}
          
          {activeTab === 'advanced' && (
            <div>
              <div style={{
                backgroundColor: '#110022',
                padding: '16px',
                borderRadius: '8px',
                marginBottom: '16px',
                border: `1px solid ${purpleStyle.accent}`
              }}>
                <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px' }}>
                  INTERNATIONAL TRUNK OPERATIONS
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                  <button
                    onClick={() => {
                      logMessage("Generating trunk seizure tone");
                      generateTone([2600, 2400], 1000);
                    }}
                    style={{
                      backgroundColor: purpleStyle.specialButton,
                      color: purpleStyle.text,
                      border: 'none',
                      padding: '8px',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    INTL TRUNK SEIZE
                  </button>
                  <button
                    onClick={() => {
                      logMessage("Generating trunk clear tone");
                      generateTone([2400], 1000);
                    }}
                    style={{
                      backgroundColor: purpleStyle.specialButton,
                      color: purpleStyle.text,
                      border: 'none',
                      padding: '8px',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    INTL TRUNK CLEAR
                  </button>
                </div>
              </div>
              
              <div style={{
                backgroundColor: '#110022',
                padding: '16px',
                borderRadius: '8px',
                border: `1px solid ${purpleStyle.accent}`
              }}>
                <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px' }}>
                  EXPORT OPTIONS
                </div>
                <button
                  onClick={exportSequenceAsWAV}
                  style={{
                    backgroundColor: purpleStyle.specialButton,
                    color: purpleStyle.text,
                    border: 'none',
                    padding: '8px',
                    borderRadius: '4px',
                    width: '100%',
                    cursor: 'pointer'
                  }}
                >
                  EXPORT SEQUENCE AS WAV
                </button>
              </div>
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div style={{ textAlign: 'center', fontSize: '12px', opacity: 0.7 }}>
          PhreakDialer • Educational Use Only
        </div>
      </div>
    </div>
  );
};

export default PhreakDialer;