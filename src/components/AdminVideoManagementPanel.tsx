import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  CreditCard,
  Film,
  HardDrive,
  Loader2,
  RefreshCw,
  Save,
  Trash2,
  Volume2,
} from 'lucide-react';
import type {
  AdminVideoConfig,
  AdminVideoOverviewResponse,
  StudentRecord,
  VideoDurationMinutes,
  VideoLanguage,
  VideoQualityPreset,
} from '../types';
import {
  adminGrantVideoCredits,
  cleanupFailedVideoJobs,
  fetchAdminVideoOverview,
  updateAdminVideoConfig,
} from '../utils/videoApi';

interface AdminVideoManagementPanelProps {
  adminToken: string;
  students: StudentRecord[];
  onFlashSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

const VOICE_OPTIONS = ['Kore', 'Puck', 'Charon', 'Zephyr', 'Fenrir'];

export const AdminVideoManagementPanel: React.FC<AdminVideoManagementPanelProps> = ({
  adminToken,
  students,
  onFlashSuccess,
  onError,
}) => {
  const [overview, setOverview] = useState<AdminVideoOverviewResponse | null>(null);
  const [draft, setDraft] = useState<AdminVideoConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cleaning, setCleaning] = useState(false);

  const [grantStudentId, setGrantStudentId] = useState('');
  const [grantCredits, setGrantCredits] = useState(5);
  const [granting, setGranting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchAdminVideoOverview(adminToken);
      setOverview(res);
      setDraft(res.config);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to load Video Generator settings.');
    } finally {
      setLoading(false);
    }
  }, [adminToken, onError]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!grantStudentId && students.length > 0) {
      setGrantStudentId(students[0].id);
    }
  }, [students, grantStudentId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setSaving(true);
    try {
      const res = await updateAdminVideoConfig(adminToken, draft);
      setDraft(res.config);
      setOverview((prev) =>
        prev ? { ...prev, config: res.config, ttsStatus: res.ttsStatus } : prev,
      );
      onFlashSuccess('AI Video Generator settings saved & synchronized.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to save Video Generator settings.');
    } finally {
      setSaving(false);
    }
  };

  const toggleLanguage = (lang: VideoLanguage) => {
    if (!draft) return;
    const exists = draft.allowedLanguages.includes(lang);
    const next = exists
      ? draft.allowedLanguages.filter((l) => l !== lang)
      : [...draft.allowedLanguages, lang];
    if (next.length === 0) return;
    setDraft({ ...draft, allowedLanguages: next });
  };

  const handleCleanupFailed = async () => {
    setCleaning(true);
    try {
      const res = await cleanupFailedVideoJobs(adminToken);
      onFlashSuccess(`Cleared ${res.removedCount} failed video job record(s).`);
      await loadData();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to clear failed jobs.');
    } finally {
      setCleaning(false);
    }
  };

  const handleGrantCredits = async () => {
    if (!grantStudentId) return;
    setGranting(true);
    try {
      await adminGrantVideoCredits(adminToken, {
        studentId: grantStudentId,
        credits: grantCredits,
      });
      onFlashSuccess(`Granted ${grantCredits} video credit(s) to selected student.`);
      await loadData();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to grant video credits.');
    } finally {
      setGranting(false);
    }
  };

  if (loading || !overview || !draft) {
    return (
      <div className="py-12 flex items-center justify-center gap-2 text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin text-violet-600" />
        <span className="text-sm">Loading AI Video Generator Management...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header + Refresh */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display font-bold text-xl text-slate-900 dark:text-white flex items-center gap-2">
            <Film className="w-5 h-5 text-violet-600" />
            <span>12. AI Video Generator Management</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Configure pricing, credits, TTS teacher voices, diagram engines, quality presets, and
            API cost/storage caps.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadData()}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Metrics</span>
        </button>
      </div>

      {/* Live Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="text-xs text-slate-500">Generated MP4s</div>
          <div className="font-display font-bold text-2xl mt-1">{overview.stats.totalVideos}</div>
        </div>
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="text-xs text-slate-500">Active Subscriptions</div>
          <div className="font-display font-bold text-2xl mt-1 text-emerald-600">
            {overview.stats.activeSubscriptions}
          </div>
        </div>
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="text-xs text-slate-500">Active / Failed Jobs</div>
          <div className="font-display font-bold text-2xl mt-1">
            {overview.stats.activeJobs}{' '}
            <span className="text-sm text-red-500 font-semibold">
              / {overview.stats.failedJobs} failed
            </span>
          </div>
        </div>
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="text-xs text-slate-500 flex items-center gap-1">
            <HardDrive className="w-3.5 h-3.5" /> Storage Used
          </div>
          <div className="font-display font-bold text-xl mt-1">
            {overview.stats.totalStorageMb} / {draft.maxStorageMb} MB
          </div>
        </div>
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="text-xs text-slate-500">Monthly API Cost</div>
          <div className="font-display font-bold text-xl mt-1 text-violet-600">
            ${overview.stats.monthlyCostUsd.toFixed(2)} / ${draft.monthlyBudgetUsd}
          </div>
        </div>
      </div>

      {/* TTS Provider Live Health Banner */}
      <div
        className={`p-3.5 rounded-xl border text-xs flex items-center gap-2.5 ${
          overview.ttsStatus.available
            ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200'
            : 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200'
        }`}
      >
        {overview.ttsStatus.available ? (
          <CheckCircle2 className="w-4 h-4 shrink-0" />
        ) : (
          <AlertTriangle className="w-4 h-4 shrink-0" />
        )}
        <span>
          <strong>Speech Engine Status:</strong> {overview.ttsStatus.message}
        </span>
      </div>

      {/* Configuration Form */}
      <form
        onSubmit={(e) => void handleSave(e)}
        className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h3 className="font-display font-bold text-base">
              Feature Access, Subscription &amp; Quality Controls
            </h3>
            <p className="text-xs text-slate-500">
              Changes apply immediately to Student Video Generator and Checkout verification.
            </p>
          </div>
          <label className="inline-flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-semibold cursor-pointer">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
              className="w-4 h-4 accent-violet-600"
            />
            <span>{draft.enabled ? 'Feature Enabled' : 'Feature Paused'}</span>
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">
              Subscription Plan Name
            </label>
            <input
              type="text"
              value={draft.planName}
              onChange={(e) => setDraft({ ...draft, planName: e.target.value })}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">
              Subscription Price (₹ INR)
            </label>
            <input
              type="number"
              min={1}
              value={draft.priceInr}
              onChange={(e) => setDraft({ ...draft, priceInr: Number(e.target.value) || 49 })}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">
              Validity Duration (Months)
            </label>
            <input
              type="number"
              min={1}
              max={36}
              value={draft.validityMonths}
              onChange={(e) => setDraft({ ...draft, validityMonths: Number(e.target.value) || 6 })}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">
              Credits Per Subscription
            </label>
            <input
              type="number"
              min={1}
              max={200}
              value={draft.defaultCredits}
              onChange={(e) => setDraft({ ...draft, defaultCredits: Number(e.target.value) || 5 })}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">
              Max Video Duration Limit
            </label>
            <select
              value={draft.maxDurationMinutes}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  maxDurationMinutes: Number(e.target.value) as VideoDurationMinutes,
                })
              }
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
            >
              <option value={2}>2 Minutes</option>
              <option value={3}>3 Minutes</option>
              <option value={5}>5 Minutes</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">
              Rendering Quality Preset
            </label>
            <select
              value={draft.videoQuality}
              onChange={(e) =>
                setDraft({ ...draft, videoQuality: e.target.value as VideoQualityPreset })
              }
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
            >
              <option value="480p">480p (Fastest / Low Bandwidth)</option>
              <option value="720p">720p HD (Recommended Default)</option>
              <option value="1080p">1080p Full HD</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">
              Default Script AI Provider
            </label>
            <select
              value={draft.defaultScriptProvider}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  defaultScriptProvider: e.target.value as AdminVideoConfig['defaultScriptProvider'],
                })
              }
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
            >
              <option value="auto">Auto (Follow Global AI Policy)</option>
              <option value="gemini">Google Gemini</option>
              <option value="ollama">Ollama Local Open-Source</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">
              Diagram Generation Engine
            </label>
            <select
              value={draft.diagramProvider}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  diagramProvider: e.target.value as AdminVideoConfig['diagramProvider'],
                })
              }
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
            >
              <option value="svg-vector">Educational SVG Vector Engine (Free &amp; Crisp)</option>
              <option value="gemini-image">Gemini Image + Vector Fallback</option>
            </select>
          </div>
        </div>

        {/* Supported Languages */}
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-2">
            Allowed Video Languages
          </label>
          <div className="flex flex-wrap gap-2.5">
            {(
              [
                { id: 'odia', label: 'Odia (ଓଡ଼ିଆ)' },
                { id: 'hindi', label: 'Hindi (हिन्दी)' },
                { id: 'english', label: 'English' },
              ] as const
            ).map((l) => {
              const checked = draft.allowedLanguages.includes(l.id);
              return (
                <label
                  key={l.id}
                  className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-semibold cursor-pointer ${
                    checked
                      ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-200'
                      : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleLanguage(l.id)}
                  />
                  <span>{l.label}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Dedicated Speech Generation (TTS) Configuration */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3.5">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
            <Volume2 className="w-4 h-4 text-violet-600" />
            <span>AI Teacher Speech (TTS) Provider &amp; Voice Selection</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                Speech Provider
              </label>
              <select
                value={draft.ttsProvider}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    ttsProvider: e.target.value as AdminVideoConfig['ttsProvider'],
                  })
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
              >
                <option value="gemini-tts">Gemini Dedicated Speech TTS</option>
                <option value="custom-http-tts">Custom External HTTP TTS API</option>
              </select>
            </div>

            {draft.ttsProvider === 'gemini-tts' ? (
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">
                  TTS Model
                </label>
                <select
                  value={draft.ttsModel}
                  onChange={(e) => setDraft({ ...draft, ttsModel: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                >
                  <option value="gemini-3.8-flash-lite-tts">
                    gemini-3.8-flash-lite-tts (Fast/Cost-Optimized)
                  </option>
                  <option value="gemini-3.8-flash-tts">
                    gemini-3.8-flash-tts (Flagship)
                  </option>
                </select>
              </div>
            ) : (
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-500 mb-1">
                  Custom HTTP TTS Endpoint URL (OpenAI-compatible /v1/audio/speech)
                </label>
                <input
                  type="url"
                  value={draft.customTtsUrl}
                  onChange={(e) => setDraft({ ...draft, customTtsUrl: e.target.value })}
                  placeholder="https://tts.example.com/v1/audio/speech"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-mono"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(['odia', 'hindi', 'english'] as const).map((langKey) => (
              <div key={langKey}>
                <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase">
                  {langKey} Teacher Voice
                </label>
                <select
                  value={draft.voices[langKey] || 'Kore'}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      voices: { ...draft.voices, [langKey]: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                >
                  {VOICE_OPTIONS.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>

        {/* Cost, Concurrency & Storage Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">
              Max Concurrent Render Jobs
            </label>
            <input
              type="number"
              min={1}
              max={5}
              value={draft.maxConcurrentJobs}
              onChange={(e) =>
                setDraft({ ...draft, maxConcurrentJobs: Number(e.target.value) || 2 })
              }
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">
              Storage Limit (MB)
            </label>
            <input
              type="number"
              min={100}
              value={draft.maxStorageMb}
              onChange={(e) =>
                setDraft({ ...draft, maxStorageMb: Number(e.target.value) || 2048 })
              }
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">
              Monthly API Budget Cap (USD $)
            </label>
            <input
              type="number"
              min={1}
              step={1}
              value={draft.monthlyBudgetUsd}
              onChange={(e) =>
                setDraft({ ...draft, monthlyBudgetUsd: Number(e.target.value) || 25 })
              }
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>Save Video Generator Config</span>
          </button>
        </div>
      </form>

      {/* Grant Credits Quick Utility + Cleanup Failed Jobs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
          <h3 className="font-display font-bold text-base flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-violet-600" />
            <span>Grant Bonus Video Credits to Student</span>
          </h3>
          {students.length === 0 ? (
            <p className="text-xs text-slate-500">No registered students yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <select
                value={grantStudentId}
                onChange={(e) => setGrantStudentId(e.target.value)}
                className="flex-1 min-w-[180px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
              >
                {students.map((stu) => (
                  <option key={stu.id} value={stu.id}>
                    {stu.name} ({stu.email})
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                max={100}
                value={grantCredits}
                onChange={(e) => setGrantCredits(Number(e.target.value) || 5)}
                className="w-24 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
              />
              <button
                type="button"
                disabled={granting}
                onClick={() => void handleGrantCredits()}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50"
              >
                {granting ? 'Granting...' : 'Grant Credits'}
              </button>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex items-center justify-between gap-4">
          <div>
            <h3 className="font-display font-bold text-base flex items-center gap-2">
              <Cpu className="w-4 h-4 text-violet-600" />
              <span>Failed Jobs &amp; Logs Maintenance</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              {overview.stats.failedJobs} failed job log(s) currently stored. Failed jobs never
              deduct student credits.
            </p>
          </div>
          <button
            type="button"
            disabled={cleaning || overview.stats.failedJobs === 0}
            onClick={() => void handleCleanupFailed()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-red-200 dark:border-red-900 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 text-xs font-semibold disabled:opacity-40 shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{cleaning ? 'Cleaning...' : 'Clear Failed Logs'}</span>
          </button>
        </div>
      </div>

      {/* Recent Jobs & Subscriptions Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
          <h3 className="font-display font-bold text-base">
            Recent Video Generation Jobs ({overview.recentJobs.length})
          </h3>
          {overview.recentJobs.length === 0 ? (
            <p className="text-xs text-slate-500 italic">No video generation jobs recorded yet.</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {overview.recentJobs.map((j) => (
                <div
                  key={j.id}
                  className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-800 dark:text-slate-100 truncate">
                      {j.lessonTitle || j.topic}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded font-bold uppercase text-[10px] ${
                        j.status === 'completed'
                          ? 'bg-emerald-100 text-emerald-700'
                          : j.status === 'failed'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-violet-100 text-violet-700'
                      }`}
                    >
                      {j.status}
                    </span>
                  </div>
                  <div className="text-slate-500 flex flex-wrap gap-2">
                    <span>{j.studentName}</span>
                    <span>·</span>
                    <span>{j.language.toUpperCase()}</span>
                    <span>·</span>
                    <span>{j.durationMinutes} min</span>
                    <span>·</span>
                    <span>${j.estimatedCostUsd.toFixed(4)}</span>
                  </div>
                  {j.errorMessage && (
                    <div className="text-red-600 dark:text-red-400">{j.errorMessage}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
          <h3 className="font-display font-bold text-base">
            Student Video Subscriptions ({overview.subscriptions.length})
          </h3>
          {overview.subscriptions.length === 0 ? (
            <p className="text-xs text-slate-500 italic">No student subscriptions active yet.</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {overview.subscriptions.map((s) => (
                <div
                  key={s.id}
                  className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 text-xs flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-slate-800 dark:text-slate-100 truncate">
                      {s.studentName} ({s.studentEmail})
                    </div>
                    <div className="text-slate-500">
                      ₹{s.paidAmountInr} · Expires {new Date(s.expiresAt).toLocaleDateString()} ·{' '}
                      {s.paymentRef}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold text-violet-600">
                      {s.creditsRemaining} / {s.creditsTotal} left
                    </div>
                    <div className="uppercase text-[10px] font-bold text-emerald-600">
                      {s.status}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
