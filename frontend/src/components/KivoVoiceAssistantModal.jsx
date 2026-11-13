import React, { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { getCurrentUser } from '../services/authService';
import { useVoiceRecorder } from '../utils/useVoiceRecorder';

const SUPPORTED_LANGUAGES = [
  { code: 'en-IN', label: 'English', flag: '🇬🇧' },
  { code: 'te-IN', label: 'Telugu (తెలుగు)', flag: '🇮🇳' },
  { code: 'hi-IN', label: 'Hindi (हिंदी)', flag: '🇮🇳' },
];

export default function KivoVoiceAssistantModal({
  isOpen,
  onClose,
  initialLanguage = 'en-IN',
  conversationHistory = [],
  onSyncMessages = null,
}) {
  const [selectedLang, setSelectedLang] = useState(initialLanguage);
  const [assistantState, setAssistantState] = useState('IDLE'); // IDLE | RECORDING | TRANSCRIBING | THINKING | SPEAKING | ERROR
  const [statusMessage, setStatusMessage] = useState('Tap microphone to speak to Kivo');
  const [userTranscript, setUserTranscript] = useState('');
  const [kivoResponse, setKivoResponse] = useState('');
  const [generationEngine, setGenerationEngine] = useState('');
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [suggestions, setSuggestions] = useState([
    'How do I find creators for my budget?',
    'How does milestone escrow work?',
    'How can I get my creator profile verified?',
  ]);

  const {
    isRecording,
    duration,
    audioLevel,
    error: recorderError,
    startRecording,
    stopRecording,
    cancelRecording,
  } = useVoiceRecorder();

  const audioRef = useRef(new Audio());
  const currentUser = getCurrentUser();

  // Setup audio playback callbacks
  useEffect(() => {
    const audio = audioRef.current;
    const handleEnded = () => {
      setIsPlayingAudio(false);
      setAssistantState('IDLE');
      setStatusMessage('Listening finished. Tap microphone to speak again.');
    };
    const handleError = () => {
      setIsPlayingAudio(false);
      setAssistantState('IDLE');
    };
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    return () => {
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.pause();
    };
  }, []);

  // Update status when recording state changes
  useEffect(() => {
    if (isRecording) {
      setAssistantState('RECORDING');
      setStatusMessage(`Listening in ${SUPPORTED_LANGUAGES.find((l) => l.code === selectedLang)?.label || 'English'}... (${duration}s)`);
    }
  }, [isRecording, duration, selectedLang]);

  // Handle recorder error
  useEffect(() => {
    if (recorderError) {
      setAssistantState('ERROR');
      setErrorMessage(recorderError);
      setStatusMessage('Microphone issue detected');
    }
  }, [recorderError]);

  if (!isOpen) return null;

  const handleStartListening = async () => {
    // Stop any existing audio playing
    if (isPlayingAudio) {
      audioRef.current.pause();
      setIsPlayingAudio(false);
    }

    setErrorMessage('');
    setAssistantState('RECORDING');
    setStatusMessage('Requesting microphone permission...');

    try {
      await startRecording();
    } catch (err) {
      setAssistantState('ERROR');
      setErrorMessage(err.message || 'Could not start recording.');
      setStatusMessage('Microphone access blocked');
    }
  };

  const handleStopListening = async () => {
    if (!isRecording) return;

    setAssistantState('TRANSCRIBING');
    setStatusMessage('Transcribing your voice with Gnani Prisma...');

    try {
      const { file } = await stopRecording();

      const formData = new FormData();
      formData.append('audio_file', file);
      formData.append('language_code', selectedLang);
      formData.append('user_role', currentUser?.role || 'GUEST');

      setAssistantState('THINKING');
      setStatusMessage('Kivo is thinking with Gemini & Kivora Knowledge...');

      const result = await api.kivoVoiceChat(formData);

      if (result) {
        setUserTranscript(result.transcript || '');
        setKivoResponse(result.reply || '');
        setGenerationEngine(result.generation_engine || 'GEMINI');
        if (Array.isArray(result.suggestions) && result.suggestions.length > 0) {
          setSuggestions(result.suggestions);
        }

        // Notify parent to sync history with text chatbot if callback provided
        if (onSyncMessages) {
          onSyncMessages([
            { sender: 'user', text: result.transcript },
            { sender: 'kivo', text: result.reply, engine: result.generation_engine, audioBase64: result.audio_base64 },
          ]);
        }

        // Play spoken audio if synthesized by Gnani Timbre
        if (result.audio_base64) {
          setAssistantState('SPEAKING');
          setStatusMessage('Kivo is speaking (Gnani Timbre)...');
          const audioSrc = `data:${result.audio_format || 'audio/wav'};base64,${result.audio_base64}`;
          audioRef.current.src = audioSrc;
          try {
            await audioRef.current.play();
            setIsPlayingAudio(true);
          } catch (playbackErr) {
            console.warn('Auto-play was prevented by browser policy:', playbackErr);
            setIsPlayingAudio(false);
            setAssistantState('IDLE');
            setStatusMessage('Audio ready to play. Tap speaker to listen.');
          }
        } else {
          setAssistantState('IDLE');
          setStatusMessage('Response ready. Tap microphone to speak again.');
        }
      }
    } catch (err) {
      console.error('Kivo Voice Assistant error:', err);
      setAssistantState('ERROR');
      setErrorMessage(err.message || 'Voice co-pilot encountered an error. Please try again.');
      setStatusMessage('Interaction failed');
    }
  };

  const handleTogglePlayback = () => {
    if (!audioRef.current.src) return;

    if (isPlayingAudio) {
      audioRef.current.pause();
      setIsPlayingAudio(false);
      setAssistantState('IDLE');
      setStatusMessage('Speech paused');
    } else {
      audioRef.current.play().then(() => {
        setIsPlayingAudio(true);
        setAssistantState('SPEAKING');
        setStatusMessage('Playing Kivo speech response...');
      }).catch((e) => {
        console.error('Audio play error:', e);
      });
    }
  };

  const handleQuickPromptClick = async (promptText) => {
    // Allows user to click a prompt chip in voice mode
    if (isRecording) {
      cancelRecording();
    }
    setUserTranscript(promptText);
    setAssistantState('THINKING');
    setStatusMessage('Kivo is reasoning with Gemini...');

    try {
      const formData = new FormData();
      formData.append('message', promptText);
      formData.append('language_code', selectedLang);
      formData.append('user_role', currentUser?.role || 'GUEST');

      const result = await api.kivoVoiceChat(formData);
      if (result) {
        setKivoResponse(result.reply || '');
        setGenerationEngine(result.generation_engine || 'GEMINI');
        if (Array.isArray(result.suggestions) && result.suggestions.length > 0) {
          setSuggestions(result.suggestions);
        }

        if (result.audio_base64) {
          setAssistantState('SPEAKING');
          setStatusMessage('Kivo is speaking (Gnani Timbre)...');
          audioRef.current.src = `data:${result.audio_format || 'audio/wav'};base64,${result.audio_base64}`;
          try {
            await audioRef.current.play();
            setIsPlayingAudio(true);
          } catch {
            setIsPlayingAudio(false);
            setAssistantState('IDLE');
          }
        } else {
          setAssistantState('IDLE');
          setStatusMessage('Response ready.');
        }
      }
    } catch (err) {
      setAssistantState('ERROR');
      setErrorMessage(err.message || 'Failed to process prompt.');
    }
  };

  return (
    <div className="kivo-voice-overlay">
      <div className="kivo-voice-container">
        {/* Top Bar: Identity & Controls */}
        <div className="kivo-voice-header">
          <div className="kivo-voice-branding">
            <div className="kivo-voice-robot-avatar">
              <img src="/assets/kivo_robot_mascot.jpg" alt="Kivo" />
              <span className={`kivo-voice-status-dot ${isRecording ? 'recording' : isPlayingAudio ? 'speaking' : 'ready'}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="kivo-voice-title">Kivo AI Voice Assistant</h3>
                <span className="kivo-voice-badge">Prisma + Timbre</span>
              </div>
              <p className="kivo-voice-subtitle">Grounded in Kivora Knowledge & Gemini 3.8 Flash</p>
            </div>
          </div>

          <div className="kivo-voice-controls-right">
            {/* Language Selector */}
            <div className="kivo-voice-lang-select-wrap">
              <span className="text-xs text-purple-200/70 mr-1 hidden sm:inline">Language:</span>
              <select
                value={selectedLang}
                onChange={(e) => setSelectedLang(e.target.value)}
                className="kivo-voice-lang-select"
                disabled={isRecording || assistantState === 'TRANSCRIBING'}
              >
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.flag} {lang.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Close / Return to Chat Button */}
            <button
              type="button"
              className="kivo-voice-close-btn"
              onClick={() => {
                if (isRecording) cancelRecording();
                if (isPlayingAudio) audioRef.current.pause();
                onClose();
              }}
              title="Return to standard chat"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Central Display: Visualizer & Mascot */}
        <div className="kivo-voice-center-stage">
          <div className="kivo-voice-mascot-glow-container">
            <div className={`kivo-voice-halo ${isRecording ? 'pulse-fast' : isPlayingAudio ? 'pulse-wave' : ''}`} />
            <img
              src="/assets/kivo_robot_mascot.jpg"
              alt="Kivo AI"
              className={`kivo-voice-mascot-img ${isRecording ? 'animate-bounce-gentle' : ''}`}
            />
          </div>

          {/* Dynamic Audio Waveform Visualizer */}
          <div className="kivo-voice-waveform">
            {[...Array(16)].map((_, i) => {
              const height = isRecording
                ? Math.max(8, Math.min(60, (audioLevel * 60) + Math.sin(i * 0.6) * 15))
                : isPlayingAudio
                ? Math.max(8, 20 + Math.sin(Date.now() / 200 + i) * 18)
                : 6;
              return (
                <span
                  key={i}
                  className={`kivo-wave-bar ${isRecording ? 'active' : isPlayingAudio ? 'speaking' : ''}`}
                  style={{ height: `${height}px` }}
                />
              );
            })}
          </div>

          {/* Assistant Status Text */}
          <div className="kivo-voice-status-pill">
            {assistantState === 'RECORDING' && <span className="rec-dot" />}
            {assistantState === 'THINKING' && <span className="thinking-sparkle">✦</span>}
            <span>{statusMessage}</span>
          </div>

          {/* Big Interactive Action Button */}
          <div className="kivo-voice-action-row">
            {!isRecording ? (
              <button
                type="button"
                className={`kivo-voice-mic-main-btn ${isPlayingAudio ? 'is-speaking' : ''}`}
                onClick={handleStartListening}
                disabled={assistantState === 'TRANSCRIBING' || assistantState === 'THINKING'}
                aria-label="Start Speaking"
              >
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              </button>
            ) : (
              <button
                type="button"
                className="kivo-voice-mic-main-btn is-recording"
                onClick={handleStopListening}
                aria-label="Stop Speaking & Process"
              >
                <div className="kivo-stop-square" />
              </button>
            )}

            {/* Audio Play/Pause Toggle if Response has Audio */}
            {audioRef.current.src && (
              <button
                type="button"
                className="kivo-voice-speaker-btn"
                onClick={handleTogglePlayback}
                title={isPlayingAudio ? 'Pause Spoken Audio' : 'Play Spoken Audio'}
              >
                {isPlayingAudio ? (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="4" width="4" height="16" />
                    <rect x="14" y="4" width="4" height="16" />
                  </svg>
                ) : (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" stroke="currentColor" strokeWidth="2" fill="none" />
                  </svg>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Live Recognized Speech & Response Box */}
        {(userTranscript || kivoResponse || errorMessage) && (
          <div className="kivo-voice-dialog-panel">
            {userTranscript && (
              <div className="kivo-voice-user-bubble">
                <span className="kivo-voice-speaker-tag">You:</span>
                <p>{userTranscript}</p>
              </div>
            )}

            {kivoResponse && (
              <div className="kivo-voice-response-bubble">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="kivo-voice-kivo-tag">✦ Kivo AI:</span>
                  {generationEngine && (
                    <span className="text-[10px] text-purple-300/60 font-mono">
                      {generationEngine}
                    </span>
                  )}
                </div>
                <div className="kivo-voice-text-content">
                  {kivoResponse.split('\n').map((line, lIdx) => {
                    const parts = line.split(/(\*\*.*?\*\*)/g);
                    return (
                      <p key={lIdx} className={line.trim() === '' ? 'h-2' : 'my-1'}>
                        {parts.map((part, pIdx) => {
                          if (part.startsWith('**') && part.endsWith('**')) {
                            return <strong key={pIdx} className="font-semibold text-purple-200">{part.slice(2, -2)}</strong>;
                          }
                          return part;
                        })}
                      </p>
                    );
                  })}
                </div>
              </div>
            )}

            {errorMessage && (
              <div className="kivo-voice-error-banner">
                <span>⚠️ {errorMessage}</span>
                <button
                  type="button"
                  className="kivo-voice-retry-btn"
                  onClick={handleStartListening}
                >
                  Try Again
                </button>
              </div>
            )}
          </div>
        )}

        {/* Quick Suggestion Chips */}
        <div className="kivo-voice-suggestions-row">
          <span className="text-[11px] text-purple-200/50 block w-full text-center mb-1">
            Or tap a suggested topic:
          </span>
          {suggestions.slice(0, 3).map((prompt, sIdx) => (
            <button
              key={sIdx}
              type="button"
              className="kivo-voice-chip"
              onClick={() => handleQuickPromptClick(prompt)}
              disabled={isRecording || assistantState === 'THINKING'}
            >
              ✦ {prompt}
            </button>
          ))}
        </div>

        {/* Footer switch back */}
        <div className="kivo-voice-footer">
          <button
            type="button"
            className="kivo-voice-back-link"
            onClick={onClose}
          >
            ← Switch to standard text chat
          </button>
        </div>
      </div>
    </div>
  );
}

