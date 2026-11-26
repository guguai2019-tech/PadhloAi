import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BookOpenCheck,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  Edit3,
  FileText,
  GraduationCap,
  Languages,
  Layers,
  Loader2,
  Printer,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import type {
  AppSettings,
  ExamDefinition,
  GeneratedLessonPlan,
  LessonPlanBoardOption,
  LessonPlanLanguage,
  LessonPlanPresentationRow,
  LessonPlanType,
} from '../types';
import { generateAI, parseSafeJson } from '../utils/aiClient';
import { exportLessonPlanToPdf } from '../utils/pdfExport';
import {
  buildSyllabusContextPrompt,
  findMatchingBoardSyllabus,
  formatLessonPlanAsPlainText,
  getAvailableLessonPlanClasses,
  LESSON_PLAN_BOARDS,
  LESSON_PLAN_DURATIONS,
  LESSON_PLAN_TYPES,
  LESSON_PLAN_UI_LABELS,
  NO_SYLLABUS_EXACT_MESSAGE,
  normalizeLessonPlanDurations,
} from '../utils/lessonPlanSyllabus';

interface LessonPlanGeneratorViewProps {
  settings: AppSettings;
  exams: ExamDefinition[];
}

interface RawAiLessonPlanPayload {
  syllabusReferenceSummary?: string;
  additionalActivitiesDisclaimer?: string;
  generalInformation?: {
    classLabel?: string;
    board?: string;
    academicSession?: string;
    subject?: string;
    chapter?: string;
    topic?: string;
    durationLabel?: string;
    lessonPlanType?: string;
    datePlaceholder?: string;
    teacherNamePlaceholder?: string;
    schoolNamePlaceholder?: string;
    targetAgeGroup?: string;
  };
  generalObjectives?: string[];
  specificLearningObjectives?: string[];
  previousKnowledge?: string;
  teachingLearningMaterials?: string[];
  introductionSetInduction?: string;
  introductoryQuestions?: Array<{ question?: string; expectedAnswer?: string }>;
  announcementOfTopic?: string;
  presentationOverview?: string;
  presentationTable?: Array<{
    stageName?: string;
    minutes?: number;
    teachingPoints?: string;
    teacherActivities?: string;
    studentActivities?: string;
    tlm?: string;
    evaluationQuestions?: string;
  }>;
  teacherActivities?: string[];
  studentActivities?: string[];
  teachingLearningMaterialsDetailed?: string[];
  blackboardWork?: string[];
  classroomActivities?: string[];
  groupActivities?: string[];
  individualActivities?: string[];
  evaluationAssessment?: string;
  oralQuestions?: string[];
  shortAnswerQuestions?: Array<{ question?: string; expectedAnswerPoints?: string }>;
  recapitulation?: string[];
  homeworkAssignment?: string[];
  expectedLearningOutcomes?: string[];
  teachersReflection?: string[];
}

const LESSON_PLAN_JSON_SCHEMA = {
  type: 'OBJECT',
  properties: {
    syllabusReferenceSummary: { type: 'STRING' },
    additionalActivitiesDisclaimer: { type: 'STRING' },
    generalInformation: {
      type: 'OBJECT',
      properties: {
        classLabel: { type: 'STRING' },
        board: { type: 'STRING' },
        academicSession: { type: 'STRING' },
        subject: { type: 'STRING' },
        chapter: { type: 'STRING' },
        topic: { type: 'STRING' },
        durationLabel: { type: 'STRING' },
        lessonPlanType: { type: 'STRING' },
        datePlaceholder: { type: 'STRING' },
        teacherNamePlaceholder: { type: 'STRING' },
        schoolNamePlaceholder: { type: 'STRING' },
        targetAgeGroup: { type: 'STRING' },
      },
      required: [
        'classLabel',
        'board',
        'subject',
        'chapter',
        'topic',
        'durationLabel',
        'lessonPlanType',
        'datePlaceholder',
        'teacherNamePlaceholder',
        'schoolNamePlaceholder',
        'targetAgeGroup',
      ],
    },
    generalObjectives: { type: 'ARRAY', items: { type: 'STRING' } },
    specificLearningObjectives: { type: 'ARRAY', items: { type: 'STRING' } },
    previousKnowledge: { type: 'STRING' },
    teachingLearningMaterials: { type: 'ARRAY', items: { type: 'STRING' } },
    introductionSetInduction: { type: 'STRING' },
    introductoryQuestions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          question: { type: 'STRING' },
          expectedAnswer: { type: 'STRING' },
        },
        required: ['question', 'expectedAnswer'],
      },
    },
    announcementOfTopic: { type: 'STRING' },
    presentationOverview: { type: 'STRING' },
    presentationTable: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          stageName: { type: 'STRING' },
          minutes: { type: 'INTEGER' },
          teachingPoints: { type: 'STRING' },
          teacherActivities: { type: 'STRING' },
          studentActivities: { type: 'STRING' },
          tlm: { type: 'STRING' },
          evaluationQuestions: { type: 'STRING' },
        },
        required: [
          'stageName',
          'minutes',
          'teachingPoints',
          'teacherActivities',
          'studentActivities',
          'tlm',
          'evaluationQuestions',
        ],
      },
    },
    teacherActivities: { type: 'ARRAY', items: { type: 'STRING' } },
    studentActivities: { type: 'ARRAY', items: { type: 'STRING' } },
    teachingLearningMaterialsDetailed: { type: 'ARRAY', items: { type: 'STRING' } },
    blackboardWork: { type: 'ARRAY', items: { type: 'STRING' } },
    classroomActivities: { type: 'ARRAY', items: { type: 'STRING' } },
    groupActivities: { type: 'ARRAY', items: { type: 'STRING' } },
    individualActivities: { type: 'ARRAY', items: { type: 'STRING' } },
    evaluationAssessment: { type: 'STRING' },
    oralQuestions: { type: 'ARRAY', items: { type: 'STRING' } },
    shortAnswerQuestions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          question: { type: 'STRING' },
          expectedAnswerPoints: { type: 'STRING' },
        },
        required: ['question', 'expectedAnswerPoints'],
      },
    },
    recapitulation: { type: 'ARRAY', items: { type: 'STRING' } },
    homeworkAssignment: { type: 'ARRAY', items: { type: 'STRING' } },
    expectedLearningOutcomes: { type: 'ARRAY', items: { type: 'STRING' } },
    teachersReflection: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: [
    'syllabusReferenceSummary',
    'additionalActivitiesDisclaimer',
    'generalInformation',
    'generalObjectives',
    'specificLearningObjectives',
    'previousKnowledge',
    'teachingLearningMaterials',
    'introductionSetInduction',
    'introductoryQuestions',
    'announcementOfTopic',
    'presentationOverview',
    'presentationTable',
    'teacherActivities',
    'studentActivities',
    'teachingLearningMaterialsDetailed',
    'blackboardWork',
    'classroomActivities',
    'groupActivities',
    'individualActivities',
    'evaluationAssessment',
    'oralQuestions',
    'shortAnswerQuestions',
    'recapitulation',
    'homeworkAssignment',
    'expectedLearningOutcomes',
    'teachersReflection',
  ],
};

function languagePromptName(lang: LessonPlanLanguage): string {
  if (lang === 'hindi') return 'Hindi (pure natural Devanagari script / हिंदी)';
  if (lang === 'odia') return 'Odia (pure natural Odia script / ଓଡ଼ିଆ)';
  return 'English';
}

