import React, { useState } from 'react';
import {
  Calculator,
  Download,
  Image as ImageIcon,
  Loader2,
  Sigma,
} from 'lucide-react';
import type { AppSettings, ChatAttachment, ModelInfo } from '../types';
import { generateAI } from '../utils/aiClient';
import { processUploadedFile } from '../utils/fileProcessor';
import { exportTextToPdf } from '../utils/pdfExport';
import { MarkdownRenderer } from './MarkdownRenderer';

interface MathScienceSolverProps {
  settings: AppSettings;
  currentModelInfo: ModelInfo | null;
}

const SUBJECTS = [
  'Arithmetic',
  'Algebra',
  'Geometry',
  'Mensuration',
  'Trigonometry',
  'Physics',
  'Chemistry',
  'Biology',
] as const;

const EXAMPLES: Record<(typeof SUBJECTS)[number], string> = {
  Arithmetic: 'A train 240 m long passes a pole in 24 seconds. How long will it take to pass a platform 650 m long?',
  Algebra: 'Solve the system of equations: 2x + 3y = 13 and 5x - 2y = 4 using substitution and elimination.',
  Geometry: 'In a circle of radius 10 cm, a chord subtends a right angle at the center. Find the area of the minor segment.',
  Mensuration: 'Find the total surface area and volume of a right circular cone of radius 7 cm and slant height 25 cm.',
  Trigonometry: 'Prove that (sin A + cosec A)^2 + (cos A + sec A)^2 = 7 + tan^2 A + cot^2 A.',
  Physics: 'A projectile is launched at 30 degrees with initial velocity 40 m/s. Find maximum height, time of flight, and horizontal range (g = 9.8 m/s^2).',
  Chemistry: 'Calculate the pH of a 0.01 M acetic acid solution given Ka = 1.8 x 10^-5. Also balance the redox reaction: MnO4^- + Fe^2+ -> Mn^2+ + Fe^3+ in acidic medium.',
  Biology: 'Explain the Light and Dark reactions (Calvin Cycle) of Photosynthesis with ATP/NADPH stoichiometry.',
};

// Safe mathematical expression evaluator (no eval / Function constructor)
function evaluateMathExpression(expr: string): string {
  const cleaned = expr
    .replace(/\s+/g, '')
    .replace(/pi/gi, String(Math.PI))
    .replace(/\be\b/g, String(Math.E));

  let pos = 0;
  const peek = () => cleaned[pos];
  const consume = () => cleaned[pos++];

  const parseExpr = (): number => {
    let val = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const op = consume();
      const rhs = parseTerm();
      val = op === '+' ? val + rhs : val - rhs;
    }
    return val;
  };

  const parseTerm = (): number => {
    let val = parsePower();
    while (peek() === '*' || peek() === '/') {
      const op = consume();
      const rhs = parsePower();
      if (op === '/') {
        if (rhs === 0) throw new Error('Division by zero');
        val /= rhs;
      } else {
        val *= rhs;
      }
    }
    return val;
  };

  const parsePower = (): number => {
    const base = parseUnary();
    if (peek() === '^') {
      consume();
      const exp = parsePower();
      return Math.pow(base, exp);
    }
    return base;
  };

  const parseUnary = (): number => {
    if (peek() === '-') {
      consume();
      return -parseUnary();
    }
    if (peek() === '+') {
      consume();
      return parseUnary();
    }
    return parsePrimary();
  };

  const parsePrimary = (): number => {
    if (peek() === '(') {
      consume();
      const val = parseExpr();
      if (consume() !== ')') throw new Error('Mismatched parentheses');
      return val;
    }

    const fnMatch = /^(sin|cos|tan|sqrt|log|ln|abs)\(/.exec(cleaned.slice(pos));
    if (fnMatch) {
      const fn = fnMatch[1];
      pos += fn.length + 1;
      const arg = parseExpr();
      if (consume() !== ')') throw new Error('Missing closing parenthesis');
      switch (fn) {
        case 'sin':
          return Math.sin(arg);
        case 'cos':
          return Math.cos(arg);
        case 'tan':
          return Math.tan(arg);
        case 'sqrt':
          if (arg < 0) throw new Error('Negative sqrt');
          return Math.sqrt(arg);
        case 'log':
          return Math.log10(arg);
        case 'ln':
          return Math.log(arg);
        case 'abs':
          return Math.abs(arg);
      }
    }

    const numMatch = /^(\d+(\.\d+)?|\.\d+)/.exec(cleaned.slice(pos));
    if (numMatch) {
      pos += numMatch[0].length;
      return Number(numMatch[0]);
    }
    throw new Error('Invalid syntax');
  };

  const result = parseExpr();
  if (pos !== cleaned.length || Number.isNaN(result) || !Number.isFinite(result)) {
    throw new Error('Invalid expression');
  }
  return Number(result.toPrecision(12)).toString();
}

