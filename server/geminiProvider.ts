import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import type { Content, Part } from '@google/genai';
import type { ProviderConnectionState } from '../src/types.ts';
import {
  normalizeUpstreamError,
  parseImageDataUrl,
  ProviderError,
  withRetry,
  type GenerateOptions,
  type IncomingMessage,
  type ServerModelInfo,
  type ServerProviderStatus,
} from './aiShared.ts';

export const GEMINI_MODELS: ServerModelInfo[] = [
  {
    id: 'gemini-4-hydrogen',
    provider: 'gemini',
    name: 'Gemini 4 Hydrogen',
    description:
      'Primary multimodal Gemini model with strong reasoning, math, coding, Odia/Hindi/English, and vision support.',
    supportsVision: true,
    supportsStreaming: true,
    supportsJson: true,
    contextWindowLabel: '1M context',
    isOpenSource: false,
  },
  {
    id: 'gemini-3.1-flash-lite',
    provider: 'gemini',
    name: 'Gemini 3.1 Flash Lite',
    description:
      'Ultra-low latency multimodal Gemini model for rapid Q&A, summaries, flashcards, and mock tests.',
    supportsVision: true,
    supportsStreaming: true,
    supportsJson: true,
    contextWindowLabel: '1M context',
    isOpenSource: false,
  },
];

export function hasGeminiApiKey(): boolean {
  const apiKey = process.env.GEMINI_API_KEY;
  return Boolean(apiKey && apiKey.trim() && apiKey !== 'MY_GEMINI_API_KEY');
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !apiKey.trim() || apiKey === 'MY_GEMINI_API_KEY') {
    throw new ProviderError(
      'Google Gemini API key is not configured on the server. Set GEMINI_API_KEY in server secrets.',
      503,
    );
  }
  return new GoogleGenAI({
    apiKey: apiKey.trim(),
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function formatMessagePartsForGemini(msg: IncomingMessage): Part[] {
  const parts: Part[] = [];
  let combinedText = msg.content || '';

  if (Array.isArray(msg.attachments)) {
    for (const att of msg.attachments) {
      if (att.kind === 'image' && att.imageDataUrl) {
        const parsed = parseImageDataUrl(att.imageDataUrl);
        if (parsed) {
          parts.push({
            inlineData: {
              mimeType: parsed.mimeType,
              data: parsed.data,
            },
          });
        }
      } else if (att.extractedText) {
        const trimmed = att.extractedText.slice(0, 60000);
        combinedText += `\n\n[Attached Document: ${att.name} (${att.kind.toUpperCase()})]\n${trimmed}\n[End of ${att.name}]`;
      }
    }
  }

  if (combinedText.trim()) {
    parts.push({ text: combinedText });
  } else if (parts.length === 0) {
    parts.push({ text: ' ' });
  }

  return parts;
}

function buildGeminiConfig(opts: GenerateOptions, targetModel: string): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  if (opts.systemInstruction) config.systemInstruction = opts.systemInstruction;
  if (opts.responseMimeType) config.responseMimeType = opts.responseMimeType;
  if (opts.responseSchema) config.responseSchema = opts.responseSchema;
  if (targetModel === 'gemini-4-hydrogen') {
    config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
  }
  return config;
}

export function getGeminiStatus(
  enabled: boolean,
  disabledModelKeys: Set<string>,
): ServerProviderStatus {
  const configured = hasGeminiApiKey();
  const models: ServerModelInfo[] = GEMINI_MODELS.map((m) => ({
    ...m,
    enabled: enabled && !disabledModelKeys.has(`gemini::${m.id}`),
  }));
  const anyModelEnabled = models.some((m) => m.enabled);

  let connectionState: ProviderConnectionState = 'connected';
  let statusMessage = 'Connected and ready via server-side Gemini API key.';
  if (!enabled) {
    connectionState = 'disabled';
    statusMessage = 'Google Gemini has been disabled by Administrator.';
  } else if (!configured) {
    connectionState = 'error';
    statusMessage = 'Server GEMINI_API_KEY is missing. Configure it in server Secrets.';
  } else if (!anyModelEnabled) {
    connectionState = 'no-models';
    statusMessage = 'All Gemini models are currently disabled by Administrator.';
  }

  return {
    id: 'gemini',
    name: 'Google Gemini',
    description: 'Cloud multimodal AI engine powered by server-side Gemini API credentials.',
    enabled,
    configured,
    available: enabled && configured && anyModelEnabled,
    connectionState,
    statusMessage,
    endpointLabel: 'Google Generative Language API (Server-Side)',
    models,
  };
}

export async function testGeminiConnection(): Promise<{
  ok: boolean;
  connectionState: ProviderConnectionState;
  message: string;
  modelsCount: number;
}> {
  if (!hasGeminiApiKey()) {
    return {
      ok: false,
      connectionState: 'error',
      message: 'Server GEMINI_API_KEY is missing. Configure it in server Secrets.',
      modelsCount: 0,
    };
  }

  try {
    const ai = getGeminiClient();
    const res = await Promise.race([
      ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: [{ role: 'user', parts: [{ text: 'Reply with OK.' }] }],
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new ProviderError('Gemini connection test timed out.', 503)), 8000),
      ),
    ]);
    if (res.text !== undefined) {
      return {
        ok: true,
        connectionState: 'connected',
        message: 'Google Gemini API connection verified successfully.',
        modelsCount: GEMINI_MODELS.length,
      };
    }
    return {
      ok: false,
      connectionState: 'error',
      message: 'Google Gemini responded with an empty response.',
      modelsCount: GEMINI_MODELS.length,
    };
  } catch (err) {
    const norm = normalizeUpstreamError(err);
    return {
      ok: false,
      connectionState: 'error',
      message: norm.message,
      modelsCount: 0,
    };
  }
}

