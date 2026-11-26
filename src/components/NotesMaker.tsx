import React, { useState } from 'react';
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Loader2,
  Paperclip,
  RotateCw,
} from 'lucide-react';
import type {
  AppSettings,
  FlashcardItem,
  MindMapNode,
  NotesFormat,
} from '../types';
import { generateAI, parseSafeJson } from '../utils/aiClient';
import { processUploadedFile } from '../utils/fileProcessor';
import { exportTextToPdf } from '../utils/pdfExport';
import { MarkdownRenderer } from './MarkdownRenderer';

interface NotesMakerProps {
  settings: AppSettings;
}

const NOTES_FORMATS: NotesFormat[] = [
  'Chapter-wise Notes',
  'Complete Study Notes',
  'Short Revision Notes',
  'Important Questions',
  'Exam Preparation Notes',
  'Chapter Summary',
  'Flashcards',
  'Mind Map',
  'Revision Sheet',
];

const FLASHCARD_SCHEMA = {
  type: 'OBJECT',
  properties: {
    cards: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          front: { type: 'STRING' },
          back: { type: 'STRING' },
          hint: { type: 'STRING' },
        },
        required: ['front', 'back'],
      },
    },
  },
  required: ['cards'],
};

const MINDMAP_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    summary: { type: 'STRING' },
    children: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          summary: { type: 'STRING' },
          children: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                title: { type: 'STRING' },
                summary: { type: 'STRING' },
              },
              required: ['title'],
            },
          },
        },
        required: ['title'],
      },
    },
  },
  required: ['title', 'children'],
};

