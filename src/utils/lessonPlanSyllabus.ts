import type {
  ExamDefinition,
  GeneratedLessonPlan,
  LessonPlanBoardOption,
  LessonPlanLanguage,
  LessonPlanPresentationRow,
  LessonPlanType,
  SyllabusChapter,
  SyllabusSubject,
} from '../types';

export const BASE_LESSON_PLAN_CLASSES: string[] = [
  'Class 1',
  'Class 2',
  'Class 3',
  'Class 4',
  'Class 5',
  'Class 6',
  'Class 7',
  'Class 8',
  'Class 9',
  'Class 10',
  'Class 12',
];

export const LESSON_PLAN_BOARDS: LessonPlanBoardOption[] = [
  'BSE Odisha',
  'CBSE',
  'ICSE',
  'Other',
];

export const LESSON_PLAN_TYPES: LessonPlanType[] = [
  'General Lesson Plan',
  'Detailed Lesson Plan',
  'Micro Teaching Lesson Plan',
  'B.Ed. Lesson Plan',
  'D.El.Ed. Lesson Plan',
  'Activity-Based Lesson Plan',
  'Demonstration Lesson Plan',
];

export const LESSON_PLAN_DURATIONS: number[] = [30, 40, 45, 60];

export const NO_SYLLABUS_EXACT_MESSAGE =
  'No syllabus available for this class and subject. You can still generate a general lesson plan by entering your topic manually.';

export function extractClassNumber(label: string): number | null {
  const m = label.match(/\bclass\s*[-:]?\s*(\d{1,2})\b/i);
  if (m) return Number(m[1]);
  const romanMatch = label.match(/\bclass\s*[-:]?\s*(XII|XI|X|IX|VIII|VII|VI|V|IV|III|II|I)\b/i);
  if (romanMatch) {
    const map: Record<string, number> = {
      I: 1,
      II: 2,
      III: 3,
      IV: 4,
      V: 5,
      VI: 6,
      VII: 7,
      VIII: 8,
      IX: 9,
      X: 10,
      XI: 11,
      XII: 12,
    };
    return map[romanMatch[1].toUpperCase()] ?? null;
  }
  const plusTwoMatch = label.match(/\+2\s+.*\b(1st|2nd)\s*year\b/i);
  if (plusTwoMatch) {
    return plusTwoMatch[1].toLowerCase() === '1st' ? 11 : 12;
  }
  return null;
}

/**
 * Always provides Class 1–10 and Class 12.
 * Automatically enables Class 11 and any additional school classes uploaded/published by the Administrator.
 */
export function getAvailableLessonPlanClasses(exams: ExamDefinition[]): string[] {
  const classSet = new Set<string>(BASE_LESSON_PLAN_CLASSES);

  for (const ex of exams) {
    if (ex.status === 'Draft') continue;
    for (const cls of ex.classesOrPapers || []) {
      if (!cls.subjects || cls.subjects.length === 0) continue;
      const num = extractClassNumber(cls.label);
      if (num !== null && num >= 1 && num <= 12) {
        classSet.add(`Class ${num}`);
      } else if (
        ex.isCustom ||
        ex.category === 'cbse' ||
        ex.category === 'odisha-board' ||
        /\bclass\b/i.test(cls.label)
      ) {
        if (/\bclass\b|\bgrade\b|\bstd\b/i.test(cls.label)) {
          classSet.add(cls.label.trim());
        }
      }
    }
  }

  return Array.from(classSet).sort((a, b) => {
    const na = extractClassNumber(a);
    const nb = extractClassNumber(b);
    if (na !== null && nb !== null) return na - nb;
    if (na !== null) return -1;
    if (nb !== null) return 1;
    return a.localeCompare(b);
  });
}

function matchesBoardOption(ex: ExamDefinition, board: LessonPlanBoardOption): boolean {
  const haystack = `${ex.id} ${ex.name} ${ex.boardName || ''} ${ex.shortDesc || ''}`;
  const isBseOdisha =
    ex.id.startsWith('bse-odisha') ||
    /bse\s*odisha|board of secondary education.*odisha/i.test(haystack);
  const isCbse =
    ex.category === 'cbse' || /\bcbse\b|central board of secondary education/i.test(haystack);
  const isIcse = /\bicse\b|\bcisce\b|\bisc\b/i.test(haystack);

  if (board === 'BSE Odisha') return isBseOdisha;
  if (board === 'CBSE') return isCbse;
  if (board === 'ICSE') return isIcse;
  // 'Other' captures CHSE Odisha, State Boards, SCERT, custom school boards, etc.
  return (
    !isBseOdisha &&
    !isCbse &&
    !isIcse &&
    (ex.category === 'odisha-board' || Boolean(ex.isCustom) || Boolean(ex.boardName))
  );
}

