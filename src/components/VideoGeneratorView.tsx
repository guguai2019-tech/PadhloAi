import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  Clock,
  CreditCard,
  Film,
  Layers,
  Loader2,
  Lock,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Video,
  X,
} from 'lucide-react';
import type {
  AppSettings,
  ExamDefinition,
  ModuleId,
  StudentRecord,
  StudentVideoWalletResponse,
  VideoDurationMinutes,
  VideoGenerationJobRecord,
  VideoLanguage,
  VideoStageId,
} from '../types';
import {
  createVideoSubscriptionOrder,
  fetchPublicVideoConfig,
  fetchStudentVideoJobs,
  fetchStudentVideos,
  fetchStudentVideoWallet,
  retryFailedVideoJob,
  signInStudentWithPasscode,
  startVideoGenerationJob,
  verifyVideoSubscriptionPayment,
  type PlayableVideoItem,
} from '../utils/videoApi';
import { EducationalVideoPlayer } from './EducationalVideoPlayer';

interface VideoGeneratorViewProps {
  exams: ExamDefinition[];
  settings: AppSettings;
  studentToken: string | null;
  studentProfile: StudentRecord | null;
  onSessionReady: (token: string, student: StudentRecord | null) => void;
  onNavigateModule: (module: ModuleId) => void;
}

const PIPELINE_STEPS: Array<{ id: VideoStageId; label: string }> = [
  { id: 'understanding-topic', label: 'Understanding Topic' },
  { id: 'creating-script', label: 'Creating Lesson Script' },
  { id: 'preparing-scenes', label: 'Preparing Educational Scenes' },
  { id: 'generating-diagrams', label: 'Generating Diagrams' },
  { id: 'creating-voice', label: 'Creating Teacher Voice' },
  { id: 'synchronizing-subtitles', label: 'Synchronizing Subtitles' },
  { id: 'rendering-mp4', label: 'Rendering MP4' },
  { id: 'completed', label: 'Completed' },
];

const LANGUAGE_OPTIONS: Array<{ id: VideoLanguage; label: string; native: string }> = [
  { id: 'odia', label: 'Odia', native: 'ଓଡ଼ିଆ' },
  { id: 'hindi', label: 'Hindi', native: 'हिन्दी' },
  { id: 'english', label: 'English', native: 'English' },
];

const DURATION_OPTIONS: Array<{ value: VideoDurationMinutes; label: string; hint: string }> = [
  { value: 2, label: '2 Minutes', hint: 'Quick Concept Clarity' },
  { value: 3, label: '3 Minutes', hint: 'Standard Classroom Lesson' },
  { value: 5, label: '5 Minutes', hint: 'Deep Step-by-Step Guide' },
];

