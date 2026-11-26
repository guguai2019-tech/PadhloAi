import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Clock,
  Film,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import type { LanguageMode, ModuleId, StudentRecord, VideoLanguage } from '../types';
import { matchesSearchQuery } from '../utils/studySearch';
import {
  deleteStudentVideo,
  fetchStudentVideos,
  signInStudentWithPasscode,
  type PlayableVideoItem,
} from '../utils/videoApi';
import { EducationalVideoPlayer } from './EducationalVideoPlayer';
import { SearchBarWithVoice } from './SearchBarWithVoice';

interface MyGeneratedVideosViewProps {
  studentToken: string | null;
  studentProfile: StudentRecord | null;
  language?: LanguageMode;
  onSessionReady: (token: string, student: StudentRecord | null) => void;
  onNavigateModule: (module: ModuleId) => void;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

function formatSec(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export const MyGeneratedVideosView: React.FC<MyGeneratedVideosViewProps> = ({
  studentToken,
  studentProfile,
  language,
  onSessionReady,
  onNavigateModule,
}) => {
  const isRegisteredStudent = Boolean(studentToken && studentProfile);

  const [videos, setVideos] = useState<PlayableVideoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [langFilter, setLangFilter] = useState<'all' | VideoLanguage>('all');
  const [activeVideo, setActiveVideo] = useState<PlayableVideoItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PlayableVideoItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Quick student login state if unauthenticated
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPasscode, setAuthPasscode] = useState('');
  const [authBusy, setAuthBusy] = useState(false);

  const loadVideos = useCallback(async () => {
    if (!isRegisteredStudent || !studentToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchStudentVideos(studentToken);
      setVideos(res.videos);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load your videos.');
    } finally {
      setLoading(false);
    }
  }, [isRegisteredStudent, studentToken]);

  useEffect(() => {
    void loadVideos();
  }, [loadVideos]);

  const filteredVideos = useMemo(() => {
    return videos.filter((v) => {
      if (langFilter !== 'all' && v.language !== langFilter) return false;
      if (search.trim()) {
        const hay = `${v.title} ${v.topic} ${v.subject || ''} ${v.chapter || ''} ${v.examName || ''}`;
        if (!matchesSearchQuery(hay, search)) return false;
      }
      return true;
    });
  }, [videos, search, langFilter]);

  const handleDelete = async () => {
    if (!deleteTarget || !studentToken) return;
    setDeleting(true);
    try {
      await deleteStudentVideo(studentToken, deleteTarget.id);
      if (activeVideo?.id === deleteTarget.id) setActiveVideo(null);
      setVideos((prev) => prev.filter((v) => v.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete video.');
    } finally {
      setDeleting(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authName.trim() || !authEmail.trim()) return;
    setAuthBusy(true);
    setError(null);
    try {
      const res = await signInStudentWithPasscode({
        name: authName.trim(),
        email: authEmail.trim(),
        passcode: authPasscode.trim() || undefined,
      });
      onSessionReady(res.token, res.student);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setAuthBusy(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-display font-bold text-2xl text-slate-900 dark:text-white flex items-center gap-2.5">
              <Film className="w-6 h-6 text-violet-600 dark:text-violet-400" />
              <span>My Generated Videos</span>
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Private classroom library of your AI-generated animated educational MP4 lessons.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isRegisteredStudent && (
              <button
                type="button"
                onClick={() => void loadVideos()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onNavigateModule('video-generator')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold"
            >
              <Plus className="w-4 h-4" />
              <span>Create New Video</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 flex items-center gap-2.5 text-sm text-red-700 dark:text-red-300">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!isRegisteredStudent ? (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 max-w-md mx-auto space-y-4">
            <div className="flex items-center gap-3">
              <UserCheck className="w-6 h-6 text-violet-600" />
              <div>
                <h2 className="font-display font-bold text-base">Sign In to View Your Videos</h2>
                <p className="text-xs text-slate-500">
                  Generated videos are private to each registered student account.
                </p>
              </div>
            </div>
            <form onSubmit={(e) => void handleSignIn(e)} className="space-y-3">
              <input
                type="text"
                required
                value={authName}
                onChange={(e) => setAuthName(e.target.value)}
                placeholder="Student Name"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
              />
              <input
                type="email"
                required
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                placeholder="Student Email"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
              />
              <input
                type="password"
                value={authPasscode}
                onChange={(e) => setAuthPasscode(e.target.value)}
                placeholder="Passcode (if set)"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
              />
              <button
                type="submit"
                disabled={authBusy}
                className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold"
              >
                {authBusy ? 'Signing In...' : 'Sign In & Load Videos'}
              </button>
            </form>
          </div>
        ) : (
          <>
            {/* Active Video Player Section */}
            {activeVideo && (
              <div className="rounded-2xl border border-violet-200 dark:border-violet-900/60 bg-white dark:bg-slate-900 p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold text-violet-600 dark:text-violet-400">
                      {[activeVideo.examName, activeVideo.subject, activeVideo.chapter]
                        .filter(Boolean)
                        .join(' · ') || 'Educational Video'}
                    </div>
                    <h2 className="font-display font-bold text-xl text-slate-900 dark:text-white">
                      {activeVideo.title}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveVideo(null)}
                    className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"
                    aria-label="Close player"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <EducationalVideoPlayer video={activeVideo} />
              </div>
            )}

            {/* Search & Language Filters */}
            <div className="flex flex-col sm:flex-row items-start gap-3">
              <div className="flex-1 w-full">
                <SearchBarWithVoice
                  value={search}
                  onChange={setSearch}
                  defaultLanguage={language}
                  placeholder="Search by topic, subject, or chapter..."
                  ariaLabel="Search generated videos"
                />
              </div>
              <select
                value={langFilter}
                onChange={(e) => setLangFilter(e.target.value as 'all' | VideoLanguage)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium"
              >
                <option value="all">All Languages</option>
                <option value="odia">Odia (ଓଡ଼ିଆ)</option>
                <option value="hindi">Hindi (हिन्दी)</option>
                <option value="english">English</option>
              </select>
            </div>

            {loading ? (
              <div className="py-16 flex flex-col items-center justify-center gap-2 text-slate-500">
                <Loader2 className="w-7 h-7 animate-spin text-violet-600" />
                <span className="text-sm">Loading your private video lessons...</span>
              </div>
            ) : filteredVideos.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-12 text-center space-y-3">
                <Film className="w-10 h-10 mx-auto text-slate-400" />
                <h3 className="font-display font-bold text-lg text-slate-800 dark:text-slate-200">
                  No Generated Videos Yet
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                  Generate an animated educational lesson with AI teacher narration, vector
                  diagrams, and synchronized subtitles from AI Video Generator.
                </p>
                <button
                  type="button"
                  onClick={() => onNavigateModule('video-generator')}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold"
                >
                  <Plus className="w-4 h-4" />
                  <span>Generate Your First Video</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredVideos.map((vid) => (
                  <div
                    key={vid.id}
                    className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden flex flex-col shadow-xs hover:border-violet-400 dark:hover:border-violet-600 transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => setActiveVideo(vid)}
                      className="relative aspect-video bg-slate-950 group overflow-hidden text-left"
                    >
                      <img
                        src={vid.thumbnailUrl}
                        alt={vid.title}
                        className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                      />
                      <div className="absolute inset-0 bg-black/25 group-hover:bg-black/35 flex items-center justify-center transition-colors">
                        <span className="w-12 h-12 rounded-full bg-violet-600/95 text-white flex items-center justify-center shadow-lg border border-white/50">
                          <Play className="w-5 h-5 ml-0.5" />
                        </span>
                      </div>
                      <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-black/75 text-white text-xs font-mono font-bold">
                        {formatSec(vid.actualDurationSeconds)}
                      </span>
                      <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-violet-600/90 text-white text-[11px] font-bold uppercase">
                        {vid.language}
                      </span>
                    </button>

                    <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                      <div className="space-y-1">
                        <h3 className="font-display font-bold text-base text-slate-900 dark:text-white line-clamp-2">
                          {vid.title}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
                          {[vid.subject, vid.chapter, vid.topic].filter(Boolean).join(' · ')}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(vid.createdAt).toLocaleDateString()}
                        </span>
                        <span>·</span>
                        <span>{vid.quality}</span>
                        <span>·</span>
                        <span>{formatBytes(vid.fileSizeBytes)}</span>
                        <span>·</span>
                        <span>1 Credit</span>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                        <button
                          type="button"
                          onClick={() => setActiveVideo(vid)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold"
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>Play Lesson</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(vid)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-semibold"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <h3 className="font-display font-bold text-lg text-slate-900 dark:text-white">
              Delete Generated Video?
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Permanently delete <strong>{deleteTarget.title}</strong>? This frees private storage
              and cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void handleDelete()}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold"
              >
                {deleting ? 'Deleting...' : 'Delete Video'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
