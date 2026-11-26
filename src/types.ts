export type ModuleId =
  | 'chat'
  | 'syllabus'
  | 'pdf'
  | 'mock-test'
  | 'questions'
  | 'pdf-notes'
  | 'upsc'
  | 'lesson-plan'
  | 'video-generator'
  | 'my-videos'
  | 'notes'
  | 'image'
  | 'writing'
  | 'math'
  | 'coding'
  | 'planner'
  | 'history'
  | 'settings'
  | 'admin';

export type LanguageMode = 'auto' | 'english' | 'hindi' | 'odia' | 'bilingual';

export type MockLanguage = 'english' | 'hindi' | 'odia';

export type ProviderId = 'gemini' | 'ollama';

export type AiSelectionMode = 'auto' | 'gemini' | 'ollama';

export type ProviderConnectionState =
  | 'connected'
  | 'disconnected'
  | 'no-models'
  | 'error'
  | 'disabled';

export interface ModelInfo {
  id: string;
  provider: ProviderId;
  name: string;
  description: string;
  supportsVision: boolean;
  supportsStreaming: boolean;
  supportsJson: boolean;
  contextWindowLabel: string;
  isOpenSource: boolean;
  enabled?: boolean;
  sizeLabel?: string;
  family?: string;
}

export interface ProviderStatus {
  id: ProviderId;
  name: string;
  description: string;
  enabled: boolean;
  configured: boolean;
  available: boolean;
  connectionState: ProviderConnectionState;
  statusMessage: string;
  endpointLabel?: string;
  models: ModelInfo[];
}

export interface PublicAiPolicy {
  defaultProvider: ProviderId;
  backupProvider: ProviderId | 'none';
  fallbackEnabled: boolean;
  geminiEnabled: boolean;
  ollamaEnabled: boolean;
  ollamaUrlConfigured: boolean;
  ollamaEndpointType: 'localhost' | 'remote' | 'unset';
  isCloudDeployment: boolean;
}

export interface AdminAiConfig {
  geminiEnabled: boolean;
  ollamaEnabled: boolean;
  defaultProvider: ProviderId;
  backupProvider: ProviderId | 'none';
  fallbackEnabled: boolean;
  ollamaBaseUrl: string;
  disabledModels: string[];
  updatedAt: number;
}

export interface AdminAiOverview {
  config: AdminAiConfig;
  effectiveOllamaBaseUrl: string;
  hasGeminiKey: boolean;
  hasOllamaApiKey: boolean;
  isCloudDeployment: boolean;
  providers: ProviderStatus[];
}

export interface ChatAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: 'pdf' | 'docx' | 'text' | 'csv' | 'image';
  status: 'processing' | 'ready' | 'error';
  errorMessage?: string;
  extractedText?: string;
  pageCount?: number;
  imageDataUrl?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  attachments?: ChatAttachment[];
  feedback?: 'like' | 'dislike' | null;
  modelUsed?: string;
  providerUsed?: ProviderId;
  fallbackUsed?: boolean;
  fallbackFrom?: ProviderId;
  fallbackReason?: string;
  isError?: boolean;
}

export interface ChatThread {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  selectionMode?: AiSelectionMode;
  provider?: ProviderId;
  model?: string;
  messages: ChatMessage[];
}

export type DifficultyLevel = 'Easy' | 'Medium' | 'Hard' | 'Mixed';

export type ExamCategoryId =
  | 'odisha-board'
  | 'cbse'
  | 'ugc-net'
  | 'upsc'
  | 'competitive'
  | 'combined';

export type ExamQuestionType =
  | 'MCQ'
  | 'Multiple-Select'
  | 'True-False'
  | 'Assertion-Reasoning'
  | 'Match-Following'
  | 'Statement-Based'
  | 'Numerical'
  | 'Comprehension'
  | 'Mixed';

export type TestScope =
  | 'full-syllabus'
  | 'term-1'
  | 'term-2'
  | 'half-yearly'
  | 'annual'
  | 'subject-wise'
  | 'chapter-wise';

export type UserAnswerValue = number | number[] | string;

