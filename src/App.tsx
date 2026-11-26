import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookMarked,
  BookOpen,
  Calculator,
  Calendar,
  Check,
  ClipboardCheck,
  Code2,
  Edit3,
  FileText,
  Film,
  GraduationCap,
  HelpCircle,
  History,
  Image as ImageIcon,
  Landmark,
  Languages,
  Menu,
  MessageSquare,
  Moon,
  PenTool,
  Plus,
  Settings,
  ShieldCheck,
  Sun,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import type {
  AppSettings,
  ChatThread,
  ExamDefinition,
  MockTestAttempt,
  ModelInfo,
  ModuleId,
  PdfNoteMetadata,
  ProviderStatus,
  PublicAiPolicy,
  StudentRecord,
  StudyGoal,
  StudyTask,
  SyllabusPdfReference,
  UgcNetPublicCatalogResponse,
  UpscPublicCatalogResponse,
} from './types';
import { BUILTIN_EXAMS } from './data/examCatalog';
import {
  APP_CHROME_TEXT,
  NAV_LABELS,
  resolveUiLang,
} from './data/uiTranslations';
import {
  fetchProvidersOverview,
  refreshProvidersOverview,
  setFallbackNotificationListener,
  setGlobalSelectionMode,
  type AiExecutionMetadata,
} from './utils/aiClient';
import {
  createAdminExam,
  fetchCatalog,
  fetchPublishedUgcNetSyllabus,
  fetchPublishedUpscSyllabus,
  updateAdminExam,
} from './utils/adminApi';
import { ChatWorkspace } from './components/ChatWorkspace';
import { SyllabusExplorer } from './components/SyllabusExplorer';
import { PdfToolkit } from './components/PdfToolkit';
import { MockTestCenter } from './components/MockTestCenter';
import { QuestionGenerator } from './components/QuestionGenerator';
import { StudentPdfNotesView } from './components/StudentPdfNotesView';
import { AdminLoginView } from './components/AdminLoginView';
import { AdminDashboard } from './components/AdminDashboard';
import { NotesMaker } from './components/NotesMaker';
import { ImageAssistant } from './components/ImageAssistant';
import { WritingTools } from './components/WritingTools';
import { MathScienceSolver } from './components/MathScienceSolver';
import { CodingAssistant } from './components/CodingAssistant';
import { StudyPlanner } from './components/StudyPlanner';
import { ChatHistoryView } from './components/ChatHistoryView';
import { SettingsView } from './components/SettingsView';
import { ModelSelectorDropdown } from './components/ModelSelectorDropdown';
import { VideoGeneratorView } from './components/VideoGeneratorView';
import { MyGeneratedVideosView } from './components/MyGeneratedVideosView';
import { UpscPortalView } from './components/UpscPortalView';
import { LessonPlanGeneratorView } from './components/LessonPlanGeneratorView';
import { SearchBarWithVoice } from './components/SearchBarWithVoice';
import {
  matchesSearchQuery,
  searchAuthorizedStudyContent,
} from './utils/studySearch';

const STORAGE_KEYS = {
  THREADS: 'sg_chat_threads_v1',
  ACTIVE_THREAD: 'sg_active_thread_v1',
  SETTINGS: 'sg_settings_v1',
  MOCK_ATTEMPTS: 'sg_mock_attempts_v1',
  STUDY_TASKS: 'sg_study_tasks_v1',
  STUDY_GOALS: 'sg_study_goals_v1',
  CUSTOM_EXAMS: 'sg_custom_exams_v1',
  SYLLABUS_PDFS: 'sg_syllabus_pdfs_v1',
};

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'light',
  selectionMode: 'auto',
  provider: 'gemini',
  model: 'gemini-4-hydrogen',
  language: 'auto',
  streaming: true,
  speechRate: 1.0,
};

function createEmptyThread(initial?: Partial<Pick<AppSettings, 'selectionMode' | 'provider' | 'model'>>): ChatThread {
  const now = Date.now();
  return {
    id: `chat-${now}-${Math.random().toString(36).slice(2, 6)}`,
    title: 'New Conversation',
    createdAt: now,
    updatedAt: now,
    selectionMode: initial?.selectionMode ?? 'auto',
    provider: initial?.provider ?? 'gemini',
    model: initial?.model ?? 'gemini-4-hydrogen',
    messages: [],
  };
}

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

