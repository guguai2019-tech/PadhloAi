import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BookMarked,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  Cpu,
  Database,
  Edit3,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FileText,
  FileUp,
  Film,
  FolderKanban,
  HelpCircle,
  KeyRound,
  Layers,
  LayoutDashboard,
  ListChecks,
  Loader2,
  LogOut,
  Plus,
  RefreshCw,
  Server,
  Settings,
  ShieldCheck,
  Trash2,
  Upload,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import type {
  AdminAiConfig,
  AdminAiOverview,
  AdminDashboardStats,
  AdminQuestionRecord,
  AdvancedQuestionTypeId,
  DifficultyLevel,
  ExamCategoryId,
  ExamDefinition,
  MockLanguage,
  PdfNoteCategory,
  PdfNoteMetadata,
  ProviderId,
  StudentRecord,
  SyllabusSubject,
  SyllabusUploadRecord,
  UpscStage,
} from '../types';
import { ALL_QUESTION_FORMATS } from '../data/questionFormatsCatalog';
import {
  type SyllabusConflictInfo,
  bulkUploadAdminQuestions,
  changeAdminIdApi,
  changeAdminPassword,
  createAdminExam,
  createAdminQuestion,
  createAdminStudent,
  deleteAdminExam,
  deleteAdminPdfNote,
  deleteAdminQuestion,
  deleteAdminStudent,
  deleteSyllabusDraft,
  fetchAdminAiConfig,
  fetchAdminOverview,
  fileToBase64,
  logoutAdmin,
  publishSyllabusDraft,
  testAdminAiConnection,
  updateAdminAiConfig,
  updateAdminExam,
  updateAdminPdfNote,
  updateAdminQuestion,
  updateAdminStudent,
  updateSyllabusDraft,
  uploadAdminPdfNote,
  uploadAndProcessSyllabus,
} from '../utils/adminApi';
import { formatFileSize } from '../utils/fileProcessor';
import { ProtectedPdfCanvasReader } from './ProtectedPdfCanvasReader';
import { AdminVideoManagementPanel } from './AdminVideoManagementPanel';
import { AdminUgcNetSyllabusPanel } from './AdminUgcNetSyllabusPanel';
import { AdminUpscSyllabusPanel } from './AdminUpscSyllabusPanel';
import { matchesSearchQuery } from '../utils/studySearch';
import { SearchBarWithVoice } from './SearchBarWithVoice';

type AdminSection =
  | 'overview'
  | 'upload-syllabus'
  | 'manage-exams'
  | 'manage-subjects'
  | 'manage-chapters'
  | 'manage-topics'
  | 'question-bank'
  | 'pdf-notes'
  | 'students'
  | 'settings'
  | 'ai-providers'
  | 'ai-video';

interface AdminDashboardProps {
  adminToken: string;
  adminId: string;
  onLogout: () => void;
  onCatalogSync: () => Promise<void> | void;
  onAiConfigSync?: () => Promise<void> | void;
  onAdminIdUpdated?: (nextToken: string, nextAdminId: string) => void;
}