export interface MockTestConfig {
  category: ExamCategoryId;
  examName: string;
  medium?: 'Odia Medium' | 'English Medium' | 'Hindi Medium';
  classOrPaper: string;
  subject: string;
  chapter: string;
  selectedChapters?: string[];
  topic: string;
  scope: TestScope;
  difficulty: DifficultyLevel;
  questionType: ExamQuestionType;
  questionCount: number;
  durationMinutes: number;
  practiceMode: boolean;
  language: MockLanguage;
  marksPerQuestion: number;
  negativeMarkingEnabled: boolean;
  negativeMarksPerWrong: number;
  combinedSubjects?: Array<{ subject: string; count: number }>;
  syllabusReferenceNote?: string;
  syllabusSource?: string;
  syllabusVersionId?: string;
  syllabusVersionLabel?: string;
  ugcNetPaperType?: UgcNetPaperType;
  ugcNetSubjectId?: string;
  ugcNetTestMode?: UgcNetMockTestMode;
  ugcNetUnitIds?: string[];
  ugcNetTopicIds?: string[];
  upscStage?: UpscStage;
  upscPaperId?: UpscPaperId;
  upscTestMode?: UpscMockTestMode;
  upscAreaIds?: string[];
  upscTopicIds?: string[];
  classLevel?: string;
}

export interface MockQuestion {
  id: number;
  questionType: Exclude<ExamQuestionType, 'Mixed'>;
  subject: string;
  passage?: string;
  question: string;
  options: string[];
  correctIndex: number;
  correctIndices?: number[];
  numericalAnswer?: string;
  explanation: string;
  topicTag?: string;
}

export interface SubjectPerformance {
  subject: string;
  total: number;
  attempted: number;
  correct: number;
  incorrect: number;
  unattempted: number;
  marks: number;
  maxMarks: number;
  accuracy: number;
}

export interface MockTestAttempt {
  id: string;
  config: MockTestConfig;
  questions: MockQuestion[];
  answers: Record<number, UserAnswerValue>;
  markedForReview: number[];
  visited: number[];
  startedAt: number;
  submittedAt: number;
  timeTakenSeconds: number;
  score: number;
  maxScore: number;
  correctCount: number;
  incorrectCount: number;
  unattemptedCount: number;
  accuracyPercentage: number;
  percentage: number;
  subjectBreakdown: SubjectPerformance[];
}

export type SyllabusStatus =
  | 'Draft'
  | 'Processing'
  | 'Published'
  | 'Update Available'
  | 'Failed';

export interface SyllabusChapter {
  name: string;
  topics: string[];
  subtopics?: string[];
  marks?: string;
  term?: 'Term I' | 'Term II';
  assessment?: 'IA-1' | 'IA-2' | 'IA-3' | 'IA-4';
  section?: string;
  excludedFromExam?: boolean;
}

export interface SyllabusSubject {
  name: string;
  code?: string;
  subjectLanguage?: string;
  prescribedBooks?: string[];
  chapters: SyllabusChapter[];
}

export interface SyllabusClassOrPaper {
  id: string;
  label: string;
  academicSession?: string;
  mediums?: Array<'Odia Medium' | 'English Medium' | 'Hindi Medium'>;
  subjects: SyllabusSubject[];
}

export interface ExamDefinition {
  id: string;
  category: ExamCategoryId;
  name: string;
  boardName?: string;
  academicSession?: string;
  status?: 'Published' | 'Draft';
  updatedAt?: number;
  shortDesc: string;
  defaultMarksPerQuestion: number;
  defaultNegativeMarking: boolean;
  defaultNegativePenalty: number;
  isCustom?: boolean;
  officialSyllabusPdfUrl?: string;
  officialSyllabusPdfName?: string;
  allowedQuestionFormats?: AdvancedQuestionTypeId[];
  customFormatMarks?: Partial<Record<AdvancedQuestionTypeId, number>>;
  classesOrPapers: SyllabusClassOrPaper[];
}

export interface SyllabusPdfReference {
  id: string;
  examId: string;
  subject: string;
  fileName: string;
  uploadedAt: number;
  extractedText: string;
  pageCount: number;
}

export type GeneratorQuestionFormat =
  | 'MCQs'
  | 'Short Questions'
  | 'Long Questions'
  | 'True or False'
  | 'Fill in the Blanks'
  | 'Assertion and Reasoning'
  | 'Interview Questions'
  | 'Competitive Exam Questions';

export interface GeneratedQuestionItem {
  number: number;
  type: string;
  question: string;
  options?: string[];
  answer: string;
  explanation: string;
  marks?: string;
}

export type NotesFormat =
  | 'Chapter-wise Notes'
  | 'Complete Study Notes'
  | 'Short Revision Notes'
  | 'Important Questions'
  | 'Exam Preparation Notes'
  | 'Chapter Summary'
  | 'Flashcards'
  | 'Mind Map'
  | 'Revision Sheet';

