import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Award,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Compass,
  Copy,
  Download,
  FileText,
  Landmark,
  Layers,
  Loader2,
  PenTool,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Target,
} from 'lucide-react';
import type {
  AppSettings,
  MockLanguage,
  MockTestAttempt,
  ModuleId,
  UpscMainsAnswerResult,
  UpscMainsEvaluationResult,
  UpscPublicCatalogResponse,
  UpscPublicPaperRecord,
  UpscStudyGuidanceResult,
} from '../types';
import {
  evaluateUpscMainsAnswerApi,
  generateUpscMainsAnswerApi,
  generateUpscStudyGuidanceApi,
} from '../utils/adminApi';
import { exportTextToPdf } from '../utils/pdfExport';
import { MarkdownRenderer } from './MarkdownRenderer';

interface UpscPortalViewProps {
  upscCatalog: UpscPublicCatalogResponse | null;
  settings: AppSettings;
  mockAttempts: MockTestAttempt[];
  onRefreshUpscCatalog: () => void;
  onNavigateModule: (module: ModuleId) => void;
}

type UpscTabId = 'overview' | 'mains-writer' | 'evaluate-answer' | 'study-strategy';

const UPSC_PROGRESS_KEY = 'sg_upsc_topic_progress_v1';

function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0;
}

