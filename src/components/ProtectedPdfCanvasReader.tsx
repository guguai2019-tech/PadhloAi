import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Lock,
  Loader2,
  Maximize2,
  Minimize2,
  MoveHorizontal,
  Search,
  ShieldCheck,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { LanguageMode } from '../types';
import { pdfjsLib } from '../utils/fileProcessor';
import { fetchProtectedPdfBytes } from '../utils/adminApi';
import { SearchBarWithVoice } from './SearchBarWithVoice';

interface ProtectedPdfCanvasReaderProps {
  noteId: string;
  title: string;
  subtitle?: string;
  authToken: string;
  language?: LanguageMode;
  onClose?: () => void;
}

interface SearchHit {
  pageNumber: number;
  snippet: string;
}

export const ProtectedPdfCanvasReader: React.FC<ProtectedPdfCanvasReaderProps> = ({
  noteId,
  title,
  subtitle,
  authToken,
  language,
  onClose,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasWrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);

  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState('1');
  const [scale, setScale] = useState(1.2);
  const [fitMode, setFitMode] = useState<'width' | 'screen' | 'manual'>('width');
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [pageTextCache, setPageTextCache] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: ReturnType<typeof pdfjsLib.getDocument> | null = null;

    async function load() {
      setLoading(true);
      setError(null);
      setPdfDoc(null);
      setPageTextCache([]);
      setSearchHits([]);
      try {
        const bytes = await fetchProtectedPdfBytes(noteId, authToken);
        if (cancelled) return;
        loadingTask = pdfjsLib.getDocument({ data: bytes });
        const loadedDoc = await loadingTask.promise;
        if (cancelled) {
          void loadingTask.destroy();
          return;
        }
        setPdfDoc(loadedDoc);
        setNumPages(loadedDoc.numPages);
        setCurrentPage(1);
        setPageInput('1');
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to load PDF notes.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
      if (loadingTask) {
        void loadingTask.destroy();
      }
    };
  }, [noteId, authToken]);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  // Render active page to canvas
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current || !canvasWrapRef.current) return;
    let cancelled = false;

    async function renderPage() {
      if (!pdfDoc || !canvasRef.current || !canvasWrapRef.current) return;
      try {
        if (renderTaskRef.current) {
          renderTaskRef.current.cancel();
        }
        const page = await pdfDoc.getPage(currentPage);
        if (cancelled) return;

        const baseViewport = page.getViewport({ scale: 1 });
        const wrapWidth = Math.max(280, canvasWrapRef.current.clientWidth - 36);
        const wrapHeight = Math.max(320, canvasWrapRef.current.clientHeight - 36);

        let effectiveScale = scale;
        if (fitMode === 'width') {
          effectiveScale = Math.min(2.6, Math.max(0.55, wrapWidth / baseViewport.width));
        } else if (fitMode === 'screen') {
          const wRatio = wrapWidth / baseViewport.width;
          const hRatio = wrapHeight / baseViewport.height;
          effectiveScale = Math.min(2.6, Math.max(0.5, Math.min(wRatio, hRatio)));
        }

        const viewport = page.getViewport({ scale: effectiveScale });
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        if (!context) return;

        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        const renderTask = page.render({
          canvasContext: context,
          viewport,
          canvas,
        });
        renderTaskRef.current = renderTask;
        await renderTask.promise;
      } catch (err) {
        if (!cancelled && err instanceof Error && !err.message.includes('Rendering cancelled')) {
          setError(err.message);
        }
      }
    }

    void renderPage();
    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
    };
  }, [pdfDoc, currentPage, scale, fitMode, isFullscreen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'p' || e.key.toLowerCase() === 's')) {
      e.preventDefault();
    }
    if (e.key === 'ArrowRight' || e.key === 'PageDown') {
      setCurrentPage((p) => Math.min(numPages, p + 1));
    } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
      setCurrentPage((p) => Math.max(1, p - 1));
    }
  };

  const handleToggleFullscreen = async () => {
    if (!containerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Ignore fullscreen permissions failure inside restricted iframes
    }
  };

  const runSearch = async (rawQuery: string) => {
    const q = rawQuery.trim().toLowerCase();
    if (!q || !pdfDoc) return;

    setSearching(true);
    try {
      let cached = pageTextCache;
      if (cached.length !== pdfDoc.numPages) {
        const extracted: string[] = [];
        for (let i = 1; i <= pdfDoc.numPages; i++) {
          const pg = await pdfDoc.getPage(i);
          const content = await pg.getTextContent();
          const text = content.items
            .map((it) => ('str' in it ? it.str : ''))
            .join(' ')
            .replace(/\s+/g, ' ');
          extracted.push(text);
        }
        cached = extracted;
        setPageTextCache(extracted);
      }

      const hits: SearchHit[] = [];
      cached.forEach((text, idx) => {
        const pos = text.toLowerCase().indexOf(q);
        if (pos !== -1) {
          const start = Math.max(0, pos - 35);
          const end = Math.min(text.length, pos + q.length + 55);
          hits.push({
            pageNumber: idx + 1,
            snippet: `${start > 0 ? '...' : ''}${text.slice(start, end)}${end < text.length ? '...' : ''}`,
          });
        }
      });
      setSearchHits(hits);
      if (hits.length > 0) {
        setCurrentPage(hits[0].pageNumber);
      }
    } finally {
      setSearching(false);
    }
  };

  const commitPageInput = () => {
    const parsed = Number(pageInput);
    if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= numPages) {
      setCurrentPage(Math.floor(parsed));
    } else {
      setPageInput(String(currentPage));
    }
  };

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onContextMenu={(e) => e.preventDefault()}
      className="pdf-protected-reader select-none flex flex-col h-full bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden focus:outline-none"
    >
      {/* Protected Reader Header & Toolbar (NO Download / NO Print buttons) */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-3 sm:px-4 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
        <div className="min-w-0 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 flex items-center justify-center shrink-0">
            <Lock className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
              {title}
            </h3>
            {subtitle && (
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {/* Navigation & Zoom Controls */}
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="inline-flex items-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-0.5">
            <button
              type="button"
              disabled={currentPage <= 1 || loading}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="p-1.5 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800 disabled:opacity-40"
              aria-label="Previous Page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-1 px-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
              <input
                type="text"
                inputMode="numeric"
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value)}
                onBlur={commitPageInput}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitPageInput();
                }}
                aria-label="Current Page"
                className="w-9 text-center py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold"
              />
              <span className="text-slate-400">/ {numPages || '—'}</span>
            </div>
            <button
              type="button"
              disabled={currentPage >= numPages || loading}
              onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
              className="p-1.5 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800 disabled:opacity-40"
              aria-label="Next Page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              setFitMode('manual');
              setScale((s) => Math.max(0.5, Number((s - 0.2).toFixed(2))));
            }}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => {
              setFitMode('manual');
              setScale((s) => Math.min(2.8, Number((s + 0.2).toFixed(2))));
            }}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setFitMode((m) => (m === 'width' ? 'screen' : 'width'))}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200"
            title="Toggle Fit to Width / Fit to Screen"
          >
            <MoveHorizontal className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">
              {fitMode === 'width' ? 'Fit Width' : fitMode === 'screen' ? 'Fit Screen' : 'Custom'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSearchOpen((o) => !o)}
            className={`p-2 rounded-xl border text-slate-700 dark:text-slate-200 transition-colors ${
              searchOpen
                ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300'
                : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            title="Search Inside PDF"
          >
            <Search className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => void handleToggleFullscreen()}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-red-50 dark:hover:bg-red-950/40 text-slate-600 dark:text-slate-300 hover:text-red-600"
              aria-label="Close Reader"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* In-Document Search Bar */}
      {searchOpen && (
        <div className="bg-slate-50 dark:bg-slate-900/90 border-b border-slate-200 dark:border-slate-800 px-4 py-2.5 space-y-2">
          <SearchBarWithVoice
            compact
            value={searchQuery}
            onChange={setSearchQuery}
            onSearch={(spokenOrTyped) => void runSearch(spokenOrTyped)}
            defaultLanguage={language}
            placeholder="Search keywords inside this PDF..."
            ariaLabel="Search keywords inside this PDF"
          />
          {searching && (
            <p className="text-xs text-[#4338CA] dark:text-indigo-300 font-medium">
              Searching PDF pages...
            </p>
          )}

          {searchHits.length > 0 && (
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
              {searchHits.map((hit) => (
                <button
                  key={hit.pageNumber}
                  type="button"
                  onClick={() => setCurrentPage(hit.pageNumber)}
                  className={`text-left px-2.5 py-1 rounded-lg border text-xs transition-colors ${
                    currentPage === hit.pageNumber
                      ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 hover:border-violet-300'
                  }`}
                >
                  <span className="font-bold">Pg {hit.pageNumber}:</span> {hit.snippet}
                </button>
              ))}
            </div>
          )}
          {searchQuery && !searching && searchHits.length === 0 && pageTextCache.length > 0 && (
            <p className="text-xs text-slate-500">No matches found for "{searchQuery}".</p>
          )}
        </div>
      )}

      {/* Main Protected Canvas Viewport */}
      <div
        ref={canvasWrapRef}
        className="flex-1 min-h-0 overflow-auto p-4 flex flex-col items-center justify-start bg-slate-200/70 dark:bg-slate-950"
      >
        {loading && (
          <div className="my-auto flex flex-col items-center gap-3 text-slate-600 dark:text-slate-300 py-12">
            <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
            <span className="text-sm font-medium">Loading protected online study notes...</span>
          </div>
        )}

        {error && !loading && (
          <div className="my-auto max-w-md p-5 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="text-sm">{error}</div>
          </div>
        )}

        {!loading && !error && (
          <div className="shadow-xl rounded-lg overflow-hidden bg-white border border-slate-300 dark:border-slate-700">
            <canvas ref={canvasRef} className="block max-w-full" />
          </div>
        )}
      </div>

      {/* Reader Security Notice Footer */}
      <div className="px-4 py-2 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-400">
          <ShieldCheck className="w-3.5 h-3.5" />
          Online Reading Mode · Download & Printing Disabled
        </span>
        <span>
          Page {currentPage} of {numPages || 1} · Browser-level screenshot prevention cannot be guaranteed
        </span>
      </div>
    </div>
  );
};
