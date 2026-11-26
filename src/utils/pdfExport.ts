import { jsPDF } from 'jspdf';
import type {
  CbseHindiQuestionPaper,
  GeneratedExamPaper,
  GeneratedExamQuestion,
  GeneratedLessonPlan,
  MockQuestion,
  MockTestAttempt,
  UserAnswerValue,
} from '../types';
import { LESSON_PLAN_UI_LABELS } from './lessonPlanSyllabus';

const UNICODE_FONT_STACK =
  '"Noto Sans Devanagari", "Noto Sans Oriya", "Plus Jakarta Sans", "DM Sans", "Kohinoor Devanagari", "Kalinga", system-ui, -apple-system, sans-serif';

async function ensureUnicodeFontsLoaded(): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  try {
    await document.fonts.ready;
    await Promise.all([
      document.fonts.load('400 22px "Noto Sans Devanagari"'),
      document.fonts.load('700 22px "Noto Sans Devanagari"'),
      document.fonts.load('400 22px "Noto Sans Oriya"'),
      document.fonts.load('700 22px "Noto Sans Oriya"'),
      document.fonts.load('400 22px "DM Sans"'),
      document.fonts.load('700 26px "Plus Jakarta Sans"'),
    ]);
  } catch {
    // Graceful fallback if specific font query throws
  }
}

function addWrappedText(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): number {
  const lines = doc.splitTextToSize(text, maxWidth) as string[];
  let cursorY = y;
  const pageHeight = doc.internal.pageSize.getHeight();
  for (const line of lines) {
    if (cursorY > pageHeight - 18) {
      doc.addPage();
      cursorY = 18;
    }
    doc.text(line, x, cursorY);
    cursorY += lineHeight;
  }
  return cursorY;
}

function exportUnicodeTextToPdf(title: string, content: string, filename: string): void {
  if (typeof document === 'undefined') return;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidthMm = doc.internal.pageSize.getWidth();
  const pageHeightMm = doc.internal.pageSize.getHeight();
  const W = 1240;
  const H = 1754;
  const margin = 78;
  const maxW = W - margin * 2;
  const bottomLimit = H - 84;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let pageIndex = 0;
  let y = margin;

  const initPage = () => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    y = margin;
  };

  const flushPage = () => {
    if (pageIndex > 0) doc.addPage();
    doc.addImage(canvas.toDataURL('image/jpeg', 0.93), 'JPEG', 0, 0, pageWidthMm, pageHeightMm);
    pageIndex++;
    initPage();
  };

  const drawParagraph = (text: string, font: string, color: string, lineHeight: number) => {
    ctx.font = font;
    ctx.fillStyle = color;
    const words = text.split(/\s+/);
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width > maxW && line) {
        if (y + lineHeight > bottomLimit) {
          flushPage();
          ctx.font = font;
          ctx.fillStyle = color;
        }
        ctx.fillText(line, margin, y);
        y += lineHeight;
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) {
      if (y + lineHeight > bottomLimit) {
        flushPage();
        ctx.font = font;
        ctx.fillStyle = color;
      }
      ctx.fillText(line, margin, y);
      y += lineHeight;
    }
  };

  initPage();
  drawParagraph(title, `bold 28px ${UNICODE_FONT_STACK}`, '#0f172a', 38);
  y += 10;
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(margin, y);
  ctx.lineTo(W - margin, y);
  ctx.stroke();
  y += 28;

  const cleanContent = content
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```[a-z]*\n?/gi, '').replace(/```/g, ''))
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1');

  for (const para of cleanContent.split('\n')) {
    if (!para.trim()) {
      y += 14;
      continue;
    }
    if (para.startsWith('#')) {
      y += 8;
      drawParagraph(para.replace(/^#+\s*/, ''), `bold 23px ${UNICODE_FONT_STACK}`, '#1e293b', 32);
    } else {
      drawParagraph(para, `normal 20px ${UNICODE_FONT_STACK}`, '#1e293b', 29);
    }
  }

  if (pageIndex > 0) doc.addPage();
  doc.addImage(canvas.toDataURL('image/jpeg', 0.93), 'JPEG', 0, 0, pageWidthMm, pageHeightMm);
  doc.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
}

export function exportTextToPdf(title: string, content: string, filename: string): void {
  if (/[^\u0000-\u00FF]/.test(`${title}\n${content}`) && typeof document !== 'undefined') {
    void ensureUnicodeFontsLoaded().then(() => {
      exportUnicodeTextToPdf(title, content, filename);
    });
    return;
  }
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 16;
  const maxWidth = pageWidth - margin * 2;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  let y = addWrappedText(doc, title, margin, 20, maxWidth, 7);

  doc.setDrawColor(210, 214, 220);
  doc.line(margin, y + 1, pageWidth - margin, y + 1);
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);

  const cleanContent = content
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```[a-z]*\n?/gi, '').replace(/```/g, ''))
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1');

  const paragraphs = cleanContent.split('\n');
  for (const para of paragraphs) {
    if (!para.trim()) {
      y += 3;
      continue;
    }
    if (para.startsWith('#')) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      y = addWrappedText(doc, para.replace(/^#+\s*/, ''), margin, y + 2, maxWidth, 6);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10.5);
    } else {
      y = addWrappedText(doc, para, margin, y, maxWidth, 5.2);
    }
  }

  doc.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
}

function isAttemptedValue(ans: UserAnswerValue | undefined): boolean {
  if (ans === undefined) return false;
  if (Array.isArray(ans)) return ans.length > 0;
  if (typeof ans === 'string') return ans.trim().length > 0;
  return true;
}

function formatUserAnswerLabel(q: MockQuestion, ans: UserAnswerValue | undefined): string {
  if (ans === undefined) return 'Unattempted';
  if (q.questionType === 'Numerical') return String(ans);
  if (q.questionType === 'Multiple-Select' && Array.isArray(ans)) {
    return ans.map((i) => String.fromCharCode(65 + i)).join(', ') || 'Unattempted';
  }
  if (typeof ans === 'number') {
    return `${String.fromCharCode(65 + ans)}. ${q.options[ans] || ''}`;
  }
  return String(ans);
}

function formatCorrectAnswerLabel(q: MockQuestion): string {
  if (q.questionType === 'Numerical') return q.numericalAnswer || 'N/A';
  if (q.questionType === 'Multiple-Select' && Array.isArray(q.correctIndices)) {
    return q.correctIndices.map((i) => String.fromCharCode(65 + i)).join(', ');
  }
  return `${String.fromCharCode(65 + q.correctIndex)}. ${q.options[q.correctIndex] || ''}`;
}

