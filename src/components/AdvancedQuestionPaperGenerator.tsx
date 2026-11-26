import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BookMarked,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileText,
  Layers,
  Loader2,
  Printer,
  RefreshCw,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import type {
  AdvancedQuestionTypeId,
  AppSettings,
  DifficultyLevel,
  ExamCategoryId,
  ExamDefinition,
  GeneratedExamPaper,
  GeneratedExamQuestion,
  GeneratedExamSection,
  MockLanguage,
  SyllabusPdfReference,
} from '../types';
import { EXAM_CATEGORIES } from '../data/examCatalog';
import {
  getFormatLocalizedLabel,
  getOfficialDefaultMarks,
  getSuitableQuestionFormats,
} from '../data/questionFormatsCatalog';
import { generateAI, parseSafeJson } from '../utils/aiClient';
import { fetchCentralQuestions } from '../utils/adminApi';
import { exportExamPaperPdf } from '../utils/pdfExport';
import { MarkdownRenderer } from './MarkdownRenderer';
import { SyllabusManagerModal } from './SyllabusManagerModal';

interface AdvancedQuestionPaperGeneratorProps {
  settings: AppSettings;
  exams: ExamDefinition[];
  syllabusPdfs: SyllabusPdfReference[];
  onAddCustomExam: (exam: ExamDefinition) => void;
  onUpdateExam: (exam: ExamDefinition) => void;
  onAddChapterOrTopic: (
    examId: string,
    classId: string,
    subjectName: string,
    chapterName: string,
    topicName: string,
  ) => void;
  onAddSyllabusPdf: (pdfRef: SyllabusPdfReference) => void;
  onRemoveSyllabusPdf: (id: string) => void;
  onSelectUgcNet?: () => void;
  onSelectUpsc?: () => void;
}

interface TypeConfigState {
  enabled: boolean;
  count: number;
  marks: number;
}

const DEFAULT_ENABLED_TYPES: AdvancedQuestionTypeId[] = [
  'MCQ',
  'Fill-in-the-Blanks',
  'True-False',
  'Short-Answer',
  'Long-Answer',
];

function buildInitialTypeConfig(exam: ExamDefinition | undefined): Record<AdvancedQuestionTypeId, TypeConfigState> {
  const suitable = getSuitableQuestionFormats(exam, exam?.classesOrPapers[0]?.subjects[0]);
  const suitableIds = new Set(suitable.map((f) => f.id));

  const base = {} as Record<AdvancedQuestionTypeId, TypeConfigState>;
  for (const fmt of getSuitableQuestionFormats(undefined, undefined)) {
    const isDefaultOn = DEFAULT_ENABLED_TYPES.includes(fmt.id) && suitableIds.has(fmt.id);
    const defaultCount =
      fmt.id === 'MCQ'
        ? 10
        : fmt.id === 'Fill-in-the-Blanks' || fmt.id === 'True-False' || fmt.id === 'Short-Answer' || fmt.id === 'Long-Answer'
          ? 5
          : fmt.defaultCount;
    base[fmt.id] = {
      enabled: isDefaultOn,
      count: defaultCount,
      marks: getOfficialDefaultMarks(exam, fmt.id),
    };
  }
  return base;
}

function resolveDefaultLanguageForSelection(
  exam: ExamDefinition | undefined,
  subjectName: string,
  globalLang: AppSettings['language'],
  currentLang?: MockLanguage,
): MockLanguage {
  const sLower = subjectName.toLowerCase();
  if (sLower.includes('hindi') || sLower.includes('हिंदी') || sLower.includes('हिन्दी')) {
    return 'hindi';
  }
  if (sLower.startsWith('english')) return 'english';
  if (exam?.id === 'cbse-board') {
    if (currentLang === 'hindi' || currentLang === 'english') return currentLang;
    return globalLang === 'hindi' ? 'hindi' : 'english';
  }
  if (exam?.id === 'bse-odisha' || sLower.includes('odia') || sLower.includes('ଓଡ଼ିଆ')) {
    return globalLang === 'english' && exam?.id !== 'bse-odisha' ? 'english' : 'odia';
  }
  if (globalLang === 'odia' || globalLang === 'hindi' || globalLang === 'english') {
    return globalLang;
  }
  return 'english';
}

