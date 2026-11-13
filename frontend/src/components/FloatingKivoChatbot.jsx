import React, { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { getCurrentUser } from '../services/authService';
import { useVoiceRecorder } from '../utils/useVoiceRecorder';
import KivoVoiceAssistantModal from './KivoVoiceAssistantModal';

export default function FloatingKivoChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('en-IN');
  const [messages, setMessages] = useState([
    {
      sender: 'kivo',
      text: "Hi! I'm Kivo 👋 Your AI creative co-pilot. You can type or tap the microphone to speak with me in English, Telugu, or Hindi!",
    },
  ]);
  const [inputVal, setInputVal] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const [playingMessageIndex, setPlayingMessageIndex] = useState(null);
  const [voiceError, setVoiceError] = useState('');
  const [suggestions, setSuggestions] = useState([
    'What is Kivora?',
    'How does creator verification work?',
    'How do brands post campaign briefs?',
    'How does milestone escrow protect payments?',
  ]);
  const [isHovered, setIsHovered] = useState(false);

  const messagesEndRef = useRef(null);
  const audioPlayerRef = useRef(new Audio());
  const currentUser = getCurrentUser();

  const {
    isRecording,
    duration,
    audioLevel,
    error: recorderError,
    startRecording,
    stopRecording,
    cancelRecording,
  } = useVoiceRecorder();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, isProcessingVoice]);

  // Audio player cleanup
  useEffect(() => {
    const audio = audioPlayerRef.current;
    const handleEnded = () => setPlayingMessageIndex(null);
    audio.addEventListener('ended', handleEnded);
    return () => {
      audio.removeEventListener('ended', handleEnded);
      audio.pause();
    };
  }, []);

  // Listen for custom trigger events
  useEffect(() => {
    const handleOpen = (e) => {
      setIsOpen(true);
      if (e.detail?.prompt) {
        handleSend(e.detail.prompt);
      }
    };
    const handleOpenVoice = () => {
      setIsVoiceModalOpen(true);
    };

    window.addEventListener('kivora:open-chat', handleOpen);
    window.addEventListener('kivora:open-voice', handleOpenVoice);
    return () => {
      window.removeEventListener('kivora:open-chat', handleOpen);
      window.removeEventListener('kivora:open-voice', handleOpenVoice);
    };
  }, []);

  // Handle recorder error
  useEffect(() => {
    if (recorderError) {
      setVoiceError(recorderError);
      const timer = setTimeout(() => setVoiceError(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [recorderError]);

  const handleSend = async (text) => {
    const query = (text || inputVal).trim();
    if (!query || isLoading || isRecording) return;

    // Optimistically add user message
    const newMessages = [...messages, { sender: 'user', text: query }];
    setMessages(newMessages);
    setInputVal('');
    setIsLoading(true);

    try {
      const historyPayload = newMessages.slice(-6).map((m) => ({
        sender: m.sender,
        text: m.text,
      }));

      const res = await api.kivoChat({
        message: query,
        history: historyPayload,
        user_role: currentUser?.role || 'GUEST',
      });

      if (res && res.reply) {
        setMessages((prev) => [
          ...prev,
          {
            sender: 'kivo',
            text: res.reply,
            engine: res.generation_engine,
          },
        ]);
        if (Array.isArray(res.suggestions) && res.suggestions.length > 0) {
          setSuggestions(res.suggestions);
        }
      } else {
        throw new Error('Empty response from AI assistant.');
      }
    } catch (err) {
      console.error('Kivo chatbot API error:', err);
      setMessages((prev) => [
        ...prev,
        {
          sender: 'kivo',
          text: "I'm having trouble connecting to the Kivora AI backend right now. Please try again in a few moments, or explore our Discover Creators and Campaign Briefs tabs.",
          isError: true,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartVoiceRecording = async () => {
    setVoiceError('');
    try {
      await startRecording();
    } catch (err) {
      setVoiceError(err.message || 'Microphone access denied.');
    }
  };

  const handleStopVoiceRecording = async () => {
    if (!isRecording) return;

    setIsProcessingVoice(true);
    try {
      const { file } = await stopRecording();

      const formData = new FormData();
      formData.append('audio_file', file);
      formData.append('language_code', selectedLanguage);
      formData.append('user_role', currentUser?.role || 'GUEST');

      const res = await api.kivoVoiceChat(formData);

      if (res && res.reply) {
        setMessages((prev) => [
          ...prev,
          { sender: 'user', text: res.transcript || '🎤 Voice message' },
          {
            sender: 'kivo',
            text: res.reply,
            engine: res.generation_engine,
            audioBase64: res.audio_base64,
            audioFormat: res.audio_format,
          },
        ]);
        if (Array.isArray(res.suggestions) && res.suggestions.length > 0) {
          setSuggestions(res.suggestions);
        }

        // Auto-play the synthesized speech response if available
        if (res.audio_base64) {
          try {
            audioPlayerRef.current.src = `data:${res.audio_format || 'audio/wav'};base64,${res.audio_base64}`;
            setPlayingMessageIndex(messages.length + 1);
            await audioPlayerRef.current.play();
          } catch (audioErr) {
            console.warn('Spoken audio ready, auto-play prevented by browser:', audioErr);
            setPlayingMessageIndex(null);
          }
        }
      }
    } catch (err) {
      console.error('Kivo voice chat error:', err);
      setVoiceError(err.message || 'Voice transcription failed.');
    } finally {
      setIsProcessingVoice(false);
    }
  };

  const handlePlayAudio = (audioBase64, msgIdx, audioFormat = 'audio/wav') => {
    if (!audioBase64) return;

    if (playingMessageIndex === msgIdx) {
      audioPlayerRef.current.pause();
      setPlayingMessageIndex(null);
    } else {
      audioPlayerRef.current.src = `data:${audioFormat};base64,${audioBase64}`;
      audioPlayerRef.current.play().then(() => {
        setPlayingMessageIndex(msgIdx);
      }).catch((e) => {
        console.error('Audio play error:', e);
        setPlayingMessageIndex(null);
      });
    }
  };

  const handleSyncVoiceMessages = (newItems) => {
    if (Array.isArray(newItems)) {
      setMessages((prev) => [...prev, ...newItems]);
    }
  };

  return (
    <>
      {/* Floating Trigger Button at Bottom-Right */}
      <div
        className="kivo-floating-trigger-container"
        style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999 }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Floating Speech Bubble */}
        <div
          className={`floating-kivo-speech-bubble ${isHovered && !isOpen ? 'visible' : ''}`}
          aria-hidden={!isHovered || isOpen}
        >
          <div className="floating-bubble-text">Hii! 👋 Chat or speak with me!</div>
          <div className="floating-bubble-tail" />
        </div>

        <button
          type="button"
          className={`kivo-floating-trigger-btn ${isHovered ? 'kivo-hover-bounce' : 'animate-float-gentle'}`}
          onClick={() => setIsOpen(!isOpen)}
          aria-label="Open Kivo AI Chat"
          title="Chat with Kivo AI"
        >
          <img
            src="/assets/kivo_robot_mascot.jpg"
            alt="Kivo"
            className="kivo-floating-trigger-avatar"
          />
          <span className="floating-trigger-status-dot" />
        </button>
      </div>

      {/* Floating Chat Modal Panel */}
      {isOpen && (
        <div
          className="kivo-floating-chat-panel"
          style={{ position: 'fixed', bottom: '92px', right: '24px', zIndex: 9999 }}
        >
          {/* Header */}
          <div className="kivo-panel-header">
            <div className="flex items-center gap-2">
              <div className="kivo-panel-avatar-wrap">
                <img src="/assets/kivo_robot_mascot.jpg" alt="Kivo" className="w-full h-full object-cover" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-sm">Kivo AI</span>
                  <span className="kivo-online-dot" />
                </div>
                <span className="text-[11px] text-purple-200/70 block">Voice & Text Co-Pilot</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Voice Mode Fullscreen Button */}
              <button
                type="button"
                className="kivo-header-voice-btn"
                onClick={() => setIsVoiceModalOpen(true)}
                title="Open Dedicated Full-Screen Voice Assistant (Gnani AI)"
              >
                🎙️ Voice Mode
              </button>

              <button
                type="button"
                className="kivo-panel-close-btn"
                onClick={() => setIsOpen(false)}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Voice Language Picker Ribbon */}
          <div className="kivo-panel-lang-ribbon">
            <span className="text-[10px] text-purple-300/70 uppercase tracking-wider font-semibold">Language:</span>
            <div className="flex items-center gap-1.5">
              {[
                { code: 'en-IN', label: 'English' },
                { code: 'te-IN', label: 'Telugu' },
                { code: 'hi-IN', label: 'Hindi' },
              ].map((l) => (
                <button
                  key={l.code}
                  type="button"
                  className={`kivo-lang-pill ${selectedLanguage === l.code ? 'active' : ''}`}
                  onClick={() => setSelectedLanguage(l.code)}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          {/* Messages Area */}
          <div className="kivo-panel-messages-area">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[88%] p-3 rounded-xl leading-relaxed text-xs ${
                    m.sender === 'user'
                      ? 'bg-[#7952EC] text-white rounded-br-none'
                      : m.isError
                      ? 'bg-red-950/40 text-red-200 border border-red-500/30 rounded-bl-none'
                      : 'bg-[#1C162E]/90 text-neutral-100 border border-purple-500/25 rounded-bl-none shadow-md backdrop-blur-sm'
                  }`}
                >
                  <div className="space-y-1">
                    {m.text.split('\n').map((line, lIdx) => {
                      const parts = line.split(/(\*\*.*?\*\*)/g);
                      return (
                        <div key={lIdx} className={line.trim() === '' ? 'h-1.5' : ''}>
                          {parts.map((part, pIdx) => {
                            if (part.startsWith('**') && part.endsWith('**')) {
                              return (
                                <strong key={pIdx} className="font-semibold text-purple-200">
                                  {part.slice(2, -2)}
                                </strong>
                              );
                            }
                            return part;
                          })}
                        </div>
                      );
                    })}
                  </div>

                  {/* Audio Playback Pill for Voice Response */}
                  {m.audioBase64 && (
                    <div className="mt-2.5 pt-2 border-t border-purple-500/20 flex items-center justify-between">
                      <button
                        type="button"
                        className="kivo-audio-play-pill"
                        onClick={() => handlePlayAudio(m.audioBase64, i, m.audioFormat)}
                        title="Play spoken response via Gnani Timbre"
                      >
                        {playingMessageIndex === i ? (
                          <>
                            <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                            <span>Pause Audio</span>
                          </>
                        ) : (
                          <>
                            <span className="text-purple-300">▶</span>
                            <span>Listen to Kivo</span>
                          </>
                        )}
                      </button>
                      <span className="text-[9px] text-purple-300/50">Gnani Timbre</span>
                    </div>
                  )}

                  {m.engine && (
                    <span className="text-[9px] text-purple-300/70 block mt-2 font-mono border-t border-purple-500/20 pt-1">
                      ✦ {m.engine}
                    </span>
                  )}
                </div>
              </div>
            ))}

            {(isLoading || isProcessingVoice) && (
              <div className="flex justify-start">
                <div className="bg-white/10 border border-purple-500/20 text-purple-200 text-xs p-2.5 rounded-xl rounded-bl-none flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                  <span>{isProcessingVoice ? 'Transcribing & synthesizing speech... 🎙️' : 'Kivo is thinking... ✦'}</span>
                </div>
              </div>
            )}

            {voiceError && (
              <div className="kivo-panel-voice-error">
                <span>⚠️ {voiceError}</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Prompts */}
          {suggestions.length > 0 && !isRecording && (
            <div className="kivo-panel-prompts-row">
              {suggestions.map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="kivo-panel-chip"
                  onClick={() => handleSend(p)}
                  disabled={isLoading || isProcessingVoice}
                >
                  {p}
                </button>
              ))}
            </div>
          )}

          {/* Input Box with Microphone Control */}
          <form
            className="kivo-panel-input-wrap"
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
          >
            {isRecording ? (
              <div className="kivo-recording-bar flex-1 flex items-center justify-between px-3">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
                  <span className="text-xs text-red-300 font-medium">Recording speech ({duration}s)...</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    className="text-xs text-neutral-400 hover:text-white px-2 py-0.5 rounded"
                    onClick={cancelRecording}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="kivo-rec-finish-btn"
                    onClick={handleStopVoiceRecording}
                  >
                    Done ✓
                  </button>
                </div>
              </div>
            ) : (
              <input
                type="text"
                placeholder="Ask Kivo or tap mic to speak..."
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                disabled={isLoading || isProcessingVoice}
                className="kivo-panel-input"
              />
            )}

            {/* Microphone Button */}
            {!isRecording ? (
              <button
                type="button"
                className="kivo-panel-mic-trigger-btn"
                onClick={handleStartVoiceRecording}
                disabled={isLoading || isProcessingVoice}
                title="Hold or tap to speak to Kivo"
              >
                🎙️
              </button>
            ) : (
              <button
                type="button"
                className="kivo-panel-mic-trigger-btn recording"
                onClick={handleStopVoiceRecording}
                title="Stop recording"
              >
                ⏹
              </button>
            )}

            {!isRecording && (
              <button
                type="submit"
                disabled={!inputVal.trim() || isLoading || isProcessingVoice}
                className="kivo-panel-send-btn"
                title="Send message"
              >
                ➔
              </button>
            )}
          </form>
        </div>
      )}

      {/* Dedicated Full-Screen Voice Assistant Modal */}
      <KivoVoiceAssistantModal
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
        initialLanguage={selectedLanguage}
        onSyncMessages={handleSyncVoiceMessages}
      />
    </>
  );
}
