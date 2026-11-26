import React, { useState } from 'react';
import { Check, Copy, Download, Loader2, PenTool } from 'lucide-react';
import type { AppSettings } from '../types';
import { generateAI } from '../utils/aiClient';
import { exportTextToPdf } from '../utils/pdfExport';
import { MarkdownRenderer } from './MarkdownRenderer';

interface WritingToolsProps {
  settings: AppSettings;
}

type WritingToolId =
  | 'essay'
  | 'letter'
  | 'application'
  | 'email'
  | 'grammar'
  | 'summarizer'
  | 'translator'
  | 'cv'
  | 'assignment'
  | 'report';

const WRITING_TOOLS: Array<{
  id: WritingToolId;
  label: string;
  placeholder: string;
  defaultExtra: string;
}> = [
  {
    id: 'essay',
    label: 'Essay Writer',
    placeholder: 'Topic: Renewable Energy and Sustainable Development...',
    defaultExtra: 'Academic & Analytical, ~600 words',
  },
  {
    id: 'letter',
    label: 'Letter Writer',
    placeholder: 'Formal/Informal letter details (sender, recipient, purpose)...',
    defaultExtra: 'Formal',
  },
  {
    id: 'application',
    label: 'Application Writer',
    placeholder: 'e.g. Leave application to Principal / Scholarship application...',
    defaultExtra: 'Formal School / College Application',
  },
  {
    id: 'email',
    label: 'Email Writer',
    placeholder: 'Recipient, context, and key points to include...',
    defaultExtra: 'Professional & Concise',
  },
  {
    id: 'grammar',
    label: 'Grammar Checker',
    placeholder: 'Paste the paragraph or essay you want proofread and improved...',
    defaultExtra: 'Fix grammar, clarity, and list key corrections',
  },
  {
    id: 'summarizer',
    label: 'Paragraph Summarizer',
    placeholder: 'Paste long article or textbook paragraphs to summarize...',
    defaultExtra: 'Executive summary + 5 bullet takeaways',
  },
  {
    id: 'translator',
    label: 'Translation Tool',
    placeholder: 'Paste text to translate...',
    defaultExtra: 'Translate between English and Hindi (Devanagari)',
  },
  {
    id: 'cv',
    label: 'CV / Resume Maker',
    placeholder: 'Name, education, skills, projects, internships, target role...',
    defaultExtra: 'Clean ATS-friendly academic & fresher resume format',
  },
  {
    id: 'assignment',
    label: 'Assignment Generator',
    placeholder: 'Course, assignment topic, key questions/rubric...',
    defaultExtra: 'Structured with introduction, analysis, examples & conclusion',
  },
  {
    id: 'report',
    label: 'Project Report Generator',
    placeholder: 'Project title, objectives, methodology, tools/tech used, findings...',
    defaultExtra: 'Complete academic report with Abstract, Methodology & Conclusion',
  },
];

