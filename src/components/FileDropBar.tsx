import React from 'react';
import {
  FileText,
  Image as ImageIcon,
  FileSpreadsheet,
  AlertCircle,
  Loader2,
  X,
} from 'lucide-react';
import type { ChatAttachment } from '../types';
import { formatFileSize } from '../utils/fileProcessor';

interface FileDropBarProps {
  attachments: ChatAttachment[];
  onRemove: (id: string) => void;
  onQuickAction?: (attachment: ChatAttachment, actionPrompt: string) => void;
}

export const FileDropBar: React.FC<FileDropBarProps> = ({
  attachments,
  onRemove,
  onQuickAction,
}) => {
  if (attachments.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mb-2.5">
      {attachments.map((att) => {
        const Icon =
          att.kind === 'image'
            ? ImageIcon
            : att.kind === 'csv'
              ? FileSpreadsheet
              : FileText;

        return (
          <div
            key={att.id}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border text-xs max-w-full ${
              att.status === 'error'
                ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900 text-red-700 dark:text-red-300'
                : 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
            }`}
          >
            {att.kind === 'image' && att.imageDataUrl ? (
              <img
                src={att.imageDataUrl}
                alt={att.name}
                referrerPolicy="no-referrer"
                className="w-8 h-8 rounded-lg object-cover shrink-0 border border-slate-200 dark:border-slate-700"
              />
            ) : (
              <Icon className="w-4 h-4 shrink-0 text-violet-600 dark:text-violet-400" />
            )}

            <div className="min-w-0 flex-1">
              <div className="font-medium truncate max-w-[200px]">{att.name}</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 tabular-nums">
                {att.status === 'processing' && (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Processing...</span>
                  </>
                )}
                {att.status === 'ready' && (
                  <span>
                    {formatFileSize(att.size)}
                    {att.pageCount ? ` · ${att.pageCount} pages` : ''}
                  </span>
                )}
                {att.status === 'error' && (
                  <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    <span className="truncate max-w-[220px]">{att.errorMessage}</span>
                  </span>
                )}
              </div>

              {onQuickAction && att.status === 'ready' && att.kind !== 'image' && (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {[
                    { label: 'Summarize', prompt: `Summarize "${att.name}" clearly with key takeaways.` },
                    { label: 'Key Points', prompt: `Extract all important bullet points from "${att.name}".` },
                    { label: 'Make Notes', prompt: `Generate structured revision notes from "${att.name}".` },
                    { label: 'Create Quiz', prompt: `Generate 10 practice questions with answers from "${att.name}".` },
                  ].map((act) => (
                    <button
                      key={act.label}
                      type="button"
                      onClick={() => onQuickAction(att, act.prompt)}
                      className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-violet-400 text-[11px] font-medium transition-colors whitespace-nowrap shrink-0"
                    >
                      {act.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => onRemove(att.id)}
              aria-label={`Remove ${att.name}`}
              className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 transition-colors shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