const NAV_ITEMS: Array<{
  id: ModuleId;
  icon: React.ComponentType<{ className?: string }>;
  accentClass: string;
}> = [
  { id: 'chat', icon: MessageSquare, accentClass: 'text-violet-600 dark:text-violet-400' },
  { id: 'syllabus', icon: BookMarked, accentClass: 'text-purple-600 dark:text-purple-400' },
  { id: 'mock-test', icon: ClipboardCheck, accentClass: 'text-teal-600 dark:text-teal-400' },
  { id: 'questions', icon: HelpCircle, accentClass: 'text-orange-600 dark:text-orange-400' },
  { id: 'pdf-notes', icon: BookOpen, accentClass: 'text-indigo-600 dark:text-indigo-400' },
  { id: 'upsc', icon: Landmark, accentClass: 'text-[#4338CA] dark:text-cyan-400' },
  { id: 'lesson-plan', icon: GraduationCap, accentClass: 'text-[#4338CA] dark:text-indigo-400' },
  { id: 'video-generator', icon: Video, accentClass: 'text-rose-600 dark:text-rose-400' },
  { id: 'my-videos', icon: Film, accentClass: 'text-fuchsia-600 dark:text-fuchsia-400' },
  { id: 'pdf', icon: FileText, accentClass: 'text-blue-600 dark:text-blue-400' },
  { id: 'notes', icon: PenTool, accentClass: 'text-emerald-600 dark:text-emerald-400' },
  { id: 'image', icon: ImageIcon, accentClass: 'text-pink-600 dark:text-pink-400' },
  { id: 'writing', icon: PenTool, accentClass: 'text-orange-600 dark:text-orange-400' },
  { id: 'math', icon: Calculator, accentClass: 'text-blue-600 dark:text-blue-400' },
  { id: 'coding', icon: Code2, accentClass: 'text-violet-600 dark:text-violet-400' },
  { id: 'planner', icon: Calendar, accentClass: 'text-teal-600 dark:text-teal-400' },
  { id: 'history', icon: History, accentClass: 'text-slate-600 dark:text-slate-400' },
  { id: 'settings', icon: Settings, accentClass: 'text-slate-600 dark:text-slate-400' },
  { id: 'admin', icon: ShieldCheck, accentClass: 'text-violet-600 dark:text-violet-400' },
];

