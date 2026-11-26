import React from 'react';
import type {
  AiSelectionMode,
  ProviderId,
  ProviderStatus,
  PublicAiPolicy,
} from '../types';

export interface ModelSelectionValue {
  selectionMode: AiSelectionMode;
  provider: ProviderId;
  model: string;
}

interface ModelSelectorDropdownProps {
  providers: ProviderStatus[];
  policy: PublicAiPolicy | null;
  value: ModelSelectionValue;
  onChange: (next: ModelSelectionValue) => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

export function encodeModelSelection(val: ModelSelectionValue): string {
  if (val.selectionMode === 'auto') return 'auto';
  return `${val.provider}::${val.model}`;
}

export function decodeModelSelection(
  raw: string,
  providers: ProviderStatus[],
  policy: PublicAiPolicy | null,
): ModelSelectionValue {
  if (raw === 'auto') {
    const defProv = policy?.defaultProvider || 'gemini';
    const provObj = providers.find((p) => p.id === defProv);
    const firstModel = provObj?.models[0]?.id || (defProv === 'gemini' ? 'gemini-4-hydrogen' : '');
    return {
      selectionMode: 'auto',
      provider: defProv,
      model: firstModel,
    };
  }
  const [prov, ...rest] = raw.split('::');
  const provider: ProviderId = prov === 'ollama' ? 'ollama' : 'gemini';
  const model = rest.join('::');
  return {
    selectionMode: provider,
    provider,
    model,
  };
}

export const ModelSelectorDropdown: React.FC<ModelSelectorDropdownProps> = ({
  providers,
  policy,
  value,
  onChange,
  disabled = false,
  className = '',
  ariaLabel = 'Select AI Provider and Model',
}) => {
  const geminiProv = providers.find((p) => p.id === 'gemini');
  const ollamaProv = providers.find((p) => p.id === 'ollama');

  const geminiModels = geminiProv?.enabled ? geminiProv.models : [];
  const ollamaModels = ollamaProv?.enabled ? ollamaProv.models : [];

  const defaultProviderLabel =
    policy?.defaultProvider === 'ollama' ? 'Ollama Local' : 'Google Gemini';

  const currentEncoded = encodeModelSelection(value);
  const availableEncodedSet = new Set<string>(['auto']);
  for (const m of geminiModels) availableEncodedSet.add(`gemini::${m.id}`);
  for (const m of ollamaModels) availableEncodedSet.add(`ollama::${m.id}`);

  // If thread remembers a previously selected model not currently in discovered list, keep an explicit unavailable option rather than silently switching!
  const missingSavedSelection =
    value.selectionMode !== 'auto' && !availableEncodedSet.has(currentEncoded);

  return (
    <select
      aria-label={ariaLabel}
      disabled={disabled}
      value={currentEncoded}
      onChange={(e) => onChange(decodeModelSelection(e.target.value, providers, policy))}
      className={
        className ||
        'px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-sm font-medium focus:outline-none focus:border-violet-500 min-h-[40px]'
      }
    >
      <option value="auto">
        Automatic (Admin Default · {defaultProviderLabel})
      </option>

      {missingSavedSelection && (
        <option value={currentEncoded}>
          {value.provider === 'ollama' ? 'Ollama Local' : 'Google Gemini'} · {value.model} (Unavailable)
        </option>
      )}

      {geminiProv?.enabled && geminiModels.length > 0 && (
        <optgroup label="Google Gemini">
          {geminiModels.map((m) => (
            <option key={`gemini::${m.id}`} value={`gemini::${m.id}`}>
              {m.name} {!geminiProv.available ? '(Unavailable)' : ''}
            </option>
          ))}
        </optgroup>
      )}

      {ollamaProv?.enabled && (
        <optgroup
          label={
            ollamaModels.length > 0
              ? 'Ollama Local'
              : `Ollama Local (${
                  ollamaProv.connectionState === 'disconnected'
                    ? 'Disconnected'
                    : ollamaProv.connectionState === 'no-models'
                      ? 'No Models Installed'
                      : 'Unavailable'
                })`
          }
        >
          {ollamaModels.map((m) => (
            <option key={`ollama::${m.id}`} value={`ollama::${m.id}`}>
              {m.name}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
};