function exportUnicodeMockResultToPdf(attempt: MockTestAttempt, safeName: string): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidthMm = doc.internal.pageSize.getWidth();
  const pageHeightMm = doc.internal.pageSize.getHeight();

  const W = 1240;
  const H = 1754;
  const margin = 76;
  const maxW = W - margin * 2;
  const bottomLimit = H - 84;

  const fontStack =
    '"Noto Sans Oriya", "Kalinga", "Noto Sans Devanagari", "Kohinoor Devanagari", system-ui, -apple-system, sans-serif';

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let pageIndex = 0;
  let y = margin;

  const initPage = () => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    y = margin;
  };

  const flushPage = () => {
    if (pageIndex > 0) doc.addPage();
    const imgData = canvas.toDataURL('image/jpeg', 0.92);
    doc.addImage(imgData, 'JPEG', 0, 0, pageWidthMm, pageHeightMm);
    pageIndex++;
    initPage();
  };

  const wrapCanvasLines = (text: string, maxPx: number, font: string): string[] => {
    ctx.font = font;
    const paragraphs = text.split('\n');
    const out: string[] = [];
    for (const para of paragraphs) {
      const words = para.split(/\s+/);
      let line = '';
      for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width > maxPx && line) {
          out.push(line);
          line = word;
        } else {
          line = test;
        }
      }
      if (line) out.push(line);
      else out.push('');
    }
    return out;
  };

  const drawTextBlock = (
    text: string,
    x: number,
    maxPx: number,
    font: string,
    color: string,
    lineHeight: number,
  ) => {
    const lines = wrapCanvasLines(text, maxPx, font);
    ctx.font = font;
    ctx.fillStyle = color;
    for (const ln of lines) {
      if (y + lineHeight > bottomLimit) {
        flushPage();
        ctx.font = font;
        ctx.fillStyle = color;
      }
      if (ln) ctx.fillText(ln, x, y);
      y += lineHeight;
    }
  };

  initPage();

  const isOdia = attempt.config.language === 'odia';
  const isHindi = attempt.config.language === 'hindi';

  const txtTitle = isOdia
    ? 'PadhloAI — ମକ୍ ଟେଷ୍ଟ ସ୍କୋରକାର୍ଡ (AI ଅଭ୍ୟାସ ପରୀକ୍ଷା)'
    : isHindi
      ? 'PadhloAI — मॉक टेस्ट स्कोरकार्ड (AI अभ्यास परीक्षा)'
      : 'PadhloAI — Mock Test Scorecard (AI-Generated Practice)';
  const txtMarks = isOdia ? 'ମୋଟ ନମ୍ବର' : isHindi ? 'कुल अंक' : 'Marks';
  const txtAccuracy = isOdia ? 'ସଠିକତା' : isHindi ? 'सटीकता' : 'Accuracy';
  const txtCorrect = isOdia ? 'ସଠିକ୍' : isHindi ? 'सही' : 'Correct';
  const txtIncorrect = isOdia ? 'ଭୁଲ' : isHindi ? 'गलत' : 'Incorrect';
  const txtUnattempted = isOdia ? 'ଛାଡ଼ିଛନ୍ତି' : isHindi ? 'प्रयास नहीं किया' : 'Unattempted';
  const txtTime = isOdia ? 'ସମୟ' : isHindi ? 'समय' : 'Time';
  const txtSubPerf = isOdia
    ? 'ବିଷୟ-ୱାରୀ ପ୍ରଦର୍ଶନ ବିବରଣୀ'
    : isHindi
      ? 'विषयवार प्रदर्शन विवरण'
      : 'Subject-wise Performance';
  const txtYourAns = isOdia ? 'ଆପଣଙ୍କ ଉତ୍ତର' : isHindi ? 'आपका उत्तर' : 'Your Answer';
  const txtCorrAns = isOdia ? 'ସଠିକ୍ ଉତ୍ତର' : isHindi ? 'सही उत्तर' : 'Correct';
  const txtExpl = isOdia ? 'ବ୍ୟାଖ୍ୟା' : isHindi ? 'व्याख्या' : 'Explanation';

  // Header
  drawTextBlock(
    txtTitle,
    margin,
    maxW,
    `bold 30px ${fontStack}`,
    '#0f172a',
    40,
  );
  const subTitle = `${attempt.config.examName} · ${attempt.config.classOrPaper || attempt.config.classLevel || ''} · ${attempt.config.subject} · ${attempt.config.language.toUpperCase()}`;
  drawTextBlock(subTitle, margin, maxW, `normal 21px ${fontStack}`, '#475569', 30);
  y += 12;

  // Summary Box
  const maxScore = attempt.maxScore ?? attempt.questions.length;
  const mins = Math.floor(attempt.timeTakenSeconds / 60);
  const secs = attempt.timeTakenSeconds % 60;
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(margin, y, maxW, 132);
  y += 38;
  drawTextBlock(
    `${txtMarks}: ${Number(attempt.score.toFixed(2))} / ${maxScore} (${attempt.percentage.toFixed(1)}%)   |   ${txtAccuracy}: ${(attempt.accuracyPercentage ?? 0).toFixed(1)}%`,
    margin + 20,
    maxW - 40,
    `bold 23px ${fontStack}`,
    '#0f172a',
    34,
  );
  drawTextBlock(
    `${txtCorrect}: ${attempt.correctCount}  |  ${txtIncorrect}: ${attempt.incorrectCount}  |  ${txtUnattempted}: ${attempt.unattemptedCount}  |  ${txtTime}: ${mins}m ${secs}s`,
    margin + 20,
    maxW - 40,
    `normal 20px ${fontStack}`,
    '#334155',
    30,
  );
  drawTextBlock(
    `+${attempt.config.marksPerQuestion ?? 1} / ${attempt.config.negativeMarkingEnabled ? `-${attempt.config.negativeMarksPerWrong}` : '0 Negative'}`,
    margin + 20,
    maxW - 40,
    `normal 19px ${fontStack}`,
    '#475569',
    28,
  );
  y += 24;

  // Subject Breakdown
  if (Array.isArray(attempt.subjectBreakdown) && attempt.subjectBreakdown.length > 0) {
    drawTextBlock(
      txtSubPerf,
      margin,
      maxW,
      `bold 24px ${fontStack}`,
      '#0f172a',
      34,
    );
    for (const s of attempt.subjectBreakdown) {
      drawTextBlock(
        `• ${s.subject}: ${s.correct}/${s.total} ${txtCorrect} (${s.accuracy.toFixed(1)}%) · ${txtMarks} ${Number(s.marks.toFixed(2))}/${s.maxMarks}`,
        margin + 12,
        maxW - 12,
        `normal 20px ${fontStack}`,
        '#334155',
        28,
      );
    }
    y += 16;
  }

  // Questions
  attempt.questions.forEach((q, idx) => {
    const userAns = attempt.answers[q.id];
    drawTextBlock(
      `Q${idx + 1} [${q.subject} · ${q.questionType}]: ${q.question}`,
      margin,
      maxW,
      `bold 21px ${fontStack}`,
      '#0f172a',
      30,
    );
    if (q.passage) {
      drawTextBlock(
        `${q.passage}`,
        margin + 14,
        maxW - 14,
        `italic 19px ${fontStack}`,
        '#475569',
        26,
      );
    }
    q.options.forEach((opt, oIdx) => {
      drawTextBlock(
        `   ${String.fromCharCode(65 + oIdx)}. ${opt}`,
        margin,
        maxW,
        `normal 20px ${fontStack}`,
        '#1e293b',
        28,
      );
    });
    drawTextBlock(
      `   ${txtYourAns}: ${isAttemptedValue(userAns) ? formatUserAnswerLabel(q, userAns) : txtUnattempted}   |   ${txtCorrAns}: ${formatCorrectAnswerLabel(q)}`,
      margin,
      maxW,
      `bold 19px ${fontStack}`,
      '#047857',
      28,
    );
    drawTextBlock(
      `   ${txtExpl}: ${q.explanation}`,
      margin,
      maxW,
      `normal 19px ${fontStack}`,
      '#475569',
      28,
    );
    y += 14;
  });

  // Final page flush
  if (pageIndex > 0) doc.addPage();
  doc.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pageWidthMm, pageHeightMm);
  doc.save(`${safeName}.pdf`);
}

