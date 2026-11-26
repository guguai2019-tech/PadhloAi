import type {
  AdminAiConfig,
  AdminAiOverview,
  AiSelectionMode,
  ProviderId,
  PublicAiPolicy,
} from '../src/types.ts';
import { getAiConfig, updateAiConfig } from './db.ts';
import {
  hasImageAttachment,
  normalizeUpstreamError,
  ProviderError,
  type GenerateOptions,
  type ServerModelInfo,
  type ServerProviderStatus,
} from './aiShared.ts';
import {
  generateGeminiCompletion,
  getGeminiStatus,
  hasGeminiApiKey,
  streamGeminiCompletion,
  testGeminiConnection,
} from './geminiProvider.ts';
import {
  generateOllamaCompletion,
  getOllamaStatus,
  hasOllamaApiKey,
  isCloudDeploymentEnv,
  OLLAMA_UNAVAILABLE_MESSAGE,
  resolveEffectiveOllamaUrl,
  streamOllamaCompletion,
  testOllamaConnection,
  validateOllamaUrl,
} from './ollamaProvider.ts';

export type { ProviderId } from '../src/types.ts';
export {
  normalizeUpstreamError,
  ProviderError,
  type GenerateOptions,
  type IncomingAttachment,
  type IncomingMessage,
  type ServerModelInfo,
  type ServerProviderStatus,
} from './aiShared.ts';

export interface ExecutionResultMetadata {
  modelUsed: string;
  providerUsed: ProviderId;
  fallbackUsed: boolean;
  fallbackFrom?: ProviderId;
  fallbackReason?: string;
}

export interface GenerateCompletionResult extends ExecutionResultMetadata {
  text: string;
}

function buildDisabledSet(config: AdminAiConfig): Set<string> {
  return new Set(config.disabledModels || []);
}

export async function getAllProvidersRawStatus(
  config: AdminAiConfig = getAiConfig(),
): Promise<ServerProviderStatus[]> {
  const disabledSet = buildDisabledSet(config);
  const [gemini, ollama] = await Promise.all([
    Promise.resolve(getGeminiStatus(config.geminiEnabled, disabledSet)),
    getOllamaStatus(config.ollamaEnabled, config.ollamaBaseUrl, disabledSet),
  ]);
  return [gemini, ollama];
}

export async function getPublicProvidersOverview(): Promise<{
  providers: ServerProviderStatus[];
  policy: PublicAiPolicy;
}> {
  const config = getAiConfig();
  const rawProviders = await getAllProvidersRawStatus(config);
  const resolvedOllama = resolveEffectiveOllamaUrl(config.ollamaBaseUrl);

  // Student-facing catalog strictly omits disabled models & clears models when a provider is disabled
  const studentProviders: ServerProviderStatus[] = rawProviders.map((prov) => ({
    ...prov,
    // Keep endpointLabel safe for students (only mention localhost vs remote without leaking custom internal proxy paths if desired; show cleanly)
    endpointLabel:
      prov.id === 'ollama'
        ? resolvedOllama.endpointType === 'localhost'
          ? 'Local Ollama Host (127.0.0.1:11434)'
          : 'Configured Remote Ollama Endpoint'
        : prov.endpointLabel,
    models: prov.enabled ? prov.models.filter((m) => m.enabled !== false) : [],
  }));

  const policy: PublicAiPolicy = {
    defaultProvider: config.defaultProvider,
    backupProvider: config.backupProvider,
    fallbackEnabled: config.fallbackEnabled,
    geminiEnabled: config.geminiEnabled,
    ollamaEnabled: config.ollamaEnabled,
    ollamaUrlConfigured: Boolean(config.ollamaBaseUrl || process.env.OLLAMA_BASE_URL),
    ollamaEndpointType: resolvedOllama.endpointType,
    isCloudDeployment: isCloudDeploymentEnv(),
  };

  return { providers: studentProviders, policy };
}

export async function getProvidersStatus(): Promise<ServerProviderStatus[]> {
  const { providers } = await getPublicProvidersOverview();
  return providers;
}

