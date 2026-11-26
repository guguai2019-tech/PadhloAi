import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  generateCompletion,
  getAdminAiOverview,
  getPublicProvidersOverview,
  normalizeUpstreamError,
  saveAdminAiConfig,
  streamCompletion,
  testProviderConnection,
  type IncomingMessage,
  type ProviderId,
} from './server/providers.ts';
import {
  bumpCatalogVersion,
  changeAdminId,
  changeAdminPassword,
  claimInitialAdminSetup,
  computeDashboardStats,
  computeUgcNetAdminSummary,
  computeUpscAdminSummary,
  deletePrivatePdfFile,
  deletePrivateSyllabusFileIfOrphaned,
  deletePrivateVideoFiles,
  detectSyllabusConflict,
  findActiveUgcNetConflict,
  findActiveUpscConflict,
  findDuplicateUgcNetUpload,
  findDuplicateUpscUpload,
  flagAffectedQuestionsForExam,
  flagOutdatedUgcNetQuestions,
  flagOutdatedUpscQuestions,
  getAdminSetupState,
  getDefaultUpscMarkingPattern,
  getPublishedUgcNetPublicData,
  getPublishedUpscPublicData,
  getVideoConfig,
  getVideoUsageMetrics,
  hashStudentPasscode,
  issueMediaPlaybackTicket,
  issueSessionToken,
  mergeSyllabusIntoExam,
  normalizeUgcNetUnits,
  normalizeUpscAreas,
  publishUgcNetSyllabusVersion,
  publishUpscSyllabusVersion,
  readDb,
  resolveSafePdfPath,
  resolveSafeSyllabusFilePath,
  resolveSafeVideoAssetPath,
  resolveUgcNetSubjectKey,
  resolveUpscSubjectMetadata,
  revokeSessionToken,
  saveOriginalUgcNetSyllabusFile,
  saveOriginalUpscSyllabusFile,
  savePrivatePdfBuffer,
  signCheckoutOrder,
  stripPdfPrivateFields,
  stripStudentPrivateFields,
  stripVideoPrivateFields,
  syncPublishedUgcNetIntoExams,
  syncPublishedUpscIntoExams,
  unpublishUgcNetSyllabusVersion,
  unpublishUpscSyllabusVersion,
  updateVideoConfig,
  verifyAdminCredentials,
  verifyCheckoutOrderToken,
  verifyMediaPlaybackTicket,
  verifySessionToken,
  verifyStudentPasscode,
  writeDb,
  type CentralizedDatabase,
  type PdfNoteStored,
  type SessionPayload,
  type StoredStudentRecord,
} from './server/db.ts';
import {
  analyzeSyllabusWithAI,
  analyzeUgcNetSyllabusWithAI,
  analyzeUpscSyllabusWithAI,
  extractSyllabusFileText,
} from './server/syllabusParser.ts';
import { getTtsProviderHealth } from './server/ttsProvider.ts';
import { pumpVideoQueue } from './server/videoEngine.ts';
import type {
  AdminAiConfig,
  AdminQuestionRecord,
  AdminVideoConfig,
  AiSelectionMode,
  DifficultyLevel,
  ExamDefinition,
  MockLanguage,
  MockQuestion,
  PdfNoteCategory,
  StudentRecord,
  SyllabusUploadRecord,
  UgcNetMockTestMode,
  UgcNetPaperType,
  UgcNetSyllabusRecord,
  UgcNetUnitNode,
  UpscAreaNode,
  UpscMarkingPattern,
  UpscMockTestMode,
  UpscPaperId,
  UpscQuestionFormatId,
  UpscStage,
  UpscSyllabusRecord,
  VideoDurationMinutes,
  VideoGenerationJobRecord,
  VideoLanguage,
} from './src/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

function buildSystemInstruction(language?: string, customInstruction?: string): string {
  const langGuide =
    language === 'odia'
      ? 'Respond completely in natural, grammatically correct Odia (ଓଡ଼ିଆ script) for all text, options, and explanations, keeping standard mathematical symbols/units clear.'
      : language === 'hindi'
        ? 'Respond primarily in natural, clear Hindi (Devanagari script), keeping technical/code terms readable.'
        : language === 'bilingual'
          ? 'Respond in clear English with helpful Hindi explanations/translations where appropriate for Indian students.'
          : language === 'english'
            ? 'Respond in clear, well-structured English.'
            : 'Detect the user language automatically. Support Odia (ଓଡ଼ିଆ), Hindi (Devanagari/Hinglish), and English seamlessly.';

  const base = `You are PadhloAI, Your AI-Powered Learning Companion — a helpful, intelligent, and accurate AI assistant.
Guidelines:
- Understand natural language questions even with minor typos, spelling mistakes, or incomplete phrasing.
- Format answers cleanly using Markdown headings, bullet lists, and GFM tables when helpful.
- Render mathematical formulas using LaTeX ($...$ for inline math, $$...$$ for display math).
- Wrap all code in fenced code blocks with explicit language identifiers (e.g., \`\`\`python).
- ${langGuide}
- If uploaded document text or images are provided, ground your response accurately in their actual content. Never invent facts not present in the source when asked about a document.`;

  return customInstruction ? `${base}\n\nTask Instructions:\n${customInstruction}` : base;
}

function validateMessages(messages: unknown): IncomingMessage[] {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('Messages array must contain at least one message.');
  }
  return messages.slice(-30).map((m) => {
    const item = m as Record<string, unknown>;
    const role = item.role === 'assistant' ? 'assistant' : 'user';
    const content = typeof item.content === 'string' ? item.content.slice(0, 80000) : '';
    const attachments = Array.isArray(item.attachments) ? item.attachments.slice(0, 6) : undefined;
    return {
      role,
      content,
      attachments: attachments as IncomingMessage['attachments'],
    };
  });
}

function extractBearerToken(req: express.Request): string | undefined {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return undefined;
  return header.slice(7).trim();
}

interface AuthenticatedRequest extends express.Request {
  auth?: SessionPayload;
}

function requireAdminAuth(
  req: AuthenticatedRequest,
  res: express.Response,
  next: express.NextFunction,
): void {
  const token = extractBearerToken(req);
  const payload = verifySessionToken(token);
  if (!payload || payload.role !== 'admin') {
    res.status(401).json({ error: 'Unauthorized: Valid administrator login required.' });
    return;
  }
  req.auth = payload;
  next();
}

function requireStudentOrAdminAuth(
  req: AuthenticatedRequest,
  res: express.Response,
  next: express.NextFunction,
): void {
  const token = extractBearerToken(req);
  const payload = verifySessionToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Unauthorized: Valid student or admin session required.' });
    return;
  }
  if (payload.role === 'student') {
    const db = readDb();
    const registered = db.students.find((s) => s.id === payload.sub);
    if (registered && !registered.active) {
      res.status(403).json({ error: 'Student account access has been disabled by Admin.' });
      return;
    }
  }
  req.auth = payload;
  next();
}

