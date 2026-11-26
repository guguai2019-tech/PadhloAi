import type {
  AdvancedQuestionTypeId,
  ExamDefinition,
  MockLanguage,
  SyllabusSubject,
} from '../types';

export interface QuestionFormatMeta {
  id: AdvancedQuestionTypeId;
  sectionLetter: string;
  label: string;
  labelHi: string;
  labelOr: string;
  shortDesc: string;
  defaultCount: number;
  defaultMarks: number;
  wordLimitHint?: string;
}

export const ALL_QUESTION_FORMATS: QuestionFormatMeta[] = [
  {
    id: 'MCQ',
    sectionLetter: 'A',
    label: 'Multiple Choice Questions (MCQ)',
    labelHi: 'बहुविकल्पीय प्रश्न (MCQ)',
    labelOr: 'ବହୁବିକଳ୍ପୀୟ ପ୍ରଶ୍ନ (MCQ)',
    shortDesc: 'Four options (A, B, C, D) with one correct answer',
    defaultCount: 10,
    defaultMarks: 1,
  },
  {
    id: 'Multiple-Select',
    sectionLetter: 'B',
    label: 'Multiple Select Questions',
    labelHi: 'एकाधिक सही विकल्प (Multiple Select)',
    labelOr: 'ଏକାଧିକ ସଠିକ୍ ବିକଳ୍ପ (MSQ)',
    shortDesc: 'More than one correct option clearly identified in key',
    defaultCount: 4,
    defaultMarks: 2,
  },
  {
    id: 'True-False',
    sectionLetter: 'C',
    label: 'True or False Questions',
    labelHi: 'सत्य / असत्य प्रश्न (True/False)',
    labelOr: 'ସତ୍ୟ କିମ୍ବା ମିଥ୍ୟା ପ୍ରଶ୍ନ',
    shortDesc: 'Identify whether each statement is True or False',
    defaultCount: 5,
    defaultMarks: 1,
  },
  {
    id: 'Fill-in-the-Blanks',
    sectionLetter: 'D',
    label: 'Fill in the Blanks',
    labelHi: 'रिक्त स्थान भरें (Fill in the Blanks)',
    labelOr: 'ଶୂନ୍ୟସ୍ଥାନ ପୂରଣ କରନ୍ତୁ',
    shortDesc: 'Complete sentences with accurate missing terms',
    defaultCount: 5,
    defaultMarks: 1,
  },
  {
    id: 'Match-Following',
    sectionLetter: 'E',
    label: 'Match the Following',
    labelHi: 'सही मिलान कीजिए (Match the Following)',
    labelOr: 'ସ୍ତମ୍ଭ ମିଳନ (Match the Following)',
    shortDesc: 'Two columns with items to match accurately',
    defaultCount: 3,
    defaultMarks: 2,
  },
  {
    id: 'One-Word',
    sectionLetter: 'F',
    label: 'One Word Answer',
    labelHi: 'एक शब्द में उत्तर (One Word)',
    labelOr: 'ଗୋଟିଏ ଶବ୍ଦରେ ଉତ୍ତର',
    shortDesc: 'Questions requiring a single exact word or term',
    defaultCount: 5,
    defaultMarks: 1,
    wordLimitHint: '1 word / 1 term',
  },
  {
    id: 'Very-Short',
    sectionLetter: 'G',
    label: 'Very Short Answer',
    labelHi: 'अति लघु उत्तरीय (Very Short)',
    labelOr: 'ଅତି ସଂକ୍ଷିପ୍ତ ଉତ୍ତରମୂଳକ',
    shortDesc: 'Brief direct answers (1–2 sentences, 1–2 marks)',
    defaultCount: 5,
    defaultMarks: 2,
    wordLimitHint: '20–30 words',
  },
  {
    id: 'Short-Answer',
    sectionLetter: 'H',
    label: 'Short Answer Questions',
    labelHi: 'लघु उत्तरीय प्रश्न (Short Answer)',
    labelOr: 'ସଂକ୍ଷିପ୍ତ ଉତ୍ତରମୂଳକ ପ୍ରଶ୍ନ',
    shortDesc: 'Focused explanations (2–3 marks)',
    defaultCount: 5,
    defaultMarks: 3,
    wordLimitHint: '40–60 words',
  },
  {
    id: 'Long-Answer',
    sectionLetter: 'I',
    label: 'Long Answer Questions',
    labelHi: 'दीर्घ उत्तरीय प्रश्न (Long Answer)',
    labelOr: 'ଦୀର୍ଘ ଉତ୍ତରମୂଳକ ପ୍ରଶ୍ନ',
    shortDesc: 'Detailed structured answers (4–6 marks)',
    defaultCount: 3,
    defaultMarks: 5,
    wordLimitHint: '100–150 words',
  },
  {
    id: 'Descriptive',
    sectionLetter: 'J',
    label: 'Descriptive Questions',
    labelHi: 'वर्णनात्मक / निबंधात्मक प्रश्न',
    labelOr: 'ବର୍ଣ୍ଣନାତ୍ମକ ପ୍ରଶ୍ନ',
    shortDesc: 'In-depth analytical explanations & essay writing',
    defaultCount: 2,
    defaultMarks: 5,
    wordLimitHint: '150–200 words',
  },
  {
    id: 'Assertion-Reasoning',
    sectionLetter: 'K',
    label: 'Assertion and Reason',
    labelHi: 'कथन एवं कारण (Assertion-Reason)',
    labelOr: 'ଉକ୍ତି ଓ କାରଣ (Assertion-Reason)',
    shortDesc: 'Assertion (A) & Reason (R) with standard A–D options',
    defaultCount: 4,
    defaultMarks: 1,
  },
  {
    id: 'Case-Based',
    sectionLetter: 'L',
    label: 'Case-Based Questions',
    labelHi: 'केस-आधारित प्रश्न (Case-Based)',
    labelOr: 'କେସ୍-ଆଧାରିତ ପ୍ରଶ୍ନ',
    shortDesc: 'Real-world situation or scenario followed by questions',
    defaultCount: 2,
    defaultMarks: 4,
  },
  {
    id: 'Passage-Based',
    sectionLetter: 'M',
    label: 'Passage-Based Questions',
    labelHi: 'गद्यांश / अपठित बोध आधारित प्रश्न',
    labelOr: 'ଅନୁଚ୍ଛେଦ ଆଧାରିତ ପ୍ରଶ୍ନ',
    shortDesc: 'Reading passage followed by comprehension questions',
    defaultCount: 2,
    defaultMarks: 4,
  },
  {
    id: 'Numerical',
    sectionLetter: 'N',
    label: 'Numerical / Problem-Solving Questions',
    labelHi: 'संख्यात्मक / गणितीय प्रश्न (Numerical)',
    labelOr: 'ସଂଖ୍ୟାତ୍ମକ / ଗାଣିତିକ ସମସ୍ୟା',
    shortDesc: 'Calculations, equations & step-by-step problem solving',
    defaultCount: 4,
    defaultMarks: 3,
  },
  {
    id: 'Diagram-Based',
    sectionLetter: 'O',
    label: 'Diagram-Based Questions',
    labelHi: 'चित्र / मानचित्र / आरेख आधारित प्रश्न',
    labelOr: 'ଚିତ୍ର / ମାନଚିତ୍ର ଆଧାରିତ ପ୍ରଶ୍ନ',
    shortDesc: 'Questions built around diagrams, maps, circuits or figures',
    defaultCount: 2,
    defaultMarks: 3,
  },
  {
    id: 'Sequence-Order',
    sectionLetter: 'P',
    label: 'Sequence / Arrange in Order',
    labelHi: 'क्रमबद्ध करें (Arrange in Order)',
    labelOr: 'କ୍ରମ ଅନୁସାରେ ସଜାନ୍ତୁ',
    shortDesc: 'Arrange events, steps, processes or values in order',
    defaultCount: 3,
    defaultMarks: 2,
  },
];

