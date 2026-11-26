import React, { useState } from 'react';
import { Code2, Eye, Loader2, Play } from 'lucide-react';
import type { AppSettings } from '../types';
import { generateAI } from '../utils/aiClient';
import { MarkdownRenderer } from './MarkdownRenderer';

interface CodingAssistantProps {
  settings: AppSettings;
}

type CodingMode =
  | 'generate'
  | 'explain'
  | 'debug'
  | 'convert'
  | 'web'
  | 'learn';

const CODING_MODES: Array<{ id: CodingMode; label: string }> = [
  { id: 'generate', label: 'Generate Code' },
  { id: 'explain', label: 'Explain Code' },
  { id: 'debug', label: 'Debug & Fix' },
  { id: 'convert', label: 'Convert Language' },
  { id: 'web', label: 'HTML / CSS / JS Studio' },
  { id: 'learn', label: 'Learn Programming' },
];

const LANGUAGES = [
  'Python',
  'JavaScript',
  'TypeScript',
  'C++',
  'Java',
  'C',
  'SQL',
  'HTML/CSS/JS',
  'Rust',
  'Go',
];

function extractHtmlBlock(markdown: string): string | null {
  const htmlMatch = /```html\s*([\s\S]*?)```/i.exec(markdown);
  if (htmlMatch) return htmlMatch[1].trim();
  const genericMatch = /```[\s\S]*?(<!doctype html[\s\S]*?<\/html>)[\s\S]*?```/i.exec(markdown);
  if (genericMatch) return genericMatch[1].trim();
  return null;
}

export const CodingAssistant: React.FC<CodingAssistantProps> = ({ settings }) => {
  const [mode, setMode] = useState<CodingMode>('generate');
  const [language, setLanguage] = useState('Python');
  const [targetLanguage, setTargetLanguage] = useState('TypeScript');
  const [promptInput, setPromptInput] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [output, setOutput] = useState('');
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleRun = async () => {
    if (!promptInput.trim() && !codeInput.trim()) {
      setErrorMsg('Enter a coding prompt or paste your code.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setPreviewHtml(null);

    const promptMap: Record<CodingMode, string> = {
      generate: `Write clean, well-commented, production-quality ${language} code for:\n${promptInput}\nInclude time/space complexity and an example usage.`,
      explain: `Explain the following ${language} code clearly, covering purpose, line-by-line walkthrough, and complexity:\n\n\`\`\`${language.toLowerCase()}\n${codeInput}\n\`\`\`\n${promptInput ? `Specific question: ${promptInput}` : ''}`,
      debug: `Debug and fix the following ${language} code. Explain the root cause of every bug and provide the corrected code:\n\nIssue description: ${promptInput || 'Find and fix errors'}\n\n\`\`\`${language.toLowerCase()}\n${codeInput}\n\`\`\``,
      convert: `Convert the following ${language} code into idiomatic ${targetLanguage}. Preserve behavior and explain key language differences:\n\n\`\`\`${language.toLowerCase()}\n${codeInput}\n\`\`\``,
      web: `Build a complete, self-contained single-file HTML/CSS/JS implementation (inside a single \`\`\`html code block with embedded <style> and <script>) for:\n${promptInput}\n${codeInput ? `Existing code to enhance:\n\`\`\`html\n${codeInput}\n\`\`\`` : ''}`,
      learn: `Teach the programming topic "${promptInput}" using ${language} with beginner-friendly explanations, interactive mental models, clean code examples, and 2 practice exercises.`,
    };

    try {
      const res = await generateAI({
        provider: settings.provider,
        model: settings.model,
        language: settings.language,
        prompt: promptMap[mode],
      });
      setOutput(res.text);
      if (mode === 'web') {
        const html = extractHtmlBlock(res.text);
        if (html) {
          setPreviewHtml(html);
          setShowPreview(true);
        }
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Coding request failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto px-4 md:px-8 py-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            AI Coding Assistant & Web Sandbox
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Generate, explain, debug, convert across languages, learn algorithms, or build & preview live HTML/CSS/JS pages.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {CODING_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                setMode(m.id);
                setErrorMsg(null);
              }}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors ${
                mode === m.id
                  ? 'bg-slate-900 dark:bg-violet-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Input */}
          <div className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4 h-fit">
            <div className="grid grid-cols-2 gap-3">
              {mode !== 'web' && (
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    {mode === 'convert' ? 'Source Language' : 'Language'}
                  </label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                  >
                    {LANGUAGES.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {mode === 'convert' && (
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Target Language
                  </label>
                  <select
                    value={targetLanguage}
                    onChange={(e) => setTargetLanguage(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                  >
                    {LANGUAGES.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                {mode === 'explain' || mode === 'debug'
                  ? 'Question or Error Message (optional)'
                  : mode === 'learn'
                    ? 'Topic to Learn'
                    : 'Task Description'}
              </label>
              <textarea
                value={promptInput}
                onChange={(e) => setPromptInput(e.target.value)}
                placeholder={
                  mode === 'web'
                    ? 'e.g. Create a responsive scientific Pomodoro timer with clean cards...'
                    : mode === 'learn'
                      ? 'e.g. Recursion & Dynamic Programming with Memoization'
                      : 'Describe what you want to build or fix...'
                }
                rows={4}
                className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:border-violet-500"
              />
            </div>

            {(mode === 'explain' || mode === 'debug' || mode === 'convert' || mode === 'web') && (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {mode === 'web' ? 'Existing HTML/CSS/JS (optional)' : 'Paste Code'}
                </label>
                <textarea
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value)}
                  placeholder="Paste source code here..."
                  rows={7}
                  className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-950 text-slate-100 text-xs font-mono focus:outline-none focus:border-violet-500"
                />
              </div>
            )}

            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
                {errorMsg}
              </div>
            )}

            <button
              type="button"
              disabled={loading}
              onClick={() => void handleRun()}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-semibold"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Processing Code...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  <span>Run {CODING_MODES.find((m) => m.id === mode)?.label}</span>
                </>
              )}
            </button>
          </div>

          {/* Output & Optional Live HTML Preview */}
          <div className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-semibold text-base">
                <Code2 className="w-4 h-4 text-violet-600" />
                <span>AI Code Output</span>
              </div>
              {previewHtml && (
                <button
                  type="button"
                  onClick={() => setShowPreview((s) => !s)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>{showPreview ? 'View Code & Notes' : 'Live HTML Preview'}</span>
                </button>
              )}
            </div>

            {showPreview && previewHtml ? (
              <iframe
                title="HTML/CSS/JS Live Preview"
                sandbox="allow-scripts"
                srcDoc={previewHtml}
                className="w-full min-h-[460px] rounded-xl border border-slate-200 dark:border-slate-800 bg-white"
              />
            ) : (
              <div className="flex-1 min-h-[420px] rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 p-5 overflow-y-auto">
                {loading ? (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 className="w-4 h-4 animate-spin text-violet-600" />
                    <span>Writing and checking code...</span>
                  </div>
                ) : output ? (
                  <MarkdownRenderer content={output} />
                ) : (
                  <div className="text-xs text-slate-500 py-16 text-center">
                    Choose a coding mode and submit your prompt or snippet. Code blocks include automatic syntax highlighting and one-click copy buttons.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