export const VideoGeneratorView: React.FC<VideoGeneratorViewProps> = ({
  exams,
  settings,
  studentToken,
  studentProfile,
  onSessionReady,
  onNavigateModule,
}) => {
  const isRegisteredStudent = Boolean(studentToken && studentProfile);

  // Student Sign-in / Register Form
  const [authName, setAuthName] = useState(studentProfile?.name || '');
  const [authEmail, setAuthEmail] = useState(studentProfile?.email || '');
  const [authPasscode, setAuthPasscode] = useState('');
  const [authClass, setAuthClass] = useState(studentProfile?.classLevel || 'Class 10');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Public Video Config + Student Wallet
  const [publicConfig, setPublicConfig] = useState<StudentVideoWalletResponse['config'] | null>(
    null,
  );
  const [wallet, setWallet] = useState<StudentVideoWalletResponse | null>(null);
  const [jobs, setJobs] = useState<VideoGenerationJobRecord[]>([]);
  const [latestVideo, setLatestVideo] = useState<PlayableVideoItem | null>(null);

  // Centralized Syllabus & Video Form State
  const [selectedExamId, setSelectedExamId] = useState<string>('');
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [selectedChapter, setSelectedChapter] = useState<string>('');
  const [selectedTopic, setSelectedTopic] = useState<string>('');
  const [useCustomTopic, setUseCustomTopic] = useState(false);
  const [topicInput, setTopicInput] = useState('');
  const [language, setLanguage] = useState<VideoLanguage>(
    settings.language === 'odia'
      ? 'odia'
      : settings.language === 'hindi'
        ? 'hindi'
        : 'english',
  );
  const [durationMinutes, setDurationMinutes] = useState<VideoDurationMinutes>(2);

  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Checkout Modal State
  const [checkoutModal, setCheckoutModal] = useState<{
    orderId: string;
    orderToken: string;
    planName: string;
    amountInr: number;
    validityMonths: number;
    creditsGranted: number;
    gatewayMode: string;
  } | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'upi' | 'card' | 'netbanking'>('upi');
  const [checkoutBusy, setCheckoutBusy] = useState(false);

  const loadConfigAndWallet = useCallback(async () => {
    try {
      const cfg = await fetchPublicVideoConfig();
      setPublicConfig(cfg);
      if (isRegisteredStudent && studentToken) {
        const [w, jRes] = await Promise.all([
          fetchStudentVideoWallet(studentToken),
          fetchStudentVideoJobs(studentToken),
        ]);
        setWallet(w);
        setJobs(jRes.jobs);
      }
    } catch {
      // Ignore transient errors
    }
  }, [isRegisteredStudent, studentToken]);

  useEffect(() => {
    void loadConfigAndWallet();
  }, [loadConfigAndWallet]);

  // Poll jobs automatically while any job is queued or processing (persists across module navigation)
  const hasActiveJobs = useMemo(
    () => jobs.some((j) => j.status === 'queued' || j.status === 'processing'),
    [jobs],
  );

  useEffect(() => {
    if (!isRegisteredStudent || !studentToken || !hasActiveJobs) return;
    const timer = window.setInterval(async () => {
      try {
        const jRes = await fetchStudentVideoJobs(studentToken);
        setJobs(jRes.jobs);
        const stillRunning = jRes.jobs.some(
          (j) => j.status === 'queued' || j.status === 'processing',
        );
        if (!stillRunning) {
          const [w, vRes] = await Promise.all([
            fetchStudentVideoWallet(studentToken),
            fetchStudentVideos(studentToken),
          ]);
          setWallet(w);
          const newestCompleted = jRes.jobs.find((j) => j.status === 'completed' && j.videoId);
          if (newestCompleted?.videoId) {
            const matched = vRes.videos.find((v) => v.id === newestCompleted.videoId);
            if (matched) setLatestVideo(matched);
          }
        }
      } catch {
        // Ignore transient poll errors
      }
    }, 1800);
    return () => window.clearInterval(timer);
  }, [isRegisteredStudent, studentToken, hasActiveJobs]);

  // Centralized Exam -> Class -> Subject -> Chapter -> Topic cascading memos
  const selectedExam = useMemo(
    () => exams.find((e) => e.id === selectedExamId) || null,
    [exams, selectedExamId],
  );
  const availableClasses = useMemo(
    () => selectedExam?.classesOrPapers || [],
    [selectedExam],
  );
  const selectedClass = useMemo(
    () => availableClasses.find((c) => c.id === selectedClassId) || null,
    [availableClasses, selectedClassId],
  );
  const availableSubjects = useMemo(
    () => selectedClass?.subjects || [],
    [selectedClass],
  );
  const selectedSubjectObj = useMemo(
    () => availableSubjects.find((s) => s.name === selectedSubject) || null,
    [availableSubjects, selectedSubject],
  );
  const availableChapters = useMemo(
    () => selectedSubjectObj?.chapters || [],
    [selectedSubjectObj],
  );
  const selectedChapterObj = useMemo(
    () => availableChapters.find((ch) => ch.name === selectedChapter) || null,
    [availableChapters, selectedChapter],
  );
  const availableTopics = useMemo(
    () => selectedChapterObj?.topics || [],
    [selectedChapterObj],
  );

  // Sync valid defaults when centralized catalog updates via SSE
  useEffect(() => {
    if (selectedExamId && !exams.some((e) => e.id === selectedExamId)) {
      setSelectedExamId('');
      setSelectedClassId('');
      setSelectedSubject('');
      setSelectedChapter('');
      setSelectedTopic('');
    }
  }, [exams, selectedExamId]);

  useEffect(() => {
    if (selectedClassId && !availableClasses.some((c) => c.id === selectedClassId)) {
      setSelectedClassId('');
      setSelectedSubject('');
      setSelectedChapter('');
      setSelectedTopic('');
    }
  }, [availableClasses, selectedClassId]);

  useEffect(() => {
    if (selectedSubject && !availableSubjects.some((s) => s.name === selectedSubject)) {
      setSelectedSubject('');
      setSelectedChapter('');
      setSelectedTopic('');
    }
  }, [availableSubjects, selectedSubject]);

  useEffect(() => {
    if (selectedChapter && !availableChapters.some((ch) => ch.name === selectedChapter)) {
      setSelectedChapter('');
      setSelectedTopic('');
    }
  }, [availableChapters, selectedChapter]);

  // Auto-fill topic field cleanly when user picks a syllabus topic
  useEffect(() => {
    if (!useCustomTopic && selectedTopic) {
      setTopicInput(selectedTopic);
    } else if (!useCustomTopic && selectedChapter && !selectedTopic) {
      setTopicInput(selectedChapter);
    }
  }, [selectedTopic, selectedChapter, useCustomTopic]);

  const effectiveCfg = wallet?.config || publicConfig;
  const allowedLangs = effectiveCfg?.allowedLanguages || ['odia', 'hindi', 'english'];
  const maxDur = effectiveCfg?.maxDurationMinutes || 5;

  useEffect(() => {
    if (!allowedLangs.includes(language) && allowedLangs.length > 0) {
      setLanguage(allowedLangs[0]);
    }
  }, [allowedLangs, language]);

  useEffect(() => {
    if (durationMinutes > maxDur) {
      setDurationMinutes(maxDur);
    }
  }, [durationMinutes, maxDur]);

  const handleStudentLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authName.trim() || !authEmail.trim()) return;
    setAuthLoading(true);
    setAuthError(null);
    try {
      const res = await signInStudentWithPasscode({
        name: authName.trim(),
        email: authEmail.trim(),
        passcode: authPasscode.trim() || undefined,
        classLevel: authClass.trim() || 'Class 10',
      });
      onSessionReady(res.token, res.student);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleStartCheckout = async () => {
    if (!studentToken) return;
    setActionError(null);
    setCheckoutBusy(true);
    try {
      const order = await createVideoSubscriptionOrder(studentToken);
      setCheckoutModal(order);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to start checkout.');
    } finally {
      setCheckoutBusy(false);
    }
  };

  const handleConfirmPayment = async () => {
    if (!studentToken || !checkoutModal) return;
    setCheckoutBusy(true);
    setActionError(null);
    try {
      await verifyVideoSubscriptionPayment(studentToken, {
        orderToken: checkoutModal.orderToken,
        paymentMethod,
      });
      setCheckoutModal(null);
      await loadConfigAndWallet();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Payment verification failed.');
    } finally {
      setCheckoutBusy(false);
    }
  };

  const handleGenerateVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentToken) return;
    const effectiveTopic = topicInput.trim() || selectedTopic || selectedChapter;
    if (!effectiveTopic) {
      setActionError('Please enter a topic or choose a chapter/topic from your syllabus.');
      return;
    }

    setSubmitting(true);
    setActionError(null);
    setLatestVideo(null);
    try {
      const { job } = await startVideoGenerationJob(studentToken, {
        topic: effectiveTopic,
        customTopic: useCustomTopic ? topicInput.trim() : undefined,
        examId: selectedExam?.id,
        examName: selectedExam?.name,
        classId: selectedClass?.id,
        classLabel: selectedClass?.label,
        subject: selectedSubject || undefined,
        chapter: selectedChapter || undefined,
        syllabusTopic: selectedTopic || undefined,
        language,
        durationMinutes,
        selectionMode: settings.selectionMode,
        provider: settings.provider,
        model: settings.model,
      });
      setJobs((prev) => [job, ...prev.filter((x) => x.id !== job.id)]);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to start video generation.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetryJob = async (jobId: string) => {
    if (!studentToken) return;
    setActionError(null);
    try {
      const { job } = await retryFailedVideoJob(studentToken, jobId);
      setJobs((prev) => prev.map((j) => (j.id === job.id ? job : j)));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Retry failed.');
    }
  };

  const latestJob = jobs[0] || null;
  const activeStepIndex = useMemo(() => {
    if (!latestJob) return -1;
    if (latestJob.stage === 'queued') return 0;
    return PIPELINE_STEPS.findIndex((s) => s.id === latestJob.stage);
  }, [latestJob]);

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header Hero */}
        <div className="rounded-2xl border border-violet-200 dark:border-violet-900/60 bg-gradient-to-br from-violet-50 via-white to-indigo-50 dark:from-slate-900 dark:via-slate-900 dark:to-violet-950/30 p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-violet-600/10 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300 text-xs font-bold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Animated Educational Slides + AI Teacher Voice + Diagrams + Subtitles</span>
            </div>
            <h1 className="font-display font-bold text-2xl text-slate-900 dark:text-white">
              AI Video Generator
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300 max-w-2xl">
              Generate real playable MP4 educational lessons in Odia, Hindi, or English synced
              with your published syllabus, labeled vector diagrams, AI teacher voice, and
              toggleable subtitles.
            </p>
          </div>

          <button
            type="button"
            onClick={() => onNavigateModule('my-videos')}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-sm font-semibold text-slate-800 dark:text-slate-100 shrink-0 min-h-[42px]"
          >
            <Film className="w-4 h-4 text-violet-600 dark:text-violet-400" />
            <span>My Generated Videos</span>
          </button>
        </div>

        {/* Admin Feature Toggle Notice */}
        {effectiveCfg && !effectiveCfg.enabled && (
          <div className="rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-4 flex items-center gap-3 text-sm text-amber-900 dark:text-amber-200">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>
              AI Video Generator is currently paused by the Administrator. You can still view
              your previously generated videos under <strong>My Generated Videos</strong>.
            </span>
          </div>
        )}

        {/* Student Authentication Gate (Required for Private Ownership & Subscription Credits) */}
        {!isRegisteredStudent ? (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 max-w-xl mx-auto shadow-xs space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-violet-100 dark:bg-violet-950/60 text-violet-600 dark:text-violet-300 flex items-center justify-center">
                <UserCheck className="w-6 h-6" />
              </div>
              <div>
                <h2 className="font-display font-bold text-lg text-slate-900 dark:text-white">
                  Sign In to Your Student Account
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Required to unlock AI Video Generator Premium, protect your private videos, and
                  sync your credits.
                </p>
              </div>
            </div>

            {authError && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
                {authError}
              </div>
            )}

            <form onSubmit={(e) => void handleStudentLogin(e)} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={authName}
                  onChange={(e) => setAuthName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Student Email *
                </label>
                <input
                  type="email"
                  required
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="student@example.com"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Account Passcode (4+ chars)
                  </label>
                  <input
                    type="password"
                    value={authPasscode}
                    onChange={(e) => setAuthPasscode(e.target.value)}
                    placeholder="Set or enter PIN"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Class / Exam Track
                  </label>
                  <input
                    type="text"
                    value={authClass}
                    onChange={(e) => setAuthClass(e.target.value)}
                    placeholder="Class 10"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={authLoading}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold disabled:opacity-50 min-h-[44px]"
              >
                {authLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                <span>Continue as Student</span>
              </button>
            </form>
          </div>
        ) : (
          <>
            {/* Subscription & Credits Status Card */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div
                  className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                    wallet?.hasActiveSubscription && wallet.effectiveCreditsRemaining > 0
                      ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                      : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                  }`}
                >
                  {wallet?.hasActiveSubscription ? (
                    <ShieldCheck className="w-6 h-6" />
                  ) : (
                    <Lock className="w-6 h-6" />
                  )}
                </div>
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display font-bold text-base text-slate-900 dark:text-white">
                      {effectiveCfg?.planName || 'AI Video Generator Premium'}
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded-md text-xs font-bold ${
                        wallet?.hasActiveSubscription
                          ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {wallet?.hasActiveSubscription ? 'Active Plan' : 'Not Subscribed'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Signed in as <strong>{studentProfile?.name}</strong> ({studentProfile?.email}) ·{' '}
                    {wallet?.hasActiveSubscription && wallet.subscription
                      ? `Valid until ${new Date(wallet.subscription.expiresAt).toLocaleDateString()} · ${wallet.effectiveCreditsRemaining} video credit(s) remaining (1 credit deducted only after MP4 completion)`
                      : `Unlock ${effectiveCfg?.defaultCredits ?? 5} AI educational video credits for ${effectiveCfg?.validityMonths ?? 6} months at just ₹${effectiveCfg?.priceInr ?? 49}.`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <div className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-center">
                  <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    Credits Left
                  </div>
                  <div className="font-display font-bold text-lg text-violet-700 dark:text-violet-300">
                    {wallet?.effectiveCreditsRemaining ?? 0}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={checkoutBusy}
                  onClick={() => void handleStartCheckout()}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold min-h-[42px] disabled:opacity-50"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>
                    {wallet?.hasActiveSubscription
                      ? `Add ${effectiveCfg?.defaultCredits ?? 5} Credits (₹${effectiveCfg?.priceInr ?? 49})`
                      : `Subscribe ₹${effectiveCfg?.priceInr ?? 49} / ${effectiveCfg?.validityMonths ?? 6} Mo`}
                  </span>
                </button>
              </div>
            </div>

            {actionError && (
              <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 p-3.5 flex items-start justify-between gap-3 text-sm text-red-700 dark:text-red-300">
                <span>{actionError}</span>
                <button type="button" onClick={() => setActionError(null)}>
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Main Generator Form + Live Pipeline Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left 7 Cols: Centralized Syllabus & Parameters Form */}
              <form
                onSubmit={(e) => void handleGenerateVideo(e)}
                className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-5"
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-display font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                    <Layers className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                    <span>Lesson Topic &amp; Syllabus Setup</span>
                  </h2>
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-violet-700 dark:text-violet-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useCustomTopic}
                      onChange={(e) => setUseCustomTopic(e.target.checked)}
                      className="rounded border-slate-300"
                    />
                    <span>Custom Topic Mode</span>
                  </label>
                </div>

                {/* Direct Topic Input */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                    Video Topic / Lesson Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={topicInput}
                    onChange={(e) => setTopicInput(e.target.value)}
                    placeholder="e.g., Photosynthesis Process, Newton's Laws of Motion, Quadratic Equations..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm focus:outline-none focus:border-violet-500"
                  />
                </div>

                {/* Centralized Published Syllabus Cascading Selectors */}
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    <BookOpen className="w-3.5 h-3.5 text-violet-600" />
                    <span>Connect from Centralized Syllabus (Optional for Custom Topic)</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                        Exam / Board
                      </label>
                      <select
                        value={selectedExamId}
                        onChange={(e) => {
                          setSelectedExamId(e.target.value);
                          setSelectedClassId('');
                          setSelectedSubject('');
                          setSelectedChapter('');
                          setSelectedTopic('');
                        }}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                      >
                        <option value="">-- Select Exam --</option>
                        {exams.map((ex) => (
                          <option key={ex.id} value={ex.id}>
                            {ex.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                        Class / Paper
                      </label>
                      <select
                        value={selectedClassId}
                        disabled={!selectedExam}
                        onChange={(e) => {
                          setSelectedClassId(e.target.value);
                          setSelectedSubject('');
                          setSelectedChapter('');
                          setSelectedTopic('');
                        }}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm disabled:opacity-50"
                      >
                        <option value="">-- Select Class --</option>
                        {availableClasses.map((cls) => (
                          <option key={cls.id} value={cls.id}>
                            {cls.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                        Subject
                      </label>
                      <select
                        value={selectedSubject}
                        disabled={!selectedClass}
                        onChange={(e) => {
                          setSelectedSubject(e.target.value);
                          setSelectedChapter('');
                          setSelectedTopic('');
                        }}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm disabled:opacity-50"
                      >
                        <option value="">-- Select Subject --</option>
                        {availableSubjects.map((s) => (
                          <option key={s.name} value={s.name}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                        Chapter
                      </label>
                      <select
                        value={selectedChapter}
                        disabled={!selectedSubjectObj}
                        onChange={(e) => {
                          setSelectedChapter(e.target.value);
                          setSelectedTopic('');
                        }}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm disabled:opacity-50"
                      >
                        <option value="">-- Select Chapter --</option>
                        {availableChapters.map((ch) => (
                          <option key={ch.name} value={ch.name}>
                            {ch.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      Topic
                    </label>
                    <select
                      value={selectedTopic}
                      disabled={!selectedChapterObj}
                      onChange={(e) => setSelectedTopic(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm disabled:opacity-50"
                    >
                      <option value="">-- Select Topic (or Full Chapter) --</option>
                      {availableTopics.map((tp) => (
                        <option key={tp} value={tp}>
                          {tp}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Language & Duration Selection */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">
                      Narration &amp; Slide Language
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {LANGUAGE_OPTIONS.map((opt) => {
                        const allowed = allowedLangs.includes(opt.id);
                        const active = language === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            disabled={!allowed}
                            onClick={() => setLanguage(opt.id)}
                            className={`p-2.5 rounded-xl border text-center transition-colors ${
                              active
                                ? 'border-violet-600 bg-violet-50 dark:bg-violet-950/50 text-violet-800 dark:text-violet-200'
                                : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300'
                            } disabled:opacity-40`}
                          >
                            <div className="text-xs font-bold">{opt.label}</div>
                            <div className="text-[11px] opacity-80">{opt.native}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">
                      Video Duration (Max {maxDur} min)
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {DURATION_OPTIONS.map((opt) => {
                        const allowed = opt.value <= maxDur;
                        const active = durationMinutes === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            disabled={!allowed}
                            onClick={() => setDurationMinutes(opt.value)}
                            className={`p-2.5 rounded-xl border text-center transition-colors ${
                              active
                                ? 'border-violet-600 bg-violet-50 dark:bg-violet-950/50 text-violet-800 dark:text-violet-200'
                                : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300'
                            } disabled:opacity-40`}
                          >
                            <div className="text-xs font-bold">{opt.label}</div>
                            <div className="text-[10px] opacity-75 truncate">{opt.hint}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Format summary + Generate CTA */}
                <div className="pt-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Script AI:{' '}
                    <strong>
                      {settings.selectionMode === 'auto'
                        ? 'Auto Policy'
                        : settings.provider === 'ollama'
                          ? `Ollama (${settings.model || 'local'})`
                          : `Gemini (${settings.model || 'gemini-4-hydrogen'})`}
                    </strong>{' '}
                    · Quality: <strong>{effectiveCfg?.videoQuality || '720p'} MP4</strong>
                  </div>

                  <button
                    type="submit"
                    disabled={
                      submitting ||
                      Boolean(effectiveCfg && !effectiveCfg.enabled) ||
                      !wallet?.hasActiveSubscription ||
                      (wallet?.effectiveCreditsRemaining ?? 0) < 1
                    }
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold shadow-sm disabled:opacity-50 min-h-[46px]"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Starting Pipeline...</span>
                      </>
                    ) : (
                      <>
                        <Video className="w-4 h-4" />
                        <span>Generate Video (1 Credit)</span>
                      </>
                    )}
                  </button>
                </div>
              </form>

              {/* Right 5 Cols: Real-Time 8-Step Pipeline Progress Tracker */}
              <div className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-display font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                    <Clock className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                    <span>Generation Progress</span>
                  </h2>
                  {latestJob && (
                    <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                      {latestJob.progressPercent}%
                    </span>
                  )}
                </div>

                {!latestJob ? (
                  <div className="p-6 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center space-y-2">
                    <Video className="w-8 h-8 mx-auto text-slate-400" />
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Ready to Render Your Lesson
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Select your syllabus topic, language, and duration, then click{' '}
                      <strong>Generate Video</strong>. Progress continues even if you switch tabs.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-bold text-slate-900 dark:text-white">
                            {latestJob.lessonTitle || latestJob.topic}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {latestJob.language.toUpperCase()} · {latestJob.durationMinutes} min ·{' '}
                            {latestJob.stageLabel}
                          </div>
                        </div>
                        {latestJob.status === 'processing' || latestJob.status === 'queued' ? (
                          <Loader2 className="w-5 h-5 text-violet-600 animate-spin shrink-0" />
                        ) : latestJob.status === 'completed' ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                        ) : (
                          <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                        )}
                      </div>

                      <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                        <div
                          className={`h-full transition-all duration-500 ${
                            latestJob.status === 'failed'
                              ? 'bg-red-500'
                              : latestJob.status === 'completed'
                                ? 'bg-emerald-500'
                                : 'bg-violet-600'
                          }`}
                          style={{ width: `${Math.max(4, latestJob.progressPercent)}%` }}
                        />
                      </div>
                    </div>

                    {/* 8 Pipeline Stages Checklist */}
                    <ol className="space-y-2">
                      {PIPELINE_STEPS.map((step, idx) => {
                        const isFailed = latestJob.status === 'failed';
                        const done =
                          latestJob.status === 'completed' ||
                          (!isFailed && activeStepIndex > idx);
                        const current = !isFailed && activeStepIndex === idx;
                        return (
                          <li
                            key={step.id}
                            className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold border ${
                              done
                                ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300'
                                : current
                                  ? 'border-violet-300 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/30 text-violet-800 dark:text-violet-200'
                                  : 'border-slate-200/70 dark:border-slate-800 text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            <span>
                              {idx + 1}. {step.label}
                            </span>
                            {done ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            ) : current ? (
                              <Loader2 className="w-4 h-4 animate-spin text-violet-600" />
                            ) : (
                              <span className="text-[10px] opacity-60">Pending</span>
                            )}
                          </li>
                        );
                      })}
                    </ol>

                    {latestJob.status === 'failed' && (
                      <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 space-y-2.5">
                        <div className="text-xs text-red-700 dark:text-red-300">
                          <strong>Generation Failed:</strong> {latestJob.errorMessage}
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleRetryJob(latestJob.id)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Retry Generation</span>
                        </button>
                      </div>
                    )}

                    {latestJob.status === 'completed' && (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => onNavigateModule('my-videos')}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>Open in My Generated Videos</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Instant Preview Player for Newly Completed Video */}
            {latestVideo && (
              <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-white dark:bg-slate-900 p-5 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <span className="text-xs font-bold text-emerald-600 uppercase tracking-wide">
                      Video Ready
                    </span>
                    <h3 className="font-display font-bold text-lg text-slate-900 dark:text-white">
                      {latestVideo.title}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigateModule('my-videos')}
                    className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                  >
                    View Full Library
                  </button>
                </div>
                <EducationalVideoPlayer video={latestVideo} />
              </div>
            )}
          </>
        )}
      </div>

      {/* Subscription Checkout Modal */}
      {checkoutModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="inline-block px-2.5 py-0.5 rounded-md bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 text-xs font-bold mb-1">
                  Subscription Checkout
                </span>
                <h3 className="font-display font-bold text-lg text-slate-900 dark:text-white">
                  {checkoutModal.planName}
                </h3>
              </div>
              <button
                type="button"
                disabled={checkoutBusy}
                onClick={() => setCheckoutModal(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">Plan Price</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  ₹{checkoutModal.amountInr}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">Validity Duration</span>
                <span className="font-semibold">{checkoutModal.validityMonths} Months</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">Video Credits Included</span>
                <span className="font-bold text-violet-600 dark:text-violet-400">
                  {checkoutModal.creditsGranted} Videos
                </span>
              </div>
              <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-200 dark:border-slate-800">
                Order ID: {checkoutModal.orderId} · Credits are never deducted on failed renders.
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Select Payment Method
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: 'upi', label: 'UPI / QR' },
                    { id: 'card', label: 'Debit / Credit' },
                    { id: 'netbanking', label: 'NetBanking' },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setPaymentMethod(m.id)}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold ${
                      paymentMethod === m.id
                        ? 'border-violet-600 bg-violet-50 dark:bg-violet-950/50 text-violet-700 dark:text-violet-200'
                        : 'border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={checkoutBusy}
                onClick={() => setCheckoutModal(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={checkoutBusy}
                onClick={() => void handleConfirmPayment()}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-50"
              >
                {checkoutBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                <span>Pay ₹{checkoutModal.amountInr} &amp; Activate</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
