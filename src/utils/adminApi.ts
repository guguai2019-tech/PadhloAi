import type {
  AdminAiConfig,
  AdminAiOverview,
  AdminAuthStatus,
  AdminDashboardStats,
  AdminQuestionRecord,
  AiSelectionMode,
  DifficultyLevel,
  ExamDefinition,
  MockLanguage,
  MockQuestion,
  PdfNoteCategory,
  PdfNoteMetadata,
  ProviderConnectionState,
  ProviderId,
  StudentRecord,
  SyllabusUploadRecord,
  UgcNetAdminOverviewResponse,
  UgcNetAdminSummary,
  UgcNetConflictInfo,
  UgcNetMockTestMode,
  UgcNetPaperType,
  UgcNetPublicCatalogResponse,
  UgcNetSyllabusRecord,
  UgcNetUnitNode,
  UpscAdminOverviewResponse,
  UpscAdminSummary,
  UpscAreaNode,
  UpscConflictInfo,
  UpscGeneratedQuestionItem,
  UpscMainsAnswerResult,
  UpscMainsEvaluationResult,
  UpscMarkingPattern,
  UpscMockTestMode,
  UpscPaperId,
  UpscPublicCatalogResponse,
  UpscQuestionFormatId,
  UpscStage,
  UpscStudyGuidanceResult,
  UpscSyllabusRecord,
} from '../types';

export interface CatalogResponse {
  exams: ExamDefinition[];
  pdfNotes: PdfNoteMetadata[];
  questionBankCount: number;
  version: number;
  updatedAt: number;
}

export interface SyllabusConflictInfo {
  exists: boolean;
  examId?: string;
  examName?: string;
  classId?: string;
  classLabel?: string;
  existingSessions?: string[];
}

export interface AdminOverviewResponse {
  stats: AdminDashboardStats;
  exams: ExamDefinition[];
  syllabusUploads: SyllabusUploadRecord[];
  questions: AdminQuestionRecord[];
  pdfNotes: PdfNoteMetadata[];
  students: StudentRecord[];
  catalogVersion?: number;
  catalogUpdatedAt?: number;
}

async function apiJson<T>(
  url: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    cache: 'no-store',
    ...options,
    headers,
  });

  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const clean = result.includes(',') ? result.split(',').pop() || '' : result;
      resolve(clean);
    };
    reader.onerror = () => reject(new Error(`Failed to read file "${file.name}".`));
    reader.readAsDataURL(file);
  });
}

// ===================== PUBLIC & STUDENT ENDPOINTS =====================

export function fetchCatalog(): Promise<CatalogResponse> {
  return apiJson<CatalogResponse>('/api/catalog');
}

export function fetchCentralQuestions(params?: {
  examId?: string;
  subject?: string;
  chapter?: string;
  typeId?: string;
}): Promise<{ questions: AdminQuestionRecord[] }> {
  const search = new URLSearchParams();
  if (params?.examId) search.set('examId', params.examId);
  if (params?.subject) search.set('subject', params.subject);
  if (params?.chapter) search.set('chapter', params.chapter);
  if (params?.typeId) search.set('typeId', params.typeId);
  const qs = search.toString();
  return apiJson<{ questions: AdminQuestionRecord[] }>(
    `/api/questions${qs ? `?${qs}` : ''}`,
  );
}

export function createStudentSession(payload?: {
  name?: string;
  email?: string;
  rollNumber?: string;
  classLevel?: string;
  examId?: string;
}): Promise<{ token: string; student: StudentRecord | null }> {
  return apiJson<{ token: string; student: StudentRecord | null }>(
    '/api/student/session',
    {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    },
  );
}

