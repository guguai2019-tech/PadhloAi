import type { ProviderConnectionState, ProviderId } from '../src/types.ts';

export interface ServerModelInfo {
  id: string;
  provider: ProviderId;
  name: string;
  description: string;
  supportsVision: boolean;
  supportsStreaming: boolean;
  supportsJson: boolean;
  contextWindowLabel: string;
  isOpenSource: boolean;
  enabled?: boolean;
  sizeLabel?: string;
  family?: string;
}

export interface ServerProviderStatus {
  id: ProviderId;
  name: string;
  description: string;
  enabled: boolean;
  configured: boolean;
  available: boolean;
  connectionState: ProviderConnectionState;
  statusMessage: string;
  endpointLabel?: string;
  models: ServerModelInfo[];
}

export interface IncomingAttachment {
  name: string;
  mimeType: string;
  kind: 'pdf' | 'docx' | 'text' | 'csv' | 'image';
  extractedText?: string;
  imageDataUrl?: string;
}

export interface IncomingMessage {
  role: 'user' | 'assistant';
  content: string;
  attachments?: IncomingAttachment[];
}

export interface GenerateOptions {
  selectionMode?: 'auto' | 'gemini' | 'ollama';
  provider: ProviderId;
  model: string;
  messages: IncomingMessage[];
  systemInstruction?: string;
  responseMimeType?: 'application/json' | 'text/plain';
  responseSchema?: unknown;
}

export const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
]);

export class ProviderError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
  }
}

export function parseImageDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
  const match = /^data:([a-zA-Z0-9/+.-]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return null;
  const mimeType = match[1].toLowerCase();
  if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) return null;
  return { mimeType: mimeType === 'image/jpg' ? 'image/jpeg' : mimeType, data: match[2] };
}

export function hasImageAttachment(messages: IncomingMessage[]): boolean {
  return messages.some(
    (m) =>
      Array.isArray(m.attachments) &&
      m.attachments.some((a) => a.kind === 'image' && Boolean(a.imageDataUrl)),
  );
}

function extractReadableMessage(raw: string): string {
  let current = raw.trim();
  for (let depth = 0; depth < 3; depth++) {
    if (!current.startsWith('{')) break;
    try {
      const parsed = JSON.parse(current) as {
        error?: { message?: string } | string;
        message?: string;
      };
      if (typeof parsed.error === 'string' && parsed.error.trim()) {
        current = parsed.error.trim();
      } else if (typeof parsed.error === 'object' && parsed.error?.message) {
        current = parsed.error.message.trim();
      } else if (typeof parsed.message === 'string') {
        current = parsed.message.trim();
      } else {
        break;
      }
    } catch {
      break;
    }
  }
  return current;
}

function extractNumericStatus(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const candidate = err as {
    status?: unknown;
    statusCode?: unknown;
    code?: unknown;
    error?: { code?: unknown; status?: unknown };
  };
  for (const val of [
    candidate.status,
    candidate.statusCode,
    candidate.code,
    candidate.error?.code,
  ]) {
    if (typeof val === 'number' && val >= 400 && val <= 599) {
      return val;
    }
  }
  return undefined;
}

export function normalizeUpstreamError(err: unknown): ProviderError {
  if (err instanceof ProviderError) return err;
  const numericStatus = extractNumericStatus(err);
  const rawMsg =
    err instanceof Error
      ? err.message
      : err && typeof err === 'object' && typeof (err as { message?: unknown }).message === 'string'
        ? (err as { message: string }).message
        : String(err);
  const readable = extractReadableMessage(rawMsg);
  const lower = `${rawMsg} ${readable}`.toLowerCase();

  if (lower.includes('ollama is currently unavailable')) {
    return new ProviderError(
      'Ollama is currently unavailable. Please check your server connection.',
      503,
    );
  }

  if (
    lower.includes('api_key_invalid') ||
    lower.includes('api key not valid') ||
    lower.includes('invalid api key') ||
    numericStatus === 401 ||
    lower.includes('"code":401') ||
    lower.includes('unauthenticated')
  ) {
    return new ProviderError(
      'Gemini API authentication failed (HTTP 401). Please verify that GEMINI_API_KEY is valid in your server/Vercel environment variables.',
      401,
    );
  }

  if (
    numericStatus === 403 ||
    lower.includes('permission_denied') ||
    lower.includes('"code":403') ||
    lower.includes('forbidden')
  ) {
    return new ProviderError(
      `Gemini API access denied (HTTP 403): ${readable || 'Check API permissions, key restrictions, or billing status for GEMINI_API_KEY.'}`,
      403,
    );
  }

  if (
    numericStatus === 404 ||
    lower.includes('not_found') ||
    lower.includes('"code":404') ||
    lower.includes('is not found for api version')
  ) {
    return new ProviderError(
      `Gemini API model or endpoint not found (HTTP 404): ${readable || 'The requested model is unavailable for this API key or endpoint.'}`,
      404,
    );
  }

  if (
    numericStatus === 429 ||
    lower.includes('resource_exhausted') ||
    lower.includes('"code":429') ||
    lower.includes('rate limit') ||
    lower.includes('quota')
  ) {
    return new ProviderError(
      'Gemini API rate limit or quota reached (HTTP 429). Please wait a moment and click Retry.',
      429,
    );
  }

  if (
    numericStatus === 400 ||
    lower.includes('invalid_argument') ||
    lower.includes('"code":400') ||
    lower.includes('bad request')
  ) {
    return new ProviderError(
      `Gemini API rejected the request (HTTP 400): ${readable || 'Invalid request parameters or unsupported input format.'}`,
      400,
    );
  }

  if (
    numericStatus === 503 ||
    lower.includes('"code":503') ||
    lower.includes('unavailable') ||
    lower.includes('high demand') ||
    lower.includes('overloaded') ||
    lower.includes('econnrefused') ||
    lower.includes('fetch failed') ||
    lower.includes('network') ||
    lower.includes('timeout')
  ) {
    return new ProviderError(
      readable && readable.length < 220
        ? readable
        : 'The AI model is temporarily busy or unreachable (HTTP 503). Please click Retry in a moment.',
      503,
    );
  }

  if (numericStatus === 500 || lower.includes('"code":500') || lower.includes('internal')) {
    return new ProviderError(
      `AI provider encountered an internal server error (HTTP 500): ${readable || 'Please retry in a moment.'}`,
      500,
    );
  }

  return new ProviderError(
    readable || 'An unexpected error occurred while generating the AI response.',
    numericStatus && numericStatus >= 400 ? numericStatus : 500,
  );
}

export async function withRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      const normalized = normalizeUpstreamError(err);
      if (attempt < retries && (normalized.status === 429 || normalized.status === 503)) {
        attempt++;
        const delayMs = 700 * Math.pow(2, attempt - 1);
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      throw normalized;
    }
  }
}