export interface FlashcardItem {
  front: string;
  back: string;
  hint?: string;
}

export interface MindMapNode {
  title: string;
  summary?: string;
  children?: MindMapNode[];
}

export interface StudyTask {
  id: string;
  day: string;
  timeSlot: string;
  subject: string;
  topic: string;
  durationMinutes: number;
  type: 'Learn' | 'Practice' | 'Revision' | 'Mock Test';
  completed: boolean;
}

export interface StudyGoal {
  id: string;
  title: string;
  subject: string;
  targetDate: string;
  progress: number;
  reminderTime?: string;
  completed: boolean;
}

export interface AppSettings {
  theme: 'light' | 'dark';
  selectionMode: AiSelectionMode;
  provider: ProviderId;
  model: string;
  language: LanguageMode;
  streaming: boolean;
  speechRate: number;
}

export type CbseHindiClassLevel = '10' | '12';

export type CbseHindiCourseId =
  | 'cbse-10-hindi-a'
  | 'cbse-10-hindi-b'
  | 'cbse-12-hindi-core'
  | 'cbse-12-hindi-elective';

export type CbseHindiSession = '2025-26' | '2024-25' | '2026-27';

export type CbseHindiPaperFormat =
  | 'Full Hindi Question Paper'
  | 'Chapter-Wise Hindi Questions'
  | 'Topic-Wise Hindi Questions'
  | 'Grammar Practice'
  | 'Reading Comprehension Practice'
  | 'Writing Skills Practice'
  | 'Literature Practice'
  | 'MCQ Practice Test';

export type CbseHindiMarkOption =
  | 'Official Blueprint Mix'
  | 'MCQ'
  | '1 Mark'
  | '2 Marks'
  | '3 Marks'
  | '4 Marks'
  | '5 Marks'
  | 'Long Answer';

export interface CbseHindiPaperQuestion {
  questionNumber: number;
  sectionName: string; // e.g. "खंड 'क' — अपठित बोध"
  questionCategory: string; // e.g. "अपठित गद्यांश", "व्याकरण", "लेखन कौशल", "क्षितिज गद्य"
  questionFormat: 'MCQ' | 'Very Short' | 'Short Answer' | 'Long Answer' | 'Writing Skill' | 'Passage Based';
  marks: number;
  wordLimit?: string;
  passageOrExtract?: string;
  questionText: string;
  orOptionText?: string; // Optional internal choice (अथवा)
  options?: string[]; // 4 options when MCQ
  correctAnswer: string;
  markingSchemePoints: string[];
  explanation: string;
}

export interface CbseHindiQuestionPaper {
  title: string;
  academicSession: CbseHindiSession;
  classLevel: CbseHindiClassLevel;
  courseId: CbseHindiCourseId;
  courseLabel: string;
  courseCode: string;
  paperFormat: CbseHindiPaperFormat;
  prescribedBooks: string[];
  totalMarks: number;
  durationLabel: string;
  generalInstructions: string[];
  questions: CbseHindiPaperQuestion[];
  generatedAt: number;
}

export type AdvancedQuestionTypeId =
  | 'MCQ'
  | 'Multiple-Select'
  | 'True-False'
  | 'Fill-in-the-Blanks'
  | 'Match-Following'
  | 'One-Word'
  | 'Very-Short'
  | 'Short-Answer'
  | 'Long-Answer'
  | 'Descriptive'
  | 'Assertion-Reasoning'
  | 'Case-Based'
  | 'Passage-Based'
  | 'Numerical'
  | 'Diagram-Based'
  | 'Sequence-Order';

export interface QuestionTypeSelectionItem {
  typeId: AdvancedQuestionTypeId;
  enabled: boolean;
  count: number;
  marksPerQuestion: number;
}

export interface MatchPairItem {
  left: string;
  right: string;
}

export interface GeneratedExamQuestion {
  number: number;
  typeId: AdvancedQuestionTypeId;
  typeLabel: string;
  sectionCode: string;
  marks: number;
  wordLimit?: string;
  difficultyTag?: string;
  passageOrCase?: string;
  diagramDescription?: string;
  assertionText?: string;
  reasonText?: string;
  matchColumns?: {
    columnA: string[];
    columnB: string[];
  };
  sequenceItems?: string[];
  question: string;
  options?: string[];
  correctAnswer: string;
  correctOptionIndices?: number[];
  keyPoints?: string[];
  explanation: string;
  topicTag?: string;
}