function requireRegisteredStudentAuth(
  req: AuthenticatedRequest,
  res: express.Response,
  next: express.NextFunction,
): void {
  const token = extractBearerToken(req);
  const payload = verifySessionToken(token);
  if (!payload || payload.role !== 'student' || payload.sub.startsWith('guest-')) {
    res.status(401).json({
      error: 'Please sign in with your Student Account (Name & Email) to use AI Video Generator.',
    });
    return;
  }
  const db = readDb();
  const registered = db.students.find((s) => s.id === payload.sub);
  if (!registered) {
    res.status(401).json({ error: 'Student account not found. Please sign in again.' });
    return;
  }
  if (!registered.active) {
    res.status(403).json({ error: 'Student account access has been disabled by Admin.' });
    return;
  }
  req.auth = payload;
  next();
}

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  app.use(express.json({ limit: '50mb' }));

  // Initialize centralized DB on server startup
  readDb();

  // Real-Time Catalog Synchronization SSE Registry
  const catalogSseClients = new Set<express.Response>();

  const broadcastCatalogUpdate = (
    reason: string,
    db: CentralizedDatabase,
    details?: Record<string, unknown>,
  ) => {
    const payload = JSON.stringify({
      type: 'catalog-sync',
      reason,
      version: db.catalogVersion,
      updatedAt: db.catalogUpdatedAt,
      ...(details || {}),
    });
    for (const client of catalogSseClients) {
      if (!client.writableEnded) {
        try {
          client.write(`event: catalog-sync\ndata: ${payload}\n\n`);
        } catch {
          catalogSseClients.delete(client);
        }
      } else {
        catalogSseClients.delete(client);
      }
    }
  };

  // Clean CORS handling for same-origin and preview iframe requests (no wildcard with auth)
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.get('/api/health', (_req, res) => {
    const db = readDb();
    res.json({
      ok: true,
      timestamp: Date.now(),
      catalogVersion: db.catalogVersion,
      catalogUpdatedAt: db.catalogUpdatedAt,
    });
  });

  // ===================== PUBLIC / STUDENT CATALOG, REAL-TIME SSE & SESSION =====================

  app.get('/api/catalog/events', (_req, res) => {
    const db = readDb();
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    catalogSseClients.add(res);
    res.write(
      `event: catalog-sync\ndata: ${JSON.stringify({
        type: 'connected',
        reason: 'initial',
        version: db.catalogVersion,
        updatedAt: db.catalogUpdatedAt,
      })}\n\n`,
    );

    const heartbeat = setInterval(() => {
      if (!res.writableEnded) {
        res.write(': keepalive\n\n');
      }
    }, 25000);

    res.on('close', () => {
      clearInterval(heartbeat);
      catalogSseClients.delete(res);
    });
  });

  app.get('/api/catalog', (_req, res) => {
    const db = readDb();
    const publishedExams = db.exams.filter((e) => e.status !== 'Draft');
    const publishedExamIds = new Set(publishedExams.map((e) => e.id));
    const publishedNotes = db.pdfNotes
      .filter(
        (n) =>
          n.published &&
          (n.noteCategory === 'ncert' ||
            n.noteCategory === 'upsc' ||
            !n.examId ||
            publishedExamIds.has(n.examId)),
      )
      .map(stripPdfPrivateFields);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.json({
      exams: publishedExams,
      pdfNotes: publishedNotes,
      questionBankCount: db.questions.filter((q) => publishedExamIds.has(q.examId)).length,
      version: db.catalogVersion,
      updatedAt: db.catalogUpdatedAt,
    });
  });

  // Public Student Endpoint: STRICTLY Published UGC NET syllabuses only (never drafts/unpublished)
  app.get('/api/syllabus/ugc-net', (_req, res) => {
    const db = readDb();
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.json(getPublishedUgcNetPublicData(db));
  });

  // Validated UGC NET Question Generation (consumes centralized published DB + respects AI provider selection)
  app.post('/api/ugc-net/questions/generate', async (req, res) => {
    const body = (req.body || {}) as {
      paperType?: UgcNetPaperType;
      subjectId?: string;
      syllabusVersionId?: string;
      unitIds?: string[];
      topicIds?: string[];
      subtopicNames?: string[];
      questionTypes?: string[];
      totalCount?: number;
      marksPerQuestion?: number;
      difficulty?: DifficultyLevel;
      language?: MockLanguage;
      selectionMode?: AiSelectionMode;
      provider?: ProviderId;
      model?: string;
    };

    const paperType: UgcNetPaperType = body.paperType === 'paper-2' ? 'paper-2' : 'paper-1';
    const db = readDb();
    const pub = getPublishedUgcNetPublicData(db);

    const activeRecord =
      paperType === 'paper-1'
        ? pub.paper1
        : pub.paper2Subjects.find((s) => s.subjectId === body.subjectId || s.syllabusVersionId === body.syllabusVersionId);

    if (!activeRecord) {
      res.status(404).json({
        error:
          paperType === 'paper-1'
            ? 'UGC NET Paper 1 syllabus is not published by Admin yet.'
            : 'Selected UGC NET Paper 2 subject is not published by Admin.',
      });
      return;
    }

    if (body.syllabusVersionId && body.syllabusVersionId !== activeRecord.syllabusVersionId) {
      res.status(409).json({
        error: `Selected syllabus version is outdated. Active published version is ${activeRecord.versionLabel}. Please refresh your selection.`,
      });
      return;
    }

    const selectedUnits =
      Array.isArray(body.unitIds) && body.unitIds.length > 0
        ? activeRecord.units.filter((u) => body.unitIds!.includes(u.unitId))
        : activeRecord.units;

    if (selectedUnits.length === 0) {
      res.status(400).json({ error: 'Selected units do not exist in the active published UGC NET syllabus.' });
      return;
    }

    const topicIdFilter = new Set(Array.isArray(body.topicIds) ? body.topicIds : []);
    const selectedPairs: Array<{ unit: UgcNetUnitNode; topics: Array<{ topicId: string; title: string; subtopics: string[] }> }> = [];

    for (const u of selectedUnits) {
      const matchedTopics =
        topicIdFilter.size > 0
          ? u.topics.filter((t) => topicIdFilter.has(t.topicId))
          : u.topics;
      if (matchedTopics.length > 0) {
        selectedPairs.push({
          unit: u,
          topics: matchedTopics.map((t) => ({
            topicId: t.topicId,
            title: t.title,
            subtopics: t.subtopics.map((s) => s.title),
          })),
        });
      }
    }

    if (selectedPairs.length === 0) {
      res.status(400).json({ error: 'No matching published topics were selected.' });
      return;
    }

    const requestedCount = Math.min(Math.max(Number(body.totalCount) || 10, 1), 40);
    const difficulty: DifficultyLevel = body.difficulty || 'Mixed';
    const language: MockLanguage = body.language === 'hindi' ? 'hindi' : body.language === 'odia' ? 'odia' : 'english';
    const qTypes =
      Array.isArray(body.questionTypes) && body.questionTypes.length > 0
        ? body.questionTypes
        : ['Single-MCQ', 'Assertion-Reasoning', 'Match-Following', 'Statement-Based'];

    const syllabusTreeText = selectedPairs
      .map(
        (pair) =>
          `UNIT [${pair.unit.unitId}]: ${pair.unit.title}\n` +
          pair.topics
            .map(
              (t) =>
                `  - TOPIC [${t.topicId}]: ${t.title}${t.subtopics.length > 0 ? ` (Subtopics: ${t.subtopics.join(', ')})` : ''}`,
            )
            .join('\n'),
      )
      .join('\n\n');

    const prompt = `Generate EXACTLY ${requestedCount} authentic NTA UGC NET JRF examination questions strictly grounded in the Admin-published syllabus below.

EXAM CONTEXT:
- Exam: NTA UGC NET / JRF (${activeRecord.paperLabel})
- Subject: ${activeRecord.subjectName}
- Published Syllabus Version: ${activeRecord.versionLabel} (${activeRecord.academicSession})
- Difficulty: ${difficulty}
- Language: ${language === 'hindi' ? 'Hindi (Devanagari script)' : language === 'odia' ? 'Odia (ଓଡ଼ିଆ script)' : 'Academic English'}
- Requested Question Types (distribute cleanly): ${qTypes.join(', ')}
- Default Marks Per Question: ${Number(body.marksPerQuestion) || 2}
${Array.isArray(body.subtopicNames) && body.subtopicNames.length > 0 ? `- Focused Subtopics: ${body.subtopicNames.join(', ')}\n` : ''}
PUBLISHED SYLLABUS UNITS & TOPICS (use ONLY these unitId and topicId values!):
${syllabusTreeText}

REQUIREMENTS:
1. Every question MUST map accurately to one of the listed unitId and topicId values above. Do NOT go out of syllabus.
2. Support NTA formats cleanly:
   - Single-MCQ / Teaching-Aptitude / Research-Aptitude / Subject-Specific: 4 crisp options + single correctAnswer + explanation.
   - Multiple-Select: 4 options with 2+ correct answers listed in correctOptionIndices & correctAnswer.
   - Assertion-Reasoning: set assertionText, reasonText, and 4 standard A/R options.
   - Match-Following: set matchColumns { columnA: ["(a) ...", ...], columnB: ["(i) ...", ...] } and 4 code-matching options.
   - Statement-Based: State "Statement I: ... Statement II: ..." with 4 standard evaluation options.
3. Return ONLY valid JSON (no markdown fences):
{
  "questions": [
    {
      "unitId": "exact unitId from list",
      "topicId": "exact topicId from list",
      "unitTitle": "Unit title",
      "topicTitle": "Topic title",
      "questionType": "one of [${qTypes.join(', ')}]",
      "difficulty": "Easy | Medium | Hard",
      "marks": 2,
      "question": "Clear UGC NET question stem",
      "assertionText": "Optional if Assertion-Reasoning",
      "reasonText": "Optional if Assertion-Reasoning",
      "matchColumns": { "columnA": ["..."], "columnB": ["..."] },
      "options": ["Option A text", "Option B text", "Option C text", "Option D text"],
      "correctAnswer": "Exact correct option or statement",
      "correctOptionIndices": [0],
      "explanation": "Concise scholarly explanation"
    }
  ]
}`;

    try {
      const result = await generateCompletion({
        selectionMode: body.selectionMode || 'auto',
        provider: body.provider || db.aiConfig.defaultProvider,
        model: body.model || '',
        messages: [{ role: 'user', content: prompt }],
        systemInstruction:
          'You are an NTA UGC NET question paper setter. Return strict JSON grounded strictly in the provided published syllabus unitIds and topicIds.',
        responseMimeType: 'application/json',
      });

      const cleaned = result.text
        .trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```$/i, '')
        .trim();
      const jsonStart = cleaned.indexOf('{');
      const jsonEnd = cleaned.lastIndexOf('}');
      const parsed = JSON.parse(
        jsonStart >= 0 && jsonEnd > jsonStart ? cleaned.slice(jsonStart, jsonEnd + 1) : cleaned,
      ) as { questions?: Array<Record<string, unknown>> };

      const validUnitMap = new Map(selectedPairs.map((p) => [p.unit.unitId, p.unit]));
      const validTopicMap = new Map<string, { unitId: string; title: string }>();
      for (const p of selectedPairs) {
        for (const t of p.topics) {
          validTopicMap.set(t.topicId, { unitId: p.unit.unitId, title: t.title });
        }
      }

      const validatedQuestions = (Array.isArray(parsed.questions) ? parsed.questions : [])
        .map((q, idx) => {
          const fallbackPair = selectedPairs[idx % selectedPairs.length];
          const rawTopicId = typeof q.topicId === 'string' ? q.topicId : '';
          const matchedTopic = validTopicMap.get(rawTopicId);
          const rawUnitId = typeof q.unitId === 'string' ? q.unitId : '';
          const resolvedUnit = validUnitMap.get(matchedTopic?.unitId || rawUnitId) || fallbackPair.unit;
          const resolvedTopicId = matchedTopic ? rawTopicId : fallbackPair.topics[0]?.topicId || '';
          const resolvedTopicTitle = matchedTopic?.title || (typeof q.topicTitle === 'string' ? q.topicTitle : fallbackPair.topics[0]?.title || resolvedUnit.title);

          const qText = typeof q.question === 'string' ? q.question.trim() : '';
          const answerText = typeof q.correctAnswer === 'string' ? q.correctAnswer.trim() : '';
          if (!qText) return null;

          return {
            number: idx + 1,
            examId: 'ugc-net',
            paperId: paperType,
            subjectId: activeRecord.subjectId,
            subjectName: activeRecord.subjectName,
            syllabusVersionId: activeRecord.syllabusVersionId,
            syllabusVersionLabel: activeRecord.versionLabel,
            unitId: resolvedUnit.unitId,
            unitTitle: resolvedUnit.title,
            topicId: resolvedTopicId,
            topicTitle: resolvedTopicTitle,
            questionType: typeof q.questionType === 'string' ? q.questionType : qTypes[0],
            difficulty: typeof q.difficulty === 'string' ? q.difficulty : difficulty,
            marks: Number(q.marks) || Number(body.marksPerQuestion) || 2,
            question: qText,
            assertionText: typeof q.assertionText === 'string' ? q.assertionText : undefined,
            reasonText: typeof q.reasonText === 'string' ? q.reasonText : undefined,
            matchColumns:
              q.matchColumns && typeof q.matchColumns === 'object'
                ? (q.matchColumns as { columnA: string[]; columnB: string[] })
                : undefined,
            options: Array.isArray(q.options) ? q.options.map((o) => String(o)) : undefined,
            correctAnswer: answerText || (Array.isArray(q.options) && q.options[0] ? String(q.options[0]) : 'See explanation'),
            correctOptionIndices: Array.isArray(q.correctOptionIndices)
              ? q.correctOptionIndices.map((n) => Number(n)).filter(Number.isFinite)
              : undefined,
            explanation: typeof q.explanation === 'string' ? q.explanation.trim() : '',
            valid: true,
          };
        })
        .filter((x): x is NonNullable<typeof x> => Boolean(x));

      if (validatedQuestions.length === 0) {
        res.status(502).json({ error: 'Selected AI model returned zero valid UGC NET questions. Try again or adjust count.' });
        return;
      }

      res.json({
        syllabusVersionId: activeRecord.syllabusVersionId,
        syllabusVersionLabel: activeRecord.versionLabel,
        paperId: paperType,
        subjectId: activeRecord.subjectId,
        subjectName: activeRecord.subjectName,
        providerUsed: result.providerUsed,
        modelUsed: result.modelUsed,
        questions: validatedQuestions,
      });
    } catch (err) {
      const normalized = normalizeUpstreamError(err);
      res.status(normalized.status).json({ error: normalized.message });
    }
  });

  // Validated UGC NET Mock Test Generation (supports 25 / 50 / 100 / custom via clean batching)
  app.post('/api/ugc-net/mock-test/generate', async (req, res) => {
    const body = (req.body || {}) as {
      paperType?: UgcNetPaperType;
      subjectId?: string;
      syllabusVersionId?: string;
      testMode?: UgcNetMockTestMode;
      unitIds?: string[];
      topicIds?: string[];
      questionCount?: number;
      difficulty?: DifficultyLevel;
      language?: MockLanguage;
      selectionMode?: AiSelectionMode;
      provider?: ProviderId;
      model?: string;
    };

    const paperType: UgcNetPaperType = body.paperType === 'paper-2' ? 'paper-2' : 'paper-1';
    const db = readDb();
    const pub = getPublishedUgcNetPublicData(db);

    const activeRecord =
      paperType === 'paper-1'
        ? pub.paper1
        : pub.paper2Subjects.find((s) => s.subjectId === body.subjectId || s.syllabusVersionId === body.syllabusVersionId);

    if (!activeRecord) {
      res.status(404).json({
        error:
          paperType === 'paper-1'
            ? 'UGC NET Paper 1 syllabus has not been published by Admin yet.'
            : 'Selected UGC NET Paper 2 subject has not been published by Admin.',
      });
      return;
    }

    if (body.syllabusVersionId && body.syllabusVersionId !== activeRecord.syllabusVersionId) {
      res.status(409).json({
        error: `This syllabus was updated to ${activeRecord.versionLabel}. Refresh Mock Test setup before starting.`,
      });
      return;
    }

    const totalCount = Math.min(Math.max(Number(body.questionCount) || 25, 5), 100);
    const difficulty: DifficultyLevel = body.difficulty || 'Mixed';
    const language: MockLanguage = body.language === 'hindi' ? 'hindi' : body.language === 'odia' ? 'odia' : 'english';

    let targetUnits = activeRecord.units;
    if (Array.isArray(body.unitIds) && body.unitIds.length > 0) {
      const filtered = activeRecord.units.filter((u) => body.unitIds!.includes(u.unitId));
      if (filtered.length > 0) targetUnits = filtered;
    }

    const topicSet = new Set(Array.isArray(body.topicIds) ? body.topicIds : []);
    const syllabusFocusLines = targetUnits
      .map((u) => {
        const topics =
          topicSet.size > 0 ? u.topics.filter((t) => topicSet.has(t.topicId)) : u.topics;
        const effectiveTopics = topics.length > 0 ? topics : u.topics;
        return `- ${u.title}: ${effectiveTopics
          .map((t) =>
            t.subtopics.length > 0
              ? `${t.title} [${t.subtopics.map((s) => s.title).join(', ')}]`
              : t.title,
          )
          .join('; ')}`;
      })
      .join('\n');

    const batchSize = totalCount <= 30 ? totalCount : 25;
    const batches: number[] = [];
    let remaining = totalCount;
    while (remaining > 0) {
      const n = Math.min(batchSize, remaining);
      batches.push(n);
      remaining -= n;
    }

    const allQuestions: MockQuestion[] = [];
    let providerUsed = '';
    let modelUsed = '';

    try {
      for (let bIdx = 0; bIdx < batches.length; bIdx++) {
        const countInBatch = batches[bIdx];
        const batchPrompt = `Generate EXACTLY ${countInBatch} unique objective NTA UGC NET JRF Mock Test questions (Batch ${bIdx + 1} of ${batches.length}).

TEST SPECIFICATION:
- Exam: NTA UGC NET / JRF (${activeRecord.paperLabel})
- Subject: ${activeRecord.subjectName}
- Test Mode: ${body.testMode || (paperType === 'paper-1' ? 'complete-paper-1' : 'complete-paper-2')}
- Published Version: ${activeRecord.versionLabel} (${activeRecord.academicSession})
- Difficulty: ${difficulty}
- Language: ${language === 'hindi' ? 'Hindi (Devanagari)' : language === 'odia' ? 'Odia (ଓଡ଼ିଆ)' : 'English'}

STRICT SYLLABUS COVERAGE (ONLY from these Admin-published units & topics):
${syllabusFocusLines}

Return ONLY valid JSON:
{
  "questions": [
    {
      "questionType": "MCQ | Assertion-Reasoning | Statement-Based | Match-Following",
      "subject": "Unit or Subject label",
      "question": "Clear question text without numbering prefix",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctIndex": 0,
      "explanation": "Concise 2-sentence explanation citing the concept",
      "topicTag": "Exact topic covered"
    }
  ]
}`;

        const resAi = await generateCompletion({
          selectionMode: body.selectionMode || 'auto',
          provider: body.provider || db.aiConfig.defaultProvider,
          model: body.model || '',
          messages: [{ role: 'user', content: batchPrompt }],
          systemInstruction:
            'You are an NTA UGC NET Mock Test generator. Return strict JSON of 4-option objective questions strictly aligned to the provided syllabus.',
          responseMimeType: 'application/json',
        });

        providerUsed = resAi.providerUsed;
        modelUsed = resAi.modelUsed;

        const cleaned = resAi.text
          .trim()
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/```$/i, '')
          .trim();
        const s = cleaned.indexOf('{');
        const e = cleaned.lastIndexOf('}');
        const parsed = JSON.parse(s >= 0 && e > s ? cleaned.slice(s, e + 1) : cleaned) as {
          questions?: Array<Record<string, unknown>>;
        };

        for (const rawQ of Array.isArray(parsed.questions) ? parsed.questions : []) {
          const qText = typeof rawQ.question === 'string' ? rawQ.question.trim() : '';
          const opts = Array.isArray(rawQ.options) ? rawQ.options.map((o) => String(o).trim()).filter(Boolean) : [];
          if (!qText || opts.length < 2) continue;
          const idx = Math.min(Math.max(Number(rawQ.correctIndex) || 0, 0), opts.length - 1);
          const qt =
            rawQ.questionType === 'Assertion-Reasoning' ||
            rawQ.questionType === 'Statement-Based' ||
            rawQ.questionType === 'Match-Following'
              ? rawQ.questionType
              : 'MCQ';

          allQuestions.push({
            id: allQuestions.length + 1,
            questionType: qt,
            subject:
              typeof rawQ.subject === 'string' && rawQ.subject.trim()
                ? rawQ.subject.trim()
                : activeRecord.subjectName,
            question: qText,
            options: opts.slice(0, 4),
            correctIndex: idx,
            explanation:
              typeof rawQ.explanation === 'string' ? rawQ.explanation.trim() : '',
            topicTag: typeof rawQ.topicTag === 'string' ? rawQ.topicTag.trim() : undefined,
          });
          if (allQuestions.length >= totalCount) break;
        }
      }

      if (allQuestions.length === 0) {
        res.status(502).json({ error: 'AI model failed to generate valid UGC NET mock test questions.' });
        return;
      }

      res.json({
        questions: allQuestions.slice(0, totalCount),
        syllabusVersionId: activeRecord.syllabusVersionId,
        syllabusVersionLabel: activeRecord.versionLabel,
        paperId: paperType,
        subjectId: activeRecord.subjectId,
        subjectName: activeRecord.subjectName,
        providerUsed,
        modelUsed,
      });
    } catch (err) {
      const normalized = normalizeUpstreamError(err);
      res.status(normalized.status).json({ error: normalized.message });
    }
  });

  // ===================== UPSC CIVIL SERVICES PUBLIC & AI STUDY APIS =====================

  // Strictly Published UPSC Syllabuses only (never Draft/Unpublished/Archived)
  app.get('/api/syllabus/upsc', (_req, res) => {
    const db = readDb();
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.json(getPublishedUpscPublicData(db));
  });

  // UPSC Prelims & Mains Question Generator (uses ONLY selected published UPSC syllabus version)
  app.post('/api/upsc/questions/generate', async (req, res) => {
    const body = (req.body || {}) as {
      syllabusVersionId?: string;
      areaIds?: string[];
      topicIds?: string[];
      subtopicNames?: string[];
      formats?: UpscQuestionFormatId[];
      count?: number;
      marks?: 10 | 15 | 20;
      difficulty?: DifficultyLevel;
      language?: MockLanguage;
      selectionMode?: AiSelectionMode;
      provider?: ProviderId;
      model?: string;
    };

    try {
      const db = readDb();
      const rec = db.upscSyllabuses.find(
        (r) =>
          r.syllabusVersionId === body.syllabusVersionId &&
          r.isActivePublished &&
          r.publicationStatus === 'Published',
      );
      if (!rec) {
        res.status(400).json({
          error:
            'The selected UPSC syllabus is not currently published. Only Admin-published UPSC syllabuses can be used.',
        });
        return;
      }

      const selectedAreas =
        Array.isArray(body.areaIds) && body.areaIds.length > 0
          ? rec.areas.filter((a) => body.areaIds!.includes(a.areaId))
          : rec.areas;
      if (selectedAreas.length === 0) {
        res.status(400).json({ error: 'Select at least one published subject/area from the UPSC syllabus.' });
        return;
      }

      const topicFilter = new Set(Array.isArray(body.topicIds) ? body.topicIds : []);
      const subtopicFilter = Array.isArray(body.subtopicNames)
        ? body.subtopicNames.map((s) => s.trim()).filter(Boolean)
        : [];

      const syllabusLines: string[] = [];
      for (const area of selectedAreas) {
        const topics =
          topicFilter.size > 0
            ? area.topics.filter((t) => topicFilter.has(t.topicId))
            : area.topics;
        const effectiveTopics = topics.length > 0 ? topics : area.topics;
        const topSummary = effectiveTopics
          .map((t) => {
            const subs =
              subtopicFilter.length > 0
                ? t.subtopics.filter((s) => subtopicFilter.includes(s.title)).map((s) => s.title)
                : t.subtopics.map((s) => s.title);
            return `${t.title}${subs.length ? ` [${subs.slice(0, 6).join('; ')}]` : ''}`;
          })
          .join(' | ');
        syllabusLines.push(`- ${area.title}: ${topSummary || area.title}`);
      }

      const totalCount = Math.min(Math.max(Number(body.count) || 8, 1), 25);
      const targetLang: MockLanguage =
        body.language === 'hindi' || body.language === 'odia' ? body.language : 'english';
      const langInstruction =
        targetLang === 'hindi'
          ? 'Write 100% in pure, formal UPSC Devanagari Hindi (हिन्दी).'
          : targetLang === 'odia'
            ? 'Write 100% in clear, academic Odia (ଓଡ଼ିଆ script).'
            : 'Write 100% in crisp, formal UPSC Civil Services English.';

      const defaultFormats: UpscQuestionFormatId[] =
        rec.stage === 'prelims'
          ? rec.paperId === 'prelims-csat'
            ? ['csat-reasoning', 'single-mcq']
            : ['statement-based', 'single-mcq', 'match-following', 'assertion-reasoning']
          : ['mains-10-mark', 'mains-15-mark'];
      const formats =
        Array.isArray(body.formats) && body.formats.length > 0 ? body.formats : defaultFormats;

      const isPrelims = rec.stage === 'prelims';
      const prompt = `Generate exactly ${totalCount} authentic UPSC Civil Services (${rec.paperLabel} — ${rec.subjectName}, ${rec.examYear}) practice questions STRICTLY aligned to the Admin-published syllabus scope below.
${langInstruction}
Difficulty: ${body.difficulty || 'Medium'}
Requested Question Formats: ${formats.join(', ')}
${!isPrelims ? `Target Mains Marks Focus: ${body.marks || 15} marks` : ''}

Published UPSC Syllabus Scope (ONLY ask from these Areas & Topics):
${syllabusLines.join('\n')}

CRITICAL UPSC QUALITY RULES:
${
  isPrelims
    ? `- Follow authentic UPSC Prelims standards (including "Consider the following statements" / "How many of the statements given above are correct?" / Pair-matching / Concept-application${rec.paperId === 'prelims-csat' ? ' / Comprehension passages, Logical Reasoning, Basic Numeracy & Data Interpretation' : ''}).
- Every Prelims question MUST include 4 options and a valid 0-based "correctIndex" (0-3) plus a clear factual explanation.
- NEVER claim these are official past UPSC papers; they are AI-generated UPSC-style practice items.`
    : `- Generate analytical UPSC Mains descriptive prompts with authentic directive words (Critically examine, Analyze, Discuss, Elucidate, Evaluate).
- Specify "marks" (10, 15, or 20; 125 for Essay) and "wordLimit" (150 for 10 marks, 250 for 15/20 marks, 1000 for Essay).
- Include 4-6 concise "modelPoints" outlining structured answer dimensions and a "directiveNote".
- NEVER invent unverified Constitutional Articles, Supreme Court case numbers, or committee reports.`
}

Return ONLY valid JSON (no markdown fences):
{
  "questions": [
    {
      "areaTitle": "Exact Area Title from scope",
      "topicTitle": "Exact Topic Title from scope",
      "subtopicTitle": "Optional subtopic",
      "format": "${formats[0]}",
      "marks": ${isPrelims ? 2 : body.marks || 15},
      "wordLimit": ${isPrelims ? 'null' : body.marks === 10 ? 150 : 250},
      "passage": "Optional passage if CSAT comprehension",
      "question": "Full question text",
      "options": ${isPrelims ? '["Option A", "Option B", "Option C", "Option D"]' : '[]'},
      "correctIndex": ${isPrelims ? 0 : 'null'},
      "explanation": "Concise explanation or framing approach",
      "modelPoints": ${isPrelims ? '[]' : '["Key analytical point 1", "Key analytical point 2"]'},
      "directiveNote": "Optional examiner focus note"
    }
  ]
}`;

      const resAi = await generateCompletion({
        selectionMode: body.selectionMode || 'auto',
        provider: body.provider || db.aiConfig.defaultProvider,
        model: body.model || '',
        messages: [{ role: 'user', content: prompt }],
        systemInstruction:
          'You are an expert UPSC CSE question setter. Output strict JSON strictly aligned to the provided published UPSC syllabus areas and topics.',
        responseMimeType: 'application/json',
      });

      const cleaned = resAi.text
        .trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```$/i, '')
        .trim();
      const s = cleaned.indexOf('{');
      const e = cleaned.lastIndexOf('}');
      const parsed = JSON.parse(s >= 0 && e > s ? cleaned.slice(s, e + 1) : cleaned) as {
        questions?: Array<Record<string, unknown>>;
      };

      const items = (Array.isArray(parsed.questions) ? parsed.questions : [])
        .map((q, idx) => {
          const question = typeof q.question === 'string' ? q.question.trim() : '';
          if (!question) return null;
          const opts = Array.isArray(q.options)
            ? q.options.map((o) => String(o).trim()).filter(Boolean).slice(0, 4)
            : [];
          return {
            id: idx + 1,
            stage: rec.stage,
            paperLabel: rec.paperLabel,
            areaTitle:
              typeof q.areaTitle === 'string' && q.areaTitle.trim()
                ? q.areaTitle.trim()
                : selectedAreas[0].title,
            topicTitle:
              typeof q.topicTitle === 'string' && q.topicTitle.trim()
                ? q.topicTitle.trim()
                : selectedAreas[0].topics[0]?.title || rec.subjectName,
            subtopicTitle:
              typeof q.subtopicTitle === 'string' ? q.subtopicTitle.trim() || undefined : undefined,
            format: (typeof q.format === 'string' ? q.format : formats[0]) as UpscQuestionFormatId,
            marks: typeof q.marks === 'number' ? q.marks : isPrelims ? 2 : body.marks || 15,
            wordLimit: typeof q.wordLimit === 'number' ? q.wordLimit : undefined,
            passage: typeof q.passage === 'string' ? q.passage.trim() || undefined : undefined,
            question,
            options: isPrelims ? opts : undefined,
            correctIndex:
              isPrelims && opts.length > 0
                ? Math.min(Math.max(Number(q.correctIndex) || 0, 0), opts.length - 1)
                : undefined,
            explanation: typeof q.explanation === 'string' ? q.explanation.trim() : undefined,
            modelPoints: Array.isArray(q.modelPoints)
              ? q.modelPoints.map((p) => String(p).trim()).filter(Boolean)
              : undefined,
            directiveNote:
              typeof q.directiveNote === 'string' ? q.directiveNote.trim() || undefined : undefined,
          };
        })
        .filter((x): x is NonNullable<typeof x> => Boolean(x));

      if (items.length === 0) {
        res.status(502).json({ error: 'AI returned no valid UPSC questions. Please retry.' });
        return;
      }

      res.json({
        questions: items.slice(0, totalCount),
        syllabusVersionId: rec.syllabusVersionId,
        versionLabel: rec.versionLabel,
        paperLabel: rec.paperLabel,
        providerUsed: resAi.providerUsed,
        modelUsed: resAi.modelUsed,
      });
    } catch (err) {
      const normalized = normalizeUpstreamError(err);
      res.status(normalized.status).json({ error: normalized.message });
    }
  });

  // UPSC Prelims Mock Test Generator (GS Paper I & CSAT Paper II)
  app.post('/api/upsc/mock-test/generate', async (req, res) => {
    const body = (req.body || {}) as {
      syllabusVersionId?: string;
      paperId?: UpscPaperId;
      testMode?: UpscMockTestMode;
      areaIds?: string[];
      topicIds?: string[];
      questionCount?: number;
      difficulty?: DifficultyLevel;
      language?: MockLanguage;
      selectionMode?: AiSelectionMode;
      provider?: ProviderId;
      model?: string;
    };

    try {
      const db = readDb();
      const rec = db.upscSyllabuses.find(
        (r) =>
          (body.syllabusVersionId
            ? r.syllabusVersionId === body.syllabusVersionId
            : r.paperId === body.paperId) &&
          r.stage === 'prelims' &&
          r.isActivePublished &&
          r.publicationStatus === 'Published',
      );
      if (!rec) {
        res.status(400).json({
          error:
            'No published UPSC Prelims syllabus found for the selected paper. Publish Prelims GS Paper I or CSAT Paper II in Admin Panel first.',
        });
        return;
      }

      const totalCount = Math.min(Math.max(Number(body.questionCount) || 25, 5), 100);
      const mode: UpscMockTestMode = body.testMode || 'full-syllabus';
      const selectedAreas =
        mode === 'area-wise' && Array.isArray(body.areaIds) && body.areaIds.length > 0
          ? rec.areas.filter((a) => body.areaIds!.includes(a.areaId))
          : rec.areas;
      const selectedTopicSet = new Set(Array.isArray(body.topicIds) ? body.topicIds : []);

      const scopeSummary = (selectedAreas.length > 0 ? selectedAreas : rec.areas)
        .map((a) => {
          const tops =
            mode === 'topic-wise' && selectedTopicSet.size > 0
              ? a.topics.filter((t) => selectedTopicSet.has(t.topicId))
              : a.topics;
          if (mode === 'topic-wise' && selectedTopicSet.size > 0 && tops.length === 0) {
            return '';
          }
          const tText = tops
            .slice(0, 12)
            .map((t) => {
              const subs = t.subtopics.slice(0, 5).map((s) => s.title);
              return `${t.title}${subs.length ? ` (${subs.join(', ')})` : ''}`;
            })
            .join('; ');
          return `- Area "${a.title}": ${tText || a.title}`;
        })
        .filter(Boolean)
        .join('\n');

      if (!scopeSummary.trim()) {
        res.status(400).json({ error: 'Selected UPSC Prelims topic/area scope is empty.' });
        return;
      }

      const targetLang: MockLanguage =
        body.language === 'hindi' || body.language === 'odia' ? body.language : 'english';
      const langDirective =
        targetLang === 'hindi'
          ? 'Write 100% of questions, passages, options, and explanations in Devanagari Hindi (हिन्दी).'
          : targetLang === 'odia'
            ? 'Write 100% of questions, passages, options, and explanations in Odia (ଓଡ଼ିଆ script).'
            : 'Write 100% of questions, passages, options, and explanations in formal UPSC Academic English.';

      const isCsat = rec.paperId === 'prelims-csat';
      const batchSize = 25;
      const batches = Math.ceil(totalCount / batchSize);
      const collected: MockQuestion[] = [];
      let providerUsed: ProviderId = body.provider || db.aiConfig.defaultProvider;
      let modelUsed = body.model || '';

      for (let b = 0; b < batches; b++) {
        const remaining = totalCount - collected.length;
        const askNow = Math.min(batchSize, remaining);
        if (askNow <= 0) break;

        const avoidStems = collected
          .slice(-10)
          .map((q) => q.question.slice(0, 70))
          .join(' | ');

        const batchPrompt = `Generate exactly ${askNow} fresh, non-repeating UPSC Civil Services Prelims (${rec.paperLabel}, ${rec.examYear}) objective MCQs.
${langDirective}
Difficulty: ${body.difficulty || 'Medium'}
Test Mode: ${mode}

Published UPSC Prelims Syllabus Scope:
${scopeSummary}

Question Design Rules:
${
  isCsat
    ? `- Cover CSAT competencies from the published scope: Reading Comprehension (include concise reading passage in "passage"), Logical Reasoning, Analytical Ability, Decision-Making/Interpersonal problem-solving (if in syllabus), Basic Numeracy, and Data Interpretation.`
    : `- Mix authentic UPSC GS Prelims formats: conceptual MCQs, "Statement-Based" (Statement 1 & Statement 2 / How many of the above), "Match-Following" pairs, and "Assertion-Reasoning".`
}
- Provide exactly 4 clear options in "options" and a valid 0-based "correctIndex" (0-3).
- Set "subject" to the exact matching Area title from the scope above, and "topicTag" to the matching Topic title.
- Include a crisp 2-3 sentence explanation. Never fabricate or claim these are official past UPSC questions.
${avoidStems ? `- Avoid repeating: ${avoidStems}` : ''}

Return ONLY valid JSON (no markdown fences):
{
  "questions": [
    {
      "questionType": "MCQ",
      "subject": "Exact Area Title",
      "passage": "",
      "question": "Question stem",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctIndex": 0,
      "explanation": "Clear explanation",
      "topicTag": "Exact Topic Title"
    }
  ]
}`;

        const resAi = await generateCompletion({
          selectionMode: body.selectionMode || 'auto',
          provider: body.provider || db.aiConfig.defaultProvider,
          model: body.model || '',
          messages: [{ role: 'user', content: batchPrompt }],
          systemInstruction:
            'You are a UPSC Prelims Mock Test engine. Return strict JSON of 4-option MCQs strictly from the published UPSC syllabus provided.',
          responseMimeType: 'application/json',
        });

        providerUsed = resAi.providerUsed;
        modelUsed = resAi.modelUsed;

        const cleaned = resAi.text
          .trim()
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/```$/i, '')
          .trim();
        const s = cleaned.indexOf('{');
        const e = cleaned.lastIndexOf('}');
        const parsed = JSON.parse(s >= 0 && e > s ? cleaned.slice(s, e + 1) : cleaned) as {
          questions?: Array<Record<string, unknown>>;
        };

        for (const rawQ of Array.isArray(parsed.questions) ? parsed.questions : []) {
          const qText = typeof rawQ.question === 'string' ? rawQ.question.trim() : '';
          const opts = Array.isArray(rawQ.options)
            ? rawQ.options.map((o) => String(o).trim()).filter(Boolean)
            : [];
          if (!qText || opts.length < 2) continue;
          const idx = Math.min(Math.max(Number(rawQ.correctIndex) || 0, 0), opts.length - 1);
          const qt =
            rawQ.questionType === 'Statement-Based' ||
            rawQ.questionType === 'Match-Following' ||
            rawQ.questionType === 'Assertion-Reasoning' ||
            rawQ.questionType === 'Comprehension'
              ? rawQ.questionType
              : 'MCQ';

          collected.push({
            id: collected.length + 1,
            questionType: qt,
            subject:
              typeof rawQ.subject === 'string' && rawQ.subject.trim()
                ? rawQ.subject.trim()
                : rec.subjectName,
            passage:
              typeof rawQ.passage === 'string' && rawQ.passage.trim()
                ? rawQ.passage.trim()
                : undefined,
            question: qText,
            options: opts.slice(0, 4),
            correctIndex: idx,
            explanation: typeof rawQ.explanation === 'string' ? rawQ.explanation.trim() : '',
            topicTag: typeof rawQ.topicTag === 'string' ? rawQ.topicTag.trim() : undefined,
          });
          if (collected.length >= totalCount) break;
        }
      }

      if (collected.length === 0) {
        res.status(502).json({ error: 'AI model failed to generate valid UPSC Prelims questions.' });
        return;
      }

      res.json({
        questions: collected.slice(0, totalCount),
        syllabusVersionId: rec.syllabusVersionId,
        versionLabel: rec.versionLabel,
        paperId: rec.paperId,
        paperLabel: rec.paperLabel,
        markingPattern: rec.markingPattern,
        providerUsed,
        modelUsed,
      });
    } catch (err) {
      const normalized = normalizeUpstreamError(err);
      res.status(normalized.status).json({ error: normalized.message });
    }
  });

  // UPSC Mains Answer Writing AI
  app.post('/api/upsc/mains/generate-answer', async (req, res) => {
    const body = (req.body || {}) as {
      syllabusVersionId?: string;
      paperLabel?: string;
      subjectArea?: string;
      questionOrTopic?: string;
      marks?: number;
      wordLimit?: number;
      language?: MockLanguage;
      selectionMode?: AiSelectionMode;
      provider?: ProviderId;
      model?: string;
    };

    try {
      const db = readDb();
      const inputText = String(body.questionOrTopic || '').trim();
      if (!inputText) {
        res.status(400).json({ error: 'Please enter a UPSC Mains question or topic.' });
        return;
      }

      const rec = body.syllabusVersionId
        ? db.upscSyllabuses.find(
            (r) =>
              r.syllabusVersionId === body.syllabusVersionId &&
              r.isActivePublished &&
              r.publicationStatus === 'Published',
          )
        : undefined;

      const marks = Math.max(5, Math.min(250, Number(body.marks) || 15));
      const wordLimit = Math.max(80, Math.min(1500, Number(body.wordLimit) || (marks === 10 ? 150 : marks >= 100 ? 1000 : 250)));
      const targetLang: MockLanguage =
        body.language === 'hindi' || body.language === 'odia' ? body.language : 'english';

      const langRule =
        targetLang === 'hindi'
          ? 'Write 100% of the answer, headings, and question in formal UPSC Devanagari Hindi (हिन्दी).'
          : targetLang === 'odia'
            ? 'Write 100% of the answer, headings, and question in formal Odia (ଓଡ଼ିଆ script).'
            : 'Write 100% of the answer in crisp, analytical UPSC Mains Civil Services English.';

      const paperLabel = rec?.paperLabel || body.paperLabel || 'UPSC Mains';
      const subjectArea = body.subjectArea?.trim() || rec?.subjectName || 'General Studies';

      const prompt = `You are a UPSC Mains Answer Writing Coach.
Task: Produce a structured, examiner-oriented UPSC Mains model answer.
Paper: ${paperLabel}
Subject / Area: ${subjectArea}
${rec ? `Published Syllabus Context: ${rec.areas.slice(0, 6).map((a) => `${a.title} (${a.topics.slice(0, 5).map((t) => t.title).join(', ')})`).join(' | ')}` : ''}
User Question or Topic Input: "${inputText}"
Marks: ${marks} marks
Target Word Limit: ~${wordLimit} words (Stay closely within +/- 12% of ${wordLimit} words!)
Language: ${langRule}

STRICT INTEGRITY & STRUCTURE RULES:
1. If the user provided only a brief topic instead of a full question, FIRST formulate one authentic UPSC-style analytical question in "questionUsed". If they provided a full question, use it in "questionUsed".
2. Structure the answer cleanly into:
   - Introduction (context/definition/relevance)
   - Analytical Body Sections with clear subheadings & concise points
   - Examples / Institutional Context
   - Challenges / Counter-perspectives
   - Way Forward (actionable, balanced administrative recommendations)
   - Balanced Conclusion
3. CITATION SAFETY (CRITICAL): Include Constitutional Articles, Committees, Government Schemes, or Reports ONLY when genuinely certain of their exact name/number. NEVER guess or invent Article numbers, committee names, or statistics.
4. Keep prose crisp, multi-dimensional (social, economic, governance, ethical dimensions as relevant), and adhere closely to ${wordLimit} words.

Return ONLY valid JSON (no markdown fences):
{
  "questionUsed": "Full question answered",
  "introduction": "Concise opening paragraph",
  "bodySections": [
    { "heading": "Subheading 1", "points": ["Analytical point 1", "Analytical point 2"] }
  ],
  "examplesAndContext": ["Relevant real-world example or institutional context"],
  "challenges": ["Key challenge 1", "Key challenge 2"],
  "wayForward": ["Actionable recommendation 1", "Actionable recommendation 2"],
  "conclusion": "Forward-looking synthesis paragraph",
  "referencesUsed": ["Only genuinely verified Articles/Committees/Reports mentioned, or empty array"]
}`;

      const resAi = await generateCompletion({
        selectionMode: body.selectionMode || 'auto',
        provider: body.provider || db.aiConfig.defaultProvider,
        model: body.model || '',
        messages: [{ role: 'user', content: prompt }],
        systemInstruction:
          'You are an experienced UPSC Mains answer-writing mentor. Return strict JSON adhering closely to the requested word limit without fabricating legal or committee citations.',
        responseMimeType: 'application/json',
      });

      const cleaned = resAi.text
        .trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```$/i, '')
        .trim();
      const s = cleaned.indexOf('{');
      const e = cleaned.lastIndexOf('}');
      const parsed = JSON.parse(s >= 0 && e > s ? cleaned.slice(s, e + 1) : cleaned) as {
        questionUsed?: string;
        introduction?: string;
        bodySections?: Array<{ heading?: string; points?: string[] }>;
        examplesAndContext?: string[];
        challenges?: string[];
        wayForward?: string[];
        conclusion?: string;
        referencesUsed?: string[];
      };

      const questionUsed = (parsed.questionUsed || inputText).trim();
      const introduction = (parsed.introduction || '').trim();
      const bodySections = (Array.isArray(parsed.bodySections) ? parsed.bodySections : [])
        .map((sec) => ({
          heading: String(sec?.heading || '').trim(),
          points: (Array.isArray(sec?.points) ? sec.points : [])
            .map((p) => String(p).trim())
            .filter(Boolean),
        }))
        .filter((sec) => sec.heading || sec.points.length > 0);
      const examplesAndContext = (Array.isArray(parsed.examplesAndContext) ? parsed.examplesAndContext : [])
        .map((x) => String(x).trim())
        .filter(Boolean);
      const challenges = (Array.isArray(parsed.challenges) ? parsed.challenges : [])
        .map((x) => String(x).trim())
        .filter(Boolean);
      const wayForward = (Array.isArray(parsed.wayForward) ? parsed.wayForward : [])
        .map((x) => String(x).trim())
        .filter(Boolean);
      const conclusion = (parsed.conclusion || '').trim();
      const referencesUsed = (Array.isArray(parsed.referencesUsed) ? parsed.referencesUsed : [])
        .map((x) => String(x).trim())
        .filter(Boolean);

      const mdParts: string[] = [
        `### Question\n${questionUsed}`,
        `### Introduction\n${introduction}`,
      ];
      for (const sec of bodySections) {
        mdParts.push(`### ${sec.heading}\n${sec.points.map((p) => `- ${p}`).join('\n')}`);
      }
      if (examplesAndContext.length > 0) {
        mdParts.push(`### Examples & Context\n${examplesAndContext.map((x) => `- ${x}`).join('\n')}`);
      }
      if (challenges.length > 0) {
        mdParts.push(`### Key Challenges\n${challenges.map((x) => `- ${x}`).join('\n')}`);
      }
      if (wayForward.length > 0) {
        mdParts.push(`### Way Forward\n${wayForward.map((x) => `- ${x}`).join('\n')}`);
      }
      if (conclusion) {
        mdParts.push(`### Conclusion\n${conclusion}`);
      }

      const fullFormattedMarkdown = mdParts.join('\n\n');
      const answerWordsSource = [
        introduction,
        ...bodySections.flatMap((sec) => [sec.heading, ...sec.points]),
        ...examplesAndContext,
        ...challenges,
        ...wayForward,
        conclusion,
      ]
        .join(' ')
        .trim();
      const actualWordCount = answerWordsSource ? answerWordsSource.split(/\s+/).length : 0;

      res.json({
        result: {
          questionUsed,
          paperLabel,
          subjectArea,
          marks,
          targetWordLimit: wordLimit,
          actualWordCount,
          language: targetLang,
          introduction,
          bodySections,
          examplesAndContext,
          challenges,
          wayForward,
          conclusion,
          referencesUsed,
          fullFormattedMarkdown,
          disclaimer:
            'AI-generated practice structure for UPSC Mains preparation — review and refine with standard textbooks and current affairs.',
        },
        providerUsed: resAi.providerUsed,
        modelUsed: resAi.modelUsed,
      });
    } catch (err) {
      const normalized = normalizeUpstreamError(err);
      res.status(normalized.status).json({ error: normalized.message });
    }
  });

  // UPSC Mains Student Answer Evaluator
  app.post('/api/upsc/mains/evaluate-answer', async (req, res) => {
    const body = (req.body || {}) as {
      paperLabel?: string;
      question?: string;
      studentAnswer?: string;
      marks?: number;
      wordLimit?: number;
      language?: MockLanguage;
      selectionMode?: AiSelectionMode;
      provider?: ProviderId;
      model?: string;
    };

    try {
      const db = readDb();
      const question = String(body.question || '').trim();
      const studentAnswer = String(body.studentAnswer || '').trim();
      if (!question || !studentAnswer) {
        res.status(400).json({ error: 'Both the Mains question and your written answer are required for evaluation.' });
        return;
      }

      const marks = Math.max(5, Math.min(250, Number(body.marks) || 15));
      const wordLimitTarget = Math.max(
        80,
        Math.min(1500, Number(body.wordLimit) || (marks === 10 ? 150 : marks >= 100 ? 1000 : 250)),
      );
      const studentWordCount = studentAnswer.split(/\s+/).filter(Boolean).length;
      const targetLang: MockLanguage =
        body.language === 'hindi' || body.language === 'odia' ? body.language : 'english';

      const prompt = `Evaluate this student's UPSC Mains practice answer honestly and constructively.
Paper: ${body.paperLabel || 'UPSC Mains'}
Marks Allotted: ${marks}
Expected Word Limit: ${wordLimitTarget} words
Student Answer Word Count: ${studentWordCount} words
Feedback Language: ${targetLang}

Question:
${question}

Student Written Answer:
${studentAnswer}

Evaluation Criteria:
1. Relevance & directive word adherence
2. Introduction effectiveness
3. Analytical depth & multi-dimensional coverage
4. Examples & real Constitutional/Institutional references (ONLY cite real ones in your feedback/sample!)
5. Structure, subheadings & flow
6. Conclusion & Way Forward
7. Word limit adherence (${studentWordCount} vs ~${wordLimitTarget} words)

Return ONLY valid JSON (no markdown fences):
{
  "estimatedScore": 7.5,
  "wordLimitAssessment": "Concise remark comparing student word count against target limit",
  "strengths": ["Specific strength 1", "Specific strength 2"],
  "missingPoints": ["Missing analytical dimension 1", "Missing dimension 2"],
  "contentGaps": ["Conceptual or factual gap to address"],
  "structuralSuggestions": ["Concrete structural improvement tip"],
  "improvedSampleAnswer": "Concise, well-structured Markdown improved sample answer staying near ${wordLimitTarget} words"
}`;

      const resAi = await generateCompletion({
        selectionMode: body.selectionMode || 'auto',
        provider: body.provider || db.aiConfig.defaultProvider,
        model: body.model || '',
        messages: [{ role: 'user', content: prompt }],
        systemInstruction:
          'You are a strict, constructive UPSC Mains practice evaluator. Return strict JSON. Never claim your estimated score is an official UPSC mark.',
        responseMimeType: 'application/json',
      });

      const cleaned = resAi.text
        .trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```$/i, '')
        .trim();
      const s = cleaned.indexOf('{');
      const e = cleaned.lastIndexOf('}');
      const parsed = JSON.parse(s >= 0 && e > s ? cleaned.slice(s, e + 1) : cleaned) as {
        estimatedScore?: number;
        wordLimitAssessment?: string;
        strengths?: string[];
        missingPoints?: string[];
        contentGaps?: string[];
        structuralSuggestions?: string[];
        improvedSampleAnswer?: string;
      };

      const rawScore = Number(parsed.estimatedScore);
      const clampedScore = Number.isFinite(rawScore)
        ? Math.max(0, Math.min(marks, Number(rawScore.toFixed(1))))
        : Number((marks * 0.45).toFixed(1));

      res.json({
        evaluation: {
          disclaimer:
            'AI Practice Estimate ONLY — Not an official UPSC evaluation or guarantee of examination marks.',
          estimatedScore: clampedScore,
          maxMarks: marks,
          studentWordCount,
          wordLimitTarget,
          wordLimitAssessment:
            (parsed.wordLimitAssessment || '').trim() ||
            `${studentWordCount} words written against a ~${wordLimitTarget}-word target.`,
          strengths: (Array.isArray(parsed.strengths) ? parsed.strengths : [])
            .map((x) => String(x).trim())
            .filter(Boolean),
          missingPoints: (Array.isArray(parsed.missingPoints) ? parsed.missingPoints : [])
            .map((x) => String(x).trim())
            .filter(Boolean),
          contentGaps: (Array.isArray(parsed.contentGaps) ? parsed.contentGaps : [])
            .map((x) => String(x).trim())
            .filter(Boolean),
          structuralSuggestions: (Array.isArray(parsed.structuralSuggestions)
            ? parsed.structuralSuggestions
            : []
          )
            .map((x) => String(x).trim())
            .filter(Boolean),
          improvedSampleAnswer: (parsed.improvedSampleAnswer || '').trim(),
        },
        providerUsed: resAi.providerUsed,
        modelUsed: resAi.modelUsed,
      });
    } catch (err) {
      const normalized = normalizeUpstreamError(err);
      res.status(normalized.status).json({ error: normalized.message });
    }
  });

  // UPSC Study Strategy & Preparation Guidance (based strictly on published syllabus + user attempt metrics)
  app.post('/api/upsc/study-guidance', async (req, res) => {
    const body = (req.body || {}) as {
      dailyHours?: number;
      targetCycle?: string;
      completedTopicCount?: number;
      totalPublishedTopics?: number;
      weakAreas?: string[];
      publishedPapersSummary?: string[];
      language?: MockLanguage;
      selectionMode?: AiSelectionMode;
      provider?: ProviderId;
      model?: string;
    };

    try {
      const db = readDb();
      const upscPub = getPublishedUpscPublicData(db);
      const allPub = [...upscPub.prelims, ...upscPub.mains];
      if (allPub.length === 0) {
        res.status(400).json({
          error: 'No published UPSC syllabus is available yet to build a personalized syllabus plan.',
        });
        return;
      }

      const summaryList =
        Array.isArray(body.publishedPapersSummary) && body.publishedPapersSummary.length > 0
          ? body.publishedPapersSummary
          : allPub.map((p) => `${p.paperLabel} (${p.subjectName}): ${p.areaCount} areas, ${p.topicCount} topics`);

      const prompt = `Create a practical, realistic UPSC Civil Services study and revision plan based strictly on the learner's published syllabus progress and performance signals.
Published Syllabus Papers:
${summaryList.join('\n')}
Completed Topics: ${Number(body.completedTopicCount) || 0} of ${Number(body.totalPublishedTopics) || 0}
Daily Study Hours Available: ${Math.max(1, Math.min(14, Number(body.dailyHours) || 6))} hours/day
Target Cycle / Notes: ${body.targetCycle || 'Integrated Prelims + Mains Cycle'}
Identified Weak Areas / Topics: ${Array.isArray(body.weakAreas) && body.weakAreas.length > 0 ? body.weakAreas.join(', ') : 'None flagged yet from mock tests'}
Language: ${body.language || 'english'}

Rules:
- Never promise or guarantee UPSC selection, rank, or cutoff clearance. Frame strictly as structured preparation guidance.
- Balance Prelims objective practice + Mains answer writing + revision cycles concretely.

Return ONLY valid JSON (no markdown fences):
{
  "readinessOverview": "2-sentence realistic assessment based on current topic completion and weak areas",
  "prelimsMainsBalance": "Practical daily/weekly time split guidance for Prelims vs Mains",
  "weakTopicsPriority": [
    { "topic": "Area or Topic name", "reason": "Why prioritize", "action": "Concrete revision action" }
  ],
  "weeklyPlan": [
    { "dayOrBlock": "Mon–Tue / Block 1", "focus": "Prelims + Mains area", "task": "Concrete task" }
  ],
  "revisionStrategy": ["Actionable revision rule 1", "Actionable revision rule 2"]
}`;

      const resAi = await generateCompletion({
        selectionMode: body.selectionMode || 'auto',
        provider: body.provider || db.aiConfig.defaultProvider,
        model: body.model || '',
        messages: [{ role: 'user', content: prompt }],
        systemInstruction:
          'You are a practical UPSC study strategy advisor. Return strict JSON with realistic study guidance and zero selection guarantees.',
        responseMimeType: 'application/json',
      });

      const cleaned = resAi.text
        .trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```$/i, '')
        .trim();
      const s = cleaned.indexOf('{');
      const e = cleaned.lastIndexOf('}');
      const parsed = JSON.parse(s >= 0 && e > s ? cleaned.slice(s, e + 1) : cleaned) as {
        readinessOverview?: string;
        prelimsMainsBalance?: string;
        weakTopicsPriority?: Array<{ topic?: string; reason?: string; action?: string }>;
        weeklyPlan?: Array<{ dayOrBlock?: string; focus?: string; task?: string }>;
        revisionStrategy?: string[];
      };

      res.json({
        guidance: {
          disclaimer:
            'Study Guidance Only — Consistent revision, mock testing, and answer practice support preparation; no rank or outcome is guaranteed.',
          readinessOverview: (parsed.readinessOverview || '').trim(),
          prelimsMainsBalance: (parsed.prelimsMainsBalance || '').trim(),
          weakTopicsPriority: (Array.isArray(parsed.weakTopicsPriority) ? parsed.weakTopicsPriority : [])
            .map((w) => ({
              topic: String(w?.topic || '').trim(),
              reason: String(w?.reason || '').trim(),
              action: String(w?.action || '').trim(),
            }))
            .filter((w) => w.topic),
          weeklyPlan: (Array.isArray(parsed.weeklyPlan) ? parsed.weeklyPlan : [])
            .map((b) => ({
              dayOrBlock: String(b?.dayOrBlock || '').trim(),
              focus: String(b?.focus || '').trim(),
              task: String(b?.task || '').trim(),
            }))
            .filter((b) => b.dayOrBlock),
          revisionStrategy: (Array.isArray(parsed.revisionStrategy) ? parsed.revisionStrategy : [])
            .map((r) => String(r).trim())
            .filter(Boolean),
        },
        providerUsed: resAi.providerUsed,
        modelUsed: resAi.modelUsed,
      });
    } catch (err) {
      const normalized = normalizeUpstreamError(err);
      res.status(normalized.status).json({ error: normalized.message });
    }
  });

  app.get('/api/questions', (req, res) => {
    const db = readDb();
    const publishedExamIds = new Set(
      db.exams.filter((e) => e.status !== 'Draft').map((e) => e.id),
    );
    const examId = typeof req.query.examId === 'string' ? req.query.examId : '';
    const subject = typeof req.query.subject === 'string' ? req.query.subject : '';
    const chapter = typeof req.query.chapter === 'string' ? req.query.chapter : '';
    const typeId = typeof req.query.typeId === 'string' ? req.query.typeId : '';

    const filtered = db.questions.filter((q) => {
      if (!publishedExamIds.has(q.examId)) return false;
      if (examId && q.examId !== examId) return false;
      if (subject && q.subject.toLowerCase() !== subject.toLowerCase()) return false;
      if (chapter && q.chapter.toLowerCase() !== chapter.toLowerCase()) return false;
      if (typeId && q.typeId !== typeId) return false;
      return true;
    });
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.json({ questions: filtered });
  });

  app.post('/api/student/session', (req, res) => {
    const body = (req.body || {}) as {
      name?: string;
      email?: string;
      passcode?: string;
      rollNumber?: string;
      classLevel?: string;
      examId?: string;
    };

    const db = readDb();
    const email = (body.email || '').trim().toLowerCase();
    const name = (body.name || '').trim();
    const passcode = typeof body.passcode === 'string' ? body.passcode.trim() : '';

    if (name && email) {
      let student = db.students.find((s) => s.email.toLowerCase() === email);
      const now = Date.now();
      if (!student) {
        const creds = passcode.length >= 4 ? hashStudentPasscode(passcode) : null;
        student = {
          id: `stu-${crypto.randomUUID().slice(0, 8)}`,
          name,
          email,
          rollNumber: body.rollNumber?.trim() || undefined,
          classLevel: body.classLevel?.trim() || 'Class 10',
          examId: body.examId?.trim() || undefined,
          active: true,
          registeredAt: now,
          lastActiveAt: now,
          ...(creds ? { passcodeHash: creds.hash, passcodeSalt: creds.salt } : {}),
        };
        db.students.unshift(student);
      } else {
        if (!student.active) {
          res.status(403).json({ error: 'Student account is inactive. Contact Administrator.' });
          return;
        }
        if (student.passcodeHash && student.passcodeSalt) {
          if (!verifyStudentPasscode(student, passcode)) {
            res.status(401).json({
              error: 'Incorrect Student Passcode for this email. Enter your passcode to continue.',
            });
            return;
          }
        } else if (passcode.length >= 4) {
          const creds = hashStudentPasscode(passcode);
          student.passcodeHash = creds.hash;
          student.passcodeSalt = creds.salt;
        }
        student.name = name;
        student.classLevel = body.classLevel?.trim() || student.classLevel;
        student.lastActiveAt = now;
      }
      writeDb(db);
      const token = issueSessionToken('student', student.id);
      res.json({ token, student: stripStudentPrivateFields(student) });
      return;
    }

    const guestId = `guest-${crypto.randomUUID().slice(0, 10)}`;
    const token = issueSessionToken('student', guestId);
    res.json({ token, student: null });
  });

  app.get('/api/pdf-notes', (req, res) => {
    const db = readDb();
    const publishedExamIds = new Set(
      db.exams.filter((e) => e.status !== 'Draft').map((e) => e.id),
    );
    const examId = typeof req.query.examId === 'string' ? req.query.examId : '';
    const subject = typeof req.query.subject === 'string' ? req.query.subject : '';
    const chapter = typeof req.query.chapter === 'string' ? req.query.chapter : '';
    const noteCategory = typeof req.query.noteCategory === 'string' ? req.query.noteCategory : '';
    const ncertClass = typeof req.query.ncertClass === 'string' ? req.query.ncertClass : '';
    const upscStage = typeof req.query.upscStage === 'string' ? req.query.upscStage : '';

    const notes = db.pdfNotes
      .filter(
        (n) =>
          n.published &&
          (n.noteCategory === 'ncert' ||
            n.noteCategory === 'upsc' ||
            !n.examId ||
            publishedExamIds.has(n.examId)),
      )
      .filter((n) => (!noteCategory ? true : (n.noteCategory || 'exam') === noteCategory))
      .filter((n) => (!ncertClass ? true : n.ncertClass === ncertClass || n.classLabel === ncertClass))
      .filter((n) => (!upscStage ? true : n.upscStage === upscStage))
      .filter((n) => (!examId ? true : n.examId === examId))
      .filter((n) => (!subject ? true : n.subject === subject))
      .filter((n) => (!chapter ? true : n.chapter === chapter))
      .map(stripPdfPrivateFields);

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.json({ notes });
  });

  // Protected PDF stream (NEVER exposes filesystem path, forbids unauthenticated access & unpublished PDFs for students)
  app.get('/api/pdf-notes/:id/stream', requireStudentOrAdminAuth, (req: AuthenticatedRequest, res) => {
    const db = readDb();
    const note = db.pdfNotes.find((n) => n.id === req.params.id);
    if (!note) {
      res.status(404).json({ error: 'PDF note not found.' });
      return;
    }
    if (!note.published && req.auth?.role !== 'admin') {
      res.status(403).json({ error: 'This PDF note is not published.' });
      return;
    }

    try {
      const safePath = resolveSafePdfPath(note.storageKey);
      if (!fs.existsSync(safePath)) {
        res.status(404).json({ error: 'Stored PDF file could not be located.' });
        return;
      }
      const buffer = fs.readFileSync(safePath);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename="padhloai-note.pdf"');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      res.send(buffer);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unable to stream PDF.' });
    }
  });

  // ===================== ADMIN AUTHENTICATION ROUTES =====================

  app.get('/api/admin/auth/status', (req, res) => {
    const setupState = getAdminSetupState();
    const token = extractBearerToken(req);
    const payload = verifySessionToken(token);
    res.json({
      needsInitialSetup: setupState.needsInitialSetup,
      envConfigured: setupState.envConfigured,
      authenticated: Boolean(payload && payload.role === 'admin'),
      adminId: payload && payload.role === 'admin' ? payload.sub : undefined,
    });
  });

  app.post('/api/admin/auth/setup', (req, res) => {
    try {
      const body = (req.body || {}) as { adminId?: string; password?: string };
      const record = claimInitialAdminSetup(
        String(body.adminId || ''),
        String(body.password || ''),
      );
      const token = issueSessionToken('admin', record.adminId);
      res.json({ token, adminId: record.adminId });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Admin setup failed.' });
    }
  });

  app.post('/api/admin/auth/login', (req, res) => {
    const body = (req.body || {}) as { adminId?: string; password?: string };
    const adminId = String(body.adminId || '').trim();
    const password = String(body.password || '');
    const setupState = getAdminSetupState();

    if (setupState.needsInitialSetup) {
      res.status(400).json({
        error: 'Initial Admin credentials have not been set yet. Complete First-Run Setup below.',
      });
      return;
    }

    if (!verifyAdminCredentials(adminId, password)) {
      res.status(401).json({ error: 'Invalid Admin ID or Password.' });
      return;
    }

    const token = issueSessionToken('admin', adminId);
    res.json({ token, adminId });
  });

  app.post('/api/admin/auth/logout', (req, res) => {
    revokeSessionToken(extractBearerToken(req));
    res.json({ ok: true });
  });

  app.post('/api/admin/auth/change-password', requireAdminAuth, (req, res) => {
    try {
      const body = (req.body || {}) as {
        currentPassword?: string;
        newPassword?: string;
      };
      const result = changeAdminPassword(
        String(body.currentPassword || ''),
        String(body.newPassword || ''),
      );
      res.json(result);
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Failed to update password.',
      });
    }
  });

  app.post('/api/admin/auth/change-id', requireAdminAuth, (req, res) => {
    try {
      const body = (req.body || {}) as {
        currentPassword?: string;
        newAdminId?: string;
      };
      const result = changeAdminId(
        String(body.currentPassword || ''),
        String(body.newAdminId || ''),
      );
      revokeSessionToken(extractBearerToken(req));
      const token = issueSessionToken('admin', result.adminId);
      res.json({ ok: true, token, adminId: result.adminId, message: result.message });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Failed to update Admin ID.',
      });
    }
  });

  // ===================== PROTECTED ADMIN DASHBOARD & CRUD ROUTES =====================

  app.get('/api/admin/overview', requireAdminAuth, (_req, res) => {
    const db = readDb();
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      stats: computeDashboardStats(db),
      exams: db.exams,
      syllabusUploads: db.syllabusUploads,
      questions: db.questions,
      pdfNotes: db.pdfNotes.map(stripPdfPrivateFields),
      students: db.students,
      catalogVersion: db.catalogVersion,
      catalogUpdatedAt: db.catalogUpdatedAt,
    });
  });

  // AI Syllabus File Upload & Processing
  app.post('/api/admin/syllabus/process', requireAdminAuth, async (req, res) => {
    const body = (req.body || {}) as {
      fileName?: string;
      mimeType?: string;
      fileBase64?: string;
      targetExamId?: string;
      targetClassId?: string;
      examName?: string;
      boardName?: string;
      classLabel?: string;
      academicSession?: string;
      subjectHint?: string;
      language?: MockLanguage;
    };

    const fileName = String(body.fileName || '').trim();
    const base64 = String(body.fileBase64 || '').trim();
    if (!fileName || !base64) {
      res.status(400).json({ error: 'Syllabus fileName and file data are required.' });
      return;
    }

    const now = Date.now();
    const uploadId = `syl-${crypto.randomUUID().slice(0, 8)}`;

    try {
      const cleanB64 = base64.includes(',') ? base64.split(',').pop()! : base64;
      const buffer = Buffer.from(cleanB64, 'base64');
      if (buffer.length === 0) {
        throw new Error('Uploaded syllabus file is empty.');
      }

      const { text, fileType } = await extractSyllabusFileText(
        buffer,
        fileName,
        String(body.mimeType || ''),
      );

      const extracted = await analyzeSyllabusWithAI({
        extractedText: text,
        fileName,
        examNameHint: body.examName,
        boardNameHint: body.boardName,
        classLabelHint: body.classLabel,
        academicSessionHint: body.academicSession,
        subjectHint: body.subjectHint,
        language: body.language || 'english',
      });

      const db = readDb();
      const draftProbe: SyllabusUploadRecord = {
        id: uploadId,
        fileName,
        fileType,
        examId: body.targetExamId || undefined,
        targetExamId: body.targetExamId || undefined,
        targetClassId: body.targetClassId || undefined,
        examName: extracted.examName,
        boardName: extracted.boardName,
        category: extracted.category,
        classLabel: extracted.classLabel,
        academicSession: extracted.academicSession,
        subjectHint: body.subjectHint?.trim() || undefined,
        language: body.language || 'english',
        detectedPattern: extracted.detectedPattern,
        marksSummary: extracted.marksSummary,
        availableQuestionFormats: extracted.availableQuestionFormats,
        subjects: extracted.subjects,
        status: 'Draft',
        uploadedAt: now,
        updatedAt: now,
      };

      const conflict = detectSyllabusConflict(db, draftProbe);
      if (conflict.exists) {
        draftProbe.status = 'Update Available';
        draftProbe.targetExamId = conflict.examId;
        draftProbe.targetClassId = conflict.classId;
      } else if (conflict.examId) {
        draftProbe.targetExamId = conflict.examId;
      }

      db.syllabusUploads.unshift(draftProbe);
      writeDb(db);

      res.json({
        upload: draftProbe,
        extractedCharCount: text.length,
        conflict,
      });
    } catch (err) {
      const norm = normalizeUpstreamError(err);
      const db = readDb();
      const failedRecord: SyllabusUploadRecord = {
        id: uploadId,
        fileName,
        fileType: fileName.split('.').pop()?.toUpperCase() || 'FILE',
        targetExamId: body.targetExamId,
        targetClassId: body.targetClassId,
        examName: body.examName?.trim() || fileName.replace(/\.[^.]+$/, ''),
        boardName: body.boardName?.trim() || 'Pending Review',
        category: 'competitive',
        classLabel: body.classLabel?.trim() || 'General',
        academicSession: body.academicSession?.trim() || '2026-27',
        subjectHint: body.subjectHint?.trim() || undefined,
        language: body.language || 'english',
        subjects: [],
        status: 'Failed',
        errorMessage: norm.message || 'Failed to process syllabus file.',
        uploadedAt: now,
        updatedAt: now,
      };
      db.syllabusUploads.unshift(failedRecord);
      writeDb(db);

      const errMsg = norm.message || 'Failed to process syllabus file.';
      const status =
        norm.status === 500 && /empty|no readable text/i.test(errMsg) ? 400 : norm.status || 400;
      res.status(status).json({
        error: errMsg,
        failedUpload: failedRecord,
      });
    }
  });

  app.put('/api/admin/syllabus/:id', requireAdminAuth, (req, res) => {
    const db = readDb();
    const idx = db.syllabusUploads.findIndex((u) => u.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Uploaded syllabus draft not found.' });
      return;
    }
    const patch = req.body as Partial<SyllabusUploadRecord>;
    db.syllabusUploads[idx] = {
      ...db.syllabusUploads[idx],
      ...patch,
      id: db.syllabusUploads[idx].id,
      status: patch.status === 'Published' ? db.syllabusUploads[idx].status : (patch.status || 'Draft'),
      updatedAt: Date.now(),
    };
    writeDb(db);
    res.json({ upload: db.syllabusUploads[idx] });
  });

  app.post('/api/admin/syllabus/:id/publish', requireAdminAuth, (req, res) => {
    const db = readDb();
    const upload = db.syllabusUploads.find((u) => u.id === req.params.id);
    if (!upload) {
      res.status(404).json({ error: 'Uploaded syllabus record not found.' });
      return;
    }
    const body = (req.body || {}) as Partial<SyllabusUploadRecord> & {
      resolutionMode?: 'replace' | 'new-session' | 'merge';
      targetExamId?: string;
      targetClassId?: string;
    };

    if (body.examName) upload.examName = body.examName;
    if (body.boardName) upload.boardName = body.boardName;
    if (body.category) upload.category = body.category;
    if (body.classLabel) upload.classLabel = body.classLabel;
    if (body.academicSession) upload.academicSession = body.academicSession;
    if (body.subjectHint !== undefined) upload.subjectHint = body.subjectHint;
    if (body.marksSummary !== undefined) upload.marksSummary = body.marksSummary;
    if (Array.isArray(body.availableQuestionFormats)) {
      upload.availableQuestionFormats = body.availableQuestionFormats;
    }
    if (Array.isArray(body.subjects)) {
      upload.subjects = body.subjects;
    }

    if (!Array.isArray(upload.subjects) || upload.subjects.length === 0) {
      res.status(400).json({ error: 'Cannot publish an empty syllabus. Add at least one subject first.' });
      return;
    }

    const { exam, flaggedQuestions } = mergeSyllabusIntoExam(db, upload, {
      resolutionMode: body.resolutionMode,
      targetExamId: body.targetExamId,
      targetClassId: body.targetClassId,
    });
    const catalogVersion = bumpCatalogVersion(db);
    upload.version = catalogVersion;
    writeDb(db);

    broadcastCatalogUpdate('syllabus-published', db, {
      examId: exam.id,
      examName: exam.name,
    });

    res.json({
      upload,
      exam,
      flaggedQuestions,
      stats: computeDashboardStats(db),
      catalogVersion,
    });
  });

  app.delete('/api/admin/syllabus/:id', requireAdminAuth, (req, res) => {
    const db = readDb();
    db.syllabusUploads = db.syllabusUploads.filter((u) => u.id !== req.params.id);
    writeDb(db);
    res.json({ ok: true, stats: computeDashboardStats(db) });
  });

  // ===================== ADMIN UGC NET SYLLABUS & VERSIONING ROUTES =====================

  app.get('/api/admin/ugc-net/syllabuses', requireAdminAuth, (_req, res) => {
    const db = readDb();
    const sorted = [...db.ugcNetSyllabuses].sort((a, b) => b.updatedAt - a.updatedAt);
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      summary: computeUgcNetAdminSummary(db),
      records: sorted,
      catalogVersion: db.catalogVersion,
    });
  });

  app.post('/api/admin/ugc-net/syllabus/process', requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    const body = (req.body || {}) as {
      fileName?: string;
      mimeType?: string;
      fileBase64?: string;
      paperType?: UgcNetPaperType;
      subjectName?: string;
      subjectCode?: string;
      academicSession?: string;
      selectionMode?: AiSelectionMode;
      provider?: ProviderId;
      model?: string;
      allowDuplicate?: boolean;
    };

    if (!body.fileName || !body.fileBase64) {
      res.status(400).json({ error: 'Syllabus file name and file content are required.' });
      return;
    }

    const paperType: UgcNetPaperType = body.paperType === 'paper-2' ? 'paper-2' : 'paper-1';
    if (paperType === 'paper-2' && !body.subjectName?.trim()) {
      res.status(400).json({ error: 'Subject name is required for UGC NET Paper 2.' });
      return;
    }

    const db = readDb();
    const base64Clean = body.fileBase64.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(base64Clean, 'base64');

    let storedFile: { storageKey: string; ext: string; sizeBytes: number; sha256: string };
    try {
      storedFile = saveOriginalUgcNetSyllabusFile(buffer, body.fileName);
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Invalid syllabus file upload.',
      });
      return;
    }

    const subjectMeta = resolveUgcNetSubjectKey(
      paperType,
      body.subjectName,
      body.subjectCode,
    );

    if (!body.allowDuplicate) {
      const dup = findDuplicateUgcNetUpload(
        db,
        storedFile.sha256,
        paperType,
        subjectMeta.subjectId,
      );
      if (dup) {
        // Delete newly written redundant copy immediately
        deletePrivateSyllabusFileIfOrphaned(db, storedFile.storageKey);
        res.status(409).json({
          error: `Duplicate syllabus file detected: "${dup.fileName}" (${dup.versionLabel}, status: ${dup.publicationStatus}) with the same content hash already exists for ${subjectMeta.subjectName}.`,
          duplicateRecord: dup,
        });
        return;
      }
    }

    const now = Date.now();
    const versionId = `ugcver-${crypto.randomUUID().slice(0, 10)}`;
    const priorVersions = db.ugcNetSyllabuses.filter(
      (r) => r.paperType === paperType && r.subjectId === subjectMeta.subjectId,
    );
    const nextVersionNumber =
      priorVersions.reduce((m, r) => Math.max(m, r.versionNumber || 1), 0) + 1;
    const sessionStr = (body.academicSession || '').trim() || '2026-27';

    const paperLabel =
      paperType === 'paper-1'
        ? 'Paper 1 (Teaching & Research Aptitude)'
        : 'Paper 2 (Subject-Specific)';

    try {
      const extracted = await extractSyllabusFileText(
        buffer,
        body.fileName,
        body.mimeType || '',
      );

      const parsed = await analyzeUgcNetSyllabusWithAI({
        extractedText: extracted.text,
        fileName: body.fileName,
        paperType,
        subjectNameHint: paperType === 'paper-2' ? subjectMeta.subjectName : undefined,
        subjectCodeHint: subjectMeta.subjectCode,
        academicSessionHint: sessionStr,
        selectionMode: body.selectionMode || 'auto',
        provider: body.provider,
        model: body.model,
      });

      const finalSubjectMeta = resolveUgcNetSubjectKey(
        paperType,
        body.subjectName?.trim() || parsed.detectedSubjectName || subjectMeta.subjectName,
        body.subjectCode?.trim() || parsed.detectedSubjectCode || subjectMeta.subjectCode,
      );

      const conflict = findActiveUgcNetConflict(
        db,
        paperType,
        finalSubjectMeta.subjectId,
      );

      // Save strictly as Draft (NEVER auto-publish before Admin review)
      const draftRecord: UgcNetSyllabusRecord = {
        id: versionId,
        examId: 'ugc-net',
        paperType,
        paperLabel,
        subjectId: finalSubjectMeta.subjectId,
        subjectName: finalSubjectMeta.subjectName,
        subjectCode: finalSubjectMeta.subjectCode,
        academicSession: parsed.academicSession || sessionStr,
        versionNumber: nextVersionNumber,
        versionLabel: `v${nextVersionNumber} (${parsed.academicSession || sessionStr})`,
        isActivePublished: false,
        publicationStatus: 'Draft',
        fileName: path.basename(body.fileName),
        fileType: extracted.fileType || storedFile.ext,
        fileSizeBytes: storedFile.sizeBytes,
        fileHash: storedFile.sha256,
        originalFileStorageKey: storedFile.storageKey,
        aiProviderUsed: parsed.aiProviderUsed,
        aiModelUsed: parsed.aiModelUsed,
        warnings: parsed.warnings,
        units: parsed.units,
        unitCount: parsed.unitCount,
        topicCount: parsed.topicCount,
        subtopicCount: parsed.subtopicCount,
        uploadedBy: req.auth?.sub || 'admin',
        uploadedAt: now,
        updatedAt: now,
      };

      db.ugcNetSyllabuses.unshift(draftRecord);
      writeDb(db);

      res.json({
        syllabus: draftRecord,
        conflict,
        extractedCharCount: extracted.text.length,
        summary: computeUgcNetAdminSummary(db),
      });
    } catch (err) {
      const normalized = normalizeUpstreamError(err);
      const failedRecord: UgcNetSyllabusRecord = {
        id: versionId,
        examId: 'ugc-net',
        paperType,
        paperLabel,
        subjectId: subjectMeta.subjectId,
        subjectName: subjectMeta.subjectName,
        subjectCode: subjectMeta.subjectCode,
        academicSession: sessionStr,
        versionNumber: nextVersionNumber,
        versionLabel: `v${nextVersionNumber} (${sessionStr})`,
        isActivePublished: false,
        publicationStatus: 'Failed',
        fileName: path.basename(body.fileName),
        fileType: storedFile.ext,
        fileSizeBytes: storedFile.sizeBytes,
        fileHash: storedFile.sha256,
        originalFileStorageKey: storedFile.storageKey,
        warnings: [],
        errorMessage: normalized.message,
        units: [],
        unitCount: 0,
        topicCount: 0,
        subtopicCount: 0,
        uploadedBy: req.auth?.sub || 'admin',
        uploadedAt: now,
        updatedAt: now,
      };
      db.ugcNetSyllabuses.unshift(failedRecord);
      writeDb(db);
      res.status(normalized.status || 422).json({
        error: normalized.message,
        syllabus: failedRecord,
      });
    }
  });

  app.put('/api/admin/ugc-net/syllabuses/:id', requireAdminAuth, (req, res) => {
    const db = readDb();
    const record = db.ugcNetSyllabuses.find((r) => r.id === req.params.id);
    if (!record) {
      res.status(404).json({ error: 'UGC NET syllabus record not found.' });
      return;
    }

    const body = (req.body || {}) as {
      subjectName?: string;
      subjectCode?: string;
      academicSession?: string;
      warnings?: string[];
      units?: UgcNetUnitNode[];
    };

    if (record.paperType === 'paper-2' && typeof body.subjectName === 'string' && body.subjectName.trim()) {
      const nextSub = resolveUgcNetSubjectKey(
        'paper-2',
        body.subjectName,
        typeof body.subjectCode === 'string' ? body.subjectCode : record.subjectCode,
      );
      record.subjectId = nextSub.subjectId;
      record.subjectName = nextSub.subjectName;
      record.subjectCode = nextSub.subjectCode;
    } else if (typeof body.subjectCode === 'string') {
      record.subjectCode = body.subjectCode.trim() || undefined;
    }

    if (typeof body.academicSession === 'string' && body.academicSession.trim()) {
      record.academicSession = body.academicSession.trim();
      record.versionLabel = `v${record.versionNumber} (${record.academicSession})`;
    }

    if (Array.isArray(body.warnings)) {
      record.warnings = body.warnings.map((w) => String(w).trim()).filter(Boolean);
    }

    if (Array.isArray(body.units)) {
      const normalized = normalizeUgcNetUnits(body.units);
      record.units = normalized.units;
      record.unitCount = normalized.unitCount;
      record.topicCount = normalized.topicCount;
      record.subtopicCount = normalized.subtopicCount;
    }

    record.updatedAt = Date.now();

    let flaggedQuestions = 0;
    let catalogVersion = db.catalogVersion;

    // Re-sync published catalog if this is already live
    if (record.isActivePublished && record.publicationStatus === 'Published') {
      syncPublishedUgcNetIntoExams(db);
      flaggedQuestions = flagOutdatedUgcNetQuestions(
        db,
        record.paperType,
        record.subjectId,
        record.units,
        `UGC NET ${record.paperLabel}${record.paperType === 'paper-2' ? ` (${record.subjectName})` : ''} ${record.versionLabel} edited by Admin`,
      );
      catalogVersion = bumpCatalogVersion(db);
    }

    writeDb(db);
    if (record.isActivePublished && record.publicationStatus === 'Published') {
      broadcastCatalogUpdate('ugc-net-syllabus-updated', db, {
        syllabusVersionId: record.id,
        paperType: record.paperType,
        subjectId: record.subjectId,
      });
    }

    res.json({
      syllabus: record,
      conflict: findActiveUgcNetConflict(db, record.paperType, record.subjectId, record.id),
      flaggedQuestions,
      catalogVersion,
      summary: computeUgcNetAdminSummary(db),
    });
  });

  app.post('/api/admin/ugc-net/syllabuses/:id/publish', requireAdminAuth, (req, res) => {
    const db = readDb();
    const record = db.ugcNetSyllabuses.find((r) => r.id === req.params.id);
    if (!record) {
      res.status(404).json({ error: 'UGC NET syllabus record not found.' });
      return;
    }

    const body = (req.body || {}) as {
      resolutionMode?: 'replace' | 'new-version';
      units?: UgcNetUnitNode[];
      academicSession?: string;
      subjectName?: string;
      subjectCode?: string;
    };

    if (record.paperType === 'paper-2' && typeof body.subjectName === 'string' && body.subjectName.trim()) {
      const nextSub = resolveUgcNetSubjectKey(
        'paper-2',
        body.subjectName,
        typeof body.subjectCode === 'string' ? body.subjectCode : record.subjectCode,
      );
      record.subjectId = nextSub.subjectId;
      record.subjectName = nextSub.subjectName;
      record.subjectCode = nextSub.subjectCode;
    }
    if (typeof body.academicSession === 'string' && body.academicSession.trim()) {
      record.academicSession = body.academicSession.trim();
      record.versionLabel = `v${record.versionNumber} (${record.academicSession})`;
    }
    if (Array.isArray(body.units)) {
      const normalized = normalizeUgcNetUnits(body.units);
      record.units = normalized.units;
      record.unitCount = normalized.unitCount;
      record.topicCount = normalized.topicCount;
      record.subtopicCount = normalized.subtopicCount;
    }

    try {
      const mode = body.resolutionMode === 'replace' ? 'replace' : 'new-version';
      const result = publishUgcNetSyllabusVersion(db, record.id, mode);
      const catalogVersion = bumpCatalogVersion(db);
      writeDb(db);

      broadcastCatalogUpdate('ugc-net-syllabus-published', db, {
        syllabusVersionId: result.record.id,
        paperType: result.record.paperType,
        subjectId: result.record.subjectId,
      });

      res.json({
        syllabus: result.record,
        flaggedQuestions: result.flaggedQuestions,
        replacedVersionId: result.replacedVersionId,
        catalogVersion,
        stats: computeDashboardStats(db),
        summary: computeUgcNetAdminSummary(db),
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to publish UGC NET syllabus.' });
    }
  });

  app.post('/api/admin/ugc-net/syllabuses/:id/unpublish', requireAdminAuth, (req, res) => {
    const db = readDb();
    try {
      const result = unpublishUgcNetSyllabusVersion(db, req.params.id);
      const catalogVersion = bumpCatalogVersion(db);
      writeDb(db);

      broadcastCatalogUpdate('ugc-net-syllabus-unpublished', db, {
        syllabusVersionId: result.record.id,
        paperType: result.record.paperType,
        subjectId: result.record.subjectId,
      });

      res.json({
        syllabus: result.record,
        flaggedQuestions: result.flaggedQuestions,
        catalogVersion,
        stats: computeDashboardStats(db),
        summary: computeUgcNetAdminSummary(db),
      });
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Unable to unpublish version.' });
    }
  });

  app.delete('/api/admin/ugc-net/syllabuses/:id', requireAdminAuth, (req, res) => {
    const db = readDb();
    const target = db.ugcNetSyllabuses.find((r) => r.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'UGC NET syllabus record not found.' });
      return;
    }

    const forceDelete = req.query.force === 'true';
    const wasPublished = target.isActivePublished && target.publicationStatus === 'Published';
    if (wasPublished && !forceDelete) {
      res.status(409).json({
        error:
          'This UGC NET syllabus version is currently Published. Unpublish it first before deleting so active student exams are not interrupted.',
      });
      return;
    }

    const referencingQuestions = db.questions.filter(
      (q) => q.syllabusVersionId === target.id,
    ).length;
    if (referencingQuestions > 0 && !forceDelete) {
      if (target.publicationStatus !== 'Archived') {
        target.publicationStatus = 'Archived';
        target.isActivePublished = false;
        target.updatedAt = Date.now();
        writeDb(db);
      }
      res.status(409).json({
        error: `Cannot permanently delete ${target.versionLabel} because ${referencingQuestions} Question Bank record(s) reference this version. It remains safely Archived to preserve traceability.`,
        archived: true,
        referencingQuestions,
        summary: computeUgcNetAdminSummary(db),
      });
      return;
    }

    db.ugcNetSyllabuses = db.ugcNetSyllabuses.filter((r) => r.id !== target.id);
    deletePrivateSyllabusFileIfOrphaned(db, target.originalFileStorageKey);

    let catalogVersion = db.catalogVersion;
    if (wasPublished) {
      syncPublishedUgcNetIntoExams(db);
      flagOutdatedUgcNetQuestions(
        db,
        target.paperType,
        target.subjectId,
        [],
        `UGC NET ${target.paperLabel}${target.paperType === 'paper-2' ? ` (${target.subjectName})` : ''} deleted by Admin`,
      );
      catalogVersion = bumpCatalogVersion(db);
    }
    writeDb(db);
    if (wasPublished) {
      broadcastCatalogUpdate('ugc-net-syllabus-deleted', db, { syllabusVersionId: target.id });
    }
    res.json({
      ok: true,
      catalogVersion,
      stats: computeDashboardStats(db),
      summary: computeUgcNetAdminSummary(db),
    });
  });

  app.get('/api/admin/ugc-net/syllabuses/:id/file', requireAdminAuth, (req, res) => {
    const db = readDb();
    const target = db.ugcNetSyllabuses.find((r) => r.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'UGC NET syllabus record not found.' });
      return;
    }
    try {
      const safePath = resolveSafeSyllabusFilePath(target.originalFileStorageKey);
      if (!fs.existsSync(safePath)) {
        res.status(404).json({ error: 'Original preserved syllabus file is missing from storage.' });
        return;
      }
      const ext = path.extname(target.fileName).toLowerCase();
      const mimeMap: Record<string, string> = {
        '.pdf': 'application/pdf',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.doc': 'application/msword',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.xls': 'application/vnd.ms-excel',
        '.csv': 'text/csv; charset=utf-8',
        '.txt': 'text/plain; charset=utf-8',
      };
      res.setHeader('Content-Type', mimeMap[ext] || 'application/octet-stream');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${path.basename(target.fileName).replace(/"/g, '')}"`,
      );
      res.setHeader('Cache-Control', 'no-store, private');
      res.send(fs.readFileSync(safePath));
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unable to stream syllabus file.' });
    }
  });

  // ===================== ADMIN UPSC SYLLABUS STUDIO APIS =====================

  app.get('/api/admin/upsc/syllabuses', requireAdminAuth, (_req, res) => {
    const db = readDb();
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.json({
      summary: computeUpscAdminSummary(db),
      records: [...db.upscSyllabuses].sort((a, b) => b.updatedAt - a.updatedAt),
      catalogVersion: db.catalogVersion,
    });
  });

  // Upload & AI-parse UPSC syllabus into a Draft (NEVER auto-published)
  app.post('/api/admin/upsc/syllabus/process', requireAdminAuth, async (req, res) => {
    try {
      const body = (req.body || {}) as {
        fileName?: string;
        mimeType?: string;
        fileBase64?: string;
        paperId?: UpscPaperId;
        optionalSubjectName?: string;
        examYear?: string;
        selectionMode?: AiSelectionMode;
        provider?: ProviderId;
        model?: string;
      };

      const fileName = String(body.fileName || '').trim() || 'upsc-syllabus.pdf';
      const base64 = String(body.fileBase64 || '').trim();
      const paperId: UpscPaperId = (body.paperId || 'prelims-gs-1') as UpscPaperId;

      if (!base64) {
        res.status(400).json({ error: 'Please select a UPSC syllabus file to upload.' });
        return;
      }

      const cleanB64 = base64.includes(',') ? base64.split(',').pop()! : base64;
      const buffer = Buffer.from(cleanB64, 'base64');
      const savedFile = saveOriginalUpscSyllabusFile(buffer, fileName);

      const extracted = await extractSyllabusFileText(
        buffer,
        fileName,
        String(body.mimeType || ''),
      );

      let parsed;
      try {
        parsed = await analyzeUpscSyllabusWithAI({
          extractedText: extracted.text,
          fileName,
          paperId,
          optionalSubjectHint: body.optionalSubjectName,
          examYearHint: body.examYear,
          selectionMode: body.selectionMode,
          provider: body.provider,
          model: body.model,
        });
      } catch (parseErr) {
        const db = readDb();
        const meta = resolveUpscSubjectMetadata({
          paperId,
          optionalSubjectName: body.optionalSubjectName,
        });
        const now = Date.now();
        const failedRecord: UpscSyllabusRecord = {
          syllabusVersionId: `upsc-syl-${crypto.randomUUID().slice(0, 8)}`,
          stage: meta.stage,
          paperId,
          paperLabel: meta.paperLabel,
          subjectId: meta.subjectId,
          subjectName: meta.subjectName,
          optionalSubjectName: meta.optionalSubjectName,
          examYear: String(body.examYear || '2026').trim() || '2026',
          versionNumber: 1,
          versionLabel: `Draft (${String(body.examYear || '2026').trim() || '2026'})`,
          isActivePublished: false,
          publicationStatus: 'Failed',
          markingPattern: getDefaultUpscMarkingPattern(paperId),
          fileName,
          fileType: savedFile.ext,
          fileSizeBytes: savedFile.sizeBytes,
          fileHash: savedFile.sha256,
          originalFileStorageKey: savedFile.storageKey,
          areaCount: 0,
          topicCount: 0,
          subtopicCount: 0,
          areas: [],
          errorMessage:
            parseErr instanceof Error
              ? parseErr.message
              : 'Unable to extract structured UPSC syllabus from file.',
          uploadedAt: now,
          updatedAt: now,
          uploadedBy: (req as AuthenticatedRequest).auth?.sub || 'Admin',
        };
        db.upscSyllabuses.unshift(failedRecord);
        writeDb(db);
        res.status(422).json({
          error: failedRecord.errorMessage,
          failedRecord,
          summary: computeUpscAdminSummary(db),
        });
        return;
      }

      const resolvedMeta = resolveUpscSubjectMetadata({
        paperId,
        optionalSubjectName:
          paperId === 'mains-optional'
            ? body.optionalSubjectName?.trim() || parsed.detectedOptionalSubject
            : undefined,
      });

      const db = readDb();
      const duplicate = findDuplicateUpscUpload(
        db,
        savedFile.sha256,
        paperId,
        resolvedMeta.subjectId,
      );
      if (duplicate) {
        deletePrivateSyllabusFileIfOrphaned(db, savedFile.storageKey);
        const conflict = findActiveUpscConflict(
          db,
          paperId,
          resolvedMeta.subjectId,
          duplicate.syllabusVersionId,
        );
        res.json({
          duplicateDetected: true,
          message: `Identical file already uploaded as ${duplicate.versionLabel} (${duplicate.publicationStatus}). Loaded existing record for review.`,
          draft: duplicate,
          conflict,
          summary: computeUpscAdminSummary(db),
        });
        return;
      }

      const maxVer = db.upscSyllabuses
        .filter((r) => r.paperId === paperId && r.subjectId === resolvedMeta.subjectId)
        .reduce((m, r) => Math.max(m, r.versionNumber || 0), 0);

      const nextVer = maxVer + 1;
      const now = Date.now();
      const examYear = (body.examYear?.trim() || parsed.examYear || '2026').trim();

      const draftRecord: UpscSyllabusRecord = {
        syllabusVersionId: `upsc-syl-${crypto.randomUUID().slice(0, 8)}`,
        stage: resolvedMeta.stage,
        paperId,
        paperLabel: resolvedMeta.paperLabel,
        subjectId: resolvedMeta.subjectId,
        subjectName: resolvedMeta.subjectName,
        optionalSubjectName: resolvedMeta.optionalSubjectName,
        examYear,
        versionNumber: nextVer,
        versionLabel: `v${nextVer} (${examYear})`,
        isActivePublished: false,
        publicationStatus: 'Draft',
        markingPattern: parsed.markingPattern,
        fileName,
        fileType: savedFile.ext,
        fileSizeBytes: savedFile.sizeBytes,
        fileHash: savedFile.sha256,
        originalFileStorageKey: savedFile.storageKey,
        areaCount: parsed.areaCount,
        topicCount: parsed.topicCount,
        subtopicCount: parsed.subtopicCount,
        areas: parsed.areas,
        warnings: parsed.warnings.length > 0 ? parsed.warnings : undefined,
        aiProviderUsed: parsed.aiProviderUsed as ProviderId,
        aiModelUsed: parsed.aiModelUsed,
        uploadedAt: now,
        processedAt: now,
        updatedAt: now,
        uploadedBy: (req as AuthenticatedRequest).auth?.sub || 'Admin',
      };

      db.upscSyllabuses.unshift(draftRecord);
      writeDb(db);

      const conflict = findActiveUpscConflict(
        db,
        paperId,
        resolvedMeta.subjectId,
        draftRecord.syllabusVersionId,
      );

      res.json({
        duplicateDetected: false,
        draft: draftRecord,
        conflict,
        summary: computeUpscAdminSummary(db),
      });
    } catch (err) {
      const normalized = normalizeUpstreamError(err);
      res.status(normalized.status).json({ error: normalized.message });
    }
  });

  // Edit extracted UPSC areas/topics/subtopics, marking pattern, optional name, or examYear
  app.put('/api/admin/upsc/syllabuses/:id', requireAdminAuth, (req, res) => {
    try {
      const db = readDb();
      const idx = db.upscSyllabuses.findIndex((r) => r.syllabusVersionId === req.params.id);
      if (idx === -1) {
        res.status(404).json({ error: 'UPSC syllabus record not found.' });
        return;
      }

      const existing = db.upscSyllabuses[idx];
      const body = (req.body || {}) as {
        optionalSubjectName?: string;
        examYear?: string;
        markingPattern?: Partial<UpscMarkingPattern>;
        areas?: UpscAreaNode[];
      };

      const resolvedMeta = resolveUpscSubjectMetadata({
        paperId: existing.paperId,
        optionalSubjectName:
          existing.paperId === 'mains-optional'
            ? body.optionalSubjectName ?? existing.optionalSubjectName
            : undefined,
      });

      const norm = normalizeUpscAreas(body.areas ?? existing.areas);
      if (norm.areaCount === 0) {
        res.status(400).json({ error: 'UPSC syllabus must retain at least one subject/area.' });
        return;
      }

      const nextYear =
        typeof body.examYear === 'string' && body.examYear.trim()
          ? body.examYear.trim()
          : existing.examYear;

      const updatedPattern: UpscMarkingPattern = body.markingPattern
        ? {
            ...existing.markingPattern,
            ...body.markingPattern,
          }
        : existing.markingPattern;

      const updated: UpscSyllabusRecord = {
        ...existing,
        subjectId: resolvedMeta.subjectId,
        subjectName: resolvedMeta.subjectName,
        optionalSubjectName: resolvedMeta.optionalSubjectName,
        examYear: nextYear,
        versionLabel: `v${existing.versionNumber} (${nextYear})`,
        markingPattern: updatedPattern,
        areas: norm.areas,
        areaCount: norm.areaCount,
        topicCount: norm.topicCount,
        subtopicCount: norm.subtopicCount,
        updatedAt: Date.now(),
      };

      db.upscSyllabuses[idx] = updated;

      let flaggedQuestions = 0;
      let catalogVersion = db.catalogVersion;
      if (updated.isActivePublished && updated.publicationStatus === 'Published') {
        syncPublishedUpscIntoExams(db);
        flaggedQuestions = flagOutdatedUpscQuestions(
          db,
          updated.paperId,
          updated.subjectId,
          updated.areas,
          `UPSC ${updated.paperLabel} (${updated.subjectName}) ${updated.versionLabel} edited by Admin`,
        );
        catalogVersion = bumpCatalogVersion(db);
      }

      writeDb(db);
      if (updated.isActivePublished && updated.publicationStatus === 'Published') {
        broadcastCatalogUpdate('upsc-syllabus-updated', db, {
          syllabusVersionId: updated.syllabusVersionId,
          paperId: updated.paperId,
        });
      }

      const conflict = findActiveUpscConflict(
        db,
        updated.paperId,
        updated.subjectId,
        updated.syllabusVersionId,
      );

      res.json({
        syllabus: updated,
        conflict,
        flaggedQuestions,
        catalogVersion,
        stats: computeDashboardStats(db),
        summary: computeUpscAdminSummary(db),
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to update UPSC syllabus.' });
    }
  });

  app.post('/api/admin/upsc/syllabuses/:id/publish', requireAdminAuth, (req, res) => {
    try {
      const db = readDb();
      const target = db.upscSyllabuses.find((r) => r.syllabusVersionId === req.params.id);
      if (!target) {
        res.status(404).json({ error: 'UPSC syllabus draft/version not found.' });
        return;
      }

      const body = (req.body || {}) as {
        resolutionMode?: 'replace' | 'new-version';
      };

      const conflict = findActiveUpscConflict(
        db,
        target.paperId,
        target.subjectId,
        target.syllabusVersionId,
      );
      if (conflict.hasConflict && !body.resolutionMode) {
        res.status(409).json({
          error: conflict.message,
          conflict,
        });
        return;
      }

      const result = publishUpscSyllabusVersion(
        db,
        target.syllabusVersionId,
        body.resolutionMode || 'new-version',
      );
      const catalogVersion = bumpCatalogVersion(db);
      writeDb(db);

      broadcastCatalogUpdate('upsc-syllabus-published', db, {
        syllabusVersionId: result.record.syllabusVersionId,
        paperId: result.record.paperId,
        subjectId: result.record.subjectId,
      });

      res.json({
        syllabus: result.record,
        flaggedQuestions: result.flaggedQuestions,
        replacedVersionId: result.replacedVersionId,
        catalogVersion,
        stats: computeDashboardStats(db),
        summary: computeUpscAdminSummary(db),
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to publish UPSC syllabus.' });
    }
  });

  app.post('/api/admin/upsc/syllabuses/:id/unpublish', requireAdminAuth, (req, res) => {
    try {
      const db = readDb();
      const result = unpublishUpscSyllabusVersion(db, req.params.id);
      const catalogVersion = bumpCatalogVersion(db);
      writeDb(db);

      broadcastCatalogUpdate('upsc-syllabus-unpublished', db, {
        syllabusVersionId: result.record.syllabusVersionId,
        paperId: result.record.paperId,
        subjectId: result.record.subjectId,
      });

      res.json({
        syllabus: result.record,
        flaggedQuestions: result.flaggedQuestions,
        catalogVersion,
        stats: computeDashboardStats(db),
        summary: computeUpscAdminSummary(db),
      });
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Unable to unpublish UPSC syllabus.' });
    }
  });

  app.delete('/api/admin/upsc/syllabuses/:id', requireAdminAuth, (req, res) => {
    const db = readDb();
    const target = db.upscSyllabuses.find((r) => r.syllabusVersionId === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'UPSC syllabus record not found.' });
      return;
    }

    const forceDelete = req.query.force === 'true';
    const wasPublished = target.isActivePublished && target.publicationStatus === 'Published';
    if (wasPublished && !forceDelete) {
      res.status(409).json({
        error:
          'This UPSC syllabus version is currently Published. Unpublish it first before deleting so active student exams are not interrupted.',
      });
      return;
    }

    const referencingQuestions = db.questions.filter(
      (q) => q.syllabusVersionId === target.syllabusVersionId,
    ).length;
    if (referencingQuestions > 0 && !forceDelete) {
      if (target.publicationStatus !== 'Archived') {
        target.publicationStatus = 'Archived';
        target.isActivePublished = false;
        target.updatedAt = Date.now();
        writeDb(db);
      }
      res.status(409).json({
        error: `Cannot permanently delete ${target.versionLabel} because ${referencingQuestions} Question Bank record(s) reference this version. It remains safely Archived to preserve traceability.`,
        archived: true,
        referencingQuestions,
        summary: computeUpscAdminSummary(db),
      });
      return;
    }

    db.upscSyllabuses = db.upscSyllabuses.filter(
      (r) => r.syllabusVersionId !== target.syllabusVersionId,
    );
    deletePrivateSyllabusFileIfOrphaned(db, target.originalFileStorageKey);

    let catalogVersion = db.catalogVersion;
    if (wasPublished) {
      syncPublishedUpscIntoExams(db);
      flagOutdatedUpscQuestions(
        db,
        target.paperId,
        target.subjectId,
        [],
        `UPSC ${target.paperLabel} (${target.subjectName}) deleted by Admin`,
      );
      catalogVersion = bumpCatalogVersion(db);
    }
    writeDb(db);
    if (wasPublished) {
      broadcastCatalogUpdate('upsc-syllabus-deleted', db, {
        syllabusVersionId: target.syllabusVersionId,
      });
    }
    res.json({
      ok: true,
      catalogVersion,
      stats: computeDashboardStats(db),
      summary: computeUpscAdminSummary(db),
    });
  });

  app.get('/api/admin/upsc/syllabuses/:id/file', requireAdminAuth, (req, res) => {
    const db = readDb();
    const target = db.upscSyllabuses.find((r) => r.syllabusVersionId === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'UPSC syllabus record not found.' });
      return;
    }
    try {
      const safePath = resolveSafeSyllabusFilePath(target.originalFileStorageKey);
      if (!fs.existsSync(safePath)) {
        res.status(404).json({ error: 'Original preserved syllabus file is missing from storage.' });
        return;
      }
      const ext = path.extname(target.fileName).toLowerCase();
      const mimeMap: Record<string, string> = {
        '.pdf': 'application/pdf',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.doc': 'application/msword',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.xls': 'application/vnd.ms-excel',
        '.csv': 'text/csv; charset=utf-8',
        '.txt': 'text/plain; charset=utf-8',
      };
      res.setHeader('Content-Type', mimeMap[ext] || 'application/octet-stream');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${path.basename(target.fileName).replace(/"/g, '')}"`,
      );
      res.setHeader('Cache-Control', 'no-store, private');
      res.send(fs.readFileSync(safePath));
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unable to stream syllabus file.' });
    }
  });

  // Centralized Exams CRUD (updates Mock Test + Question Generation + PDF Notes automatically)
  app.post('/api/admin/exams', requireAdminAuth, (req, res) => {
    const db = readDb();
    const incoming = req.body as ExamDefinition;
    if (!incoming?.name?.trim()) {
      res.status(400).json({ error: 'Exam name is required.' });
      return;
    }
    const now = Date.now();
    const exam: ExamDefinition = {
      ...incoming,
      id: incoming.id || `exam-${now.toString(36)}`,
      status: incoming.status || 'Published',
      academicSession: incoming.academicSession || '2025-26',
      updatedAt: now,
    };
    db.exams.push(exam);
    if (exam.status !== 'Draft') {
      bumpCatalogVersion(db);
    }
    writeDb(db);
    if (exam.status !== 'Draft') {
      broadcastCatalogUpdate('exam-created', db, { examId: exam.id });
    }
    res.json({ exam, stats: computeDashboardStats(db) });
  });

  app.put('/api/admin/exams/:id', requireAdminAuth, (req, res) => {
    const db = readDb();
    const idx = db.exams.findIndex((e) => e.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Examination not found.' });
      return;
    }
    const updated = req.body as ExamDefinition;
    db.exams[idx] = {
      ...db.exams[idx],
      ...updated,
      id: db.exams[idx].id,
      updatedAt: Date.now(),
    };
    const flagged = flagAffectedQuestionsForExam(
      db,
      db.exams[idx].id,
      `Exam "${db.exams[idx].name}" syllabus updated by Admin`,
    );
    bumpCatalogVersion(db);
    writeDb(db);
    broadcastCatalogUpdate('exam-updated', db, { examId: db.exams[idx].id });
    res.json({ exam: db.exams[idx], flaggedQuestions: flagged, stats: computeDashboardStats(db) });
  });

  app.delete('/api/admin/exams/:id', requireAdminAuth, (req, res) => {
    const db = readDb();
    const targetId = req.params.id;
    const before = db.exams.length;
    db.exams = db.exams.filter((e) => e.id !== targetId);
    if (db.exams.length === before) {
      res.status(404).json({ error: 'Examination not found.' });
      return;
    }
    // Preserve questions & flag them for Admin review rather than silently destroying
    let flagged = 0;
    for (const q of db.questions) {
      if (q.examId === targetId) {
        q.needsReview = true;
        q.syllabusChangeReason = 'Parent examination was deleted by Admin';
        q.updatedAt = Date.now();
        flagged++;
      }
    }
    bumpCatalogVersion(db);
    writeDb(db);
    broadcastCatalogUpdate('exam-deleted', db, { examId: targetId });
    res.json({ ok: true, flaggedQuestions: flagged, stats: computeDashboardStats(db) });
  });

  // Admin Question Bank CRUD & Bulk Upload
  app.get('/api/admin/questions', requireAdminAuth, (_req, res) => {
    const db = readDb();
    res.json({ questions: db.questions });
  });

  app.post('/api/admin/questions', requireAdminAuth, (req, res) => {
    const db = readDb();
    const body = req.body as Partial<AdminQuestionRecord>;
    if (!body.question?.trim() || !body.correctAnswer?.trim() || !body.examId) {
      res.status(400).json({ error: 'Question stem, exam, and correct answer are required.' });
      return;
    }
    const now = Date.now();
    const rec: AdminQuestionRecord = {
      id: `q-${crypto.randomUUID().slice(0, 8)}`,
      examId: body.examId,
      examName: body.examName || '',
      classId: body.classId || '',
      classLabel: body.classLabel || '',
      subject: body.subject || '',
      chapter: body.chapter || '',
      topic: body.topic || 'All Chapter Topics',
      typeId: body.typeId || 'MCQ',
      marks: Number(body.marks) || 1,
      difficulty: body.difficulty || 'Medium',
      language: body.language || 'english',
      question: body.question.trim(),
      passageOrCase: body.passageOrCase?.trim() || undefined,
      diagramDescription: body.diagramDescription?.trim() || undefined,
      assertionText: body.assertionText?.trim() || undefined,
      reasonText: body.reasonText?.trim() || undefined,
      matchColumns: body.matchColumns,
      sequenceItems: body.sequenceItems,
      options: Array.isArray(body.options) ? body.options : undefined,
      correctAnswer: body.correctAnswer.trim(),
      correctOptionIndices: body.correctOptionIndices,
      keyPoints: body.keyPoints,
      explanation: (body.explanation || '').trim() || 'Refer to syllabus notes.',
      paperId: body.paperId,
      subjectId: body.subjectId,
      syllabusVersionId: body.syllabusVersionId,
      unitId: body.unitId,
      topicId: body.topicId,
      subtopicId: body.subtopicId,
      needsReview: false,
      createdAt: now,
      updatedAt: now,
    };
    db.questions.unshift(rec);
    bumpCatalogVersion(db);
    writeDb(db);
    broadcastCatalogUpdate('question-created', db, { examId: rec.examId });
    res.json({ question: rec, stats: computeDashboardStats(db) });
  });

  app.post('/api/admin/questions/bulk', requireAdminAuth, (req, res) => {
    const db = readDb();
    const body = req.body as { items?: Array<Partial<AdminQuestionRecord>> };
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) {
      res.status(400).json({ error: 'Provide an array of questions in items.' });
      return;
    }
    const now = Date.now();
    const added: AdminQuestionRecord[] = [];
    for (const item of items) {
      if (!item.question?.trim() || !item.correctAnswer?.trim() || !item.examId) continue;
      const rec: AdminQuestionRecord = {
        id: `q-${crypto.randomUUID().slice(0, 8)}`,
        examId: item.examId,
        examName: item.examName || '',
        classId: item.classId || '',
        classLabel: item.classLabel || '',
        subject: item.subject || '',
        chapter: item.chapter || '',
        topic: item.topic || 'All Chapter Topics',
        typeId: item.typeId || 'MCQ',
        marks: Number(item.marks) || 1,
        difficulty: item.difficulty || 'Medium',
        language: item.language || 'english',
        question: item.question.trim(),
        options: Array.isArray(item.options) ? item.options : undefined,
        correctAnswer: item.correctAnswer.trim(),
        correctOptionIndices: item.correctOptionIndices,
        keyPoints: item.keyPoints,
        explanation: (item.explanation || '').trim() || 'Standard solution.',
        paperId: item.paperId,
        subjectId: item.subjectId,
        syllabusVersionId: item.syllabusVersionId,
        unitId: item.unitId,
        topicId: item.topicId,
        subtopicId: item.subtopicId,
        needsReview: false,
        createdAt: now,
        updatedAt: now,
      };
      db.questions.unshift(rec);
      added.push(rec);
    }
    bumpCatalogVersion(db);
    writeDb(db);
    broadcastCatalogUpdate('questions-bulk-created', db, { count: added.length });
    res.json({ addedCount: added.length, questions: added, stats: computeDashboardStats(db) });
  });

  app.put('/api/admin/questions/:id', requireAdminAuth, (req, res) => {
    const db = readDb();
    const idx = db.questions.findIndex((q) => q.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Question not found.' });
      return;
    }
    const patch = req.body as Partial<AdminQuestionRecord>;
    db.questions[idx] = {
      ...db.questions[idx],
      ...patch,
      id: db.questions[idx].id,
      updatedAt: Date.now(),
    };
    bumpCatalogVersion(db);
    writeDb(db);
    broadcastCatalogUpdate('question-updated', db, { examId: db.questions[idx].examId });
    res.json({ question: db.questions[idx], stats: computeDashboardStats(db) });
  });

  app.delete('/api/admin/questions/:id', requireAdminAuth, (req, res) => {
    const db = readDb();
    db.questions = db.questions.filter((q) => q.id !== req.params.id);
    bumpCatalogVersion(db);
    writeDb(db);
    broadcastCatalogUpdate('question-deleted', db);
    res.json({ ok: true, stats: computeDashboardStats(db) });
  });

  // Admin PDF Notes Management (Private Storage)
  app.get('/api/admin/pdf-notes', requireAdminAuth, (_req, res) => {
    const db = readDb();
    res.json({ notes: db.pdfNotes.map(stripPdfPrivateFields) });
  });

  app.post('/api/admin/pdf-notes', requireAdminAuth, async (req, res) => {
    try {
      const body = (req.body || {}) as {
        title?: string;
        description?: string;
        noteCategory?: PdfNoteCategory;
        examId?: string;
        examName?: string;
        classId?: string;
        classLabel?: string;
        subject?: string;
        bookName?: string;
        ncertClass?: string;
        upscStage?: UpscStage;
        upscPaper?: string;
        chapter?: string;
        topic?: string;
        language?: MockLanguage;
        published?: boolean;
        fileName?: string;
        fileBase64?: string;
      };

      const title = String(body.title || '').trim();
      const fileName = String(body.fileName || '').trim() || 'notes.pdf';
      const base64 = String(body.fileBase64 || '').trim();
      const noteCategory: PdfNoteCategory =
        body.noteCategory === 'ncert' || body.noteCategory === 'upsc' ? body.noteCategory : 'exam';
      const resolvedExamId =
        body.examId?.trim() ||
        (noteCategory === 'ncert' ? 'ncert-notes' : noteCategory === 'upsc' ? 'upsc-cse' : '');

      if (!title || !base64 || !resolvedExamId || !body.subject) {
        res.status(400).json({ error: 'Title, Exam/Category, Subject, and PDF file are required.' });
        return;
      }

      const cleanB64 = base64.includes(',') ? base64.split(',').pop()! : base64;
      const buffer = Buffer.from(cleanB64, 'base64');
      const { storageKey, size } = savePrivatePdfBuffer(buffer);

      let pageCount = 1;
      try {
        const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
        pageCount = doc.numPages;
      } catch {
        // Keep pageCount 1 if non-standard header metadata
      }

      const now = Date.now();
      const stored: PdfNoteStored = {
        id: `pdfnote-${crypto.randomUUID().slice(0, 8)}`,
        title,
        description: String(body.description || '').trim(),
        noteCategory,
        examId: resolvedExamId,
        examName:
          body.examName?.trim() ||
          (noteCategory === 'ncert'
            ? 'NCERT Notes'
            : noteCategory === 'upsc'
              ? 'UPSC – Civil Services Examination'
              : ''),
        classId:
          body.classId?.trim() ||
          (noteCategory === 'ncert' && body.ncertClass
            ? `ncert-${body.ncertClass.toLowerCase().replace(/\s+/g, '-')}`
            : ''),
        classLabel: body.classLabel?.trim() || body.ncertClass?.trim() || body.upscPaper?.trim() || '',
        subject: body.subject.trim(),
        bookName: body.bookName?.trim() || undefined,
        ncertClass: body.ncertClass?.trim() || undefined,
        upscStage: body.upscStage,
        upscPaper: body.upscPaper?.trim() || undefined,
        chapter: body.chapter?.trim() || 'All Chapters',
        topic: body.topic?.trim() || '',
        language: body.language || 'english',
        published: Boolean(body.published),
        fileName,
        fileSize: size,
        pageCount,
        storageKey,
        createdAt: now,
        updatedAt: now,
      };

      const db = readDb();
      db.pdfNotes.unshift(stored);
      bumpCatalogVersion(db);
      writeDb(db);
      broadcastCatalogUpdate('pdf-note-created', db, { noteId: stored.id });
      res.json({ note: stripPdfPrivateFields(stored), stats: computeDashboardStats(db) });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'PDF upload failed.' });
    }
  });

  app.put('/api/admin/pdf-notes/:id', requireAdminAuth, async (req, res) => {
    try {
      const db = readDb();
      const idx = db.pdfNotes.findIndex((n) => n.id === req.params.id);
      if (idx === -1) {
        res.status(404).json({ error: 'PDF note not found.' });
        return;
      }

      const existing = db.pdfNotes[idx];
      const body = (req.body || {}) as {
        title?: string;
        description?: string;
        noteCategory?: PdfNoteCategory;
        examId?: string;
        examName?: string;
        classId?: string;
        classLabel?: string;
        subject?: string;
        bookName?: string;
        ncertClass?: string;
        upscStage?: UpscStage;
        upscPaper?: string;
        chapter?: string;
        topic?: string;
        language?: MockLanguage;
        published?: boolean;
        fileName?: string;
        fileBase64?: string;
      };

      let nextStorageKey = existing.storageKey;
      let nextFileSize = existing.fileSize;
      let nextPageCount = existing.pageCount;
      let nextFileName = existing.fileName;

      if (body.fileBase64 && body.fileBase64.trim()) {
        const cleanB64 = body.fileBase64.includes(',')
          ? body.fileBase64.split(',').pop()!
          : body.fileBase64;
        const buffer = Buffer.from(cleanB64, 'base64');
        const saved = savePrivatePdfBuffer(buffer);
        deletePrivatePdfFile(existing.storageKey);
        nextStorageKey = saved.storageKey;
        nextFileSize = saved.size;
        nextFileName = body.fileName || existing.fileName;
        try {
          const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
          nextPageCount = doc.numPages;
        } catch {
          nextPageCount = 1;
        }
      }

      db.pdfNotes[idx] = {
        ...existing,
        title: body.title !== undefined ? body.title.trim() : existing.title,
        description: body.description !== undefined ? body.description.trim() : existing.description,
        noteCategory: body.noteCategory ?? existing.noteCategory ?? 'exam',
        examId: body.examId ?? existing.examId,
        examName: body.examName ?? existing.examName,
        classId: body.classId ?? existing.classId,
        classLabel: body.classLabel ?? existing.classLabel,
        subject: body.subject ?? existing.subject,
        bookName: body.bookName !== undefined ? body.bookName.trim() || undefined : existing.bookName,
        ncertClass: body.ncertClass !== undefined ? body.ncertClass.trim() || undefined : existing.ncertClass,
        upscStage: body.upscStage !== undefined ? body.upscStage : existing.upscStage,
        upscPaper: body.upscPaper !== undefined ? body.upscPaper.trim() || undefined : existing.upscPaper,
        chapter: body.chapter ?? existing.chapter,
        topic: body.topic ?? existing.topic,
        language: body.language ?? existing.language,
        published: body.published !== undefined ? body.published : existing.published,
        fileName: nextFileName,
        fileSize: nextFileSize,
        pageCount: nextPageCount,
        storageKey: nextStorageKey,
        updatedAt: Date.now(),
      };

      bumpCatalogVersion(db);
      writeDb(db);
      broadcastCatalogUpdate('pdf-note-updated', db, { noteId: db.pdfNotes[idx].id });
      res.json({
        note: stripPdfPrivateFields(db.pdfNotes[idx]),
        stats: computeDashboardStats(db),
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'PDF update failed.' });
    }
  });

  app.delete('/api/admin/pdf-notes/:id', requireAdminAuth, (req, res) => {
    const db = readDb();
    const target = db.pdfNotes.find((n) => n.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'PDF note not found.' });
      return;
    }
    deletePrivatePdfFile(target.storageKey);
    db.pdfNotes = db.pdfNotes.filter((n) => n.id !== req.params.id);
    bumpCatalogVersion(db);
    writeDb(db);
    broadcastCatalogUpdate('pdf-note-deleted', db, { noteId: target.id });
    res.json({ ok: true, stats: computeDashboardStats(db) });
  });

  // Admin Student Management
  app.get('/api/admin/students', requireAdminAuth, (_req, res) => {
    const db = readDb();
    res.json({ students: db.students.map(stripStudentPrivateFields) });
  });

  app.post('/api/admin/students', requireAdminAuth, (req, res) => {
    const db = readDb();
    const body = (req.body || {}) as Partial<StudentRecord>;
    if (!body.name?.trim() || !body.email?.trim()) {
      res.status(400).json({ error: 'Student name and email are required.' });
      return;
    }
    const now = Date.now();
    const rec: StoredStudentRecord = {
      id: `stu-${crypto.randomUUID().slice(0, 8)}`,
      name: body.name.trim(),
      email: body.email.trim().toLowerCase(),
      rollNumber: body.rollNumber?.trim() || undefined,
      classLevel: body.classLevel?.trim() || 'Class 10',
      examId: body.examId?.trim() || undefined,
      active: body.active !== undefined ? body.active : true,
      registeredAt: now,
      lastActiveAt: now,
    };
    db.students.unshift(rec);
    writeDb(db);
    res.json({ student: stripStudentPrivateFields(rec), stats: computeDashboardStats(db) });
  });

  app.patch('/api/admin/students/:id', requireAdminAuth, (req, res) => {
    const db = readDb();
    const stu = db.students.find((s) => s.id === req.params.id);
    if (!stu) {
      res.status(404).json({ error: 'Student not found.' });
      return;
    }
    const patch = req.body as Partial<StudentRecord>;
    Object.assign(stu, {
      name: patch.name !== undefined ? patch.name : stu.name,
      classLevel: patch.classLevel !== undefined ? patch.classLevel : stu.classLevel,
      rollNumber: patch.rollNumber !== undefined ? patch.rollNumber : stu.rollNumber,
      active: patch.active !== undefined ? patch.active : stu.active,
    });
    writeDb(db);
    res.json({ student: stripStudentPrivateFields(stu), stats: computeDashboardStats(db) });
  });

  app.delete('/api/admin/students/:id', requireAdminAuth, (req, res) => {
    const db = readDb();
    db.students = db.students.filter((s) => s.id !== req.params.id);
    writeDb(db);
    res.json({ ok: true, stats: computeDashboardStats(db) });
  });

  // ===================== AI ANIMATED EDUCATIONAL VIDEO GENERATOR APIs =====================

  app.get('/api/videos/config', (_req, res) => {
    const cfg = getVideoConfig();
    res.json({
      enabled: cfg.enabled,
      planName: cfg.planName,
      priceInr: cfg.priceInr,
      validityMonths: cfg.validityMonths,
      defaultCredits: cfg.defaultCredits,
      maxDurationMinutes: cfg.maxDurationMinutes,
      allowedLanguages: cfg.allowedLanguages,
      videoQuality: cfg.videoQuality,
      defaultScriptProvider: cfg.defaultScriptProvider,
    });
  });

  app.get('/api/videos/wallet', requireRegisteredStudentAuth, (req: AuthenticatedRequest, res) => {
    const db = readDb();
    const cfg = db.videoConfig;
    const studentId = req.auth!.sub;
    const now = Date.now();

    let sub = db.videoSubscriptions.find((s) => s.studentId === studentId) || null;
    if (sub && sub.status === 'active' && sub.expiresAt <= now) {
      sub.status = 'expired';
      sub.updatedAt = now;
      writeDb(db);
    }

    const hasActiveSubscription = Boolean(
      sub && sub.status === 'active' && sub.expiresAt > now,
    );
    const effectiveCreditsRemaining = hasActiveSubscription && sub ? sub.creditsRemaining : 0;
    const usage = getVideoUsageMetrics(db);

    res.json({
      config: {
        enabled: cfg.enabled,
        planName: cfg.planName,
        priceInr: cfg.priceInr,
        validityMonths: cfg.validityMonths,
        defaultCredits: cfg.defaultCredits,
        maxDurationMinutes: cfg.maxDurationMinutes,
        allowedLanguages: cfg.allowedLanguages,
        videoQuality: cfg.videoQuality,
        defaultScriptProvider: cfg.defaultScriptProvider,
      },
      subscription: sub,
      hasActiveSubscription,
      effectiveCreditsRemaining,
      storageUsedMb: usage.totalStorageMb,
      storageLimitMb: cfg.maxStorageMb,
    });
  });

  app.post(
    '/api/videos/subscription/order',
    requireRegisteredStudentAuth,
    (req: AuthenticatedRequest, res) => {
      const db = readDb();
      const cfg = db.videoConfig;
      const studentId = req.auth!.sub;
      const orderId = `order_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;

      // Server-side authoritative pricing & validity (never trusts client amounts)
      const orderToken = signCheckoutOrder({
        orderId,
        studentId,
        amountInr: cfg.priceInr,
        validityMonths: cfg.validityMonths,
        creditsGranted: cfg.defaultCredits,
        exp: Date.now() + 1000 * 60 * 20,
      });

      const razorpayKeyId = (process.env.RAZORPAY_KEY_ID || '').trim();
      const razorpaySecret = (process.env.RAZORPAY_KEY_SECRET || '').trim();

      res.json({
        orderId,
        orderToken,
        planName: cfg.planName,
        amountInr: cfg.priceInr,
        currency: 'INR',
        validityMonths: cfg.validityMonths,
        creditsGranted: cfg.defaultCredits,
        gatewayMode: razorpayKeyId && razorpaySecret ? 'razorpay' : 'verified-edu-checkout',
        razorpayKeyId: razorpayKeyId && razorpaySecret ? razorpayKeyId : undefined,
      });
    },
  );

  app.post(
    '/api/videos/subscription/verify',
    requireRegisteredStudentAuth,
    (req: AuthenticatedRequest, res) => {
      const body = (req.body || {}) as {
        orderToken?: string;
        paymentId?: string;
        razorpaySignature?: string;
        paymentMethod?: string;
      };
      const verifiedOrder = verifyCheckoutOrderToken(String(body.orderToken || ''));
      if (!verifiedOrder) {
        res.status(400).json({ error: 'Invalid or expired checkout order. Please start checkout again.' });
        return;
      }
      if (verifiedOrder.studentId !== req.auth!.sub) {
        res.status(403).json({ error: 'Checkout order does not belong to current student account.' });
        return;
      }

      const razorpaySecret = (process.env.RAZORPAY_KEY_SECRET || '').trim();
      if (razorpaySecret) {
        const payId = String(body.paymentId || '').trim();
        const sig = String(body.razorpaySignature || '').trim();
        const expected = crypto
          .createHmac('sha256', razorpaySecret)
          .update(`${verifiedOrder.orderId}|${payId}`)
          .digest('hex');
        if (!payId || !sig || sig !== expected) {
          res.status(400).json({ error: 'Payment signature verification failed.' });
          return;
        }
      }

      const db = readDb();
      const student = db.students.find((s) => s.id === req.auth!.sub);
      if (!student) {
        res.status(404).json({ error: 'Student account not found.' });
        return;
      }

      const now = Date.now();
      const validityMs = verifiedOrder.validityMonths * 30 * 24 * 60 * 60 * 1000;
      const paymentRef =
        String(body.paymentId || '').trim() ||
        `PAY-${verifiedOrder.orderId.slice(-8).toUpperCase()}`;

      let sub = db.videoSubscriptions.find((s) => s.studentId === student.id);
      if (!sub) {
        sub = {
          id: `sub-${crypto.randomUUID().slice(0, 8)}`,
          studentId: student.id,
          studentName: student.name,
          studentEmail: student.email,
          planName: db.videoConfig.planName,
          status: 'active',
          creditsTotal: verifiedOrder.creditsGranted,
          creditsRemaining: verifiedOrder.creditsGranted,
          paidAmountInr: verifiedOrder.amountInr,
          paymentRef,
          activatedAt: now,
          expiresAt: now + validityMs,
          updatedAt: now,
        };
        db.videoSubscriptions.unshift(sub);
      } else {
        const baseRemaining =
          sub.status === 'active' && sub.expiresAt > now ? sub.creditsRemaining : 0;
        sub.planName = db.videoConfig.planName;
        sub.status = 'active';
        sub.creditsTotal += verifiedOrder.creditsGranted;
        sub.creditsRemaining = baseRemaining + verifiedOrder.creditsGranted;
        sub.paidAmountInr += verifiedOrder.amountInr;
        sub.paymentRef = paymentRef;
        sub.activatedAt = now;
        sub.expiresAt = Math.max(now + validityMs, sub.expiresAt + validityMs);
        sub.updatedAt = now;
      }

      writeDb(db);
      res.json({
        ok: true,
        subscription: sub,
        hasActiveSubscription: true,
        effectiveCreditsRemaining: sub.creditsRemaining,
      });
    },
  );

  app.get('/api/videos/jobs', requireRegisteredStudentAuth, (req: AuthenticatedRequest, res) => {
    const db = readDb();
    const studentId = req.auth!.sub;
    const jobs = db.videoJobs
      .filter((j) => j.studentId === studentId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 30);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ jobs });
  });

  app.get('/api/videos/jobs/:id', requireRegisteredStudentAuth, (req: AuthenticatedRequest, res) => {
    const db = readDb();
    const job = db.videoJobs.find((j) => j.id === req.params.id);
    if (!job) {
      res.status(404).json({ error: 'Video job not found.' });
      return;
    }
    if (job.studentId !== req.auth!.sub && req.auth!.role !== 'admin') {
      res.status(403).json({ error: 'Forbidden: You do not own this video job.' });
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.json({ job });
  });

  app.post('/api/videos/generate', requireRegisteredStudentAuth, (req: AuthenticatedRequest, res) => {
    const db = readDb();
    const cfg = db.videoConfig;
    if (!cfg.enabled) {
      res.status(403).json({
        error: 'AI Video Generator is currently paused by Administrator.',
      });
      return;
    }

    const student = db.students.find((s) => s.id === req.auth!.sub);
    if (!student) {
      res.status(404).json({ error: 'Student account not found.' });
      return;
    }

    const body = (req.body || {}) as {
      topic?: string;
      customTopic?: string;
      examId?: string;
      examName?: string;
      classId?: string;
      classLabel?: string;
      subject?: string;
      chapter?: string;
      syllabusTopic?: string;
      language?: VideoLanguage;
      durationMinutes?: VideoDurationMinutes;
      selectionMode?: AiSelectionMode;
      provider?: 'gemini' | 'ollama';
      model?: string;
    };

    const topic = String(body.customTopic || body.topic || body.syllabusTopic || body.chapter || '').trim();
    if (topic.length < 2) {
      res.status(400).json({ error: 'Please select a syllabus topic or enter a custom topic.' });
      return;
    }

    const language: VideoLanguage =
      body.language === 'odia' || body.language === 'hindi' ? body.language : 'english';
    if (!cfg.allowedLanguages.includes(language)) {
      res.status(400).json({
        error: `Language "${language}" is currently disabled by Administrator.`,
      });
      return;
    }

    const durationMinutes: VideoDurationMinutes =
      body.durationMinutes === 2 || body.durationMinutes === 3 || body.durationMinutes === 5
        ? body.durationMinutes
        : 2;
    if (durationMinutes > cfg.maxDurationMinutes) {
      res.status(400).json({
        error: `Selected duration (${durationMinutes} min) exceeds Admin limit (${cfg.maxDurationMinutes} min).`,
      });
      return;
    }

    // Subscription & credit verification (server-side authoritative)
    const now = Date.now();
    const sub = db.videoSubscriptions.find((s) => s.studentId === student.id);
    if (!sub || sub.status !== 'active' || sub.expiresAt <= now) {
      if (sub && sub.status === 'active' && sub.expiresAt <= now) {
        sub.status = 'expired';
        writeDb(db);
      }
      res.status(402).json({
        error: `Active "${cfg.planName}" subscription (₹${cfg.priceInr} / ${cfg.validityMonths} months) required to generate videos.`,
      });
      return;
    }

    const activeStudentJobs = db.videoJobs.filter(
      (j) =>
        j.studentId === student.id &&
        (j.status === 'queued' || j.status === 'processing'),
    );

    // Prevent duplicate concurrent requests for the exact same topic/language/duration
    const duplicate = activeStudentJobs.find(
      (j) =>
        j.topic.toLowerCase() === topic.toLowerCase() &&
        j.language === language &&
        j.durationMinutes === durationMinutes,
    );
    if (duplicate) {
      res.json({ job: duplicate, deduplicated: true });
      return;
    }

    if (sub.creditsRemaining <= activeStudentJobs.length) {
      res.status(402).json({
        error:
          sub.creditsRemaining <= 0
            ? 'No video credits remaining. Renew your subscription to unlock more video credits.'
            : 'All your remaining video credits are already reserved by active in-progress jobs.',
      });
      return;
    }

    // Cost & storage budget protection
    const usage = getVideoUsageMetrics(db);
    if (usage.monthlyCostUsd >= cfg.monthlyBudgetUsd) {
      res.status(429).json({
        error: 'Monthly AI Video API budget cap reached. Please contact Administrator.',
      });
      return;
    }
    if (usage.totalStorageMb >= cfg.maxStorageMb) {
      res.status(507).json({
        error: 'Video storage quota limit reached. Delete older videos or ask Admin to expand storage.',
      });
      return;
    }

    const job: VideoGenerationJobRecord = {
      id: `vjob-${crypto.randomUUID().slice(0, 10)}`,
      studentId: student.id,
      studentName: student.name,
      topic: topic.slice(0, 180),
      customTopic: body.customTopic?.trim().slice(0, 180),
      examId: body.examId?.trim(),
      examName: body.examName?.trim(),
      classId: body.classId?.trim(),
      classLabel: body.classLabel?.trim(),
      subject: body.subject?.trim(),
      chapter: body.chapter?.trim(),
      syllabusTopic: body.syllabusTopic?.trim(),
      language,
      durationMinutes,
      selectionMode:
        body.selectionMode === 'auto' ||
        body.selectionMode === 'gemini' ||
        body.selectionMode === 'ollama'
          ? body.selectionMode
          : cfg.defaultScriptProvider || 'auto',
      provider: body.provider === 'ollama' ? 'ollama' : 'gemini',
      model: body.model?.trim(),
      status: 'queued',
      stage: 'queued',
      stageLabel: 'Queued for Generation',
      progressPercent: 4,
      estimatedCostUsd: 0,
      creditDeducted: false,
      createdAt: now,
      updatedAt: now,
    };

    db.videoJobs.unshift(job);
    writeDb(db);
    pumpVideoQueue();

    res.status(202).json({ job });
  });

  app.post(
    '/api/videos/jobs/:id/retry',
    requireRegisteredStudentAuth,
    (req: AuthenticatedRequest, res) => {
      const db = readDb();
      const job = db.videoJobs.find((j) => j.id === req.params.id);
      if (!job) {
        res.status(404).json({ error: 'Video job not found.' });
        return;
      }
      if (job.studentId !== req.auth!.sub && req.auth!.role !== 'admin') {
        res.status(403).json({ error: 'Forbidden: You do not own this video job.' });
        return;
      }
      if (job.status !== 'failed') {
        res.status(400).json({ error: 'Only failed jobs can be retried.' });
        return;
      }

      const sub = db.videoSubscriptions.find((s) => s.studentId === job.studentId);
      if (!sub || sub.status !== 'active' || sub.expiresAt <= Date.now() || sub.creditsRemaining < 1) {
        res.status(402).json({ error: 'Active subscription and at least 1 credit required to retry.' });
        return;
      }

      job.status = 'queued';
      job.stage = 'queued';
      job.stageLabel = 'Queued for Retry';
      job.progressPercent = 4;
      job.errorMessage = undefined;
      job.updatedAt = Date.now();
      writeDb(db);
      pumpVideoQueue();

      res.json({ job });
    },
  );

  app.get('/api/videos', requireRegisteredStudentAuth, (req: AuthenticatedRequest, res) => {
    const db = readDb();
    const studentId = req.auth!.sub;
    const videos = db.generatedVideos
      .filter((v) => v.studentId === studentId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((v) => {
        const ticket = issueMediaPlaybackTicket(v.id, studentId);
        return {
          ...stripVideoPrivateFields(v),
          mediaTicket: ticket,
          streamUrl: `/api/videos/${encodeURIComponent(v.id)}/stream?ticket=${encodeURIComponent(ticket)}`,
          thumbnailUrl: `/api/videos/${encodeURIComponent(v.id)}/thumbnail?ticket=${encodeURIComponent(ticket)}`,
          vttUrl: `/api/videos/${encodeURIComponent(v.id)}/subtitles.vtt?ticket=${encodeURIComponent(ticket)}`,
        };
      });

    res.setHeader('Cache-Control', 'no-store');
    res.json({ videos });
  });

  const authorizeVideoMediaRequest = (
    req: express.Request,
    res: express.Response,
    videoId: string,
  ) => {
    const db = readDb();
    const rec = db.generatedVideos.find((v) => v.id === videoId);
    if (!rec) {
      res.status(404).json({ error: 'Video not found.' });
      return null;
    }

    const bearer = verifySessionToken(extractBearerToken(req));
    if (bearer) {
      if (bearer.role === 'admin' || bearer.sub === rec.studentId) {
        return rec;
      }
      res.status(403).json({ error: 'Forbidden: You cannot access another student’s private video.' });
      return null;
    }

    const ticketParam = typeof req.query.ticket === 'string' ? req.query.ticket : undefined;
    const ticket = verifyMediaPlaybackTicket(ticketParam, videoId);
    if (ticket && ticket.sub === rec.studentId) {
      return rec;
    }

    res.status(401).json({ error: 'Unauthorized: Valid student authentication required for video playback.' });
    return null;
  };

  app.get('/api/videos/:id/stream', (req, res) => {
    const rec = authorizeVideoMediaRequest(req, res, req.params.id);
    if (!rec) return;

    try {
      const mp4Path = resolveSafeVideoAssetPath('video', rec.videoStorageKey);
      if (!fs.existsSync(mp4Path)) {
        res.status(404).json({ error: 'Video file missing on storage.' });
        return;
      }

      const stat = fs.statSync(mp4Path);
      const fileSize = stat.size;
      const range = req.headers.range;

      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = Number.parseInt(parts[0], 10);
        const end = parts[1] ? Number.parseInt(parts[1], 10) : fileSize - 1;
        if (Number.isNaN(start) || start >= fileSize || end >= fileSize || start > end) {
          res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).end();
          return;
        }
        const chunkSize = end - start + 1;
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
        res.setHeader('Content-Length', String(chunkSize));
        fs.createReadStream(mp4Path, { start, end }).pipe(res);
      } else {
        res.status(200);
        res.setHeader('Content-Length', String(fileSize));
        fs.createReadStream(mp4Path).pipe(res);
      }
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unable to stream video.' });
    }
  });

  app.get('/api/videos/:id/thumbnail', (req, res) => {
    const rec = authorizeVideoMediaRequest(req, res, req.params.id);
    if (!rec) return;
    try {
      const thumbPath = resolveSafeVideoAssetPath('thumbnail', rec.thumbnailStorageKey);
      if (!fs.existsSync(thumbPath)) {
        res.status(404).json({ error: 'Thumbnail not found.' });
        return;
      }
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'private, max-age=300');
      fs.createReadStream(thumbPath).pipe(res);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unable to load thumbnail.' });
    }
  });

  app.get('/api/videos/:id/subtitles.vtt', (req, res) => {
    const rec = authorizeVideoMediaRequest(req, res, req.params.id);
    if (!rec) return;
    try {
      const vttPath = resolveSafeVideoAssetPath('vtt', rec.vttStorageKey);
      if (!fs.existsSync(vttPath)) {
        res.status(404).json({ error: 'Subtitles not found.' });
        return;
      }
      res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
      res.setHeader('Cache-Control', 'private, no-store');
      res.send(fs.readFileSync(vttPath, 'utf8'));
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unable to load subtitles.' });
    }
  });

  app.delete('/api/videos/:id', requireRegisteredStudentAuth, (req: AuthenticatedRequest, res) => {
    const db = readDb();
    const target = db.generatedVideos.find((v) => v.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'Video not found.' });
      return;
    }
    if (target.studentId !== req.auth!.sub && req.auth!.role !== 'admin') {
      res.status(403).json({ error: 'Forbidden: You cannot delete another student’s video.' });
      return;
    }
    deletePrivateVideoFiles(target);
    db.generatedVideos = db.generatedVideos.filter((v) => v.id !== req.params.id);
    writeDb(db);
    res.json({ ok: true });
  });

  // Admin AI Video Generator Management Routes
  app.get('/api/admin/videos/overview', requireAdminAuth, (_req, res) => {
    const db = readDb();
    const cfg = db.videoConfig;
    const usage = getVideoUsageMetrics(db);
    const now = Date.now();
    const activeSubs = db.videoSubscriptions.filter(
      (s) => s.status === 'active' && s.expiresAt > now,
    ).length;

    res.json({
      config: cfg,
      stats: {
        totalVideos: db.generatedVideos.length,
        completedJobs: db.videoJobs.filter((j) => j.status === 'completed').length,
        failedJobs: db.videoJobs.filter((j) => j.status === 'failed').length,
        activeJobs: db.videoJobs.filter(
          (j) => j.status === 'queued' || j.status === 'processing',
        ).length,
        activeSubscriptions: activeSubs,
        totalStorageMb: usage.totalStorageMb,
        monthlyCostUsd: usage.monthlyCostUsd,
        monthlyBudgetUsd: cfg.monthlyBudgetUsd,
      },
      subscriptions: db.videoSubscriptions.slice(0, 50),
      recentJobs: db.videoJobs.slice(0, 50),
      recentVideos: db.generatedVideos.slice(0, 40).map(stripVideoPrivateFields),
      ttsStatus: getTtsProviderHealth(cfg),
    });
  });

  app.put('/api/admin/videos/config', requireAdminAuth, (req, res) => {
    const patch = (req.body || {}) as Partial<AdminVideoConfig>;
    const updated = updateVideoConfig(patch);
    res.json({
      config: updated,
      ttsStatus: getTtsProviderHealth(updated),
    });
  });

  app.post('/api/admin/videos/cleanup-failed', requireAdminAuth, (_req, res) => {
    const db = readDb();
    const before = db.videoJobs.length;
    db.videoJobs = db.videoJobs.filter((j) => j.status !== 'failed');
    writeDb(db);
    res.json({ removedCount: before - db.videoJobs.length });
  });

  app.post('/api/admin/videos/grant-credits', requireAdminAuth, (req, res) => {
    const body = (req.body || {}) as { studentId?: string; credits?: number; months?: number };
    const db = readDb();
    const stu = db.students.find((s) => s.id === body.studentId);
    if (!stu) {
      res.status(404).json({ error: 'Student not found.' });
      return;
    }
    const addCredits = Math.max(1, Math.min(100, Math.round(Number(body.credits) || 5)));
    const addMonths = Math.max(1, Math.min(24, Math.round(Number(body.months) || db.videoConfig.validityMonths)));
    const now = Date.now();
    const validMs = addMonths * 30 * 24 * 60 * 60 * 1000;

    let sub = db.videoSubscriptions.find((s) => s.studentId === stu.id);
    if (!sub) {
      sub = {
        id: `sub-${crypto.randomUUID().slice(0, 8)}`,
        studentId: stu.id,
        studentName: stu.name,
        studentEmail: stu.email,
        planName: db.videoConfig.planName,
        status: 'active',
        creditsTotal: addCredits,
        creditsRemaining: addCredits,
        paidAmountInr: 0,
        paymentRef: 'ADMIN-GRANT',
        activatedAt: now,
        expiresAt: now + validMs,
        updatedAt: now,
      };
      db.videoSubscriptions.unshift(sub);
    } else {
      sub.status = 'active';
      sub.creditsTotal += addCredits;
      sub.creditsRemaining += addCredits;
      sub.expiresAt = Math.max(now + validMs, sub.expiresAt);
      sub.updatedAt = now;
    }
    writeDb(db);
    res.json({ subscription: sub });
  });

  // ===================== AI PROVIDER ENDPOINTS =====================

  app.get('/api/ai/providers', async (_req, res) => {
    try {
      const overview = await getPublicProvidersOverview();
      res.json(overview);
    } catch (err) {
      const norm = normalizeUpstreamError(err);
      console.error('[PadhloAI] GET /api/ai/providers failed:', norm.status, norm.message);
      res.status(norm.status).json({ error: norm.message });
    }
  });

  app.post('/api/ai/providers/refresh', async (_req, res) => {
    try {
      const overview = await getPublicProvidersOverview();
      res.json(overview);
    } catch (err) {
      const norm = normalizeUpstreamError(err);
      res.status(norm.status).json({ error: norm.message });
    }
  });

  app.post('/api/ai/providers/test', async (req, res) => {
    try {
      const body = (req.body || {}) as { provider?: string };
      const provider: ProviderId = body.provider === 'ollama' ? 'ollama' : 'gemini';
      const result = await testProviderConnection(provider);
      res.json(result);
    } catch (err) {
      const norm = normalizeUpstreamError(err);
      res.status(norm.status).json({ error: norm.message });
    }
  });

  // Admin-only AI Provider Configuration & Model Access Management
  app.get('/api/admin/ai-config', requireAdminAuth, async (_req, res) => {
    try {
      const overview = await getAdminAiOverview();
      res.json(overview);
    } catch (err) {
      const norm = normalizeUpstreamError(err);
      res.status(norm.status).json({ error: norm.message });
    }
  });

  app.put('/api/admin/ai-config', requireAdminAuth, async (req, res) => {
    try {
      const patch = (req.body || {}) as Partial<AdminAiConfig>;
      saveAdminAiConfig(patch);
      const overview = await getAdminAiOverview();
      res.json(overview);
    } catch (err) {
      const norm = normalizeUpstreamError(err);
      res.status(norm.status).json({ error: norm.message });
    }
  });

  app.post('/api/admin/ai-config/test', requireAdminAuth, async (req, res) => {
    try {
      const body = (req.body || {}) as { provider?: string; ollamaBaseUrl?: string };
      const provider: ProviderId = body.provider === 'ollama' ? 'ollama' : 'gemini';
      const result = await testProviderConnection(
        provider,
        provider === 'ollama' ? body.ollamaBaseUrl : undefined,
      );
      res.json(result);
    } catch (err) {
      const norm = normalizeUpstreamError(err);
      res.status(norm.status).json({ error: norm.message });
    }
  });

  app.post('/api/ai/chat/stream', async (req, res) => {
    const abortController = new AbortController();

    // Listen on `res` (not `req`) because Node 22 emits `req` 'close' as soon as body parsing finishes!
    res.on('close', () => {
      if (!res.writableEnded) {
        abortController.abort();
      }
    });

    try {
      const body = (req.body || {}) as {
        selectionMode?: AiSelectionMode;
        provider?: ProviderId;
        model?: string;
        messages?: unknown;
        language?: string;
        systemInstruction?: string;
      };

      const selectionMode: AiSelectionMode | undefined =
        body.selectionMode === 'auto' ||
        body.selectionMode === 'gemini' ||
        body.selectionMode === 'ollama'
          ? body.selectionMode
          : undefined;
      const provider: ProviderId = body.provider === 'ollama' ? 'ollama' : 'gemini';
      const model = typeof body.model === 'string' ? body.model.trim() : '';
      const messages = validateMessages(body.messages);
      const systemInstruction = buildSystemInstruction(body.language, body.systemInstruction);

      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();

      const meta = await streamCompletion(
        { selectionMode, provider, model, messages, systemInstruction },
        (chunkText) => {
          if (!abortController.signal.aborted && !res.writableEnded) {
            res.write(`data: ${JSON.stringify({ type: 'chunk', text: chunkText })}\n\n`);
          }
        },
        abortController.signal,
      );

      if (!abortController.signal.aborted && !res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: 'done', ...meta })}\n\n`);
      }
      if (!res.writableEnded) {
        res.end();
      }
    } catch (err) {
      const norm = normalizeUpstreamError(err);
      console.error('[PadhloAI] POST /api/ai/chat/stream failed:', {
        status: norm.status,
        message: norm.message,
      });
      if (!res.headersSent) {
        res.status(norm.status).json({ error: norm.message });
      } else if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: 'error', error: norm.message })}\n\n`);
        res.end();
      }
    }
  });

  app.post('/api/ai/generate', async (req, res) => {
    try {
      const body = (req.body || {}) as {
        selectionMode?: AiSelectionMode;
        provider?: ProviderId;
        model?: string;
        messages?: unknown;
        prompt?: string;
        language?: string;
        systemInstruction?: string;
        responseMimeType?: 'application/json' | 'text/plain';
        responseSchema?: unknown;
      };

      const selectionMode: AiSelectionMode | undefined =
        body.selectionMode === 'auto' ||
        body.selectionMode === 'gemini' ||
        body.selectionMode === 'ollama'
          ? body.selectionMode
          : undefined;
      const provider: ProviderId = body.provider === 'ollama' ? 'ollama' : 'gemini';
      const model = typeof body.model === 'string' ? body.model.trim() : '';
      const messages: IncomingMessage[] = body.messages
        ? validateMessages(body.messages)
        : [{ role: 'user', content: String(body.prompt || '').slice(0, 80000) }];

      const systemInstruction = buildSystemInstruction(body.language, body.systemInstruction);

      const result = await generateCompletion({
        selectionMode,
        provider,
        model,
        messages,
        systemInstruction,
        responseMimeType: body.responseMimeType,
        responseSchema: body.responseSchema,
      });

      res.json(result);
    } catch (err) {
      const norm = normalizeUpstreamError(err);
      console.error('[PadhloAI] POST /api/ai/generate failed:', {
        status: norm.status,
        message: norm.message,
      });
      res.status(norm.status).json({ error: norm.message });
    }
  });

  if (IS_PROD) {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: false,
        hmr: false,
      },
      appType: 'spa',
    });

    app.get('/@vite/client', (_req, res) => {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.send(`
