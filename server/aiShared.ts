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

export function normalizeUpstreamError(err: unknown): ProviderError {
  if (err instanceof ProviderError) return err;
  const rawMsg = err instanceof Error ? err.message : String(err);
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
    lower.includes('permission_denied') ||
    lower.includes('"code":401') ||
    lower.includes('"code":403') ||
    lower.includes('unauthenticated')
  ) {
    return new ProviderError(
      'AI provider authentication failed. Please check the server API key in Settings > Secrets.',
      403,
    );
  }
  if (
    lower.includes('resource_exhausted') ||
    lower.includes('"code":429') ||
    lower.includes('rate limit') ||
    lower.includes('quota')
  ) {
    return new ProviderError(
      'AI provider rate limit or quota reached. Please wait a moment and click Retry.',
      429,
    );
  }
  if (lower.includes('not_found') || lower.includes('"code":404')) {
    return new ProviderError(
      'The selected AI model is currently unavailable on the provider. Try switching models in Settings.',
      404,
    );
  }
  if (
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
        : 'The AI model is temporarily busy or unreachable. Please click Retry in a moment.',
      503,
    );
  }
  return new ProviderError(
    readable || 'An unexpected error occurred while generating the AI response.',
    500,
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
