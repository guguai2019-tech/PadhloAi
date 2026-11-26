import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import mammoth from 'mammoth';
import type { ChatAttachment } from '../types';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export { pdfjsLib };

const MAX_PDF_BYTES = 25 * 1024 * 1024; // 25 MB
const MAX_DOC_BYTES = 12 * 1024 * 1024; // 12 MB
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export async function extractPdfText(
  arrayBuffer: ArrayBuffer,
): Promise<{ text: string; pageCount: number; pages: string[] }> {
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .filter(Boolean);
    pages.push(strings.join(' ').replace(/\s+/g, ' ').trim());
  }

  const combined = pages
    .map((p, idx) => `--- Page ${idx + 1} ---\n${p}`)
    .join('\n\n');

  return {
    text: combined,
    pageCount: pdf.numPages,
    pages,
  };
}

function parseCsvSummary(rawCsv: string): string {
  const lines = rawCsv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const preview = lines.slice(0, 200).join('\n');
  return `CSV Document (${lines.length} rows total):\n${preview}${
    lines.length > 200 ? `\n... (${lines.length - 200} additional rows truncated)` : ''
  }`;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

export async function processUploadedFile(file: File): Promise<ChatAttachment> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const mime = file.type.toLowerCase();

  const isPdf = ext === 'pdf' || mime === 'application/pdf';
  const isDocx =
    ext === 'docx' ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const isCsv = ext === 'csv' || mime === 'text/csv';
  const isImage =
    ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext) ||
    mime.startsWith('image/');
  const isText =
    ['txt', 'md', 'json', 'js', 'ts', 'tsx', 'jsx', 'py', 'java', 'cpp', 'c', 'html', 'css', 'sql', 'xml', 'yaml', 'yml'].includes(ext) ||
    mime.startsWith('text/');

  if (!isPdf && !isDocx && !isCsv && !isImage && !isText) {
    return {
      id,
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      kind: 'text',
      status: 'error',
      errorMessage: `Unsupported file type (.${ext || 'unknown'}). Supported: PDF, DOCX, TXT, MD, CSV, code files, and PNG/JPG/WEBP images.`,
    };
  }

  if (isPdf && file.size > MAX_PDF_BYTES) {
    return {
      id,
      name: file.name,
      mimeType: file.type,
      size: file.size,
      kind: 'pdf',
      status: 'error',
      errorMessage: `PDF exceeds 25 MB limit (${formatFileSize(file.size)}). Try compressing or splitting it in PDF Tools first.`,
    };
  }

  if ((isDocx || isText || isCsv) && file.size > MAX_DOC_BYTES) {
    return {
      id,
      name: file.name,
      mimeType: file.type,
      size: file.size,
      kind: isDocx ? 'docx' : isCsv ? 'csv' : 'text',
      status: 'error',
      errorMessage: `File exceeds 12 MB limit (${formatFileSize(file.size)}).`,
    };
  }

  if (isImage && file.size > MAX_IMAGE_BYTES) {
    return {
      id,
      name: file.name,
      mimeType: file.type,
      size: file.size,
      kind: 'image',
      status: 'error',
      errorMessage: `Image exceeds 10 MB limit (${formatFileSize(file.size)}).`,
    };
  }

  try {
    if (isPdf) {
      const buffer = await file.arrayBuffer();
      const { text, pageCount } = await extractPdfText(buffer);
      if (!text.replace(/--- Page \d+ ---/g, '').trim()) {
        return {
          id,
          name: file.name,
          mimeType: 'application/pdf',
          size: file.size,
          kind: 'pdf',
          status: 'ready',
          pageCount,
          extractedText: `[Notice: This ${pageCount}-page PDF appears to be scanned/image-based with no embedded selectable text. Use PDF Tools -> PDF to Images and upload page images to Image Assistant for OCR/diagram analysis.]`,
        };
      }
      return {
        id,
        name: file.name,
        mimeType: 'application/pdf',
        size: file.size,
        kind: 'pdf',
        status: 'ready',
        pageCount,
        extractedText: text,
      };
    }

    if (isDocx) {
      const buffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer: buffer });
      return {
        id,
        name: file.name,
        mimeType: file.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        size: file.size,
        kind: 'docx',
        status: 'ready',
        extractedText: result.value.trim() || '[Empty DOCX document]',
      };
    }

    if (isCsv) {
      const raw = await file.text();
      return {
        id,
        name: file.name,
        mimeType: 'text/csv',
        size: file.size,
        kind: 'csv',
        status: 'ready',
        extractedText: parseCsvSummary(raw),
      };
    }

    if (isImage) {
      const dataUrl = await readFileAsDataUrl(file);
      return {
        id,
        name: file.name,
        mimeType: file.type || `image/${ext === 'jpg' ? 'jpeg' : ext}`,
        size: file.size,
        kind: 'image',
        status: 'ready',
        imageDataUrl: dataUrl,
      };
    }

    const text = await file.text();
    return {
      id,
      name: file.name,
      mimeType: file.type || 'text/plain',
      size: file.size,
      kind: 'text',
      status: 'ready',
      extractedText: text,
    };
  } catch (err) {
    return {
      id,
      name: file.name,
      mimeType: file.type,
      size: file.size,
      kind: isPdf ? 'pdf' : isDocx ? 'docx' : isImage ? 'image' : isCsv ? 'csv' : 'text',
      status: 'error',
      errorMessage: err instanceof Error ? err.message : 'Failed to parse uploaded file.',
    };
  }
}
