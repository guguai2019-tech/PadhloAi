import type {
  ExamDefinition,
  ModuleId,
  PdfNoteMetadata,
  UgcNetPublicCatalogResponse,
  UpscPublicCatalogResponse,
} from '../types';

const FILLER_WORDS = new Set([
  'search',
  'find',
  'show',
  'open',
  'go',
  'to',
  'for',
  'the',
  'of',
  'in',
  'on',
  'with',
  'about',
  'notes',
  'note',
  'pdf',
  'pdfs',
  'study',
  'material',
  'materials',
  'preparation',
  'prep',
  'chapter',
  'chapters',
]);

/**
 * Preserves exact substring search while also matching natural multi-word
 * spoken queries such as "Class 10 Science electricity chapter notes".
 */
export function matchesSearchQuery(haystackRaw: string, queryRaw: string): boolean {
  const q = queryRaw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!q) return true;
  const haystack = haystackRaw.toLowerCase();
  if (haystack.includes(q)) return true;

  const words = q.split(' ').filter((w) => w.length > 0);
  if (words.length <= 1) return false;

  const coreWords = words.filter((w) => !FILLER_WORDS.has(w));
  const tokensToCheck = coreWords.length > 0 ? coreWords : words;
  return tokensToCheck.every((tok) => haystack.includes(tok));
}

export interface AuthorizedSearchMatch {
  id: string;
  title: string;
  subtitle: string;
  moduleId: ModuleId;
  categoryLabel: string;
}

/**
 * Searches strictly across existing authorized in-memory application content
 * (published NCERT/UPSC/Exam PDF notes, published exams & syllabuses, and core modules)
 * without creating any separate search database.
 */
