import React, { useEffect, useMemo, useState } from 'react';
import { Type } from '@google/genai';
import {
  BookOpen,
  Check,
  CheckCircle2,
  ClipboardList,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  Info,
  Loader2,
  Sparkles,
} from 'lucide-react';
import type {
  AppSettings,
  CbseHindiClassLevel,
  CbseHindiCourseId,
  CbseHindiMarkOption,
  CbseHindiPaperFormat,
  CbseHindiPaperQuestion,
  CbseHindiQuestionPaper,
  CbseHindiSession,
  DifficultyLevel,
} from '../types';
import {
  CBSE_HINDI_COURSES,
  CBSE_HINDI_PAPER_FORMATS,
  CBSE_HINDI_SESSIONS,
  getAllowedMarksForCbseHindi,
} from '../data/cbseHindiSyllabus';
import { generateAI, parseSafeJson } from '../utils/aiClient';
import {
  exportCbseHindiAnswerKeyPdf,
  exportCbseHindiQuestionPaperPdf,
  exportCbseHindiWorksheetPdf,
} from '../utils/pdfExport';
import { MarkdownRenderer } from './MarkdownRenderer';

interface CbseHindiPaperStudioProps {
  settings: AppSettings;
}

const PAPER_BATCH_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    questions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          questionNumber: { type: Type.INTEGER },
          sectionName: { type: Type.STRING },
          questionCategory: { type: Type.STRING },
          questionFormat: { type: Type.STRING },
          marks: { type: Type.INTEGER },
          wordLimit: { type: Type.STRING },
          passageOrExtract: { type: Type.STRING },
          questionText: { type: Type.STRING },
          orOptionText: { type: Type.STRING },
          options: { type: Type.ARRAY, items: { type: Type.STRING } },
          correctAnswer: { type: Type.STRING },
          markingSchemePoints: { type: Type.ARRAY, items: { type: Type.STRING } },
          explanation: { type: Type.STRING },
        },
        required: [
          'sectionName',
          'questionCategory',
          'questionFormat',
          'marks',
          'questionText',
          'correctAnswer',
          'explanation',
        ],
      },
    },
  },
  required: ['questions'],
};

const HINDI_OPTION_LABELS = ['क', 'ख', 'ग', 'घ'];