export function fetchPublishedPdfNotes(params?: {
  examId?: string;
  subject?: string;
  chapter?: string;
  noteCategory?: PdfNoteCategory;
  ncertClass?: string;
  upscStage?: UpscStage;
}): Promise<{ notes: PdfNoteMetadata[] }> {
  const search = new URLSearchParams();
  if (params?.examId) search.set('examId', params.examId);
  if (params?.subject) search.set('subject', params.subject);
  if (params?.chapter) search.set('chapter', params.chapter);
  if (params?.noteCategory) search.set('noteCategory', params.noteCategory);
  if (params?.ncertClass) search.set('ncertClass', params.ncertClass);
  if (params?.upscStage) search.set('upscStage', params.upscStage);
  const qs = search.toString();
  return apiJson<{ notes: PdfNoteMetadata[] }>(`/api/pdf-notes${qs ? `?${qs}` : ''}`);
}

export async function fetchProtectedPdfBytes(
  noteId: string,
  token: string,
): Promise<Uint8Array> {
  const res = await fetch(`/api/pdf-notes/${encodeURIComponent(noteId)}/stream`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(errBody.error || `Unable to load protected PDF (${res.status}).`);
  }
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

// ===================== ADMIN AUTH ENDPOINTS =====================

export function getAdminAuthStatus(token?: string | null): Promise<AdminAuthStatus> {
  return apiJson<AdminAuthStatus>('/api/admin/auth/status', { method: 'GET' }, token);
}

export function setupInitialAdmin(
  adminId: string,
  password: string,
): Promise<{ token: string; adminId: string }> {
  return apiJson<{ token: string; adminId: string }>('/api/admin/auth/setup', {
    method: 'POST',
    body: JSON.stringify({ adminId, password }),
  });
}

export function loginAdmin(
  adminId: string,
  password: string,
): Promise<{ token: string; adminId: string }> {
  return apiJson<{ token: string; adminId: string }>('/api/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({ adminId, password }),
  });
}

export function logoutAdmin(token: string): Promise<{ ok: boolean }> {
  return apiJson<{ ok: boolean }>('/api/admin/auth/logout', { method: 'POST' }, token);
}

export function changeAdminPassword(
  token: string,
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: boolean; adminId: string }> {
  return apiJson<{ ok: boolean; adminId: string }>(
    '/api/admin/auth/change-password',
    {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    },
    token,
  );
}

export function changeAdminIdApi(
  token: string,
  currentPassword: string,
  newAdminId: string,
): Promise<{ ok: boolean; token: string; adminId: string; message?: string }> {
  return apiJson<{ ok: boolean; token: string; adminId: string; message?: string }>(
    '/api/admin/auth/change-id',
    {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newAdminId }),
    },
    token,
  );
}

// ===================== ADMIN CRUD ENDPOINTS =====================

export function fetchAdminOverview(token: string): Promise<AdminOverviewResponse> {
  return apiJson<AdminOverviewResponse>('/api/admin/overview', { method: 'GET' }, token);
}

export function uploadAndProcessSyllabus(
  token: string,
  payload: {
    fileName: string;
    mimeType?: string;
    fileBase64: string;
    targetExamId?: string;
    targetClassId?: string;
    examName?: string;
    boardName?: string;
    classLabel?: string;
    academicSession?: string;
    subjectHint?: string;
    language?: MockLanguage;
  },
): Promise<{
  upload: SyllabusUploadRecord;
  extractedCharCount: number;
  conflict: SyllabusConflictInfo;
}> {
  return apiJson<{
    upload: SyllabusUploadRecord;
    extractedCharCount: number;
    conflict: SyllabusConflictInfo;
  }>(
    '/api/admin/syllabus/process',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token,
  );
}

export function updateSyllabusDraft(
  token: string,
  id: string,
  patch: Partial<SyllabusUploadRecord>,
): Promise<{ upload: SyllabusUploadRecord }> {
  return apiJson<{ upload: SyllabusUploadRecord }>(
    `/api/admin/syllabus/${encodeURIComponent(id)}`,
    {
      method: 'PUT',
      body: JSON.stringify(patch),
    },
    token,
  );
}

