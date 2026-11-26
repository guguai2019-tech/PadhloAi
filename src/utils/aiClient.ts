import type {
  AiSelectionMode,
  ChatAttachment,
  LanguageMode,
  ProviderConnectionState,
  ProviderId,
  ProviderStatus,
  PublicAiPolicy,
} from '../types';

export interface ClientMessage {
  role: 'user' | 'assistant';
  content: string;
  attachments?: Array<{
    name: string;
    mimeType: string;
    kind: ChatAttachment['kind'];
    extractedText?: string;
    imageDataUrl?: string;
  }>;
}

export interface ProvidersOverviewResponse {
  providers: ProviderStatus[];
  policy: PublicAiPolicy;
}

export interface AiExecutionMetadata {
  modelUsed: string;
  providerUsed: ProviderId;
  fallbackUsed?: boolean;
  fallbackFrom?: ProviderId;
  fallbackReason?: string;
}

// Synced by App.tsx so all existing AI tools respect 'Automatic (Admin Default)' seamlessly
let activeGlobalSelectionMode: AiSelectionMode = 'auto';
let fallbackEventListener: ((meta: AiExecutionMetadata) => void) | null = null;

export function setGlobalSelectionMode(mode: AiSelectionMode): void {
  activeGlobalSelectionMode = mode;
}

export function setFallbackNotificationListener(
  listener: ((meta: AiExecutionMetadata) => void) | null,
): void {
  fallbackEventListener = listener;
}

function notifyIfFallback(meta: AiExecutionMetadata): void {
  if (meta.fallbackUsed && fallbackEventListener) {
    fallbackEventListener(meta);
  }
}

export async function fetchProvidersOverview(): Promise<ProvidersOverviewResponse> {
  const res = await fetch('/api/ai/providers');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'Failed to load AI providers.');
  }
  return (await res.json()) as ProvidersOverviewResponse;
}

export async function fetchProviders(): Promise<ProviderStatus[]> {
  const data = await fetchProvidersOverview();
  return data.providers;
}

export async function refreshProvidersOverview(): Promise<ProvidersOverviewResponse> {
  const res = await fetch('/api/ai/providers/refresh', { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'Failed to refresh AI models.');
  }
  return (await res.json()) as ProvidersOverviewResponse;
}

export async function testProviderConnectionApi(provider: ProviderId): Promise<{
  ok: boolean;
  provider: ProviderId;
  connectionState: ProviderConnectionState;
  message: string;
  modelsCount: number;
}> {
  const res = await fetch('/api/ai/providers/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    provider?: ProviderId;
    connectionState?: ProviderConnectionState;
    message?: string;
    modelsCount?: number;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || 'Connection test failed.');
  }
  return {
    ok: Boolean(data.ok),
    provider: data.provider || provider,
    connectionState: data.connectionState || (data.ok ? 'connected' : 'error'),
    message: data.message || (data.ok ? 'Connected.' : 'Unavailable.'),
    modelsCount: data.modelsCount || 0,
  };
}

export interface StreamChatParams {
  selectionMode?: AiSelectionMode;
  provider: ProviderId;
  model: string;
  messages: ClientMessage[];
  language: LanguageMode;
  systemInstruction?: string;
  signal?: AbortSignal;
  onChunk: (delta: string) => void;
}