export function exportMockResultToPdf(attempt: MockTestAttempt): void {
  const safeName = `${attempt.config.examName}_${attempt.config.subject}_Result`
    .replace(/[^a-zA-Z0-9_-]+/g, '_');

  const combinedSample = JSON.stringify({
    e: attempt.config.examName,
    s: attempt.config.subject,
    q: attempt.questions.slice(0, 5),
  });
  const hasNonLatin =
    attempt.config.language !== 'english' || /[^\u0000-\u00FF]/.test(combinedSample);

  if (hasNonLatin && typeof document !== 'undefined') {
    exportUnicodeMockResultToPdf(attempt, safeName);
    return;
  }

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const maxWidth = pageWidth - margin * 2;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  let y = addWrappedText(
    doc,
    `PadhloAI — Mock Test Scorecard (AI-Generated Practice)`,
    margin,
    18,
    maxWidth,
    7,
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const subTitle = `${attempt.config.examName} · ${attempt.config.classOrPaper || attempt.config.classLevel || ''} · ${attempt.config.subject} · Language: ${attempt.config.language.toUpperCase()}`;
  y = addWrappedText(doc, subTitle, margin, y + 1, maxWidth, 5.2);

  y += 3;
  doc.setFillColor(245, 247, 250);
  doc.rect(margin, y, maxWidth, 26, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  const maxScore = attempt.maxScore ?? attempt.questions.length;
  doc.text(
    `Marks: ${Number(attempt.score.toFixed(2))} / ${maxScore} (${attempt.percentage.toFixed(1)}%)   |   Accuracy: ${(attempt.accuracyPercentage ?? 0).toFixed(1)}%`,
    margin + 4,
    y + 8,
  );
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  const mins = Math.floor(attempt.timeTakenSeconds / 60);
  const secs = attempt.timeTakenSeconds % 60;
  doc.text(
    `Correct: ${attempt.correctCount}  |  Incorrect: ${attempt.incorrectCount}  |  Unattempted: ${attempt.unattemptedCount}  |  Time: ${mins}m ${secs}s`,
    margin + 4,
    y + 15.5,
  );
  doc.text(
    `Marking: +${attempt.config.marksPerQuestion ?? 1} / ${attempt.config.negativeMarkingEnabled ? `-${attempt.config.negativeMarksPerWrong}` : 'No negative marking'}`,
    margin + 4,
    y + 22,
  );

  y += 32;

  if (Array.isArray(attempt.subjectBreakdown) && attempt.subjectBreakdown.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    y = addWrappedText(doc, 'Subject-wise Performance', margin, y, maxWidth, 5.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    for (const s of attempt.subjectBreakdown) {
      y = addWrappedText(
        doc,
        `• ${s.subject}: ${s.correct}/${s.total} correct (${s.accuracy.toFixed(1)}% accuracy) · Marks ${Number(s.marks.toFixed(2))}/${s.maxMarks}`,
        margin + 2,
        y,
        maxWidth - 2,
        5,
      );
    }
    y += 4;
  }

  attempt.questions.forEach((q, idx) => {
    const userAns = attempt.answers[q.id];
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    y = addWrappedText(
      doc,
      `Q${idx + 1} [${q.subject} · ${q.questionType}]: ${q.question}`,
      margin,
      y + 2,
      maxWidth,
      5,
    );

    if (q.passage) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      y = addWrappedText(doc, `Passage: ${q.passage}`, margin + 2, y, maxWidth - 2, 4.6);
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    q.options.forEach((opt, oIdx) => {
      y = addWrappedText(
        doc,
        `   ${String.fromCharCode(65 + oIdx)}. ${opt}`,
        margin,
        y,
        maxWidth,
        4.8,
      );
    });

    y = addWrappedText(
      doc,
      `   Your Answer: ${formatUserAnswerLabel(q, userAns)}  |  Correct: ${formatCorrectAnswerLabel(q)}`,
      margin,
      y + 0.5,
      maxWidth,
      4.8,
    );

    y = addWrappedText(
      doc,
      `   Explanation: ${q.explanation}`,
      margin,
      y + 0.5,
      maxWidth,
      4.8,
    );
    y += 3.5;
  });

  doc.save(`${safeName}.pdf`);
}

export interface TopicPdfExportOptions {
  boardName: string;
  className: string;
  subjectName: string;
  chapterName: string;
  topicName: string;
  language: 'english' | 'odia' | 'hindi';
  questions: MockQuestion[];
  includeAnswerKey: boolean;
  documentHeading?: string;
}

function cleanPdfMathAndMarkdown(raw: string): string {
  return (raw || '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\$([^$]+)\$/g, '$1')
    .trim();
}

export async function exportTopicQuestionsToPdf(
  opts: TopicPdfExportOptions,
): Promise<void> {
  if (typeof document === 'undefined') return;

  await ensureUnicodeFontsLoaded();

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidthMm = doc.internal.pageSize.getWidth();
  const pageHeightMm = doc.internal.pageSize.getHeight();

  const W = 1240;
  const H = 1754;
  const margin = 78;
  const maxW = W - margin * 2;
  const bottomLimit = H - 88;

  const fontStack =
    '"Noto Sans Oriya", "Noto Sans Devanagari", "Plus Jakarta Sans", "DM Sans", "Kalinga", system-ui, -apple-system, sans-serif';

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let pageNumber = 1;
  let y = margin;

  const isOdia = opts.language === 'odia';
  const isHindi = opts.language === 'hindi';

  const drawFooter = () => {
    ctx.font = `normal 16px ${fontStack}`;
    ctx.fillStyle = '#64748b';
    const footerLeft = isOdia
      ? 'PadhloAI · AI-ପ୍ରସ୍ତୁତ ଅଭ୍ୟାସ ପ୍ରଶ୍ନ (ସରକାରୀ ପୂର୍ବ ବର୍ଷ ପ୍ରଶ୍ନପତ୍ର ନୁହେଁ)'
      : isHindi
        ? 'PadhloAI · AI-जनित अभ्यास प्रश्न (आधिकारिक पिछले वर्ष के प्रश्नपत्र नहीं)'
        : 'PadhloAI · AI-Generated Practice Questions (Not official previous-year papers)';
    ctx.fillText(footerLeft, margin, H - 38);
    const pageTxt = isOdia
      ? `ପୃଷ୍ଠା ${pageNumber}`
      : isHindi
        ? `पृष्ठ ${pageNumber}`
        : `Page ${pageNumber}`;
    const pW = ctx.measureText(pageTxt).width;
    ctx.fillText(pageTxt, W - margin - pW, H - 38);
  };

  const initPage = () => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    y = margin;
  };

  const flushPage = () => {
    drawFooter();
    if (pageNumber > 1) doc.addPage();
    const imgData = canvas.toDataURL('image/jpeg', 0.94);
    doc.addImage(imgData, 'JPEG', 0, 0, pageWidthMm, pageHeightMm);
    pageNumber++;
    initPage();
  };

  const wrapLines = (text: string, maxPx: number, font: string): string[] => {
    ctx.font = font;
    const paragraphs = text.split('\n');
    const out: string[] = [];
    for (const para of paragraphs) {
      const words = para.split(/\s+/);
      let line = '';
      for (const word of words) {
        if (!word) continue;
        const candidate = line ? `${line} ${word}` : word;
        if (ctx.measureText(candidate).width <= maxPx) {
          line = candidate;
        } else {
          if (line) out.push(line);
          if (ctx.measureText(word).width <= maxPx) {
            line = word;
          } else {
            // Safe character wrap for long unspaced tokens/formulas
            let chunk = '';
            for (const ch of Array.from(word)) {
              if (ctx.measureText(chunk + ch).width > maxPx && chunk) {
                out.push(chunk);
                chunk = ch;
              } else {
                chunk += ch;
              }
            }
            line = chunk;
          }
        }
      }
      if (line) out.push(line);
      else out.push('');
    }
    return out;
  };

  const drawTextBlock = (
    text: string,
    x: number,
    maxPx: number,
    font: string,
    color: string,
    lineHeight: number,
  ) => {
    const lines = wrapLines(text, maxPx, font);
    ctx.font = font;
    ctx.fillStyle = color;
    for (const ln of lines) {
      if (y + lineHeight > bottomLimit) {
        flushPage();
        ctx.font = font;
        ctx.fillStyle = color;
      }
      if (ln) ctx.fillText(ln, x, y);
      y += lineHeight;
    }
  };

  initPage();

  // Header Banner
  ctx.fillStyle = '#f5f3ff';
  ctx.fillRect(margin, y - 16, maxW, 180);
  ctx.strokeStyle = '#ddd6fe';
  ctx.lineWidth = 2;
  ctx.strokeRect(margin, y - 16, maxW, 180);

  y += 16;
  const headerHeading =
    opts.documentHeading ||
    (isOdia
      ? `ଟପିକ୍-ଭିତ୍ତିକ ଅଭ୍ୟାସ ପ୍ରଶ୍ନପତ୍ର (${opts.questions.length} ପ୍ରଶ୍ନ)`
      : isHindi
        ? `अभ्यास प्रश्न पत्र (${opts.questions.length} प्रश्न)`
        : `Topic-Wise Practice Question Paper (${opts.questions.length} Questions)`);
  drawTextBlock(headerHeading, margin + 22, maxW - 44, `bold 29px ${fontStack}`, '#3b0764', 38);

  const metaLine1 = isOdia
    ? `ବୋର୍ଡ: ${opts.boardName}   |   ଶ୍ରେଣୀ: ${opts.className}`
    : isHindi
      ? `बोर्ड / परीक्षा: ${opts.boardName}   |   कक्षा / पेपर: ${opts.className}`
      : `Board: ${opts.boardName}   |   Class: ${opts.className}`;
  drawTextBlock(metaLine1, margin + 22, maxW - 44, `bold 20px ${fontStack}`, '#1e293b', 30);

  const metaLine2 = isOdia
    ? `ବିଷୟ: ${opts.subjectName}   |   ଅଧ୍ୟାୟ: ${opts.chapterName}`
    : isHindi
      ? `विषय: ${opts.subjectName}   |   अध्याय: ${opts.chapterName}`
      : `Subject: ${opts.subjectName}   |   Chapter: ${opts.chapterName}`;
  drawTextBlock(metaLine2, margin + 22, maxW - 44, `normal 19px ${fontStack}`, '#334155', 28);

  const metaLine3 = isOdia
    ? `ଟପିକ୍ / ଅଂଶ: ${opts.topicName}   |   AI-ପ୍ରସ୍ତୁତ ଅଭ୍ୟାସ ପ୍ରଶ୍ନ`
    : isHindi
      ? `विषय-बिंदु / भाग: ${opts.topicName}   |   AI-जनित अभ्यास प्रश्न`
      : `Topic / Focus: ${opts.topicName}   |   AI-Generated Practice Questions`;
  drawTextBlock(metaLine3, margin + 22, maxW - 44, `bold 19px ${fontStack}`, '#5b21b6', 28);

  y += 32;

  // Questions Body
  opts.questions.forEach((q, idx) => {
    const qText = cleanPdfMathAndMarkdown(q.question);
    const estNeeded = 155;
    if (y + estNeeded > bottomLimit) {
      flushPage();
    }

    const subjBadge = q.subject && q.subject !== opts.subjectName ? ` [${q.subject}]` : '';
    drawTextBlock(
      `${idx + 1}.${subjBadge} ${qText}`,
      margin,
      maxW,
      `bold 22px ${fontStack}`,
      '#0f172a',
      32,
    );

    if (q.passage) {
      drawTextBlock(
        cleanPdfMathAndMarkdown(q.passage),
        margin + 20,
        maxW - 20,
        `italic 19px ${fontStack}`,
        '#334155',
        28,
      );
      y += 4;
    }

    if (q.questionType === 'Numerical') {
      const numLabel = isOdia
        ? 'ଉତ୍ତର: ____________ (ସଂଖ୍ୟାତ୍ମକ)'
        : isHindi
          ? 'उत्तर: ____________ (संख्यात्मक)'
          : 'Answer: ____________ (Numerical)';
      drawTextBlock(numLabel, margin + 28, maxW - 28, `normal 20px ${fontStack}`, '#334155', 30);
    } else {
      q.options.slice(0, 4).forEach((opt, oIdx) => {
        const optLabel = String.fromCharCode(65 + oIdx);
        drawTextBlock(
          `(${optLabel})  ${cleanPdfMathAndMarkdown(opt)}`,
          margin + 28,
          maxW - 28,
          `normal 20px ${fontStack}`,
          '#1e293b',
          30,
        );
      });
    }

    y += 18;
  });

  // Optional Answer Key at the end
  if (opts.includeAnswerKey) {
    flushPage();

    const akTitle = isOdia
      ? `ଉତ୍ତର ସୂଚୀ ଏବଂ ସବିଶେଷ ବ୍ୟାଖ୍ୟା — ${opts.topicName}`
      : isHindi
        ? `उत्तर कुंजी एवं व्याख्या — ${opts.topicName}`
        : `Answer Key & Explanations — ${opts.topicName}`;
    drawTextBlock(akTitle, margin, maxW, `bold 27px ${fontStack}`, '#065f46', 38);

    ctx.strokeStyle = '#a7f3d0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(margin, y - 6);
    ctx.lineTo(W - margin, y - 6);
    ctx.stroke();
    y += 18;

    opts.questions.forEach((q, idx) => {
      const ansFormatted = cleanPdfMathAndMarkdown(formatCorrectAnswerLabel(q));
      const explText = cleanPdfMathAndMarkdown(q.explanation || '');

      if (y + 90 > bottomLimit) {
        flushPage();
      }

      const ansLine = isOdia
        ? `${idx + 1}. ସଠିକ୍ ଉତ୍ତର: ${ansFormatted}`
        : isHindi
          ? `${idx + 1}. सही उत्तर: ${ansFormatted}`
          : `${idx + 1}. Correct Answer: ${ansFormatted}`;
      drawTextBlock(ansLine, margin, maxW, `bold 20px ${fontStack}`, '#047857', 29);

      if (explText) {
        const expLabel = isOdia ? 'ବ୍ୟାଖ୍ୟା:' : isHindi ? 'व्याख्या:' : 'Explanation:';
        drawTextBlock(
          `    ${expLabel} ${explText}`,
          margin,
          maxW,
          `normal 19px ${fontStack}`,
          '#334155',
          27,
        );
      }
      y += 10;
    });
  }

  // Final page flush
  drawFooter();
  if (pageNumber > 1) doc.addPage();
  doc.addImage(canvas.toDataURL('image/jpeg', 0.94), 'JPEG', 0, 0, pageWidthMm, pageHeightMm);

  const safeTopic = `${opts.subjectName}_${opts.topicName}_${opts.questions.length}Q_${opts.language}`
    .replace(/[^a-zA-Z0-9\u0900-\u097F\u0B00-\u0B7F_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 72) || 'Topic_Practice_Questions';
  doc.save(`${safeTopic}.pdf`);
}

// ===================== CBSE HINDI OFFICIAL PDF GENERATORS =====================

interface CanvasPdfHelpers {
  ctx: CanvasRenderingContext2D;
  W: number;
  H: number;
  margin: number;
  maxW: number;
  bottomLimit: number;
  getY: () => number;
  setY: (nextY: number) => void;
  ensureSpace: (neededPx: number) => void;
  flushPage: () => void;
  drawTextBlock: (
    text: string,
    x: number,
    maxPx: number,
    font: string,
    color: string,
    lineHeight: number,
  ) => void;
  drawRightText: (text: string, rightX: number, font: string, color: string, atY: number) => void;
  wrapLines: (text: string, maxPx: number, font: string) => string[];
  savePdf: (filename: string) => void;
}

function createCbseHindiCanvasPdf(
  footerLabel: string,
  pageWord = 'पृष्ठ',
): CanvasPdfHelpers | null {
  if (typeof document === 'undefined') return null;

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidthMm = doc.internal.pageSize.getWidth();
  const pageHeightMm = doc.internal.pageSize.getHeight();
  const W = 1240;
  const H = 1754;
  const margin = 76;
  const maxW = W - margin * 2;
  const bottomLimit = H - 86;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  let pageNumber = 1;
  let y = margin;

  const drawFooter = () => {
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(margin, H - 62);
    ctx.lineTo(W - margin, H - 62);
    ctx.stroke();

    ctx.font = `normal 16px ${UNICODE_FONT_STACK}`;
    ctx.fillStyle = '#64748b';
    ctx.fillText(footerLabel, margin, H - 36);
    const pTxt = `${pageWord} ${pageNumber}`;
    const pW = ctx.measureText(pTxt).width;
    ctx.fillText(pTxt, W - margin - pW, H - 36);
  };

  const initPage = () => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    y = margin;
  };

  const flushPage = () => {
    drawFooter();
    if (pageNumber > 1) doc.addPage();
    doc.addImage(canvas.toDataURL('image/jpeg', 0.94), 'JPEG', 0, 0, pageWidthMm, pageHeightMm);
    pageNumber++;
    initPage();
  };

  const ensureSpace = (neededPx: number) => {
    if (y + neededPx > bottomLimit) {
      flushPage();
    }
  };

  const wrapLines = (text: string, maxPx: number, font: string): string[] => {
    ctx.font = font;
    const out: string[] = [];
    for (const para of (text || '').split('\n')) {
      const words = para.split(/\s+/);
      let line = '';
      for (const word of words) {
        if (!word) continue;
        const candidate = line ? `${line} ${word}` : word;
        if (ctx.measureText(candidate).width <= maxPx) {
          line = candidate;
        } else {
          if (line) out.push(line);
          if (ctx.measureText(word).width <= maxPx) {
            line = word;
          } else {
            let chunk = '';
            for (const ch of Array.from(word)) {
              if (ctx.measureText(chunk + ch).width > maxPx && chunk) {
                out.push(chunk);
                chunk = ch;
              } else {
                chunk += ch;
              }
            }
            line = chunk;
          }
        }
      }
      if (line) out.push(line);
      else out.push('');
    }
    return out;
  };

  const drawTextBlock = (
    text: string,
    x: number,
    maxPx: number,
    font: string,
    color: string,
    lineHeight: number,
  ) => {
    const lines = wrapLines(text, maxPx, font);
    ctx.font = font;
    ctx.fillStyle = color;
    for (const ln of lines) {
      if (y + lineHeight > bottomLimit) {
        flushPage();
        ctx.font = font;
        ctx.fillStyle = color;
      }
      if (ln) ctx.fillText(ln, x, y);
      y += lineHeight;
    }
  };

  const drawRightText = (text: string, rightX: number, font: string, color: string, atY: number) => {
    ctx.font = font;
    ctx.fillStyle = color;
    const w = ctx.measureText(text).width;
    ctx.fillText(text, rightX - w, atY);
  };

  initPage();

  return {
    ctx,
    W,
    H,
    margin,
    maxW,
    bottomLimit,
    getY: () => y,
    setY: (nextY: number) => {
      y = nextY;
    },
    ensureSpace,
    flushPage,
    drawTextBlock,
    drawRightText,
    wrapLines,
    savePdf: (filename: string) => {
      drawFooter();
      if (pageNumber > 1) doc.addPage();
      doc.addImage(canvas.toDataURL('image/jpeg', 0.94), 'JPEG', 0, 0, pageWidthMm, pageHeightMm);
      const cleanName =
        filename
          .replace(/[^a-zA-Z0-9\u0900-\u097F\u0B00-\u0B7F_-]+/g, '_')
          .replace(/^_+|_+$/g, '')
          .slice(0, 80) || 'PadhloAI_Document';
      doc.save(`${cleanName}.pdf`);
    },
  };
}

function drawCbseHindiBanner(
  h: CanvasPdfHelpers,
  paper: CbseHindiQuestionPaper,
  docKindLabel: string,
  bannerBg: string,
  bannerBorder: string,
  accentText: string,
) {
  const { ctx, margin, maxW } = h;
  const startY = h.getY() - 12;
  ctx.fillStyle = bannerBg;
  ctx.fillRect(margin, startY, maxW, 184);
  ctx.strokeStyle = bannerBorder;
  ctx.lineWidth = 2;
  ctx.strokeRect(margin, startY, maxW, 184);

  h.setY(startY + 34);
  h.drawTextBlock(
    `केंद्रीय माध्यमिक शिक्षा बोर्ड (CBSE) — ${docKindLabel}`,
    margin + 22,
    maxW - 44,
    `bold 27px ${UNICODE_FONT_STACK}`,
    accentText,
    36,
  );
  h.drawTextBlock(
    `${paper.title}`,
    margin + 22,
    maxW - 44,
    `bold 21px ${UNICODE_FONT_STACK}`,
    '#0f172a',
    30,
  );
  h.drawTextBlock(
    `कक्षा: ${paper.classLevel === '10' ? 'दसवीं (Class 10)' : 'बारहवीं (Class 12)'}  |  विषय: ${paper.courseLabel} (कोड: ${paper.courseCode})  |  सत्र: ${paper.academicSession}`,
    margin + 22,
    maxW - 44,
    `normal 19px ${UNICODE_FONT_STACK}`,
    '#334155',
    28,
  );
  h.drawTextBlock(
    `निर्धारित पुस्तकें: ${paper.prescribedBooks.join(', ')}`,
    margin + 22,
    maxW - 44,
    `normal 18px ${UNICODE_FONT_STACK}`,
    '#475569',
    26,
  );
  h.drawTextBlock(
    `अधिकतम अंक: ${paper.totalMarks} अंक   |   समय: ${paper.durationLabel}   |   प्रारूप: ${paper.paperFormat}`,
    margin + 22,
    maxW - 44,
    `bold 19px ${UNICODE_FONT_STACK}`,
    accentText,
    28,
  );

  h.setY(startY + 206);
}

const HINDI_OPT_LABELS = ['क', 'ख', 'ग', 'घ'];

export async function exportCbseHindiQuestionPaperPdf(
  paper: CbseHindiQuestionPaper,
): Promise<void> {
  await ensureUnicodeFontsLoaded();
  const h = createCbseHindiCanvasPdf(
    `CBSE ${paper.classLevel} ${paper.courseLabel} (कोड ${paper.courseCode}) · सत्र ${paper.academicSession} · अभ्यास प्रश्न पत्र`,
  );
  if (!h) return;

  drawCbseHindiBanner(
    h,
    paper,
    'अभ्यास प्रश्न पत्र (Question Paper)',
    '#fff7ed',
    '#fed7aa',
    '#9a3412',
  );

  // General Instructions
  if (paper.generalInstructions.length > 0) {
    h.drawTextBlock(
      'सामान्य निर्देश (General Instructions):',
      h.margin,
      h.maxW,
      `bold 20px ${UNICODE_FONT_STACK}`,
      '#0f172a',
      28,
    );
    for (const inst of paper.generalInstructions) {
      h.drawTextBlock(
        `• ${cleanPdfMathAndMarkdown(inst)}`,
        h.margin + 14,
        h.maxW - 14,
        `normal 18px ${UNICODE_FONT_STACK}`,
        '#334155',
        26,
      );
    }
    h.setY(h.getY() + 14);
  }

  let currentSection = '';
  for (const q of paper.questions) {
    if (q.sectionName && q.sectionName !== currentSection) {
      currentSection = q.sectionName;
      h.ensureSpace(70);
      const secY = h.getY();
      h.ctx.fillStyle = '#f1f5f9';
      h.ctx.fillRect(h.margin, secY - 22, h.maxW, 38);
      h.drawTextBlock(
        currentSection,
        h.margin + 14,
        h.maxW - 28,
        `bold 21px ${UNICODE_FONT_STACK}`,
        '#1e293b',
        34,
      );
      h.setY(h.getY() + 8);
    }

    h.ensureSpace(120);

    if (q.passageOrExtract && q.passageOrExtract.trim()) {
      const passageFont = `normal 19px ${UNICODE_FONT_STACK}`;
      const pLines = h.wrapLines(cleanPdfMathAndMarkdown(q.passageOrExtract), h.maxW - 36, passageFont);
      const boxH = pLines.length * 27 + 26;
      h.ensureSpace(boxH + 40);
      const boxTop = h.getY() - 18;
      h.ctx.fillStyle = '#f8fafc';
      h.ctx.fillRect(h.margin, boxTop, h.maxW, boxH);
      h.ctx.strokeStyle = '#cbd5e1';
      h.ctx.lineWidth = 1.5;
      h.ctx.strokeRect(h.margin, boxTop, h.maxW, boxH);
      h.setY(boxTop + 26);
      h.drawTextBlock(
        cleanPdfMathAndMarkdown(q.passageOrExtract),
        h.margin + 18,
        h.maxW - 36,
        passageFont,
        '#1e293b',
        27,
      );
      h.setY(h.getY() + 10);
    }

    const marksText = `[${q.marks} ${q.marks === 1 ? 'अंक' : 'अंक'}${q.wordLimit ? ` · ${q.wordLimit}` : ''}]`;
    h.drawRightText(marksText, h.W - h.margin, `bold 18px ${UNICODE_FONT_STACK}`, '#475569', h.getY());
    h.drawTextBlock(
      `प्र. ${q.questionNumber}. ${cleanPdfMathAndMarkdown(q.questionText)}`,
      h.margin,
      h.maxW - 180,
      `bold 20px ${UNICODE_FONT_STACK}`,
      '#0f172a',
      29,
    );

    if (q.orOptionText && q.orOptionText.trim()) {
      h.drawTextBlock(
        `अथवा (OR): ${cleanPdfMathAndMarkdown(q.orOptionText)}`,
        h.margin + 24,
        h.maxW - 24,
        `italic 19px ${UNICODE_FONT_STACK}`,
        '#334155',
        27,
      );
    }

    if (q.options && q.options.length > 0) {
      q.options.forEach((opt, idx) => {
        const lbl = HINDI_OPT_LABELS[idx] || String.fromCharCode(65 + idx);
        h.drawTextBlock(
          `(${lbl}) ${cleanPdfMathAndMarkdown(opt)}`,
          h.margin + 28,
          h.maxW - 28,
          `normal 19px ${UNICODE_FONT_STACK}`,
          '#1e293b',
          27,
        );
      });
    }

    h.setY(h.getY() + 14);
  }

  h.savePdf(`CBSE_Class${paper.classLevel}_Hindi_${paper.courseCode}_Question_Paper`);
}

export async function exportCbseHindiAnswerKeyPdf(
  paper: CbseHindiQuestionPaper,
): Promise<void> {
  await ensureUnicodeFontsLoaded();
  const h = createCbseHindiCanvasPdf(
    `CBSE ${paper.classLevel} ${paper.courseLabel} (कोड ${paper.courseCode}) · उत्तर कुंजी एवं अंक-योजना`,
  );
  if (!h) return;

  drawCbseHindiBanner(
    h,
    paper,
    'उत्तर कुंजी एवं अंक-योजना (Answer Key & Marking Scheme)',
    '#ecfdf5',
    '#a7f3d0',
    '#065f46',
  );

  for (const q of paper.questions) {
    h.ensureSpace(120);
    h.drawRightText(
      `[${q.marks} अंक]`,
      h.W - h.margin,
      `bold 18px ${UNICODE_FONT_STACK}`,
      '#047857',
      h.getY(),
    );
    h.drawTextBlock(
      `प्र. ${q.questionNumber} (${q.questionCategory}): ${cleanPdfMathAndMarkdown(q.questionText)}`,
      h.margin,
      h.maxW - 110,
      `bold 20px ${UNICODE_FONT_STACK}`,
      '#0f172a',
      28,
    );

    h.drawTextBlock(
      `उत्तर: ${cleanPdfMathAndMarkdown(q.correctAnswer)}`,
      h.margin + 18,
      h.maxW - 18,
      `bold 19px ${UNICODE_FONT_STACK}`,
      '#047857',
      28,
    );

    if (q.markingSchemePoints && q.markingSchemePoints.length > 0) {
      h.drawTextBlock(
        'अंक-योजना / संकेत-बिंदु:',
        h.margin + 18,
        h.maxW - 18,
        `bold 18px ${UNICODE_FONT_STACK}`,
        '#1e293b',
        25,
      );
      for (const pt of q.markingSchemePoints) {
        h.drawTextBlock(
          `• ${cleanPdfMathAndMarkdown(pt)}`,
          h.margin + 34,
          h.maxW - 34,
          `normal 18px ${UNICODE_FONT_STACK}`,
          '#334155',
          25,
        );
      }
    }

    if (q.explanation) {
      h.drawTextBlock(
        `व्याख्या / मार्गदर्शन: ${cleanPdfMathAndMarkdown(q.explanation)}`,
        h.margin + 18,
        h.maxW - 18,
        `normal 18px ${UNICODE_FONT_STACK}`,
        '#475569',
        25,
      );
    }

    h.setY(h.getY() + 14);
  }

  h.savePdf(`CBSE_Class${paper.classLevel}_Hindi_${paper.courseCode}_Answer_Key`);
}

export async function exportCbseHindiWorksheetPdf(
  paper: CbseHindiQuestionPaper,
): Promise<void> {
  await ensureUnicodeFontsLoaded();
  const h = createCbseHindiCanvasPdf(
    `CBSE ${paper.classLevel} ${paper.courseLabel} · छात्र अभ्यास कार्यपत्रक (Student Worksheet)`,
  );
  if (!h) return;

  drawCbseHindiBanner(
    h,
    paper,
    'छात्र अभ्यास कार्यपत्रक (Practice Worksheet)',
    '#eff6ff',
    '#bfdbfe',
    '#1e40af',
  );

  // Student Details Strip
  const boxY = h.getY() - 8;
  h.ctx.strokeStyle = '#94a3b8';
  h.ctx.lineWidth = 1.5;
  h.ctx.strokeRect(h.margin, boxY, h.maxW, 56);
  h.setY(boxY + 35);
  h.drawTextBlock(
    'छात्र/छात्रा का नाम: _____________________________    अनुक्रमांक: ____________    दिनांक: ____________',
    h.margin + 18,
    h.maxW - 36,
    `bold 18px ${UNICODE_FONT_STACK}`,
    '#1e293b',
    26,
  );
  h.setY(boxY + 76);

  for (const q of paper.questions) {
    h.ensureSpace(140);

    if (q.passageOrExtract && q.passageOrExtract.trim()) {
      h.drawTextBlock(
        `पठनीय अंश: ${cleanPdfMathAndMarkdown(q.passageOrExtract)}`,
        h.margin + 12,
        h.maxW - 24,
        `italic 18px ${UNICODE_FONT_STACK}`,
        '#334155',
        25,
      );
      h.setY(h.getY() + 4);
    }

    h.drawRightText(
      `[${q.marks} अंक]`,
      h.W - h.margin,
      `bold 18px ${UNICODE_FONT_STACK}`,
      '#1e40af',
      h.getY(),
    );
    h.drawTextBlock(
      `प्र. ${q.questionNumber}. ${cleanPdfMathAndMarkdown(q.questionText)}`,
      h.margin,
      h.maxW - 110,
      `bold 20px ${UNICODE_FONT_STACK}`,
      '#0f172a',
      28,
    );

    if (q.orOptionText && q.orOptionText.trim()) {
      h.drawTextBlock(
        `अथवा: ${cleanPdfMathAndMarkdown(q.orOptionText)}`,
        h.margin + 24,
        h.maxW - 24,
        `italic 18px ${UNICODE_FONT_STACK}`,
        '#475569',
        25,
      );
    }

    if (q.options && q.options.length > 0) {
      q.options.forEach((opt, idx) => {
        const lbl = HINDI_OPT_LABELS[idx] || String.fromCharCode(65 + idx);
        h.drawTextBlock(
          `◯ (${lbl}) ${cleanPdfMathAndMarkdown(opt)}`,
          h.margin + 28,
          h.maxW - 28,
          `normal 19px ${UNICODE_FONT_STACK}`,
          '#1e293b',
          26,
        );
      });
      h.setY(h.getY() + 10);
    } else {
      // Draw clean ruled writing lines for subjective / writing practice
      const lineCount = q.marks >= 5 ? 6 : q.marks >= 3 ? 4 : 2;
      for (let l = 0; l < lineCount; l++) {
        h.ensureSpace(34);
        const ly = h.getY() + 14;
        h.ctx.strokeStyle = '#cbd5e1';
        h.ctx.lineWidth = 1.2;
        h.ctx.beginPath();
        h.ctx.moveTo(h.margin + 24, ly);
        h.ctx.lineTo(h.W - h.margin, ly);
        h.ctx.stroke();
        h.setY(ly + 14);
      }
      h.setY(h.getY() + 12);
    }
  }

  h.savePdf(`CBSE_Class${paper.classLevel}_Hindi_${paper.courseCode}_Practice_Worksheet`);
}

// ===================== ADVANCED QUESTION PAPER GENERATOR PDF EXPORTS =====================

function drawExamPaperHeaderBanner(
  h: CanvasPdfHelpers,
  paper: GeneratedExamPaper,
  docKind: 'paper-only' | 'answer-key' | 'complete',
) {
  const { ctx, margin, maxW } = h;
  const isHi = paper.language === 'hindi';
  const isOr = paper.language === 'odia';

  const bg = docKind === 'answer-key' ? '#ecfdf5' : '#f5f3ff';
  const border = docKind === 'answer-key' ? '#a7f3d0' : '#ddd6fe';
  const accent = docKind === 'answer-key' ? '#065f46' : '#4c1d95';

  const kindLabel =
    docKind === 'answer-key'
      ? isHi
        ? 'उत्तर कुंजी एवं व्याख्या (Answer Key & Solutions)'
        : isOr
          ? 'ଉତ୍ତର ସୂଚୀ ଏବଂ ବ୍ୟାଖ୍ୟା (Answer Key & Solutions)'
          : 'OFFICIAL ANSWER KEY & EXPLANATIONS'
      : docKind === 'complete'
        ? isHi
          ? 'संपूर्ण प्रश्न पत्र एवं उत्तर कुंजी (Complete Paper & Solutions)'
          : isOr
            ? 'ସମ୍ପୂର୍ଣ୍ଣ ପ୍ରଶ୍ନପତ୍ର ଏବଂ ଉତ୍ତର ସୂଚୀ (Complete Paper & Solutions)'
            : 'COMPLETE QUESTION PAPER WITH ANSWER KEY & SOLUTIONS'
        : isHi
          ? 'अभ्यास प्रश्न पत्र (Examination Question Paper)'
          : isOr
            ? 'ଅଭ୍ୟାସ ପ୍ରଶ୍ନପତ୍ର (Examination Question Paper)'
            : 'EXAMINATION PRACTICE QUESTION PAPER';

  const startY = h.getY() - 12;
  ctx.fillStyle = bg;
  ctx.fillRect(margin, startY, maxW, 198);
  ctx.strokeStyle = border;
  ctx.lineWidth = 2;
  ctx.strokeRect(margin, startY, maxW, 198);

  h.setY(startY + 34);
  h.drawTextBlock(kindLabel, margin + 22, maxW - 44, `bold 25px ${UNICODE_FONT_STACK}`, accent, 34);
  h.drawTextBlock(
    `${paper.examName} — ${paper.title}`,
    margin + 22,
    maxW - 44,
    `bold 21px ${UNICODE_FONT_STACK}`,
    '#0f172a',
    30,
  );
  h.drawTextBlock(
    `${isHi ? 'कक्षा/पेपर' : isOr ? 'ଶ୍ରେଣୀ/ପେପର' : 'Class/Paper'}: ${paper.classLabel}   |   ${isHi ? 'विषय' : isOr ? 'ବିଷୟ' : 'Subject'}: ${paper.subject}`,
    margin + 22,
    maxW - 44,
    `normal 19px ${UNICODE_FONT_STACK}`,
    '#334155',
    28,
  );
  h.drawTextBlock(
    `${isHi ? 'अध्याय' : isOr ? 'ଅଧ୍ୟାୟ' : 'Chapter'}: ${paper.chapter}${paper.topic && paper.topic !== 'All Chapter Topics' ? `   |   ${isHi ? 'टॉपिक' : isOr ? 'ଟପିକ୍' : 'Topic'}: ${paper.topic}` : ''}`,
    margin + 22,
    maxW - 44,
    `normal 18px ${UNICODE_FONT_STACK}`,
    '#475569',
    26,
  );
  h.drawTextBlock(
    `${isHi ? 'समय' : isOr ? 'ସମୟ' : 'Time Duration'}: ${paper.durationMinutes} min   |   ${isHi ? 'कुल प्रश्न' : isOr ? 'ମୋଟ ପ୍ରଶ୍ନ' : 'Total Questions'}: ${paper.totalQuestions}   |   ${isHi ? 'कुल अंक' : isOr ? 'ମୋଟ ନମ୍ବର' : 'Total Marks'}: ${paper.totalMarks}   |   ${paper.difficulty}`,
    margin + 22,
    maxW - 44,
    `bold 19px ${UNICODE_FONT_STACK}`,
    accent,
    28,
  );

  h.setY(startY + 220);
}

function drawExamPaperQuestionItem(
  h: CanvasPdfHelpers,
  q: GeneratedExamQuestion,
  lang: GeneratedExamPaper['language'],
) {
  const isHi = lang === 'hindi';
  const isOr = lang === 'odia';

  h.ensureSpace(125);

  if (q.passageOrCase && q.passageOrCase.trim()) {
    const pFont = `normal 19px ${UNICODE_FONT_STACK}`;
    const pText = cleanPdfMathAndMarkdown(q.passageOrCase);
    const pLines = h.wrapLines(pText, h.maxW - 36, pFont);
    const boxH = pLines.length * 26 + 24;
    h.ensureSpace(boxH + 40);
    const boxTop = h.getY() - 16;
    h.ctx.fillStyle = '#f8fafc';
    h.ctx.fillRect(h.margin, boxTop, h.maxW, boxH);
    h.ctx.strokeStyle = '#cbd5e1';
    h.ctx.lineWidth = 1.5;
    h.ctx.strokeRect(h.margin, boxTop, h.maxW, boxH);
    h.setY(boxTop + 24);
    h.drawTextBlock(pText, h.margin + 18, h.maxW - 36, pFont, '#1e293b', 26);
    h.setY(h.getY() + 10);
  }

  if (q.diagramDescription && q.diagramDescription.trim()) {
    const dFont = `italic 18px ${UNICODE_FONT_STACK}`;
    const dTitle = isHi ? '[आरेख / चित्र विवरण]:' : isOr ? '[ଚିତ୍ର ବିବରଣୀ]:' : '[Diagram / Figure Description]:';
    const dLabel = `${dTitle} ${cleanPdfMathAndMarkdown(q.diagramDescription)}`;
    const dLines = h.wrapLines(dLabel, h.maxW - 36, dFont);
    const boxH = dLines.length * 25 + 22;
    h.ensureSpace(boxH + 34);
    const boxTop = h.getY() - 16;
    h.ctx.fillStyle = '#eff6ff';
    h.ctx.fillRect(h.margin, boxTop, h.maxW, boxH);
    h.ctx.strokeStyle = '#93c5fd';
    h.ctx.lineWidth = 1.5;
    h.ctx.strokeRect(h.margin, boxTop, h.maxW, boxH);
    h.setY(boxTop + 22);
    h.drawTextBlock(dLabel, h.margin + 18, h.maxW - 36, dFont, '#1e3a8a', 25);
    h.setY(h.getY() + 10);
  }

  const markWord = isHi ? 'अंक' : isOr ? 'ନମ୍ବର' : q.marks === 1 ? 'Mark' : 'Marks';
  const marksText = `[${q.marks} ${markWord}${q.wordLimit ? ` · ${q.wordLimit}` : ''}]`;
  h.drawRightText(marksText, h.W - h.margin, `bold 18px ${UNICODE_FONT_STACK}`, '#475569', h.getY());

  const qPrefix = isHi ? `प्र. ${q.number}.` : isOr ? `ପ୍ର. ${q.number}.` : `Q${q.number}.`;
  h.drawTextBlock(
    `${qPrefix} ${cleanPdfMathAndMarkdown(q.question)}`,
    h.margin,
    h.maxW - 190,
    `bold 20px ${UNICODE_FONT_STACK}`,
    '#0f172a',
    29,
  );

  if (q.assertionText || q.reasonText) {
    if (q.assertionText) {
      h.drawTextBlock(
        `${isHi ? 'कथन (A)' : 'Assertion (A)'}: ${cleanPdfMathAndMarkdown(q.assertionText)}`,
        h.margin + 24,
        h.maxW - 24,
        `normal 19px ${UNICODE_FONT_STACK}`,
        '#1e293b',
        27,
      );
    }
    if (q.reasonText) {
      h.drawTextBlock(
        `${isHi ? 'कारण (R)' : 'Reason (R)'}: ${cleanPdfMathAndMarkdown(q.reasonText)}`,
        h.margin + 24,
        h.maxW - 24,
        `normal 19px ${UNICODE_FONT_STACK}`,
        '#1e293b',
        27,
      );
    }
  }

  if (q.matchColumns && (q.matchColumns.columnA.length > 0 || q.matchColumns.columnB.length > 0)) {
    const colA = q.matchColumns.columnA || [];
    const colB = q.matchColumns.columnB || [];
    const rows = Math.max(colA.length, colB.length);
    h.drawTextBlock(
      isHi ? 'स्तंभ क  <--->  स्तंभ ख' : 'Column A  <--->  Column B',
      h.margin + 24,
      h.maxW - 24,
      `bold 18px ${UNICODE_FONT_STACK}`,
      '#334155',
      25,
    );
    for (let r = 0; r < rows; r++) {
      const left = colA[r] ? `${r + 1}. ${cleanPdfMathAndMarkdown(colA[r])}` : '';
      const right = colB[r] ? `(${String.fromCharCode(65 + r)}) ${cleanPdfMathAndMarkdown(colB[r])}` : '';
      h.drawTextBlock(
        `   ${left}     |     ${right}`,
        h.margin + 24,
        h.maxW - 24,
        `normal 18px ${UNICODE_FONT_STACK}`,
        '#1e293b',
        25,
      );
    }
  }

  if (q.sequenceItems && q.sequenceItems.length > 0) {
    h.drawTextBlock(
      `${isHi ? 'क्रमबद्ध करने हेतु पद' : 'Items to Arrange'}: ${q.sequenceItems.map((it, idx) => `(${idx + 1}) ${cleanPdfMathAndMarkdown(it)}`).join('   |   ')}`,
      h.margin + 24,
      h.maxW - 24,
      `normal 18px ${UNICODE_FONT_STACK}`,
      '#1e293b',
      26,
    );
  }

  if (q.options && q.options.length > 0) {
    q.options.forEach((opt, idx) => {
      const lbl = String.fromCharCode(65 + idx);
      h.drawTextBlock(
        `(${lbl}) ${cleanPdfMathAndMarkdown(opt)}`,
        h.margin + 28,
        h.maxW - 28,
        `normal 19px ${UNICODE_FONT_STACK}`,
        '#1e293b',
        27,
      );
    });
  }

  h.setY(h.getY() + 12);
}

export async function exportExamPaperPdf(
  paper: GeneratedExamPaper,
  mode: 'paper-only' | 'answer-key' | 'complete',
): Promise<void> {
  await ensureUnicodeFontsLoaded();
  const pageWord =
    paper.language === 'hindi' ? 'पृष्ठ' : paper.language === 'odia' ? 'ପୃଷ୍ଠା' : 'Page';
  const footer = `PadhloAI · ${paper.examName} · ${paper.subject} · AI-Generated Practice Paper`;
  const h = createCbseHindiCanvasPdf(footer, pageWord);
  if (!h) return;

  drawExamPaperHeaderBanner(h, paper, mode);

  const isHi = paper.language === 'hindi';
  const isOr = paper.language === 'odia';

  if (mode !== 'answer-key') {
    if (paper.instructions.length > 0) {
      h.drawTextBlock(
        isHi
          ? 'सामान्य निर्देश (General Instructions):'
          : isOr
            ? 'ସାଧାରଣ ନିର୍ଦ୍ଦେଶାବଳୀ (General Instructions):'
            : 'General Instructions:',
        h.margin,
        h.maxW,
        `bold 20px ${UNICODE_FONT_STACK}`,
        '#0f172a',
        28,
      );
      for (const inst of paper.instructions) {
        h.drawTextBlock(
          `• ${cleanPdfMathAndMarkdown(inst)}`,
          h.margin + 14,
          h.maxW - 14,
          `normal 18px ${UNICODE_FONT_STACK}`,
          '#334155',
          26,
        );
      }
      h.setY(h.getY() + 14);
    }

    for (const sec of paper.sections) {
      h.ensureSpace(78);
      const secY = h.getY();
      h.ctx.fillStyle = '#f1f5f9';
      h.ctx.fillRect(h.margin, secY - 22, h.maxW, 38);
      h.drawTextBlock(
        `${sec.sectionTitle} (${sec.questions.length} Qs × ${sec.marksPerQuestion} = ${sec.totalSectionMarks} Marks)`,
        h.margin + 14,
        h.maxW - 28,
        `bold 20px ${UNICODE_FONT_STACK}`,
        '#1e293b',
        34,
      );
      h.setY(h.getY() + 8);

      for (const q of sec.questions) {
        drawExamPaperQuestionItem(h, q, paper.language);
      }
    }
  }

  if (mode === 'answer-key' || mode === 'complete') {
    if (mode === 'complete') {
      h.flushPage();
    }

    h.drawTextBlock(
      isHi
        ? 'उत्तर कुंजी, मुख्य बिंदु एवं विस्तृत व्याख्या (Answer Key & Solutions)'
        : isOr
          ? 'ଉତ୍ତର ସୂଚୀ, ମୁଖ୍ୟ ବିନ୍ଦୁ ଏବଂ ବ୍ୟାଖ୍ୟା (Answer Key & Solutions)'
          : 'Answer Key, Key Points & Detailed Explanations',
      h.margin,
      h.maxW,
      `bold 24px ${UNICODE_FONT_STACK}`,
      '#065f46',
      34,
    );
    h.setY(h.getY() + 10);

    for (const sec of paper.sections) {
      h.ensureSpace(70);
      h.drawTextBlock(
        sec.sectionTitle,
        h.margin,
        h.maxW,
        `bold 20px ${UNICODE_FONT_STACK}`,
        '#1e293b',
        30,
      );

      for (const q of sec.questions) {
        h.ensureSpace(115);
        h.drawRightText(
          `[${q.marks} ${isHi ? 'अंक' : isOr ? 'ନମ୍ବର' : 'Marks'}]`,
          h.W - h.margin,
          `bold 18px ${UNICODE_FONT_STACK}`,
          '#047857',
          h.getY(),
        );
        h.drawTextBlock(
          `Q${q.number} (${q.typeLabel}): ${cleanPdfMathAndMarkdown(q.question)}`,
          h.margin,
          h.maxW - 120,
          `bold 19px ${UNICODE_FONT_STACK}`,
          '#0f172a',
          27,
        );

        const msqLabels =
          q.typeId === 'Multiple-Select' && q.correctOptionIndices && q.correctOptionIndices.length > 0
            ? ` [Options: ${q.correctOptionIndices.map((i) => String.fromCharCode(65 + i)).join(', ')}]`
            : '';

        h.drawTextBlock(
          `${isHi ? 'उत्तर' : isOr ? 'ଉତ୍ତର' : 'Answer'}${msqLabels}: ${cleanPdfMathAndMarkdown(q.correctAnswer)}`,
          h.margin + 18,
          h.maxW - 18,
          `bold 19px ${UNICODE_FONT_STACK}`,
          '#047857',
          27,
        );

        if (q.keyPoints && q.keyPoints.length > 0) {
          h.drawTextBlock(
            isHi ? 'मुख्य बिंदु (Key Points / Rubric):' : isOr ? 'ମୁଖ୍ୟ ବିନ୍ଦୁ (Key Points):' : 'Key Points / Marking Value Points (other valid phrasings accepted):',
            h.margin + 18,
            h.maxW - 18,
            `bold 18px ${UNICODE_FONT_STACK}`,
            '#1e293b',
            25,
          );
          for (const kp of q.keyPoints) {
            h.drawTextBlock(
              `• ${cleanPdfMathAndMarkdown(kp)}`,
              h.margin + 32,
              h.maxW - 32,
              `normal 18px ${UNICODE_FONT_STACK}`,
              '#334155',
              25,
            );
          }
        }

        if (q.explanation) {
          h.drawTextBlock(
            `${isHi ? 'व्याख्या' : isOr ? 'ବ୍ୟାଖ୍ୟା' : 'Explanation'}: ${cleanPdfMathAndMarkdown(q.explanation)}`,
            h.margin + 18,
            h.maxW - 18,
            `normal 18px ${UNICODE_FONT_STACK}`,
            '#475569',
            25,
          );
        }
        h.setY(h.getY() + 12);
      }
    }
  }

  const suffix =
    mode === 'answer-key'
      ? 'Answer_Key'
      : mode === 'complete'
        ? 'Complete_Paper_With_Answers'
        : 'Question_Paper';
  h.savePdf(`${paper.examName}_${paper.subject}_${suffix}`);
}

// ===================== AI LESSON PLAN GENERATOR A4 PDF EXPORT =====================

export async function exportLessonPlanToPdf(plan: GeneratedLessonPlan): Promise<void> {
  await ensureUnicodeFontsLoaded();
  const L = LESSON_PLAN_UI_LABELS[plan.language] || LESSON_PLAN_UI_LABELS.english;
  const footer = `PadhloAI · ${plan.className} · ${plan.board} · ${plan.subject} · ${plan.durationMinutes} min`;
  const h = createCbseHindiCanvasPdf(footer, L.pageWord);
  if (!h) return;

  const { ctx, margin, maxW } = h;

  // 1. Header Banner (Indigo-Blue Educational Theme)
  const bannerTop = h.getY() - 10;
  ctx.fillStyle = '#eef2ff';
  ctx.fillRect(margin, bannerTop, maxW, 188);
  ctx.strokeStyle = '#c7d2fe';
  ctx.lineWidth = 2;
  ctx.strokeRect(margin, bannerTop, maxW, 188);

  // Indigo accent strip on left of banner
  ctx.fillStyle = '#4338ca';
  ctx.fillRect(margin, bannerTop, 10, 188);

  h.setY(bannerTop + 34);
  h.drawTextBlock(
    L.documentBadge,
    margin + 26,
    maxW - 48,
    `bold 19px ${UNICODE_FONT_STACK}`,
    '#4338ca',
    26,
  );
  h.drawTextBlock(
    cleanPdfMathAndMarkdown(plan.topic),
    margin + 26,
    maxW - 48,
    `bold 27px ${UNICODE_FONT_STACK}`,
    '#0f172a',
    35,
  );
  h.drawTextBlock(
    `${plan.className}  |  ${plan.board}${plan.academicSession ? ` (${plan.academicSession})` : ''}  |  ${plan.subject}`,
    margin + 26,
    maxW - 48,
    `bold 19px ${UNICODE_FONT_STACK}`,
    '#1e293b',
    28,
  );
  h.drawTextBlock(
    `${L.generalInfoFields.lessonPlanType}: ${plan.lessonPlanType}   |   ${L.totalDurationLabel}: ${plan.durationMinutes} min`,
    margin + 26,
    maxW - 48,
    `normal 18px ${UNICODE_FONT_STACK}`,
    '#2563eb',
    26,
  );
  h.setY(bannerTop + 208);

  // Syllabus Reference & Activities Notice
  const noteText = `${plan.syllabusReferenceSummary}\n${plan.additionalActivitiesDisclaimer}`;
  const noteFont = `normal 17px ${UNICODE_FONT_STACK}`;
  const noteLines = h.wrapLines(cleanPdfMathAndMarkdown(noteText), maxW - 32, noteFont);
  const noteBoxH = noteLines.length * 24 + 22;
  h.ensureSpace(noteBoxH + 16);
  const noteTop = h.getY() - 12;
  ctx.fillStyle = plan.syllabusUsed ? '#f0fdf4' : '#fffbeb';
  ctx.fillRect(margin, noteTop, maxW, noteBoxH);
  ctx.strokeStyle = plan.syllabusUsed ? '#bbf7d0' : '#fde68a';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(margin, noteTop, maxW, noteBoxH);
  h.setY(noteTop + 24);
  h.drawTextBlock(
    cleanPdfMathAndMarkdown(noteText),
    margin + 16,
    maxW - 32,
    noteFont,
    plan.syllabusUsed ? '#166534' : '#92400e',
    24,
  );
  h.setY(noteTop + noteBoxH + 18);

  const drawSectionHeading = (title: string) => {
    h.ensureSpace(64);
    const barTop = h.getY() - 20;
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(margin, barTop, maxW, 38);
    ctx.fillStyle = '#4338ca';
    ctx.fillRect(margin, barTop, 6, 38);
    h.setY(barTop + 26);
    h.drawTextBlock(title, margin + 18, maxW - 28, `bold 20px ${UNICODE_FONT_STACK}`, '#0f172a', 30);
    h.setY(h.getY() + 6);
  };

  const drawBulletSection = (heading: string, items: string[]) => {
    drawSectionHeading(heading);
    const safeItems = items && items.length > 0 ? items : ['—'];
    for (const item of safeItems) {
      h.drawTextBlock(
        `•  ${cleanPdfMathAndMarkdown(item)}`,
        margin + 14,
        maxW - 18,
        `normal 18.5px ${UNICODE_FONT_STACK}`,
        '#1e293b',
        26,
      );
    }
    h.setY(h.getY() + 10);
  };

  const drawParagraphSection = (heading: string, text: string) => {
    drawSectionHeading(heading);
    h.drawTextBlock(
      cleanPdfMathAndMarkdown(text || '—'),
      margin + 10,
      maxW - 14,
      `normal 18.5px ${UNICODE_FONT_STACK}`,
      '#1e293b',
      27,
    );
    h.setY(h.getY() + 10);
  };

  // Section 1: General Information (2-Column Grid Box)
  drawSectionHeading(L.sections[0]);
  const g = plan.generalInformation;
  const infoPairs: Array<[string, string]> = [
    [L.generalInfoFields.classLabel, g.classLabel],
    [L.generalInfoFields.board, g.board],
    [L.generalInfoFields.subject, g.subject],
    [L.generalInfoFields.chapter, g.chapter || '—'],
    [L.generalInfoFields.topic, g.topic],
    [L.generalInfoFields.duration, g.durationLabel],
    [L.generalInfoFields.lessonPlanType, g.lessonPlanType],
    [L.generalInfoFields.targetAgeGroup, g.targetAgeGroup],
    [L.generalInfoFields.date, g.datePlaceholder],
    [L.generalInfoFields.teacherName, g.teacherNamePlaceholder],
    [L.generalInfoFields.schoolName, g.schoolNamePlaceholder],
    ...(g.academicSession ? [[L.generalInfoFields.academicSession, g.academicSession] as [string, string]] : []),
  ];

  const colW = (maxW - 16) / 2;
  for (let i = 0; i < infoPairs.length; i += 2) {
    const left = infoPairs[i];
    const right = infoPairs[i + 1];
    const rowFont = `normal 17.5px ${UNICODE_FONT_STACK}`;
    const leftText = `${left[0]}: ${cleanPdfMathAndMarkdown(left[1])}`;
    const rightText = right ? `${right[0]}: ${cleanPdfMathAndMarkdown(right[1])}` : '';
    const leftLines = h.wrapLines(leftText, colW - 20, rowFont);
    const rightLines = right ? h.wrapLines(rightText, colW - 20, rowFont) : [];
    const maxLines = Math.max(leftLines.length, rightLines.length, 1);
    const cellH = maxLines * 24 + 14;
    h.ensureSpace(cellH + 8);
    const rowY = h.getY() - 16;

    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.fillStyle = i % 4 === 0 ? '#f8fafc' : '#ffffff';
    ctx.fillRect(margin, rowY, colW, cellH);
    ctx.strokeRect(margin, rowY, colW, cellH);
    if (right) {
      ctx.fillRect(margin + colW + 16, rowY, colW, cellH);
      ctx.strokeRect(margin + colW + 16, rowY, colW, cellH);
    }

    let ly = rowY + 22;
    ctx.font = rowFont;
    ctx.fillStyle = '#0f172a';
    for (const ln of leftLines) {
      if (ln) ctx.fillText(ln, margin + 10, ly);
      ly += 24;
    }
    if (right) {
      let ry = rowY + 22;
      for (const ln of rightLines) {
        if (ln) ctx.fillText(ln, margin + colW + 26, ry);
        ry += 24;
      }
    }
    h.setY(rowY + cellH + 8);
  }
  h.setY(h.getY() + 10);

  // Sections 2–6
  drawBulletSection(L.sections[1], plan.generalObjectives);
  drawBulletSection(L.sections[2], plan.specificLearningObjectives);
  drawParagraphSection(L.sections[3], plan.previousKnowledge);
  drawBulletSection(L.sections[4], plan.teachingLearningMaterials);
  drawParagraphSection(L.sections[5], plan.introductionSetInduction);

  // Section 7: Introductory Questions and Expected Answers
  drawSectionHeading(L.sections[6]);
  plan.introductoryQuestions.forEach((iq, idx) => {
    h.ensureSpace(64);
    h.drawTextBlock(
      `${idx + 1}. ${L.questionWord}: ${cleanPdfMathAndMarkdown(iq.question)}`,
      margin + 12,
      maxW - 16,
      `bold 18.5px ${UNICODE_FONT_STACK}`,
      '#0f172a',
      26,
    );
    h.drawTextBlock(
      `   ${L.expectedAnswerWord}: ${cleanPdfMathAndMarkdown(iq.expectedAnswer)}`,
      margin + 20,
      maxW - 24,
      `normal 18px ${UNICODE_FONT_STACK}`,
      '#334155',
      25,
    );
    h.setY(h.getY() + 4);
  });
  h.setY(h.getY() + 10);

  // Section 8: Announcement of Topic
  drawParagraphSection(L.sections[7], plan.announcementOfTopic);

  // Section 9: Presentation of the Lesson + Structured 5-Column Presentation Table
  drawSectionHeading(L.sections[8]);
  if (plan.presentationOverview) {
    h.drawTextBlock(
      cleanPdfMathAndMarkdown(plan.presentationOverview),
      margin + 10,
      maxW - 14,
      `normal 18.5px ${UNICODE_FONT_STACK}`,
      '#1e293b',
      26,
    );
    h.setY(h.getY() + 10);
  }

  // 5 columns: Teaching Points | Teacher Activities | Student Activities | TLM | Evaluation Questions
  const colWidths = [
    Math.round(maxW * 0.21),
    Math.round(maxW * 0.25),
    Math.round(maxW * 0.22),
    Math.round(maxW * 0.14),
    maxW - (Math.round(maxW * 0.21) + Math.round(maxW * 0.25) + Math.round(maxW * 0.22) + Math.round(maxW * 0.14)),
  ];
  const headerTitles = [
    L.tableHeaders.teachingPoints,
    L.tableHeaders.teacherActivities,
    L.tableHeaders.studentActivities,
    L.tableHeaders.tlm,
    L.tableHeaders.evaluationQuestions,
  ];
  const thFont = `bold 16.5px ${UNICODE_FONT_STACK}`;
  const tdFont = `normal 16px ${UNICODE_FONT_STACK}`;
  const tdBoldFont = `bold 16px ${UNICODE_FONT_STACK}`;

  const drawPresentationTableHeader = () => {
    const headerWrapped = headerTitles.map((title, idx) => h.wrapLines(title, colWidths[idx] - 14, thFont));
    const maxHdrLines = Math.max(...headerWrapped.map((l) => l.length), 1);
    const hdrH = maxHdrLines * 22 + 16;
    h.ensureSpace(hdrH + 50);
    const topY = h.getY() - 12;

    let cx = margin;
    for (let c = 0; c < colWidths.length; c++) {
      ctx.fillStyle = '#4338ca';
      ctx.fillRect(cx, topY, colWidths[c], hdrH);
      ctx.strokeStyle = '#312e81';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(cx, topY, colWidths[c], hdrH);

      ctx.font = thFont;
      ctx.fillStyle = '#ffffff';
      let ty = topY + 22;
      for (const ln of headerWrapped[c]) {
        if (ln) ctx.fillText(ln, cx + 8, ty);
        ty += 22;
      }
      cx += colWidths[c];
    }
    h.setY(topY + hdrH);
  };

  drawPresentationTableHeader();

  for (let rIdx = 0; rIdx < plan.presentationTable.length; rIdx++) {
    const row = plan.presentationTable[rIdx];
    const stageLine = `[${cleanPdfMathAndMarkdown(row.stageName)} · ${row.minutes} min]`;
    const c0StageLines = h.wrapLines(stageLine, colWidths[0] - 14, tdBoldFont);
    const c0BodyLines = h.wrapLines(cleanPdfMathAndMarkdown(row.teachingPoints), colWidths[0] - 14, tdFont);
    const c1Lines = h.wrapLines(cleanPdfMathAndMarkdown(row.teacherActivities), colWidths[1] - 14, tdFont);
    const c2Lines = h.wrapLines(cleanPdfMathAndMarkdown(row.studentActivities), colWidths[2] - 14, tdFont);
    const c3Lines = h.wrapLines(cleanPdfMathAndMarkdown(row.tlm), colWidths[3] - 14, tdFont);
    const c4Lines = h.wrapLines(cleanPdfMathAndMarkdown(row.evaluationQuestions), colWidths[4] - 14, tdFont);

    const maxCellLines = Math.max(
      c0StageLines.length + c0BodyLines.length,
      c1Lines.length,
      c2Lines.length,
      c3Lines.length,
      c4Lines.length,
      1,
    );
    const rowH = maxCellLines * 22 + 18;

    if (h.getY() + rowH > h.bottomLimit) {
      h.flushPage();
      drawPresentationTableHeader();
    }

    const rowTop = h.getY();
    const bgColor = rIdx % 2 === 0 ? '#ffffff' : '#f8fafc';
    let cx = margin;

    const allCols = [
      { stage: c0StageLines, body: c0BodyLines },
      { stage: [] as string[], body: c1Lines },
      { stage: [] as string[], body: c2Lines },
      { stage: [] as string[], body: c3Lines },
      { stage: [] as string[], body: c4Lines },
    ];

    for (let c = 0; c < colWidths.length; c++) {
      ctx.fillStyle = bgColor;
      ctx.fillRect(cx, rowTop, colWidths[c], rowH);
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx, rowTop, colWidths[c], rowH);

      let ty = rowTop + 22;
      if (allCols[c].stage.length > 0) {
        ctx.font = tdBoldFont;
        ctx.fillStyle = '#4338ca';
        for (const ln of allCols[c].stage) {
          if (ln) ctx.fillText(ln, cx + 8, ty);
          ty += 22;
        }
      }
      ctx.font = tdFont;
      ctx.fillStyle = '#1e293b';
      for (const ln of allCols[c].body) {
        if (ln) ctx.fillText(ln, cx + 8, ty);
        ty += 22;
      }
      cx += colWidths[c];
    }
    h.setY(rowTop + rowH);
  }
  h.setY(h.getY() + 24);

  // Sections 10–18
  drawBulletSection(L.sections[9], plan.teacherActivities);
  drawBulletSection(L.sections[10], plan.studentActivities);
  drawBulletSection(L.sections[11], plan.teachingLearningMaterialsDetailed);
  drawBulletSection(L.sections[12], plan.blackboardWork);
  drawBulletSection(L.sections[13], plan.classroomActivities);
  drawBulletSection(L.sections[14], plan.groupActivities);
  drawBulletSection(L.sections[15], plan.individualActivities);
  drawParagraphSection(L.sections[16], plan.evaluationAssessment);
  drawBulletSection(L.sections[17], plan.oralQuestions);

  // Section 19: Short-Answer Questions
  drawSectionHeading(L.sections[18]);
  plan.shortAnswerQuestions.forEach((sq, idx) => {
    h.ensureSpace(64);
    h.drawTextBlock(
      `${idx + 1}. ${L.questionWord}: ${cleanPdfMathAndMarkdown(sq.question)}`,
      margin + 12,
      maxW - 16,
      `bold 18.5px ${UNICODE_FONT_STACK}`,
      '#0f172a',
      26,
    );
    h.drawTextBlock(
      `   ${L.expectedPointsWord}: ${cleanPdfMathAndMarkdown(sq.expectedAnswerPoints)}`,
      margin + 20,
      maxW - 24,
      `normal 18px ${UNICODE_FONT_STACK}`,
      '#334155',
      25,
    );
    h.setY(h.getY() + 4);
  });
  h.setY(h.getY() + 10);

  // Sections 20–23
  drawBulletSection(L.sections[19], plan.recapitulation);
  drawBulletSection(L.sections[20], plan.homeworkAssignment);
  drawBulletSection(L.sections[21], plan.expectedLearningOutcomes);
  drawBulletSection(L.sections[22], plan.teachersReflection);

  h.savePdf(`Lesson_Plan_${plan.className}_${plan.subject}_${plan.topic}`);
}




