import ExcelJS from 'exceljs';
import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import type {
  AdvancedQuestionTypeId,
  AiSelectionMode,
  ExamCategoryId,
  MockLanguage,
  ProviderId,
  SyllabusSubject,
  UgcNetPaperType,
  UgcNetUnitNode,
  UpscAreaNode,
  UpscMarkingPattern,
  UpscPaperId,
} from '../src/types.ts';
import {
  getAiConfig,
  getDefaultUpscMarkingPattern,
  getUpscPaperMeta,
  normalizeUgcNetUnits,
  normalizeUpscAreas,
} from './db.ts';
import { generateCompletion } from './providers.ts';

export async function extractSyllabusFileText(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
): Promise<{ text: string; fileType: string; pageCount: number }> {
  const lower = fileName.toLowerCase();

  // 1. PDF
  if (lower.endsWith('.pdf') || mimeType.includes('pdf')) {
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
    });
    const pdf = await loadingTask.promise;
    const pages: string[] = [];
    const maxPages = Math.min(pdf.numPages, 80);
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      const lines = tc.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (lines) pages.push(`--- Page ${i} ---\n${lines}`);
    }
    return {
      text: pages.join('\n\n'),
      fileType: 'PDF',
      pageCount: pdf.numPages,
    };
  }

  // 2. DOCX
  if (
    lower.endsWith('.docx') ||
    mimeType.includes('wordprocessingml.document')
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return {
      text: (result.value || '').trim(),
      fileType: 'DOCX',
      pageCount: 1,
    };
  }

  // 3. Legacy DOC (OLE binary fallback text scan)
  if (lower.endsWith('.doc') || mimeType === 'application/msword') {
    const utf16Text = buffer
      .toString('utf16le')
      .replace(/[^\u0020-\u007E\u0900-\u097F\u0B00-\u0B7F\r\n\t]/g, ' ')
      .replace(/\s{3,}/g, '\n');
    const asciiText = buffer
      .toString('latin1')
      .replace(/[^\x20-\x7E\r\n\t]/g, ' ')
      .replace(/\s{3,}/g, '\n');
    const best =
      utf16Text.replace(/\s+/g, '').length > asciiText.replace(/\s+/g, '').length / 2
        ? utf16Text
        : asciiText;
    return {
      text: best.trim().slice(0, 60000),
      fileType: 'DOC',
      pageCount: 1,
    };
  }

  // 4. Excel (.xlsx / .xls / .csv)
  if (
    lower.endsWith('.xlsx') ||
    lower.endsWith('.xls') ||
    mimeType.includes('spreadsheet') ||
    mimeType.includes('excel')
  ) {
    if (lower.endsWith('.xlsx') || mimeType.includes('spreadsheetml')) {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
      const sheetTexts: string[] = [];
      workbook.eachSheet((sheet) => {
        sheetTexts.push(`=== Sheet: ${sheet.name} ===`);
        sheet.eachRow((row) => {
          const vals = row.values;
          if (Array.isArray(vals)) {
            const cells = vals
              .slice(1)
              .map((v) =>
                v === null || v === undefined
                  ? ''
                  : typeof v === 'object' && 'text' in v
                    ? String((v as { text: unknown }).text)
                    : String(v),
              )
              .map((c) => c.trim())
              .filter(Boolean);
            if (cells.length > 0) sheetTexts.push(cells.join(' | '));
          }
        });
      });
      return {
        text: sheetTexts.join('\n').trim(),
        fileType: 'EXCEL',
        pageCount: workbook.worksheets.length,
      };
    }

    // Legacy .xls binary printable scan
    const xlsText = buffer
      .toString('utf8')
      .replace(/[^\u0020-\u007E\u0900-\u097F\u0B00-\u0B7F\r\n\t]/g, ' ')
      .replace(/\s{3,}/g, '\n');
    return {
      text: xlsText.trim().slice(0, 60000),
      fileType: 'EXCEL',
      pageCount: 1,
    };
  }

  // 5. CSV / TXT fallback
  return {
    text: buffer.toString('utf8').trim(),
    fileType: lower.endsWith('.csv') ? 'CSV' : 'TEXT',
    pageCount: 1,
  };
}

