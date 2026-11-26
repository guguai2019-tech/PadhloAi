import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Check,
  ClipboardList,
  Copy,
  Download,
  Eye,
  EyeOff,
  HelpCircle,
  Landmark,
  Loader2,
  Paperclip,
  Sparkles,
} from 'lucide-react';
import type {
  AppSettings,
  ExamDefinition,
  GeneratedQuestionItem,
  GeneratorQuestionFormat,
  MockLanguage,
  SyllabusPdfReference,
  UgcNetPublicCatalogResponse,
  UpscPublicCatalogResponse,
} from '../types';
import { BUILTIN_EXAMS } from '../data/examCatalog';
import { generateAI, parseSafeJson } from '../utils/aiClient';
import { processUploadedFile } from '../utils/fileProcessor';
import { exportTextToPdf } from '../utils/pdfExport';
import { AdvancedQuestionPaperGenerator } from './AdvancedQuestionPaperGenerator';
import { CbseHindiPaperStudio } from './CbseHindiPaperStudio';
import { UgcNetQuestionStudio } from './UgcNetQuestionStudio';
import { UpscQuestionStudio } from './UpscQuestionStudio';
import { MarkdownRenderer } from './MarkdownRenderer';

interface QuestionGeneratorProps {
  settings: AppSettings;
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

const QUESTION_FORMATS: GeneratorQuestionFormat[] = [
  'MCQs',
  'Short Questions',
  'Long Questions',
  'True or False',
  'Fill in the Blanks',
  'Assertion and Reasoning',
  'Interview Questions',
  'Competitive Exam Questions',
];

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    questions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          number: { type: 'INTEGER' },
          type: { type: 'STRING' },
          question: { type: 'STRING' },
          options: { type: 'ARRAY', items: { type: 'STRING' } },
          answer: { type: 'STRING' },
          explanation: { type: 'STRING' },
          marks: { type: 'STRING' },
        },
        required: ['question', 'answer', 'explanation'],
      },
    },
  },
  required: ['questions'],
};