export interface MergedSyllabusSubject extends SyllabusSubject {
  sourceExamNames: string[];
  academicSessions: string[];
}

export interface BoardClassSyllabusMatch {
  hasSyllabus: boolean;
  matchedExamNames: string[];
  academicSessions: string[];
  subjects: MergedSyllabusSubject[];
}

/**
 * Dynamically inspects published Admin Panel & centralized syllabus records
 * for the selected (className, board). Never hardcodes subjects or chapters.
 */
export function findMatchingBoardSyllabus(
  exams: ExamDefinition[],
  className: string,
  board: LessonPlanBoardOption,
): BoardClassSyllabusMatch {
  const targetNum = extractClassNumber(className);
  const normalizedClassLower = className.trim().toLowerCase();

  const matchedExamNames = new Set<string>();
  const academicSessions = new Set<string>();
  const subjectMap = new Map<string, MergedSyllabusSubject>();

  for (const ex of exams) {
    if (ex.status === 'Draft') continue;
    if (!matchesBoardOption(ex, board)) continue;

    for (const cls of ex.classesOrPapers || []) {
      const clsNum = extractClassNumber(cls.label);
      const isClassMatch =
        (targetNum !== null && clsNum === targetNum) ||
        cls.label.trim().toLowerCase() === normalizedClassLower;

      if (!isClassMatch) continue;
      if (!cls.subjects || cls.subjects.length === 0) continue;

      matchedExamNames.add(ex.name);
      if (ex.academicSession) academicSessions.add(ex.academicSession);

      for (const subj of cls.subjects) {
        const key = subj.name.trim().toLowerCase();
        const existing = subjectMap.get(key);
        if (!existing) {
          subjectMap.set(key, {
            name: subj.name,
            code: subj.code,
            prescribedBooks: subj.prescribedBooks ? [...subj.prescribedBooks] : [],
            chapters: subj.chapters ? subj.chapters.map((c) => ({ ...c, topics: [...(c.topics || [])] })) : [],
            sourceExamNames: [ex.name],
            academicSessions: ex.academicSession ? [ex.academicSession] : [],
          });
        } else {
          if (!existing.sourceExamNames.includes(ex.name)) {
            existing.sourceExamNames.push(ex.name);
          }
          if (ex.academicSession && !existing.academicSessions.includes(ex.academicSession)) {
            existing.academicSessions.push(ex.academicSession);
          }
          for (const book of subj.prescribedBooks || []) {
            if (!existing.prescribedBooks?.includes(book)) {
              existing.prescribedBooks = [...(existing.prescribedBooks || []), book];
            }
          }
          const existingChapters = new Map<string, SyllabusChapter>(
            existing.chapters.map((c) => [c.name.trim().toLowerCase(), c]),
          );
          for (const ch of subj.chapters || []) {
            const chKey = ch.name.trim().toLowerCase();
            const foundCh = existingChapters.get(chKey);
            if (!foundCh) {
              existing.chapters.push({ ...ch, topics: [...(ch.topics || [])] });
              existingChapters.set(chKey, ch);
            } else {
              for (const t of ch.topics || []) {
                if (!foundCh.topics.includes(t)) {
                  foundCh.topics.push(t);
                }
              }
            }
          }
        }
      }
    }
  }

  const subjects = Array.from(subjectMap.values());
  return {
    hasSyllabus: subjects.length > 0,
    matchedExamNames: Array.from(matchedExamNames),
    academicSessions: Array.from(academicSessions),
    subjects,
  };
}

/**
 * Builds an authoritative syllabus reference block to pass to the AI model so
 * syllabus concepts stay strictly grounded and out-of-syllabus material is avoided.
 */