export function publishSyllabusDraft(
  token: string,
  id: string,
  payload?: Partial<SyllabusUploadRecord> & {
    resolutionMode?: 'replace' | 'new-session' | 'merge';
    targetExamId?: string;
    targetClassId?: string;
  },
): Promise<{
  upload: SyllabusUploadRecord;
  exam: ExamDefinition;
  flaggedQuestions: number;
  stats: AdminDashboardStats;
  catalogVersion: number;
}> {
  return apiJson<{
    upload: SyllabusUploadRecord;
    exam: ExamDefinition;
    flaggedQuestions: number;
    stats: AdminDashboardStats;
    catalogVersion: number;
  }>(
    `/api/admin/syllabus/${encodeURIComponent(id)}/publish`,
    {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    },
    token,
  );
}

export function deleteSyllabusDraft(
  token: string,
  id: string,
): Promise<{ ok: boolean; stats: AdminDashboardStats }> {
  return apiJson<{ ok: boolean; stats: AdminDashboardStats }>(
    `/api/admin/syllabus/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
    token,
  );
}

export function createAdminExam(
  token: string,
  exam: ExamDefinition,
): Promise<{ exam: ExamDefinition; stats: AdminDashboardStats }> {
  return apiJson<{ exam: ExamDefinition; stats: AdminDashboardStats }>(
    '/api/admin/exams',
    {
      method: 'POST',
      body: JSON.stringify(exam),
    },
    token,
  );
}

export function updateAdminExam(
  token: string,
  id: string,
  exam: ExamDefinition,
): Promise<{
  exam: ExamDefinition;
  flaggedQuestions: number;
  stats: AdminDashboardStats;
}> {
  return apiJson<{
    exam: ExamDefinition;
    flaggedQuestions: number;
    stats: AdminDashboardStats;
  }>(
    `/api/admin/exams/${encodeURIComponent(id)}`,
    {
      method: 'PUT',
      body: JSON.stringify(exam),
    },
    token,
  );
}

export function deleteAdminExam(
  token: string,
  id: string,
): Promise<{ ok: boolean; flaggedQuestions: number; stats: AdminDashboardStats }> {
  return apiJson<{ ok: boolean; flaggedQuestions: number; stats: AdminDashboardStats }>(
    `/api/admin/exams/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
    token,
  );
}

export function createAdminQuestion(
  token: string,
  question: Partial<AdminQuestionRecord>,
): Promise<{ question: AdminQuestionRecord; stats: AdminDashboardStats }> {
  return apiJson<{ question: AdminQuestionRecord; stats: AdminDashboardStats }>(
    '/api/admin/questions',
    {
      method: 'POST',
      body: JSON.stringify(question),
    },
    token,
  );
}

export function bulkUploadAdminQuestions(
  token: string,
  items: Array<Partial<AdminQuestionRecord>>,
): Promise<{
  addedCount: number;
  questions: AdminQuestionRecord[];
  stats: AdminDashboardStats;
}> {
  return apiJson<{
    addedCount: number;
    questions: AdminQuestionRecord[];
    stats: AdminDashboardStats;
  }>(
    '/api/admin/questions/bulk',
    {
      method: 'POST',
      body: JSON.stringify({ items }),
    },
    token,
  );
}

export function updateAdminQuestion(
  token: string,
  id: string,
  patch: Partial<AdminQuestionRecord>,
): Promise<{ question: AdminQuestionRecord; stats: AdminDashboardStats }> {
  return apiJson<{ question: AdminQuestionRecord; stats: AdminDashboardStats }>(
    `/api/admin/questions/${encodeURIComponent(id)}`,
    {
      method: 'PUT',
      body: JSON.stringify(patch),
    },
    token,
  );
}

