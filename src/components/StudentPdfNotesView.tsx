import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  ChevronRight,
  Eye,
  FileText,
  Filter,
  Globe,
  Layers,
  Lock,
  UserCheck,
  X,
} from 'lucide-react';
import type {
  ExamDefinition,
  LanguageMode,
  PdfNoteCategory,
  PdfNoteMetadata,
  StudentRecord,
  UpscStage,
} from '../types';
import { createStudentSession } from '../utils/adminApi';
import { formatFileSize } from '../utils/fileProcessor';
import { matchesSearchQuery } from '../utils/studySearch';
import { ProtectedPdfCanvasReader } from './ProtectedPdfCanvasReader';
import { SearchBarWithVoice } from './SearchBarWithVoice';

interface StudentPdfNotesViewProps {
  exams: ExamDefinition[];
  pdfNotes: PdfNoteMetadata[];
  studentToken: string | null;
  studentProfile: StudentRecord | null;
  language?: LanguageMode;
  onSessionReady: (token: string, student: StudentRecord | null) => void;
  onNavigateModule: (module: 'mock-test' | 'questions' | 'pdf-notes' | 'upsc') => void;
}

const NCERT_CLASS_LIST = [
  'Class 6',
  'Class 7',
  'Class 8',
  'Class 9',
  'Class 10',
  'Class 11',
  'Class 12',
];

