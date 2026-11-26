import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Mic,
  MicOff,
  Search,
  Square,
  X,
} from 'lucide-react';
import type { LanguageMode, MockLanguage } from '../types';
import {
  diagnoseVoiceSearchAvailability,
  getSpeechRecognitionConstructor,
  mapAppLanguageToVoiceLang,
  mapSpeechErrorToStatus,
  mapThrownStartErrorToStatus,
  observeMicrophonePermission,
  VOICE_LANGUAGE_OPTIONS,
  type MicPermissionState,
  type SpeechRecognitionErrorEventLike,
  type SpeechRecognitionEventLike,
  type SpeechRecognitionInstance,
  type VoiceSearchLang,
  type VoiceSearchState,
} from '../utils/speechRecognition';

export interface SearchBarWithVoiceProps {
  value: string;
  onChange: (nextValue: string) => void;
  onSearch?: (query: string) => void;
  placeholder?: string;
  defaultLanguage?: LanguageMode | MockLanguage;
  compact?: boolean;
  showLanguageSelector?: boolean;
  showStatusPill?: boolean;
  ariaLabel?: string;
  className?: string;
  inputClassName?: string;
}

const STATE_DISPLAY: Record<VoiceSearchState, string> = {
  ready: 'Ready to record',
  listening: 'Listening',
  processing: 'Processing speech',
  recognized: 'Text recognized',
  denied: 'Microphone permission denied',
  unsupported: 'Browser not supported',
};

