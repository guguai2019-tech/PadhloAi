import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Download,
  FileText,
  FolderOpen,
  Layers,
  Loader2,
  Play,
  RotateCcw,
  ShieldAlert,
  Trash2,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import type {
  AppSettings,
  ExamDefinition,
  MockQuestion,
  MockTestAttempt,
  MockTestConfig,
  SyllabusChapter,
  SyllabusPdfReference,
  SyllabusSubject,
} from '../types';
import { BSE_ODISHA_SYLLABUS_PDF_URL } from '../data/bseOdishaClass10Syllabus';
import { SYLLABUS_UI_TEXT, resolveUiLang } from '../data/uiTranslations';
import { generateAI, parseSafeJson } from '../utils/aiClient';
import { exportTopicQuestionsToPdf } from '../utils/pdfExport';
import { MarkdownRenderer } from './MarkdownRenderer';
import { SyllabusManagerModal } from './SyllabusManagerModal';

interface SyllabusExplorerProps {
  settings: AppSettings;
  exams: ExamDefinition[];
  syllabusPdfs: SyllabusPdfReference[];
  onAddCustomExam: (exam: ExamDefinition) => void;
  onUpdateExam?: (exam: ExamDefinition) => void;
  onAddChapterOrTopic: (
    examId: string,
    classId: string,
    subjectName: string,
    chapterName: string,
    topicName: string,
  ) => void;
  onAddSyllabusPdf: (pdfRef: SyllabusPdfReference) => void;
  onRemoveSyllabusPdf: (id: string) => void;
  onSaveAttempt: (attempt: MockTestAttempt) => void;
  onOpenFullMockTests: () => void;
  onOpenUpscHub?: () => void;
}

interface SelectedTopicContext {
  exam: ExamDefinition;
  classLabel: string;
  classId: string;
  subject: SyllabusSubject;
  chapter: SyllabusChapter;
  topicName: string;
}

const SUBJECT_ACCENTS = [
  'border-violet-200 dark:border-violet-800/80 bg-violet-50/65 dark:bg-violet-950/25 hover:border-violet-500 text-violet-900 dark:text-violet-100',
  'border-blue-200 dark:border-blue-800/80 bg-blue-50/65 dark:bg-blue-950/25 hover:border-blue-500 text-blue-900 dark:text-blue-100',
  'border-teal-200 dark:border-teal-800/80 bg-teal-50/65 dark:bg-teal-950/25 hover:border-teal-500 text-teal-900 dark:text-teal-100',
  'border-orange-200 dark:border-orange-800/80 bg-orange-50/65 dark:bg-orange-950/25 hover:border-orange-500 text-orange-900 dark:text-orange-100',
  'border-emerald-200 dark:border-emerald-800/80 bg-emerald-50/65 dark:bg-emerald-950/25 hover:border-emerald-500 text-emerald-900 dark:text-emerald-100',
  'border-pink-200 dark:border-pink-800/80 bg-pink-50/65 dark:bg-pink-950/25 hover:border-pink-500 text-pink-900 dark:text-pink-100',
];