function cleanStringArray(arr: string[] | undefined, fallback: string[]): string[] {
  if (!Array.isArray(arr)) return fallback;
  const cleaned = arr.map((s) => String(s || '').trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned : fallback;
}

export const LessonPlanGeneratorView: React.FC<LessonPlanGeneratorViewProps> = ({
  settings,
  exams,
}) => {
  // Dynamically available classes (Class 1-10, Class 12 + Class 11/others when uploaded in Admin Panel)
  const availableClasses = useMemo(() => getAvailableLessonPlanClasses(exams), [exams]);

  const [selectedClass, setSelectedClass] = useState<string>('Class 10');
  const [selectedBoard, setSelectedBoard] = useState<LessonPlanBoardOption>('BSE Odisha');

  // Dynamic Syllabus Detection based on live Admin Panel `exams`
  const syllabusMatch = useMemo(
    () => findMatchingBoardSyllabus(exams, selectedClass, selectedBoard),
    [exams, selectedClass, selectedBoard],
  );

  // Subject, Chapter & Topic states (support both Admin syllabus selection AND manual entry)
  const [selectedSyllabusSubjectName, setSelectedSyllabusSubjectName] = useState<string>('');
  const [useManualSubject, setUseManualSubject] = useState<boolean>(false);
  const [manualSubject, setManualSubject] = useState<string>('');

  const [selectedChapterName, setSelectedChapterName] = useState<string>('');
  const [selectedSyllabusTopic, setSelectedSyllabusTopic] = useState<string>('');
  const [manualTopic, setManualTopic] = useState<string>('');

  const [language, setLanguage] = useState<LessonPlanLanguage>(() =>
    settings.language === 'hindi'
      ? 'hindi'
      : settings.language === 'odia'
        ? 'odia'
        : 'english',
  );
  const [durationPreset, setDurationPreset] = useState<number | 'custom'>(40);
  const [customDurationInput, setCustomDurationInput] = useState<string>('50');
  const [lessonPlanType, setLessonPlanType] = useState<LessonPlanType>('General Lesson Plan');

  // Generation & Document state
  const [lessonPlan, setLessonPlan] = useState<GeneratedLessonPlan | null>(null);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [translatingTo, setTranslatingTo] = useState<LessonPlanLanguage | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [exportingPdf, setExportingPdf] = useState<boolean>(false);

  const resultSectionRef = useRef<HTMLDivElement | null>(null);

  // Ensure selectedClass remains valid if availableClasses updates
  useEffect(() => {
    if (!availableClasses.includes(selectedClass)) {
      setSelectedClass(availableClasses.includes('Class 10') ? 'Class 10' : availableClasses[0] || 'Class 10');
    }
  }, [availableClasses, selectedClass]);

  // Auto-sync subject/chapter/topic choices when Board or Class or Admin Syllabus changes
  useEffect(() => {
    if (!syllabusMatch.hasSyllabus) {
      setSelectedSyllabusSubjectName('');
      setSelectedChapterName('');
      setSelectedSyllabusTopic('');
      return;
    }

    const stillExists = syllabusMatch.subjects.some(
      (s) => s.name === selectedSyllabusSubjectName,
    );
    if (!stillExists && !useManualSubject) {
      const firstSubj = syllabusMatch.subjects[0];
      setSelectedSyllabusSubjectName(firstSubj ? firstSubj.name : '');
      setSelectedChapterName('');
      setSelectedSyllabusTopic('');
    }
  }, [syllabusMatch, selectedSyllabusSubjectName, useManualSubject]);

  const matchedSubjectObj = useMemo(() => {
    if (useManualSubject || !syllabusMatch.hasSyllabus) {
      // Even if user typed manually, check if it happens to match a published subject name
      const typed = manualSubject.trim().toLowerCase();
      if (!typed) return null;
      return (
        syllabusMatch.subjects.find((s) => s.name.trim().toLowerCase() === typed) || null
      );
    }
    return (
      syllabusMatch.subjects.find((s) => s.name === selectedSyllabusSubjectName) || null
    );
  }, [useManualSubject, manualSubject, syllabusMatch, selectedSyllabusSubjectName]);

  const availableChapters = useMemo(
    () => matchedSubjectObj?.chapters || [],
    [matchedSubjectObj],
  );

  const selectedChapterObj = useMemo(() => {
    if (!selectedChapterName) return null;
    return availableChapters.find((c) => c.name === selectedChapterName) || null;
  }, [availableChapters, selectedChapterName]);

  const availableTopics = useMemo(
    () => selectedChapterObj?.topics || [],
    [selectedChapterObj],
  );

  // Reset chapter & topic dropdown if chapter disappears after subject change
  useEffect(() => {
    if (selectedChapterName && !availableChapters.some((c) => c.name === selectedChapterName)) {
      setSelectedChapterName('');
      setSelectedSyllabusTopic('');
    }
  }, [availableChapters, selectedChapterName]);

  useEffect(() => {
    if (
      selectedSyllabusTopic &&
      selectedSyllabusTopic !== '__manual__' &&
      !availableTopics.includes(selectedSyllabusTopic)
    ) {
      setSelectedSyllabusTopic('');
    }
  }, [availableTopics, selectedSyllabusTopic]);

  const effectiveSubject = useMemo(() => {
    if (!syllabusMatch.hasSyllabus || useManualSubject) {
      return manualSubject.trim();
    }
    return selectedSyllabusSubjectName.trim();
  }, [syllabusMatch.hasSyllabus, useManualSubject, manualSubject, selectedSyllabusSubjectName]);

  const effectiveTopic = useMemo(() => {
    if (manualTopic.trim()) return manualTopic.trim();
    if (selectedSyllabusTopic && selectedSyllabusTopic !== '__manual__') {
      return selectedSyllabusTopic.trim();
    }
    return '';
  }, [manualTopic, selectedSyllabusTopic]);

  const effectiveDurationMinutes = useMemo(() => {
    if (durationPreset !== 'custom') return durationPreset;
    const parsed = Number(customDurationInput);
    if (!Number.isFinite(parsed) || parsed < 5) return 40;
    return Math.min(240, Math.round(parsed));
  }, [durationPreset, customDurationInput]);

  // Show the exact required message whenever Admin syllabus is unavailable for the selected Class/Board/Subject
  const isSyllabusUnavailable = !syllabusMatch.hasSyllabus || !matchedSubjectObj;

  const hydrateLessonPlan = (
    raw: RawAiLessonPlanPayload,
    params: {
      lang: LessonPlanLanguage;
      className: string;
      board: LessonPlanBoardOption;
      subject: string;
      chapter: string;
      topic: string;
      durationMinutes: number;
      lessonPlanType: LessonPlanType;
      syllabusUsed: boolean;
      matchedBoardExamName?: string;
      academicSession?: string;
    },
  ): GeneratedLessonPlan => {
    const L = LESSON_PLAN_UI_LABELS[params.lang];
    const gi = raw.generalInformation || {};

    const normalizedTable: LessonPlanPresentationRow[] = normalizeLessonPlanDurations(
      (raw.presentationTable || []).map((row, idx) => ({
        stageName: String(row.stageName || `Stage ${idx + 1}`).trim(),
        minutes: Number(row.minutes) || 5,
        teachingPoints: String(row.teachingPoints || '—').trim(),
        teacherActivities: String(row.teacherActivities || '—').trim(),
        studentActivities: String(row.studentActivities || '—').trim(),
        tlm: String(row.tlm || '—').trim(),
        evaluationQuestions: String(row.evaluationQuestions || '—').trim(),
      })),
      params.durationMinutes,
    );

    return {
      id: `lp-${Date.now()}`,
      createdAt: Date.now(),
      language: params.lang,
      className: params.className,
      board: params.board,
      matchedBoardExamName: params.matchedBoardExamName,
      academicSession: params.academicSession,
      subject: params.subject,
      chapter: params.chapter || undefined,
      topic: params.topic,
      durationMinutes: params.durationMinutes,
      lessonPlanType: params.lessonPlanType,
      syllabusUsed: params.syllabusUsed,
      syllabusReferenceSummary:
        String(raw.syllabusReferenceSummary || '').trim() ||
        (params.syllabusUsed
          ? `${L.syllabusVerifiedLabel}: ${params.matchedBoardExamName || params.board} (${params.className} · ${params.subject})`
          : L.generalFallbackLabel),
      additionalActivitiesDisclaimer:
        String(raw.additionalActivitiesDisclaimer || '').trim() ||
        (params.lang === 'hindi'
          ? 'नोट: मुख्य विषय-वस्तु पाठ्यक्रम पर आधारित है; कक्षा एवं समूह गतिविधियाँ शिक्षण सहायता हेतु सुझाई गई हैं।'
          : params.lang === 'odia'
            ? 'ସୂଚନା: ମୁଖ୍ୟ ବିଷୟବସ୍ତୁ ପାଠ୍ୟକ୍ରମ ଉପରେ ଆଧାରିତ; ଶ୍ରେଣୀଗୃହ ଓ ଦଳଗତ କାର୍ଯ୍ୟକଳାପ ଶିକ୍ଷଣ ସହାୟତା ପାଇଁ ପ୍ରସ୍ତାବିତ।'
            : 'Note: Core concepts follow the syllabus reference; classroom, group, and individual activities are suggested pedagogical enhancements.'),
      generalInformation: {
        classLabel: String(gi.classLabel || params.className).trim(),
        board: String(gi.board || params.board).trim(),
        academicSession: String(gi.academicSession || params.academicSession || '').trim() || undefined,
        subject: String(gi.subject || params.subject).trim(),
        chapter: String(gi.chapter || params.chapter || params.topic).trim(),
        topic: String(gi.topic || params.topic).trim(),
        durationLabel: String(gi.durationLabel || `${params.durationMinutes} Minutes`).trim(),
        lessonPlanType: String(gi.lessonPlanType || params.lessonPlanType).trim(),
        datePlaceholder: String(gi.datePlaceholder || '____ / ____ / 20____').trim(),
        teacherNamePlaceholder: String(gi.teacherNamePlaceholder || '____________________').trim(),
        schoolNamePlaceholder: String(gi.schoolNamePlaceholder || '____________________').trim(),
        targetAgeGroup: String(gi.targetAgeGroup || params.className).trim(),
      },
      generalObjectives: cleanStringArray(raw.generalObjectives, ['Develop conceptual understanding and interest in the subject.']),
      specificLearningObjectives: cleanStringArray(raw.specificLearningObjectives, [`Students will be able to explain and apply key concepts of ${params.topic}.`]),
      previousKnowledge:
        String(raw.previousKnowledge || '').trim() ||
        `Students possess foundational familiarity related to ${params.subject}.`,
      teachingLearningMaterials: cleanStringArray(raw.teachingLearningMaterials, ['Blackboard/Whiteboard, Chalk/Markers, Prescribed Textbook, Visual Chart']),
      introductionSetInduction:
        String(raw.introductionSetInduction || '').trim() ||
        `Teacher connects everyday experiences with ${params.topic} to spark curiosity.`,
      introductoryQuestions:
        Array.isArray(raw.introductoryQuestions) && raw.introductoryQuestions.length > 0
          ? raw.introductoryQuestions.map((q) => ({
              question: String(q.question || '').trim() || '—',
              expectedAnswer: String(q.expectedAnswer || '').trim() || '—',
            }))
          : [{ question: `What do you already know about ${params.topic}?`, expectedAnswer: 'Students share brief prior observations.' }],
      announcementOfTopic:
        String(raw.announcementOfTopic || '').trim() ||
        `Today we will study "${params.topic}".`,
      presentationOverview:
        String(raw.presentationOverview || '').trim() ||
        `Structured ${params.durationMinutes}-minute instructional flow (${params.lessonPlanType}).`,
      presentationTable: normalizedTable,
      teacherActivities: cleanStringArray(raw.teacherActivities, ['Explains concepts clearly, demonstrates examples, and guides discussion.']),
      studentActivities: cleanStringArray(raw.studentActivities, ['Listens actively, participates in Q&A, and completes practice exercises.']),
      teachingLearningMaterialsDetailed: cleanStringArray(raw.teachingLearningMaterialsDetailed, ['Textbook diagrams, visual flashcards, and structured blackboard summary.']),
      blackboardWork: cleanStringArray(raw.blackboardWork, [`Topic Title: ${params.topic}`, 'Key Definitions & Formula/Concept Summary', 'Worked Example']),
      classroomActivities: cleanStringArray(raw.classroomActivities, ['Interactive whole-class concept check and guided discussion.']),
      groupActivities: cleanStringArray(raw.groupActivities, ['Small-group collaborative problem solving and peer sharing.']),
      individualActivities: cleanStringArray(raw.individualActivities, ['Independent notebook practice task on the core concept.']),
      evaluationAssessment:
        String(raw.evaluationAssessment || '').trim() ||
        'Formative assessment conducted via oral probing, observation during activities, and short written checks.',
      oralQuestions: cleanStringArray(raw.oralQuestions, [`State one key concept learned today from ${params.topic}.`]),
      shortAnswerQuestions:
        Array.isArray(raw.shortAnswerQuestions) && raw.shortAnswerQuestions.length > 0
          ? raw.shortAnswerQuestions.map((q) => ({
              question: String(q.question || '').trim() || '—',
              expectedAnswerPoints: String(q.expectedAnswerPoints || '').trim() || '—',
            }))
          : [{ question: `Explain the core principle of ${params.topic} with an example.`, expectedAnswerPoints: 'Clear definition + 1 accurate application.' }],
      recapitulation: cleanStringArray(raw.recapitulation, [`Quick review of the main points of ${params.topic}.`]),
      homeworkAssignment: cleanStringArray(raw.homeworkAssignment, [`Write a concise summary and solve 3 practice exercises based on ${params.topic}.`]),
      expectedLearningOutcomes: cleanStringArray(raw.expectedLearningOutcomes, [`Learners accurately understand and apply ${params.topic} within their grade level.`]),
      teachersReflection: cleanStringArray(raw.teachersReflection, [
        'Were students actively engaged across all lesson stages?',
        'Which sub-concept requires brief reinforcement in the next class?',
      ]),
    };
  };

  const handleGenerate = async () => {
    setErrorMsg(null);

    if (!selectedClass.trim()) {
      setErrorMsg('Please select a Class.');
      return;
    }
    if (!effectiveSubject) {
      setErrorMsg('Please select or enter a Subject.');
      return;
    }
    if (!effectiveTopic) {
      setErrorMsg('Please select or enter a Topic.');
      return;
    }
    if (durationPreset === 'custom') {
      const parsed = Number(customDurationInput);
      if (!Number.isFinite(parsed) || parsed < 5 || parsed > 240) {
        setErrorMsg('Custom Teaching Duration must be between 5 and 240 minutes.');
        return;
      }
    }

    setIsGenerating(true);
    setIsEditing(false);

    try {
      const syllabusContext = buildSyllabusContextPrompt({
        matchedSubject: matchedSubjectObj,
        selectedChapterName,
        selectedTopicName: effectiveTopic,
      });

      const systemInstruction = `You are a senior curriculum designer and Master Educator for Indian K-12 schools (BSE Odisha, CBSE, ICSE, CHSE/State Boards, B.Ed. & D.El.Ed. pedagogy).
You must produce a complete, classroom-ready 23-section Lesson Plan in strict JSON format matching the required schema.

CRITICAL RULES:
1. OUTPUT LANGUAGE: Write 100% of all field values (titles, bullets, questions, expected answers, table cells, blackboard work, placeholders, disclaimers, reflections) exclusively in ${languagePromptName(language)}. NEVER mix English/Hindi/Odia unless quoting an unavoidable proper language-subject term (e.g. an English poem title inside an English class).
2. SYLLABUS ACCURACY & HONESTY:
   - Use the provided Admin Syllabus record as the primary authoritative reference when available.
   - Do NOT introduce advanced higher-grade or out-of-syllabus topics.
   - NEVER invent textbook page numbers, edition numbers, ISBNs, or official board circulars not explicitly provided.
   - Clearly distinguish uploaded syllabus scope from AI-suggested classroom/group/individual activities inside syllabusReferenceSummary and additionalActivitiesDisclaimer.
3. DURATION MATCHING:
   - Total duration is EXACTLY ${effectiveDurationMinutes} minutes.
   - Design 4 to 6 logical rows in presentationTable whose "minutes" fields are positive integers summing EXACTLY to ${effectiveDurationMinutes}.
4. PEDAGOGY TYPE ADAPTATION:
   - Tailor depth, structure, and teacher/student steps specifically for "${lessonPlanType}" and age group "${selectedClass}".
5. COMPLETENESS:
   - Populate all 23 sections thoroughly with realistic, classroom-ready content (minimum 3–5 points per objective/activity/recap/outcome list, 3–4 introductory Q&As, 3–5 oral questions, 3–4 short-answer questions with answer key points).`;

      const prompt = `Generate a complete ${lessonPlanType} with the following specifications:
- Class: ${selectedClass}
- Board: ${selectedBoard}
- Subject: ${effectiveSubject}
- Chapter: ${selectedChapterName || effectiveTopic}
- Topic: ${effectiveTopic}
- Target Language: ${languagePromptName(language)}
- Teaching Duration: ${effectiveDurationMinutes} minutes (presentationTable minutes MUST sum strictly to ${effectiveDurationMinutes})
- Lesson Plan Format: ${lessonPlanType}

${syllabusContext}

Return strictly valid JSON with every required property populated in ${languagePromptName(language)}.`;

      const res = await generateAI({
        selectionMode: settings.selectionMode,
        provider: settings.provider,
        model: settings.model,
        language,
        systemInstruction,
        prompt,
        responseMimeType: 'application/json',
        responseSchema: LESSON_PLAN_JSON_SCHEMA,
      });

      const parsed = parseSafeJson<RawAiLessonPlanPayload>(res.text);
      const hydrated = hydrateLessonPlan(parsed, {
        lang: language,
        className: selectedClass,
        board: selectedBoard,
        subject: effectiveSubject,
        chapter: selectedChapterName || effectiveTopic,
        topic: effectiveTopic,
        durationMinutes: effectiveDurationMinutes,
        lessonPlanType,
        syllabusUsed: Boolean(matchedSubjectObj),
        matchedBoardExamName: matchedSubjectObj?.sourceExamNames.join(', '),
        academicSession: matchedSubjectObj?.academicSessions.join(', '),
      });

      setLessonPlan(hydrated);
      setTimeout(() => {
        resultSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Failed to generate lesson plan. Please check AI provider settings and try again.',
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleTranslate = async (targetLang: LessonPlanLanguage) => {
    if (!lessonPlan || translatingTo || isGenerating) return;
    if (lessonPlan.language === targetLang) return;

    setErrorMsg(null);
    setTranslatingTo(targetLang);

    try {
      const sourcePayload = {
        syllabusReferenceSummary: lessonPlan.syllabusReferenceSummary,
        additionalActivitiesDisclaimer: lessonPlan.additionalActivitiesDisclaimer,
        generalInformation: lessonPlan.generalInformation,
        generalObjectives: lessonPlan.generalObjectives,
        specificLearningObjectives: lessonPlan.specificLearningObjectives,
        previousKnowledge: lessonPlan.previousKnowledge,
        teachingLearningMaterials: lessonPlan.teachingLearningMaterials,
        introductionSetInduction: lessonPlan.introductionSetInduction,
        introductoryQuestions: lessonPlan.introductoryQuestions,
        announcementOfTopic: lessonPlan.announcementOfTopic,
        presentationOverview: lessonPlan.presentationOverview,
        presentationTable: lessonPlan.presentationTable,
        teacherActivities: lessonPlan.teacherActivities,
        studentActivities: lessonPlan.studentActivities,
        teachingLearningMaterialsDetailed: lessonPlan.teachingLearningMaterialsDetailed,
        blackboardWork: lessonPlan.blackboardWork,
        classroomActivities: lessonPlan.classroomActivities,
        groupActivities: lessonPlan.groupActivities,
        individualActivities: lessonPlan.individualActivities,
        evaluationAssessment: lessonPlan.evaluationAssessment,
        oralQuestions: lessonPlan.oralQuestions,
        shortAnswerQuestions: lessonPlan.shortAnswerQuestions,
        recapitulation: lessonPlan.recapitulation,
        homeworkAssignment: lessonPlan.homeworkAssignment,
        expectedLearningOutcomes: lessonPlan.expectedLearningOutcomes,
        teachersReflection: lessonPlan.teachersReflection,
      };

      const systemInstruction = `You are a professional academic translator specializing in school education across English, Hindi (Devanagari), and Odia (ଓଡ଼ିଆ).
Translate the provided structured JSON lesson plan completely into ${languagePromptName(targetLang)}.
RULES:
1. Translate EVERY human-readable string accurately into natural, idiomatic ${languagePromptName(targetLang)} educational terminology.
2. Preserve EVERY array length, table row count, and exact numeric integer "minutes" in presentationTable.
3. Do NOT mix source language sentences into the output. Keep all 23 sections complete.`;

      const prompt = `Translate the entire lesson plan JSON below into ${languagePromptName(targetLang)}:\n\n${JSON.stringify(sourcePayload)}`;

      const res = await generateAI({
        selectionMode: settings.selectionMode,
        provider: settings.provider,
        model: settings.model,
        language: targetLang,
        systemInstruction,
        prompt,
        responseMimeType: 'application/json',
        responseSchema: LESSON_PLAN_JSON_SCHEMA,
      });

      const parsed = parseSafeJson<RawAiLessonPlanPayload>(res.text);
      const translatedPlan = hydrateLessonPlan(parsed, {
        lang: targetLang,
        className: lessonPlan.className,
        board: lessonPlan.board,
        subject: lessonPlan.subject,
        chapter: lessonPlan.chapter || lessonPlan.topic,
        topic: lessonPlan.topic,
        durationMinutes: lessonPlan.durationMinutes,
        lessonPlanType: lessonPlan.lessonPlanType,
        syllabusUsed: lessonPlan.syllabusUsed,
        matchedBoardExamName: lessonPlan.matchedBoardExamName,
        academicSession: lessonPlan.academicSession,
      });

      setLessonPlan(translatedPlan);
      setLanguage(targetLang);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Failed to translate lesson plan. Please try again.',
      );
    } finally {
      setTranslatingTo(null);
    }
  };

  const handleCopy = async () => {
    if (!lessonPlan) return;
    try {
      const txt = formatLessonPlanAsPlainText(lessonPlan);
      await navigator.clipboard.writeText(txt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      setErrorMsg('Clipboard access is blocked in this browser. Please use Print or Download PDF.');
    }
  };

  const handleDownloadPdf = async () => {
    if (!lessonPlan || exportingPdf) return;
    setExportingPdf(true);
    try {
      await exportLessonPlanToPdf(lessonPlan);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'PDF export failed.');
    } finally {
      setExportingPdf(false);
    }
  };

  const handlePrint = () => {
    if (!lessonPlan) return;
    window.print();
  };

  // Helper updaters for inline Edit Lesson Plan mode
  const updateListSection = (
    key:
      | 'generalObjectives'
      | 'specificLearningObjectives'
      | 'teachingLearningMaterials'
      | 'teacherActivities'
      | 'studentActivities'
      | 'teachingLearningMaterialsDetailed'
      | 'blackboardWork'
      | 'classroomActivities'
      | 'groupActivities'
      | 'individualActivities'
      | 'oralQuestions'
      | 'recapitulation'
      | 'homeworkAssignment'
      | 'expectedLearningOutcomes'
      | 'teachersReflection',
    rawMultiline: string,
  ) => {
    const items = rawMultiline
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    setLessonPlan((prev) => (prev ? { ...prev, [key]: items } : prev));
  };

  const labels = lessonPlan ? LESSON_PLAN_UI_LABELS[lessonPlan.language] : LESSON_PLAN_UI_LABELS[language];

  const totalTableMinutes = lessonPlan
    ? lessonPlan.presentationTable.reduce((acc, r) => acc + (Number(r.minutes) || 0), 0)
    : 0;

  return (
    <div className="h-full overflow-y-auto bg-[#F8FAFC] dark:bg-slate-950 text-[#0F172A] dark:text-slate-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Page Header */}
        <div className="no-print rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#4338CA] to-[#2563EB] text-white flex items-center justify-center shrink-0 shadow-sm">
                <GraduationCap className="w-6 h-6" />
              </div>
              <div>
                <h1 className="font-display text-xl sm:text-2xl font-bold text-[#0F172A] dark:text-white tracking-tight">
                  AI Lesson Plan Generator
                </h1>
                <p className="text-sm text-[#64748B] dark:text-slate-400 mt-1">
                  Generate complete, syllabus-aligned 23-section school &amp; teacher-training lesson plans in English, Hindi, and Odia.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs font-medium text-[#4338CA] dark:text-indigo-300 bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-900/60 px-3 py-2 rounded-xl shrink-0">
              <Layers className="w-4 h-4 shrink-0" />
              <span>
                {syllabusMatch.hasSyllabus
                  ? `Synced: ${syllabusMatch.subjects.length} Syllabus Subjects (${selectedClass})`
                  : `Manual & General Mode (${selectedClass})`}
              </span>
            </div>
          </div>
        </div>

        {/* Lesson Plan Configuration Form */}
        <section
          aria-label="Lesson Plan Configuration Form"
          className="no-print rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs space-y-5"
        >
          <div className="flex items-center justify-between gap-3 border-b border-[#E2E8F0] dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <BookOpenCheck className="w-4.5 h-4.5 text-[#4338CA] dark:text-indigo-400" />
              <h2 className="font-display font-bold text-base text-[#0F172A] dark:text-white">
                Lesson Plan Parameters
              </h2>
            </div>
            <span className="text-xs text-[#64748B] dark:text-slate-400">
              Compulsory fields marked with *
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* 1. Select Class */}
            <div>
              <label
                htmlFor="lp-class"
                className="block text-xs font-semibold uppercase tracking-wide text-[#0F172A] dark:text-slate-200 mb-1.5"
              >
                1. Select Class *
              </label>
              <select
                id="lp-class"
                value={selectedClass}
                onChange={(e) => {
                  setSelectedClass(e.target.value);
                  setErrorMsg(null);
                }}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-sm font-medium focus:outline-none focus:border-[#4338CA]"
              >
                {availableClasses.map((cls) => (
                  <option key={cls} value={cls}>
                    {cls}
                  </option>
                ))}
              </select>
            </div>

            {/* 2. Select Board */}
            <div>
              <label
                htmlFor="lp-board"
                className="block text-xs font-semibold uppercase tracking-wide text-[#0F172A] dark:text-slate-200 mb-1.5"
              >
                2. Select Board
              </label>
              <select
                id="lp-board"
                value={selectedBoard}
                onChange={(e) => {
                  setSelectedBoard(e.target.value as LessonPlanBoardOption);
                  setUseManualSubject(false);
                  setErrorMsg(null);
                }}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-sm font-medium focus:outline-none focus:border-[#4338CA]"
              >
                {LESSON_PLAN_BOARDS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>

            {/* 3. Select Subject */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="lp-subject"
                  className="block text-xs font-semibold uppercase tracking-wide text-[#0F172A] dark:text-slate-200"
                >
                  3. Select Subject *
                </label>
                {syllabusMatch.hasSyllabus && (
                  <button
                    type="button"
                    onClick={() => {
                      setUseManualSubject((v) => !v);
                      setSelectedChapterName('');
                      setSelectedSyllabusTopic('');
                    }}
                    className="text-xs font-semibold text-[#2563EB] dark:text-cyan-400 hover:underline"
                  >
                    {useManualSubject ? 'Choose from Syllabus' : 'Enter Manually'}
                  </button>
                )}
              </div>

              {syllabusMatch.hasSyllabus && !useManualSubject ? (
                <select
                  id="lp-subject"
                  value={selectedSyllabusSubjectName}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '__manual__') {
                      setUseManualSubject(true);
                      setSelectedChapterName('');
                      setSelectedSyllabusTopic('');
                    } else {
                      setSelectedSyllabusSubjectName(val);
                      setSelectedChapterName('');
                      setSelectedSyllabusTopic('');
                    }
                    setErrorMsg(null);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-sm font-medium focus:outline-none focus:border-[#4338CA]"
                >
                  {syllabusMatch.subjects.map((subj) => (
                    <option key={subj.name} value={subj.name}>
                      {subj.name}
                      {subj.code ? ` (${subj.code})` : ''}
                    </option>
                  ))}
                  <option value="__manual__">+ Enter Custom Subject Manually</option>
                </select>
              ) : (
                <input
                  id="lp-subject"
                  type="text"
                  value={manualSubject}
                  onChange={(e) => {
                    setManualSubject(e.target.value);
                    setErrorMsg(null);
                  }}
                  placeholder="e.g., Science, Mathematics, History, English..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-sm focus:outline-none focus:border-[#4338CA]"
                />
              )}
            </div>

            {/* 4. Select Chapter (Auto-loaded from Admin Syllabus when available) */}
            <div>
              <label
                htmlFor="lp-chapter"
                className="block text-xs font-semibold uppercase tracking-wide text-[#0F172A] dark:text-slate-200 mb-1.5"
              >
                4. Select Chapter <span className="font-normal text-[#64748B]">(Optional)</span>
              </label>
              <select
                id="lp-chapter"
                disabled={availableChapters.length === 0}
                value={selectedChapterName}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedChapterName(val);
                  setSelectedSyllabusTopic('');
                  if (val) {
                    const chObj = availableChapters.find((c) => c.name === val);
                    if (chObj && chObj.topics.length === 1 && !manualTopic.trim()) {
                      setSelectedSyllabusTopic(chObj.topics[0]);
                    }
                  }
                }}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-sm font-medium focus:outline-none focus:border-[#4338CA] disabled:opacity-60"
              >
                <option value="">
                  {availableChapters.length > 0
                    ? '-- Optional: Select Uploaded Chapter --'
                    : '-- No Syllabus Chapters Loaded (Enter Topic Directly) --'}
                </option>
                {availableChapters.map((ch) => (
                  <option key={ch.name} value={ch.name}>
                    {ch.name}
                    {ch.term ? ` (${ch.term})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* 5. Select or Enter Topic * */}
            <div className="md:col-span-2">
              <label
                htmlFor="lp-topic"
                className="block text-xs font-semibold uppercase tracking-wide text-[#0F172A] dark:text-slate-200 mb-1.5"
              >
                5. Select or Enter Topic *
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {availableTopics.length > 0 && (
                  <select
                    aria-label="Select Topic from Uploaded Chapter"
                    value={selectedSyllabusTopic}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedSyllabusTopic(val);
                      if (val && val !== '__manual__') {
                        setManualTopic(val);
                      }
                      setErrorMsg(null);
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-sm font-medium focus:outline-none focus:border-[#4338CA]"
                  >
                    <option value="">-- Choose Chapter Topic --</option>
                    {availableTopics.map((tp) => (
                      <option key={tp} value={tp}>
                        {tp}
                      </option>
                    ))}
                  </select>
                )}

                <input
                  id="lp-topic"
                  type="text"
                  value={manualTopic}
                  onChange={(e) => {
                    setManualTopic(e.target.value);
                    setErrorMsg(null);
                  }}
                  placeholder={
                    availableTopics.length > 0
                      ? 'Or type/refine your lesson topic manually...'
                      : 'Enter your lesson topic (e.g., Photosynthesis, Ohm’s Law, Fractions)...'
                  }
                  className={`w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-sm focus:outline-none focus:border-[#4338CA] ${
                    availableTopics.length === 0 ? 'sm:col-span-2' : ''
                  }`}
                />
              </div>
            </div>

            {/* 6. Select Language */}
            <div>
              <label
                htmlFor="lp-language"
                className="block text-xs font-semibold uppercase tracking-wide text-[#0F172A] dark:text-slate-200 mb-1.5"
              >
                6. Select Language
              </label>
              <select
                id="lp-language"
                value={language}
                onChange={(e) => setLanguage(e.target.value as LessonPlanLanguage)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-sm font-medium focus:outline-none focus:border-[#4338CA]"
              >
                <option value="english">English</option>
                <option value="hindi">Hindi (हिंदी)</option>
                <option value="odia">Odia (ଓଡ଼ିଆ)</option>
              </select>
            </div>

            {/* 7. Select Teaching Duration */}
            <div>
              <label
                htmlFor="lp-duration"
                className="block text-xs font-semibold uppercase tracking-wide text-[#0F172A] dark:text-slate-200 mb-1.5"
              >
                7. Teaching Duration
              </label>
              <div className="flex items-center gap-2">
                <select
                  id="lp-duration"
                  value={durationPreset}
                  onChange={(e) => {
                    const val = e.target.value;
                    setDurationPreset(val === 'custom' ? 'custom' : Number(val));
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-sm font-medium focus:outline-none focus:border-[#4338CA]"
                >
                  {LESSON_PLAN_DURATIONS.map((mins) => (
                    <option key={mins} value={mins}>
                      {mins} Minutes
                    </option>
                  ))}
                  <option value="custom">Custom Duration</option>
                </select>

                {durationPreset === 'custom' && (
                  <input
                    type="number"
                    min={5}
                    max={240}
                    aria-label="Custom duration in minutes"
                    value={customDurationInput}
                    onChange={(e) => setCustomDurationInput(e.target.value)}
                    className="w-24 px-3 py-2.5 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-sm font-semibold tabular-nums focus:outline-none focus:border-[#4338CA]"
                    placeholder="Min"
                  />
                )}
              </div>
            </div>

            {/* 8. Select Lesson Plan Type */}
            <div>
              <label
                htmlFor="lp-type"
                className="block text-xs font-semibold uppercase tracking-wide text-[#0F172A] dark:text-slate-200 mb-1.5"
              >
                8. Lesson Plan Type
              </label>
              <select
                id="lp-type"
                value={lessonPlanType}
                onChange={(e) => setLessonPlanType(e.target.value as LessonPlanType)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-sm font-medium focus:outline-none focus:border-[#4338CA]"
              >
                {LESSON_PLAN_TYPES.map((typeName) => (
                  <option key={typeName} value={typeName}>
                    {typeName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Syllabus Availability / Auto-Sync Banner */}
          {isSyllabusUnavailable ? (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 dark:border-amber-900/70 bg-amber-50/90 dark:bg-amber-950/30 p-3.5 text-sm text-amber-900 dark:text-amber-200">
              <AlertCircle className="w-4.5 h-4.5 text-[#F59E0B] shrink-0 mt-0.5" />
              <div>{NO_SYLLABUS_EXACT_MESSAGE}</div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 dark:border-emerald-900/70 bg-emerald-50/80 dark:bg-emerald-950/30 p-3.5 text-xs sm:text-sm text-emerald-900 dark:text-emerald-200">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4.5 h-4.5 text-[#16A34A] shrink-0" />
                <span>
                  <strong>Admin Syllabus Connected:</strong> {matchedSubjectObj.sourceExamNames.join(', ')}
                  {matchedSubjectObj.academicSessions.length > 0
                    ? ` (${matchedSubjectObj.academicSessions.join(', ')})`
                    : ''}{' '}
                  · {matchedSubjectObj.chapters.length} Chapters loaded for <strong>{matchedSubjectObj.name}</strong>.
                </span>
              </div>
              {matchedSubjectObj.prescribedBooks && matchedSubjectObj.prescribedBooks.length > 0 && (
                <span className="text-xs text-emerald-800 dark:text-emerald-300">
                  Textbooks: {matchedSubjectObj.prescribedBooks.join(', ')}
                </span>
              )}
            </div>
          )}

          {errorMsg && (
            <div
              role="alert"
              className="flex items-center gap-2.5 rounded-xl border border-red-200 dark:border-red-900/70 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-[#DC2626] dark:text-red-300"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="text-xs text-[#64748B] dark:text-slate-400 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[#2563EB]" />
              <span>
                Time stages will automatically balance to exact{' '}
                <strong className="text-[#0F172A] dark:text-slate-200">
                  {effectiveDurationMinutes} minutes
                </strong>
                .
              </span>
            </div>

            <button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={isGenerating || Boolean(translatingTo)}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#4338CA] to-[#2563EB] hover:from-[#3730A3] hover:to-[#1D4ED8] text-white font-semibold text-sm shadow-sm transition-all disabled:opacity-60 min-h-[42px]"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Generating 23-Section Lesson Plan...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Generate Lesson Plan</span>
                </>
              )}
            </button>
          </div>
        </section>

        {/* Generated Lesson Plan Document & Action Toolbar */}
        {lessonPlan && (
          <div ref={resultSectionRef} className="space-y-4">
            {/* Document Action Controls */}
            <div className="no-print sticky top-2 z-10 rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs p-3.5 shadow-sm flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleGenerate()}
                  disabled={isGenerating || Boolean(translatingTo)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-800 hover:border-[#4338CA] text-xs sm:text-sm font-semibold transition-colors disabled:opacity-60"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-[#4338CA] dark:text-indigo-400 ${isGenerating ? 'animate-spin' : ''}`} />
                  <span>Regenerate</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsEditing((e) => !e)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs sm:text-sm font-semibold transition-colors ${
                    isEditing
                      ? 'border-[#4338CA] bg-indigo-50 dark:bg-indigo-950/50 text-[#4338CA] dark:text-indigo-300'
                      : 'border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-800 hover:border-[#4338CA]'
                  }`}
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>{isEditing ? 'Done Editing' : 'Edit Lesson Plan'}</span>
                </button>

                {/* Instant 3-Language Translation Controls */}
                <div className="inline-flex flex-wrap items-center gap-1.5 pl-1 border-l border-[#E2E8F0] dark:border-slate-700">
                  <Languages className="w-3.5 h-3.5 text-[#2563EB] ml-1 hidden sm:block" />
                  {(
                    [
                      { id: 'english', label: 'Translate to English' },
                      { id: 'hindi', label: 'Translate to Hindi' },
                      { id: 'odia', label: 'Translate to Odia' },
                    ] as Array<{ id: LessonPlanLanguage; label: string }>
                  ).map((item) => {
                    const isCurrent = lessonPlan.language === item.id;
                    const isTranslatingThis = translatingTo === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        disabled={isCurrent || Boolean(translatingTo) || isGenerating}
                        onClick={() => void handleTranslate(item.id)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                          isCurrent
                            ? 'border-[#4338CA] bg-gradient-to-r from-[#4338CA] to-[#2563EB] text-white'
                            : 'border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-[#2563EB] text-[#0F172A] dark:text-slate-200 disabled:opacity-50'
                        }`}
                      >
                        {isTranslatingThis && <Loader2 className="w-3 h-3 animate-spin" />}
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleCopy()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-800 hover:border-[#2563EB] text-xs sm:text-sm font-semibold transition-colors"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-[#16A34A]" />
                      <span className="text-[#16A34A]">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-[#64748B]" />
                      <span>Copy Lesson Plan</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handlePrint}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-800 hover:border-[#2563EB] text-xs sm:text-sm font-semibold transition-colors"
                >
                  <Printer className="w-3.5 h-3.5 text-[#64748B]" />
                  <span>Print</span>
                </button>

                <button
                  type="button"
                  onClick={() => void handleDownloadPdf()}
                  disabled={exportingPdf}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#4338CA] to-[#2563EB] hover:from-[#3730A3] hover:to-[#1D4ED8] text-white text-xs sm:text-sm font-semibold shadow-xs transition-all disabled:opacity-60"
                >
                  {exportingPdf ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  <span>{exportingPdf ? 'Preparing PDF...' : 'Download as PDF'}</span>
                </button>
              </div>
            </div>

            {/* Printable & Viewable 23-Section Lesson Plan Document */}
            <article className="print-paper-surface rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 shadow-xs space-y-7">
              {/* Document Top Banner */}
              <div className="border-b-2 border-[#4338CA]/30 pb-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#4338CA] dark:text-indigo-300">
                    <FileText className="w-4 h-4" />
                    <span>{labels.documentBadge}</span>
                  </div>
                  <div className="text-xs font-semibold text-[#64748B] dark:text-slate-400 tabular-nums">
                    {lessonPlan.durationMinutes} Minutes · {lessonPlan.lessonPlanType}
                  </div>
                </div>

                <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#0F172A] dark:text-white">
                  {lessonPlan.topic}
                </h2>
                <p className="text-sm font-medium text-[#2563EB] dark:text-cyan-400">
                  {lessonPlan.className} · {lessonPlan.board}
                  {lessonPlan.academicSession ? ` (${lessonPlan.academicSession})` : ''} · {lessonPlan.subject}
                </p>

                <div
                  className={`rounded-xl border p-3 text-xs leading-relaxed ${
                    lessonPlan.syllabusUsed
                      ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/25 text-emerald-900 dark:text-emerald-200'
                      : 'border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/25 text-amber-900 dark:text-amber-200'
                  }`}
                >
                  <div>
                    <strong>{lessonPlan.syllabusUsed ? labels.syllabusVerifiedLabel : labels.generalFallbackLabel}:</strong>{' '}
                    {lessonPlan.syllabusReferenceSummary}
                  </div>
                  <div className="mt-1 opacity-90">{lessonPlan.additionalActivitiesDisclaimer}</div>
                </div>
              </div>

              {/* Section 1: General Information */}
              <section className="print-avoid-break space-y-3">
                <h3 className="font-display text-base sm:text-lg font-bold text-[#0F172A] dark:text-white border-l-4 border-[#4338CA] pl-3">
                  {labels.sections[0]}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {(
                    [
                      ['classLabel', labels.generalInfoFields.classLabel],
                      ['board', labels.generalInfoFields.board],
                      ['subject', labels.generalInfoFields.subject],
                      ['chapter', labels.generalInfoFields.chapter],
                      ['topic', labels.generalInfoFields.topic],
                      ['durationLabel', labels.generalInfoFields.duration],
                      ['lessonPlanType', labels.generalInfoFields.lessonPlanType],
                      ['targetAgeGroup', labels.generalInfoFields.targetAgeGroup],
                      ['datePlaceholder', labels.generalInfoFields.date],
                      ['teacherNamePlaceholder', labels.generalInfoFields.teacherName],
                      ['schoolNamePlaceholder', labels.generalInfoFields.schoolName],
                    ] as Array<[keyof GeneratedLessonPlan['generalInformation'], string]>
                  ).map(([fieldKey, labelText]) => (
                    <div
                      key={fieldKey}
                      className="rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-[#F8FAFC] dark:bg-slate-950/60 px-3.5 py-2.5"
                    >
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-[#64748B] dark:text-slate-400">
                        {labelText}
                      </div>
                      {isEditing ? (
                        <input
                          type="text"
                          value={lessonPlan.generalInformation[fieldKey] || ''}
                          onChange={(e) =>
                            setLessonPlan((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    generalInformation: {
                                      ...prev.generalInformation,
                                      [fieldKey]: e.target.value,
                                    },
                                  }
                                : prev,
                            )
                          }
                          className="mt-1 w-full px-2 py-1 rounded border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                        />
                      ) : (
                        <div className="text-sm font-semibold text-[#0F172A] dark:text-slate-100 mt-0.5">
                          {lessonPlan.generalInformation[fieldKey] || '—'}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              {/* Sections 2 & 3 */}
              <EditableBulletSection
                title={labels.sections[1]}
                items={lessonPlan.generalObjectives}
                isEditing={isEditing}
                onChange={(val) => updateListSection('generalObjectives', val)}
              />
              <EditableBulletSection
                title={labels.sections[2]}
                items={lessonPlan.specificLearningObjectives}
                isEditing={isEditing}
                onChange={(val) => updateListSection('specificLearningObjectives', val)}
              />

              {/* Section 4: Previous Knowledge */}
              <EditableParagraphSection
                title={labels.sections[3]}
                value={lessonPlan.previousKnowledge}
                isEditing={isEditing}
                onChange={(val) =>
                  setLessonPlan((prev) => (prev ? { ...prev, previousKnowledge: val } : prev))
                }
              />

              {/* Section 5: TLM */}
              <EditableBulletSection
                title={labels.sections[4]}
                items={lessonPlan.teachingLearningMaterials}
                isEditing={isEditing}
                onChange={(val) => updateListSection('teachingLearningMaterials', val)}
              />

              {/* Section 6: Introduction / Set Induction */}
              <EditableParagraphSection
                title={labels.sections[5]}
                value={lessonPlan.introductionSetInduction}
                isEditing={isEditing}
                onChange={(val) =>
                  setLessonPlan((prev) => (prev ? { ...prev, introductionSetInduction: val } : prev))
                }
              />

              {/* Section 7: Introductory Questions and Expected Answers */}
              <section className="print-avoid-break space-y-3">
                <h3 className="font-display text-base sm:text-lg font-bold text-[#0F172A] dark:text-white border-l-4 border-[#4338CA] pl-3">
                  {labels.sections[6]}
                </h3>
                <div className="space-y-2.5">
                  {lessonPlan.introductoryQuestions.map((iq, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-[#F8FAFC] dark:bg-slate-950/60 p-3.5 space-y-1.5"
                    >
                      {isEditing ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={iq.question}
                            onChange={(e) => {
                              const next = [...lessonPlan.introductoryQuestions];
                              next[idx] = { ...next[idx], question: e.target.value };
                              setLessonPlan({ ...lessonPlan, introductoryQuestions: next });
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium"
                          />
                          <input
                            type="text"
                            value={iq.expectedAnswer}
                            onChange={(e) => {
                              const next = [...lessonPlan.introductoryQuestions];
                              next[idx] = { ...next[idx], expectedAnswer: e.target.value };
                              setLessonPlan({ ...lessonPlan, introductoryQuestions: next });
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                          />
                        </div>
                      ) : (
                        <>
                          <div className="text-sm font-semibold text-[#0F172A] dark:text-white">
                            {idx + 1}. {labels.questionWord}: {iq.question}
                          </div>
                          <div className="text-sm text-[#475569] dark:text-slate-300 pl-4">
                            <span className="font-semibold text-[#16A34A] dark:text-emerald-400">
                              {labels.expectedAnswerWord}:
                            </span>{' '}
                            {iq.expectedAnswer}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              {/* Section 8: Announcement of the Topic */}
              <EditableParagraphSection
                title={labels.sections[7]}
                value={lessonPlan.announcementOfTopic}
                isEditing={isEditing}
                onChange={(val) =>
                  setLessonPlan((prev) => (prev ? { ...prev, announcementOfTopic: val } : prev))
                }
              />

              {/* Section 9: Presentation of the Lesson + Structured Presentation Table */}
              <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-display text-base sm:text-lg font-bold text-[#0F172A] dark:text-white border-l-4 border-[#4338CA] pl-3">
                    {labels.sections[8]}
                  </h3>
                  <span className="text-xs font-semibold text-[#2563EB] dark:text-cyan-400 tabular-nums">
                    {labels.totalDurationLabel}: {totalTableMinutes} min
                  </span>
                </div>

                {isEditing ? (
                  <textarea
                    rows={2}
                    value={lessonPlan.presentationOverview}
                    onChange={(e) =>
                      setLessonPlan({ ...lessonPlan, presentationOverview: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-sm"
                  />
                ) : (
                  <p className="text-sm text-[#334155] dark:text-slate-300">
                    {lessonPlan.presentationOverview}
                  </p>
                )}

                <div className="overflow-x-auto rounded-xl border border-[#E2E8F0] dark:border-slate-800">
                  <table className="w-full min-w-[760px] border-collapse text-left text-xs sm:text-sm">
                    <thead>
                      <tr className="bg-gradient-to-r from-[#4338CA] to-[#2563EB] text-white">
                        <th className="p-3 font-semibold border-r border-indigo-400/30 w-[21%]">
                          {labels.tableHeaders.teachingPoints}
                        </th>
                        <th className="p-3 font-semibold border-r border-indigo-400/30 w-[24%]">
                          {labels.tableHeaders.teacherActivities}
                        </th>
                        <th className="p-3 font-semibold border-r border-indigo-400/30 w-[22%]">
                          {labels.tableHeaders.studentActivities}
                        </th>
                        <th className="p-3 font-semibold border-r border-indigo-400/30 w-[14%]">
                          {labels.tableHeaders.tlm}
                        </th>
                        <th className="p-3 font-semibold w-[19%]">
                          {labels.tableHeaders.evaluationQuestions}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0] dark:divide-slate-800">
                      {lessonPlan.presentationTable.map((row, idx) => (
                        <tr
                          key={idx}
                          className={
                            idx % 2 === 0
                              ? 'bg-white dark:bg-slate-900'
                              : 'bg-[#F8FAFC] dark:bg-slate-950/60'
                          }
                        >
                          <td className="p-3 align-top border-r border-[#E2E8F0] dark:border-slate-800">
                            <div className="font-bold text-[#4338CA] dark:text-indigo-300 mb-1 tabular-nums">
                              {row.stageName} ({row.minutes} min)
                            </div>
                            {isEditing ? (
                              <textarea
                                rows={3}
                                value={row.teachingPoints}
                                onChange={(e) => {
                                  const next = [...lessonPlan.presentationTable];
                                  next[idx] = { ...next[idx], teachingPoints: e.target.value };
                                  setLessonPlan({ ...lessonPlan, presentationTable: next });
                                }}
                                className="w-full px-2 py-1 rounded border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                              />
                            ) : (
                              <div className="text-[#0F172A] dark:text-slate-100 leading-relaxed">
                                {row.teachingPoints}
                              </div>
                            )}
                          </td>
                          {(
                            [
                              'teacherActivities',
                              'studentActivities',
                              'tlm',
                              'evaluationQuestions',
                            ] as const
                          ).map((colKey) => (
                            <td
                              key={colKey}
                              className="p-3 align-top border-r last:border-r-0 border-[#E2E8F0] dark:border-slate-800"
                            >
                              {isEditing ? (
                                <textarea
                                  rows={3}
                                  value={row[colKey]}
                                  onChange={(e) => {
                                    const next = [...lessonPlan.presentationTable];
                                    next[idx] = { ...next[idx], [colKey]: e.target.value };
                                    setLessonPlan({ ...lessonPlan, presentationTable: next });
                                  }}
                                  className="w-full px-2 py-1 rounded border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                                />
                              ) : (
                                <div className="text-[#334155] dark:text-slate-300 leading-relaxed">
                                  {row[colKey]}
                                </div>
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Sections 10–16 */}
              <EditableBulletSection
                title={labels.sections[9]}
                items={lessonPlan.teacherActivities}
                isEditing={isEditing}
                onChange={(val) => updateListSection('teacherActivities', val)}
              />
              <EditableBulletSection
                title={labels.sections[10]}
                items={lessonPlan.studentActivities}
                isEditing={isEditing}
                onChange={(val) => updateListSection('studentActivities', val)}
              />
              <EditableBulletSection
                title={labels.sections[11]}
                items={lessonPlan.teachingLearningMaterialsDetailed}
                isEditing={isEditing}
                onChange={(val) => updateListSection('teachingLearningMaterialsDetailed', val)}
              />

              {/* Section 13: Blackboard Work (distinct blackboard preview card) */}
              <section className="print-avoid-break space-y-2.5">
                <h3 className="font-display text-base sm:text-lg font-bold text-[#0F172A] dark:text-white border-l-4 border-[#4338CA] pl-3">
                  {labels.sections[12]}
                </h3>
                {isEditing ? (
                  <textarea
                    rows={4}
                    value={lessonPlan.blackboardWork.join('\n')}
                    onChange={(e) => updateListSection('blackboardWork', e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-sm"
                  />
                ) : (
                  <div className="rounded-xl border border-slate-700 bg-slate-900 text-slate-100 p-4 space-y-1.5 font-mono text-xs sm:text-sm">
                    {lessonPlan.blackboardWork.map((line, i) => (
                      <div key={i}>• {line}</div>
                    ))}
                  </div>
                )}
              </section>

              <EditableBulletSection
                title={labels.sections[13]}
                items={lessonPlan.classroomActivities}
                isEditing={isEditing}
                onChange={(val) => updateListSection('classroomActivities', val)}
              />
              <EditableBulletSection
                title={labels.sections[14]}
                items={lessonPlan.groupActivities}
                isEditing={isEditing}
                onChange={(val) => updateListSection('groupActivities', val)}
              />
              <EditableBulletSection
                title={labels.sections[15]}
                items={lessonPlan.individualActivities}
                isEditing={isEditing}
                onChange={(val) => updateListSection('individualActivities', val)}
              />

              {/* Section 17: Evaluation / Assessment */}
              <EditableParagraphSection
                title={labels.sections[16]}
                value={lessonPlan.evaluationAssessment}
                isEditing={isEditing}
                onChange={(val) =>
                  setLessonPlan((prev) => (prev ? { ...prev, evaluationAssessment: val } : prev))
                }
              />

              {/* Section 18: Oral Questions */}
              <EditableBulletSection
                title={labels.sections[17]}
                items={lessonPlan.oralQuestions}
                isEditing={isEditing}
                onChange={(val) => updateListSection('oralQuestions', val)}
              />

              {/* Section 19: Short-Answer Questions */}
              <section className="print-avoid-break space-y-3">
                <h3 className="font-display text-base sm:text-lg font-bold text-[#0F172A] dark:text-white border-l-4 border-[#4338CA] pl-3">
                  {labels.sections[18]}
                </h3>
                <div className="space-y-2.5">
                  {lessonPlan.shortAnswerQuestions.map((sq, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-[#F8FAFC] dark:bg-slate-950/60 p-3.5 space-y-1.5"
                    >
                      {isEditing ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={sq.question}
                            onChange={(e) => {
                              const next = [...lessonPlan.shortAnswerQuestions];
                              next[idx] = { ...next[idx], question: e.target.value };
                              setLessonPlan({ ...lessonPlan, shortAnswerQuestions: next });
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium"
                          />
                          <input
                            type="text"
                            value={sq.expectedAnswerPoints}
                            onChange={(e) => {
                              const next = [...lessonPlan.shortAnswerQuestions];
                              next[idx] = { ...next[idx], expectedAnswerPoints: e.target.value };
                              setLessonPlan({ ...lessonPlan, shortAnswerQuestions: next });
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                          />
                        </div>
                      ) : (
                        <>
                          <div className="text-sm font-semibold text-[#0F172A] dark:text-white">
                            {idx + 1}. {labels.questionWord}: {sq.question}
                          </div>
                          <div className="text-sm text-[#475569] dark:text-slate-300 pl-4">
                            <span className="font-semibold text-[#2563EB] dark:text-cyan-400">
                              {labels.expectedPointsWord}:
                            </span>{' '}
                            {sq.expectedAnswerPoints}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              {/* Sections 20–23 */}
              <EditableBulletSection
                title={labels.sections[19]}
                items={lessonPlan.recapitulation}
                isEditing={isEditing}
                onChange={(val) => updateListSection('recapitulation', val)}
              />
              <EditableBulletSection
                title={labels.sections[20]}
                items={lessonPlan.homeworkAssignment}
                isEditing={isEditing}
                onChange={(val) => updateListSection('homeworkAssignment', val)}
              />
              <EditableBulletSection
                title={labels.sections[21]}
                items={lessonPlan.expectedLearningOutcomes}
                isEditing={isEditing}
                onChange={(val) => updateListSection('expectedLearningOutcomes', val)}
              />
              <EditableBulletSection
                title={labels.sections[22]}
                items={lessonPlan.teachersReflection}
                isEditing={isEditing}
                onChange={(val) => updateListSection('teachersReflection', val)}
              />
            </article>
          </div>
        )}
      </div>
    </div>
  );
};

interface EditableBulletSectionProps {
  title: string;
  items: string[];
  isEditing: boolean;
  onChange: (raw: string) => void;
}

const EditableBulletSection: React.FC<EditableBulletSectionProps> = ({
  title,
  items,
  isEditing,
  onChange,
}) => (
  <section className="print-avoid-break space-y-2.5">
    <h3 className="font-display text-base sm:text-lg font-bold text-[#0F172A] dark:text-white border-l-4 border-[#4338CA] pl-3">
      {title}
    </h3>
    {isEditing ? (
      <textarea
        rows={Math.max(3, items.length + 1)}
        value={items.join('\n')}
        onChange={(e) => onChange(e.target.value)}
        placeholder="One item per line..."
        className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-sm leading-relaxed"
      />
    ) : (
      <ul className="space-y-1.5 pl-5 list-disc text-sm text-[#1E293B] dark:text-slate-200 leading-relaxed">
        {items.map((item, idx) => (
          <li key={idx}>{item}</li>
        ))}
      </ul>
    )}
  </section>
);

interface EditableParagraphSectionProps {
  title: string;
  value: string;
  isEditing: boolean;
  onChange: (val: string) => void;
}

const EditableParagraphSection: React.FC<EditableParagraphSectionProps> = ({
  title,
  value,
  isEditing,
  onChange,
}) => (
  <section className="print-avoid-break space-y-2.5">
    <h3 className="font-display text-base sm:text-lg font-bold text-[#0F172A] dark:text-white border-l-4 border-[#4338CA] pl-3">
      {title}
    </h3>
    {isEditing ? (
      <textarea
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-sm leading-relaxed"
      />
    ) : (
      <p className="text-sm text-[#1E293B] dark:text-slate-200 leading-relaxed pl-1">{value}</p>
    )}
  </section>
);
