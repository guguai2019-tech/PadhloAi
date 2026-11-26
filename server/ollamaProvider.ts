import type { ProviderConnectionState } from '../src/types.ts';
import {
  parseImageDataUrl,
  ProviderError,
  type GenerateOptions,
  type IncomingMessage,
  type ServerModelInfo,
  type ServerProviderStatus,
} from './aiShared.ts';

export const OLLAMA_UNAVAILABLE_MESSAGE =
  'Ollama is currently unavailable. Please check your server connection.';

const DEFAULT_LOCAL_OLLAMA_URL = 'http://127.0.0.1:11434';

interface OllamaTagModel {
  name: string;
  model?: string;
  size?: number;
  details?: {
    family?: string;
    families?: string[] | null;
    parameter_size?: string;
    quantization_level?: string;
  };
}

interface OllamaTagsResponse {
  models?: OllamaTagModel[];
}

interface OllamaShowResponse {
  capabilities?: string[];
  details?: {
    family?: string;
    families?: string[] | null;
    parameter_size?: string;
  };
  model_info?: Record<string, unknown>;
}

export function isCloudDeploymentEnv(): boolean {
  return Boolean(
    process.env.K_SERVICE ||
      process.env.CLOUD_RUN_JOB ||
      process.env.VERCEL ||
      process.env.RENDER ||
      process.env.FLY_APP_NAME ||
      (process.env.APP_URL && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(process.env.APP_URL)),
  );
}

export function validateOllamaUrl(raw: string | undefined): string | null {
  if (!raw || !raw.trim()) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }
  if (parsed.username || parsed.password) {
    return null;
  }
  let normalized = parsed.toString().replace(/\/+$/, '');
  // Normalize accidental OpenAI/API suffixes back to Ollama base host
  normalized = normalized.replace(/\/(v1|api)$/i, '');
  return normalized;
}

export function resolveEffectiveOllamaUrl(adminOverrideUrl?: string): {
  url: string;
  source: 'admin' | 'env' | 'default';
  endpointType: 'localhost' | 'remote';
} {
  const adminValid = validateOllamaUrl(adminOverrideUrl);
  if (adminValid) {
    return {
      url: adminValid,
      source: 'admin',
      endpointType: isLocalhostUrl(adminValid) ? 'localhost' : 'remote',
    };
  }
  const envValid = validateOllamaUrl(process.env.OLLAMA_BASE_URL);
  if (envValid) {
    return {
      url: envValid,
      source: 'env',
      endpointType: isLocalhostUrl(envValid) ? 'localhost' : 'remote',
    };
  }
  return {
    url: DEFAULT_LOCAL_OLLAMA_URL,
    source: 'default',
    endpointType: 'localhost',
  };
}

export function isLocalhostUrl(urlStr: string): boolean {
  try {
    const host = new URL(urlStr).hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    return false;
  }
}

export function hasOllamaApiKey(): boolean {
  return Boolean(process.env.OLLAMA_API_KEY && process.env.OLLAMA_API_KEY.trim().length > 0);
}

function getOllamaHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const key = process.env.OLLAMA_API_KEY?.trim();
  if (key) {
    headers.Authorization = `Bearer ${key}`;
  }
  return headers;
}

