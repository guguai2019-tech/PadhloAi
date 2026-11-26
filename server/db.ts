import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { BUILTIN_EXAMS } from '../src/data/examCatalog.ts';
import type {
  AdminAiConfig,
  AdminDashboardStats,
  AdminQuestionRecord,
  AdminVideoConfig,
  ExamCategoryId,
  ExamDefinition,
  GeneratedVideoRecord,
  MockLanguage,
  PdfNoteMetadata,
  StudentRecord,
  SyllabusClassOrPaper,
  SyllabusStatus,
  SyllabusSubject,
  SyllabusUploadRecord,
  UgcNetAdminSummary,
  UgcNetConflictInfo,
  UgcNetPaperType,
  UgcNetPublicCatalogResponse,
  UgcNetPublicPaper1,
  UgcNetPublicSubject,
  UgcNetSyllabusRecord,
  UgcNetUnitNode,
  UpscAdminSummary,
  UpscAreaNode,
  UpscConflictInfo,
  UpscMarkingPattern,
  UpscPaperId,
  UpscPublicCatalogResponse,
  UpscPublicPaperRecord,
  UpscStage,
  UpscSyllabusRecord,
  VideoGenerationJobRecord,
  VideoSubscriptionRecord,
} from '../src/types.ts';

export interface PdfNoteStored extends PdfNoteMetadata {
  storageKey: string;
}

export interface StoredStudentRecord extends StudentRecord {
  passcodeHash?: string;
  passcodeSalt?: string;
}

export interface GeneratedVideoStored extends GeneratedVideoRecord {
  videoStorageKey: string;
  thumbnailStorageKey: string;
  vttStorageKey: string;
  srtStorageKey: string;
}

export interface VideoCostLedgerEntry {
  id: string;
  jobId: string;
  studentId: string;
  monthKey: string;
  costUsd: number;
  provider: string;
  createdAt: number;
}

export interface AdminCredentialRecord {
  adminId: string;
  passwordHash: string;
  salt: string;
  updatedAt: number;
}

export interface CentralizedDatabase {
  exams: ExamDefinition[];
  syllabusUploads: SyllabusUploadRecord[];
  ugcNetSyllabuses: UgcNetSyllabusRecord[];
  upscSyllabuses: UpscSyllabusRecord[];
  questions: AdminQuestionRecord[];
  pdfNotes: PdfNoteStored[];
  students: StoredStudentRecord[];
  adminAuth: AdminCredentialRecord | null;
  adminIdOverride?: string;
  aiConfig: AdminAiConfig;
  videoConfig: AdminVideoConfig;
  videoSubscriptions: VideoSubscriptionRecord[];
  videoJobs: VideoGenerationJobRecord[];
  generatedVideos: GeneratedVideoStored[];
  videoCostLedger: VideoCostLedgerEntry[];
  catalogVersion: number;
  catalogUpdatedAt: number;
}

const STORAGE_ROOT = path.resolve(process.cwd(), 'private_storage');
const PDF_DIR = path.resolve(STORAGE_ROOT, 'pdfs');
const SYLLABUS_DIR = path.resolve(STORAGE_ROOT, 'syllabuses');
export const VIDEO_DIR = path.resolve(STORAGE_ROOT, 'videos');
export const VIDEO_THUMB_DIR = path.resolve(STORAGE_ROOT, 'video_thumbnails');
export const VIDEO_SUBTITLE_DIR = path.resolve(STORAGE_ROOT, 'video_subtitles');
export const VIDEO_TMP_DIR = path.resolve(STORAGE_ROOT, 'video_tmp');
const DB_PATH = path.resolve(STORAGE_ROOT, 'sg_db.json');

// Session signing key generated cleanly in memory if not set in process.env
const SESSION_SECRET =
  process.env.ADMIN_SESSION_SECRET?.trim() || crypto.randomBytes(32).toString('hex');

const revokedTokenIds = new Set<string>();
const activeSessionTokens = new Map<
  string,
  { role: 'admin' | 'student'; sub: string; exp: number }
>();

export function ensurePrivateStorageDirs(): void {
  for (const dir of [
    STORAGE_ROOT,
    PDF_DIR,
    SYLLABUS_DIR,
    VIDEO_DIR,
    VIDEO_THUMB_DIR,
    VIDEO_SUBTITLE_DIR,
    VIDEO_TMP_DIR,
  ]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
  }
}

export function resolveSafePdfPath(storageKey: string): string {
  const safeBase = path.basename(storageKey);
  if (!safeBase || !safeBase.endsWith('.pdf')) {
    throw new Error('Invalid PDF storage reference.');
  }
  const resolved = path.resolve(PDF_DIR, safeBase);
  if (!resolved.startsWith(PDF_DIR + path.sep)) {
    throw new Error('Path traversal blocked.');
  }
  return resolved;
}

export function resolveSafeVideoAssetPath(
  kind: 'video' | 'thumbnail' | 'vtt' | 'srt',
  storageKey: string,
): string {
  const safeBase = path.basename(storageKey);
  const expectedExt =
    kind === 'video' ? '.mp4' : kind === 'thumbnail' ? '.png' : kind === 'vtt' ? '.vtt' : '.srt';
  const baseDir =
    kind === 'video'
      ? VIDEO_DIR
      : kind === 'thumbnail'
        ? VIDEO_THUMB_DIR
        : VIDEO_SUBTITLE_DIR;
  if (!safeBase || !safeBase.endsWith(expectedExt)) {
    throw new Error(`Invalid ${kind} storage reference.`);
  }
  const resolved = path.resolve(baseDir, safeBase);
  if (!resolved.startsWith(baseDir + path.sep)) {
    throw new Error('Path traversal blocked.');
  }
  return resolved;
}

function inferBoardName(ex: ExamDefinition): string {
  if (ex.boardName) return ex.boardName;
  if (ex.id === 'bse-odisha') return 'Board of Secondary Education, Odisha (BSE Odisha)';
  if (ex.id.startsWith('chse-odisha')) return 'CHSE Odisha';
  if (ex.id === 'cbse-board') return 'Central Board of Secondary Education (CBSE)';
  if (ex.id === 'ugc-net') return 'National Testing Agency (NTA UGC NET)';
  if (ex.id === 'upsc-cse') return 'Union Public Service Commission (UPSC)';
  return ex.name;
}

export function createDefaultAiConfig(): AdminAiConfig {
  return {
    geminiEnabled: true,
    ollamaEnabled: true,
    defaultProvider: 'gemini',
    backupProvider: 'none',
    fallbackEnabled: false,
    ollamaBaseUrl: '',
    disabledModels: [],
    updatedAt: Date.now(),
  };
}

function normalizeAiConfig(raw: Partial<AdminAiConfig> | undefined): AdminAiConfig {
  const base = createDefaultAiConfig();
  if (!raw) return base;
  return {
    geminiEnabled: typeof raw.geminiEnabled === 'boolean' ? raw.geminiEnabled : base.geminiEnabled,
    ollamaEnabled: typeof raw.ollamaEnabled === 'boolean' ? raw.ollamaEnabled : base.ollamaEnabled,
    defaultProvider: raw.defaultProvider === 'ollama' ? 'ollama' : 'gemini',
    backupProvider:
      raw.backupProvider === 'gemini' || raw.backupProvider === 'ollama' ? raw.backupProvider : 'none',
    fallbackEnabled: typeof raw.fallbackEnabled === 'boolean' ? raw.fallbackEnabled : base.fallbackEnabled,
    ollamaBaseUrl: typeof raw.ollamaBaseUrl === 'string' ? raw.ollamaBaseUrl.trim() : '',
    disabledModels: Array.isArray(raw.disabledModels)
      ? raw.disabledModels.filter((x): x is string => typeof x === 'string')
      : [],
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : base.updatedAt,
  };
}

export function createDefaultVideoConfig(): AdminVideoConfig {
  return {
    enabled: true,
    planName: 'AI Video Generator Premium',
    priceInr: 49,
    validityMonths: 6,
    defaultCredits: 5,
    maxDurationMinutes: 5,
    allowedLanguages: ['odia', 'hindi', 'english'],
    defaultScriptProvider: 'auto',
    ttsProvider: 'gemini-tts',
    ttsModel: 'gemini-3.8-flash-lite-tts',
    customTtsUrl: '',
    voices: {
      english: 'Kore',
      hindi: 'Kore',
      odia: 'Puck',
    },
    diagramProvider: 'svg-vector',
    videoQuality: '720p',
    maxConcurrentJobs: 2,
    maxStorageMb: 2048,
    monthlyBudgetUsd: 25,
    updatedAt: Date.now(),
  };
}

function normalizeVideoConfig(raw: Partial<AdminVideoConfig> | undefined): AdminVideoConfig {
  const base = createDefaultVideoConfig();
  if (!raw) return base;
  const allowedLangs = Array.isArray(raw.allowedLanguages)
    ? raw.allowedLanguages.filter(
        (l): l is 'odia' | 'hindi' | 'english' =>
          l === 'odia' || l === 'hindi' || l === 'english',
      )
    : base.allowedLanguages;
  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : base.enabled,
    planName:
      typeof raw.planName === 'string' && raw.planName.trim()
        ? raw.planName.trim().slice(0, 80)
        : base.planName,
    priceInr:
      typeof raw.priceInr === 'number' && Number.isFinite(raw.priceInr) && raw.priceInr >= 1
        ? Math.round(raw.priceInr)
        : base.priceInr,
    validityMonths:
      typeof raw.validityMonths === 'number' &&
      Number.isFinite(raw.validityMonths) &&
      raw.validityMonths >= 1
        ? Math.min(36, Math.round(raw.validityMonths))
        : base.validityMonths,
    defaultCredits:
      typeof raw.defaultCredits === 'number' &&
      Number.isFinite(raw.defaultCredits) &&
      raw.defaultCredits >= 1
        ? Math.min(200, Math.round(raw.defaultCredits))
        : base.defaultCredits,
    maxDurationMinutes:
      raw.maxDurationMinutes === 2 || raw.maxDurationMinutes === 3 || raw.maxDurationMinutes === 5
        ? raw.maxDurationMinutes
        : base.maxDurationMinutes,
    allowedLanguages: allowedLangs.length > 0 ? allowedLangs : base.allowedLanguages,
    defaultScriptProvider:
      raw.defaultScriptProvider === 'gemini' ||
      raw.defaultScriptProvider === 'ollama' ||
      raw.defaultScriptProvider === 'auto'
        ? raw.defaultScriptProvider
        : base.defaultScriptProvider,
    ttsProvider:
      raw.ttsProvider === 'custom-http-tts' ? 'custom-http-tts' : 'gemini-tts',
    ttsModel:
      typeof raw.ttsModel === 'string' && raw.ttsModel.trim()
        ? raw.ttsModel.trim()
        : base.ttsModel,
    customTtsUrl:
      typeof raw.customTtsUrl === 'string' ? raw.customTtsUrl.trim().slice(0, 300) : '',
    voices: {
      english: raw.voices?.english?.trim() || base.voices.english,
      hindi: raw.voices?.hindi?.trim() || base.voices.hindi,
      odia: raw.voices?.odia?.trim() || base.voices.odia,
    },
    diagramProvider:
      raw.diagramProvider === 'gemini-image' ? 'gemini-image' : 'svg-vector',
    videoQuality:
      raw.videoQuality === '480p' || raw.videoQuality === '1080p'
        ? raw.videoQuality
        : '720p',
    maxConcurrentJobs:
      typeof raw.maxConcurrentJobs === 'number' &&
      Number.isFinite(raw.maxConcurrentJobs) &&
      raw.maxConcurrentJobs >= 1
        ? Math.min(5, Math.round(raw.maxConcurrentJobs))
        : base.maxConcurrentJobs,
    maxStorageMb:
      typeof raw.maxStorageMb === 'number' &&
      Number.isFinite(raw.maxStorageMb) &&
      raw.maxStorageMb >= 100
        ? Math.min(51200, Math.round(raw.maxStorageMb))
        : base.maxStorageMb,
    monthlyBudgetUsd:
      typeof raw.monthlyBudgetUsd === 'number' &&
      Number.isFinite(raw.monthlyBudgetUsd) &&
      raw.monthlyBudgetUsd >= 1
        ? Number(raw.monthlyBudgetUsd.toFixed(2))
        : base.monthlyBudgetUsd,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : base.updatedAt,
  };
}