export default function App() {
  const [activeModule, setActiveModule] = useState<ModuleId>('chat');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [settings, setSettings] = useState<AppSettings>(() => {
    const raw = loadJson<Partial<AppSettings> & { provider?: string }>(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
    const validProv = raw.provider === 'ollama' ? 'ollama' : 'gemini';
    const validMode =
      raw.selectionMode === 'auto' || raw.selectionMode === 'gemini' || raw.selectionMode === 'ollama'
        ? raw.selectionMode
        : 'auto';
    return {
      ...DEFAULT_SETTINGS,
      ...raw,
      selectionMode: validMode,
      provider: validProv,
      model: raw.model || (validProv === 'gemini' ? 'gemini-4-hydrogen' : ''),
    };
  });

  const [threads, setThreads] = useState<ChatThread[]>(() => {
    const saved = loadJson<ChatThread[]>(STORAGE_KEYS.THREADS, []);
    return saved.length > 0 ? saved : [createEmptyThread()];
  });

  const [activeThreadId, setActiveThreadId] = useState<string>(() => {
    const savedId = localStorage.getItem(STORAGE_KEYS.ACTIVE_THREAD);
    return savedId || '';
  });

  const [mockAttempts, setMockAttempts] = useState<MockTestAttempt[]>(() =>
    loadJson(STORAGE_KEYS.MOCK_ATTEMPTS, []),
  );
  const [studyTasks, setStudyTasks] = useState<StudyTask[]>(() =>
    loadJson(STORAGE_KEYS.STUDY_TASKS, []),
  );
  const [studyGoals, setStudyGoals] = useState<StudyGoal[]>(() =>
    loadJson(STORAGE_KEYS.STUDY_GOALS, []),
  );
  const [customExams, setCustomExams] = useState<ExamDefinition[]>(() =>
    loadJson<ExamDefinition[]>(STORAGE_KEYS.CUSTOM_EXAMS, []),
  );
  const [syllabusPdfs, setSyllabusPdfs] = useState<SyllabusPdfReference[]>(() =>
    loadJson<SyllabusPdfReference[]>(STORAGE_KEYS.SYLLABUS_PDFS, []),
  );

  // Sidebar chat search & inline rename
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');

  // Centralized Database State + Strict In-Memory Auth Sessions (NO localStorage for tokens)
  const [centralExams, setCentralExams] = useState<ExamDefinition[] | null>(null);
  const [publishedPdfNotes, setPublishedPdfNotes] = useState<PdfNoteMetadata[]>([]);
  const [ugcNetCatalog, setUgcNetCatalog] = useState<UgcNetPublicCatalogResponse | null>(null);
  const [upscCatalog, setUpscCatalog] = useState<UpscPublicCatalogResponse | null>(null);
  const catalogVersionRef = useRef<number>(0);
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [adminId, setAdminId] = useState<string>('');
  const [studentToken, setStudentToken] = useState<string | null>(null);
  const [studentProfile, setStudentProfile] = useState<StudentRecord | null>(null);

  // Providers state
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [aiPolicy, setAiPolicy] = useState<PublicAiPolicy | null>(null);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [fallbackNotice, setFallbackNotice] = useState<AiExecutionMetadata | null>(null);

  const uiLang = resolveUiLang(settings.language);
  const navLabels = NAV_LABELS[uiLang];
  const chromeText = APP_CHROME_TEXT[uiLang];

  const allExams = useMemo(() => {
    if (centralExams !== null) {
      return centralExams;
    }
    const map = new Map<string, ExamDefinition>();
    for (const ex of BUILTIN_EXAMS) map.set(ex.id, ex);
    for (const cx of customExams) map.set(cx.id, cx);
    return Array.from(map.values());
  }, [centralExams, customExams]);

  const refreshCentralCatalog = useCallback(async () => {
    try {
      const [data, ugcData, upscData] = await Promise.all([
        fetchCatalog(),
        fetchPublishedUgcNetSyllabus().catch(() => null),
        fetchPublishedUpscSyllabus().catch(() => null),
      ]);
      setCentralExams(data.exams);
      setPublishedPdfNotes(data.pdfNotes);
      if (ugcData) {
        setUgcNetCatalog(ugcData);
      }
      if (upscData) {
        setUpscCatalog(upscData);
      }
      if (typeof data.version === 'number') {
        catalogVersionRef.current = data.version;
      }
    } catch {
      // Fallback safely to built-in catalog if offline
    }
  }, []);

  const refreshProviders = async (forceDiscovery = false) => {
    setLoadingProviders(true);
    try {
      const data = forceDiscovery
        ? await refreshProvidersOverview()
        : await fetchProvidersOverview();
      setProviders(data.providers);
      setAiPolicy(data.policy);
    } catch {
      // Keep previous providers state if offline
    } finally {
      setLoadingProviders(false);
    }
  };

  useEffect(() => {
    void refreshProviders();
    void refreshCentralCatalog();
  }, [refreshCentralCatalog]);

  // Real-time SSE synchronization across all student/public/admin tabs when catalog updates
  useEffect(() => {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;
    let closed = false;
    let source: EventSource | null = null;
    let reconnectTimer: number | null = null;

    const connect = () => {
      if (closed) return;
      source = new EventSource('/api/catalog/events');
      source.addEventListener('catalog-sync', (ev) => {
        try {
          const payload = JSON.parse((ev as MessageEvent).data) as { version?: number };
          if (typeof payload.version === 'number' && payload.version !== catalogVersionRef.current) {
            void refreshCentralCatalog();
          }
        } catch {
          void refreshCentralCatalog();
        }
      });
      source.onerror = () => {
        source?.close();
        source = null;
        if (!closed && !reconnectTimer) {
          reconnectTimer = window.setTimeout(() => {
            reconnectTimer = null;
            connect();
          }, 4000);
        }
      };
    };

    connect();
    const onFocusOrVisible = () => {
      if (!document.hidden) {
        void refreshCentralCatalog();
      }
    };
    window.addEventListener('focus', onFocusOrVisible);
    document.addEventListener('visibilitychange', onFocusOrVisible);

    return () => {
      closed = true;
      source?.close();
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      window.removeEventListener('focus', onFocusOrVisible);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
    };
  }, [refreshCentralCatalog]);

  useEffect(() => {
    setGlobalSelectionMode(settings.selectionMode);
  }, [settings.selectionMode]);

  useEffect(() => {
    setFallbackNotificationListener((meta) => {
      setFallbackNotice(meta);
    });
    return () => setFallbackNotificationListener(null);
  }, []);

  // Theme & html lang sync
  useEffect(() => {
    document.documentElement.classList.toggle('dark', settings.theme === 'dark');
    document.documentElement.lang = settings.language === 'odia' ? 'or' : 'en';
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.CUSTOM_EXAMS, JSON.stringify(customExams));
    } catch {
      // ignore quota errors
    }
  }, [customExams]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.SYLLABUS_PDFS, JSON.stringify(syllabusPdfs));
    } catch {
      // ignore quota errors
    }
  }, [syllabusPdfs]);

  // Persistence
  useEffect(() => {
    try {
      const sanitized = threads.map((t) => ({
        ...t,
        messages: t.messages.map((m) => ({
          ...m,
          // Keep metadata for attachments without exceeding localStorage quota on huge PDFs/images
          attachments: m.attachments?.map((a) => ({
            ...a,
            extractedText: a.extractedText?.slice(0, 6000),
            imageDataUrl: a.imageDataUrl && a.imageDataUrl.length < 180000 ? a.imageDataUrl : undefined,
          })),
        })),
      }));
      localStorage.setItem(STORAGE_KEYS.THREADS, JSON.stringify(sanitized));
    } catch {
      // Ignore storage quota errors
    }
  }, [threads]);

  useEffect(() => {
    if (activeThreadId) {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_THREAD, activeThreadId);
    }
  }, [activeThreadId]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.MOCK_ATTEMPTS, JSON.stringify(mockAttempts.slice(0, 20)));
    } catch {
      // Ignore
    }
  }, [mockAttempts]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.STUDY_TASKS, JSON.stringify(studyTasks));
  }, [studyTasks]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.STUDY_GOALS, JSON.stringify(studyGoals));
  }, [studyGoals]);

  const activeThread = useMemo(() => {
    return threads.find((t) => t.id === activeThreadId) || threads[0];
  }, [threads, activeThreadId]);

  useEffect(() => {
    if (activeThread && activeThread.id !== activeThreadId) {
      setActiveThreadId(activeThread.id);
    }
  }, [activeThread, activeThreadId]);

  const allModels = useMemo<ModelInfo[]>(() => {
    return providers.flatMap((p) => p.models);
  }, [providers]);

  const activeEffectiveSelection = useMemo(() => {
    if (activeModule === 'chat' && activeThread) {
      return {
        selectionMode: activeThread.selectionMode ?? settings.selectionMode ?? 'auto',
        provider: activeThread.provider ?? settings.provider,
        model: activeThread.model ?? settings.model,
      };
    }
    return {
      selectionMode: settings.selectionMode ?? 'auto',
      provider: settings.provider,
      model: settings.model,
    };
  }, [activeModule, activeThread, settings.selectionMode, settings.provider, settings.model]);

  const currentModelInfo = useMemo<ModelInfo | null>(() => {
    if (activeEffectiveSelection.selectionMode === 'auto') {
      const defProvId = aiPolicy?.defaultProvider || 'gemini';
      const provObj = providers.find((p) => p.id === defProvId);
      return provObj?.models[0] || allModels[0] || null;
    }
    return (
      allModels.find(
        (m) =>
          m.provider === activeEffectiveSelection.provider &&
          m.id === activeEffectiveSelection.model,
      ) || null
    );
  }, [allModels, providers, aiPolicy, activeEffectiveSelection]);

  const handleNewChat = () => {
    const fresh = createEmptyThread({
      selectionMode: settings.selectionMode,
      provider: settings.provider,
      model: settings.model,
    });
    setThreads((prev) => [fresh, ...prev]);
    setActiveThreadId(fresh.id);
    setActiveModule('chat');
    setSidebarOpen(false);
  };

  const handleUpdateThread = (
    threadId: string,
    updater: (t: ChatThread) => ChatThread,
  ) => {
    setThreads((prev) => prev.map((t) => (t.id === threadId ? updater(t) : t)));
  };

  const handleDeleteThread = (threadId: string) => {
    setThreads((prev) => {
      const remaining = prev.filter((t) => t.id !== threadId);
      if (remaining.length === 0) {
        const fresh = createEmptyThread();
        setActiveThreadId(fresh.id);
        return [fresh];
      }
      if (activeThreadId === threadId) {
        setActiveThreadId(remaining[0].id);
      }
      return remaining;
    });
  };

  const handleRenameThread = (threadId: string, newTitle: string) => {
    setThreads((prev) =>
      prev.map((t) => (t.id === threadId ? { ...t, title: newTitle } : t)),
    );
  };

  const filteredSidebarThreads = useMemo(() => {
    const q = sidebarSearch.trim();
    if (!q) return threads.slice(0, 12);
    return threads
      .filter((t) => {
        const hay = `${t.title} ${t.messages.map((m) => m.content).join(' ')}`;
        return matchesSearchQuery(hay, q);
      })
      .slice(0, 12);
  }, [threads, sidebarSearch]);

  const authorizedStudyMatches = useMemo(
    () =>
      searchAuthorizedStudyContent({
        query: sidebarSearch,
        exams: allExams,
        pdfNotes: publishedPdfNotes,
        ugcNetCatalog,
        upscCatalog,
      }),
    [sidebarSearch, allExams, publishedPdfNotes, ugcNetCatalog, upscCatalog],
  );

  const handleAddChapterOrTopic = (
    examId: string,
    classId: string,
    subjectName: string,
    chapterName: string,
    topicName: string,
  ) => {
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
    if (centralExams !== null) {
      setCentralExams((prev) =>
        prev ? prev.map((x) => (x.id === cloned.id ? cloned : x)) : [cloned],
      );
    } else {
      setCustomExams((prev) => [...prev.filter((x) => x.id !== cloned.id), cloned]);
    }
    if (adminToken) {
      void updateAdminExam(adminToken, cloned.id, cloned).then(() => refreshCentralCatalog());
    }
  };

  const handleUpdateExam = (updatedExam: ExamDefinition) => {
    if (centralExams !== null) {
      setCentralExams((prev) =>
        prev ? prev.map((x) => (x.id === updatedExam.id ? updatedExam : x)) : [updatedExam],
      );
    } else {
      setCustomExams((prev) => [...prev.filter((x) => x.id !== updatedExam.id), updatedExam]);
    }
    if (adminToken) {
      void updateAdminExam(adminToken, updatedExam.id, updatedExam).then(() =>
        refreshCentralCatalog(),
      );
    }
  };

  const handleAddCustomExam = (exam: ExamDefinition) => {
    if (centralExams !== null) {
      setCentralExams((prev) => (prev ? [...prev, exam] : [exam]));
    } else {
      setCustomExams((prev) => [...prev, exam]);
    }
    if (adminToken) {
      void createAdminExam(adminToken, exam).then(() => refreshCentralCatalog());
    }
  };

  const activeNavLabel = navLabels[activeModule];

  return (
    <div className="h-screen w-screen overflow-hidden flex bg-[#F8FAFC] dark:bg-slate-950 text-[#0F172A] dark:text-slate-100">
      {/* Mobile Sidebar Backdrop */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 w-[268px] shrink-0 border-r border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col transition-transform duration-200 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Brand + Mobile Close */}
        <div className="px-4 py-3.5 border-b border-[#E2E8F0] dark:border-slate-800 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              setActiveModule('chat');
              setSidebarOpen(false);
            }}
            className="text-left min-w-0 group"
          >
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#4338CA] to-[#2563EB] text-white flex items-center justify-center shrink-0 shadow-xs">
                <GraduationCap className="w-4 h-4" />
              </span>
              <span className="font-display font-bold text-lg tracking-tight text-[#0F172A] dark:text-white whitespace-nowrap">
                PadhloAI
              </span>
            </div>
            <div className="text-[11px] font-medium text-[#64748B] dark:text-slate-400 truncate mt-0.5">
              Your AI-Powered Learning Companion.
            </div>
          </button>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800"
            aria-label={chromeText.closeSidebar}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* New Chat Button */}
        <div className="p-3">
          <button
            type="button"
            onClick={handleNewChat}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#4338CA] to-[#2563EB] hover:from-[#3730A3] hover:to-[#1D4ED8] text-white text-sm font-semibold shadow-xs transition-all min-h-[42px]"
          >
            <Plus className="w-4 h-4" />
            <span>{chromeText.newChat}</span>
          </button>
        </div>

        {/* Main Navigation + Recent Chats */}
        <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-4">
          <nav className="space-y-1" aria-label="Workspace Modules">
            {NAV_ITEMS.map((item) => {
              const active = activeModule === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveModule(item.id);
                    setSidebarOpen(false);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap min-h-[42px] ${
                    active
                      ? 'bg-gradient-to-r from-[#4338CA] to-[#2563EB] text-white shadow-xs'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                  }`}
                >
                  <item.icon className={`w-4 h-4 shrink-0 ${active ? 'text-cyan-200' : item.accentClass}`} />
                  <span className="truncate">{navLabels[item.id]}</span>
                </button>
              );
            })}
          </nav>

          {/* Searchable Recent Chats & Study Content in Sidebar */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
            <SearchBarWithVoice
              compact
              value={sidebarSearch}
              onChange={setSidebarSearch}
              defaultLanguage={settings.language}
              placeholder={chromeText.searchChats}
              ariaLabel="Search chats and authorized study materials"
            />

            <div className="space-y-1">
              {filteredSidebarThreads.map((t) => {
                const isSelected = activeModule === 'chat' && activeThread?.id === t.id;
                const isRenaming = renamingId === t.id;

                return (
                  <div
                    key={t.id}
                    className={`group flex items-center justify-between gap-1 px-2.5 py-1.5 rounded-lg text-xs ${
                      isSelected
                        ? 'bg-violet-50 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300 font-medium'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    {isRenaming ? (
                      <div className="flex items-center gap-1 flex-1">
                        <input
                          type="text"
                          value={renameText}
                          onChange={(e) => setRenameText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && renameText.trim()) {
                              handleRenameThread(t.id, renameText.trim());
                              setRenamingId(null);
                            }
                          }}
                          autoFocus
                          className="w-full px-1.5 py-0.5 rounded border border-violet-400 bg-white dark:bg-slate-950 text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (renameText.trim()) {
                              handleRenameThread(t.id, renameText.trim());
                            }
                            setRenamingId(null);
                          }}
                          className="p-0.5 text-emerald-600"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveThreadId(t.id);
                            setActiveModule('chat');
                            setSidebarOpen(false);
                          }}
                          className="truncate text-left flex-1 py-0.5"
                        >
                          {t.title}
                        </button>
                        <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setRenamingId(t.id);
                              setRenameText(t.title);
                            }}
                            title="Rename"
                            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
                          >
                            <Edit3 className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteThread(t.id)}
                            title="Delete"
                            className="p-1 rounded hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}

              {sidebarSearch.trim() && authorizedStudyMatches.length > 0 && (
                <div className="pt-2 mt-2 border-t border-slate-200/80 dark:border-slate-800 space-y-1">
                  <div className="px-2 text-[10px] font-bold uppercase tracking-wider text-[#4338CA] dark:text-indigo-300">
                    Matching Study Resources
                  </div>
                  {authorizedStudyMatches.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setActiveModule(item.moduleId);
                        setSidebarOpen(false);
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg border border-transparent hover:border-[#4338CA]/30 hover:bg-indigo-50/60 dark:hover:bg-indigo-950/30 transition-colors"
                    >
                      <div className="text-[10px] font-bold text-[#4338CA] dark:text-indigo-300 truncate">
                        {item.categoryLabel}
                      </div>
                      <div className="text-xs font-semibold text-[#0F172A] dark:text-slate-100 truncate">
                        {item.title}
                      </div>
                      <div className="text-[11px] text-[#64748B] dark:text-slate-400 truncate">
                        {item.subtitle}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Top Header */}
        <header className="h-16 shrink-0 px-4 md:px-6 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 min-h-[40px] min-w-[40px] flex items-center justify-center"
              aria-label={chromeText.openMenu}
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="font-display font-bold text-base md:text-lg text-slate-900 dark:text-white truncate">
              {activeNavLabel}
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {/* Header English / Odia Language Switcher */}
            <div
              role="group"
              aria-label={chromeText.languageLabel}
              className="inline-flex items-center p-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-900"
            >
              <Languages className="w-4 h-4 text-violet-600 dark:text-violet-400 mx-1.5 hidden sm:block shrink-0" />
              <button
                type="button"
                onClick={() =>
                  setSettings((prev) => ({ ...prev, language: 'english' }))
                }
                className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 min-h-[34px] ${
                  uiLang === 'english'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {chromeText.englishBtn}
              </button>
              <button
                type="button"
                onClick={() =>
                  setSettings((prev) => ({ ...prev, language: 'odia' }))
                }
                className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 min-h-[34px] ${
                  uiLang === 'odia'
                    ? 'bg-violet-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {chromeText.odiaBtn}
              </button>
            </div>

            {/* Quick Model Selector (Remembered per chat thread when in Chat, or global default in tools) */}
            <ModelSelectorDropdown
              providers={providers}
              policy={aiPolicy}
              value={activeEffectiveSelection}
              ariaLabel="Active AI Model"
              onChange={(next) => {
                if (activeModule === 'chat' && activeThread) {
                  handleUpdateThread(activeThread.id, (t) => ({
                    ...t,
                    selectionMode: next.selectionMode,
                    provider: next.provider,
                    model: next.model,
                  }));
                } else {
                  setSettings((prev) => ({
                    ...prev,
                    selectionMode: next.selectionMode,
                    provider: next.provider,
                    model: next.model,
                  }));
                }
              }}
              className="hidden md:block px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-sm font-medium max-w-[240px] truncate focus:outline-none focus:border-violet-500 min-h-[40px]"
            />

            <button
              type="button"
              onClick={() => setActiveModule('admin')}
              className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors min-h-[40px] ${
                adminToken
                  ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                  : 'border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-200'
              }`}
            >
              <ShieldCheck className="w-4 h-4 text-violet-600 dark:text-violet-400" />
              <span>{adminToken ? `Admin (${adminId})` : 'Admin Login'}</span>
            </button>

            <button
              type="button"
              onClick={() =>
                setSettings((prev) => ({
                  ...prev,
                  theme: prev.theme === 'dark' ? 'light' : 'dark',
                }))
              }
              aria-label="Toggle Light/Dark theme"
              className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-600 dark:text-slate-300 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
            >
              {settings.theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-slate-700" />
              )}
            </button>
          </div>
        </header>

        {/* Global Backup Provider Fallback Notification (for non-chat AI tools) */}
        {fallbackNotice && activeModule !== 'chat' && (
          <div className="shrink-0 px-4 md:px-6 py-2 bg-amber-50 dark:bg-amber-950/50 border-b border-amber-200 dark:border-amber-800 flex items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-200">
            <span>
              <strong>Backup AI Fallback Activated:</strong> Primary provider (
              {fallbackNotice.fallbackFrom === 'ollama' ? 'Ollama Local' : 'Google Gemini'}) was
              unavailable; completed using{' '}
              {fallbackNotice.providerUsed === 'ollama' ? 'Ollama Local' : 'Google Gemini'} (
              {fallbackNotice.modelUsed})
              {fallbackNotice.fallbackReason ? ` — ${fallbackNotice.fallbackReason}` : '.'}
            </span>
            <button
              type="button"
              onClick={() => setFallbackNotice(null)}
              className="p-1 rounded hover:bg-amber-200/60 dark:hover:bg-amber-900/50 shrink-0"
              aria-label="Dismiss fallback notice"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Active Module Viewport */}
        <main className="flex-1 min-h-0 overflow-hidden">
          {activeModule === 'chat' && activeThread && (
            <ChatWorkspace
              thread={activeThread}
              settings={settings}
              providers={providers}
              aiPolicy={aiPolicy}
              currentModelInfo={currentModelInfo}
              onUpdateThread={handleUpdateThread}
              onChangeLanguage={(lang) =>
                setSettings((prev) => ({ ...prev, language: lang }))
              }
              onNavigateModule={setActiveModule}
            />
          )}

          {activeModule === 'syllabus' && (
            <SyllabusExplorer
              settings={settings}
              exams={allExams}
              syllabusPdfs={syllabusPdfs}
              onAddCustomExam={handleAddCustomExam}
              onUpdateExam={handleUpdateExam}
              onAddChapterOrTopic={handleAddChapterOrTopic}
              onAddSyllabusPdf={(ref) => setSyllabusPdfs((prev) => [ref, ...prev])}
              onRemoveSyllabusPdf={(id) =>
                setSyllabusPdfs((prev) => prev.filter((p) => p.id !== id))
              }
              onSaveAttempt={(att) => setMockAttempts((prev) => [att, ...prev])}
              onOpenFullMockTests={() => setActiveModule('mock-test')}
              onOpenUpscHub={() => setActiveModule('upsc')}
            />
          )}

          {activeModule === 'pdf' && <PdfToolkit settings={settings} />}

          {activeModule === 'mock-test' && (
            <MockTestCenter
              settings={settings}
              attempts={mockAttempts}
              onSaveAttempt={(att) =>
                setMockAttempts((prev) => [att, ...prev])
              }
              sharedExams={allExams}
              ugcNetCatalog={ugcNetCatalog}
              upscCatalog={upscCatalog}
              sharedSyllabusPdfs={syllabusPdfs}
              onAddCustomExam={handleAddCustomExam}
              onUpdateExam={handleUpdateExam}
              onAddChapterOrTopic={handleAddChapterOrTopic}
              onAddSyllabusPdf={(ref) => setSyllabusPdfs((prev) => [ref, ...prev])}
              onRemoveSyllabusPdf={(id) =>
                setSyllabusPdfs((prev) => prev.filter((p) => p.id !== id))
              }
            />
          )}

          {activeModule === 'questions' && (
            <QuestionGenerator
              settings={settings}
              sharedExams={allExams}
              ugcNetCatalog={ugcNetCatalog}
              upscCatalog={upscCatalog}
              sharedSyllabusPdfs={syllabusPdfs}
              onAddCustomExam={handleAddCustomExam}
              onUpdateExam={handleUpdateExam}
              onAddChapterOrTopic={handleAddChapterOrTopic}
              onAddSyllabusPdf={(ref) => setSyllabusPdfs((prev) => [ref, ...prev])}
              onRemoveSyllabusPdf={(id) =>
                setSyllabusPdfs((prev) => prev.filter((p) => p.id !== id))
              }
            />
          )}

          {activeModule === 'pdf-notes' && (
            <StudentPdfNotesView
              exams={allExams}
              pdfNotes={publishedPdfNotes}
              studentToken={studentToken}
              studentProfile={studentProfile}
              language={settings.language}
              onSessionReady={(token, student) => {
                setStudentToken(token);
                if (student) setStudentProfile(student);
              }}
              onNavigateModule={(m) => setActiveModule(m)}
            />
          )}

          {activeModule === 'upsc' && (
            <UpscPortalView
              upscCatalog={upscCatalog}
              settings={settings}
              mockAttempts={mockAttempts}
              onRefreshUpscCatalog={() => void refreshCentralCatalog()}
              onNavigateModule={(m) => setActiveModule(m)}
            />
          )}

          {activeModule === 'lesson-plan' && (
            <LessonPlanGeneratorView settings={settings} exams={allExams} />
          )}

          {activeModule === 'video-generator' && (
            <VideoGeneratorView
              exams={allExams}
              settings={settings}
              studentToken={studentToken}
              studentProfile={studentProfile}
              onSessionReady={(token, student) => {
                setStudentToken(token);
                if (student) setStudentProfile(student);
              }}
              onNavigateModule={(m) => setActiveModule(m)}
            />
          )}

          {activeModule === 'my-videos' && (
            <MyGeneratedVideosView
              studentToken={studentToken}
              studentProfile={studentProfile}
              language={settings.language}
              onSessionReady={(token, student) => {
                setStudentToken(token);
                if (student) setStudentProfile(student);
              }}
              onNavigateModule={(m) => setActiveModule(m)}
            />
          )}

          {activeModule === 'admin' && (
            adminToken ? (
              <AdminDashboard
                adminToken={adminToken}
                adminId={adminId}
                onLogout={() => {
                  setAdminToken(null);
                  setAdminId('');
                }}
                onAdminIdUpdated={(nextToken, nextId) => {
                  setAdminToken(nextToken);
                  setAdminId(nextId);
                }}
                onCatalogSync={refreshCentralCatalog}
                onAiConfigSync={() => void refreshProviders(true)}
              />
            ) : (
              <AdminLoginView
                onLoginSuccess={(token, loggedId) => {
                  setAdminToken(token);
                  setAdminId(loggedId);
                }}
              />
            )
          )}

          {activeModule === 'notes' && <NotesMaker settings={settings} />}

          {activeModule === 'image' && (
            <ImageAssistant settings={settings} currentModelInfo={currentModelInfo} />
          )}

          {activeModule === 'writing' && <WritingTools settings={settings} />}

          {activeModule === 'math' && (
            <MathScienceSolver
              settings={settings}
              currentModelInfo={currentModelInfo}
            />
          )}

          {activeModule === 'coding' && <CodingAssistant settings={settings} />}

          {activeModule === 'planner' && (
            <StudyPlanner
              settings={settings}
              tasks={studyTasks}
              goals={studyGoals}
              onUpdateTasks={setStudyTasks}
              onUpdateGoals={setStudyGoals}
            />
          )}

          {activeModule === 'history' && (
            <ChatHistoryView
              threads={threads}
              activeThreadId={activeThread?.id || ''}
              language={settings.language}
              onSelectThread={(id) => {
                setActiveThreadId(id);
                setActiveModule('chat');
              }}
              onNewChat={handleNewChat}
              onRenameThread={handleRenameThread}
              onDeleteThread={handleDeleteThread}
            />
          )}

          {activeModule === 'settings' && (
            <SettingsView
              settings={settings}
              providers={providers}
              aiPolicy={aiPolicy}
              loadingProviders={loadingProviders}
              onRefreshProviders={() => refreshProviders(true)}
              onUpdateSettings={(patch) =>
                setSettings((prev) => ({ ...prev, ...patch }))
              }
              onOpenAdminPanel={() => setActiveModule('admin')}
              onClearAllChats={() => {
                const fresh = createEmptyThread({
                  selectionMode: settings.selectionMode,
                  provider: settings.provider,
                  model: settings.model,
                });
                setThreads([fresh]);
                setActiveThreadId(fresh.id);
              }}
              onClearMockHistory={() => setMockAttempts([])}
            />
          )}
        </main>
      </div>
    </div>
  );
}