export async function getAdminAiOverview(): Promise<AdminAiOverview> {
  const config = getAiConfig();
  const rawProviders = await getAllProvidersRawStatus(config);
  const resolvedOllama = resolveEffectiveOllamaUrl(config.ollamaBaseUrl);
  return {
    config,
    effectiveOllamaBaseUrl: resolvedOllama.url,
    hasGeminiKey: hasGeminiApiKey(),
    hasOllamaApiKey: hasOllamaApiKey(),
    isCloudDeployment: isCloudDeploymentEnv(),
    providers: rawProviders,
  };
}

export function saveAdminAiConfig(patch: Partial<AdminAiConfig>): AdminAiConfig {
  const current = getAiConfig();
  const next: Partial<AdminAiConfig> = {};

  if (typeof patch.geminiEnabled === 'boolean') next.geminiEnabled = patch.geminiEnabled;
  if (typeof patch.ollamaEnabled === 'boolean') next.ollamaEnabled = patch.ollamaEnabled;
  if (patch.defaultProvider === 'gemini' || patch.defaultProvider === 'ollama') {
    next.defaultProvider = patch.defaultProvider;
  }
  if (
    patch.backupProvider === 'gemini' ||
    patch.backupProvider === 'ollama' ||
    patch.backupProvider === 'none'
  ) {
    next.backupProvider = patch.backupProvider;
  }
  if (typeof patch.fallbackEnabled === 'boolean') {
    next.fallbackEnabled = patch.fallbackEnabled;
  }
  if (typeof patch.ollamaBaseUrl === 'string') {
    const trimmed = patch.ollamaBaseUrl.trim();
    if (trimmed === '') {
      next.ollamaBaseUrl = '';
    } else {
      const valid = validateOllamaUrl(trimmed);
      if (!valid) {
        throw new ProviderError(
          'Invalid Ollama Server URL. Use a valid http:// or https:// URL without embedded credentials.',
          400,
        );
      }
      next.ollamaBaseUrl = valid;
    }
  }
  if (Array.isArray(patch.disabledModels)) {
    next.disabledModels = patch.disabledModels
      .filter((x): x is string => typeof x === 'string' && x.includes('::'))
      .slice(0, 200);
  }

  // Ensure defaultProvider is coherent if one provider is disabled
  const finalGemini = next.geminiEnabled ?? current.geminiEnabled;
  const finalOllama = next.ollamaEnabled ?? current.ollamaEnabled;
  const finalDefault = next.defaultProvider ?? current.defaultProvider;
  if (!finalGemini && !finalOllama) {
    throw new ProviderError('At least one AI provider (Gemini or Ollama) must remain enabled.', 400);
  }
  if (finalDefault === 'gemini' && !finalGemini) {
    next.defaultProvider = 'ollama';
  } else if (finalDefault === 'ollama' && !finalOllama) {
    next.defaultProvider = 'gemini';
  }

  return updateAiConfig(next);
}

export async function testProviderConnection(
  provider: ProviderId,
  candidateOllamaUrl?: string,
): Promise<{
  ok: boolean;
  provider: ProviderId;
  connectionState: string;
  message: string;
  modelsCount: number;
}> {
  if (provider === 'ollama') {
    const config = getAiConfig();
    const urlToTest =
      candidateOllamaUrl !== undefined
        ? candidateOllamaUrl
        : resolveEffectiveOllamaUrl(config.ollamaBaseUrl).url;
    const res = await testOllamaConnection(urlToTest);
    return {
      ok: res.ok,
      provider: 'ollama',
      connectionState: res.connectionState,
      message: res.message,
      modelsCount: res.modelsCount,
    };
  }
  const res = await testGeminiConnection();
  return {
    ok: res.ok,
    provider: 'gemini',
    connectionState: res.connectionState,
    message: res.message,
    modelsCount: res.modelsCount,
  };
}

