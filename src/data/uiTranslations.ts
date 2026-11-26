import type { LanguageMode, ModuleId } from '../types';

export type UiLang = 'english' | 'odia';

export function resolveUiLang(lang: LanguageMode): UiLang {
  return lang === 'odia' ? 'odia' : 'english';
}

export const NAV_LABELS: Record<UiLang, Record<ModuleId, string>> = {
  english: {
    chat: 'AI Assistant',
    syllabus: 'Syllabus',
    pdf: 'PDF Tools',
    'mock-test': 'Mock Tests',
    questions: 'Question Generator',
    'pdf-notes': 'PDF Notes',
    upsc: 'UPSC CSE',
    'lesson-plan': 'AI Lesson Plan Generator',
    'video-generator': 'AI Video Generator',
    'my-videos': 'My Generated Videos',
    notes: 'Notes Maker',
    image: 'Image Assistant',
    writing: 'Writing Tools',
    math: 'Math Solver',
    coding: 'Coding Assistant',
    planner: 'Study Planner',
    history: 'Chat History',
    settings: 'Settings',
    admin: 'Admin Panel',
  },
  odia: {
    chat: 'AI ସହାୟକ',
    syllabus: 'ପାଠ୍ୟକ୍ରମ (Syllabus)',
    pdf: 'PDF ଟୁଲ୍ସ',
    'mock-test': 'ମକ୍ ଟେଷ୍ଟ',
    questions: 'ପ୍ରଶ୍ନ ପ୍ରସ୍ତୁତକର୍ତ୍ତା',
    'pdf-notes': 'PDF ନୋଟ୍ସ',
    upsc: 'UPSC CSE (ସିଭିଲ୍ ସର୍ଭିସ୍)',
    'lesson-plan': 'AI ପାଠ ଯୋଜନା ପ୍ରସ୍ତୁତକର୍ତ୍ତା',
    'video-generator': 'AI ଭିଡିଓ ଜେନେରେଟର',
    'my-videos': 'ମୋର ଭିଡିଓଗୁଡ଼ିକ',
    notes: 'ନୋଟ୍ସ ମେକର୍',
    image: 'ଚିତ୍ର ସହାୟକ',
    writing: 'ଲେଖନ ଟୁଲ୍ସ',
    math: 'ଗଣିତ ସମାଧାନ',
    coding: 'କୋଡିଂ ସହାୟକ',
    planner: 'ଅଧ୍ୟୟନ ଯୋଜନା',
    history: 'ଚାଟ୍ ଇତିହାସ',
    settings: 'ସେଟିଂସ୍',
    admin: 'ଆଡମିନ୍ ପ୍ୟାନେଲ୍',
  },
};

export const APP_CHROME_TEXT: Record<
  UiLang,
  {
    newChat: string;
    searchChats: string;
    recentChats: string;
    openMenu: string;
    closeSidebar: string;
    languageLabel: string;
    englishBtn: string;
    odiaBtn: string;
  }
> = {
  english: {
    newChat: 'New Chat',
    searchChats: 'Search chats...',
    recentChats: 'Recent Chats',
    openMenu: 'Open navigation menu',
    closeSidebar: 'Close sidebar',
    languageLabel: 'Language',
    englishBtn: 'English',
    odiaBtn: 'ଓଡ଼ିଆ',
  },
  odia: {
    newChat: 'ନୂତନ ଚାଟ୍',
    searchChats: 'ଚାଟ୍ ଖୋଜନ୍ତୁ...',
    recentChats: 'ସାମ୍ପ୍ରତିକ ଚାଟ୍',
    openMenu: 'ମେନୁ ଖୋଲନ୍ତୁ',
    closeSidebar: 'ସାଇଡବାର୍ ବନ୍ଦ କରନ୍ତୁ',
    languageLabel: 'ଭାଷା',
    englishBtn: 'English',
    odiaBtn: 'ଓଡ଼ିଆ',
  },
};