export const AdvancedQuestionPaperGenerator: React.FC<AdvancedQuestionPaperGeneratorProps> = ({
  settings,
  exams,
  syllabusPdfs,
  onAddCustomExam,
  onUpdateExam,
  onAddChapterOrTopic,
  onAddSyllabusPdf,
  onRemoveSyllabusPdf,
  onSelectUgcNet,
  onSelectUpsc,
}) => {
  const availableExams = useMemo(
    () => exams.filter((e) => e.classesOrPapers.length > 0),
    [exams],
  );

  const [selectedCategory, setSelectedCategory] = useState<ExamCategoryId>('odisha-board');
  const [selectedExamId, setSelectedExamId] = useState<string>('bse-odisha');
  const [selectedClassId, setSelectedClassId] = useState<string>('bse-class-10');
  const [selectedSubjectName, setSelectedSubjectName] = useState<string>('');
  const [chapterScope, setChapterScope] = useState<'all' | 'selected'>('all');
  const [selectedChapters, setSelectedChapters] = useState<string[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<string>('All Chapter Topics');
  const [selectedSyllabusPdfId, setSelectedSyllabusPdfId] = useState<string>('');
  const [syllabusModalOpen, setSyllabusModalOpen] = useState(false);

  const [difficulty, setDifficulty] = useState<DifficultyLevel>('Medium');
  const [language, setLanguage] = useState<MockLanguage>('odia');
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [presetTarget, setPresetTarget] = useState<10 | 25 | 50 | 100 | 'custom'>('custom');
  const [customTargetInput, setCustomTargetInput] = useState<number>(30);

  const selectedExam = useMemo(
    () => availableExams.find((e) => e.id === selectedExamId) || availableExams[0],
    [availableExams, selectedExamId],
  );

  const categoryExams = useMemo(() => {
    const list = availableExams.filter((e) => e.category === selectedCategory);
    return list.length > 0 ? list : availableExams;
  }, [availableExams, selectedCategory]);

  const selectedClassObj = useMemo(
    () =>
      selectedExam?.classesOrPapers.find((c) => c.id === selectedClassId) ||
      selectedExam?.classesOrPapers[0],
    [selectedExam, selectedClassId],
  );

  const availableSubjects = useMemo(
    () => selectedClassObj?.subjects || [],
    [selectedClassObj],
  );

  const selectedSubjectObj = useMemo(
    () =>
      availableSubjects.find((s) => s.name === selectedSubjectName) ||
      availableSubjects[0],
    [availableSubjects, selectedSubjectName],
  );

  const examinableChapters = useMemo(
    () => (selectedSubjectObj?.chapters || []).filter((c) => !c.excludedFromExam),
    [selectedSubjectObj],
  );

  const activeChapterObj = useMemo(
    () =>
      examinableChapters.find((c) => selectedChapters.includes(c.name)) ||
      examinableChapters[0],
    [examinableChapters, selectedChapters],
  );

  const matchingPdfs = useMemo(
    () => syllabusPdfs.filter((p) => p.examId === selectedExam?.id),
    [syllabusPdfs, selectedExam],
  );

  const activePdfRef = useMemo(
    () =>
      matchingPdfs.find((p) => p.id === selectedSyllabusPdfId) || matchingPdfs[0] || null,
    [matchingPdfs, selectedSyllabusPdfId],
  );

  const [typeConfigs, setTypeConfigs] = useState<Record<AdvancedQuestionTypeId, TypeConfigState>>(() =>
    buildInitialTypeConfig(availableExams[0]),
  );

  // Reconcile exam/class/subject/chapter whenever centralized catalog updates
  useEffect(() => {
    if (selectedExam && selectedExam.id !== selectedExamId) {
      setSelectedExamId(selectedExam.id);
      setSelectedCategory(selectedExam.category);
    }
    if (selectedClassObj && selectedClassObj.id !== selectedClassId) {
      setSelectedClassId(selectedClassObj.id);
    }
    if (selectedSubjectObj && selectedSubjectObj.name !== selectedSubjectName) {
      setSelectedSubjectName(selectedSubjectObj.name);
    }
  }, [availableExams, selectedExam, selectedExamId, selectedClassObj, selectedClassId, selectedSubjectObj, selectedSubjectName]);

  useEffect(() => {
    const validChapNames = new Set(examinableChapters.map((c) => c.name));
    setSelectedChapters((prev) => {
      const kept = prev.filter((name) => validChapNames.has(name));
      if (kept.length > 0) return kept;
      return examinableChapters[0] ? [examinableChapters[0].name] : [];
    });
  }, [examinableChapters]);

  useEffect(() => {
    const firstChap = examinableChapters[0];
    setSelectedChapters(firstChap ? [firstChap.name] : []);
    setSelectedTopic('All Chapter Topics');
  }, [selectedSubjectObj?.name, selectedClassObj?.id, selectedExam?.id]);

  // Update suitable formats & official marks whenever exam or subject updates (including Admin changes)
  const suitableFormats = useMemo(
    () => getSuitableQuestionFormats(selectedExam, selectedSubjectObj),
    [selectedExam, selectedSubjectObj],
  );

  useEffect(() => {
    setTypeConfigs((prev) => {
      const next = { ...prev };
      const suitableIds = new Set(suitableFormats.map((f) => f.id));
      let anySuitableEnabled = false;
      for (const f of suitableFormats) {
        if (next[f.id]?.enabled) anySuitableEnabled = true;
      }
      for (const f of suitableFormats) {
        const officialMarks = getOfficialDefaultMarks(selectedExam, f.id);
        next[f.id] = {
          enabled: anySuitableEnabled
            ? Boolean(next[f.id]?.enabled)
            : f.id === 'MCQ' || f.id === 'Short-Answer',
          count: next[f.id]?.count || f.defaultCount,
          marks: officialMarks,
        };
      }
      // Disable formats that aren't suitable for this exam/subject
      for (const key of Object.keys(next) as AdvancedQuestionTypeId[]) {
        if (!suitableIds.has(key) && next[key]) {
          next[key] = { ...next[key], enabled: false };
        }
      }
      return next;
    });
  }, [selectedExam?.id, selectedExam?.allowedQuestionFormats, selectedExam?.customFormatMarks, selectedSubjectObj?.name]);

  const activeSectionsPlan = useMemo(() => {
    return suitableFormats
      .filter((f) => typeConfigs[f.id]?.enabled && (typeConfigs[f.id]?.count || 0) > 0)
      .map((f) => ({
        meta: f,
        count: Math.max(1, Math.min(50, typeConfigs[f.id].count)),
        marks: Math.max(0.5, typeConfigs[f.id].marks),
      }));
  }, [suitableFormats, typeConfigs]);

  const totalQuestions = useMemo(
    () => activeSectionsPlan.reduce((sum, item) => sum + item.count, 0),
    [activeSectionsPlan],
  );

  const totalMarks = useMemo(
    () =>
      Number(
        activeSectionsPlan
          .reduce((sum, item) => sum + item.count * item.marks, 0)
          .toFixed(2),
      ),
    [activeSectionsPlan],
  );

  // Generation & Paper View state
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [paper, setPaper] = useState<GeneratedExamPaper | null>(null);

  const [showAnswers, setShowAnswers] = useState(true);
  const [showExplanations, setShowExplanations] = useState(true);
  const [copied, setCopied] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  const selectShortcutExam = (
    examId: string,
    classId?: string,
    defaultLang?: MockLanguage,
  ) => {
    const ex = availableExams.find((e) => e.id === examId);
    if (!ex) return;
    setSelectedCategory(ex.category);
    setSelectedExamId(ex.id);
    const cls =
      (classId ? ex.classesOrPapers.find((c) => c.id === classId) : undefined) ||
      ex.classesOrPapers[0];
    if (cls) {
      setSelectedClassId(cls.id);
      const firstSubj = cls.subjects[0]?.name || '';
      setSelectedSubjectName(firstSubj);
      setLanguage(
        defaultLang ||
          resolveDefaultLanguageForSelection(ex, firstSubj, settings.language, language),
      );
    }
    setChapterScope('all');
    setSelectedTopic('All Chapter Topics');
  };

  const applyTotalCountDistribution = (targetTotal: number) => {
    const clamped = Math.max(1, Math.min(150, targetTotal));
    let enabledIds = suitableFormats
      .filter((f) => typeConfigs[f.id]?.enabled)
      .map((f) => f.id);

    if (enabledIds.length === 0 && suitableFormats.length > 0) {
      enabledIds = [suitableFormats[0].id];
    }
    if (enabledIds.length === 0) return;

    const effectiveEnabled =
      clamped < enabledIds.length ? enabledIds.slice(0, clamped) : enabledIds;
    const currentSum = effectiveEnabled.reduce(
      (s, id) => s + Math.max(1, typeConfigs[id]?.count || 1),
      0,
    );

    const distributed = new Map<AdvancedQuestionTypeId, number>();
    let assigned = 0;

    effectiveEnabled.forEach((id, idx) => {
      if (idx === effectiveEnabled.length - 1) {
        distributed.set(id, Math.max(1, clamped - assigned));
      } else {
        const share = Math.max(
          1,
          Math.round(((typeConfigs[id]?.count || 1) / Math.max(1, currentSum)) * clamped),
        );
        const remainingSlots = effectiveEnabled.length - idx - 1;
        const capped = Math.min(share, clamped - assigned - remainingSlots);
        const finalCount = Math.max(1, capped);
        distributed.set(id, finalCount);
        assigned += finalCount;
      }
    });

    setTypeConfigs((prev) => {
      const next = { ...prev };
      for (const f of suitableFormats) {
        if (distributed.has(f.id)) {
          next[f.id] = {
            ...next[f.id],
            enabled: true,
            count: distributed.get(f.id)!,
          };
        } else if (clamped < enabledIds.length && enabledIds.includes(f.id)) {
          next[f.id] = { ...next[f.id], enabled: false };
        }
      }
      return next;
    });
    setDurationMinutes(Math.max(15, Math.min(180, Math.round(clamped * 1.5))));
  };

  const formatTypeInstruction = (typeId: AdvancedQuestionTypeId): string => {
    switch (typeId) {
      case 'MCQ':
        return 'Provide 4 distinct options in "options" array, 1 correct answer text in "correctAnswer", and "correctOptionIndices": [idx].';
      case 'Multiple-Select':
        return 'Provide 4 distinct options in "options" array where 2 or 3 options are correct. Set "correctOptionIndices" to all correct 0-based indices (e.g. [0, 2]) and list ALL correct options clearly in "correctAnswer".';
      case 'True-False':
        return 'Provide a clear statement in "question", "options": ["True", "False"] (localized if Hindi/Odia), and set "correctAnswer" and "correctOptionIndices".';
      case 'Fill-in-the-Blanks':
        return 'Include "________" in "question" for the blank, leave "options" empty [], and put the exact missing word/phrase in "correctAnswer".';
      case 'Match-Following':
        return 'Provide "matchColumns": {"columnA": ["item 1", "item 2", "item 3", "item 4"], "columnB": ["match A", "match B", "match C", "match D"]} with shuffled Column B, optional 4 matching-code options in "options", and exact pairing in "correctAnswer" (e.g. "1-C, 2-A, 3-D, 4-B").';
      case 'One-Word':
        return 'Ask a precise factual question answerable in a single word/term/symbol. Leave "options" empty [] and provide the exact word in "correctAnswer".';
      case 'Very-Short':
        return 'Brief direct answer (1–2 sentences). Provide comprehensive sample answer in "correctAnswer" and 2 key evaluation points in "keyPoints".';
      case 'Short-Answer':
        return 'Structured 2–3 mark analytical question. Provide thorough sample answer in "correctAnswer" and 3 value points in "keyPoints" (note multiple valid student phrasings are acceptable).';
      case 'Long-Answer':
        return 'In-depth 4–6+ mark question. Provide comprehensive model answer in "correctAnswer" and 4–5 structured marking scheme points in "keyPoints".';
      case 'Descriptive':
        return 'Detailed descriptive/essay/explanation question. Provide rich sample response in "correctAnswer" and 4–5 rubric evaluation criteria in "keyPoints".';
      case 'Assertion-Reasoning':
        return 'Provide "assertionText" (Assertion A) and "reasonText" (Reason R), plus standard 4 options in "options" (A: Both A and R true & R explains A; B: Both true & R does not explain A; C: A true, R false; D: A false, R true) and accurate "correctAnswer" + "correctOptionIndices".';
      case 'Case-Based':
        return 'Provide a realistic scenario/case study (3–5 sentences) in "passageOrCase", followed by the analytical question in "question", model answer in "correctAnswer", and value points in "keyPoints".';
      case 'Passage-Based':
        return 'Provide a focused comprehension passage in "passageOrCase", question in "question", optional 4 MCQs or direct answer in "correctAnswer".';
      case 'Numerical':
        return 'Provide a quantitative calculation/problem-solving question with exact values & units. Include step-by-step mathematical solution in "explanation" (using LaTeX $...$) and final answer with unit in "correctAnswer".';
      case 'Diagram-Based':
        return 'Provide a crystal-clear labelled figure/circuit/map/ray-diagram/anatomical schematic description in "diagramDescription" that the student examines, then ask specific labelling/analysis questions in "question", with accurate "correctAnswer" and "keyPoints".';
      case 'Sequence-Order':
        return 'Provide 4–5 unordered steps/events/stages/values in "sequenceItems", ask the student to arrange them in chronological/logical/ascending order in "question", and show exact correct order in "correctAnswer".';
    }
  };

  const handleGeneratePaper = async () => {
    if (!selectedExam || !selectedClassObj || !selectedSubjectObj) {
      setErrorMsg('Please select an Examination, Class/Paper, and Subject.');
      return;
    }
    if (activeSectionsPlan.length === 0) {
      setErrorMsg('Enable at least one Question Type with count ≥ 1.');
      return;
    }

    setGenerating(true);
    setErrorMsg(null);
    setGenProgress('Preparing syllabus blueprint...');

    const chapterListText =
      chapterScope === 'selected' && selectedChapters.length > 0
        ? selectedChapters.join(', ')
        : examinableChapters.map((c) => c.name).join(', ');

    const topicFocusText =
      chapterScope === 'selected' && selectedTopic !== 'All Chapter Topics'
        ? selectedTopic
        : chapterScope === 'selected'
          ? selectedSubjectObj.chapters
              .filter((c) => selectedChapters.includes(c.name))
              .flatMap((c) => c.topics)
              .slice(0, 12)
              .join('; ') || 'Complete Selected Chapter(s)'
          : 'Complete Examinable Subject Syllabus';

    const cbseHindiIsolation =
      selectedExam.id === 'cbse-board' && selectedSubjectObj.subjectLanguage === 'Hindi'
        ? `STRICT CBSE HINDI ISOLATION: Generating strictly for "${selectedSubjectObj.name}" (${selectedClassObj.label}) using ONLY prescribed textbooks (${selectedSubjectObj.prescribedBooks?.join(', ')}). NEVER mix Course A (002) with Course B (085) or Core (302) with Elective (002).`
        : '';

    const bseGuard =
      selectedExam.id === 'bse-odisha'
        ? 'STRICT BSE ODISHA RULE: Follow BSE Odisha 2025-26 Official Class X Syllabus ONLY. Do NOT include any "Excluded in Exam" chapter.'
        : '';

    const subjLang = selectedSubjectObj.subjectLanguage;
    const isLiteratureSubject = Boolean(
      subjLang &&
        ((language === 'english' && subjLang !== 'English') ||
          (language === 'hindi' && subjLang !== 'Hindi') ||
          (language === 'odia' && subjLang !== 'Odia')),
    );

    const langDirective =
      language === 'odia'
        ? isLiteratureSubject
          ? `STRICT LANGUAGE RULE FOR ${selectedSubjectObj.name}: Preserve reading passages, prose/poetry quotes, and language-specific examples in original ${subjLang} where essential; write ALL directions, instructions, and explanations strictly in natural Odia (ଓଡ଼ିଆ Unicode).`
          : 'STRICT MEDIUM RULE (ODIA MEDIUM): Write 100% of EVERY question, option, match item, sequence item, answer, keyPoint, and explanation strictly in natural, grammatically correct Odia (ଓଡ଼ିଆ Unicode). Do NOT mix Hindi or unnecessary English sentences.'
        : language === 'hindi'
          ? isLiteratureSubject
            ? `STRICT LANGUAGE RULE FOR ${selectedSubjectObj.name}: Preserve reading passages and ${subjLang} quotes in original ${subjLang} where required; write ALL directions, instructions, and explanations strictly in pure Devanagari Hindi (हिन्दी).`
            : 'STRICT MEDIUM RULE (HINDI MEDIUM): Write 100% of EVERY question, passage, case study, diagram description, assertion, reason, option, match column, sequence item, model answer, keyPoint, and explanation strictly in pure, grammatically accurate Devanagari Hindi (हिन्दी). Do NOT mix English sentences or Hinglish (keep only standard mathematical symbols, chemical formulas, and SI units clearly formatted).'
          : isLiteratureSubject
            ? `STRICT LANGUAGE RULE FOR ${selectedSubjectObj.name}: Preserve reading passages, prose/poetry quotes, and grammar items in original ${subjLang} where essential; write ALL directions, instructions, and explanations strictly in clear, formal Academic English.`
            : 'STRICT MEDIUM RULE (ENGLISH MEDIUM): Write 100% of EVERY question, passage, case study, diagram description, assertion, reason, option, match column, sequence item, model answer, keyPoint, and explanation strictly in clear, formal Academic English. NEVER include Hindi words, Devanagari script, or Hinglish anywhere.';

    const syllabusRefSnippet = activePdfRef
      ? `\nAdmin-Uploaded Official Syllabus Reference (${activePdfRef.fileName}):\n${activePdfRef.extractedText.slice(0, 12000)}\n`
      : '';

    try {
      let bankQuestions: Awaited<ReturnType<typeof fetchCentralQuestions>>['questions'] = [];
      try {
        const qb = await fetchCentralQuestions({
          examId: selectedExam.id,
          subject: selectedSubjectObj.name,
        });
        bankQuestions = qb.questions.filter((q) => {
          if (chapterScope === 'selected' && selectedChapters.length > 0 && q.chapter) {
            return (
              selectedChapters.includes(q.chapter) ||
              q.chapter.toLowerCase() === 'all chapters'
            );
          }
          return true;
        });
      } catch {
        // Offline or unreachable - proceed seamlessly with AI generation
      }

      const builtSections: GeneratedExamSection[] = [];
      const seenStems = new Set<string>();
      let globalQuestionNum = 1;

      for (let sIdx = 0; sIdx < activeSectionsPlan.length; sIdx++) {
        const secPlan = activeSectionsPlan[sIdx];
        const sectionLetter = String.fromCharCode(65 + sIdx);
        const sectionCode = `SECTION ${sectionLetter}`;
        const sectionQuestions: GeneratedExamQuestion[] = [];

        // Pull matching curated Question Bank items first
        const matchingBank = bankQuestions.filter(
          (bq) => bq.typeId === secPlan.meta.id && !seenStems.has(bq.question.trim().toLowerCase()),
        );
        for (const bq of matchingBank) {
          if (sectionQuestions.length >= secPlan.count) break;
          seenStems.add(bq.question.trim().toLowerCase());
          sectionQuestions.push({
            number: globalQuestionNum++,
            typeId: secPlan.meta.id,
            typeLabel: secPlan.meta.label,
            sectionCode,
            marks: secPlan.marks,
            wordLimit: secPlan.meta.wordLimitHint,
            difficultyTag: bq.difficulty,
            passageOrCase: bq.passageOrCase,
            diagramDescription: bq.diagramDescription,
            assertionText: bq.assertionText,
            reasonText: bq.reasonText,
            matchColumns: bq.matchColumns,
            sequenceItems: bq.sequenceItems,
            options: bq.options,
            question: bq.question,
            correctAnswer: bq.correctAnswer,
            correctOptionIndices: bq.correctOptionIndices,
            keyPoints: bq.keyPoints,
            explanation: bq.explanation,
            topicTag: bq.topic || bq.chapter || selectedSubjectObj.name,
          });
        }

        // Generate remaining count in chunks of up to 10 questions so output JSON never truncates
        let remaining = secPlan.count - sectionQuestions.length;
        let round = 0;
        while (remaining > 0 && round < 8) {
          round++;
          const batchSize = Math.min(10, remaining);
          setGenProgress(
            `Generating ${sectionCode}: ${secPlan.meta.label} (${sectionQuestions.length + 1}–${sectionQuestions.length + batchSize} of ${secPlan.count})...`,
          );

          const avoidStems = Array.from(seenStems).slice(-14).join(' | ');
          const diffDirective =
            difficulty === 'Mixed'
              ? 'Mix difficulty across Easy, Medium, and Hard and set "difficultyTag" on each question to "Easy", "Medium", or "Hard".'
              : `Difficulty Level: ${difficulty}. Set "difficultyTag" to "${difficulty}".`;

          const prompt = `Generate exactly ${batchSize} non-repeating, exam-grade practice questions for ONE section of a structured question paper.
Examination: ${selectedExam.name}
Class / Paper: ${selectedClassObj.label}
Subject: ${selectedSubjectObj.name} ${selectedSubjectObj.code ? `(${selectedSubjectObj.code})` : ''}
Chapter(s): ${chapterListText}
Topic Focus: ${topicFocusText}
Question Type: ${secPlan.meta.id} (${secPlan.meta.label})
Marks per Question: ${secPlan.marks}
${secPlan.meta.wordLimitHint ? `Recommended Word Limit: ${secPlan.meta.wordLimitHint}` : ''}
${diffDirective}
${langDirective}
${cbseHindiIsolation}
${bseGuard}
${syllabusRefSnippet}

Format Requirements for "${secPlan.meta.id}":
${formatTypeInstruction(secPlan.meta.id)}

Additional Accuracy Rules:
- Strictly stay within the selected Exam, Class, Subject, Chapter, and Topic syllabus. Zero out-of-syllabus questions.
- Do NOT claim these are official past-year board questions.
- For subjective/descriptive types, provide meaningful evaluation "keyPoints" so teachers/students recognize that alternative phrasing covering those concepts is valid.
${avoidStems ? `- Do NOT repeat any of these stems: ${avoidStems}` : ''}

Return ONLY valid JSON matching this schema (no markdown fences):
{"questions":[{"question":"...","passageOrCase":"","diagramDescription":"","assertionText":"","reasonText":"","matchColumns":{"columnA":[],"columnB":[]},"sequenceItems":[],"options":[],"correctAnswer":"...","correctOptionIndices":[],"keyPoints":["..."],"explanation":"...","difficultyTag":"${difficulty === 'Mixed' ? 'Medium' : difficulty}","topicTag":"${topicFocusText.slice(0, 60)}"}]}`;

          const res = await generateAI({
            provider: settings.provider,
            model: settings.model,
            language,
            prompt,
            responseMimeType: 'application/json',
          });

          const parsed = parseSafeJson<{
            questions: Array<{
              question: string;
              passageOrCase?: string;
              diagramDescription?: string;
              assertionText?: string;
              reasonText?: string;
              matchColumns?: { columnA?: string[]; columnB?: string[] };
              sequenceItems?: string[];
              options?: string[];
              correctAnswer?: string;
              correctOptionIndices?: number[];
              keyPoints?: string[];
              explanation?: string;
              difficultyTag?: string;
              topicTag?: string;
            }>;
          }>(res.text);

          const batchItems = Array.isArray(parsed.questions) ? parsed.questions : [];
          if (batchItems.length === 0) {
            throw new Error(`AI returned an empty batch for ${secPlan.meta.label}. Please try again.`);
          }

          for (const raw of batchItems) {
            if (sectionQuestions.length >= secPlan.count) break;
            const stemKey = (raw.question || '').trim().toLowerCase().slice(0, 80);
            if (!stemKey || seenStems.has(stemKey)) continue;
            seenStems.add(stemKey);

            sectionQuestions.push({
              number: globalQuestionNum++,
              typeId: secPlan.meta.id,
              typeLabel: getFormatLocalizedLabel(secPlan.meta, language),
              sectionCode,
              marks: secPlan.marks,
              wordLimit: secPlan.meta.wordLimitHint,
              difficultyTag: raw.difficultyTag || difficulty,
              passageOrCase: raw.passageOrCase?.trim() || undefined,
              diagramDescription: raw.diagramDescription?.trim() || undefined,
              assertionText: raw.assertionText?.trim() || undefined,
              reasonText: raw.reasonText?.trim() || undefined,
              matchColumns:
                raw.matchColumns &&
                ((raw.matchColumns.columnA?.length || 0) > 0 ||
                  (raw.matchColumns.columnB?.length || 0) > 0)
                  ? {
                      columnA: raw.matchColumns.columnA || [],
                      columnB: raw.matchColumns.columnB || [],
                    }
                  : undefined,
              sequenceItems:
                Array.isArray(raw.sequenceItems) && raw.sequenceItems.length > 0
                  ? raw.sequenceItems
                  : undefined,
              question: raw.question.trim(),
              options:
                Array.isArray(raw.options) && raw.options.length > 0 ? raw.options : undefined,
              correctAnswer: (raw.correctAnswer || '').trim() || 'Refer to key points and explanation.',
              correctOptionIndices:
                Array.isArray(raw.correctOptionIndices) && raw.correctOptionIndices.length > 0
                  ? raw.correctOptionIndices
                  : undefined,
              keyPoints:
                Array.isArray(raw.keyPoints) && raw.keyPoints.length > 0
                  ? raw.keyPoints
                  : undefined,
              explanation: (raw.explanation || '').trim() || 'Conceptual verification from prescribed syllabus.',
              topicTag: raw.topicTag || topicFocusText.slice(0, 60),
            });
            remaining--;
          }
        }

        if (sectionQuestions.length > 0) {
          builtSections.push({
            sectionCode,
            sectionTitle: `${sectionCode} – ${getFormatLocalizedLabel(secPlan.meta, language)}`,
            typeId: secPlan.meta.id,
            marksPerQuestion: secPlan.marks,
            totalSectionMarks: Number((sectionQuestions.length * secPlan.marks).toFixed(2)),
            questions: sectionQuestions,
          });
        }
      }

      const finalTotalQs = builtSections.reduce((s, sec) => s + sec.questions.length, 0);
      const finalTotalMarks = Number(
        builtSections.reduce((s, sec) => s + sec.totalSectionMarks, 0).toFixed(2),
      );

      const defaultInstructions =
        language === 'hindi'
          ? [
              'सभी अनुभाग (Sections) ध्यानपूर्वक पढ़ें और निर्देशानुसार उत्तर दें।',
              'प्रत्येक प्रश्न के सामने उसके निर्धारित अंक दिए गए हैं।',
              'जहाँ आवश्यक हो, स्पष्ट एवं क्रमबद्ध चरण (Steps) या बिंदुवार उत्तर लिखें।',
            ]
          : language === 'odia'
            ? [
                'ସମସ୍ତ ବିଭାଗ (Sections) ଧ୍ୟାନର ସହିତ ପଢ଼ି ନିର୍ଦ୍ଦେଶ ଅନୁଯାୟୀ ଉତ୍ତର ଦିଅନ୍ତୁ ।',
                'ପ୍ରତ୍ୟେକ ପ୍ରଶ୍ନର ଡାହାଣ ପାର୍ଶ୍ୱରେ ନିର୍ଦ୍ଧାରିତ ନମ୍ବର ଦିଆଯାଇଛି ।',
                'ଆବଶ୍ୟକ ସ୍ଥଳେ ସ୍ପଷ୍ଟ ପଦକ୍ଷେପ (Steps) ଏବଂ ମୁଖ୍ୟ ବିନ୍ଦୁ ଉଲ୍ଲେଖ କରନ୍ତୁ ।',
              ]
            : [
                'Read every section carefully and attempt questions strictly as directed.',
                'Marks allotted to each question are indicated clearly against it.',
                'For descriptive and numerical items, show clear steps and key points; multiple valid phrasings are accepted.',
              ];

      setPaper({
        id: `paper-${Date.now()}`,
        title: `${selectedSubjectObj.name} Practice Paper`,
        examId: selectedExam.id,
        examName: selectedExam.name,
        classLabel: selectedClassObj.label,
        subject: selectedSubjectObj.name,
        chapter:
          chapterScope === 'all'
            ? `All Chapters (${examinableChapters.length})`
            : selectedChapters.join(', ') || 'Selected Chapters',
        topic: chapterScope === 'selected' ? selectedTopic : 'Complete Subject Syllabus',
        difficulty,
        language,
        durationMinutes,
        totalQuestions: finalTotalQs,
        totalMarks: finalTotalMarks,
        instructions: defaultInstructions,
        syllabusReferenceName: activePdfRef?.fileName || selectedExam.officialSyllabusPdfName,
        sections: builtSections,
        generatedAt: Date.now(),
      });
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Could not generate question paper. Please try again.',
      );
    } finally {
      setGenerating(false);
      setGenProgress('');
    }
  };

  const handleCopyAllQuestions = async () => {
    if (!paper) return;
    const lines: string[] = [
      `${paper.examName} — ${paper.title}`,
      `Class: ${paper.classLabel} | Subject: ${paper.subject} | Chapter: ${paper.chapter}`,
      `Duration: ${paper.durationMinutes} min | Total Questions: ${paper.totalQuestions} | Total Marks: ${paper.totalMarks}`,
      '',
    ];
    for (const sec of paper.sections) {
      lines.push(`=== ${sec.sectionTitle} (${sec.totalSectionMarks} Marks) ===`);
      for (const q of sec.questions) {
        lines.push(`Q${q.number} [${q.marks} Marks]: ${q.question}`);
        if (q.passageOrCase) lines.push(`   [Passage/Case]: ${q.passageOrCase}`);
        if (q.diagramDescription) lines.push(`   [Diagram]: ${q.diagramDescription}`);
        if (q.assertionText) lines.push(`   Assertion (A): ${q.assertionText}`);
        if (q.reasonText) lines.push(`   Reason (R): ${q.reasonText}`);
        if (q.matchColumns) {
          lines.push(`   Column A: ${q.matchColumns.columnA.join(' | ')}`);
          lines.push(`   Column B: ${q.matchColumns.columnB.join(' | ')}`);
        }
        if (q.sequenceItems) lines.push(`   Items: ${q.sequenceItems.join(' / ')}`);
        if (q.options) {
          q.options.forEach((o, i) => lines.push(`   (${String.fromCharCode(65 + i)}) ${o}`));
        }
        if (showAnswers) {
          lines.push(`   Answer: ${q.correctAnswer}`);
          if (q.keyPoints?.length) lines.push(`   Key Points: ${q.keyPoints.join('; ')}`);
        }
        if (showExplanations) lines.push(`   Explanation: ${q.explanation}`);
        lines.push('');
      }
    }
    await navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handlePdfExport = async (mode: 'paper-only' | 'answer-key' | 'complete') => {
    if (!paper || pdfBusy) return;
    setPdfBusy(true);
    try {
      await exportExamPaperPdf(paper, mode);
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* CONFIGURATION PANEL (Hidden automatically during Print) */}
      <div className="no-print space-y-5">
        {/* Top Action & Admin Syllabus Sync Banner */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ClipboardCheck className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                <span>1. Examination &amp; Syllabus Selection (Unified with Mock Test)</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Pick an exam shortcut or category below. Updates made in Admin Syllabus Sync reflect immediately across both Question Generation and Mock Test.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSyllabusModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-violet-300 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/30 hover:bg-violet-100 text-violet-800 dark:text-violet-200 text-xs font-semibold"
            >
              <BookMarked className="w-3.5 h-3.5" />
              <span>Admin Syllabus &amp; Formats</span>
            </button>
          </div>

          {/* Quick Exam Selection Shortcuts */}
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'cbse-board', classId: 'cbse-class-10', label: 'CBSE 10th (English Medium)', lang: 'english' as MockLanguage },
              { id: 'cbse-board', classId: 'cbse-class-12', label: 'CBSE 12th (English Medium)', lang: 'english' as MockLanguage },
              { id: 'bse-odisha', label: 'BSE Odisha (Class 10)', lang: 'odia' as MockLanguage },
              { id: 'chse-odisha-arts', label: 'CHSE Odisha Arts (+2)', lang: 'english' as MockLanguage },
              { id: 'chse-odisha-science', label: 'CHSE Odisha Science (+2)', lang: 'english' as MockLanguage },
              { id: 'opsc-oas', label: 'Competitive Exams', lang: 'english' as MockLanguage },
            ].map((sc) => {
              const isMatch =
                selectedExam?.id === sc.id &&
                (!sc.classId || selectedClassObj?.id === sc.classId) &&
                (sc.id !== 'cbse-board' || language === sc.lang);
              return (
                <button
                  key={`${sc.id}-${sc.classId || 'default'}-${sc.lang}`}
                  type="button"
                  onClick={() => selectShortcutExam(sc.id, sc.classId, sc.lang)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-colors ${
                    isMatch
                      ? 'bg-violet-600 text-white border-violet-600 shadow-xs'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:border-violet-400'
                  }`}
                >
                  {sc.label}
                </button>
              );
            })}
            {onSelectUgcNet && (
              <button
                type="button"
                onClick={onSelectUgcNet}
                className="px-3.5 py-2 rounded-xl text-xs font-bold border border-indigo-300 dark:border-indigo-800 bg-gradient-to-r from-indigo-50 to-cyan-50 dark:from-indigo-950/40 dark:to-blue-950/30 text-[#4338CA] dark:text-indigo-200 hover:border-[#4338CA] transition-colors"
              >
                UGC NET / JRF (Published)
              </button>
            )}
            {onSelectUpsc && (
              <button
                type="button"
                onClick={onSelectUpsc}
                className="px-3.5 py-2 rounded-xl text-xs font-bold border border-indigo-300 dark:border-indigo-800 bg-gradient-to-r from-indigo-50 to-cyan-50 dark:from-indigo-950/40 dark:to-cyan-950/30 text-[#4338CA] dark:text-cyan-200 hover:border-[#4338CA] transition-colors"
              >
                UPSC (Prelims &amp; Mains)
              </button>
            )}
            {availableExams
              .filter((e) => e.isCustom)
              .map((ce) => (
                <button
                  key={ce.id}
                  type="button"
                  onClick={() => selectShortcutExam(ce.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-colors ${
                    selectedExam?.id === ce.id
                      ? 'bg-orange-600 text-white border-orange-600'
                      : 'border-orange-200 dark:border-orange-900 bg-orange-50/70 dark:bg-orange-950/30 text-orange-800 dark:text-orange-200'
                  }`}
                >
                  {ce.name} (Admin)
                </button>
              ))}
          </div>

          {/* Cascading Selectors: Category -> Examination -> Class -> Subject */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Category
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => {
                  const cat = e.target.value as ExamCategoryId;
                  if (cat === 'ugc-net' && onSelectUgcNet) {
                    onSelectUgcNet();
                    return;
                  }
                  if (cat === 'upsc' && onSelectUpsc) {
                    onSelectUpsc();
                    return;
                  }
                  setSelectedCategory(cat);
                  const first = availableExams.find((ex) => ex.category === cat);
                  if (first) selectShortcutExam(first.id);
                }}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              >
                {EXAM_CATEGORIES.filter((c) => c.id !== 'combined').map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Examination
              </label>
              <select
                value={selectedExam?.id || ''}
                onChange={(e) => selectShortcutExam(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              >
                {categoryExams.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Class / Year / Paper
              </label>
              <select
                value={selectedClassObj?.id || ''}
                onChange={(e) => {
                  const cId = e.target.value;
                  setSelectedClassId(cId);
                  const cls = selectedExam?.classesOrPapers.find((c) => c.id === cId);
                  if (cls && cls.subjects[0]) {
                    setSelectedSubjectName(cls.subjects[0].name);
                    setLanguage(
                      resolveDefaultLanguageForSelection(
                        selectedExam,
                        cls.subjects[0].name,
                        settings.language,
                      ),
                    );
                  }
                }}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              >
                {(selectedExam?.classesOrPapers || []).map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Subject ({availableSubjects.length})
              </label>
              <select
                value={selectedSubjectObj?.name || ''}
                onChange={(e) => {
                  const sName = e.target.value;
                  setSelectedSubjectName(sName);
                  setLanguage(
                    resolveDefaultLanguageForSelection(
                      selectedExam,
                      sName,
                      settings.language,
                      language,
                    ),
                  );
                }}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              >
                {availableSubjects.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* CBSE Class 10 / 12 & Medium Quick Selector (Published Syllabus Source of Truth) */}
          {selectedExam?.id === 'cbse-board' && (
            <div className="p-3.5 rounded-xl border border-blue-200 dark:border-blue-900/70 bg-blue-50/70 dark:bg-blue-950/25 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-blue-900 dark:text-blue-200">
                  CBSE Class &amp; Medium:
                </span>
                <div className="inline-flex rounded-lg border border-blue-200 dark:border-blue-800 bg-white dark:bg-slate-900 p-0.5">
                  {selectedExam.classesOrPapers.map((cls) => (
                    <button
                      key={cls.id}
                      type="button"
                      onClick={() => {
                        setSelectedClassId(cls.id);
                        if (cls.subjects[0]) {
                          setSelectedSubjectName(cls.subjects[0].name);
                          setLanguage((prev) =>
                            resolveDefaultLanguageForSelection(
                              selectedExam,
                              cls.subjects[0].name,
                              settings.language,
                              prev,
                            ),
                          );
                        }
                      }}
                      className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                        selectedClassObj?.id === cls.id
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {cls.label.replace(/\s*\([^)]*\)/, '')} ({cls.subjects.length} Subjects)
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Medium:
                </span>
                {(
                  [
                    ['english', 'English Medium'],
                    ['hindi', 'Hindi Medium (हिन्दी)'],
                  ] as const
                ).map(([lid, lbl]) => (
                  <button
                    key={lid}
                    type="button"
                    onClick={() => setLanguage(lid)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                      language === lid
                        ? 'bg-violet-600 text-white border-violet-600'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Chapter & Topic Selection */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200">
                <Layers className="w-4 h-4 text-violet-600" />
                <span>Chapter &amp; Topic Scope ({selectedSubjectObj?.name})</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setChapterScope('all');
                    setSelectedTopic('All Chapter Topics');
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    chapterScope === 'all'
                      ? 'bg-violet-600 text-white border-violet-600'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  All Chapters ({examinableChapters.length})
                </button>
                <button
                  type="button"
                  onClick={() => setChapterScope('selected')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    chapterScope === 'selected'
                      ? 'bg-violet-600 text-white border-violet-600'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  Select Chapter / Topic
                </button>
              </div>
            </div>

            {chapterScope === 'selected' && examinableChapters.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Chapter(s) — Click to toggle
                  </label>
                  <div className="max-h-40 overflow-y-auto space-y-1 p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                    {examinableChapters.map((ch) => {
                      const checked = selectedChapters.includes(ch.name);
                      return (
                        <label
                          key={ch.name}
                          className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer text-xs"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setSelectedChapters((prev) => {
                                const next = e.target.checked
                                  ? Array.from(new Set([...prev, ch.name]))
                                  : prev.filter((c) => c !== ch.name);
                                return next.length > 0 ? next : [ch.name];
                              });
                              setSelectedTopic('All Chapter Topics');
                            }}
                            className="accent-violet-600 w-3.5 h-3.5"
                          />
                          <span className="truncate font-medium text-slate-800 dark:text-slate-200">
                            {ch.name}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Specific Topic (Optional)
                  </label>
                  <select
                    value={selectedTopic}
                    onChange={(e) => setSelectedTopic(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                  >
                    <option value="All Chapter Topics">All Topics in Selected Chapter(s)</option>
                    {Array.from(
                      new Set(
                        examinableChapters
                          .filter((c) => selectedChapters.includes(c.name))
                          .flatMap((c) => [...(c.topics || []), ...(c.subtopics || [])]),
                      ),
                    ).map((tp, idx) => (
                      <option key={`${tp}-${idx}`} value={tp}>
                        {tp}
                      </option>
                    ))}
                  </select>
                  {activeChapterObj?.term && (
                    <div className="text-[11px] text-slate-500">
                      Portion: {activeChapterObj.term} {activeChapterObj.assessment ? `(${activeChapterObj.assessment})` : ''}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Official Syllabus PDF & Admin Uploaded Reference Strip */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
              <div className="flex flex-wrap items-center gap-3">
                {selectedExam?.officialSyllabusPdfUrl && (
                  <a
                    href={selectedExam.officialSyllabusPdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-violet-700 dark:text-violet-300 font-semibold hover:underline"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Official Syllabus: {selectedExam.officialSyllabusPdfName}</span>
                  </a>
                )}
                {selectedSubjectObj?.prescribedBooks && (
                  <span className="text-slate-500 dark:text-slate-400">
                    Textbooks: <strong>{selectedSubjectObj.prescribedBooks.join(', ')}</strong>
                  </span>
                )}
              </div>

              {matchingPdfs.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500">Admin PDF Ref:</span>
                  <select
                    value={activePdfRef?.id || ''}
                    onChange={(e) => setSelectedSyllabusPdfId(e.target.value)}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                  >
                    {matchingPdfs.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.fileName} ({p.subject})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 2. CHOOSE QUESTION TYPES + MARKS + COUNTS */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <SlidersHorizontal className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                <span>2. Choose Question Types, Counts &amp; Marks</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Showing {suitableFormats.length} question formats suited for{' '}
                <strong>{selectedExam?.name}</strong> · <strong>{selectedSubjectObj?.name}</strong>.
              </p>
            </div>

            {/* Live Blueprint Summary Pill-free Status Bar */}
            <div className="flex flex-wrap items-center gap-3 px-4 py-2 rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50/70 dark:bg-violet-950/30 text-xs">
              <div>
                <span className="text-slate-600 dark:text-slate-400">Selected Types: </span>
                <strong className="text-violet-800 dark:text-violet-200 tabular-nums">
                  {activeSectionsPlan.length}
                </strong>
              </div>
              <span className="text-slate-300 dark:text-slate-700">|</span>
              <div>
                <span className="text-slate-600 dark:text-slate-400">Total Questions: </span>
                <strong className="text-violet-800 dark:text-violet-200 tabular-nums">
                  {totalQuestions}
                </strong>
              </div>
              <span className="text-slate-300 dark:text-slate-700">|</span>
              <div>
                <span className="text-slate-600 dark:text-slate-400">Total Marks: </span>
                <strong className="text-emerald-700 dark:text-emerald-300 tabular-nums">
                  {totalMarks}
                </strong>
              </div>
            </div>
          </div>

          {/* Total Question Count Quick Presets */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200 mr-1">
                Quick Total Question Presets:
              </span>
              {([10, 25, 50, 100, 'custom'] as const).map((p) => (
                <button
                  key={String(p)}
                  type="button"
                  onClick={() => {
                    setPresetTarget(p);
                    if (p !== 'custom') applyTotalCountDistribution(p);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    presetTarget === p
                      ? 'bg-violet-600 text-white border-violet-600'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-violet-400'
                  }`}
                >
                  {p === 'custom' ? 'Custom Count' : `${p} Qs`}
                </button>
              ))}
              {presetTarget === 'custom' && (
                <div className="inline-flex items-center gap-1.5 ml-1">
                  <input
                    type="number"
                    min={1}
                    max={150}
                    value={customTargetInput}
                    onChange={(e) => setCustomTargetInput(Number(e.target.value) || 10)}
                    className="w-20 px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs tabular-nums"
                  />
                  <button
                    type="button"
                    onClick={() => applyTotalCountDistribution(customTargetInput)}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 dark:bg-slate-700 text-white text-xs font-semibold"
                  >
                    Distribute
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => {
                  setTypeConfigs((prev) => {
                    const next = { ...prev };
                    for (const f of suitableFormats) {
                      next[f.id] = { ...next[f.id], enabled: true };
                    }
                    return next;
                  });
                }}
                className="text-violet-700 dark:text-violet-300 font-semibold hover:underline"
              >
                Check All Suitable
              </button>
              <span className="text-slate-300">·</span>
              <button
                type="button"
                onClick={() => {
                  setTypeConfigs((prev) => {
                    const next = { ...prev };
                    for (const f of suitableFormats) {
                      next[f.id] = {
                        ...next[f.id],
                        enabled: DEFAULT_ENABLED_TYPES.includes(f.id),
                      };
                    }
                    return next;
                  });
                }}
                className="text-slate-600 dark:text-slate-400 font-semibold hover:underline"
              >
                Reset Balanced Blueprint
              </button>
            </div>
          </div>

          {/* 16 Suitable Question Formats Checkbox Grid with Count & Marks per Type */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {suitableFormats.map((fmt) => {
              const cfg = typeConfigs[fmt.id] || {
                enabled: false,
                count: fmt.defaultCount,
                marks: fmt.defaultMarks,
              };
              const subTotal = cfg.enabled ? Number((cfg.count * cfg.marks).toFixed(2)) : 0;

              return (
                <div
                  key={fmt.id}
                  className={`rounded-xl border p-3.5 transition-all flex flex-col justify-between gap-2.5 ${
                    cfg.enabled
                      ? 'border-violet-500 bg-violet-50/45 dark:bg-violet-950/25 ring-1 ring-violet-400/40'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 hover:border-slate-300'
                  }`}
                >
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cfg.enabled}
                      onChange={(e) => {
                        setPresetTarget('custom');
                        setTypeConfigs((prev) => ({
                          ...prev,
                          [fmt.id]: { ...cfg, enabled: e.target.checked },
                        }));
                      }}
                      className="accent-violet-600 w-4 h-4 mt-0.5 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-snug">
                        {getFormatLocalizedLabel(fmt, language)}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {fmt.shortDesc}
                      </div>
                    </div>
                  </label>

                  {cfg.enabled && (
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-violet-200/60 dark:border-violet-900/50 text-xs">
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1.5">
                          <span className="font-semibold text-slate-600 dark:text-slate-300">
                            Qs:
                          </span>
                          <input
                            type="number"
                            min={1}
                            max={50}
                            value={cfg.count}
                            onChange={(e) => {
                              setPresetTarget('custom');
                              setTypeConfigs((prev) => ({
                                ...prev,
                                [fmt.id]: {
                                  ...cfg,
                                  count: Math.max(1, Math.min(50, Number(e.target.value) || 1)),
                                },
                              }));
                            }}
                            className="w-16 px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 tabular-nums font-semibold"
                          />
                        </label>
                        <label className="flex items-center gap-1.5">
                          <span className="font-semibold text-slate-600 dark:text-slate-300">
                            Marks/Q:
                          </span>
                          <input
                            type="number"
                            min={0.5}
                            max={20}
                            step={0.5}
                            value={cfg.marks}
                            onChange={(e) =>
                              setTypeConfigs((prev) => ({
                                ...prev,
                                [fmt.id]: {
                                  ...cfg,
                                  marks: Math.max(0.5, Number(e.target.value) || 1),
                                },
                              }))
                            }
                            className="w-16 px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 tabular-nums font-semibold"
                          />
                        </label>
                      </div>
                      <span className="font-bold text-violet-700 dark:text-violet-300 tabular-nums">
                        = {subTotal} Marks
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 3. DIFFICULTY, LANGUAGE, DURATION & GENERATE */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Medium / Paper Language
              </label>
              <div className={`grid gap-1.5 ${selectedExam?.id === 'cbse-board' ? 'grid-cols-2' : 'grid-cols-3'}`}>
                {(
                  selectedExam?.id === 'cbse-board'
                    ? ([
                        ['english', 'English Medium'],
                        ['hindi', 'हिन्दी Medium'],
                      ] as const)
                    : ([
                        ['english', 'English Medium'],
                        ['hindi', 'हिन्दी Medium'],
                        ['odia', 'ଓଡ଼ିଆ Medium'],
                      ] as const)
                ).map(([lid, lbl]) => (
                  <button
                    key={lid}
                    type="button"
                    onClick={() => setLanguage(lid)}
                    className={`py-2.5 px-1.5 rounded-xl text-xs font-bold border transition-colors ${
                      language === lid
                        ? 'bg-violet-600 text-white border-violet-600'
                        : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Exam Duration (Minutes)
              </label>
              <input
                type="number"
                min={10}
                max={240}
                step={5}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value) || 60)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm tabular-nums"
              />
            </div>
          </div>

          {errorMsg && (
            <div className="p-3.5 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />
              <span>
                AI-generated practice paper grounded strictly in {selectedExam?.name} ·{' '}
                {selectedSubjectObj?.name} ({language.toUpperCase()}).
              </span>
            </div>

            <button
              type="button"
              disabled={generating || activeSectionsPlan.length === 0}
              onClick={() => void handleGeneratePaper()}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-bold shadow-xs transition-colors"
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{genProgress || 'Generating Structured Exam Paper...'}</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>
                    Generate Question Paper ({totalQuestions} Qs · {totalMarks} Marks)
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* GENERATED EXAM PAPER WORKSPACE */}
      {paper && (
        <div className="space-y-4">
          {/* Answer / Explanation & 6 Download/Print/Copy Controls */}
          <div className="no-print rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Separate Show/Hide Answers & Show/Hide Explanations */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAnswers((v) => !v)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition-colors ${
                    showAnswers
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {showAnswers ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>{showAnswers ? 'Hide Answers' : 'Show Answers'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowExplanations((v) => !v)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition-colors ${
                    showExplanations
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {showExplanations ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>{showExplanations ? 'Hide Explanations' : 'Show Explanations'}</span>
                </button>
              </div>

              {/* 6 Download, Print, Copy & Regenerate Controls */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={pdfBusy}
                  onClick={() => void handlePdfExport('paper-only')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Question Paper PDF</span>
                </button>
                <button
                  type="button"
                  disabled={pdfBusy}
                  onClick={() => void handlePdfExport('answer-key')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Answer Key PDF</span>
                </button>
                <button
                  type="button"
                  disabled={pdfBusy}
                  onClick={() => void handlePdfExport('complete')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Complete Paper with Answers</span>
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Question Paper</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopyAllQuestions()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied!' : 'Copy Questions'}</span>
                </button>
                <button
                  type="button"
                  disabled={generating}
                  onClick={() => void handleGeneratePaper()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-orange-300 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/30 text-orange-800 dark:text-orange-200 text-xs font-semibold hover:bg-orange-100"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${generating ? 'animate-spin' : ''}`} />
                  <span>Generate Another Paper</span>
                </button>
              </div>
            </div>
          </div>

          {/* PRINTABLE PROFESSIONAL EXAM PAPER SHEET */}
          {(() => {
            const isHiPaper = paper.language === 'hindi';
            return (
          <div className="print-paper-surface rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 md:p-8 space-y-6 shadow-sm">
            {/* Official Exam Header Banner */}
            <div className="border-b-2 border-slate-900 dark:border-slate-200 pb-4 space-y-2 text-center">
              <div className="text-xs font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300">
                {paper.examName} · {isHiPaper ? 'AI-निर्मित अभ्यास प्रश्न-पत्र' : 'AI-Generated Practice Examination Paper'}
              </div>
              <h2 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white">
                {paper.title}
              </h2>
              <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-xs md:text-sm text-slate-700 dark:text-slate-300 font-medium">
                <span><strong>{isHiPaper ? 'कक्षा / पेपर:' : 'Class / Paper:'}</strong> {paper.classLabel}</span>
                <span>
                  <strong>{isHiPaper ? 'माध्यम:' : 'Medium:'}</strong>{' '}
                  {paper.language === 'english'
                    ? 'English Medium'
                    : paper.language === 'hindi'
                      ? 'हिन्दी माध्यम (Hindi Medium)'
                      : 'Odia Medium'}
                </span>
                <span><strong>{isHiPaper ? 'विषय:' : 'Subject:'}</strong> {paper.subject}</span>
                <span><strong>{isHiPaper ? 'अध्याय:' : 'Chapter:'}</strong> {paper.chapter}</span>
                {paper.topic !== 'Complete Subject Syllabus' && (
                  <span><strong>{isHiPaper ? 'प्रकरण:' : 'Topic:'}</strong> {paper.topic}</span>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-xs md:text-sm font-bold text-slate-900 dark:text-slate-100 border-t border-slate-200 dark:border-slate-700 mt-2">
                <span>{isHiPaper ? `निर्धारित समय: ${paper.durationMinutes} मिनट` : `Time Allowed: ${paper.durationMinutes} Minutes`}</span>
                <span>{isHiPaper ? `कुल प्रश्न: ${paper.totalQuestions}` : `Total Questions: ${paper.totalQuestions}`}</span>
                <span>{isHiPaper ? `कठिनाई स्तर: ${paper.difficulty}` : `Difficulty: ${paper.difficulty}`}</span>
                <span>{isHiPaper ? `अधिकतम अंक: ${paper.totalMarks}` : `Maximum Marks: ${paper.totalMarks}`}</span>
              </div>
            </div>

            {/* General Instructions */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-1.5">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200">
                {isHiPaper ? 'सामान्य निर्देश' : 'General Instructions'}
              </div>
              <ul className="list-disc pl-5 space-y-1 text-xs md:text-sm text-slate-600 dark:text-slate-300">
                {paper.instructions.map((inst, i) => (
                  <li key={i}>{inst}</li>
                ))}
              </ul>
            </div>

            {/* Section-wise Question Blocks */}
            <div className="space-y-8">
              {paper.sections.map((sec) => (
                <section key={sec.sectionCode} className="space-y-4">
                  <div className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm md:text-base font-bold text-slate-900 dark:text-white">
                      {sec.sectionTitle}
                    </h3>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 tabular-nums">
                      {sec.questions.length} {isHiPaper ? 'प्रश्न' : 'Qs'} × {sec.marksPerQuestion} = {sec.totalSectionMarks} {isHiPaper ? 'अंक' : 'Marks'}
                    </span>
                  </div>

                  <div className="space-y-5">
                    {sec.questions.map((q) => (
                      <div
                        key={q.number}
                        className="print-avoid-break rounded-xl border border-slate-200 dark:border-slate-800 p-4 md:p-5 space-y-3"
                      >
                        {/* Passage or Case Study Box */}
                        {q.passageOrCase && (
                          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs md:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                            <div className="font-bold text-slate-900 dark:text-slate-100 mb-1">
                              {q.typeId === 'Case-Based'
                                ? isHiPaper ? 'प्रकरण-आधारित गद्यांश (केस स्टडी):' : 'Case Study:'
                                : isHiPaper ? 'अपठित / पठित गद्यांश:' : 'Reading Passage:'}
                            </div>
                            <MarkdownRenderer content={q.passageOrCase} />
                          </div>
                        )}

                        {/* Diagram Reference Box */}
                        {q.diagramDescription && (
                          <div className="p-3.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 text-xs md:text-sm text-blue-900 dark:text-blue-200">
                            <div className="font-bold mb-1">
                              {isHiPaper ? 'आरेख / चित्र संदर्भ:' : 'Diagram / Figure Reference:'}
                            </div>
                            <MarkdownRenderer content={q.diagramDescription} />
                          </div>
                        )}

                        {/* Question Stem & Marks */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="text-sm md:text-base font-semibold text-slate-900 dark:text-white flex-1 leading-relaxed">
                            <span className="font-bold mr-1.5">
                              {isHiPaper ? `प्र. ${q.number}.` : `Q${q.number}.`}
                            </span>
                            <MarkdownRenderer content={q.question} className="inline" />
                          </div>
                          <div className="shrink-0 text-right text-xs font-bold text-slate-600 dark:text-slate-300 tabular-nums">
                            [{q.marks} {isHiPaper ? 'अंक' : q.marks === 1 ? 'Mark' : 'Marks'}]
                            {q.wordLimit && (
                              <div className="text-[11px] font-normal text-slate-400">
                                {q.wordLimit}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Assertion & Reason Statements */}
                        {(q.assertionText || q.reasonText) && (
                          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5 text-xs md:text-sm">
                            {q.assertionText && (
                              <div>
                                <strong>{isHiPaper ? 'कथन (A):' : 'Assertion (A):'}</strong>{' '}
                                <MarkdownRenderer content={q.assertionText} className="inline" />
                              </div>
                            )}
                            {q.reasonText && (
                              <div>
                                <strong>{isHiPaper ? 'कारण (R):' : 'Reason (R):'}</strong>{' '}
                                <MarkdownRenderer content={q.reasonText} className="inline" />
                              </div>
                            )}
                          </div>
                        )}

                        {/* Match the Following 2-Column Table */}
                        {q.matchColumns && (
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs md:text-sm border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                              <thead className="bg-slate-100 dark:bg-slate-800">
                                <tr>
                                  <th className="px-3 py-2 text-left font-bold border-r border-slate-200 dark:border-slate-700">
                                    {isHiPaper ? 'स्तंभ क (Column A)' : 'Column A'}
                                  </th>
                                  <th className="px-3 py-2 text-left font-bold">
                                    {isHiPaper ? 'स्तंभ ख (Column B)' : 'Column B'}
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {Array.from({
                                  length: Math.max(
                                    q.matchColumns.columnA.length,
                                    q.matchColumns.columnB.length,
                                  ),
                                }).map((_, rIdx) => (
                                  <tr
                                    key={rIdx}
                                    className="border-t border-slate-200 dark:border-slate-800"
                                  >
                                    <td className="px-3 py-2 border-r border-slate-200 dark:border-slate-700">
                                      {q.matchColumns!.columnA[rIdx]
                                        ? `${rIdx + 1}. ${q.matchColumns!.columnA[rIdx]}`
                                        : ''}
                                    </td>
                                    <td className="px-3 py-2">
                                      {q.matchColumns!.columnB[rIdx]
                                        ? `(${String.fromCharCode(65 + rIdx)}) ${q.matchColumns!.columnB[rIdx]}`
                                        : ''}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {/* Sequence / Arrange in Order Items */}
                        {q.sequenceItems && q.sequenceItems.length > 0 && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {q.sequenceItems.map((it, idx) => (
                              <div
                                key={idx}
                                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs md:text-sm"
                              >
                                <strong className="mr-1.5">({idx + 1})</strong>
                                <MarkdownRenderer content={it} className="inline" />
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Options (MCQ, MSQ, True/False, Assertion-Reason, Match Codes) */}
                        {q.options && q.options.length > 0 && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {q.options.map((opt, oIdx) => {
                              const isCorrectOpt =
                                showAnswers &&
                                q.correctOptionIndices?.includes(oIdx);
                              return (
                                <div
                                  key={oIdx}
                                  className={`p-2.5 rounded-xl border text-xs md:text-sm flex items-start gap-2 ${
                                    isCorrectOpt
                                      ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/30 font-semibold text-emerald-900 dark:text-emerald-100'
                                      : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950 text-slate-800 dark:text-slate-200'
                                  }`}
                                >
                                  <span className="font-bold shrink-0">
                                    ({String.fromCharCode(65 + oIdx)})
                                  </span>
                                  <MarkdownRenderer content={opt} />
                                  {isCorrectOpt && (
                                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 ml-auto mt-0.5" />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Answer & Explanation Block */}
                        {(showAnswers || showExplanations) && (
                          <div className="p-3.5 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/70 text-xs md:text-sm space-y-2">
                            {showAnswers && (
                              <div className="space-y-1.5">
                                <div className="font-bold text-emerald-800 dark:text-emerald-300">
                                  {q.typeId === 'Multiple-Select' && q.correctOptionIndices?.length
                                    ? isHiPaper
                                      ? `सही विकल्प (${q.correctOptionIndices.map((i) => String.fromCharCode(65 + i)).join(', ')}): `
                                      : `Correct Options (${q.correctOptionIndices.map((i) => String.fromCharCode(65 + i)).join(', ')}): `
                                    : q.typeId === 'Short-Answer' ||
                                        q.typeId === 'Long-Answer' ||
                                        q.typeId === 'Descriptive' ||
                                        q.typeId === 'Very-Short'
                                      ? isHiPaper
                                        ? 'आदर्श उत्तर (अन्य सही अभिव्यक्ति भी मान्य): '
                                        : 'Sample Answer (alternative accurate phrasing accepted): '
                                      : isHiPaper
                                        ? 'उत्तर: '
                                        : 'Answer: '}
                                  <span className="font-medium text-slate-900 dark:text-slate-100">
                                    <MarkdownRenderer content={q.correctAnswer} className="inline" />
                                  </span>
                                </div>

                                {q.keyPoints && q.keyPoints.length > 0 && (
                                  <div className="text-slate-700 dark:text-slate-300">
                                    <span className="font-semibold">
                                      {isHiPaper ? 'मुख्य मूल्यांकन बिंदु:' : 'Key Evaluation Points:'}
                                    </span>
                                    <ul className="list-disc pl-5 mt-0.5 space-y-0.5">
                                      {q.keyPoints.map((kp, kIdx) => (
                                        <li key={kIdx}>
                                          <MarkdownRenderer content={kp} className="inline" />
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            )}

                            {showExplanations && q.explanation && (
                              <div className="text-slate-700 dark:text-slate-300 pt-1 border-t border-emerald-200/70 dark:border-emerald-900/50">
                                <span className="font-semibold text-blue-800 dark:text-blue-300">
                                  {isHiPaper ? 'व्याख्या: ' : 'Explanation: '}
                                </span>
                                <MarkdownRenderer content={q.explanation} className="inline" />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
            );
          })()}
        </div>
      )}

      <SyllabusManagerModal
        isOpen={syllabusModalOpen}
        onClose={() => setSyllabusModalOpen(false)}
        exams={exams}
        syllabusPdfs={syllabusPdfs}
        onAddCustomExam={(exam) => {
          onAddCustomExam(exam);
          selectShortcutExam(exam.id);
        }}
        onUpdateExam={onUpdateExam}
        onAddChapterOrTopic={onAddChapterOrTopic}
        onAddSyllabusPdf={(ref) => {
          onAddSyllabusPdf(ref);
          setSelectedSyllabusPdfId(ref.id);
        }}
        onRemoveSyllabusPdf={(id) => {
          if (selectedSyllabusPdfId === id) setSelectedSyllabusPdfId('');
          onRemoveSyllabusPdf(id);
        }}
      />
    </div>
  );
};