function MindMapBranch({ node, depth = 0 }: { node: MindMapNode; depth?: number }) {
  const [open, setOpen] = useState(true);
  const hasChildren = Boolean(node.children && node.children.length > 0);
  const accents = [
    'border-violet-300 dark:border-violet-800 bg-violet-50/70 dark:bg-violet-950/30',
    'border-blue-300 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-950/30',
    'border-teal-300 dark:border-teal-800 bg-teal-50/60 dark:bg-teal-950/30',
  ];

  return (
    <div className={`${depth > 0 ? 'ml-5 pl-4 border-l border-slate-200 dark:border-slate-800' : ''} space-y-2`}>
      <div className={`p-3.5 rounded-xl border ${accents[depth % accents.length]}`}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-semibold text-sm text-slate-900 dark:text-white">
              {node.title}
            </div>
            {node.summary && (
              <div className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                {node.summary}
              </div>
            )}
          </div>
          {hasChildren && (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="p-1 rounded-lg hover:bg-white/70 dark:hover:bg-slate-800"
              aria-label="Toggle branch"
            >
              {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>
      {hasChildren && open && (
        <div className="space-y-2">
          {node.children!.map((child, i) => (
            <MindMapBranch key={`${child.title}-${i}`} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export const NotesMaker: React.FC<NotesMakerProps> = ({ settings }) => {
  const [format, setFormat] = useState<NotesFormat>('Chapter-wise Notes');
  const [subject, setSubject] = useState('Chemistry');
  const [classLevel, setClassLevel] = useState('Class 12');
  const [topic, setTopic] = useState('Electrochemistry & Nernst Equation');
  const [sourceText, setSourceText] = useState('');
  const [sourceFileName, setSourceFileName] = useState('');

  const [markdownNotes, setMarkdownNotes] = useState('');
  const [flashcards, setFlashcards] = useState<FlashcardItem[]>([]);
  const [flippedCard, setFlippedCard] = useState<Record<number, boolean>>({});
  const [mindMap, setMindMap] = useState<MindMapNode | null>(null);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleFileAttach = async (file: File) => {
    const att = await processUploadedFile(file);
    if (att.status === 'error') {
      setErrorMsg(att.errorMessage || 'Failed to read file.');
      return;
    }
    if (att.extractedText) {
      setSourceText(att.extractedText.slice(0, 45000));
      setSourceFileName(att.name);
      setErrorMsg(null);
    }
  };

  const handleGenerate = async () => {
    if (!topic.trim() && !sourceText.trim()) {
      setErrorMsg('Enter a chapter/topic or upload study material.');
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    setMarkdownNotes('');
    setFlashcards([]);
    setMindMap(null);
    setFlippedCard({});

    const contextBlock = sourceText
      ? `\n\nSource Material:\n${sourceText.slice(0, 40000)}`
      : '';

    try {
      if (format === 'Flashcards') {
        const res = await generateAI({
          provider: settings.provider,
          model: settings.model,
          language: settings.language,
          prompt: `Generate 14 high-yield active-recall study flashcards for ${subject} (${classLevel}) on "${topic}". Return JSON matching schema.${contextBlock}`,
          responseMimeType: 'application/json',
          responseSchema: FLASHCARD_SCHEMA,
        });
        const parsed = parseSafeJson<{ cards: FlashcardItem[] }>(res.text);
        setFlashcards(parsed.cards || []);
      } else if (format === 'Mind Map') {
        const res = await generateAI({
          provider: settings.provider,
          model: settings.model,
          language: settings.language,
          prompt: `Create a hierarchical conceptual mind map (root topic -> 4-6 main branches -> 3-4 sub-concepts each with crisp summaries) for ${subject} (${classLevel}) on "${topic}". Return JSON matching schema.${contextBlock}`,
          responseMimeType: 'application/json',
          responseSchema: MINDMAP_SCHEMA,
        });
        const parsed = parseSafeJson<MindMapNode>(res.text);
        setMindMap(parsed);
      } else {
        const res = await generateAI({
          provider: settings.provider,
          model: settings.model,
          language: settings.language,
          prompt: `Create comprehensive, well-structured "${format}" for:
- Subject: ${subject}
- Class/Level: ${classLevel}
- Chapter/Topic: ${topic}

Formatting rules:
- Use clear Markdown headings, bullet lists, comparison tables, and LaTeX ($...$ / $$...$$) for formulas and reactions.
- Highlight key definitions, common exam mistakes, and quick memory tips.${contextBlock}`,
        });
        setMarkdownNotes(res.text);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to generate study material.');
    } finally {
      setLoading(false);
    }
  };

  const getExportableText = (): string => {
    if (markdownNotes) return markdownNotes;
    if (flashcards.length > 0) {
      return flashcards
        .map((c, i) => `Card ${i + 1}\nQ: ${c.front}\nA: ${c.back}${c.hint ? `\nHint: ${c.hint}` : ''}`)
        .join('\n\n');
    }
    if (mindMap) {
      const walk = (n: MindMapNode, indent = 0): string => {
        const pad = '  '.repeat(indent);
        const self = `${pad}- ${n.title}${n.summary ? `: ${n.summary}` : ''}`;
        const kids = (n.children || []).map((c) => walk(c, indent + 1)).join('\n');
        return kids ? `${self}\n${kids}` : self;
      };
      return walk(mindMap);
    }
    return '';
  };

  const hasOutput = Boolean(markdownNotes || flashcards.length > 0 || mindMap);

  return (
    <div className="h-full overflow-y-auto px-4 md:px-8 py-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            AI Notes & Study Material Studio
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Generate chapter notes, quick revision sheets, flashcards, interactive mind maps, and downloadable study PDFs.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {NOTES_FORMATS.map((fmt) => (
            <button
              key={fmt}
              type="button"
              onClick={() => setFormat(fmt)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors ${
                format === fmt
                  ? 'bg-teal-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              {fmt}
            </button>
          ))}
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Subject
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Class / Exam
              </label>
              <input
                type="text"
                value={classLevel}
                onChange={(e) => setClassLevel(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Chapter / Topic
              </label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
                <Paperclip className="w-3.5 h-3.5 text-teal-600" />
                <span>{sourceFileName || 'Upload PDF / DOCX / TXT Source'}</span>
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
                    setSourceText('');
                    setSourceFileName('');
                  }}
                  className="text-xs text-red-500 hover:underline"
                >
                  Clear
                </button>
              )}
            </div>

            <button
              type="button"
              disabled={loading}
              onClick={() => void handleGenerate()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-semibold"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Creating {format}...</span>
                </>
              ) : (
                <>
                  <BookOpen className="w-4 h-4" />
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

        {hasOutput && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-base">
                {topic} · {format}
              </h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(getExportableText());
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1800);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    exportTextToPdf(
                      `${subject} — ${topic} (${format})`,
                      getExportableText(),
                      `${topic.replace(/[^a-z0-9_-]+/gi, '_')}_Notes.pdf`,
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-teal-600 text-white text-xs font-semibold"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download PDF</span>
                </button>
              </div>
            </div>

            {markdownNotes && (
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
                <MarkdownRenderer content={markdownNotes} />
              </div>
            )}

            {flashcards.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {flashcards.map((card, idx) => {
                  const isFlipped = Boolean(flippedCard[idx]);
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() =>
                        setFlippedCard((prev) => ({ ...prev, [idx]: !prev[idx] }))
                      }
                      className={`text-left p-5 rounded-2xl border min-h-[180px] flex flex-col justify-between transition-colors ${
                        isFlipped
                          ? 'border-teal-500 bg-teal-50/70 dark:bg-teal-950/30'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-teal-400'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
                        <span className="tabular-nums">
                          Card {idx + 1} · {isFlipped ? 'Answer' : 'Question'}
                        </span>
                        <RotateCw className="w-3.5 h-3.5" />
                      </div>
                      <div className="text-sm font-medium my-3">
                        <MarkdownRenderer content={isFlipped ? card.back : card.front} />
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {isFlipped ? 'Click to see prompt' : card.hint ? `Hint: ${card.hint}` : 'Click to flip'}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {mindMap && (
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                <MindMapBranch node={mindMap} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