function normalizeUploadStatus(raw: string | undefined): SyllabusStatus {
  if (
    raw === 'Draft' ||
    raw === 'Processing' ||
    raw === 'Published' ||
    raw === 'Update Available' ||
    raw === 'Failed'
  ) {
    return raw;
  }
  return 'Draft';
}

function createInitialDb(): CentralizedDatabase {
  const now = Date.now();
  const seededExams: ExamDefinition[] = BUILTIN_EXAMS.map((ex) => ({
    ...JSON.parse(JSON.stringify(ex)),
    boardName: inferBoardName(ex),
    academicSession: '2025-26',
    status: 'Published' as const,
    updatedAt: now,
  }));

  return {
    exams: seededExams,
    syllabusUploads: [],
    ugcNetSyllabuses: [],
    upscSyllabuses: [],
    questions: [],
    pdfNotes: [],
    students: [],
    adminAuth: null,
    adminIdOverride: 'Gugu',
    aiConfig: createDefaultAiConfig(),
    videoConfig: createDefaultVideoConfig(),
    videoSubscriptions: [],
    videoJobs: [],
    generatedVideos: [],
    videoCostLedger: [],
    catalogVersion: 1,
    catalogUpdatedAt: now,
  };
}

let dbCache: CentralizedDatabase | null = null;

export function bumpCatalogVersion(db: CentralizedDatabase): number {
  const nextVer = (typeof db.catalogVersion === 'number' ? db.catalogVersion : 1) + 1;
  db.catalogVersion = nextVer;
  db.catalogUpdatedAt = Date.now();
  return nextVer;
}

export function readDb(): CentralizedDatabase {
  if (dbCache) return dbCache;
  ensurePrivateStorageDirs();
  if (!fs.existsSync(DB_PATH)) {
    const initial = createInitialDb();
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2), { mode: 0o600 });
    dbCache = initial;
    return dbCache;
  }

  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<CentralizedDatabase>;
    const initial = createInitialDb();

    // Ensure built-in exams exist if DB was partially empty
    const existingIds = new Set((parsed.exams || []).map((e) => e.id));
    const mergedExams = [
      ...(parsed.exams || []),
      ...initial.exams.filter((e) => !existingIds.has(e.id)),
    ];

    const normalizedUploads: SyllabusUploadRecord[] = (
      Array.isArray(parsed.syllabusUploads) ? parsed.syllabusUploads : []
    ).map((u) => ({
      ...u,
      status: normalizeUploadStatus((u as { status?: string }).status),
    }));

    // Clean orphaned temp working directories left behind by any prior crash/restart
    try {
      for (const entry of fs.readdirSync(VIDEO_TMP_DIR, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          fs.rmSync(path.join(VIDEO_TMP_DIR, entry.name), { recursive: true, force: true });
        }
      }
    } catch {
      // Ignore cleanup errors
    }

    // Recover interrupted processing jobs across server restarts cleanly without deducting credits
    const normalizedJobs: VideoGenerationJobRecord[] = (
      Array.isArray(parsed.videoJobs) ? parsed.videoJobs : []
    ).map((j) => {
      if (j.status === 'processing' || j.status === 'queued') {
        return {
          ...j,
          status: 'failed',
          stage: 'failed',
          stageLabel: 'Interrupted by server restart',
          errorMessage:
            'Video generation was interrupted during server restart. No video credit was deducted — please retry.',
          updatedAt: Date.now(),
        };
      }
      return j;
    });

    const parsedUgcNet = Array.isArray(parsed.ugcNetSyllabuses)
      ? parsed.ugcNetSyllabuses
      : [];
    const parsedUpsc = Array.isArray(parsed.upscSyllabuses)
      ? parsed.upscSyllabuses
      : [];
    const normalizedPdfNotes: PdfNoteStored[] = (
      Array.isArray(parsed.pdfNotes) ? parsed.pdfNotes : []
    ).map((n) => ({
      ...n,
      noteCategory:
        n.noteCategory === 'ncert' || n.noteCategory === 'upsc' || n.noteCategory === 'exam'
          ? n.noteCategory
          : 'exam',
    }));

    dbCache = {
      exams: mergedExams,
      syllabusUploads: normalizedUploads,
      ugcNetSyllabuses: parsedUgcNet,
      upscSyllabuses: parsedUpsc,
      questions: Array.isArray(parsed.questions) ? parsed.questions : [],
      pdfNotes: normalizedPdfNotes,
      students: Array.isArray(parsed.students) ? parsed.students : [],
      adminAuth: parsed.adminAuth || null,
      adminIdOverride:
        typeof parsed.adminIdOverride === 'string' && parsed.adminIdOverride.trim()
          ? parsed.adminIdOverride.trim()
          : undefined,
      aiConfig: normalizeAiConfig(parsed.aiConfig),
      videoConfig: normalizeVideoConfig(parsed.videoConfig),
      videoSubscriptions: Array.isArray(parsed.videoSubscriptions)
        ? parsed.videoSubscriptions
        : [],
      videoJobs: normalizedJobs,
      generatedVideos: Array.isArray(parsed.generatedVideos) ? parsed.generatedVideos : [],
      videoCostLedger: Array.isArray(parsed.videoCostLedger) ? parsed.videoCostLedger : [],
      catalogVersion: typeof parsed.catalogVersion === 'number' ? parsed.catalogVersion : 1,
      catalogUpdatedAt:
        typeof parsed.catalogUpdatedAt === 'number' ? parsed.catalogUpdatedAt : Date.now(),
    };

    // Always synchronize 'ugc-net' and 'upsc-cse' inside db.exams strictly from published syllabuses
    // so stale/legacy hardcoded entries are never exposed.
    const hadLegacyUgcNet =
      dbCache.exams.some((e) => e.id === 'ugc-net') &&
      !dbCache.ugcNetSyllabuses.some(
        (r) => r.isActivePublished && r.publicationStatus === 'Published',
      );
    const hadLegacyUpsc =
      dbCache.exams.some((e) => e.id === 'upsc-cse') &&
      !dbCache.upscSyllabuses.some(
        (r) => r.isActivePublished && r.publicationStatus === 'Published',
      );
    syncPublishedUgcNetIntoExams(dbCache);
    syncPublishedUpscIntoExams(dbCache);
    const syncedCbse = syncMissingOfficialCbseSubjects(dbCache);
    let migrated = hadLegacyUgcNet || hadLegacyUpsc || syncedCbse;
    if (dbCache.adminAuth && dbCache.adminAuth.adminId === '754022') {
      dbCache.adminAuth.adminId = 'Gugu';
      dbCache.adminAuth.updatedAt = Date.now();
      migrated = true;
    }
    if (!dbCache.adminIdOverride) {
      dbCache.adminIdOverride = 'Gugu';
      migrated = true;
    }
    if (migrated) {
      writeDb(dbCache);
    }

    return dbCache;
  } catch {
    const fallback = createInitialDb();
    dbCache = fallback;
    return dbCache;
  }
}

export function writeDb(nextDb: CentralizedDatabase): void {
  ensurePrivateStorageDirs();
  dbCache = nextDb;
  const tmpPath = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(nextDb, null, 2), { mode: 0o600 });
  fs.renameSync(tmpPath, DB_PATH);
}

export function getAiConfig(): AdminAiConfig {
  return readDb().aiConfig;
}

export function updateAiConfig(patch: Partial<AdminAiConfig>): AdminAiConfig {
  const db = readDb();
  const merged = normalizeAiConfig({
    ...db.aiConfig,
    ...patch,
    updatedAt: Date.now(),
  });
  db.aiConfig = merged;
  writeDb(db);
  return merged;
}

export function getVideoConfig(): AdminVideoConfig {
  return readDb().videoConfig;
}

export function updateVideoConfig(patch: Partial<AdminVideoConfig>): AdminVideoConfig {
  const db = readDb();
  const merged = normalizeVideoConfig({
    ...db.videoConfig,
    ...patch,
    updatedAt: Date.now(),
  });
  db.videoConfig = merged;
  writeDb(db);
  return merged;
}

// ===================== PASSWORD HASHING & TOKEN AUTH =====================

function hashPasswordScrypt(password: string, saltHex: string): string {
  return crypto.scryptSync(password, saltHex, 64).toString('hex');
}

function safeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function getEnvAdminCredentials(): {
  envConfigured: boolean;
  adminId: string;
  adminPassword: string;
} {
  const adminPassword = (process.env.ADMIN_PASSWORD || '').trim();
  const adminId = (process.env.ADMIN_ID || '').trim();
  return {
    envConfigured: adminPassword.length > 0,
    adminId,
    adminPassword,
  };
}

export function getAdminSetupState(): {
  needsInitialSetup: boolean;
  envConfigured: boolean;
} {
  const { envConfigured } = getEnvAdminCredentials();
  if (envConfigured) {
    return { needsInitialSetup: false, envConfigured: true };
  }
  const db = readDb();
  return {
    needsInitialSetup: db.adminAuth === null,
    envConfigured: false,
  };
}