export interface ParsedSyllabusExtraction {
  examName: string;
  boardName: string;
  category: ExamCategoryId;
  classLabel: string;
  academicSession: string;
  detectedPattern: string;
  marksSummary?: string;
  availableQuestionFormats?: AdvancedQuestionTypeId[];
  subjects: SyllabusSubject[];
}

const VALID_QUESTION_FORMAT_IDS = new Set<AdvancedQuestionTypeId>([
  'MCQ',
  'Multiple-Select',
  'True-False',
  'Fill-in-the-Blanks',
  'Match-Following',
  'One-Word',
  'Very-Short',
  'Short-Answer',
  'Long-Answer',
  'Descriptive',
  'Assertion-Reasoning',
  'Case-Based',
  'Passage-Based',
  'Numerical',
  'Diagram-Based',
  'Sequence-Order',
]);

function parseJsonSafe<T>(raw: string): T {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1)) as T;
    }
    throw new Error('Could not parse structured JSON from AI syllabus extraction.');
  }
}

export async function analyzeSyllabusWithAI(params: {
  extractedText: string;
  fileName: string;
  examNameHint?: string;
  boardNameHint?: string;
  classLabelHint?: string;
  academicSessionHint?: string;
  subjectHint?: string;
  language: MockLanguage;
}): Promise<ParsedSyllabusExtraction> {
  const snippet = params.extractedText.slice(0, 55000);
  if (!snippet.trim()) {
    throw new Error(
      'Uploaded file contains no readable text (it may be an image-only scan). Please upload a text-based PDF, DOCX, or Excel file.',
    );
  }

  const allowedFormatIdsList = Array.from(VALID_QUESTION_FORMAT_IDS).join(', ');

  const prompt = `You are an expert Academic Syllabus Structuring Engine.
Analyze the uploaded syllabus text below and extract the REAL, EXACT subjects, chapters/units, topics, subtopics, marks distribution, and question paper pattern present in the document.
CRITICAL RULES:
- Use ONLY actual subject, chapter, topic, and subtopic names found in the syllabus text. NEVER invent placeholder names like "Chapter 1" or "Topic 1" unless that exact title appears in the document.
- Preserve Odia or Hindi script where present in the syllabus, or clean English names as written.
- Identify marks per unit/chapter (if specified), overall marks summary, and suitable question format IDs from: [${allowedFormatIdsList}].

Admin Selection / Hints (use document content for details, keep provided exam/class context aligned):
- File Name: ${params.fileName}
- Exam Name Hint: ${params.examNameHint || 'Auto-detect'}
- Board Name Hint: ${params.boardNameHint || 'Auto-detect'}
- Class / Level Hint: ${params.classLabelHint || 'Auto-detect'}
- Academic Session Hint: ${params.academicSessionHint || '2025-26'}
- Subject Hint (optional): ${params.subjectHint || 'Auto-detect all subjects'}
- Target Language: ${params.language}

Syllabus Document Text:
${snippet}

Return ONLY valid JSON matching this exact structure (no markdown fences):
{
  "examName": "Detected or hinted exam name",
  "boardName": "Detected or hinted board/body name",
  "category": "odisha-board | cbse | ugc-net | competitive",
  "classLabel": "Detected or hinted class/level",
  "academicSession": "2025-26",
  "detectedPattern": "Short summary of marks distribution & question paper pattern if found, else Standard pattern",
  "marksSummary": "e.g. Theory 80 Marks + Internal 20 Marks (or empty if omitted)",
  "availableQuestionFormats": ["MCQ", "Short-Answer", "Long-Answer"],
  "subjects": [
    {
      "name": "Subject Name",
      "code": "Optional Code",
      "prescribedBooks": ["Optional Textbook Name"],
      "chapters": [
        {
          "name": "Exact Chapter / Unit Title",
          "term": "Term I",
          "marks": "Optional weightage e.g. 10 Marks",
          "topics": ["Exact Topic 1", "Exact Topic 2"],
          "subtopics": ["Optional Subtopic 1a", "Optional Subtopic 1b"]
        }
      ]
    }
  ]
}`;

  const aiCfg = getAiConfig();
  const result = await generateCompletion({
    selectionMode: 'auto',
    provider: aiCfg.defaultProvider || 'gemini',
    model: '',
    messages: [{ role: 'user', content: prompt }],
    systemInstruction:
      'Extract exact curriculum hierarchies (subjects, chapters, topics, subtopics, marks, question formats) from academic syllabus files into strict JSON. Preserve original terminology.',
    responseMimeType: 'application/json',
  });

  const parsed = parseJsonSafe<Partial<ParsedSyllabusExtraction>>(result.text);

  const validCats = new Set<ExamCategoryId>(['odisha-board', 'cbse', 'ugc-net', 'competitive']);
  const category: ExamCategoryId =
    parsed.category && validCats.has(parsed.category) ? parsed.category : 'competitive';

  const cleanFormats = Array.isArray(parsed.availableQuestionFormats)
    ? parsed.availableQuestionFormats.filter((f): f is AdvancedQuestionTypeId =>
        VALID_QUESTION_FORMAT_IDS.has(f),
      )
    : undefined;

  const cleanSubjects: SyllabusSubject[] = (Array.isArray(parsed.subjects) ? parsed.subjects : [])
    .filter((s) => s && typeof s.name === 'string' && s.name.trim().length > 0)
    .map((s) => ({
      name: s.name.trim(),
      code: s.code?.trim() || undefined,
      prescribedBooks: Array.isArray(s.prescribedBooks)
        ? s.prescribedBooks.map((b) => String(b).trim()).filter(Boolean)
        : undefined,
      chapters: (Array.isArray(s.chapters) ? s.chapters : [])
        .filter((c) => c && typeof c.name === 'string' && c.name.trim().length > 0)
        .map((c) => {
          const baseTopics = Array.isArray(c.topics)
            ? c.topics.map((t) => String(t).trim()).filter(Boolean)
            : [];
          const subtopics = Array.isArray(c.subtopics)
            ? c.subtopics.map((st) => String(st).trim()).filter(Boolean)
            : [];
          return {
            name: c.name.trim(),
            term: c.term === 'Term I' || c.term === 'Term II' ? c.term : undefined,
            section: c.section?.trim() || undefined,
            marks: typeof c.marks === 'string' || typeof c.marks === 'number' ? String(c.marks).trim() : undefined,
            topics: baseTopics.length > 0 ? baseTopics : subtopics.slice(0, 12),
            subtopics: subtopics.length > 0 ? subtopics : undefined,
          };
        }),
    }));

  if (cleanSubjects.length === 0) {
    cleanSubjects.push({
      name: params.subjectHint?.trim() || 'Extracted Syllabus',
      chapters: [
        {
          name: 'Detected Core Syllabus',
          topics: snippet
            .split(/\n+/)
            .map((l) => l.trim())
            .filter((l) => l.length > 4 && !l.startsWith('--- Page'))
            .slice(0, 15),
        },
      ],
    });
  }

  return {
    examName: (params.examNameHint?.trim() || parsed.examName?.trim() || params.fileName.replace(/\.[^.]+$/, '')),
    boardName: params.boardNameHint?.trim() || parsed.boardName?.trim() || 'Official Examination Board',
    category,
    classLabel: params.classLabelHint?.trim() || parsed.classLabel?.trim() || 'General Level',
    academicSession: params.academicSessionHint?.trim() || parsed.academicSession?.trim() || '2025-26',
    detectedPattern: parsed.detectedPattern?.trim() || 'Standard Examination Pattern',
    marksSummary: typeof parsed.marksSummary === 'string' ? parsed.marksSummary.trim() || undefined : undefined,
    availableQuestionFormats: cleanFormats && cleanFormats.length > 0 ? cleanFormats : undefined,
    subjects: cleanSubjects,
  };
}

