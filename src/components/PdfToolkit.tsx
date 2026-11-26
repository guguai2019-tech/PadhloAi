import React, { useEffect, useRef, useState } from 'react';
import { PDFDocument, degrees } from 'pdf-lib';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  BookOpen,
  Check,
  Combine,
  Copy,
  Download,
  FileImage,
  FileOutput,
  FileText,
  Layers,
  Loader2,
  Minimize2,
  RotateCw,
  Scissors,
  Send,
  Trash2,
  Upload,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { AppSettings } from '../types';
import { extractPdfText, formatFileSize, pdfjsLib } from '../utils/fileProcessor';
import { generateAI } from '../utils/aiClient';
import { exportTextToPdf } from '../utils/pdfExport';
import { MarkdownRenderer } from './MarkdownRenderer';

type PdfTab =
  | 'reader'
  | 'to-text'
  | 'text-to-pdf'
  | 'merge'
  | 'split'
  | 'organize'
  | 'compress'
  | 'to-images'
  | 'images-to-pdf';

interface PdfToolkitProps {
  settings: AppSettings;
}

interface PageThumb {
  pageNumber: number;
  dataUrl: string;
  rotation: number;
  selected: boolean;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function parsePageRanges(rangeStr: string, maxPages: number): number[] {
  const result = new Set<number>();
  const parts = rangeStr
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  for (const part of parts) {
    if (part.includes('-')) {
      const [s, e] = part.split('-').map((n) => Number(n.trim()));
      if (!Number.isNaN(s) && !Number.isNaN(e)) {
        const start = Math.max(1, Math.min(s, e));
        const end = Math.min(maxPages, Math.max(s, e));
        for (let i = start; i <= end; i++) result.add(i);
      }
    } else {
      const n = Number(part);
      if (!Number.isNaN(n) && n >= 1 && n <= maxPages) result.add(n);
    }
  }
  return Array.from(result).sort((a, b) => a - b);
}

export const PdfToolkit: React.FC<PdfToolkitProps> = ({ settings }) => {
  const [activeTab, setActiveTab] = useState<PdfTab>('reader');

  // Shared primary PDF state (used in Reader, To Text, Split, Organize, Compress, To Images)
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [extractedPages, setExtractedPages] = useState<string[]>([]);
  const [extractedText, setExtractedText] = useState('');
  const [busyMsg, setBusyMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Reader canvas state
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1.2);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Reader AI panel state
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiOutput, setAiOutput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  // Text to PDF state
  const [docTitle, setDocTitle] = useState('Study Notes Document');
  const [docBody, setDocBody] = useState('');
  const [copiedText, setCopiedText] = useState(false);

  // Merge PDFs state
  const [mergeFiles, setMergeFiles] = useState<File[]>([]);

  // Split PDF state
  const [splitMode, setSplitMode] = useState<'range' | 'every' | 'all'>('range');
  const [pageRangeInput, setPageRangeInput] = useState('1-3');
  const [splitChunkSize, setSplitChunkSize] = useState(2);

  // Organize (Rotate / Reorder) state
  const [pageThumbs, setPageThumbs] = useState<PageThumb[]>([]);

  // Compress PDF state
  const [compressLevel, setCompressLevel] = useState<'balanced' | 'medium' | 'strong'>('medium');
  const [compressStats, setCompressStats] = useState<{
    original: number;
    compressed: number;
  } | null>(null);

  // PDF to Images state
  const [renderedImages, setRenderedImages] = useState<
    Array<{ page: number; dataUrl: string }>
  >([]);
  const [imageFormat, setImageFormat] = useState<'png' | 'jpeg'>('png');

  // Images to PDF state
  const [imgFiles, setImgFiles] = useState<Array<{ file: File; preview: string }>>([]);
  const [imgPageSize, setImgPageSize] = useState<'a4' | 'letter' | 'fit'>('a4');

  const loadPrimaryPdf = async (file: File) => {
    setErrorMsg(null);
    setBusyMsg('Loading PDF locally in browser...');
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      const { text, pageCount: count, pages } = await extractPdfText(buf.slice(0));
      setPdfFile(file);
      setPdfBytes(bytes);
      setPageCount(count);
      setExtractedPages(pages);
      setExtractedText(text);
      setCurrentPage(1);
      setPageRangeInput(count > 1 ? `1-${Math.min(3, count)}` : '1');
      setCompressStats(null);
      setRenderedImages([]);
      setPageThumbs([]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to parse PDF file.');
    } finally {
      setBusyMsg(null);
    }
  };

  // Render active page in Reader canvas
  useEffect(() => {
    if (activeTab !== 'reader' || !pdfBytes || !canvasRef.current) return;
    let cancelled = false;

    const renderPage = async () => {
      try {
        const doc = await pdfjsLib.getDocument({ data: pdfBytes.slice(0) }).promise;
        if (cancelled) return;
        const page = await doc.getPage(currentPage);
        const viewport = page.getViewport({ scale: zoom });
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      } catch {
        // Ignore render errors during rapid page switching
      }
    };

    void renderPage();
    return () => {
      cancelled = true;
    };
  }, [activeTab, pdfBytes, currentPage, zoom]);

  // Generate thumbnails when Organize tab opens
  useEffect(() => {
    if (activeTab !== 'organize' || !pdfBytes || pageThumbs.length > 0) return;
    let cancelled = false;

    const buildThumbs = async () => {
      setBusyMsg('Rendering page thumbnails...');
      try {
        const doc = await pdfjsLib.getDocument({ data: pdfBytes.slice(0) }).promise;
        const thumbs: PageThumb[] = [];
        const limit = Math.min(doc.numPages, 40);
        for (let i = 1; i <= limit; i++) {
          if (cancelled) return;
          const page = await doc.getPage(i);
          const viewport = page.getViewport({ scale: 0.35 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            await page.render({ canvasContext: ctx, viewport, canvas }).promise;
            thumbs.push({
              pageNumber: i,
              dataUrl: canvas.toDataURL('image/jpeg', 0.8),
              rotation: 0,
              selected: true,
            });
          }
        }
        if (!cancelled) setPageThumbs(thumbs);
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : 'Could not render page thumbnails.');
        }
      } finally {
        if (!cancelled) setBusyMsg(null);
      }
    };

    void buildThumbs();
    return () => {
      cancelled = true;
    };
  }, [activeTab, pdfBytes, pageThumbs.length]);