export function buildSyllabusContextPrompt(params: {
  matchedSubject: MergedSyllabusSubject | null;
  selectedChapterName: string;
  selectedTopicName: string;
}): string {
  const { matchedSubject, selectedChapterName, selectedTopicName } = params;
  if (!matchedSubject) {
    return 'No Admin-published syllabus record was found for this exact Class, Board, and Subject combination. Generate a pedagogically sound general lesson plan strictly aligned to standard age-appropriate school pedagogy for the manually entered Subject and Topic, and clearly state in syllabusReferenceSummary that no uploaded syllabus record was available.';
  }

  const chapterObj = selectedChapterName
    ? matchedSubject.chapters.find(
        (c) => c.name.trim().toLowerCase() === selectedChapterName.trim().toLowerCase(),
      )
    : undefined;

  const lines: string[] = [
    `AUTHORITATIVE ADMIN-PUBLISHED SYLLABUS RECORD:`,
    `- Source Board/Exam: ${matchedSubject.sourceExamNames.join(', ')}`,
    matchedSubject.academicSessions.length > 0
      ? `- Academic Session: ${matchedSubject.academicSessions.join(', ')}`
      : '',
    `- Subject: ${matchedSubject.name}${matchedSubject.code ? ` (Code: ${matchedSubject.code})` : ''}`,
    matchedSubject.prescribedBooks && matchedSubject.prescribedBooks.length > 0
      ? `- Prescribed Textbooks: ${matchedSubject.prescribedBooks.join('; ')}`
      : '',
  ].filter(Boolean);

  if (chapterObj) {
    lines.push(`- Selected Chapter: ${chapterObj.name}${chapterObj.term ? ` (${chapterObj.term})` : ''}`);
    if (chapterObj.topics.length > 0) {
      lines.push(`- Official Syllabus Topics in Chapter: ${chapterObj.topics.join(' | ')}`);
    }
    if (chapterObj.subtopics && chapterObj.subtopics.length > 0) {
      lines.push(`- Official Subtopics: ${chapterObj.subtopics.join(' | ')}`);
    }
    if (chapterObj.excludedFromExam) {
      lines.push(`- Note: This chapter is marked as non-evaluated / excluded from final exam assessment in the uploaded syllabus.`);
    }
  } else {
    const preview = matchedSubject.chapters
      .slice(0, 12)
      .map((c) => `${c.name} (${c.topics.slice(0, 4).join(', ')})`)
      .join('; ');
    lines.push(`- Published Subject Chapters Overview: ${preview}`);
  }

  lines.push(`- Focus Topic Requested: ${selectedTopicName}`);
  lines.push(
    `GROUNDING RULE: Keep all instructional content strictly within the above uploaded syllabus scope. Do NOT invent fake textbook page numbers, edition codes, or official curriculum standards not present above. Clearly distinguish facts from the uploaded syllabus versus additional classroom activities suggested by the AI.`,
  );

  return lines.join('\n');
}

/**
 * Guarantees presentationTable stage minutes are positive integers and ALWAYS
 * sum strictly to totalDurationMinutes.
 */
export function normalizeLessonPlanDurations(
  rows: LessonPlanPresentationRow[],
  targetTotalMinutes: number,
): LessonPlanPresentationRow[] {
  const safeTotal = Math.max(5, Math.min(240, Math.round(targetTotalMinutes || 40)));
  if (!rows || rows.length === 0) {
    return [
      {
        stageName: 'Introduction & Warm-Up',
        minutes: Math.max(1, Math.round(safeTotal * 0.15)),
        teachingPoints: 'Motivation and prior knowledge check',
        teacherActivities: 'Connects previous knowledge to the new topic.',
        studentActivities: 'Responds to warm-up questions.',
        tlm: 'Chalkboard / Visual flashcard',
        evaluationQuestions: 'Quick oral readiness question',
      },
      {
        stageName: 'Core Concept Presentation',
        minutes: Math.max(1, Math.round(safeTotal * 0.55)),
        teachingPoints: 'Explanation and guided examples',
        teacherActivities: 'Explains key concepts with clear examples and TLM.',
        studentActivities: 'Observes, takes notes, and asks clarifying questions.',
        tlm: 'Textbook, chart, blackboard',
        evaluationQuestions: 'Mid-lesson concept check question',
      },
      {
        stageName: 'Activity, Practice & Recap',
        minutes:
          safeTotal -
          Math.max(1, Math.round(safeTotal * 0.15)) -
          Math.max(1, Math.round(safeTotal * 0.55)),
        teachingPoints: 'Guided practice and summary',
        teacherActivities: 'Facilitates group/individual task and summarizes key takeaways.',
        studentActivities: 'Completes activity and shares summary.',
        tlm: 'Worksheet / Blackboard summary',
        evaluationQuestions: 'Exit recap question',
      },
    ];
  }

  const sanitized = rows.map((r) => ({
    ...r,
    minutes: Number.isFinite(r.minutes) && r.minutes > 0 ? Math.round(r.minutes) : 5,
  }));

  const currentSum = sanitized.reduce((acc, r) => acc + r.minutes, 0);
  if (currentSum === safeTotal) return sanitized;

  // Proportional rescaling while keeping every stage >= 1 minute
  const scaled = sanitized.map((r) => ({
    ...r,
    minutes: Math.max(1, Math.round((r.minutes / currentSum) * safeTotal)),
  }));

  let diff = safeTotal - scaled.reduce((acc, r) => acc + r.minutes, 0);
  // Adjust largest rows first when subtracting, or core/middle row when adding
  let guard = 0;
  while (diff !== 0 && guard < 500) {
    guard++;
    if (diff > 0) {
      const idx = Math.min(1, scaled.length - 1);
      scaled[idx].minutes += 1;
      diff -= 1;
    } else {
      // Find row with largest minutes > 1
      let maxIdx = -1;
      let maxVal = 1;
      for (let i = 0; i < scaled.length; i++) {
        if (scaled[i].minutes > maxVal) {
          maxVal = scaled[i].minutes;
          maxIdx = i;
        }
      }
      if (maxIdx === -1) break;
      scaled[maxIdx].minutes -= 1;
      diff += 1;
    }
  }

  return scaled;
}