export const SYLLABUS_UI_TEXT: Record<
  UiLang,
  {
    pageTitle: string;
    pageSubtitle: string;
    uploadUpdateBtn: string;
    uploadedSectionTitle: string;
    uploadedSectionHint: string;
    noUploadedPdfs: string;
    viewOfficialPdf: string;
    boardLabel: string;
    classLabel: string;
    subjectsHeading: string;
    chaptersCountWord: string;
    topicsCountWord: string;
    chaptersHeading: string;
    allTopicsHint: string;
    practiceChapterBtn: string;
    excludedNote: string;
    prescribedBooksLabel: string;
    backToTopics: string;
    topicScreenBadge: string;
    aiPracticeLabel: string;
    selectCountLabel: string;
    questionsSuffix: string;
    startTestBtn: string;
    downloadPdfBtn: string;
    generatingProgress: string;
    languagePreservedNote: string;
    questionWord: string;
    ofWord: string;
    previousBtn: string;
    nextBtn: string;
    submitTestBtn: string;
    questionNavTitle: string;
    answeredLegend: string;
    unansweredLegend: string;
    confirmModalTitle: string;
    confirmModalBody: string;
    confirmSubmitBtn: string;
    cancelBtn: string;
    resultHeading: string;
    totalMarksLabel: string;
    percentageLabel: string;
    correctLabel: string;
    incorrectLabel: string;
    unattemptedLabel: string;
    retakeTestBtn: string;
    reviewAnswersTitle: string;
    yourAnswerLabel: string;
    correctAnswerLabel: string;
    explanationLabel: string;
    pdfModalTitle: string;
    pdfModalDesc: string;
    pdfCountLabel: string;
    pdfLangLabel: string;
    pdfAnswerKeyLabel: string;
    pdfIncludeKeyYes: string;
    pdfIncludeKeyNo: string;
    pdfDownloadNowBtn: string;
    pdfGeneratingBtn: string;
    useUploadedBtn: string;
    activeUploadedBadge: string;
    openInMockTest: string;
  }