const ADMIN_NAV: Array<{
  id: AdminSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'overview', label: '1. Dashboard Overview', icon: LayoutDashboard },
  { id: 'upload-syllabus', label: '2. Upload Syllabus', icon: FileUp },
  { id: 'manage-exams', label: '3. Manage Exams', icon: FolderKanban },
  { id: 'manage-subjects', label: '4. Manage Subjects', icon: BookMarked },
  { id: 'manage-chapters', label: '5. Manage Chapters', icon: Layers },
  { id: 'manage-topics', label: '6. Manage Topics', icon: ListChecks },
  { id: 'question-bank', label: '7. Question Bank', icon: HelpCircle },
  { id: 'pdf-notes', label: '8. PDF Notes', icon: FileText },
  { id: 'students', label: '9. Manage Students', icon: Users },
  { id: 'settings', label: '10. Settings', icon: Settings },
  { id: 'ai-providers', label: '11. AI Providers', icon: Cpu },
  { id: 'ai-video', label: '12. AI Video Generator', icon: Film },
];

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  adminToken,
  adminId,
  onLogout,
  onCatalogSync,
  onAiConfigSync,
  onAdminIdUpdated,
}) => {
  const [section, setSection] = useState<AdminSection>('overview');
  const [loading, setLoading] = useState(true);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [bannerSuccess, setBannerSuccess] = useState<string | null>(null);

  const [stats, setStats] = useState<AdminDashboardStats>({
    totalExams: 0,
    publishedExams: 0,
    totalUploadedSyllabuses: 0,
    totalSubjects: 0,
    totalChapters: 0,
    totalTopics: 0,
    totalQuestions: 0,
    questionsNeedingReview: 0,
    totalPdfNotes: 0,
    publishedPdfNotes: 0,
    totalRegisteredStudents: 0,
  });
  const [exams, setExams] = useState<ExamDefinition[]>([]);
  const [syllabusUploads, setSyllabusUploads] = useState<SyllabusUploadRecord[]>([]);
  const [questions, setQuestions] = useState<AdminQuestionRecord[]>([]);
  const [pdfNotes, setPdfNotes] = useState<PdfNoteMetadata[]>([]);
  const [students, setStudents] = useState<StudentRecord[]>([]);

  // Confirmation modal state
  const [confirmState, setConfirmState] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => Promise<void>;
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  // Upload Syllabus state (Organized Exam Cards + Modal + Conflict Resolution)
  const [catalogVersion, setCatalogVersion] = useState<number>(1);
  const [sylSearch, setSylSearch] = useState('');
  const [sylStatusFilter, setSylStatusFilter] = useState<'all' | SyllabusUploadRecord['status']>('all');
  const [sylUploadModal, setSylUploadModal] = useState<{
    targetExamId?: string;
    targetClassId?: string;
    isNewExam: boolean;
  } | null>(null);
  const [sylExamName, setSylExamName] = useState('');
  const [sylBoardName, setSylBoardName] = useState('');
  const [sylClassLabel, setSylClassLabel] = useState('Class 10');
  const [sylSession, setSylSession] = useState('2026-27');
  const [sylSubjectHint, setSylSubjectHint] = useState('');
  const [sylLanguage, setSylLanguage] = useState<MockLanguage>('english');
  const [sylFile, setSylFile] = useState<File | null>(null);
  const [processingSyllabus, setProcessingSyllabus] = useState(false);
  const [activeDraft, setActiveDraft] = useState<SyllabusUploadRecord | null>(null);
  const [conflictInfo, setConflictInfo] = useState<SyllabusConflictInfo | null>(null);
  const [publishChoiceModal, setPublishChoiceModal] = useState<{
    draft: SyllabusUploadRecord;
    conflict: SyllabusConflictInfo;
  } | null>(null);
  const [publishingDraft, setPublishingDraft] = useState(false);

  // Manage Exams modal state
  const [examModal, setExamModal] = useState<{
    mode: 'create' | 'edit' | 'view';
    exam: ExamDefinition;
  } | null>(null);

  // Manage Subjects / Chapters / Topics cascading selectors
  const [selExamId, setSelExamId] = useState<string>('');
  const [selClassId, setSelClassId] = useState<string>('');
  const [selSubjectName, setSelSubjectName] = useState<string>('');
  const [selChapterName, setSelChapterName] = useState<string>('');
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newChapterName, setNewChapterName] = useState('');
  const [newChapterTerm, setNewChapterTerm] = useState<'Term I' | 'Term II'>('Term I');
  const [newTopicName, setNewTopicName] = useState('');
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  const [renamingVal, setRenamingVal] = useState('');

  // Question Bank state
  const [qbSearch, setQbSearch] = useState('');
  const [qbExamFilter, setQbExamFilter] = useState('all');
  const [qbTypeFilter, setQbTypeFilter] = useState('all');
  const [qbNeedsReviewOnly, setQbNeedsReviewOnly] = useState(false);
  const [questionModal, setQuestionModal] = useState<{
    mode: 'create' | 'edit';
    data: Partial<AdminQuestionRecord>;
  } | null>(null);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkExamId, setBulkExamId] = useState('');
  const [bulkClassId, setBulkClassId] = useState('');
  const [bulkSubject, setBulkSubject] = useState('');
  const [bulkChapter, setBulkChapter] = useState('');

  // PDF Notes state (Exam PDF Notes + NCERT Notes Class 6-12 + UPSC Notes)
  const [pdfCategory, setPdfCategory] = useState<PdfNoteCategory>('exam');
  const [pdfTitle, setPdfTitle] = useState('');
  const [pdfDesc, setPdfDesc] = useState('');
  const [pdfExamId, setPdfExamId] = useState('');
  const [pdfClassId, setPdfClassId] = useState('');
  const [pdfSubject, setPdfSubject] = useState('');
  const [pdfChapter, setPdfChapter] = useState('');
  const [pdfTopic, setPdfTopic] = useState('');
  const [pdfLanguage, setPdfLanguage] = useState<MockLanguage>('english');
  const [ncertClass, setNcertClass] = useState('Class 6');
  const [ncertSubject, setNcertSubject] = useState('History');
  const [ncertBookName, setNcertBookName] = useState('');
  const [upscNoteStage, setUpscNoteStage] = useState<UpscStage>('prelims');
  const [upscNotePaper, setUpscNotePaper] = useState('Prelims GS Paper I');
  const [upscNoteSubject, setUpscNoteSubject] = useState('General Studies');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [pdfSearch, setPdfSearch] = useState('');
  const [pdfStatusFilter, setPdfStatusFilter] = useState<'all' | 'published' | 'draft'>('all');
  const [pdfCategoryFilter, setPdfCategoryFilter] = useState<'all' | PdfNoteCategory>('all');
  const [previewPdfNote, setPreviewPdfNote] = useState<PdfNoteMetadata | null>(null);
  const [editPdfNote, setEditPdfNote] = useState<PdfNoteMetadata | null>(null);
  const [replacePdfFile, setReplacePdfFile] = useState<File | null>(null);

  // Students state
  const [studentSearch, setStudentSearch] = useState('');
  const [newStuName, setNewStuName] = useState('');
  const [newStuEmail, setNewStuEmail] = useState('');
  const [newStuRoll, setNewStuRoll] = useState('');
  const [newStuClass, setNewStuClass] = useState('Class 10');

  // Settings (Admin ID & Password Change) state
  const [newAdminIdInput, setNewAdminIdInput] = useState(adminId || '');
  const [idChangePw, setIdChangePw] = useState('');
  const [savingAdminId, setSavingAdminId] = useState(false);
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPwFields, setShowPwFields] = useState(false);
  const [savingPw, setSavingPw] = useState(false);

  // AI Providers Management state (Section 11)
  const [aiOverview, setAiOverview] = useState<AdminAiOverview | null>(null);
  const [aiOllamaUrlInput, setAiOllamaUrlInput] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiTestingProv, setAiTestingProv] = useState<ProviderId | null>(null);
  const [aiTestFeedback, setAiTestFeedback] = useState<
    Record<string, { ok: boolean; message: string }>
  >({});

  const loadAiOverview = async () => {
    try {
      const ov = await fetchAdminAiConfig(adminToken);
      setAiOverview(ov);
      setAiOllamaUrlInput(ov.config.ollamaBaseUrl || '');
    } catch {
      // ignore initial failure if offline
    }
  };

  const loadOverview = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [data] = await Promise.all([
        fetchAdminOverview(adminToken),
        loadAiOverview(),
      ]);
      setStats(data.stats);
      setExams(data.exams);
      setSyllabusUploads(data.syllabusUploads);
      setQuestions(data.questions);
      setPdfNotes(data.pdfNotes);
      setStudents(data.students);
      if (typeof data.catalogVersion === 'number') {
        setCatalogVersion(data.catalogVersion);
      }

      if (!selExamId && data.exams.length > 0) {
        setSelExamId(data.exams[0].id);
        setPdfExamId(data.exams[0].id);
        setBulkExamId(data.exams[0].id);
      }
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Failed to load Admin overview.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void loadOverview();
  }, [adminToken]);

  const flashSuccess = (msg: string) => {
    setBannerError(null);
    setBannerSuccess(msg);
    setTimeout(() => setBannerSuccess((cur) => (cur === msg ? null : cur)), 5000);
  };

  const handleLogoutClick = async () => {
    try {
      await logoutAdmin(adminToken);
    } catch {
      // Ignore network error on logout
    }
    onLogout();
  };

  // Cascading hierarchy helpers for Manage Subjects/Chapters/Topics
  const activeExamObj = useMemo(
    () => exams.find((e) => e.id === selExamId) || exams[0],
    [exams, selExamId],
  );
  const activeClassObj = useMemo(
    () =>
      activeExamObj?.classesOrPapers.find((c) => c.id === selClassId) ||
      activeExamObj?.classesOrPapers[0],
    [activeExamObj, selClassId],
  );
  const activeSubjectObj = useMemo(
    () =>
      activeClassObj?.subjects.find((s) => s.name === selSubjectName) ||
      activeClassObj?.subjects[0],
    [activeClassObj, selSubjectName],
  );
  const activeChapterObj = useMemo(
    () =>
      activeSubjectObj?.chapters.find((ch) => ch.name === selChapterName) ||
      activeSubjectObj?.chapters[0],
    [activeSubjectObj, selChapterName],
  );

  // Sync dependent selectors cleanly
  useEffect(() => {
    if (activeExamObj && !activeExamObj.classesOrPapers.some((c) => c.id === selClassId)) {
      setSelClassId(activeExamObj.classesOrPapers[0]?.id || '');
    }
  }, [activeExamObj, selClassId]);

  useEffect(() => {
    if (activeClassObj && !activeClassObj.subjects.some((s) => s.name === selSubjectName)) {
      setSelSubjectName(activeClassObj.subjects[0]?.name || '');
    }
  }, [activeClassObj, selSubjectName]);

  useEffect(() => {
    if (activeSubjectObj && !activeSubjectObj.chapters.some((ch) => ch.name === selChapterName)) {
      setSelChapterName(activeSubjectObj.chapters[0]?.name || '');
    }
  }, [activeSubjectObj, selChapterName]);

  // PDF upload cascading exam selectors
  const pdfExamObj = useMemo(
    () => exams.find((e) => e.id === pdfExamId) || exams[0],
    [exams, pdfExamId],
  );
  const pdfClassObj = useMemo(
    () =>
      pdfExamObj?.classesOrPapers.find((c) => c.id === pdfClassId) ||
      pdfExamObj?.classesOrPapers[0],
    [pdfExamObj, pdfClassId],
  );
  useEffect(() => {
    if (pdfExamObj && !pdfExamObj.classesOrPapers.some((c) => c.id === pdfClassId)) {
      const cls = pdfExamObj.classesOrPapers[0];
      setPdfClassId(cls?.id || '');
      const sub = cls?.subjects[0];
      setPdfSubject(sub?.name || '');
      setPdfChapter(sub?.chapters[0]?.name || '');
    }
  }, [pdfExamObj, pdfClassId]);

  const pdfSubjectObj = useMemo(
    () =>
      pdfClassObj?.subjects.find((s) => s.name === pdfSubject) ||
      pdfClassObj?.subjects[0],
    [pdfClassObj, pdfSubject],
  );

  useEffect(() => {
    if (pdfClassObj && !pdfClassObj.subjects.some((s) => s.name === pdfSubject)) {
      const sub = pdfClassObj.subjects[0];
      setPdfSubject(sub?.name || '');
      setPdfChapter(sub?.chapters[0]?.name || '');
    }
  }, [pdfClassObj, pdfSubject]);

  // Helper to persist an edited exam and sync everywhere
  const persistExamUpdate = async (updated: ExamDefinition, message: string) => {
    const res = await updateAdminExam(adminToken, updated.id, updated);
    setExams((prev) => prev.map((e) => (e.id === updated.id ? res.exam : e)));
    setStats(res.stats);
    await loadOverview(true);
    await onCatalogSync();
    flashSuccess(
      res.flaggedQuestions > 0
        ? `${message} (${res.flaggedQuestions} existing question(s) flagged for review.)`
        : message,
    );
  };

  // ===================== SECTION HANDLERS =====================

  const openPreFilledUploadModal = (opts: {
    targetExamId?: string;
    targetClassId?: string;
    examName: string;
    boardName: string;
    classLabel: string;
    language: MockLanguage;
    isNewExam?: boolean;
  }) => {
    setSylExamName(opts.examName);
    setSylBoardName(opts.boardName);
    setSylClassLabel(opts.classLabel);
    setSylSession('2026-27');
    setSylSubjectHint('');
    setSylLanguage(opts.language);
    setSylFile(null);
    setBannerError(null);
    setSylUploadModal({
      targetExamId: opts.targetExamId,
      targetClassId: opts.targetClassId,
      isNewExam: Boolean(opts.isNewExam),
    });
  };

  const handleUploadAndProcessSyllabus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sylFile) {
      setBannerError('Please select a Syllabus file (PDF, DOCX, DOC, XLSX, XLS, or CSV).');
      return;
    }
    setProcessingSyllabus(true);
    setBannerError(null);
    try {
      const fileBase64 = await fileToBase64(sylFile);
      const res = await uploadAndProcessSyllabus(adminToken, {
        fileName: sylFile.name,
        mimeType: sylFile.type,
        fileBase64,
        targetExamId: sylUploadModal?.targetExamId || undefined,
        targetClassId: sylUploadModal?.targetClassId || undefined,
        examName: sylExamName.trim() || undefined,
        boardName: sylBoardName.trim() || undefined,
        classLabel: sylClassLabel.trim() || undefined,
        academicSession: sylSession.trim() || undefined,
        subjectHint: sylSubjectHint.trim() || undefined,
        language: sylLanguage,
      });
      setActiveDraft(res.upload);
      setConflictInfo(res.conflict?.exists ? res.conflict : null);
      setSyllabusUploads((prev) => [res.upload, ...prev.filter((u) => u.id !== res.upload.id)]);
      setSylUploadModal(null);
      setSylFile(null);
      flashSuccess(
        res.conflict?.exists
          ? `Processed "${res.upload.fileName}" (${res.extractedCharCount.toLocaleString()} chars). Existing syllabus detected for ${res.conflict.examName} — review below and choose Replace or New Academic Session when publishing.`
          : `Processed "${res.upload.fileName}" (${res.extractedCharCount.toLocaleString()} chars extracted). Review and edit below, then click Publish Syllabus.`,
      );
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Syllabus processing failed.');
      await loadOverview(true);
    } finally {
      setProcessingSyllabus(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!activeDraft) return;
    try {
      const res = await updateSyllabusDraft(adminToken, activeDraft.id, activeDraft);
      setActiveDraft(res.upload);
      setSyllabusUploads((prev) => prev.map((u) => (u.id === res.upload.id ? res.upload : u)));
      flashSuccess('Syllabus draft saved.');
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Failed to save draft.');
    }
  };

  const executePublishDraft = async (
    draftToPublish: SyllabusUploadRecord,
    resolutionMode: 'replace' | 'new-session' | 'merge',
    overrideTargetExamId?: string,
    overrideTargetClassId?: string,
  ) => {
    setPublishingDraft(true);
    setBannerError(null);
    try {
      const res = await publishSyllabusDraft(adminToken, draftToPublish.id, {
        ...draftToPublish,
        resolutionMode,
        targetExamId: overrideTargetExamId || draftToPublish.targetExamId,
        targetClassId: overrideTargetClassId || draftToPublish.targetClassId,
      });
      setActiveDraft(res.upload);
      setConflictInfo(null);
      setPublishChoiceModal(null);
      setStats(res.stats);
      if (typeof res.catalogVersion === 'number') {
        setCatalogVersion(res.catalogVersion);
      }
      await loadOverview(true);
      await onCatalogSync();
      flashSuccess(
        `Published "${res.exam.name}" (v${res.catalogVersion})! Synchronized automatically across Student Portal, Mock Tests, Question Generation, and PDF Notes.${
          res.flaggedQuestions > 0
            ? ` (${res.flaggedQuestions} existing question(s) flagged for review.)`
            : ''
        }`,
      );
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Failed to publish syllabus.');
    } finally {
      setPublishingDraft(false);
    }
  };

  const handlePublishDraft = async (draftOverride?: SyllabusUploadRecord) => {
    const targetDraft = draftOverride || activeDraft;
    if (!targetDraft) return;
    const matchingExisting = exams.find(
      (ex) =>
        (targetDraft.targetExamId && ex.id === targetDraft.targetExamId) ||
        ex.name.trim().toLowerCase() === targetDraft.examName.trim().toLowerCase(),
    );
    const hasConflict =
      Boolean(conflictInfo?.exists) ||
      targetDraft.status === 'Update Available' ||
      Boolean(matchingExisting && matchingExisting.classesOrPapers.length > 0);

    if (hasConflict) {
      const resolvedConflict: SyllabusConflictInfo = conflictInfo?.exists
        ? conflictInfo
        : {
            exists: true,
            examId: matchingExisting?.id || targetDraft.targetExamId,
            examName: matchingExisting?.name || targetDraft.examName,
            classId: targetDraft.targetClassId || matchingExisting?.classesOrPapers[0]?.id,
            classLabel: targetDraft.classLabel || matchingExisting?.classesOrPapers[0]?.label,
            existingSessions: matchingExisting?.academicSession
              ? [matchingExisting.academicSession]
              : undefined,
          };
      setPublishChoiceModal({ draft: targetDraft, conflict: resolvedConflict });
      return;
    }

    await executePublishDraft(targetDraft, 'merge');
  };

  const handleUploadPdfNote = async (publishNow: boolean) => {
    if (!pdfTitle.trim() || !pdfFile) {
      setBannerError('PDF Title and PDF File are required.');
      return;
    }

    if (pdfCategory === 'exam' && (!pdfExamObj || !pdfSubject)) {
      setBannerError('Exam and Subject are required for Exam PDF Notes.');
      return;
    }
    if (pdfCategory === 'ncert' && (!ncertClass.trim() || !ncertSubject.trim() || !ncertBookName.trim())) {
      setBannerError('Class (6–12), Subject, and NCERT Book Name are required.');
      return;
    }
    if (pdfCategory === 'upsc' && (!upscNotePaper.trim() || !upscNoteSubject.trim())) {
      setBannerError('UPSC Paper and Subject/Area are required for UPSC Notes.');
      return;
    }

    setUploadingPdf(true);
    setBannerError(null);
    try {
      const fileBase64 = await fileToBase64(pdfFile);
      const payload =
        pdfCategory === 'ncert'
          ? {
              title: pdfTitle.trim(),
              description: pdfDesc.trim(),
              noteCategory: 'ncert' as PdfNoteCategory,
              examId: 'ncert-notes',
              examName: 'NCERT Notes',
              classId: `ncert-${ncertClass.toLowerCase().replace(/\s+/g, '-')}`,
              classLabel: ncertClass,
              ncertClass,
              bookName: ncertBookName.trim(),
              subject: ncertSubject.trim(),
              chapter: pdfChapter.trim() || 'All Chapters',
              topic: pdfTopic.trim(),
              language: pdfLanguage,
              published: publishNow,
              fileName: pdfFile.name,
              fileBase64,
            }
          : pdfCategory === 'upsc'
            ? {
                title: pdfTitle.trim(),
                description: pdfDesc.trim(),
                noteCategory: 'upsc' as PdfNoteCategory,
                examId: 'upsc-cse',
                examName: 'UPSC – Civil Services Examination',
                classId: upscNoteStage,
                classLabel: upscNotePaper.trim(),
                upscStage: upscNoteStage,
                upscPaper: upscNotePaper.trim(),
                subject: upscNoteSubject.trim(),
                chapter: pdfChapter.trim() || 'Core Topic Notes',
                topic: pdfTopic.trim(),
                language: pdfLanguage,
                published: publishNow,
                fileName: pdfFile.name,
                fileBase64,
              }
            : {
                title: pdfTitle.trim(),
                description: pdfDesc.trim(),
                noteCategory: 'exam' as PdfNoteCategory,
                examId: pdfExamObj!.id,
                examName: pdfExamObj!.name,
                classId: pdfClassObj?.id || 'default',
                classLabel: pdfClassObj?.label || 'All Levels',
                subject: pdfSubject,
                chapter: pdfChapter || 'All Chapters',
                topic: pdfTopic.trim(),
                language: pdfLanguage,
                published: publishNow,
                fileName: pdfFile.name,
                fileBase64,
              };

      const res = await uploadAdminPdfNote(adminToken, payload);
      setPdfNotes((prev) => [res.note, ...prev]);
      setStats(res.stats);
      setPdfTitle('');
      setPdfDesc('');
      setPdfTopic('');
      setPdfFile(null);
      if (pdfCategory === 'ncert') setNcertBookName('');
      await onCatalogSync();
      flashSuccess(
        publishNow
          ? `PDF Note "${res.note.title}" uploaded and published for students.`
          : `PDF Note "${res.note.title}" saved as Draft.`,
      );
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Failed to upload PDF note.');
    } finally {
      setUploadingPdf(false);
    }
  };

  const handleSaveEditedPdfNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editPdfNote) return;
    setUploadingPdf(true);
    try {
      let fileBase64: string | undefined;
      let fileName: string | undefined;
      if (replacePdfFile) {
        fileBase64 = await fileToBase64(replacePdfFile);
        fileName = replacePdfFile.name;
      }
      const res = await updateAdminPdfNote(adminToken, editPdfNote.id, {
        title: editPdfNote.title,
        description: editPdfNote.description,
        noteCategory: editPdfNote.noteCategory,
        subject: editPdfNote.subject,
        bookName: editPdfNote.bookName,
        ncertClass: editPdfNote.ncertClass,
        classLabel: editPdfNote.ncertClass || editPdfNote.upscPaper || editPdfNote.classLabel,
        upscStage: editPdfNote.upscStage,
        upscPaper: editPdfNote.upscPaper,
        chapter: editPdfNote.chapter,
        topic: editPdfNote.topic,
        language: editPdfNote.language,
        published: editPdfNote.published,
        fileBase64,
        fileName,
      });
      setPdfNotes((prev) => prev.map((n) => (n.id === res.note.id ? res.note : n)));
      setStats(res.stats);
      setEditPdfNote(null);
      setReplacePdfFile(null);
      await onCatalogSync();
      flashSuccess(`Updated PDF Note "${res.note.title}".`);
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Failed to update PDF note.');
    } finally {
      setUploadingPdf(false);
    }
  };

  const handleSaveQuestionModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!questionModal) return;
    const d = questionModal.data;
    if (!d.question?.trim() || !d.correctAnswer?.trim() || !d.examId) {
      setBannerError('Exam, question stem, and correct answer are required.');
      return;
    }
    try {
      if (questionModal.mode === 'create') {
        const res = await createAdminQuestion(adminToken, d);
        setQuestions((prev) => [res.question, ...prev]);
        setStats(res.stats);
        flashSuccess('Added new question to Centralized Question Bank.');
      } else if (d.id) {
        const res = await updateAdminQuestion(adminToken, d.id, { ...d, needsReview: false });
        setQuestions((prev) => prev.map((q) => (q.id === res.question.id ? res.question : q)));
        setStats(res.stats);
        flashSuccess('Updated question in Question Bank.');
      }
      setQuestionModal(null);
      await onCatalogSync();
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Failed to save question.');
    }
  };

  const handleBulkUploadSubmit = async () => {
    if (!bulkText.trim()) return;
    try {
      const targetExam = exams.find((e) => e.id === bulkExamId) || exams[0];
      const targetClass =
        targetExam?.classesOrPapers.find((c) => c.id === bulkClassId) ||
        targetExam?.classesOrPapers[0];

      let items: Array<Partial<AdminQuestionRecord>> = [];
      const trimmed = bulkText.trim();
      if (trimmed.startsWith('[')) {
        const parsed = JSON.parse(trimmed) as Array<Partial<AdminQuestionRecord>>;
        items = parsed.map((p) => ({
          examId: p.examId || targetExam?.id || '',
          examName: p.examName || targetExam?.name || '',
          classId: p.classId || targetClass?.id || '',
          classLabel: p.classLabel || targetClass?.label || '',
          subject: p.subject || bulkSubject || targetClass?.subjects[0]?.name || '',
          chapter: p.chapter || bulkChapter || 'All Chapters',
          topic: p.topic || 'All Chapter Topics',
          typeId: p.typeId || 'MCQ',
          marks: p.marks || 1,
          difficulty: p.difficulty || 'Medium',
          language: p.language || 'english',
          question: p.question,
          options: p.options,
          correctAnswer: p.correctAnswer,
          explanation: p.explanation,
        }));
      } else {
        // CSV rows: question,correctAnswer,typeId,marks,difficulty,options(| separated),explanation
        const lines = trimmed.split(/\r?\n/).filter((l) => l.trim());
        for (const line of lines) {
          if (line.toLowerCase().startsWith('question,')) continue;
          const cols = line.split(',').map((c) => c.trim());
          if (!cols[0] || !cols[1]) continue;
          items.push({
            examId: targetExam?.id || '',
            examName: targetExam?.name || '',
            classId: targetClass?.id || '',
            classLabel: targetClass?.label || '',
            subject: bulkSubject || targetClass?.subjects[0]?.name || '',
            chapter: bulkChapter || 'All Chapters',
            topic: 'All Chapter Topics',
            typeId: (cols[2] as AdvancedQuestionTypeId) || 'MCQ',
            marks: Number(cols[3]) || 1,
            difficulty: (cols[4] as DifficultyLevel) || 'Medium',
            language: 'english',
            question: cols[0],
            options: cols[5] ? cols[5].split('|').map((o) => o.trim()).filter(Boolean) : undefined,
            correctAnswer: cols[1],
            explanation: cols[6] || 'Standard answer.',
          });
        }
      }

      if (items.length === 0) {
        setBannerError('No valid questions found in input. Provide a JSON array or CSV rows.');
        return;
      }

      const res = await bulkUploadAdminQuestions(adminToken, items);
      setQuestions((prev) => [...res.questions, ...prev]);
      setStats(res.stats);
      setBulkModalOpen(false);
      setBulkText('');
      await onCatalogSync();
      flashSuccess(`Bulk uploaded ${res.addedCount} question(s) into Question Bank.`);
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Bulk upload failed.');
    }
  };

  // Filtered lists
  const filteredQuestions = useMemo(() => {
    return questions.filter((item) => {
      if (qbExamFilter !== 'all' && item.examId !== qbExamFilter) return false;
      if (qbTypeFilter !== 'all' && item.typeId !== qbTypeFilter) return false;
      if (qbNeedsReviewOnly && !item.needsReview) return false;
      if (qbSearch.trim()) {
        const hay = `${item.question} ${item.subject} ${item.chapter} ${item.topic} ${item.correctAnswer}`;
        if (!matchesSearchQuery(hay, qbSearch)) return false;
      }
      return true;
    });
  }, [questions, qbSearch, qbExamFilter, qbTypeFilter, qbNeedsReviewOnly]);

  const filteredPdfNotes = useMemo(() => {
    return pdfNotes.filter((n) => {
      const cat = n.noteCategory || 'exam';
      if (pdfCategoryFilter !== 'all' && cat !== pdfCategoryFilter) return false;
      if (pdfStatusFilter === 'published' && !n.published) return false;
      if (pdfStatusFilter === 'draft' && n.published) return false;
      if (pdfSearch.trim()) {
        const hay = `${n.title} ${n.examName} ${n.subject} ${n.bookName || ''} ${n.ncertClass || ''} ${n.upscPaper || ''} ${n.chapter} ${n.topic}`;
        if (!matchesSearchQuery(hay, pdfSearch)) return false;
      }
      return true;
    });
  }, [pdfNotes, pdfSearch, pdfStatusFilter, pdfCategoryFilter]);

  const filteredStudents = useMemo(() => {
    if (!studentSearch.trim()) return students;
    return students.filter((s) =>
      matchesSearchQuery(
        `${s.name} ${s.email} ${s.rollNumber || ''} ${s.classLevel}`,
        studentSearch,
      ),
    );
  }, [students, studentSearch]);

  // Helper to update draft subjects/chapters/topics cleanly
  const updateDraftSubjects = (fn: (subs: SyllabusSubject[]) => SyllabusSubject[]) => {
    if (!activeDraft) return;
    const cloned = JSON.parse(JSON.stringify(activeDraft.subjects)) as SyllabusSubject[];
    setActiveDraft({
      ...activeDraft,
      subjects: fn(cloned),
    });
  };

  return (
    <div className="h-full flex flex-col lg:flex-row bg-slate-50 dark:bg-slate-950 overflow-hidden">
      {/* Admin Left Navigation Rail */}
      <aside className="lg:w-64 shrink-0 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col">
        <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-violet-600 text-white flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="font-display font-bold text-sm text-slate-900 dark:text-white truncate">
                PadhloAI Admin
              </div>
              <div className="text-[11px] text-slate-500 truncate">Admin Panel · ID: {adminId}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleLogoutClick()}
            title="Logout Admin"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-200 dark:border-red-900/60 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Logout</span>
          </button>
        </div>

        <nav className="p-2.5 flex lg:flex-col gap-1 overflow-x-auto lg:overflow-y-auto flex-1">
          {ADMIN_NAV.map((item) => {
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-violet-600 text-white shadow-xs'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Main Admin Workspace */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <div className="px-4 sm:px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
            <Database className="w-4 h-4 text-violet-600" />
            <span>{ADMIN_NAV.find((n) => n.id === section)?.label}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
              <Activity className="w-3 h-3" />
              <span>Catalog v{catalogVersion} · Live Sync</span>
            </span>
            <button
              type="button"
              onClick={() => {
                void loadOverview();
                void onCatalogSync();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Sync Centralized DB</span>
            </button>
          </div>
        </div>

        {/* Status Banners */}
        {(bannerError || bannerSuccess) && (
          <div className="px-4 sm:px-6 pt-3 space-y-2">
            {bannerError && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300 flex items-center justify-between gap-2">
                <span>{bannerError}</span>
                <button type="button" onClick={() => setBannerError(null)}>
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
            {bannerSuccess && (
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-sm text-emerald-700 dark:text-emerald-300 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  {bannerSuccess}
                </span>
                <button type="button" onClick={() => setBannerSuccess(null)}>
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Section Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {loading ? (
            <div className="py-16 flex flex-col items-center gap-2 text-slate-500">
              <Loader2 className="w-7 h-7 animate-spin text-violet-600" />
              <span className="text-sm">Loading centralized Admin database...</span>
            </div>
          ) : (
            <>
              {/* 1. DASHBOARD OVERVIEW */}
              {section === 'overview' && (
                <div className="max-w-6xl mx-auto space-y-6">
                  {stats.questionsNeedingReview > 0 && (
                    <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3 text-amber-800 dark:text-amber-200">
                        <AlertTriangle className="w-5 h-5 shrink-0" />
                        <div className="text-sm">
                          <span className="font-bold">
                            {stats.questionsNeedingReview} question(s) need syllabus alignment review
                          </span>{' '}
                          after recent exam or chapter updates. No questions were deleted.
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setQbNeedsReviewOnly(true);
                          setSection('question-bank');
                        }}
                        className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold"
                      >
                        Review Questions
                      </button>
                    </div>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                    {[
                      { label: 'Total Exams', val: stats.totalExams, sub: `${stats.publishedExams} Published`, action: () => setSection('manage-exams') },
                      { label: 'Uploaded Syllabuses', val: stats.totalUploadedSyllabuses, sub: 'AI Parsed Records', action: () => setSection('upload-syllabus') },
                      { label: 'Total Subjects', val: stats.totalSubjects, sub: 'Across All Exams', action: () => setSection('manage-subjects') },
                      { label: 'Total Chapters', val: stats.totalChapters, sub: 'Centralized Hierarchy', action: () => setSection('manage-chapters') },
                      { label: 'Total Topics', val: stats.totalTopics, sub: 'Granular Coverage', action: () => setSection('manage-topics') },
                      { label: 'Total Questions', val: stats.totalQuestions, sub: `${stats.questionsNeedingReview} Need Review`, action: () => setSection('question-bank') },
                      { label: 'Total PDF Notes', val: stats.totalPdfNotes, sub: `${stats.publishedPdfNotes} Published`, action: () => setSection('pdf-notes') },
                      { label: 'Registered Students', val: stats.totalRegisteredStudents, sub: 'Active Learners', action: () => setSection('students') },
                    ].map((card) => (
                      <button
                        key={card.label}
                        type="button"
                        onClick={card.action}
                        className="text-left rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 hover:border-violet-400 transition-colors"
                      >
                        <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                          {card.label}
                        </div>
                        <div className="text-2xl font-display font-bold text-slate-900 dark:text-white mt-1">
                          {card.val}
                        </div>
                        <div className="text-[11px] text-violet-600 dark:text-violet-400 mt-1 font-medium">
                          {card.sub}
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* Quick Actions */}
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
                    <h3 className="font-display font-bold text-base">Quick Admin Actions</h3>
                    <div className="flex flex-wrap gap-2.5">
                      <button
                        type="button"
                        onClick={() => setSection('upload-syllabus')}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold"
                      >
                        <FileUp className="w-4 h-4" />
                        <span>Upload & AI-Process Syllabus</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSection('pdf-notes')}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-semibold"
                      >
                        <FileText className="w-4 h-4 text-blue-600" />
                        <span>Upload Protected PDF Notes</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSection('question-bank')}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-semibold"
                      >
                        <Plus className="w-4 h-4 text-emerald-600" />
                        <span>Add / Bulk Upload Questions</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 2. UPLOAD SYLLABUS (ORGANIZED EXAMINATION CARDS + AI EXTRACTION + REVIEW BEFORE PUBLISH) */}
              {section === 'upload-syllabus' && (() => {
                const q = sylSearch.trim();
                const filterMatch = (...terms: Array<string | undefined>) =>
                  !q || matchesSearchQuery(terms.filter(Boolean).join(' '), q);

                const findExam = (id: string) => exams.find((ex) => ex.id === id);
                const bseExam = findExam('bse-odisha');
                const chseScience = findExam('chse-odisha-science');
                const chseArts = findExam('chse-odisha-arts');
                const chseCommerce = findExam('chse-odisha-commerce');
                const cbseExam = findExam('cbse-board');
                const ugcNetExam = findExam('ugc-net');
                const ctetExam = findExam('ctet');

                const bseCards = [
                  {
                    label: 'Class 10',
                    targetExamId: 'bse-odisha',
                    targetClassId: 'bse-class-10',
                    examName: 'BSE Odisha Board (HSC Class 10)',
                    boardName: 'Board of Secondary Education, Odisha',
                    classLabel: 'Class 10',
                    language: 'odia' as MockLanguage,
                    clsObj: bseExam?.classesOrPapers.find((c) => c.id === 'bse-class-10' || /class\s*10|matric/i.test(c.label)),
                  },
                  {
                    label: 'Class 9',
                    targetExamId: 'bse-odisha',
                    targetClassId: 'bse-class-9',
                    examName: 'BSE Odisha Board (Class 9)',
                    boardName: 'Board of Secondary Education, Odisha',
                    classLabel: 'Class 9',
                    language: 'odia' as MockLanguage,
                    clsObj: bseExam?.classesOrPapers.find((c) => c.id === 'bse-class-9' || /class\s*9\b/i.test(c.label)),
                  },
                  {
                    label: 'Class 8',
                    targetExamId: 'bse-odisha',
                    targetClassId: 'bse-class-8',
                    examName: 'BSE Odisha Board (Class 8)',
                    boardName: 'Board of Secondary Education, Odisha',
                    classLabel: 'Class 8',
                    language: 'odia' as MockLanguage,
                    clsObj: bseExam?.classesOrPapers.find((c) => c.id === 'bse-class-8' || /class\s*8\b/i.test(c.label)),
                  },
                ].filter((c) => filterMatch('BSE Odisha', c.label, c.examName, c.boardName));

                const chseCards = [
                  {
                    label: '+2 Arts',
                    targetExamId: chseArts?.id || 'chse-odisha-arts',
                    targetClassId: chseArts?.classesOrPapers[0]?.id,
                    examName: chseArts?.name || 'CHSE Odisha +2 Arts',
                    boardName: 'Council of Higher Secondary Education, Odisha',
                    classLabel: '+2 Arts',
                    language: 'english' as MockLanguage,
                    subjectsCount: chseArts?.classesOrPapers.reduce((acc, c) => acc + c.subjects.length, 0) || 0,
                  },
                  {
                    label: '+2 Science',
                    targetExamId: chseScience?.id || 'chse-odisha-science',
                    targetClassId: chseScience?.classesOrPapers[0]?.id,
                    examName: chseScience?.name || 'CHSE Odisha +2 Science',
                    boardName: 'Council of Higher Secondary Education, Odisha',
                    classLabel: '+2 Science',
                    language: 'english' as MockLanguage,
                    subjectsCount: chseScience?.classesOrPapers.reduce((acc, c) => acc + c.subjects.length, 0) || 0,
                  },
                  {
                    label: '+2 Commerce',
                    targetExamId: chseCommerce?.id || 'chse-odisha-commerce',
                    targetClassId: chseCommerce?.classesOrPapers[0]?.id,
                    examName: chseCommerce?.name || 'CHSE Odisha +2 Commerce',
                    boardName: 'Council of Higher Secondary Education, Odisha',
                    classLabel: '+2 Commerce',
                    language: 'english' as MockLanguage,
                    subjectsCount: chseCommerce?.classesOrPapers.reduce((acc, c) => acc + c.subjects.length, 0) || 0,
                  },
                ].filter((c) => filterMatch('CHSE Odisha', c.label, c.examName, c.boardName));

                const cbseCards = [
                  {
                    label: 'Class 10',
                    targetExamId: 'cbse-board',
                    targetClassId: 'cbse-class-10',
                    examName: 'CBSE Board (Class 10)',
                    boardName: 'Central Board of Secondary Education',
                    classLabel: 'Class 10 (Secondary)',
                    language: 'english' as MockLanguage,
                    clsObj: cbseExam?.classesOrPapers.find((c) => c.id === 'cbse-class-10' || /class\s*10/i.test(c.label)),
                  },
                  {
                    label: 'Class 12',
                    targetExamId: 'cbse-board',
                    targetClassId: 'cbse-class-12',
                    examName: 'CBSE Board (Class 12)',
                    boardName: 'Central Board of Secondary Education',
                    classLabel: 'Class 12 (Senior Secondary)',
                    language: 'english' as MockLanguage,
                    clsObj: cbseExam?.classesOrPapers.find((c) => c.id === 'cbse-class-12' || /class\s*12/i.test(c.label)),
                  },
                ].filter((c) => filterMatch('CBSE', c.label, c.examName, c.boardName));

                const dynamicCompExams = exams.filter(
                  (ex) =>
                    (ex.category === 'ugc-net' || ex.category === 'competitive') &&
                    ex.id !== 'ugc-net' &&
                    ex.id !== 'ctet',
                );
                const competitiveCards = [
                  {
                    label: 'CTET',
                    sublabel: 'Paper I & Paper II',
                    targetExamId: ctetExam?.id || 'ctet',
                    targetClassId: ctetExam?.classesOrPapers[0]?.id,
                    examName: ctetExam?.name || 'CTET (Central Teacher Eligibility Test)',
                    boardName: 'CBSE / CTET',
                    classLabel: 'Paper I & Paper II',
                    language: 'english' as MockLanguage,
                    subjectsCount: ctetExam?.classesOrPapers.reduce((acc, c) => acc + c.subjects.length, 0) || 0,
                  },
                  ...dynamicCompExams.map((ex) => ({
                    label: ex.name,
                    sublabel: ex.classesOrPapers.map((c) => c.label).join(', ') || 'All Papers',
                    targetExamId: ex.id,
                    targetClassId: ex.classesOrPapers[0]?.id,
                    examName: ex.name,
                    boardName: ex.boardName || ex.name,
                    classLabel: ex.classesOrPapers[0]?.label || 'Standard Level',
                    language: 'english' as MockLanguage,
                    subjectsCount: ex.classesOrPapers.reduce((acc, c) => acc + c.subjects.length, 0),
                  })),
                ].filter((c) => filterMatch('Competitive', c.label, c.sublabel, c.examName));

                const filteredUploads = syllabusUploads.filter((u) => {
                  if (sylStatusFilter !== 'all' && u.status !== sylStatusFilter) return false;
                  if (q && !filterMatch(u.examName, u.boardName, u.classLabel, u.fileName, u.status)) {
                    return false;
                  }
                  return true;
                });

                const getStatusBadgeClasses = (st: SyllabusUploadRecord['status']) => {
                  switch (st) {
                    case 'Published':
                      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300';
                    case 'Update Available':
                      return 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300';
                    case 'Processing':
                      return 'bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300';
                    case 'Failed':
                      return 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300';
                    default:
                      return 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300';
                  }
                };

                return (
                <div className="max-w-6xl mx-auto space-y-6">
                  {/* Dedicated UPSC Civil Services Examination Syllabus Studio */}
                  <div id="admin-upsc-syllabus-studio">
                    <AdminUpscSyllabusPanel
                      adminToken={adminToken}
                      onCatalogSync={onCatalogSync}
                      onOverviewRefresh={loadOverview}
                      onJumpToOutdatedQuestions={() => {
                        setQbExamFilter('upsc-cse');
                        setQbNeedsReviewOnly(true);
                        setSection('question-bank');
                      }}
                    />
                  </div>

                  {/* Dedicated UGC NET Automatic Syllabus Integration & Versioning Studio */}
                  <AdminUgcNetSyllabusPanel
                    adminToken={adminToken}
                    onCatalogSync={onCatalogSync}
                    onOverviewRefresh={loadOverview}
                    onJumpToOutdatedQuestions={() => {
                      setQbExamFilter('ugc-net');
                      setQbNeedsReviewOnly(true);
                      setSection('question-bank');
                    }}
                  />

                  {/* Top Action Bar & Search */}
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h2 className="font-display font-bold text-lg text-slate-900 dark:text-white">
                          One-Time Centralized Syllabus Upload
                        </h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Select an examination card below to upload a syllabus (.pdf, .docx, .doc, .xlsx, .xls, .csv). Publishing automatically syncs Student Portal, Mock Tests, Question Generation, and PDF Notes.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          openPreFilledUploadModal({
                            examName: '',
                            boardName: '',
                            classLabel: 'Standard Level',
                            language: 'english',
                            isNewExam: true,
                          })
                        }
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold shadow-xs"
                      >
                        <Plus className="w-4 h-4" />
                        <span>+ Upload Syllabus for New Exam</span>
                      </button>
                    </div>

                    <div className="max-w-lg">
                      <SearchBarWithVoice
                        value={sylSearch}
                        onChange={setSylSearch}
                        placeholder="Search examinations (BSE Odisha, CHSE, CBSE, UGC NET, CTET, OPSC...)"
                        ariaLabel="Search examinations"
                      />
                    </div>

                    {/* Organized Examination Selection Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                      {/* A. BSE Odisha */}
                      {bseCards.length > 0 && (
                        <div className="rounded-2xl border border-purple-200 dark:border-purple-900/70 bg-purple-50/50 dark:bg-purple-950/20 p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-[11px] font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300">
                                A. BSE Odisha
                              </span>
                              <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
                                Board of Secondary Education, Odisha
                              </h3>
                            </div>
                            <span className="px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-200 text-[11px] font-semibold">
                              Odia Default
                            </span>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            {bseCards.map((card) => (
                              <button
                                key={card.targetClassId}
                                type="button"
                                onClick={() => openPreFilledUploadModal(card)}
                                className="text-left p-3 rounded-xl border border-purple-200 dark:border-purple-800/80 bg-white dark:bg-slate-900 hover:border-purple-500 hover:shadow-xs transition-all"
                              >
                                <div className="font-bold text-sm text-slate-900 dark:text-white">
                                  {card.label}
                                </div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                  {card.clsObj
                                    ? `${card.clsObj.subjects.length} subjects`
                                    : 'Upload PDF'}
                                </div>
                                <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-purple-600 dark:text-purple-400">
                                  <Upload className="w-3 h-3" />
                                  <span>Upload</span>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* B. CHSE Odisha */}
                      {chseCards.length > 0 && (
                        <div className="rounded-2xl border border-indigo-200 dark:border-indigo-900/70 bg-indigo-50/50 dark:bg-indigo-950/20 p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                                B. CHSE Odisha
                              </span>
                              <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
                                +2 Higher Secondary Streams
                              </h3>
                            </div>
                            <span className="px-2 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-200 text-[11px] font-semibold">
                              Arts · Science · Commerce
                            </span>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            {chseCards.map((card) => (
                              <button
                                key={card.label}
                                type="button"
                                onClick={() => openPreFilledUploadModal(card)}
                                className="text-left p-3 rounded-xl border border-indigo-200 dark:border-indigo-800/80 bg-white dark:bg-slate-900 hover:border-indigo-500 hover:shadow-xs transition-all"
                              >
                                <div className="font-bold text-sm text-slate-900 dark:text-white">
                                  {card.label}
                                </div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                  {card.subjectsCount > 0
                                    ? `${card.subjectsCount} subjects`
                                    : 'Upload PDF'}
                                </div>
                                <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                                  <Upload className="w-3 h-3" />
                                  <span>Upload</span>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* C. CBSE */}
                      {cbseCards.length > 0 && (
                        <div className="rounded-2xl border border-blue-200 dark:border-blue-900/70 bg-blue-50/50 dark:bg-blue-950/20 p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                                C. CBSE
                              </span>
                              <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
                                Central Board of Secondary Education
                              </h3>
                            </div>
                            <span className="px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200 text-[11px] font-semibold">
                              NCERT Pattern
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2.5">
                            {cbseCards.map((card) => (
                              <button
                                key={card.targetClassId}
                                type="button"
                                onClick={() => openPreFilledUploadModal(card)}
                                className="text-left p-3 rounded-xl border border-blue-200 dark:border-blue-800/80 bg-white dark:bg-slate-900 hover:border-blue-500 hover:shadow-xs transition-all"
                              >
                                <div className="font-bold text-sm text-slate-900 dark:text-white">
                                  {card.label}
                                </div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                  {card.clsObj
                                    ? `${card.clsObj.subjects.length} subjects synced`
                                    : 'Upload PDF'}
                                </div>
                                <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                                  <Upload className="w-3 h-3" />
                                  <span>Upload Syllabus</span>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* D. Competitive Examinations */}
                      {competitiveCards.length > 0 && (
                        <div className="rounded-2xl border border-teal-200 dark:border-teal-900/70 bg-teal-50/50 dark:bg-teal-950/20 p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-[11px] font-bold uppercase tracking-wider text-teal-700 dark:text-teal-300">
                                D. Competitive Examinations
                              </span>
                              <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
                                UGC NET, CTET &amp; State Competitive
                              </h3>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-40 overflow-y-auto pr-0.5">
                            {competitiveCards.map((card) => (
                              <button
                                key={card.targetExamId}
                                type="button"
                                onClick={() => openPreFilledUploadModal(card)}
                                className="text-left p-2.5 rounded-xl border border-teal-200 dark:border-teal-800/80 bg-white dark:bg-slate-900 hover:border-teal-500 hover:shadow-xs transition-all"
                              >
                                <div className="font-bold text-xs text-slate-900 dark:text-white truncate">
                                  {card.label}
                                </div>
                                <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                  {card.subjectsCount > 0 ? `${card.subjectsCount} subjects` : card.sublabel}
                                </div>
                                <div className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-semibold text-teal-600 dark:text-teal-400">
                                  <Upload className="w-3 h-3" />
                                  <span>Upload</span>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* E. UPSC Civil Services Examination Quick Anchor */}
                      {filterMatch('UPSC', 'Civil Services', 'Prelims', 'Mains', 'GS', 'CSAT', 'Optional') && (
                        <div className="md:col-span-2 rounded-2xl border border-indigo-200 dark:border-indigo-900/70 bg-indigo-50/50 dark:bg-indigo-950/20 p-4 flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <span className="text-[11px] font-bold uppercase tracking-wider text-[#4338CA] dark:text-indigo-300">
                              E. UPSC – Civil Services Examination (CSE)
                            </span>
                            <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
                              Prelims (GS I &amp; CSAT II) · Mains (Essay, GS I–IV &amp; Optional Subjects)
                            </h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              Use the dedicated UPSC Centralized Syllabus Studio above to upload, extract marking patterns, edit topics, and publish live.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              document
                                .getElementById('admin-upsc-syllabus-studio')
                                ?.scrollIntoView({ behavior: 'smooth' })
                            }
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[#4338CA] to-[#2563EB] text-white text-xs font-bold shadow-xs"
                          >
                            <Upload className="w-3.5 h-3.5" />
                            <span>Open UPSC Studio Above</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Interactive Review & Edit Preview Panel Before Publishing */}
                  {activeDraft && (
                    <div className="rounded-2xl border-2 border-violet-500/60 bg-white dark:bg-slate-900 p-5 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span
                              className={`inline-block px-2.5 py-0.5 rounded-md text-xs font-bold ${getStatusBadgeClasses(activeDraft.status)}`}
                            >
                              {activeDraft.status === 'Published'
                                ? 'Published & Synced'
                                : activeDraft.status === 'Update Available'
                                  ? 'Update Available (Conflict Detected)'
                                  : `${activeDraft.status} — Review Before Publishing`}
                            </span>
                            {activeDraft.marksSummary && (
                              <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                                {activeDraft.marksSummary}
                              </span>
                            )}
                          </div>
                          <h3 className="font-display font-bold text-lg">
                            Extracted Syllabus Editor — {activeDraft.fileName}
                          </h3>
                          {activeDraft.detectedPattern && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              Pattern: {activeDraft.detectedPattern}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setActiveDraft(null);
                              setConflictInfo(null);
                            }}
                            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
                          >
                            Close Editor
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleSaveDraft()}
                            className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
                          >
                            Save Draft
                          </button>
                          <button
                            type="button"
                            disabled={publishingDraft}
                            onClick={() => void handlePublishDraft()}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            <span>
                              {publishingDraft
                                ? 'Publishing...'
                                : conflictInfo?.exists || activeDraft.status === 'Update Available'
                                  ? 'Publish & Sync (Resolve Conflict)'
                                  : 'Publish Syllabus'}
                            </span>
                          </button>
                        </div>
                      </div>

                      {(conflictInfo?.exists || activeDraft.status === 'Update Available') && (
                        <div className="p-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 flex flex-wrap items-center justify-between gap-2 text-xs text-blue-900 dark:text-blue-200">
                          <span>
                            <strong>Existing syllabus found</strong> for{' '}
                            <span className="font-semibold">
                              {conflictInfo?.examName || activeDraft.examName}
                            </span>{' '}
                            ({conflictInfo?.classLabel || activeDraft.classLabel}). Clicking{' '}
                            <strong>Publish</strong> will let you replace the existing syllabus or create a new academic session ({activeDraft.academicSession}).
                          </span>
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                            Exam Name
                          </label>
                          <input
                            type="text"
                            value={activeDraft.examName}
                            onChange={(e) =>
                              setActiveDraft({ ...activeDraft, examName: e.target.value })
                            }
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-medium"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                            Board / Org
                          </label>
                          <input
                            type="text"
                            value={activeDraft.boardName}
                            onChange={(e) =>
                              setActiveDraft({ ...activeDraft, boardName: e.target.value })
                            }
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                            Class / Level
                          </label>
                          <input
                            type="text"
                            value={activeDraft.classLabel}
                            onChange={(e) =>
                              setActiveDraft({ ...activeDraft, classLabel: e.target.value })
                            }
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                            Session
                          </label>
                          <input
                            type="text"
                            value={activeDraft.academicSession}
                            onChange={(e) =>
                              setActiveDraft({ ...activeDraft, academicSession: e.target.value })
                            }
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                            Marks Distribution Summary
                          </label>
                          <input
                            type="text"
                            value={activeDraft.marksSummary || ''}
                            placeholder="e.g. Theory 80 + Internal 20"
                            onChange={(e) =>
                              setActiveDraft({ ...activeDraft, marksSummary: e.target.value })
                            }
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                          />
                        </div>
                      </div>

                      {/* Detected / Available Question Formats */}
                      <div className="space-y-1.5">
                        <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                          Allowed Question Formats (Synced with Question Generation &amp; Mock Tests)
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {ALL_QUESTION_FORMATS.map((fmt) => {
                            const selected = (activeDraft.availableQuestionFormats || []).includes(fmt.id);
                            return (
                              <button
                                key={fmt.id}
                                type="button"
                                onClick={() => {
                                  const cur = activeDraft.availableQuestionFormats || [];
                                  const next = selected
                                    ? cur.filter((id) => id !== fmt.id)
                                    : [...cur, fmt.id];
                                  setActiveDraft({
                                    ...activeDraft,
                                    availableQuestionFormats: next,
                                  });
                                }}
                                className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors ${
                                  selected
                                    ? 'border-violet-600 bg-violet-600 text-white'
                                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-300'
                                }`}
                              >
                                {fmt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                          Extracted Subjects ({activeDraft.subjects.length})
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            updateDraftSubjects((subs) => [
                              ...subs,
                              {
                                name: `New Subject ${subs.length + 1}`,
                                chapters: [{ name: 'Chapter 1', topics: ['Overview'], subtopics: [] }],
                              },
                            ])
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 text-xs font-semibold"
                        >
                          <Plus className="w-3.5 h-3.5" /> Add Subject
                        </button>
                      </div>

                      <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                        {activeDraft.subjects.map((subj, sIdx) => (
                          <div
                            key={sIdx}
                            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950/60 p-3.5 space-y-2.5"
                          >
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={subj.name}
                                onChange={(e) =>
                                  updateDraftSubjects((subs) => {
                                    subs[sIdx].name = e.target.value;
                                    return subs;
                                  })
                                }
                                className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-bold"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  updateDraftSubjects((subs) => {
                                    subs[sIdx].chapters.push({
                                      name: `Chapter ${subs[sIdx].chapters.length + 1}`,
                                      topics: ['Topic 1'],
                                      subtopics: [],
                                    });
                                    return subs;
                                  })
                                }
                                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold"
                              >
                                + Chapter
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  updateDraftSubjects((subs) => subs.filter((_, idx) => idx !== sIdx))
                                }
                                className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                                title="Remove Subject"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>

                            <div className="space-y-2.5 pl-2 border-l-2 border-violet-300 dark:border-violet-800">
                              {subj.chapters.map((ch, cIdx) => (
                                <div key={cIdx} className="space-y-1.5 p-2 rounded-lg bg-white/70 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <input
                                      type="text"
                                      value={ch.name}
                                      onChange={(e) =>
                                        updateDraftSubjects((subs) => {
                                          subs[sIdx].chapters[cIdx].name = e.target.value;
                                          return subs;
                                        })
                                      }
                                      placeholder="Chapter / Unit Name"
                                      className="flex-1 min-w-[180px] px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold"
                                    />
                                    <input
                                      type="text"
                                      value={ch.marks || ''}
                                      onChange={(e) =>
                                        updateDraftSubjects((subs) => {
                                          subs[sIdx].chapters[cIdx].marks = e.target.value;
                                          return subs;
                                        })
                                      }
                                      placeholder="Marks (e.g. 10)"
                                      className="w-24 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                                    />
                                    <select
                                      value={ch.term || ''}
                                      onChange={(e) =>
                                        updateDraftSubjects((subs) => {
                                          const val = e.target.value;
                                          subs[sIdx].chapters[cIdx].term =
                                            val === 'Term I' || val === 'Term II' ? val : undefined;
                                          return subs;
                                        })
                                      }
                                      className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                                    >
                                      <option value="">All Terms</option>
                                      <option value="Term I">Term I</option>
                                      <option value="Term II">Term II</option>
                                    </select>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        updateDraftSubjects((subs) => {
                                          subs[sIdx].chapters = subs[sIdx].chapters.filter(
                                            (_, idx) => idx !== cIdx,
                                          );
                                          return subs;
                                        })
                                      }
                                      className="p-1 text-red-500"
                                      title="Remove Chapter"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                  <input
                                    type="text"
                                    value={ch.topics.join(', ')}
                                    onChange={(e) =>
                                      updateDraftSubjects((subs) => {
                                        subs[sIdx].chapters[cIdx].topics = e.target.value
                                          .split(',')
                                          .map((t) => t.trim())
                                          .filter(Boolean);
                                        return subs;
                                      })
                                    }
                                    placeholder="Comma-separated topics..."
                                    className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-200"
                                  />
                                  <input
                                    type="text"
                                    value={(ch.subtopics || []).join(', ')}
                                    onChange={(e) =>
                                      updateDraftSubjects((subs) => {
                                        subs[sIdx].chapters[cIdx].subtopics = e.target.value
                                          .split(',')
                                          .map((t) => t.trim())
                                          .filter(Boolean);
                                        return subs;
                                      })
                                    }
                                    placeholder="Comma-separated subtopics (optional)..."
                                    className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] text-slate-500 dark:text-slate-400"
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Uploaded Syllabus Drafts & History Table */}
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-display font-bold text-base">
                        Uploaded Syllabus Files ({filteredUploads.length} / {syllabusUploads.length})
                      </h3>
                      <div className="flex flex-wrap gap-1.5">
                        {(['all', 'Draft', 'Update Available', 'Published', 'Failed'] as const).map((st) => (
                          <button
                            key={st}
                            type="button"
                            onClick={() => setSylStatusFilter(st)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                              sylStatusFilter === st
                                ? 'border-violet-600 bg-violet-600 text-white'
                                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                            }`}
                          >
                            {st === 'all' ? 'All' : st}
                          </button>
                        ))}
                      </div>
                    </div>

                    {filteredUploads.length === 0 ? (
                      <p className="text-sm text-slate-500">
                        No uploaded syllabus records match this filter. Click any examination card above to upload a syllabus.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                          <thead className="text-xs uppercase text-slate-500 border-b border-slate-200 dark:border-slate-800">
                            <tr>
                              <th className="py-2 pr-3">File / Exam</th>
                              <th className="py-2 px-3">Class</th>
                              <th className="py-2 px-3">Session</th>
                              <th className="py-2 px-3">Subjects</th>
                              <th className="py-2 px-3">Status</th>
                              <th className="py-2 pl-3 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {filteredUploads.map((u) => (
                              <tr key={u.id}>
                                <td className="py-2.5 pr-3">
                                  <div className="font-semibold">{u.examName}</div>
                                  <div className="text-xs text-slate-500">{u.fileName}</div>
                                  {u.errorMessage && (
                                    <div className="text-[11px] text-red-600 dark:text-red-400 mt-0.5">
                                      {u.errorMessage}
                                    </div>
                                  )}
                                </td>
                                <td className="py-2.5 px-3">{u.classLabel}</td>
                                <td className="py-2.5 px-3">{u.academicSession}</td>
                                <td className="py-2.5 px-3">{u.subjects.length}</td>
                                <td className="py-2.5 px-3">
                                  <span
                                    className={`inline-block px-2 py-0.5 rounded-md text-xs font-semibold ${getStatusBadgeClasses(u.status)}`}
                                  >
                                    {u.status}
                                  </span>
                                </td>
                                <td className="py-2.5 pl-3 text-right space-x-2 whitespace-nowrap">
                                  {u.status !== 'Failed' && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActiveDraft(u);
                                        setConflictInfo(null);
                                      }}
                                      className="text-xs font-semibold text-violet-600 hover:underline"
                                    >
                                      Review / Edit
                                    </button>
                                  )}
                                  {u.status !== 'Failed' && u.status !== 'Published' && u.subjects.length > 0 && (
                                    <button
                                      type="button"
                                      disabled={publishingDraft}
                                      onClick={() => {
                                        setActiveDraft(u);
                                        void handlePublishDraft(u);
                                      }}
                                      className="text-xs font-semibold text-emerald-600 hover:underline"
                                    >
                                      Publish
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setConfirmState({
                                        title: 'Delete Syllabus Upload Record',
                                        message: `Remove uploaded syllabus draft "${u.fileName}"?`,
                                        confirmLabel: 'Delete Record',
                                        onConfirm: async () => {
                                          const res = await deleteSyllabusDraft(adminToken, u.id);
                                          setSyllabusUploads((prev) => prev.filter((x) => x.id !== u.id));
                                          setStats(res.stats);
                                          if (activeDraft?.id === u.id) setActiveDraft(null);
                                          flashSuccess('Deleted syllabus upload record.');
                                        },
                                      })
                                    }
                                    className="text-xs font-semibold text-red-600 hover:underline"
                                  >
                                    Delete
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
                );
              })()}

              {/* 3. MANAGE EXAMS */}
              {section === 'manage-exams' && (
                <div className="max-w-6xl mx-auto space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-display font-bold text-lg">
                      Centralized Examinations Table ({exams.length})
                    </h2>
                    <button
                      type="button"
                      onClick={() =>
                        setExamModal({
                          mode: 'create',
                          exam: {
                            id: '',
                            category: 'competitive',
                            name: '',
                            boardName: '',
                            academicSession: '2025-26',
                            status: 'Published',
                            shortDesc: '',
                            defaultMarksPerQuestion: 1,
                            defaultNegativeMarking: false,
                            defaultNegativePenalty: 0,
                            isCustom: true,
                            classesOrPapers: [
                              {
                                id: 'class-default',
                                label: 'Standard Level',
                                subjects: [
                                  {
                                    name: 'General Subject',
                                    chapters: [{ name: 'Chapter 1', topics: ['Introduction'] }],
                                  },
                                ],
                              },
                            ],
                          },
                        })
                      }
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold"
                    >
                      <Plus className="w-4 h-4" /> Add Examination
                    </button>
                  </div>

                  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs uppercase text-slate-500 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="py-3 px-4">Exam Name</th>
                          <th className="py-3 px-3">Class / Papers</th>
                          <th className="py-3 px-3">Subjects</th>
                          <th className="py-3 px-3">Session</th>
                          <th className="py-3 px-3 text-center">Chapters</th>
                          <th className="py-3 px-3 text-center">Topics</th>
                          <th className="py-3 px-3">Status</th>
                          <th className="py-3 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {exams.map((ex) => {
                          const subjCount = ex.classesOrPapers.reduce(
                            (a, c) => a + c.subjects.length,
                            0,
                          );
                          const chapCount = ex.classesOrPapers.reduce(
                            (a, c) => a + c.subjects.reduce((b, s) => b + s.chapters.length, 0),
                            0,
                          );
                          const topicCount = ex.classesOrPapers.reduce(
                            (a, c) =>
                              a +
                              c.subjects.reduce(
                                (b, s) => b + s.chapters.reduce((t, ch) => t + ch.topics.length, 0),
                                0,
                              ),
                            0,
                          );
                          const isDraft = ex.status === 'Draft';
                          return (
                            <tr key={ex.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                              <td className="py-3 px-4">
                                <div className="font-bold text-slate-900 dark:text-white">{ex.name}</div>
                                <div className="text-xs text-slate-500 truncate max-w-[220px]">
                                  {ex.boardName || ex.shortDesc}
                                </div>
                              </td>
                              <td className="py-3 px-3 text-xs">
                                {ex.classesOrPapers.map((c) => c.label).join(', ') || '—'}
                              </td>
                              <td className="py-3 px-3">{subjCount}</td>
                              <td className="py-3 px-3 text-xs">{ex.academicSession || '2025-26'}</td>
                              <td className="py-3 px-3 text-center font-semibold">{chapCount}</td>
                              <td className="py-3 px-3 text-center font-semibold">{topicCount}</td>
                              <td className="py-3 px-3">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded-md text-xs font-semibold ${
                                    isDraft
                                      ? 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                      : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                  }`}
                                >
                                  {isDraft ? 'Draft' : 'Published'}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-right whitespace-nowrap space-x-2">
                                <button
                                  type="button"
                                  onClick={() => setExamModal({ mode: 'view', exam: ex })}
                                  className="text-xs font-semibold text-slate-600 dark:text-slate-300 hover:underline"
                                >
                                  View
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExamModal({
                                      mode: 'edit',
                                      exam: JSON.parse(JSON.stringify(ex)) as ExamDefinition,
                                    })
                                  }
                                  className="text-xs font-semibold text-violet-600 hover:underline"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSylExamName(ex.name);
                                    setSylBoardName(ex.boardName || '');
                                    setSylSession(ex.academicSession || '2025-26');
                                    setSection('upload-syllabus');
                                  }}
                                  className="text-xs font-semibold text-blue-600 hover:underline"
                                >
                                  Replace Syllabus
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void persistExamUpdate(
                                      { ...ex, status: isDraft ? 'Published' : 'Draft' },
                                      `Updated "${ex.name}" status to ${isDraft ? 'Published' : 'Draft'}.`,
                                    )
                                  }
                                  className="text-xs font-semibold text-amber-600 hover:underline"
                                >
                                  {isDraft ? 'Publish' : 'Unpublish'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setConfirmState({
                                      title: 'Delete Examination',
                                      message: `Delete "${ex.name}" from centralized catalog? Associated Question Bank entries will be preserved and flagged for review.`,
                                      confirmLabel: 'Delete Exam',
                                      onConfirm: async () => {
                                        const res = await deleteAdminExam(adminToken, ex.id);
                                        setExams((prev) => prev.filter((item) => item.id !== ex.id));
                                        setStats(res.stats);
                                        await loadOverview(true);
                                        await onCatalogSync();
                                        flashSuccess(`Deleted "${ex.name}".`);
                                      },
                                    })
                                  }
                                  className="text-xs font-semibold text-red-600 hover:underline"
                                >
                                  Delete
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 4, 5, 6. MANAGE SUBJECTS / CHAPTERS / TOPICS */}
              {(section === 'manage-subjects' ||
                section === 'manage-chapters' ||
                section === 'manage-topics') && (
                <div className="max-w-5xl mx-auto space-y-5">
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Exam</label>
                      <select
                        value={activeExamObj?.id || ''}
                        onChange={(e) => setSelExamId(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                      >
                        {exams.map((ex) => (
                          <option key={ex.id} value={ex.id}>
                            {ex.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">
                        Class / Paper
                      </label>
                      <select
                        value={activeClassObj?.id || ''}
                        onChange={(e) => setSelClassId(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                      >
                        {(activeExamObj?.classesOrPapers || []).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    {(section === 'manage-chapters' || section === 'manage-topics') && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">
                          Subject
                        </label>
                        <select
                          value={activeSubjectObj?.name || ''}
                          onChange={(e) => setSelSubjectName(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                        >
                          {(activeClassObj?.subjects || []).map((s, idx) => (
                            <option key={`${s.name}-${idx}`} value={s.name}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    {section === 'manage-topics' && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">
                          Chapter
                        </label>
                        <select
                          value={activeChapterObj?.name || ''}
                          onChange={(e) => setSelChapterName(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                        >
                          {(activeSubjectObj?.chapters || []).map((ch, idx) => (
                            <option key={`${ch.name}-${idx}`} value={ch.name}>
                              {ch.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {/* MANAGE SUBJECTS */}
                  {section === 'manage-subjects' && activeExamObj && activeClassObj && (
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          value={newSubjectName}
                          onChange={(e) => setNewSubjectName(e.target.value)}
                          placeholder="New Subject Name (e.g., Artificial Intelligence)"
                          className="flex-1 min-w-[220px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const name = newSubjectName.trim();
                            if (!name) return;
                            const cloned = JSON.parse(JSON.stringify(activeExamObj)) as ExamDefinition;
                            const cls = cloned.classesOrPapers.find((c) => c.id === activeClassObj.id);
                            if (!cls) return;
                            cls.subjects.push({
                              name,
                              chapters: [{ name: 'Chapter 1', topics: ['Introduction'] }],
                            });
                            setNewSubjectName('');
                            void persistExamUpdate(cloned, `Added subject "${name}".`);
                          }}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold"
                        >
                          <Plus className="w-4 h-4" /> Add Subject
                        </button>
                      </div>

                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {activeClassObj.subjects.map((subj, idx) => {
                          const rKey = `sub-${idx}`;
                          return (
                            <div key={rKey} className="py-3 flex items-center justify-between gap-3">
                              {renamingKey === rKey ? (
                                <div className="flex items-center gap-2 flex-1">
                                  <input
                                    type="text"
                                    value={renamingVal}
                                    onChange={(e) => setRenamingVal(e.target.value)}
                                    className="flex-1 px-2.5 py-1.5 rounded-lg border border-violet-400 text-sm"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const cloned = JSON.parse(JSON.stringify(activeExamObj)) as ExamDefinition;
                                      const cls = cloned.classesOrPapers.find((c) => c.id === activeClassObj.id);
                                      if (cls && renamingVal.trim()) {
                                        cls.subjects[idx].name = renamingVal.trim();
                                        void persistExamUpdate(cloned, 'Renamed subject.');
                                      }
                                      setRenamingKey(null);
                                    }}
                                    className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold"
                                  >
                                    Save
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <div>
                                    <div className="font-semibold text-sm">{subj.name}</div>
                                    <div className="text-xs text-slate-500">
                                      {subj.chapters.length} chapters ·{' '}
                                      {subj.chapters.reduce((a, c) => a + c.topics.length, 0)} topics
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelSubjectName(subj.name);
                                        setSection('manage-chapters');
                                      }}
                                      className="text-xs font-semibold text-blue-600 hover:underline"
                                    >
                                      Chapters <ChevronRight className="w-3 h-3 inline" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setRenamingKey(rKey);
                                        setRenamingVal(subj.name);
                                      }}
                                      className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                                    >
                                      <Edit3 className="w-4 h-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setConfirmState({
                                          title: 'Delete Subject',
                                          message: `Remove subject "${subj.name}" from ${activeExamObj.name}?`,
                                          confirmLabel: 'Delete Subject',
                                          onConfirm: async () => {
                                            const cloned = JSON.parse(JSON.stringify(activeExamObj)) as ExamDefinition;
                                            const cls = cloned.classesOrPapers.find((c) => c.id === activeClassObj.id);
                                            if (cls) {
                                              cls.subjects = cls.subjects.filter((_, i) => i !== idx);
                                              await persistExamUpdate(cloned, `Deleted subject "${subj.name}".`);
                                            }
                                          },
                                        })
                                      }
                                      className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* MANAGE CHAPTERS */}
                  {section === 'manage-chapters' && activeExamObj && activeClassObj && activeSubjectObj && (
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          value={newChapterName}
                          onChange={(e) => setNewChapterName(e.target.value)}
                          placeholder="New Chapter Name"
                          className="flex-1 min-w-[220px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                        />
                        <select
                          value={newChapterTerm}
                          onChange={(e) => setNewChapterTerm(e.target.value as 'Term I' | 'Term II')}
                          className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                        >
                          <option value="Term I">Term I</option>
                          <option value="Term II">Term II</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            const name = newChapterName.trim();
                            if (!name) return;
                            const cloned = JSON.parse(JSON.stringify(activeExamObj)) as ExamDefinition;
                            const sub = cloned.classesOrPapers
                              .find((c) => c.id === activeClassObj.id)
                              ?.subjects.find((s) => s.name === activeSubjectObj.name);
                            if (!sub) return;
                            sub.chapters.push({ name, term: newChapterTerm, topics: ['Core Concepts'] });
                            setNewChapterName('');
                            void persistExamUpdate(cloned, `Added chapter "${name}".`);
                          }}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold"
                        >
                          <Plus className="w-4 h-4" /> Add Chapter
                        </button>
                      </div>

                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {activeSubjectObj.chapters.map((ch, idx) => {
                          const rKey = `ch-${idx}`;
                          return (
                            <div key={rKey} className="py-3 flex items-center justify-between gap-3">
                              {renamingKey === rKey ? (
                                <div className="flex items-center gap-2 flex-1">
                                  <input
                                    type="text"
                                    value={renamingVal}
                                    onChange={(e) => setRenamingVal(e.target.value)}
                                    className="flex-1 px-2.5 py-1.5 rounded-lg border border-violet-400 text-sm"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const cloned = JSON.parse(JSON.stringify(activeExamObj)) as ExamDefinition;
                                      const sub = cloned.classesOrPapers
                                        .find((c) => c.id === activeClassObj.id)
                                        ?.subjects.find((s) => s.name === activeSubjectObj.name);
                                      if (sub && renamingVal.trim()) {
                                        sub.chapters[idx].name = renamingVal.trim();
                                        void persistExamUpdate(cloned, 'Renamed chapter.');
                                      }
                                      setRenamingKey(null);
                                    }}
                                    className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold"
                                  >
                                    Save
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <div>
                                    <div className="font-semibold text-sm flex items-center gap-2">
                                      <span>{ch.name}</span>
                                      {ch.term && (
                                        <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[11px] font-medium">
                                          {ch.term}
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-xs text-slate-500">
                                      {ch.topics.length} topics
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelChapterName(ch.name);
                                        setSection('manage-topics');
                                      }}
                                      className="text-xs font-semibold text-blue-600 hover:underline"
                                    >
                                      Topics <ChevronRight className="w-3 h-3 inline" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setRenamingKey(rKey);
                                        setRenamingVal(ch.name);
                                      }}
                                      className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                                    >
                                      <Edit3 className="w-4 h-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setConfirmState({
                                          title: 'Delete Chapter',
                                          message: `Remove chapter "${ch.name}" from ${activeSubjectObj.name}?`,
                                          confirmLabel: 'Delete Chapter',
                                          onConfirm: async () => {
                                            const cloned = JSON.parse(JSON.stringify(activeExamObj)) as ExamDefinition;
                                            const sub = cloned.classesOrPapers
                                              .find((c) => c.id === activeClassObj.id)
                                              ?.subjects.find((s) => s.name === activeSubjectObj.name);
                                            if (sub) {
                                              sub.chapters = sub.chapters.filter((_, i) => i !== idx);
                                              await persistExamUpdate(cloned, `Deleted chapter "${ch.name}".`);
                                            }
                                          },
                                        })
                                      }
                                      className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* MANAGE TOPICS */}
                  {section === 'manage-topics' &&
                    activeExamObj &&
                    activeClassObj &&
                    activeSubjectObj &&
                    activeChapterObj && (
                      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="text"
                            value={newTopicName}
                            onChange={(e) => setNewTopicName(e.target.value)}
                            placeholder="New Topic Name"
                            className="flex-1 min-w-[220px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const name = newTopicName.trim();
                              if (!name) return;
                              const cloned = JSON.parse(JSON.stringify(activeExamObj)) as ExamDefinition;
                              const ch = cloned.classesOrPapers
                                .find((c) => c.id === activeClassObj.id)
                                ?.subjects.find((s) => s.name === activeSubjectObj.name)
                                ?.chapters.find((c) => c.name === activeChapterObj.name);
                              if (!ch) return;
                              if (!ch.topics.includes(name)) ch.topics.push(name);
                              setNewTopicName('');
                              void persistExamUpdate(cloned, `Added topic "${name}".`);
                            }}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold"
                          >
                            <Plus className="w-4 h-4" /> Add Topic
                          </button>
                        </div>

                        <div className="divide-y divide-slate-100 dark:divide-slate-800">
                          {activeChapterObj.topics.map((topic, idx) => {
                            const rKey = `top-${idx}`;
                            return (
                              <div key={rKey} className="py-2.5 flex items-center justify-between gap-3">
                                {renamingKey === rKey ? (
                                  <div className="flex items-center gap-2 flex-1">
                                    <input
                                      type="text"
                                      value={renamingVal}
                                      onChange={(e) => setRenamingVal(e.target.value)}
                                      className="flex-1 px-2.5 py-1.5 rounded-lg border border-violet-400 text-sm"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const cloned = JSON.parse(JSON.stringify(activeExamObj)) as ExamDefinition;
                                        const ch = cloned.classesOrPapers
                                          .find((c) => c.id === activeClassObj.id)
                                          ?.subjects.find((s) => s.name === activeSubjectObj.name)
                                          ?.chapters.find((c) => c.name === activeChapterObj.name);
                                        if (ch && renamingVal.trim()) {
                                          ch.topics[idx] = renamingVal.trim();
                                          void persistExamUpdate(cloned, 'Renamed topic.');
                                        }
                                        setRenamingKey(null);
                                      }}
                                      className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold"
                                    >
                                      Save
                                    </button>
                                  </div>
                                ) : (
                                  <>
                                    <span className="text-sm font-medium">{topic}</span>
                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setRenamingKey(rKey);
                                          setRenamingVal(topic);
                                        }}
                                        className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                                      >
                                        <Edit3 className="w-4 h-4" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setConfirmState({
                                            title: 'Delete Topic',
                                            message: `Remove topic "${topic}" from ${activeChapterObj.name}?`,
                                            confirmLabel: 'Delete Topic',
                                            onConfirm: async () => {
                                              const cloned = JSON.parse(JSON.stringify(activeExamObj)) as ExamDefinition;
                                              const ch = cloned.classesOrPapers
                                                .find((c) => c.id === activeClassObj.id)
                                                ?.subjects.find((s) => s.name === activeSubjectObj.name)
                                                ?.chapters.find((c) => c.name === activeChapterObj.name);
                                              if (ch) {
                                                ch.topics = ch.topics.filter((_, i) => i !== idx);
                                                await persistExamUpdate(cloned, `Deleted topic "${topic}".`);
                                              }
                                            },
                                          })
                                        }
                                        className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                </div>
              )}

              {/* 7. QUESTION BANK */}
              {section === 'question-bank' && (
                <div className="max-w-6xl mx-auto space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-display font-bold text-lg">
                      Centralized Question Bank ({filteredQuestions.length})
                    </h2>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setBulkModalOpen(true)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <Upload className="w-4 h-4 text-blue-600" /> Bulk Upload (CSV/JSON)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const ex = exams[0];
                          const cls = ex?.classesOrPapers[0];
                          const sub = cls?.subjects[0];
                          setQuestionModal({
                            mode: 'create',
                            data: {
                              examId: ex?.id || '',
                              examName: ex?.name || '',
                              classId: cls?.id || '',
                              classLabel: cls?.label || '',
                              subject: sub?.name || '',
                              chapter: sub?.chapters[0]?.name || '',
                              topic: sub?.chapters[0]?.topics[0] || '',
                              typeId: 'MCQ',
                              marks: 1,
                              difficulty: 'Medium',
                              language: 'english',
                              options: ['Option A', 'Option B', 'Option C', 'Option D'],
                              question: '',
                              correctAnswer: '',
                              explanation: '',
                            },
                          });
                        }}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs sm:text-sm font-semibold"
                      >
                        <Plus className="w-4 h-4" /> Add Question
                      </button>
                    </div>
                  </div>

                  {/* Filters */}
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-center">
                    <SearchBarWithVoice
                      compact
                      value={qbSearch}
                      onChange={setQbSearch}
                      placeholder="Search question, chapter..."
                      ariaLabel="Search question bank"
                    />
                    <select
                      value={qbExamFilter}
                      onChange={(e) => setQbExamFilter(e.target.value)}
                      className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                    >
                      <option value="all">All Examinations</option>
                      {!exams.some((ex) => ex.id === 'ugc-net') &&
                        (qbExamFilter === 'ugc-net' ||
                          questions.some((q) => q.examId === 'ugc-net')) && (
                          <option value="ugc-net">UGC NET / JRF (Unpublished / Review)</option>
                        )}
                      {exams.map((ex) => (
                        <option key={ex.id} value={ex.id}>
                          {ex.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={qbTypeFilter}
                      onChange={(e) => setQbTypeFilter(e.target.value)}
                      className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                    >
                      <option value="all">All 16 Question Types</option>
                      {ALL_QUESTION_FORMATS.map((fmt) => (
                        <option key={fmt.id} value={fmt.id}>
                          {fmt.label}
                        </option>
                      ))}
                    </select>
                    <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={qbNeedsReviewOnly}
                        onChange={(e) => setQbNeedsReviewOnly(e.target.checked)}
                        className="rounded border-slate-300 text-violet-600"
                      />
                      <span>Flagged Needs Review Only ({stats.questionsNeedingReview})</span>
                    </label>
                  </div>

                  {filteredQuestions.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center text-sm text-slate-500">
                      No questions match your current filters. Use "Add Question" or "Bulk Upload" to build your centralized Question Bank.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {filteredQuestions.map((q) => (
                        <div
                          key={q.id}
                          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="px-2 py-0.5 rounded bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 font-bold">
                                {q.typeId}
                              </span>
                              <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-semibold">
                                {q.marks} Mark(s) · {q.difficulty}
                              </span>
                              <span className="text-slate-500">
                                {q.examName} · {q.subject} · {q.chapter}
                              </span>
                              {q.needsReview && (
                                <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 font-bold">
                                  Needs Review: {q.syllabusChangeReason || 'Syllabus updated'}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              {q.needsReview && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const res = await updateAdminQuestion(adminToken, q.id, {
                                      needsReview: false,
                                      syllabusChangeReason: undefined,
                                    });
                                    setQuestions((prev) =>
                                      prev.map((it) => (it.id === res.question.id ? res.question : it)),
                                    );
                                    setStats(res.stats);
                                  }}
                                  className="text-xs font-semibold text-emerald-600 hover:underline"
                                >
                                  Mark Reviewed
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setQuestionModal({ mode: 'edit', data: { ...q } })}
                                className="text-xs font-semibold text-violet-600 hover:underline"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setConfirmState({
                                    title: 'Delete Question',
                                    message: 'Permanently delete this question from the centralized bank?',
                                    confirmLabel: 'Delete Question',
                                    onConfirm: async () => {
                                      const res = await deleteAdminQuestion(adminToken, q.id);
                                      setQuestions((prev) => prev.filter((it) => it.id !== q.id));
                                      setStats(res.stats);
                                      flashSuccess('Deleted question.');
                                    },
                                  })
                                }
                                className="text-xs font-semibold text-red-600 hover:underline"
                              >
                                Delete
                              </button>
                            </div>
                          </div>

                          <div className="text-sm font-medium text-slate-900 dark:text-white">
                            {q.question}
                          </div>
                          {q.options && q.options.length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                              {q.options.map((opt, idx) => (
                                <div key={idx} className="px-2.5 py-1 rounded bg-slate-50 dark:bg-slate-950">
                                  {String.fromCharCode(65 + idx)}. {opt}
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold">
                            Answer: {q.correctAnswer}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 8. PDF NOTES MANAGEMENT */}
              {section === 'pdf-notes' && (
                <div className="max-w-6xl mx-auto space-y-6">
                  {previewPdfNote && (
                    <div className="h-[620px]">
                      <ProtectedPdfCanvasReader
                        noteId={previewPdfNote.id}
                        title={`Admin Preview: ${previewPdfNote.title}`}
                        subtitle={`${previewPdfNote.examName} · ${previewPdfNote.subject} · ${previewPdfNote.published ? 'Published' : 'Draft'}`}
                        authToken={adminToken}
                        onClose={() => setPreviewPdfNote(null)}
                      />
                    </div>
                  )}

                  {/* Upload PDF Note Form (Exam PDF Notes | NCERT Notes Class 6-12 | UPSC Notes) */}
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h2 className="font-display font-bold text-lg">
                          Upload Study PDF Notes (Online Reading Only)
                        </h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Choose a category: Examination Notes, NCERT Notes (Class 6–12 with Book Name), or UPSC Prelims/Mains Notes. Streamed securely inside Protected Canvas Reader.
                        </p>
                      </div>

                      <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 p-1 bg-slate-50 dark:bg-slate-950">
                        {(
                          [
                            { id: 'exam', label: 'Exam PDF Notes' },
                            { id: 'ncert', label: 'NCERT Notes (6–12)' },
                            { id: 'upsc', label: 'UPSC Notes' },
                          ] as const
                        ).map((cat) => (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => setPdfCategory(cat.id)}
                            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                              pdfCategory === cat.id
                                ? 'bg-gradient-to-r from-[#4338CA] to-[#2563EB] text-white shadow-xs'
                                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                            }`}
                          >
                            {cat.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                          PDF Title *
                        </label>
                        <input
                          type="text"
                          value={pdfTitle}
                          onChange={(e) => setPdfTitle(e.target.value)}
                          placeholder={
                            pdfCategory === 'ncert'
                              ? 'e.g., Chapter 2 – From Trade to Territory Notes'
                              : pdfCategory === 'upsc'
                                ? 'e.g., Fundamental Rights & Constitutional Remedies'
                                : 'e.g., Quadratic Equations Short Notes'
                          }
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                        />
                      </div>

                      {pdfCategory === 'exam' && (
                        <>
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                              Exam *
                            </label>
                            <select
                              value={pdfExamObj?.id || ''}
                              onChange={(e) => setPdfExamId(e.target.value)}
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                            >
                              {exams.map((ex) => (
                                <option key={ex.id} value={ex.id}>
                                  {ex.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                              Class / Level
                            </label>
                            <select
                              value={pdfClassObj?.id || ''}
                              onChange={(e) => setPdfClassId(e.target.value)}
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                            >
                              {(pdfExamObj?.classesOrPapers || []).map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                              Subject *
                            </label>
                            <select
                              value={pdfSubject}
                              onChange={(e) => setPdfSubject(e.target.value)}
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                            >
                              {(pdfClassObj?.subjects || []).map((s, idx) => (
                                <option key={`${s.name}-${idx}`} value={s.name}>
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
                              value={pdfChapter}
                              onChange={(e) => setPdfChapter(e.target.value)}
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                            >
                              <option value="All Chapters">All Chapters</option>
                              {(pdfSubjectObj?.chapters || []).map((ch, idx) => (
                                <option key={`${ch.name}-${idx}`} value={ch.name}>
                                  {ch.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </>
                      )}

                      {pdfCategory === 'ncert' && (
                        <>
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                              NCERT Class (6 to 12) *
                            </label>
                            <select
                              value={ncertClass}
                              onChange={(e) => setNcertClass(e.target.value)}
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                            >
                              {[
                                'Class 6',
                                'Class 7',
                                'Class 8',
                                'Class 9',
                                'Class 10',
                                'Class 11',
                                'Class 12',
                              ].map((cl) => (
                                <option key={cl} value={cl}>
                                  {cl}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                              NCERT Subject *
                            </label>
                            <input
                              type="text"
                              list="ncert-subject-suggestions"
                              value={ncertSubject}
                              onChange={(e) => setNcertSubject(e.target.value)}
                              placeholder="History, Geography, Polity..."
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                            />
                            <datalist id="ncert-subject-suggestions">
                              {[
                                'History',
                                'Geography',
                                'Political Science',
                                'Economics',
                                'Science',
                                'Mathematics',
                                'Sociology',
                                'Biology',
                                'Physics',
                                'Chemistry',
                              ].map((sub) => (
                                <option key={sub} value={sub} />
                              ))}
                            </datalist>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                              NCERT Book Name *
                            </label>
                            <input
                              type="text"
                              value={ncertBookName}
                              onChange={(e) => setNcertBookName(e.target.value)}
                              placeholder="e.g., Our Pasts I, Indian Polity"
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                              Chapter
                            </label>
                            <input
                              type="text"
                              value={pdfChapter}
                              onChange={(e) => setPdfChapter(e.target.value)}
                              placeholder="e.g., Chapter 3 – Ruling the Countryside"
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                            />
                          </div>
                        </>
                      )}

                      {pdfCategory === 'upsc' && (
                        <>
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                              UPSC Stage *
                            </label>
                            <select
                              value={upscNoteStage}
                              onChange={(e) => {
                                const st = e.target.value as UpscStage;
                                setUpscNoteStage(st);
                                setUpscNotePaper(
                                  st === 'prelims' ? 'Prelims GS Paper I' : 'Mains GS Paper I',
                                );
                              }}
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                            >
                              <option value="prelims">UPSC Prelims</option>
                              <option value="mains">UPSC Mains</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                              UPSC Paper *
                            </label>
                            <select
                              value={upscNotePaper}
                              onChange={(e) => setUpscNotePaper(e.target.value)}
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                            >
                              {upscNoteStage === 'prelims' ? (
                                <>
                                  <option value="Prelims GS Paper I">Prelims GS Paper I</option>
                                  <option value="Prelims CSAT Paper II">Prelims CSAT Paper II</option>
                                </>
                              ) : (
                                <>
                                  <option value="Mains Essay Paper">Mains Essay Paper</option>
                                  <option value="Mains GS Paper I">Mains GS Paper I</option>
                                  <option value="Mains GS Paper II">Mains GS Paper II</option>
                                  <option value="Mains GS Paper III">Mains GS Paper III</option>
                                  <option value="Mains GS Paper IV">Mains GS Paper IV</option>
                                  <option value="Mains Optional Subject">Mains Optional Subject</option>
                                </>
                              )}
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                              Subject / Area *
                            </label>
                            <input
                              type="text"
                              value={upscNoteSubject}
                              onChange={(e) => setUpscNoteSubject(e.target.value)}
                              placeholder="e.g., Indian Polity, Modern History, Ethics"
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                              Module / Unit Name
                            </label>
                            <input
                              type="text"
                              value={pdfChapter}
                              onChange={(e) => setPdfChapter(e.target.value)}
                              placeholder="e.g., Constitutional Framework"
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                            />
                          </div>
                        </>
                      )}

                      <div>
                        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                          Topic (Optional)
                        </label>
                        <input
                          type="text"
                          value={pdfTopic}
                          onChange={(e) => setPdfTopic(e.target.value)}
                          placeholder="Specific topic"
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                          Short Description
                        </label>
                        <input
                          type="text"
                          value={pdfDesc}
                          onChange={(e) => setPdfDesc(e.target.value)}
                          placeholder="Key formulas, summary & revision points..."
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                          Language
                        </label>
                        <select
                          value={pdfLanguage}
                          onChange={(e) => setPdfLanguage(e.target.value as MockLanguage)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                        >
                          <option value="english">English</option>
                          <option value="odia">Odia (ଓଡ଼ିଆ)</option>
                          <option value="hindi">Hindi (हिन्दी)</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                      <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-violet-400 bg-violet-50/50 dark:bg-violet-950/20 cursor-pointer text-sm font-medium text-violet-700 dark:text-violet-300">
                        <FileText className="w-4 h-4" />
                        <span>
                          {pdfFile ? `${pdfFile.name} (${formatFileSize(pdfFile.size)})` : 'Choose PDF File (.pdf)'}
                        </span>
                        <input
                          type="file"
                          accept="application/pdf,.pdf"
                          onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                          className="hidden"
                        />
                      </label>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={uploadingPdf}
                          onClick={() => void handleUploadPdfNote(false)}
                          className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                        >
                          Save Draft
                        </button>
                        <button
                          type="button"
                          disabled={uploadingPdf}
                          onClick={() => void handleUploadPdfNote(true)}
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold disabled:opacity-50"
                        >
                          <Upload className="w-4 h-4" />
                          <span>{uploadingPdf ? 'Uploading...' : 'Upload & Publish'}</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* PDF Notes Search & Management Table */}
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3 className="font-display font-bold text-base">
                        PDF Notes Repository ({filteredPdfNotes.length})
                      </h3>
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={pdfCategoryFilter}
                          onChange={(e) =>
                            setPdfCategoryFilter(e.target.value as 'all' | PdfNoteCategory)
                          }
                          className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-medium"
                        >
                          <option value="all">All Categories</option>
                          <option value="exam">Exam PDF Notes</option>
                          <option value="ncert">NCERT Notes (6–12)</option>
                          <option value="upsc">UPSC Notes</option>
                        </select>
                        <div className="w-64 sm:w-72">
                          <SearchBarWithVoice
                            compact
                            value={pdfSearch}
                            onChange={setPdfSearch}
                            placeholder="Search PDF notes..."
                            ariaLabel="Search PDF notes"
                          />
                        </div>
                        <select
                          value={pdfStatusFilter}
                          onChange={(e) =>
                            setPdfStatusFilter(e.target.value as 'all' | 'published' | 'draft')
                          }
                          className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                        >
                          <option value="all">All Status</option>
                          <option value="published">Published Only</option>
                          <option value="draft">Drafts Only</option>
                        </select>
                      </div>
                    </div>

                    {filteredPdfNotes.length === 0 ? (
                      <p className="text-sm text-slate-500">
                        No PDF notes match the current filter. Upload a study PDF above.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                          <thead className="text-xs uppercase text-slate-500 border-b border-slate-200 dark:border-slate-800">
                            <tr>
                              <th className="py-2.5 pr-3">Title</th>
                              <th className="py-2.5 px-3">Category &amp; Level</th>
                              <th className="py-2.5 px-3">Subject / Book / Chapter</th>
                              <th className="py-2.5 px-3">Pages</th>
                              <th className="py-2.5 px-3">Status</th>
                              <th className="py-2.5 pl-3 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {filteredPdfNotes.map((n) => (
                              <tr key={n.id}>
                                <td className="py-2.5 pr-3">
                                  <div className="font-semibold">{n.title}</div>
                                  <div className="text-xs text-slate-500">
                                    {n.fileName} · {formatFileSize(n.fileSize)}
                                  </div>
                                </td>
                                <td className="py-2.5 px-3 text-xs">
                                  <span className="font-bold text-[#4338CA] dark:text-indigo-300 uppercase mr-1.5">
                                    {n.noteCategory === 'ncert'
                                      ? 'NCERT'
                                      : n.noteCategory === 'upsc'
                                        ? 'UPSC'
                                        : 'Exam'}
                                  </span>
                                  <span>
                                    {n.noteCategory === 'ncert'
                                      ? n.ncertClass || n.classLabel
                                      : n.noteCategory === 'upsc'
                                        ? `${n.upscStage || 'prelims'} · ${n.upscPaper || n.classLabel}`
                                        : `${n.examName} · ${n.classLabel}`}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-xs">
                                  {n.subject}
                                  {n.bookName ? ` (${n.bookName})` : ''} → {n.chapter}
                                </td>
                                <td className="py-2.5 px-3 text-xs">{n.pageCount}</td>
                                <td className="py-2.5 px-3">
                                  <span
                                    className={`inline-block px-2 py-0.5 rounded-md text-xs font-semibold ${
                                      n.published
                                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                        : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                    }`}
                                  >
                                    {n.published ? 'Published' : 'Draft'}
                                  </span>
                                </td>
                                <td className="py-2.5 pl-3 text-right whitespace-nowrap space-x-2">
                                  <button
                                    type="button"
                                    onClick={() => setPreviewPdfNote(n)}
                                    className="text-xs font-semibold text-blue-600 hover:underline"
                                  >
                                    Preview PDF
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditPdfNote({ ...n });
                                      setReplacePdfFile(null);
                                    }}
                                    className="text-xs font-semibold text-violet-600 hover:underline"
                                  >
                                    Edit / Replace
                                  </button>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      const res = await updateAdminPdfNote(adminToken, n.id, {
                                        published: !n.published,
                                      });
                                      setPdfNotes((prev) =>
                                        prev.map((it) => (it.id === res.note.id ? res.note : it)),
                                      );
                                      setStats(res.stats);
                                      await onCatalogSync();
                                      flashSuccess(
                                        res.note.published
                                          ? `Published "${res.note.title}" to Student PDF Notes.`
                                          : `Unpublished "${res.note.title}".`,
                                      );
                                    }}
                                    className="text-xs font-semibold text-emerald-600 hover:underline"
                                  >
                                    {n.published ? 'Unpublish' : 'Publish'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setConfirmState({
                                        title: 'Delete PDF Note',
                                        message: `Permanently delete "${n.title}" and remove its protected PDF file?`,
                                        confirmLabel: 'Delete PDF Note',
                                        onConfirm: async () => {
                                          const res = await deleteAdminPdfNote(adminToken, n.id);
                                          setPdfNotes((prev) => prev.filter((it) => it.id !== n.id));
                                          setStats(res.stats);
                                          if (previewPdfNote?.id === n.id) setPreviewPdfNote(null);
                                          await onCatalogSync();
                                          flashSuccess(`Deleted PDF Note "${n.title}".`);
                                        },
                                      })
                                    }
                                    className="text-xs font-semibold text-red-600 hover:underline"
                                  >
                                    Delete
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 9. MANAGE STUDENTS */}
              {section === 'students' && (
                <div className="max-w-5xl mx-auto space-y-5">
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!newStuName.trim() || !newStuEmail.trim()) return;
                      const res = await createAdminStudent(adminToken, {
                        name: newStuName.trim(),
                        email: newStuEmail.trim(),
                        rollNumber: newStuRoll.trim() || undefined,
                        classLevel: newStuClass.trim() || 'Class 10',
                      });
                      setStudents((prev) => [res.student, ...prev]);
                      setStats(res.stats);
                      setNewStuName('');
                      setNewStuEmail('');
                      setNewStuRoll('');
                      flashSuccess(`Registered student "${res.student.name}".`);
                    }}
                    className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 grid grid-cols-1 sm:grid-cols-5 gap-2.5 items-end"
                  >
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Name *</label>
                      <input
                        type="text"
                        required
                        value={newStuName}
                        onChange={(e) => setNewStuName(e.target.value)}
                        placeholder="Student Name"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Email *</label>
                      <input
                        type="email"
                        required
                        value={newStuEmail}
                        onChange={(e) => setNewStuEmail(e.target.value)}
                        placeholder="email@example.com"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Roll No.</label>
                      <input
                        type="text"
                        value={newStuRoll}
                        onChange={(e) => setNewStuRoll(e.target.value)}
                        placeholder="Optional"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Class</label>
                      <input
                        type="text"
                        value={newStuClass}
                        onChange={(e) => setNewStuClass(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                      />
                    </div>
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold"
                    >
                      Add Student
                    </button>
                  </form>

                  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-display font-bold text-base">
                        Registered Students ({filteredStudents.length})
                      </h3>
                      <div className="w-64 sm:w-72">
                        <SearchBarWithVoice
                          compact
                          value={studentSearch}
                          onChange={setStudentSearch}
                          placeholder="Search name, email, roll..."
                          ariaLabel="Search students"
                        />
                      </div>
                    </div>

                    {filteredStudents.length === 0 ? (
                      <p className="text-sm text-slate-500">No students registered yet.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                          <thead className="text-xs uppercase text-slate-500 border-b border-slate-200 dark:border-slate-800">
                            <tr>
                              <th className="py-2 pr-3">Name</th>
                              <th className="py-2 px-3">Email</th>
                              <th className="py-2 px-3">Class / Roll</th>
                              <th className="py-2 px-3">Access</th>
                              <th className="py-2 pl-3 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {filteredStudents.map((s) => (
                              <tr key={s.id}>
                                <td className="py-2.5 pr-3 font-semibold">{s.name}</td>
                                <td className="py-2.5 px-3 text-xs">{s.email}</td>
                                <td className="py-2.5 px-3 text-xs">
                                  {s.classLevel} {s.rollNumber ? `· #${s.rollNumber}` : ''}
                                </td>
                                <td className="py-2.5 px-3">
                                  <span
                                    className={`inline-block px-2 py-0.5 rounded-md text-xs font-semibold ${
                                      s.active
                                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                        : 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300'
                                    }`}
                                  >
                                    {s.active ? 'Active' : 'Disabled'}
                                  </span>
                                </td>
                                <td className="py-2.5 pl-3 text-right space-x-2">
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      const res = await updateAdminStudent(adminToken, s.id, {
                                        active: !s.active,
                                      });
                                      setStudents((prev) =>
                                        prev.map((it) => (it.id === res.student.id ? res.student : it)),
                                      );
                                      flashSuccess(
                                        `${res.student.name} is now ${res.student.active ? 'Active' : 'Disabled'}.`,
                                      );
                                    }}
                                    className="text-xs font-semibold text-violet-600 hover:underline"
                                  >
                                    {s.active ? 'Disable' : 'Enable'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setConfirmState({
                                        title: 'Remove Student',
                                        message: `Remove "${s.name}" from registered students?`,
                                        confirmLabel: 'Remove',
                                        onConfirm: async () => {
                                          const res = await deleteAdminStudent(adminToken, s.id);
                                          setStudents((prev) => prev.filter((it) => it.id !== s.id));
                                          setStats(res.stats);
                                          flashSuccess('Removed student record.');
                                        },
                                      })
                                    }
                                    className="text-xs font-semibold text-red-600 hover:underline"
                                  >
                                    Delete
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 10. SETTINGS */}
              {section === 'settings' && (
                <div className="max-w-xl mx-auto space-y-5">
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setBannerError(null);
                      const cleanNextId = newAdminIdInput.trim();
                      if (cleanNextId.length < 3) {
                        setBannerError('Admin ID must be at least 3 characters.');
                        return;
                      }
                      if (!idChangePw) {
                        setBannerError('Enter your current password to update Admin ID.');
                        return;
                      }
                      setSavingAdminId(true);
                      try {
                        const res = await changeAdminIdApi(adminToken, idChangePw, cleanNextId);
                        setIdChangePw('');
                        setNewAdminIdInput(res.adminId);
                        onAdminIdUpdated?.(res.token, res.adminId);
                        flashSuccess(res.message || `Admin ID updated to "${res.adminId}".`);
                      } catch (err) {
                        setBannerError(
                          err instanceof Error ? err.message : 'Unable to update Admin ID.',
                        );
                      } finally {
                        setSavingAdminId(false);
                      }
                    }}
                    className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4"
                  >
                    <div className="flex items-center gap-2">
                      <UserCog className="w-5 h-5 text-violet-600" />
                      <h2 className="font-display font-bold text-lg">Admin ID Settings</h2>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">
                        Admin ID
                      </label>
                      <input
                        type="text"
                        required
                        minLength={3}
                        value={newAdminIdInput}
                        onChange={(e) => setNewAdminIdInput(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">
                        Confirm With Current Password
                      </label>
                      <input
                        type={showPwFields ? 'text' : 'password'}
                        required
                        value={idChangePw}
                        onChange={(e) => setIdChangePw(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={savingAdminId}
                      className="px-5 py-2.5 rounded-xl bg-[#4338CA] hover:bg-[#3730A3] text-white text-sm font-semibold disabled:opacity-50"
                    >
                      {savingAdminId ? 'Updating Admin ID...' : 'Update Admin ID'}
                    </button>
                  </form>

                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setBannerError(null);
                      if (newPw !== confirmPw) {
                        setBannerError('New password and confirmation do not match.');
                        return;
                      }
                      if (newPw.length < 4) {
                        setBannerError('New password must be at least 4 characters.');
                        return;
                      }
                      setSavingPw(true);
                      try {
                        await changeAdminPassword(adminToken, curPw, newPw);
                        setCurPw('');
                        setNewPw('');
                        setConfirmPw('');
                        flashSuccess('Administrator password updated securely.');
                      } catch (err) {
                        setBannerError(
                          err instanceof Error ? err.message : 'Unable to change password.',
                        );
                      } finally {
                        setSavingPw(false);
                      }
                    }}
                    className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <KeyRound className="w-5 h-5 text-violet-600" />
                        <h2 className="font-display font-bold text-lg">Change Admin Password</h2>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowPwFields((v) => !v)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300"
                      >
                        {showPwFields ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        <span>{showPwFields ? 'Hide' : 'Show'}</span>
                      </button>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">
                        Current Password
                      </label>
                      <input
                        type={showPwFields ? 'text' : 'password'}
                        required
                        value={curPw}
                        onChange={(e) => setCurPw(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">
                        New Password
                      </label>
                      <input
                        type={showPwFields ? 'text' : 'password'}
                        required
                        value={newPw}
                        onChange={(e) => setNewPw(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">
                        Confirm New Password
                      </label>
                      <input
                        type={showPwFields ? 'text' : 'password'}
                        required
                        value={confirmPw}
                        onChange={(e) => setConfirmPw(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={savingPw}
                      className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold disabled:opacity-50"
                    >
                      {savingPw ? 'Updating Password...' : 'Update Password'}
                    </button>
                  </form>
                </div>
              )}

              {/* 11. AI PROVIDERS MANAGEMENT */}
              {section === 'ai-providers' && (
                <div className="space-y-6 max-w-5xl">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="font-display font-bold text-xl flex items-center gap-2">
                        <Cpu className="w-5 h-5 text-violet-600" />
                        <span>AI Provider & Model Management</span>
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Control Google Gemini and Ollama Local Open-Source AI, default/backup routing, Ollama server URL, and student-allowed models.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={aiBusy}
                      onClick={async () => {
                        setAiBusy(true);
                        try {
                          await loadAiOverview();
                          if (onAiConfigSync) await onAiConfigSync();
                          flashSuccess('Refreshed AI provider statuses and installed Ollama models.');
                        } finally {
                          setAiBusy(false);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${aiBusy ? 'animate-spin' : ''}`} />
                      <span>Refresh Model List</span>
                    </button>
                  </div>

                  {/* Server Secrets Security Notice (Never displays API keys!) */}
                  {aiOverview && (
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                        <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>
                          API keys (<code>GEMINI_API_KEY</code>, <code>OLLAMA_API_KEY</code>) are stored strictly in server Secrets and never exposed to browsers.
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`px-2.5 py-1 rounded-lg font-semibold ${
                            aiOverview.hasGeminiKey
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                              : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                          }`}
                        >
                          GEMINI_API_KEY: {aiOverview.hasGeminiKey ? 'Configured' : 'Missing'}
                        </span>
                        <span
                          className={`px-2.5 py-1 rounded-lg font-semibold ${
                            aiOverview.hasOllamaApiKey
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          OLLAMA_API_KEY: {aiOverview.hasOllamaApiKey ? 'Configured' : 'Optional / Not Set'}
                        </span>
                      </div>
                    </div>
                  )}

                  {aiOverview && (
                    <>
                      {/* Routing, Default Provider & Backup Fallback Policy */}
                      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-5">
                        <h3 className="font-display font-bold text-base">
                          Provider Activation & Fallback Policy
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <label className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 cursor-pointer">
                            <div>
                              <div className="font-semibold text-sm">Enable Google Gemini</div>
                              <div className="text-xs text-slate-500">
                                Allow Gemini models across Chat, Mock Tests, Notes & Tools
                              </div>
                            </div>
                            <input
                              type="checkbox"
                              checked={aiOverview.config.geminiEnabled}
                              disabled={aiBusy}
                              onChange={async (e) => {
                                const patch: Partial<AdminAiConfig> = {
                                  geminiEnabled: e.target.checked,
                                };
                                setAiBusy(true);
                                setBannerError(null);
                                try {
                                  const next = await updateAdminAiConfig(adminToken, patch);
                                  setAiOverview(next);
                                  if (onAiConfigSync) await onAiConfigSync();
                                  flashSuccess(
                                    `Google Gemini ${next.config.geminiEnabled ? 'enabled' : 'disabled'}.`,
                                  );
                                } catch (err) {
                                  setBannerError(
                                    err instanceof Error ? err.message : 'Failed to update AI settings.',
                                  );
                                } finally {
                                  setAiBusy(false);
                                }
                              }}
                              className="w-4 h-4 accent-violet-600"
                            />
                          </label>

                          <label className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 cursor-pointer">
                            <div>
                              <div className="font-semibold text-sm">Enable Ollama Local AI</div>
                              <div className="text-xs text-slate-500">
                                Allow discovered Ollama open-source models for students
                              </div>
                            </div>
                            <input
                              type="checkbox"
                              checked={aiOverview.config.ollamaEnabled}
                              disabled={aiBusy}
                              onChange={async (e) => {
                                const patch: Partial<AdminAiConfig> = {
                                  ollamaEnabled: e.target.checked,
                                };
                                setAiBusy(true);
                                setBannerError(null);
                                try {
                                  const next = await updateAdminAiConfig(adminToken, patch);
                                  setAiOverview(next);
                                  if (onAiConfigSync) await onAiConfigSync();
                                  flashSuccess(
                                    `Ollama Local AI ${next.config.ollamaEnabled ? 'enabled' : 'disabled'}.`,
                                  );
                                } catch (err) {
                                  setBannerError(
                                    err instanceof Error ? err.message : 'Failed to update AI settings.',
                                  );
                                } finally {
                                  setAiBusy(false);
                                }
                              }}
                              className="w-4 h-4 accent-violet-600"
                            />
                          </label>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                              Default Provider (Automatic Mode)
                            </label>
                            <select
                              value={aiOverview.config.defaultProvider}
                              disabled={aiBusy}
                              onChange={async (e) => {
                                const val = e.target.value as ProviderId;
                                setAiBusy(true);
                                setBannerError(null);
                                try {
                                  const next = await updateAdminAiConfig(adminToken, {
                                    defaultProvider: val,
                                  });
                                  setAiOverview(next);
                                  if (onAiConfigSync) await onAiConfigSync();
                                  flashSuccess(
                                    `Default provider set to ${val === 'ollama' ? 'Ollama Local' : 'Google Gemini'}.`,
                                  );
                                } catch (err) {
                                  setBannerError(
                                    err instanceof Error ? err.message : 'Unable to update default provider.',
                                  );
                                } finally {
                                  setAiBusy(false);
                                }
                              }}
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                            >
                              <option value="gemini" disabled={!aiOverview.config.geminiEnabled}>
                                Google Gemini
                              </option>
                              <option value="ollama" disabled={!aiOverview.config.ollamaEnabled}>
                                Ollama Local
                              </option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                              Backup Provider
                            </label>
                            <select
                              value={aiOverview.config.backupProvider}
                              disabled={aiBusy}
                              onChange={async (e) => {
                                const val = e.target.value as ProviderId | 'none';
                                setAiBusy(true);
                                setBannerError(null);
                                try {
                                  const next = await updateAdminAiConfig(adminToken, {
                                    backupProvider: val,
                                  });
                                  setAiOverview(next);
                                  if (onAiConfigSync) await onAiConfigSync();
                                  flashSuccess('Updated backup AI provider.');
                                } catch (err) {
                                  setBannerError(
                                    err instanceof Error ? err.message : 'Unable to update backup provider.',
                                  );
                                } finally {
                                  setAiBusy(false);
                                }
                              }}
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                            >
                              <option value="none">None (No Fallback)</option>
                              <option value="gemini">Google Gemini</option>
                              <option value="ollama">Ollama Local</option>
                            </select>
                          </div>

                          <div className="flex items-end">
                            <label className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 cursor-pointer">
                              <span className="text-sm font-medium">Enable Auto Fallback</span>
                              <input
                                type="checkbox"
                                checked={aiOverview.config.fallbackEnabled}
                                disabled={aiBusy}
                                onChange={async (e) => {
                                  setAiBusy(true);
                                  setBannerError(null);
                                  try {
                                    const next = await updateAdminAiConfig(adminToken, {
                                      fallbackEnabled: e.target.checked,
                                    });
                                    setAiOverview(next);
                                    if (onAiConfigSync) await onAiConfigSync();
                                    flashSuccess(
                                      `Automatic backup fallback ${next.config.fallbackEnabled ? 'enabled' : 'disabled'}.`,
                                    );
                                  } catch (err) {
                                    setBannerError(
                                      err instanceof Error ? err.message : 'Unable to toggle fallback.',
                                    );
                                  } finally {
                                    setAiBusy(false);
                                  }
                                }}
                                className="w-4 h-4 accent-violet-600"
                              />
                            </label>
                          </div>
                        </div>
                      </div>

                      {/* Ollama Server URL Editor + Connection Test */}
                      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
                        <div className="flex items-center gap-2">
                          <Server className="w-4 h-4 text-violet-600" />
                          <h3 className="font-display font-bold text-base">
                            Ollama Server Endpoint Configuration
                          </h3>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <input
                            type="url"
                            value={aiOllamaUrlInput}
                            onChange={(e) => setAiOllamaUrlInput(e.target.value)}
                            placeholder={`Leave blank to use env/default (${aiOverview.effectiveOllamaBaseUrl})`}
                            className="flex-1 min-w-[260px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono"
                          />
                          <button
                            type="button"
                            disabled={aiBusy}
                            onClick={async () => {
                              setAiBusy(true);
                              setBannerError(null);
                              try {
                                const next = await updateAdminAiConfig(adminToken, {
                                  ollamaBaseUrl: aiOllamaUrlInput.trim(),
                                });
                                setAiOverview(next);
                                setAiOllamaUrlInput(next.config.ollamaBaseUrl || '');
                                if (onAiConfigSync) await onAiConfigSync();
                                flashSuccess(
                                  `Saved Ollama endpoint (${next.effectiveOllamaBaseUrl}).`,
                                );
                              } catch (err) {
                                setBannerError(
                                  err instanceof Error ? err.message : 'Invalid Ollama URL.',
                                );
                              } finally {
                                setAiBusy(false);
                              }
                            }}
                            className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold disabled:opacity-50"
                          >
                            Save URL
                          </button>
                          <button
                            type="button"
                            disabled={aiTestingProv === 'ollama'}
                            onClick={async () => {
                              setAiTestingProv('ollama');
                              try {
                                const res = await testAdminAiConnection(adminToken, {
                                  provider: 'ollama',
                                  ollamaBaseUrl: aiOllamaUrlInput.trim() || aiOverview.effectiveOllamaBaseUrl,
                                });
                                setAiTestFeedback((prev) => ({
                                  ...prev,
                                  ollama: { ok: res.ok, message: res.message },
                                }));
                              } catch (err) {
                                setAiTestFeedback((prev) => ({
                                  ...prev,
                                  ollama: {
                                    ok: false,
                                    message: err instanceof Error ? err.message : 'Connection failed.',
                                  },
                                }));
                              } finally {
                                setAiTestingProv(null);
                              }
                            }}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
                          >
                            <Activity className="w-3.5 h-3.5" />
                            <span>
                              {aiTestingProv === 'ollama' ? 'Testing...' : 'Test Ollama Connection'}
                            </span>
                          </button>
                        </div>

                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          Active Server URL: <code className="font-mono">{aiOverview.effectiveOllamaBaseUrl}</code>
                        </div>

                        {aiOverview.isCloudDeployment && (
                          <div className="p-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-xs text-amber-800 dark:text-amber-200">
                            Cloud Deployment Notice: A cloud server cannot connect directly to a developer&apos;s <code>http://127.0.0.1:11434</code> localhost. Point this URL to a reachable remote Ollama host or secure tunnel for cloud deployments.
                          </div>
                        )}
                      </div>

                      {/* Provider Statuses & Per-Model Access Control */}
                      <div className="space-y-4">
                        {aiOverview.providers.map((prov) => {
                          const testRes = aiTestFeedback[prov.id];
                          return (
                            <div
                              key={prov.id}
                              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <h3 className="font-display font-bold text-base">
                                    {prov.name}
                                  </h3>
                                  <p className="text-xs text-slate-500">{prov.statusMessage}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                                      prov.connectionState === 'connected'
                                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                                        : prov.connectionState === 'no-models'
                                          ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
                                          : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                                    }`}
                                  >
                                    {prov.connectionState}
                                  </span>
                                  <button
                                    type="button"
                                    disabled={aiTestingProv === prov.id}
                                    onClick={async () => {
                                      setAiTestingProv(prov.id);
                                      try {
                                        const res = await testAdminAiConnection(adminToken, {
                                          provider: prov.id,
                                        });
                                        setAiTestFeedback((prev) => ({
                                          ...prev,
                                          [prov.id]: { ok: res.ok, message: res.message },
                                        }));
                                      } catch (err) {
                                        setAiTestFeedback((prev) => ({
                                          ...prev,
                                          [prov.id]: {
                                            ok: false,
                                            message:
                                              err instanceof Error ? err.message : 'Test failed.',
                                          },
                                        }));
                                      } finally {
                                        setAiTestingProv(null);
                                      }
                                    }}
                                    className="px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
                                  >
                                    {aiTestingProv === prov.id ? 'Testing...' : 'Test Connection'}
                                  </button>
                                </div>
                              </div>

                              {testRes && (
                                <div
                                  className={`p-2.5 rounded-xl border text-xs ${
                                    testRes.ok
                                      ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                                      : 'border-red-200 dark:border-red-800 bg-red-50/70 dark:bg-red-950/30 text-red-700 dark:text-red-300'
                                  }`}
                                >
                                  {testRes.message}
                                </div>
                              )}

                              {prov.models.length === 0 ? (
                                <p className="text-xs text-slate-500 italic">
                                  No models discovered or available for {prov.name}.
                                </p>
                              ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
                                  {prov.models.map((m) => {
                                    const modelKey = `${prov.id}::${m.id}`;
                                    const isModelEnabled = !aiOverview.config.disabledModels.includes(modelKey);
                                    return (
                                      <div
                                        key={modelKey}
                                        className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50"
                                      >
                                        <div className="min-w-0">
                                          <div className="text-sm font-semibold truncate">
                                            {m.name}
                                          </div>
                                          <div className="text-[11px] text-slate-500">
                                            {m.supportsVision ? 'Vision + Text' : 'Text Only'} ·{' '}
                                            {m.contextWindowLabel}
                                          </div>
                                        </div>
                                        <button
                                          type="button"
                                          disabled={aiBusy}
                                          onClick={async () => {
                                            const currentDisabled = new Set(
                                              aiOverview.config.disabledModels,
                                            );
                                            if (isModelEnabled) {
                                              currentDisabled.add(modelKey);
                                            } else {
                                              currentDisabled.delete(modelKey);
                                            }
                                            setAiBusy(true);
                                            setBannerError(null);
                                            try {
                                              const next = await updateAdminAiConfig(adminToken, {
                                                disabledModels: Array.from(currentDisabled),
                                              });
                                              setAiOverview(next);
                                              if (onAiConfigSync) await onAiConfigSync();
                                              flashSuccess(
                                                `Model "${m.name}" ${isModelEnabled ? 'disabled' : 'enabled'} for students.`,
                                              );
                                            } catch (err) {
                                              setBannerError(
                                                err instanceof Error
                                                  ? err.message
                                                  : 'Failed to update model access.',
                                              );
                                            } finally {
                                              setAiBusy(false);
                                            }
                                          }}
                                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 transition-colors ${
                                            isModelEnabled
                                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 hover:bg-emerald-200'
                                              : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-300'
                                          }`}
                                        >
                                          {isModelEnabled ? 'Enabled' : 'Disabled'}
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}

              {section === 'ai-video' && (
                <AdminVideoManagementPanel
                  adminToken={adminToken}
                  students={students}
                  onFlashSuccess={(msg) => flashSuccess(msg)}
                  onError={(msg) => setBannerError(msg)}
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* EXAM CREATE / EDIT / VIEW MODAL */}
      {examModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-lg">
                {examModal.mode === 'create'
                  ? 'Add Examination'
                  : examModal.mode === 'edit'
                    ? `Edit ${examModal.exam.name}`
                    : examModal.exam.name}
              </h3>
              <button type="button" onClick={() => setExamModal(null)}>
                <X className="w-5 h-5" />
              </button>
            </div>

            {examModal.mode === 'view' ? (
              <div className="space-y-3 text-sm">
                <div>
                  <span className="font-semibold">Board:</span> {examModal.exam.boardName || '—'} ·{' '}
                  <span className="font-semibold">Session:</span> {examModal.exam.academicSession || '2025-26'}
                </div>
                {examModal.exam.classesOrPapers.map((cls) => (
                  <div
                    key={cls.id}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 space-y-2"
                  >
                    <div className="font-bold text-violet-700 dark:text-violet-300">{cls.label}</div>
                    {cls.subjects.map((sub, i) => (
                      <div key={i} className="text-xs space-y-1 pl-2 border-l-2 border-slate-200 dark:border-slate-700">
                        <div className="font-semibold">{sub.name}</div>
                        <div className="text-slate-500">
                          {sub.chapters.map((c) => `${c.name} (${c.topics.length})`).join(' · ')}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const ex = examModal.exam;
                  if (!ex.name.trim()) return;
                  if (examModal.mode === 'create') {
                    const res = await createAdminExam(adminToken, ex);
                    setExams((prev) => [...prev, res.exam]);
                    setStats(res.stats);
                    await onCatalogSync();
                    flashSuccess(`Created examination "${res.exam.name}".`);
                  } else {
                    await persistExamUpdate(ex, `Updated examination "${ex.name}".`);
                  }
                  setExamModal(null);
                }}
                className="space-y-3"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Exam Name *</label>
                    <input
                      type="text"
                      required
                      value={examModal.exam.name}
                      onChange={(e) =>
                        setExamModal({
                          ...examModal,
                          exam: { ...examModal.exam, name: e.target.value },
                        })
                      }
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Category</label>
                    <select
                      value={examModal.exam.category}
                      onChange={(e) =>
                        setExamModal({
                          ...examModal,
                          exam: { ...examModal.exam, category: e.target.value as ExamCategoryId },
                        })
                      }
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                    >
                      <option value="odisha-board">Odisha Board / CHSE</option>
                      <option value="cbse">CBSE</option>
                      <option value="ugc-net">UGC NET</option>
                      <option value="competitive">Competitive Exam</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Board Name</label>
                    <input
                      type="text"
                      value={examModal.exam.boardName || ''}
                      onChange={(e) =>
                        setExamModal({
                          ...examModal,
                          exam: { ...examModal.exam, boardName: e.target.value },
                        })
                      }
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Academic Session</label>
                    <input
                      type="text"
                      value={examModal.exam.academicSession || '2025-26'}
                      onChange={(e) =>
                        setExamModal({
                          ...examModal,
                          exam: { ...examModal.exam, academicSession: e.target.value },
                        })
                      }
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Description</label>
                  <input
                    type="text"
                    value={examModal.exam.shortDesc}
                    onChange={(e) =>
                      setExamModal({
                        ...examModal,
                        exam: { ...examModal.exam, shortDesc: e.target.value },
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setExamModal(null)}
                    className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold"
                  >
                    Save Examination
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ADD / EDIT QUESTION MODAL */}
      {questionModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={(e) => void handleSaveQuestionModal(e)}
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-3.5"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-lg">
                {questionModal.mode === 'create' ? 'Add Question to Bank' : 'Edit Question'}
              </h3>
              <button type="button" onClick={() => setQuestionModal(null)}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Exam *</label>
                <select
                  value={questionModal.data.examId || ''}
                  onChange={(e) => {
                    const ex = exams.find((item) => item.id === e.target.value);
                    const cls = ex?.classesOrPapers[0];
                    const sub = cls?.subjects[0];
                    setQuestionModal({
                      ...questionModal,
                      data: {
                        ...questionModal.data,
                        examId: ex?.id || '',
                        examName: ex?.name || '',
                        classId: cls?.id || '',
                        classLabel: cls?.label || '',
                        subject: sub?.name || '',
                        chapter: sub?.chapters[0]?.name || '',
                      },
                    });
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                >
                  {exams.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Question Type</label>
                <select
                  value={questionModal.data.typeId || 'MCQ'}
                  onChange={(e) =>
                    setQuestionModal({
                      ...questionModal,
                      data: {
                        ...questionModal.data,
                        typeId: e.target.value as AdvancedQuestionTypeId,
                      },
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                >
                  {ALL_QUESTION_FORMATS.map((fmt) => (
                    <option key={fmt.id} value={fmt.id}>
                      {fmt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Subject</label>
                <input
                  type="text"
                  value={questionModal.data.subject || ''}
                  onChange={(e) =>
                    setQuestionModal({
                      ...questionModal,
                      data: { ...questionModal.data, subject: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Chapter</label>
                <input
                  type="text"
                  value={questionModal.data.chapter || ''}
                  onChange={(e) =>
                    setQuestionModal({
                      ...questionModal,
                      data: { ...questionModal.data, chapter: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Marks</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={questionModal.data.marks || 1}
                  onChange={(e) =>
                    setQuestionModal({
                      ...questionModal,
                      data: { ...questionModal.data, marks: Number(e.target.value) || 1 },
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Difficulty</label>
                <select
                  value={questionModal.data.difficulty || 'Medium'}
                  onChange={(e) =>
                    setQuestionModal({
                      ...questionModal,
                      data: { ...questionModal.data, difficulty: e.target.value as DifficultyLevel },
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                >
                  <option value="Easy">Easy</option>
                  <option value="Medium">Medium</option>
                  <option value="Hard">Hard</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Question Stem *</label>
              <textarea
                rows={3}
                required
                value={questionModal.data.question || ''}
                onChange={(e) =>
                  setQuestionModal({
                    ...questionModal,
                    data: { ...questionModal.data, question: e.target.value },
                  })
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
              />
            </div>

            {(questionModal.data.typeId === 'MCQ' ||
              questionModal.data.typeId === 'Multiple-Select' ||
              questionModal.data.typeId === 'Assertion-Reasoning') && (
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">
                  Options (one per line)
                </label>
                <textarea
                  rows={4}
                  value={(questionModal.data.options || []).join('\n')}
                  onChange={(e) =>
                    setQuestionModal({
                      ...questionModal,
                      data: {
                        ...questionModal.data,
                        options: e.target.value.split('\n'),
                      },
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Correct Answer *</label>
              <input
                type="text"
                required
                value={questionModal.data.correctAnswer || ''}
                onChange={(e) =>
                  setQuestionModal({
                    ...questionModal,
                    data: { ...questionModal.data, correctAnswer: e.target.value },
                  })
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Explanation</label>
              <textarea
                rows={2}
                value={questionModal.data.explanation || ''}
                onChange={(e) =>
                  setQuestionModal({
                    ...questionModal,
                    data: { ...questionModal.data, explanation: e.target.value },
                  })
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setQuestionModal(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold"
              >
                Save Question
              </button>
            </div>
          </form>
        </div>
      )}

      {/* BULK UPLOAD QUESTIONS MODAL */}
      {bulkModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-lg">Bulk Upload Questions (CSV / JSON)</h3>
              <button type="button" onClick={() => setBulkModalOpen(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <select
                value={bulkExamId}
                onChange={(e) => {
                  setBulkExamId(e.target.value);
                  const ex = exams.find((x) => x.id === e.target.value);
                  setBulkClassId(ex?.classesOrPapers[0]?.id || '');
                }}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
              >
                {exams.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.name}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={bulkSubject}
                onChange={(e) => setBulkSubject(e.target.value)}
                placeholder="Default Subject"
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
              />
              <input
                type="text"
                value={bulkChapter}
                onChange={(e) => setBulkChapter(e.target.value)}
                placeholder="Default Chapter"
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
              />
            </div>
            <p className="text-xs text-slate-500">
              CSV format per line: <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">question,correctAnswer,typeId,marks,difficulty,optA|optB|optC|optD,explanation</code> — or paste a JSON array.
            </p>
            <textarea
              rows={8}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={`What is the SI unit of Force?,Newton,MCQ,1,Easy,Joule|Newton|Watt|Pascal,SI unit of force is Newton (kg·m/s²).`}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono"
            />
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-semibold text-violet-600 cursor-pointer hover:underline">
                Load from .csv / .json file
                <input
                  type="file"
                  accept=".csv,.json,.txt"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) setBulkText(await f.text());
                  }}
                  className="hidden"
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setBulkModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleBulkUploadSubmit()}
                  className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold"
                >
                  Import Questions
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EDIT / REPLACE PDF NOTE MODAL */}
      {editPdfNote && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={(e) => void handleSaveEditedPdfNote(e)}
            className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-3.5"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-lg">Edit / Replace PDF Note</h3>
              <button type="button" onClick={() => setEditPdfNote(null)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">PDF Title</label>
              <input
                type="text"
                required
                value={editPdfNote.title}
                onChange={(e) => setEditPdfNote({ ...editPdfNote, title: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Description</label>
              <input
                type="text"
                value={editPdfNote.description}
                onChange={(e) => setEditPdfNote({ ...editPdfNote, description: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Subject</label>
                <input
                  type="text"
                  value={editPdfNote.subject}
                  onChange={(e) => setEditPdfNote({ ...editPdfNote, subject: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                />
              </div>
              {(editPdfNote.noteCategory === 'ncert' || editPdfNote.bookName) && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">
                    NCERT Book Name
                  </label>
                  <input
                    type="text"
                    value={editPdfNote.bookName || ''}
                    onChange={(e) => setEditPdfNote({ ...editPdfNote, bookName: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                  />
                </div>
              )}
              {editPdfNote.noteCategory === 'ncert' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">
                    NCERT Class
                  </label>
                  <select
                    value={editPdfNote.ncertClass || 'Class 6'}
                    onChange={(e) => setEditPdfNote({ ...editPdfNote, ncertClass: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                  >
                    {['Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10', 'Class 11', 'Class 12'].map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              )}
              {editPdfNote.noteCategory === 'upsc' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">
                    UPSC Paper
                  </label>
                  <input
                    type="text"
                    value={editPdfNote.upscPaper || ''}
                    onChange={(e) => setEditPdfNote({ ...editPdfNote, upscPaper: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Chapter</label>
                <input
                  type="text"
                  value={editPdfNote.chapter}
                  onChange={(e) => setEditPdfNote({ ...editPdfNote, chapter: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Topic</label>
                <input
                  type="text"
                  value={editPdfNote.topic}
                  onChange={(e) => setEditPdfNote({ ...editPdfNote, topic: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                Replace PDF File (Optional)
              </label>
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => setReplacePdfFile(e.target.files?.[0] || null)}
                className="w-full text-xs"
              />
            </div>
            <label className="inline-flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={editPdfNote.published}
                onChange={(e) => setEditPdfNote({ ...editPdfNote, published: e.target.checked })}
              />
              <span>Published to Students</span>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditPdfNote(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={uploadingPdf}
                className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold disabled:opacity-50"
              >
                {uploadingPdf ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* SYLLABUS UPLOAD MODAL (PRE-FILLED FROM EXAMINATION CARDS OR NEW EXAM) */}
      {sylUploadModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={(e) => void handleUploadAndProcessSyllabus(e)}
            className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display font-bold text-lg text-slate-900 dark:text-white">
                  {sylUploadModal.isNewExam
                    ? 'Upload Syllabus for New Exam'
                    : `Upload Syllabus — ${sylExamName}`}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  AI automatically extracts subjects, chapters, topics, marks &amp; question formats for review before publishing.
                </p>
              </div>
              <button
                type="button"
                disabled={processingSyllabus}
                onClick={() => setSylUploadModal(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Exam Name *
                </label>
                <input
                  type="text"
                  required
                  value={sylExamName}
                  onChange={(e) => setSylExamName(e.target.value)}
                  placeholder="e.g., BSE Odisha / CTET / OPSC"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Board / Organization
                </label>
                <input
                  type="text"
                  value={sylBoardName}
                  onChange={(e) => setSylBoardName(e.target.value)}
                  placeholder="e.g., Board of Secondary Education Odisha"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Class / Paper / Level *
                </label>
                <input
                  type="text"
                  required
                  value={sylClassLabel}
                  onChange={(e) => setSylClassLabel(e.target.value)}
                  placeholder="e.g., Class 10 / +2 Science"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Academic Session
                </label>
                <input
                  type="text"
                  value={sylSession}
                  onChange={(e) => setSylSession(e.target.value)}
                  placeholder="2026-27"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Single Subject Hint (Optional)
                </label>
                <input
                  type="text"
                  value={sylSubjectHint}
                  onChange={(e) => setSylSubjectHint(e.target.value)}
                  placeholder="Blank if full-class PDF"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Default Language
                </label>
                <select
                  value={sylLanguage}
                  onChange={(e) => setSylLanguage(e.target.value as MockLanguage)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                >
                  <option value="english">English</option>
                  <option value="odia">Odia (ଓଡ଼ିଆ)</option>
                  <option value="hindi">Hindi (हिन्दी)</option>
                </select>
              </div>
            </div>

            <label className="flex items-center justify-center gap-2.5 w-full px-4 py-4 rounded-xl border-2 border-dashed border-violet-400 bg-violet-50/50 dark:bg-violet-950/20 cursor-pointer text-sm font-medium text-violet-700 dark:text-violet-300">
              <FileSpreadsheet className="w-5 h-5 shrink-0" />
              <span className="truncate">
                {sylFile
                  ? `${sylFile.name} (${formatFileSize(sylFile.size)})`
                  : 'Select Syllabus File (.pdf, .docx, .doc, .xlsx, .xls, .csv)'}
              </span>
              <input
                type="file"
                accept=".pdf,.docx,.doc,.xlsx,.xls,.csv,.txt"
                onChange={(e) => setSylFile(e.target.files?.[0] || null)}
                className="hidden"
              />
            </label>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={processingSyllabus}
                onClick={() => setSylUploadModal(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={processingSyllabus || !sylFile}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold disabled:opacity-50"
              >
                {processingSyllabus ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Processing with AI...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    <span>Upload &amp; Process</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* REVISION VS NEW ACADEMIC SESSION CONFLICT RESOLUTION MODAL */}
      {publishChoiceModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="inline-block px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-[11px] font-bold mb-1">
                  Existing Syllabus Detected
                </span>
                <h3 className="font-display font-bold text-lg text-slate-900 dark:text-white">
                  Choose How to Publish This Syllabus
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                  <strong>{publishChoiceModal.conflict.examName || publishChoiceModal.draft.examName}</strong> already has a syllabus
                  {publishChoiceModal.conflict.classLabel ? ` (${publishChoiceModal.conflict.classLabel})` : ''}. Existing questions &amp; student test results are always preserved.
                </p>
              </div>
              <button
                type="button"
                disabled={publishingDraft}
                onClick={() => setPublishChoiceModal(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                disabled={publishingDraft}
                onClick={() =>
                  void executePublishDraft(
                    publishChoiceModal.draft,
                    'replace',
                    publishChoiceModal.conflict.examId,
                    publishChoiceModal.conflict.classId,
                  )
                }
                className="w-full text-left p-4 rounded-xl border-2 border-emerald-200 dark:border-emerald-800/80 bg-emerald-50/50 dark:bg-emerald-950/20 hover:border-emerald-500 transition-colors space-y-1"
              >
                <div className="font-bold text-sm text-emerald-900 dark:text-emerald-200">
                  1. Replace Existing Syllabus (Recommended for Revision)
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Replaces outdated chapters &amp; topics in place across the website. Questions mapped to removed/renamed chapters are preserved and marked for review.
                </p>
              </button>

              <button
                type="button"
                disabled={publishingDraft}
                onClick={() =>
                  void executePublishDraft(
                    publishChoiceModal.draft,
                    'new-session',
                    publishChoiceModal.conflict.examId,
                    publishChoiceModal.conflict.classId,
                  )
                }
                className="w-full text-left p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950 hover:border-violet-500 transition-colors space-y-1"
              >
                <div className="font-bold text-sm text-slate-900 dark:text-white">
                  2. Create New Academic Session ({publishChoiceModal.draft.academicSession})
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Keeps the previous academic session syllabus untouched and adds{' '}
                  <strong>
                    {publishChoiceModal.draft.classLabel} ({publishChoiceModal.draft.academicSession})
                  </strong>{' '}
                  alongside it.
                </p>
              </button>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                disabled={publishingDraft}
                onClick={() => setPublishChoiceModal(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION DIALOG */}
      {confirmState && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-950/60 text-red-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display font-bold text-base">{confirmState.title}</h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                  {confirmState.message}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={confirmBusy}
                onClick={() => setConfirmState(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={confirmBusy}
                onClick={async () => {
                  setConfirmBusy(true);
                  try {
                    await confirmState.onConfirm();
                    setConfirmState(null);
                  } catch (err) {
                    setBannerError(err instanceof Error ? err.message : 'Action failed.');
                  } finally {
                    setConfirmBusy(false);
                  }
                }}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-50"
              >
                {confirmBusy ? 'Deleting...' : confirmState.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