export const SearchBarWithVoice: React.FC<SearchBarWithVoiceProps> = ({
  value,
  onChange,
  onSearch,
  placeholder = 'Search...',
  defaultLanguage,
  compact = false,
  showLanguageSelector = true,
  showStatusPill = true,
  ariaLabel = 'Search',
  className = '',
  inputClassName = '',
}) => {
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const latestTranscriptRef = useRef<string>('');
  const manualStopRef = useRef<boolean>(false);
  const hadErrorRef = useRef<boolean>(false);
  const micPermissionRef = useRef<MicPermissionState>('unknown');

  const [voiceState, setVoiceState] = useState<VoiceSearchState>('ready');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [voiceLang, setVoiceLang] = useState<VoiceSearchLang>(() =>
    mapAppLanguageToVoiceLang(defaultLanguage),
  );
  const [interimText, setInterimText] = useState<string>('');
  // Holds recognized voice text inside the input so the user can edit it before clicking Search
  const [voiceDraft, setVoiceDraft] = useState<string | null>(null);
  const [autoSearchAfterVoice, setAutoSearchAfterVoice] = useState<boolean>(false);
  const [controlsOpen, setControlsOpen] = useState<boolean>(false);

  // Sync default recognition language with selected website language when idle
  useEffect(() => {
    if (defaultLanguage && voiceState !== 'listening' && voiceState !== 'processing') {
      setVoiceLang(mapAppLanguageToVoiceLang(defaultLanguage));
    }
  }, [defaultLanguage, voiceState]);

  // Passively observe microphone permission state so startListening can stay synchronous
  useEffect(() => {
    return observeMicrophonePermission((permState) => {
      micPermissionRef.current = permState;
      if (permState === 'granted' && voiceState === 'denied') {
        setVoiceState('ready');
        setStatusMessage('Microphone permission granted. Click the microphone to record.');
      }
    });
  }, [voiceState]);

  const cleanupRecognition = useCallback((abortActive = true) => {
    const rec = recognitionRef.current;
    if (rec) {
      rec.onstart = null;
      rec.onspeechstart = null;
      rec.onspeechend = null;
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      if (abortActive) {
        try {
          rec.abort();
        } catch {
          // Ignore cleanup abort errors
        }
      }
      recognitionRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      cleanupRecognition(true);
    };
  }, [cleanupRecognition]);

  const displayedValue = voiceDraft !== null ? voiceDraft : value;

  const executeSearch = useCallback(
    (rawQuery?: string) => {
      const next = (rawQuery ?? (voiceDraft !== null ? voiceDraft : value)).trim();
      const raw = rawQuery ?? (voiceDraft !== null ? voiceDraft : value);
      setVoiceDraft(null);
      onChange(raw);
      onSearch?.(raw);
      if (next) {
        setStatusMessage(`Search executed for "${next}".`);
      }
    },
    [onChange, onSearch, value, voiceDraft],
  );

  const stopRecording = useCallback(() => {
    manualStopRef.current = true;
    const rec = recognitionRef.current;
    if (!rec) {
      setVoiceState('ready');
      setStatusMessage('');
      return;
    }
    setVoiceState('processing');
    setStatusMessage('Processing speech...');
    try {
      rec.stop();
    } catch {
      cleanupRecognition(true);
      setVoiceState('ready');
      setStatusMessage('Recording stopped. Click the microphone to try again or type your search.');
    }
  }, [cleanupRecognition]);

  // IMPORTANT: Keep startRecording synchronous up to recognition.start() so the browser
  // preserves transient user-gesture activation (required by Safari/Chrome/Edge & iframes).
  const startRecording = useCallback(() => {
    setControlsOpen(true);

    const diagnosis = diagnoseVoiceSearchAvailability();
    if (!diagnosis.available) {
      setVoiceState(diagnosis.state);
      setStatusMessage(diagnosis.message || 'Voice search is unavailable in this environment.');
      return;
    }

    if (micPermissionRef.current === 'denied') {
      setVoiceState('denied');
      setStatusMessage(
        'Microphone permission denied. Please enable microphone access in your browser site settings and try again.',
      );
      return;
    }

    const RecognitionCtor = getSpeechRecognitionConstructor();
    if (!RecognitionCtor) {
      setVoiceState('unsupported');
      setStatusMessage(
        'This browser does not expose SpeechRecognition or webkitSpeechRecognition. Normal text search remains active.',
      );
      return;
    }

    cleanupRecognition(true);
    manualStopRef.current = false;
    hadErrorRef.current = false;
    latestTranscriptRef.current = '';
    setInterimText('');

    try {
      const recognition = new RecognitionCtor();
      recognition.lang = voiceLang;
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setVoiceState('listening');
        const langMeta = VOICE_LANGUAGE_OPTIONS.find((o) => o.code === voiceLang);
        setStatusMessage(`Listening in ${langMeta?.nativeLabel || voiceLang}... Speak clearly.`);
      };

      recognition.onspeechstart = () => {
        if (!hadErrorRef.current) {
          setStatusMessage('Speech detected — listening...');
        }
      };

      recognition.onspeechend = () => {
        if (!manualStopRef.current && !hadErrorRef.current) {
          setVoiceState('processing');
          setStatusMessage('Processing speech...');
        }
      };

      recognition.onresult = (event: SpeechRecognitionEventLike) => {
        let finalChunk = '';
        let interimChunk = '';
        for (let i = 0; i < event.results.length; i++) {
          const res = event.results[i];
          const text = res[0]?.transcript || '';
          if (res.isFinal) {
            finalChunk += `${text} `;
          } else {
            interimChunk += `${text} `;
          }
        }
        const combined = `${finalChunk}${interimChunk}`.trim().replace(/\s+/g, ' ');
        if (combined) {
          latestTranscriptRef.current = combined;
          setInterimText(interimChunk.trim());
          setVoiceDraft(combined);
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
        hadErrorRef.current = true;
        const mapped = mapSpeechErrorToStatus(event.error, voiceLang);
        if (mapped.state === 'denied') {
          micPermissionRef.current = 'denied';
        }
        setVoiceState(mapped.state);
        setStatusMessage(mapped.message);
        setInterimText('');
        recognitionRef.current = null;
      };

      recognition.onend = () => {
        const finalTranscript = latestTranscriptRef.current.trim();
        recognitionRef.current = null;
        setInterimText('');

        if (hadErrorRef.current) {
          return;
        }

        if (finalTranscript) {
          if (autoSearchAfterVoice) {
            setVoiceDraft(null);
            onChange(finalTranscript);
            onSearch?.(finalTranscript);
            setVoiceState('recognized');
            setStatusMessage(`Text recognized and searched for "${finalTranscript}". You can still edit it.`);
          } else {
            // Put recognized text into the search input and let the user edit before clicking Search
            setVoiceDraft(finalTranscript);
            setVoiceState('recognized');
            setStatusMessage(
              'Text recognized and placed in the search box. Edit if needed, then click Search.',
            );
            setTimeout(() => {
              inputRef.current?.focus();
            }, 0);
          }
        } else {
          setVoiceState('ready');
          setStatusMessage(
            manualStopRef.current
              ? 'Recording stopped. Click the microphone to try again or type in the search box.'
              : 'No speech was captured. Click the microphone to record again or type your search.',
          );
        }
      };

      recognitionRef.current = recognition;
      setVoiceState('listening');
      setStatusMessage('Requesting microphone permission & starting recognition...');
      recognition.start();
    } catch (err) {
      cleanupRecognition(true);
      const mapped = mapThrownStartErrorToStatus(err);
      setVoiceState(mapped.state);
      setStatusMessage(mapped.message);
    }
  }, [autoSearchAfterVoice, cleanupRecognition, onChange, onSearch, voiceLang]);

  const isListening = voiceState === 'listening';
  const isProcessing = voiceState === 'processing';
  const selectedLangOption = VOICE_LANGUAGE_OPTIONS.find((l) => l.code === voiceLang);

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center gap-1.5 w-full">
        {/* Existing Text Search Input */}
        <div className="relative flex-1 min-w-0">
          <Search
            className={`${
              compact ? 'w-3.5 h-3.5 left-2.5' : 'w-4 h-4 left-3.5'
            } text-slate-400 absolute top-1/2 -translate-y-1/2 pointer-events-none`}
          />
          <input
            ref={inputRef}
            type="text"
            value={displayedValue}
            onChange={(e) => {
              const nextVal = e.target.value;
              if (voiceDraft !== null) {
                setVoiceDraft(nextVal);
              } else {
                onChange(nextVal);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                executeSearch(displayedValue);
              }
            }}
            placeholder={placeholder}
            aria-label={ariaLabel}
            className={
              inputClassName ||
              `w-full ${
                compact
                  ? 'pl-8 pr-7 py-2 text-xs sm:text-sm rounded-lg'
                  : 'pl-10 pr-8 py-2.5 text-sm rounded-xl'
              } border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-slate-950 text-[#0F172A] dark:text-slate-100 focus:outline-none focus:border-[#4338CA]`
            }
          />
          {displayedValue && (
            <button
              type="button"
              onClick={() => {
                setVoiceDraft(null);
                onChange('');
                onSearch?.('');
                if (voiceState === 'recognized') {
                  setVoiceState('ready');
                  setStatusMessage('');
                }
              }}
              aria-label="Clear search"
              title="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Optional Voice Language Selector (Non-compact toolbars) */}
        {!compact && showLanguageSelector && (
          <select
            value={voiceLang}
            onChange={(e) => setVoiceLang(e.target.value as VoiceSearchLang)}
            disabled={isListening || isProcessing}
            aria-label="Voice search language"
            title="Voice recognition language"
            className="px-2.5 py-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-900 text-xs font-semibold text-[#0F172A] dark:text-slate-200 shrink-0 disabled:opacity-50"
          >
            {VOICE_LANGUAGE_OPTIONS.map((opt) => (
              <option key={opt.code} value={opt.code}>
                {opt.shortLabel} · {opt.code}
              </option>
            ))}
          </select>
        )}

        {/* Separate Search / Send Button */}
        <button
          type="button"
          onClick={() => executeSearch(displayedValue)}
          title="Search"
          aria-label="Execute search"
          className={
            compact
              ? 'w-9 h-9 rounded-lg shrink-0 inline-flex items-center justify-center border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-900 hover:border-[#4338CA] text-[#4338CA] dark:text-indigo-300 transition-colors'
              : 'px-3.5 py-2.5 rounded-xl shrink-0 inline-flex items-center gap-1.5 border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-[#4338CA] text-xs font-semibold text-[#0F172A] dark:text-slate-100 transition-colors'
          }
        >
          <Search className="w-4 h-4" />
          {!compact && <span>Search</span>}
        </button>

        {/* Circular Indigo/Blue Microphone / Stop Recording Button */}
        {isListening ? (
          <button
            type="button"
            onClick={stopRecording}
            title="Stop Recording"
            aria-label="Stop Recording"
            className={`${
              compact ? 'w-9 h-9' : 'w-10 h-10'
            } rounded-full shrink-0 inline-flex items-center justify-center bg-[#DC2626] hover:bg-[#B91C1C] text-white shadow-sm hover:shadow-md transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4338CA]`}
          >
            <Square className="w-3.5 h-3.5 fill-current" />
          </button>
        ) : (
          <button
            type="button"
            disabled={isProcessing}
            onClick={startRecording}
            title="Search using your voice"
            aria-label="Search using your voice"
            className={`${
              compact ? 'w-9 h-9' : 'w-10 h-10'
            } rounded-full shrink-0 inline-flex items-center justify-center bg-gradient-to-r from-[#4338CA] to-[#2563EB] hover:from-[#3730A3] hover:to-[#1D4ED8] text-white shadow-xs hover:shadow-md hover:scale-[1.03] disabled:opacity-60 transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4338CA]`}
          >
            {isProcessing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : voiceState === 'denied' || voiceState === 'unsupported' ? (
              <MicOff className="w-4 h-4" />
            ) : (
              <Mic className="w-4 h-4" />
            )}
          </button>
        )}
      </div>

      {/* Explicit Voice Search State, Language Picker (compact), & Editable-Before-Search Bar */}
      {showStatusPill && (controlsOpen || Boolean(statusMessage) || voiceDraft !== null) && (
        <div
          role="status"
          aria-live="polite"
          className={`rounded-xl border px-3 py-2 text-xs space-y-1.5 ${
            voiceState === 'denied'
              ? 'border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300'
              : voiceState === 'unsupported'
                ? 'border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200'
                : voiceState === 'listening' || voiceState === 'processing'
                  ? 'border-[#4338CA]/35 bg-indigo-50/80 dark:bg-indigo-950/30 text-[#4338CA] dark:text-indigo-200'
                  : voiceState === 'recognized'
                    ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200'
                    : 'border-[#E2E8F0] dark:border-slate-800 bg-[#F8FAFC] dark:bg-slate-900 text-[#64748B] dark:text-slate-300'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 font-semibold">
              {voiceState === 'listening' ? (
                <Mic className="w-3.5 h-3.5 shrink-0" />
              ) : voiceState === 'processing' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              ) : voiceState === 'recognized' ? (
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              ) : voiceState === 'denied' || voiceState === 'unsupported' ? (
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <Mic className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>{STATE_DISPLAY[voiceState]}</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {isListening && (
                <button
                  type="button"
                  onClick={stopRecording}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#DC2626] text-white text-[11px] font-semibold"
                >
                  <Square className="w-2.5 h-2.5 fill-current" />
                  <span>Stop Recording</span>
                </button>
              )}

              {voiceDraft !== null && !isListening && (
                <button
                  type="button"
                  onClick={() => executeSearch(voiceDraft)}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-gradient-to-r from-[#4338CA] to-[#2563EB] text-white text-[11px] font-semibold"
                >
                  <Search className="w-3 h-3" />
                  <span>Search</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  if (isListening) stopRecording();
                  setControlsOpen(false);
                  setStatusMessage('');
                  setVoiceState('ready');
                }}
                aria-label="Dismiss voice status"
                className="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>

          {statusMessage && (
            <div className="text-[11px] leading-relaxed">{statusMessage}</div>
          )}

          {interimText && isListening && (
            <div className="text-[11px] italic opacity-90">
              Heard: &ldquo;{interimText}&rdquo;
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-black/5 dark:border-white/10 text-[11px]">
            <div className="flex flex-wrap items-center gap-1.5">
              {compact && showLanguageSelector && (
                <select
                  value={voiceLang}
                  onChange={(e) => setVoiceLang(e.target.value as VoiceSearchLang)}
                  disabled={isListening || isProcessing}
                  aria-label="Voice language"
                  className="px-2 py-0.5 rounded-md border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-slate-950 text-[#0F172A] dark:text-slate-200 font-semibold"
                >
                  {VOICE_LANGUAGE_OPTIONS.map((opt) => (
                    <option key={opt.code} value={opt.code}>
                      {opt.nativeLabel}
                    </option>
                  ))}
                </select>
              )}
              {selectedLangOption?.supportNote && (
                <span className="opacity-80">{selectedLangOption.supportNote}</span>
              )}
            </div>

            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoSearchAfterVoice}
                onChange={(e) => setAutoSearchAfterVoice(e.target.checked)}
                className="accent-[#4338CA]"
              />
              <span>Auto-search after speech</span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
};