> = {
  english: {
    pageTitle: 'Interactive Syllabus & Topic Practice',
    pageSubtitle:
      'Browse your existing uploaded syllabus, click any subject and topic to practice topic-only AI mock tests, or download printable A4 PDFs.',
    uploadUpdateBtn: 'Upload / Update Syllabus',
    uploadedSectionTitle: 'Uploaded Syllabus Documents',
    uploadedSectionHint:
      'Syllabus PDFs or custom chapters uploaded here update your syllabus immediately across Syllabus Explorer and Mock Tests.',
    noUploadedPdfs:
      'No extra syllabus PDFs uploaded yet. Use "Upload / Update Syllabus" to add or update any board/subject PDF.',
    viewOfficialPdf: 'View Official Class 10 PDF',
    boardLabel: 'Board / Examination',
    classLabel: 'Class / Paper',
    subjectsHeading: 'Subjects in Existing Syllabus',
    chaptersCountWord: 'Chapters',
    topicsCountWord: 'Topics',
    chaptersHeading: 'Chapters & Clickable Topics',
    allTopicsHint:
      'Click any topic card below to open its dedicated practice screen and PDF generator.',
    practiceChapterBtn: 'Practice Full Chapter',
    excludedNote: 'Excluded from Exam Questions (per official syllabus)',
    prescribedBooksLabel: 'Prescribed Textbooks',
    backToTopics: 'Back to Topics',
    topicScreenBadge: 'Topic-Focused Study & Practice',
    aiPracticeLabel:
      'AI-Generated Practice Questions · Strictly focused on this selected topic (not official previous-year papers)',
    selectCountLabel: 'Number of Questions',
    questionsSuffix: 'Questions',
    startTestBtn: 'Start Test',
    downloadPdfBtn: 'Download Questions PDF',
    generatingProgress: 'Generating topic-specific AI practice questions...',
    languagePreservedNote:
      'Language subject content & reading passages remain in original language; instructions and explanations follow your selected language.',
    questionWord: 'Question',
    ofWord: 'of',
    previousBtn: 'Previous',
    nextBtn: 'Next',
    submitTestBtn: 'Submit Test',
    questionNavTitle: 'Question Navigation',
    answeredLegend: 'Answered',
    unansweredLegend: 'Not Answered',
    confirmModalTitle: 'Submit Topic Mock Test?',
    confirmModalBody:
      'Please confirm before submitting your test. Once submitted, your score and detailed explanations will be displayed.',
    confirmSubmitBtn: 'Yes, Submit Test',
    cancelBtn: 'Cancel',
    resultHeading: 'Topic Mock Test Result',
    totalMarksLabel: 'Total Marks',
    percentageLabel: 'Percentage',
    correctLabel: 'Correct',
    incorrectLabel: 'Incorrect',
    unattemptedLabel: 'Unattempted',
    retakeTestBtn: 'Retake Test',
    reviewAnswersTitle: 'Answer Key & Detailed Explanations',
    yourAnswerLabel: 'Your Answer',
    correctAnswerLabel: 'Correct Answer',
    explanationLabel: 'Explanation',
    pdfModalTitle: 'Download Questions PDF',
    pdfModalDesc:
      'Generate and download an A4 printable question paper strictly for the selected topic.',
    pdfCountLabel: 'Question Count',
    pdfLangLabel: 'PDF Language',
    pdfAnswerKeyLabel: 'Answer Key Option',
    pdfIncludeKeyYes: 'Include Answer Key & Explanations at End',
    pdfIncludeKeyNo: 'Questions Only (No Answer Key)',
    pdfDownloadNowBtn: 'Download A4 PDF',
    pdfGeneratingBtn: 'Preparing A4 PDF...',
    useUploadedBtn: 'Select as Active Reference',
    activeUploadedBadge: 'Active Reference',
    openInMockTest: 'Full Mock Test Center',
  },
  odia: {
    pageTitle: 'ପାଠ୍ୟକ୍ରମ ଏବଂ ବିଷୟ-ଭିତ୍ତିକ ଅଭ୍ୟାସ',
    pageSubtitle:
      'ଆପଣଙ୍କ ଅପଲୋଡ୍ ହୋଇଥିବା ପାଠ୍ୟକ୍ରମ ଦେଖନ୍ତୁ, ଯେକୌଣସି ବିଷୟ ଓ ଟପିକ୍ ଉପରେ କ୍ଲିକ୍ କରି ମକ୍ ଟେଷ୍ଟ ଦିଅନ୍ତୁ କିମ୍ବା A4 PDF ଡାଉନଲୋଡ୍ କରନ୍ତୁ ।',
    uploadUpdateBtn: 'ପାଠ୍ୟକ୍ରମ ଅପଲୋଡ୍ / ଅପଡେଟ୍ କରନ୍ତୁ',
    uploadedSectionTitle: 'ଅପଲୋଡ୍ ହୋଇଥିବା ପାଠ୍ୟକ୍ରମ PDF',
    uploadedSectionHint:
      'ଏଠାରେ ଅପଲୋଡ୍ କରାଯାଇଥିବା PDF ଏବଂ ଅଧ୍ୟାୟଗୁଡ଼ିକ ପାଠ୍ୟକ୍ରମ ଓ ମକ୍ ଟେଷ୍ଟରେ ତୁରନ୍ତ ଅପଡେଟ୍ ହେବ ।',
    noUploadedPdfs:
      'ଏପର୍ଯ୍ୟନ୍ତ କୌଣସି ଅତିରିକ୍ତ PDF ଅପଲୋଡ୍ ହୋଇନାହିଁ । ନୂତନ ପାଠ୍ୟକ୍ରମ ଯୋଡ଼ିବାକୁ "ପାଠ୍ୟକ୍ରମ ଅପଲୋଡ୍ / ଅପଡେଟ୍ କରନ୍ତୁ" ବ୍ୟବହାର କରନ୍ତୁ ।',
    viewOfficialPdf: 'ସରକାରୀ ଦଶମ ଶ୍ରେଣୀ PDF ଦେଖନ୍ତୁ',
    boardLabel: 'ବୋର୍ଡ / ପରୀକ୍ଷା',
    classLabel: 'ଶ୍ରେଣୀ / ପେପର୍',
    subjectsHeading: 'ପାଠ୍ୟକ୍ରମର ବିଷୟ ସମୂହ',
    chaptersCountWord: 'ଅଧ୍ୟାୟ',
    topicsCountWord: 'ଟପିକ୍',
    chaptersHeading: 'ଅଧ୍ୟାୟ ଓ କ୍ଲିକ୍ ଯୋଗ୍ୟ ଟପିକ୍',
    allTopicsHint:
      'ଅଭ୍ୟାସ କରିବା କିମ୍ବା PDF ଡାଉନଲୋଡ୍ କରିବା ପାଇଁ ଯେକୌଣସି ଟପିକ୍ ଉପରେ କ୍ଲିକ୍ କରନ୍ତୁ ।',
    practiceChapterBtn: 'ସମ୍ପୂର୍ଣ୍ଣ ଅଧ୍ୟାୟ ଅଭ୍ୟାସ',
    excludedNote: 'ପରୀକ୍ଷା ପ୍ରଶ୍ନରୁ ବାଦ୍ (ସରକାରୀ ପାଠ୍ୟକ୍ରମ ଅନୁଯାୟୀ)',
    prescribedBooksLabel: 'ନିର୍ଦ୍ଧାରିତ ପାଠ୍ୟପୁସ୍ତକ',
    backToTopics: 'ଟପିକ୍ ତାଲିକାକୁ ଫେରନ୍ତୁ',
    topicScreenBadge: 'ଟପିକ୍-ଭିତ୍ତିକ ଅଧ୍ୟୟନ ଓ ଅଭ୍ୟାସ',
    aiPracticeLabel:
      'AI-ପ୍ରସ୍ତୁତ ଅଭ୍ୟାସ ପ୍ରଶ୍ନ (AI-Generated Practice Questions) · କେବଳ ମନୋନୀତ ଟପିକ୍ ଉପରେ ଆଧାରିତ (ସରକାରୀ ପୂର୍ବ ବର୍ଷ ପ୍ରଶ୍ନପତ୍ର ନୁହେଁ)',
    selectCountLabel: 'ପ୍ରଶ୍ନ ସଂଖ୍ୟା ବାଛନ୍ତୁ',
    questionsSuffix: 'ପ୍ରଶ୍ନ',
    startTestBtn: 'ଟେଷ୍ଟ ଆରମ୍ଭ କରନ୍ତୁ',
    downloadPdfBtn: 'Download Questions PDF (PDF ଡାଉନଲୋଡ୍)',
    generatingProgress: 'ମନୋନୀତ ଟପିକ୍ ପାଇଁ AI ଅଭ୍ୟାସ ପ୍ରଶ୍ନ ପ୍ରସ୍ତୁତ ହେଉଛି...',
    languagePreservedNote:
      'ଭାଷା ବିଷୟର ପାଠ୍ୟାଂଶ ଓ ଗଦ୍ୟାଂଶ ମୂଳ ଭାଷାରେ ରହିବ; ନିର୍ଦ୍ଦେଶ ଓ ବ୍ୟାଖ୍ୟା ଆପଣ ବାଛିଥିବା ଭାଷାରେ ଦିଆଯିବ ।',
    questionWord: 'ପ୍ରଶ୍ନ',
    ofWord: 'ମଧ୍ୟରୁ',
    previousBtn: 'ପୂର୍ବବର୍ତ୍ତୀ',
    nextBtn: 'ପରବର୍ତ୍ତୀ',
    submitTestBtn: 'ଟେଷ୍ଟ ଦାଖଲ କରନ୍ତୁ',
    questionNavTitle: 'ପ୍ରଶ୍ନ ନମ୍ବର ନାଭିଗେସନ୍',
    answeredLegend: 'ଉତ୍ତର ଦିଆଯାଇଛି',
    unansweredLegend: 'ଉତ୍ତର ଦିଆଯାଇନାହିଁ',
    confirmModalTitle: 'ଟେଷ୍ଟ ଦାଖଲ କରିବେ କି?',
    confirmModalBody:
      'ଟେଷ୍ଟ ଦାଖଲ କରିବା ପୂର୍ବରୁ ନିଶ୍ଚିତ କରନ୍ତୁ । ଦାଖଲ କଲା ପରେ ଆପଣଙ୍କ ନମ୍ବର, ଶତକଡ଼ା ଓ ସବିଶେଷ ବ୍ୟାଖ୍ୟା ଦେଖାଯିବ ।',
    confirmSubmitBtn: 'ହଁ, ଦାଖଲ କରନ୍ତୁ',
    cancelBtn: 'ବାତିଲ କରନ୍ତୁ',
    resultHeading: 'ଟପିକ୍ ମକ୍ ଟେଷ୍ଟ ଫଳାଫଳ',
    totalMarksLabel: 'ମୋଟ ନମ୍ବର',
    percentageLabel: 'ଶତକଡ଼ା',
    correctLabel: 'ସଠିକ୍ ଉତ୍ତର',
    incorrectLabel: 'ଭୁଲ ଉତ୍ତର',
    unattemptedLabel: 'ଛାଡ଼ିଥିବା ପ୍ରଶ୍ନ',
    retakeTestBtn: 'ପୁନଃ ଟେଷ୍ଟ ଦିଅନ୍ତୁ',
    reviewAnswersTitle: 'ସଠିକ୍ ଉତ୍ତର ଓ ସବିଶେଷ ବ୍ୟାଖ୍ୟା',
    yourAnswerLabel: 'ଆପଣଙ୍କ ଉତ୍ତର',
    correctAnswerLabel: 'ସଠିକ୍ ଉତ୍ତର',
    explanationLabel: 'ବ୍ୟାଖ୍ୟା',
    pdfModalTitle: 'ପ୍ରଶ୍ନ PDF ଡାଉନଲୋଡ୍ କରନ୍ତୁ',
    pdfModalDesc:
      'କେବଳ ମନୋନୀତ ଟପିକ୍ ପାଇଁ A4 ପ୍ରିଣ୍ଟେବଲ୍ ପ୍ରଶ୍ନପତ୍ର PDF ଡାଉନଲୋଡ୍ କରନ୍ତୁ ।',
    pdfCountLabel: 'ପ୍ରଶ୍ନ ସଂଖ୍ୟା',
    pdfLangLabel: 'PDF ଭାଷା',
    pdfAnswerKeyLabel: 'ଉତ୍ତର ସୂଚୀ (Answer Key)',
    pdfIncludeKeyYes: 'ଶେଷରେ ଉତ୍ତର ସୂଚୀ ଓ ବ୍ୟାଖ୍ୟା ସାମିଲ କରନ୍ତୁ',
    pdfIncludeKeyNo: 'କେବଳ ପ୍ରଶ୍ନ (ଉତ୍ତର ସୂଚୀ ବିନା)',
    pdfDownloadNowBtn: 'A4 PDF ଡାଉନଲୋଡ୍ କରନ୍ତୁ',
    pdfGeneratingBtn: 'A4 PDF ପ୍ରସ୍ତୁତ ହେଉଛି...',
    useUploadedBtn: 'ସକ୍ରିୟ ରେଫରେନ୍ସ ଭାବେ ବାଛନ୍ତୁ',
    activeUploadedBadge: 'ସକ୍ରିୟ ରେଫରେନ୍ସ',
    openInMockTest: 'ସମ୍ପୂର୍ଣ୍ଣ ମକ୍ ଟେଷ୍ଟ କେନ୍ଦ୍ର',
  },
};
