import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  Check,
  Copy,
  Edit3,
  FileText,
  Languages,
  Paperclip,
  RefreshCw,
  Share2,
  Square,
  ThumbsDown,
  ThumbsUp,
  Volume2,
  VolumeX,
  AlertTriangle,
  BookOpen,
  Calculator,
  ClipboardCheck,
  Code2,
  Cpu,
  FileUp,
  GraduationCap,
  Info,
} from 'lucide-react';
import type {
  AppSettings,
  ChatAttachment,
  ChatMessage,
  ChatThread,
  LanguageMode,
  ModelInfo,
  ModuleId,
  ProviderStatus,
  PublicAiPolicy,
} from '../types';
import { processUploadedFile } from '../utils/fileProcessor';
import { streamChat } from '../utils/aiClient';
import { MarkdownRenderer } from './MarkdownRenderer';
import { FileDropBar } from './FileDropBar';
import { ModelSelectorDropdown } from './ModelSelectorDropdown';

interface ChatWorkspaceProps {
  thread: ChatThread;
  settings: AppSettings;
  providers: ProviderStatus[];
  aiPolicy: PublicAiPolicy | null;
  currentModelInfo: ModelInfo | null;
  onUpdateThread: (threadId: string, updater: (t: ChatThread) => ChatThread) => void;
  onChangeLanguage: (lang: LanguageMode) => void;
  onNavigateModule: (module: ModuleId) => void;
}

const STARTER_PROMPTS = [
  {
    title: 'Explain Quantum Mechanics simply',
    subtitle: 'With wave-particle duality & equations',
    prompt: 'Explain Quantum Mechanics and wave-particle duality simply with key formulas in LaTeX and real-world examples.',
  },
  {
    title: 'Solve Quadratic Equations step-by-step',
    subtitle: 'Hindi & English bilingual explanation',
    prompt: 'Solve $3x^2 - 11x + 6 = 0$ step-by-step and explain the discriminant method in both English and simple Hindi.',
  },
  {
    title: 'Compare Data Structures in a table',
    subtitle: 'Arrays, Linked Lists, Trees, Hash Maps',
    prompt: 'Create a detailed comparison table of Array, Linked List, Binary Search Tree, and Hash Map covering time complexities and best use cases.',
  },
  {
    title: 'Write clean Python recursion examples',
    subtitle: 'With time complexity analysis',
    prompt: 'Write Python implementations of Merge Sort and Binary Search with line-by-line explanations and Big-O complexity.',
  },
];