export interface LocalizedLessonPlanLabels {
  documentBadge: string;
  syllabusVerifiedLabel: string;
  generalFallbackLabel: string;
  tableHeaders: {
    stageAndTime: string;
    teachingPoints: string;
    teacherActivities: string;
    studentActivities: string;
    tlm: string;
    evaluationQuestions: string;
  };
  totalDurationLabel: string;
  questionWord: string;
  expectedAnswerWord: string;
  expectedPointsWord: string;
  sections: string[]; // Exactly 23 headings in order 1..23
  generalInfoFields: {
    classLabel: string;
    board: string;
    academicSession: string;
    subject: string;
    chapter: string;
    topic: string;
    duration: string;
    lessonPlanType: string;
    targetAgeGroup: string;
    date: string;
    teacherName: string;
    schoolName: string;
  };
  pageWord: string;
}

export const LESSON_PLAN_UI_LABELS: Record<LessonPlanLanguage, LocalizedLessonPlanLabels> = {
  english: {
    documentBadge: 'SYLLABUS-ALIGNED LESSON PLAN DOCUMENT',
    syllabusVerifiedLabel: 'Admin Syllabus Referenced',
    generalFallbackLabel: 'General Lesson Plan (No Syllabus Uploaded)',
    tableHeaders: {
      stageAndTime: 'Stage & Time',
      teachingPoints: 'Teaching Points',
      teacherActivities: 'Teacher Activities',
      studentActivities: 'Student Activities',
      tlm: 'TLM',
      evaluationQuestions: 'Evaluation Questions',
    },
    totalDurationLabel: 'Total Lesson Duration',
    questionWord: 'Question',
    expectedAnswerWord: 'Expected Answer',
    expectedPointsWord: 'Key Value Points',
    pageWord: 'Page',
    generalInfoFields: {
      classLabel: 'Class',
      board: 'Board',
      academicSession: 'Academic Session',
      subject: 'Subject',
      chapter: 'Chapter',
      topic: 'Topic',
      duration: 'Teaching Duration',
      lessonPlanType: 'Lesson Plan Type',
      targetAgeGroup: 'Student Age / Level',
      date: 'Date',
      teacherName: 'Teacher Name',
      schoolName: 'School Name',
    },
    sections: [
      '1. General Information',
      '2. General Objectives',
      '3. Specific Learning Objectives',
      '4. Previous Knowledge of Students',
      '5. Teaching-Learning Materials (TLM)',
      '6. Introduction / Set Induction',
      '7. Introductory Questions and Expected Answers',
      '8. Announcement of the Topic',
      '9. Presentation of the Lesson',
      '10. Teacher Activities',
      '11. Student Activities',
      '12. Teaching-Learning Materials',
      '13. Blackboard Work',
      '14. Classroom Activities',
      '15. Group Activities',
      '16. Individual Activities',
      '17. Evaluation / Assessment',
      '18. Oral Questions',
      '19. Short-Answer Questions',
      '20. Recapitulation',
      '21. Homework / Assignment',
      '22. Expected Learning Outcomes',
      "23. Teacher's Reflection",
    ],
  },
  hindi: {
    documentBadge: 'पाठ्यक्रम-आधारित शिक्षण पाठ योजना (Lesson Plan)',
    syllabusVerifiedLabel: 'प्रकाशित पाठ्यक्रम पर आधारित',
    generalFallbackLabel: 'सामान्य पाठ योजना (बिना अपलोड किए गए पाठ्यक्रम के)',
    tableHeaders: {
      stageAndTime: 'चरण एवं समय',
      teachingPoints: 'शिक्षण बिंदु',
      teacherActivities: 'शिक्षक क्रियाकलाप',
      studentActivities: 'छात्र क्रियाकलाप',
      tlm: 'शिक्षण सहायक सामग्री (TLM)',
      evaluationQuestions: 'मूल्यांकन प्रश्न',
    },
    totalDurationLabel: 'कुल शिक्षण अवधि',
    questionWord: 'प्रश्न',
    expectedAnswerWord: 'अपेक्षित उत्तर',
    expectedPointsWord: 'मुख्य उत्तर बिंदु',
    pageWord: 'पृष्ठ',
    generalInfoFields: {
      classLabel: 'कक्षा',
      board: 'बोर्ड',
      academicSession: 'शैक्षणिक सत्र',
      subject: 'विषय',
      chapter: 'अध्याय',
      topic: 'प्रकरण / शीर्षक',
      duration: 'शिक्षण अवधि',
      lessonPlanType: 'पाठ योजना प्रकार',
      targetAgeGroup: 'छात्र स्तर / आयु वर्ग',
      date: 'दिनांक',
      teacherName: 'शिक्षक का नाम',
      schoolName: 'विद्यालय का नाम',
    },
    sections: [
      '1. सामान्य जानकारी',
      '2. सामान्य उद्देश्य',
      '3. विशिष्ट अधिगम उद्देश्य',
      '4. छात्रों का पूर्व ज्ञान',
      '5. शिक्षण-अधिगम सामग्री (TLM)',
      '6. प्रस्तावना / पाठ प्रवेश',
      '7. प्रस्तावना प्रश्न एवं अपेक्षित उत्तर',
      '8. प्रकरण की घोषणा',
      '9. पाठ का प्रस्तुतीकरण',
      '10. शिक्षक क्रियाकलाप',
      '11. छात्र क्रियाकलाप',
      '12. शिक्षण-अधिगम सामग्री (विस्तृत)',
      '13. श्यामपट्ट कार्य',
      '14. कक्षा गतिविधियाँ',
      '15. सामूहिक गतिविधियाँ',
      '16. व्यक्तिगत गतिविधियाँ',
      '17. मूल्यांकन / आकलन',
      '18. मौखिक प्रश्न',
      '19. लघु-उत्तरीय प्रश्न',
      '20. पुनरावृत्ति',
      '21. गृहकार्य / दत्त कार्य',
      '22. अपेक्षित अधिगम प्रतिफल',
      '23. शिक्षक का आत्म-चिंतन',
    ],
  },
  odia: {
    documentBadge: 'ପାଠ୍ୟକ୍ରମ-ଆଧାରିତ AI ପାଠ ଯୋଜନା (Lesson Plan)',
    syllabusVerifiedLabel: 'ପ୍ରକାଶିତ ପାଠ୍ୟକ୍ରମ ଉପରେ ଆଧାରିତ',
    generalFallbackLabel: 'ସାଧାରଣ ପାଠ ଯୋଜନା (ପାଠ୍ୟକ୍ରମ ବିନା)',
    tableHeaders: {
      stageAndTime: 'ସୋପାନ ଓ ସମୟ',
      teachingPoints: 'ଶିକ୍ଷଣ ବିନ୍ଦୁ',
      teacherActivities: 'ଶିକ୍ଷକ କାର୍ଯ୍ୟକଳାପ',
      studentActivities: 'ଛାତ୍ର କାର୍ଯ୍ୟକଳାପ',
      tlm: 'ଶିକ୍ଷଣ ସହାୟକ ସାମଗ୍ରୀ (TLM)',
      evaluationQuestions: 'ମୂଲ୍ୟାୟନ ପ୍ରଶ୍ନ',
    },
    totalDurationLabel: 'ମୋଟ ଶିକ୍ଷଣ ସମୟ',
    questionWord: 'ପ୍ରଶ୍ନ',
    expectedAnswerWord: 'ଅପେକ୍ଷିତ ଉତ୍ତର',
    expectedPointsWord: 'ମୁଖ୍ୟ ଉତ୍ତର ବିନ୍ଦୁ',
    pageWord: 'ପୃଷ୍ଠା',
    generalInfoFields: {
      classLabel: 'ଶ୍ରେଣୀ',
      board: 'ବୋର୍ଡ',
      academicSession: 'ଶିକ୍ଷା ବର୍ଷ',
      subject: 'ବିଷୟ',
      chapter: 'ଅଧ୍ୟାୟ',
      topic: 'ପ୍ରସଙ୍ଗ / ଶୀର୍ଷକ',
      duration: 'ଶିକ୍ଷଣ ଅବଧି',
      lessonPlanType: 'ପାଠ ଯୋଜନା ପ୍ରକାର',
      targetAgeGroup: 'ଛାତ୍ର ବୟସ / ସ୍ତର',
      date: 'ତାରିଖ',
      teacherName: 'ଶିକ୍ଷକଙ୍କ ନାମ',
      schoolName: 'ବିଦ୍ୟାଳୟର ନାମ',
    },
    sections: [
      '1. ସାଧାରଣ ସୂଚନା',
      '2. ସାଧାରଣ ଉଦ୍ଦେଶ୍ୟ',
      '3. ନିର୍ଦ୍ଦିଷ୍ଟ ଶିକ୍ଷଣ ଉଦ୍ଦେଶ୍ୟ',
      '4. ଛାତ୍ରଛାତ୍ରୀଙ୍କ ପୂର୍ବ ଜ୍ଞାନ',
      '5. ଶିକ୍ଷଣ-ଶିକ୍ଷାଦାନ ସାମଗ୍ରୀ (TLM)',
      '6. ଉପକ୍ରମଣିକା / ପାଠ ପ୍ରବେଶ',
      '7. ଉପକ୍ରମଣିକା ପ୍ରଶ୍ନ ଏବଂ ଅପେକ୍ଷିତ ଉତ୍ତର',
      '8. ପ୍ରସଙ୍ଗ ଘୋଷଣା',
      '9. ପାଠ ଉପସ୍ଥାପନା',
      '10. ଶିକ୍ଷକ କାର୍ଯ୍ୟକଳାପ',
      '11. ଛାତ୍ର କାର୍ଯ୍ୟକଳାପ',
      '12. ଶିକ୍ଷଣ-ଶିକ୍ଷାଦାନ ସାମଗ୍ରୀ (ବିସ୍ତୃତ)',
      '13. କଳାପଟା କାର୍ଯ୍ୟ (Blackboard Work)',
      '14. ଶ୍ରେଣୀଗୃହ କାର୍ଯ୍ୟକଳାପ',
      '15. ଦଳଗତ କାର୍ଯ୍ୟକଳାପ',
      '16. ବ୍ୟକ୍ତିଗତ କାର୍ଯ୍ୟକଳାପ',
      '17. ମୂଲ୍ୟାୟନ / ଆକଳନ',
      '18. ମୌଖିକ ପ୍ରଶ୍ନ',
      '19. ସଂକ୍ଷିପ୍ତ-ଉତ୍ତର ପ୍ରଶ୍ନ',
      '20. ପୁନରାବୃତ୍ତି',
      '21. ଗୃହକାର୍ଯ୍ୟ / ନିଯୁକ୍ତ କାର୍ଯ୍ୟ',
      '22. ଅପେକ୍ଷିତ ଶିକ୍ଷଣ ଫଳାଫଳ',
      '23. ଶିକ୍ଷକଙ୍କ ପ୍ରତିଫଳନ',
    ],
  },
};