export const UpscPortalView: React.FC<UpscPortalViewProps> = ({
  upscCatalog,
  settings,
  mockAttempts,
  onRefreshUpscCatalog,
  onNavigateModule,
}) => {
  const [activeTab, setActiveTab] = useState<UpscTabId>('overview');
  const [expandedPapers, setExpandedPapers] = useState<Record<string, boolean>>({});
  const [refreshing, setRefreshing] = useState(false);

  const prelimsPapers = upscCatalog?.prelims || [];
  const mainsPapers = upscCatalog?.mains || [];
  const allPublishedPapers = useMemo(
    () => [...prelimsPapers, ...mainsPapers],
    [prelimsPapers, mainsPapers],
  );

  // ---------------- Mains Answer Writing AI State ----------------
  const [writerPaperVersionId, setWriterPaperVersionId] = useState<string>('');
  const [writerArea, setWriterArea] = useState<string>('');
  const [writerPrompt, setWriterPrompt] = useState<string>('');
  const [writerMarks, setWriterMarks] = useState<number>(15);
  const [writerWordLimitPreset, setWriterWordLimitPreset] = useState<'150' | '250' | '1000' | 'custom'>('250');
  const [writerCustomWords, setWriterCustomWords] = useState<number>(200);
  const [writerLanguage, setWriterLanguage] = useState<MockLanguage>('english');
  const [generatingAnswer, setGeneratingAnswer] = useState(false);
  const [writerError, setWriterError] = useState('');
  const [answerResult, setAnswerResult] = useState<UpscMainsAnswerResult | null>(null);
  const [answerCopied, setAnswerCopied] = useState(false);

  useEffect(() => {
    if (mainsPapers.length > 0 && !mainsPapers.some((p) => p.syllabusVersionId === writerPaperVersionId)) {
      setWriterPaperVersionId(mainsPapers[0].syllabusVersionId);
    }
  }, [mainsPapers, writerPaperVersionId]);

  const activeWriterPaper = useMemo(
    () => mainsPapers.find((p) => p.syllabusVersionId === writerPaperVersionId) || null,
    [mainsPapers, writerPaperVersionId],
  );

  useEffect(() => {
    if (activeWriterPaper) {
      if (activeWriterPaper.paperId === 'mains-essay') {
        setWriterMarks(125);
        setWriterWordLimitPreset('1000');
      } else if (writerMarks === 125) {
        setWriterMarks(15);
        setWriterWordLimitPreset('250');
      }
      if (activeWriterPaper.areas[0] && !writerArea) {
        setWriterArea(activeWriterPaper.areas[0].title);
      }
    }
  }, [activeWriterPaper?.syllabusVersionId]);

  const resolvedWriterWordLimit =
    writerWordLimitPreset === 'custom'
      ? Math.max(80, Math.min(2000, Number(writerCustomWords) || 200))
      : Number(writerWordLimitPreset);

  const handleGenerateMainsAnswer = async () => {
    setWriterError('');
    if (!writerPrompt.trim()) {
      setWriterError('Enter a UPSC Mains question or topic to generate a structured model answer.');
      return;
    }
    setGeneratingAnswer(true);
    try {
      const res = await generateUpscMainsAnswerApi({
        syllabusVersionId: activeWriterPaper?.syllabusVersionId,
        paperLabel: activeWriterPaper?.paperLabel || 'UPSC Mains GS Paper',
        subjectArea: writerArea.trim() || activeWriterPaper?.areas[0]?.title || 'General Studies',
        questionOrTopic: writerPrompt.trim(),
        marks: writerMarks,
        wordLimit: resolvedWriterWordLimit,
        language: writerLanguage,
        selectionMode: settings.selectionMode,
        provider: settings.provider,
        model: settings.model,
      });
      setAnswerResult(res.result);
    } catch (err) {
      setWriterError(err instanceof Error ? err.message : 'Unable to generate UPSC Mains answer.');
    } finally {
      setGeneratingAnswer(false);
    }
  };

  // ---------------- Evaluate My Answer State ----------------
  const [evalPaperLabel, setEvalPaperLabel] = useState<string>('Mains GS Paper II');
  const [evalQuestion, setEvalQuestion] = useState<string>('');
  const [evalStudentAnswer, setEvalStudentAnswer] = useState<string>('');
  const [evalMarks, setEvalMarks] = useState<number>(15);
  const [evalWordLimit, setEvalWordLimit] = useState<number>(250);
  const [evalLanguage, setEvalLanguage] = useState<MockLanguage>('english');
  const [evaluating, setEvaluating] = useState(false);
  const [evalError, setEvalError] = useState('');
  const [evalResult, setEvalResult] = useState<UpscMainsEvaluationResult | null>(null);

  const studentWordCount = useMemo(() => countWords(evalStudentAnswer), [evalStudentAnswer]);

  const handleEvaluateAnswer = async () => {
    setEvalError('');
    if (!evalQuestion.trim()) {
      setEvalError('Enter the UPSC Mains question being answered.');
      return;
    }
    if (studentWordCount < 15) {
      setEvalError('Paste at least 15 words of your written answer for a meaningful evaluation.');
      return;
    }
    setEvaluating(true);
    try {
      const res = await evaluateUpscMainsAnswerApi({
        paperLabel: evalPaperLabel,
        question: evalQuestion.trim(),
        studentAnswer: evalStudentAnswer.trim(),
        marks: evalMarks,
        wordLimit: evalWordLimit,
        language: evalLanguage,
        selectionMode: settings.selectionMode,
        provider: settings.provider,
        model: settings.model,
      });
      setEvalResult(res.evaluation);
    } catch (err) {
      setEvalError(err instanceof Error ? err.message : 'Answer evaluation failed.');
    } finally {
      setEvaluating(false);
    }
  };

  // ---------------- Study Strategy & Syllabus Coverage Tracker ----------------
  const [completedTopics, setCompletedTopics] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(UPSC_PROGRESS_KEY);
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(UPSC_PROGRESS_KEY, JSON.stringify(completedTopics));
    } catch {
      // Ignore storage quota issues
    }
  }, [completedTopics]);

  const coverageStats = useMemo(() => {
    let total = 0;
    let done = 0;
    allPublishedPapers.forEach((p) => {
      p.areas.forEach((a) => {
        a.topics.forEach((t) => {
          total += 1;
          const key = `${p.syllabusVersionId}:${t.topicId}`;
          if (completedTopics[key]) done += 1;
        });
      });
    });
    return {
      total,
      done,
      pct: total > 0 ? Math.round((done / total) * 100) : 0,
    };
  }, [allPublishedPapers, completedTopics]);

  const upscMockStats = useMemo(() => {
    const upscAttempts = mockAttempts.filter((a) => a.config.category === 'upsc');
    const areaMap = new Map<string, { correct: number; total: number }>();
    let totalCorrect = 0;
    let totalQs = 0;

    upscAttempts.forEach((att) => {
      totalCorrect += att.correctCount;
      totalQs += att.questions.length;
      att.subjectBreakdown.forEach((sb) => {
        const cur = areaMap.get(sb.subject) || { correct: 0, total: 0 };
        cur.correct += sb.correct;
        cur.total += sb.total;
        areaMap.set(sb.subject, cur);
      });
    });

    const weakAreas = Array.from(areaMap.entries())
      .map(([area, st]) => ({
        area,
        accuracy: st.total > 0 ? Math.round((st.correct / st.total) * 100) : 0,
        total: st.total,
      }))
      .filter((x) => x.total > 0 && x.accuracy < 60)
      .sort((a, b) => a.accuracy - b.accuracy);

    return {
      attemptsCount: upscAttempts.length,
      overallAccuracy: totalQs > 0 ? Math.round((totalCorrect / totalQs) * 100) : 0,
      weakAreas,
    };
  }, [mockAttempts]);

  const [dailyHours, setDailyHours] = useState<number>(6);
  const [targetCycle, setTargetCycle] = useState<string>('UPSC CSE Prelims + Mains 2026 Cycle');
  const [strategyLanguage, setStrategyLanguage] = useState<MockLanguage>('english');
  const [generatingStrategy, setGeneratingStrategy] = useState(false);
  const [strategyError, setStrategyError] = useState('');
  const [strategyResult, setStrategyResult] = useState<UpscStudyGuidanceResult | null>(null);

  const handleGenerateStrategy = async () => {
    setStrategyError('');
    setGeneratingStrategy(true);
    try {
      const res = await generateUpscStudyGuidanceApi({
        dailyHours,
        targetCycle: targetCycle.trim() || 'Integrated Prelims + Mains Preparation',
        completedTopicCount: coverageStats.done,
        totalPublishedTopics: coverageStats.total,
        weakAreas: upscMockStats.weakAreas.map((w) => `${w.area} (${w.accuracy}% accuracy)`),
        publishedPapersSummary: allPublishedPapers.map(
          (p) => `${p.paperLabel}${p.optionalSubjectName ? ` (${p.optionalSubjectName})` : ''}: ${p.areaCount} areas, ${p.topicCount} topics`,
        ),
        language: strategyLanguage,
        selectionMode: settings.selectionMode,
        provider: settings.provider,
        model: settings.model,
      });
      setStrategyResult(res.guidance);
    } catch (err) {
      setStrategyError(err instanceof Error ? err.message : 'Unable to generate study strategy.');
    } finally {
      setGeneratingStrategy(false);
    }
  };

  const renderPaperList = (papers: UpscPublicPaperRecord[], emptyLabel: string) => {
    if (papers.length === 0) {
      return (
        <div className="p-5 rounded-xl border border-dashed border-[#CBD5E1] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950/60 text-xs sm:text-sm text-[#64748B] dark:text-slate-400">
          {emptyLabel}
        </div>
      );
    }

    return (
      <div className="space-y-2.5">
        {papers.map((paper) => {
          const isOpen = Boolean(expandedPapers[paper.syllabusVersionId]);
          return (
            <div
              key={paper.syllabusVersionId}
              className="rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-[#F8FAFC] dark:bg-slate-950 overflow-hidden"
            >
              <button
                type="button"
                onClick={() =>
                  setExpandedPapers((prev) => ({
                    ...prev,
                    [paper.syllabusVersionId]: !prev[paper.syllabusVersionId],
                  }))
                }
                className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-white/70 dark:hover:bg-slate-900/70 transition-colors"
              >
                <div className="min-w-0">
                  <div className="text-sm font-bold text-[#0F172A] dark:text-white truncate">
                    {paper.paperLabel}
                    {paper.optionalSubjectName ? ` — ${paper.optionalSubjectName}` : ''}
                  </div>
                  <div className="text-[11px] text-[#64748B] dark:text-slate-400 mt-0.5 tabular-nums">
                    {paper.versionLabel} · {paper.areaCount} areas · {paper.topicCount} topics ·{' '}
                    {paper.markingPattern.totalMarks} marks / {paper.markingPattern.durationMinutes} min
                  </div>
                </div>
                {isOpen ? (
                  <ChevronDown className="w-4 h-4 text-[#4338CA] shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-[#64748B] shrink-0" />
                )}
              </button>

              {isOpen && (
                <div className="px-4 pb-3.5 pt-2 border-t border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2">
                  {paper.markingPattern.wordLimitGuidelines && (
                    <div className="text-[11px] text-[#2563EB] dark:text-cyan-300 font-medium">
                      Pattern: {paper.markingPattern.wordLimitGuidelines}
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {paper.areas.map((area) => (
                      <div
                        key={area.areaId}
                        className="p-2.5 rounded-lg border border-[#E2E8F0] dark:border-slate-800 bg-[#F8FAFC] dark:bg-slate-950"
                      >
                        <div className="text-xs font-bold text-[#0F172A] dark:text-white">
                          {area.title}
                        </div>
                        <ul className="mt-1 space-y-0.5 text-[11px] text-[#64748B] dark:text-slate-400 list-disc pl-4">
                          {area.topics.slice(0, 6).map((t) => (
                            <li key={t.topicId}>{t.title}</li>
                          ))}
                          {area.topics.length > 6 && (
                            <li className="italic">+{area.topics.length - 6} more published topics</li>
                          )}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* UPSC Header Banner */}
      <div className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
        <div className="px-6 py-5 bg-gradient-to-r from-[#4338CA] to-[#2563EB] text-white flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-200">
              <Landmark className="w-4 h-4" />
              <span>UPSC — Civil Services Examination Hub</span>
            </div>
            <h1 className="font-display font-bold text-2xl mt-1">
              UPSC Prelims &amp; Mains Preparation System
            </h1>
            <p className="text-xs text-indigo-100 mt-1 max-w-2xl">
              Strictly powered by Admin-published UPSC Prelims &amp; Mains syllabuses — integrated with Prelims Mock Tests, Question Generation, Mains Answer Writing AI, Answer Evaluation, and Topic Coverage Tracking.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setRefreshing(true);
              onRefreshUpscCatalog();
              setTimeout(() => setRefreshing(false), 600);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-semibold transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Sync Syllabus</span>
          </button>
        </div>

        {/* Sub-navigation Tabs */}
        <div className="px-4 sm:px-6 py-2.5 bg-[#F8FAFC] dark:bg-slate-950 border-t border-[#E2E8F0] dark:border-slate-800 flex flex-wrap gap-2">
          {(
            [
              { id: 'overview', label: 'Prelims & Mains Syllabus', icon: Layers },
              { id: 'mains-writer', label: 'Mains Answer Writing AI', icon: PenTool },
              { id: 'evaluate-answer', label: 'Evaluate My Answer', icon: ClipboardCheck },
              { id: 'study-strategy', label: 'Study Strategy & Tracker', icon: Compass },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  active
                    ? 'bg-gradient-to-r from-[#4338CA] to-[#2563EB] text-white shadow-xs'
                    : 'bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 text-[#64748B] hover:text-[#0F172A] dark:hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB 1: OVERVIEW (TWO HERO CARDS: PRELIMS + MAINS) */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* UPSC PRELIMS CARD */}
            <div className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 p-6 flex flex-col justify-between space-y-5 shadow-xs">
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-[#2563EB] dark:text-cyan-300">
                      Stage I · Objective Screening
                    </div>
                    <h2 className="font-display font-bold text-xl text-[#0F172A] dark:text-white mt-0.5">
                      UPSC PRELIMS
                    </h2>
                    <p className="text-xs text-[#64748B] dark:text-slate-400 mt-1">
                      General Studies Paper I (+2 / -0.66) &amp; CSAT Paper II (+2.5 / -0.83) — published syllabus topics only.
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-[#4338CA] dark:text-indigo-300 flex items-center justify-center shrink-0">
                    <Target className="w-5 h-5" />
                  </div>
                </div>

                {renderPaperList(
                  prelimsPapers,
                  'No Prelims syllabus has been published by Admin yet. Admin can upload & publish Prelims GS Paper I and CSAT Paper II from Admin Panel → Upload Syllabus.',
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2.5 pt-3 border-t border-[#E2E8F0] dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => onNavigateModule('mock-test')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[#4338CA] to-[#2563EB] text-white text-xs font-bold shadow-xs"
                >
                  <Award className="w-3.5 h-3.5" />
                  <span>Start Prelims Mock Test</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigateModule('questions')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 text-xs font-semibold hover:border-[#4338CA]"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#4338CA]" />
                  <span>Generate UPSC Questions</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigateModule('pdf-notes')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 text-xs font-semibold hover:border-[#06B6D4]"
                >
                  <FileText className="w-3.5 h-3.5 text-[#06B6D4]" />
                  <span>UPSC PDF Notes</span>
                </button>
              </div>
            </div>

            {/* UPSC MAINS CARD */}
            <div className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 p-6 flex flex-col justify-between space-y-5 shadow-xs">
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-[#4338CA] dark:text-indigo-300">
                      Stage II · Analytical Written Exam
                    </div>
                    <h2 className="font-display font-bold text-xl text-[#0F172A] dark:text-white mt-0.5">
                      UPSC MAINS
                    </h2>
                    <p className="text-xs text-[#64748B] dark:text-slate-400 mt-1">
                      Essay, General Studies Papers I–IV (250 Marks each) &amp; Optional Subjects — structured answer practice.
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-cyan-50 dark:bg-cyan-950/40 text-[#06B6D4] flex items-center justify-center shrink-0">
                    <BookOpen className="w-5 h-5" />
                  </div>
                </div>

                {renderPaperList(
                  mainsPapers,
                  'No Mains syllabus has been published by Admin yet. You can still practice structured UPSC Mains Answer Writing & Answer Evaluation using the tabs above.',
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2.5 pt-3 border-t border-[#E2E8F0] dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setActiveTab('mains-writer')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[#4338CA] to-[#2563EB] text-white text-xs font-bold shadow-xs"
                >
                  <PenTool className="w-3.5 h-3.5" />
                  <span>Mains Answer Writing AI</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('evaluate-answer')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 text-xs font-semibold hover:border-[#2563EB]"
                >
                  <ClipboardCheck className="w-3.5 h-3.5 text-[#2563EB]" />
                  <span>Evaluate My Answer</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigateModule('questions')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 text-xs font-semibold hover:border-[#4338CA]"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#4338CA]" />
                  <span>Mains Questions</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: MAINS ANSWER WRITING AI */}
      {activeTab === 'mains-writer' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5 shadow-xs">
            <div>
              <h2 className="font-display font-bold text-lg text-[#0F172A] dark:text-white">
                UPSC Mains Answer Writing AI
              </h2>
              <p className="text-xs text-[#64748B] dark:text-slate-400 mt-0.5">
                Enter a Mains question or topic to generate a disciplined UPSC-format model answer (Introduction → Structured Subheadings → Examples/Context → Challenges → Way Forward → Conclusion) within your selected word limit.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-[#0F172A] dark:text-slate-200 mb-1">
                  Mains Paper
                </label>
                {mainsPapers.length > 0 ? (
                  <select
                    value={writerPaperVersionId}
                    onChange={(e) => {
                      setWriterPaperVersionId(e.target.value);
                      const p = mainsPapers.find((x) => x.syllabusVersionId === e.target.value);
                      if (p?.areas[0]) setWriterArea(p.areas[0].title);
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-sm"
                  >
                    {mainsPapers.map((p) => (
                      <option key={p.syllabusVersionId} value={p.syllabusVersionId}>
                        {p.paperLabel}
                        {p.optionalSubjectName ? ` (${p.optionalSubjectName})` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={evalPaperLabel}
                    onChange={(e) => setEvalPaperLabel(e.target.value)}
                    placeholder="e.g. Mains GS Paper II"
                    className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-sm"
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#0F172A] dark:text-slate-200 mb-1">
                  Subject Area
                </label>
                {activeWriterPaper && activeWriterPaper.areas.length > 0 ? (
                  <select
                    value={writerArea}
                    onChange={(e) => setWriterArea(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-sm"
                  >
                    {activeWriterPaper.areas.map((a) => (
                      <option key={a.areaId} value={a.title}>
                        {a.title}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={writerArea}
                    onChange={(e) => setWriterArea(e.target.value)}
                    placeholder="e.g. Indian Polity & Governance"
                    className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-sm"
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#0F172A] dark:text-slate-200 mb-1">
                  Marks &amp; Word Limit
                </label>
                <div className="flex gap-2">
                  <select
                    value={writerMarks}
                    onChange={(e) => {
                      const m = Number(e.target.value);
                      setWriterMarks(m);
                      if (m === 10) setWriterWordLimitPreset('150');
                      else if (m === 15 || m === 20) setWriterWordLimitPreset('250');
                      else if (m === 125) setWriterWordLimitPreset('1000');
                    }}
                    className="w-28 px-2.5 py-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-sm tabular-nums"
                  >
                    <option value={10}>10 Marks</option>
                    <option value={15}>15 Marks</option>
                    <option value={20}>20 Marks</option>
                    <option value={125}>125 (Essay)</option>
                  </select>
                  <select
                    value={writerWordLimitPreset}
                    onChange={(e) =>
                      setWriterWordLimitPreset(
                        e.target.value as '150' | '250' | '1000' | 'custom',
                      )
                    }
                    className="flex-1 px-2.5 py-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-sm tabular-nums"
                  >
                    <option value="150">150 Words</option>
                    <option value="250">250 Words</option>
                    <option value="1000">1000 Words</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
                {writerWordLimitPreset === 'custom' && (
                  <input
                    type="number"
                    min={80}
                    max={2000}
                    value={writerCustomWords}
                    onChange={(e) => setWriterCustomWords(Number(e.target.value) || 200)}
                    placeholder="Custom words"
                    className="mt-1.5 w-full px-3 py-1.5 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-xs tabular-nums"
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#0F172A] dark:text-slate-200 mb-1">
                  Language
                </label>
                <select
                  value={writerLanguage}
                  onChange={(e) => setWriterLanguage(e.target.value as MockLanguage)}
                  className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-sm"
                >
                  <option value="english">English</option>
                  <option value="hindi">Hindi (हिंदी)</option>
                  <option value="odia">Odia (ଓଡ଼ିଆ)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0F172A] dark:text-slate-200 mb-1">
                UPSC Mains Question or Syllabus Topic *
              </label>
              <textarea
                rows={3}
                value={writerPrompt}
                onChange={(e) => setWriterPrompt(e.target.value)}
                placeholder="Paste a full UPSC Mains question (e.g., 'Examine the role of Parliamentary Committees in ensuring executive accountability in India...') OR enter just a syllabus topic (AI will frame a UPSC-standard question first and answer it)."
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-sm"
              />
            </div>

            {writerError && (
              <div className="p-3 rounded-xl border border-red-200 bg-red-50 text-xs text-[#DC2626] flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{writerError}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-[11px] text-[#64748B] dark:text-slate-400">
                Strict factual guardrails active — unverified Constitutional Articles or statistics will not be fabricated.
              </span>
              <button
                type="button"
                disabled={generatingAnswer}
                onClick={() => void handleGenerateMainsAnswer()}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#4338CA] to-[#2563EB] hover:from-[#3730A3] hover:to-[#1D4ED8] disabled:opacity-50 text-white text-sm font-bold shadow-xs"
              >
                {generatingAnswer ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Drafting Model Answer...</span>
                  </>
                ) : (
                  <>
                    <PenTool className="w-4 h-4" />
                    <span>Generate Structured Answer</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {answerResult && (
            <div className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4 shadow-xs">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#E2E8F0] dark:border-slate-800 pb-4">
                <div className="space-y-1">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[#4338CA] dark:text-indigo-300 tabular-nums">
                    {answerResult.paperLabel} · {answerResult.subjectArea} · {answerResult.marks} Marks · {answerResult.actualWordCount} / {answerResult.targetWordLimit} Words
                  </div>
                  <h3 className="font-display font-bold text-base text-[#0F172A] dark:text-white">
                    {answerResult.questionUsed}
                  </h3>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(
                        `Question: ${answerResult.questionUsed}\n\n${answerResult.fullFormattedMarkdown}`,
                      );
                      setAnswerCopied(true);
                      setTimeout(() => setAnswerCopied(false), 1800);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E2E8F0] dark:border-slate-700 text-xs font-semibold"
                  >
                    {answerCopied ? <Check className="w-3.5 h-3.5 text-[#16A34A]" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{answerCopied ? 'Copied' : 'Copy'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      exportTextToPdf(
                        `UPSC Mains Model Answer (${answerResult.marks} Marks)`,
                        `Question (${answerResult.paperLabel} · ${answerResult.marks} Marks · Target ${answerResult.targetWordLimit} words):\n${answerResult.questionUsed}\n\n${answerResult.fullFormattedMarkdown}\n\nNote: ${answerResult.disclaimer}`,
                        'UPSC_Mains_Model_Answer.pdf',
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#4338CA] to-[#2563EB] text-white text-xs font-bold"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export PDF</span>
                  </button>
                </div>
              </div>

              <div className="prose prose-sm dark:prose-invert max-w-none text-[#0F172A] dark:text-slate-200">
                <MarkdownRenderer content={answerResult.fullFormattedMarkdown} />
              </div>

              {answerResult.referencesUsed.length > 0 && (
                <div className="pt-3 border-t border-[#E2E8F0] dark:border-slate-800 text-xs text-[#64748B] dark:text-slate-400">
                  <strong className="text-[#0F172A] dark:text-white">Constitutional / Institutional Context Referenced:</strong>{' '}
                  {answerResult.referencesUsed.join(' · ')}
                </div>
              )}

              <div className="p-3 rounded-xl bg-[#F8FAFC] dark:bg-slate-950 border border-[#E2E8F0] dark:border-slate-800 text-[11px] text-[#64748B] dark:text-slate-400">
                {answerResult.disclaimer}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: EVALUATE MY ANSWER */}
      {activeTab === 'evaluate-answer' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display font-bold text-lg text-[#0F172A] dark:text-white">
                  Evaluate My Mains Answer
                </h2>
                <p className="text-xs text-[#64748B] dark:text-slate-400 mt-0.5">
                  Paste your written UPSC Mains answer for practice rubric feedback: Strengths, Missing Dimensions, Content Gaps, Structural Suggestions, and an Improved Sample Answer.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-[#0F172A] dark:text-slate-200 mb-1">
                  Mains Paper
                </label>
                <select
                  value={evalPaperLabel}
                  onChange={(e) => setEvalPaperLabel(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-sm"
                >
                  <option value="Mains Essay Paper">Mains Essay Paper</option>
                  <option value="Mains GS Paper I">Mains GS Paper I</option>
                  <option value="Mains GS Paper II">Mains GS Paper II</option>
                  <option value="Mains GS Paper III">Mains GS Paper III</option>
                  <option value="Mains GS Paper IV">Mains GS Paper IV (Ethics)</option>
                  <option value="Mains Optional Subject">Mains Optional Subject</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#0F172A] dark:text-slate-200 mb-1">
                  Max Marks
                </label>
                <select
                  value={evalMarks}
                  onChange={(e) => {
                    const m = Number(e.target.value);
                    setEvalMarks(m);
                    setEvalWordLimit(m === 10 ? 150 : m === 125 ? 1000 : 250);
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-sm tabular-nums"
                >
                  <option value={10}>10 Marks</option>
                  <option value={15}>15 Marks</option>
                  <option value={20}>20 Marks</option>
                  <option value={125}>125 Marks (Essay)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#0F172A] dark:text-slate-200 mb-1">
                  Target Word Limit
                </label>
                <input
                  type="number"
                  min={80}
                  max={2000}
                  value={evalWordLimit}
                  onChange={(e) => setEvalWordLimit(Number(e.target.value) || 250)}
                  className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-sm tabular-nums"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#0F172A] dark:text-slate-200 mb-1">
                  Language
                </label>
                <select
                  value={evalLanguage}
                  onChange={(e) => setEvalLanguage(e.target.value as MockLanguage)}
                  className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-sm"
                >
                  <option value="english">English</option>
                  <option value="hindi">Hindi (हिंदी)</option>
                  <option value="odia">Odia (ଓଡ଼ିଆ)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0F172A] dark:text-slate-200 mb-1">
                Question Prompt *
              </label>
              <input
                type="text"
                value={evalQuestion}
                onChange={(e) => setEvalQuestion(e.target.value)}
                placeholder="Enter the exact UPSC Mains question..."
                className="w-full px-3.5 py-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-sm"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-[#0F172A] dark:text-slate-200">
                  Your Written Answer *
                </label>
                <span className="text-xs font-semibold text-[#2563EB] dark:text-cyan-300 tabular-nums">
                  {studentWordCount} / {evalWordLimit} words
                </span>
              </div>
              <textarea
                rows={8}
                value={evalStudentAnswer}
                onChange={(e) => setEvalStudentAnswer(e.target.value)}
                placeholder="Paste your written UPSC Mains answer here..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-sm leading-relaxed"
              />
            </div>

            {evalError && (
              <div className="p-3 rounded-xl border border-red-200 bg-red-50 text-xs text-[#DC2626] flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{evalError}</span>
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                disabled={evaluating}
                onClick={() => void handleEvaluateAnswer()}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#4338CA] to-[#2563EB] hover:from-[#3730A3] hover:to-[#1D4ED8] disabled:opacity-50 text-white text-sm font-bold shadow-xs"
              >
                {evaluating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Evaluating Answer...</span>
                  </>
                ) : (
                  <>
                    <ClipboardCheck className="w-4 h-4" />
                    <span>Evaluate My Answer</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {evalResult && (
            <div className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5 shadow-xs">
              <div className="p-3.5 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 flex items-start gap-2.5 text-xs text-[#B45309] dark:text-amber-300 font-semibold">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{evalResult.disclaimer}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div className="p-4 rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-[#F8FAFC] dark:bg-slate-950">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">
                    AI Practice Estimated Score
                  </div>
                  <div className="mt-1 font-display font-bold text-2xl text-[#4338CA] dark:text-indigo-300 tabular-nums">
                    {evalResult.estimatedScore} / {evalResult.maxMarks}
                  </div>
                </div>
                <div className="p-4 rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-[#F8FAFC] dark:bg-slate-950 sm:col-span-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">
                    Word Limit Assessment ({evalResult.studentWordCount} / {evalResult.wordLimitTarget} words)
                  </div>
                  <div className="mt-1 text-sm font-medium text-[#0F172A] dark:text-white">
                    {evalResult.wordLimitAssessment}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20 space-y-1.5">
                  <div className="text-xs font-bold text-[#15803D] dark:text-emerald-300">
                    Strengths
                  </div>
                  <ul className="list-disc pl-4 text-xs text-[#0F172A] dark:text-slate-200 space-y-1">
                    {evalResult.strengths.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>

                <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20 space-y-1.5">
                  <div className="text-xs font-bold text-[#B45309] dark:text-amber-300">
                    Missing Points &amp; Dimensions
                  </div>
                  <ul className="list-disc pl-4 text-xs text-[#0F172A] dark:text-slate-200 space-y-1">
                    {evalResult.missingPoints.map((m, i) => (
                      <li key={i}>{m}</li>
                    ))}
                  </ul>
                </div>

                <div className="p-4 rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-[#F8FAFC] dark:bg-slate-950 space-y-1.5">
                  <div className="text-xs font-bold text-[#0F172A] dark:text-white">
                    Content Gaps
                  </div>
                  <ul className="list-disc pl-4 text-xs text-[#64748B] dark:text-slate-300 space-y-1">
                    {evalResult.contentGaps.map((g, i) => (
                      <li key={i}>{g}</li>
                    ))}
                  </ul>
                </div>

                <div className="p-4 rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-[#F8FAFC] dark:bg-slate-950 space-y-1.5">
                  <div className="text-xs font-bold text-[#0F172A] dark:text-white">
                    Structural &amp; Presentation Suggestions
                  </div>
                  <ul className="list-disc pl-4 text-xs text-[#64748B] dark:text-slate-300 space-y-1">
                    {evalResult.structuralSuggestions.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {evalResult.improvedSampleAnswer && (
                <div className="p-4 rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/40 dark:bg-indigo-950/20 space-y-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-[#4338CA] dark:text-indigo-300">
                    Improved Model Sample Answer
                  </div>
                  <div className="prose prose-sm dark:prose-invert max-w-none text-[#0F172A] dark:text-slate-200">
                    <MarkdownRenderer content={evalResult.improvedSampleAnswer} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: STUDY STRATEGY & SYLLABUS COVERAGE TRACKER */}
      {activeTab === 'study-strategy' && (
        <div className="space-y-6">
          {/* Metrics + Generator */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">
                Published Syllabus Coverage
              </div>
              <div className="font-display font-bold text-3xl text-[#4338CA] dark:text-indigo-300 tabular-nums">
                {coverageStats.pct}%
              </div>
              <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#4338CA] to-[#06B6D4] transition-all"
                  style={{ width: `${coverageStats.pct}%` }}
                />
              </div>
              <div className="text-xs text-[#64748B] dark:text-slate-400 tabular-nums">
                {coverageStats.done} of {coverageStats.total} published topics checked off
              </div>
            </div>

            <div className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">
                Prelims Mock Performance
              </div>
              <div className="font-display font-bold text-3xl text-[#2563EB] dark:text-cyan-300 tabular-nums">
                {upscMockStats.attemptsCount > 0 ? `${upscMockStats.overallAccuracy}%` : '—'}
              </div>
              <div className="text-xs text-[#64748B] dark:text-slate-400 tabular-nums">
                {upscMockStats.attemptsCount} UPSC mock attempt(s) recorded
              </div>
              {upscMockStats.weakAreas.length > 0 && (
                <div className="text-xs text-[#D97706] font-medium">
                  Needs revision: {upscMockStats.weakAreas.map((w) => `${w.area} (${w.accuracy}%)`).join(', ')}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
              <div className="text-xs font-bold text-[#0F172A] dark:text-white">
                Generate Personalized Study Strategy
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                    Hours / Day
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={14}
                    value={dailyHours}
                    onChange={(e) => setDailyHours(Number(e.target.value) || 6)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-xs tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                    Language
                  </label>
                  <select
                    value={strategyLanguage}
                    onChange={(e) => setStrategyLanguage(e.target.value as MockLanguage)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-xs"
                  >
                    <option value="english">English</option>
                    <option value="hindi">Hindi</option>
                    <option value="odia">Odia</option>
                  </select>
                </div>
              </div>
              <input
                type="text"
                value={targetCycle}
                onChange={(e) => setTargetCycle(e.target.value)}
                placeholder="Target exam cycle..."
                className="w-full px-2.5 py-1.5 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-xs"
              />
              <button
                type="button"
                disabled={generatingStrategy}
                onClick={() => void handleGenerateStrategy()}
                className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[#4338CA] to-[#2563EB] disabled:opacity-50 text-white text-xs font-bold"
              >
                {generatingStrategy ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Planning Strategy...</span>
                  </>
                ) : (
                  <>
                    <Compass className="w-3.5 h-3.5" />
                    <span>Build UPSC Study Plan</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {strategyError && (
            <div className="p-3.5 rounded-xl border border-red-200 bg-red-50 text-xs text-[#DC2626] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{strategyError}</span>
            </div>
          )}

          {strategyResult && (
            <div className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5 shadow-xs">
              <div className="p-3 rounded-xl bg-[#F8FAFC] dark:bg-slate-950 border border-[#E2E8F0] dark:border-slate-800 text-xs text-[#64748B] dark:text-slate-400">
                {strategyResult.disclaimer}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-[#F8FAFC] dark:bg-slate-950 space-y-1">
                  <div className="text-xs font-bold text-[#4338CA] dark:text-indigo-300">
                    Readiness Overview
                  </div>
                  <p className="text-xs text-[#0F172A] dark:text-slate-200 leading-relaxed">
                    {strategyResult.readinessOverview}
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-[#F8FAFC] dark:bg-slate-950 space-y-1">
                  <div className="text-xs font-bold text-[#2563EB] dark:text-cyan-300">
                    Prelims vs Mains Daily Balance
                  </div>
                  <p className="text-xs text-[#0F172A] dark:text-slate-200 leading-relaxed">
                    {strategyResult.prelimsMainsBalance}
                  </p>
                </div>
              </div>

              {strategyResult.weakTopicsPriority.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#64748B]">
                    Priority Weak Topics &amp; Revision Actions
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {strategyResult.weakTopicsPriority.map((w, i) => (
                      <div
                        key={i}
                        className="p-3 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/20 text-xs space-y-1"
                      >
                        <div className="font-bold text-[#0F172A] dark:text-white">{w.topic}</div>
                        <div className="text-[#64748B] dark:text-slate-300">{w.reason}</div>
                        <div className="font-medium text-[#15803D] dark:text-emerald-300">
                          Action: {w.action}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {strategyResult.weeklyPlan.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#64748B]">
                    Weekly Structured Schedule
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {strategyResult.weeklyPlan.map((b, i) => (
                      <div
                        key={i}
                        className="p-3 rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-[#F8FAFC] dark:bg-slate-950 text-xs space-y-1"
                      >
                        <div className="font-bold text-[#4338CA] dark:text-indigo-300">
                          {b.dayOrBlock} · {b.focus}
                        </div>
                        <div className="text-[#0F172A] dark:text-slate-200">{b.task}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {strategyResult.revisionStrategy.length > 0 && (
                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#64748B]">
                    Revision Protocol
                  </h4>
                  <ul className="list-disc pl-5 text-xs text-[#0F172A] dark:text-slate-200 space-y-1">
                    {strategyResult.revisionStrategy.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Published Syllabus Topic Checklist */}
          <div className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4 shadow-xs">
            <div>
              <h3 className="font-display font-bold text-base text-[#0F172A] dark:text-white">
                Published UPSC Syllabus Completion Checklist
              </h3>
              <p className="text-xs text-[#64748B] dark:text-slate-400">
                Check off topics as you finish reading &amp; revising them. Saved locally in your browser.
              </p>
            </div>

            {allPublishedPapers.length === 0 ? (
              <div className="p-6 rounded-xl border border-dashed border-[#CBD5E1] dark:border-slate-700 text-center text-xs text-[#64748B]">
                No UPSC syllabuses published yet by Admin. Topics will appear here automatically upon Admin publication.
              </div>
            ) : (
              <div className="space-y-4">
                {allPublishedPapers.map((paper) => (
                  <div
                    key={paper.syllabusVersionId}
                    className="rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-[#F8FAFC] dark:bg-slate-950 p-4 space-y-3"
                  >
                    <div className="font-display font-bold text-sm text-[#0F172A] dark:text-white flex flex-wrap items-center justify-between gap-2">
                      <span>
                        {paper.paperLabel}
                        {paper.optionalSubjectName ? ` — ${paper.optionalSubjectName}` : ''} ({paper.versionLabel})
                      </span>
                      <span className="text-xs font-semibold text-[#4338CA] dark:text-indigo-300 uppercase">
                        {paper.stage}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {paper.areas.map((area) => (
                        <div
                          key={area.areaId}
                          className="p-3 rounded-lg border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1.5"
                        >
                          <div className="text-xs font-bold text-[#0F172A] dark:text-white">
                            {area.title}
                          </div>
                          <div className="space-y-1">
                            {area.topics.map((t) => {
                              const k = `${paper.syllabusVersionId}:${t.topicId}`;
                              const checked = Boolean(completedTopics[k]);
                              return (
                                <label
                                  key={k}
                                  className="flex items-start gap-2 text-xs cursor-pointer py-0.5"
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(e) =>
                                      setCompletedTopics((prev) => ({
                                        ...prev,
                                        [k]: e.target.checked,
                                      }))
                                    }
                                    className="accent-[#4338CA] mt-0.5"
                                  />
                                  <span
                                    className={
                                      checked
                                        ? 'line-through text-[#64748B]'
                                        : 'text-[#0F172A] dark:text-slate-200'
                                    }
                                  >
                                    {t.title}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