export function getFormatLocalizedLabel(
  meta: QuestionFormatMeta,
  language: MockLanguage,
): string {
  if (language === 'hindi') return meta.labelHi;
  if (language === 'odia') return meta.labelOr;
  return meta.label;
}

export function getOfficialDefaultMarks(
  exam: ExamDefinition | undefined,
  typeId: AdvancedQuestionTypeId,
): number {
  if (exam?.customFormatMarks && typeof exam.customFormatMarks[typeId] === 'number') {
    return exam.customFormatMarks[typeId]!;
  }
  const base = ALL_QUESTION_FORMATS.find((f) => f.id === typeId)?.defaultMarks ?? 1;
  if (!exam) return base;

  // Exam-calibrated defaults:
  if (exam.category === 'competitive' || exam.category === 'ugc-net') {
    if (typeId === 'MCQ' || typeId === 'Multiple-Select' || typeId === 'Assertion-Reasoning' || typeId === 'Match-Following') {
      return exam.defaultMarksPerQuestion || base;
    }
  }
  if (exam.id.startsWith('chse-')) {
    if (typeId === 'Long-Answer' || typeId === 'Descriptive') return 7; // CHSE +2 long Q pattern (5 or 7 marks)
    if (typeId === 'Short-Answer') return 3;
    if (typeId === 'Very-Short') return 2;
  }
  if (exam.id === 'bse-odisha') {
    if (typeId === 'Long-Answer' || typeId === 'Descriptive') return 5;
    if (typeId === 'Short-Answer') return 3;
    if (typeId === 'Very-Short') return 2;
  }
  return base;
}