export const QuestionGenerator: React.FC<QuestionGeneratorProps> = ({
  settings,
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
  const [generatorMode, setGeneratorMode] = useState<'paper-builder' | 'cbse-hindi' | 'ugc-net' | 'upsc' | 'general'>(
    'paper-builder',
  );
  const [localExams, setLocalExams] = useState<ExamDefinition[]>(BUILTIN_EXAMS);
  const [localPdfs, setLocalPdfs] = useState<SyllabusPdfReference[]>([]);

  const exams = useMemo(() => sharedExams || localExams, [sharedExams, localExams]);
  const syllabusPdfs = useMemo(
    () => sharedSyllabusPdfs || localPdfs,
    [sharedSyllabusPdfs, localPdfs],
  );

  const [format, setFormat] = useState<GeneratorQuestionFormat>('MCQs');
  const [selectedExamId, setSelectedExamId] = useState<string>(exams[0]?.id || '');
  const [selectedClassId, setSelectedClassId] = useState<string>(
    exams[0]?.classesOrPapers[0]?.id || '',
  );
  const [subject, setSubject] = useState<string>(
    exams[0]?.classesOrPapers[0]?.subjects[0]?.name || 'General',
  );
  const [chapter, setChapter] = useState<string>(
    exams[0]?.classesOrPapers[0]?.subjects[0]?.chapters[0]?.name || '',
  );
  const [topic, setTopic] = useState<string>(
    exams[0]?.classesOrPapers[0]?.subjects[0]?.chapters[0]?.topics[0] || '',
  );
  const [customTopicOverride, setCustomTopicOverride] = useState<string>('');
  const [mediumLanguage, setMediumLanguage] = useState<MockLanguage>(() =>
    settings.language === 'hindi' || settings.language === 'odia' ? settings.language : 'english',
  );
  const [difficulty, setDifficulty] = useState('Medium');
  const [count, setCount] = useState(10);
  const [customInstructions, setCustomInstructions] = useState('');
  const [sourceContext, setSourceContext] = useState('');
  const [sourceFileName, setSourceFileName] = useState('');

  const selectedExamObj = useMemo(
    () => exams.find((e) => e.id === selectedExamId) || exams[0],
    [exams, selectedExamId],
  );
  const selectedClassObj = useMemo(
    () =>
      selectedExamObj?.classesOrPapers.find((c) => c.id === selectedClassId) ||
      selectedExamObj?.classesOrPapers[0],
    [selectedExamObj, selectedClassId],
  );
  const selectedSubjectObj = useMemo(
    () =>
      selectedClassObj?.subjects.find((s) => s.name === subject) ||
      selectedClassObj?.subjects[0],
    [selectedClassObj, subject],
  );
  const selectedChapterObj = useMemo(
    () =>
      selectedSubjectObj?.chapters.find((c) => c.name === chapter) ||
      selectedSubjectObj?.chapters[0],
    [selectedSubjectObj, chapter],
  );
  const availableTopics = useMemo(
    () =>
      Array.from(
        new Set([
          ...(selectedChapterObj?.topics || []),
          ...(selectedChapterObj?.subtopics || []),
        ]),
      ),
    [selectedChapterObj],
  );

  // Sync cascading Quick Topic Bank dropdowns whenever centralized exams update
  useEffect(() => {
    if (selectedExamObj && selectedExamObj.id !== selectedExamId) {
      setSelectedExamId(selectedExamObj.id);
    }
    if (selectedClassObj && selectedClassObj.id !== selectedClassId) {
      setSelectedClassId(selectedClassObj.id);
    }
    if (selectedSubjectObj && selectedSubjectObj.name !== subject) {
      setSubject(selectedSubjectObj.name);
    }
    if (selectedChapterObj && selectedChapterObj.name !== chapter) {
      setChapter(selectedChapterObj.name);
    }
    if (availableTopics.length > 0 && !availableTopics.includes(topic)) {
      setTopic(availableTopics[0]);
    } else if (availableTopics.length === 0 && selectedChapterObj && topic !== selectedChapterObj.name) {
      setTopic(selectedChapterObj.name);
    }
  }, [
    exams,
    selectedExamObj,
    selectedExamId,
    selectedClassObj,
    selectedClassId,
    selectedSubjectObj,
    subject,
    selectedChapterObj,
    chapter,
    availableTopics,
    topic,
  ]);

  const [questions, setQuestions] = useState<GeneratedQuestionItem[]>([]);
  const [showAnswers, setShowAnswers] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleFileAttach = async (file: File) => {
    const att = await processUploadedFile(file);
    if (att.status === 'error') {
      setErrorMsg(att.errorMessage || 'Could not process file.');
      return;
    }
    if (att.extractedText) {
      setSourceContext(att.extractedText.slice(0, 40000));
      setSourceFileName(att.name);
      setErrorMsg(null);
    }
  };

  const resolvedTopic = customTopicOverride.trim() || topic || chapter;
  const resolvedClassLevel = selectedExamObj
    ? `${selectedExamObj.name}${selectedClassObj ? ` — ${selectedClassObj.label}` : ''}`
    : 'General';

  const handleGenerate = async () => {
    if (!resolvedTopic.trim() && !sourceContext.trim()) {
      setErrorMsg('Select a syllabus topic or upload study material.');
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    const safeCount = Math.max(1, Math.min(40, count));

    const subjLang = selectedSubjectObj?.subjectLanguage;
    const isLiteratureSubject = Boolean(
      subjLang &&
        ((mediumLanguage === 'english' && subjLang !== 'English') ||
          (mediumLanguage === 'hindi' && subjLang !== 'Hindi') ||
          (mediumLanguage === 'odia' && subjLang !== 'Odia')),
    );

    const mediumLabel =
      mediumLanguage === 'english'
        ? isLiteratureSubject
          ? `English Medium (Preserve ${subjLang} reading/literature examples where essential; write all instructions, questions, answers, and explanations strictly in clear Academic English)`
          : 'English Medium (STRICT: Write 100% of every question, option, answer, and explanation strictly in clear Academic English. NEVER mix Hindi words, Devanagari script, or Hinglish anywhere)'
        : mediumLanguage === 'hindi'
          ? isLiteratureSubject
            ? `Hindi Medium (Preserve ${subjLang} reading/literature quotes where essential; write all instructions, questions, answers, and explanations strictly in pure Devanagari Hindi)`
            : 'Hindi Medium (STRICT: Write 100% of every question, option, answer, and explanation strictly in pure Devanagari Hindi. NEVER mix English sentences or Hinglish anywhere)'
          : 'Odia Medium (STRICT: Write 100% of every question, option, answer, and explanation strictly in natural Odia Unicode script)';

    const prompt = `Generate exactly ${safeCount} ${format} for:
- Examination: ${selectedExamObj?.name || 'General'}
- Class / Level: ${resolvedClassLevel}
- Medium / Language: ${mediumLabel}
- Subject: ${selectedSubjectObj?.name || subject}
- Chapter: ${selectedChapterObj?.name || chapter}
- Topic: ${resolvedTopic}
- Difficulty: ${difficulty}
${customInstructions ? `- Custom Instructions: ${customInstructions}` : ''}
${sourceContext ? `\nBase questions strictly on this study material:\n${sourceContext.slice(0, 35000)}` : ''}

Return valid JSON matching the schema. Include options array for MCQs or Assertion-Reasoning; for other types, omit or keep options empty. Always provide accurate answers and clear explanations (using LaTeX $...$ for formulas).`;

    try {
      const res = await generateAI({
        provider: settings.provider,
        model: settings.model,
        language: mediumLanguage,
        prompt,
        responseMimeType: 'application/json',
        responseSchema: SCHEMA,
      });

      const parsed = parseSafeJson<{ questions: GeneratedQuestionItem[] }>(res.text);
      const list = (parsed.questions || []).map((q, idx) => ({
        ...q,
        number: idx + 1,
        type: q.type || format,
      }));
      setQuestions(list);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to generate questions.');
    } finally {
      setLoading(false);
    }
  };

  const formatExportMarkdown = () => {
    return questions
      .map((q) => {
        const opts =
          q.options && q.options.length > 0
            ? '\n' + q.options.map((o, i) => `   ${String.fromCharCode(65 + i)}. ${o}`).join('\n')
            : '';
        return `${q.number}. ${q.question}${opts}\n   Answer: ${q.answer}\n   Explanation: ${q.explanation}`;
      })
      .join('\n\n');
  };

  return (
    <div className="h-full overflow-y-auto px-4 md:px-8 py-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="no-print flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              AI Question Generation System
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Build structured board/competitive exam papers (16 formats), official CBSE Class 10 &amp; 12 Hindi papers, or quick topic question banks.
            </p>
          </div>

          <div className="inline-flex flex-wrap p-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 gap-1">
            <button
              type="button"
              onClick={() => setGeneratorMode('paper-builder')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-colors ${
                generatorMode === 'paper-builder'
                  ? 'bg-violet-600 text-white shadow-xs'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-800'
              }`}
            >
              <ClipboardList className="w-3.5 h-3.5" />
              <span>Exam Paper Builder (16 Formats)</span>
            </button>
            <button
              type="button"
              onClick={() => setGeneratorMode('cbse-hindi')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-colors ${
                generatorMode === 'cbse-hindi'
                  ? 'bg-orange-600 text-white shadow-xs'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-800'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>CBSE Hindi Studio (10 &amp; 12)</span>
            </button>
            <button
              type="button"
              onClick={() => setGeneratorMode('ugc-net')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-colors ${
                generatorMode === 'ugc-net'
                  ? 'bg-gradient-to-r from-[#4338CA] to-[#2563EB] text-white shadow-xs'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-800'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>UGC NET / JRF</span>
            </button>
            <button
              type="button"
              onClick={() => setGeneratorMode('upsc')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-colors ${
                generatorMode === 'upsc'
                  ? 'bg-gradient-to-r from-[#4338CA] to-[#2563EB] text-white shadow-xs'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-800'
              }`}
            >
              <Landmark className="w-3.5 h-3.5" />
              <span>UPSC (Prelims &amp; Mains)</span>
            </button>
            <button
              type="button"
              onClick={() => setGeneratorMode('general')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-colors ${
                generatorMode === 'general'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-800'
              }`}
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Quick Topic Bank (8 Formats)</span>
            </button>
          </div>
        </div>

        {generatorMode === 'paper-builder' ? (
          <AdvancedQuestionPaperGenerator
            settings={settings}
            exams={exams}
            syllabusPdfs={syllabusPdfs}
            onSelectUgcNet={() => setGeneratorMode('ugc-net')}
            onSelectUpsc={() => setGeneratorMode('upsc')}
            onAddCustomExam={(ex) => {
              if (onAddCustomExam) onAddCustomExam(ex);
              else setLocalExams((prev) => [...prev, ex]);
            }}
            onUpdateExam={(ex) => {
              if (onUpdateExam) onUpdateExam(ex);
              else setLocalExams((prev) => prev.map((x) => (x.id === ex.id ? ex : x)));
            }}
            onAddChapterOrTopic={(examId, classId, subj, chap, top) => {
              if (onAddChapterOrTopic) {
                onAddChapterOrTopic(examId, classId, subj, chap, top);
              }
            }}
            onAddSyllabusPdf={(ref) => {
              if (onAddSyllabusPdf) onAddSyllabusPdf(ref);
              else setLocalPdfs((prev) => [ref, ...prev]);
            }}
            onRemoveSyllabusPdf={(id) => {
              if (onRemoveSyllabusPdf) onRemoveSyllabusPdf(id);
              else setLocalPdfs((prev) => prev.filter((p) => p.id !== id));
            }}
          />
        ) : generatorMode === 'cbse-hindi' ? (
          <CbseHindiPaperStudio settings={settings} />
        ) : generatorMode === 'ugc-net' ? (
          <UgcNetQuestionStudio settings={settings} ugcNetCatalog={ugcNetCatalog} />
        ) : generatorMode === 'upsc' ? (
          <UpscQuestionStudio settings={settings} upscCatalog={upscCatalog} />
        ) : (
          <>
            {/* Format Tabs */}
        <div className="flex flex-wrap gap-2">
          {QUESTION_FORMATS.map((fmt) => (
            <button
              key={fmt}
              type="button"
              onClick={() => setFormat(fmt)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors ${
                format === fmt
                  ? 'bg-violet-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              {fmt}
            </button>
          ))}
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          {/* Quick Exam & CBSE English Medium Presets */}
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'cbse-board', classId: 'cbse-class-10', label: 'CBSE 10th (English Medium)', lang: 'english' as MockLanguage },
              { id: 'cbse-board', classId: 'cbse-class-12', label: 'CBSE 12th (English Medium)', lang: 'english' as MockLanguage },
              { id: 'bse-odisha', classId: 'bse-class-10', label: 'BSE Odisha (Class 10)', lang: 'odia' as MockLanguage },
              { id: 'chse-odisha-arts', label: 'CHSE +2 Arts', lang: 'english' as MockLanguage },
              { id: 'chse-odisha-science', label: 'CHSE +2 Science', lang: 'english' as MockLanguage },
              { id: 'opsc-oas', label: 'Competitive Exams', lang: 'english' as MockLanguage },
            ].map((sc) => {
              const active =
                selectedExamObj?.id === sc.id &&
                (!sc.classId || selectedClassObj?.id === sc.classId) &&
                (sc.id !== 'cbse-board' || mediumLanguage === sc.lang);
              return (
                <button
                  key={`${sc.id}-${sc.classId || 'def'}-${sc.lang}`}
                  type="button"
                  onClick={() => {
                    const ex = exams.find((x) => x.id === sc.id);
                    if (!ex) return;
                    setSelectedExamId(ex.id);
                    const cls =
                      (sc.classId ? ex.classesOrPapers.find((c) => c.id === sc.classId) : undefined) ||
                      ex.classesOrPapers[0];
                    setSelectedClassId(cls?.id || '');
                    const sub = cls?.subjects[0];
                    setSubject(sub?.name || '');
                    const ch = sub?.chapters[0];
                    setChapter(ch?.name || '');
                    setTopic(ch?.topics[0] || ch?.name || '');
                    setMediumLanguage(sc.lang);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                    active
                      ? 'bg-violet-600 text-white border-violet-600'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:border-violet-400'
                  }`}
                >
                  {sc.label}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Examination
              </label>
              <select
                value={selectedExamObj?.id || ''}
                onChange={(e) => {
                  const ex = exams.find((x) => x.id === e.target.value);
                  setSelectedExamId(e.target.value);
                  const cls = ex?.classesOrPapers[0];
                  setSelectedClassId(cls?.id || '');
                  const sub = cls?.subjects[0];
                  setSubject(sub?.name || '');
                  const ch = sub?.chapters[0];
                  setChapter(ch?.name || '');
                  setTopic(ch?.topics[0] || ch?.name || '');
                  if (ex?.id === 'cbse-board') {
                    if (sub?.subjectLanguage === 'Hindi') setMediumLanguage('hindi');
                    else if (sub?.subjectLanguage === 'English') setMediumLanguage('english');
                    else if (mediumLanguage === 'odia') setMediumLanguage('english');
                  } else if (ex?.id === 'bse-odisha') {
                    setMediumLanguage('odia');
                  }
                }}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              >
                {exams.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Class / Level
              </label>
              <select
                value={selectedClassObj?.id || ''}
                onChange={(e) => {
                  const cls = selectedExamObj?.classesOrPapers.find((c) => c.id === e.target.value);
                  setSelectedClassId(e.target.value);
                  const sub = cls?.subjects[0];
                  setSubject(sub?.name || '');
                  const ch = sub?.chapters[0];
                  setChapter(ch?.name || '');
                  setTopic(ch?.topics[0] || ch?.name || '');
                  if (selectedExamObj?.id === 'cbse-board') {
                    if (sub?.subjectLanguage === 'Hindi') setMediumLanguage('hindi');
                    else if (sub?.subjectLanguage === 'English') setMediumLanguage('english');
                    else if (mediumLanguage === 'odia') setMediumLanguage('english');
                  }
                }}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              >
                {(selectedExamObj?.classesOrPapers || []).map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Subject ({(selectedClassObj?.subjects || []).length})
              </label>
              <select
                value={selectedSubjectObj?.name || ''}
                onChange={(e) => {
                  const sub = selectedClassObj?.subjects.find((s) => s.name === e.target.value);
                  setSubject(e.target.value);
                  const ch = sub?.chapters[0];
                  setChapter(ch?.name || '');
                  setTopic(ch?.topics[0] || ch?.name || '');
                  if (selectedExamObj?.id === 'cbse-board') {
                    if (sub?.subjectLanguage === 'Hindi') setMediumLanguage('hindi');
                    else if (sub?.subjectLanguage === 'English') setMediumLanguage('english');
                    else if (mediumLanguage === 'odia') setMediumLanguage('english');
                  }
                }}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              >
                {(selectedClassObj?.subjects || []).map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Chapter / Unit
              </label>
              <select
                value={selectedChapterObj?.name || ''}
                onChange={(e) => {
                  const ch = selectedSubjectObj?.chapters.find((c) => c.name === e.target.value);
                  setChapter(e.target.value);
                  setTopic(ch?.topics[0] || ch?.name || '');
                }}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              >
                {(selectedSubjectObj?.chapters || []).map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Topic (From Centralized Syllabus)
              </label>
              <select
                value={topic}
                onChange={(e) => {
                  setTopic(e.target.value);
                  setCustomTopicOverride('');
                }}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              >
                {availableTopics.length > 0 ? (
                  availableTopics.map((tp) => (
                    <option key={tp} value={tp}>
                      {tp}
                    </option>
                  ))
                ) : (
                  <option value={selectedChapterObj?.name || ''}>
                    {selectedChapterObj?.name || 'All Chapter Topics'}
                  </option>
                )}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Custom Topic Focus (Optional)
              </label>
              <input
                type="text"
                value={customTopicOverride}
                onChange={(e) => setCustomTopicOverride(e.target.value)}
                placeholder="Override or refine topic..."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Medium / Language
              </label>
              <select
                value={
                  selectedExamObj?.id === 'cbse-board' && mediumLanguage === 'odia'
                    ? 'english'
                    : mediumLanguage
                }
                onChange={(e) => setMediumLanguage(e.target.value as MockLanguage)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              >
                <option value="english">English Medium</option>
                <option value="hindi">Hindi Medium (हिन्दी)</option>
                {selectedExamObj?.id !== 'cbse-board' && (
                  <option value="odia">Odia Medium (ଓଡ଼ିଆ)</option>
                )}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Difficulty
              </label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              >
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
                <option value="Mixed">Mixed</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Question Count (1–40)
              </label>
              <input
                type="number"
                min={1}
                max={40}
                value={count}
                onChange={(e) => setCount(Number(e.target.value) || 5)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm tabular-nums"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Custom Instructions (optional)
            </label>
            <input
              type="text"
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              placeholder="e.g. Focus on NCERT diagrams, include numericals, 5-mark rubric..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
                <Paperclip className="w-3.5 h-3.5 text-violet-600" />
                <span>{sourceFileName || 'Upload PDF / DOCX / TXT (Optional)'}</span>
                <input
                  type="file"
                  accept=".pdf,.docx,.txt,.md"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleFileAttach(f);
                    e.target.value = '';
                  }}
                />
              </label>
              {sourceFileName && (
                <button
                  type="button"
                  onClick={() => {
                    setSourceContext('');
                    setSourceFileName('');
                  }}
                  className="text-xs text-red-500 hover:underline"
                >
                  Clear file
                </button>
              )}
            </div>

            <button
              type="button"
              disabled={loading}
              onClick={() => void handleGenerate()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-semibold"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Generating {count} Questions...</span>
                </>
              ) : (
                <>
                  <HelpCircle className="w-4 h-4" />
                  <span>Generate {format}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3.5 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-sm text-red-700 dark:text-red-300">
            {errorMsg}
          </div>
        )}

        {questions.length > 0 && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm font-semibold tabular-nums">
                Generated {questions.length} {format}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAnswers((s) => !s)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium"
                >
                  {showAnswers ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>{showAnswers ? 'Hide Answer Key' : 'Show Answer Key'}</span>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(formatExportMarkdown());
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1800);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied' : 'Copy All'}</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    exportTextToPdf(
                      `${subject} — ${topic} (${format})`,
                      formatExportMarkdown(),
                      `${subject}_${format}_Questions.pdf`,
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-violet-600 text-white text-xs font-semibold"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download PDF</span>
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {questions.map((q) => (
                <div
                  key={q.number}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3"
                >
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="font-bold tabular-nums">Q{q.number} · {q.type}</span>
                    {q.marks && <span>{q.marks}</span>}
                  </div>
                  <div className="text-sm font-medium">
                    <MarkdownRenderer content={q.question} />
                  </div>
                  {q.options && q.options.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {q.options.map((opt, idx) => (
                        <div
                          key={idx}
                          className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950 text-xs flex gap-2"
                        >
                          <span className="font-bold">{String.fromCharCode(65 + idx)}.</span>
                          <MarkdownRenderer content={opt} />
                        </div>
                      ))}
                    </div>
                  )}
                  {showAnswers && (
                    <div className="p-3.5 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 text-xs space-y-1.5">
                      <div className="font-semibold text-emerald-800 dark:text-emerald-300">
                        Answer: <MarkdownRenderer content={q.answer} className="inline" />
                      </div>
                      <div className="text-slate-700 dark:text-slate-300">
                        <span className="font-semibold">Explanation: </span>
                        <MarkdownRenderer content={q.explanation} className="inline" />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
};