export const StudentPdfNotesView: React.FC<StudentPdfNotesViewProps> = ({
  exams,
  pdfNotes,
  studentToken,
  studentProfile,
  language,
  onSessionReady,
  onNavigateModule,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<'all' | PdfNoteCategory>('all');

  // Exam PDF filters
  const [selectedExamId, setSelectedExamId] = useState<string>('all');
  const [selectedClassId, setSelectedClassId] = useState<string>('all');
  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  const [selectedChapter, setSelectedChapter] = useState<string>('all');

  // NCERT Notes filters (Class 6-12 -> Subject -> Book -> Chapter)
  const [selectedNcertClass, setSelectedNcertClass] = useState<string>('all');
  const [selectedNcertSubject, setSelectedNcertSubject] = useState<string>('all');
  const [selectedNcertBook, setSelectedNcertBook] = useState<string>('all');
  const [selectedNcertChapter, setSelectedNcertChapter] = useState<string>('all');

  // UPSC Notes filters (Stage -> Paper -> Subject)
  const [selectedUpscStage, setSelectedUpscStage] = useState<'all' | UpscStage>('all');
  const [selectedUpscPaper, setSelectedUpscPaper] = useState<string>('all');
  const [selectedUpscSubject, setSelectedUpscSubject] = useState<string>('all');

  const [searchQuery, setSearchQuery] = useState('');

  const [activeNote, setActiveNote] = useState<PdfNoteMetadata | null>(null);
  const [openingNote, setOpeningNote] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const [regName, setRegName] = useState(studentProfile?.name || '');
  const [regEmail, setRegEmail] = useState(studentProfile?.email || '');
  const [regRoll, setRegRoll] = useState(studentProfile?.rollNumber || '');
  const [regClass, setRegClass] = useState(studentProfile?.classLevel || 'Class 10');
  const [registering, setRegistering] = useState(false);

  const selectedExam = useMemo(
    () => exams.find((e) => e.id === selectedExamId),
    [exams, selectedExamId],
  );

  const availableClasses = useMemo(
    () => selectedExam?.classesOrPapers || [],
    [selectedExam],
  );

  const selectedClassObj = useMemo(
    () => availableClasses.find((c) => c.id === selectedClassId),
    [availableClasses, selectedClassId],
  );

  const availableSubjects = useMemo(() => {
    if (selectedClassObj) return selectedClassObj.subjects;
    if (selectedExam) {
      return selectedExam.classesOrPapers.flatMap((c) => c.subjects);
    }
    return [];
  }, [selectedExam, selectedClassObj]);

  const availableChapters = useMemo(() => {
    if (selectedSubject === 'all') return [];
    const subj = availableSubjects.find((s) => s.name === selectedSubject);
    return subj?.chapters || [];
  }, [availableSubjects, selectedSubject]);

  // NCERT derived options strictly from Admin-published NCERT notes
  const publishedNcertNotes = useMemo(
    () => pdfNotes.filter((n) => n.published && n.noteCategory === 'ncert'),
    [pdfNotes],
  );

  const ncertAvailableSubjects = useMemo(() => {
    const scoped =
      selectedNcertClass === 'all'
        ? publishedNcertNotes
        : publishedNcertNotes.filter(
            (n) => (n.ncertClass || n.classLabel) === selectedNcertClass,
          );
    return Array.from(new Set(scoped.map((n) => n.subject).filter(Boolean))).sort();
  }, [publishedNcertNotes, selectedNcertClass]);

  const ncertAvailableBooks = useMemo(() => {
    const scoped = publishedNcertNotes.filter((n) => {
      if (selectedNcertClass !== 'all' && (n.ncertClass || n.classLabel) !== selectedNcertClass) {
        return false;
      }
      if (selectedNcertSubject !== 'all' && n.subject !== selectedNcertSubject) return false;
      return true;
    });
    return Array.from(new Set(scoped.map((n) => n.bookName).filter(Boolean) as string[])).sort();
  }, [publishedNcertNotes, selectedNcertClass, selectedNcertSubject]);

  const ncertAvailableChapters = useMemo(() => {
    const scoped = publishedNcertNotes.filter((n) => {
      if (selectedNcertClass !== 'all' && (n.ncertClass || n.classLabel) !== selectedNcertClass) {
        return false;
      }
      if (selectedNcertSubject !== 'all' && n.subject !== selectedNcertSubject) return false;
      if (selectedNcertBook !== 'all' && n.bookName !== selectedNcertBook) return false;
      return true;
    });
    return Array.from(new Set(scoped.map((n) => n.chapter).filter(Boolean))).sort();
  }, [publishedNcertNotes, selectedNcertClass, selectedNcertSubject, selectedNcertBook]);

  // UPSC derived options strictly from Admin-published UPSC notes
  const publishedUpscNotes = useMemo(
    () => pdfNotes.filter((n) => n.published && n.noteCategory === 'upsc'),
    [pdfNotes],
  );

  const upscAvailablePapers = useMemo(() => {
    const scoped =
      selectedUpscStage === 'all'
        ? publishedUpscNotes
        : publishedUpscNotes.filter((n) => n.upscStage === selectedUpscStage);
    return Array.from(
      new Set(scoped.map((n) => n.upscPaper || n.classLabel).filter(Boolean)),
    ).sort();
  }, [publishedUpscNotes, selectedUpscStage]);

  const upscAvailableSubjects = useMemo(() => {
    const scoped = publishedUpscNotes.filter((n) => {
      if (selectedUpscStage !== 'all' && n.upscStage !== selectedUpscStage) return false;
      if (selectedUpscPaper !== 'all' && (n.upscPaper || n.classLabel) !== selectedUpscPaper) {
        return false;
      }
      return true;
    });
    return Array.from(new Set(scoped.map((n) => n.subject).filter(Boolean))).sort();
  }, [publishedUpscNotes, selectedUpscStage, selectedUpscPaper]);

  useEffect(() => {
    setSelectedClassId('all');
    setSelectedSubject('all');
    setSelectedChapter('all');
  }, [selectedExamId]);

  useEffect(() => {
    setSelectedSubject('all');
    setSelectedChapter('all');
  }, [selectedClassId]);

  useEffect(() => {
    setSelectedChapter('all');
  }, [selectedSubject]);

  useEffect(() => {
    setSelectedNcertSubject('all');
    setSelectedNcertBook('all');
    setSelectedNcertChapter('all');
  }, [selectedNcertClass]);

  useEffect(() => {
    setSelectedNcertBook('all');
    setSelectedNcertChapter('all');
  }, [selectedNcertSubject]);

  useEffect(() => {
    setSelectedNcertChapter('all');
  }, [selectedNcertBook]);

  useEffect(() => {
    setSelectedUpscPaper('all');
    setSelectedUpscSubject('all');
  }, [selectedUpscStage]);

  // Reconcile filters safely when centralized exams refresh (SSE / Admin publish)
  useEffect(() => {
    if (selectedExamId !== 'all' && !exams.some((e) => e.id === selectedExamId)) {
      setSelectedExamId('all');
      return;
    }
    if (selectedClassId !== 'all' && !availableClasses.some((c) => c.id === selectedClassId)) {
      setSelectedClassId('all');
      return;
    }
    if (selectedSubject !== 'all' && !availableSubjects.some((s) => s.name === selectedSubject)) {
      setSelectedSubject('all');
      return;
    }
    if (selectedChapter !== 'all' && !availableChapters.some((ch) => ch.name === selectedChapter)) {
      setSelectedChapter('all');
    }
  }, [exams, availableClasses, availableSubjects, availableChapters, selectedExamId, selectedClassId, selectedSubject, selectedChapter]);

  const categoryCounts = useMemo(() => {
    const pub = pdfNotes.filter((n) => n.published);
    return {
      all: pub.length,
      exam: pub.filter((n) => (n.noteCategory || 'exam') === 'exam').length,
      ncert: pub.filter((n) => n.noteCategory === 'ncert').length,
      upsc: pub.filter((n) => n.noteCategory === 'upsc').length,
    };
  }, [pdfNotes]);

  const filteredNotes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return pdfNotes.filter((n) => {
      if (!n.published) return false;
      const cat = n.noteCategory || 'exam';
      if (selectedCategory !== 'all' && cat !== selectedCategory) return false;

      if (selectedCategory === 'exam') {
        if (selectedExamId !== 'all' && n.examId !== selectedExamId) return false;
        if (selectedClassId !== 'all' && n.classId !== selectedClassId) return false;
        if (selectedSubject !== 'all' && n.subject !== selectedSubject) return false;
        if (selectedChapter !== 'all' && n.chapter !== selectedChapter) return false;
      } else if (selectedCategory === 'ncert') {
        if (selectedNcertClass !== 'all' && (n.ncertClass || n.classLabel) !== selectedNcertClass) {
          return false;
        }
        if (selectedNcertSubject !== 'all' && n.subject !== selectedNcertSubject) return false;
        if (selectedNcertBook !== 'all' && n.bookName !== selectedNcertBook) return false;
        if (selectedNcertChapter !== 'all' && n.chapter !== selectedNcertChapter) return false;
      } else if (selectedCategory === 'upsc') {
        if (selectedUpscStage !== 'all' && n.upscStage !== selectedUpscStage) return false;
        if (selectedUpscPaper !== 'all' && (n.upscPaper || n.classLabel) !== selectedUpscPaper) {
          return false;
        }
        if (selectedUpscSubject !== 'all' && n.subject !== selectedUpscSubject) return false;
      }

      if (q) {
        const hay = `${n.title} ${n.description} ${n.examName} ${n.classLabel} ${n.subject} ${n.bookName || ''} ${n.ncertClass || ''} ${n.upscStage || ''} ${n.upscPaper || ''} ${n.chapter} ${n.topic} ${n.noteCategory || 'exam'}`;
        if (!matchesSearchQuery(hay, searchQuery)) return false;
      }
      return true;
    });
  }, [
    pdfNotes,
    selectedCategory,
    selectedExamId,
    selectedClassId,
    selectedSubject,
    selectedChapter,
    selectedNcertClass,
    selectedNcertSubject,
    selectedNcertBook,
    selectedNcertChapter,
    selectedUpscStage,
    selectedUpscPaper,
    selectedUpscSubject,
    searchQuery,
  ]);

  const ensureStudentToken = async (): Promise<string | null> => {
    if (studentToken) return studentToken;
    setOpeningNote(true);
    setSessionError(null);
    try {
      const res = await createStudentSession();
      onSessionReady(res.token, res.student);
      return res.token;
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : 'Unable to start reading session.');
      return null;
    } finally {
      setOpeningNote(false);
    }
  };

  const handleOpenNote = async (note: PdfNoteMetadata) => {
    const token = await ensureStudentToken();
    if (token) {
      setActiveNote(note);
    }
  };

  const handleStudentRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName.trim() || !regEmail.trim()) return;
    setRegistering(true);
    setSessionError(null);
    try {
      const res = await createStudentSession({
        name: regName.trim(),
        email: regEmail.trim(),
        rollNumber: regRoll.trim() || undefined,
        classLevel: regClass.trim() || 'Class 10',
        examId: selectedExamId !== 'all' ? selectedExamId : undefined,
      });
      onSessionReady(res.token, res.student);
      setRegisterModalOpen(false);
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setRegistering(false);
    }
  };

  if (activeNote && studentToken) {
    return (
      <div className="h-full flex flex-col p-3 sm:p-5 max-w-6xl mx-auto w-full">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setActiveNote(null)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <ChevronRight className="w-4 h-4 rotate-180" />
            <span>Back to PDF Notes Library</span>
          </button>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>{activeNote.examName}</span>
            <span>·</span>
            <span>{activeNote.subject}</span>
            {activeNote.bookName && (
              <>
                <span>·</span>
                <span>{activeNote.bookName}</span>
              </>
            )}
            <span>·</span>
            <span>{activeNote.chapter}</span>
          </div>
        </div>

        <div className="flex-1 min-h-0">
          <ProtectedPdfCanvasReader
            noteId={activeNote.id}
            title={activeNote.title}
            subtitle={`${activeNote.examName} · ${activeNote.classLabel} · ${activeNote.subject}${activeNote.bookName ? ` (${activeNote.bookName})` : ''} · ${activeNote.chapter}`}
            authToken={studentToken}
            language={language}
            onClose={() => setActiveNote(null)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-4 md:px-6 py-6 bg-[#F8FAFC] dark:bg-slate-950">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Student Learning Hub Header */}
        <div className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4 shadow-xs">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#4338CA] dark:text-indigo-300 mb-1">
              <Lock className="w-3.5 h-3.5" />
              <span>Protected Online Study Notes</span>
            </div>
            <h1 className="font-display text-2xl font-bold text-[#0F172A] dark:text-white">
              PDF Notes, NCERT Notes (Class 6–12) &amp; UPSC Notes
            </h1>
            <p className="text-sm text-[#64748B] dark:text-slate-400 mt-1">
              Read Admin-published Examination Notes, NCERT Class 6–12 Textbooks/Chapter Notes, and UPSC Prelims/Mains Study PDFs online inside the protected canvas reader.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigateModule('mock-test')}
              className="px-3.5 py-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-xs font-semibold text-[#0F172A] dark:text-slate-200 hover:border-[#2563EB]"
            >
              Mock Test
            </button>
            <button
              type="button"
              onClick={() => onNavigateModule('questions')}
              className="px-3.5 py-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-xs font-semibold text-[#0F172A] dark:text-slate-200 hover:border-[#2563EB]"
            >
              Question Generation
            </button>
            <button
              type="button"
              onClick={() => onNavigateModule('upsc')}
              className="px-3.5 py-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-xs font-semibold text-[#4338CA] dark:text-indigo-300 hover:border-[#4338CA]"
            >
              UPSC Hub
            </button>
            <button
              type="button"
              onClick={() => setRegisterModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#4338CA] to-[#2563EB] text-white text-xs font-semibold shadow-xs"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>{studentProfile ? studentProfile.name : 'Student Profile'}</span>
            </button>
          </div>
        </div>

        {/* Category Switcher Tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {(
            [
              { id: 'all', label: 'All Published Notes', count: categoryCounts.all },
              { id: 'exam', label: 'Exam PDF Notes', count: categoryCounts.exam },
              { id: 'ncert', label: 'NCERT Notes (Class 6–12)', count: categoryCounts.ncert },
              { id: 'upsc', label: 'UPSC Notes', count: categoryCounts.upsc },
            ] as const
          ).map((cat) => {
            const active = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`p-3.5 rounded-xl border text-left transition-all ${
                  active
                    ? 'border-[#4338CA] bg-gradient-to-r from-[#4338CA] to-[#2563EB] text-white shadow-xs'
                    : 'border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 text-[#0F172A] dark:text-slate-200 hover:border-[#2563EB]'
                }`}
              >
                <div className="text-xs font-bold">{cat.label}</div>
                <div
                  className={`text-[11px] mt-0.5 tabular-nums ${
                    active ? 'text-indigo-100' : 'text-[#64748B] dark:text-slate-400'
                  }`}
                >
                  {cat.count} {cat.count === 1 ? 'PDF note' : 'PDF notes'}
                </div>
              </button>
            );
          })}
        </div>

        {sessionError && (
          <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300">
            {sessionError}
          </div>
        )}

        {/* Dynamic Filter Card */}
        <div className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-bold text-[#0F172A] dark:text-white">
              <Filter className="w-4 h-4 text-[#4338CA]" />
              <span>
                {selectedCategory === 'ncert'
                  ? 'Filter NCERT Notes — Class 6 to 12 · Subject · Book · Chapter'
                  : selectedCategory === 'upsc'
                    ? 'Filter UPSC Notes — Stage · Paper · Subject'
                    : 'Filter Study PDF Notes'}
              </span>
            </div>
            {(selectedExamId !== 'all' ||
              selectedNcertClass !== 'all' ||
              selectedUpscStage !== 'all' ||
              searchQuery) && (
              <button
                type="button"
                onClick={() => {
                  setSelectedExamId('all');
                  setSelectedNcertClass('all');
                  setSelectedNcertSubject('all');
                  setSelectedNcertBook('all');
                  setSelectedNcertChapter('all');
                  setSelectedUpscStage('all');
                  setSelectedUpscPaper('all');
                  setSelectedUpscSubject('all');
                  setSearchQuery('');
                }}
                className="text-xs font-semibold text-[#2563EB] hover:underline"
              >
                Reset Filters
              </button>
            )}
          </div>

          {/* NCERT Class 6-12 Quick Selector + Cascading Filters */}
          {selectedCategory === 'ncert' ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedNcertClass('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                    selectedNcertClass === 'all'
                      ? 'bg-[#4338CA] text-white border-[#4338CA]'
                      : 'border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-[#0F172A] dark:text-slate-200'
                  }`}
                >
                  All Classes (6–12)
                </button>
                {NCERT_CLASS_LIST.map((cls) => (
                  <button
                    key={cls}
                    type="button"
                    onClick={() => setSelectedNcertClass(cls)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                      selectedNcertClass === cls
                        ? 'bg-[#4338CA] text-white border-[#4338CA]'
                        : 'border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-[#0F172A] dark:text-slate-200'
                    }`}
                  >
                    {cls}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#64748B] mb-1">Subject</label>
                  <select
                    value={selectedNcertSubject}
                    onChange={(e) => setSelectedNcertSubject(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-sm"
                  >
                    <option value="all">All Subjects</option>
                    {ncertAvailableSubjects.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#64748B] mb-1">Book Name</label>
                  <select
                    value={selectedNcertBook}
                    onChange={(e) => setSelectedNcertBook(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-sm"
                  >
                    <option value="all">All NCERT Books</option>
                    {ncertAvailableBooks.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#64748B] mb-1">Chapter</label>
                  <select
                    value={selectedNcertChapter}
                    onChange={(e) => setSelectedNcertChapter(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-sm"
                  >
                    <option value="all">All Chapters</option>
                    {ncertAvailableChapters.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#64748B] mb-1">Search NCERT</label>
                  <SearchBarWithVoice
                    compact
                    value={searchQuery}
                    onChange={setSearchQuery}
                    defaultLanguage={language}
                    placeholder="Book, chapter, topic..."
                    ariaLabel="Search NCERT notes"
                  />
                </div>
              </div>
            </div>
          ) : selectedCategory === 'upsc' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#64748B] mb-1">UPSC Stage</label>
                <select
                  value={selectedUpscStage}
                  onChange={(e) => setSelectedUpscStage(e.target.value as 'all' | UpscStage)}
                  className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-sm"
                >
                  <option value="all">All Stages (Prelims &amp; Mains)</option>
                  <option value="prelims">UPSC Prelims</option>
                  <option value="mains">UPSC Mains</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#64748B] mb-1">UPSC Paper</label>
                <select
                  value={selectedUpscPaper}
                  onChange={(e) => setSelectedUpscPaper(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-sm"
                >
                  <option value="all">All Papers</option>
                  {upscAvailablePapers.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#64748B] mb-1">Subject / Area</label>
                <select
                  value={selectedUpscSubject}
                  onChange={(e) => setSelectedUpscSubject(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-sm"
                >
                  <option value="all">All Subjects</option>
                  {upscAvailableSubjects.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#64748B] mb-1">Search UPSC Notes</label>
                <SearchBarWithVoice
                  compact
                  value={searchQuery}
                  onChange={setSearchQuery}
                  defaultLanguage={language}
                  placeholder="Paper, subject, unit..."
                  ariaLabel="Search UPSC notes"
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Exam</label>
                <select
                  value={selectedExamId}
                  disabled={selectedCategory !== 'exam'}
                  onChange={(e) => setSelectedExamId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm disabled:opacity-50"
                >
                  <option value="all">All Examinations</option>
                  {exams.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Class / Level</label>
                <select
                  value={selectedClassId}
                  disabled={selectedExamId === 'all' || availableClasses.length === 0}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm disabled:opacity-50"
                >
                  <option value="all">All Classes</option>
                  {availableClasses.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Subject</label>
                <select
                  value={selectedSubject}
                  disabled={selectedExamId === 'all' || availableSubjects.length === 0}
                  onChange={(e) => setSelectedSubject(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm disabled:opacity-50"
                >
                  <option value="all">All Subjects</option>
                  {availableSubjects.map((sub, idx) => (
                    <option key={`${sub.name}-${idx}`} value={sub.name}>
                      {sub.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Chapter</label>
                <select
                  value={selectedChapter}
                  disabled={selectedSubject === 'all' || availableChapters.length === 0}
                  onChange={(e) => setSelectedChapter(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm disabled:opacity-50"
                >
                  <option value="all">All Chapters</option>
                  {availableChapters.map((ch, idx) => (
                    <option key={`${ch.name}-${idx}`} value={ch.name}>
                      {ch.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Search Notes</label>
                <SearchBarWithVoice
                  compact
                  value={searchQuery}
                  onChange={setSearchQuery}
                  defaultLanguage={language}
                  placeholder="Title, book, topic..."
                  ariaLabel="Search PDF notes"
                />
              </div>
            </div>
          )}
        </div>

        {/* Published PDF Notes Grid */}
        {filteredNotes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-900 p-10 text-center space-y-2">
            <BookOpen className="w-10 h-10 text-slate-400 mx-auto" />
            <h3 className="font-display font-bold text-lg text-[#0F172A] dark:text-slate-100">
              No Published PDF Notes Found
            </h3>
            <p className="text-sm text-[#64748B] dark:text-slate-400 max-w-md mx-auto">
              {selectedCategory === 'ncert'
                ? 'Published NCERT Notes (Class 6 to 12) uploaded by Admin will appear here automatically organized by Class, Subject, Book Name, and Chapter.'
                : selectedCategory === 'upsc'
                  ? 'Published UPSC Prelims & Mains study PDFs uploaded by Admin will appear here automatically.'
                  : 'Published PDF study notes uploaded by your Administrator for this selection will appear here automatically for protected online reading.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredNotes.map((note) => (
              <div
                key={note.id}
                className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col justify-between gap-4 hover:border-[#4338CA] dark:hover:border-indigo-700 transition-colors shadow-xs"
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-[#4338CA] dark:text-indigo-300 flex items-center justify-center shrink-0">
                        <FileText className="w-4.5 h-4.5" />
                      </div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[#4338CA] dark:text-indigo-300">
                        {note.noteCategory === 'ncert'
                          ? `NCERT · ${note.ncertClass || note.classLabel}`
                          : note.noteCategory === 'upsc'
                            ? `UPSC · ${note.upscStage || 'prelims'}`
                            : 'Exam Notes'}
                      </span>
                    </div>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 capitalize">
                      <Globe className="w-3 h-3" />
                      {note.language}
                    </span>
                  </div>

                  <div>
                    <h3 className="font-display font-bold text-base text-[#0F172A] dark:text-white line-clamp-2">
                      {note.title}
                    </h3>
                    {note.description && (
                      <p className="text-xs text-[#64748B] dark:text-slate-400 mt-1 line-clamp-2">
                        {note.description}
                      </p>
                    )}
                  </div>

                  <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-[#4338CA] shrink-0" />
                      <span className="truncate font-medium">
                        {note.noteCategory === 'ncert'
                          ? `${note.subject}${note.bookName ? ` · ${note.bookName}` : ''}`
                          : note.noteCategory === 'upsc'
                            ? `${note.upscPaper || note.classLabel} · ${note.subject}`
                            : `${note.examName} · ${note.classLabel}`}
                      </span>
                    </div>
                    <div className="text-slate-500 dark:text-slate-400 truncate">
                      {note.noteCategory === 'ncert' || note.noteCategory === 'upsc'
                        ? `${note.chapter}${note.topic ? ` → ${note.topic}` : ''}`
                        : `${note.subject} → ${note.chapter}${note.topic ? ` → ${note.topic}` : ''}`}
                    </div>
                    <div className="text-slate-400 text-[11px] tabular-nums">
                      {note.pageCount} {note.pageCount === 1 ? 'page' : 'pages'} · {formatFileSize(note.fileSize)}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={openingNote}
                  onClick={() => void handleOpenNote(note)}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#4338CA] to-[#2563EB] hover:from-[#3730A3] hover:to-[#1D4ED8] text-white text-sm font-semibold transition-colors disabled:opacity-60"
                >
                  <Eye className="w-4 h-4" />
                  <span>Read Online</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Student Profile Registration Modal */}
      {registerModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-lg">Student Profile</h3>
              <button
                type="button"
                onClick={() => setRegisterModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={(e) => void handleStudentRegister(e)} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="student@example.com"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Roll Number
                  </label>
                  <input
                    type="text"
                    value={regRoll}
                    onChange={(e) => setRegRoll(e.target.value)}
                    placeholder="Optional"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Class / Exam
                  </label>
                  <input
                    type="text"
                    value={regClass}
                    onChange={(e) => setRegClass(e.target.value)}
                    placeholder="Class 10"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRegisterModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={registering}
                  className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold disabled:opacity-50"
                >
                  {registering ? 'Saving...' : 'Save & Continue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
