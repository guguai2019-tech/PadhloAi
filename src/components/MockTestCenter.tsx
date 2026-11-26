import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BookMarked,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Download,
  FileText,
  Flag,
  History,
  Info,
  Languages,
  Layers,
  Loader2,
  Play,
  RotateCcw,
  Save,
  Settings2,
  ShieldAlert,
  X,
  XCircle,
} from 'lucide-react';
import type {
  AppSettings,
  DifficultyLevel,
  ExamCategoryId,
  ExamDefinition,
  ExamQuestionType,
  MockLanguage,
  MockQuestion,
  MockTestAttempt,
  MockTestConfig,
  SubjectPerformance,
  SyllabusPdfReference,
  TestScope,
  UgcNetMockTestMode,
  UgcNetPaperType,
  UgcNetPublicCatalogResponse,
  UpscMockTestMode,
  UpscPaperId,
  UpscPublicCatalogResponse,
  UserAnswerValue,
} from '../types';
import {
  BUILTIN_EXAMS,
  COMBINED_EXAM_SUBJECTS,
  EXAM_CATEGORIES,
  MOCK_UI_LABELS,
} from '../data/examCatalog';
import {
  BSE_ODISHA_SYLLABUS_PDF_NAME,
  BSE_ODISHA_SYLLABUS_PDF_URL,
} from '../data/bseOdishaClass10Syllabus';
import { generateAI, parseSafeJson } from '../utils/aiClient';
import {
  fetchCentralQuestions,
  fetchPublishedUgcNetSyllabus,
  fetchPublishedUpscSyllabus,
  generateUgcNetMockTestApi,
  generateUpscMockTestApi,
} from '../utils/adminApi';
import { exportMockResultToPdf, exportTopicQuestionsToPdf } from '../utils/pdfExport';
import { MarkdownRenderer } from './MarkdownRenderer';
import { SyllabusManagerModal } from './SyllabusManagerModal';

interface MockTestCenterProps {
  settings: AppSettings;
  attempts: MockTestAttempt[];
  onSaveAttempt: (attempt: MockTestAttempt) => void;
  sharedExams?: ExamDefinition[];
  ugcNetCatalog?: UgcNetPublicCatalogResponse | null;
  upscCatalog?: UpscPublicCatalogResponse | null;
  sharedSyllabusPdfs?: SyllabusPdfReference[];
  onAddCustomExam?: (exam: ExamDefinition) => void;
  onUpdateExam?: (exam: ExamDefinition) => void;
  onAddChapterOrTopic?: (
    examId: string,
    classId: string,
    subjectName: string,
    chapterName: string,
    topicName: string,
  ) => void;
  onAddSyllabusPdf?: (pdfRef: SyllabusPdfReference) => void;
  onRemoveSyllabusPdf?: (id: string) => void;
}

const STORAGE_CUSTOM_EXAMS = 'sg_custom_exams_v1';
const STORAGE_SYLLABUS_PDFS = 'sg_syllabus_pdfs_v1';

const QUESTION_TYPES: Array<{ id: ExamQuestionType; label: string }> = [
  { id: 'MCQ', label: 'Multiple Choice Questions (MCQ)' },
  { id: 'Multiple-Select', label: 'Multiple Select Questions (MSQ)' },
  { id: 'True-False', label: 'True or False' },
  { id: 'Assertion-Reasoning', label: 'Assertion and Reason' },
  { id: 'Match-Following', label: 'Match the Following' },
  { id: 'Statement-Based', label: 'Statement-based Questions' },
  { id: 'Numerical', label: 'Numerical Questions' },
  { id: 'Comprehension', label: 'Comprehension-based Questions' },
  { id: 'Mixed', label: 'Mixed Question Types' },
];

function loadLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function formatTimer(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function isQuestionCorrect(q: MockQuestion, ans: UserAnswerValue | undefined): boolean {
  if (ans === undefined) return false;
  if (q.questionType === 'Numerical') {
    const expected = String(q.numericalAnswer ?? '').trim().toLowerCase();
    const given = String(ans).trim().toLowerCase();
    if (!expected || !given) return false;
    const nExp = Number(expected);
    const nGiv = Number(given);
    if (!Number.isNaN(nExp) && !Number.isNaN(nGiv)) {
      return Math.abs(nExp - nGiv) <= 0.01;
    }
    return expected === given;
  }
  if (q.questionType === 'Multiple-Select') {
    const expected = [...(q.correctIndices || [q.correctIndex])].sort((a, b) => a - b);
    const given = Array.isArray(ans) ? [...ans].sort((a, b) => a - b) : [];
    return (
      expected.length > 0 &&
      expected.length === given.length &&
      expected.every((v, i) => v === given[i])
    );
  }
  return typeof ans === 'number' && ans === q.correctIndex;
}

function isAttempted(ans: UserAnswerValue | undefined): boolean {
  if (ans === undefined) return false;
  if (Array.isArray(ans)) return ans.length > 0;
  if (typeof ans === 'string') return ans.trim().length > 0;
  return true;
}

function mapDefaultLanguage(lang: AppSettings['language']): MockLanguage {
  if (lang === 'odia' || lang === 'hindi' || lang === 'english') return lang;
  return 'english';
}

export const MockTestCenter: React.FC<MockTestCenterProps> = ({
  settings,
  attempts,
  onSaveAttempt,
  sharedExams,
  ugcNetCatalog,
  upscCatalog,
  sharedSyllabusPdfs,
  onAddCustomExam,
  onUpdateExam,
  onAddChapterOrTopic,
  onAddSyllabusPdf,
  onRemoveSyllabusPdf,
}) => {
  const [phase, setPhase] = useState<'setup' | 'exam' | 'result'>('setup');
  const [localUgcCatalog, setLocalUgcCatalog] = useState<UgcNetPublicCatalogResponse | null>(
    ugcNetCatalog ?? null,
  );
  const [localUpscCatalog, setLocalUpscCatalog] = useState<UpscPublicCatalogResponse | null>(
    upscCatalog ?? null,
  );

  useEffect(() => {
    if (ugcNetCatalog !== undefined) {
      setLocalUgcCatalog(ugcNetCatalog);
    }
  }, [ugcNetCatalog]);

  useEffect(() => {
    if (upscCatalog !== undefined) {
      setLocalUpscCatalog(upscCatalog);
    }
  }, [upscCatalog]);

  // Extensible exams & syllabus state (uses shared App state when provided)
  const [localCustomExams, setLocalCustomExams] = useState<ExamDefinition[]>(() =>
    loadLocal<ExamDefinition[]>(STORAGE_CUSTOM_EXAMS, []),
  );
  const [localSyllabusPdfs, setLocalSyllabusPdfs] = useState<SyllabusPdfReference[]>(() =>
    loadLocal<SyllabusPdfReference[]>(STORAGE_SYLLABUS_PDFS, []),
  );
  const [syllabusModalOpen, setSyllabusModalOpen] = useState(false);

  const allExams = useMemo(() => {
    if (sharedExams !== undefined) return sharedExams;
    const map = new Map<string, ExamDefinition>();
    for (const ex of BUILTIN_EXAMS) map.set(ex.id, ex);
    for (const cx of localCustomExams) map.set(cx.id, cx);
    return Array.from(map.values());
  }, [sharedExams, localCustomExams]);

  const syllabusPdfs = sharedSyllabusPdfs ?? localSyllabusPdfs;

  useEffect(() => {
    if (sharedExams) return;
    try {
      localStorage.setItem(STORAGE_CUSTOM_EXAMS, JSON.stringify(localCustomExams));
    } catch {
      // ignore quota errors
    }
  }, [sharedExams, localCustomExams]);

  useEffect(() => {
    if (sharedSyllabusPdfs) return;
    try {
      localStorage.setItem(STORAGE_SYLLABUS_PDFS, JSON.stringify(localSyllabusPdfs));
    } catch {
      // ignore quota errors
    }
  }, [sharedSyllabusPdfs, localSyllabusPdfs]);

  // Setup state (Odia is default for BSE Odisha; syncs when header language changes)
  const [activeCategory, setActiveCategory] = useState<ExamCategoryId>('odisha-board');
  const [language, setLanguage] = useState<MockLanguage>(() =>
    settings.language === 'english' || settings.language === 'hindi'
      ? settings.language
      : 'odia',
  );

  useEffect(() => {
    if (settings.language === 'odia' || settings.language === 'english' || settings.language === 'hindi') {
      setLanguage(settings.language);
    }
  }, [settings.language]);

  const mediumToLanguage = (
    m: 'Odia Medium' | 'English Medium' | 'Hindi Medium',
  ): MockLanguage => {
    if (m === 'Hindi Medium') return 'hindi';
    if (m === 'English Medium') return 'english';
    return 'odia';
  };

  const languageToMedium = (
    l: MockLanguage,
  ): 'Odia Medium' | 'English Medium' | 'Hindi Medium' => {
    if (l === 'hindi') return 'Hindi Medium';
    if (l === 'english') return 'English Medium';
    return 'Odia Medium';
  };

  const [selectedExamId, setSelectedExamId] = useState<string>('bse-odisha');
  const [selectedClassId, setSelectedClassId] = useState<string>('bse-class-10');
  const [medium, setMedium] = useState<'Odia Medium' | 'English Medium' | 'Hindi Medium'>(
    'Odia Medium',
  );
  const [scope, setScope] = useState<TestScope>('full-syllabus');
  const [subject, setSubject] = useState<string>('ଓଡ଼ିଆ (Odia - FLO)');
  const [chapter, setChapter] = useState<string>('ବନ୍ଦେ ଉତ୍କଳ ଜନନୀ');
  const [selectedChapters, setSelectedChapters] = useState<string[]>([
    'ବନ୍ଦେ ଉତ୍କଳ ଜନନୀ',
  ]);
  const [topic, setTopic] = useState<string>('All Chapter Topics');
  const [selectedSyllabusPdfId, setSelectedSyllabusPdfId] = useState<string>('');

  // Dedicated UGC NET centralized syllabus configuration state
  const [ugcPaperType, setUgcPaperType] = useState<UgcNetPaperType>('paper-1');
  const [ugcSubjectId, setUgcSubjectId] = useState<string>('');
  const [ugcTestMode, setUgcTestMode] = useState<UgcNetMockTestMode>('complete-paper-1');
  const [ugcSelectedUnitIds, setUgcSelectedUnitIds] = useState<string[]>([]);
  const [ugcSelectedTopicIds, setUgcSelectedTopicIds] = useState<string[]>([]);

  // Dedicated UPSC Prelims centralized syllabus configuration state
  const [upscPaperId, setUpscPaperId] = useState<'prelims-gs-1' | 'prelims-csat'>('prelims-gs-1');
  const [upscTestMode, setUpscTestMode] = useState<UpscMockTestMode>('full-syllabus');
  const [upscAreaIds, setUpscAreaIds] = useState<string[]>([]);
  const [upscTopicIds, setUpscTopicIds] = useState<string[]>([]);

  // Combined Exam state (all 25 subjects!)
  const [combinedCounts, setCombinedCounts] = useState<Record<string, number>>({
    Mathematics: 5,
    Reasoning: 5,
    'General English': 5,
    'General Knowledge': 5,
    'Odisha General Knowledge': 5,
  });

  // Test Configuration
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('Medium');
  const [questionType, setQuestionType] = useState<ExamQuestionType>('MCQ');
  const [questionCountPreset, setQuestionCountPreset] = useState<number | 'custom'>(25);
  const [customCount, setCustomCount] = useState(15);
  const [practiceMode, setPracticeMode] = useState(false);
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [marksPerQuestion, setMarksPerQuestion] = useState(1);
  const [negativeMarkingEnabled, setNegativeMarkingEnabled] = useState(false);
  const [negativeMarksPerWrong, setNegativeMarksPerWrong] = useState(0.25);

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Subject / Topic PDF Download Modal state
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [pdfLanguage, setPdfLanguage] = useState<MockLanguage>(language);
  const [pdfIncludeAnswerKey, setPdfIncludeAnswerKey] = useState(true);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfProgress, setPdfProgress] = useState('');

  // Active exam state
  const [activeConfig, setActiveConfig] = useState<MockTestConfig | null>(null);
  const [questions, setQuestions] = useState<MockQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, UserAnswerValue>>({});
  const [marked, setMarked] = useState<number[]>([]);
  const [visited, setVisited] = useState<number[]>([1]);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [practiceChecked, setPracticeChecked] = useState<Record<number, boolean>>({});
  const [savedNotice, setSavedNotice] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  // Result state
  const [activeResult, setActiveResult] = useState<MockTestAttempt | null>(null);
  const [resultFilter, setResultFilter] = useState<
    'all' | 'correct' | 'incorrect' | 'unattempted'
  >('all');

  const categoryExams = useMemo(
    () => allExams.filter((e) => e.category === activeCategory),
    [allExams, activeCategory],
  );

  const selectedExam = useMemo(
    () => categoryExams.find((e) => e.id === selectedExamId) || categoryExams[0],
    [categoryExams, selectedExamId],
  );

  const selectedClass = useMemo(
    () =>
      selectedExam?.classesOrPapers.find((c) => c.id === selectedClassId) ||
      selectedExam?.classesOrPapers[0],
    [selectedExam, selectedClassId],
  );

  const availableSubjects = useMemo(
    () => selectedClass?.subjects || [],
    [selectedClass],
  );

  const selectedSubjectObj = useMemo(
    () => availableSubjects.find((s) => s.name === subject) || availableSubjects[0],
    [availableSubjects, subject],
  );

  const selectedChapterObj = useMemo(
    () =>
      selectedSubjectObj?.chapters.find((c) => c.name === chapter) ||
      selectedSubjectObj?.chapters[0],
    [selectedSubjectObj, chapter],
  );

  const liveUgcCatalog = ugcNetCatalog ?? localUgcCatalog;
  const hasPublishedUgcPaper1 = Boolean(liveUgcCatalog?.paper1);
  const publishedUgcSubjects = useMemo(
    () => liveUgcCatalog?.paper2Subjects || [],
    [liveUgcCatalog],
  );
  const hasAnyPublishedUgc = hasPublishedUgcPaper1 || publishedUgcSubjects.length > 0;

  const activeUgcRecord = useMemo(() => {
    if (ugcPaperType === 'paper-1') {
      return liveUgcCatalog?.paper1 || null;
    }
    return (
      publishedUgcSubjects.find((s) => s.subjectId === ugcSubjectId) ||
      publishedUgcSubjects[0] ||
      null
    );
  }, [ugcPaperType, liveUgcCatalog, publishedUgcSubjects, ugcSubjectId]);

  useEffect(() => {
    if (activeCategory !== 'ugc-net') return;
    let cancelled = false;
    fetchPublishedUgcNetSyllabus()
      .then((res) => {
        if (!cancelled) setLocalUgcCatalog(res);
      })
      .catch(() => {
        // Keep last known catalog cleanly
      });
    return () => {
      cancelled = true;
    };
  }, [activeCategory]);

  // Reconcile UGC NET selections whenever published syllabus catalog changes
  useEffect(() => {
    if (ugcPaperType === 'paper-1' && !hasPublishedUgcPaper1 && publishedUgcSubjects.length > 0) {
      setUgcPaperType('paper-2');
      setUgcTestMode('complete-paper-2');
    } else if (
      ugcPaperType === 'paper-2' &&
      publishedUgcSubjects.length === 0 &&
      hasPublishedUgcPaper1
    ) {
      setUgcPaperType('paper-1');
      setUgcTestMode('complete-paper-1');
    }

    if (ugcPaperType === 'paper-2' && publishedUgcSubjects.length > 0) {
      const stillValid = publishedUgcSubjects.some((s) => s.subjectId === ugcSubjectId);
      if (!stillValid) {
        setUgcSubjectId(publishedUgcSubjects[0].subjectId);
      }
    }

    if (activeUgcRecord) {
      const validUnits = new Set(activeUgcRecord.units.map((u) => u.unitId));
      const validTopics = new Set(
        activeUgcRecord.units.flatMap((u) => u.topics.map((t) => t.topicId)),
      );
      setUgcSelectedUnitIds((prev) => prev.filter((id) => validUnits.has(id)));
      setUgcSelectedTopicIds((prev) => prev.filter((id) => validTopics.has(id)));
    } else {
      setUgcSelectedUnitIds([]);
      setUgcSelectedTopicIds([]);
    }
  }, [
    ugcPaperType,
    hasPublishedUgcPaper1,
    publishedUgcSubjects,
    ugcSubjectId,
    activeUgcRecord,
  ]);

  // UPSC Prelims computed published syllabus records
  const liveUpscCatalog = upscCatalog ?? localUpscCatalog;
  const publishedUpscPrelims = useMemo(
    () => liveUpscCatalog?.prelims || [],
    [liveUpscCatalog],
  );
  const activeUpscRecord = useMemo(
    () =>
      publishedUpscPrelims.find((p) => p.paperId === upscPaperId) ||
      publishedUpscPrelims[0] ||
      null,
    [publishedUpscPrelims, upscPaperId],
  );

  useEffect(() => {
    if (activeCategory !== 'upsc') return;
    let cancelled = false;
    fetchPublishedUpscSyllabus()
      .then((res) => {
        if (!cancelled) setLocalUpscCatalog(res);
      })
      .catch(() => {
        // Keep last known catalog cleanly
      });
    return () => {
      cancelled = true;
    };
  }, [activeCategory]);

  // Reconcile UPSC Prelims paper, areas, topics, and official marking pattern
  useEffect(() => {
    if (publishedUpscPrelims.length > 0 && !publishedUpscPrelims.some((p) => p.paperId === upscPaperId)) {
      const nextId = publishedUpscPrelims[0].paperId;
      if (nextId === 'prelims-gs-1' || nextId === 'prelims-csat') {
        setUpscPaperId(nextId);
      }
    }

    if (activeUpscRecord) {
      const validAreas = new Set(activeUpscRecord.areas.map((a) => a.areaId));
      const validTopics = new Set(
        activeUpscRecord.areas.flatMap((a) => a.topics.map((t) => t.topicId)),
      );
      setUpscAreaIds((prev) => prev.filter((id) => validAreas.has(id)));
      setUpscTopicIds((prev) => prev.filter((id) => validTopics.has(id)));

      if (activeCategory === 'upsc') {
        setMarksPerQuestion(activeUpscRecord.markingPattern.marksPerQuestion ?? 2);
        setNegativeMarkingEnabled(activeUpscRecord.markingPattern.negativeMarkingEnabled ?? true);
        setNegativeMarksPerWrong(activeUpscRecord.markingPattern.negativeMarksPerWrong ?? 0.66);
        setDurationMinutes(activeUpscRecord.markingPattern.durationMinutes ?? 120);
      }
    } else {
      setUpscAreaIds([]);
      setUpscTopicIds([]);
    }
  }, [activeCategory, publishedUpscPrelims, upscPaperId, activeUpscRecord]);

  // Reconcile cascading selections automatically whenever centralized catalog updates (SSE / Admin publish)
  useEffect(() => {
    if (activeCategory === 'combined' || activeCategory === 'ugc-net' || activeCategory === 'upsc') return;
    if (selectedExam && selectedExam.id !== selectedExamId) {
      setSelectedExamId(selectedExam.id);
    }
    if (selectedClass && selectedClass.id !== selectedClassId) {
      setSelectedClassId(selectedClass.id);
    }
    if (selectedSubjectObj && selectedSubjectObj.name !== subject) {
      setSubject(selectedSubjectObj.name);
    }
    if (selectedChapterObj && selectedChapterObj.name !== chapter) {
      setChapter(selectedChapterObj.name);
      setSelectedChapters([selectedChapterObj.name]);
      setTopic('All Chapter Topics');
    } else if (selectedSubjectObj) {
      const validNames = new Set(selectedSubjectObj.chapters.map((c) => c.name));
      setSelectedChapters((prev) => {
        const filtered = prev.filter((name) => validNames.has(name));
        if (filtered.length > 0) return filtered;
        return selectedChapterObj ? [selectedChapterObj.name] : [];
      });
      if (topic !== 'All Chapter Topics' && selectedChapterObj) {
        const allTopics = new Set([
          ...(selectedChapterObj.topics || []),
          ...(selectedChapterObj.subtopics || []),
        ]);
        if (!allTopics.has(topic)) {
          setTopic('All Chapter Topics');
        }
      }
    }
  }, [allExams, activeCategory, selectedExam, selectedExamId, selectedClass, selectedClassId, selectedSubjectObj, subject, selectedChapterObj, chapter, topic]);

  const applyExamDefaults = (ex: ExamDefinition | undefined) => {
    if (!ex) return;
    setSelectedExamId(ex.id);
    const firstCls = ex.classesOrPapers[0];
    setSelectedClassId(firstCls?.id || '');

    let resolvedLang: MockLanguage = mapDefaultLanguage(settings.language);
    if (ex.category === 'cbse') {
      resolvedLang = settings.language === 'hindi' ? 'hindi' : 'english';
    } else if (
      settings.language === 'english' ||
      settings.language === 'hindi' ||
      settings.language === 'odia'
    ) {
      resolvedLang = settings.language;
    } else if (ex.category === 'odisha-board') {
      resolvedLang = 'odia';
    }
    setLanguage(resolvedLang);

    if (firstCls?.mediums && firstCls.mediums.length > 0) {
      const targetMedium = languageToMedium(resolvedLang);
      const matchedMedium = firstCls.mediums.includes(targetMedium)
        ? targetMedium
        : firstCls.mediums[0];
      setMedium(matchedMedium);
      if (ex.category === 'cbse') {
        setLanguage(mediumToLanguage(matchedMedium));
      }
    }

    const firstSubj = firstCls?.subjects[0];
    setSubject(firstSubj?.name || '');
    const firstChap = firstSubj?.chapters[0];
    setChapter(firstChap?.name || '');
    setSelectedChapters(firstChap ? [firstChap.name] : []);
    setTopic('All Chapter Topics');
    setMarksPerQuestion(ex.defaultMarksPerQuestion);
    setNegativeMarkingEnabled(ex.defaultNegativeMarking);
    setNegativeMarksPerWrong(ex.defaultNegativePenalty || 0.25);
  };

  const handleSelectCategory = (catId: ExamCategoryId) => {
    setActiveCategory(catId);
    setErrorMsg(null);
    setScope('full-syllabus');
    if (catId === 'odisha-board' && settings.language !== 'english') {
      setLanguage('odia');
    }
    if (catId === 'combined') {
      setMarksPerQuestion(1);
      setNegativeMarkingEnabled(false);
      return;
    }
    if (catId === 'ugc-net') {
      setMarksPerQuestion(2);
      setNegativeMarkingEnabled(false);
      setNegativeMarksPerWrong(0);
      if (settings.language === 'hindi' || settings.language === 'odia' || settings.language === 'english') {
        setLanguage(settings.language);
      } else {
        setLanguage('english');
      }
      fetchPublishedUgcNetSyllabus()
        .then((res) => setLocalUgcCatalog(res))
        .catch(() => {});
      return;
    }
    if (catId === 'upsc') {
      const mp = activeUpscRecord?.markingPattern;
      setMarksPerQuestion(mp?.marksPerQuestion ?? (upscPaperId === 'prelims-csat' ? 2.5 : 2));
      setNegativeMarkingEnabled(mp?.negativeMarkingEnabled ?? true);
      setNegativeMarksPerWrong(mp?.negativeMarksPerWrong ?? (upscPaperId === 'prelims-csat' ? 0.83 : 0.66));
      setDurationMinutes(mp?.durationMinutes ?? 120);
      setLanguage(settings.language === 'hindi' ? 'hindi' : 'english');
      fetchPublishedUpscSyllabus()
        .then((res) => setLocalUpscCatalog(res))
        .catch(() => {});
      return;
    }
    const firstExam = allExams.find((e) => e.category === catId);
    applyExamDefaults(firstExam);
  };

  const scopeFilteredChapters = useMemo(() => {
    const chaps = selectedSubjectObj?.chapters || [];
    if (scope === 'term-1' || scope === 'half-yearly') {
      const t1 = chaps.filter((c) => c.term === 'Term I');
      return t1.length > 0 ? t1 : chaps;
    }
    if (scope === 'term-2' || scope === 'annual') {
      const t2 = chaps.filter((c) => c.term === 'Term II');
      return t2.length > 0 ? t2 : chaps;
    }
    return chaps;
  }, [selectedSubjectObj, scope]);

  const combinedSelectedList = useMemo(
    () =>
      Object.entries(combinedCounts)
        .filter(([, count]) => count > 0)
        .map(([subj, count]) => ({ subject: subj, count })),
    [combinedCounts],
  );

  const combinedTotalQuestions = useMemo(
    () => combinedSelectedList.reduce((sum, item) => sum + item.count, 0),
    [combinedSelectedList],
  );

  const resolvedQuestionCount =
    activeCategory === 'combined'
      ? combinedTotalQuestions
      : questionCountPreset === 'custom'
        ? Math.max(5, Math.min(100, customCount))
        : questionCountPreset;

  const activeCategoryMeta =
    EXAM_CATEGORIES.find((c) => c.id === activeCategory) || EXAM_CATEGORIES[0];

  const handleAddChapterOrTopic = (
    examId: string,
    classId: string,
    subjectName: string,
    chapterName: string,
    topicName: string,
  ) => {
    if (onAddChapterOrTopic) {
      onAddChapterOrTopic(examId, classId, subjectName, chapterName, topicName);
      return;
    }
    const baseExam = allExams.find((e) => e.id === examId);
    if (!baseExam) return;
    const cloned: ExamDefinition = JSON.parse(JSON.stringify(baseExam)) as ExamDefinition;
    const cls = cloned.classesOrPapers.find((c) => c.id === classId);
    if (!cls) return;
    let subj = cls.subjects.find((s) => s.name === subjectName);
    if (!subj) {
      subj = { name: subjectName, chapters: [] };
      cls.subjects.push(subj);
    }
    let chap = subj.chapters.find((ch) => ch.name === chapterName);
    if (!chap) {
      chap = { name: chapterName, topics: [] };
      subj.chapters.push(chap);
    }
    if (!chap.topics.includes(topicName)) {
      chap.topics.push(topicName);
    }
    setLocalCustomExams((prev) => [...prev.filter((x) => x.id !== cloned.id), cloned]);
  };

  const submitExam = () => {
    if (!activeConfig || questions.length === 0) return;
    const now = Date.now();
    const timeTakenSeconds = Math.max(1, Math.round((now - startedAt) / 1000));
    let correctCount = 0;
    let incorrectCount = 0;
    let unattemptedCount = 0;

    const bySubject = new Map<
      string,
      { total: number; attempted: number; correct: number; incorrect: number; unattempted: number }
    >();

    for (const q of questions) {
      const subjName = q.subject || activeConfig.subject || 'General';
      if (!bySubject.has(subjName)) {
        bySubject.set(subjName, {
          total: 0,
          attempted: 0,
          correct: 0,
          incorrect: 0,
          unattempted: 0,
        });
      }
      const stat = bySubject.get(subjName)!;
      stat.total++;

      const ans = answers[q.id];
      if (!isAttempted(ans)) {
        unattemptedCount++;
        stat.unattempted++;
      } else {
        stat.attempted++;
        if (isQuestionCorrect(q, ans)) {
          correctCount++;
          stat.correct++;
        } else {
          incorrectCount++;
          stat.incorrect++;
        }
      }
    }

    const posMarks = activeConfig.marksPerQuestion || 1;
    const negPenalty = activeConfig.negativeMarkingEnabled
      ? activeConfig.negativeMarksPerWrong || 0
      : 0;
    const rawScore = correctCount * posMarks - incorrectCount * negPenalty;
    const maxScore = questions.length * posMarks;
    const attemptedTotal = correctCount + incorrectCount;
    const accuracyPercentage =
      attemptedTotal > 0 ? (correctCount / attemptedTotal) * 100 : 0;
    const percentage = maxScore > 0 ? Math.max(0, (rawScore / maxScore) * 100) : 0;

    const subjectBreakdown: SubjectPerformance[] = Array.from(bySubject.entries()).map(
      ([subjName, st]) => ({
        subject: subjName,
        total: st.total,
        attempted: st.attempted,
        correct: st.correct,
        incorrect: st.incorrect,
        unattempted: st.unattempted,
        marks: st.correct * posMarks - st.incorrect * negPenalty,
        maxMarks: st.total * posMarks,
        accuracy: st.attempted > 0 ? (st.correct / st.attempted) * 100 : 0,
      }),
    );

    const attempt: MockTestAttempt = {
      id: `mock-${now}`,
      config: activeConfig,
      questions,
      answers,
      markedForReview: marked,
      visited,
      startedAt,
      submittedAt: now,
      timeTakenSeconds,
      score: rawScore,
      maxScore,
      correctCount,
      incorrectCount,
      unattemptedCount,
      accuracyPercentage,
      percentage,
      subjectBreakdown,
    };

    onSaveAttempt(attempt);
    setActiveResult(attempt);
    setShowSubmitModal(false);
    setPhase('result');
  };

  useEffect(() => {
    if (phase !== 'exam' || !activeConfig || activeConfig.practiceMode) return;
    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          submitExam();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, activeConfig]);

  const selectIndividualSubject = (sName: string) => {
    setSubject(sName);
    const sObj = availableSubjects.find((s) => s.name === sName);
    if (sObj?.subjectLanguage === 'Hindi' || sName.toLowerCase().includes('hindi')) {
      setLanguage('hindi');
      if (selectedClass?.mediums?.includes('Hindi Medium')) {
        setMedium('Hindi Medium');
      }
    } else if (
      (sObj?.subjectLanguage === 'English' || sName.toLowerCase().startsWith('english')) &&
      activeCategory === 'cbse'
    ) {
      setLanguage('english');
      if (selectedClass?.mediums?.includes('English Medium')) {
        setMedium('English Medium');
      }
    }
    const firstValidChap =
      sObj?.chapters.find((c) => !c.excludedFromExam)?.name ||
      sObj?.chapters[0]?.name ||
      '';
    setChapter(firstValidChap);
    setSelectedChapters(firstValidChap ? [firstValidChap] : []);
    setTopic('All Chapter Topics');
    if (scope === 'full-syllabus' || scope === 'chapter-wise') {
      setScope('subject-wise');
    }
    setErrorMsg(null);
  };

  const selectIndividualChapter = (chapName: string) => {
    setScope('chapter-wise');
    setChapter(chapName);
    setSelectedChapters([chapName]);
    setTopic('All Chapter Topics');
    setErrorMsg(null);
  };

  const selectIndividualTopic = (chapName: string, topicName: string) => {
    setScope('chapter-wise');
    setChapter(chapName);
    setSelectedChapters([chapName]);
    setTopic(topicName);
    setErrorMsg(null);
  };

  const buildActiveConfigAndChapters = (targetLanguage: MockLanguage) => {
    if (activeCategory === 'ugc-net') {
      const ugcRec = activeUgcRecord;
      const selectedUnits = ugcRec
        ? ugcSelectedUnitIds.length > 0
          ? ugcRec.units.filter((u) => ugcSelectedUnitIds.includes(u.unitId))
          : ugcRec.units
        : [];
      const selectedTopics = ugcRec
        ? ugcRec.units.flatMap((u) =>
            u.topics.filter((t) => ugcSelectedTopicIds.includes(t.topicId)),
          )
        : [];

      const effectiveSubject = ugcRec
        ? ugcPaperType === 'paper-1'
          ? 'Paper 1 – Teaching & Research Aptitude'
          : ugcRec.subjectName
        : 'UGC NET';

      const modeScopeLabel =
        ugcTestMode === 'complete-paper-1'
          ? 'Complete Paper 1 Syllabus'
          : ugcTestMode === 'complete-paper-2'
            ? `Complete Paper 2 Syllabus (${effectiveSubject})`
            : ugcTestMode === 'selected-units'
              ? `${selectedUnits.length} Selected Unit(s)`
              : ugcTestMode === 'selected-topics'
                ? `${selectedTopics.length} Selected Topic(s)`
                : 'Mixed Topics Practice';

      const config: MockTestConfig = {
        category: 'ugc-net',
        examName: 'NTA UGC NET / JRF',
        classOrPaper:
          ugcPaperType === 'paper-1'
            ? 'Paper 1 – Teaching & Research Aptitude'
            : `Paper 2 – ${effectiveSubject}`,
        subject: effectiveSubject,
        chapter:
          ugcTestMode === 'selected-units'
            ? selectedUnits.map((u) => u.title).join(', ')
            : modeScopeLabel,
        selectedChapters: selectedUnits.map((u) => u.title),
        topic:
          ugcTestMode === 'selected-topics'
            ? selectedTopics.map((t) => t.title).join(', ')
            : modeScopeLabel,
        scope:
          ugcTestMode === 'selected-units' || ugcTestMode === 'selected-topics'
            ? 'chapter-wise'
            : ugcTestMode === 'complete-paper-1' || ugcTestMode === 'complete-paper-2'
              ? 'full-syllabus'
              : 'subject-wise',
        difficulty,
        questionType,
        questionCount: resolvedQuestionCount,
        durationMinutes: practiceMode ? 0 : Math.max(5, durationMinutes),
        practiceMode,
        language: targetLanguage,
        marksPerQuestion: Math.max(0.5, marksPerQuestion),
        negativeMarkingEnabled,
        negativeMarksPerWrong: negativeMarkingEnabled ? Math.max(0, negativeMarksPerWrong) : 0,
        syllabusReferenceNote: ugcRec ? `${ugcRec.versionLabel} (${ugcRec.academicSession})` : undefined,
        syllabusSource: ugcRec ? `Admin Published UGC NET ${ugcRec.versionLabel}` : undefined,
        syllabusVersionId: ugcRec?.syllabusVersionId,
        syllabusVersionLabel: ugcRec?.versionLabel,
        ugcNetPaperType: ugcPaperType,
        ugcNetSubjectId: ugcRec?.subjectId,
        ugcNetTestMode: ugcTestMode,
        ugcNetUnitIds: ugcSelectedUnitIds.length > 0 ? ugcSelectedUnitIds : undefined,
        ugcNetTopicIds: ugcSelectedTopicIds.length > 0 ? ugcSelectedTopicIds : undefined,
      };

      const usableChaptersList = selectedUnits.map((u) => ({
        name: u.title,
        topics: u.topics.map((t) => t.title),
      }));

      return {
        config,
        effectiveSubject,
        usableChaptersList,
        chapterSummaryLabel: modeScopeLabel,
        syllabusRef: undefined,
      };
    }

    if (activeCategory === 'upsc') {
      const uRec = activeUpscRecord;
      const selectedAreas = uRec
        ? upscAreaIds.length > 0
          ? uRec.areas.filter((a) => upscAreaIds.includes(a.areaId))
          : uRec.areas
        : [];
      const selectedTopics = uRec
        ? uRec.areas.flatMap((a) =>
            a.topics.filter((t) => upscTopicIds.includes(t.topicId)),
          )
        : [];

      const effectiveSubject = uRec?.paperLabel || 'UPSC Prelims';
      const modeScopeLabel =
        upscTestMode === 'full-syllabus'
          ? `Full ${effectiveSubject} Syllabus`
          : upscTestMode === 'area-wise'
            ? `${selectedAreas.length} Selected Subject Area(s)`
            : upscTestMode === 'topic-wise'
              ? `${selectedTopics.length} Selected Topic(s)`
              : 'Mixed UPSC Areas & Topics';

      const config: MockTestConfig = {
        category: 'upsc',
        examName: 'UPSC Civil Services (Prelims)',
        classOrPaper: effectiveSubject,
        subject:
          upscTestMode === 'area-wise' && selectedAreas.length > 0
            ? selectedAreas.map((a) => a.title).join(', ')
            : effectiveSubject,
        chapter:
          upscTestMode === 'area-wise'
            ? selectedAreas.map((a) => a.title).join(', ')
            : modeScopeLabel,
        selectedChapters: selectedAreas.map((a) => a.title),
        topic:
          upscTestMode === 'topic-wise'
            ? selectedTopics.map((t) => t.title).join(', ')
            : modeScopeLabel,
        scope:
          upscTestMode === 'area-wise' || upscTestMode === 'topic-wise'
            ? 'chapter-wise'
            : 'full-syllabus',
        difficulty,
        questionType,
        questionCount: resolvedQuestionCount,
        durationMinutes: practiceMode ? 0 : Math.max(5, durationMinutes),
        practiceMode,
        language: targetLanguage,
        marksPerQuestion: Math.max(0.5, marksPerQuestion),
        negativeMarkingEnabled,
        negativeMarksPerWrong: negativeMarkingEnabled ? Math.max(0, negativeMarksPerWrong) : 0,
        syllabusReferenceNote: uRec ? `${uRec.versionLabel} (${uRec.examYear})` : undefined,
        syllabusSource: uRec ? `Admin Published UPSC ${uRec.versionLabel}` : undefined,
        syllabusVersionId: uRec?.syllabusVersionId,
        syllabusVersionLabel: uRec?.versionLabel,
        upscStage: 'prelims',
        upscPaperId: (uRec?.paperId || upscPaperId) as UpscPaperId,
        upscTestMode,
        upscAreaIds: upscAreaIds.length > 0 ? upscAreaIds : undefined,
        upscTopicIds: upscTopicIds.length > 0 ? upscTopicIds : undefined,
      };

      const usableChaptersList = selectedAreas.map((a) => ({
        name: a.title,
        topics: a.topics.map((t) => t.title),
      }));

      return {
        config,
        effectiveSubject,
        usableChaptersList,
        chapterSummaryLabel: modeScopeLabel,
        syllabusRef: undefined,
      };
    }

    const effectiveSubject =
      activeCategory === 'combined'
        ? `${combinedSelectedList.length} Combined Subjects`
        : scope === 'full-syllabus' && availableSubjects.length > 1
          ? `Full Syllabus (All ${availableSubjects.length} Subjects)`
          : selectedSubjectObj?.name || subject;

    const syllabusRef = syllabusPdfs.find((p) => p.id === selectedSyllabusPdfId);

    const activeChaptersList =
      scope === 'chapter-wise'
        ? (selectedSubjectObj?.chapters || []).filter((c) =>
            selectedChapters.length > 0
              ? selectedChapters.includes(c.name)
              : c.name === chapter,
          )
        : scopeFilteredChapters;

    const usableChaptersList = activeChaptersList.filter((c) => !c.excludedFromExam);

    const chapterSummaryLabel =
      scope === 'chapter-wise'
        ? usableChaptersList.map((c) => c.name).join(', ')
        : scope === 'term-1'
          ? 'Term I (IA-1 & IA-2)'
          : scope === 'term-2'
            ? 'Term II (IA-3 & IA-4)'
            : scope === 'half-yearly'
              ? 'Half-Yearly Examination (Term I)'
              : scope === 'annual'
                ? 'Annual Examination (Term II)'
                : scope === 'subject-wise'
                  ? 'Complete Subject Syllabus'
                  : 'Full Syllabus (All Subjects)';

    const config: MockTestConfig = {
      category: activeCategory,
      examName:
        activeCategory === 'combined'
          ? 'COMBINED EXAM MOCK TEST'
          : selectedExam?.name || 'Mock Examination',
      medium: selectedClass?.mediums ? medium : undefined,
      classOrPaper:
        activeCategory === 'combined'
          ? 'Multi-Subject Combined Test'
          : selectedClass?.label || '',
      subject: effectiveSubject,
      chapter: chapterSummaryLabel,
      selectedChapters:
        scope === 'chapter-wise' ? usableChaptersList.map((c) => c.name) : undefined,
      topic: scope === 'chapter-wise' ? topic : 'Full Portion Coverage',
      scope,
      difficulty,
      questionType,
      questionCount: resolvedQuestionCount,
      durationMinutes: practiceMode ? 0 : Math.max(5, durationMinutes),
      practiceMode,
      language: targetLanguage,
      marksPerQuestion: Math.max(0.5, marksPerQuestion),
      negativeMarkingEnabled,
      negativeMarksPerWrong: negativeMarkingEnabled ? Math.max(0, negativeMarksPerWrong) : 0,
      combinedSubjects:
        activeCategory === 'combined' ? combinedSelectedList : undefined,
      syllabusReferenceNote: syllabusRef?.fileName,
      syllabusSource:
        activeCategory === 'odisha-board' && !syllabusRef
          ? BSE_ODISHA_SYLLABUS_PDF_NAME
          : syllabusRef?.fileName,
    };

    return { config, effectiveSubject, usableChaptersList, chapterSummaryLabel, syllabusRef };
  };

  const generateQuestionsForConfig = async (
    config: MockTestConfig,
    effectiveSubject: string,
    usableChaptersList: Array<{
      name: string;
      section?: string;
      term?: string;
      assessment?: string;
      topics: string[];
      excludedFromExam?: boolean;
    }>,
    chapterSummaryLabel: string,
    syllabusRef: SyllabusPdfReference | undefined,
    onProgress: (msg: string) => void,
  ): Promise<MockQuestion[]> => {
    if (config.category === 'ugc-net') {
      if (!config.syllabusVersionId || !config.ugcNetPaperType || !config.ugcNetTestMode) {
        throw new Error('No published UGC NET syllabus version is selected.');
      }
      onProgress(
        `Generating ${config.questionCount} UGC NET ${config.ugcNetPaperType === 'paper-1' ? 'Paper 1' : config.subject} mock test questions from published ${config.syllabusVersionLabel || 'syllabus'}...`,
      );
      const res = await generateUgcNetMockTestApi({
        paperType: config.ugcNetPaperType,
        subjectId: config.ugcNetSubjectId,
        syllabusVersionId: config.syllabusVersionId,
        testMode: config.ugcNetTestMode,
        unitIds: config.ugcNetUnitIds,
        topicIds: config.ugcNetTopicIds,
        questionCount: config.questionCount,
        difficulty: config.difficulty,
        language: config.language,
        selectionMode: settings.selectionMode,
        provider: settings.provider,
        model: settings.model,
      });
      return res.questions.map((q, idx) => ({
        ...q,
        id: idx + 1,
      }));
    }

    if (config.category === 'upsc') {
      if (!config.syllabusVersionId || !config.upscTestMode) {
        throw new Error('No published UPSC Prelims syllabus version is selected.');
      }
      onProgress(
        `Generating ${config.questionCount} UPSC ${config.classOrPaper} questions from published ${config.syllabusVersionLabel || 'syllabus'}...`,
      );
      const res = await generateUpscMockTestApi({
        syllabusVersionId: config.syllabusVersionId,
        paperId: config.upscPaperId,
        testMode: config.upscTestMode,
        areaIds: config.upscAreaIds,
        topicIds: config.upscTopicIds,
        questionCount: config.questionCount,
        difficulty: config.difficulty,
        language: config.language,
        selectionMode: settings.selectionMode,
        provider: settings.provider,
        model: settings.model,
      });
      return res.questions.map((q, idx) => ({
        ...q,
        id: idx + 1,
      }));
    }

    const collected: MockQuestion[] = [];
    const seenStems = new Set<string>();
    const targetLang = config.language;

    const normalizeParsedItems = (
      rawItems: Array<{
        questionType?: string;
        subject?: string;
        passage?: string;
        question: string;
        options?: string[];
        correctIndex?: number;
        correctIndices?: number[];
        numericalAnswer?: string | number;
        explanation: string;
        topicTag?: string;
      }>,
      defaultSubject: string,
      allowedSubjectNames?: string[],
    ): MockQuestion[] => {
      const normalized: MockQuestion[] = [];
      for (const item of rawItems) {
        if (!item.question || typeof item.question !== 'string') continue;
        const stemKey = item.question.trim().toLowerCase().slice(0, 80);
        if (seenStems.has(stemKey)) continue;
        seenStems.add(stemKey);

        const qTypeRaw = item.questionType || (questionType === 'Mixed' ? 'MCQ' : questionType);
        const normalizedType = (
          [
            'MCQ',
            'Multiple-Select',
            'True-False',
            'Assertion-Reasoning',
            'Match-Following',
            'Statement-Based',
            'Numerical',
            'Comprehension',
          ].includes(qTypeRaw)
            ? qTypeRaw
            : 'MCQ'
        ) as Exclude<ExamQuestionType, 'Mixed'>;

        let opts = Array.isArray(item.options) ? item.options : [];
        if (normalizedType === 'True-False') {
          if (opts.length < 2) {
            opts =
              targetLang === 'odia'
                ? ['ସତ୍ୟ (True)', 'ମିଥ୍ୟା (False)']
                : targetLang === 'hindi'
                  ? ['सत्य (True)', 'असत्य (False)']
                  : ['True', 'False'];
          } else {
            opts = opts.slice(0, 2);
          }
        } else if (normalizedType === 'Numerical') {
          opts = [];
        } else if (opts.length < 4) {
          while (opts.length < 4) opts.push(`Option ${String.fromCharCode(65 + opts.length)}`);
        } else {
          opts = opts.slice(0, 4);
        }

        const safeIdx =
          typeof item.correctIndex === 'number' &&
          item.correctIndex >= 0 &&
          item.correctIndex < Math.max(1, opts.length)
            ? item.correctIndex
            : 0;

        const safeIndices =
          normalizedType === 'Multiple-Select'
            ? Array.isArray(item.correctIndices) && item.correctIndices.length > 0
              ? item.correctIndices.filter((i) => i >= 0 && i < opts.length)
              : [safeIdx]
            : undefined;

        let resolvedSubj = defaultSubject;
        if (allowedSubjectNames && allowedSubjectNames.length > 0 && item.subject) {
          const matched = allowedSubjectNames.find(
            (name) =>
              name.toLowerCase() === item.subject!.trim().toLowerCase() ||
              name.toLowerCase().includes(item.subject!.trim().toLowerCase()) ||
              item.subject!.trim().toLowerCase().includes(name.toLowerCase()),
          );
          if (matched) resolvedSubj = matched;
        }

        normalized.push({
          id: collected.length + normalized.length + 1,
          questionType: normalizedType,
          subject: resolvedSubj,
          passage: item.passage,
          question: item.question,
          options: opts,
          correctIndex: safeIdx,
          correctIndices: safeIndices,
          numericalAnswer:
            item.numericalAnswer !== undefined && item.numericalAnswer !== null
              ? String(item.numericalAnswer)
              : undefined,
          explanation: item.explanation || 'Verified solution provided.',
          topicTag: item.topicTag || resolvedSubj,
        });
      }
      return normalized;
    };

    const questionTypeDirective =
      questionType === 'Mixed'
        ? 'Use a mix of MCQ, Multiple-Select, True-False, Assertion-Reasoning, Match-Following, Statement-Based, Numerical, and Comprehension-based questions. Set "questionType" accurately for each item.'
        : `Generate ONLY "${questionType}" questions and set "questionType" to "${questionType}" for every item.`;

    const cbseHindiIsolation =
      activeCategory === 'cbse' && selectedSubjectObj?.subjectLanguage === 'Hindi'
        ? ` STRICT CBSE HINDI ISOLATION: You are generating for "${selectedSubjectObj.name}" (${config.classOrPaper}) ONLY using prescribed NCERT books (${selectedSubjectObj.prescribedBooks?.join(', ')}). NEVER mix Hindi Course A (Code 002) with Hindi Course B (Code 085), and NEVER mix Hindi Core (Code 302) with Hindi Elective (Code 002). Write all content in accurate Devanagari Hindi.`
        : '';

    const syllabusRules =
      activeCategory === 'odisha-board'
        ? `Strictly follow BSE Odisha (Board of Secondary Education, Odisha, Cuttack) Class 10 2025-26 Official Syllabus (${BSE_ODISHA_SYLLABUS_PDF_NAME}, ${medium}). Do NOT mix CBSE, NCERT Class 12, or other board syllabuses. Exclude any topic marked "No Question Set in the Examination".`
        : activeCategory === 'cbse'
          ? `Strictly follow CBSE NCERT ${config.classOrPaper} syllabus. Do NOT mix BSE Odisha or other classes.${cbseHindiIsolation}`
          : activeCategory === 'ugc-net'
            ? `Strictly follow NTA UGC NET ${config.classOrPaper} syllabus. Keep Paper 1 and Paper 2 strictly separate.`
            : activeCategory === 'competitive'
              ? `Strictly follow ${config.examName} (${config.classOrPaper}) competitive exam standard and Odisha/India context.`
              : `Strictly cover each requested subject accurately at standard competitive/academic level.`;

    const syllabusExcerpt = syllabusRef
      ? `\nUploaded Official Syllabus Reference (${syllabusRef.fileName}):\n${syllabusRef.extractedText.slice(0, 14000)}\n`
      : '';

    const isMultiSubjectFullSyllabus =
      activeCategory !== 'combined' &&
      scope === 'full-syllabus' &&
      availableSubjects.length > 1;

    if (isMultiSubjectFullSyllabus) {
      // Distribute total questions evenly across ALL available subjects in the syllabus
      const candidateSubjects = availableSubjects.filter(
        (s) => s.chapters.some((c) => !c.excludedFromExam) || s.chapters.length === 0,
      );
      const subjList = candidateSubjects.length > 0 ? candidateSubjects : availableSubjects;
      const numSubj = subjList.length;

      const allocations: Array<{
        subjObj: (typeof subjList)[number];
        count: number;
      }> = [];

      if (resolvedQuestionCount >= numSubj) {
        const base = Math.floor(resolvedQuestionCount / numSubj);
        const extra = resolvedQuestionCount % numSubj;
        subjList.forEach((sObj, idx) => {
          allocations.push({ subjObj: sObj, count: base + (idx < extra ? 1 : 0) });
        });
      } else {
        // Spread custom small count cleanly across distinct subjects
        for (let i = 0; i < resolvedQuestionCount; i++) {
          const pickedIdx = Math.floor((i * numSubj) / resolvedQuestionCount);
          const sObj = subjList[pickedIdx];
          const existing = allocations.find((a) => a.subjObj.name === sObj.name);
          if (existing) existing.count++;
          else allocations.push({ subjObj: sObj, count: 1 });
        }
      }

      // Pack subject allocations into efficient multi-subject API chunks (up to 12 Qs per request)
      const chunks: Array<typeof allocations> = [];
      let currentChunk: typeof allocations = [];
      let currentChunkSum = 0;

      for (const alloc of allocations) {
        if (alloc.count <= 0) continue;
        let remaining = alloc.count;
        while (remaining > 0) {
          const room = 12 - currentChunkSum;
          if (room <= 0) {
            chunks.push(currentChunk);
            currentChunk = [];
            currentChunkSum = 0;
            continue;
          }
          const take = Math.min(remaining, room);
          currentChunk.push({ subjObj: alloc.subjObj, count: take });
          currentChunkSum += take;
          remaining -= take;
        }
      }
      if (currentChunk.length > 0) chunks.push(currentChunk);

      const totalTarget = resolvedQuestionCount;
      for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
        const chunk = chunks[cIdx];
        const chunkTarget = chunk.reduce((s, x) => s + x.count, 0);
        let generatedInChunk = 0;
        let safetyRounds = 0;

        while (generatedInChunk < chunkTarget && safetyRounds < 4) {
          safetyRounds++;
          const neededNow = chunkTarget - generatedInChunk;
          const chunkSubjectNames = chunk.map((x) => x.subjObj.name);
          onProgress(
            `Generating Full Syllabus (${collected.length + 1}–${Math.min(totalTarget, collected.length + neededNow)} of ${totalTarget} questions across all ${numSubj} subjects)...`,
          );

          const subjectBreakdownSpec = chunk
            .map(({ subjObj, count }) => {
              const validChaps = subjObj.chapters
                .filter((c) => !c.excludedFromExam)
                .slice(0, 8)
                .map((c) => `${c.name}${c.topics.length ? ` (${c.topics.slice(0, 4).join(', ')})` : ''}`)
                .join('; ');
              const langTag =
                subjObj.subjectLanguage && subjObj.subjectLanguage !== 'Odia'
                  ? ` [Original Language Subject: ${subjObj.subjectLanguage}]`
                  : '';
              return `- "${subjObj.name}" (${count} Qs)${langTag}: Chapters -> ${validChaps || 'Standard official syllabus'}`;
            })
            .join('\n');

          const langRule =
            targetLang === 'odia'
              ? 'CRITICAL MEDIUM RULE (ODIA MEDIUM): Write 100% of EVERY question, option, direction, and explanation strictly in natural, grammatically correct Odia (ଓଡ଼ିଆ Unicode). For subjects marked [Original Language Subject: English/Hindi/Sanskrit], preserve reading passages/grammar test items in their original language while keeping directions and explanations in Odia.'
              : targetLang === 'hindi'
                ? 'CRITICAL MEDIUM RULE (HINDI MEDIUM): Write 100% of EVERY question, option, direction, and explanation strictly in pure, grammatically accurate Devanagari Hindi (हिन्दी). NEVER mix English sentences or Hinglish (keep only mathematical symbols, chemical formulas, SI units, and [Original Language Subject] literature extracts where required).'
                : 'CRITICAL MEDIUM RULE (ENGLISH MEDIUM): Write 100% of EVERY question, option, direction, and explanation strictly in clear, formal Academic English. NEVER include Hindi words, Devanagari script, or Hinglish anywhere (even if chapter/topic headings are written in Odia/Hindi script; preserve original language extracts ONLY for dedicated language-literature subjects such as Hindi/Sanskrit/Odia).';

          const avoidList = Array.from(seenStems).slice(-12).join(' | ');

          const prompt = `Generate exactly ${neededNow} fresh, non-repeating AI practice examination questions covering MULTIPLE subjects from this FULL SYLLABUS batch.
Examination: ${config.examName}
Class / Paper: ${config.classOrPaper}
Portion / Scope: Full Syllabus (All Subjects)
Difficulty: ${config.difficulty}
${langRule}
${syllabusRules}
${questionTypeDirective}
${syllabusExcerpt}

Required Subject Distribution for this batch (generate from these exact subjects ONLY):
${subjectBreakdownSpec}

Formatting & Answer Verification Rules:
- Standard MCQ / Assertion-Reasoning / Match-Following / Statement-Based / Comprehension: provide exactly 4 distinct options in "options" and valid "correctIndex" (0-3).
- Multiple-Select: provide 4 options and array "correctIndices" (e.g. [0, 2]).
- True-False: provide 2 options and valid "correctIndex" (0 or 1).
- Numerical: leave "options" empty [] and put exact numeric answer string in "numericalAnswer".
- Set "subject" on every question object to the exact matching subject name listed above.
- Do NOT invent or claim these as official previous-year questions.
- Return ONLY a valid JSON object matching this exact structure (no markdown fences):
{"questions":[{"questionType":"MCQ","subject":"${chunk[0].subjObj.name}","passage":"","question":"...","options":["...","...","...","..."],"correctIndex":0,"correctIndices":[],"numericalAnswer":"","explanation":"...","topicTag":"..."}]}
${avoidList ? `- Do NOT repeat these earlier questions: ${avoidList}` : ''}`;

          const res = await generateAI({
            provider: settings.provider,
            model: settings.model,
            language: targetLang,
            prompt,
            responseMimeType: 'application/json',
          });

          const parsed = parseSafeJson<{
            questions: Array<{
              questionType?: string;
              subject?: string;
              passage?: string;
              question: string;
              options?: string[];
              correctIndex?: number;
              correctIndices?: number[];
              numericalAnswer?: string | number;
              explanation: string;
              topicTag?: string;
            }>;
          }>(res.text);

          if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
            throw new Error('AI returned an empty batch of questions. Please retry.');
          }

          const cleanBatch = normalizeParsedItems(
            parsed.questions,
            chunk[0].subjObj.name,
            chunkSubjectNames,
          );

          for (const qItem of cleanBatch) {
            if (generatedInChunk >= chunkTarget) break;
            collected.push({ ...qItem, id: collected.length + 1 });
            generatedInChunk++;
          }
        }
      }
    } else {
      // STRICT SINGLE SUBJECT / CHAPTER / TOPIC OR COMBINED EXAM MODE
      const subjLang = selectedSubjectObj?.subjectLanguage;
      const isLiteratureSubjectForTarget = Boolean(
        subjLang &&
          ((targetLang === 'odia' && subjLang !== 'Odia') ||
            (targetLang === 'hindi' && subjLang !== 'Hindi') ||
            (targetLang === 'english' && subjLang !== 'English')),
      );

      const languageDirective =
        targetLang === 'odia'
          ? isLiteratureSubjectForTarget
            ? `CRITICAL LANGUAGE RULE FOR ${effectiveSubject}: Preserve reading passages, prose/poetry quotes, grammar examples, and language-specific test items in original ${subjLang} where necessary; write ALL test directions/instructions and detailed explanations in natural, grammatically correct Odia (ଓଡ଼ିଆ script).`
            : 'CRITICAL MEDIUM RULE (ODIA MEDIUM): Write 100% of EVERY question, passage, option, and explanation strictly in natural, grammatically correct Odia (ଓଡ଼ିଆ script). Keep standard mathematical symbols/units clear.'
          : targetLang === 'hindi'
            ? isLiteratureSubjectForTarget
              ? `CRITICAL LANGUAGE RULE FOR ${effectiveSubject}: Preserve reading passages, quotes, and grammar items in original ${subjLang} where necessary; write ALL instructions, questions, and explanations strictly in pure Devanagari Hindi (हिन्दी).`
              : 'CRITICAL MEDIUM RULE (HINDI MEDIUM): Write 100% of EVERY question, passage, option, and explanation strictly in pure, grammatically accurate Devanagari Hindi (हिन्दी). NEVER mix English sentences or Hinglish (keep only standard mathematical symbols, chemical formulas, and SI units clearly formatted).'
            : isLiteratureSubjectForTarget
              ? `CRITICAL LANGUAGE RULE FOR ${effectiveSubject}: Preserve reading passages and language-specific items in ${subjLang} where needed; write ALL instructions, questions, options, and explanations strictly in clear, formal English.`
              : 'CRITICAL MEDIUM RULE (ENGLISH MEDIUM): Write 100% of EVERY question, passage, option, and explanation strictly in clear, formal Academic English. NEVER include Hindi words, Devanagari script, or Hinglish anywhere (even if a chapter or topic name contains Odia/Hindi script).';

      const isTopicFocused = scope === 'chapter-wise' && topic && topic !== 'All Chapter Topics';

      const isolationInstruction =
        activeCategory === 'combined'
          ? ''
          : isTopicFocused
            ? `\nSTRICT SUBJECT & TOPIC ISOLATION: Generate ALL questions STRICTLY from Subject "${effectiveSubject}", Chapter "${chapterSummaryLabel}", and specific Topic "${topic}" ONLY. Do NOT include questions from any other topic, chapter, or subject.`
            : scope === 'chapter-wise'
              ? `\nSTRICT SUBJECT & CHAPTER ISOLATION: Generate ALL questions STRICTLY from Subject "${effectiveSubject}" and Chapter(s) "${chapterSummaryLabel}" ONLY. Do NOT mix questions from other chapters or subjects.`
              : `\nSTRICT SUBJECT ISOLATION: Generate ALL questions STRICTLY from Subject "${effectiveSubject}" ONLY. Do NOT include or mix questions from any other subject.`;

      const allowedChaptersPrompt =
        activeCategory !== 'combined' && usableChaptersList.length > 0
          ? `\nOfficial Allowed Syllabus (${chapterSummaryLabel}):\n${usableChaptersList
              .map(
                (c) =>
                  `- Chapter: ${c.name}${c.section ? ` [${c.section}]` : ''}${c.assessment ? ` (${c.term} · ${c.assessment})` : ''}${c.topics.length ? ` | Topics: ${c.topics.join('; ')}` : ''}`,
              )
              .join('\n')}${
              selectedSubjectObj?.prescribedBooks?.length
                ? `\nPrescribed Textbooks: ${selectedSubjectObj.prescribedBooks.join(', ')}`
                : ''
            }${isTopicFocused ? `\nREQUIRED FOCUS TOPIC: "${topic}" (All questions MUST test "${topic}" specifically!)` : ''}`
          : '';

      const workUnits: Array<{ subj: string; count: number }> =
        activeCategory === 'combined'
          ? combinedSelectedList.map((u) => ({ subj: u.subject, count: u.count }))
          : [{ subj: effectiveSubject, count: resolvedQuestionCount }];

      const totalTarget = workUnits.reduce((s, u) => s + u.count, 0);

      for (const unit of workUnits) {
        let generatedForUnit = 0;
        let safetyRounds = 0;

        try {
          const qb = await fetchCentralQuestions({
            examId: selectedExam?.id,
            subject: unit.subj,
          });
          const matching = qb.questions.filter((bq) => {
            if (scope === 'chapter-wise' && selectedChapters.length > 0 && bq.chapter) {
              if (
                !selectedChapters.includes(bq.chapter) &&
                bq.chapter.toLowerCase() !== 'all chapters'
              ) {
                return false;
              }
            }
            if (questionType !== 'Mixed' && bq.typeId !== questionType) return false;
            return true;
          });

          for (const bq of matching) {
            if (generatedForUnit >= unit.count) break;
            const stemKey = bq.question.trim().toLowerCase();
            if (seenStems.has(stemKey)) continue;
            seenStems.add(stemKey);

            const opts = Array.isArray(bq.options) ? bq.options : [];
            const ansIdx = opts.findIndex(
              (o) => o.trim().toLowerCase() === bq.correctAnswer.trim().toLowerCase(),
            );
            const mappedType: MockQuestion['questionType'] =
              bq.typeId === 'Multiple-Select' ||
              bq.typeId === 'True-False' ||
              bq.typeId === 'Assertion-Reasoning' ||
              bq.typeId === 'Match-Following' ||
              bq.typeId === 'Numerical'
                ? bq.typeId
                : 'MCQ';

            collected.push({
              id: collected.length + 1,
              questionType: mappedType,
              subject: unit.subj,
              passage: bq.passageOrCase,
              question: bq.question,
              options:
                mappedType === 'True-False' && opts.length === 0
                  ? ['True', 'False']
                  : opts.length > 0
                    ? opts
                    : mappedType === 'Numerical'
                      ? []
                      : [bq.correctAnswer, 'None of the above', 'Cannot be determined', 'Both A and B'],
              correctIndex: ansIdx >= 0 ? ansIdx : 0,
              correctIndices: bq.correctOptionIndices,
              numericalAnswer: mappedType === 'Numerical' ? bq.correctAnswer : undefined,
              explanation: bq.explanation || 'Admin Question Bank solution.',
              topicTag: bq.topic || bq.chapter || unit.subj,
            });
            generatedForUnit++;
          }
        } catch {
          // Offline fallback - continue seamlessly with AI generation
        }

        while (generatedForUnit < unit.count && safetyRounds < 10) {
          safetyRounds++;
          const batchCount = Math.min(15, unit.count - generatedForUnit);
          onProgress(
            `Generating ${unit.subj}${isTopicFocused ? ` · ${topic}` : ''} (${collected.length + 1}–${Math.min(totalTarget, collected.length + batchCount)} of ${totalTarget} questions)...`,
          );

          const avoidList = Array.from(seenStems).slice(-12).join(' | ');

          const prompt = `Generate exactly ${batchCount} fresh, non-repeating AI practice examination questions.
Examination: ${config.examName}
Class / Paper: ${config.classOrPaper}
Subject: ${unit.subj}
${activeCategory !== 'combined' ? `Portion / Scope: ${config.scope} (${chapterSummaryLabel}) | Focus Topic: ${config.topic}` : ''}
Difficulty: ${config.difficulty}
${languageDirective}
${syllabusRules}
${questionTypeDirective}
${isolationInstruction}
${allowedChaptersPrompt}
${syllabusExcerpt}

Formatting & Answer Verification Rules:
- Standard MCQ / Assertion-Reasoning / Match-Following / Statement-Based / Comprehension: provide exactly 4 distinct options in "options" and valid "correctIndex" (0-3).
- Multiple-Select: provide 4 options and array "correctIndices" (e.g. [0, 2]) with at least 2 or 1 valid indices.
- True-False: provide exactly 2 options (localized True and False) and valid "correctIndex" (0 or 1).
- Numerical: leave "options" empty [] and put exact numeric answer string in "numericalAnswer" (e.g. "42" or "3.5").
- Comprehension: include a concise reading passage in "passage", then the question and 4 options.
- Verify the mathematical/factual correctness of every answer BEFORE outputting.
- Do NOT invent or claim these as official previous-year questions.
- Return ONLY a valid JSON object matching this exact structure (no markdown fences):
{"questions":[{"questionType":"MCQ","subject":"${unit.subj}","passage":"","question":"...","options":["...","...","...","..."],"correctIndex":0,"correctIndices":[],"numericalAnswer":"","explanation":"...","topicTag":"${isTopicFocused ? topic : unit.subj}"}]}
${avoidList ? `- Do NOT repeat these earlier questions: ${avoidList}` : ''}`;

          const res = await generateAI({
            provider: settings.provider,
            model: settings.model,
            language: targetLang,
            prompt,
            responseMimeType: 'application/json',
          });

          const parsed = parseSafeJson<{
            questions: Array<{
              questionType?: string;
              subject?: string;
              passage?: string;
              question: string;
              options?: string[];
              correctIndex?: number;
              correctIndices?: number[];
              numericalAnswer?: string | number;
              explanation: string;
              topicTag?: string;
            }>;
          }>(res.text);

          if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
            throw new Error('AI returned an empty batch of questions. Please retry.');
          }

          const cleanBatch = normalizeParsedItems(parsed.questions, unit.subj);
          for (const qItem of cleanBatch) {
            if (generatedForUnit >= unit.count) break;
            collected.push({ ...qItem, id: collected.length + 1 });
            generatedForUnit++;
          }
        }
      }
    }

    if (collected.length === 0) {
      throw new Error('Could not generate valid unique questions. Please retry.');
    }

    return collected;
  };

  const validateActiveSetupBeforeRun = (): string | null => {
    if (activeCategory === 'combined' && combinedSelectedList.length === 0) {
      return 'Select at least one subject for Combined Exam Mock Test.';
    }
    if (activeCategory === 'ugc-net') {
      if (!activeUgcRecord) {
        return 'No UGC NET syllabus has been published by Admin yet.';
      }
      if (ugcTestMode === 'selected-units' && ugcSelectedUnitIds.length === 0) {
        return 'Please select at least one UGC NET Unit for Selected Units mode.';
      }
      if (ugcTestMode === 'selected-topics' && ugcSelectedTopicIds.length === 0) {
        return 'Please select at least one UGC NET Topic for Selected Topics mode.';
      }
      return null;
    }
    if (activeCategory === 'upsc') {
      if (!activeUpscRecord) {
        return 'No UPSC Prelims syllabus has been published by Admin yet.';
      }
      if (upscTestMode === 'area-wise' && upscAreaIds.length === 0) {
        return 'Please select at least one Subject Area for Area-wise mode.';
      }
      if (upscTestMode === 'topic-wise' && upscTopicIds.length === 0) {
        return 'Please select at least one Topic for Topic-wise mode.';
      }
      return null;
    }
    return null;
  };

  const handleStartGeneration = async () => {
    const validationErr = validateActiveSetupBeforeRun();
    if (validationErr) {
      setErrorMsg(validationErr);
      return;
    }

    const { config, effectiveSubject, usableChaptersList, chapterSummaryLabel, syllabusRef } =
      buildActiveConfigAndChapters(language);

    if (
      activeCategory !== 'combined' &&
      activeCategory !== 'ugc-net' &&
      activeCategory !== 'upsc' &&
      scope === 'chapter-wise' &&
      usableChaptersList.length === 0
    ) {
      setErrorMsg('Please select at least one examinable chapter before generating.');
      return;
    }

    setGenerating(true);
    setErrorMsg(null);

    try {
      const collected = await generateQuestionsForConfig(
        config,
        effectiveSubject,
        usableChaptersList,
        chapterSummaryLabel,
        syllabusRef,
        setGenProgress,
      );

      setActiveConfig(config);
      setQuestions(collected);
      setCurrentIdx(0);
      setAnswers({});
      setMarked([]);
      setVisited([1]);
      setPracticeChecked({});
      setSecondsLeft(config.durationMinutes * 60);
      setStartedAt(Date.now());
      setPhase('exam');
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to generate mock test questions.',
      );
    } finally {
      setGenerating(false);
      setGenProgress('');
    }
  };

  const handleDownloadSelectionPdf = async () => {
    const validationErr = validateActiveSetupBeforeRun();
    if (validationErr) {
      setErrorMsg(validationErr);
      return;
    }

    const { config, effectiveSubject, usableChaptersList, chapterSummaryLabel, syllabusRef } =
      buildActiveConfigAndChapters(pdfLanguage);

    if (
      activeCategory !== 'combined' &&
      activeCategory !== 'ugc-net' &&
      activeCategory !== 'upsc' &&
      scope === 'chapter-wise' &&
      usableChaptersList.length === 0
    ) {
      setErrorMsg('Please select at least one examinable chapter before downloading PDF.');
      return;
    }

    setPdfBusy(true);
    setErrorMsg(null);

    try {
      const generatedQuestions = await generateQuestionsForConfig(
        config,
        effectiveSubject,
        usableChaptersList,
        chapterSummaryLabel,
        syllabusRef,
        setPdfProgress,
      );

      const isTopicSelected = scope === 'chapter-wise' && topic && topic !== 'All Chapter Topics';
      const isOdiaPdf = pdfLanguage === 'odia';
      const isHindiPdf = pdfLanguage === 'hindi';

      const docHeading =
        scope === 'full-syllabus'
          ? isOdiaPdf
            ? `ସମ୍ପୂର୍ଣ୍ଣ ପାଠ୍ୟକ୍ରମ ଅଭ୍ୟାସ ପ୍ରଶ୍ନପତ୍ର (${generatedQuestions.length} ପ୍ରଶ୍ନ)`
            : isHindiPdf
              ? `संपूर्ण पाठ्यक्रम अभ्यास प्रश्न पत्र (${generatedQuestions.length} प्रश्न)`
              : `Full Syllabus Practice Question Paper (${generatedQuestions.length} Questions)`
          : isTopicSelected
            ? isOdiaPdf
              ? `ଟପିକ୍-ଭିତ୍ତିକ ଅଭ୍ୟାସ ପ୍ରଶ୍ନପତ୍ର (${generatedQuestions.length} ପ୍ରଶ୍ନ)`
              : isHindiPdf
                ? `टॉपिक अभ्यास प्रश्न पत्र (${generatedQuestions.length} प्रश्न)`
                : `Topic-Wise Practice Question Paper (${generatedQuestions.length} Questions)`
            : isOdiaPdf
              ? `ବିଷୟ-ଭିତ୍ତିକ ଅଭ୍ୟାସ ପ୍ରଶ୍ନପତ୍ର (${generatedQuestions.length} ପ୍ରଶ୍ନ)`
              : isHindiPdf
                ? `विषयवार अभ्यास प्रश्न पत्र (${generatedQuestions.length} प्रश्न)`
                : `Subject-Wise Practice Question Paper (${generatedQuestions.length} Questions)`;

      await exportTopicQuestionsToPdf({
        boardName: config.examName,
        className: config.classOrPaper || 'All',
        subjectName: effectiveSubject,
        chapterName: chapterSummaryLabel,
        topicName: isTopicSelected
          ? topic
          : scope === 'chapter-wise'
            ? chapterSummaryLabel
            : chapterSummaryLabel,
        language: pdfLanguage,
        questions: generatedQuestions,
        includeAnswerKey: pdfIncludeAnswerKey,
        documentHeading: docHeading,
      });

      setPdfModalOpen(false);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to generate PDF questions. Please try again.',
      );
    } finally {
      setPdfBusy(false);
      setPdfProgress('');
    }
  };

  const handleRetryIncorrect = () => {
    if (!activeResult) return;
    const wrongQuestions = activeResult.questions
      .filter((q) => {
        const ans = activeResult.answers[q.id];
        return isAttempted(ans) && !isQuestionCorrect(q, ans);
      })
      .map((q, idx) => ({ ...q, id: idx + 1 }));

    if (wrongQuestions.length === 0) return;

    setActiveConfig({
      ...activeResult.config,
      examName: `${activeResult.config.examName} (Incorrect Questions Retry)`,
      questionCount: wrongQuestions.length,
      practiceMode: true,
      durationMinutes: 0,
    });
    setQuestions(wrongQuestions);
    setCurrentIdx(0);
    setAnswers({});
    setMarked([]);
    setVisited([1]);
    setPracticeChecked({});
    setStartedAt(Date.now());
    setPhase('exam');
  };

  const jumpToQuestion = (index: number) => {
    setCurrentIdx(index);
    const qId = questions[index]?.id;
    if (qId && !visited.includes(qId)) {
      setVisited((prev) => [...prev, qId]);
    }
  };

  const labels = MOCK_UI_LABELS[activeConfig?.language || language];

  // ===================== PHASE 2: EXAM RUNNER =====================
  if (phase === 'exam' && activeConfig && questions.length > 0) {
    const q = questions[currentIdx];
    const currentAns = answers[q.id];
    const isMarked = marked.includes(q.id);
    const isRevealed = activeConfig.practiceMode && practiceChecked[q.id];

    const answeredCount = questions.filter((item) => isAttempted(answers[item.id])).length;

    return (
      <div className="h-full flex flex-col min-h-0">
        {/* Top Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 md:px-8 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="min-w-0">
            <div className="font-bold text-sm md:text-base text-slate-900 dark:text-white truncate">
              {activeConfig.examName} · {activeConfig.subject}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {labels.aiNotice}
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {activeConfig.practiceMode ? (
              <span className="px-3 py-1.5 rounded-lg bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 text-xs font-semibold">
                {labels.practiceBadge}
              </span>
            ) : (
              <div
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border text-sm font-mono font-semibold tabular-nums ${
                  secondsLeft < 120
                    ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800'
                }`}
              >
                <Clock className="w-4 h-4" />
                <span>{formatTimer(secondsLeft)}</span>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowSubmitModal(true)}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold whitespace-nowrap shrink-0"
            >
              {labels.submitTest}
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6">
          <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Main Question Card */}
            <div className="lg:col-span-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 md:p-6 flex flex-col justify-between gap-6">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                    {labels.questionWord} {currentIdx + 1} {labels.ofWord} {questions.length} ·{' '}
                    {q.questionType}
                  </span>
                  <span className="tabular-nums">
                    {q.subject} · +{activeConfig.marksPerQuestion} /{' '}
                    {activeConfig.negativeMarkingEnabled
                      ? `-${activeConfig.negativeMarksPerWrong}`
                      : '0'}
                  </span>
                </div>

                {q.passage && (
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm leading-relaxed">
                    <MarkdownRenderer content={q.passage} />
                  </div>
                )}

                <div className="text-lg font-medium text-slate-900 dark:text-slate-100 leading-relaxed">
                  <MarkdownRenderer content={q.question} />
                </div>

                {/* Numerical Input */}
                {q.questionType === 'Numerical' ? (
                  <div className="space-y-2 max-w-xs">
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block">
                      {activeConfig.language === 'odia'
                        ? 'ସଂଖ୍ୟାତ୍ମକ ଉତ୍ତର ଲେଖନ୍ତୁ:'
                        : activeConfig.language === 'hindi'
                          ? 'संख्यात्मक उत्तर दर्ज करें:'
                          : 'Enter Numerical Answer:'}
                    </label>
                    <input
                      type="text"
                      value={typeof currentAns === 'string' ? currentAns : ''}
                      onChange={(e) =>
                        setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                      }
                      placeholder={
                        activeConfig.language === 'odia'
                          ? 'ସଂଖ୍ୟା ଲେଖନ୍ତୁ (ଯଥା: 42 କିମ୍ବା 3.5)'
                          : 'Type numeric value (e.g. 42 or 3.5)'
                      }
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono focus:outline-none focus:border-violet-500"
                    />
                  </div>
                ) : q.questionType === 'Multiple-Select' ? (
                  /* Multiple Select Checkboxes */
                  <div className="space-y-2.5">
                    <div className="text-xs text-slate-500">
                      {activeConfig.language === 'odia'
                        ? 'ଏକ ବା ଏକାଧିକ ସଠିକ୍ ବିକଳ୍ପ ବାଛନ୍ତୁ:'
                        : activeConfig.language === 'hindi'
                          ? 'एक या अधिक सही विकल्प चुनें:'
                          : 'Select one or more correct options:'}
                    </div>
                    {q.options.map((opt, oIdx) => {
                      const selectedList = Array.isArray(currentAns) ? currentAns : [];
                      const checked = selectedList.includes(oIdx);
                      const isRight = (q.correctIndices || []).includes(oIdx);

                      let cls =
                        'border-slate-200 dark:border-slate-700 hover:border-violet-400 bg-white dark:bg-slate-950';
                      if (isRevealed) {
                        if (isRight) cls = 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40';
                        else if (checked) cls = 'border-red-500 bg-red-50 dark:bg-red-950/40';
                      } else if (checked) {
                        cls = 'border-violet-600 bg-violet-50 dark:bg-violet-950/50';
                      }

                      return (
                        <button
                          key={oIdx}
                          type="button"
                          onClick={() => {
                            const next = checked
                              ? selectedList.filter((i) => i !== oIdx)
                              : [...selectedList, oIdx];
                            setAnswers((prev) => ({ ...prev, [q.id]: next }));
                          }}
                          className={`w-full text-left flex items-start gap-3 p-3.5 rounded-xl border transition-colors ${cls}`}
                        >
                          <input
                            type="checkbox"
                            readOnly
                            checked={checked}
                            className="mt-1 accent-violet-600"
                          />
                          <span className="font-bold text-xs mt-0.5">
                            {String.fromCharCode(65 + oIdx)}.
                          </span>
                          <div className="text-[15px] flex-1 leading-relaxed">
                            <MarkdownRenderer content={opt} />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  /* Standard Single-Choice Options */
                  <div className="space-y-2.5">
                    {q.options.map((opt, oIdx) => {
                      const isSelected = currentAns === oIdx;
                      let optClass =
                        'border-slate-200 dark:border-slate-700 hover:border-violet-400 bg-white dark:bg-slate-950';
                      if (isRevealed) {
                        if (oIdx === q.correctIndex) {
                          optClass =
                            'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-100';
                        } else if (isSelected) {
                          optClass =
                            'border-red-500 bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-100';
                        }
                      } else if (isSelected) {
                        optClass =
                          'border-violet-600 bg-violet-50 dark:bg-violet-950/50 text-violet-950 dark:text-violet-100';
                      }

                      return (
                        <button
                          key={oIdx}
                          type="button"
                          onClick={() =>
                            setAnswers((prev) => ({ ...prev, [q.id]: oIdx }))
                          }
                          className={`w-full text-left flex items-start gap-3 p-3.5 rounded-xl border transition-colors ${optClass}`}
                        >
                          <span
                            className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                              isSelected
                                ? 'bg-violet-600 text-white'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {String.fromCharCode(65 + oIdx)}
                          </span>
                          <div className="text-[15px] flex-1 leading-relaxed">
                            <MarkdownRenderer content={opt} />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {activeConfig.practiceMode && (
                  <div className="pt-2 space-y-3">
                    <button
                      type="button"
                      onClick={() =>
                        setPracticeChecked((prev) => ({ ...prev, [q.id]: !prev[q.id] }))
                      }
                      className="px-3.5 py-2 rounded-xl border border-teal-300 dark:border-teal-800 text-teal-700 dark:text-teal-300 text-xs font-semibold hover:bg-teal-50 dark:hover:bg-teal-950/40"
                    >
                      {isRevealed ? labels.hideSolutionBtn : labels.checkAnswerBtn}
                    </button>

                    {isRevealed && (
                      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm space-y-1.5">
                        <div className="font-semibold text-emerald-700 dark:text-emerald-400">
                          {labels.correctAnswer}:{' '}
                          {q.questionType === 'Numerical'
                            ? q.numericalAnswer
                            : q.questionType === 'Multiple-Select'
                              ? (q.correctIndices || [])
                                  .map((i) => String.fromCharCode(65 + i))
                                  .join(', ')
                              : String.fromCharCode(65 + q.correctIndex)}
                        </div>
                        <MarkdownRenderer content={q.explanation} />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Navigation Controls */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-4 border-t border-slate-200 dark:border-slate-800">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={currentIdx === 0}
                    onClick={() => jumpToQuestion(currentIdx - 1)}
                    className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold disabled:opacity-40"
                  >
                    {labels.previous}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setAnswers((prev) => {
                        const next = { ...prev };
                        delete next[q.id];
                        return next;
                      })
                    }
                    className="px-3 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    {labels.clearAnswer}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSavedNotice(true);
                      setTimeout(() => setSavedNotice(false), 1200);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <Save className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{savedNotice ? labels.savedLabel : labels.saveAnswer}</span>
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMarked((prev) =>
                        prev.includes(q.id)
                          ? prev.filter((id) => id !== q.id)
                          : [...prev, q.id],
                      );
                    }}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold ${
                      isMarked
                        ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <Flag className="w-3.5 h-3.5" />
                    <span>{isMarked ? labels.unmarkReview : labels.markReview}</span>
                  </button>

                  <button
                    type="button"
                    disabled={currentIdx === questions.length - 1}
                    onClick={() => jumpToQuestion(currentIdx + 1)}
                    className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold disabled:opacity-40"
                  >
                    {labels.saveAndNext}
                  </button>
                </div>
              </div>
            </div>

            {/* Question Palette */}
            <div className="lg:col-span-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-4 h-fit">
              <h3 className="font-semibold text-sm">{labels.paletteTitle}</h3>

              <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 dark:text-slate-400">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-emerald-600 inline-block" />
                  <span className="tabular-nums">
                    {labels.answered} ({answeredCount})
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-amber-500 inline-block" />
                  <span className="tabular-nums">
                    {labels.marked} ({marked.length})
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-rose-500 inline-block" />
                  <span className="tabular-nums">
                    {labels.notAnswered} (
                    {
                      visited.filter(
                        (id) => !isAttempted(answers[id]) && !marked.includes(id),
                      ).length
                    }
                    )
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-slate-200 dark:bg-slate-700 inline-block" />
                  <span className="tabular-nums">
                    {labels.notVisited} ({questions.length - visited.length})
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-5 gap-2 max-h-[360px] overflow-y-auto pr-1">
                {questions.map((item, idx) => {
                  const answered = isAttempted(answers[item.id]);
                  const flagged = marked.includes(item.id);
                  const isVis = visited.includes(item.id);
                  const isCurrent = idx === currentIdx;

                  let cls =
                    'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-transparent';
                  if (flagged) {
                    cls = 'bg-amber-500 text-white border-amber-600';
                  } else if (answered) {
                    cls = 'bg-emerald-600 text-white border-emerald-700';
                  } else if (isVis) {
                    cls = 'bg-rose-500 text-white border-rose-600';
                  }

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => jumpToQuestion(idx)}
                      className={`h-9 rounded-lg text-xs font-semibold border tabular-nums transition-transform ${cls} ${
                        isCurrent
                          ? 'ring-2 ring-violet-600 ring-offset-1 dark:ring-offset-slate-900'
                          : ''
                      }`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Submit Confirmation Modal */}
        {showSubmitModal && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="max-w-md w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
              <h3 className="text-lg font-bold">{labels.submitTest}?</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 tabular-nums">
                Attempted <strong>{answeredCount}</strong> of{' '}
                <strong>{questions.length}</strong> questions ({marked.length} marked for
                review).
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowSubmitModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                >
                  {labels.cancelBtn}
                </button>
                <button
                  type="button"
                  onClick={submitExam}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                >
                  {labels.confirmSubmitBtn}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ===================== PHASE 3: RESULT DASHBOARD =====================
  if (phase === 'result' && activeResult) {
    const resLabels = MOCK_UI_LABELS[activeResult.config.language || 'english'];
    const filteredQuestions = activeResult.questions.filter((q) => {
      const u = activeResult.answers[q.id];
      const attempted = isAttempted(u);
      const correct = isQuestionCorrect(q, u);
      if (resultFilter === 'correct') return correct;
      if (resultFilter === 'incorrect') return attempted && !correct;
      if (resultFilter === 'unattempted') return !attempted;
      return true;
    });

    const mins = Math.floor(activeResult.timeTakenSeconds / 60);
    const secs = activeResult.timeTakenSeconds % 60;
    const maxScore = activeResult.maxScore ?? activeResult.questions.length;
    const accuracy =
      activeResult.accuracyPercentage ??
      (activeResult.correctCount + activeResult.incorrectCount > 0
        ? (activeResult.correctCount /
            (activeResult.correctCount + activeResult.incorrectCount)) *
          100
        : 0);

    return (
      <div className="h-full overflow-y-auto px-4 md:px-8 py-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                {resLabels.resultTitle}
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {activeResult.config.examName} · {activeResult.config.classOrPaper} ·{' '}
                {activeResult.config.subject} · {activeResult.config.language.toUpperCase()}
                {activeResult.config.syllabusVersionLabel
                  ? ` · ${activeResult.config.syllabusVersionLabel}`
                  : ''}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {activeResult.incorrectCount > 0 && (
                <button
                  type="button"
                  onClick={handleRetryIncorrect}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>
                    {resLabels.retryIncorrect} ({activeResult.incorrectCount})
                  </span>
                </button>
              )}
              <button
                type="button"
                onClick={() => exportMockResultToPdf(activeResult)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{resLabels.downloadPdf}</span>
              </button>
              <button
                type="button"
                onClick={() => setPhase('setup')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold"
              >
                <span>{resLabels.newMockTest}</span>
              </button>
            </div>
          </div>

          {/* Comprehensive Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {[
              { label: resLabels.totalQsStat, value: String(activeResult.questions.length), cls: '' },
              {
                label: resLabels.attemptedStat,
                value: String(activeResult.correctCount + activeResult.incorrectCount),
                cls: 'text-blue-600 dark:text-blue-400',
              },
              {
                label: resLabels.correctStat,
                value: String(activeResult.correctCount),
                cls: 'text-emerald-600 dark:text-emerald-400',
              },
              {
                label: resLabels.incorrectStat,
                value: String(activeResult.incorrectCount),
                cls: 'text-red-600 dark:text-red-400',
              },
              {
                label: resLabels.unattemptedStat,
                value: String(activeResult.unattemptedCount),
                cls: 'text-slate-500',
              },
              {
                label: resLabels.totalMarksStat,
                value: `${Number(activeResult.score.toFixed(2))}/${maxScore}`,
                cls: 'text-violet-600 dark:text-violet-400',
              },
              {
                label: resLabels.scoreAccuracyStat,
                value: `${activeResult.percentage.toFixed(1)}% / ${accuracy.toFixed(0)}%`,
                cls: 'text-teal-600 dark:text-teal-400',
              },
              {
                label: resLabels.timeTakenStat,
                value: `${mins}m ${secs}s`,
                cls: '',
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
              >
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {stat.label}
                </div>
                <div className={`text-lg font-bold mt-1 tabular-nums ${stat.cls}`}>
                  {stat.value}
                </div>
              </div>
            ))}
          </div>

          {/* Subject-wise Performance Table */}
          {Array.isArray(activeResult.subjectBreakdown) &&
            activeResult.subjectBreakdown.length > 0 && (
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 font-semibold text-sm">
                  {resLabels.subjectPerformanceTitle}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400">
                      <tr>
                        <th className="px-4 py-2.5 font-semibold">{resLabels.subjectCol}</th>
                        <th className="px-4 py-2.5 font-semibold text-right">{resLabels.questionsCol}</th>
                        <th className="px-4 py-2.5 font-semibold text-right">{resLabels.attemptedCol}</th>
                        <th className="px-4 py-2.5 font-semibold text-right">{resLabels.correctCol}</th>
                        <th className="px-4 py-2.5 font-semibold text-right">{resLabels.incorrectCol}</th>
                        <th className="px-4 py-2.5 font-semibold text-right">{resLabels.accuracyCol}</th>
                        <th className="px-4 py-2.5 font-semibold text-right">{resLabels.marksCol}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800 tabular-nums">
                      {activeResult.subjectBreakdown.map((sub) => (
                        <tr key={sub.subject}>
                          <td className="px-4 py-2.5 font-medium">{sub.subject}</td>
                          <td className="px-4 py-2.5 text-right">{sub.total}</td>
                          <td className="px-4 py-2.5 text-right">{sub.attempted}</td>
                          <td className="px-4 py-2.5 text-right text-emerald-600 dark:text-emerald-400 font-semibold">
                            {sub.correct}
                          </td>
                          <td className="px-4 py-2.5 text-right text-red-600 dark:text-red-400 font-semibold">
                            {sub.incorrect}
                          </td>
                          <td className="px-4 py-2.5 text-right">{sub.accuracy.toFixed(1)}%</td>
                          <td className="px-4 py-2.5 text-right font-semibold">
                            {Number(sub.marks.toFixed(2))} / {sub.maxMarks}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          {/* Weak Areas & Revision Focus Diagnostics */}
          {(() => {
            const weakSubjects = (activeResult.subjectBreakdown || []).filter(
              (s) => s.attempted > 0 && (s.accuracy < 50 || s.incorrect > s.correct),
            );
            const missedTopics = Array.from(
              new Set(
                activeResult.questions
                  .filter((q) => {
                    const ans = activeResult.answers[q.id];
                    return isAttempted(ans) && !isQuestionCorrect(q, ans);
                  })
                  .map((q) => q.topicTag || q.subject)
                  .filter(Boolean),
              ),
            ).slice(0, 8);

            if (weakSubjects.length === 0 && missedTopics.length === 0) return null;

            return (
              <div className="rounded-2xl border border-amber-200 dark:border-amber-900/70 bg-amber-50/70 dark:bg-amber-950/20 p-5 space-y-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h3 className="font-bold text-sm text-[#0F172A] dark:text-white flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                    <span>Weak Areas &amp; Recommended Revision Focus</span>
                  </h3>
                  {activeResult.config.negativeMarkingEnabled && (
                    <span className="text-xs font-medium text-amber-800 dark:text-amber-200 tabular-nums">
                      Negative marking penalty applied: −{activeResult.config.negativeMarksPerWrong} per wrong answer
                    </span>
                  )}
                </div>
                {weakSubjects.length > 0 && (
                  <div className="text-xs text-slate-700 dark:text-slate-300">
                    <strong>Low-accuracy subjects (&lt;50%):</strong>{' '}
                    {weakSubjects
                      .map((w) => `${w.subject} (${w.accuracy.toFixed(0)}%)`)
                      .join(' · ')}
                  </div>
                )}
                {missedTopics.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      Topics to revisit:
                    </span>
                    {missedTopics.map((tag) => (
                      <span
                        key={tag}
                        className="px-2.5 py-1 rounded-md border border-amber-300 dark:border-amber-800 bg-white dark:bg-slate-900 text-[#0F172A] dark:text-slate-200 font-medium"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Review Filter Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold text-base">{resLabels.reviewAnswers}</h2>
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  ['all', `${resLabels.allTab} (${activeResult.questions.length})`],
                  ['correct', `${resLabels.correctBadge} (${activeResult.correctCount})`],
                  ['incorrect', `${resLabels.incorrectBadge} (${activeResult.incorrectCount})`],
                  ['unattempted', `${resLabels.unattemptedLabel} (${activeResult.unattemptedCount})`],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setResultFilter(id)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold ${
                    resultFilter === id
                      ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Question-by-Question Review */}
          <div className="space-y-4">
            {filteredQuestions.map((q) => {
              const userAns = activeResult.answers[q.id];
              const attempted = isAttempted(userAns);
              const isCorrect = isQuestionCorrect(q, userAns);

              return (
                <div
                  key={q.id}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-500 tabular-nums">
                      Q{q.id} · {q.subject} · {q.questionType}
                    </span>
                    {!attempted ? (
                      <span className="text-xs font-semibold text-slate-500">
                        {resLabels.unattemptedLabel}
                      </span>
                    ) : isCorrect ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                        <CheckCircle2 className="w-4 h-4" />
                        {resLabels.correctBadge}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600">
                        <XCircle className="w-4 h-4" />
                        {resLabels.incorrectBadge}
                      </span>
                    )}
                  </div>

                  {q.passage && (
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs">
                      <MarkdownRenderer content={q.passage} />
                    </div>
                  )}

                  <div className="text-sm font-medium">
                    <MarkdownRenderer content={q.question} />
                  </div>

                  {q.questionType === 'Numerical' ? (
                    <div className="flex flex-wrap gap-4 text-xs p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                      <span>
                        <strong>{resLabels.yourAnswer}:</strong>{' '}
                        {attempted ? String(userAns) : resLabels.unattemptedLabel}
                      </span>
                      <span className="text-emerald-700 dark:text-emerald-400">
                        <strong>{resLabels.correctAnswer}:</strong> {q.numericalAnswer}
                      </span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {q.options.map((opt, oIdx) => {
                        const isRight =
                          q.questionType === 'Multiple-Select'
                            ? (q.correctIndices || []).includes(oIdx)
                            : oIdx === q.correctIndex;
                        const isChosen =
                          q.questionType === 'Multiple-Select'
                            ? Array.isArray(userAns) && userAns.includes(oIdx)
                            : oIdx === userAns;

                        return (
                          <div
                            key={oIdx}
                            className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                              isRight
                                ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30'
                                : isChosen
                                  ? 'border-red-400 bg-red-50 dark:bg-red-950/30'
                                  : 'border-slate-200 dark:border-slate-800'
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
                  )}

                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs">
                    <span className="font-semibold text-slate-700 dark:text-slate-200">
                      {resLabels.explanationLabel}:{' '}
                    </span>
                    <MarkdownRenderer content={q.explanation} className="inline-block mt-1" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ===================== PHASE 1: MULTI-EXAMINATION SETUP =====================
  return (
    <div className="h-full overflow-y-auto px-4 md:px-8 py-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header + Syllabus Manager Trigger */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              Multi-Examination Mock Test Platform
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              AI-powered practice examinations for BSE Odisha, CBSE, UGC NET, Odisha Competitive Exams, and 25-Subject Combined Tests in Odia, Hindi, and English.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSyllabusModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold hover:border-violet-500 transition-colors"
          >
            <BookMarked className="w-4 h-4 text-violet-600 dark:text-violet-400" />
            <span>Syllabus Manager & Official PDFs</span>
          </button>
        </div>

        {/* Language Selection Bar */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Languages className="w-4 h-4 text-violet-600 dark:text-violet-400" />
            <div>
              <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Examination Language
              </div>
              <div className="text-[11px] text-slate-500">
                Questions, options, instructions, explanations & results appear in your selected language.
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {(activeCategory === 'cbse'
              ? ([
                  ['english', 'English Medium'],
                  ['hindi', 'Hindi Medium (हिन्दी)'],
                ] as const)
              : ([
                  ['odia', 'Odia (ଓଡ଼ିଆ)'],
                  ['hindi', 'Hindi (हिन्दी)'],
                  ['english', 'English'],
                ] as const)
            ).map(([langId, langLabel]) => (
              <button
                key={langId}
                type="button"
                onClick={() => {
                  setLanguage(langId);
                  const nextMed = languageToMedium(langId);
                  if (selectedClass?.mediums?.includes(nextMed)) {
                    setMedium(nextMed);
                  }
                }}
                className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                  language === langId
                    ? 'bg-violet-600 text-white border-violet-600'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-violet-400'
                }`}
              >
                {langLabel}
              </button>
            ))}
          </div>
        </div>

        {/* Color-Coded Examination Category Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
          {EXAM_CATEGORIES.map((cat) => {
            const isSelected = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleSelectCategory(cat.id)}
                className={`text-left p-4 rounded-2xl border transition-all ${cat.cardClasses} ${
                  isSelected ? 'ring-2 ring-offset-2 ring-slate-900 dark:ring-white dark:ring-offset-slate-950' : ''
                }`}
              >
                <div className={`text-sm font-bold leading-snug ${cat.badgeClasses}`}>
                  {cat.title}
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-300 mt-1.5 leading-relaxed">
                  {cat.subtitle}
                </div>
              </button>
            );
          })}
        </div>

        {errorMsg && (
          <div className="p-3.5 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Configuration Card */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 md:p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-slate-500" />
              <h2 className="font-bold text-base text-slate-900 dark:text-white">
                {activeCategoryMeta.title} Configuration
              </h2>
            </div>
            <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5" />
              <span>AI-Generated Practice Questions (Not official previous-year papers)</span>
            </div>
          </div>

          {activeCategory === 'combined' ? (
            /* COMBINED EXAM MOCK TEST (25 SUBJECTS) */
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">
                    Select Subjects & Questions per Subject ({combinedSelectedList.length} selected ·{' '}
                    <span className="tabular-nums">{combinedTotalQuestions} total Qs</span>)
                  </div>
                  <div className="text-xs text-slate-500">
                    Combine any of the 25 subjects into a single multi-subject examination.
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const next: Record<string, number> = {};
                      COMBINED_EXAM_SUBJECTS.forEach((s) => {
                        next[s] = 2;
                      });
                      setCombinedCounts(next);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-pink-600 text-white text-xs font-semibold"
                  >
                    Select All 25 Subjects
                  </button>
                  <button
                    type="button"
                    onClick={() => setCombinedCounts({})}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-[340px] overflow-y-auto pr-1">
                {COMBINED_EXAM_SUBJECTS.map((subj) => {
                  const countVal = combinedCounts[subj] || 0;
                  const active = countVal > 0;
                  return (
                    <div
                      key={subj}
                      className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border text-xs transition-colors ${
                        active
                          ? 'border-pink-400 bg-pink-50/50 dark:bg-pink-950/25'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50'
                      }`}
                    >
                      <label className="flex items-center gap-2 cursor-pointer min-w-0 flex-1">
                        <input
                          type="checkbox"
                          checked={active}
                          onChange={(e) =>
                            setCombinedCounts((prev) => ({
                              ...prev,
                              [subj]: e.target.checked ? 5 : 0,
                            }))
                          }
                          className="accent-pink-600"
                        />
                        <span className="font-medium truncate">{subj}</span>
                      </label>
                      {active && (
                        <input
                          type="number"
                          min={1}
                          max={30}
                          value={countVal}
                          onChange={(e) =>
                            setCombinedCounts((prev) => ({
                              ...prev,
                              [subj]: Math.max(1, Math.min(30, Number(e.target.value) || 1)),
                            }))
                          }
                          aria-label={`Questions for ${subj}`}
                          className="w-14 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-center tabular-nums font-semibold"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : activeCategory === 'ugc-net' ? (
            /* ADMIN-PUBLISHED CENTRALIZED UGC NET MOCK TEST CONFIGURATION */
            <div className="space-y-5">
              {!hasAnyPublishedUgc ? (
                <div className="rounded-2xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950/60 p-8 text-center space-y-2.5">
                  <div className="w-11 h-11 rounded-2xl mx-auto flex items-center justify-center bg-gradient-to-br from-[#4338CA] via-[#2563EB] to-[#06B6D4] text-white shadow-sm">
                    <BookMarked className="w-5 h-5" />
                  </div>
                  <h3 className="text-base font-bold text-[#0F172A] dark:text-white">
                    No UGC NET Syllabus Published by Admin Yet
                  </h3>
                  <p className="text-xs text-[#64748B] dark:text-slate-400 max-w-lg mx-auto leading-relaxed">
                    UGC NET Paper 1 and Paper 2 mock tests strictly follow official syllabuses uploaded, reviewed, and published by your administrator. Check back once Paper 1 or your Paper 2 subject is published.
                  </p>
                </div>
              ) : (
                <>
                  {/* Paper 1 & Paper 2 Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    <button
                      type="button"
                      disabled={!hasPublishedUgcPaper1}
                      onClick={() => {
                        setUgcPaperType('paper-1');
                        setUgcTestMode('complete-paper-1');
                        setUgcSelectedUnitIds([]);
                        setUgcSelectedTopicIds([]);
                      }}
                      className={`text-left p-4 rounded-2xl border transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                        ugcPaperType === 'paper-1'
                          ? 'border-[#4338CA] bg-gradient-to-br from-[#4338CA]/10 via-[#2563EB]/8 to-[#06B6D4]/10 ring-1 ring-[#4338CA]/40'
                          : 'border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950/50 hover:border-[#2563EB]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-[#0F172A] dark:text-white">
                          Paper 1 — General Paper
                        </span>
                        <span
                          className={`text-[11px] font-semibold tabular-nums px-2 py-0.5 rounded-md ${
                            hasPublishedUgcPaper1
                              ? 'bg-[#16A34A]/15 text-[#16A34A]'
                              : 'bg-slate-200 dark:bg-slate-800 text-[#64748B]'
                          }`}
                        >
                          {hasPublishedUgcPaper1
                            ? `${liveUgcCatalog?.paper1?.versionLabel} · ${liveUgcCatalog?.paper1?.unitCount} Units`
                            : 'Not Published'}
                        </span>
                      </div>
                      <p className="text-xs text-[#64748B] dark:text-slate-400 mt-1">
                        Teaching & Research Aptitude, Reasoning, ICT, Higher Education & Environment.
                      </p>
                    </button>

                    <button
                      type="button"
                      disabled={publishedUgcSubjects.length === 0}
                      onClick={() => {
                        setUgcPaperType('paper-2');
                        setUgcTestMode('complete-paper-2');
                        setUgcSelectedUnitIds([]);
                        setUgcSelectedTopicIds([]);
                        if (publishedUgcSubjects[0] && !ugcSubjectId) {
                          setUgcSubjectId(publishedUgcSubjects[0].subjectId);
                        }
                      }}
                      className={`text-left p-4 rounded-2xl border transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                        ugcPaperType === 'paper-2'
                          ? 'border-[#4338CA] bg-gradient-to-br from-[#4338CA]/10 via-[#2563EB]/8 to-[#06B6D4]/10 ring-1 ring-[#4338CA]/40'
                          : 'border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950/50 hover:border-[#2563EB]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-[#0F172A] dark:text-white">
                          Paper 2 — Subject Specific
                        </span>
                        <span
                          className={`text-[11px] font-semibold tabular-nums px-2 py-0.5 rounded-md ${
                            publishedUgcSubjects.length > 0
                              ? 'bg-[#2563EB]/15 text-[#2563EB] dark:text-cyan-300'
                              : 'bg-slate-200 dark:bg-slate-800 text-[#64748B]'
                          }`}
                        >
                          {publishedUgcSubjects.length > 0
                            ? `${publishedUgcSubjects.length} Published Subject(s)`
                            : 'Not Published'}
                        </span>
                      </div>
                      <p className="text-xs text-[#64748B] dark:text-slate-400 mt-1">
                        Only Admin-published Paper 2 domain subjects and syllabus units appear here.
                      </p>
                    </button>
                  </div>

                  {/* Subject Selection (Paper 2) + Active Version Metadata */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {ugcPaperType === 'paper-2' && (
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-[#0F172A] dark:text-slate-200">
                          Published Paper 2 Subject ({publishedUgcSubjects.length})
                        </label>
                        <select
                          value={activeUgcRecord?.subjectId || ''}
                          onChange={(e) => {
                            setUgcSubjectId(e.target.value);
                            setUgcSelectedUnitIds([]);
                            setUgcSelectedTopicIds([]);
                          }}
                          className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-800 text-sm text-[#0F172A] dark:text-white"
                        >
                          {publishedUgcSubjects.map((s) => (
                            <option key={s.subjectId} value={s.subjectId}>
                              {s.subjectName}
                              {s.subjectCode ? ` (${s.subjectCode})` : ''} — {s.versionLabel}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {activeUgcRecord && (
                      <div
                        className={`rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-[#F8FAFC] dark:bg-slate-950/60 px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs ${
                          ugcPaperType === 'paper-1' ? 'md:col-span-2' : ''
                        }`}
                      >
                        <div className="space-y-0.5">
                          <div className="font-bold text-[#0F172A] dark:text-white">
                            {activeUgcRecord.subjectName} · {activeUgcRecord.versionLabel}
                          </div>
                          <div className="text-[#64748B] dark:text-slate-400 tabular-nums">
                            Session {activeUgcRecord.academicSession} · {activeUgcRecord.unitCount}{' '}
                            Units · {activeUgcRecord.topicCount} Topics ·{' '}
                            {activeUgcRecord.subtopicCount} Subtopics
                          </div>
                        </div>
                        <span className="px-2.5 py-1 rounded-lg bg-[#16A34A]/15 text-[#16A34A] font-semibold text-[11px]">
                          Live Admin Syllabus
                        </span>
                      </div>
                    )}
                  </div>

                  {/* UGC NET Test Modes */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-[#0F172A] dark:text-slate-200 block">
                      UGC NET Test Mode
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                      {(
                        [
                          ugcPaperType === 'paper-1'
                            ? {
                                id: 'complete-paper-1' as const,
                                label: 'Complete Paper 1',
                                hint: 'Full Paper 1 syllabus',
                              }
                            : {
                                id: 'complete-paper-2' as const,
                                label: 'Complete Paper 2',
                                hint: 'Full selected subject',
                              },
                          {
                            id: 'selected-units' as const,
                            label: 'Selected Units',
                            hint: 'Pick one or more units',
                          },
                          {
                            id: 'selected-topics' as const,
                            label: 'Selected Topics',
                            hint: 'Target specific topics',
                          },
                          {
                            id: 'mixed-topics' as const,
                            label: 'Mixed Topics',
                            hint: 'Cross-unit weighted mix',
                          },
                        ] as const
                      ).map((mode) => {
                        const active = ugcTestMode === mode.id;
                        return (
                          <button
                            key={mode.id}
                            type="button"
                            onClick={() => setUgcTestMode(mode.id)}
                            className={`p-3 rounded-xl border text-left transition-all ${
                              active
                                ? 'border-[#4338CA] bg-gradient-to-r from-[#4338CA] to-[#2563EB] text-white shadow-sm'
                                : 'border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-slate-900 text-[#0F172A] dark:text-slate-200 hover:border-[#2563EB]'
                            }`}
                          >
                            <div className="text-xs font-bold">{mode.label}</div>
                            <div
                              className={`text-[11px] mt-0.5 ${
                                active ? 'text-cyan-100' : 'text-[#64748B] dark:text-slate-400'
                              }`}
                            >
                              {mode.hint}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Interactive Published Units & Topics Picker */}
                  {activeUgcRecord && (
                    <div className="p-4 rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-[#F8FAFC] dark:bg-slate-950/60 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="font-bold text-[#0F172A] dark:text-white">
                          Published Syllabus Structure ({activeUgcRecord.units.length} Units)
                          {ugcTestMode === 'selected-units' && (
                            <span className="ml-2 text-[#4338CA] dark:text-cyan-300 tabular-nums">
                              · {ugcSelectedUnitIds.length} unit(s) selected
                            </span>
                          )}
                          {ugcTestMode === 'selected-topics' && (
                            <span className="ml-2 text-[#4338CA] dark:text-cyan-300 tabular-nums">
                              · {ugcSelectedTopicIds.length} topic(s) selected
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setUgcSelectedUnitIds(activeUgcRecord.units.map((u) => u.unitId));
                              setUgcSelectedTopicIds(
                                activeUgcRecord.units.flatMap((u) =>
                                  u.topics.map((t) => t.topicId),
                                ),
                              );
                            }}
                            className="px-2.5 py-1 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-slate-900 font-semibold hover:border-[#2563EB]"
                          >
                            Select All
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setUgcSelectedUnitIds([]);
                              setUgcSelectedTopicIds([]);
                            }}
                            className="px-2.5 py-1 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-slate-900 font-semibold"
                          >
                            Clear
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[340px] overflow-y-auto pr-1">
                        {activeUgcRecord.units.map((unit) => {
                          const unitChecked = ugcSelectedUnitIds.includes(unit.unitId);
                          return (
                            <div
                              key={unit.unitId}
                              className={`rounded-xl border p-3.5 space-y-2.5 transition-all ${
                                unitChecked
                                  ? 'border-[#4338CA] bg-white dark:bg-slate-900 ring-1 ring-[#4338CA]/30'
                                  : 'border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900'
                              }`}
                            >
                              <label className="flex items-start gap-2.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={unitChecked}
                                  onChange={(e) => {
                                    if (ugcTestMode === 'complete-paper-1' || ugcTestMode === 'complete-paper-2') {
                                      setUgcTestMode('selected-units');
                                    }
                                    setUgcSelectedUnitIds((prev) =>
                                      e.target.checked
                                        ? Array.from(new Set([...prev, unit.unitId]))
                                        : prev.filter((id) => id !== unit.unitId),
                                    );
                                  }}
                                  className="mt-1 accent-[#4338CA] w-4 h-4"
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-bold text-[#0F172A] dark:text-slate-100 leading-snug">
                                    {unit.title}
                                  </div>
                                  <div className="text-[11px] text-[#64748B] dark:text-slate-400 tabular-nums">
                                    {unit.topics.length} Topics
                                  </div>
                                </div>
                              </label>

                              {unit.topics.length > 0 && (
                                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-1.5">
                                  {unit.topics.map((top) => {
                                    const topicActive = ugcSelectedTopicIds.includes(top.topicId);
                                    return (
                                      <button
                                        key={top.topicId}
                                        type="button"
                                        onClick={() => {
                                          if (
                                            ugcTestMode === 'complete-paper-1' ||
                                            ugcTestMode === 'complete-paper-2' ||
                                            ugcTestMode === 'selected-units'
                                          ) {
                                            setUgcTestMode('selected-topics');
                                          }
                                          setUgcSelectedTopicIds((prev) =>
                                            prev.includes(top.topicId)
                                              ? prev.filter((id) => id !== top.topicId)
                                              : [...prev, top.topicId],
                                          );
                                          if (!ugcSelectedUnitIds.includes(unit.unitId)) {
                                            setUgcSelectedUnitIds((prev) => [...prev, unit.unitId]);
                                          }
                                        }}
                                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs transition-all text-left ${
                                          topicActive
                                            ? 'border-[#4338CA] bg-[#4338CA] text-white font-semibold'
                                            : 'border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-800 text-[#0F172A] dark:text-slate-200 hover:border-[#06B6D4]'
                                        }`}
                                      >
                                        {topicActive && <Check className="w-3 h-3 shrink-0" />}
                                        <span>{top.title}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : activeCategory === 'upsc' ? (
            /* ADMIN-PUBLISHED CENTRALIZED UPSC PRELIMS MOCK TEST CONFIGURATION */
            <div className="space-y-5">
              {publishedUpscPrelims.length === 0 ? (
                <div className="rounded-2xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950/60 p-8 text-center space-y-2.5">
                  <div className="w-11 h-11 rounded-2xl mx-auto flex items-center justify-center bg-gradient-to-br from-[#4338CA] via-[#2563EB] to-[#06B6D4] text-white shadow-sm">
                    <BookMarked className="w-5 h-5" />
                  </div>
                  <h3 className="text-base font-bold text-[#0F172A] dark:text-white">
                    No UPSC Prelims Syllabus Published by Admin Yet
                  </h3>
                  <p className="text-xs text-[#64748B] dark:text-slate-400 max-w-lg mx-auto leading-relaxed">
                    UPSC Prelims GS Paper I and Paper II (CSAT) mock tests strictly use official syllabuses uploaded, reviewed, and published by your administrator. Once published, they appear here automatically.
                  </p>
                </div>
              ) : (
                <>
                  {/* Prelims GS Paper I & CSAT Paper II Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {(
                      [
                        {
                          id: 'prelims-gs-1' as const,
                          title: 'UPSC Prelims — GS Paper I',
                          desc: 'Polity, History, Geography, Economy, Environment, Science & Current Affairs (+2 / -0.66).',
                        },
                        {
                          id: 'prelims-csat' as const,
                          title: 'UPSC Prelims — Paper II (CSAT)',
                          desc: 'Reading Comprehension, Logical Reasoning, Analytical Ability & Numeracy (+2.5 / -0.83).',
                        },
                      ] as const
                    ).map((card) => {
                      const rec = publishedUpscPrelims.find((p) => p.paperId === card.id);
                      const isActive = activeUpscRecord?.paperId === card.id;
                      return (
                        <button
                          key={card.id}
                          type="button"
                          disabled={!rec}
                          onClick={() => {
                            setUpscPaperId(card.id);
                            setUpscAreaIds([]);
                            setUpscTopicIds([]);
                          }}
                          className={`text-left p-4 rounded-2xl border transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                            isActive
                              ? 'border-[#4338CA] bg-gradient-to-br from-[#4338CA]/10 via-[#2563EB]/8 to-[#06B6D4]/10 ring-1 ring-[#4338CA]/40'
                              : 'border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950/50 hover:border-[#2563EB]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-bold text-[#0F172A] dark:text-white">
                              {card.title}
                            </span>
                            <span
                              className={`text-[11px] font-semibold tabular-nums px-2 py-0.5 rounded-md ${
                                rec
                                  ? 'bg-[#16A34A]/15 text-[#16A34A]'
                                  : 'bg-slate-200 dark:bg-slate-800 text-[#64748B]'
                              }`}
                            >
                              {rec
                                ? `${rec.versionLabel} · ${rec.areaCount} Areas`
                                : 'Not Published'}
                            </span>
                          </div>
                          <p className="text-xs text-[#64748B] dark:text-slate-400 mt-1">
                            {card.desc}
                          </p>
                        </button>
                      );
                    })}
                  </div>

                  {activeUpscRecord && (
                    <div className="rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-[#F8FAFC] dark:bg-slate-950/60 px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="space-y-0.5">
                        <div className="font-bold text-[#0F172A] dark:text-white">
                          {activeUpscRecord.paperLabel} · {activeUpscRecord.versionLabel}
                        </div>
                        <div className="text-[#64748B] dark:text-slate-400 tabular-nums">
                          Cycle {activeUpscRecord.examYear} · {activeUpscRecord.areaCount} Areas ·{' '}
                          {activeUpscRecord.topicCount} Topics · Marking +{activeUpscRecord.markingPattern.marksPerQuestion} / −{activeUpscRecord.markingPattern.negativeMarksPerWrong} · {activeUpscRecord.markingPattern.durationMinutes} min
                        </div>
                      </div>
                      <span className="px-2.5 py-1 rounded-lg bg-[#16A34A]/15 text-[#16A34A] font-semibold text-[11px]">
                        Live Admin UPSC Syllabus
                      </span>
                    </div>
                  )}

                  {/* UPSC Prelims Test Modes */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-[#0F172A] dark:text-slate-200 block">
                      UPSC Prelims Test Scope
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                      {(
                        [
                          { id: 'full-syllabus' as const, label: 'Full Paper Syllabus', hint: 'All published areas' },
                          { id: 'area-wise' as const, label: 'Area-Wise', hint: 'Polity, History, Economy...' },
                          { id: 'topic-wise' as const, label: 'Topic-Wise', hint: 'Specific micro-topics' },
                          { id: 'mixed-topics' as const, label: 'Mixed Prelims', hint: 'Balanced multi-area mix' },
                        ] as const
                      ).map((mode) => {
                        const active = upscTestMode === mode.id;
                        return (
                          <button
                            key={mode.id}
                            type="button"
                            onClick={() => setUpscTestMode(mode.id)}
                            className={`p-3 rounded-xl border text-left transition-all ${
                              active
                                ? 'border-[#4338CA] bg-gradient-to-r from-[#4338CA] to-[#2563EB] text-white shadow-sm'
                                : 'border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-slate-900 text-[#0F172A] dark:text-slate-200 hover:border-[#2563EB]'
                            }`}
                          >
                            <div className="text-xs font-bold">{mode.label}</div>
                            <div
                              className={`text-[11px] mt-0.5 ${
                                active ? 'text-cyan-100' : 'text-[#64748B] dark:text-slate-400'
                              }`}
                            >
                              {mode.hint}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Published Subject Areas & Topics Picker */}
                  {activeUpscRecord && (
                    <div className="p-4 rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-[#F8FAFC] dark:bg-slate-950/60 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="font-bold text-[#0F172A] dark:text-white">
                          Published Syllabus Areas ({activeUpscRecord.areas.length})
                          {upscTestMode === 'area-wise' && (
                            <span className="ml-2 text-[#4338CA] dark:text-cyan-300 tabular-nums">
                              · {upscAreaIds.length} area(s) selected
                            </span>
                          )}
                          {upscTestMode === 'topic-wise' && (
                            <span className="ml-2 text-[#4338CA] dark:text-cyan-300 tabular-nums">
                              · {upscTopicIds.length} topic(s) selected
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setUpscAreaIds(activeUpscRecord.areas.map((a) => a.areaId));
                              setUpscTopicIds(
                                activeUpscRecord.areas.flatMap((a) => a.topics.map((t) => t.topicId)),
                              );
                            }}
                            className="px-2.5 py-1 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-slate-900 font-semibold hover:border-[#2563EB]"
                          >
                            Select All
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setUpscAreaIds([]);
                              setUpscTopicIds([]);
                            }}
                            className="px-2.5 py-1 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-slate-900 font-semibold"
                          >
                            Clear
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[340px] overflow-y-auto pr-1">
                        {activeUpscRecord.areas.map((area) => {
                          const areaChecked = upscAreaIds.includes(area.areaId);
                          return (
                            <div
                              key={area.areaId}
                              className={`rounded-xl border p-3.5 space-y-2.5 transition-all ${
                                areaChecked
                                  ? 'border-[#4338CA] bg-white dark:bg-slate-900 ring-1 ring-[#4338CA]/30'
                                  : 'border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900'
                              }`}
                            >
                              <label className="flex items-start gap-2.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={areaChecked}
                                  onChange={(e) => {
                                    if (upscTestMode === 'full-syllabus') {
                                      setUpscTestMode('area-wise');
                                    }
                                    setUpscAreaIds((prev) =>
                                      e.target.checked
                                        ? Array.from(new Set([...prev, area.areaId]))
                                        : prev.filter((id) => id !== area.areaId),
                                    );
                                  }}
                                  className="mt-1 accent-[#4338CA] w-4 h-4"
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-bold text-[#0F172A] dark:text-slate-100 leading-snug">
                                    {area.title}
                                  </div>
                                  <div className="text-[11px] text-[#64748B] dark:text-slate-400 tabular-nums">
                                    {area.topics.length} Topics
                                  </div>
                                </div>
                              </label>

                              {area.topics.length > 0 && (
                                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-1.5">
                                  {area.topics.map((top) => {
                                    const topicActive = upscTopicIds.includes(top.topicId);
                                    return (
                                      <button
                                        key={top.topicId}
                                        type="button"
                                        onClick={() => {
                                          if (upscTestMode === 'full-syllabus' || upscTestMode === 'area-wise') {
                                            setUpscTestMode('topic-wise');
                                          }
                                          setUpscTopicIds((prev) =>
                                            prev.includes(top.topicId)
                                              ? prev.filter((id) => id !== top.topicId)
                                              : [...prev, top.topicId],
                                          );
                                          if (!upscAreaIds.includes(area.areaId)) {
                                            setUpscAreaIds((prev) => [...prev, area.areaId]);
                                          }
                                        }}
                                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs transition-all text-left ${
                                          topicActive
                                            ? 'border-[#4338CA] bg-[#4338CA] text-white font-semibold'
                                            : 'border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-800 text-[#0F172A] dark:text-slate-200 hover:border-[#06B6D4]'
                                        }`}
                                      >
                                        {topicActive && <Check className="w-3 h-3 shrink-0" />}
                                        <span>{top.title}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            /* CASCADING SYLLABUS SELECTION FOR BOARD / COMPETITIVE */
            <div className="space-y-4">
              {activeCategory === 'cbse' && (
                <div className="p-3.5 rounded-xl border border-blue-200 dark:border-blue-900/70 bg-blue-50/70 dark:bg-blue-950/25 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-bold text-blue-900 dark:text-blue-200">
                      CBSE Workflow:
                    </span>
                    <span className="text-slate-700 dark:text-slate-300">
                      1. Examination: <strong>CBSE</strong> → 2. Class:{' '}
                      <strong>{selectedClass?.label.replace(/\s*\([^)]*\)/, '') || 'Class 10'}</strong> → 3. Medium:{' '}
                      <strong>{medium}</strong> → 4. Subject ({availableSubjects.length} Published)
                    </span>
                  </div>
                  <div className="inline-flex rounded-lg border border-blue-200 dark:border-blue-800 bg-white dark:bg-slate-900 p-0.5">
                    {(selectedExam?.classesOrPapers || []).map((cls) => (
                      <button
                        key={cls.id}
                        type="button"
                        onClick={() => {
                          setSelectedClassId(cls.id);
                          const currentMed = languageToMedium(language);
                          const nextMed =
                            cls.mediums && cls.mediums.length > 0
                              ? cls.mediums.includes(currentMed)
                                ? currentMed
                                : cls.mediums[0]
                              : 'English Medium';
                          setMedium(nextMed);
                          setLanguage(mediumToLanguage(nextMed));
                          const firstSubj = cls.subjects[0];
                          const firstC = firstSubj?.chapters[0]?.name || '';
                          setSubject(firstSubj?.name || '');
                          setChapter(firstC);
                          setSelectedChapters(firstC ? [firstC] : []);
                          setTopic('All Chapter Topics');
                        }}
                        className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                          selectedClass?.id === cls.id
                            ? 'bg-blue-600 text-white'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        {cls.label.replace(/\s*\([^)]*\)/, '')} ({cls.subjects.length})
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Examination */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    {activeCategory === 'cbse' ? '1. Examination' : 'Examination'}
                  </label>
                  <select
                    value={selectedExam?.id || ''}
                    onChange={(e) => {
                      const ex = categoryExams.find((x) => x.id === e.target.value);
                      applyExamDefaults(ex);
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                  >
                    {categoryExams.map((ex) => (
                      <option key={ex.id} value={ex.id}>
                        {ex.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Class / Paper */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    {activeCategory === 'cbse' ? '2. Class (CBSE)' : 'Class / Paper'}
                  </label>
                  <select
                    value={selectedClass?.id || ''}
                    onChange={(e) => {
                      const cId = e.target.value;
                      setSelectedClassId(cId);
                      const cls = selectedExam?.classesOrPapers.find((c) => c.id === cId);
                      if (cls?.mediums && cls.mediums.length > 0) {
                        const targetMed = languageToMedium(language);
                        const nextMed = cls.mediums.includes(targetMed)
                          ? targetMed
                          : cls.mediums[0];
                        setMedium(nextMed);
                        setLanguage(mediumToLanguage(nextMed));
                      }
                      const firstSubj = cls?.subjects[0];
                      const firstC = firstSubj?.chapters[0]?.name || '';
                      setSubject(firstSubj?.name || '');
                      setChapter(firstC);
                      setSelectedChapters(firstC ? [firstC] : []);
                      setTopic('All Chapter Topics');
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                  >
                    {(selectedExam?.classesOrPapers || []).map((cls) => (
                      <option key={cls.id} value={cls.id}>
                        {cls.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Medium (if applicable) */}
                {selectedClass?.mediums && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      {activeCategory === 'cbse' ? '3. Medium' : 'Medium'}
                    </label>
                    <select
                      value={medium}
                      onChange={(e) => {
                        const nextMed = e.target.value as
                          | 'Odia Medium'
                          | 'English Medium'
                          | 'Hindi Medium';
                        setMedium(nextMed);
                        setLanguage(mediumToLanguage(nextMed));
                      }}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                    >
                      {selectedClass.mediums.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Subject Dropdown (preserved & synced with subject grid) */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    {activeCategory === 'cbse'
                      ? `4. Subject (${availableSubjects.length} Published)`
                      : `Subject (${availableSubjects.length})`}
                  </label>
                  <select
                    value={selectedSubjectObj?.name || subject}
                    onChange={(e) => selectIndividualSubject(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                  >
                    {availableSubjects.map((s) => (
                      <option key={s.name} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Test Scope / Portion */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Test Portion / Scope
                  </label>
                  <select
                    value={scope}
                    onChange={(e) => setScope(e.target.value as TestScope)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                  >
                    {activeCategory === 'odisha-board' ? (
                      <>
                        <option value="full-syllabus">Full Syllabus (ସମ୍ପୂର୍ଣ୍ଣ ପାଠ୍ୟକ୍ରମ)</option>
                        <option value="term-1">Term I — IA-1 & IA-2 (ଟର୍ମ - ୧)</option>
                        <option value="term-2">Term II — IA-3 & IA-4 (ଟର୍ମ - ୨)</option>
                        <option value="half-yearly">Half-Yearly Exam (ଅର୍ଦ୍ଧ-ବାର୍ଷିକ ପରୀକ୍ଷା)</option>
                        <option value="annual">Annual Exam (ବାର୍ଷିକ ପରୀକ୍ଷା)</option>
                        <option value="subject-wise">Subject-wise Test (ବିଷୟ-ୱାରୀ)</option>
                        <option value="chapter-wise">Individual Chapter(s) (ନିର୍ଦ୍ଦିଷ୍ଟ ଅଧ୍ୟାୟ)</option>
                      </>
                    ) : (
                      <>
                        <option value="full-syllabus">Full Syllabus (All Subjects)</option>
                        <option value="term-1">Term I Portion</option>
                        <option value="term-2">Term II Portion</option>
                        <option value="half-yearly">Half-Yearly Exam</option>
                        <option value="annual">Annual / Board Exam</option>
                        <option value="subject-wise">Subject-wise Test</option>
                        <option value="chapter-wise">Individual Chapter(s) / Topic</option>
                      </>
                    )}
                  </select>
                </div>

                {/* Chapter & Topic (when chapter-wise) */}
                {scope === 'chapter-wise' && (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                        Primary Chapter / Unit
                      </label>
                      <select
                        value={selectedChapterObj?.name || chapter}
                        onChange={(e) => {
                          const cName = e.target.value;
                          setChapter(cName);
                          setSelectedChapters([cName]);
                          setTopic('All Chapter Topics');
                        }}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                      >
                        {(selectedSubjectObj?.chapters || []).map((c) => (
                          <option
                            key={c.name}
                            value={c.name}
                            disabled={c.excludedFromExam}
                          >
                            {c.name}
                            {c.assessment ? ` (${c.term} · ${c.assessment})` : ''}
                            {c.excludedFromExam ? ' — [Excluded]' : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                        Topic
                      </label>
                      <select
                        value={topic}
                        onChange={(e) => setTopic(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                      >
                        <option value="All Chapter Topics">All Chapter Topics</option>
                        {Array.from(
                          new Set([
                            ...(selectedChapterObj?.topics || []),
                            ...(selectedChapterObj?.subtopics || []),
                          ]),
                        ).map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                )}

                {/* Official Syllabus PDF Selector */}
                {syllabusPdfs.length > 0 && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1">
                      <FileText className="w-3.5 h-3.5 text-violet-600" />
                      <span>Uploaded Syllabus PDF Reference</span>
                    </label>
                    <select
                      value={selectedSyllabusPdfId}
                      onChange={(e) => setSelectedSyllabusPdfId(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                    >
                      <option value="">None (Use built-in 2025-26 syllabus)</option>
                      {syllabusPdfs.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.fileName} ({p.subject})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* CLEAR SELECTION INDICATOR BAR (Full Syllabus -> Subject -> Chapter -> Topic) */}
              <div className="p-3.5 rounded-xl border border-violet-200 dark:border-violet-800/80 bg-violet-50/70 dark:bg-violet-950/30 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-violet-900 dark:text-violet-200">
                    <span className="px-2 py-0.5 rounded-md bg-violet-600 text-white text-[11px]">
                      {language === 'odia' ? 'ସକ୍ରିୟ ଚୟନ' : 'Active Selection'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setScope('full-syllabus');
                        setTopic('All Chapter Topics');
                      }}
                      className={`hover:underline ${
                        scope === 'full-syllabus' ? 'font-bold text-violet-700 dark:text-violet-300' : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {language === 'odia'
                        ? `ସମ୍ପୂର୍ଣ୍ଣ ପାଠ୍ୟକ୍ରମ (${availableSubjects.length} ବିଷୟ)`
                        : `Full Syllabus (${availableSubjects.length} Subjects)`}
                    </button>

                    {scope !== 'full-syllabus' && selectedSubjectObj && (
                      <>
                        <ChevronRight className="w-3.5 h-3.5 text-violet-500" />
                        <button
                          type="button"
                          onClick={() => {
                            setScope('subject-wise');
                            setTopic('All Chapter Topics');
                          }}
                          className={`hover:underline ${
                            scope !== 'chapter-wise'
                              ? 'font-bold text-violet-800 dark:text-violet-200'
                              : 'text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          {selectedSubjectObj.name}
                        </button>
                      </>
                    )}

                    {scope === 'chapter-wise' && (
                      <>
                        <ChevronRight className="w-3.5 h-3.5 text-violet-500" />
                        <button
                          type="button"
                          onClick={() => setTopic('All Chapter Topics')}
                          className={`hover:underline ${
                            topic === 'All Chapter Topics'
                              ? 'font-bold text-violet-800 dark:text-violet-200'
                              : 'text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          {selectedChapters.length > 1
                            ? `${selectedChapters.length} Chapters`
                            : selectedChapterObj?.name || chapter}
                        </button>
                      </>
                    )}

                    {scope === 'chapter-wise' && topic && topic !== 'All Chapter Topics' && (
                      <>
                        <ChevronRight className="w-3.5 h-3.5 text-violet-500" />
                        <span className="font-bold text-violet-900 dark:text-white underline decoration-violet-400">
                          {topic}
                        </span>
                      </>
                    )}
                  </div>

                  {scope !== 'full-syllabus' && (
                    <button
                      type="button"
                      onClick={() => {
                        setScope('full-syllabus');
                        setTopic('All Chapter Topics');
                      }}
                      className="text-[11px] font-semibold text-violet-700 dark:text-violet-300 hover:underline"
                    >
                      {language === 'odia' ? 'ସମସ୍ତ ବିଷୟ (Full Syllabus) କୁ ଫେରନ୍ତୁ' : 'Switch to Full Syllabus (All Subjects)'}
                    </button>
                  )}
                </div>

                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                  {scope === 'full-syllabus' ? (
                    language === 'odia'
                      ? `ମୋଟ ${resolvedQuestionCount}ଟି ପ୍ରଶ୍ନ ସମସ୍ତ ${availableSubjects.length}ଟି ବିଷୟରୁ ସମାନ ଭାବରେ ପ୍ରସ୍ତୁତ ହେବ । ନିର୍ଦ୍ଦିଷ୍ଟ ବିଷୟ କିମ୍ବା ଟପିକ୍ ପାଇଁ ତଳେ ଥିବା ବିଷୟରେ କ୍ଲିକ୍ କରନ୍ତୁ ।`
                      : `Questions will be distributed across ALL ${availableSubjects.length} subjects in this syllabus. Click any subject below to practice that subject individually or choose a chapter/topic.`
                  ) : scope === 'chapter-wise' && topic !== 'All Chapter Topics' ? (
                    language === 'odia'
                      ? `କେବଳ ଚୟନିତ ଟପିକ୍ "${topic}" (${selectedSubjectObj?.name} · ${chapter}) ରୁ ପ୍ରଶ୍ନ ପ୍ରସ୍ତୁତ ହେବ ।`
                      : `Questions will be generated strictly from Topic "${topic}" (${selectedSubjectObj?.name} · ${chapter}) only.`
                  ) : scope === 'chapter-wise' ? (
                    language === 'odia'
                      ? `କେବଳ ${selectedSubjectObj?.name} ବିଷୟର ଚୟନିତ ଅଧ୍ୟାୟ (${selectedChapters.join(', ')}) ରୁ ପ୍ରଶ୍ନ ପ୍ରସ୍ତୁତ ହେବ ।`
                      : `Questions will be generated strictly from selected chapter(s): ${selectedChapters.join(', ')} (${selectedSubjectObj?.name} only).`
                  ) : (
                    language === 'odia'
                      ? `କେବଳ "${selectedSubjectObj?.name}" ବିଷୟରୁ (${scopeFilteredChapters.filter((c) => !c.excludedFromExam).length}ଟି ଅଧ୍ୟାୟ) ପ୍ରଶ୍ନ ପ୍ରସ୍ତୁତ ହେବ — ଅନ୍ୟ ବିଷୟ ମିଶ୍ରିତ ହେବ ନାହିଁ ।`
                      : `Questions will be generated strictly from Subject "${selectedSubjectObj?.name}" only (${scopeFilteredChapters.filter((c) => !c.excludedFromExam).length} chapters) — no cross-subject mixing.`
                  )}
                </p>
              </div>

              {/* ALL SUBJECTS QUICK-PICK GRID (All 16 BSE Odisha / Active Syllabus Subjects) */}
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-bold text-slate-700 dark:text-slate-200">
                    {language === 'odia'
                      ? `ବିଷୟ ବାଛନ୍ତୁ — ସମସ୍ତ ${availableSubjects.length}ଟି ବିଷୟ (ଅଥବା ସମ୍ପୂର୍ଣ୍ଣ ପାଠ୍ୟକ୍ରମ)`
                      : `Select Subject — All ${availableSubjects.length} Subjects (or Full Syllabus)`}
                  </div>
                  {activeCategory === 'odisha-board' && (
                    <a
                      href={BSE_ODISHA_SYLLABUS_PDF_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-purple-700 dark:text-purple-300 font-semibold hover:underline"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>View Official 2025-26 PDF</span>
                    </a>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                  {/* Full Syllabus Option */}
                  <button
                    type="button"
                    onClick={() => {
                      setScope('full-syllabus');
                      setTopic('All Chapter Topics');
                    }}
                    className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border text-left text-xs font-semibold transition-all ${
                      scope === 'full-syllabus'
                        ? 'border-violet-600 bg-violet-600 text-white shadow-sm'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 text-slate-800 dark:text-slate-200 hover:border-violet-400'
                    }`}
                  >
                    <span className="truncate">
                      {language === 'odia'
                        ? `ସମ୍ପୂର୍ଣ୍ଣ ପାଠ୍ୟକ୍ରମ (ସମସ୍ତ ${availableSubjects.length})`
                        : `Full Syllabus (All ${availableSubjects.length})`}
                    </span>
                    {scope === 'full-syllabus' && <Check className="w-3.5 h-3.5 shrink-0" />}
                  </button>

                  {availableSubjects.map((sObj, sIdx) => {
                    const isSubjActive =
                      scope !== 'full-syllabus' && selectedSubjectObj?.name === sObj.name;
                    const validChapCount = sObj.chapters.filter((c) => !c.excludedFromExam).length;
                    return (
                      <button
                        key={sObj.name}
                        type="button"
                        onClick={() => selectIndividualSubject(sObj.name)}
                        className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border text-left text-xs transition-all ${
                          isSubjActive
                            ? 'border-purple-600 bg-purple-50 dark:bg-purple-950/50 text-purple-900 dark:text-purple-100 font-bold ring-1 ring-purple-500'
                            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-purple-400 font-medium'
                        }`}
                      >
                        <span className="truncate">
                          {sIdx + 1}. {sObj.name}
                        </span>
                        <span
                          className={`text-[11px] shrink-0 px-1.5 py-0.5 rounded-md tabular-nums ${
                            isSubjActive
                              ? 'bg-purple-600 text-white'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {validChapCount} ch
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* CLICKABLE CHAPTERS & TOPICS BELONGING STRICTLY TO THE SELECTED SUBJECT */}
              {selectedSubjectObj && scope !== 'full-syllabus' && (
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div>
                      <span className="font-bold text-slate-900 dark:text-white text-sm">
                        {selectedSubjectObj.name}
                      </span>
                      <span className="text-slate-500 dark:text-slate-400 ml-2">
                        · {scopeFilteredChapters.filter((c) => !c.excludedFromExam).length}{' '}
                        {language === 'odia' ? 'ଟି ପରୀକ୍ଷାଯୋଗ୍ୟ ଅଧ୍ୟାୟ' : 'examinable chapters'}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setScope('subject-wise');
                          setTopic('All Chapter Topics');
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                          scope === 'subject-wise'
                            ? 'bg-purple-600 text-white border-purple-600'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-purple-400'
                        }`}
                      >
                        {language === 'odia'
                          ? 'ସମ୍ପୂର୍ଣ୍ଣ ବିଷୟ (All Chapters)'
                          : 'Complete Subject (All Chapters)'}
                      </button>
                    </div>
                  </div>

                  {selectedSubjectObj.prescribedBooks && (
                    <div className="text-xs text-slate-600 dark:text-slate-400">
                      <strong>Prescribed Textbooks:</strong>{' '}
                      {selectedSubjectObj.prescribedBooks.join(' · ')}
                    </div>
                  )}

                  {activeCategory === 'odisha-board' &&
                    selectedSubjectObj.subjectLanguage &&
                    selectedSubjectObj.subjectLanguage !== 'Odia' &&
                    language === 'odia' && (
                      <div className="text-xs text-purple-700 dark:text-purple-300">
                        {selectedSubjectObj.subjectLanguage} ପାଠ୍ୟ ଅଂଶ ଓ ଗଦ୍ୟାଂଶ ମୂଳ ଭାଷାରେ ରହିବ ଏବଂ ନିର୍ଦ୍ଦେଶ ଓ ବ୍ୟାଖ୍ୟା ଓଡ଼ିଆରେ ଦିଆଯିବ ।
                      </div>
                    )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[380px] overflow-y-auto pr-1">
                    {scopeFilteredChapters.map((ch) => {
                      const isExcluded = Boolean(ch.excludedFromExam);
                      const isChapterSelected =
                        scope === 'chapter-wise' && selectedChapters.includes(ch.name);

                      return (
                        <div
                          key={ch.name}
                          className={`rounded-xl border p-3.5 space-y-2.5 transition-all ${
                            isExcluded
                              ? 'opacity-60 border-amber-200 dark:border-amber-900 bg-amber-50/40 dark:bg-amber-950/20'
                              : isChapterSelected
                                ? 'border-purple-500 bg-white dark:bg-slate-900 ring-1 ring-purple-500/50'
                                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-purple-300'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <button
                              type="button"
                              disabled={isExcluded}
                              onClick={() => selectIndividualChapter(ch.name)}
                              className="text-left flex-1 disabled:cursor-not-allowed group"
                            >
                              <div className="text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-purple-700 dark:group-hover:text-purple-300 leading-snug">
                                {ch.name}
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                                {ch.section && <span>{ch.section}</span>}
                                {ch.term && <span>· {ch.term}</span>}
                                {ch.assessment && <span>({ch.assessment})</span>}
                                {isExcluded && (
                                  <span className="text-amber-700 dark:text-amber-300 font-semibold">
                                    · Excluded in Exam
                                  </span>
                                )}
                              </div>
                            </button>

                            {!isExcluded && (
                              <div className="flex items-center gap-1.5 shrink-0">
                                {scope === 'chapter-wise' && (
                                  <input
                                    type="checkbox"
                                    aria-label={`Include chapter ${ch.name}`}
                                    checked={isChapterSelected}
                                    onChange={(e) => {
                                      setTopic('All Chapter Topics');
                                      setSelectedChapters((prev) => {
                                        const next = e.target.checked
                                          ? Array.from(new Set([...prev, ch.name]))
                                          : prev.filter((n) => n !== ch.name);
                                        if (next.length > 0) setChapter(next[0]);
                                        return next;
                                      });
                                    }}
                                    className="accent-purple-600 w-4 h-4 cursor-pointer"
                                  />
                                )}
                                <button
                                  type="button"
                                  onClick={() => selectIndividualChapter(ch.name)}
                                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                                    isChapterSelected && topic === 'All Chapter Topics'
                                      ? 'bg-purple-600 text-white'
                                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-purple-100 dark:hover:bg-purple-900/40'
                                  }`}
                                >
                                  {isChapterSelected && topic === 'All Chapter Topics'
                                    ? language === 'odia'
                                      ? 'ଚୟନିତ ଅଧ୍ୟାୟ'
                                      : 'Chapter Selected'
                                    : language === 'odia'
                                      ? 'ଅଧ୍ୟାୟ ବାଛନ୍ତୁ'
                                      : 'Select Chapter'}
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Clickable Topics inside this Chapter */}
                          {!isExcluded && ch.topics.length > 0 && (
                            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-1.5">
                              {ch.topics.map((t) => {
                                const isTopicActive =
                                  scope === 'chapter-wise' &&
                                  selectedChapters.includes(ch.name) &&
                                  chapter === ch.name &&
                                  topic === t;
                                return (
                                  <button
                                    key={t}
                                    type="button"
                                    onClick={() => selectIndividualTopic(ch.name, t)}
                                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs transition-all text-left ${
                                      isTopicActive
                                        ? 'border-violet-600 bg-violet-600 text-white font-semibold shadow-sm'
                                        : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 hover:border-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/40'
                                    }`}
                                  >
                                    {isTopicActive && <Check className="w-3 h-3 shrink-0" />}
                                    <span>{t}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Difficulty, Question Type & Question Count */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-3 border-t border-slate-200 dark:border-slate-800">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Difficulty Level
              </label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as DifficultyLevel)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              >
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
                <option value="Mixed">Mixed Difficulty</option>
              </select>
            </div>

            <div className="space-y-1.5 lg:col-span-2">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Question Type
              </label>
              <select
                value={questionType}
                onChange={(e) => setQuestionType(e.target.value as ExamQuestionType)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              >
                {QUESTION_TYPES.filter((qt) => {
                  const allowed = selectedExam?.allowedQuestionFormats;
                  if (!allowed || allowed.length === 0) return true;
                  if (qt.id === 'Mixed') return allowed.length > 1;
                  if (qt.id === 'Comprehension') {
                    return allowed.includes('Passage-Based') || allowed.includes('Case-Based');
                  }
                  if (qt.id === 'Statement-Based') {
                    return allowed.includes('Assertion-Reasoning') || allowed.includes('Sequence-Order');
                  }
                  return allowed.includes(qt.id);
                }).map((qt) => (
                  <option key={qt.id} value={qt.id}>
                    {qt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {activeCategory !== 'combined' && (
            <div className="space-y-2.5">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block">
                Question Count
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {([25, 50, 100, 'custom'] as const).map((cnt) => {
                  const isCountActive = questionCountPreset === cnt;
                  const countSub =
                    cnt === 25
                      ? 'Quick Practice Set'
                      : cnt === 50
                        ? 'Standard Paper 1 Length'
                        : cnt === 100
                          ? 'Full Paper 2 Marathon'
                          : '5 – 100 Custom Questions';
                  return (
                    <button
                      key={String(cnt)}
                      type="button"
                      onClick={() => setQuestionCountPreset(cnt)}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        isCountActive
                          ? activeCategoryMeta.buttonClasses + ' border-transparent shadow-sm'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-indigo-400'
                      }`}
                    >
                      <div className="text-sm font-bold tabular-nums">
                        {cnt === 'custom'
                          ? language === 'odia'
                            ? 'କଷ୍ଟମ୍ (Custom)'
                            : 'Custom Count'
                          : language === 'odia'
                            ? `${cnt} ପ୍ରଶ୍ନ (${cnt} Qs)`
                            : `${cnt} Questions`}
                      </div>
                      <div
                        className={`text-[11px] mt-0.5 ${
                          isCountActive ? 'opacity-90' : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {countSub}
                      </div>
                    </button>
                  );
                })}
              </div>
              {questionCountPreset === 'custom' && (
                <div className="flex items-center gap-2.5 pt-1">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Enter custom count (5–100):
                  </span>
                  <input
                    type="number"
                    min={5}
                    max={100}
                    value={customCount}
                    onChange={(e) => setCustomCount(Number(e.target.value) || 10)}
                    className="w-28 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm tabular-nums"
                  />
                </div>
              )}
            </div>
          )}

          {/* Marking Scheme, Negative Marking & Timer */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 flex flex-wrap items-center justify-between gap-4 text-xs">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200">
                <Settings2 className="w-3.5 h-3.5" />
                <span>Marking & Timer:</span>
              </div>

              <label className="flex items-center gap-1.5">
                <span>Marks/Q:</span>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  value={marksPerQuestion}
                  onChange={(e) => setMarksPerQuestion(Number(e.target.value) || 1)}
                  className="w-16 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 tabular-nums"
                />
              </label>

              <label className="inline-flex items-center gap-1.5 cursor-pointer font-medium">
                <input
                  type="checkbox"
                  checked={negativeMarkingEnabled}
                  onChange={(e) => setNegativeMarkingEnabled(e.target.checked)}
                />
                <span>Enable Negative Marking</span>
              </label>

              {negativeMarkingEnabled && (
                <label className="flex items-center gap-1.5">
                  <span>Penalty/Wrong:</span>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    value={negativeMarksPerWrong}
                    onChange={(e) =>
                      setNegativeMarksPerWrong(Number(e.target.value) || 0)
                    }
                    className="w-16 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 tabular-nums"
                  />
                </label>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <label className="inline-flex items-center gap-1.5 cursor-pointer font-medium">
                <input
                  type="checkbox"
                  checked={practiceMode}
                  onChange={(e) => setPracticeMode(e.target.checked)}
                />
                <span>Practice Mode (No Timer)</span>
              </label>

              {!practiceMode && (
                <label className="flex items-center gap-1.5">
                  <span>Timer (min):</span>
                  <input
                    type="number"
                    min={5}
                    max={240}
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value) || 30)}
                    className="w-16 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 tabular-nums"
                  />
                </label>
              )}
            </div>
          </div>

          {/* Launch & Download PDF Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />
              <span>
                Questions are generated fresh via AI strictly for the selected syllabus & language ({language.toUpperCase()}).
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={
                  generating ||
                  pdfBusy ||
                  resolvedQuestionCount === 0 ||
                  (activeCategory === 'ugc-net' && !activeUgcRecord) ||
                  (activeCategory === 'upsc' && !activeUpscRecord)
                }
                onClick={() => {
                  setPdfLanguage(language);
                  setPdfModalOpen(true);
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold text-slate-800 dark:text-slate-100 hover:border-violet-500 disabled:opacity-50 transition-colors"
              >
                <Download className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                <span>
                  {language === 'odia'
                    ? 'ପ୍ରଶ୍ନ PDF ଡାଉନଲୋଡ୍ କରନ୍ତୁ'
                    : 'Download Questions PDF'}
                </span>
              </button>

              <button
                type="button"
                disabled={
                  generating ||
                  pdfBusy ||
                  resolvedQuestionCount === 0 ||
                  (activeCategory === 'ugc-net' && !activeUgcRecord) ||
                  (activeCategory === 'upsc' && !activeUpscRecord)
                }
                onClick={() => void handleStartGeneration()}
                className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors ${activeCategoryMeta.buttonClasses}`}
              >
                {generating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{genProgress || 'Generating Mock Test...'}</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    <span>
                      {language === 'odia'
                        ? `${resolvedQuestionCount}-ପ୍ରଶ୍ନ ମକ୍ ଟେଷ୍ଟ ଆରମ୍ଭ କରନ୍ତୁ`
                        : `Start ${resolvedQuestionCount}-Question Mock Test`}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Past Attempts History */}
        {attempts.length > 0 && (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <History className="w-4 h-4 text-blue-600" />
              <span>Saved Mock Test Results</span>
            </div>
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {attempts.slice(0, 8).map((att) => (
                <div
                  key={att.id}
                  className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      {att.config.examName} · {att.config.subject}
                      {att.config.syllabusVersionLabel ? (
                        <span className="ml-2 text-[11px] font-medium text-[#4338CA] dark:text-cyan-300 tabular-nums">
                          ({att.config.syllabusVersionLabel})
                        </span>
                      ) : null}
                    </div>
                    <div className="text-slate-500 dark:text-slate-400 tabular-nums">
                      {att.config.language?.toUpperCase() || 'EN'} · Marks{' '}
                      {Number(att.score.toFixed(2))}/{att.maxScore ?? att.questions.length} (
                      {att.percentage.toFixed(1)}%) ·{' '}
                      {new Date(att.submittedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveResult(att);
                        setPhase('result');
                      }}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      View Analysis
                    </button>
                    <button
                      type="button"
                      onClick={() => exportMockResultToPdf(att)}
                      className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 font-medium"
                    >
                      PDF
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Subject / Topic Questions PDF Download Modal */}
      {pdfModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  {language === 'odia'
                    ? 'ପ୍ରଶ୍ନପତ୍ର PDF ଡାଉନଲୋଡ୍ କରନ୍ତୁ'
                    : 'Download Practice Questions PDF'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Printable A4 PDF strictly formatted for your selected syllabus selection.
                </p>
              </div>
              <button
                type="button"
                disabled={pdfBusy}
                onClick={() => setPdfModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                aria-label="Close PDF download modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1 text-xs">
              {activeCategory === 'ugc-net' && activeUgcRecord ? (
                <>
                  <div>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">Paper & Subject: </span>
                    <span className="text-slate-600 dark:text-slate-300">
                      {ugcPaperType === 'paper-1'
                        ? 'Paper 1 – Teaching & Research Aptitude'
                        : `Paper 2 – ${activeUgcRecord.subjectName}`}{' '}
                      ({activeUgcRecord.versionLabel})
                    </span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">Test Mode: </span>
                    <span className="text-slate-600 dark:text-slate-300">
                      {ugcTestMode}
                      {ugcSelectedUnitIds.length > 0 ? ` · ${ugcSelectedUnitIds.length} Unit(s)` : ''}
                      {ugcSelectedTopicIds.length > 0 ? ` · ${ugcSelectedTopicIds.length} Topic(s)` : ''}
                    </span>
                  </div>
                </>
              ) : activeCategory === 'upsc' && activeUpscRecord ? (
                <>
                  <div>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">UPSC Prelims Paper: </span>
                    <span className="text-slate-600 dark:text-slate-300">
                      {activeUpscRecord.paperLabel} ({activeUpscRecord.versionLabel})
                    </span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">Scope: </span>
                    <span className="text-slate-600 dark:text-slate-300">
                      {upscTestMode}
                      {upscAreaIds.length > 0 ? ` · ${upscAreaIds.length} Area(s)` : ''}
                      {upscTopicIds.length > 0 ? ` · ${upscTopicIds.length} Topic(s)` : ''}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">Subject / Scope: </span>
                    <span className="text-slate-600 dark:text-slate-300">
                      {scope === 'full-syllabus'
                        ? `Full Syllabus (All ${availableSubjects.length} Subjects)`
                        : selectedSubjectObj?.name || subject}
                    </span>
                  </div>
                  {scope === 'chapter-wise' && (
                    <div>
                      <span className="font-semibold text-slate-700 dark:text-slate-200">Chapter / Topic: </span>
                      <span className="text-slate-600 dark:text-slate-300">
                        {selectedChapters.join(', ')}
                        {topic !== 'All Chapter Topics' ? ` → ${topic}` : ''}
                      </span>
                    </div>
                  )}
                </>
              )}
              <div>
                <span className="font-semibold text-slate-700 dark:text-slate-200">Configuration: </span>
                <span className="text-slate-600 dark:text-slate-300">
                  {resolvedQuestionCount} Questions · {difficulty} · {questionType}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-200 block">
                PDF Language
              </label>
              <div className="flex flex-wrap gap-2">
                {(activeCategory === 'cbse'
                  ? ([
                      ['english', 'English'],
                      ['hindi', 'हिन्दी (Hindi)'],
                    ] as const)
                  : ([
                      ['odia', 'ଓଡ଼ିଆ (Odia)'],
                      ['english', 'English'],
                      ['hindi', 'हिन्दी (Hindi)'],
                    ] as const)
                ).map(([lid, lbl]) => (
                  <button
                    key={lid}
                    type="button"
                    disabled={pdfBusy}
                    onClick={() => setPdfLanguage(lid)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                      pdfLanguage === lid
                        ? 'bg-violet-600 text-white border-violet-600'
                        : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={pdfIncludeAnswerKey}
                disabled={pdfBusy}
                onChange={(e) => setPdfIncludeAnswerKey(e.target.checked)}
                className="accent-violet-600 w-4 h-4"
              />
              <span>Include Answer Key & Detailed Explanations at the end</span>
            </label>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                disabled={pdfBusy}
                onClick={() => setPdfModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={pdfBusy}
                onClick={() => void handleDownloadSelectionPdf()}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold disabled:opacity-60 transition-colors"
              >
                {pdfBusy ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{pdfProgress || 'Preparing PDF...'}</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>Generate & Download PDF</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <SyllabusManagerModal
        isOpen={syllabusModalOpen}
        onClose={() => setSyllabusModalOpen(false)}
        exams={allExams}
        syllabusPdfs={syllabusPdfs}
        onAddCustomExam={(exam) => {
          if (onAddCustomExam) {
            onAddCustomExam(exam);
          } else {
            setLocalCustomExams((prev) => [...prev, exam]);
          }
          setActiveCategory(exam.category);
          applyExamDefaults(exam);
        }}
        onUpdateExam={(exam) => {
          if (onUpdateExam) {
            onUpdateExam(exam);
          } else {
            setLocalCustomExams((prev) => [...prev.filter((x) => x.id !== exam.id), exam]);
          }
          if (selectedExam?.id === exam.id) {
            setMarksPerQuestion(exam.defaultMarksPerQuestion);
            setNegativeMarkingEnabled(exam.defaultNegativeMarking);
            setNegativeMarksPerWrong(exam.defaultNegativePenalty);
          }
        }}
        onAddChapterOrTopic={handleAddChapterOrTopic}
        onAddSyllabusPdf={(ref) => {
          if (onAddSyllabusPdf) {
            onAddSyllabusPdf(ref);
          } else {
            setLocalSyllabusPdfs((prev) => [ref, ...prev]);
          }
          setSelectedSyllabusPdfId(ref.id);
        }}
        onRemoveSyllabusPdf={(id) => {
          if (onRemoveSyllabusPdf) {
            onRemoveSyllabusPdf(id);
          } else {
            setLocalSyllabusPdfs((prev) => prev.filter((p) => p.id !== id));
          }
          if (selectedSyllabusPdfId === id) setSelectedSyllabusPdfId('');
        }}
      />
    </div>
  );
};