export const WritingTools: React.FC<WritingToolsProps> = ({ settings }) => {
  const [activeTool, setActiveTool] = useState<WritingToolId>('essay');
  const [details, setDetails] = useState('');
  const [toneOrSpec, setToneOrSpec] = useState(WRITING_TOOLS[0].defaultExtra);
  const [targetLang, setTargetLang] = useState('Hindi');
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const currentMeta = WRITING_TOOLS.find((t) => t.id === activeTool)!;

  const handleToolSelect = (id: WritingToolId) => {
    setActiveTool(id);
    const meta = WRITING_TOOLS.find((t) => t.id === id)!;
    setToneOrSpec(meta.defaultExtra);
    setErrorMsg(null);
  };

  const handleRun = async () => {
    if (!details.trim()) {
      setErrorMsg('Please enter your prompt or paste text.');
      return;
    }
    setLoading(true);
    setErrorMsg(null);

    const promptByTool: Record<WritingToolId, string> = {
      essay: `Write a well-structured essay on:\n${details}\nSpecifications: ${toneOrSpec}. Include a clear title, introduction, body sections with headings, and conclusion.`,
      letter: `Write a complete letter based on:\n${details}\nTone/Style: ${toneOrSpec}. Include proper salutations, date/subject placeholders, and sign-off.`,
      application: `Write a formal application based on:\n${details}\nFormat: ${toneOrSpec}. Use standard academic/official formatting.`,
      email: `Draft a ready-to-send email with Subject line based on:\n${details}\nTone: ${toneOrSpec}.`,
      grammar: `Check and correct the grammar, spelling, punctuation, and sentence flow of the text below. Provide:\n1. **Corrected Version**\n2. **Summary of Key Corrections**\n\nText:\n${details}`,
      summarizer: `Summarize the following text clearly (${toneOrSpec}):\n\n${details}`,
      translator: `Translate the following text accurately into **${targetLang}** while preserving tone and meaning. Also provide brief vocabulary notes if helpful:\n\n${details}`,
      cv: `Build a polished, ATS-ready CV / Resume in clean Markdown based on these details:\n${details}\nStyle: ${toneOrSpec}.`,
      assignment: `Write a thorough academic assignment based on:\n${details}\nGuidelines: ${toneOrSpec}.`,
      report: `Generate a comprehensive academic Project Report with Title Page details, Abstract, Introduction, Objectives, Methodology, Implementation/Analysis, Results, and Conclusion based on:\n${details}\nSpecifications: ${toneOrSpec}.`,
    };

    try {
      const res = await generateAI({
        provider: settings.provider,
        model: settings.model,
        language: settings.language,
        prompt: promptByTool[activeTool],
      });
      setOutput(res.text);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to generate document.');
    } finally {
      setLoading(false);
    }
  };

  const downloadTxt = () => {
    const blob = new Blob([output], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeTool}_document.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="h-full overflow-y-auto px-4 md:px-8 py-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            AI Writing & Document Tools
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Essays, letters, applications, emails, grammar proofreading, translation, resumes, assignments, and full project reports.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {WRITING_TOOLS.map((tool) => (
            <button
              key={tool.id}
              type="button"
              onClick={() => handleToolSelect(tool.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors ${
                activeTool === tool.id
                  ? 'bg-orange-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              {tool.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Input Panel */}
          <div className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4 h-fit">
            <h2 className="font-semibold text-base">{currentMeta.label}</h2>

            {activeTool === 'translator' ? (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Target Language
                </label>
                <select
                  value={targetLang}
                  onChange={(e) => setTargetLang(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                >
                  <option value="Hindi">Hindi (हिन्दी)</option>
                  <option value="English">English</option>
                  <option value="Sanskrit">Sanskrit</option>
                  <option value="French">French</option>
                  <option value="Spanish">Spanish</option>
                  <option value="German">German</option>
                </select>
              </div>
            ) : (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Tone / Length / Format Preferences
                </label>
                <input
                  type="text"
                  value={toneOrSpec}
                  onChange={(e) => setToneOrSpec(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                />
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Input Details / Content
              </label>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder={currentMeta.placeholder}
                rows={9}
                className="w-full p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:border-orange-500"
              />
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
                {errorMsg}
              </div>
            )}

            <button
              type="button"
              disabled={loading}
              onClick={() => void handleRun()}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-sm font-semibold"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Generating Document...</span>
                </>
              ) : (
                <>
                  <PenTool className="w-4 h-4" />
                  <span>Generate {currentMeta.label}</span>
                </>
              )}
            </button>
          </div>

          {/* Output Panel */}
          <div className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-base">Generated Document</h2>
              {output && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(output);
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
                    onClick={downloadTxt}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>.TXT</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      exportTextToPdf(
                        currentMeta.label,
                        output,
                        `${activeTool}_document.pdf`,
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-orange-600 text-white text-xs font-semibold"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>PDF</span>
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1 min-h-[380px] rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 p-5 overflow-y-auto">
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin text-orange-600" />
                  <span>Drafting your document...</span>
                </div>
              ) : output ? (
                <MarkdownRenderer content={output} />
              ) : (
                <div className="text-xs text-slate-500 py-12 text-center">
                  Select a tool, enter your details on the left, and click Generate. You can copy or download the result as PDF or TXT.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