export interface ParsedUgcNetExtraction {
  paperType: UgcNetPaperType;
  detectedSubjectName?: string;
  detectedSubjectCode?: string;
  academicSession: string;
  units: UgcNetUnitNode[];
  unitCount: number;
  topicCount: number;
  subtopicCount: number;
  warnings: string[];
  aiProviderUsed: string;
  aiModelUsed: string;
}

export async function analyzeUgcNetSyllabusWithAI(params: {
  extractedText: string;
  fileName: string;
  paperType: UgcNetPaperType;
  subjectNameHint?: string;
  subjectCodeHint?: string;
  academicSessionHint?: string;
  selectionMode?: AiSelectionMode;
  provider?: ProviderId;
  model?: string;
}): Promise<ParsedUgcNetExtraction> {
  const fullText = (params.extractedText || '').trim();
  if (!fullText) {
    throw new Error(
      'Uploaded UGC NET syllabus contains no readable text (it may be an image-only scan). Please upload a text-based PDF, DOCX, Excel, CSV, or TXT file.',
    );
  }

  const warnings: string[] = [];
  const maxSnippetLen = 55000;
  if (fullText.length > maxSnippetLen) {
    warnings.push(
      `Source document (${fullText.length.toLocaleString()} chars) exceeded ${maxSnippetLen.toLocaleString()} chars; extracted from the primary ${maxSnippetLen.toLocaleString()} characters. Verify trailing units.`,
    );
  }
  const snippet = fullText.slice(0, maxSnippetLen);

  const paperDesc =
    params.paperType === 'paper-1'
      ? 'UGC NET Paper 1 (General Paper on Teaching and Research Aptitude)'
      : `UGC NET Paper 2 (Subject-Specific: ${params.subjectNameHint || 'Auto-detect from file'})`;

  const prompt = `You are a strict NTA UGC NET Syllabus Extraction Engine.
Extract the EXACT curriculum hierarchy from the uploaded UGC NET syllabus document below into JSON:
- Target Paper: ${paperDesc}
- Uploaded File Name: ${params.fileName}
- Subject Hint (for Paper 2): ${params.subjectNameHint || (params.paperType === 'paper-1' ? 'General Paper 1' : 'Detect exact subject from document')}
- Subject Code Hint: ${params.subjectCodeHint || 'Auto-detect if present'}
- Academic Session Hint: ${params.academicSessionHint || 'Auto-detect or 2026-27'}

CRITICAL ACCURACY RULES (NO EXCEPTIONS):
1. Extract ONLY Units, Topics, and Subtopics ACTUALLY PRESENT in the document text.
2. NEVER invent missing units, topics, subtopics, or subjects from memory. If a Paper 2 document is ambiguous or partial, report the issue in "warnings".
3. Preserve exact original Unit titles (e.g., "Unit I: Teaching Aptitude" or "Unit 1 - Discrete Structures"), exact Topic headings, and nested Subtopics beneath each topic.
4. For Paper 1, structure as: Unit -> Topic -> Subtopic.
5. For Paper 2, detect the subject name & code (if present) and structure as: Unit -> Topic -> Subtopic for that subject.
6. If a topic line contains sub-items or comma/semicolon-separated details in the PDF, keep clean Topic title and put detailed sub-items inside "subtopics": ["..."].

Syllabus Document Text:
${snippet}

Return ONLY valid JSON matching this schema (no markdown code fences):
{
  "detectedSubjectName": "Exact subject name (or 'Paper 1 – General Paper on Teaching & Research Aptitude' for Paper 1)",
  "detectedSubjectCode": "Optional NTA subject code e.g. '87' or '08'",
  "academicSession": "2026-27",
  "warnings": ["Optional warnings if sections are unclear, truncated, or missing subtopics"],
  "units": [
    {
      "unitNumber": 1,
      "title": "Exact Unit Title",
      "marks": "Optional weightage/marks if stated",
      "topics": [
        {
          "title": "Exact Topic Title",
          "subtopics": ["Exact Subtopic 1", "Exact Subtopic 2"]
        }
      ]
    }
  ]
}`;

  const aiCfg = getAiConfig();
  const mode: AiSelectionMode = params.selectionMode || 'auto';
  const result = await generateCompletion({
    selectionMode: mode,
    provider: params.provider || aiCfg.defaultProvider || 'gemini',
    model: params.model || '',
    messages: [{ role: 'user', content: prompt }],
    systemInstruction:
      'You are an accurate UGC NET curriculum parser. Return strict JSON containing only units, topics, and subtopics explicitly present in the provided syllabus text.',
    responseMimeType: 'application/json',
  });

  const parsed = parseJsonSafe<{
    detectedSubjectName?: string;
    detectedSubjectCode?: string;
    academicSession?: string;
    warnings?: string[];
    units?: Array<{
      unitNumber?: number;
      title?: string;
      marks?: string;
      topics?: Array<{
        title?: string;
        subtopics?: Array<string | { title?: string }>;
      }>;
    }>;
  }>(result.text);

  const rawUnits = (Array.isArray(parsed.units) ? parsed.units : []).map((u, idx) => ({
    unitId: '',
    unitNumber: typeof u?.unitNumber === 'number' ? u.unitNumber : idx + 1,
    title: String(u?.title || '').trim(),
    marks: u?.marks ? String(u.marks).trim() : undefined,
    order: idx + 1,
    topics: (Array.isArray(u?.topics) ? u.topics : []).map((t, tIdx) => ({
      topicId: '',
      title: String(t?.title || '').trim(),
      order: tIdx + 1,
      subtopics: (Array.isArray(t?.subtopics) ? t.subtopics : []).map((st, sIdx) => ({
        subtopicId: '',
        title: typeof st === 'string' ? st.trim() : String(st?.title || '').trim(),
        order: sIdx + 1,
      })),
    })),
  }));

  const normalized = normalizeUgcNetUnits(rawUnits);

  if (Array.isArray(parsed.warnings)) {
    for (const w of parsed.warnings) {
      const cleanW = String(w || '').trim();
      if (cleanW && !warnings.includes(cleanW)) warnings.push(cleanW);
    }
  }

  if (normalized.unitCount === 0) {
    throw new Error(
      'AI extraction did not detect any structured Units in this document. Please check that the uploaded file contains readable UGC NET Unit headings.',
    );
  }

  if (normalized.topicCount < normalized.unitCount) {
    warnings.push('Some units appear to have very few extracted topics. Please inspect and edit before publishing.');
  }

  return {
    paperType: params.paperType,
    detectedSubjectName: parsed.detectedSubjectName?.trim() || params.subjectNameHint?.trim(),
    detectedSubjectCode: parsed.detectedSubjectCode?.trim() || params.subjectCodeHint?.trim(),
    academicSession: params.academicSessionHint?.trim() || parsed.academicSession?.trim() || '2026-27',
    units: normalized.units,
    unitCount: normalized.unitCount,
    topicCount: normalized.topicCount,
    subtopicCount: normalized.subtopicCount,
    warnings,
    aiProviderUsed: result.providerUsed,
    aiModelUsed: result.modelUsed,
  };
}