export async function streamChat(
  params: StreamChatParams,
): Promise<AiExecutionMetadata> {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), 90000);

  const combinedController = new AbortController();
  const onExternalAbort = () => combinedController.abort();
  const onTimeoutAbort = () => combinedController.abort();

  if (params.signal) {
    if (params.signal.aborted) {
      clearTimeout(timeoutId);
      throw new DOMException('Aborted', 'AbortError');
    }
    params.signal.addEventListener('abort', onExternalAbort, { once: true });
  }
  timeoutController.signal.addEventListener('abort', onTimeoutAbort, { once: true });

  const resolvedMode = params.selectionMode ?? activeGlobalSelectionMode;

  try {
    const res = await fetch('/api/ai/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: combinedController.signal,
      body: JSON.stringify({
        selectionMode: resolvedMode,
        provider: params.provider,
        model: params.model,
        messages: params.messages,
        language: params.language,
        systemInstruction: params.systemInstruction,
      }),
    });

    if (!res.ok) {
      const errData = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(errData.error || `Request failed with status ${res.status}`);
    }

    if (!res.body) {
      throw new Error('Streaming response body is unavailable.');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let modelUsed = params.model;
    let providerUsed = params.provider;
    let fallbackUsed = false;
    let fallbackFrom: ProviderId | undefined;
    let fallbackReason: string | undefined;
    let receivedChars = 0;

    const processEventBlock = (evt: string) => {
      const dataLines = evt
        .split(/\r?\n/)
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trim());
      if (dataLines.length === 0) return;
      const raw = dataLines.join('\n').trim();
      if (!raw) return;

      const parsed = JSON.parse(raw) as {
        type: 'chunk' | 'done' | 'error';
        text?: string;
        error?: string;
        modelUsed?: string;
        providerUsed?: ProviderId;
        fallbackUsed?: boolean;
        fallbackFrom?: ProviderId;
        fallbackReason?: string;
      };
      if (parsed.type === 'error') {
        throw new Error(parsed.error || 'AI provider returned an error.');
      }
      if (parsed.type === 'chunk' && parsed.text) {
        receivedChars += parsed.text.length;
        params.onChunk(parsed.text);
      }
      if (parsed.type === 'done') {
        if (parsed.modelUsed) modelUsed = parsed.modelUsed;
        if (parsed.providerUsed) providerUsed = parsed.providerUsed;
        if (parsed.fallbackUsed) {
          fallbackUsed = true;
          fallbackFrom = parsed.fallbackFrom;
          fallbackReason = parsed.fallbackReason;
        }
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() ?? '';

      for (const evt of events) {
        processEventBlock(evt);
      }
    }

    buffer += decoder.decode();
    if (buffer.trim()) {
      for (const evt of buffer.split(/\r?\n\r?\n/)) {
        if (evt.trim()) processEventBlock(evt);
      }
    }

    if (receivedChars === 0 && !params.signal?.aborted) {
      throw new Error('The AI provider returned an empty response. Please try again.');
    }

    const result: AiExecutionMetadata = {
      modelUsed,
      providerUsed,
      fallbackUsed,
      fallbackFrom,
      fallbackReason,
    };
    notifyIfFallback(result);
    return result;
  } catch (err) {
    if (timeoutController.signal.aborted && !params.signal?.aborted) {
      throw new Error('The AI request timed out after 90 seconds. Please click Retry.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
    params.signal?.removeEventListener('abort', onExternalAbort);
    timeoutController.signal.removeEventListener('abort', onTimeoutAbort);
  }
}

export interface GenerateAIParams {
  selectionMode?: AiSelectionMode;
  provider: ProviderId;
  model: string;
  prompt?: string;
  messages?: ClientMessage[];
  language: LanguageMode;
  systemInstruction?: string;
  responseMimeType?: 'application/json' | 'text/plain';
  responseSchema?: unknown;
  signal?: AbortSignal;
}

export async function generateAI(
  params: GenerateAIParams,
): Promise<AiExecutionMetadata & { text: string }> {
  const resolvedMode = params.selectionMode ?? activeGlobalSelectionMode;

  const res = await fetch('/api/ai/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: params.signal,
    body: JSON.stringify({
      selectionMode: resolvedMode,
      provider: params.provider,
      model: params.model,
      prompt: params.prompt,
      messages: params.messages,
      language: params.language,
      systemInstruction: params.systemInstruction,
      responseMimeType: params.responseMimeType,
      responseSchema: params.responseSchema,
    }),
  });

  if (!res.ok) {
    const errData = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(errData.error || `Request failed with status ${res.status}`);
  }

  const result = (await res.json()) as AiExecutionMetadata & { text: string };
  notifyIfFallback(result);
  return result;
}

export function parseSafeJson<T>(rawText: string): T {
  let cleaned = rawText.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }
  return JSON.parse(cleaned) as T;
}