export async function generateGeminiCompletion(
  opts: GenerateOptions,
  resolvedModel: string,
  allowedModelIds: Set<string>,
): Promise<{ text: string; modelUsed: string; providerUsed: 'gemini' }> {
  const ai = getGeminiClient();
  const contents: Content[] = opts.messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: formatMessagePartsForGemini(m),
  }));

  const callModel = async (targetModel: string, retries: number, timeoutMs?: number) => {
    const invoke = () =>
      ai.models.generateContent({
        model: targetModel,
        contents,
        config: buildGeminiConfig(opts, targetModel),
      });

    const response = await withRetry(
      () =>
        timeoutMs
          ? Promise.race([
              invoke(),
              new Promise<never>((_, reject) =>
                setTimeout(
                  () => reject(new ProviderError(`${targetModel} response timeout`, 503)),
                  timeoutMs,
                ),
              ),
            ])
          : invoke(),
      retries,
    );
    return {
      text: response.text ?? '',
      modelUsed: targetModel,
      providerUsed: 'gemini' as const,
    };
  };

  try {
    const canLiteBackup =
      resolvedModel !== 'gemini-3.1-flash-lite' && allowedModelIds.has('gemini-3.1-flash-lite');
    return await callModel(resolvedModel, canLiteBackup ? 0 : 2, canLiteBackup ? 8000 : 45000);
  } catch (err) {
    const norm = normalizeUpstreamError(err);
    if (
      (norm.status === 503 || norm.status === 429) &&
      resolvedModel !== 'gemini-3.1-flash-lite' &&
      allowedModelIds.has('gemini-3.1-flash-lite')
    ) {
      return await callModel('gemini-3.1-flash-lite', 2, 45000);
    }
    throw norm;
  }
}

export async function streamGeminiCompletion(
  opts: GenerateOptions,
  resolvedModel: string,
  allowedModelIds: Set<string>,
  onChunk: (text: string) => void,
  signal: AbortSignal,
): Promise<{ modelUsed: string; providerUsed: 'gemini' }> {
  const ai = getGeminiClient();
  const contents: Content[] = opts.messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: formatMessagePartsForGemini(m),
  }));

  const streamModel = async (targetModel: string, retries: number, firstByteTimeoutMs?: number) => {
    const invokeStream = () =>
      ai.models.generateContentStream({
        model: targetModel,
        contents,
        config: buildGeminiConfig(opts, targetModel),
      });

    const stream = await withRetry(
      () =>
        firstByteTimeoutMs
          ? Promise.race([
              invokeStream(),
              new Promise<never>((_, reject) =>
                setTimeout(
                  () => reject(new ProviderError(`${targetModel} stream timeout`, 503)),
                  firstByteTimeoutMs,
                ),
              ),
            ])
          : invokeStream(),
      retries,
    );

    let emittedChars = 0;
    const iterator = stream[Symbol.asyncIterator]();
    while (true) {
      if (signal.aborted) break;
      const nextPromise = iterator.next();
      const nextResult =
        emittedChars === 0 && firstByteTimeoutMs
          ? await Promise.race([
              nextPromise,
              new Promise<never>((_, reject) =>
                setTimeout(
                  () => reject(new ProviderError(`${targetModel} first chunk timeout`, 503)),
                  firstByteTimeoutMs,
                ),
              ),
            ])
          : await nextPromise;

      if (nextResult.done) break;
      const chunk = nextResult.value;
      if (chunk.text) {
        emittedChars += chunk.text.length;
        onChunk(chunk.text);
      }
    }

    if (!signal.aborted && emittedChars === 0) {
      throw new ProviderError('The AI model returned an empty response. Please try again.', 502);
    }
    return { modelUsed: targetModel, providerUsed: 'gemini' as const };
  };

  try {
    const canLiteBackup =
      resolvedModel !== 'gemini-3.1-flash-lite' && allowedModelIds.has('gemini-3.1-flash-lite');
    return await streamModel(resolvedModel, canLiteBackup ? 0 : 2, canLiteBackup ? 7000 : undefined);
  } catch (err) {
    const norm = normalizeUpstreamError(err);
    if (
      !signal.aborted &&
      (norm.status === 503 || norm.status === 429) &&
      resolvedModel !== 'gemini-3.1-flash-lite' &&
      allowedModelIds.has('gemini-3.1-flash-lite')
    ) {
      return await streamModel('gemini-3.1-flash-lite', 2);
    }
    throw norm;
  }
}
