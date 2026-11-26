import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  ShieldCheck,
  UserCog,
} from 'lucide-react';
import type { AdminAuthStatus } from '../types';
import {
  getAdminAuthStatus,
  loginAdmin,
  setupInitialAdmin,
} from '../utils/adminApi';

interface AdminLoginViewProps {
  onLoginSuccess: (token: string, adminId: string) => void;
}

export const AdminLoginView: React.FC<AdminLoginViewProps> = ({
  onLoginSuccess,
}) => {
  const [status, setStatus] = useState<AdminAuthStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  const [adminId, setAdminId] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoadingStatus(true);
      try {
        const res = await getAdminAuthStatus();
        if (active) setStatus(res);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Could not reach authentication server.');
        }
      } finally {
        if (active) setLoadingStatus(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!adminId.trim() || !password) {
      setError('Admin ID and Password are required.');
      return;
    }

    if (status?.needsInitialSetup) {
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
      if (password.length < 4) {
        setError('Password must be at least 4 characters.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const result = status?.needsInitialSetup
        ? await setupInitialAdmin(adminId.trim(), password)
        : await loginAdmin(adminId.trim(), password);
      onLoginSuccess(result.token, result.adminId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto px-4 py-10 flex items-center justify-center bg-slate-50/70 dark:bg-slate-950">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg p-6 sm:p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 flex items-center justify-center mx-auto">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <div className="text-xs font-bold uppercase tracking-wider text-[#4338CA] dark:text-indigo-400">
            PadhloAI · Your AI-Powered Learning Companion.
          </div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            {status?.needsInitialSetup ? 'Initial Admin Setup' : 'Administrator Login'}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {status?.needsInitialSetup
              ? 'Claim the single Administrator account for this workspace. Once created, setup locks permanently.'
              : 'Authorized administrators only. Students cannot access syllabus, question bank, or PDF management.'}
          </p>
        </div>

        {loadingStatus ? (
          <div className="py-10 flex flex-col items-center gap-2 text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin text-violet-600" />
            <span className="text-sm">Checking Admin security status...</span>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            {error && (
              <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs sm:text-sm text-red-700 dark:text-red-300 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label
                htmlFor="admin-id-input"
                className="block text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-1.5"
              >
                Admin ID
              </label>
              <div className="relative">
                <UserCog className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="admin-id-input"
                  type="text"
                  autoComplete="username"
                  value={adminId}
                  onChange={(e) => setAdminId(e.target.value)}
                  placeholder="Enter Admin ID"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm focus:outline-none focus:border-violet-500"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="admin-password-input"
                className="block text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="admin-password-input"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={status?.needsInitialSetup ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="w-full pl-10 pr-11 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm focus:outline-none focus:border-violet-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {status?.needsInitialSetup && (
              <div>
                <label
                  htmlFor="admin-confirm-password-input"
                  className="block text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-1.5"
                >
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="admin-confirm-password-input"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm focus:outline-none focus:border-violet-500"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{status?.needsInitialSetup ? 'Creating Admin Account...' : 'Signing In...'}</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>{status?.needsInitialSetup ? 'Save Admin Account & Enter Panel' : 'Sign In to Admin Panel'}</span>
                </>
              )}
            </button>

            <p className="text-xs text-slate-500 dark:text-slate-400 text-center pt-1">
              {status?.envConfigured
                ? 'Configured via environment secrets. Sessions stay strictly in memory.'
                : 'You can also configure ADMIN_ID and ADMIN_PASSWORD in workspace Secrets.'}
            </p>
          </form>
        )}
      </div>
    </div>
  );
};