export const ChatWorkspace: React.FC<ChatWorkspaceProps> = ({
  thread,
  settings,
  providers,
  aiPolicy,
  currentModelInfo,
  onUpdateThread,
  onChangeLanguage,
  onNavigateModule,
}) => {
  const threadSelection = {
    selectionMode: thread.selectionMode ?? settings.selectionMode ?? 'auto',
    provider: thread.provider ?? settings.provider,
    model: thread.model ?? settings.model,
  };
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sharedId, setSharedId] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread.messages.length, isStreaming]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [thread.id]);

  const handleFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const incoming = Array.from(files).slice(0, 5);
    const placeholders: ChatAttachment[] = incoming.map((f, idx) => ({
      id: `pending-${Date.now()}-${idx}`,
      name: f.name,
      mimeType: f.type,
      size: f.size,
      kind: f.type.startsWith('image/') ? 'image' : 'text',
      status: 'processing',
    }));
    setAttachments((prev) => [...prev, ...placeholders]);

    const processed = await Promise.all(incoming.map((f) => processUploadedFile(f)));
    setAttachments((prev) => {
      const withoutPending = prev.filter(
        (p) => !placeholders.some((ph) => ph.id === p.id),
      );
      return [...withoutPending, ...processed];
    });
  };

  const runAssistantTurn = async (
    historyMessages: ChatMessage[],
    assistantMessageId: string,
  ) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setIsStreaming(true);

    try {
      const payloadMessages = historyMessages.map((m) => ({
        role: m.role,
        content: m.content,
        attachments: m.attachments
          ?.filter((a) => a.status === 'ready')
          .map((a) => ({
            name: a.name,
            mimeType: a.mimeType,
            kind: a.kind,
            extractedText: a.extractedText,
            imageDataUrl: a.imageDataUrl,
          })),
      }));

      const meta = await streamChat({
        selectionMode: threadSelection.selectionMode,
        provider: threadSelection.provider,
        model: threadSelection.model,
        messages: payloadMessages,
        language: settings.language,
        signal: controller.signal,
        onChunk: (delta) => {
          onUpdateThread(thread.id, (t) => ({
            ...t,
            updatedAt: Date.now(),
            messages: t.messages.map((msg) =>
              msg.id === assistantMessageId
                ? { ...msg, content: msg.content + delta }
                : msg,
            ),
          }));
        },
      });

      onUpdateThread(thread.id, (t) => ({
        ...t,
        updatedAt: Date.now(),
        messages: t.messages.map((msg) =>
          msg.id === assistantMessageId
            ? {
                ...msg,
                modelUsed: meta.modelUsed,
                providerUsed: meta.providerUsed,
                fallbackUsed: meta.fallbackUsed,
                fallbackFrom: meta.fallbackFrom,
                fallbackReason: meta.fallbackReason,
              }
            : msg,
        ),
      }));
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        onUpdateThread(thread.id, (t) => ({
          ...t,
          messages: t.messages.map((msg) =>
            msg.id === assistantMessageId && !msg.content.trim()
              ? { ...msg, content: '_Generation stopped._' }
              : msg,
          ),
        }));
      } else {
        const message =
          err instanceof Error ? err.message : 'Failed to generate response.';
        onUpdateThread(thread.id, (t) => ({
          ...t,
          messages: t.messages.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, content: message, isError: true }
              : msg,
          ),
        }));
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  };

  const handleSend = async (overridePrompt?: string) => {
    if (isStreaming) return;
    const text = (overridePrompt ?? input).trim();
    const readyAttachments = attachments.filter((a) => a.status === 'ready');
    if (!text && readyAttachments.length === 0) return;

    const hasImage = readyAttachments.some((a) => a.kind === 'image');
    if (hasImage && currentModelInfo && !currentModelInfo.supportsVision) {
      return;
    }

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text || 'Please analyze the attached file(s).',
      createdAt: Date.now(),
      attachments: readyAttachments.length > 0 ? readyAttachments : undefined,
    };

    const assistantMsg: ChatMessage = {
      id: `a-${Date.now() + 1}`,
      role: 'assistant',
      content: '',
      createdAt: Date.now() + 1,
      feedback: null,
    };

    const nextMessages = [...thread.messages, userMsg];
    const autoTitle =
      thread.messages.length === 0
        ? (text || readyAttachments[0]?.name || 'New Chat').slice(0, 48)
        : thread.title;

    onUpdateThread(thread.id, (t) => ({
      ...t,
      title: autoTitle,
      updatedAt: Date.now(),
      messages: [...nextMessages, assistantMsg],
    }));

    if (!overridePrompt) setInput('');
    setAttachments([]);

    await runAssistantTurn(nextMessages, assistantMsg.id);
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const handleRegenerate = async (assistantIndex: number) => {
    if (isStreaming) return;
    const historyUpToUser = thread.messages.slice(0, assistantIndex);
    if (historyUpToUser.length === 0) return;
    const targetMsg = thread.messages[assistantIndex];
    if (!targetMsg) return;

    onUpdateThread(thread.id, (t) => ({
      ...t,
      messages: [
        ...historyUpToUser,
        { ...targetMsg, content: '', isError: false, createdAt: Date.now() },
      ],
    }));

    await runAssistantTurn(historyUpToUser, targetMsg.id);
  };

  const handleSaveEdit = async (userIndex: number) => {
    if (isStreaming) return;
    const trimmed = editingText.trim();
    if (!trimmed) return;
    const original = thread.messages[userIndex];
    if (!original) return;

    const updatedUser: ChatMessage = { ...original, content: trimmed };
    const assistantMsg: ChatMessage = {
      id: `a-${Date.now()}`,
      role: 'assistant',
      content: '',
      createdAt: Date.now() + 1,
      feedback: null,
    };
    const prefix = [...thread.messages.slice(0, userIndex), updatedUser];

    onUpdateThread(thread.id, (t) => ({
      ...t,
      updatedAt: Date.now(),
      messages: [...prefix, assistantMsg],
    }));
    setEditingMsgId(null);
    setEditingText('');

    await runAssistantTurn(prefix, assistantMsg.id);
  };

  const handleCopy = async (id: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      // ignore
    }
  };

  const handleShare = async (id: string, content: string) => {
    const shareText = `PadhloAI Response:\n\n${content}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: thread.title, text: shareText });
      } else {
        await navigator.clipboard.writeText(shareText);
      }
      setSharedId(id);
      setTimeout(() => setSharedId(null), 1800);
    } catch {
      // User cancelled share
    }
  };

  const handleReadAloud = (id: string, content: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (speakingId === id) {
      window.speechSynthesis.cancel();
      setSpeakingId(null);
      return;
    }
    window.speechSynthesis.cancel();
    const cleanText = content
      .replace(/```[\s\S]*?```/g, 'Code block omitted.')
      .replace(/[$#*`_]/g, '');
    const utterance = new SpeechSynthesisUtterance(cleanText);
    const hasDevanagari = /[\u0900-\u097F]/.test(cleanText);
    utterance.lang = hasDevanagari || settings.language === 'hindi' ? 'hi-IN' : 'en-US';
    utterance.rate = settings.speechRate || 1;
    utterance.onend = () => setSpeakingId(null);
    utterance.onerror = () => setSpeakingId(null);
    setSpeakingId(id);
    window.speechSynthesis.speak(utterance);
  };

  const handleFeedback = (id: string, type: 'like' | 'dislike') => {
    onUpdateThread(thread.id, (t) => ({
      ...t,
      messages: t.messages.map((m) =>
        m.id === id ? { ...m, feedback: m.feedback === type ? null : type } : m,
      ),
    }));
  };

  const hasUnsupportedImage =
    attachments.some((a) => a.kind === 'image' && a.status === 'ready') &&
    currentModelInfo !== null &&
    !currentModelInfo.supportsVision;

  return (
    <div
      className="flex flex-col h-full min-h-0"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        void handleFilesSelected(e.dataTransfer.files);
      }}
    >
      {/* Chat Model Bar (Remembered per conversation) */}
      <div className="shrink-0 px-4 md:px-8 py-2.5 border-b border-slate-200/80 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-900/50 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 min-w-0">
          <Cpu className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400 shrink-0" />
          <span className="font-semibold truncate max-w-[200px] sm:max-w-[300px]">
            {thread.title}
          </span>
          <span className="hidden sm:inline text-slate-400">·</span>
          <span className="hidden sm:inline text-[11px] text-slate-500 dark:text-slate-400">
            Conversation AI Model
          </span>
        </div>

        <div className="flex items-center gap-2">
          <ModelSelectorDropdown
            providers={providers}
            policy={aiPolicy}
            value={threadSelection}
            disabled={isStreaming}
            ariaLabel="Conversation AI Model"
            onChange={(next) =>
              onUpdateThread(thread.id, (t) => ({
                ...t,
                selectionMode: next.selectionMode,
                provider: next.provider,
                model: next.model,
              }))
            }
            className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-violet-500 max-w-[250px] truncate"
          />
        </div>
      </div>

      {/* Messages / Empty Launchpad */}
      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6">
        <div className="max-w-4xl mx-auto">
          {thread.messages.length === 0 ? (
            <div className="py-4 space-y-8">
              <div className="space-y-3">
                <h1 className="text-2xl md:text-4xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
                  PadhloAI Workspace
                </h1>
                <p className="text-slate-600 dark:text-slate-300 text-base max-w-2xl leading-relaxed">
                  Your AI-Powered Learning Companion. Ask anything in English, Hindi, or Odia, upload PDFs, DOCX, CSV, or diagrams, solve step-by-step math &amp; science, write code, or launch specialized study tools below.
                </p>

                {/* New Conversation Model Selector Card */}
                <div className="pt-1 flex flex-wrap items-center gap-2.5">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                    New Conversation AI Model:
                  </span>
                  <ModelSelectorDropdown
                    providers={providers}
                    policy={aiPolicy}
                    value={threadSelection}
                    disabled={isStreaming}
                    ariaLabel="New Conversation AI Model"
                    onChange={(next) =>
                      onUpdateThread(thread.id, (t) => ({
                        ...t,
                        selectionMode: next.selectionMode,
                        provider: next.provider,
                        model: next.model,
                      }))
                    }
                    className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-violet-500"
                  />
                </div>
              </div>

              {/* Quick Tool Launchers */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3.5">
                {[
                  {
                    id: 'pdf' as ModuleId,
                    title: 'PDF Toolkit',
                    desc: 'Merge, split, compress, read & AI quiz',
                    icon: FileUp,
                    accent: 'text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/50',
                  },
                  {
                    id: 'mock-test' as ModuleId,
                    title: 'Mock Tests',
                    desc: '25–100 Q timed exams & PDF scorecards',
                    icon: ClipboardCheck,
                    accent: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50',
                  },
                  {
                    id: 'lesson-plan' as ModuleId,
                    title: 'AI Lesson Plan Generator',
                    desc: 'Generate syllabus-based lesson plans in English, Hindi and Odia.',
                    icon: GraduationCap,
                    accent: 'text-[#4338CA] dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/50',
                  },
                  {
                    id: 'notes' as ModuleId,
                    title: 'Notes & Mind Maps',
                    desc: 'Revision sheets, flashcards & summaries',
                    icon: BookOpen,
                    accent: 'text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/50',
                  },
                  {
                    id: 'math' as ModuleId,
                    title: 'Math & Science',
                    desc: 'Step-by-step STEM & LaTeX solver',
                    icon: Calculator,
                    accent: 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/50',
                  },
                ].map((tool) => (
                  <button
                    key={tool.id}
                    type="button"
                    onClick={() => onNavigateModule(tool.id)}
                    className="group text-left p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-violet-400 dark:hover:border-violet-600 transition-colors"
                  >
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${tool.accent}`}>
                      <tool.icon className="w-4.5 h-4.5" />
                    </div>
                    <div className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                      {tool.title}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-snug">
                      {tool.desc}
                    </div>
                  </button>
                ))}
              </div>

              {/* Starter Prompts */}
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Suggested Conversations
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {STARTER_PROMPTS.map((item) => (
                    <button
                      key={item.title}
                      type="button"
                      onClick={() => void handleSend(item.prompt)}
                      className="text-left p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 hover:bg-white dark:hover:bg-slate-900 hover:border-blue-400 dark:hover:border-blue-600 transition-colors"
                    >
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {item.title}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {item.subtitle}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {thread.messages.map((msg, idx) => {
                const isUser = msg.role === 'user';
                const isEditing = editingMsgId === msg.id;

                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                  >
                    {isUser ? (
                      <div className="max-w-[85%] md:max-w-[75%] space-y-2">
                        {msg.attachments && msg.attachments.length > 0 && (
                          <div className="flex flex-wrap justify-end gap-2">
                            {msg.attachments.map((att) => (
                              <div
                                key={att.id}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                              >
                                {att.kind === 'image' && att.imageDataUrl ? (
                                  <img
                                    src={att.imageDataUrl}
                                    alt={att.name}
                                    referrerPolicy="no-referrer"
                                    className="w-10 h-10 rounded-lg object-cover"
                                  />
                                ) : (
                                  <FileText className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                                )}
                                <span className="truncate max-w-[180px] font-medium">
                                  {att.name}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        {isEditing ? (
                          <div className="p-3 rounded-2xl border border-violet-400 bg-white dark:bg-slate-900 space-y-2 min-w-[280px] sm:min-w-[420px]">
                            <textarea
                              value={editingText}
                              onChange={(e) => setEditingText(e.target.value)}
                              rows={3}
                              className="w-full bg-transparent text-sm text-slate-900 dark:text-slate-100 focus:outline-none resize-y"
                            />
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setEditingMsgId(null)}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleSaveEdit(idx)}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-600 text-white hover:bg-violet-700"
                              >
                                Save & Regenerate
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="group relative flex items-start gap-2">
                            {!isStreaming && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingMsgId(msg.id);
                                  setEditingText(msg.content);
                                }}
                                title="Edit question"
                                className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-opacity mt-1"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <div className="px-4 py-3 rounded-2xl bg-violet-600 text-white text-[15px] leading-relaxed whitespace-pre-wrap">
                              {msg.content}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="w-full max-w-full space-y-2.5">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            PadhloAI
                          </span>
                          {msg.providerUsed && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-medium">
                                {msg.providerUsed === 'ollama' ? 'Ollama Local' : 'Google Gemini'}
                              </span>
                            </>
                          )}
                          {msg.modelUsed && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>{msg.modelUsed}</span>
                            </>
                          )}
                        </div>

                        {msg.fallbackUsed && (
                          <div className="flex items-start gap-2 px-3.5 py-2 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-xs text-amber-800 dark:text-amber-200">
                            <Info className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>
                              Primary provider (
                              {msg.fallbackFrom === 'ollama' ? 'Ollama Local' : 'Google Gemini'}) was
                              unavailable; responded using backup provider (
                              {msg.providerUsed === 'ollama' ? 'Ollama Local' : 'Google Gemini'} ·{' '}
                              {msg.modelUsed})
                              {msg.fallbackReason ? ` — ${msg.fallbackReason}` : '.'}
                            </span>
                          </div>
                        )}

                        <div
                          className={`rounded-2xl border px-5 py-4 ${
                            msg.isError
                              ? 'border-red-300 dark:border-red-900 bg-red-50/70 dark:bg-red-950/30 text-red-800 dark:text-red-200'
                              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 text-slate-900 dark:text-slate-100'
                          }`}
                        >
                          {msg.content ? (
                            <div className="space-y-3">
                              <MarkdownRenderer content={msg.content} />
                              {msg.isError && !isStreaming && (
                                <button
                                  type="button"
                                  onClick={() => void handleRegenerate(idx)}
                                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition-colors"
                                >
                                  <RefreshCw className="w-3.5 h-3.5" />
                                  <span>Retry</span>
                                </button>
                              )}
                            </div>
                          ) : isStreaming ? (
                            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                              <Code2 className="w-4 h-4 animate-spin text-violet-600" />
                              <span>Thinking and formatting response...</span>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between gap-3 text-sm text-red-700 dark:text-red-300">
                              <span>No response received. Please retry.</span>
                              <button
                                type="button"
                                onClick={() => void handleRegenerate(idx)}
                                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition-colors"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                                <span>Retry</span>
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Response Controls */}
                        {msg.content && (
                          <div className="flex flex-wrap items-center gap-1 pt-0.5">
                            <button
                              type="button"
                              onClick={() => void handleCopy(msg.id, msg.content)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                            >
                              {copiedId === msg.id ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>

                            <button
                              type="button"
                              disabled={isStreaming}
                              onClick={() => void handleRegenerate(idx)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              <span>Regenerate</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleReadAloud(msg.id, msg.content)}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-colors whitespace-nowrap shrink-0 ${
                                speakingId === msg.id
                                  ? 'text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/50'
                                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800'
                              }`}
                            >
                              {speakingId === msg.id ? (
                                <>
                                  <VolumeX className="w-3.5 h-3.5" />
                                  <span>Stop Audio</span>
                                </>
                              ) : (
                                <>
                                  <Volume2 className="w-3.5 h-3.5" />
                                  <span>Read Aloud</span>
                                </>
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() => void handleShare(msg.id, msg.content)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                            >
                              {sharedId === msg.id ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>Shared</span>
                                </>
                              ) : (
                                <>
                                  <Share2 className="w-3.5 h-3.5" />
                                  <span>Share</span>
                                </>
                              )}
                            </button>

                            <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-1" />

                            <button
                              type="button"
                              onClick={() => handleFeedback(msg.id, 'like')}
                              aria-label="Like response"
                              className={`p-1.5 rounded-lg transition-colors ${
                                msg.feedback === 'like'
                                  ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40'
                                  : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                              }`}
                            >
                              <ThumbsUp className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleFeedback(msg.id, 'dislike')}
                              aria-label="Dislike response"
                              className={`p-1.5 rounded-lg transition-colors ${
                                msg.feedback === 'dislike'
                                  ? 'text-red-600 bg-red-50 dark:bg-red-950/40'
                                  : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                              }`}
                            >
                              <ThumbsDown className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 px-4 md:px-8 py-3.5">
        <div className="max-w-4xl mx-auto">
          {hasUnsupportedImage && (
            <div className="mb-2.5 flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-200">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                The currently selected model ({currentModelInfo?.name}) does not support image inputs. Switch to a vision model in Settings or remove the image.
              </span>
            </div>
          )}

          <FileDropBar
            attachments={attachments}
            onRemove={(id) =>
              setAttachments((prev) => prev.filter((a) => a.id !== id))
            }
            onQuickAction={(att, actionPrompt) =>
              void handleSend(`${actionPrompt} (File: ${att.name})`)
            }
          />

          <div
            className={`rounded-2xl border transition-colors bg-slate-50/70 dark:bg-slate-900 p-3 ${
              dragOver
                ? 'border-violet-500 bg-violet-50/40 dark:bg-violet-950/20'
                : 'border-slate-200 dark:border-slate-800 focus-within:border-violet-500'
            }`}
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              placeholder="Ask anything in English or Hindi, paste code, or drop PDFs, DOCX, CSV & images..."
              rows={2}
              className="w-full bg-transparent text-sm md:text-[15px] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none resize-none max-h-40"
            />

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/70 dark:border-slate-800 mt-1">
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.docx,.txt,.md,.csv,.json,.js,.ts,.py,.html,.css,.png,.jpg,.jpeg,.webp"
                  onChange={(e) => {
                    void handleFilesSelected(e.target.files);
                    e.target.value = '';
                  }}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-violet-400 transition-colors whitespace-nowrap shrink-0"
                >
                  <Paperclip className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                  <span>Attach Files</span>
                </button>

                <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
                  <Languages className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <select
                    aria-label="Response Language"
                    value={settings.language}
                    onChange={(e) => onChangeLanguage(e.target.value as LanguageMode)}
                    className="bg-transparent text-slate-700 dark:text-slate-200 focus:outline-none font-medium"
                  >
                    <option value="auto">Auto (EN / HI)</option>
                    <option value="english">English</option>
                    <option value="hindi">Hindi (हिन्दी)</option>
                    <option value="odia">Odia (ଓଡ଼ିଆ)</option>
                    <option value="bilingual">Bilingual (EN + HI)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {isStreaming ? (
                  <button
                    type="button"
                    onClick={handleStop}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors whitespace-nowrap shrink-0"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                    <span>Stop</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={
                      hasUnsupportedImage ||
                      (!input.trim() &&
                        attachments.filter((a) => a.status === 'ready').length === 0)
                    }
                    onClick={() => void handleSend()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:pointer-events-none text-white transition-colors whitespace-nowrap shrink-0"
                  >
                    <span>Send</span>
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