export interface ParsedUpscExtraction {
  paperId: UpscPaperId;
  detectedOptionalSubject?: string;
  examYear: string;
  markingPattern: UpscMarkingPattern;
  areas: UpscAreaNode[];
  areaCount: number;
  topicCount: number;
  subtopicCount: number;
  warnings: string[];
  aiProviderUsed: string;
  aiModelUsed: string;
}

export async function analyzeUpscSyllabusWithAI(params: {
  extractedText: string;
  fileName: string;
  paperId: UpscPaperId;
  optionalSubjectHint?: string;
  examYearHint?: string;
  selectionMode?: AiSelectionMode;
  provider?: ProviderId;
  model?: string;
}): Promise<ParsedUpscExtraction> {
  const fullText = (params.extractedText || '').trim();
  if (!fullText) {
    throw new Error(
      'Uploaded UPSC syllabus contains no readable text (it may be an image-only scan). Please upload a text-based PDF, DOCX, Excel, CSV, or TXT file.',
    );
  }

  const warnings: string[] = [];
  const maxSnippetLen = 55000;
  if (fullText.length > maxSnippetLen) {
    warnings.push(
      `Source document (${fullText.length.toLocaleString()} chars) exceeded ${maxSnippetLen.toLocaleString()} chars; extracted from the primary ${maxSnippetLen.toLocaleString()} characters. Verify trailing areas/topics.`,
    );
  }
  const snippet = fullText.slice(0, maxSnippetLen);
  const paperMeta = getUpscPaperMeta(params.paperId);
  const defaultPattern = getDefaultUpscMarkingPattern(params.paperId);

  const prompt = `You are a strict UPSC Civil Services Examination (CSE) Syllabus Extraction Engine.
Extract the EXACT curriculum hierarchy and pattern details from the uploaded UPSC syllabus document below into JSON:
- Target Stage & Paper: ${paperMeta.paperLabel}
- Uploaded File Name: ${params.fileName}
- Optional Subject Hint (if Optional Paper): ${params.optionalSubjectHint || (params.paperId === 'mains-optional' ? 'Detect exact Optional subject from document' : 'Not applicable')}
- Exam Year / Cycle Hint: ${params.examYearHint || 'Auto-detect or 2026'}

CRITICAL ACCURACY RULES (NO EXCEPTIONS):
1. Extract ONLY Subject Areas, Topics, and Subtopics ACTUALLY PRESENT in the uploaded document text.
2. NEVER invent missing topics, papers, or optional subjects from memory. If parts of the syllabus are unclear or truncated, record a clear note inside "warnings".
3. Organize the syllabus cleanly as: Area / Subject -> Topic -> Subtopic.
   - Examples for Prelims GS I: Areas like "Current Events of National & International Importance", "History of India & Indian National Movement", "Indian & World Geography", "Indian Polity & Governance", "Economic & Social Development", "Environment, Ecology, Biodiversity & Climate Change", "General Science". (Only use those actually present in the file!)
   - Examples for CSAT Paper II: "Comprehension", "Interpersonal Skills", "Logical Reasoning & Analytical Ability", "Decision-Making & Problem Solving", "General Mental Ability", "Basic Numeracy", "Data Interpretation". (Only use those actually present in the file!)
   - Examples for Mains GS / Essay / Optional: Major thematic Subject Areas / Paper Sections -> Topics -> Subtopics.
4. Detect marking scheme / exam pattern fields ONLY if mentioned in the document (otherwise leave undefined so defaults can be used safely).

Syllabus Document Text:
${snippet}

Return ONLY valid JSON matching this schema (no markdown code fences):
{
  "detectedOptionalSubject": "Exact optional subject name if mains-optional else empty string",
  "examYear": "2026",
  "markingPattern": {
    "totalMarks": ${defaultPattern.totalMarks},
    "durationMinutes": ${defaultPattern.durationMinutes},
    "questionCount": ${defaultPattern.questionCount ?? 'null'},
    "marksPerQuestion": ${defaultPattern.marksPerQuestion ?? 'null'},
    "negativeMarkingEnabled": ${defaultPattern.negativeMarkingEnabled},
    "negativeMarksPerWrong": ${defaultPattern.negativeMarksPerWrong},
    "wordLimitGuidelines": "Optional word limit guidelines if stated",
    "patternNotes": "Optional concise summary of marking pattern stated in syllabus"
  },
  "warnings": ["Optional warnings if sections appear incomplete or ambiguous"],
  "areas": [
    {
      "title": "Exact Subject / Area Title",
      "topics": [
        {
          "title": "Exact Topic Title",
          "subtopics": ["Exact Subtopic 1", "Exact Subtopic 2"]
        }
      ]
    }
  ]
}`;

  const aiCfg = getAiConfig();
  const mode: AiSelectionMode = params.selectionMode || 'auto';
  const result = await generateCompletion({
    selectionMode: mode,
    provider: params.provider || aiCfg.defaultProvider || 'gemini',
    model: params.model || '',
    messages: [{ role: 'user', content: prompt }],
    systemInstruction:
      'You are an accurate UPSC CSE curriculum parser. Return strict JSON containing only areas, topics, subtopics, and exam pattern details explicitly present in the provided syllabus text.',
    responseMimeType: 'application/json',
  });

  const parsed = parseJsonSafe<{
    detectedOptionalSubject?: string;
    examYear?: string;
    markingPattern?: Partial<UpscMarkingPattern>;
    warnings?: string[];
    areas?: Array<{
      title?: string;
      topics?: Array<{
        title?: string;
        subtopics?: Array<string | { title?: string }>;
      }>;
    }>;
  }>(result.text);

  const rawAreas: UpscAreaNode[] = (Array.isArray(parsed.areas) ? parsed.areas : []).map((a, idx) => ({
    areaId: '',
    title: String(a?.title || '').trim(),
    order: idx + 1,
    topics: (Array.isArray(a?.topics) ? a.topics : []).map((t, tIdx) => ({
      topicId: '',
      title: String(t?.title || '').trim(),
      order: tIdx + 1,
      subtopics: (Array.isArray(t?.subtopics) ? t.subtopics : []).map((st, sIdx) => ({
        subtopicId: '',
        title: typeof st === 'string' ? st.trim() : String(st?.title || '').trim(),
        order: sIdx + 1,
      })),
    })),
  }));

  const normalized = normalizeUpscAreas(rawAreas);

  if (Array.isArray(parsed.warnings)) {
    for (const w of parsed.warnings) {
      const cleanW = String(w || '').trim();
      if (cleanW && !warnings.includes(cleanW)) warnings.push(cleanW);
    }
  }

  if (normalized.areaCount === 0) {
    throw new Error(
      'AI extraction did not detect any structured Subject Areas or Topics in this UPSC document. Please verify the uploaded file contains readable text.',
    );
  }

  const mp = parsed.markingPattern || {};
  const mergedPattern: UpscMarkingPattern = {
    ...defaultPattern,
    totalMarks:
      typeof mp.totalMarks === 'number' && Number.isFinite(mp.totalMarks) && mp.totalMarks > 0
        ? mp.totalMarks
        : defaultPattern.totalMarks,
    durationMinutes:
      typeof mp.durationMinutes === 'number' &&
      Number.isFinite(mp.durationMinutes) &&
      mp.durationMinutes > 0
        ? mp.durationMinutes
        : defaultPattern.durationMinutes,
    questionCount:
      typeof mp.questionCount === 'number' && Number.isFinite(mp.questionCount) && mp.questionCount > 0
        ? mp.questionCount
        : defaultPattern.questionCount,
    marksPerQuestion:
      typeof mp.marksPerQuestion === 'number' &&
      Number.isFinite(mp.marksPerQuestion) &&
      mp.marksPerQuestion > 0
        ? mp.marksPerQuestion
        : defaultPattern.marksPerQuestion,
    negativeMarkingEnabled:
      typeof mp.negativeMarkingEnabled === 'boolean'
        ? mp.negativeMarkingEnabled
        : defaultPattern.negativeMarkingEnabled,
    negativeMarksPerWrong:
      typeof mp.negativeMarksPerWrong === 'number' &&
      Number.isFinite(mp.negativeMarksPerWrong) &&
      mp.negativeMarksPerWrong >= 0
        ? mp.negativeMarksPerWrong
        : defaultPattern.negativeMarksPerWrong,
    wordLimitGuidelines:
      typeof mp.wordLimitGuidelines === 'string' && mp.wordLimitGuidelines.trim()
        ? mp.wordLimitGuidelines.trim()
        : defaultPattern.wordLimitGuidelines,
    patternNotes:
      typeof mp.patternNotes === 'string' && mp.patternNotes.trim()
        ? mp.patternNotes.trim()
        : defaultPattern.patternNotes,
  };

  return {
    paperId: params.paperId,
    detectedOptionalSubject:
      parsed.detectedOptionalSubject?.trim() || params.optionalSubjectHint?.trim() || undefined,
    examYear: params.examYearHint?.trim() || parsed.examYear?.trim() || '2026',
    markingPattern: mergedPattern,
    areas: normalized.areas,
    areaCount: normalized.areaCount,
    topicCount: normalized.topicCount,
    subtopicCount: normalized.subtopicCount,
    warnings,
    aiProviderUsed: result.providerUsed,
    aiModelUsed: result.modelUsed,
  };
}

