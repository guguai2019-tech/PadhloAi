import type { ExamCategoryId, ExamDefinition, MockLanguage } from '../types';
import {
  BSE_ODISHA_2025_26_SUBJECTS,
  BSE_ODISHA_SYLLABUS_PDF_NAME,
  BSE_ODISHA_SYLLABUS_PDF_URL,
} from './bseOdishaClass10Syllabus';
import { buildCbseHindiCatalogSubjects } from './cbseHindiSyllabus';
import {
  CHSE_ARTS_PDF_NAME,
  CHSE_ARTS_PDF_URL,
  CHSE_ODISHA_ARTS_1ST_YEAR_SUBJECTS,
  CHSE_ODISHA_ARTS_2ND_YEAR_SUBJECTS,
  CHSE_ODISHA_SCIENCE_1ST_YEAR_SUBJECTS,
  CHSE_ODISHA_SCIENCE_2ND_YEAR_SUBJECTS,
  CHSE_SCIENCE_PDF_NAME,
  CHSE_SCIENCE_PDF_URL,
} from './chseOdishaSyllabus';

export interface CategoryMeta {
  id: ExamCategoryId;
  title: string;
  subtitle: string;
  accentName: 'purple' | 'blue' | 'teal' | 'orange' | 'pink';
  cardClasses: string;
  badgeClasses: string;
  buttonClasses: string;
}

export const EXAM_CATEGORIES: CategoryMeta[] = [
  {
    id: 'odisha-board',
    title: 'Odisha Board (BSE & CHSE Odisha)',
    subtitle: 'BSE Class 10 & CHSE +2 Arts / Science · Odia & English Medium · Chapter, Subject & Full Tests',
    accentName: 'purple',
    cardClasses:
      'border-purple-200 dark:border-purple-900/70 bg-purple-50/60 dark:bg-purple-950/25 hover:border-purple-500',
    badgeClasses: 'text-purple-700 dark:text-purple-300',
    buttonClasses: 'bg-purple-600 hover:bg-purple-700 text-white',
  },
  {
    id: 'cbse',
    title: 'CBSE Board',
    subtitle: 'Class 10 & Class 12 · Science, Commerce, Humanities, CS · Chapter & Full Tests',
    accentName: 'blue',
    cardClasses:
      'border-blue-200 dark:border-blue-900/70 bg-blue-50/60 dark:bg-blue-950/25 hover:border-blue-500',
    badgeClasses: 'text-blue-700 dark:text-blue-300',
    buttonClasses: 'bg-blue-600 hover:bg-blue-700 text-white',
  },
  {
    id: 'ugc-net',
    title: 'UGC NET / JRF',
    subtitle: 'Admin-Published Paper 1 & Paper 2 Syllabuses · Unit, Topic & Mixed Mock Tests',
    accentName: 'blue',
    cardClasses:
      'border-indigo-200 dark:border-indigo-900/70 bg-gradient-to-br from-indigo-50/80 via-white to-cyan-50/50 dark:from-indigo-950/35 dark:via-slate-900 dark:to-blue-950/25 hover:border-[#4338CA]',
    badgeClasses: 'text-[#4338CA] dark:text-indigo-300',
    buttonClasses: 'bg-gradient-to-r from-[#4338CA] to-[#2563EB] hover:from-[#3730A3] hover:to-[#1D4ED8] text-white',
  },
  {
    id: 'upsc',
    title: 'UPSC (Civil Services)',
    subtitle: 'Admin-Published Prelims (GS I & CSAT) & Mains (Essay, GS I–IV, Optional) Preparation',
    accentName: 'blue',
    cardClasses:
      'border-indigo-200 dark:border-indigo-900/70 bg-gradient-to-br from-indigo-50/80 via-white to-cyan-50/60 dark:from-indigo-950/35 dark:via-slate-900 dark:to-cyan-950/20 hover:border-[#4338CA]',
    badgeClasses: 'text-[#4338CA] dark:text-cyan-300',
    buttonClasses: 'bg-gradient-to-r from-[#4338CA] to-[#2563EB] hover:from-[#3730A3] hover:to-[#1D4ED8] text-white',
  },
  {
    id: 'competitive',
    title: 'Odisha & Competitive Exams',
    subtitle: 'OPSC, OSSC, OSSSC, OPSC ASO, Odisha Police, CT / OSSTET & Custom Exams',
    accentName: 'orange',
    cardClasses:
      'border-orange-200 dark:border-orange-900/70 bg-orange-50/60 dark:bg-orange-950/25 hover:border-orange-500',
    badgeClasses: 'text-orange-700 dark:text-orange-300',
    buttonClasses: 'bg-orange-600 hover:bg-orange-700 text-white',
  },
  {
    id: 'combined',
    title: 'COMBINED EXAM MOCK TEST',
    subtitle: 'Practice up to 25 subjects together with custom questions per subject',
    accentName: 'pink',
    cardClasses:
      'border-pink-200 dark:border-pink-900/70 bg-pink-50/60 dark:bg-pink-950/25 hover:border-pink-500',
    badgeClasses: 'text-pink-700 dark:text-pink-300',
    buttonClasses: 'bg-pink-600 hover:bg-pink-700 text-white',
  },
];

export const COMBINED_EXAM_SUBJECTS: string[] = [
  'Mathematics',
  'Reasoning',
  'General English',
  'General Knowledge',
  'History',
  'Geography',
  'Indian Polity',
  'Indian Constitution',
  'Civics',
  'Current Affairs',
  'Finance',
  'Economics',
  'Computer Knowledge',
  'Computer Fundamentals',
  'Odia Language',
  'Hindi Language',
  'General Science',
  'Physics',
  'Chemistry',
  'Biology',
  'Child Development and Pedagogy (CDP)',
  'Teaching Aptitude',
  'Research Aptitude',
  'Environmental Studies',
  'Odisha General Knowledge',
];