export function claimInitialAdminSetup(adminId: string, password: string): AdminCredentialRecord {
  const cleanId = adminId.trim();
  if (cleanId.length < 3) {
    throw new Error('Admin ID must be at least 3 characters.');
  }
  if (password.length < 4) {
    throw new Error('Password must be at least 4 characters.');
  }
  const { envConfigured } = getEnvAdminCredentials();
  const db = readDb();
  if (envConfigured || db.adminAuth !== null) {
    throw new Error('Admin credentials are already configured.');
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const record: AdminCredentialRecord = {
    adminId: cleanId,
    passwordHash: hashPasswordScrypt(password, salt),
    salt,
    updatedAt: Date.now(),
  };
  db.adminAuth = record;
  writeDb(db);
  return record;
}

export function getEffectiveEnvAdminId(
  db: CentralizedDatabase,
  envAdminId: string,
): string {
  if (db.adminIdOverride && db.adminIdOverride.trim()) {
    return db.adminIdOverride.trim();
  }
  if (envAdminId && envAdminId !== '754022') {
    return envAdminId;
  }
  return 'Gugu';
}

export function verifyAdminCredentials(adminId: string, password: string): boolean {
  const cleanId = adminId.trim();
  if (!cleanId || !password) return false;

  const db = readDb();
  const envCreds = getEnvAdminCredentials();
  if (envCreds.envConfigured) {
    const targetAdminId = getEffectiveEnvAdminId(db, envCreds.adminId);
    const idOk = safeEqualStrings(cleanId, targetAdminId);
    const passOk = safeEqualStrings(password, envCreds.adminPassword);
    return idOk && passOk;
  }

  if (!db.adminAuth) return false;
  const idOk = safeEqualStrings(cleanId, db.adminAuth.adminId);
  const candidateHash = hashPasswordScrypt(password, db.adminAuth.salt);
  const passOk = safeEqualStrings(candidateHash, db.adminAuth.passwordHash);
  return idOk && passOk;
}

export function changeAdminId(
  currentPassword: string,
  newAdminId: string,
): { adminId: string; message: string } {
  const cleanNewId = newAdminId.trim();
  if (cleanNewId.length < 3) {
    throw new Error('Admin ID must be at least 3 characters.');
  }
  if (!currentPassword) {
    throw new Error('Current password is required to change Admin ID.');
  }

  const db = readDb();
  const envCreds = getEnvAdminCredentials();

  if (envCreds.envConfigured) {
    if (!safeEqualStrings(currentPassword, envCreds.adminPassword)) {
      throw new Error('Current password is incorrect.');
    }
    db.adminIdOverride = cleanNewId;
    writeDb(db);
    return { adminId: cleanNewId, message: `Admin ID updated to "${cleanNewId}".` };
  }

  if (!db.adminAuth) {
    throw new Error('No admin credential record exists yet.');
  }
  const currentHash = hashPasswordScrypt(currentPassword, db.adminAuth.salt);
  if (!safeEqualStrings(currentHash, db.adminAuth.passwordHash)) {
    throw new Error('Current password is incorrect.');
  }

  db.adminAuth = {
    ...db.adminAuth,
    adminId: cleanNewId,
    updatedAt: Date.now(),
  };
  db.adminIdOverride = cleanNewId;
  writeDb(db);
  return { adminId: cleanNewId, message: `Admin ID updated to "${cleanNewId}".` };
}

export function changeAdminPassword(
  currentPassword: string,
  newPassword: string,
): { updated: boolean; message: string } {
  if (newPassword.length < 4) {
    throw new Error('New password must be at least 4 characters.');
  }
  const envCreds = getEnvAdminCredentials();
  if (envCreds.envConfigured) {
    throw new Error(
      'ADMIN_PASSWORD is currently managed via environment Secrets (.env). Update ADMIN_PASSWORD in your environment configuration to change it.',
    );
  }
  const db = readDb();
  if (!db.adminAuth) {
    throw new Error('No admin credential record exists yet.');
  }
  const currentHash = hashPasswordScrypt(currentPassword, db.adminAuth.salt);
  if (!safeEqualStrings(currentHash, db.adminAuth.passwordHash)) {
    throw new Error('Current password is incorrect.');
  }

  const nextSalt = crypto.randomBytes(16).toString('hex');
  db.adminAuth = {
    adminId: db.adminAuth.adminId,
    passwordHash: hashPasswordScrypt(newPassword, nextSalt),
    salt: nextSalt,
    updatedAt: Date.now(),
  };
  writeDb(db);
  return { updated: true, message: 'Admin password updated securely.' };
}

export interface SessionPayload {
  role: 'admin' | 'student';
  sub: string;
  jti: string;
  exp: number;
}

export function issueSessionToken(role: 'admin' | 'student', sub: string): string {
  const ttlMs = role === 'admin' ? 1000 * 60 * 60 * 12 : 1000 * 60 * 60 * 24;
  const payload: SessionPayload = {
    role,
    sub,
    jti: crypto.randomUUID(),
    exp: Date.now() + ttlMs,
  };
  activeSessionTokens.set(payload.jti, {
    role: payload.role,
    sub: payload.sub,
    exp: payload.exp,
  });

  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(rawToken: string | undefined): SessionPayload | null {
  if (!rawToken) return null;
  const parts = rawToken.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');
  if (!safeEqualStrings(sig, expectedSig)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload;
    if (!payload || !payload.jti || !payload.exp || payload.exp < Date.now()) {
      return null;
    }
    if (revokedTokenIds.has(payload.jti)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function revokeSessionToken(rawToken: string | undefined): void {
  const payload = verifySessionToken(rawToken);
  if (payload) {
    revokedTokenIds.add(payload.jti);
    activeSessionTokens.delete(payload.jti);
  }
}

// ===================== SYLLABUS & QUESTION BANK INTEGRITY =====================

export function flagAffectedQuestionsForExam(
  db: CentralizedDatabase,
  examId: string,
  reasonLabel: string,
): number {
  const exam = db.exams.find((e) => e.id === examId);
  if (!exam) return 0;

  let flaggedCount = 0;
  for (const q of db.questions) {
    if (q.examId !== examId) continue;

    const cls = exam.classesOrPapers.find(
      (c) => c.id === q.classId || c.label === q.classLabel,
    );
    const subj = cls?.subjects.find((s) => s.name === q.subject);
    const chap = subj?.chapters.find((c) => c.name === q.chapter);
    const topicValid =
      !q.topic ||
      q.topic === 'All Chapter Topics' ||
      Boolean(chap?.topics.includes(q.topic)) ||
      Boolean(chap?.subtopics?.includes(q.topic));

    if (!cls || !subj || !chap || !topicValid) {
      q.needsReview = true;
      q.syllabusChangeReason = reasonLabel;
      q.updatedAt = Date.now();
      flaggedCount++;
    }
  }
  return flaggedCount;
}

export function computeDashboardStats(db: CentralizedDatabase): AdminDashboardStats {
  let totalSubjects = 0;
  let totalChapters = 0;
  let totalTopics = 0;

  for (const ex of db.exams) {
    for (const cls of ex.classesOrPapers) {
      totalSubjects += cls.subjects.length;
      for (const subj of cls.subjects) {
        totalChapters += subj.chapters.length;
        for (const ch of subj.chapters) {
          totalTopics += ch.topics.length;
        }
      }
    }
  }

  return {
    totalExams: db.exams.length,
    publishedExams: db.exams.filter((e) => e.status !== 'Draft').length,
    totalUploadedSyllabuses: db.syllabusUploads.length,
    totalSubjects,
    totalChapters,
    totalTopics,
    totalQuestions: db.questions.length,
    questionsNeedingReview: db.questions.filter((q) => q.needsReview).length,
    totalPdfNotes: db.pdfNotes.length,
    publishedPdfNotes: db.pdfNotes.filter((p) => p.published).length,
    totalRegisteredStudents: db.students.length,
  };
}

export function stripPdfPrivateFields(rec: PdfNoteStored): PdfNoteMetadata {
  const { storageKey: _omitted, ...safeMeta } = rec;
  return safeMeta;
}

export function stripStudentPrivateFields(stu: StoredStudentRecord): StudentRecord {
  const { passcodeHash: _h, passcodeSalt: _s, ...safeStudent } = stu;
  return safeStudent;
}

export function stripVideoPrivateFields(rec: GeneratedVideoStored): GeneratedVideoRecord {
  const {
    videoStorageKey: _v,
    thumbnailStorageKey: _t,
    vttStorageKey: _vtt,
    srtStorageKey: _srt,
    ...safeVideo
  } = rec;
  return safeVideo;
}

export function hashStudentPasscode(passcode: string): { hash: string; salt: string } {
  const salt = crypto.randomBytes(16).toString('hex');
  return {
    hash: hashPasswordScrypt(passcode, salt),
    salt,
  };
}

export function verifyStudentPasscode(
  student: StoredStudentRecord,
  passcode: string,
): boolean {
  if (!student.passcodeHash || !student.passcodeSalt) return true;
  if (!passcode) return false;
  const candidate = hashPasswordScrypt(passcode, student.passcodeSalt);
  return safeEqualStrings(candidate, student.passcodeHash);
}

export function issueMediaPlaybackTicket(videoId: string, studentId: string): string {
  const payload = {
    scope: 'video-media' as const,
    vid: videoId,
    sub: studentId,
    exp: Date.now() + 1000 * 60 * 30,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifyMediaPlaybackTicket(
  rawTicket: string | undefined,
  expectedVideoId: string,
): { sub: string; vid: string } | null {
  if (!rawTicket) return null;
  const parts = rawTicket.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');
  if (!safeEqualStrings(sig, expectedSig)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as {
      scope?: string;
      vid?: string;
      sub?: string;
      exp?: number;
    };
    if (
      parsed.scope !== 'video-media' ||
      parsed.vid !== expectedVideoId ||
      !parsed.sub ||
      !parsed.exp ||
      parsed.exp < Date.now()
    ) {
      return null;
    }
    return { sub: parsed.sub, vid: parsed.vid };
  } catch {
    return null;
  }
}

export function signCheckoutOrder(payload: {
  orderId: string;
  studentId: string;
  amountInr: number;
  validityMonths: number;
  creditsGranted: number;
  exp: number;
}): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifyCheckoutOrderToken(
  token: string,
): {
  orderId: string;
  studentId: string;
  amountInr: number;
  validityMonths: number;
  creditsGranted: number;
  exp: number;
} | null {
  const parts = (token || '').split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expected = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');
  if (!safeEqualStrings(sig, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as {
      orderId?: string;
      studentId?: string;
      amountInr?: number;
      validityMonths?: number;
      creditsGranted?: number;
      exp?: number;
    };
    if (
      !parsed.orderId ||
      !parsed.studentId ||
      !parsed.amountInr ||
      !parsed.creditsGranted ||
      !parsed.exp ||
      parsed.exp < Date.now()
    ) {
      return null;
    }
    return {
      orderId: parsed.orderId,
      studentId: parsed.studentId,
      amountInr: parsed.amountInr,
      validityMonths: parsed.validityMonths || 6,
      creditsGranted: parsed.creditsGranted,
      exp: parsed.exp,
    };
  } catch {
    return null;
  }
}

export function deletePrivateVideoFiles(rec: GeneratedVideoStored): void {
  const items: Array<['video' | 'thumbnail' | 'vtt' | 'srt', string]> = [
    ['video', rec.videoStorageKey],
    ['thumbnail', rec.thumbnailStorageKey],
    ['vtt', rec.vttStorageKey],
    ['srt', rec.srtStorageKey],
  ];
  for (const [kind, key] of items) {
    if (!key) continue;
    try {
      const p = resolveSafeVideoAssetPath(kind, key);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch {
      // Ignore cleanup failures
    }
  }
}

export function getCurrentMonthKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function getVideoUsageMetrics(db: CentralizedDatabase): {
  totalStorageBytes: number;
  totalStorageMb: number;
  monthlyCostUsd: number;
} {
  const totalStorageBytes = db.generatedVideos.reduce(
    (sum, v) => sum + (Number(v.fileSizeBytes) || 0),
    0,
  );
  const monthKey = getCurrentMonthKey();
  const monthlyCostUsd = Number(
    db.videoCostLedger
      .filter((entry) => entry.monthKey === monthKey)
      .reduce((sum, entry) => sum + (Number(entry.costUsd) || 0), 0)
      .toFixed(4),
  );
  return {
    totalStorageBytes,
    totalStorageMb: Number((totalStorageBytes / (1024 * 1024)).toFixed(2)),
    monthlyCostUsd,
  };
}

export function savePrivatePdfBuffer(buffer: Buffer): { storageKey: string; size: number } {
  ensurePrivateStorageDirs();
  // Validate PDF magic bytes (%PDF-)
  const header = buffer.subarray(0, 5).toString('ascii');
  if (!header.startsWith('%PDF-')) {
    throw new Error('Uploaded file is not a valid PDF document.');
  }
  if (buffer.length > 25 * 1024 * 1024) {
    throw new Error('PDF file exceeds 25 MB limit.');
  }
  const storageKey = `${crypto.randomUUID()}.pdf`;
  const targetPath = resolveSafePdfPath(storageKey);
  fs.writeFileSync(targetPath, buffer, { mode: 0o600 });
  return { storageKey, size: buffer.length };
}

export function deletePrivatePdfFile(storageKey: string): void {
  try {
    const targetPath = resolveSafePdfPath(storageKey);
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
    }
  } catch {
    // Ignore already-deleted or invalid key
  }
}

function normalizeLabel(value: string | undefined): string {
  return (value || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9\u0900-\u097F\u0B00-\u0B7F]+/g, ' ')
    .trim();
}

export function findMatchingExam(
  db: CentralizedDatabase,
  upload: Pick<SyllabusUploadRecord, 'examId' | 'targetExamId' | 'examName' | 'boardName' | 'category'>,
  explicitExamId?: string,
): ExamDefinition | undefined {
  const byId = explicitExamId || upload.targetExamId || upload.examId;
  if (byId) {
    const found = db.exams.find((e) => e.id === byId);
    if (found) return found;
  }

  const normName = normalizeLabel(upload.examName);
  const normBoard = normalizeLabel(upload.boardName);
  if (!normName && !normBoard) return undefined;

  if (
    upload.category === 'cbse' &&
    (normName.includes('cbse') || normBoard.includes('cbse') || normBoard.includes('central board of secondary'))
  ) {
    const cbseExam = db.exams.find((e) => e.id === 'cbse-board');
    if (cbseExam) return cbseExam;
  }

  return db.exams.find((ex) => {
    const exName = normalizeLabel(ex.name);
    const exBoard = normalizeLabel(ex.boardName);
    if (normName && (exName === normName || ex.name.toLowerCase() === upload.examName.trim().toLowerCase())) {
      return true;
    }
    if (normName && (exName.includes(normName) || normName.includes(exName))) {
      return ex.category === upload.category || normName.length >= 5;
    }
    if (normBoard && exBoard && (exBoard === normBoard || exBoard.includes(normBoard))) {
      return ex.category === upload.category;
    }
    return false;
  });
}

function syncMissingOfficialCbseSubjects(db: CentralizedDatabase): boolean {
  const builtinCbse = BUILTIN_EXAMS.find((e) => e.id === 'cbse-board');
  const existingCbse = db.exams.find((e) => e.id === 'cbse-board');
  if (!builtinCbse || !existingCbse) return false;

  let changed = false;
  if (!existingCbse.shortDesc.includes('English & Hindi Medium')) {
    existingCbse.shortDesc = builtinCbse.shortDesc;
    changed = true;
  }

  for (const builtinCls of builtinCbse.classesOrPapers) {
    let targetCls = existingCbse.classesOrPapers.find(
      (c) => c.id === builtinCls.id || normalizeLabel(c.label) === normalizeLabel(builtinCls.label),
    );
    if (!targetCls) {
      existingCbse.classesOrPapers.push(JSON.parse(JSON.stringify(builtinCls)));
      changed = true;
      continue;
    }

    // Ensure both English Medium & Hindi Medium are present
    const nextMediums = Array.from(
      new Set([...(targetCls.mediums || []), 'English Medium', 'Hindi Medium']),
    ) as Array<'Odia Medium' | 'English Medium' | 'Hindi Medium'>;
    if (
      !targetCls.mediums ||
      nextMediums.length !== targetCls.mediums.length ||
      nextMediums.some((m, idx) => targetCls!.mediums?.[idx] !== m)
    ) {
      targetCls.mediums = nextMediums;
      changed = true;
    }

    const normalizeSubjKey = (name: string) =>
      name.toLowerCase().replace(/\s+/g, ' ').trim();

    const existingSubjMap = new Map(
      targetCls.subjects.map((s) => [normalizeSubjKey(s.name), s]),
    );
    for (const bSubj of builtinCls.subjects) {
      const key = normalizeSubjKey(bSubj.name);
      const found = existingSubjMap.get(key);
      if (!found) {
        targetCls.subjects.push(JSON.parse(JSON.stringify(bSubj)));
        existingSubjMap.set(key, bSubj);
        changed = true;
      } else {
        if (bSubj.subjectLanguage && !found.subjectLanguage) {
          found.subjectLanguage = bSubj.subjectLanguage;
          changed = true;
        }
        if (bSubj.code && !found.code) {
          found.code = bSubj.code;
          changed = true;
        }
      }
    }
  }

  if (changed) {
    existingCbse.updatedAt = Date.now();
  }
  return changed;
}

export function findMatchingClass(
  exam: ExamDefinition | undefined,
  classLabel: string,
  explicitClassId?: string,
  academicSession?: string,
): SyllabusClassOrPaper | undefined {
  if (!exam) return undefined;
  if (explicitClassId) {
    const byId = exam.classesOrPapers.find((c) => c.id === explicitClassId);
    if (byId) return byId;
  }
  const targetNorm = normalizeLabel(classLabel);
  if (!targetNorm) return exam.classesOrPapers[0];

  // Exact normalized match first
  const exact = exam.classesOrPapers.find((c) => {
    const cNorm = normalizeLabel(c.label);
    const sameSession =
      !academicSession ||
      !c.academicSession ||
      c.academicSession.toLowerCase() === academicSession.toLowerCase();
    return cNorm === targetNorm && sameSession;
  });
  if (exact) return exact;

  // Fallback fuzzy prefix match e.g. "Class 10" matching "Class 10 (Matriculation 2025-26)"
  return exam.classesOrPapers.find((c) => {
    const cNorm = normalizeLabel(c.label);
    return (
      cNorm === targetNorm ||
      cNorm.startsWith(targetNorm) ||
      targetNorm.startsWith(cNorm)
    );
  });
}

export function detectSyllabusConflict(
  db: CentralizedDatabase,
  upload: Pick<
    SyllabusUploadRecord,
    'examId' | 'targetExamId' | 'targetClassId' | 'examName' | 'boardName' | 'category' | 'classLabel' | 'academicSession'
  >,
): {
  exists: boolean;
  examId?: string;
  examName?: string;
  classId?: string;
  classLabel?: string;
  existingSessions?: string[];
} {
  const exam = findMatchingExam(db, upload);
  if (!exam) return { exists: false };

  const cls = findMatchingClass(exam, upload.classLabel, upload.targetClassId);
  if (!cls || cls.subjects.length === 0) {
    return {
      exists: false,
      examId: exam.id,
      examName: exam.name,
    };
  }

  const sessions = Array.from(
    new Set(
      [
        exam.academicSession,
        ...exam.classesOrPapers.map((c) => c.academicSession).filter(Boolean),
      ].filter((s): s is string => Boolean(s)),
    ),
  );

  return {
    exists: true,
    examId: exam.id,
    examName: exam.name,
    classId: cls.id,
    classLabel: cls.label,
    existingSessions: sessions,
  };
}

export function mergeSyllabusIntoExam(
  db: CentralizedDatabase,
  upload: SyllabusUploadRecord,
  options?: {
    resolutionMode?: 'replace' | 'new-session' | 'merge';
    targetExamId?: string;
    targetClassId?: string;
  },
): { exam: ExamDefinition; flaggedQuestions: number; classId: string } {
  const now = Date.now();
  const mode = options?.resolutionMode || upload.replaceMode || 'replace';

  let exam = findMatchingExam(db, upload, options?.targetExamId);

  if (!exam) {
    const idSlug =
      upload.examName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 32) || 'exam';
    const newId = `${idSlug}-${now.toString(36).slice(-4)}`;
    exam = {
      id: newId,
      category: (upload.category || 'competitive') as ExamCategoryId,
      name: upload.examName.trim(),
      boardName: upload.boardName.trim() || upload.examName.trim(),
      academicSession: upload.academicSession.trim() || '2025-26',
      status: 'Published',
      updatedAt: now,
      shortDesc:
        upload.marksSummary ||
        `${upload.boardName || upload.examName} · ${upload.classLabel} (${upload.academicSession || '2025-26'})`,
      defaultMarksPerQuestion: 1,
      defaultNegativeMarking: false,
      defaultNegativePenalty: 0,
      isCustom: true,
      allowedQuestionFormats: upload.availableQuestionFormats,
      classesOrPapers: [],
    };
    db.exams.push(exam);
  } else {
    exam.status = 'Published';
    exam.boardName = upload.boardName.trim() || exam.boardName;
    exam.academicSession = upload.academicSession.trim() || exam.academicSession;
    if (upload.availableQuestionFormats && upload.availableQuestionFormats.length > 0) {
      exam.allowedQuestionFormats = Array.from(
        new Set([...(exam.allowedQuestionFormats || []), ...upload.availableQuestionFormats]),
      );
    }
    exam.updatedAt = now;
  }

  const mediumVal: 'Odia Medium' | 'English Medium' | 'Hindi Medium' =
    upload.language === 'odia'
      ? 'Odia Medium'
      : upload.language === 'hindi'
        ? 'Hindi Medium'
        : 'English Medium';

  let cls: SyllabusClassOrPaper | undefined;
  const sessionTag = upload.academicSession.trim() || '2026-27';

  if (mode === 'new-session') {
    const baseLabel = upload.classLabel.replace(/\([^)]*\)/g, '').trim() || 'Class / Paper';
    const desiredLabel = `${baseLabel} (${sessionTag})`;
    cls = exam.classesOrPapers.find(
      (c) => c.label.toLowerCase() === desiredLabel.toLowerCase(),
    );
    if (!cls) {
      const clsId = `${exam.id}-${baseLabel
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')}-${sessionTag.replace(/[^a-z0-9]+/g, '-')}-${now.toString(36).slice(-3)}`;
      cls = {
        id: clsId,
        label: desiredLabel,
        academicSession: sessionTag,
        mediums: [mediumVal],
        subjects: JSON.parse(JSON.stringify(upload.subjects)) as SyllabusSubject[],
      };
      exam.classesOrPapers.push(cls);
    } else {
      cls.subjects = JSON.parse(JSON.stringify(upload.subjects)) as SyllabusSubject[];
      cls.academicSession = sessionTag;
    }
  } else {
    cls = findMatchingClass(exam, upload.classLabel, options?.targetClassId || upload.targetClassId);
    if (!cls) {
      const clsId =
        options?.targetClassId ||
        upload.targetClassId ||
        `${exam.id}-${upload.classLabel
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')}-${now.toString(36).slice(-3)}`;
      cls = {
        id: clsId,
        label: upload.classLabel.trim() || 'Main Class / Paper',
        academicSession: sessionTag,
        mediums: [mediumVal],
        subjects: [],
      };
      exam.classesOrPapers.push(cls);
    } else {
      cls.academicSession = sessionTag;
      if (cls.mediums && !cls.mediums.includes(mediumVal)) {
        cls.mediums = [...cls.mediums, mediumVal];
      }
    }

    if (mode === 'replace') {
      const isSingleSubjectTargeted =
        Boolean(upload.subjectHint?.trim()) &&
        upload.subjects.length === 1 &&
        cls.subjects.length > 1;

      if (isSingleSubjectTargeted) {
        const incomingSubj = upload.subjects[0];
        const targetIdx = cls.subjects.findIndex(
          (s) =>
            normalizeLabel(s.name) === normalizeLabel(incomingSubj.name) ||
            (upload.subjectHint && normalizeLabel(s.name) === normalizeLabel(upload.subjectHint)),
        );
        const clonedSubj = JSON.parse(JSON.stringify(incomingSubj)) as SyllabusSubject;
        if (targetIdx >= 0) {
          cls.subjects[targetIdx] = {
            ...cls.subjects[targetIdx],
            ...clonedSubj,
          };
        } else {
          cls.subjects.push(clonedSubj);
        }
      } else {
        cls.subjects = JSON.parse(JSON.stringify(upload.subjects)) as SyllabusSubject[];
      }
    } else {
      // Additive merge fallback
      for (const incomingSubj of upload.subjects) {
        const existingSubj = cls.subjects.find(
          (s) => s.name.toLowerCase() === incomingSubj.name.trim().toLowerCase(),
        );
        if (!existingSubj) {
          cls.subjects.push(JSON.parse(JSON.stringify(incomingSubj)) as SyllabusSubject);
        } else {
          for (const ch of incomingSubj.chapters) {
            const existingChap = existingSubj.chapters.find(
              (c) => c.name.toLowerCase() === ch.name.trim().toLowerCase(),
            );
            if (!existingChap) {
              existingSubj.chapters.push(JSON.parse(JSON.stringify(ch)));
            } else {
              for (const tp of ch.topics) {
                if (!existingChap.topics.includes(tp)) {
                  existingChap.topics.push(tp);
                }
              }
              if (ch.subtopics?.length) {
                existingChap.subtopics = Array.from(
                  new Set([...(existingChap.subtopics || []), ...ch.subtopics]),
                );
              }
              if (ch.marks) existingChap.marks = ch.marks;
            }
          }
          if (incomingSubj.prescribedBooks?.length) {
            existingSubj.prescribedBooks = Array.from(
              new Set([...(existingSubj.prescribedBooks || []), ...incomingSubj.prescribedBooks]),
            );
          }
        }
      }
    }
  }

  upload.examId = exam.id;
  upload.targetExamId = exam.id;
  upload.targetClassId = cls.id;
  upload.replaceMode = mode === 'new-session' ? 'new-session' : 'replace';
  upload.status = 'Published';
  upload.publishedAt = now;
  upload.updatedAt = now;

  const flaggedQuestions = flagAffectedQuestionsForExam(
    db,
    exam.id,
    `Syllabus "${upload.fileName}" (${mode === 'new-session' ? `New session ${sessionTag}` : 'Replaced'}) published by Admin`,
  );
  return { exam, flaggedQuestions, classId: cls.id };
}

// ===================== UGC NET CENTRALIZED SYLLABUS ENGINE =====================

const ALLOWED_SYLLABUS_EXTS = new Set(['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.csv', '.txt']);
const MAX_SYLLABUS_FILE_BYTES = 25 * 1024 * 1024;

export function slugifyUgcNetKey(value: string): string {
  return (value || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9\u0900-\u097F\u0B00-\u0B7F]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64) || 'general';
}

export function resolveUgcNetSubjectKey(
  paperType: UgcNetPaperType,
  subjectName?: string,
  subjectCode?: string,
): { subjectId: string; subjectName: string; subjectCode?: string } {
  if (paperType === 'paper-1') {
    return {
      subjectId: 'paper-1-general',
      subjectName: 'Paper 1 – General Paper on Teaching & Research Aptitude',
      subjectCode: '00',
    };
  }
  const cleanName = (subjectName || '').trim() || 'General Subject';
  const cleanCode = (subjectCode || '').trim() || undefined;
  return {
    subjectId: slugifyUgcNetKey(cleanName),
    subjectName: cleanName,
    subjectCode: cleanCode,
  };
}

export function saveOriginalUgcNetSyllabusFile(
  buffer: Buffer,
  fileName: string,
): { storageKey: string; ext: string; sizeBytes: number; sha256: string } {
  ensurePrivateStorageDirs();
  if (!buffer || buffer.length === 0) {
    throw new Error('Uploaded syllabus file is empty.');
  }
  if (buffer.length > MAX_SYLLABUS_FILE_BYTES) {
    throw new Error('Uploaded syllabus file exceeds the 25 MB size limit.');
  }

  const ext = path.extname(fileName || '').toLowerCase();
  if (!ALLOWED_SYLLABUS_EXTS.has(ext)) {
    throw new Error(
      'Unsupported file format. Upload PDF, DOCX, DOC, XLSX, XLS, CSV, or TXT syllabus files.',
    );
  }

  // Magic-byte validation for binary formats
  if (ext === '.pdf') {
    const head = buffer.subarray(0, 5).toString('ascii');
    if (!head.startsWith('%PDF-')) {
      throw new Error('File signature does not match a valid PDF document.');
    }
  } else if (ext === '.docx' || ext === '.xlsx') {
    const zipHead = buffer.subarray(0, 2).toString('ascii');
    if (zipHead !== 'PK') {
      throw new Error(`File signature does not match a valid ${ext.toUpperCase()} document.`);
    }
  }

  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const storageKey = `ugcnet-${crypto.randomUUID()}${ext}`;
  const targetPath = resolveSafeSyllabusFilePath(storageKey);
  fs.writeFileSync(targetPath, buffer, { mode: 0o600 });
  return {
    storageKey,
    ext: ext.replace('.', '').toUpperCase(),
    sizeBytes: buffer.length,
    sha256,
  };
}

export function resolveSafeSyllabusFilePath(storageKey: string): string {
  const safeBase = path.basename(storageKey || '');
  const ext = path.extname(safeBase).toLowerCase();
  if (!safeBase || !ALLOWED_SYLLABUS_EXTS.has(ext)) {
    throw new Error('Invalid syllabus file storage reference.');
  }
  const resolved = path.resolve(SYLLABUS_DIR, safeBase);
  if (!resolved.startsWith(SYLLABUS_DIR + path.sep)) {
    throw new Error('Path traversal blocked.');
  }
  return resolved;
}

export function deletePrivateSyllabusFileIfOrphaned(
  db: CentralizedDatabase,
  storageKey: string,
): void {
  if (!storageKey) return;
  const stillReferenced =
    db.ugcNetSyllabuses.some((r) => r.originalFileStorageKey === storageKey) ||
    db.upscSyllabuses.some((r) => r.originalFileStorageKey === storageKey);
  if (stillReferenced) return;
  try {
    const targetPath = resolveSafeSyllabusFilePath(storageKey);
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
    }
  } catch {
    // Ignore already removed files
  }
}

export function normalizeUgcNetUnits(
  rawUnits: UgcNetUnitNode[],
): {
  units: UgcNetUnitNode[];
  unitCount: number;
  topicCount: number;
  subtopicCount: number;
} {
  let topicCount = 0;
  let subtopicCount = 0;

  const units: UgcNetUnitNode[] = (Array.isArray(rawUnits) ? rawUnits : [])
    .map((u, uIdx): UgcNetUnitNode | null => {
      const title = String(u?.title || '').trim();
      if (!title) return null;
      const topics = (Array.isArray(u.topics) ? u.topics : [])
        .map((t, tIdx) => {
          const tTitle = String(t?.title || '').trim();
          if (!tTitle) return null;
          topicCount++;
          const subtopics = (Array.isArray(t.subtopics) ? t.subtopics : [])
            .map((s, sIdx) => {
              const sTitle = String(s?.title || '').trim();
              if (!sTitle) return null;
              subtopicCount++;
              return {
                subtopicId:
                  String(s?.subtopicId || '').trim() ||
                  `sub-${uIdx + 1}-${tIdx + 1}-${sIdx + 1}-${crypto.randomUUID().slice(0, 6)}`,
                title: sTitle,
                order: sIdx + 1,
              };
            })
            .filter((x): x is NonNullable<typeof x> => Boolean(x));

          return {
            topicId:
              String(t?.topicId || '').trim() ||
              `top-${uIdx + 1}-${tIdx + 1}-${crypto.randomUUID().slice(0, 6)}`,
            title: tTitle,
            order: tIdx + 1,
            subtopics,
          };
        })
        .filter((x): x is NonNullable<typeof x> => Boolean(x));

      return {
        unitId:
          String(u?.unitId || '').trim() ||
          `unit-${uIdx + 1}-${crypto.randomUUID().slice(0, 6)}`,
        unitNumber:
          typeof u?.unitNumber === 'number' && Number.isFinite(u.unitNumber)
            ? u.unitNumber
            : uIdx + 1,
        title,
        marks: u?.marks ? String(u.marks).trim() : undefined,
        order: uIdx + 1,
        topics,
      };
    })
    .filter((x): x is UgcNetUnitNode => x !== null);

  return {
    units,
    unitCount: units.length,
    topicCount,
    subtopicCount,
  };
}

export function findDuplicateUgcNetUpload(
  db: CentralizedDatabase,
  fileHash: string,
  paperType: UgcNetPaperType,
  subjectId: string,
): UgcNetSyllabusRecord | undefined {
  return db.ugcNetSyllabuses.find(
    (r) =>
      r.fileHash === fileHash &&
      r.paperType === paperType &&
      r.subjectId === subjectId &&
      r.publicationStatus !== 'Failed',
  );
}

export function findActiveUgcNetConflict(
  db: CentralizedDatabase,
  paperType: UgcNetPaperType,
  subjectId: string,
  excludeRecordId?: string,
): UgcNetConflictInfo {
  const existing = db.ugcNetSyllabuses.find(
    (r) =>
      r.id !== excludeRecordId &&
      r.paperType === paperType &&
      r.subjectId === subjectId &&
      r.isActivePublished &&
      r.publicationStatus === 'Published',
  );
  if (!existing) {
    return { hasConflict: false };
  }
  return {
    hasConflict: true,
    existingVersionId: existing.id,
    existingVersionLabel: existing.versionLabel,
    existingAcademicSession: existing.academicSession,
    existingPublishedAt: existing.publishedAt,
    message: `An active published syllabus (${existing.versionLabel}, session ${existing.academicSession}) already exists for ${existing.paperLabel}${paperType === 'paper-2' ? ` — ${existing.subjectName}` : ''}. Choose Replace Active Version or Create New Academic Version.`,
  };
}

export function getPublishedUgcNetPublicData(
  db: CentralizedDatabase,
): UgcNetPublicCatalogResponse {
  const published = db.ugcNetSyllabuses.filter(
    (r) => r.isActivePublished && r.publicationStatus === 'Published',
  );

  const paper1Rec = published.find((r) => r.paperType === 'paper-1') || null;
  const paper1: UgcNetPublicPaper1 | null = paper1Rec
    ? {
        syllabusVersionId: paper1Rec.id,
        versionNumber: paper1Rec.versionNumber,
        versionLabel: paper1Rec.versionLabel,
        academicSession: paper1Rec.academicSession,
        paperType: 'paper-1',
        paperLabel: paper1Rec.paperLabel,
        subjectId: paper1Rec.subjectId,
        subjectName: paper1Rec.subjectName,
        unitCount: paper1Rec.unitCount,
        topicCount: paper1Rec.topicCount,
        subtopicCount: paper1Rec.subtopicCount,
        publishedAt: paper1Rec.publishedAt || paper1Rec.updatedAt,
        updatedAt: paper1Rec.updatedAt,
        units: paper1Rec.units,
      }
    : null;

  const paper2Subjects: UgcNetPublicSubject[] = published
    .filter((r) => r.paperType === 'paper-2')
    .sort((a, b) => a.subjectName.localeCompare(b.subjectName))
    .map((r) => ({
      syllabusVersionId: r.id,
      versionNumber: r.versionNumber,
      versionLabel: r.versionLabel,
      academicSession: r.academicSession,
      paperType: 'paper-2',
      paperLabel: r.paperLabel,
      subjectId: r.subjectId,
      subjectName: r.subjectName,
      subjectCode: r.subjectCode,
      unitCount: r.unitCount,
      topicCount: r.topicCount,
      subtopicCount: r.subtopicCount,
      publishedAt: r.publishedAt || r.updatedAt,
      updatedAt: r.updatedAt,
      units: r.units,
    }));

  return {
    catalogVersion: db.catalogVersion,
    updatedAt: db.catalogUpdatedAt,
    paper1,
    paper2Subjects,
  };
}

/**
 * Synchronizes active Published UGC NET syllabuses into `db.exams` ('ugc-net').
 * When NO UGC NET syllabus is published, removes `'ugc-net'` completely from `db.exams`
 * so generic dropdowns/explorers never display hardcoded or unpublished UGC NET data.
 */
export function syncPublishedUgcNetIntoExams(db: CentralizedDatabase): void {
  const pub = getPublishedUgcNetPublicData(db);
  const existingIdx = db.exams.findIndex((e) => e.id === 'ugc-net');

  if (!pub.paper1 && pub.paper2Subjects.length === 0) {
    if (existingIdx >= 0) {
      db.exams.splice(existingIdx, 1);
    }
    return;
  }

  const classesOrPapers: SyllabusClassOrPaper[] = [];

  if (pub.paper1) {
    classesOrPapers.push({
      id: 'ugc-net-paper-1',
      label: `Paper 1 (Teaching & Research Aptitude · ${pub.paper1.versionLabel})`,
      academicSession: pub.paper1.academicSession,
      mediums: ['English Medium', 'Hindi Medium'],
      subjects: pub.paper1.units.map((u) => ({
        name: u.title,
        chapters:
          u.topics.length > 0
            ? u.topics.map((t) => ({
                name: t.title,
                topics:
                  t.subtopics.length > 0
                    ? t.subtopics.map((s) => s.title)
                    : [t.title],
                subtopics: t.subtopics.map((s) => s.title),
                marks: u.marks,
              }))
            : [{ name: u.title, topics: [u.title] }],
      })),
    });
  }

  if (pub.paper2Subjects.length > 0) {
    classesOrPapers.push({
      id: 'ugc-net-paper-2',
      label: 'Paper 2 (Subject-Specific)',
      academicSession: pub.paper2Subjects[0]?.academicSession,
      mediums: ['English Medium', 'Hindi Medium'],
      subjects: pub.paper2Subjects.map((subj) => ({
        name: subj.subjectCode ? `${subj.subjectName} (${subj.subjectCode})` : subj.subjectName,
        code: subj.subjectCode,
        chapters: subj.units.map((u) => ({
          name: u.title,
          topics: u.topics.map((t) => t.title),
          subtopics: u.topics.flatMap((t) => t.subtopics.map((s) => s.title)),
          marks: u.marks,
        })),
      })),
    });
  }

  const ugcExamDef: ExamDefinition = {
    id: 'ugc-net',
    category: 'ugc-net',
    name: 'UGC NET / JRF',
    boardName: 'National Testing Agency (NTA UGC NET)',
    academicSession: pub.paper1?.academicSession || pub.paper2Subjects[0]?.academicSession || '2026-27',
    status: 'Published',
    updatedAt: Date.now(),
    shortDesc: 'Admin-Published NTA UGC NET — Paper 1 & Paper 2 Syllabuses',
    defaultMarksPerQuestion: 2,
    defaultNegativeMarking: false,
    defaultNegativePenalty: 0,
    classesOrPapers,
  };

  if (existingIdx >= 0) {
    db.exams[existingIdx] = ugcExamDef;
  } else {
    db.exams.push(ugcExamDef);
  }
}

export function flagOutdatedUgcNetQuestions(
  db: CentralizedDatabase,
  paperType: UgcNetPaperType,
  subjectId: string,
  activeUnits: UgcNetUnitNode[],
  reasonLabel: string,
): number {
  const validUnitIds = new Set(activeUnits.map((u) => u.unitId));
  const validUnitTitles = new Set(activeUnits.map((u) => u.title.trim().toLowerCase()));
  const validTopicIds = new Set<string>();
  const validTopicTitles = new Set<string>();

  for (const u of activeUnits) {
    for (const t of u.topics) {
      validTopicIds.add(t.topicId);
      validTopicTitles.add(t.title.trim().toLowerCase());
    }
  }

  let flagged = 0;
  for (const q of db.questions) {
    if (q.examId !== 'ugc-net') continue;
    const qPaper =
      q.paperId ||
      (q.classId === 'ugc-net-paper-1' || q.classId === 'paper-1'
        ? 'paper-1'
        : q.classId === 'ugc-net-paper-2' || q.classId === 'paper-2'
          ? 'paper-2'
          : undefined);
    if (qPaper !== paperType) continue;
    if (paperType === 'paper-2') {
      const qSubjKey = q.subjectId || slugifyUgcNetKey(q.subject);
      if (qSubjKey !== subjectId) continue;
    }

    const unitStillPresent =
      (q.unitId && validUnitIds.has(q.unitId)) ||
      validUnitTitles.has((q.chapter || '').trim().toLowerCase()) ||
      (paperType === 'paper-1' && validUnitTitles.has((q.subject || '').trim().toLowerCase()));

    const topicStillPresent =
      !q.topic ||
      q.topic === 'All Chapter Topics' ||
      (q.topicId && validTopicIds.has(q.topicId)) ||
      validTopicTitles.has(q.topic.trim().toLowerCase()) ||
      validTopicTitles.has((q.chapter || '').trim().toLowerCase());

    if (!unitStillPresent || !topicStillPresent) {
      q.needsReview = true;
      q.syllabusChangeReason = reasonLabel;
      q.updatedAt = Date.now();
      flagged++;
    }
  }
  return flagged;
}

export function publishUgcNetSyllabusVersion(
  db: CentralizedDatabase,
  versionId: string,
  resolutionMode: 'replace' | 'new-version' = 'new-version',
): {
  record: UgcNetSyllabusRecord;
  flaggedQuestions: number;
  replacedVersionId?: string;
} {
  const target = db.ugcNetSyllabuses.find((r) => r.id === versionId);
  if (!target) {
    throw new Error('UGC NET syllabus draft/version not found.');
  }
  if (target.units.length === 0) {
    throw new Error('Cannot publish an empty UGC NET syllabus. Add at least one unit first.');
  }

  const now = Date.now();
  const previousActive = db.ugcNetSyllabuses.find(
    (r) =>
      r.id !== target.id &&
      r.paperType === target.paperType &&
      r.subjectId === target.subjectId &&
      r.isActivePublished,
  );

  let replacedVersionId: string | undefined;
  if (previousActive) {
    replacedVersionId = previousActive.id;
    previousActive.isActivePublished = false;
    previousActive.publicationStatus =
      resolutionMode === 'replace' ? 'Archived' : 'Unpublished';
    previousActive.unpublishedAt = now;
    previousActive.updatedAt = now;
  }

  // Ensure versionNumber increments cleanly if publishing a new version after existing history
  const maxExistingVer = db.ugcNetSyllabuses
    .filter(
      (r) =>
        r.id !== target.id &&
        r.paperType === target.paperType &&
        r.subjectId === target.subjectId,
    )
    .reduce((m, r) => Math.max(m, r.versionNumber || 1), 0);

  if (target.versionNumber <= maxExistingVer) {
    target.versionNumber =
      resolutionMode === 'replace' && previousActive
        ? Math.max(target.versionNumber, previousActive.versionNumber)
        : maxExistingVer + 1;
    target.versionLabel = `v${target.versionNumber} (${target.academicSession || 'Latest'})`;
  }

  target.parentVersionId = previousActive?.id || target.parentVersionId;
  target.isActivePublished = true;
  target.publicationStatus = 'Published';
  target.publishedAt = now;
  target.unpublishedAt = undefined;
  target.updatedAt = now;

  syncPublishedUgcNetIntoExams(db);

  const flaggedQuestions = flagOutdatedUgcNetQuestions(
    db,
    target.paperType,
    target.subjectId,
    target.units,
    `UGC NET ${target.paperLabel}${target.paperType === 'paper-2' ? ` (${target.subjectName})` : ''} ${target.versionLabel} published`,
  );

  return { record: target, flaggedQuestions, replacedVersionId };
}

export function unpublishUgcNetSyllabusVersion(
  db: CentralizedDatabase,
  versionId: string,
): { record: UgcNetSyllabusRecord; flaggedQuestions: number } {
  const target = db.ugcNetSyllabuses.find((r) => r.id === versionId);
  if (!target) {
    throw new Error('UGC NET syllabus version not found.');
  }
  const now = Date.now();
  target.isActivePublished = false;
  target.publicationStatus = 'Unpublished';
  target.unpublishedAt = now;
  target.updatedAt = now;

  syncPublishedUgcNetIntoExams(db);

  const flaggedQuestions = flagOutdatedUgcNetQuestions(
    db,
    target.paperType,
    target.subjectId,
    [],
    `UGC NET ${target.paperLabel}${target.paperType === 'paper-2' ? ` (${target.subjectName})` : ''} unpublished by Admin`,
  );

  return { record: target, flaggedQuestions };
}

export function computeUgcNetAdminSummary(db: CentralizedDatabase): UgcNetAdminSummary {
  const all = db.ugcNetSyllabuses;
  const p1All = all.filter((r) => r.paperType === 'paper-1');
  const p1Active = p1All.find((r) => r.isActivePublished && r.publicationStatus === 'Published');
  const p1Latest = [...p1All].sort((a, b) => b.updatedAt - a.updatedAt)[0];

  const p2All = all.filter((r) => r.paperType === 'paper-2');
  const p2Active = p2All.filter((r) => r.isActivePublished && r.publicationStatus === 'Published');

  const latestOverall = [...all].sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const outdatedQuestionsCount = db.questions.filter(
    (q) => q.examId === 'ugc-net' && q.needsReview,
  ).length;

  return {
    paper1Published: Boolean(p1Active),
    paper1Status: p1Active?.publicationStatus || p1Latest?.publicationStatus || 'Not Uploaded',
    paper1VersionLabel: p1Active?.versionLabel || p1Latest?.versionLabel,
    paper1UnitCount: p1Active?.unitCount || 0,
    paper1TopicCount: p1Active?.topicCount || 0,
    paper2PublishedCount: p2Active.length,
    paper2TotalRecords: p2All.length,
    paper2UnitCount: p2Active.reduce((s, r) => s + r.unitCount, 0),
    paper2TopicCount: p2Active.reduce((s, r) => s + r.topicCount, 0),
    latestUpdatedAt: latestOverall?.updatedAt,
    latestProcessingStatus: latestOverall?.publicationStatus || 'None',
    outdatedQuestionsCount,
  };
}

// ===================== UPSC CENTRALIZED SYLLABUS ENGINE =====================

export interface UpscPaperMeta {
  paperId: UpscPaperId;
  stage: UpscStage;
  paperLabel: string;
  defaultSubjectName: string;
  defaultPattern: UpscMarkingPattern;
}

export const UPSC_PAPER_DEFINITIONS: UpscPaperMeta[] = [
  {
    paperId: 'prelims-gs-1',
    stage: 'prelims',
    paperLabel: 'Prelims — General Studies Paper I',
    defaultSubjectName: 'General Studies Paper I (Prelims)',
    defaultPattern: {
      totalMarks: 200,
      durationMinutes: 120,
      questionCount: 100,
      marksPerQuestion: 2,
      negativeMarkingEnabled: true,
      negativeMarksPerWrong: 0.66,
      patternNotes: '100 objective MCQs · 2 marks each · 1/3rd negative marking (-0.66 per wrong answer).',
    },
  },
  {
    paperId: 'prelims-csat',
    stage: 'prelims',
    paperLabel: 'Prelims — CSAT Paper II',
    defaultSubjectName: 'CSAT Paper II (Aptitude & Comprehension)',
    defaultPattern: {
      totalMarks: 200,
      durationMinutes: 120,
      questionCount: 80,
      marksPerQuestion: 2.5,
      negativeMarkingEnabled: true,
      negativeMarksPerWrong: 0.83,
      patternNotes: '80 objective MCQs · 2.5 marks each · Qualifying (33%) · 1/3rd negative marking (-0.83 per wrong answer).',
    },
  },
  {
    paperId: 'mains-essay',
    stage: 'mains',
    paperLabel: 'Mains — Essay Paper',
    defaultSubjectName: 'Essay Paper',
    defaultPattern: {
      totalMarks: 250,
      durationMinutes: 180,
      negativeMarkingEnabled: false,
      negativeMarksPerWrong: 0,
      supportedMarksOptions: [125],
      wordLimitGuidelines: '1000–1200 words per essay (2 sections)',
      patternNotes: 'Two essays (125 marks each) · Total 250 marks · 3 hours.',
    },
  },
  {
    paperId: 'mains-gs-1',
    stage: 'mains',
    paperLabel: 'Mains — General Studies Paper I',
    defaultSubjectName: 'General Studies I (Heritage, Culture, History & Geography)',
    defaultPattern: {
      totalMarks: 250,
      durationMinutes: 180,
      negativeMarkingEnabled: false,
      negativeMarksPerWrong: 0,
      supportedMarksOptions: [10, 15],
      wordLimitGuidelines: '150 words (10 marks) · 250 words (15 marks)',
      patternNotes: '20 descriptive analytical questions · 250 marks · 3 hours.',
    },
  },
  {
    paperId: 'mains-gs-2',
    stage: 'mains',
    paperLabel: 'Mains — General Studies Paper II',
    defaultSubjectName: 'General Studies II (Governance, Constitution, Polity & IR)',
    defaultPattern: {
      totalMarks: 250,
      durationMinutes: 180,
      negativeMarkingEnabled: false,
      negativeMarksPerWrong: 0,
      supportedMarksOptions: [10, 15],
      wordLimitGuidelines: '150 words (10 marks) · 250 words (15 marks)',
      patternNotes: '20 descriptive analytical questions · 250 marks · 3 hours.',
    },
  },
  {
    paperId: 'mains-gs-3',
    stage: 'mains',
    paperLabel: 'Mains — General Studies Paper III',
    defaultSubjectName: 'General Studies III (Economy, Tech, Environment & Security)',
    defaultPattern: {
      totalMarks: 250,
      durationMinutes: 180,
      negativeMarkingEnabled: false,
      negativeMarksPerWrong: 0,
      supportedMarksOptions: [10, 15],
      wordLimitGuidelines: '150 words (10 marks) · 250 words (15 marks)',
      patternNotes: '20 descriptive analytical questions · 250 marks · 3 hours.',
    },
  },
  {
    paperId: 'mains-gs-4',
    stage: 'mains',
    paperLabel: 'Mains — General Studies Paper IV',
    defaultSubjectName: 'General Studies IV (Ethics, Integrity & Aptitude)',
    defaultPattern: {
      totalMarks: 250,
      durationMinutes: 180,
      negativeMarkingEnabled: false,
      negativeMarksPerWrong: 0,
      supportedMarksOptions: [10, 20],
      wordLimitGuidelines: '150 words (10 marks theory) · 250 words (20 marks case studies)',
      patternNotes: 'Theory & Administrative Case Studies · 250 marks · 3 hours.',
    },
  },
  {
    paperId: 'mains-optional',
    stage: 'mains',
    paperLabel: 'Mains — Optional Subject (Paper I & II)',
    defaultSubjectName: 'Optional Subject',
    defaultPattern: {
      totalMarks: 500,
      durationMinutes: 180,
      negativeMarkingEnabled: false,
      negativeMarksPerWrong: 0,
      supportedMarksOptions: [10, 15, 20],
      wordLimitGuidelines: '150 words (10 marks) · 250 words (15/20 marks)',
      patternNotes: 'Optional Paper I & Paper II (250 marks each) · 3 hours per paper.',
    },
  },
];

export function slugifyUpscKey(value: string): string {
  const cleaned = (value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'subject';
}

export function getUpscPaperMeta(paperId: UpscPaperId): UpscPaperMeta {
  return (
    UPSC_PAPER_DEFINITIONS.find((p) => p.paperId === paperId) || UPSC_PAPER_DEFINITIONS[0]
  );
}

export function getDefaultUpscMarkingPattern(paperId: UpscPaperId): UpscMarkingPattern {
  const meta = getUpscPaperMeta(paperId);
  return { ...meta.defaultPattern };
}

export function resolveUpscSubjectMetadata(params: {
  paperId: UpscPaperId;
  optionalSubjectName?: string;
}): {
  stage: UpscStage;
  paperLabel: string;
  subjectId: string;
  subjectName: string;
  optionalSubjectName?: string;
} {
  const meta = getUpscPaperMeta(params.paperId);
  if (params.paperId === 'mains-optional') {
    const cleanOpt = (params.optionalSubjectName || '').trim() || 'Optional Subject';
    return {
      stage: 'mains',
      paperLabel: meta.paperLabel,
      subjectId: `optional-${slugifyUpscKey(cleanOpt)}`,
      subjectName: cleanOpt,
      optionalSubjectName: cleanOpt,
    };
  }
  return {
    stage: meta.stage,
    paperLabel: meta.paperLabel,
    subjectId: meta.paperId,
    subjectName: meta.defaultSubjectName,
  };
}

export function saveOriginalUpscSyllabusFile(
  buffer: Buffer,
  fileName: string,
): { storageKey: string; ext: string; sizeBytes: number; sha256: string } {
  ensurePrivateStorageDirs();
  if (!buffer || buffer.length === 0) {
    throw new Error('Uploaded UPSC syllabus file is empty.');
  }
  if (buffer.length > MAX_SYLLABUS_FILE_BYTES) {
    throw new Error('Uploaded UPSC syllabus file exceeds the 25 MB size limit.');
  }

  const ext = path.extname(fileName || '').toLowerCase();
  if (!ALLOWED_SYLLABUS_EXTS.has(ext)) {
    throw new Error(
      'Unsupported file format. Upload PDF, DOCX, DOC, XLSX, XLS, CSV, or TXT syllabus files.',
    );
  }

  if (ext === '.pdf') {
    const head = buffer.subarray(0, 5).toString('ascii');
    if (!head.startsWith('%PDF-')) {
      throw new Error('File signature does not match a valid PDF document.');
    }
  } else if (ext === '.docx' || ext === '.xlsx') {
    const zipHead = buffer.subarray(0, 2).toString('ascii');
    if (zipHead !== 'PK') {
      throw new Error(`File signature does not match a valid ${ext.toUpperCase()} document.`);
    }
  }

  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const storageKey = `upsc-${crypto.randomUUID()}${ext}`;
  const targetPath = resolveSafeSyllabusFilePath(storageKey);
  fs.writeFileSync(targetPath, buffer, { mode: 0o600 });
  return {
    storageKey,
    ext: ext.replace('.', '').toUpperCase(),
    sizeBytes: buffer.length,
    sha256,
  };
}

export function normalizeUpscAreas(
  rawAreas: UpscAreaNode[],
): {
  areas: UpscAreaNode[];
  areaCount: number;
  topicCount: number;
  subtopicCount: number;
} {
  let topicCount = 0;
  let subtopicCount = 0;

  const areas: UpscAreaNode[] = (Array.isArray(rawAreas) ? rawAreas : [])
    .map((a, aIdx): UpscAreaNode | null => {
      const title = String(a?.title || '').trim();
      if (!title) return null;
      const topics = (Array.isArray(a.topics) ? a.topics : [])
        .map((t, tIdx) => {
          const tTitle = String(t?.title || '').trim();
          if (!tTitle) return null;
          topicCount++;
          const subtopics = (Array.isArray(t.subtopics) ? t.subtopics : [])
            .map((s, sIdx) => {
              const sTitle = String(s?.title || '').trim();
              if (!sTitle) return null;
              subtopicCount++;
              return {
                subtopicId:
                  String(s?.subtopicId || '').trim() ||
                  `upsc-sub-${aIdx + 1}-${tIdx + 1}-${sIdx + 1}-${crypto.randomUUID().slice(0, 6)}`,
                title: sTitle,
                order: sIdx + 1,
              };
            })
            .filter((x): x is NonNullable<typeof x> => Boolean(x));

          return {
            topicId:
              String(t?.topicId || '').trim() ||
              `upsc-top-${aIdx + 1}-${tIdx + 1}-${crypto.randomUUID().slice(0, 6)}`,
            title: tTitle,
            order: tIdx + 1,
            subtopics,
          };
        })
        .filter((x): x is NonNullable<typeof x> => Boolean(x));

      return {
        areaId:
          String(a?.areaId || '').trim() ||
          `upsc-area-${aIdx + 1}-${crypto.randomUUID().slice(0, 6)}`,
        title,
        order: aIdx + 1,
        topics,
      };
    })
    .filter((x): x is UpscAreaNode => x !== null);

  return {
    areas,
    areaCount: areas.length,
    topicCount,
    subtopicCount,
  };
}

export function findDuplicateUpscUpload(
  db: CentralizedDatabase,
  fileHash: string,
  paperId: UpscPaperId,
  subjectId: string,
): UpscSyllabusRecord | undefined {
  return db.upscSyllabuses.find(
    (r) =>
      r.fileHash === fileHash &&
      r.paperId === paperId &&
      r.subjectId === subjectId &&
      r.publicationStatus !== 'Failed',
  );
}

export function findActiveUpscConflict(
  db: CentralizedDatabase,
  paperId: UpscPaperId,
  subjectId: string,
  excludeVersionId?: string,
): UpscConflictInfo {
  const existing = db.upscSyllabuses.find(
    (r) =>
      r.syllabusVersionId !== excludeVersionId &&
      r.paperId === paperId &&
      r.subjectId === subjectId &&
      r.isActivePublished &&
      r.publicationStatus === 'Published',
  );
  if (!existing) {
    return { hasConflict: false };
  }
  return {
    hasConflict: true,
    existingVersionId: existing.syllabusVersionId,
    existingVersionLabel: existing.versionLabel,
    existingExamYear: existing.examYear,
    existingPublishedAt: existing.publishedAt,
    message: `An active published syllabus (${existing.versionLabel}) already exists for ${existing.paperLabel} (${existing.subjectName}). Choose whether to replace it or publish as a new version.`,
  };
}

export function getPublishedUpscPublicData(db: CentralizedDatabase): UpscPublicCatalogResponse {
  const published = db.upscSyllabuses.filter(
    (r) => r.isActivePublished && r.publicationStatus === 'Published',
  );

  const toPublic = (rec: UpscSyllabusRecord): UpscPublicPaperRecord => ({
    syllabusVersionId: rec.syllabusVersionId,
    stage: rec.stage,
    paperId: rec.paperId,
    paperLabel: rec.paperLabel,
    subjectId: rec.subjectId,
    subjectName: rec.subjectName,
    optionalSubjectName: rec.optionalSubjectName,
    examYear: rec.examYear,
    versionNumber: rec.versionNumber,
    versionLabel: rec.versionLabel,
    markingPattern: rec.markingPattern,
    areaCount: rec.areaCount,
    topicCount: rec.topicCount,
    subtopicCount: rec.subtopicCount,
    publishedAt: rec.publishedAt || rec.updatedAt,
    updatedAt: rec.updatedAt,
    areas: rec.areas,
  });

  const orderMap = new Map<UpscPaperId, number>(
    UPSC_PAPER_DEFINITIONS.map((p, idx) => [p.paperId, idx]),
  );

  const sortPapers = (a: UpscPublicPaperRecord, b: UpscPublicPaperRecord) => {
    const oa = orderMap.get(a.paperId) ?? 99;
    const ob = orderMap.get(b.paperId) ?? 99;
    if (oa !== ob) return oa - ob;
    return a.subjectName.localeCompare(b.subjectName);
  };

  return {
    catalogVersion: db.catalogVersion,
    updatedAt: db.catalogUpdatedAt,
    prelims: published.filter((r) => r.stage === 'prelims').map(toPublic).sort(sortPapers),
    mains: published.filter((r) => r.stage === 'mains').map(toPublic).sort(sortPapers),
  };
}

/**
 * Synchronizes active Published UPSC syllabuses into `db.exams` ('upsc-cse').
 * When NO UPSC syllabus is published, removes `'upsc-cse'` from `db.exams`
 * so generic dropdowns/explorers never display hardcoded UPSC syllabus topics.
 */
export function syncPublishedUpscIntoExams(db: CentralizedDatabase): void {
  const pub = getPublishedUpscPublicData(db);
  const allPub = [...pub.prelims, ...pub.mains];
  const existingIdx = db.exams.findIndex((e) => e.id === 'upsc-cse');

  if (allPub.length === 0) {
    if (existingIdx >= 0) {
      db.exams.splice(existingIdx, 1);
    }
    return;
  }

  const classesOrPapers: SyllabusClassOrPaper[] = allPub.map((rec) => ({
    id: rec.paperId === 'mains-optional' ? rec.subjectId : rec.paperId,
    label:
      rec.paperId === 'mains-optional'
        ? `Mains Optional: ${rec.subjectName} (${rec.versionLabel})`
        : `${rec.paperLabel} (${rec.versionLabel})`,
    academicSession: rec.examYear,
    mediums: ['English Medium', 'Hindi Medium'],
    subjects: rec.areas.map((area) => ({
      name: area.title,
      chapters:
        area.topics.length > 0
          ? area.topics.map((t) => ({
              name: t.title,
              topics:
                t.subtopics.length > 0
                  ? t.subtopics.map((s) => s.title)
                  : [t.title],
              subtopics: t.subtopics.map((s) => s.title),
            }))
          : [{ name: area.title, topics: [area.title] }],
    })),
  }));

  const upscExamDef: ExamDefinition = {
    id: 'upsc-cse',
    category: 'upsc',
    name: 'UPSC – Civil Services Examination',
    boardName: 'Union Public Service Commission (UPSC)',
    academicSession: allPub[0]?.examYear || '2026',
    status: 'Published',
    updatedAt: Date.now(),
    shortDesc: 'Admin-Published UPSC Civil Services Prelims & Mains Syllabuses',
    defaultMarksPerQuestion: 2,
    defaultNegativeMarking: true,
    defaultNegativePenalty: 0.66,
    classesOrPapers,
  };

  if (existingIdx >= 0) {
    db.exams[existingIdx] = upscExamDef;
  } else {
    db.exams.push(upscExamDef);
  }
}

export function flagOutdatedUpscQuestions(
  db: CentralizedDatabase,
  paperId: UpscPaperId,
  subjectId: string,
  activeAreas: UpscAreaNode[],
  reasonLabel: string,
): number {
  const validAreaIds = new Set(activeAreas.map((a) => a.areaId));
  const validAreaTitles = new Set(activeAreas.map((a) => a.title.trim().toLowerCase()));
  const validTopicIds = new Set<string>();
  const validTopicTitles = new Set<string>();

  for (const a of activeAreas) {
    for (const t of a.topics) {
      validTopicIds.add(t.topicId);
      validTopicTitles.add(t.title.trim().toLowerCase());
    }
  }

  let flagged = 0;
  for (const q of db.questions) {
    if (q.examId !== 'upsc-cse') continue;
    const qPaper = q.upscPaperId || q.paperId;
    if (qPaper !== paperId) continue;
    if (paperId === 'mains-optional') {
      const qSubjKey = q.subjectId || slugifyUpscKey(q.subject);
      if (qSubjKey !== subjectId) continue;
    }

    const areaStillPresent =
      (q.areaId && validAreaIds.has(q.areaId)) ||
      validAreaTitles.has((q.subject || '').trim().toLowerCase());
    const topicStillPresent =
      !q.topic ||
      q.topic === 'All Chapter Topics' ||
      (q.topicId && validTopicIds.has(q.topicId)) ||
      validTopicTitles.has(q.topic.trim().toLowerCase()) ||
      validTopicTitles.has((q.chapter || '').trim().toLowerCase());

    if (!areaStillPresent || !topicStillPresent) {
      q.needsReview = true;
      q.syllabusChangeReason = reasonLabel;
      q.updatedAt = Date.now();
      flagged++;
    }
  }
  return flagged;
}

export function publishUpscSyllabusVersion(
  db: CentralizedDatabase,
  versionId: string,
  resolutionMode: 'replace' | 'new-version' = 'new-version',
): {
  record: UpscSyllabusRecord;
  flaggedQuestions: number;
  replacedVersionId?: string;
} {
  const target = db.upscSyllabuses.find((r) => r.syllabusVersionId === versionId);
  if (!target) {
    throw new Error('UPSC syllabus draft/version not found.');
  }
  if (target.areas.length === 0) {
    throw new Error('Cannot publish an empty UPSC syllabus. Add at least one subject/area first.');
  }

  const now = Date.now();
  const previousActive = db.upscSyllabuses.find(
    (r) =>
      r.syllabusVersionId !== target.syllabusVersionId &&
      r.paperId === target.paperId &&
      r.subjectId === target.subjectId &&
      r.isActivePublished,
  );

  let replacedVersionId: string | undefined;
  if (previousActive) {
    replacedVersionId = previousActive.syllabusVersionId;
    previousActive.isActivePublished = false;
    previousActive.publicationStatus =
      resolutionMode === 'replace' ? 'Archived' : 'Unpublished';
    previousActive.updatedAt = now;
  }

  const maxExistingVer = db.upscSyllabuses
    .filter(
      (r) =>
        r.syllabusVersionId !== target.syllabusVersionId &&
        r.paperId === target.paperId &&
        r.subjectId === target.subjectId,
    )
    .reduce((m, r) => Math.max(m, r.versionNumber || 1), 0);

  if (target.versionNumber <= maxExistingVer) {
    target.versionNumber =
      resolutionMode === 'replace' && previousActive
        ? Math.max(target.versionNumber, previousActive.versionNumber)
        : maxExistingVer + 1;
    target.versionLabel = `v${target.versionNumber} (${target.examYear || 'Latest'})`;
  }

  target.isActivePublished = true;
  target.publicationStatus = 'Published';
  target.publishedAt = now;
  target.updatedAt = now;

  syncPublishedUpscIntoExams(db);

  const flaggedQuestions = flagOutdatedUpscQuestions(
    db,
    target.paperId,
    target.subjectId,
    target.areas,
    `UPSC ${target.paperLabel} (${target.subjectName}) ${target.versionLabel} published`,
  );

  return { record: target, flaggedQuestions, replacedVersionId };
}

export function unpublishUpscSyllabusVersion(
  db: CentralizedDatabase,
  versionId: string,
): { record: UpscSyllabusRecord; flaggedQuestions: number } {
  const target = db.upscSyllabuses.find((r) => r.syllabusVersionId === versionId);
  if (!target) {
    throw new Error('UPSC syllabus version not found.');
  }
  const now = Date.now();
  target.isActivePublished = false;
  target.publicationStatus = 'Unpublished';
  target.updatedAt = now;

  syncPublishedUpscIntoExams(db);

  const flaggedQuestions = flagOutdatedUpscQuestions(
    db,
    target.paperId,
    target.subjectId,
    [],
    `UPSC ${target.paperLabel} (${target.subjectName}) unpublished by Admin`,
  );

  return { record: target, flaggedQuestions };
}

export function computeUpscAdminSummary(db: CentralizedDatabase): UpscAdminSummary {
  const all = db.upscSyllabuses;
  const active = all.filter((r) => r.isActivePublished && r.publicationStatus === 'Published');
  const prelimsActive = active.filter((r) => r.stage === 'prelims');
  const mainsActive = active.filter((r) => r.stage === 'mains');
  const optionalActive = mainsActive.filter((r) => r.paperId === 'mains-optional');
  const latestOverall = [...all].sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const outdatedQuestionsCount = db.questions.filter(
    (q) => q.examId === 'upsc-cse' && q.needsReview,
  ).length;

  return {
    prelimsPublishedCount: prelimsActive.length,
    mainsPublishedCount: mainsActive.length,
    optionalPublishedCount: optionalActive.length,
    totalRecords: all.length,
    totalAreas: active.reduce((s, r) => s + r.areaCount, 0),
    totalTopics: active.reduce((s, r) => s + r.topicCount, 0),
    latestUpdatedAt: latestOverall?.updatedAt,
    outdatedQuestionsCount,
  };
}