export const CbseHindiPaperStudio: React.FC<CbseHindiPaperStudioProps> = ({ settings }) => {
  const [classLevel, setClassLevel] = useState<CbseHindiClassLevel>('10');
  const [courseId, setCourseId] = useState<CbseHindiCourseId>('cbse-10-hindi-a');
  const [session, setSession] = useState<CbseHindiSession>('2025-26');
  const [paperFormat, setPaperFormat] = useState<CbseHindiPaperFormat>('Full Hindi Question Paper');
  const [selectedChapter, setSelectedChapter] = useState<string>('');
  const [selectedTopic, setSelectedTopic] = useState<string>('सभी विषय-बिंदु (All Topics)');
  const [markOption, setMarkOption] = useState<CbseHindiMarkOption>('Official Blueprint Mix');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('Medium');
  const [questionCount, setQuestionCount] = useState<number>(8);
  const [customNotes, setCustomNotes] = useState<string>('');

  const [generating, setGenerating] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [generatedPaper, setGeneratedPaper] = useState<CbseHindiQuestionPaper | null>(null);
  const [showAnswers, setShowAnswers] = useState(true);
  const [mcqSelections, setMcqSelections] = useState<Record<number, number>>({});
  const [copied, setCopied] = useState(false);
  const [pdfBusyKind, setPdfBusyKind] = useState<'paper' | 'key' | 'worksheet' | null>(null);

  const availableCourses = useMemo(() => {
    return classLevel === '10'
      ? [CBSE_HINDI_COURSES['cbse-10-hindi-a'], CBSE_HINDI_COURSES['cbse-10-hindi-b']]
      : [CBSE_HINDI_COURSES['cbse-12-hindi-core'], CBSE_HINDI_COURSES['cbse-12-hindi-elective']];
  }, [classLevel]);

  const activeCourse = CBSE_HINDI_COURSES[courseId];

  // Ensure courseId always matches selected classLevel
  useEffect(() => {
    if (classLevel === '10' && !courseId.startsWith('cbse-10')) {
      setCourseId('cbse-10-hindi-a');
    } else if (classLevel === '12' && !courseId.startsWith('cbse-12')) {
      setCourseId('cbse-12-hindi-core');
    }
  }, [classLevel, courseId]);

  // Filter chapters relevant to selected format
  const filteredChapters = useMemo(() => {
    const chaps = activeCourse.chapters;
    if (paperFormat === 'Grammar Practice') {
      return chaps.filter(
        (c) =>
          (c.section || '').includes('व्याकरण') ||
          (c.section || '').includes('अभिव्यक्ति और माध्यम'),
      );
    }
    if (paperFormat === 'Reading Comprehension Practice') {
      return chaps.filter((c) => (c.section || '').includes('अपठित'));
    }
    if (paperFormat === 'Writing Skills Practice') {
      return chaps.filter(
        (c) =>
          (c.section || '').includes('रचनात्मक लेखन') ||
          (c.section || '').includes('अभिव्यक्ति और माध्यम'),
      );
    }
    if (paperFormat === 'Literature Practice') {
      return chaps.filter(
        (c) =>
          (c.section || '').includes('क्षितिज') ||
          (c.section || '').includes('कृतिका') ||
          (c.section || '').includes('स्पर्श') ||
          (c.section || '').includes('संचयन') ||
          (c.section || '').includes('आरोह') ||
          (c.section || '').includes('वितान') ||
          (c.section || '').includes('अंतरा') ||
          (c.section || '').includes('अंतराल'),
      );
    }
    return chaps;
  }, [activeCourse, paperFormat]);

  // Reset selected chapter when course or filtered list changes
  useEffect(() => {
    const valid = filteredChapters.find((c) => c.name === selectedChapter);
    if (!valid) {
      setSelectedChapter(filteredChapters[0]?.name || '');
      setSelectedTopic('सभी विषय-बिंदु (All Topics)');
    }
  }, [filteredChapters, selectedChapter]);

  const activeChapterObj = useMemo(
    () => filteredChapters.find((c) => c.name === selectedChapter) || filteredChapters[0],
    [filteredChapters, selectedChapter],
  );

  const allowedMarks = useMemo(
    () => getAllowedMarksForCbseHindi(courseId, paperFormat),
    [courseId, paperFormat],
  );

  useEffect(() => {
    if (!allowedMarks.includes(markOption)) {
      setMarkOption(allowedMarks[0]);
    }
  }, [allowedMarks, markOption]);

  const normalizeQuestions = (
    raw: Array<Partial<CbseHindiPaperQuestion>>,
    startNumber: number,
  ): CbseHindiPaperQuestion[] => {
    return raw
      .filter((q) => typeof q.questionText === 'string' && q.questionText.trim().length > 0)
      .map((q, idx) => {
        const fmtRaw = String(q.questionFormat || 'Short Answer');
        const safeFormat: CbseHindiPaperQuestion['questionFormat'] =
          fmtRaw === 'MCQ' ||
          fmtRaw === 'Very Short' ||
          fmtRaw === 'Short Answer' ||
          fmtRaw === 'Long Answer' ||
          fmtRaw === 'Writing Skill' ||
          fmtRaw === 'Passage Based'
            ? fmtRaw
            : Array.isArray(q.options) && q.options.length >= 4
              ? 'MCQ'
              : 'Short Answer';

        const opts = Array.isArray(q.options) && q.options.length > 0
          ? q.options.slice(0, 4).map((o) => String(o))
          : undefined;

        return {
          questionNumber: startNumber + idx,
          sectionName: q.sectionName?.trim() || 'खंड — अभ्यास प्रश्न',
          questionCategory: q.questionCategory?.trim() || paperFormat,
          questionFormat: safeFormat,
          marks: typeof q.marks === 'number' && q.marks > 0 ? Math.round(q.marks) : 2,
          wordLimit: q.wordLimit?.trim() || undefined,
          passageOrExtract: q.passageOrExtract?.trim() || undefined,
          questionText: q.questionText!.trim(),
          orOptionText: q.orOptionText?.trim() || undefined,
          options: opts,
          correctAnswer: q.correctAnswer?.trim() || 'उपर्युक्त उत्तर बिंदु देखें।',
          markingSchemePoints: Array.isArray(q.markingSchemePoints)
            ? q.markingSchemePoints.map((p) => String(p).trim()).filter(Boolean)
            : [],
          explanation: q.explanation?.trim() || 'आधिकारिक CBSE अंक-योजना के अनुरूप उत्तर।',
        };
      });
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setErrorMsg(null);
    setMcqSelections({});

    const safeCount = Math.max(2, Math.min(20, questionCount));
    const chapterListText = activeCourse.chapters
      .map((c) => `- [${c.section}] ${c.name} (${c.topics.join('; ')})`)
      .join('\n');

    const baseRules = `
CRITICAL ACADEMIC & LANGUAGE RULES:
1. Language: Write EVERY single field (sectionName, questionCategory, passageOrExtract, questionText, orOptionText, options, correctAnswer, markingSchemePoints, explanation) in pure, natural, grammatically accurate Hindi (Devanagari script / देवनागरी लिपि). Do NOT mix Odia or English questions unless citing an official Hindi grammar term.
2. Academic Session: CBSE Official Syllabus Session ${session} for ${activeCourse.classLabel}.
3. Course Identity: ${activeCourse.courseNameHi} (${activeCourse.courseNameEn}, Subject Code ${activeCourse.courseCode}).
4. Prescribed NCERT Textbooks ONLY: ${activeCourse.prescribedBooks.join(', ')}.
5. ${activeCourse.strictIsolationNote}
6. Difficulty Level: ${difficulty}.
7. Authentic Practice: Never falsely claim these are leaked or official board past-year papers; generate fresh syllabus-accurate CBSE board-standard practice questions.
8. For MCQ questions, provide EXACTLY 4 distinct options in Hindi in "options" array and specify the exact correct option text in "correctAnswer". For subjective/writing questions, leave "options" as empty array [] and provide clear model answer/format + marking scheme points in "correctAnswer" and "markingSchemePoints".`;

    try {
      let allQuestions: CbseHindiPaperQuestion[] = [];

      if (paperFormat === 'Full Hindi Question Paper') {
        // Generate Official 80-Mark CBSE Paper cleanly in 2 balanced batches (Sections A+B, then Sections C+D)
        setProgressMsg('भाग 1/2: खंड क (अपठित बोध) एवं खंड ख (व्याकरण / माध्यम) तैयार हो रहा है...');

        const part1Prompt =
          courseId === 'cbse-10-hindi-a'
            ? `Generate Section A (खंड 'क' — अपठित बोध, 14 Marks) and Section B (खंड 'ख' — व्यावहारिक व्याकरण, 16 Marks) of a CBSE Class 10 Hindi Course A (Code 002) Session ${session} 80-mark practice paper.
Include:
1. One complete unseen Hindi prose passage (~180-220 words in "passageOrExtract" of Q1) with 3 MCQ items (1 mark each) and 2 short-answer questions (2 marks each). Total 7 marks.
2. One complete unseen Hindi poem (~12-16 lines in "passageOrExtract") with 3 MCQ items (1 mark each) and 2 short-answer questions (2 marks each). Total 7 marks.
3. Practical Grammar (खंड 'ख' — 4 items covering Course A ONLY, 4 marks per topic block OR individual 1-mark items totaling 16 marks — generate 8 crisp items of 2 marks or 4 grouped 4-mark questions with subparts / 16 1-mark questions? Better: generate 8 clear grammar questions of 2 marks each = 16 marks covering: वाक्य भेद (सरल/संयुक्त/मिश्र), वाच्य परिवर्तन, पद-परिचय, और अलंकार (श्लेष/उत्प्रेक्षा/अतिशयोक्ति/मानवीकरण)).
${customNotes ? `Custom notes: ${customNotes}` : ''}
${baseRules}
Return strictly valid JSON matching the schema.`
            : courseId === 'cbse-10-hindi-b'
              ? `Generate Section A (खंड 'क' — अपठित बोध, 14 Marks) and Section B (खंड 'ख' — व्यावहारिक व्याकरण, 16 Marks) of a CBSE Class 10 Hindi Course B (Code 085) Session ${session} 80-mark practice paper.
Include:
1. Two distinct complete unseen Hindi prose passages (गद्यांश 1 व गद्यांश 2, each ~180 words in "passageOrExtract"), each followed by 3 MCQ items (1 mark each) and 2 short-answer questions (2 marks each) = 14 marks total. (Course B has two prose passages in Section A.)
2. Practical Grammar (खंड 'ख' — 8 clear questions of 2 marks each = 16 marks covering Course B ONLY: पदबंध, रचना के आधार पर वाक्य रूपांतरण, समास-विग्रह व भेद, मुहावरों का वाक्य प्रयोग).
${customNotes ? `Custom notes: ${customNotes}` : ''}
${baseRules}
Return strictly valid JSON matching the schema.`
              : `Generate Section A (खंड 'क' — अपठित बोध, 18 Marks) and Section B (खंड 'ख' — अभिव्यक्ति और माध्यम एवं रचनात्मक लेखन, 22 Marks) of a CBSE Class 12 ${activeCourse.courseNameEn} (Code ${activeCourse.courseCode}) Session ${session} 80-mark practice paper.
Include:
1. One complete unseen prose passage (~220 words in "passageOrExtract") followed by 3 MCQ items (1 mark each), 2 short questions (2 marks each), and 1 analytical question (3 marks) = 10 marks.
2. One complete unseen poetry passage (~12-16 lines in "passageOrExtract") followed by 3 MCQ items (1 mark each), 2 short questions (2 marks each), and 1 appreciation question (1 mark) = 8 marks.
3. Section B (खंड 'ख' — अभिव्यक्ति और माध्यम, 22 marks):
   - 1 Creative Writing on Unseen/Unexpected Topic (नए और अप्रत्याशित विषय पर रचनात्मक लेखन — 6 marks, 120 words) with internal choice ("orOptionText").
   - 4 questions of 4 marks each (4×4 = 16 marks) covering: कहानी का नाट्य रूपांतरण / रेडियो नाटक, समाचार लेखन व उल्टा पिरामिड शैली, विशेष लेखन व पत्रकारिता, तथा कैसे बनती है कविता।
${customNotes ? `Custom notes: ${customNotes}` : ''}
${baseRules}
Return strictly valid JSON matching the schema.`;

        const res1 = await generateAI({
          provider: settings.provider,
          model: settings.model,
          language: 'hindi',
          prompt: part1Prompt,
          responseMimeType: 'application/json',
          responseSchema: PAPER_BATCH_SCHEMA,
        });
        const parsed1 = parseSafeJson<{ questions: Array<Partial<CbseHindiPaperQuestion>> }>(
          res1.text,
        );
        const batch1 = normalizeQuestions(parsed1.questions || [], 1);

        setProgressMsg('भाग 2/2: खंड ग (पाठ्यपुस्तक एवं पूरक साहित्य) व लेखन कौशल तैयार हो रहा है...');

        const part2Prompt =
          courseId === 'cbse-10-hindi-a'
            ? `Generate Section C (खंड 'ग' — पाठ्यपुस्तक क्षितिज भाग-2 व कृतिका भाग-2, 30 Marks) and Section D (खंड 'घ' — रचनात्मक लेखन, 20 Marks) for CBSE Class 10 Hindi Course A (Code 002) Session ${session}.
Allowed Syllabus Chapters ONLY:
${chapterListText}

Include:
1. खंड 'ग' — पठित गद्यांश (क्षितिज गद्य से एक गद्यांश "passageOrExtract" में देकर 5 MCQ प्रश्न, प्रत्येक 1 अंक = 5 अंक)।
2. क्षितिज गद्य पाठों से 3 लघु उत्तरीय प्रश्न (प्रत्येक 2 अंक = 6 अंक)।
3. खंड 'ग' — पठित काव्यांश (क्षितिज काव्य से एक पद्यांश "passageOrExtract" में देकर 5 MCQ प्रश्न, प्रत्येक 1 अंक = 5 अंक)।
4. क्षितिज काव्य पाठों से 3 लघु उत्तरीय प्रश्न (प्रत्येक 2 अंक = 6 अंक)।
5. पूरक पुस्तक 'कृतिका भाग-2' से 2 दीर्घ उत्तरीय प्रश्न (प्रत्येक 4 अंक = 8 अंक, 50-60 शब्द)।
6. खंड 'घ' — रचनात्मक लेखन (20 अंक):
   - अनुच्छेद लेखन (संकेत-बिंदु सहित, 120 शब्द — 6 अंक, "orOptionText" सहित)
   - औपचारिक/अनौपचारिक पत्र लेखन (100 शब्द — 5 अंक, "orOptionText" सहित)
   - स्ववृत्त लेखन अथवा औपचारिक ई-मेल लेखन (80 शब्द — 5 अंक, "orOptionText" सहित)
   - विज्ञापन लेखन अथवा संदेश लेखन (40 शब्द — 4 अंक, "orOptionText" सहित)
${baseRules}
Return strictly valid JSON matching the schema.`
            : courseId === 'cbse-10-hindi-b'
              ? `Generate Section C (खंड 'ग' — पाठ्यपुस्तक स्पर्श भाग-2 व संचयन भाग-2, 28 Marks) and Section D (खंड 'घ' — रचनात्मक लेखन, 22 Marks) for CBSE Class 10 Hindi Course B (Code 085) Session ${session}.
Allowed Syllabus Chapters ONLY:
${chapterListText}

Include:
1. खंड 'ग' — पठित गद्यांश (स्पर्श गद्य से एक गद्यांश "passageOrExtract" में देकर 5 MCQ प्रश्न, प्रत्येक 1 अंक = 5 अंक)।
2. स्पर्श गद्य पाठों से 3 लघु उत्तरीय प्रश्न (प्रत्येक 2 अंक = 6 अंक)।
3. खंड 'ग' — पठित काव्यांश (स्पर्श पद्य से एक पद्यांश "passageOrExtract" में देकर 5 MCQ प्रश्न, प्रत्येक 1 अंक = 5 अंक)।
4. स्पर्श पद्य पाठों से 3 लघु उत्तरीय प्रश्न (प्रत्येक 2 अंक = 6 अंक)।
5. पूरक पुस्तक 'संचयन भाग-2' (हरिहर काका / सपनों के-से दिन / टोपी शुक्ला) से 2 प्रश्न (प्रत्येक 3 अंक = 6 अंक)।
6. खंड 'घ' — रचनात्मक लेखन (22 अंक):
   - अनुच्छेद लेखन (100 शब्द — 5 अंक, "orOptionText" सहित)
   - औपचारिक पत्र लेखन (100 शब्द — 5 अंक, "orOptionText" सहित)
   - सूचना लेखन (Notice, 60 शब्द — 4 अंक, "orOptionText" सहित)
   - विज्ञापन लेखन (40 शब्द — 3 अंक, "orOptionText" सहित)
   - लघुकथा लेखन अथवा औपचारिक ई-मेल लेखन (100 शब्द — 5 अंक, "orOptionText" सहित)
${baseRules}
Return strictly valid JSON matching the schema.`
              : `Generate Section C (खंड 'ग' — पाठ्यपुस्तक ${courseId === 'cbse-12-hindi-core' ? 'आरोह भाग-2 व वितान भाग-2' : 'अंतरा भाग-2 व अंतराल भाग-2'}, 40 Marks) for CBSE Class 12 ${activeCourse.courseNameEn} (Code ${activeCourse.courseCode}) Session ${session}.
Allowed Syllabus Chapters ONLY:
${chapterListText}

Include:
1. पठित काव्यांश आधारित 5 MCQ प्रश्न (1-1 अंक = 5 अंक, काव्यांश "passageOrExtract" में दें)।
2. पठित गद्यांश आधारित 5 MCQ प्रश्न (1-1 अंक = 5 अंक, गद्यांश "passageOrExtract" में दें)।
3. काव्य खंड पर आधारित 3 प्रश्न (प्रत्येक 3 अंक = 9 अंक; ${courseId === 'cbse-12-hindi-elective' ? 'सप्रसंग व्याख्या सहित एक प्रश्न अनिवार्य' : 'काव्य-सौंदर्य व भाव-बोध प्रश्न'})।
4. गद्य खंड पर आधारित 3 प्रश्न (प्रत्येक 3 अंक = 9 अंक) तथा 1 लघु उत्तरीय प्रश्न (2 अंक)।
5. पूरक पाठ्यपुस्तक (${courseId === 'cbse-12-hindi-core' ? 'वितान भाग-2' : 'अंतराल भाग-2'}) से 2 दीर्घ विश्लेषणात्मक प्रश्न (प्रत्येक 5 अंक = 10 अंक, "orOptionText" सहित)।
${baseRules}
Return strictly valid JSON matching the schema.`;

        const res2 = await generateAI({
          provider: settings.provider,
          model: settings.model,
          language: 'hindi',
          prompt: part2Prompt,
          responseMimeType: 'application/json',
          responseSchema: PAPER_BATCH_SCHEMA,
        });
        const parsed2 = parseSafeJson<{ questions: Array<Partial<CbseHindiPaperQuestion>> }>(
          res2.text,
        );
        const batch2 = normalizeQuestions(parsed2.questions || [], batch1.length + 1);
        allQuestions = [...batch1, ...batch2];
      } else {
        // Focused Format Generation (Chapter-Wise, Topic-Wise, Grammar, Reading, Writing, Literature, MCQ)
        setProgressMsg(`CBSE ${activeCourse.courseNameHi} (${paperFormat}) तैयार हो रहा है...`);

        const markRule =
          markOption === 'Official Blueprint Mix'
            ? 'Follow authentic CBSE marking weights strictly for this section (e.g., 1 Mark MCQs, 2 Marks Very Short/Short, 3-4 Marks Short/Supplementary, 5-6 Marks Writing/Long).'
            : markOption === 'MCQ'
              ? 'Generate ONLY 1-mark MCQ questions (marks: 1, questionFormat: "MCQ", 4 distinct Hindi options in "options").'
              : markOption === 'Long Answer'
                ? 'Generate ONLY Long Answer / दीर्घ उत्तरीय or Writing Skill questions carrying 4 to 6 marks with proper word limits.'
                : `Generate questions carrying ${markOption} each matching official CBSE criteria for this section.`;

        const focusContext =
          paperFormat === 'Chapter-Wise Hindi Questions'
            ? `FOCUS STRICTLY ON CHAPTER: "${activeChapterObj?.name}" (${activeChapterObj?.section}). Topics: ${activeChapterObj?.topics.join(', ')}. Do NOT include questions from any other chapter.`
            : paperFormat === 'Topic-Wise Hindi Questions'
              ? `FOCUS STRICTLY ON CHAPTER: "${activeChapterObj?.name}" AND TOPIC: "${selectedTopic}". Generate questions testing this exact topic only.`
              : paperFormat === 'Grammar Practice'
                ? courseId.startsWith('cbse-10')
                  ? `FOCUS ONLY ON व्यावहारिक व्याकरण OF ${activeCourse.courseNameEn}: ${filteredChapters.map((c) => `${c.name} (${c.topics.join(', ')})`).join('; ')}.`
                  : `FOCUS ONLY ON अभिव्यक्ति और माध्यम (जनसंचार, पत्रकारिता व सृजनात्मक लेखन) FOR CLASS 12 ${activeCourse.courseNameEn}.`
                : paperFormat === 'Reading Comprehension Practice'
                  ? `FOCUS ONLY ON अपठित बोध: Generate complete unseen Hindi prose (अपठित गद्यांश) and/or unseen Hindi poetry (अपठित काव्यांश — Note: Course B focuses on अपठित गद्यांश) in "passageOrExtract", followed by comprehension questions testing title, theme, inference, and vocabulary.`
                  : paperFormat === 'Writing Skills Practice'
                    ? `FOCUS ONLY ON रचनात्मक लेखन / लेखन कौशल FOR ${activeCourse.courseNameEn}: ${filteredChapters.map((c) => c.topics.join('; ')).join(' | ')}. Include realistic संकेत-बिंदु and model answer outline + marking rubric (प्रारूप, विषयवस्तु, भाषा) in correctAnswer & markingSchemePoints.`
                    : paperFormat === 'Literature Practice'
                      ? `FOCUS ONLY ON पाठ्यपुस्तक एवं पूरक साहित्य (${activeCourse.prescribedBooks.join(', ')}). Focus chapter/scope: ${activeChapterObj?.name || 'Complete prescribed books'}. Include पठित गद्यांश/काव्यांश, लघु उत्तरीय, दीर्घ उत्तरीय व सप्रसंग व्याख्या।`
                      : `FOCUS ON MCQ PRACTICE TEST across ${activeChapterObj?.name || activeCourse.courseNameHi}. Every item MUST be a 1-mark 4-option Hindi MCQ.`;

        const singlePrompt = `Generate exactly ${safeCount} authentic CBSE Hindi practice questions.
Format: ${paperFormat}
${focusContext}
Marks & Pattern Rule: ${markRule}
${customNotes ? `Additional Instructions: ${customNotes}` : ''}

Allowed Course Chapters Reference:
${chapterListText}
${baseRules}
Return strictly valid JSON matching the schema.`;

        const res = await generateAI({
          provider: settings.provider,
          model: settings.model,
          language: 'hindi',
          prompt: singlePrompt,
          responseMimeType: 'application/json',
          responseSchema: PAPER_BATCH_SCHEMA,
        });

        const parsed = parseSafeJson<{ questions: Array<Partial<CbseHindiPaperQuestion>> }>(
          res.text,
        );
        allQuestions = normalizeQuestions(parsed.questions || [], 1);
      }

      if (allQuestions.length === 0) {
        throw new Error('AI प्रश्न तैयार नहीं कर सका। कृपया पुनः प्रयास करें।');
      }

      const computedMarks = allQuestions.reduce((acc, q) => acc + (q.marks || 0), 0);
      const isFull = paperFormat === 'Full Hindi Question Paper';

      const paperObj: CbseHindiQuestionPaper = {
        title: isFull
          ? `${activeCourse.courseNameHi} — अभ्यास प्रश्न पत्र (${session})`
          : `${activeCourse.courseNameHi} — ${paperFormat}${activeChapterObj && (paperFormat === 'Chapter-Wise Hindi Questions' || paperFormat === 'Topic-Wise Hindi Questions') ? ` (${activeChapterObj.name})` : ''}`,
        academicSession: session,
        classLevel,
        courseId,
        courseLabel: activeCourse.courseNameHi,
        courseCode: activeCourse.courseCode,
        paperFormat,
        prescribedBooks: activeCourse.prescribedBooks,
        totalMarks: computedMarks,
        durationLabel: isFull ? '3 घंटे (3 Hours)' : `${Math.max(20, computedMarks * 2)} मिनट`,
        generalInstructions: isFull
          ? [
              `इस प्रश्न पत्र में निर्धारित पुस्तकें (${activeCourse.prescribedBooks.join(', ')}) एवं CBSE सत्र ${session} के पाठ्यक्रम पर आधारित प्रश्न सम्मिलित हैं।`,
              'सभी प्रश्न अनिवार्य हैं, तथापि कुछ प्रश्नों में आंतरिक विकल्प (अथवा) दिए गए हैं।',
              'यथासंभव प्रत्येक खंड के प्रश्नों के उत्तर क्रमशः, स्पष्ट एवं शुद्ध देवनागरी हिंदी में लिखें।',
              'निर्धारित शब्द-सीमा एवं अंकों का ध्यान रखते हुए उत्तर प्रस्तुत करें।',
            ]
          : [
              `यह ${paperFormat} अभ्यास पत्र CBSE कक्षा ${classLevel} (${activeCourse.courseNameHi}, कोड ${activeCourse.courseCode}) के सत्र ${session} के पाठ्यक्रम पर आधारित है।`,
              'प्रत्येक प्रश्न के सामने उसके निर्धारित अंक एवं शब्द-सीमा अंकित हैं।',
            ],
        questions: allQuestions,
        generatedAt: Date.now(),
      };

      setGeneratedPaper(paperObj);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'प्रश्न पत्र बनाने में समस्या आई। कृपया पुनः प्रयास करें।',
      );
    } finally {
      setGenerating(false);
      setProgressMsg('');
    }
  };

  const formatPaperAsText = (paper: CbseHindiQuestionPaper): string => {
    const header = `${paper.title}\nकक्षा: ${paper.classLevel} | विषय कोड: ${paper.courseCode} | सत्र: ${paper.academicSession} | कुल अंक: ${paper.totalMarks}\nनिर्धारित पुस्तकें: ${paper.prescribedBooks.join(', ')}\n\n`;
    const body = paper.questions
      .map((q) => {
        const pass = q.passageOrExtract ? `\n[पठनीय अंश]:\n${q.passageOrExtract}\n` : '';
        const opts =
          q.options && q.options.length > 0
            ? '\n' +
              q.options
                .map((o, i) => `   (${HINDI_OPTION_LABELS[i] || String.fromCharCode(65 + i)}) ${o}`)
                .join('\n')
            : '';
        const orLine = q.orOptionText ? `\n   अथवा: ${q.orOptionText}` : '';
        return `प्र. ${q.questionNumber} [${q.marks} अंक · ${q.sectionName}]:${pass}${q.questionText}${orLine}${opts}\n   उत्तर: ${q.correctAnswer}\n   व्याख्या: ${q.explanation}`;
      })
      .join('\n\n');
    return header + body;
  };

  const runPdfDownload = async (kind: 'paper' | 'key' | 'worksheet') => {
    if (!generatedPaper) return;
    setPdfBusyKind(kind);
    try {
      if (kind === 'paper') await exportCbseHindiQuestionPaperPdf(generatedPaper);
      else if (kind === 'key') await exportCbseHindiAnswerKeyPdf(generatedPaper);
      else await exportCbseHindiWorksheetPdf(generatedPaper);
    } finally {
      setPdfBusyKind(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Configuration Card */}
      <div className="rounded-2xl border border-orange-200 dark:border-orange-900/60 bg-white dark:bg-slate-900 p-5 md:p-6 space-y-5 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-orange-700 dark:text-orange-400">
              <BookOpen className="w-3.5 h-3.5" />
              <span>CBSE आधिकारिक हिंदी पाठ्यक्रम स्टूडियो</span>
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
              CBSE Class 10 &amp; Class 12 — हिंदी प्रश्न पत्र एवं अभ्यास जनरेटर
            </h2>
          </div>
          <span className="px-3 py-1 rounded-lg bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-800 text-xs font-semibold text-orange-800 dark:text-orange-300">
            कोड: {activeCourse.courseCode} · {activeCourse.theoryMarks} अंक प्रारूप
          </span>
        </div>

        {/* Row 1: Class, Academic Session, Course */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              1. कक्षा चुनें (CBSE Class)
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ['10', 'कक्षा 10 (Class 10)'],
                  ['12', 'कक्षा 12 (Class 12)'],
                ] as const
              ).map(([lvl, label]) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setClassLevel(lvl)}
                  className={`px-3 py-2.5 rounded-xl border text-xs font-bold transition-colors ${
                    classLevel === lvl
                      ? 'bg-orange-600 text-white border-orange-600'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-orange-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              2. शैक्षणिक सत्र (Academic Session)
            </label>
            <select
              value={session}
              onChange={(e) => setSession(e.target.value as CbseHindiSession)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-medium"
            >
              {CBSE_HINDI_SESSIONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              3. हिंदी पाठ्यक्रम (Course — पृथक एवं गैर-मिश्रित)
            </label>
            <div className="grid grid-cols-1 gap-2">
              {availableCourses.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCourseId(c.id)}
                  className={`px-3.5 py-2 rounded-xl border text-left text-xs font-bold flex items-center justify-between transition-colors ${
                    courseId === c.id
                      ? 'bg-orange-50 dark:bg-orange-950/50 border-orange-600 text-orange-900 dark:text-orange-200 ring-1 ring-orange-500'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-orange-400'
                  }`}
                >
                  <span>{c.courseNameHi}</span>
                  <span className="text-[11px] opacity-80">Code {c.courseCode}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Course Isolation & Prescribed Books Info Banner */}
        <div className="p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/25 border border-amber-200 dark:border-amber-900/70 space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-bold text-amber-950 dark:text-amber-200 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
              निर्धारित NCERT पुस्तकें: {activeCourse.prescribedBooks.join(' · ')}
            </span>
            <span className="text-[11px] font-semibold text-amber-800 dark:text-amber-300">
              {classLevel === '10'
                ? 'Course A व Course B पूर्णतः पृथक रखे गए हैं'
                : 'Hindi Core व Hindi Elective पूर्णतः पृथक रखे गए हैं'}
            </span>
          </div>
          <p className="text-xs text-slate-700 dark:text-slate-300">
            {activeCourse.blueprintSummary}
          </p>
        </div>

        {/* Row 2: 8 Paper Formats */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
            4. प्रश्न पत्र प्रारूप चुनें (Question Paper Format — 8 प्रारूप)
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {CBSE_HINDI_PAPER_FORMATS.map((fmt) => {
              const active = paperFormat === fmt.id;
              return (
                <button
                  key={fmt.id}
                  type="button"
                  onClick={() => setPaperFormat(fmt.id)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    active
                      ? 'border-orange-600 bg-orange-600 text-white shadow-xs'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 text-slate-800 dark:text-slate-200 hover:border-orange-400'
                  }`}
                >
                  <div className="text-xs font-bold leading-snug">{fmt.labelHi}</div>
                  <div
                    className={`text-[11px] mt-0.5 ${
                      active ? 'text-orange-100' : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {fmt.labelEn}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Row 3: Chapter / Topic / Marks / Difficulty / Count */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {paperFormat !== 'Full Hindi Question Paper' && (
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                पाठ / खंड चुनें ({activeCourse.courseNameHi} से ही)
              </label>
              <select
                value={activeChapterObj?.name || ''}
                onChange={(e) => {
                  setSelectedChapter(e.target.value);
                  setSelectedTopic('सभी विषय-बिंदु (All Topics)');
                }}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              >
                {filteredChapters.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {paperFormat === 'Topic-Wise Hindi Questions' && activeChapterObj && (
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                विशिष्ट टॉपिक / उप-विषय चुनें
              </label>
              <select
                value={selectedTopic}
                onChange={(e) => setSelectedTopic(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              >
                <option value="सभी विषय-बिंदु (All Topics)">सभी विषय-बिंदु (All Chapter Topics)</option>
                {activeChapterObj.topics.map((tp) => (
                  <option key={tp} value={tp}>
                    {tp}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              अंक एवं प्रश्न प्रकार (CBSE Pattern)
            </label>
            <select
              value={markOption}
              onChange={(e) => setMarkOption(e.target.value as CbseHindiMarkOption)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            >
              {allowedMarks.map((m) => (
                <option key={m} value={m}>
                  {m === 'Official Blueprint Mix'
                    ? 'आधिकारिक CBSE अंक योजना (Blueprint)'
                    : m}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              कठिनाई स्तर (Difficulty)
            </label>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as DifficultyLevel)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            >
              <option value="Easy">सरल (Easy)</option>
              <option value="Medium">मध्यम (Medium)</option>
              <option value="Hard">कठिन / उच्च दक्षता (Hard)</option>
              <option value="Mixed">मिश्रित (Mixed)</option>
            </select>
          </div>

          {paperFormat !== 'Full Hindi Question Paper' && (
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                प्रश्नों की संख्या (2–20)
              </label>
              <input
                type="number"
                min={2}
                max={20}
                value={questionCount}
                onChange={(e) => setQuestionCount(Math.max(2, Math.min(20, Number(e.target.value) || 6)))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm tabular-nums"
              />
            </div>
          )}

          <div className="space-y-1.5 md:col-span-2">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              अतिरिक्त निर्देश (Optional)
            </label>
            <input
              type="text"
              value={customNotes}
              onChange={(e) => setCustomNotes(e.target.value)}
              placeholder="उदा. योग्यता-आधारित प्रश्न जोड़ें, सप्रसंग व्याख्या शामिल करें..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            सभी प्रश्न, विकल्प, निर्देश, उत्तर कुंजी एवं PDF शुद्ध देवनागरी हिंदी फ़ॉन्ट में जनरेट होंगे।
          </div>
          <button
            type="button"
            disabled={generating}
            onClick={() => void handleGenerate()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-sm font-bold shadow-xs"
          >
            {generating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{progressMsg || 'हिंदी प्रश्न पत्र बन रहा है...'}</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>हिंदी प्रश्न पत्र बनाएँ (Generate Hindi Paper)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-sm text-red-700 dark:text-red-300">
          {errorMsg}
        </div>
      )}

      {/* Generated Question Paper View */}
      {generatedPaper && (
        <div className="space-y-5">
          {/* Paper Header & 3 PDF Action Bar */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xs font-bold text-orange-700 dark:text-orange-400">
                  CBSE कक्षा {generatedPaper.classLevel} · {generatedPaper.courseLabel} (कोड{' '}
                  {generatedPaper.courseCode}) · सत्र {generatedPaper.academicSession}
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
                  {generatedPaper.title}
                </h3>
                <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                  निर्धारित पुस्तकें: {generatedPaper.prescribedBooks.join(', ')} · कुल प्रश्न:{' '}
                  <span className="font-bold tabular-nums">{generatedPaper.questions.length}</span> ·
                  अधिकतम अंक: <span className="font-bold tabular-nums">{generatedPaper.totalMarks}</span> ·
                  समय: {generatedPaper.durationLabel}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAnswers((s) => !s)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  {showAnswers ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>{showAnswers ? 'उत्तर कुंजी छिपाएँ' : 'उत्तर कुंजी दिखाएँ'}</span>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(formatPaperAsText(generatedPaper));
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1800);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copied ? 'कॉपी हो गया' : 'कॉपी करें'}</span>
                </button>
              </div>
            </div>

            {/* 3 Official Hindi PDF Download Buttons */}
            <div className="flex flex-wrap gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                disabled={pdfBusyKind !== null}
                onClick={() => void runPdfDownload('paper')}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-xs font-bold"
              >
                {pdfBusyKind === 'paper' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                <span>Download Hindi Question Paper PDF</span>
              </button>

              <button
                type="button"
                disabled={pdfBusyKind !== null}
                onClick={() => void runPdfDownload('key')}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold"
              >
                {pdfBusyKind === 'key' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FileCheck2 className="w-4 h-4" />
                )}
                <span>Download Hindi Answer Key PDF</span>
              </button>

              <button
                type="button"
                disabled={pdfBusyKind !== null}
                onClick={() => void runPdfDownload('worksheet')}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold"
              >
                {pdfBusyKind === 'worksheet' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FileSpreadsheet className="w-4 h-4" />
                )}
                <span>Download Hindi Practice Worksheet</span>
              </button>
            </div>

            {/* General Instructions */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 text-xs space-y-1">
              <div className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <ClipboardList className="w-3.5 h-3.5 text-orange-600" />
                <span>सामान्य निर्देश (General Instructions):</span>
              </div>
              <ul className="list-disc pl-5 space-y-0.5 text-slate-700 dark:text-slate-300">
                {generatedPaper.generalInstructions.map((inst, idx) => (
                  <li key={idx}>{inst}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* Questions List */}
          <div className="space-y-3.5">
            {generatedPaper.questions.map((q, qIdx) => {
              const prevSec = qIdx > 0 ? generatedPaper.questions[qIdx - 1].sectionName : '';
              const showSectionHeader = q.sectionName && q.sectionName !== prevSec;
              const selectedMcqIdx = mcqSelections[q.questionNumber];

              return (
                <React.Fragment key={q.questionNumber}>
                  {showSectionHeader && (
                    <div className="px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-800 text-white text-sm font-bold flex items-center gap-2">
                      <FileText className="w-4 h-4 text-orange-400" />
                      <span>{q.sectionName}</span>
                    </div>
                  )}

                  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-bold text-orange-700 dark:text-orange-400 tabular-nums">
                        प्रश्न {q.questionNumber} · {q.questionCategory} ({q.questionFormat})
                      </span>
                      <span className="px-2.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 font-bold text-slate-700 dark:text-slate-300 tabular-nums">
                        {q.marks} अंक{q.wordLimit ? ` · ${q.wordLimit}` : ''}
                      </span>
                    </div>

                    {q.passageOrExtract && (
                      <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm leading-relaxed text-slate-800 dark:text-slate-200">
                        <MarkdownRenderer content={q.passageOrExtract} />
                      </div>
                    )}

                    <div className="text-base font-semibold text-slate-900 dark:text-white leading-relaxed">
                      <MarkdownRenderer content={q.questionText} />
                    </div>

                    {q.orOptionText && (
                      <div className="p-3 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/60 text-sm text-slate-800 dark:text-slate-200">
                        <span className="font-bold text-amber-800 dark:text-amber-300">अथवा (OR): </span>
                        <MarkdownRenderer content={q.orOptionText} className="inline" />
                      </div>
                    )}

                    {q.options && q.options.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {q.options.map((opt, idx) => {
                          const optLabel = HINDI_OPTION_LABELS[idx] || String.fromCharCode(65 + idx);
                          const isPicked = selectedMcqIdx === idx;
                          const isRightText =
                            q.correctAnswer.trim().toLowerCase() === opt.trim().toLowerCase() ||
                            q.correctAnswer.includes(`(${optLabel})`) ||
                            q.correctAnswer.includes(opt.trim());

                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() =>
                                setMcqSelections((prev) => ({
                                  ...prev,
                                  [q.questionNumber]: idx,
                                }))
                              }
                              className={`p-3 rounded-xl border text-left text-sm flex items-start gap-2 transition-colors ${
                                isPicked
                                  ? showAnswers && isRightText
                                    ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200 font-semibold'
                                    : 'border-orange-600 bg-orange-50 dark:bg-orange-950/30 text-orange-900 dark:text-orange-200 font-semibold'
                                  : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 hover:border-orange-400'
                              }`}
                            >
                              <span className="font-bold shrink-0">({optLabel})</span>
                              <MarkdownRenderer content={opt} className="inline" />
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {showAnswers && (
                      <div className="p-4 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/70 text-sm space-y-2">
                        <div className="font-bold text-emerald-800 dark:text-emerald-300 flex items-start gap-1.5">
                          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                          <div>
                            उत्तर / आदर्श प्रारूप:{' '}
                            <MarkdownRenderer content={q.correctAnswer} className="inline font-medium" />
                          </div>
                        </div>

                        {q.markingSchemePoints && q.markingSchemePoints.length > 0 && (
                          <div className="text-xs text-slate-700 dark:text-slate-300 pl-5">
                            <span className="font-bold">अंक-योजना बिंदु:</span>
                            <ul className="list-disc pl-4 mt-1 space-y-0.5">
                              {q.markingSchemePoints.map((pt, pIdx) => (
                                <li key={pIdx}>{pt}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <div className="text-xs text-slate-700 dark:text-slate-300 pl-5">
                          <span className="font-bold">व्याख्या: </span>
                          <MarkdownRenderer content={q.explanation} className="inline" />
                        </div>
                      </div>
                    )}
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