export function deleteAdminQuestion(
  token: string,
  id: string,
): Promise<{ ok: boolean; stats: AdminDashboardStats }> {
  return apiJson<{ ok: boolean; stats: AdminDashboardStats }>(
    `/api/admin/questions/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
    token,
  );
}

export function uploadAdminPdfNote(
  token: string,
  payload: {
    title: string;
    description?: string;
    noteCategory?: PdfNoteCategory;
    examId: string;
    examName: string;
    classId: string;
    classLabel: string;
    subject: string;
    bookName?: string;
    ncertClass?: string;
    upscStage?: UpscStage;
    upscPaper?: string;
    chapter: string;
    topic?: string;
    language: MockLanguage;
    published: boolean;
    fileName: string;
    fileBase64: string;
  },
): Promise<{ note: PdfNoteMetadata; stats: AdminDashboardStats }> {
  return apiJson<{ note: PdfNoteMetadata; stats: AdminDashboardStats }>(
    '/api/admin/pdf-notes',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token,
  );
}

export function updateAdminPdfNote(
  token: string,
  id: string,
  payload: Partial<{
    title: string;
    description: string;
    noteCategory: PdfNoteCategory;
    examId: string;
    examName: string;
    classId: string;
    classLabel: string;
    subject: string;
    bookName: string;
    ncertClass: string;
    upscStage: UpscStage;
    upscPaper: string;
    chapter: string;
    topic: string;
    language: MockLanguage;
    published: boolean;
    fileName: string;
    fileBase64: string;
  }>,
): Promise<{ note: PdfNoteMetadata; stats: AdminDashboardStats }> {
  return apiJson<{ note: PdfNoteMetadata; stats: AdminDashboardStats }>(
    `/api/admin/pdf-notes/${encodeURIComponent(id)}`,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
    token,
  );
}

export function deleteAdminPdfNote(
  token: string,
  id: string,
): Promise<{ ok: boolean; stats: AdminDashboardStats }> {
  return apiJson<{ ok: boolean; stats: AdminDashboardStats }>(
    `/api/admin/pdf-notes/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
    token,
  );
}

export function createAdminStudent(
  token: string,
  student: Partial<StudentRecord>,
): Promise<{ student: StudentRecord; stats: AdminDashboardStats }> {
  return apiJson<{ student: StudentRecord; stats: AdminDashboardStats }>(
    '/api/admin/students',
    {
      method: 'POST',
      body: JSON.stringify(student),
    },
    token,
  );
}

export function updateAdminStudent(
  token: string,
  id: string,
  patch: Partial<StudentRecord>,
): Promise<{ student: StudentRecord; stats: AdminDashboardStats }> {
  return apiJson<{ student: StudentRecord; stats: AdminDashboardStats }>(
    `/api/admin/students/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(patch),
    },
    token,
  );
}

export function deleteAdminStudent(
  token: string,
  id: string,
): Promise<{ ok: boolean; stats: AdminDashboardStats }> {
  return apiJson<{ ok: boolean; stats: AdminDashboardStats }>(
    `/api/admin/students/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
    token,
  );
}

// ===================== ADMIN AI PROVIDER CONFIG ENDPOINTS =====================

export function fetchAdminAiConfig(token: string): Promise<AdminAiOverview> {
  return apiJson<AdminAiOverview>('/api/admin/ai-config', { method: 'GET' }, token);
}

export function updateAdminAiConfig(
  token: string,
  patch: Partial<AdminAiConfig>,
): Promise<AdminAiOverview> {
  return apiJson<AdminAiOverview>(
    '/api/admin/ai-config',
    {
      method: 'PUT',
      body: JSON.stringify(patch),
    },
    token,
  );
}

export function testAdminAiConnection(
  token: string,
  payload: { provider: ProviderId; ollamaBaseUrl?: string },
): Promise<{
  ok: boolean;
  provider: ProviderId;
  connectionState: ProviderConnectionState;
  message: string;
  modelsCount: number;
}> {
  return apiJson<{
    ok: boolean;
    provider: ProviderId;
    connectionState: ProviderConnectionState;
    message: string;
    modelsCount: number;
  }>(
    '/api/admin/ai-config/test',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token,
  );
}