export const SyllabusExplorer: React.FC<SyllabusExplorerProps> = ({
  settings,
  exams,
  syllabusPdfs,
  onAddCustomExam,
  onUpdateExam,
  onAddChapterOrTopic,
  onAddSyllabusPdf,
  onRemoveSyllabusPdf,
  onSaveAttempt,
  onOpenFullMockTests,
  onOpenUpscHub,
}) => {
  const uiLang = resolveUiLang(settings.language);
  const t = SYLLABUS_UI_TEXT[uiLang];

  // Filter out placeholder exams with empty classes
  const browsableExams = useMemo(
    () => exams.filter((e) => e.classesOrPapers.length > 0),
    [exams],
  );

  const [selectedExamId, setSelectedExamId] = useState<string>(
    browsableExams[0]?.id || 'bse-odisha',
  );
  const selectedExam = useMemo(
    () => browsableExams.find((e) => e.id === selectedExamId) || browsableExams[0],
    [browsableExams, selectedExamId],
  );

  const [selectedClassId, setSelectedClassId] = useState<string>(
    selectedExam?.classesOrPapers[0]?.id || '',
  );
  const selectedClass = useMemo(
    () =>
      selectedExam?.classesOrPapers.find((c) => c.id === selectedClassId) ||
      selectedExam?.classesOrPapers[0],
    [selectedExam, selectedClassId],
  );

  const [selectedSubjectName, setSelectedSubjectName] = useState<string>(
    selectedClass?.subjects[0]?.name || '',
  );
  const selectedSubject = useMemo(
    () =>
      selectedClass?.subjects.find((s) => s.name === selectedSubjectName) ||
      selectedClass?.subjects[0],
    [selectedClass, selectedSubjectName],
  );

  // Reconcile selections when centralized syllabus updates via SSE / Admin publish
  useEffect(() => {
    if (selectedExam && selectedExam.id !== selectedExamId) {
      setSelectedExamId(selectedExam.id);
    }
    if (selectedClass && selectedClass.id !== selectedClassId) {
      setSelectedClassId(selectedClass.id);
    }
    if (selectedSubject && selectedSubject.name !== selectedSubjectName) {
      setSelectedSubjectName(selectedSubject.name);
    }
  }, [browsableExams, selectedExam, selectedExamId, selectedClass, selectedClassId, selectedSubject, selectedSubjectName]);

  const [activeSyllabusPdfId, setActiveSyllabusPdfId] = useState<string>('');
  const [syllabusModalOpen, setSyllabusModalOpen] = useState(false);

  // Dedicated Topic Screen state
  const [selectedTopic, setSelectedTopic] = useState<SelectedTopicContext | null>(null);
  const [topicPhase, setTopicPhase] = useState<'overview' | 'testing' | 'result'>('overview');
  const [questionCount, setQuestionCount] = useState<25 | 50 | 100>(25);

  // Generation & Test Runner state
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [questions, setQuestions] = useState<MockQuestion[]>([]);
  const [generatedKey, setGeneratedKey] = useState<string>('');
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [startedAt, setStartedAt] = useState(0);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  // PDF Download Modal state
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [pdfCount, setPdfCount] = useState<25 | 50 | 100>(25);
  const [pdfLanguage, setPdfLanguage] = useState<'english' | 'odia' | 'hindi'>(uiLang);
  const [includeAnswerKey, setIncludeAnswerKey] = useState(true);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfProgress, setPdfProgress] = useState('');

  const activeSyllabusPdf = useMemo(
    () => syllabusPdfs.find((p) => p.id === activeSyllabusPdfId),
    [syllabusPdfs, activeSyllabusPdfId],
  );

  const handleSelectExam = (examId: string) => {
    setSelectedExamId(examId);
    const ex = browsableExams.find((e) => e.id === examId);
    const firstCls = ex?.classesOrPapers[0];
    setSelectedClassId(firstCls?.id || '');
    setSelectedSubjectName(firstCls?.subjects[0]?.name || '');
    setSelectedTopic(null);
    setTopicPhase('overview');
  };

  const handleSelectClass = (classId: string) => {
    setSelectedClassId(classId);
    const cls = selectedExam?.classesOrPapers.find((c) => c.id === classId);
    setSelectedSubjectName(cls?.subjects[0]?.name || '');
    setSelectedTopic(null);
    setTopicPhase('overview');
  };

  const openTopicScreen = (chapter: SyllabusChapter, topicName: string) => {
    if (!selectedExam || !selectedClass || !selectedSubject) return;
    setSelectedTopic({
      exam: selectedExam,
      classLabel: selectedClass.label,
      classId: selectedClass.id,
      subject: selectedSubject,
      chapter,
      topicName,
    });
    setTopicPhase('overview');
    setQuestions([]);
    setGeneratedKey('');
    setAnswers({});
    setCurrentIdx(0);
    setErrorMsg(null);
    setPdfLanguage(selectedSubject.subjectLanguage === 'Hindi' ? 'hindi' : uiLang);
    setPdfCount(questionCount);
  };

  const generateTopicQuestionsBatch = async (
    ctx: SelectedTopicContext,
    targetCount: 25 | 50 | 100,
    targetLang: 'english' | 'odia' | 'hindi',
    onProgress: (msg: string) => void,
  ): Promise<MockQuestion[]> => {
    const collected: MockQuestion[] = [];
    const seenStems = new Set<string>();

    const subjLang = ctx.subject.subjectLanguage;
    const isNonEnglishInEnglish =
      targetLang === 'english' && subjLang && subjLang !== 'English' && subjLang !== 'Odia';
    const isNonOdiaInOdia =
      targetLang === 'odia' && subjLang && subjLang !== 'Odia';

    const languageDirective =
      targetLang === 'hindi'
        ? 'CRITICAL: Write EVERY question, 4 options, and detailed explanation in pure, grammatically accurate Hindi (Devanagari script / देवनागरी लिपि).'
        : targetLang === 'odia'
          ? isNonOdiaInOdia
            ? `CRITICAL LANGUAGE RULE FOR ${ctx.subject.name}: Preserve reading passages, prose/poetry quotes, grammar examples, and language-specific test items in original ${subjLang} where necessary; write ALL question instructions/directions and detailed explanations in natural, grammatically correct Odia (ଓଡ଼ିଆ Unicode script).`
            : 'CRITICAL: Write EVERY question, 4 options, and detailed explanation in natural, grammatically correct Odia (ଓଡ଼ିଆ Unicode script). Keep standard mathematical symbols/units clear.'
          : isNonEnglishInEnglish
            ? `CRITICAL LANGUAGE RULE FOR ${ctx.subject.name}: Preserve reading passages and language-specific items in ${subjLang} where needed; write instructions and explanations in clear English.`
            : 'Write EVERY question, 4 options, and detailed explanation in clear, grammatical English.';

    const boardRule =
      ctx.exam.category === 'odisha-board'
        ? 'Strictly follow BSE Odisha Class 10 official syllabus standards. Do NOT mix CBSE or other boards.'
        : `Strictly follow ${ctx.exam.name} (${ctx.classLabel}) syllabus standards.`;

    const syllabusRefSnippet = activeSyllabusPdf
      ? `\nUploaded Syllabus Reference (${activeSyllabusPdf.fileName}):\n${activeSyllabusPdf.extractedText.slice(0, 10000)}\n`
      : '';

    let safetyRounds = 0;
    while (collected.length < targetCount && safetyRounds < 10) {
      safetyRounds++;
      const batchSize = Math.min(15, targetCount - collected.length);
      onProgress(
        targetLang === 'odia'
          ? `AI ପ୍ରଶ୍ନ ପ୍ରସ୍ତୁତ ହେଉଛି (${collected.length + 1}–${Math.min(targetCount, collected.length + batchSize)} / ${targetCount})...`
          : `Generating AI questions (${collected.length + 1}–${Math.min(targetCount, collected.length + batchSize)} of ${targetCount})...`,
      );

      const avoidList = Array.from(seenStems).slice(-14).join(' | ');
      const prompt = `Generate exactly ${batchSize} fresh, non-repeating 4-option MCQ AI practice questions.
Board / Exam: ${ctx.exam.name}
Class / Paper: ${ctx.classLabel}
Subject: ${ctx.subject.name}
Chapter: ${ctx.chapter.name}${ctx.chapter.section ? ` [${ctx.chapter.section}]` : ''}${ctx.chapter.assessment ? ` (${ctx.chapter.term} · ${ctx.chapter.assessment})` : ''}
SELECTED TOPIC ONLY: ${ctx.topicName}
${ctx.subject.prescribedBooks?.length ? `Prescribed Books: ${ctx.subject.prescribedBooks.join(', ')}` : ''}
${boardRule}
${languageDirective}
${syllabusRefSnippet}

STRICT RULES:
- Generate questions ONLY about "${ctx.topicName}" inside chapter "${ctx.chapter.name}". Do NOT generate questions from other chapters or other subjects.
- Every question MUST be an MCQ with EXACTLY 4 distinct options ("options" array of length 4) and valid "correctIndex" (0, 1, 2, or 3).
- Provide a clear, accurate explanation for why the correct answer is right.
- Clearly treat these as AI-generated practice questions; NEVER claim they are official previous-year exam questions.
- Verify factual and mathematical accuracy before outputting.
${avoidList ? `- Do NOT repeat these earlier questions: ${avoidList}` : ''}
- Return ONLY a valid JSON object matching this exact schema (no markdown fences):
{"questions":[{"question":"...","options":["...","...","...","..."],"correctIndex":0,"explanation":"..."}]}`;

      const res = await generateAI({
        provider: settings.provider,
        model: settings.model,
        language: targetLang,
        prompt,
        responseMimeType: 'application/json',
      });

      const parsed = parseSafeJson<{
        questions: Array<{
          question: string;
          options?: string[];
          correctIndex?: number;
          explanation?: string;
        }>;
      }>(res.text);

      if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
        throw new Error('AI returned an empty batch of questions. Please try again.');
      }

      for (const item of parsed.questions) {
        if (collected.length >= targetCount) break;
        if (!item?.question?.trim()) continue;
        const stemKey = item.question.trim().toLowerCase().slice(0, 85);
        if (seenStems.has(stemKey)) continue;
        seenStems.add(stemKey);

        const opts = Array.isArray(item.options) ? item.options.slice(0, 4) : [];
        while (opts.length < 4) {
          opts.push(`Option ${String.fromCharCode(65 + opts.length)}`);
        }
        const safeCorrect =
          typeof item.correctIndex === 'number' && item.correctIndex >= 0 && item.correctIndex < 4
            ? item.correctIndex
            : 0;

        collected.push({
          id: collected.length + 1,
          questionType: 'MCQ',
          subject: ctx.subject.name,
          question: item.question.trim(),
          options: opts,
          correctIndex: safeCorrect,
          explanation: item.explanation?.trim() || 'Answer verified against selected topic.',
          topicTag: ctx.topicName,
        });
      }
    }

    if (collected.length === 0) {
      throw new Error('Could not generate valid questions for this topic. Please retry.');
    }
    return collected;
  };

  const handleStartTopicTest = async () => {
    if (!selectedTopic) return;
    const effectiveLang: 'english' | 'odia' | 'hindi' =
      selectedTopic.subject.subjectLanguage === 'Hindi' ? 'hindi' : uiLang;
    setGenerating(true);
    setErrorMsg(null);
    try {
      const qs = await generateTopicQuestionsBatch(
        selectedTopic,
        questionCount,
        effectiveLang,
        setGenProgress,
      );
      setQuestions(qs);
      setGeneratedKey(
        `${selectedTopic.subject.name}::${selectedTopic.chapter.name}::${selectedTopic.topicName}::${questionCount}::${effectiveLang}`,
      );
      setAnswers({});
      setCurrentIdx(0);
      setStartedAt(Date.now());
      setShowSubmitConfirm(false);
      setTopicPhase('testing');
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to generate topic practice questions.',
      );
    } finally {
      setGenerating(false);
      setGenProgress('');
    }
  };

  const handleConfirmSubmitTest = () => {
    if (!selectedTopic || questions.length === 0) return;
    const now = Date.now();
    let correctCount = 0;
    let incorrectCount = 0;
    let unattemptedCount = 0;

    for (const q of questions) {
      const ans = answers[q.id];
      if (typeof ans !== 'number') {
        unattemptedCount++;
      } else if (ans === q.correctIndex) {
        correctCount++;
      } else {
        incorrectCount++;
      }
    }

    const total = questions.length;
    const attempted = correctCount + incorrectCount;
    const percentage = total > 0 ? (correctCount / total) * 100 : 0;
    const accuracy = attempted > 0 ? (correctCount / attempted) * 100 : 0;

    const config: MockTestConfig = {
      category: selectedTopic.exam.category,
      examName: selectedTopic.exam.name,
      classOrPaper: selectedTopic.classLabel,
      subject: selectedTopic.subject.name,
      chapter: selectedTopic.chapter.name,
      topic: selectedTopic.topicName,
      scope: 'chapter-wise',
      difficulty: 'Medium',
      questionType: 'MCQ',
      questionCount: total,
      durationMinutes: 0,
      practiceMode: true,
      language: selectedTopic.subject.subjectLanguage === 'Hindi' ? 'hindi' : uiLang,
      marksPerQuestion: 1,
      negativeMarkingEnabled: false,
      negativeMarksPerWrong: 0,
      syllabusReferenceNote: activeSyllabusPdf?.fileName,
    };

    const attempt: MockTestAttempt = {
      id: `topic-mock-${now}`,
      config,
      questions,
      answers,
      markedForReview: [],
      visited: questions.map((q) => q.id),
      startedAt,
      submittedAt: now,
      timeTakenSeconds: Math.max(1, Math.round((now - startedAt) / 1000)),
      score: correctCount,
      maxScore: total,
      correctCount,
      incorrectCount,
      unattemptedCount,
      accuracyPercentage: accuracy,
      percentage,
      subjectBreakdown: [
        {
          subject: `${selectedTopic.subject.name} — ${selectedTopic.topicName}`,
          total,
          attempted,
          correct: correctCount,
          incorrect: incorrectCount,
          unattempted: unattemptedCount,
          marks: correctCount,
          maxMarks: total,
          accuracy,
        },
      ],
    };

    onSaveAttempt(attempt);
    setShowSubmitConfirm(false);
    setTopicPhase('result');
  };

  const handleDownloadTopicPdf = async () => {
    if (!selectedTopic) return;
    setPdfBusy(true);
    setErrorMsg(null);
    try {
      const targetKey = `${selectedTopic.subject.name}::${selectedTopic.chapter.name}::${selectedTopic.topicName}::${pdfCount}::${pdfLanguage}`;
      let qsForPdf = questions;
      if (qsForPdf.length !== pdfCount || generatedKey !== targetKey) {
        qsForPdf = await generateTopicQuestionsBatch(
          selectedTopic,
          pdfCount,
          pdfLanguage,
          setPdfProgress,
        );
        setQuestions(qsForPdf);
        setGeneratedKey(targetKey);
      }

      setPdfProgress(t.pdfGeneratingBtn);
      await exportTopicQuestionsToPdf({
        boardName: selectedTopic.exam.name,
        className: selectedTopic.classLabel,
        subjectName: selectedTopic.subject.name,
        chapterName: selectedTopic.chapter.name,
        topicName: selectedTopic.topicName,
        language: pdfLanguage,
        questions: qsForPdf,
        includeAnswerKey,
      });
      setPdfModalOpen(false);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to generate printable topic PDF.',
      );
    } finally {
      setPdfBusy(false);
      setPdfProgress('');
    }
  };

  // ===================== DEDICATED TOPIC SCREEN =====================
  if (selectedTopic) {
    const totalQ = questions.length;
    const correctCount = questions.filter((q) => answers[q.id] === q.correctIndex).length;
    const attemptedCount = questions.filter((q) => typeof answers[q.id] === 'number').length;
    const incorrectCount = attemptedCount - correctCount;
    const unattemptedCount = totalQ - attemptedCount;
    const percentage = totalQ > 0 ? (correctCount / totalQ) * 100 : 0;

    return (
      <div className="h-full overflow-y-auto px-4 md:px-8 py-6 bg-slate-50/50 dark:bg-slate-950">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Top Back + Breadcrumb Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                setSelectedTopic(null);
                setTopicPhase('overview');
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-semibold text-slate-800 dark:text-slate-100 hover:border-violet-500 transition-colors min-h-[44px]"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{t.backToTopics}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setPdfLanguage(uiLang);
                setPdfCount(questionCount);
                setPdfModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors min-h-[44px]"
            >
              <Download className="w-4 h-4" />
              <span>{t.downloadPdfBtn}</span>
            </button>
          </div>

          {/* Topic Header Banner */}
          <div className="rounded-2xl border border-violet-200 dark:border-violet-800/80 bg-white dark:bg-slate-900 p-5 md:p-6 space-y-2.5">
            <div className="text-sm font-medium text-violet-700 dark:text-violet-300">
              {selectedTopic.exam.name} · {selectedTopic.classLabel} · {selectedTopic.subject.name}
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white leading-snug">
              {selectedTopic.topicName}
            </h1>
            <div className="text-sm text-slate-600 dark:text-slate-300">
              {selectedTopic.chapter.name}
              {selectedTopic.chapter.section ? ` · ${selectedTopic.chapter.section}` : ''}
              {selectedTopic.chapter.assessment
                ? ` · ${selectedTopic.chapter.term} (${selectedTopic.chapter.assessment})`
                : ''}
            </div>
            {selectedTopic.subject.prescribedBooks && (
              <div className="text-sm text-slate-600 dark:text-slate-400">
                <strong>{t.prescribedBooksLabel}:</strong>{' '}
                {selectedTopic.subject.prescribedBooks.join(' · ')}
              </div>
            )}
            <div className="pt-2 flex items-start gap-2 text-sm text-amber-800 dark:text-amber-200">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
              <span>{t.aiPracticeLabel}</span>
            </div>
          </div>

          {errorMsg && (
            <div className="p-4 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-sm text-red-700 dark:text-red-300 flex items-center gap-2.5">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* PHASE A: TOPIC OVERVIEW & TEST LAUNCHER */}
          {topicPhase === 'overview' && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 md:p-8 space-y-6">
              {selectedTopic.subject.subjectLanguage &&
                selectedTopic.subject.subjectLanguage !== 'Odia' && (
                  <div className="p-3.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 text-sm text-blue-900 dark:text-blue-200">
                    {t.languagePreservedNote}
                  </div>
                )}

              <div className="space-y-3">
                <label className="text-base font-bold text-slate-900 dark:text-white block">
                  {t.selectCountLabel}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {([25, 50, 100] as const).map((cnt) => (
                    <button
                      key={cnt}
                      type="button"
                      onClick={() => setQuestionCount(cnt)}
                      className={`px-5 py-4 rounded-xl border text-base font-bold transition-colors min-h-[52px] ${
                        questionCount === cnt
                          ? 'border-violet-600 bg-violet-600 text-white'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:border-violet-400'
                      }`}
                    >
                      {cnt} {t.questionsSuffix}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 pt-2">
                <button
                  type="button"
                  disabled={generating}
                  onClick={() => void handleStartTopicTest()}
                  className="inline-flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-base font-bold transition-colors min-h-[48px]"
                >
                  {generating ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>{genProgress || t.generatingProgress}</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5" />
                      <span>
                        {t.startTestBtn} ({questionCount} {t.questionsSuffix})
                      </span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  disabled={generating}
                  onClick={() => {
                    setPdfLanguage(selectedTopic.subject.subjectLanguage === 'Hindi' ? 'hindi' : uiLang);
                    setPdfCount(questionCount);
                    setPdfModalOpen(true);
                  }}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl border border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-blue-800 dark:text-blue-200 text-base font-semibold transition-colors min-h-[48px]"
                >
                  <Download className="w-5 h-5" />
                  <span>{t.downloadPdfBtn}</span>
                </button>
              </div>
            </div>
          )}

          {/* PHASE B: TOPIC TEST RUNNER */}
          {topicPhase === 'testing' && questions.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
                  <span className="text-base font-bold text-slate-900 dark:text-white tabular-nums">
                    {t.questionWord} {currentIdx + 1} {t.ofWord} {questions.length}
                  </span>
                  <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                    {selectedTopic.topicName}
                  </span>
                </div>

                {(() => {
                  const q = questions[currentIdx];
                  const chosen = answers[q.id];
                  return (
                    <div className="space-y-5">
                      <div className="text-lg md:text-xl font-semibold text-slate-900 dark:text-white leading-relaxed">
                        <MarkdownRenderer content={q.question} />
                      </div>

                      <div className="space-y-3">
                        {q.options.slice(0, 4).map((opt, oIdx) => {
                          const selected = chosen === oIdx;
                          return (
                            <button
                              key={oIdx}
                              type="button"
                              onClick={() =>
                                setAnswers((prev) => ({ ...prev, [q.id]: oIdx }))
                              }
                              className={`w-full text-left flex items-start gap-3.5 p-4 rounded-xl border transition-colors min-h-[52px] ${
                                selected
                                  ? 'border-violet-600 bg-violet-50 dark:bg-violet-950/50 text-violet-950 dark:text-violet-100'
                                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 hover:border-violet-400 text-slate-800 dark:text-slate-200'
                              }`}
                            >
                              <span
                                className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 mt-0.5 ${
                                  selected
                                    ? 'bg-violet-600 text-white'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                                }`}
                              >
                                {String.fromCharCode(65 + oIdx)}
                              </span>
                              <div className="text-base flex-1 leading-relaxed">
                                <MarkdownRenderer content={opt} />
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    disabled={currentIdx === 0}
                    onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
                    className="px-5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-semibold disabled:opacity-40 min-h-[44px]"
                  >
                    {t.previousBtn}
                  </button>

                  <div className="flex items-center gap-3">
                    {currentIdx < questions.length - 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setCurrentIdx((i) => Math.min(questions.length - 1, i + 1))
                        }
                        className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold min-h-[44px]"
                      >
                        {t.nextBtn}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setShowSubmitConfirm(true)}
                      className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold min-h-[44px]"
                    >
                      {t.submitTestBtn}
                    </button>
                  </div>
                </div>
              </div>

              {/* Question Number Navigation Sidebar */}
              <div className="lg:col-span-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4 h-fit">
                <div className="font-bold text-base text-slate-900 dark:text-white">
                  {t.questionNavTitle}
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {questions.map((item, idx) => {
                    const isAns = typeof answers[item.id] === 'number';
                    const isCurr = idx === currentIdx;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setCurrentIdx(idx)}
                        className={`h-10 rounded-lg text-sm font-bold tabular-nums transition-colors ${
                          isCurr
                            ? 'ring-2 ring-slate-900 dark:ring-white bg-violet-600 text-white'
                            : isAns
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}
                      >
                        {idx + 1}
                      </button>
                    );
                  })}
                </div>

                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
                  <span>
                    ● {t.answeredLegend}: {attemptedCount}
                  </span>
                  <span>
                    ○ {t.unansweredLegend}: {totalQ - attemptedCount}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* PHASE C: TOPIC TEST RESULT PAGE */}
          {topicPhase === 'result' && questions.length > 0 && (
            <div className="space-y-6">
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                    {t.resultHeading}
                  </h2>
                  <div className="flex flex-wrap gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        setAnswers({});
                        setCurrentIdx(0);
                        setStartedAt(Date.now());
                        setTopicPhase('testing');
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold min-h-[44px]"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>{t.retakeTestBtn}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setPdfLanguage(uiLang);
                        setPdfCount(questionCount);
                        setPdfModalOpen(true);
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold min-h-[44px]"
                    >
                      <Download className="w-4 h-4" />
                      <span>{t.downloadPdfBtn}</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {[
                    {
                      label: t.totalMarksLabel,
                      val: `${correctCount} / ${totalQ}`,
                      cls: 'bg-violet-50 dark:bg-violet-950/40 text-violet-900 dark:text-violet-200 border-violet-200 dark:border-violet-800',
                    },
                    {
                      label: t.percentageLabel,
                      val: `${percentage.toFixed(1)}%`,
                      cls: 'bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 border-blue-200 dark:border-blue-800',
                    },
                    {
                      label: t.correctLabel,
                      val: String(correctCount),
                      cls: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800',
                    },
                    {
                      label: t.incorrectLabel,
                      val: String(incorrectCount),
                      cls: 'bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-200 border-red-200 dark:border-red-800',
                    },
                    {
                      label: t.unattemptedLabel,
                      val: String(unattemptedCount),
                      cls: 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-700',
                    },
                  ].map((box) => (
                    <div
                      key={box.label}
                      className={`p-4 rounded-xl border ${box.cls}`}
                    >
                      <div className="text-xs font-semibold opacity-80">{box.label}</div>
                      <div className="text-2xl font-bold tabular-nums mt-1">{box.val}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Answer Review List */}
              <div className="space-y-4">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                  {t.reviewAnswersTitle}
                </h3>
                {questions.map((q, idx) => {
                  const uAns = answers[q.id];
                  const isAttempted = typeof uAns === 'number';
                  const isRight = isAttempted && uAns === q.correctIndex;
                  return (
                    <div
                      key={q.id}
                      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 md:p-6 space-y-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-bold text-slate-600 dark:text-slate-400 tabular-nums">
                          {t.questionWord} {idx + 1}
                        </span>
                        {!isAttempted ? (
                          <span className="text-sm font-semibold text-slate-500">
                            {t.unattemptedLabel}
                          </span>
                        ) : isRight ? (
                          <span className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="w-4 h-4" />
                            <span>{t.correctLabel}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-sm font-bold text-red-600 dark:text-red-400">
                            <XCircle className="w-4 h-4" />
                            <span>{t.incorrectLabel}</span>
                          </span>
                        )}
                      </div>

                      <div className="text-base md:text-lg font-semibold text-slate-900 dark:text-white">
                        <MarkdownRenderer content={q.question} />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {q.options.slice(0, 4).map((opt, oIdx) => {
                          const rightOpt = oIdx === q.correctIndex;
                          const chosenOpt = oIdx === uAns;
                          return (
                            <div
                              key={oIdx}
                              className={`p-3.5 rounded-xl border text-sm flex items-start gap-2 ${
                                rightOpt
                                  ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/35 text-emerald-950 dark:text-emerald-100 font-medium'
                                  : chosenOpt
                                    ? 'border-red-400 bg-red-50 dark:bg-red-950/35 text-red-950 dark:text-red-100'
                                    : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              <span className="font-bold">
                                {String.fromCharCode(65 + oIdx)}.
                              </span>
                              <div className="flex-1">
                                <MarkdownRenderer content={opt} />
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm space-y-1">
                        <div className="font-semibold text-emerald-700 dark:text-emerald-400">
                          {t.correctAnswerLabel}: {String.fromCharCode(65 + q.correctIndex)}
                          {isAttempted
                            ? ` · ${t.yourAnswerLabel}: ${String.fromCharCode(65 + uAns)}`
                            : ''}
                        </div>
                        <div>
                          <strong>{t.explanationLabel}: </strong>
                          <MarkdownRenderer content={q.explanation} className="inline-block" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Submit Confirmation Modal */}
        {showSubmitConfirm && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="max-w-md w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {t.confirmModalTitle}
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                {t.confirmModalBody}
              </p>
              <div className="text-sm font-medium text-slate-700 dark:text-slate-200 tabular-nums">
                {t.answeredLegend}: {attemptedCount} / {totalQ}
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSubmitConfirm(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-semibold min-h-[42px]"
                >
                  {t.cancelBtn}
                </button>
                <button
                  type="button"
                  onClick={handleConfirmSubmitTest}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold min-h-[42px]"
                >
                  {t.confirmSubmitBtn}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Download Questions PDF Modal */}
        {pdfModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="max-w-lg w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    {t.pdfModalTitle}
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                    {t.pdfModalDesc}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => !pdfBusy && setPdfModalOpen(false)}
                  aria-label="Close"
                  className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm">
                <div className="font-bold text-slate-900 dark:text-white">
                  {selectedTopic.topicName}
                </div>
                <div className="text-slate-600 dark:text-slate-400">
                  {selectedTopic.subject.name} · {selectedTopic.chapter.name}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-200 block">
                  {t.pdfCountLabel}
                </label>
                <div className="grid grid-cols-3 gap-2.5">
                  {([25, 50, 100] as const).map((cnt) => (
                    <button
                      key={cnt}
                      type="button"
                      disabled={pdfBusy}
                      onClick={() => setPdfCount(cnt)}
                      className={`py-2.5 rounded-xl border text-sm font-bold transition-colors ${
                        pdfCount === cnt
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800'
                      }`}
                    >
                      {cnt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-200 block">
                  {t.pdfLangLabel}
                </label>
                <div className="grid grid-cols-3 gap-2.5">
                  {(
                    [
                      ['english', 'English'],
                      ['hindi', 'हिन्दी (Hindi)'],
                      ['odia', 'ଓଡ଼ିଆ (Odia)'],
                    ] as const
                  ).map(([code, lbl]) => (
                    <button
                      key={code}
                      type="button"
                      disabled={pdfBusy}
                      onClick={() => setPdfLanguage(code)}
                      className={`py-2.5 rounded-xl border text-sm font-bold transition-colors ${
                        pdfLanguage === code
                          ? 'border-violet-600 bg-violet-600 text-white'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800'
                      }`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-200 block">
                  {t.pdfAnswerKeyLabel}
                </label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer text-sm">
                    <input
                      type="radio"
                      name="answerKeyOpt"
                      checked={includeAnswerKey}
                      onChange={() => setIncludeAnswerKey(true)}
                      className="accent-violet-600"
                    />
                    <span className="font-medium">{t.pdfIncludeKeyYes}</span>
                  </label>
                  <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer text-sm">
                    <input
                      type="radio"
                      name="answerKeyOpt"
                      checked={!includeAnswerKey}
                      onChange={() => setIncludeAnswerKey(false)}
                      className="accent-violet-600"
                    />
                    <span className="font-medium">{t.pdfIncludeKeyNo}</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  disabled={pdfBusy}
                  onClick={() => setPdfModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-semibold"
                >
                  {t.cancelBtn}
                </button>
                <button
                  type="button"
                  disabled={pdfBusy}
                  onClick={() => void handleDownloadTopicPdf()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-bold min-h-[44px]"
                >
                  {pdfBusy ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{pdfProgress || t.pdfGeneratingBtn}</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      <span>{t.pdfDownloadNowBtn}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ===================== MAIN SYLLABUS BROWSER SCREEN =====================
  return (
    <div className="h-full overflow-y-auto px-4 md:px-8 py-6 bg-slate-50/50 dark:bg-slate-950">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Top Page Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5 max-w-3xl">
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white">
              {t.pageTitle}
            </h1>
            <p className="text-sm md:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
              {t.pageSubtitle}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setSyllabusModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold transition-colors min-h-[44px]"
            >
              <Upload className="w-4 h-4" />
              <span>{t.uploadUpdateBtn}</span>
            </button>

            <button
              type="button"
              onClick={onOpenFullMockTests}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-teal-500 text-sm font-semibold transition-colors min-h-[44px]"
            >
              <Layers className="w-4 h-4 text-teal-600" />
              <span>{t.openInMockTest}</span>
            </button>
          </div>
        </div>

        {/* Uploaded Syllabus Documents Section (synced with Syllabus Manager & Mock Tests) */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-base md:text-lg text-slate-900 dark:text-white flex items-center gap-2">
                <FolderOpen className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                <span>{t.uploadedSectionTitle}</span>
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
                {t.uploadedSectionHint}
              </p>
            </div>

            {selectedExam?.id === 'bse-odisha' && (
              <a
                href={BSE_ODISHA_SYLLABUS_PDF_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-purple-300 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/30 text-purple-800 dark:text-purple-200 text-sm font-semibold hover:bg-purple-100 transition-colors"
              >
                <FileText className="w-4 h-4" />
                <span>{t.viewOfficialPdf}</span>
              </a>
            )}
          </div>

          {syllabusPdfs.length === 0 ? (
            <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-sm text-slate-600 dark:text-slate-400">
              {t.noUploadedPdfs}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {syllabusPdfs.map((ref) => {
                const isActiveRef = activeSyllabusPdfId === ref.id;
                const examLabel = exams.find((e) => e.id === ref.examId)?.name || ref.examId;
                return (
                  <div
                    key={ref.id}
                    className={`p-4 rounded-xl border flex items-center justify-between gap-3 ${
                      isActiveRef
                        ? 'border-violet-500 bg-violet-50/50 dark:bg-violet-950/30'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-slate-900 dark:text-white truncate">
                        {ref.fileName}
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-400 truncate mt-0.5">
                        {examLabel} · {ref.subject} · {ref.pageCount} pages
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          setActiveSyllabusPdfId(isActiveRef ? '' : ref.id)
                        }
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                          isActiveRef
                            ? 'bg-violet-600 text-white border-violet-600'
                            : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900'
                        }`}
                      >
                        {isActiveRef ? t.activeUploadedBadge : t.useUploadedBtn}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (isActiveRef) setActiveSyllabusPdfId('');
                          onRemoveSyllabusPdf(ref.id);
                        }}
                        aria-label="Remove PDF"
                        className="p-2 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Board & Class Selector */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-slate-700 dark:text-slate-200 block">
              {t.boardLabel}
            </label>
            <select
              value={selectedExam?.id || ''}
              onChange={(e) => handleSelectExam(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-base font-medium min-h-[46px]"
            >
              {browsableExams.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-bold text-slate-700 dark:text-slate-200 block">
              {t.classLabel}
            </label>
            <select
              value={selectedClass?.id || ''}
              onChange={(e) => handleSelectClass(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-base font-medium min-h-[46px]"
            >
              {(selectedExam?.classesOrPapers || []).map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {selectedExam?.category === 'upsc' && onOpenUpscHub && (
          <div className="rounded-2xl border border-[#4338CA]/30 bg-gradient-to-r from-[#4338CA]/10 via-[#2563EB]/8 to-[#06B6D4]/10 p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-[#0F172A] dark:text-slate-100">
              <strong>UPSC Civil Services Hub:</strong> Access Prelims GS/CSAT mock tests, Mains Answer Writing AI, Answer Evaluation, and Study Strategy.
            </div>
            <button
              type="button"
              onClick={onOpenUpscHub}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#4338CA] to-[#2563EB] text-white text-xs font-semibold shadow-xs"
            >
              Open UPSC Hub
            </button>
          </div>
        )}

        {/* Existing Subjects Grid */}
        <div className="space-y-3">
          <h2 className="text-lg md:text-xl font-bold text-slate-900 dark:text-white">
            {t.subjectsHeading} ({selectedClass?.subjects.length || 0})
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {(selectedClass?.subjects || []).map((subj, idx) => {
              const isSelected = selectedSubject?.name === subj.name;
              const topicCount = subj.chapters.reduce(
                (acc, ch) => acc + Math.max(1, ch.topics.length),
                0,
              );
              const accentCls = SUBJECT_ACCENTS[idx % SUBJECT_ACCENTS.length];
              return (
                <button
                  key={subj.name}
                  type="button"
                  onClick={() => setSelectedSubjectName(subj.name)}
                  className={`text-left p-4 rounded-2xl border transition-all min-h-[76px] ${accentCls} ${
                    isSelected
                      ? 'ring-2 ring-offset-2 ring-violet-600 dark:ring-violet-400 dark:ring-offset-slate-950'
                      : ''
                  }`}
                >
                  <div className="font-bold text-base leading-snug">{subj.name}</div>
                  <div className="text-xs opacity-80 mt-1.5 tabular-nums">
                    {subj.chapters.length} {t.chaptersCountWord} · {topicCount}{' '}
                    {t.topicsCountWord}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Subject's Existing Chapters & Clickable Topics */}
        {selectedSubject && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg md:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-violet-600" />
                  <span>
                    {selectedSubject.name} — {t.chaptersHeading}
                  </span>
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
                  {t.allTopicsHint}
                </p>
              </div>
              {selectedSubject.prescribedBooks && (
                <div className="text-sm text-slate-600 dark:text-slate-300">
                  <strong>{t.prescribedBooksLabel}:</strong>{' '}
                  {selectedSubject.prescribedBooks.join(' · ')}
                </div>
              )}
            </div>

            <div className="space-y-4">
              {selectedSubject.chapters.map((ch, cIdx) => {
                const isExcluded = Boolean(ch.excludedFromExam);
                const mergedTopics = Array.from(
                  new Set([...(ch.topics || []), ...(ch.subtopics || [])]),
                );
                const topicsList = mergedTopics.length > 0 ? mergedTopics : [ch.name];

                return (
                  <div
                    key={`${ch.name}-${cIdx}`}
                    className={`rounded-2xl border p-5 space-y-3.5 ${
                      isExcluded
                        ? 'border-amber-200 dark:border-amber-900/70 bg-amber-50/40 dark:bg-amber-950/20 opacity-75'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="text-base md:text-lg font-bold text-slate-900 dark:text-white flex flex-wrap items-center gap-2">
                          <span>{cIdx + 1}. {ch.name}</span>
                          {ch.marks && (
                            <span className="px-2 py-0.5 rounded-md bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 text-xs font-semibold">
                              {ch.marks}
                            </span>
                          )}
                        </div>
                        <div className="text-xs md:text-sm text-slate-600 dark:text-slate-400">
                          {[ch.section, ch.term, ch.assessment]
                            .filter(Boolean)
                            .join(' · ')}
                          {isExcluded ? ` · ${t.excludedNote}` : ''}
                        </div>
                      </div>

                      {!isExcluded && (
                        <button
                          type="button"
                          onClick={() => openTopicScreen(ch, ch.name)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-violet-300 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/40 text-violet-800 dark:text-violet-200 text-sm font-semibold hover:bg-violet-100 transition-colors min-h-[40px]"
                        >
                          <span>{t.practiceChapterBtn}</span>
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {/* Clickable Topic Cards / Buttons */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                      {topicsList.map((topicItem) => (
                        <button
                          key={topicItem}
                          type="button"
                          disabled={isExcluded}
                          onClick={() => openTopicScreen(ch, topicItem)}
                          className={`text-left flex items-center justify-between gap-3 px-4 py-3 rounded-xl border text-sm md:text-base font-medium transition-colors min-h-[48px] ${
                            isExcluded
                              ? 'border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300 cursor-not-allowed line-through'
                              : 'border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-950 hover:border-violet-500 hover:bg-violet-50/70 dark:hover:bg-violet-950/35 text-slate-800 dark:text-slate-100'
                          }`}
                        >
                          <span className="leading-snug">{topicItem}</span>
                          {!isExcluded && (
                            <ChevronRight className="w-4 h-4 shrink-0 text-violet-600 dark:text-violet-400" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <SyllabusManagerModal
        isOpen={syllabusModalOpen}
        onClose={() => setSyllabusModalOpen(false)}
        exams={exams}
        syllabusPdfs={syllabusPdfs}
        onAddCustomExam={onAddCustomExam}
        onUpdateExam={onUpdateExam}
        onAddChapterOrTopic={onAddChapterOrTopic}
        onAddSyllabusPdf={(ref) => {
          onAddSyllabusPdf(ref);
          setActiveSyllabusPdfId(ref.id);
        }}
        onRemoveSyllabusPdf={(id) => {
          if (activeSyllabusPdfId === id) setActiveSyllabusPdfId('');
          onRemoveSyllabusPdf(id);
        }}
      />
    </div>
  );
};