export interface GeneratedExamSection {
  sectionCode: string; // e.g. "SECTION A"
  sectionTitle: string; // e.g. "SECTION A – MULTIPLE CHOICE QUESTIONS (MCQ)"
  typeId: AdvancedQuestionTypeId;
  marksPerQuestion: number;
  totalSectionMarks: number;
  questions: GeneratedExamQuestion[];
}

export interface GeneratedExamPaper {
  id: string;
  title: string;
  examId: string;
  examName: string;
  classLabel: string;
  subject: string;
  chapter: string;
  topic: string;
  difficulty: DifficultyLevel;
  language: MockLanguage;
  durationMinutes: number;
  totalQuestions: number;
  totalMarks: number;
  instructions: string[];
  syllabusReferenceName?: string;
  syllabusVersionId?: string;
  syllabusVersionLabel?: string;
  paperId?: UgcNetPaperType;
  subjectId?: string;
  sections: GeneratedExamSection[];
  generatedAt: number;
}

// ===================== ADMIN PANEL, CENTRALIZED DB & PDF NOTES TYPES =====================

export interface AdminAuthStatus {
  needsInitialSetup: boolean;
  envConfigured: boolean;
  authenticated: boolean;
  adminId?: string;
}

export interface SyllabusUploadRecord {
  id: string;
  fileName: string;
  fileType: string;
  examId?: string;
  targetExamId?: string;
  targetClassId?: string;
  examName: string;
  boardName: string;
  category: ExamCategoryId;
  classLabel: string;
  academicSession: string;
  subjectHint?: string;
  language: MockLanguage;
  detectedPattern?: string;
  marksSummary?: string;
  availableQuestionFormats?: AdvancedQuestionTypeId[];
  subjects: SyllabusSubject[];
  status: SyllabusStatus;
  replaceMode?: 'replace' | 'new-session';
  errorMessage?: string;
  version?: number;
  uploadedAt: number;
  updatedAt?: number;
  publishedAt?: number;
}

export interface AdminQuestionRecord {
  id: string;
  examId: string;
  examName: string;
  classId: string;
  classLabel: string;
  subject: string;
  chapter: string;
  topic: string;
  typeId: AdvancedQuestionTypeId;
  marks: number;
  difficulty: DifficultyLevel;
  language: MockLanguage;
  question: string;
  passageOrCase?: string;
  diagramDescription?: string;
  assertionText?: string;
  reasonText?: string;
  matchColumns?: {
    columnA: string[];
    columnB: string[];
  };
  sequenceItems?: string[];
  options?: string[];
  correctAnswer: string;
  correctOptionIndices?: number[];
  keyPoints?: string[];
  explanation: string;
  paperId?: UgcNetPaperType | UpscPaperId;
  subjectId?: string;
  syllabusVersionId?: string;
  unitId?: string;
  areaId?: string;
  upscStage?: UpscStage;
  upscPaperId?: UpscPaperId;
  topicId?: string;
  subtopicId?: string;
  needsReview?: boolean;
  syllabusChangeReason?: string;
  createdAt: number;
  updatedAt: number;
}

export type PdfNoteCategory = 'exam' | 'ncert' | 'upsc';