const sheetsMap = new Map();
const linkSheetsMap = new Map();
if (typeof document !== 'undefined') {
  document.querySelectorAll('style[data-vite-dev-id]').forEach((el) => {
    sheetsMap.set(el.getAttribute('data-vite-dev-id'), el);
  });
  document.querySelectorAll('link[rel="stylesheet"][data-vite-dev-id]').forEach((el) => {
    linkSheetsMap.set(el.getAttribute('data-vite-dev-id'), el);
  });
}
export function updateStyle(id, content) {
  if (linkSheetsMap.has(id)) return;
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    document.head.appendChild(style);
    sheetsMap.set(id, style);
  } else if (style.textContent !== content) {
    style.textContent = content;
  }
}
export function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style && style.parentNode) {
    style.parentNode.removeChild(style);
    sheetsMap.delete(id);
  }
}
export function createHotContext() {
  const noop = () => {};
  return {
    data: {},
    accept: noop,
    acceptExports: noop,
    dispose: noop,
    prune: noop,
    invalidate: noop,
    decline: noop,
    on: noop,
    off: noop,
    send: noop,
  };
}
export function injectQuery(url, queryToInject) {
  if (!url || (url[0] !== '.' && url[0] !== '/')) return url;
  const pathname = url.replace(/[?#].*$/, '');
  const parsed = new URL(url, 'http://vite.dev');
  return pathname + '?' + queryToInject + (parsed.search ? '&' + parsed.search.slice(1) : '') + (parsed.hash || '');
}
export class ErrorOverlay extends HTMLElement {}
`);
    });

    app.use(vite.middlewares);
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`PadhloAI server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