export const BUILTIN_EXAMS: ExamDefinition[] = [
  // A. ODISHA BOARD (BSE ODISHA & CHSE ODISHA)
  {
    id: 'bse-odisha',
    category: 'odisha-board',
    name: 'BSE Odisha Board (HSC Class 10 · 2025-26)',
    shortDesc: 'Board of Secondary Education, Odisha — Official 2025-26 Class X Syllabus (16 Subjects, Term I & Term II)',
    defaultMarksPerQuestion: 1,
    defaultNegativeMarking: false,
    defaultNegativePenalty: 0,
    officialSyllabusPdfUrl: BSE_ODISHA_SYLLABUS_PDF_URL,
    officialSyllabusPdfName: BSE_ODISHA_SYLLABUS_PDF_NAME,
    classesOrPapers: [
      {
        id: 'bse-class-10',
        label: 'Class 10 (Matriculation 2025-26)',
        mediums: ['Odia Medium', 'English Medium'],
        subjects: BSE_ODISHA_2025_26_SUBJECTS,
      },
    ],
  },
  {
    id: 'chse-odisha-science',
    category: 'odisha-board',
    name: 'CHSE Odisha +2 Science',
    shortDesc: 'Council of Higher Secondary Education, Odisha — +2 Science (Class 11 & 12 · Official Syllabus PDF)',
    defaultMarksPerQuestion: 1,
    defaultNegativeMarking: false,
    defaultNegativePenalty: 0,
    officialSyllabusPdfUrl: CHSE_SCIENCE_PDF_URL,
    officialSyllabusPdfName: CHSE_SCIENCE_PDF_NAME,
    classesOrPapers: [
      {
        id: 'chse-science-2nd',
        label: '+2 Science 2nd Year (Class 12)',
        mediums: ['English Medium', 'Odia Medium'],
        subjects: CHSE_ODISHA_SCIENCE_2ND_YEAR_SUBJECTS,
      },
      {
        id: 'chse-science-1st',
        label: '+2 Science 1st Year (Class 11)',
        mediums: ['English Medium', 'Odia Medium'],
        subjects: CHSE_ODISHA_SCIENCE_1ST_YEAR_SUBJECTS,
      },
    ],
  },
  {
    id: 'chse-odisha-arts',
    category: 'odisha-board',
    name: 'CHSE Odisha +2 Arts',
    shortDesc: 'Council of Higher Secondary Education, Odisha — +2 Arts (Class 11 & 12 · Official Syllabus PDF)',
    defaultMarksPerQuestion: 1,
    defaultNegativeMarking: false,
    defaultNegativePenalty: 0,
    officialSyllabusPdfUrl: CHSE_ARTS_PDF_URL,
    officialSyllabusPdfName: CHSE_ARTS_PDF_NAME,
    classesOrPapers: [
      {
        id: 'chse-arts-2nd',
        label: '+2 Arts 2nd Year (Class 12)',
        mediums: ['Odia Medium', 'English Medium'],
        subjects: CHSE_ODISHA_ARTS_2ND_YEAR_SUBJECTS,
      },
      {
        id: 'chse-arts-1st',
        label: '+2 Arts 1st Year (Class 11)',
        mediums: ['Odia Medium', 'English Medium'],
        subjects: CHSE_ODISHA_ARTS_1ST_YEAR_SUBJECTS,
      },
    ],
  },

  // B. CBSE BOARD
  {
    id: 'cbse-board',
    category: 'cbse',
    name: 'CBSE Board (NCERT Pattern)',
    shortDesc: 'Central Board of Secondary Education — Class 10 & Class 12 (English & Hindi Medium)',
    defaultMarksPerQuestion: 1,
    defaultNegativeMarking: false,
    defaultNegativePenalty: 0,
    classesOrPapers: [
      {
        id: 'cbse-class-10',
        label: 'Class 10 (Secondary)',
        mediums: ['English Medium', 'Hindi Medium'],
        subjects: [
          {
            name: 'Mathematics',
            code: '041 / 241',
            prescribedBooks: ['NCERT Mathematics Class X', 'NCERT Exemplar'],
            chapters: [
              { name: 'Real Numbers', topics: ['Fundamental Theorem of Arithmetic', 'Irrational Numbers'] },
              { name: 'Polynomials & Pair of Linear Equations', topics: ['Zeroes of Polynomial', 'Algebraic & Graphical Solutions'] },
              { name: 'Quadratic Equations & Arithmetic Progressions', topics: ['Quadratic Formula', 'AP nth Term & Sum'] },
              { name: 'Triangles & Coordinate Geometry', topics: ['BPT / Similarity', 'Distance & Section Formula'] },
              { name: 'Introduction to Trigonometry & Applications', topics: ['Trigonometric Identities', 'Heights & Distances'] },
              { name: 'Circles, Areas Related to Circles & Surface Areas/Volumes', topics: ['Tangents', 'Sectors & Segments', 'Combined Solids'] },
              { name: 'Statistics & Probability', topics: ['Mean, Median, Mode', 'Theoretical Probability'] },
            ],
          },
          {
            name: 'Science',
            code: '086',
            prescribedBooks: ['NCERT Science Class X'],
            chapters: [
              { name: 'Chemical Reactions, Acids, Bases & Salts', topics: ['Equation Balancing', 'pH & Salts'] },
              { name: 'Metals, Non-metals & Carbon Compounds', topics: ['Reactivity Series', 'Functional Groups & Isomers'] },
              { name: 'Life Processes, Control & Reproduction', topics: ['Nutrition & Respiration', 'Nervous & Hormonal Control', 'Genetics & Heredity'] },
              { name: 'Light, Human Eye & Colourful World', topics: ['Ray Diagrams', 'Refraction & Lens Formula', 'Prism Dispersion'] },
              { name: 'Electricity, Magnetic Effects & Our Environment', topics: ["Ohm's Law & Circuits", 'Solenoid & Fleming Rules', 'Ozone & Trophic Levels'] },
            ],
          },
          {
            name: 'Social Science',
            code: '087',
            prescribedBooks: ['India and the Contemporary World-II', 'Contemporary India-II', 'Democratic Politics-II', 'Understanding Economic Development'],
            chapters: [
              { name: 'History: Nationalism in Europe & India', topics: ['French Revolution & Unification', 'Gandhian Movements'] },
              { name: 'History: Print Culture & Making of Global World', topics: ['Silk Routes', 'Print Revolution'] },
              { name: 'Geography: Resources, Water, Agriculture & Minerals', topics: ['Soil Types', 'Cropping Seasons', 'Energy Resources'] },
              { name: 'Political Science: Power Sharing, Federalism & Parties', topics: ['Centre-State Relations', 'Political Parties', 'Outcomes of Democracy'] },
              { name: 'Economics: Development, Sectors, Money & Globalization', topics: ['GDP & HDI', 'Formal/Informal Credit', 'MNCs & WTO'] },
            ],
          },
          {
            name: 'English (Language & Literature)',
            code: '184',
            subjectLanguage: 'English',
            prescribedBooks: ['First Flight', 'Footprints Without Feet'],
            chapters: [
              { name: 'Reading Comprehension & Analytical Paragraph', topics: ['Discursive Passage', 'Case-Based Factual Passage'] },
              { name: 'Grammar & Writing', topics: ['Tenses, Modals, Determiners', 'Subject-Verb Concord', 'Reported Speech', 'Formal Letters'] },
              { name: 'First Flight & Footprints Without Feet', topics: ['Prose Themes & Extracts', 'Poetry Devices'] },
            ],
          },
          ...buildCbseHindiCatalogSubjects('10'),
          {
            name: 'Sanskrit (122)',
            code: '122',
            subjectLanguage: 'Sanskrit',
            prescribedBooks: ['Shemushi Bhag-2', 'Vyakaranavithi', 'Abhyaswaan Bhava'],
            chapters: [
              { name: 'अपठित-अवबोधनम् एवं रचनात्मकं कार्यम्', topics: ['Unseen Passage', 'Letter Writing & Chitra Varnanam'] },
              { name: 'अनुप्रयुक्त-व्याकरणम्', topics: ['Sandhi, Samasa, Pratyaya', 'Vachya Parivartan & Ashuddhi Sanshodhan'] },
              { name: 'पठित-अवबोधनम् (शेमुषी भाग-2)', topics: ['Shuchiparyavaranam, Budhirbalavati Sada', 'Subhashitani & Suktyah'] },
            ],
          },
          {
            name: 'Information Technology (402)',
            code: '402',
            chapters: [
              { name: 'Digital Documentation & Electronic Spreadsheet', topics: ['Styles, Templates, Mail Merge', 'Macros & What-if Analysis'] },
              { name: 'Database Management System (SQL)', topics: ['Primary/Foreign Key', 'SQL Queries'] },
              { name: 'Web Applications, Workplace Safety & Employability Skills', topics: ['Networking Fundamentals', 'Communication & Self-Management'] },
            ],
          },
          {
            name: 'Computer Applications (165)',
            code: '165',
            chapters: [
              { name: 'Networking & Internet Protocols', topics: ['TCP/IP, HTTP, HTTPS, SSH, SFTP', 'Web Services & Mobile Technologies'] },
              { name: 'HTML5 & CSS Styling', topics: ['Tables, Lists, Forms, Audio/Video Tags', 'Cascading Style Sheets'] },
              { name: 'Cyber Ethics', topics: ['Netiquettes, Intellectual Property, Plagiarism', 'E-Commerce & Digital Divide'] },
            ],
          },
          {
            name: 'Artificial Intelligence (417)',
            code: '417',
            chapters: [
              { name: 'AI Project Cycle & Ethics', topics: ['Problem Scoping, Data Acquisition, Evaluation', 'AI Bias & Ethics'] },
              { name: 'Natural Language Processing & Computer Vision', topics: ['Text Normalization, Bag of Words', 'Image Pixels & Convolution'] },
            ],
          },
        ],
      },
      {
        id: 'cbse-class-12',
        label: 'Class 12 (Senior Secondary)',
        mediums: ['English Medium', 'Hindi Medium'],
        subjects: [
          {
            name: 'Physics',
            code: '042',
            prescribedBooks: ['NCERT Physics Class XII Part I & II'],
            chapters: [
              { name: 'Electrostatics & Capacitance', topics: ["Coulomb's Law", "Gauss's Theorem", 'Electric Potential & Capacitors'] },
              { name: 'Current Electricity', topics: ["Kirchhoff's Laws", 'Wheatstone Bridge', 'Internal Resistance'] },
              { name: 'Moving Charges, Magnetism & EMI', topics: ['Biot-Savart & Ampere Law', "Faraday's Law", 'AC Circuits & LCR'] },
              { name: 'Optics (Ray & Wave Optics)', topics: ['Prism & Optical Instruments', 'YDSE Interference & Diffraction'] },
              { name: 'Modern Physics & Semiconductors', topics: ['Photoelectric Effect', 'Bohr Model & Nuclei', 'p-n Junction & Rectifiers'] },
            ],
          },
          {
            name: 'Chemistry',
            code: '043',
            prescribedBooks: ['NCERT Chemistry Class XII Part I & II'],
            chapters: [
              { name: 'Solutions & Electrochemistry', topics: ["Raoult's Law & Colligative Properties", 'Nernst Equation & Conductance'] },
              { name: 'Chemical Kinetics', topics: ['Rate Law & Order', 'Arrhenius Equation'] },
              { name: 'd & f Block and Coordination Compounds', topics: ['Lanthanoid Contraction', 'IUPAC Naming & CFT'] },
              { name: 'Organic Chemistry (Haloalkanes to Biomolecules)', topics: ['SN1/SN2 Mechanisms', 'Aldol & Cannizzaro', 'Amines & Carbohydrates'] },
            ],
          },
          {
            name: 'Mathematics',
            code: '041',
            prescribedBooks: ['NCERT Mathematics Class XII Part I & II'],
            chapters: [
              { name: 'Relations, Functions & Inverse Trigonometry', topics: ['Equivalence Relations', 'Principal Value Branches'] },
              { name: 'Matrices & Determinants', topics: ['Inverse of Matrix', 'System of Linear Equations'] },
              { name: 'Calculus (Continuity, Differentiation, Integrals & DE)', topics: ['Maxima & Minima', 'Definite Integration', 'Differential Equations'] },
              { name: 'Vectors, 3D Geometry, LPP & Probability', topics: ['Shortest Distance', 'Linear Programming', "Bayes' Theorem"] },
            ],
          },
          {
            name: 'Biology',
            code: '044',
            prescribedBooks: ['NCERT Biology Class XII'],
            chapters: [
              { name: 'Reproduction in Plants & Humans', topics: ['Gametogenesis', 'Double Fertilization', 'Reproductive Health'] },
              { name: 'Genetics & Molecular Basis of Inheritance', topics: ['Mendelian Disorders', 'DNA Replication & Lac Operon'] },
              { name: 'Biotechnology & Human Welfare', topics: ['PCR & Recombinant DNA', 'Immunity & Microbes'] },
              { name: 'Ecology & Biodiversity', topics: ['Population Interactions', 'Conservation'] },
            ],
          },
          {
            name: 'Accountancy',
            code: '055',
            prescribedBooks: ['NCERT Accountancy Class XII Part I & II'],
            chapters: [
              { name: 'Partnership Accounts', topics: ['Goodwill Valuation', 'Admission, Retirement & Dissolution'] },
              { name: 'Company Accounts (Shares & Debentures)', topics: ['Issue & Forfeiture of Shares', 'Issue of Debentures'] },
              { name: 'Financial Statement Analysis & Cash Flow', topics: ['Accounting Ratios', 'Cash Flow Statement (AS-3)'] },
            ],
          },
          {
            name: 'Business Studies',
            code: '054',
            prescribedBooks: ['NCERT Business Studies Class XII Part I & II'],
            chapters: [
              { name: 'Principles & Functions of Management', topics: ['Fayol & Taylor Principles', 'Planning, Organising, Staffing, Directing, Controlling'] },
              { name: 'Business Finance & Marketing', topics: ['Financial Markets', '4 Ps of Marketing', 'Consumer Protection Act'] },
            ],
          },
          {
            name: 'Economics (Macroeconomics & Indian Economy)',
            code: '030',
            prescribedBooks: ['Introductory Macroeconomics', 'Indian Economic Development'],
            chapters: [
              { name: 'National Income, Money & Banking', topics: ['GDP Calculation Methods', 'RBI Credit Control'] },
              { name: 'Income Determination, Govt Budget & BoP', topics: ['Multiplier & AD-AS', 'Fiscal Deficit', 'Exchange Rate'] },
              { name: 'Indian Economic Development', topics: ['1991 LPG Reforms', 'Human Capital & Rural Development'] },
            ],
          },
          {
            name: 'Applied Mathematics (241)',
            code: '241',
            chapters: [
              { name: 'Numbers, Quantification & Numerical Applications', topics: ['Modulo Arithmetic', 'Alligation & Mixtures', 'Boats & Streams'] },
              { name: 'Matrices, Calculus & Financial Mathematics', topics: ['Marginal Cost/Revenue', 'Perpetuity, Sinking Funds & EMI'] },
              { name: 'Inferential Statistics, Time Series & LPP', topics: ['t-Test', 'Moving Averages', 'Graphical LPP'] },
            ],
          },
          {
            name: 'Entrepreneurship (066)',
            code: '066',
            chapters: [
              { name: 'Entrepreneurial Opportunity & Planning', topics: ['Sensing Opportunities', 'Business Plan Preparation'] },
              { name: 'Enterprise Marketing, Growth & Resource Mobilization', topics: ['Marketing Mix & Branding', 'Mergers & Capital Markets'] },
            ],
          },
          {
            name: 'History (Themes in Indian History)',
            code: '027',
            prescribedBooks: ['Themes in Indian History Part I, II & III'],
            chapters: [
              { name: 'Harappan Civilization to Early States & Empires', topics: ['Mohenjodaro Town Planning', 'Mauryan Administration & Ashokan Inscriptions', 'Kinship, Caste & Class'] },
              { name: 'Thinkers, Beliefs, Bhakti-Sufi & Vijayanagara', topics: ['Buddhism & Jainism', 'Bhakti & Sufi Traditions', 'Hampi Architecture & Mughal Agrarian Relations'] },
              { name: 'Colonialism, 1857 Revolt & Making of Constitution', topics: ['Permanent Settlement & Santhals', 'Gandhian Nationalism', 'Constituent Assembly Debates'] },
            ],
          },
          {
            name: 'Political Science (Contemporary World & India)',
            code: '028',
            prescribedBooks: ['Contemporary World Politics', 'Politics in India Since Independence'],
            chapters: [
              { name: 'End of Bipolarity, Alternative Centres & South Asia', topics: ['Soviet Disintegration', 'EU, ASEAN & China', 'SAARC & Regional Peace'] },
              { name: 'International Organisations, Security & Globalisation', topics: ['UN Reforms', 'Environmental Concerns', 'Consequences of Globalisation'] },
              { name: 'Challenges of Nation Building & Indian Politics', topics: ['Integration of Princely States', 'Emergency & Coalition Era', 'Regional Aspirations'] },
            ],
          },
          {
            name: 'Geography',
            code: '029',
            prescribedBooks: ['Fundamentals of Human Geography', 'India: People and Economy'],
            chapters: [
              { name: 'Human Geography: Population, Human Development & Activities', topics: ['Demographic Transition', 'Primary, Secondary & Tertiary Activities'] },
              { name: 'Transport, Communication & International Trade', topics: ['Trans-Continental Railways', 'WTO & Major Sea Ports'] },
              { name: 'India: Resources, Agriculture, Industries & Planning', topics: ['Water & Mineral Resources', 'Sustainable Development in India'] },
            ],
          },
          {
            name: 'Sociology',
            code: '039',
            prescribedBooks: ['Indian Society', 'Social Change and Development in India'],
            chapters: [
              { name: 'Demographic Structure, Social Institutions & Inequality', topics: ['Caste, Tribe & Family', 'Social Exclusion & Cultural Diversity'] },
              { name: 'Structural & Cultural Change in India', topics: ['Colonialism & Industrialization', 'Sanskritisation, Modernisation & Social Movements'] },
            ],
          },
          {
            name: 'Psychology',
            code: '037',
            prescribedBooks: ['NCERT Psychology Class XII'],
            chapters: [
              { name: 'Variations in Psychological Attributes & Self/Personality', topics: ['Intelligence Theories (Gardner, Sternberg)', 'Trait & Psychodynamic Approaches'] },
              { name: 'Meeting Life Challenges, Disorders & Therapies', topics: ['Stress Coping Strategies', 'Anxiety, Mood & Psychotic Disorders', 'CBT & Humanistic Therapy'] },
              { name: 'Attitude, Social Cognition & Group Processes', topics: ['Attitude Change', 'Conformity, Obedience & Group Polarization'] },
            ],
          },
          {
            name: 'Legal Studies (074)',
            code: '074',
            chapters: [
              { name: 'Judiciary, ADR & Topics in Indian Law', topics: ['Supreme Court Jurisdiction', 'Arbitration & Mediation', 'Law of Contract, Torts & Property'] },
              { name: 'Human Rights, Legal Profession & International Law', topics: ['Fundamental Rights & NHRC', 'Advocates Act & Legal Aid'] },
            ],
          },
          {
            name: 'Computer Science (Python & SQL)',
            code: '083',
            prescribedBooks: ['NCERT Computer Science Class XII'],
            chapters: [
              { name: 'Python Functions, File Handling & Data Structures', topics: ['Text/Binary/CSV Files', 'Stack Operations'] },
              { name: 'Computer Networks & Database Management', topics: ['TCP/IP, HTTP, Topologies', 'SQL Joins, Group By & Python-SQL'] },
            ],
          },
          {
            name: 'Informatics Practices (065)',
            code: '065',
            prescribedBooks: ['NCERT Informatics Practices Class XII'],
            chapters: [
              { name: 'Data Handling using Pandas & Data Visualization', topics: ['Series & DataFrames', 'CSV Import/Export & Matplotlib Plots'] },
              { name: 'Database Query using SQL, Networks & Societal Impacts', topics: ['Math/Text/Date SQL Functions & Group By', 'Digital Footprint & Cyber Crime'] },
            ],
          },
          {
            name: 'Physical Education (048)',
            code: '048',
            chapters: [
              { name: 'Management of Sporting Events, Yoga & Lifestyle', topics: ['Fixtures (Knockout & League)', 'Asanas for Lifestyle Diseases'] },
              { name: 'Biomechanics, Training, Physiology & Sports Psychology', topics: ["Newton's Laws in Sports", 'Endurance/Strength Training & Doping'] },
            ],
          },
          {
            name: 'English (Core)',
            code: '301',
            subjectLanguage: 'English',
            prescribedBooks: ['Flamingo', 'Vistas'],
            chapters: [
              { name: 'Reading Comprehension & Creative Writing', topics: ['Notices, Invitations, Job Application, Articles'] },
              { name: 'Flamingo & Vistas', topics: ['Prose Analysis', 'Poetic Devices'] },
            ],
          },
          {
            name: 'English (Elective)',
            code: '001',
            subjectLanguage: 'English',
            prescribedBooks: ['Kaleidoscope', 'A Tiger for Malgudi'],
            chapters: [
              { name: 'Reading, Literary Analysis & Creative Writing', topics: ['Unseen Prose & Poetry', 'Discursive & Reflective Essays'] },
              { name: 'Kaleidoscope Short Stories, Poetry & Drama', topics: ['Narrative Technique & Literary Criticism'] },
            ],
          },
          ...buildCbseHindiCatalogSubjects('12'),
          {
            name: 'Sanskrit (Core)',
            code: '322',
            subjectLanguage: 'Sanskrit',
            prescribedBooks: ['Bhaswati Bhag-2'],
            chapters: [
              { name: 'अपठित-अवबोधनम् एवं रचनात्मकं लेखनम्', topics: ['Unseen Passage', 'Formal Letters & Essay'] },
              { name: 'भास्वती भाग-2 एवं संस्कृत साहित्य इतिहास', topics: ['Vedic & Classical Literature', 'Chhanda & Alankara'] },
            ],
          },
        ],
      },
    ],
  },

  // C. UGC NET — Intentionally NOT hardcoded here.
  // Published Paper 1 & Paper 2 syllabuses are dynamically injected on the server
  // solely from Admin-approved `db.ugcNetSyllabuses` records.


  // D. ODISHA & OTHER COMPETITIVE EXAMINATIONS
  {
    id: 'opsc-oas',
    category: 'competitive',
    name: 'OPSC (Odisha Civil Services / OAS)',
    shortDesc: 'Odisha Public Service Commission Prelims GS & CSAT',
    defaultMarksPerQuestion: 2,
    defaultNegativeMarking: true,
    defaultNegativePenalty: 0.66,
    classesOrPapers: [
      {
        id: 'opsc-prelims-gs',
        label: 'Prelims General Studies Paper I',
        subjects: [
          {
            name: 'Odisha History, Culture & Geography',
            chapters: [
              { name: 'Ancient & Medieval Odisha', topics: ['Kalinga War, Kharavela, Somavamshi, Gajapati Dynasty'] },
              { name: 'Modern Odisha & Art/Culture', topics: ['Paika Rebellion, Temple Architecture, Jagannath Culture'] },
              { name: 'Geography & Economy of Odisha', topics: ['Rivers, Minerals, Soil, Budget & Schemes'] },
            ],
          },
          {
            name: 'Indian History, Polity & Economy',
            chapters: [
              { name: 'Indian Freedom Movement & Polity', topics: ['Constitution, Parliament, Panchayati Raj'] },
              { name: 'Indian Economy & Sustainable Development', topics: ['Fiscal Policy, Banking, Poverty & Inclusion'] },
            ],
          },
          {
            name: 'Current Affairs, Environment & General Science',
            chapters: [
              { name: 'National, International & Odisha Current Affairs', topics: ['Policies, Summits, Awards, Science Tech'] },
            ],
          },
        ],
      },
      {
        id: 'opsc-csat',
        label: 'Prelims CSAT Paper II',
        subjects: [
          {
            name: 'Comprehension, Reasoning & Numeracy',
            chapters: [
              { name: 'Logical Reasoning & Data Interpretation', topics: ['Puzzles, Syllogism, Charts'] },
              { name: 'Quantitative Aptitude', topics: ['Percentage, Ratios, Number System'] },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'opsc-aso',
    category: 'competitive',
    name: 'OPSC ASO (Assistant Section Officer)',
    shortDesc: 'General Awareness, Reasoning, Math, English & Odia',
    defaultMarksPerQuestion: 1,
    defaultNegativeMarking: true,
    defaultNegativePenalty: 0.25,
    classesOrPapers: [
      {
        id: 'opsc-aso-written',
        label: 'ASO Written Examination',
        subjects: [
          {
            name: 'General Awareness & Odisha GK',
            chapters: [
              { name: 'History, Polity, Economy & Current Affairs', topics: ['Static GK, Odisha Heritage, Constitutional Bodies'] },
            ],
          },
          {
            name: 'Test of Reasoning & Mental Ability',
            chapters: [
              { name: 'Verbal & Non-Verbal Reasoning', topics: ['Coding-Decoding, Series, Blood Relations, Sitting Arrangement'] },
            ],
          },
          {
            name: 'Mathematics',
            chapters: [
              { name: 'Arithmetic, Algebra & Mensuration', topics: ['Time & Work, SI/CI, Profit & Loss, Geometry'] },
            ],
          },
          {
            name: 'English & Odia Language',
            chapters: [
              { name: 'English Grammar & Vocabulary', topics: ['Error Spotting, Idioms, Comprehension'] },
              { name: 'Odia Grammar (ଓଡ଼ିଆ ବ୍ୟାକରଣ)', topics: ['ସନ୍ଧି, ସମାସ, ବିପରୀତ ଶବ୍ଦ, ଶୁଦ୍ଧି'] },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'ossc-cgl',
    category: 'competitive',
    name: 'OSSC (Odisha Staff Selection Commission)',
    shortDesc: 'OSSC CGL, Combined Technical & Graduate Level Prelims/Mains',
    defaultMarksPerQuestion: 1,
    defaultNegativeMarking: true,
    defaultNegativePenalty: 0.25,
    classesOrPapers: [
      {
        id: 'ossc-cgl-prelims',
        label: 'OSSC CGL Prelims & Mains',
        subjects: [
          {
            name: 'Arithmetic & Data Interpretation',
            chapters: [
              { name: 'Quantitative Aptitude & DI', topics: ['Tables, Graphs, Ratio, Percentage, Mensuration'] },
            ],
          },
          {
            name: 'Logical Reasoning & Computer Awareness',
            chapters: [
              { name: 'Reasoning & MS Office/Internet', topics: ['Analytical Puzzles, Hardware, Networking, Shortcuts'] },
            ],
          },
          {
            name: 'Current Affairs & Odisha GK',
            chapters: [
              { name: 'National & Odisha Schemes, Geography & History', topics: ['Odisha Districts, Rivers, Current Events'] },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'osssc-combined',
    category: 'competitive',
    name: 'OSSSC (RI, ARI, Amin, PEO, Forest Guard)',
    shortDesc: 'Odisha Sub-ordinate Staff Selection Commission Combined Recruitment',
    defaultMarksPerQuestion: 1,
    defaultNegativeMarking: true,
    defaultNegativePenalty: 0.33,
    classesOrPapers: [
      {
        id: 'osssc-cre',
        label: 'Combined Recruitment Exam (CRE)',
        subjects: [
          {
            name: 'Mathematics, English & Odia',
            chapters: [
              { name: 'High School Level Arithmetic', topics: ['HCF/LCM, Profit & Loss, Ratio, Mensuration'] },
              { name: 'Odia & English Grammar', topics: ['Grammar, Synonyms, Comprehension'] },
            ],
          },
          {
            name: 'General Knowledge & Computer Fundamentals',
            chapters: [
              { name: 'Odisha & India GK', topics: ['Culture, Geography, Constitution, Everyday Science'] },
              { name: 'Computer Knowledge', topics: ['OS, MS Word/Excel, Internet Safety'] },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'odisha-police',
    category: 'competitive',
    name: 'Odisha Police (SI & Constable)',
    shortDesc: 'Odisha Police Sub-Inspector & Sepoy/Constable Recruitment',
    defaultMarksPerQuestion: 1,
    defaultNegativeMarking: true,
    defaultNegativePenalty: 0.25,
    classesOrPapers: [
      {
        id: 'odisha-police-si',
        label: 'Police SI / Constable',
        subjects: [
          {
            name: 'General English & Odia Language',
            chapters: [
              { name: 'Comprehension & Grammar', topics: ['Tenses, Prepositions, Odia Pratisabda & Sandhi'] },
            ],
          },
          {
            name: 'General Studies, Reasoning & Computer',
            chapters: [
              { name: 'Indian Constitution, Odisha GK & Science', topics: ['Polity, Crime/Law Basics, Physics/Bio Basics'] },
              { name: 'Reasoning & Computer Fundamentals', topics: ['Direction, Syllogism, Networking & Cyber Security'] },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'ct-osstet',
    category: 'competitive',
    name: 'CT / OTET / OSSTET (Odisha Teacher Eligibility)',
    shortDesc: 'D.El.Ed (CT), OTET & OSSTET Pedagogy & Subject Papers',
    defaultMarksPerQuestion: 1,
    defaultNegativeMarking: false,
    defaultNegativePenalty: 0,
    classesOrPapers: [
      {
        id: 'osstet-paper',
        label: 'CT / OTET / OSSTET',
        subjects: [
          {
            name: 'Child Development and Pedagogy (CDP)',
            chapters: [
              { name: 'Growth, Development & Learning Theories', topics: ['Piaget, Vygotsky, Kohlberg, Inclusive Education'] },
              { name: 'Assessment & Pedagogical Approaches', topics: ['CCE, NCF 2005, NEP 2020, Classroom Management'] },
            ],
          },
          {
            name: 'Odia & English Pedagogy',
            chapters: [
              { name: 'Language Acquisition & Grammar', topics: ['LSRW Skills, Remedial Teaching, Grammar'] },
            ],
          },
          {
            name: 'Mathematics, Science & Social Studies',
            chapters: [
              { name: 'Content & Subject Pedagogy', topics: ['Number System, Everyday Science, Indian & Odisha History/Civics'] },
            ],
          },
        ],
      },
    ],
  },
];

export const MOCK_UI_LABELS: Record<
  MockLanguage,
  {
    aiNotice: string;
    practiceBadge: string;
    submitTest: string;
    confirmSubmitBtn: string;
    cancelBtn: string;
    previous: string;
    next: string;
    saveAnswer: string;
    savedLabel: string;
    saveAndNext: string;
    clearAnswer: string;
    markReview: string;
    unmarkReview: string;
    paletteTitle: string;
    answered: string;
    notAnswered: string;
    marked: string;
    notVisited: string;
    questionWord: string;
    ofWord: string;
    resultTitle: string;
    downloadPdf: string;
    retryIncorrect: string;
    newMockTest: string;
    reviewAnswers: string;
    explanationLabel: string;
    yourAnswer: string;
    correctAnswer: string;
    unattemptedLabel: string;
    totalQsStat: string;
    attemptedStat: string;
    correctStat: string;
    incorrectStat: string;
    unattemptedStat: string;
    totalMarksStat: string;
    scoreAccuracyStat: string;
    timeTakenStat: string;
    subjectPerformanceTitle: string;
    subjectCol: string;
    questionsCol: string;
    attemptedCol: string;
    correctCol: string;
    incorrectCol: string;
    accuracyCol: string;
    marksCol: string;
    allTab: string;
    correctBadge: string;
    incorrectBadge: string;
    checkAnswerBtn: string;
    hideSolutionBtn: string;
  }
> = {
  english: {
    aiNotice: 'AI-Generated Practice Test · Grounded in selected syllabus (not official previous-year papers)',
    practiceBadge: 'Practice Mode (Untimed)',
    submitTest: 'Submit Test',
    confirmSubmitBtn: 'Confirm & View Result',
    cancelBtn: 'Cancel',
    previous: 'Previous',
    next: 'Next',
    saveAnswer: 'Save Answer',
    savedLabel: 'Saved',
    saveAndNext: 'Save & Next',
    clearAnswer: 'Clear Answer',
    markReview: 'Mark for Review',
    unmarkReview: 'Unmark Review',
    paletteTitle: 'Question Navigation Palette',
    answered: 'Answered',
    notAnswered: 'Not Answered',
    marked: 'Marked',
    notVisited: 'Not Visited',
    questionWord: 'Question',
    ofWord: 'of',
    resultTitle: 'Mock Test Result & Performance Analysis',
    downloadPdf: 'Download Result PDF',
    retryIncorrect: 'Retry Incorrect Questions',
    newMockTest: 'Generate Another Mock Test',
    reviewAnswers: 'Detailed Answer Review',
    explanationLabel: 'Explanation',
    yourAnswer: 'Your Answer',
    correctAnswer: 'Correct Answer',
    unattemptedLabel: 'Unattempted',
    totalQsStat: 'Total Qs',
    attemptedStat: 'Attempted',
    correctStat: 'Correct',
    incorrectStat: 'Incorrect',
    unattemptedStat: 'Unattempted',
    totalMarksStat: 'Total Marks',
    scoreAccuracyStat: 'Score % / Acc',
    timeTakenStat: 'Time Taken',
    subjectPerformanceTitle: 'Subject-wise Performance Breakdown',
    subjectCol: 'Subject',
    questionsCol: 'Questions',
    attemptedCol: 'Attempted',
    correctCol: 'Correct',
    incorrectCol: 'Incorrect',
    accuracyCol: 'Accuracy',
    marksCol: 'Marks',
    allTab: 'All',
    correctBadge: 'Correct',
    incorrectBadge: 'Incorrect',
    checkAnswerBtn: 'Check Answer & Explanation',
    hideSolutionBtn: 'Hide Solution',
  },
  hindi: {
    aiNotice: 'AI-जनित अभ्यास परीक्षा · चयनित पाठ्यक्रम पर आधारित (आधिकारिक पिछले वर्ष के प्रश्नपत्र नहीं)',
    practiceBadge: 'अभ्यास मोड (बिना समय सीमा)',
    submitTest: 'परीक्षा सबमिट करें',
    confirmSubmitBtn: 'सबमिट करें और परिणाम देखें',
    cancelBtn: 'रद्द करें',
    previous: 'पिछला',
    next: 'अगला',
    saveAnswer: 'उत्तर सहेजें',
    savedLabel: 'सहेजा गया',
    saveAndNext: 'सहेजें और आगे बढ़ें',
    clearAnswer: 'उत्तर हटाएं',
    markReview: 'समीक्षा के लिए चिह्नित करें',
    unmarkReview: 'चिह्न हटाएं',
    paletteTitle: 'प्रश्न नेविगेशन पैलेट',
    answered: 'उत्तर दिया गया',
    notAnswered: 'उत्तर नहीं दिया',
    marked: 'समीक्षा के लिए चिह्नित',
    notVisited: 'देखा नहीं गया',
    questionWord: 'प्रश्न',
    ofWord: 'में से',
    resultTitle: 'मॉक टेस्ट परिणाम और विश्लेषण',
    downloadPdf: 'परिणाम PDF डाउनलोड करें',
    retryIncorrect: 'गलत प्रश्नों का पुनः अभ्यास करें',
    newMockTest: 'नया मॉक टेस्ट बनाएं',
    reviewAnswers: 'विस्तृत उत्तर समीक्षा',
    explanationLabel: 'व्याख्या',
    yourAnswer: 'आपका उत्तर',
    correctAnswer: 'सही उत्तर',
    unattemptedLabel: 'प्रयास नहीं किया',
    totalQsStat: 'कुल प्रश्न',
    attemptedStat: 'प्रयास किए',
    correctStat: 'सही',
    incorrectStat: 'गलत',
    unattemptedStat: 'छोड़े गए',
    totalMarksStat: 'कुल अंक',
    scoreAccuracyStat: 'प्रतिशत / सटीकता',
    timeTakenStat: 'लिया गया समय',
    subjectPerformanceTitle: 'विषयवार प्रदर्शन विवरण',
    subjectCol: 'विषय',
    questionsCol: 'प्रश्न',
    attemptedCol: 'प्रयास',
    correctCol: 'सही',
    incorrectCol: 'गलत',
    accuracyCol: 'सटीकता',
    marksCol: 'अंक',
    allTab: 'सभी',
    correctBadge: 'सही',
    incorrectBadge: 'गलत',
    checkAnswerBtn: 'उत्तर और व्याख्या देखें',
    hideSolutionBtn: 'समाधान छिपाएं',
  },
  odia: {
    aiNotice: 'AI-ପ୍ରସ୍ତୁତ ଅଭ୍ୟାସ ପରୀକ୍ଷା · ମନୋନୀତ ପାଠ୍ୟକ୍ରମ ଆଧାରିତ (ସରକାରୀ ପୂର୍ବ ବର୍ଷ ପ୍ରଶ୍ନପତ୍ର ନୁହେଁ)',
    practiceBadge: 'ଅଭ୍ୟାସ ମୋଡ୍ (ସମୟ ସୀମା ନାହିଁ)',
    submitTest: 'ପରୀକ୍ଷା ଦାଖଲ କରନ୍ତୁ',
    confirmSubmitBtn: 'ଦାଖଲ କରି ଫଳାଫଳ ଦେଖନ୍ତୁ',
    cancelBtn: 'ବାତିଲ କରନ୍ତୁ',
    previous: 'ପୂର୍ବବର୍ତ୍ତୀ',
    next: 'ପରବର୍ତ୍ତୀ',
    saveAnswer: 'ଉତ୍ତର ସଂରକ୍ଷଣ',
    savedLabel: 'ସଂରକ୍ଷିତ',
    saveAndNext: 'ସଂରକ୍ଷଣ ଓ ଆଗକୁ',
    clearAnswer: 'ଉତ୍ତର ହଟାନ୍ତୁ',
    markReview: 'ସମୀକ୍ଷା ପାଇଁ ଚିହ୍ନିତ',
    unmarkReview: 'ଚିହ୍ନ ହଟାନ୍ତୁ',
    paletteTitle: 'ପ୍ରଶ୍ନ ନାଭିଗେସନ୍ ପ୍ୟାଲେଟ୍',
    answered: 'ଉତ୍ତର ଦିଆଯାଇଛି',
    notAnswered: 'ଉତ୍ତର ଦିଆଯାଇନାହିଁ',
    marked: 'ସମୀକ୍ଷା ପାଇଁ ଚିହ୍ନିତ',
    notVisited: 'ଦେଖାଯାଇନାହିଁ',
    questionWord: 'ପ୍ରଶ୍ନ',
    ofWord: 'ମଧ୍ୟରୁ',
    resultTitle: 'ମକ୍ ଟେଷ୍ଟ ଫଳାଫଳ ଏବଂ ବିଶ୍ଳେଷଣ',
    downloadPdf: 'ଫଳାଫଳ PDF ଡାଉନଲୋଡ୍',
    retryIncorrect: 'ଭୁଲ ପ୍ରଶ୍ନଗୁଡ଼ିକ ପୁନଃ ଅଭ୍ୟାସ କରନ୍ତୁ',
    newMockTest: 'ନୂତନ ମକ୍ ଟେଷ୍ଟ ତିଆରି କରନ୍ତୁ',
    reviewAnswers: 'ବିସ୍ତୃତ ଉତ୍ତର ସମୀକ୍ଷା',
    explanationLabel: 'ବ୍ୟାଖ୍ୟା',
    yourAnswer: 'ଆପଣଙ୍କ ଉତ୍ତର',
    correctAnswer: 'ସଠିକ୍ ଉତ୍ତର',
    unattemptedLabel: 'ଉତ୍ତର ଦିଆଯାଇନାହିଁ',
    totalQsStat: 'ମୋଟ ପ୍ରଶ୍ନ',
    attemptedStat: 'ଉତ୍ତର ଦେଇଛନ୍ତି',
    correctStat: 'ସଠିକ୍',
    incorrectStat: 'ଭୁଲ',
    unattemptedStat: 'ଛାଡ଼ିଛନ୍ତି',
    totalMarksStat: 'ମୋଟ ନମ୍ବର',
    scoreAccuracyStat: 'ଶତକଡ଼ା / ସଠିକତା',
    timeTakenStat: 'ଲାଗିଥିବା ସମୟ',
    subjectPerformanceTitle: 'ବିଷୟ-ୱାରୀ ପ୍ରଦର୍ଶନ ବିବରଣୀ',
    subjectCol: 'ବିଷୟ',
    questionsCol: 'ପ୍ରଶ୍ନ',
    attemptedCol: 'ଚେଷ୍ଟା',
    correctCol: 'ସଠିକ୍',
    incorrectCol: 'ଭୁଲ',
    accuracyCol: 'ସଠିକତା',
    marksCol: 'ନମ୍ବର',
    allTab: 'ସମସ୍ତ',
    correctBadge: 'ସଠିକ୍',
    incorrectBadge: 'ଭୁଲ',
    checkAnswerBtn: 'ଉତ୍ତର ଓ ବ୍ୟାଖ୍ୟା ଦେଖନ୍ତୁ',
    hideSolutionBtn: 'ସମାଧାନ ଲୁଚାନ୍ତୁ',
  },
};