export function searchAuthorizedStudyContent(params: {
  query: string;
  exams: ExamDefinition[];
  pdfNotes: PdfNoteMetadata[];
  ugcNetCatalog: UgcNetPublicCatalogResponse | null;
  upscCatalog: UpscPublicCatalogResponse | null;
}): AuthorizedSearchMatch[] {
  const q = params.query.trim();
  if (!q) return [];

  const results: AuthorizedSearchMatch[] = [];
  const seenIds = new Set<string>();
  const add = (item: AuthorizedSearchMatch) => {
    if (seenIds.has(item.id)) return;
    seenIds.add(item.id);
    results.push(item);
  };

  // 1. Authorized & Published PDF Notes (NCERT Class 6-12, UPSC Notes, Exam PDF Notes)
  for (const note of params.pdfNotes) {
    if (!note.published) continue;
    const hay = `${note.title} ${note.description} ${note.examName} ${note.classLabel} ${note.ncertClass || ''} ${note.subject} ${note.bookName || ''} ${note.upscStage || ''} ${note.upscPaper || ''} ${note.chapter} ${note.topic} ${note.noteCategory || 'exam'}`;
    if (matchesSearchQuery(hay, q)) {
      const catLabel =
        note.noteCategory === 'ncert'
          ? `NCERT Notes · ${note.ncertClass || note.classLabel}`
          : note.noteCategory === 'upsc'
            ? `UPSC Notes · ${note.upscPaper || note.classLabel}`
            : `PDF Notes · ${note.examName}`;
      add({
        id: `pdf-${note.id}`,
        title: note.title,
        subtitle: `${note.subject}${note.bookName ? ` · ${note.bookName}` : ''} · ${note.chapter}`,
        moduleId: 'pdf-notes',
        categoryLabel: catLabel,
      });
    }
  }

  // 2. Published UPSC Syllabuses (Prelims & Mains)
  if (params.upscCatalog) {
    const allUpsc = [...params.upscCatalog.prelims, ...params.upscCatalog.mains];
    for (const paper of allUpsc) {
      const areaTitles = paper.areas.map((a) => `${a.title} ${a.topics.map((t) => t.title).join(' ')}`).join(' ');
      const hay = `UPSC Civil Services Preparation ${paper.stage} ${paper.paperLabel} ${paper.subjectName} ${paper.optionalSubjectName || ''} ${areaTitles}`;
      if (matchesSearchQuery(hay, q)) {
        add({
          id: `upsc-${paper.syllabusVersionId}`,
          title: `UPSC ${paper.paperLabel}`,
          subtitle: `${paper.versionLabel} · ${paper.areaCount} Areas · ${paper.topicCount} Topics`,
          moduleId: 'upsc',
          categoryLabel: 'UPSC Preparation',
        });
      }
    }
  }

  // 3. Published UGC NET Catalog
  if (params.ugcNetCatalog) {
    const ugcList = [
      ...(params.ugcNetCatalog.paper1 ? [params.ugcNetCatalog.paper1] : []),
      ...params.ugcNetCatalog.paper2Subjects,
    ];
    for (const rec of ugcList) {
      const unitsText = rec.units.map((u) => `${u.title} ${u.topics.map((t) => t.title).join(' ')}`).join(' ');
      const subjCode = 'subjectCode' in rec ? rec.subjectCode || '' : '';
      const hay = `UGC NET JRF ${rec.paperType} ${rec.paperLabel} ${rec.subjectName} ${rec.subjectId} ${subjCode} ${unitsText}`;
      if (matchesSearchQuery(hay, q)) {
        add({
          id: `ugc-${rec.syllabusVersionId}`,
          title: `UGC NET · ${rec.subjectName}`,
          subtitle: `${rec.versionLabel} · ${rec.unitCount} Units`,
          moduleId: 'questions',
          categoryLabel: 'UGC NET / JRF',
        });
      }
    }
  }

  // 4. Published Exams, Classes, Subjects, Chapters & Topics (CBSE 10/12, BSE, CHSE Odisha, Competitive)
  for (const ex of params.exams) {
    for (const cls of ex.classesOrPapers) {
      const subjSummaries = cls.subjects
        .map((s) => `${s.name} ${s.chapters.map((c) => `${c.name} ${c.topics.join(' ')}`).join(' ')}`)
        .join(' ');
      const hay = `${ex.name} ${ex.category} ${cls.label} ${subjSummaries}`;
      if (matchesSearchQuery(hay, q)) {
        add({
          id: `exam-${ex.id}-${cls.id}`,
          title: `${ex.name} — ${cls.label}`,
          subtitle: `${cls.subjects.length} Subjects · View Syllabus & Practice`,
          moduleId: 'syllabus',
          categoryLabel: 'Syllabus & Study Materials',
        });
      }
    }
  }

  // 5. Core Authorized Modules (Mock Test, Question Generation, PDF Notes, NCERT Notes, UPSC Preparation)
  const coreEntries: AuthorizedSearchMatch[] = [
    {
      id: 'mod-ncert',
      title: 'NCERT Notes (Class 6–12)',
      subtitle: 'Search & read Class 6–12 NCERT textbooks & chapter PDFs',
      moduleId: 'pdf-notes',
      categoryLabel: 'NCERT Notes',
    },
    {
      id: 'mod-upsc',
      title: 'UPSC Preparation Hub',
      subtitle: 'Prelims GS/CSAT, Mains Answer Writing AI & Study Strategy',
      moduleId: 'upsc',
      categoryLabel: 'UPSC Preparation',
    },
    {
      id: 'mod-mock',
      title: 'Mock Test Center',
      subtitle: 'CBSE 10 & 12, CHSE Odisha, BSE, UGC NET & UPSC Prelims Mock Tests',
      moduleId: 'mock-test',
      categoryLabel: 'Mock Test',
    },
    {
      id: 'mod-questions',
      title: 'Question Generation Studio',
      subtitle: 'Generate 16 exam paper formats, CBSE, UGC NET & UPSC questions',
      moduleId: 'questions',
      categoryLabel: 'Question Generation',
    },
    {
      id: 'mod-pdf-notes',
      title: 'PDF Notes & Study Materials',
      subtitle: 'Online protected PDF library for Boards, NCERT & UPSC',
      moduleId: 'pdf-notes',
      categoryLabel: 'PDF Notes',
    },
    {
      id: 'mod-lesson-plan',
      title: 'AI Lesson Plan Generator',
      subtitle: 'Generate syllabus-based lesson plans in English, Hindi and Odia.',
      moduleId: 'lesson-plan',
      categoryLabel: 'Teacher & Study Tools',
    },
  ];

  for (const entry of coreEntries) {
    if (matchesSearchQuery(`${entry.title} ${entry.subtitle} ${entry.categoryLabel}`, q)) {
      add(entry);
    }
  }

  return results.slice(0, 8);
}
