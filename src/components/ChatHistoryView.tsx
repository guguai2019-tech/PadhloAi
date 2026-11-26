import React, { useState } from 'react';
import {
  Check,
  Edit3,
  MessageSquare,
  Plus,
  Trash2,
} from 'lucide-react';
import type { ChatThread, LanguageMode } from '../types';
import { matchesSearchQuery } from '../utils/studySearch';
import { SearchBarWithVoice } from './SearchBarWithVoice';

interface ChatHistoryViewProps {
  threads: ChatThread[];
  activeThreadId: string;
  language?: LanguageMode;
  onSelectThread: (id: string) => void;
  onNewChat: () => void;
  onRenameThread: (id: string, title: string) => void;
  onDeleteThread: (id: string) => void;
}

export const ChatHistoryView: React.FC<ChatHistoryViewProps> = ({
  threads,
  activeThreadId,
  language,
  onSelectThread,
  onNewChat,
  onRenameThread,
  onDeleteThread,
}) => {
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const filtered = threads.filter((t) => {
    if (!query.trim()) return true;
    const hay = `${t.title} ${t.messages.map((m) => m.content).join(' ')}`;
    return matchesSearchQuery(hay, query);
  });

  return (
    <div className="h-full overflow-y-auto px-4 md:px-8 py-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              Chat History
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Search across all saved conversations, rename threads, or resume where you left off.
            </p>
          </div>
          <button
            type="button"
            onClick={onNewChat}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold"
          >
            <Plus className="w-4 h-4" />
            <span>New Chat</span>
          </button>
        </div>

        <SearchBarWithVoice
          value={query}
          onChange={setQuery}
          defaultLanguage={language}
          placeholder="Search chat titles or message content..."
          ariaLabel="Search chat history"
        />

        {filtered.length === 0 ? (
          <div className="p-12 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center text-sm text-slate-500">
            No matching conversations found.
          </div>
        ) : (
          <div className="space-y-2.5">
            {filtered.map((thread) => {
              const isActive = thread.id === activeThreadId;
              const isEditing = editingId === thread.id;
              const lastMsg = thread.messages[thread.messages.length - 1];

              return (
                <div
                  key={thread.id}
                  className={`p-4 rounded-2xl border transition-colors flex items-center justify-between gap-4 ${
                    isActive
                      ? 'border-violet-500 bg-violet-50/40 dark:bg-violet-950/20'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && editTitle.trim()) {
                              onRenameThread(thread.id, editTitle.trim());
                              setEditingId(null);
                            }
                          }}
                          autoFocus
                          className="flex-1 px-3 py-1 rounded-lg border border-violet-400 bg-white dark:bg-slate-950 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (editTitle.trim()) {
                              onRenameThread(thread.id, editTitle.trim());
                            }
                            setEditingId(null);
                          }}
                          className="p-1.5 rounded-lg bg-violet-600 text-white"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSelectThread(thread.id)}
                        className="text-left w-full"
                      >
                        <div className="flex items-center gap-2">
                          <MessageSquare className="w-4 h-4 text-violet-600 dark:text-violet-400 shrink-0" />
                          <span className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">
                            {thread.title}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-2 tabular-nums">
                          <span>{thread.messages.length} messages</span>
                          <span aria-hidden="true">·</span>
                          <span>{new Date(thread.updatedAt).toLocaleString()}</span>
                          {lastMsg && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="truncate max-w-md">{lastMsg.content}</span>
                            </>
                          )}
                        </div>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(thread.id);
                        setEditTitle(thread.title);
                      }}
                      title="Rename chat"
                      className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteThread(thread.id)}
                      title="Delete chat"
                      className="p-2 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
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
    </div>
  );
};