export interface PdfNoteMetadata {
  id: string;
  title: string;
  description: string;
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
  topic: string;
  language: MockLanguage;
  published: boolean;
  fileName: string;
  fileSize: number;
  pageCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface StudentRecord {
  id: string;
  name: string;
  email: string;
  rollNumber?: string;
  classLevel: string;
  examId?: string;
  active: boolean;
  registeredAt: number;
  lastActiveAt: number;
}

export interface AdminDashboardStats {
  totalExams: number;
  publishedExams: number;
  totalUploadedSyllabuses: number;
  totalSubjects: number;
  totalChapters: number;
  totalTopics: number;
  totalQuestions: number;
  questionsNeedingReview: number;
  totalPdfNotes: number;
  publishedPdfNotes: number;
  totalRegisteredStudents: number;
}

// ===================== AI ANIMATED EDUCATIONAL VIDEO GENERATOR TYPES =====================

export type VideoLanguage = 'odia' | 'hindi' | 'english';

export type VideoDurationMinutes = 2 | 3 | 5;

export type VideoQualityPreset = '480p' | '720p' | '1080p';

export type TtsProviderId = 'gemini-tts' | 'custom-http-tts';

export type DiagramProviderId = 'svg-vector' | 'gemini-image';

export type VideoStageId =
  | 'queued'
  | 'understanding-topic'
  | 'creating-script'
  | 'preparing-scenes'
  | 'generating-diagrams'
  | 'creating-voice'
  | 'synchronizing-subtitles'
  | 'rendering-mp4'
  | 'completed'
  | 'failed';

export interface AdminVideoConfig {
  enabled: boolean;
  planName: string;
  priceInr: number;
  validityMonths: number;
  defaultCredits: number;
  maxDurationMinutes: VideoDurationMinutes;
  allowedLanguages: VideoLanguage[];
  defaultScriptProvider: AiSelectionMode;
  ttsProvider: TtsProviderId;
  ttsModel: string;
  customTtsUrl: string;
  voices: Record<VideoLanguage, string>;
  diagramProvider: DiagramProviderId;
  videoQuality: VideoQualityPreset;
  maxConcurrentJobs: number;
  maxStorageMb: number;
  monthlyBudgetUsd: number;
  updatedAt: number;
}

export interface VideoSubscriptionRecord {
  id: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  planName: string;
  status: 'active' | 'expired' | 'inactive';
  creditsTotal: number;
  creditsRemaining: number;
  paidAmountInr: number;
  paymentRef: string;
  activatedAt: number;
  expiresAt: number;
  updatedAt: number;
}

export interface VideoDiagramNode {
  id: string;
  label: string;
  sublabel?: string;
}

export interface VideoDiagramEdge {
  from: string;
  to: string;
  label?: string;
}

export interface VideoDiagramSpec {
  diagramType:
    | 'cycle'
    | 'flowchart'
    | 'labeled-concept'
    | 'comparison'
    | 'timeline'
    | 'formula-graph'
    | 'geometry-physics';
  title: string;
  caption?: string;
  nodes: VideoDiagramNode[];
  edges?: VideoDiagramEdge[];
  formula?: string;
}

export interface VideoScene {
  sceneIndex: number;
  sceneTitle: string;
  narrationScript: string;
  visualDescription: string;
  diagramSpec: VideoDiagramSpec;
  onScreenBullets: string[];
  highlightedKeywords: string[];
  formulaOrHighlight?: string;
  estimatedSeconds: number;
  actualAudioSeconds?: number;
  subtitleText: string;
}

export interface VideoLessonPlan {
  title: string;
  introduction: string;
  learningObjectives: string[];
  stepByStepExplanation: string[];
  importantDefinitions: Array<{ term: string; definition: string }>;
  examples: string[];
  diagramExplanation: string;
  summary: string;
  revisionQuestions: string[];
  scenes: VideoScene[];
}

export interface VideoGenerationJobRecord {
  id: string;
  studentId: string;
  studentName: string;
  topic: string;
  customTopic?: string;
  examId?: string;
  examName?: string;
  classId?: string;
  classLabel?: string;
  subject?: string;
  chapter?: string;
  syllabusTopic?: string;
  language: VideoLanguage;
  durationMinutes: VideoDurationMinutes;
  selectionMode: AiSelectionMode;
  provider?: ProviderId;
  model?: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  stage: VideoStageId;
  stageLabel: string;
  progressPercent: number;
  errorMessage?: string;
  estimatedCostUsd: number;
  videoId?: string;
  lessonTitle?: string;
  sceneCount?: number;
  creditDeducted: boolean;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

export interface GeneratedVideoRecord {
  id: string;
  jobId: string;
  studentId: string;
  title: string;
  topic: string;
  examId?: string;
  examName?: string;
  classId?: string;
  classLabel?: string;
  subject?: string;
  chapter?: string;
  language: VideoLanguage;
  requestedDurationMinutes: VideoDurationMinutes;
  actualDurationSeconds: number;
  quality: VideoQualityPreset;
  fileSizeBytes: number;
  sceneCount: number;
  highlightedKeywords: string[];
  lessonSummary: string;
  learningObjectives: string[];
  revisionQuestions: string[];
  aiProviderUsed: string;
  aiModelUsed: string;
  ttsProviderUsed: string;
  voiceUsed: string;
  diagramProviderUsed: string;
  estimatedCostUsd: number;
  status: 'completed' | 'failed';
  createdAt: number;
}

export interface StudentVideoWalletResponse {
  config: Pick<
    AdminVideoConfig,
    | 'enabled'
    | 'planName'
    | 'priceInr'
    | 'validityMonths'
    | 'defaultCredits'
    | 'maxDurationMinutes'
    | 'allowedLanguages'
    | 'videoQuality'
    | 'defaultScriptProvider'
  >;
  subscription: VideoSubscriptionRecord | null;
  hasActiveSubscription: boolean;
  effectiveCreditsRemaining: number;
  storageUsedMb: number;
  storageLimitMb: number;
}

export interface AdminVideoOverviewResponse {
  config: AdminVideoConfig;
  stats: {
    totalVideos: number;
    completedJobs: number;
    failedJobs: number;
    activeJobs: number;
    activeSubscriptions: number;
    totalStorageMb: number;
    monthlyCostUsd: number;
    monthlyBudgetUsd: number;
  };
  subscriptions: VideoSubscriptionRecord[];
  recentJobs: VideoGenerationJobRecord[];
  recentVideos: GeneratedVideoRecord[];
  ttsStatus: {
    provider: TtsProviderId;
    configured: boolean;
    available: boolean;
    message: string;
  };
}

// ===================== UGC NET CENTRALIZED SYLLABUS & VERSIONING TYPES =====================

export type UgcNetPaperType = 'paper-1' | 'paper-2';

export type UgcNetPublicationStatus =
  | 'Draft'
  | 'Published'
  | 'Unpublished'
  | 'Archived'
  | 'Failed';

export type UgcNetMockTestMode =
  | 'complete-paper-1'
  | 'complete-paper-2'
  | 'selected-units'
  | 'selected-topics'
  | 'mixed-topics';

export type UgcNetQuestionTypeId =
  | 'Single-MCQ'
  | 'Multiple-Select'
  | 'Assertion-Reasoning'
  | 'Match-Following'
  | 'Statement-Based'
  | 'Teaching-Aptitude'
  | 'Research-Aptitude'
  | 'Subject-Specific';

export interface UgcNetSubtopicNode {
  subtopicId: string;
  title: string;
  order: number;
}

export interface UgcNetTopicNode {
  topicId: string;
  title: string;
  order: number;
  subtopics: UgcNetSubtopicNode[];
}

export interface UgcNetUnitNode {
  unitId: string;
  unitNumber?: number;
  title: string;
  marks?: string;
  order: number;
  topics: UgcNetTopicNode[];
}

export interface UgcNetSyllabusRecord {
  id: string; // stable syllabusVersionId
  examId: 'ugc-net';
  paperType: UgcNetPaperType;
  paperLabel: string;
  subjectId: string;
  subjectName: string;
  subjectCode?: string;
  academicSession: string;
  versionNumber: number;
  versionLabel: string;
  isActivePublished: boolean;
  publicationStatus: UgcNetPublicationStatus;
  parentVersionId?: string;
  fileName: string;
  fileType: string;
  fileSizeBytes: number;
  fileHash: string;
  originalFileStorageKey: string;
  aiProviderUsed?: string;
  aiModelUsed?: string;
  warnings: string[];
  errorMessage?: string;
  units: UgcNetUnitNode[];
  unitCount: number;
  topicCount: number;
  subtopicCount: number;
  uploadedBy: string;
  uploadedAt: number;
  updatedAt: number;
  publishedAt?: number;
  unpublishedAt?: number;
}

export interface UgcNetPublicPaper1 {
  syllabusVersionId: string;
  versionNumber: number;
  versionLabel: string;
  academicSession: string;
  paperType: 'paper-1';
  paperLabel: string;
  subjectId: string;
  subjectName: string;
  unitCount: number;
  topicCount: number;
  subtopicCount: number;
  publishedAt: number;
  updatedAt: number;
  units: UgcNetUnitNode[];
}

export interface UgcNetPublicSubject {
  syllabusVersionId: string;
  versionNumber: number;
  versionLabel: string;
  academicSession: string;
  paperType: 'paper-2';
  paperLabel: string;
  subjectId: string;
  subjectName: string;
  subjectCode?: string;
  unitCount: number;
  topicCount: number;
  subtopicCount: number;
  publishedAt: number;
  updatedAt: number;
  units: UgcNetUnitNode[];
}

export interface UgcNetPublicCatalogResponse {
  catalogVersion: number;
  updatedAt: number;
  paper1: UgcNetPublicPaper1 | null;
  paper2Subjects: UgcNetPublicSubject[];
}

export interface UgcNetConflictInfo {
  hasConflict: boolean;
  existingVersionId?: string;
  existingVersionLabel?: string;
  existingAcademicSession?: string;
  existingPublishedAt?: number;
  message?: string;
}

export interface UgcNetAdminSummary {
  paper1Published: boolean;
  paper1Status: UgcNetPublicationStatus | 'Not Uploaded';
  paper1VersionLabel?: string;
  paper1UnitCount: number;
  paper1TopicCount: number;
  paper2PublishedCount: number;
  paper2TotalRecords: number;
  paper2UnitCount: number;
  paper2TopicCount: number;
  latestUpdatedAt?: number;
  latestProcessingStatus: UgcNetPublicationStatus | 'None';
  outdatedQuestionsCount: number;
}

export interface UgcNetAdminOverviewResponse {
  summary: UgcNetAdminSummary;
  records: UgcNetSyllabusRecord[];
  catalogVersion: number;
}

// ===================== UPSC CIVIL SERVICES EXAMINATION TYPES =====================

export type UpscStage = 'prelims' | 'mains';

export type UpscPaperId =
  | 'prelims-gs-1'
  | 'prelims-csat'
  | 'mains-essay'
  | 'mains-gs-1'
  | 'mains-gs-2'
  | 'mains-gs-3'
  | 'mains-gs-4'
  | 'mains-optional';

export type UpscMockTestMode =
  | 'full-syllabus'
  | 'area-wise'
  | 'topic-wise'
  | 'mixed-topics';

export type UpscQuestionFormatId =
  | 'single-mcq'
  | 'statement-based'
  | 'match-following'
  | 'assertion-reasoning'
  | 'concept-application'
  | 'csat-reasoning'
  | 'mains-10-mark'
  | 'mains-15-mark'
  | 'mains-20-mark'
  | 'mains-essay'
  | 'mains-analytical';

export interface UpscSubtopicNode {
  subtopicId: string;
  title: string;
  order: number;
}

export interface UpscTopicNode {
  topicId: string;
  title: string;
  order: number;
  subtopics: UpscSubtopicNode[];
}

export interface UpscAreaNode {
  areaId: string;
  title: string;
  order: number;
  topics: UpscTopicNode[];
}

export interface UpscMarkingPattern {
  totalMarks: number;
  durationMinutes: number;
  questionCount?: number;
  marksPerQuestion?: number;
  negativeMarkingEnabled: boolean;
  negativeMarksPerWrong: number;
  supportedMarksOptions?: number[];
  wordLimitGuidelines?: string;
  patternNotes?: string;
}

export interface UpscSyllabusRecord {
  syllabusVersionId: string;
  stage: UpscStage;
  paperId: UpscPaperId;
  paperLabel: string;
  subjectId: string;
  subjectName: string;
  optionalSubjectName?: string;
  examYear: string;
  versionNumber: number;
  versionLabel: string;
  isActivePublished: boolean;
  publicationStatus: UgcNetPublicationStatus;
  markingPattern: UpscMarkingPattern;
  fileName: string;
  fileType: string;
  fileSizeBytes: number;
  fileHash: string;
  originalFileStorageKey: string;
  areaCount: number;
  topicCount: number;
  subtopicCount: number;
  areas: UpscAreaNode[];
  warnings?: string[];
  errorMessage?: string;
  aiProviderUsed?: ProviderId;
  aiModelUsed?: string;
  uploadedAt: number;
  processedAt?: number;
  publishedAt?: number;
  updatedAt: number;
  uploadedBy: string;
}

export interface UpscPublicPaperRecord {
  syllabusVersionId: string;
  stage: UpscStage;
  paperId: UpscPaperId;
  paperLabel: string;
  subjectId: string;
  subjectName: string;
  optionalSubjectName?: string;
  examYear: string;
  versionNumber: number;
  versionLabel: string;
  markingPattern: UpscMarkingPattern;
  areaCount: number;
  topicCount: number;
  subtopicCount: number;
  publishedAt: number;
  updatedAt: number;
  areas: UpscAreaNode[];
}

export interface UpscPublicCatalogResponse {
  catalogVersion: number;
  updatedAt: number;
  prelims: UpscPublicPaperRecord[];
  mains: UpscPublicPaperRecord[];
}

export interface UpscConflictInfo {
  hasConflict: boolean;
  existingVersionId?: string;
  existingVersionLabel?: string;
  existingExamYear?: string;
  existingPublishedAt?: number;
  message?: string;
}

export interface UpscAdminSummary {
  prelimsPublishedCount: number;
  mainsPublishedCount: number;
  optionalPublishedCount: number;
  totalRecords: number;
  totalAreas: number;
  totalTopics: number;
  latestUpdatedAt?: number;
  outdatedQuestionsCount: number;
}

export interface UpscAdminOverviewResponse {
  summary: UpscAdminSummary;
  records: UpscSyllabusRecord[];
  catalogVersion: number;
}

export interface UpscGeneratedQuestionItem {
  id: number;
  stage: UpscStage;
  paperLabel: string;
  areaTitle: string;
  topicTitle: string;
  subtopicTitle?: string;
  format: UpscQuestionFormatId;
  marks?: number;
  wordLimit?: number;
  passage?: string;
  question: string;
  options?: string[];
  correctIndex?: number;
  explanation?: string;
  modelPoints?: string[];
  directiveNote?: string;
}

export interface UpscMainsAnswerResult {
  questionUsed: string;
  paperLabel: string;
  subjectArea: string;
  marks: number;
  targetWordLimit: number;
  actualWordCount: number;
  language: MockLanguage;
  introduction: string;
  bodySections: Array<{ heading: string; points: string[] }>;
  examplesAndContext: string[];
  challenges: string[];
  wayForward: string[];
  conclusion: string;
  referencesUsed: string[];
  fullFormattedMarkdown: string;
  disclaimer: string;
}

export interface UpscMainsEvaluationResult {
  disclaimer: string;
  estimatedScore: number;
  maxMarks: number;
  studentWordCount: number;
  wordLimitTarget: number;
  wordLimitAssessment: string;
  strengths: string[];
  missingPoints: string[];
  contentGaps: string[];
  structuralSuggestions: string[];
  improvedSampleAnswer: string;
}

export interface UpscStudyGuidanceResult {
  disclaimer: string;
  readinessOverview: string;
  prelimsMainsBalance: string;
  weakTopicsPriority: Array<{ topic: string; reason: string; action: string }>;
  weeklyPlan: Array<{ dayOrBlock: string; focus: string; task: string }>;
  revisionStrategy: string[];
}

// ==================== AI LESSON PLAN GENERATOR TYPES ====================

export type LessonPlanBoardOption = 'BSE Odisha' | 'CBSE' | 'ICSE' | 'Other';

export type LessonPlanLanguage = 'english' | 'hindi' | 'odia';

export type LessonPlanType =
  | 'General Lesson Plan'
  | 'Detailed Lesson Plan'
  | 'Micro Teaching Lesson Plan'
  | 'B.Ed. Lesson Plan'
  | 'D.El.Ed. Lesson Plan'
  | 'Activity-Based Lesson Plan'
  | 'Demonstration Lesson Plan';

export interface LessonPlanPresentationRow {
  stageName: string;
  minutes: number;
  teachingPoints: string;
  teacherActivities: string;
  studentActivities: string;
  tlm: string;
  evaluationQuestions: string;
}

export interface LessonPlanIntroQuestion {
  question: string;
  expectedAnswer: string;
}

export interface LessonPlanShortQuestion {
  question: string;
  expectedAnswerPoints: string;
}

export interface LessonPlanGeneralInfo {
  classLabel: string;
  board: string;
  academicSession?: string;
  subject: string;
  chapter: string;
  topic: string;
  durationLabel: string;
  lessonPlanType: string;
  datePlaceholder: string;
  teacherNamePlaceholder: string;
  schoolNamePlaceholder: string;
  targetAgeGroup: string;
}

export interface GeneratedLessonPlan {
  id: string;
  createdAt: number;
  language: LessonPlanLanguage;
  className: string;
  board: LessonPlanBoardOption;
  matchedBoardExamName?: string;
  academicSession?: string;
  subject: string;
  chapter?: string;
  topic: string;
  durationMinutes: number;
  lessonPlanType: LessonPlanType;
  syllabusUsed: boolean;
  syllabusReferenceSummary: string;
  additionalActivitiesDisclaimer: string;
  generalInformation: LessonPlanGeneralInfo;
  generalObjectives: string[];
  specificLearningObjectives: string[];
  previousKnowledge: string;
  teachingLearningMaterials: string[];
  introductionSetInduction: string;
  introductoryQuestions: LessonPlanIntroQuestion[];
  announcementOfTopic: string;
  presentationOverview: string;
  presentationTable: LessonPlanPresentationRow[];
  teacherActivities: string[];
  studentActivities: string[];
  teachingLearningMaterialsDetailed: string[];
  blackboardWork: string[];
  classroomActivities: string[];
  groupActivities: string[];
  individualActivities: string[];
  evaluationAssessment: string;
  oralQuestions: string[];
  shortAnswerQuestions: LessonPlanShortQuestion[];
  recapitulation: string[];
  homeworkAssignment: string[];
  expectedLearningOutcomes: string[];
  teachersReflection: string[];
}





