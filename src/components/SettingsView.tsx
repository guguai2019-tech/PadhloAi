import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Moon,
  RefreshCw,
  Server,
  ShieldCheck,
  Sun,
  Trash2,
  XCircle,
  Volume2,
} from 'lucide-react';
import type {
  AiSelectionMode,
  AppSettings,
  LanguageMode,
  ProviderConnectionState,
  ProviderId,
  ProviderStatus,
  PublicAiPolicy,
} from '../types';
import { testProviderConnectionApi } from '../utils/aiClient';
import { ModelSelectorDropdown } from './ModelSelectorDropdown';

interface SettingsViewProps {
  settings: AppSettings;
  providers: ProviderStatus[];
  aiPolicy: PublicAiPolicy | null;
  loadingProviders: boolean;
  onRefreshProviders: () => Promise<void> | void;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onOpenAdminPanel: () => void;
  onClearAllChats: () => void;
  onClearMockHistory: () => void;
}

function getStatusBadge(state: ProviderConnectionState): {
  label: string;
  classes: string;
} {
  switch (state) {
    case 'connected':
      return {
        label: 'Connected',
        classes: 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
      };
    case 'no-models':
      return {
        label: 'No Models Installed',
        classes: 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
      };
    case 'disabled':
      return {
        label: 'Disabled',
        classes: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700',
      };
    case 'disconnected':
      return {
        label: 'Disconnected',
        classes: 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
      };
    default:
      return {
        label: 'Error',
        classes: 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
      };
  }
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  providers,
  aiPolicy,
  loadingProviders,
  onRefreshProviders,
  onUpdateSettings,
  onOpenAdminPanel,
  onClearAllChats,
  onClearMockHistory,
}) => {
  const [confirmClearChats, setConfirmClearChats] = useState(false);
  const [testingProvider, setTestingProvider] = useState<ProviderId | null>(null);
  const [testFeedback, setTestFeedback] = useState<
    Record<string, { ok: boolean; message: string }>
  >({});

  const handleTestProvider = async (provider: ProviderId) => {
    setTestingProvider(provider);
    try {
      const res = await testProviderConnectionApi(provider);
      setTestFeedback((prev) => ({
        ...prev,
        [provider]: { ok: res.ok, message: res.message },
      }));
      await onRefreshProviders();
    } catch (err) {
      setTestFeedback((prev) => ({
        ...prev,
        [provider]: {
          ok: false,
          message: err instanceof Error ? err.message : 'Connection test failed.',
        },
      }));
    } finally {
      setTestingProvider(null);
    }
  };

  const ollamaProvider = providers.find((p) => p.id === 'ollama');

  return (
    <div className="h-full overflow-y-auto px-4 md:px-8 py-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Platform Settings & AI Providers
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Configure theme, language, voice playback, and switch between Google Gemini and Ollama Local Open-Source AI.
          </p>
        </div>

        {/* Appearance & Language */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-5">
          <h2 className="font-semibold text-base">Appearance & Language</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block">
                Theme Mode
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onUpdateSettings({ theme: 'light' })}
                  className={`flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl border text-xs font-semibold ${
                    settings.theme === 'light'
                      ? 'border-violet-600 bg-violet-50 text-violet-700'
                      : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <Sun className="w-4 h-4" />
                  <span>Light Mode</span>
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateSettings({ theme: 'dark' })}
                  className={`flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl border text-xs font-semibold ${
                    settings.theme === 'dark'
                      ? 'border-violet-500 bg-violet-950/50 text-violet-300'
                      : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <Moon className="w-4 h-4" />
                  <span>Dark Mode</span>
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block">
                Default Response Language
              </label>
              <select
                value={settings.language}
                onChange={(e) => onUpdateSettings({ language: e.target.value as LanguageMode })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              >
                <option value="auto">Auto-detect (English / Hindi / Odia)</option>
                <option value="english">English</option>
                <option value="hindi">Hindi (हिन्दी)</option>
                <option value="odia">Odia (ଓଡ଼ିଆ)</option>
                <option value="bilingual">Bilingual (English + Hindi)</option>
              </select>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-sm">
              <Volume2 className="w-4 h-4 text-violet-600" />
              <span className="font-medium">Read Aloud Speed:</span>
              <span className="font-mono tabular-nums text-xs text-slate-500">
                {settings.speechRate.toFixed(2)}x
              </span>
            </div>
            <input
              type="range"
              min={0.75}
              max={1.5}
              step={0.05}
              value={settings.speechRate}
              onChange={(e) => onUpdateSettings({ speechRate: Number(e.target.value) })}
              className="w-48 accent-violet-600"
            />
          </div>
        </div>

        {/* Dual AI Provider Selection & Routing */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-base flex items-center gap-2">
                <Cpu className="w-4 h-4 text-violet-600" />
                <span>AI Provider & Model Selection</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Choose Automatic (Admin Default) or select an enabled Google Gemini or Ollama Local model. API keys and server URLs remain strictly server-side.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void onRefreshProviders()}
              disabled={loadingProviders}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingProviders ? 'animate-spin' : ''}`} />
              <span>Refresh Models</span>
            </button>
          </div>

          {/* Selection Mode + Grouped Model Dropdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block">
                Provider Selection Mode
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { id: 'auto', label: 'Automatic' },
                    { id: 'gemini', label: 'Gemini' },
                    { id: 'ollama', label: 'Ollama' },
                  ] as Array<{ id: AiSelectionMode; label: string }>
                ).map((modeBtn) => {
                  const isModeDisabled =
                    (modeBtn.id === 'gemini' && aiPolicy && !aiPolicy.geminiEnabled) ||
                    (modeBtn.id === 'ollama' && aiPolicy && !aiPolicy.ollamaEnabled);
                  const active = settings.selectionMode === modeBtn.id;
                  return (
                    <button
                      key={modeBtn.id}
                      type="button"
                      disabled={Boolean(isModeDisabled)}
                      onClick={() => {
                        if (modeBtn.id === 'auto') {
                          const defProv = aiPolicy?.defaultProvider || 'gemini';
                          const firstM =
                            providers.find((p) => p.id === defProv)?.models[0]?.id ||
                            settings.model;
                          onUpdateSettings({
                            selectionMode: 'auto',
                            provider: defProv,
                            model: firstM,
                          });
                        } else {
                          const targetProv = providers.find((p) => p.id === modeBtn.id);
                          const firstM = targetProv?.models[0]?.id || settings.model;
                          onUpdateSettings({
                            selectionMode: modeBtn.id,
                            provider: modeBtn.id,
                            model: firstM,
                          });
                        }
                      }}
                      className={`py-2 px-2.5 rounded-lg border text-xs font-semibold transition-colors disabled:opacity-40 ${
                        active
                          ? 'border-violet-600 bg-violet-600 text-white'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {modeBtn.label}
                    </button>
                  );
                })}
              </div>
              {aiPolicy && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Admin Default:{' '}
                  <strong>
                    {aiPolicy.defaultProvider === 'ollama' ? 'Ollama Local' : 'Google Gemini'}
                  </strong>
                  {aiPolicy.fallbackEnabled && aiPolicy.backupProvider !== 'none'
                    ? ` · Backup fallback enabled (${aiPolicy.backupProvider === 'ollama' ? 'Ollama Local' : 'Google Gemini'})`
                    : ' · Fallback disabled'}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block">
                Default Model for Tools & New Chats
              </label>
              <ModelSelectorDropdown
                providers={providers}
                policy={aiPolicy}
                value={{
                  selectionMode: settings.selectionMode,
                  provider: settings.provider,
                  model: settings.model,
                }}
                ariaLabel="Settings Default AI Model"
                onChange={(next) =>
                  onUpdateSettings({
                    selectionMode: next.selectionMode,
                    provider: next.provider,
                    model: next.model,
                  })
                }
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium focus:outline-none focus:border-violet-500"
              />
            </div>
          </div>

          {/* Provider Status Cards */}
          <div className="space-y-3">
            {providers.map((prov) => {
              const badge = getStatusBadge(prov.connectionState);
              const isSelectedProvider =
                settings.selectionMode === prov.id ||
                (settings.selectionMode === 'auto' && aiPolicy?.defaultProvider === prov.id);
              const feedback = testFeedback[prov.id];

              return (
                <div
                  key={prov.id}
                  className={`p-4 rounded-xl border transition-colors ${
                    isSelectedProvider
                      ? 'border-violet-500 bg-violet-50/30 dark:bg-violet-950/20'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                        <span>{prov.name}</span>
                        {aiPolicy?.defaultProvider === prov.id && (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300">
                            Admin Default
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {prov.description}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-semibold ${badge.classes}`}
                      >
                        {prov.connectionState === 'connected' ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : prov.connectionState === 'no-models' ? (
                          <AlertTriangle className="w-3.5 h-3.5" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5" />
                        )}
                        <span>{badge.label}</span>
                      </span>

                      <button
                        type="button"
                        disabled={!prov.enabled || testingProvider === prov.id}
                        onClick={() => void handleTestProvider(prov.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
                      >
                        <Activity className="w-3.5 h-3.5" />
                        <span>
                          {testingProvider === prov.id ? 'Testing...' : 'Test Connection'}
                        </span>
                      </button>
                    </div>
                  </div>

                  <div className="text-xs text-slate-600 dark:text-slate-400 mt-2">
                    {prov.statusMessage}
                  </div>

                  {feedback && (
                    <div
                      className={`mt-2 p-2.5 rounded-lg border text-xs ${
                        feedback.ok
                          ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                          : 'border-red-200 dark:border-red-800 bg-red-50/70 dark:bg-red-950/30 text-red-700 dark:text-red-300'
                      }`}
                    >
                      {feedback.message}
                    </div>
                  )}

                  {prov.id === 'ollama' && (
                    <div className="mt-3 p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                          <Server className="w-3.5 h-3.5 text-violet-600" />
                          <span>Server Connection:</span>
                          <span className="font-mono text-[11px]">
                            {ollamaProvider?.endpointLabel || 'http://127.0.0.1:11434'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={onOpenAdminPanel}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-600 dark:text-violet-400 hover:underline"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>Configure Server URL & Allowed Models in Admin Panel</span>
                        </button>
                      </div>

                      {aiPolicy?.isCloudDeployment && aiPolicy?.ollamaEndpointType === 'localhost' && (
                        <div className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg px-2.5 py-1.5">
                          Cloud deployment notice: A cloud-hosted server cannot reach your laptop&apos;s local <code>127.0.0.1:11434</code> directly. For remote cloud access, an Administrator must configure a reachable HTTPS Ollama endpoint or tunnel URL in the Admin Panel.
                        </div>
                      )}
                    </div>
                  )}

                  {prov.models.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                      {prov.models.map((m) => {
                        const active =
                          settings.selectionMode !== 'auto' &&
                          settings.provider === prov.id &&
                          settings.model === m.id;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() =>
                              onUpdateSettings({
                                selectionMode: prov.id,
                                provider: prov.id,
                                model: m.id,
                              })
                            }
                            className={`text-left p-3 rounded-xl border text-xs transition-colors ${
                              active
                                ? 'border-violet-600 bg-white dark:bg-slate-900 shadow-sm'
                                : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 hover:border-slate-400'
                            }`}
                          >
                            <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center justify-between gap-2">
                              <span className="truncate">{m.name}</span>
                              {active && (
                                <span className="text-[11px] text-violet-600 dark:text-violet-400 shrink-0">
                                  Active
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                              {m.supportsVision ? 'Vision + Text' : 'Text Only'} ·{' '}
                              {m.supportsStreaming ? 'Streaming' : 'Standard'} ·{' '}
                              {m.contextWindowLabel}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : prov.enabled ? (
                    <div className="mt-3 text-xs text-slate-500 dark:text-slate-400 italic">
                      No enabled models are currently available for this provider.
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        {/* Local Data Management */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
          <h2 className="font-semibold text-base">Local History Management</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Conversations, study planner tasks, and mock test scorecards are saved locally in your browser.
          </p>
          <div className="flex flex-wrap gap-3 pt-1">
            {confirmClearChats ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onClearAllChats();
                    setConfirmClearChats(false);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-red-600 text-white text-xs font-semibold"
                >
                  Confirm Delete All Chats
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClearChats(false)}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClearChats(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 text-xs font-semibold hover:bg-red-50 dark:hover:bg-red-950/30"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear Chat History</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClearMockHistory}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear Mock Test History</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