export function getSuitableQuestionFormats(
  exam: ExamDefinition | undefined,
  subjectObj: SyllabusSubject | undefined,
): QuestionFormatMeta[] {
  const adminAllowed = exam?.allowedQuestionFormats;
  if (adminAllowed && adminAllowed.length > 0) {
    return ALL_QUESTION_FORMATS.filter((f) => adminAllowed.includes(f.id));
  }

  const subjLower = `${subjectObj?.name || ''} ${subjectObj?.code || ''}`.toLowerCase();
  const isLanguageSubject =
    Boolean(subjectObj?.subjectLanguage) ||
    /\b(english|odia|ଓଡ଼ିଆ|hindi|हिंदी|sanskrit|mil)\b/i.test(subjLower);

  const supportsNumerical =
    /\b(math|physics|chemistry|science|account|econom|statist|comput|it|electron|biotech|arithmetic|quant|reasoning|data interpretation)\b/i.test(
      subjLower,
    ) || !isLanguageSubject;

  const supportsDiagram =
    /\b(science|physics|chemistry|biology|botany|zoology|geography|geology|history|social|map|computer|electron|biotech)\b/i.test(
      subjLower,
    );

  // Competitive & UGC NET exams primarily use objective / analytical patterns
  if (exam?.category === 'competitive' || exam?.category === 'ugc-net') {
    const compIds: AdvancedQuestionTypeId[] = [
      'MCQ',
      'Multiple-Select',
      'True-False',
      'Fill-in-the-Blanks',
      'Match-Following',
      'One-Word',
      'Assertion-Reasoning',
      'Case-Based',
      'Passage-Based',
      'Sequence-Order',
      ...(supportsNumerical ? (['Numerical'] as AdvancedQuestionTypeId[]) : []),
    ];
    return ALL_QUESTION_FORMATS.filter((f) => compIds.includes(f.id));
  }

  // School & Higher Secondary Board exams (BSE Odisha, CHSE Arts/Science, CBSE 10 & 12)
  return ALL_QUESTION_FORMATS.filter((f) => {
    if (f.id === 'Numerical' && !supportsNumerical) return false;
    if (f.id === 'Diagram-Based' && !supportsDiagram) return false;
    return true;
  });
}
