import React, { useState } from 'react';
import {
  AlertTriangle,
  Image as ImageIcon,
  Loader2,
  Send,
  Upload,
} from 'lucide-react';
import type { AppSettings, ChatAttachment, ModelInfo } from '../types';
import { processUploadedFile } from '../utils/fileProcessor';
import { generateAI } from '../utils/aiClient';
import { MarkdownRenderer } from './MarkdownRenderer';

interface ImageAssistantProps {
  settings: AppSettings;
  currentModelInfo: ModelInfo | null;
}

export const ImageAssistant: React.FC<ImageAssistantProps> = ({
  settings,
  currentModelInfo,
}) => {
  const [imageAtt, setImageAtt] = useState<ChatAttachment | null>(null);
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const supportsVision = currentModelInfo ? currentModelInfo.supportsVision : true;

  const handleUpload = async (file: File) => {
    setErrorMsg(null);
    const processed = await processUploadedFile(file);
    if (processed.status === 'error') {
      setErrorMsg(processed.errorMessage || 'Failed to read image.');
      return;
    }
    if (processed.kind !== 'image') {
      setErrorMsg('Please upload a PNG, JPG, or WEBP image file.');
      return;
    }
    setImageAtt(processed);
    setResult('');
  };

  const runAnalysis = async (taskPrompt: string) => {
    if (!imageAtt || !imageAtt.imageDataUrl) {
      setErrorMsg('Upload an image first.');
      return;
    }
    if (!supportsVision) {
      setErrorMsg(
        `The currently selected model (${currentModelInfo?.name}) does not support image input. Switch to a vision-capable model in Settings.`,
      );
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await generateAI({
        provider: settings.provider,
        model: settings.model,
        language: settings.language,
        messages: [
          {
            role: 'user',
            content: taskPrompt,
            attachments: [
              {
                name: imageAtt.name,
                mimeType: imageAtt.mimeType,
                kind: 'image',
                imageDataUrl: imageAtt.imageDataUrl,
              },
            ],
          },
        ],
      });
      setResult(res.text);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Image analysis failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto px-4 md:px-8 py-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            AI Image & Diagram Assistant
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Upload textbook diagrams, handwritten math problems, geometry figures, or printed notes for OCR and visual explanations.
          </p>
        </div>

        {!supportsVision && (
          <div className="p-4 rounded-2xl border border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 flex items-start gap-3 text-sm text-amber-800 dark:text-amber-200">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">Vision Input Not Supported by Active Model</div>
              <div className="text-xs mt-0.5">
                {currentModelInfo?.name} is a text-only model and cannot inspect images. Open Settings and switch to a vision-capable model (such as Gemini 4 Hydrogen) to analyze images.
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Upload & Preview */}
          <div className="lg:col-span-5 space-y-4">
            <label className="block rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/50 hover:border-pink-500 cursor-pointer transition-colors p-6 text-center">
              {imageAtt?.imageDataUrl ? (
                <div className="space-y-3">
                  <img
                    src={imageAtt.imageDataUrl}
                    alt={imageAtt.name}
                    referrerPolicy="no-referrer"
                    className="max-h-72 mx-auto rounded-xl border border-slate-200 dark:border-slate-800 object-contain"
                  />
                  <div className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    {imageAtt.name} · Click to replace image
                  </div>
                </div>
              ) : (
                <div className="py-8 flex flex-col items-center">
                  <Upload className="w-9 h-9 text-pink-600 dark:text-pink-400 mb-2" />
                  <div className="text-sm font-semibold">Upload Image / Diagram</div>
                  <div className="text-xs text-slate-500 mt-1">
                    PNG, JPG, WEBP up to 10 MB
                  </div>
                </div>
              )}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleUpload(f);
                  e.target.value = '';
                }}
              />
            </label>

            <div className="grid grid-cols-2 gap-2">
              {[
                {
                  label: 'Solve Math Problem',
                  prompt: 'Read the mathematical problem in this image accurately and solve it step by step using LaTeX.',
                },
                {
                  label: 'Explain Science Diagram',
                  prompt: 'Identify every labeled part and explain the scientific concept or process shown in this diagram.',
                },
                {
                  label: 'Extract Text (OCR)',
                  prompt: 'Transcribe all visible text, formulas, and tables in this image cleanly in Markdown.',
                },
                {
                  label: 'Make 5 Practice MCQs',
                  prompt: 'Create 5 multiple-choice questions with answers and explanations based on this image.',
                },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  disabled={!imageAtt || !supportsVision || loading}
                  onClick={() => void runAnalysis(preset.prompt)}
                  className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-pink-400 disabled:opacity-40 text-xs font-medium text-left transition-colors"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Right: Question & Explanation */}
          <div className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col gap-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && prompt.trim()) {
                    void runAnalysis(prompt);
                  }
                }}
                placeholder="Ask a specific question about the uploaded image..."
                className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:border-pink-500"
              />
              <button
                type="button"
                disabled={!imageAtt || !supportsVision || loading || !prompt.trim()}
                onClick={() => void runAnalysis(prompt)}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-700 disabled:opacity-40 text-white text-xs font-semibold"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Analyze</span>
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300">
                {errorMsg}
              </div>
            )}

            <div className="flex-1 min-h-[320px] rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 p-4 overflow-y-auto">
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin text-pink-600" />
                  <span>Inspecting image with vision model...</span>
                </div>
              ) : result ? (
                <MarkdownRenderer content={result} />
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center text-xs text-slate-500 py-12">
                  <ImageIcon className="w-8 h-8 text-slate-400 mb-2" />
                  <span>Upload an image and select a quick preset or ask your own question.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