function formatByteSize(bytes?: number): string | undefined {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return undefined;
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${Math.round(mb)} MB`;
}

function inferVisionFromMetadata(modelName: string, showData?: OllamaShowResponse | null, tag?: OllamaTagModel): boolean {
  if (Array.isArray(showData?.capabilities)) {
    if (showData.capabilities.some((c) => c.toLowerCase() === 'vision')) {
      return true;
    }
  }
  const families = [
    ...(tag?.details?.families || []),
    ...(showData?.details?.families || []),
    tag?.details?.family || '',
    showData?.details?.family || '',
  ]
    .join(' ')
    .toLowerCase();

  if (/clip|mllama|vision|vl/i.test(families)) {
    return true;
  }
  return /llava|vision|llama3\.2-vision|qwen2\.5vl|qwen2-vl|minicpm-v|moondream|pixtral|bakllava|granite3\.2-vision/i.test(
    modelName,
  );
}

function extractContextLabel(showData?: OllamaShowResponse | null, tag?: OllamaTagModel): string {
  const paramSize = tag?.details?.parameter_size || showData?.details?.parameter_size;
  if (showData?.model_info) {
    for (const [k, v] of Object.entries(showData.model_info)) {
      if (k.endsWith('.context_length') && typeof v === 'number' && v > 0) {
        const kTokens = v >= 1024 ? `${Math.round(v / 1024)}K ctx` : `${v} ctx`;
        return paramSize ? `${paramSize} · ${kTokens}` : kTokens;
      }
    }
  }
  return paramSize ? `${paramSize} · Local` : 'Local Ollama';
}

async function fetchOllamaShow(baseUrl: string, modelName: string): Promise<OllamaShowResponse | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1200);
    const res = await fetch(`${baseUrl}/api/show`, {
      method: 'POST',
      headers: getOllamaHeaders(),
      body: JSON.stringify({ model: modelName }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return (await res.json()) as OllamaShowResponse;
  } catch {
    return null;
  }
}

export async function discoverOllamaModels(
  baseUrl: string,
  disabledModelKeys?: Set<string>,
  providerEnabled = true,
): Promise<{
  ok: boolean;
  connectionState: ProviderConnectionState;
  statusMessage: string;
  models: ServerModelInfo[];
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    const res = await fetch(`${baseUrl}/api/tags`, {
      method: 'GET',
      headers: getOllamaHeaders(),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return {
        ok: false,
        connectionState: 'error',
        statusMessage:
          res.status === 401 || res.status === 403
            ? `Ollama authentication failed (HTTP ${res.status}). Check OLLAMA_API_KEY in server secrets.`
            : `Ollama endpoint responded with HTTP ${res.status}${errText ? `: ${errText.slice(0, 120)}` : ''}.`,
        models: [],
      };
    }

    const data = (await res.json()) as OllamaTagsResponse;
    const rawModels = Array.isArray(data?.models) ? data.models : [];

    if (rawModels.length === 0) {
      return {
        ok: false,
        connectionState: 'no-models',
        statusMessage:
          'Connected to Ollama, but no models are installed. Pull a model (e.g., "ollama pull llama3.2") and click Refresh Models.',
        models: [],
      };
    }

    const inspected = await Promise.all(
      rawModels.slice(0, 24).map(async (m, idx) => {
        const id = (m.name || m.model || '').trim();
        const showData = idx < 10 ? await fetchOllamaShow(baseUrl, id) : null;
        const supportsVision = inferVisionFromMetadata(id, showData, m);
        const sizeLabel = formatByteSize(m.size);
        const family = m.details?.family || showData?.details?.family;
        const enabled = providerEnabled && !(disabledModelKeys?.has(`ollama::${id}`) ?? false);

        const modelInfo: ServerModelInfo = {
          id,
          provider: 'ollama',
          name: id,
          description: `Installed Ollama model${family ? ` (${family})` : ''}${sizeLabel ? ` · ${sizeLabel}` : ''}.`,
          supportsVision,
          supportsStreaming: true,
          supportsJson: true,
          contextWindowLabel: extractContextLabel(showData, m),
          isOpenSource: true,
          enabled,
          sizeLabel,
          family,
        };
        return modelInfo;
      }),
    );

    const validModels = inspected.filter((m) => Boolean(m.id));
    if (validModels.length === 0) {
      return {
        ok: false,
        connectionState: 'no-models',
        statusMessage:
          'Connected to Ollama, but no usable models were returned. Run "ollama pull llama3.2" and refresh.',
        models: [],
      };
    }

    return {
      ok: true,
      connectionState: 'connected',
      statusMessage: `Connected to Ollama (${validModels.length} model${validModels.length === 1 ? '' : 's'} discovered).`,
      models: validModels,
    };
  } catch {
    clearTimeout(timeout);
    return {
      ok: false,
      connectionState: 'disconnected',
      statusMessage: OLLAMA_UNAVAILABLE_MESSAGE,
      models: [],
    };
  }
}

export async function getOllamaStatus(
  enabled: boolean,
  adminOverrideUrl: string,
  disabledModelKeys: Set<string>,
): Promise<ServerProviderStatus> {
  const resolved = resolveEffectiveOllamaUrl(adminOverrideUrl);
  const endpointLabel = resolved.url;

  if (!enabled) {
    return {
      id: 'ollama',
      name: 'Ollama Local Open-Source AI',
      description: 'Run open-source models locally or over a configured Ollama host (Llama 3.2, Qwen, Mistral, Gemma).',
      enabled: false,
      configured: true,
      available: false,
      connectionState: 'disabled',
      statusMessage: 'Ollama Local AI has been disabled by Administrator.',
      endpointLabel,
      models: [],
    };
  }

  const discovery = await discoverOllamaModels(resolved.url, disabledModelKeys, enabled);
  const anyEnabledModel = discovery.models.some((m) => m.enabled !== false);

  return {
    id: 'ollama',
    name: 'Ollama Local Open-Source AI',
    description: 'Run open-source models locally or over a configured Ollama host (Llama 3.2, Qwen, Mistral, Gemma).',
    enabled: true,
    configured: true,
    available: discovery.ok && anyEnabledModel,
    connectionState:
      discovery.ok && !anyEnabledModel ? 'no-models' : discovery.connectionState,
    statusMessage:
      discovery.ok && !anyEnabledModel
        ? 'Ollama is connected, but all discovered models are disabled by Administrator.'
        : discovery.statusMessage,
    endpointLabel,
    models: discovery.models,
  };
}

export async function testOllamaConnection(candidateUrl?: string): Promise<{
  ok: boolean;
  connectionState: ProviderConnectionState;
  message: string;
  modelsCount: number;
  testedUrl: string;
}> {
  if (candidateUrl !== undefined && candidateUrl.trim() !== '') {
    const valid = validateOllamaUrl(candidateUrl);
    if (!valid) {
      return {
        ok: false,
        connectionState: 'error',
        message: 'Invalid Ollama URL. Must be a valid http:// or https:// URL without embedded credentials.',
        modelsCount: 0,
        testedUrl: candidateUrl.trim(),
      };
    }
    const discovery = await discoverOllamaModels(valid);
    return {
      ok: discovery.ok,
      connectionState: discovery.connectionState,
      message: discovery.statusMessage,
      modelsCount: discovery.models.length,
      testedUrl: valid,
    };
  }

  const resolved = resolveEffectiveOllamaUrl();
  const discovery = await discoverOllamaModels(resolved.url);
  return {
    ok: discovery.ok,
    connectionState: discovery.connectionState,
    message: discovery.statusMessage,
    modelsCount: discovery.models.length,
    testedUrl: resolved.url,
  };
}

function buildOllamaMessages(
  messages: IncomingMessage[],
  systemInstruction?: string,
  includeImages = false,
): Array<{ role: 'system' | 'user' | 'assistant'; content: string; images?: string[] }> {
  const out: Array<{ role: 'system' | 'user' | 'assistant'; content: string; images?: string[] }> = [];
  if (systemInstruction) {
    out.push({ role: 'system', content: systemInstruction });
  }

  for (const m of messages) {
    const textParts: string[] = [];
    if (m.content) textParts.push(m.content);
    const images: string[] = [];

    if (Array.isArray(m.attachments)) {
      for (const att of m.attachments) {
        if (att.kind === 'image' && att.imageDataUrl && includeImages) {
          const parsed = parseImageDataUrl(att.imageDataUrl);
          if (parsed) images.push(parsed.data);
        } else if (att.extractedText) {
          textParts.push(
            `[Attached Document: ${att.name} (${att.kind.toUpperCase()})]\n${att.extractedText.slice(0, 60000)}\n[End of ${att.name}]`,
          );
        }
      }
    }

    const msgObj: { role: 'user' | 'assistant'; content: string; images?: string[] } = {
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: textParts.join('\n\n') || (images.length > 0 ? 'Please analyze the attached image.' : ' '),
    };
    if (images.length > 0) {
      msgObj.images = images;
    }
    out.push(msgObj);
  }

  return out;
}

export async function generateOllamaCompletion(
  baseUrl: string,
  resolvedModel: string,
  opts: GenerateOptions,
  supportsVision: boolean,
): Promise<{ text: string; modelUsed: string; providerUsed: 'ollama' }> {
  const messages = buildOllamaMessages(opts.messages, opts.systemInstruction, supportsVision);
  const body: Record<string, unknown> = {
    model: resolvedModel,
    messages,
    stream: false,
  };
  if (opts.responseMimeType === 'application/json') {
    body.format = 'json';
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);

  try {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: getOllamaHeaders(),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      if (res.status === 404) {
        throw new ProviderError(
          `Ollama model "${resolvedModel}" was not found on the server. Pull it or refresh installed models.`,
          404,
        );
      }
      throw new ProviderError(
        `Ollama returned HTTP ${res.status}${errText ? `: ${errText.slice(0, 180)}` : ''}`,
        res.status >= 500 ? 503 : res.status,
      );
    }

    const data = (await res.json()) as { message?: { content?: string }; response?: string; error?: string };
    if (data.error) {
      throw new ProviderError(`Ollama error: ${data.error}`, 502);
    }
    const text = data.message?.content ?? data.response ?? '';
    if (!text.trim()) {
      throw new ProviderError('Ollama returned an empty response. Please try again.', 502);
    }
    return {
      text,
      modelUsed: resolvedModel,
      providerUsed: 'ollama',
    };
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof ProviderError) throw err;
    throw new ProviderError(OLLAMA_UNAVAILABLE_MESSAGE, 503);
  }
}

export async function streamOllamaCompletion(
  baseUrl: string,
  resolvedModel: string,
  opts: GenerateOptions,
  supportsVision: boolean,
  onChunk: (text: string) => void,
  signal: AbortSignal,
): Promise<{ modelUsed: string; providerUsed: 'ollama' }> {
  const messages = buildOllamaMessages(opts.messages, opts.systemInstruction, supportsVision);
  const body: Record<string, unknown> = {
    model: resolvedModel,
    messages,
    stream: true,
  };

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: getOllamaHeaders(),
      signal,
      body: JSON.stringify(body),
    });
  } catch (err) {
    if (signal.aborted) throw err;
    throw new ProviderError(OLLAMA_UNAVAILABLE_MESSAGE, 503);
  }

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => '');
    if (res.status === 404) {
      throw new ProviderError(
        `Ollama model "${resolvedModel}" was not found on the server. Refresh models or pull it.`,
        404,
      );
    }
    throw new ProviderError(
      `Ollama returned HTTP ${res.status}${errText ? `: ${errText.slice(0, 180)}` : ''}`,
      res.status >= 500 ? 503 : res.status,
    );
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let emittedChars = 0;

  while (!signal.aborted) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const json = JSON.parse(trimmed) as {
          message?: { content?: string };
          response?: string;
          done?: boolean;
          error?: string;
        };
        if (json.error) {
          throw new ProviderError(`Ollama error: ${json.error}`, 502);
        }
        const delta = json.message?.content ?? json.response ?? '';
        if (delta) {
          emittedChars += delta.length;
          onChunk(delta);
        }
        if (json.done) {
          return { modelUsed: resolvedModel, providerUsed: 'ollama' };
        }
      } catch (err) {
        if (err instanceof ProviderError) throw err;
        // Ignore partial NDJSON fragments
      }
    }
  }

  if (buffer.trim() && !signal.aborted) {
    try {
      const json = JSON.parse(buffer.trim()) as {
        message?: { content?: string };
        response?: string;
        error?: string;
      };
      if (json.error) throw new ProviderError(`Ollama error: ${json.error}`, 502);
      const delta = json.message?.content ?? json.response ?? '';
      if (delta) {
        emittedChars += delta.length;
        onChunk(delta);
      }
    } catch (err) {
      if (err instanceof ProviderError) throw err;
    }
  }

  if (!signal.aborted && emittedChars === 0) {
    throw new ProviderError('Ollama returned an empty response. Please try again.', 502);
  }

  return { modelUsed: resolvedModel, providerUsed: 'ollama' };
}