  const runPdfAiAction = async (mode: 'summary' | 'mcqs' | 'notes' | 'ask') => {
    if (!extractedText.trim()) {
      setErrorMsg('Upload a PDF with readable text first.');
      return;
    }
    if (mode === 'ask' && !aiQuestion.trim()) return;

    setAiLoading(true);
    setErrorMsg(null);
    const clippedText = extractedText.slice(0, 55000);
    const promptMap = {
      summary: `Provide a comprehensive, structured summary of the following PDF document including key concepts, definitions, and takeaways:\n\n${clippedText}`,
      mcqs: `Generate 10 high-quality multiple-choice questions (with 4 options A-D, correct answer, and brief explanation) strictly based on this PDF document:\n\n${clippedText}`,
      notes: `Create clean, exam-ready revision notes with headings, bullet points, formulas (in LaTeX), and key highlights from this PDF:\n\n${clippedText}`,
      ask: `Answer the user's question strictly using the PDF content below.\nQuestion: ${aiQuestion}\n\nPDF Content:\n${clippedText}`,
    };

    try {
      const res = await generateAI({
        provider: settings.provider,
        model: settings.model,
        language: settings.language,
        prompt: promptMap[mode],
      });
      setAiOutput(res.text);
      if (mode === 'ask') setAiQuestion('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'AI request failed.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleMergePdfs = async () => {
    if (mergeFiles.length < 2) {
      setErrorMsg('Select at least 2 PDF files to merge.');
      return;
    }
    setBusyMsg('Merging PDFs locally...');
    setErrorMsg(null);
    try {
      const merged = await PDFDocument.create();
      for (const file of mergeFiles) {
        const bytes = await file.arrayBuffer();
        const src = await PDFDocument.load(bytes);
        const copied = await merged.copyPages(src, src.getPageIndices());
        copied.forEach((p) => merged.addPage(p));
      }
      const outBytes = await merged.save();
      downloadBlob(
        new Blob([new Uint8Array(outBytes)], { type: 'application/pdf' }),
        'merged_padhloai.pdf',
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to merge PDFs.');
    } finally {
      setBusyMsg(null);
    }
  };

  const handleSplitPdf = async () => {
    if (!pdfBytes || !pdfFile) return;
    setBusyMsg('Splitting PDF locally...');
    setErrorMsg(null);
    try {
      const src = await PDFDocument.load(pdfBytes);
      const total = src.getPageCount();
      const baseName = pdfFile.name.replace(/\.pdf$/i, '');

      if (splitMode === 'range') {
        const selected = parsePageRanges(pageRangeInput, total);
        if (selected.length === 0) {
          setErrorMsg('Enter valid page numbers or ranges (e.g. 1-3, 5).');
          setBusyMsg(null);
          return;
        }
        const outDoc = await PDFDocument.create();
        const copied = await outDoc.copyPages(
          src,
          selected.map((n) => n - 1),
        );
        copied.forEach((p) => outDoc.addPage(p));
        const outBytes = await outDoc.save();
        downloadBlob(
          new Blob([new Uint8Array(outBytes)], { type: 'application/pdf' }),
          `${baseName}_pages_${pageRangeInput.replace(/[^0-9,-]/g, '')}.pdf`,
        );
      } else {
        const step = splitMode === 'all' ? 1 : Math.max(1, splitChunkSize);
        for (let start = 0; start < total; start += step) {
          const end = Math.min(total, start + step);
          const outDoc = await PDFDocument.create();
          const indices = Array.from({ length: end - start }, (_, i) => start + i);
          const copied = await outDoc.copyPages(src, indices);
          copied.forEach((p) => outDoc.addPage(p));
          const outBytes = await outDoc.save();
          downloadBlob(
            new Blob([new Uint8Array(outBytes)], { type: 'application/pdf' }),
            `${baseName}_part_${start + 1}-${end}.pdf`,
          );
        }
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to split PDF.');
    } finally {
      setBusyMsg(null);
    }
  };

  const handleExportOrganizedPdf = async () => {
    if (!pdfBytes || !pdfFile || pageThumbs.length === 0) return;
    const active = pageThumbs.filter((p) => p.selected);
    if (active.length === 0) {
      setErrorMsg('Keep at least one page selected to export.');
      return;
    }
    setBusyMsg('Rebuilding PDF with rotated & reordered pages...');
    setErrorMsg(null);
    try {
      const src = await PDFDocument.load(pdfBytes);
      const outDoc = await PDFDocument.create();
      for (const item of active) {
        const [copied] = await outDoc.copyPages(src, [item.pageNumber - 1]);
        if (item.rotation !== 0) {
          const currentRot = copied.getRotation().angle;
          copied.setRotation(degrees((currentRot + item.rotation) % 360));
        }
        outDoc.addPage(copied);
      }
      const outBytes = await outDoc.save();
      const baseName = pdfFile.name.replace(/\.pdf$/i, '');
      downloadBlob(
        new Blob([new Uint8Array(outBytes)], { type: 'application/pdf' }),
        `${baseName}_edited.pdf`,
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to export edited PDF.');
    } finally {
      setBusyMsg(null);
    }
  };

  const handleCompressPdf = async () => {
    if (!pdfBytes || !pdfFile) return;
    setBusyMsg('Compressing PDF pages locally...');
    setErrorMsg(null);
    try {
      const scaleMap = { balanced: 1.25, medium: 1.0, strong: 0.75 };
      const qualityMap = { balanced: 0.78, medium: 0.6, strong: 0.42 };
      const doc = await pdfjsLib.getDocument({ data: pdfBytes.slice(0) }).promise;
      const outDoc = await PDFDocument.create();

      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const origViewport = page.getViewport({ scale: 1 });
        const renderViewport = page.getViewport({ scale: scaleMap[compressLevel] });
        const canvas = document.createElement('canvas');
        canvas.width = renderViewport.width;
        canvas.height = renderViewport.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        await page.render({ canvasContext: ctx, viewport: renderViewport, canvas }).promise;
        const jpgDataUrl = canvas.toDataURL('image/jpeg', qualityMap[compressLevel]);
        const jpgRes = await fetch(jpgDataUrl);
        const jpgBytes = await jpgRes.arrayBuffer();
        const embedded = await outDoc.embedJpg(jpgBytes);
        const newPage = outDoc.addPage([origViewport.width, origViewport.height]);
        newPage.drawImage(embedded, {
          x: 0,
          y: 0,
          width: origViewport.width,
          height: origViewport.height,
        });
      }

      const outBytes = await outDoc.save({ useObjectStreams: true });
      setCompressStats({ original: pdfBytes.byteLength, compressed: outBytes.byteLength });
      const baseName = pdfFile.name.replace(/\.pdf$/i, '');
      downloadBlob(
        new Blob([new Uint8Array(outBytes)], { type: 'application/pdf' }),
        `${baseName}_compressed.pdf`,
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to compress PDF.');
    } finally {
      setBusyMsg(null);
    }
  };

  const handlePdfToImages = async () => {
    if (!pdfBytes) return;
    setBusyMsg('Converting PDF pages to images...');
    setErrorMsg(null);
    try {
      const doc = await pdfjsLib.getDocument({ data: pdfBytes.slice(0) }).promise;
      const out: Array<{ page: number; dataUrl: string }> = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const viewport = page.getViewport({ scale: 1.6 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        await page.render({ canvasContext: ctx, viewport, canvas }).promise;
        out.push({
          page: i,
          dataUrl: canvas.toDataURL(
            imageFormat === 'png' ? 'image/png' : 'image/jpeg',
            0.92,
          ),
        });
      }
      setRenderedImages(out);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to render PDF images.');
    } finally {
      setBusyMsg(null);
    }
  };

  const handleImagesToPdf = async () => {
    if (imgFiles.length === 0) {
      setErrorMsg('Add at least one PNG or JPG image.');
      return;
    }
    setBusyMsg('Building PDF from images...');
    setErrorMsg(null);
    try {
      const outDoc = await PDFDocument.create();
      for (const item of imgFiles) {
        const bytes = await item.file.arrayBuffer();
        const isPng = item.file.type.includes('png') || item.file.name.toLowerCase().endsWith('.png');
        const embedded = isPng ? await outDoc.embedPng(bytes) : await outDoc.embedJpg(bytes);
        const { width, height } = embedded.scale(1);

        let pageW = width;
        let pageH = height;
        if (imgPageSize === 'a4') {
          pageW = 595.28;
          pageH = 841.89;
        } else if (imgPageSize === 'letter') {
          pageW = 612;
          pageH = 792;
        }

        const page = outDoc.addPage([pageW, pageH]);
        const scale = Math.min((pageW - 40) / width, (pageH - 40) / height, 1);
        const drawW = imgPageSize === 'fit' ? width : width * scale;
        const drawH = imgPageSize === 'fit' ? height : height * scale;
        page.drawImage(embedded, {
          x: (pageW - drawW) / 2,
          y: (pageH - drawH) / 2,
          width: drawW,
          height: drawH,
        });
      }
      const outBytes = await outDoc.save();
      downloadBlob(
        new Blob([new Uint8Array(outBytes)], { type: 'application/pdf' }),
        'images_combined.pdf',
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to convert images to PDF.');
    } finally {
      setBusyMsg(null);
    }
  };

  const tabs: Array<{ id: PdfTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'reader', label: 'Reader & AI', icon: BookOpen },
    { id: 'to-text', label: 'PDF to Text', icon: FileText },
    { id: 'text-to-pdf', label: 'Text to PDF', icon: FileOutput },
    { id: 'merge', label: 'Merge PDFs', icon: Combine },
    { id: 'split', label: 'Split & Extract', icon: Scissors },
    { id: 'organize', label: 'Rotate & Reorder', icon: RotateCw },
    { id: 'compress', label: 'Compress', icon: Minimize2 },
    { id: 'to-images', label: 'PDF to Images', icon: FileImage },
    { id: 'images-to-pdf', label: 'Images to PDF', icon: Layers },
  ];

  const needsSinglePdf = ['reader', 'to-text', 'split', 'organize', 'compress', 'to-images'].includes(
    activeTab,
  );

  return (
    <div className="h-full overflow-y-auto px-4 md:px-8 py-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              PDF Toolkit & AI Studio
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              100% browser-side PDF editing, conversion, and compression paired with AI summarization, Q&A, MCQs, and revision notes.
            </p>
          </div>
          {pdfFile && needsSinglePdf && (
            <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3.5 py-2 rounded-xl">
              <FileText className="w-4 h-4 text-violet-600 shrink-0" />
              <span className="font-medium truncate max-w-[180px]">{pdfFile.name}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{pageCount} pages</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{formatFileSize(pdfFile.size)}</span>
              <label className="ml-2 text-violet-600 dark:text-violet-400 font-semibold cursor-pointer hover:underline whitespace-nowrap">
                Change PDF
                <input
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void loadPrimaryPdf(f);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
          )}
        </div>

        {/* Sub-tool Navigation */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  setErrorMsg(null);
                }}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-violet-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
                }`}
              >
                <tab.icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {errorMsg && (
          <div className="p-3.5 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-sm text-red-700 dark:text-red-300">
            {errorMsg}
          </div>
        )}

        {busyMsg && (
          <div className="p-3.5 rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/30 text-sm text-blue-700 dark:text-blue-300 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>{busyMsg}</span>
          </div>
        )}

        {/* Primary PDF Upload Gate */}
        {needsSinglePdf && !pdfBytes && (
          <label className="flex flex-col items-center justify-center p-12 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/50 hover:border-violet-500 cursor-pointer transition-colors text-center">
            <Upload className="w-10 h-10 text-violet-600 dark:text-violet-400 mb-3" />
            <div className="text-base font-semibold text-slate-900 dark:text-white">
              Upload a PDF Document
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Processed locally in your browser. Supports reading, text extraction, splitting, rotating, compressing & AI tools.
            </div>
            <input
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void loadPrimaryPdf(f);
                e.target.value = '';
              }}
            />
          </label>
        )}

        {/* 1. READER & AI STUDIO */}
        {activeTab === 'reader' && pdfBytes && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40"
                    aria-label="Previous page"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-medium tabular-nums">
                    Page {currentPage} of {pageCount}
                  </span>
                  <button
                    type="button"
                    disabled={currentPage >= pageCount}
                    onClick={() => setCurrentPage((p) => Math.min(pageCount, p + 1))}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40"
                    aria-label="Next page"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.2).toFixed(1)))}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700"
                    aria-label="Zoom out"
                  >
                    <ZoomOut className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-mono w-12 text-center tabular-nums">
                    {Math.round(zoom * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => setZoom((z) => Math.min(2.4, +(z + 0.2).toFixed(1)))}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700"
                    aria-label="Zoom in"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-auto p-4 bg-slate-100 dark:bg-slate-950 flex justify-center max-h-[650px]">
                <canvas ref={canvasRef} className="shadow-md rounded bg-white" />
              </div>
            </div>

            <div className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col gap-4">
              <div>
                <h2 className="font-semibold text-base text-slate-900 dark:text-white">
                  AI PDF Assistant
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Summarize, quiz, or ask specific questions about this PDF.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  disabled={aiLoading}
                  onClick={() => void runPdfAiAction('summary')}
                  className="px-3 py-2 rounded-xl text-xs font-medium bg-violet-50 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/60 transition-colors"
                >
                  Summarize
                </button>
                <button
                  type="button"
                  disabled={aiLoading}
                  onClick={() => void runPdfAiAction('mcqs')}
                  className="px-3 py-2 rounded-xl text-xs font-medium bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors"
                >
                  Generate MCQs
                </button>
                <button
                  type="button"
                  disabled={aiLoading}
                  onClick={() => void runPdfAiAction('notes')}
                  className="px-3 py-2 rounded-xl text-xs font-medium bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/60 transition-colors"
                >
                  Revision Notes
                </button>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={aiQuestion}
                  onChange={(e) => setAiQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void runPdfAiAction('ask');
                  }}
                  placeholder="Ask a question from this PDF..."
                  className="flex-1 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:border-violet-500"
                />
                <button
                  type="button"
                  disabled={aiLoading || !aiQuestion.trim()}
                  onClick={() => void runPdfAiAction('ask')}
                  className="px-3.5 py-2 rounded-xl bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 min-h-[280px] max-h-[450px] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 p-4">
                {aiLoading ? (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 className="w-4 h-4 animate-spin text-violet-600" />
                    <span>Analyzing PDF content...</span>
                  </div>
                ) : aiOutput ? (
                  <MarkdownRenderer content={aiOutput} />
                ) : (
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Choose an AI action above or ask a question to inspect insights extracted directly from your PDF.
                  </div>
                )}
              </div>

              {aiOutput && (
                <button
                  type="button"
                  onClick={() =>
                    exportTextToPdf(
                      `${pdfFile?.name || 'PDF'} — AI Notes`,
                      aiOutput,
                      `${(pdfFile?.name || 'document').replace(/\.pdf$/i, '')}_AI_Notes.pdf`,
                    )
                  }
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download AI Output as PDF</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* 2. PDF TO TEXT */}
        {activeTab === 'to-text' && pdfBytes && (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm font-semibold">
                Extracted Text ({extractedPages.length} pages · {extractedText.length.toLocaleString()} characters)
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(extractedText);
                    setCopiedText(true);
                    setTimeout(() => setCopiedText(false), 1800);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium"
                >
                  {copiedText ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedText ? 'Copied' : 'Copy Text'}</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    downloadBlob(
                      new Blob([extractedText], { type: 'text/plain;charset=utf-8' }),
                      `${(pdfFile?.name || 'extracted').replace(/\.pdf$/i, '')}.txt`,
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-medium"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download .TXT</span>
                </button>
              </div>
            </div>
            <textarea
              readOnly
              value={extractedText}
              rows={16}
              className="w-full p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-mono leading-relaxed focus:outline-none"
            />
          </div>
        )}

        {/* 3. TEXT TO PDF */}
        {activeTab === 'text-to-pdf' && (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                Document Title
              </label>
              <input
                type="text"
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                Content (Markdown headings # supported)
              </label>
              <textarea
                value={docBody}
                onChange={(e) => setDocBody(e.target.value)}
                placeholder="Paste or type your study notes, essay, or formatted text here..."
                rows={12}
                className="w-full p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:border-violet-500"
              />
            </div>
            <button
              type="button"
              disabled={!docBody.trim()}
              onClick={() =>
                exportTextToPdf(
                  docTitle || 'Document',
                  docBody,
                  `${(docTitle || 'document').replace(/[^a-z0-9_-]+/gi, '_')}.pdf`,
                )
              }
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-40"
            >
              <Download className="w-4 h-4" />
              <span>Generate & Download PDF</span>
            </button>
          </div>
        )}

        {/* 4. MERGE PDFs */}
        {activeTab === 'merge' && (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-base">Merge Multiple PDFs</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Add PDFs, reorder them, and combine into a single file locally.
                </p>
              </div>
              <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700">
                <Upload className="w-3.5 h-3.5" />
                <span>Add PDFs</span>
                <input
                  type="file"
                  accept=".pdf"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) {
                      setMergeFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
                    }
                    e.target.value = '';
                  }}
                />
              </label>
            </div>

            {mergeFiles.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                No PDFs added yet. Click &ldquo;Add PDFs&rdquo; to select 2 or more PDF files.
              </div>
            ) : (
              <div className="space-y-2">
                {mergeFiles.map((f, idx) => (
                  <div
                    key={`${f.name}-${idx}`}
                    className="flex items-center justify-between px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="font-mono text-slate-400 tabular-nums">{idx + 1}.</span>
                      <span className="font-medium truncate">{f.name}</span>
                      <span className="text-slate-400 tabular-nums">{formatFileSize(f.size)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() =>
                          setMergeFiles((prev) => {
                            const next = [...prev];
                            [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                            return next;
                          })
                        }
                        className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-30"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === mergeFiles.length - 1}
                        onClick={() =>
                          setMergeFiles((prev) => {
                            const next = [...prev];
                            [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
                            return next;
                          })
                        }
                        className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-30"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setMergeFiles((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="p-1.5 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              disabled={mergeFiles.length < 2}
              onClick={() => void handleMergePdfs()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-40"
            >
              <Combine className="w-4 h-4" />
              <span>Merge & Download PDF</span>
            </button>
          </div>
        )}

        {/* 5. SPLIT & EXTRACT */}
        {activeTab === 'split' && pdfBytes && (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <h2 className="font-semibold text-base">
              Split PDF or Extract Selected Pages ({pageCount} total pages)
            </h2>
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'range', label: 'Extract Selected Pages' },
                { id: 'every', label: 'Split Every N Pages' },
                { id: 'all', label: 'Split Into Individual Pages' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSplitMode(m.id as 'range' | 'every' | 'all')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-medium border transition-colors ${
                    splitMode === m.id
                      ? 'bg-violet-600 text-white border-violet-600'
                      : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {splitMode === 'range' && (
              <div className="max-w-sm space-y-1.5">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  Pages or Ranges (e.g. 1-3, 5, 7-{pageCount})
                </label>
                <input
                  type="text"
                  value={pageRangeInput}
                  onChange={(e) => setPageRangeInput(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                />
              </div>
            )}

            {splitMode === 'every' && (
              <div className="max-w-xs space-y-1.5">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  Pages per output PDF
                </label>
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, pageCount)}
                  value={splitChunkSize}
                  onChange={(e) => setSplitChunkSize(Number(e.target.value) || 1)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm tabular-nums"
                />
              </div>
            )}

            <button
              type="button"
              onClick={() => void handleSplitPdf()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700"
            >
              <Scissors className="w-4 h-4" />
              <span>Export Split PDF(s)</span>
            </button>
          </div>
        )}

        {/* 6. ROTATE & REORDER PAGES */}
        {activeTab === 'organize' && pdfBytes && (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-base">Rotate, Reorder & Delete Pages</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Rotate individual pages, change their order, or uncheck pages to exclude them.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleExportOrganizedPdf()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Edited PDF</span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {pageThumbs.map((thumb, idx) => (
                <div
                  key={`${thumb.pageNumber}-${idx}`}
                  className={`p-3 rounded-xl border transition-opacity ${
                    thumb.selected
                      ? 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950'
                      : 'border-dashed border-slate-300 dark:border-slate-800 opacity-50'
                  }`}
                >
                  <div className="aspect-[3/4] flex items-center justify-center overflow-hidden rounded-lg bg-white mb-2.5">
                    <img
                      src={thumb.dataUrl}
                      alt={`Page ${thumb.pageNumber}`}
                      referrerPolicy="no-referrer"
                      style={{ transform: `rotate(${thumb.rotation}deg)` }}
                      className="max-h-full max-w-full object-contain transition-transform"
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="font-medium tabular-nums">Page {thumb.pageNumber}</span>
                    <label className="inline-flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={thumb.selected}
                        onChange={() =>
                          setPageThumbs((prev) =>
                            prev.map((p, i) =>
                              i === idx ? { ...p, selected: !p.selected } : p,
                            ),
                          )
                        }
                      />
                      <span>Keep</span>
                    </label>
                  </div>
                  <div className="flex items-center justify-between gap-1">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() =>
                        setPageThumbs((prev) => {
                          const next = [...prev];
                          [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                          return next;
                        })
                      }
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-30"
                      title="Move earlier"
                    >
                      <ArrowLeft className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setPageThumbs((prev) =>
                          prev.map((p, i) =>
                            i === idx ? { ...p, rotation: (p.rotation + 90) % 360 } : p,
                          ),
                        )
                      }
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700"
                      title="Rotate 90 degrees"
                    >
                      <RotateCw className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === pageThumbs.length - 1}
                      onClick={() =>
                        setPageThumbs((prev) => {
                          const next = [...prev];
                          [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
                          return next;
                        })
                      }
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-30"
                      title="Move later"
                    >
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 7. COMPRESS PDF */}
        {activeTab === 'compress' && pdfBytes && (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <h2 className="font-semibold text-base">Compress PDF Locally</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Optimizes embedded images and page streams inside your browser to reduce PDF file size.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl">
              {[
                { id: 'balanced', title: 'High Quality', desc: 'Crisp text & mild size reduction' },
                { id: 'medium', title: 'Balanced', desc: 'Recommended for notes & assignments' },
                { id: 'strong', title: 'Maximum Compression', desc: 'Smallest file size for portals' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setCompressLevel(opt.id as 'balanced' | 'medium' | 'strong')}
                  className={`text-left p-3.5 rounded-xl border transition-colors ${
                    compressLevel === opt.id
                      ? 'border-violet-600 bg-violet-50/70 dark:bg-violet-950/40'
                      : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <div className="text-sm font-semibold">{opt.title}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>

            {compressStats && (
              <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-800 dark:text-emerald-200 tabular-nums">
                Original: {formatFileSize(compressStats.original)} → Compressed:{' '}
                {formatFileSize(compressStats.compressed)} (
                {Math.max(
                  0,
                  Math.round(
                    ((compressStats.original - compressStats.compressed) /
                      compressStats.original) *
                      100,
                  ),
                )}
                % smaller)
              </div>
            )}

            <button
              type="button"
              onClick={() => void handleCompressPdf()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700"
            >
              <Minimize2 className="w-4 h-4" />
              <span>Compress & Download PDF</span>
            </button>
          </div>
        )}

        {/* 8. PDF TO IMAGES */}
        {activeTab === 'to-images' && pdfBytes && (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold">Output Format:</span>
                {(['png', 'jpeg'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => setImageFormat(fmt)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase ${
                      imageFormat === fmt
                        ? 'bg-violet-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {fmt}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => void handlePdfToImages()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 text-white text-xs font-semibold"
              >
                <FileImage className="w-4 h-4" />
                <span>Render All {pageCount} Pages</span>
              </button>
            </div>

            {renderedImages.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {renderedImages.map((img) => (
                  <div
                    key={img.page}
                    className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-2"
                  >
                    <img
                      src={img.dataUrl}
                      alt={`Page ${img.page}`}
                      referrerPolicy="no-referrer"
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-800"
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium tabular-nums">Page {img.page}</span>
                      <a
                        href={img.dataUrl}
                        download={`${(pdfFile?.name || 'page').replace(/\.pdf$/i, '')}_p${img.page}.${imageFormat}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-violet-600 dark:text-violet-400 hover:underline"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download</span>
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 9. IMAGES TO PDF */}
        {activeTab === 'images-to-pdf' && (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-base">Images to PDF Converter</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Combine scanned notes, diagrams, or photos (PNG/JPG) into a single PDF.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={imgPageSize}
                  onChange={(e) => setImgPageSize(e.target.value as 'a4' | 'letter' | 'fit')}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium"
                >
                  <option value="a4">A4 Page</option>
                  <option value="letter">Letter Page</option>
                  <option value="fit">Fit to Image Size</option>
                </select>
                <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Add Images</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/jpg"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      if (!e.target.files) return;
                      const added = Array.from(e.target.files).map((file) => ({
                        file,
                        preview: URL.createObjectURL(file),
                      }));
                      setImgFiles((prev) => [...prev, ...added]);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
            </div>

            {imgFiles.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3">
                {imgFiles.map((item, idx) => (
                  <div
                    key={`${item.file.name}-${idx}`}
                    className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-2"
                  >
                    <img
                      src={item.preview}
                      alt={item.file.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-28 object-cover rounded-lg"
                    />
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="truncate max-w-[100px]">{item.file.name}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setImgFiles((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="text-red-500 hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              disabled={imgFiles.length === 0}
              onClick={() => void handleImagesToPdf()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-40"
            >
              <Download className="w-4 h-4" />
              <span>Create & Download PDF</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
