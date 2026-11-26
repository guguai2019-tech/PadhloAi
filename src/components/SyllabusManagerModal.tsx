import React, { useState } from 'react';
import {
  AlertCircle,
  BookMarked,
  FileText,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type {
  AdvancedQuestionTypeId,
  ExamCategoryId,
  ExamDefinition,
  SyllabusPdfReference,
} from '../types';
import {
  ALL_QUESTION_FORMATS,
  getOfficialDefaultMarks,
} from '../data/questionFormatsCatalog';
import { extractPdfText, formatFileSize } from '../utils/fileProcessor';

interface SyllabusManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
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
}

export const SyllabusManagerModal: React.FC<SyllabusManagerModalProps> = ({
  isOpen,
  onClose,
  exams,
  syllabusPdfs,
  onAddCustomExam,
  onUpdateExam,
  onAddChapterOrTopic,
  onAddSyllabusPdf,
  onRemoveSyllabusPdf,
}) => {
  const [tab, setTab] = useState<'pdf' | 'topic' | 'formats' | 'new-exam'>('pdf');

  // Upload Official Syllabus PDF state
  const [pdfExamId, setPdfExamId] = useState(exams[0]?.id || 'bse-odisha');
  const [pdfSubject, setPdfSubject] = useState('All Subjects');
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [draftPdf, setDraftPdf] = useState<{
    fileName: string;
    pageCount: number;
    text: string;
    needsManualCheck: boolean;
  } | null>(null);

  // Add Chapter/Topic state
  const [topicExamId, setTopicExamId] = useState(exams[0]?.id || 'bse-odisha');
  const selectedTopicExam = exams.find((e) => e.id === topicExamId) || exams[0];
  const [topicClassId, setTopicClassId] = useState(
    selectedTopicExam?.classesOrPapers[0]?.id || '',
  );
  const selectedClassObj =
    selectedTopicExam?.classesOrPapers.find((c) => c.id === topicClassId) ||
    selectedTopicExam?.classesOrPapers[0];
  const [topicSubjectName, setTopicSubjectName] = useState(
    selectedClassObj?.subjects[0]?.name || '',
  );
  const [newChapterName, setNewChapterName] = useState('');
  const [newTopicName, setNewTopicName] = useState('');
  const [topicSuccess, setTopicSuccess] = useState('');

  // Add New Competitive / Custom Exam state
  const [newExamCategory, setNewExamCategory] =
    useState<ExamCategoryId>('competitive');
  const [newExamName, setNewExamName] = useState('');
  const [newExamDesc, setNewExamDesc] = useState('');
  const [newExamPaper, setNewExamPaper] = useState('Prelims / Tier 1');
  const [newExamSubjects, setNewExamSubjects] = useState(
    'General Studies, Mathematics, Reasoning, English',
  );
  const [newExamMarks, setNewExamMarks] = useState(1);
  const [newExamNegEnabled, setNewExamNegEnabled] = useState(true);
  const [newExamNegPenalty, setNewExamNegPenalty] = useState(0.25);

  // Admin Question Formats & Marks Config state
  const [fmtExamId, setFmtExamId] = useState(exams[0]?.id || 'bse-odisha');
  const selectedFmtExam = exams.find((e) => e.id === fmtExamId) || exams[0];
  const [fmtAllowed, setFmtAllowed] = useState<AdvancedQuestionTypeId[]>(() =>
    selectedFmtExam?.allowedQuestionFormats && selectedFmtExam.allowedQuestionFormats.length > 0
      ? selectedFmtExam.allowedQuestionFormats
      : ALL_QUESTION_FORMATS.map((f) => f.id),
  );
  const [fmtCustomMarks, setFmtCustomMarks] = useState<Partial<Record<AdvancedQuestionTypeId, number>>>(() => {
    const out: Partial<Record<AdvancedQuestionTypeId, number>> = {};
    for (const f of ALL_QUESTION_FORMATS) {
      out[f.id] = getOfficialDefaultMarks(selectedFmtExam, f.id);
    }
    return out;
  });
  const [fmtDefaultMarks, setFmtDefaultMarks] = useState<number>(
    selectedFmtExam?.defaultMarksPerQuestion ?? 1,
  );
  const [fmtNegEnabled, setFmtNegEnabled] = useState<boolean>(
    Boolean(selectedFmtExam?.defaultNegativeMarking),
  );
  const [fmtNegPenalty, setFmtNegPenalty] = useState<number>(
    selectedFmtExam?.defaultNegativePenalty ?? 0.25,
  );
  const [fmtSuccess, setFmtSuccess] = useState('');

  if (!isOpen) return null;

  const loadExamIntoFormatEditor = (ex: ExamDefinition | undefined) => {
    if (!ex) return;
    setFmtExamId(ex.id);
    setFmtAllowed(
      ex.allowedQuestionFormats && ex.allowedQuestionFormats.length > 0
        ? ex.allowedQuestionFormats
        : ALL_QUESTION_FORMATS.map((f) => f.id),
    );
    const marksMap: Partial<Record<AdvancedQuestionTypeId, number>> = {};
    for (const f of ALL_QUESTION_FORMATS) {
      marksMap[f.id] = getOfficialDefaultMarks(ex, f.id);
    }
    setFmtCustomMarks(marksMap);
    setFmtDefaultMarks(ex.defaultMarksPerQuestion ?? 1);
    setFmtNegEnabled(Boolean(ex.defaultNegativeMarking));
    setFmtNegPenalty(ex.defaultNegativePenalty ?? 0.25);
    setFmtSuccess('');
  };

  const handleSaveExamFormats = () => {
    if (!selectedFmtExam || !onUpdateExam) return;
    const updated: ExamDefinition = {
      ...selectedFmtExam,
      defaultMarksPerQuestion: Math.max(0.5, fmtDefaultMarks),
      defaultNegativeMarking: fmtNegEnabled,
      defaultNegativePenalty: fmtNegEnabled ? Math.max(0, fmtNegPenalty) : 0,
      allowedQuestionFormats: fmtAllowed.length > 0 ? fmtAllowed : undefined,
      customFormatMarks: fmtCustomMarks,
    };
    onUpdateExam(updated);
    setFmtSuccess(
      `Saved question formats & marks for "${updated.name}" — synced across Question Generation and Mock Test.`,
    );
    setTimeout(() => setFmtSuccess(''), 3200);
  };

  const looksLikeLegacyEncodedFont = (raw: string): boolean => {
    const legacyMarkers = /[ûòéùêàôþæ¥±§¨ªº]/g;
    const matches = raw.match(legacyMarkers);
    return Boolean(matches && matches.length > 15);
  };

  const handleUploadPdf = async (file: File) => {
    setPdfBusy(true);
    setPdfError(null);
    try {
      const buf = await file.arrayBuffer();
      const { text, pageCount } = await extractPdfText(buf);
      const stripped = text.replace(/--- Page \d+ ---/g, '').trim();
      const needsManualCheck = !stripped || looksLikeLegacyEncodedFont(stripped);
      setDraftPdf({
        fileName: file.name,
        pageCount,
        text: stripped
          ? text.slice(0, 45000)
          : '',
        needsManualCheck,
      });
    } catch (err) {
      setPdfError(
        err instanceof Error ? err.message : 'Failed to parse syllabus PDF.',
      );
    } finally {
      setPdfBusy(false);
    }
  };

  const handleConfirmDraftPdf = () => {
    if (!draftPdf || !draftPdf.text.trim()) {
      setPdfError(
        'Please enter or correct the syllabus text above before saving (empty syllabus cannot be saved).',
      );
      return;
    }
    const ref: SyllabusPdfReference = {
      id: `syl-pdf-${Date.now()}`,
      examId: pdfExamId,
      subject: pdfSubject.trim() || 'General',
      fileName: draftPdf.fileName,
      uploadedAt: Date.now(),
      extractedText: draftPdf.text.slice(0, 45000),
      pageCount: draftPdf.pageCount,
    };
    onAddSyllabusPdf(ref);
    setDraftPdf(null);
    setPdfError(null);
  };

  const handleSaveChapterTopic = () => {
    if (!selectedTopicExam || !selectedClassObj) return;
    const subj = topicSubjectName.trim() || selectedClassObj.subjects[0]?.name;
    const chap = newChapterName.trim();
    const top = newTopicName.trim();
    if (!subj || !chap) return;
    onAddChapterOrTopic(
      selectedTopicExam.id,
      selectedClassObj.id,
      subj,
      chap,
      top || chap,
    );
    setNewChapterName('');
    setNewTopicName('');
    setTopicSuccess(`Added "${chap}" to ${selectedTopicExam.name}`);
    setTimeout(() => setTopicSuccess(''), 2500);
  };

  const handleCreateCustomExam = () => {
    if (!newExamName.trim()) return;
    const subjects = newExamSubjects
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((name) => ({
        name,
        chapters: [{ name: `${name} Core Syllabus`, topics: ['Full Topic Coverage'] }],
      }));

    if (subjects.length === 0) return;

    const id = `custom-${Date.now()}`;
    onAddCustomExam({
      id,
      category: newExamCategory,
      name: newExamName.trim(),
      shortDesc: newExamDesc.trim() || 'User-configured examination syllabus',
      defaultMarksPerQuestion: Math.max(0.5, newExamMarks),
      defaultNegativeMarking: newExamNegEnabled,
      defaultNegativePenalty: newExamNegEnabled ? Math.max(0, newExamNegPenalty) : 0,
      isCustom: true,
      classesOrPapers: [
        {
          id: `${id}-paper`,
          label: newExamPaper.trim() || 'Main Paper',
          subjects,
        },
      ],
    });

    setNewExamName('');
    setNewExamDesc('');
    setTab('pdf');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="max-w-3xl w-full max-h-[90vh] overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookMarked className="w-5 h-5 text-violet-600 dark:text-violet-400" />
            <div>
              <h2 className="font-bold text-base text-slate-900 dark:text-white">
                Syllabus Management & Official PDF Reference
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Upload syllabus PDFs, add custom chapters/topics, or register new examinations.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close syllabus manager"
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pt-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap gap-2">
          {[
            { id: 'pdf', label: 'Upload Syllabus PDFs' },
            { id: 'topic', label: 'Update Chapters & Topics' },
            ...(onUpdateExam ? [{ id: 'formats', label: 'Question Formats & Marks' }] : []),
            { id: 'new-exam', label: 'Add New Examination' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id as 'pdf' | 'topic' | 'formats' | 'new-exam')}
              className={`px-3.5 py-2 text-xs font-semibold border-b-2 transition-colors ${
                tab === item.id
                  ? 'border-violet-600 text-violet-700 dark:text-violet-400'
                  : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          <div className="p-3 rounded-xl border border-amber-200 dark:border-amber-900/70 bg-amber-50/70 dark:bg-amber-950/30 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Built-in syllabuses are structured study outlines. Always verify syllabus updates against official BSE Odisha, CBSE, NTA UGC NET, or OPSC/OSSC/OSSSC notifications, or upload your official syllabus PDF below as direct AI reference.
            </span>
          </div>

          {tab === 'pdf' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Examination
                  </label>
                  <select
                    value={pdfExamId}
                    onChange={(e) => setPdfExamId(e.target.value)}
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
                    Subject Scope
                  </label>
                  <input
                    type="text"
                    value={pdfSubject}
                    onChange={(e) => setPdfSubject(e.target.value)}
                    placeholder="e.g. Mathematics, Paper 1, All Subjects"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                  />
                </div>
              </div>

              <label className="flex flex-col items-center justify-center p-6 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-violet-500 cursor-pointer bg-slate-50/60 dark:bg-slate-950/50 text-center">
                <Upload className="w-7 h-7 text-violet-600 mb-2" />
                <div className="text-sm font-semibold">
                  {pdfBusy ? 'Extracting Syllabus PDF...' : 'Upload Official Syllabus PDF'}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Parsed locally in your browser and attached as AI reference during mock test generation.
                </div>
                <input
                  type="file"
                  accept=".pdf"
                  disabled={pdfBusy}
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleUploadPdf(f);
                    e.target.value = '';
                  }}
                />
              </label>

              {pdfError && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
                  {pdfError}
                </div>
              )}

              {draftPdf && (
                <div className="p-4 rounded-xl border border-violet-300 dark:border-violet-800 bg-violet-50/40 dark:bg-violet-950/20 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      Verify Extracted Syllabus: {draftPdf.fileName} ({draftPdf.pageCount} pages)
                    </div>
                    <button
                      type="button"
                      onClick={() => setDraftPdf(null)}
                      className="text-xs text-slate-500 hover:text-slate-800"
                    >
                      Discard
                    </button>
                  </div>

                  {draftPdf.needsManualCheck && (
                    <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200">
                      Some text in this PDF could not be extracted in standard Unicode (for example, scanned pages or legacy Odia/Hindi font encodings). Review and manually paste or correct chapters/topics below before saving so no inaccurate syllabus is stored.
                    </div>
                  )}

                  <textarea
                    rows={7}
                    value={draftPdf.text}
                    onChange={(e) =>
                      setDraftPdf((prev) =>
                        prev ? { ...prev, text: e.target.value } : null,
                      )
                    }
                    placeholder="Verify or type accurate chapters, Term I / Term II / Half-Yearly / Annual portions..."
                    className="w-full p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono leading-relaxed focus:outline-none focus:border-violet-500"
                  />

                  <button
                    type="button"
                    onClick={handleConfirmDraftPdf}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Verify & Save Syllabus PDF Reference</span>
                  </button>
                </div>
              )}

              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Saved Syllabus Reference PDFs ({syllabusPdfs.length})
                </div>
                {syllabusPdfs.length === 0 ? (
                  <div className="text-xs text-slate-500 py-4 text-center border border-slate-200 dark:border-slate-800 rounded-xl">
                    No syllabus PDFs uploaded yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {syllabusPdfs.map((ref) => {
                      const examName =
                        exams.find((e) => e.id === ref.examId)?.name || ref.examId;
                      return (
                        <div
                          key={ref.id}
                          className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <FileText className="w-4 h-4 text-violet-600 shrink-0" />
                            <div className="min-w-0">
                              <div className="font-semibold truncate">{ref.fileName}</div>
                              <div className="text-slate-500 truncate tabular-nums">
                                {examName} · {ref.subject} · {ref.pageCount} pages ·{' '}
                                {formatFileSize(ref.extractedText.length)}
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => onRemoveSyllabusPdf(ref.id)}
                            className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'topic' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Examination
                  </label>
                  <select
                    value={topicExamId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setTopicExamId(id);
                      const ex = exams.find((x) => x.id === id);
                      const firstCls = ex?.classesOrPapers[0];
                      setTopicClassId(firstCls?.id || '');
                      setTopicSubjectName(firstCls?.subjects[0]?.name || '');
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
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
                    Class / Paper
                  </label>
                  <select
                    value={selectedClassObj?.id || ''}
                    onChange={(e) => {
                      const cId = e.target.value;
                      setTopicClassId(cId);
                      const cls = selectedTopicExam?.classesOrPapers.find(
                        (c) => c.id === cId,
                      );
                      setTopicSubjectName(cls?.subjects[0]?.name || '');
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                  >
                    {(selectedTopicExam?.classesOrPapers || []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Subject (or type new)
                  </label>
                  <input
                    type="text"
                    list="syllabus-subject-list"
                    value={topicSubjectName}
                    onChange={(e) => setTopicSubjectName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                  />
                  <datalist id="syllabus-subject-list">
                    {(selectedClassObj?.subjects || []).map((s) => (
                      <option key={s.name} value={s.name} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Chapter Name
                  </label>
                  <input
                    type="text"
                    value={newChapterName}
                    onChange={(e) => setNewChapterName(e.target.value)}
                    placeholder="e.g. Modern Physics / New Unit"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Topic Name
                  </label>
                  <input
                    type="text"
                    value={newTopicName}
                    onChange={(e) => setNewTopicName(e.target.value)}
                    placeholder="e.g. Photoelectric Effect"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                  />
                </div>
              </div>

              {topicSuccess && (
                <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  {topicSuccess}
                </div>
              )}

              <button
                type="button"
                disabled={!newChapterName.trim()}
                onClick={handleSaveChapterTopic}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-xs font-semibold"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Chapter / Topic to Syllabus</span>
              </button>
            </div>
          )}

          {tab === 'new-exam' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Category
                  </label>
                  <select
                    value={newExamCategory}
                    onChange={(e) => setNewExamCategory(e.target.value as ExamCategoryId)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                  >
                    <option value="competitive">Odisha & Competitive Exams</option>
                    <option value="odisha-board">Odisha Board (BSE Odisha)</option>
                    <option value="cbse">CBSE Board</option>
                    <option value="ugc-net">UGC NET</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Examination Name
                  </label>
                  <input
                    type="text"
                    value={newExamName}
                    onChange={(e) => setNewExamName(e.target.value)}
                    placeholder="e.g. SSC CGL / RRB NTPC / OCS Mains"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Class / Paper / Tier Label
                  </label>
                  <input
                    type="text"
                    value={newExamPaper}
                    onChange={(e) => setNewExamPaper(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Short Description
                  </label>
                  <input
                    type="text"
                    value={newExamDesc}
                    onChange={(e) => setNewExamDesc(e.target.value)}
                    placeholder="Optional exam pattern summary"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Subjects (comma-separated)
                </label>
                <input
                  type="text"
                  value={newExamSubjects}
                  onChange={(e) => setNewExamSubjects(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                />
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs">
                <label className="flex items-center gap-2">
                  <span>Marks / Question:</span>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    value={newExamMarks}
                    onChange={(e) => setNewExamMarks(Number(e.target.value) || 1)}
                    className="w-20 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 tabular-nums"
                  />
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newExamNegEnabled}
                    onChange={(e) => setNewExamNegEnabled(e.target.checked)}
                  />
                  <span>Negative Marking</span>
                </label>
                {newExamNegEnabled && (
                  <label className="flex items-center gap-2">
                    <span>Penalty / Wrong:</span>
                    <input
                      type="number"
                      step="0.05"
                      min="0"
                      value={newExamNegPenalty}
                      onChange={(e) => setNewExamNegPenalty(Number(e.target.value) || 0)}
                      className="w-20 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 tabular-nums"
                    />
                  </label>
                )}
              </div>

              <button
                type="button"
                disabled={!newExamName.trim()}
                onClick={handleCreateCustomExam}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:opacity-40 text-white text-xs font-semibold"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Examination to Platform</span>
              </button>
            </div>
          )}

          {tab === 'formats' && onUpdateExam && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Select Examination to Configure
                  </label>
                  <select
                    value={fmtExamId}
                    onChange={(e) => {
                      const next = exams.find((ex) => ex.id === e.target.value);
                      loadExamIntoFormatEditor(next);
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
                <div className="flex flex-wrap items-end gap-3 text-xs pb-1">
                  <label className="flex items-center gap-1.5">
                    <span className="font-semibold text-slate-600 dark:text-slate-300">Default Marks/Q:</span>
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      value={fmtDefaultMarks}
                      onChange={(e) => setFmtDefaultMarks(Number(e.target.value) || 1)}
                      className="w-20 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 tabular-nums"
                    />
                  </label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer font-semibold text-slate-700 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={fmtNegEnabled}
                      onChange={(e) => setFmtNegEnabled(e.target.checked)}
                      className="accent-violet-600"
                    />
                    <span>Neg. Marking</span>
                  </label>
                  {fmtNegEnabled && (
                    <input
                      type="number"
                      step="0.05"
                      min="0"
                      value={fmtNegPenalty}
                      onChange={(e) => setFmtNegPenalty(Number(e.target.value) || 0)}
                      className="w-16 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 tabular-nums"
                    />
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  Allowed Question Formats &amp; Official Default Marks ({fmtAllowed.length}/16 enabled)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setFmtAllowed(ALL_QUESTION_FORMATS.map((f) => f.id))}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold"
                  >
                    Enable All 16
                  </button>
                  <button
                    type="button"
                    onClick={() => setFmtAllowed(['MCQ', 'Multiple-Select', 'True-False', 'Assertion-Reasoning', 'Match-Following', 'Numerical', 'Passage-Based'])}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold"
                  >
                    Objective Exam Preset
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[300px] overflow-y-auto pr-1">
                {ALL_QUESTION_FORMATS.map((fmt) => {
                  const enabled = fmtAllowed.includes(fmt.id);
                  return (
                    <div
                      key={fmt.id}
                      className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 text-xs ${
                        enabled
                          ? 'border-violet-300 dark:border-violet-800 bg-violet-50/50 dark:bg-violet-950/25'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 opacity-65'
                      }`}
                    >
                      <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={(e) => {
                            setFmtAllowed((prev) =>
                              e.target.checked
                                ? Array.from(new Set([...prev, fmt.id]))
                                : prev.filter((id) => id !== fmt.id),
                            );
                          }}
                          className="accent-violet-600 w-4 h-4 shrink-0"
                        />
                        <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {fmt.label}
                        </span>
                      </label>
                      <label className="flex items-center gap-1 shrink-0">
                        <span className="text-[11px] text-slate-500">Marks:</span>
                        <input
                          type="number"
                          min={0.5}
                          max={20}
                          step={0.5}
                          value={fmtCustomMarks[fmt.id] ?? fmt.defaultMarks}
                          onChange={(e) =>
                            setFmtCustomMarks((prev) => ({
                              ...prev,
                              [fmt.id]: Number(e.target.value) || fmt.defaultMarks,
                            }))
                          }
                          className="w-14 px-1.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs tabular-nums"
                        />
                      </label>
                    </div>
                  );
                })}
              </div>

              {fmtSuccess && (
                <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  {fmtSuccess}
                </div>
              )}

              <button
                type="button"
                onClick={handleSaveExamFormats}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Save Exam Formats &amp; Sync Globally</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