function selectTargetForProvider(
  provStatus: ServerProviderStatus,
  requestedModel: string | undefined,
  requireVision: boolean,
  strictModelMatch: boolean,
): { model: ServerModelInfo; allowedIds: Set<string> } {
  if (!provStatus.enabled) {
    throw new ProviderError(
      `${provStatus.name} is currently disabled by Administrator. Choose another enabled provider.`,
      403,
    );
  }

  const enabledModels = provStatus.models.filter((m) => m.enabled !== false);
  const allowedIds = new Set(enabledModels.map((m) => m.id));

  if (!provStatus.available || enabledModels.length === 0) {
    if (provStatus.id === 'ollama') {
      throw new ProviderError(
        provStatus.connectionState === 'disconnected'
          ? OLLAMA_UNAVAILABLE_MESSAGE
          : provStatus.statusMessage,
        503,
      );
    }
    throw new ProviderError(provStatus.statusMessage || `${provStatus.name} is currently unavailable.`, 503);
  }

  const trimmedReq = (requestedModel || '').trim();
  let chosen: ServerModelInfo | undefined;

  if (trimmedReq) {
    chosen = enabledModels.find((m) => m.id === trimmedReq);
    if (!chosen && strictModelMatch) {
      const existsButDisabled = provStatus.models.find((m) => m.id === trimmedReq);
      if (existsButDisabled) {
        throw new ProviderError(
          `Model "${trimmedReq}" on ${provStatus.name} has been disabled by Administrator.`,
          403,
        );
      }
      throw new ProviderError(
        `Model "${trimmedReq}" is not available on ${provStatus.name}. Refresh models or pick an available model.`,
        400,
      );
    }
  }

  if (!chosen) {
    chosen =
      (requireVision ? enabledModels.find((m) => m.supportsVision) : undefined) ||
      enabledModels[0];
  }

  if (requireVision && !chosen.supportsVision) {
    throw new ProviderError(
      `The selected model (${chosen.name}) does not support image inputs. Please switch to a vision-capable model such as Gemini 4 Hydrogen or an Ollama vision model.`,
      400,
    );
  }

  return { model: chosen, allowedIds };
}

function getBackupTarget(
  rawProviders: ServerProviderStatus[],
  config: AdminAiConfig,
  primaryProvider: ProviderId,
  requireVision: boolean,
): { provider: ProviderId; model: ServerModelInfo; allowedIds: Set<string> } | null {
  if (!config.fallbackEnabled) return null;
  if (config.backupProvider === 'none' || config.backupProvider === primaryProvider) return null;
  const backupStatus = rawProviders.find((p) => p.id === config.backupProvider);
  if (!backupStatus || !backupStatus.enabled || !backupStatus.available) return null;
  const enabledModels = backupStatus.models.filter((m) => m.enabled !== false);
  const matching = requireVision
    ? enabledModels.find((m) => m.supportsVision)
    : enabledModels[0];
  if (!matching) return null;
  return {
    provider: backupStatus.id,
    model: matching,
    allowedIds: new Set(enabledModels.map((m) => m.id)),
  };
}

function isFallbackEligibleError(err: ProviderError): boolean {
  // Never fallback on user validation errors (400 vision error) or Admin disabled (403 explicit block except API key failure)
  return err.status >= 500 || err.status === 429 || err.status === 404;
}