// ===================== UGC NET CENTRALIZED SYLLABUS & GENERATION API =====================

export function fetchPublishedUgcNetSyllabus(): Promise<UgcNetPublicCatalogResponse> {
  return apiJson<UgcNetPublicCatalogResponse>(`/api/syllabus/ugc-net?_t=${Date.now()}`, {
    method: 'GET',
  });
}

export interface GeneratedUgcNetQuestionItem {
  number: number;
  examId: 'ugc-net';
  paperId: UgcNetPaperType;
  subjectId: string;
  subjectName: string;
  syllabusVersionId: string;
  syllabusVersionLabel: string;
  unitId: string;
  unitTitle: string;
  topicId: string;
  topicTitle: string;
  questionType: string;
  difficulty: string;
  marks: number;
  question: string;
  assertionText?: string;
  reasonText?: string;
  matchColumns?: { columnA: string[]; columnB: string[] };
  options?: string[];
  correctAnswer: string;
  correctOptionIndices?: number[];
  explanation: string;
  valid: boolean;
}

export function generateUgcNetQuestionsApi(payload: {
  paperType: UgcNetPaperType;
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
}): Promise<{
  syllabusVersionId: string;
  syllabusVersionLabel: string;
  paperId: UgcNetPaperType;
  subjectId: string;
  subjectName: string;
  providerUsed: string;
  modelUsed: string;
  questions: GeneratedUgcNetQuestionItem[];
}> {
  return apiJson('/api/ugc-net/questions/generate', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function generateUgcNetMockTestApi(payload: {
  paperType: UgcNetPaperType;
  subjectId?: string;
  syllabusVersionId?: string;
  testMode: UgcNetMockTestMode;
  unitIds?: string[];
  topicIds?: string[];
  questionCount: number;
  difficulty: DifficultyLevel;
  language: MockLanguage;
  selectionMode?: AiSelectionMode;
  provider?: ProviderId;
  model?: string;
}): Promise<{
  questions: MockQuestion[];
  syllabusVersionId: string;
  syllabusVersionLabel: string;
  paperId: UgcNetPaperType;
  subjectId: string;
  subjectName: string;
  providerUsed: string;
  modelUsed: string;
}> {
  return apiJson('/api/ugc-net/mock-test/generate', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchAdminUgcNetSyllabuses(
  token: string,
): Promise<UgcNetAdminOverviewResponse> {
  return apiJson<UgcNetAdminOverviewResponse>(
    '/api/admin/ugc-net/syllabuses',
    { method: 'GET' },
    token,
  );
}

export function processAdminUgcNetSyllabus(
  token: string,
  payload: {
    fileName: string;
    mimeType: string;
    fileBase64: string;
    paperType: UgcNetPaperType;
    subjectName?: string;
    subjectCode?: string;
    academicSession?: string;
    selectionMode?: AiSelectionMode;
    provider?: ProviderId;
    model?: string;
    allowDuplicate?: boolean;
  },
): Promise<{
  syllabus: UgcNetSyllabusRecord;
  conflict: UgcNetConflictInfo;
  extractedCharCount: number;
  summary: UgcNetAdminSummary;
}> {
  return apiJson(
    '/api/admin/ugc-net/syllabus/process',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token,
  );
}

export function updateAdminUgcNetSyllabus(
  token: string,
  id: string,
  payload: {
    subjectName?: string;
    subjectCode?: string;
    academicSession?: string;
    warnings?: string[];
    units?: UgcNetUnitNode[];
  },
): Promise<{
  syllabus: UgcNetSyllabusRecord;
  conflict: UgcNetConflictInfo;
  flaggedQuestions: number;
  catalogVersion: number;
  summary: UgcNetAdminSummary;
}> {
  return apiJson(
    `/api/admin/ugc-net/syllabuses/${encodeURIComponent(id)}`,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
    token,
  );
}

export function publishAdminUgcNetSyllabus(
  token: string,
  id: string,
  payload: {
    resolutionMode?: 'replace' | 'new-version';
    units?: UgcNetUnitNode[];
    academicSession?: string;
    subjectName?: string;
    subjectCode?: string;
  },
): Promise<{
  syllabus: UgcNetSyllabusRecord;
  flaggedQuestions: number;
  replacedVersionId?: string;
  catalogVersion: number;
  stats: AdminDashboardStats;
  summary: UgcNetAdminSummary;
}> {
  return apiJson(
    `/api/admin/ugc-net/syllabuses/${encodeURIComponent(id)}/publish`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token,
  );
}

export function unpublishAdminUgcNetSyllabus(
  token: string,
  id: string,
): Promise<{
  syllabus: UgcNetSyllabusRecord;
  flaggedQuestions: number;
  catalogVersion: number;
  stats: AdminDashboardStats;
  summary: UgcNetAdminSummary;
}> {
  return apiJson(
    `/api/admin/ugc-net/syllabuses/${encodeURIComponent(id)}/unpublish`,
    {
      method: 'POST',
    },
    token,
  );
}

export function deleteAdminUgcNetSyllabus(
  token: string,
  id: string,
): Promise<{
  ok: boolean;
  catalogVersion: number;
  stats: AdminDashboardStats;
  summary: UgcNetAdminSummary;
}> {
  return apiJson(
    `/api/admin/ugc-net/syllabuses/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
    token,
  );
}

export async function downloadAdminUgcNetSyllabusFile(
  token: string,
  id: string,
  fallbackFileName: string,
): Promise<void> {
  const res = await fetch(`/api/admin/ugc-net/syllabuses/${encodeURIComponent(id)}/file`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(errText || `Download failed (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fallbackFileName || 'ugc-net-syllabus.pdf';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ===================== UPSC CENTRALIZED SYLLABUS & AI PREPARATION APIS =====================

export function fetchPublishedUpscSyllabus(): Promise<UpscPublicCatalogResponse> {
  return apiJson<UpscPublicCatalogResponse>(`/api/syllabus/upsc?_t=${Date.now()}`, {
    method: 'GET',
  });
}

export function generateUpscQuestionsApi(payload: {
  syllabusVersionId: string;
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
}): Promise<{
  questions: UpscGeneratedQuestionItem[];
  syllabusVersionId: string;
  versionLabel: string;
  paperLabel: string;
  providerUsed: string;
  modelUsed: string;
}> {
  return apiJson('/api/upsc/questions/generate', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function generateUpscMockTestApi(payload: {
  syllabusVersionId?: string;
  paperId?: UpscPaperId;
  testMode: UpscMockTestMode;
  areaIds?: string[];
  topicIds?: string[];
  questionCount: number;
  difficulty: DifficultyLevel;
  language: MockLanguage;
  selectionMode?: AiSelectionMode;
  provider?: ProviderId;
  model?: string;
}): Promise<{
  questions: MockQuestion[];
  syllabusVersionId: string;
  versionLabel: string;
  paperId: UpscPaperId;
  paperLabel: string;
  markingPattern: UpscMarkingPattern;
  providerUsed: string;
  modelUsed: string;
}> {
  return apiJson('/api/upsc/mock-test/generate', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function generateUpscMainsAnswerApi(payload: {
  syllabusVersionId?: string;
  paperLabel?: string;
  subjectArea?: string;
  questionOrTopic: string;
  marks: number;
  wordLimit: number;
  language: MockLanguage;
  selectionMode?: AiSelectionMode;
  provider?: ProviderId;
  model?: string;
}): Promise<{
  result: UpscMainsAnswerResult;
  providerUsed: string;
  modelUsed: string;
}> {
  return apiJson('/api/upsc/mains/generate-answer', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function evaluateUpscMainsAnswerApi(payload: {
  paperLabel?: string;
  question: string;
  studentAnswer: string;
  marks: number;
  wordLimit: number;
  language: MockLanguage;
  selectionMode?: AiSelectionMode;
  provider?: ProviderId;
  model?: string;
}): Promise<{
  evaluation: UpscMainsEvaluationResult;
  providerUsed: string;
  modelUsed: string;
}> {
  return apiJson('/api/upsc/mains/evaluate-answer', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function generateUpscStudyGuidanceApi(payload: {
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
}): Promise<{
  guidance: UpscStudyGuidanceResult;
  providerUsed: string;
  modelUsed: string;
}> {
  return apiJson('/api/upsc/study-guidance', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchAdminUpscSyllabuses(token: string): Promise<UpscAdminOverviewResponse> {
  return apiJson<UpscAdminOverviewResponse>(
    '/api/admin/upsc/syllabuses',
    { method: 'GET' },
    token,
  );
}

export function processAdminUpscSyllabus(
  token: string,
  payload: {
    fileName: string;
    mimeType: string;
    fileBase64: string;
    paperId: UpscPaperId;
    optionalSubjectName?: string;
    examYear?: string;
    selectionMode?: AiSelectionMode;
    provider?: ProviderId;
    model?: string;
  },
): Promise<{
  duplicateDetected: boolean;
  message?: string;
  draft: UpscSyllabusRecord;
  conflict: UpscConflictInfo;
  summary: UpscAdminSummary;
}> {
  return apiJson(
    '/api/admin/upsc/syllabus/process',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token,
  );
}

export function updateAdminUpscSyllabus(
  token: string,
  id: string,
  payload: {
    optionalSubjectName?: string;
    examYear?: string;
    markingPattern?: Partial<UpscMarkingPattern>;
    areas?: UpscAreaNode[];
  },
): Promise<{
  syllabus: UpscSyllabusRecord;
  conflict: UpscConflictInfo;
  flaggedQuestions: number;
  catalogVersion: number;
  summary: UpscAdminSummary;
}> {
  return apiJson(
    `/api/admin/upsc/syllabuses/${encodeURIComponent(id)}`,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
    token,
  );
}

export function publishAdminUpscSyllabus(
  token: string,
  id: string,
  payload: {
    resolutionMode?: 'replace' | 'new-version';
  },
): Promise<{
  syllabus: UpscSyllabusRecord;
  flaggedQuestions: number;
  replacedVersionId?: string;
  catalogVersion: number;
  stats: AdminDashboardStats;
  summary: UpscAdminSummary;
}> {
  return apiJson(
    `/api/admin/upsc/syllabuses/${encodeURIComponent(id)}/publish`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token,
  );
}

export function unpublishAdminUpscSyllabus(
  token: string,
  id: string,
): Promise<{
  syllabus: UpscSyllabusRecord;
  flaggedQuestions: number;
  catalogVersion: number;
  stats: AdminDashboardStats;
  summary: UpscAdminSummary;
}> {
  return apiJson(
    `/api/admin/upsc/syllabuses/${encodeURIComponent(id)}/unpublish`,
    {
      method: 'POST',
    },
    token,
  );
}

export function deleteAdminUpscSyllabus(
  token: string,
  id: string,
): Promise<{
  ok: boolean;
  catalogVersion: number;
  stats: AdminDashboardStats;
  summary: UpscAdminSummary;
}> {
  return apiJson(
    `/api/admin/upsc/syllabuses/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
    token,
  );
}

export async function downloadAdminUpscSyllabusFile(
  token: string,
  id: string,
  fallbackFileName: string,
): Promise<void> {
  const res = await fetch(`/api/admin/upsc/syllabuses/${encodeURIComponent(id)}/file`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(errText || `Download failed (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fallbackFileName || 'upsc-syllabus.pdf';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}