export function formatLessonPlanAsPlainText(plan: GeneratedLessonPlan): string {
  const L = LESSON_PLAN_UI_LABELS[plan.language] || LESSON_PLAN_UI_LABELS.english;
  const g = plan.generalInformation;
  const lines: string[] = [];

  lines.push(`${L.documentBadge}`);
  lines.push(`${plan.topic} — ${plan.className} (${plan.board}) · ${plan.subject}`);
  lines.push('='.repeat(70));
  lines.push(plan.syllabusReferenceSummary);
  lines.push(plan.additionalActivitiesDisclaimer);
  lines.push('');

  lines.push(L.sections[0]);
  lines.push(`- ${L.generalInfoFields.classLabel}: ${g.classLabel}`);
  lines.push(`- ${L.generalInfoFields.board}: ${g.board}`);
  if (g.academicSession) lines.push(`- ${L.generalInfoFields.academicSession}: ${g.academicSession}`);
  lines.push(`- ${L.generalInfoFields.subject}: ${g.subject}`);
  lines.push(`- ${L.generalInfoFields.chapter}: ${g.chapter}`);
  lines.push(`- ${L.generalInfoFields.topic}: ${g.topic}`);
  lines.push(`- ${L.generalInfoFields.duration}: ${g.durationLabel}`);
  lines.push(`- ${L.generalInfoFields.lessonPlanType}: ${g.lessonPlanType}`);
  lines.push(`- ${L.generalInfoFields.targetAgeGroup}: ${g.targetAgeGroup}`);
  lines.push(`- ${L.generalInfoFields.date}: ${g.datePlaceholder} | ${L.generalInfoFields.teacherName}: ${g.teacherNamePlaceholder} | ${L.generalInfoFields.schoolName}: ${g.schoolNamePlaceholder}`);
  lines.push('');

  const addBullets = (heading: string, items: string[]) => {
    lines.push(heading);
    for (const item of items) {
      lines.push(`• ${item}`);
    }
    lines.push('');
  };

  addBullets(L.sections[1], plan.generalObjectives);
  addBullets(L.sections[2], plan.specificLearningObjectives);

  lines.push(L.sections[3]);
  lines.push(plan.previousKnowledge);
  lines.push('');

  addBullets(L.sections[4], plan.teachingLearningMaterials);

  lines.push(L.sections[5]);
  lines.push(plan.introductionSetInduction);
  lines.push('');

  lines.push(L.sections[6]);
  plan.introductoryQuestions.forEach((item, idx) => {
    lines.push(`${idx + 1}. ${L.questionWord}: ${item.question}`);
    lines.push(`   ${L.expectedAnswerWord}: ${item.expectedAnswer}`);
  });
  lines.push('');

  lines.push(L.sections[7]);
  lines.push(plan.announcementOfTopic);
  lines.push('');

  lines.push(L.sections[8]);
  lines.push(plan.presentationOverview);
  lines.push('');
  lines.push(
    `| ${L.tableHeaders.stageAndTime} | ${L.tableHeaders.teachingPoints} | ${L.tableHeaders.teacherActivities} | ${L.tableHeaders.studentActivities} | ${L.tableHeaders.tlm} | ${L.tableHeaders.evaluationQuestions} |`,
  );
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const row of plan.presentationTable) {
    lines.push(
      `| ${row.stageName} (${row.minutes} min) | ${row.teachingPoints} | ${row.teacherActivities} | ${row.studentActivities} | ${row.tlm} | ${row.evaluationQuestions} |`,
    );
  }
  lines.push('');

  addBullets(L.sections[9], plan.teacherActivities);
  addBullets(L.sections[10], plan.studentActivities);
  addBullets(L.sections[11], plan.teachingLearningMaterialsDetailed);
  addBullets(L.sections[12], plan.blackboardWork);
  addBullets(L.sections[13], plan.classroomActivities);
  addBullets(L.sections[14], plan.groupActivities);
  addBullets(L.sections[15], plan.individualActivities);

  lines.push(L.sections[16]);
  lines.push(plan.evaluationAssessment);
  lines.push('');

  addBullets(L.sections[17], plan.oralQuestions);

  lines.push(L.sections[18]);
  plan.shortAnswerQuestions.forEach((q, idx) => {
    lines.push(`${idx + 1}. ${L.questionWord}: ${q.question}`);
    lines.push(`   ${L.expectedPointsWord}: ${q.expectedAnswerPoints}`);
  });
  lines.push('');

  addBullets(L.sections[19], plan.recapitulation);
  addBullets(L.sections[20], plan.homeworkAssignment);
  addBullets(L.sections[21], plan.expectedLearningOutcomes);
  addBullets(L.sections[22], plan.teachersReflection);

  return lines.join('\n');
}