export async function generateCompletion(
  opts: GenerateOptions,
): Promise<GenerateCompletionResult> {
  const config = getAiConfig();
  const rawProviders = await getAllProvidersRawStatus(config);
  const requireVision = hasImageAttachment(opts.messages);
  const mode: AiSelectionMode = opts.selectionMode || (opts.provider === 'ollama' ? 'ollama' : 'gemini');

  const primaryProviderId: ProviderId =
    mode === 'auto' ? config.defaultProvider : opts.provider;
  const primaryStatus = rawProviders.find((p) => p.id === primaryProviderId)!;
  const effectiveOllama = resolveEffectiveOllamaUrl(config.ollamaBaseUrl).url;

  const invokeProvider = async (
    provId: ProviderId,
    modelId: string,
    allowedIds: Set<string>,
    supportsVision: boolean,
  ): Promise<{ text: string; modelUsed: string; providerUsed: ProviderId }> => {
    if (provId === 'gemini') {
      return await generateGeminiCompletion(opts, modelId, allowedIds);
    }
    return await generateOllamaCompletion(effectiveOllama, modelId, opts, supportsVision);
  };

  let primaryPlan: { model: ServerModelInfo; allowedIds: Set<string> } | null = null;
  try {
    primaryPlan = selectTargetForProvider(
      primaryStatus,
      opts.model,
      requireVision,
      mode !== 'auto',
    );
    const res = await invokeProvider(
      primaryProviderId,
      primaryPlan.model.id,
      primaryPlan.allowedIds,
      primaryPlan.model.supportsVision,
    );
    return {
      ...res,
      fallbackUsed: false,
    };
  } catch (err) {
    const norm = normalizeUpstreamError(err);
    if (!isFallbackEligibleError(norm)) {
      throw norm;
    }
    const backup = getBackupTarget(rawProviders, config, primaryProviderId, requireVision);
    if (!backup) {
      throw norm;
    }
    console.warn(
      `[PadhloAI] Primary provider "${primaryProviderId}" failed (${norm.message}). Falling back to "${backup.provider}" (${backup.model.id}).`,
    );
    const fallbackRes = await invokeProvider(
      backup.provider,
      backup.model.id,
      backup.allowedIds,
      backup.model.supportsVision,
    );
    return {
      ...fallbackRes,
      fallbackUsed: true,
      fallbackFrom: primaryProviderId,
      fallbackReason: norm.message,
    };
  }
}

export async function streamCompletion(
  opts: GenerateOptions,
  onChunk: (text: string) => void,
  signal: AbortSignal,
): Promise<ExecutionResultMetadata> {
  const config = getAiConfig();
  const rawProviders = await getAllProvidersRawStatus(config);
  const requireVision = hasImageAttachment(opts.messages);
  const mode: AiSelectionMode = opts.selectionMode || (opts.provider === 'ollama' ? 'ollama' : 'gemini');

  const primaryProviderId: ProviderId =
    mode === 'auto' ? config.defaultProvider : opts.provider;
  const primaryStatus = rawProviders.find((p) => p.id === primaryProviderId)!;
  const effectiveOllama = resolveEffectiveOllamaUrl(config.ollamaBaseUrl).url;

  const invokeStream = async (
    provId: ProviderId,
    modelId: string,
    allowedIds: Set<string>,
    supportsVision: boolean,
  ): Promise<{ modelUsed: string; providerUsed: ProviderId }> => {
    if (provId === 'gemini') {
      return await streamGeminiCompletion(opts, modelId, allowedIds, onChunk, signal);
    }
    return await streamOllamaCompletion(
      effectiveOllama,
      modelId,
      opts,
      supportsVision,
      onChunk,
      signal,
    );
  };

  try {
    const primaryPlan = selectTargetForProvider(
      primaryStatus,
      opts.model,
      requireVision,
      mode !== 'auto',
    );
    const res = await invokeStream(
      primaryProviderId,
      primaryPlan.model.id,
      primaryPlan.allowedIds,
      primaryPlan.model.supportsVision,
    );
    return {
      ...res,
      fallbackUsed: false,
    };
  } catch (err) {
    if (signal.aborted) throw err;
    const norm = normalizeUpstreamError(err);
    if (!isFallbackEligibleError(norm)) {
      throw norm;
    }
    const backup = getBackupTarget(rawProviders, config, primaryProviderId, requireVision);
    if (!backup) {
      throw norm;
    }
    console.warn(
      `[PadhloAI] Stream on "${primaryProviderId}" failed (${norm.message}). Falling back to "${backup.provider}" (${backup.model.id}).`,
    );
    const fallbackRes = await invokeStream(
      backup.provider,
      backup.model.id,
      backup.allowedIds,
      backup.model.supportsVision,
    );
    return {
      ...fallbackRes,
      fallbackUsed: true,
      fallbackFrom: primaryProviderId,
      fallbackReason: norm.message,
    };
  }
}