export const MathScienceSolver: React.FC<MathScienceSolverProps> = ({
  settings,
  currentModelInfo,
}) => {
  const [subject, setSubject] = useState<(typeof SUBJECTS)[number]>('Algebra');
  const [problem, setProblem] = useState('');
  const [imageAtt, setImageAtt] = useState<ChatAttachment | null>(null);
  const [solution, setSolution] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Local scientific calculator state
  const [calcExpr, setCalcExpr] = useState('sqrt(144) + 5 * cos(0)');
  const [calcResult, setCalcResult] = useState('17');
  const [calcErr, setCalcErr] = useState<string | null>(null);

  const handleCalculateLocal = (expr: string) => {
    setCalcExpr(expr);
    if (!expr.trim()) {
      setCalcResult('');
      setCalcErr(null);
      return;
    }
    try {
      setCalcResult(evaluateMathExpression(expr));
      setCalcErr(null);
    } catch (err) {
      setCalcResult('');
      setCalcErr(err instanceof Error ? err.message : 'Invalid expression');
    }
  };

  const handleImageAttach = async (file: File) => {
    const processed = await processUploadedFile(file);
    if (processed.status === 'error') {
      setErrorMsg(processed.errorMessage || 'Failed to read image.');
      return;
    }
    if (processed.kind !== 'image') {
      setErrorMsg('Upload a PNG, JPG, or WEBP problem image.');
      return;
    }
    setImageAtt(processed);
    setErrorMsg(null);
  };

  const handleSolve = async () => {
    if (!problem.trim() && !imageAtt) {
      setErrorMsg('Enter a problem or upload an equation/diagram image.');
      return;
    }
    if (imageAtt && currentModelInfo && !currentModelInfo.supportsVision) {
      setErrorMsg(
        `The active model (${currentModelInfo.name}) does not support image inputs. Switch to Gemini 4 Hydrogen in Settings.`,
      );
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    const promptText = `Solve this ${subject} problem with rigorous step-by-step explanations:
${problem || 'Solve the problem shown in the attached image.'}

Requirements:
1. State Given Information / Concepts & Formulas Used.
2. Show every step clearly with proper LaTeX equations ($...$ and $$...$$).
3. Highlight the Final Answer with proper units.`;

    try {
      const res = await generateAI({
        provider: settings.provider,
        model: settings.model,
        language: settings.language,
        messages: [
          {
            role: 'user',
            content: promptText,
            attachments: imageAtt?.imageDataUrl
              ? [
                  {
                    name: imageAtt.name,
                    mimeType: imageAtt.mimeType,
                    kind: 'image',
                    imageDataUrl: imageAtt.imageDataUrl,
                  },
                ]
              : undefined,
          },
        ],
      });
      setSolution(res.text);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to solve problem.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto px-4 md:px-8 py-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Math & Science Step-by-Step Solver
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Arithmetic, Algebra, Geometry, Mensuration, Trigonometry, Physics, Chemistry, and Biology with LaTeX derivations and local scientific calculator.
          </p>
        </div>

        {/* Subject Selector */}
        <div className="flex flex-wrap gap-2">
          {SUBJECTS.map((sub) => (
            <button
              key={sub}
              type="button"
              onClick={() => setSubject(sub)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors ${
                subject === sub
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              {sub}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Problem Input + Local Calculator */}
          <div className="lg:col-span-5 space-y-5">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-base">{subject} Problem</h2>
                <button
                  type="button"
                  onClick={() => setProblem(EXAMPLES[subject])}
                  className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Load Example
                </button>
              </div>

              <textarea
                value={problem}
                onChange={(e) => setProblem(e.target.value)}
                placeholder={`Type your ${subject} equation, numerical, or conceptual question...`}
                rows={6}
                className="w-full p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:border-blue-500"
              />

              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
                  <ImageIcon className="w-3.5 h-3.5 text-blue-600" />
                  <span>{imageAtt ? imageAtt.name : 'Attach Problem Photo'}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleImageAttach(f);
                      e.target.value = '';
                    }}
                  />
                </label>

                {imageAtt && (
                  <button
                    type="button"
                    onClick={() => setImageAtt(null)}
                    className="text-xs text-red-500 hover:underline"
                  >
                    Remove image
                  </button>
                )}
              </div>

              {errorMsg && (
                <div className="p-3 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300">
                  {errorMsg}
                </div>
              )}

              <button
                type="button"
                disabled={loading}
                onClick={() => void handleSolve()}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Solving Step-by-Step...</span>
                  </>
                ) : (
                  <>
                    <Sigma className="w-4 h-4" />
                    <span>Solve {subject} Problem</span>
                  </>
                )}
              </button>
            </div>

            {/* Local Browser Scientific Calculator */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <Calculator className="w-4 h-4 text-teal-600" />
                <span>Quick Local Scientific Calculator</span>
              </div>
              <input
                type="text"
                value={calcExpr}
                onChange={(e) => handleCalculateLocal(e.target.value)}
                placeholder="e.g. (25^2 - 7^2) / 2, sin(pi/6), log(100)"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono"
              />
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">
                  Supports +, -, *, /, ^, sin, cos, tan, sqrt, log, ln, abs, pi, e
                </span>
                {calcErr ? (
                  <span className="text-red-500 font-medium">{calcErr}</span>
                ) : (
                  <span className="font-mono font-bold text-base text-teal-600 dark:text-teal-400 tabular-nums">
                    = {calcResult}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right: Step-by-Step Solution */}
          <div className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-base">Step-by-Step Derivation</h2>
              {solution && (
                <button
                  type="button"
                  onClick={() =>
                    exportTextToPdf(
                      `${subject} Solution`,
                      solution,
                      `${subject}_Solution.pdf`,
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-semibold"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download PDF</span>
                </button>
              )}
            </div>

            <div className="flex-1 min-h-[420px] rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 p-5 overflow-y-auto">
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                  <span>Working through equations and derivations...</span>
                </div>
              ) : solution ? (
                <MarkdownRenderer content={solution} />
              ) : (
                <div className="text-xs text-slate-500 py-16 text-center">
                  Choose a subject, enter your problem or load an example, and click Solve to view formatted formulas and step-by-step explanations.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
