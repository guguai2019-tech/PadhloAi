import type { LanguageMode, MockLanguage } from '../types';

export type VoiceSearchLang = 'en-IN' | 'hi-IN' | 'or-IN';

export type VoiceSearchState =
  | 'ready'
  | 'listening'
  | 'processing'
  | 'recognized'
  | 'denied'
  | 'unsupported';

export interface VoiceLanguageOption {
  code: VoiceSearchLang;
  shortLabel: string;
  label: string;
  nativeLabel: string;
  supportNote?: string;
}

export const VOICE_LANGUAGE_OPTIONS: VoiceLanguageOption[] = [
  {
    code: 'en-IN',
    shortLabel: 'EN',
    label: 'English (India)',
    nativeLabel: 'English (en-IN)',
  },
  {
    code: 'hi-IN',
    shortLabel: 'HI',
    label: 'Hindi (India)',
    nativeLabel: 'हिन्दी (hi-IN)',
  },
  {
    code: 'or-IN',
    shortLabel: 'OR',
    label: 'Odia (India)',
    nativeLabel: 'ଓଡ଼ିଆ (or-IN)',
    supportNote: 'Works only if your browser speech engine supports or-IN.',
  },
];

export interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}

export interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

export interface SpeechRecognitionResultListLike {
  readonly length: number;
  [index: number]: SpeechRecognitionResultLike;
}

export interface SpeechRecognitionEventLike extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultListLike;
}

export interface SpeechRecognitionErrorEventLike extends Event {
  readonly error: string;
  readonly message?: string;
}

export interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: ((this: SpeechRecognitionInstance, ev: Event) => void) | null;
  onspeechstart: ((this: SpeechRecognitionInstance, ev: Event) => void) | null;
  onspeechend: ((this: SpeechRecognitionInstance, ev: Event) => void) | null;
  onresult: ((this: SpeechRecognitionInstance, ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((this: SpeechRecognitionInstance, ev: SpeechRecognitionErrorEventLike) => void) | null;
  onend: ((this: SpeechRecognitionInstance, ev: Event) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

export type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

interface GlobalWithSpeech {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

export function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined' && typeof globalThis === 'undefined') return null;
  const win = (typeof window !== 'undefined' ? window : undefined) as
    | (Window & GlobalWithSpeech)
    | undefined;
  const gt = globalThis as unknown as GlobalWithSpeech;
  const ctor =
    win?.SpeechRecognition ||
    win?.webkitSpeechRecognition ||
    gt.SpeechRecognition ||
    gt.webkitSpeechRecognition ||
    null;
  return typeof ctor === 'function' ? ctor : null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionConstructor() !== null;
}

export function isSecureVoiceContext(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.isSecureContext) return true;
  const host = window.location?.hostname || '';
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

export function isEmbeddedIframe(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function isMicrophonePolicyBlocked(): boolean {
  if (typeof document === 'undefined') return false;
  const docAny = document as unknown as {
    permissionsPolicy?: { allowsFeature?: (feature: string) => boolean };
    featurePolicy?: { allowsFeature?: (feature: string) => boolean };
  };
  const policy = docAny.permissionsPolicy || docAny.featurePolicy;
  if (policy && typeof policy.allowsFeature === 'function') {
    try {
      return policy.allowsFeature('microphone') === false;
    } catch {
      return false;
    }
  }
  return false;
}

export interface VoiceAvailabilityDiagnosis {
  available: boolean;
  state: VoiceSearchState;
  reason?: 'insecure-context' | 'iframe-policy-blocked' | 'api-missing';
  message?: string;
}

export function diagnoseVoiceSearchAvailability(): VoiceAvailabilityDiagnosis {
  if (!isSecureVoiceContext()) {
    return {
      available: false,
      state: 'unsupported',
      reason: 'insecure-context',
      message:
        'Voice recognition requires a secure HTTPS connection (or localhost). Normal text search remains active.',
    };
  }

  if (isMicrophonePolicyBlocked()) {
    return {
      available: false,
      state: 'denied',
      reason: 'iframe-policy-blocked',
      message:
        'Microphone access is blocked by this embedded frame’s permissions policy. Open the app in a standalone browser tab over HTTPS or allow microphone access for this frame.',
    };
  }

  if (!getSpeechRecognitionConstructor()) {
    return {
      available: false,
      state: 'unsupported',
      reason: 'api-missing',
      message:
        'This browser or environment does not expose the Web Speech Recognition API (window.SpeechRecognition / webkitSpeechRecognition). Type in the search bar to search normally.',
    };
  }

  return {
    available: true,
    state: 'ready',
  };
}

export function mapAppLanguageToVoiceLang(
  lang?: LanguageMode | MockLanguage,
): VoiceSearchLang {
  if (lang === 'odia') return 'or-IN';
  if (lang === 'hindi') return 'hi-IN';
  if (lang === 'auto' && typeof navigator !== 'undefined' && navigator.language) {
    const navLang = navigator.language.toLowerCase();
    if (navLang.startsWith('or')) return 'or-IN';
    if (navLang.startsWith('hi')) return 'hi-IN';
  }
  return 'en-IN';
}

export type MicPermissionState = 'granted' | 'denied' | 'prompt' | 'unknown';

export async function queryMicrophonePermission(): Promise<MicPermissionState> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
    return 'unknown';
  }
  try {
    const status = await navigator.permissions.query({
      name: 'microphone' as PermissionName,
    });
    if (status.state === 'granted' || status.state === 'denied' || status.state === 'prompt') {
      return status.state;
    }
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

export function observeMicrophonePermission(
  onStateChange: (state: MicPermissionState) => void,
): () => void {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
    return () => {};
  }
  let cancelled = false;
  let permStatus: PermissionStatus | null = null;

  const handleChange = () => {
    if (!cancelled && permStatus) {
      const st = permStatus.state;
      if (st === 'granted' || st === 'denied' || st === 'prompt') {
        onStateChange(st);
      }
    }
  };

  navigator.permissions
    .query({ name: 'microphone' as PermissionName })
    .then((status) => {
      if (cancelled) return;
      permStatus = status;
      handleChange();
      status.addEventListener?.('change', handleChange);
    })
    .catch(() => {
      // Permissions API for microphone is not supported in all browsers (e.g. Safari)
    });

  return () => {
    cancelled = true;
    permStatus?.removeEventListener?.('change', handleChange);
  };
}

export function mapSpeechErrorToStatus(
  errorCode: string,
  selectedLang: VoiceSearchLang,
  opts?: { inIframe?: boolean; micPolicyBlocked?: boolean },
): { state: VoiceSearchState; message: string } {
  const langLabel =
    VOICE_LANGUAGE_OPTIONS.find((l) => l.code === selectedLang)?.nativeLabel || selectedLang;
  const inIframe = opts?.inIframe ?? isEmbeddedIframe();
  const policyBlocked = opts?.micPolicyBlocked ?? isMicrophonePolicyBlocked();

  switch (errorCode) {
    case 'not-allowed':
      return {
        state: 'denied',
        message: policyBlocked || inIframe
          ? 'Microphone permission denied or blocked by the embedded frame. Allow microphone access in browser site settings or open the app in its own HTTPS tab.'
          : 'Microphone permission denied. Enable microphone access in your browser site settings and try again.',
      };
    case 'service-not-allowed':
      if (policyBlocked) {
        return {
          state: 'denied',
          message:
            'Microphone access is blocked by the frame permissions policy. Open the app in a standalone HTTPS tab to use voice search.',
        };
      }
      return {
        state: 'unsupported',
        message: inIframe
          ? 'Speech recognition service is blocked inside this embedded view or disabled by your browser settings. Open in a direct browser tab or use normal text search.'
          : 'Speech recognition service is not allowed or is disabled in your browser privacy/dictation settings. Normal text search remains active.',
      };
    case 'language-not-supported':
      return {
        state: 'unsupported',
        message: `${langLabel} is not supported by your browser's speech recognition service. Choose another supported language or edit/type your search directly.`,
      };
    case 'audio-capture':
      return {
        state: 'unsupported',
        message:
          'No microphone input was captured. Check that a microphone is connected and not in use by another app, or type in the search bar.',
      };
    case 'network':
      return {
        state: 'unsupported',
        message:
          'Speech recognition network error — your browser could not reach its speech service. Check your connection or type in the search bar.',
      };
    case 'no-speech':
      return {
        state: 'ready',
        message: 'No speech detected. Click the microphone to record again, or type in the search bar.',
      };
    case 'aborted':
      return {
        state: 'ready',
        message: 'Recording stopped. You can edit the text or click the microphone to try again.',
      };
    default:
      return {
        state: 'unsupported',
        message: `Speech recognition encountered an error (${errorCode || 'unknown'}). Normal text search remains active.`,
      };
  }
}

export function mapThrownStartErrorToStatus(err: unknown): {
  state: VoiceSearchState;
  message: string;
} {
  const name = err instanceof DOMException || err instanceof Error ? err.name : '';
  const msg = err instanceof Error ? err.message : '';

  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    return {
      state: 'denied',
      message: isEmbeddedIframe()
        ? 'Microphone permission denied or restricted inside this embedded frame. Allow microphone permission or open in a standalone HTTPS tab.'
        : 'Microphone permission denied. Allow microphone access in your browser settings and try again.',
    };
  }

  if (name === 'NotSupportedError') {
    return {
      state: 'unsupported',
      message:
        'Browser speech recognition could not initialize in this environment. Normal text search remains active.',
    };
  }

  return {
    state: 'unsupported',
    message: msg
      ? `Unable to start voice recognition (${msg}). Normal text search remains active.`
      : 'Unable to start voice recognition in this browser. Normal text search remains active.',
  };
}
