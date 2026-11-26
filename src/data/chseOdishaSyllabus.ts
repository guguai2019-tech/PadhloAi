import type { SyllabusSubject } from '../types';

export const CHSE_SCIENCE_PDF_URL = '/assets/aistudio/science_2016_91bf0c45.pdf';
export const CHSE_SCIENCE_PDF_NAME = 'science_2016.pdf';

export const CHSE_ARTS_PDF_URL = '/assets/aistudio/Arts_2018_0_241fa472.pdf';
export const CHSE_ARTS_PDF_NAME = 'Arts_2018_0.pdf';

const CHSE_ENGLISH_1ST_YEAR: SyllabusSubject = {
  name: 'English (Compulsory)',
  code: 'ENG-1',
  subjectLanguage: 'English',
  prescribedBooks: ['Invitation to English - 1, 2, 3 & 4 (Odisha State Bureau)'],
  chapters: [
    {
      name: 'Unit I: Prose',
      topics: [
        'Standing Up for Yourself — Yevgeny Yevtushenko',
        'The Legend behind a Legend — Hariharan Balakrishnan',
        'The Golden Touch — Nathaniel Hawthorne',
        'In London In Minus Fours — Louis Fischer',
        'The Cancer Fight, from Hiroshima to Houston — Ritsuko Komaki',
      ],
    },
    {
      name: 'Unit II: Poetry',
      topics: [
        'Stopping by Woods on a Snowy Evening — Robert Frost',
        'Oft. in the Stilly Night — Thomas Moore',
        'The Inchcape Rock — Robert Southey',
        'To My True Friend — Elizabeth Pinard',
        'Fishing — Gopa Ranjan Mishra',
      ],
    },
    {
      name: 'Unit III: Non-Detailed Study',
      topics: [
        'Three Questions — Leo Tolstoy',
        'After Twenty Years — O. Henry',
        'The Open Window — Saki',
        'The One and Only Houdini — Robert Lado',
        'Childhood — Jawaharlal Nehru',
        'Marriage — Dr. Rajendra Prasad',
      ],
    },
    {
      name: 'Unit IV & V: Writing Skills & Grammar',
      topics: [
        'Paragraph Writing, Personal/Official Letters & Notices',
        'Information Transfer (Diagrams, Charts & Tables)',
        'Tense Patterns, Modal Verbs, Prepositions & Imperatives',
      ],
    },
  ],
};

const CHSE_ENGLISH_2ND_YEAR: SyllabusSubject = {
  name: 'English (Compulsory)',
  code: 'ENG-2',
  subjectLanguage: 'English',
  prescribedBooks: ['Invitation to English - 1, 2, 3 & 4 (Odisha State Bureau)'],
  chapters: [
    {
      name: 'Unit I: Prose',
      topics: [
        'My Greatest Olympic Prize — Jesse Owens',
        'On Examinations — Winston S. Churchill',
        'The Portrait of a Lady — Khushwant Singh',
        'The Magic of Teamwork — Sam Pitroda',
        'Development of Polio Vaccines — Bonnie Okonek & Linda Morganstein',
      ],
    },
    {
      name: 'Unit II: Poetry',
      topics: [
        'Daffodils — William Wordsworth',
        'The Ballad of Father Gilligan — William Butler Yeats',
        'A Psalm of Life — Henry W. Longfellow',
        'Television — Roald Dahl',
        'Money Madness — D.H. Lawrence',
      ],
    },
    {
      name: 'Unit III: Non-Detailed Study',
      topics: [
        "The Doctor's Word — R.K. Narayan",
        'The Nightingale and the Rose — Oscar Wilde',
        'Mystery of the Missing Cap — Manoj Das',
        "The Monkey's Paw — W.W. Jacobs",
        'My Mother — Charlie Chaplin',
        'Stay Hungry, Stay Foolish — Steve Jobs',
      ],
    },
    {
      name: 'Unit IV & V: Writing Skills & Grammar',
      topics: [
        'Interpreting Graphs, Charts, Tables & Diagrams',
        'Reporting Events, Note-Making & Summarizing',
        'Conditionals, Passive Voice, Reported Speech & Phrasal Verbs',
      ],
    },
  ],
};

const CHSE_MIL_ODIA: SyllabusSubject = {
  name: 'M.I.L. (Odia)',
  code: 'MIL-OD',
  subjectLanguage: 'Odia',
  prescribedBooks: ['CHSE ଓଡ଼ିଆ ସାହିତ୍ୟ ଓ ବ୍ୟାକରଣ (Odisha State Bureau)'],
  chapters: [
    {
      name: 'ଗଦ୍ୟ ବିଭାଗ (Prose)',
      topics: [
        'ଶେଷ ପଦର — ଗୋପୀନାଥ ମହାନ୍ତି / ବାସ୍ତବବାଦୀ ଗଦ୍ୟ',
        'ଝେଲମ୍ ନଦୀରେ ସନ୍ଧ୍ୟା — କୁଞ୍ଜବିହାରୀ ଦାଶ',
        'ମଧୁବାବୁ — ଚିନ୍ତାମଣି ଆଚାର୍ଯ୍ୟ / ଗାଁ ମଜଲିସ୍ — ହରେକୃଷ୍ଣ ମହତାବ',
      ],
    },
    {
      name: 'ପଦ୍ୟ ଓ ଗଳ୍ପ ବିଭାଗ (Poetry & Short Stories)',
      topics: ['ପ୍ରାଚୀନ ଓ ଆଧୁନିକ ଓଡ଼ିଆ କବିତା', 'କ୍ଷୁଦ୍ର ଗଳ୍ପ ଓ ଏକାଙ୍କିକା'],
    },
    {
      name: 'ବ୍ୟାକରଣ ଓ ରଚନା (Grammar & Composition)',
      topics: ['ବୋଧଗମ୍ୟତା (Comprehension)', 'ରଚନା, ପତ୍ରଲିଖନ, ଭାବସମ୍ପ୍ରସାରଣ ଓ ବ୍ୟାକରଣ'],
    },
  ],
};

const CHSE_MIL_HINDI: SyllabusSubject = {
  name: 'M.I.L. (Hindi)',
  code: 'MIL-HI',
  subjectLanguage: 'Hindi',
  prescribedBooks: ['CHSE M.I.L. Hindi Textbooks (Odisha State Bureau)'],
  chapters: [
    {
      name: 'गद्य एवं पद्य (Prose & Poetry)',
      topics: ['निर्धारित गद्य पाठ एवं व्याख्या', 'निर्धारित कविताएँ एवं काव्य-सौंदर्य'],
    },
    {
      name: 'व्यावहारिक हिंदी व्याकरण एवं रचना',
      topics: ['अपठित गद्यांश, निबंध एवं पत्र लेखन', 'वाक्य शुद्धि, मुहावरे, पर्यायवाची व व्याकरण'],
    },
  ],
};

export const CHSE_ODISHA_SCIENCE_1ST_YEAR_SUBJECTS: SyllabusSubject[] = [
  CHSE_ENGLISH_1ST_YEAR,
  CHSE_MIL_ODIA,
  CHSE_MIL_HINDI,
  {
    name: 'Physics',
    code: 'PHY-1',
    chapters: [
      { name: 'Unit I: Physical World & Measurement', topics: ['SI Units & Dimensions', 'Errors & Significant Figures'] },
      { name: 'Unit II: Kinematics', topics: ['Motion in a Straight Line', 'Vectors & Projectile Motion'] },
      { name: 'Unit III: Laws of Motion', topics: ["Newton's Laws & Momentum", 'Friction & Circular Motion'] },
      { name: 'Unit IV & V: Work, Energy, Power & Rotational Motion', topics: ['Work-Energy Theorem & Collisions', 'Moment of Inertia & Torque'] },
      { name: 'Unit VI–VIII: Gravitation, Bulk Matter & Thermodynamics', topics: ["Kepler's Laws & Escape Velocity", 'Elasticity & Fluid Mechanics', 'Laws of Thermodynamics & Kinetic Theory'] },
      { name: 'Unit IX & X: Oscillations & Waves', topics: ['Simple Harmonic Motion (SHM)', 'Standing Waves & Doppler Effect'] },
    ],
  },
  {
    name: 'Chemistry',
    code: 'CHE-1',
    chapters: [
      { name: 'Unit I & II: Basic Concepts & Atomic Structure', topics: ['Mole Concept & Stoichiometry', 'Quantum Numbers & Electronic Configuration'] },
      { name: 'Unit III & IV: Periodicity & Chemical Bonding', topics: ['Periodic Trends', 'VSEPR Theory, Hybridisation & MOT'] },
      { name: 'Unit V–VII: States of Matter, Thermodynamics & Equilibrium', topics: ['Ideal Gas Equation', 'Enthalpy, Hess Law & Gibbs Energy', 'Ionic Equilibrium, pH & Buffer'] },
      { name: 'Unit VIII–XII: Redox, s/p-Block & Organic Basics', topics: ['Oxidation Numbers & Balancing', 'Alkali & Alkaline Earth Metals', 'IUPAC Nomenclature, Isomerism & Hydrocarbons'] },
    ],
  },
  {
    name: 'Mathematics',
    code: 'MAT-1',
    chapters: [
      { name: 'Unit I: Sets, Relations & Functions', topics: ['Set Operations & Venn Diagrams', 'Domain, Range & Trigonometric Functions'] },
      { name: 'Unit II: Algebra', topics: ['Complex Numbers & Quadratic Equations', 'Linear Inequalities, Permutations & Combinations', 'Binomial Theorem & Sequence/Series'] },
      { name: 'Unit III: Coordinate Geometry', topics: ['Straight Lines', 'Conic Sections (Circle, Parabola, Ellipse, Hyperbola)', '3D Geometry Basics'] },
      { name: 'Unit IV & V: Limits, Derivatives, Statistics & Probability', topics: ['Limits & First-Principle Derivatives', 'Measures of Dispersion & Probability'] },
    ],
  },
  {
    name: 'Biology (Botany & Zoology)',
    code: 'BIO-1',
    chapters: [
      { name: 'Diversity in Living World', topics: ['Biological Classification', 'Plant & Animal Kingdoms'] },
      { name: 'Structural Organisation in Plants & Animals', topics: ['Morphology & Anatomy of Flowering Plants', 'Animal Tissues & Organ Systems'] },
      { name: 'Cell Structure & Function', topics: ['Prokaryotic & Eukaryotic Cells', 'Biomolecules, Cell Cycle & Mitosis/Meiosis'] },
      { name: 'Plant & Human Physiology', topics: ['Photosynthesis & Plant Respiration', 'Digestion, Breathing, Circulation, Excretion & Neural Control'] },
    ],
  },
  {
    name: 'Computer Science / IT',
    code: 'CS-1',
    chapters: [
      { name: 'Computer Fundamentals & Operating Systems', topics: ['Number Systems & Logic Gates', 'Memory & OS Architecture'] },
      { name: 'Programming Methodology & Data Handling', topics: ['Flowcharts, Algorithms & Structured Programming', 'Networking & Database Basics'] },
    ],
  },
  {
    name: 'Geology',
    code: 'GEO-1',
    chapters: [
      { name: 'General Geology & Crystallography', topics: ['Earth Interior, Volcanoes & Earthquakes', 'Crystal Systems & Mineralogy'] },
      { name: 'Petrology & Paleontology Basics', topics: ['Igneous, Sedimentary & Metamorphic Rocks', 'Fossils & Stratigraphy'] },
    ],
  },
];

export const CHSE_ODISHA_SCIENCE_2ND_YEAR_SUBJECTS: SyllabusSubject[] = [
  CHSE_ENGLISH_2ND_YEAR,
  CHSE_MIL_ODIA,
  CHSE_MIL_HINDI,
  {
    name: 'Physics',
    code: 'PHY-2',
    chapters: [
      { name: 'Unit I: Electrostatics', topics: ["Coulomb's Law & Electric Field", "Gauss's Law & Capacitors"] },
      { name: 'Unit II: Current Electricity', topics: ["Ohm's Law & Drift Velocity", "Kirchhoff's Laws, Wheatstone Bridge & Meter Bridge"] },
      { name: 'Unit III & IV: Magnetism, EMI & Alternating Current', topics: ['Biot-Savart Law & Cyclotron', "Faraday's Laws, Lenz's Law & LCR Circuits"] },
      { name: 'Unit V & VI: Electromagnetic Waves & Optics', topics: ['Ray Optics (Lens, Prism, Optical Instruments)', 'Wave Optics (Huygens Principle, YDSE & Polarisation)'] },
      { name: 'Unit VII–IX: Dual Nature, Atoms, Nuclei & Semiconductors', topics: ['Photoelectric Effect & de Broglie Wavelength', 'Bohr Model, Radioactivity & Nuclear Binding Energy', 'p-n Junction Diodes, Rectifiers, Zener & Logic Gates'] },
    ],
  },
  {
    name: 'Chemistry',
    code: 'CHE-2',
    chapters: [
      { name: 'Physical Chemistry (Solid State to Surface Chemistry)', topics: ['Crystal Lattices & Packing Efficiency', 'Solutions & Colligative Properties', 'Nernst Equation, Electrochemistry & Chemical Kinetics'] },
      { name: 'Inorganic Chemistry (p-Block, d/f-Block & Coordination)', topics: ['Group 15–18 Elements', 'Transition Elements & Lanthanoids', 'Coordination Compounds (Werner Theory, IUPAC, CFT)'] },
      { name: 'Organic Chemistry (Haloalkanes to Polymers/Biomolecules)', topics: ['Haloalkanes & Haloarenes (SN1/SN2)', 'Alcohols, Phenols, Ethers, Aldehydes, Ketones & Carboxylic Acids', 'Amines, Biomolecules & Polymers'] },
    ],
  },
  {
    name: 'Mathematics',
    code: 'MAT-2',
    chapters: [
      { name: 'Unit I: Relations, Functions & Linear Programming', topics: ['Inverse Trigonometric Functions', 'Equivalence Relations & LPP Optimization'] },
      { name: 'Unit II: Algebra & Probability', topics: ['Matrices & Determinants', 'Conditional Probability & Bayes Theorem'] },
      { name: 'Unit III: Differential Calculus', topics: ['Continuity, Differentiability & Chain Rule', "Rolle's & Mean Value Theorems, Maxima & Minima"] },
      { name: 'Unit IV: Integral Calculus', topics: ['Indefinite & Definite Integrals', 'Area Under Curves & Differential Equations'] },
      { name: 'Unit V: Vectors & 3D Geometry', topics: ['Dot & Cross Products', 'Direction Cosines, Lines & Planes in 3D'] },
    ],
  },
  {
    name: 'Biology (Botany & Zoology)',
    code: 'BIO-2',
    chapters: [
      { name: 'Reproduction in Plants & Humans', topics: ['Double Fertilization & Embryo Development', 'Human Reproductive System & Gametogenesis'] },
      { name: 'Genetics & Evolution', topics: ['Mendelian Inheritance & Sex Determination', 'DNA Replication, Transcription, Translation & Lac Operon'] },
      { name: 'Biology in Human Welfare & Biotechnology', topics: ['Immunity, Microbes & Plant Breeding', 'Recombinant DNA Technology, PCR & Applications'] },
      { name: 'Ecology & Environment', topics: ['Ecosystem Energy Flow', 'Biodiversity & Conservation'] },
    ],
  },
  {
    name: 'Computer Science / IT',
    code: 'CS-2',
    chapters: [
      { name: 'Object-Oriented Programming & GUI', topics: ['Classes, Objects & Inheritance', 'Control Structures & Data Validation'] },
      { name: 'Relational Database & SQL / Networking', topics: ['Normalization & SQL Queries', 'Network Protocols, Topologies & Cyber Security'] },
    ],
  },
  {
    name: 'Statistics',
    code: 'STA-2',
    chapters: [
      { name: 'Probability Distributions & Statistical Inference', topics: ['Binomial, Poisson & Normal Distributions', 'Sampling, Hypothesis Testing & Correlation/Regression'] },
    ],
  },
];

export const CHSE_ODISHA_ARTS_1ST_YEAR_SUBJECTS: SyllabusSubject[] = [
  CHSE_ENGLISH_1ST_YEAR,
  CHSE_MIL_ODIA,
  CHSE_MIL_HINDI,
  {
    name: 'History (Paper I: History of the World)',
    code: 'HIS-1',
    chapters: [
      { name: 'Unit I & II: Human Evolution & Ancient Civilisations', topics: ['Egypt, Mesopotamia & China River Valley Civilisations', 'Classical Greece & Rome'] },
      { name: 'Unit III & IV: Medieval World, Renaissance & Revolutions', topics: ['Feudalism & Rise of Islam', 'Renaissance, Industrial Revolution & World Revolutions'] },
    ],
  },
  {
    name: 'Political Science (Paper I: Political Theory & Indian Govt)',
    code: 'PSC-1',
    chapters: [
      { name: 'Foundations of Political Theory', topics: ['State, Sovereignty, Liberty, Equality & Justice', 'Rights & Citizenship'] },
      { name: 'Indian Constitution at Work', topics: ['Fundamental Rights & Duties', 'Executive, Legislature, Judiciary & Federalism'] },
    ],
  },
  {
    name: 'Economics (Paper I: Indian Economy & Statistics)',
    code: 'ECO-1',
    chapters: [
      { name: 'Indian Economic Development', topics: ['Status of Indian Economy & Demographic Features', 'Agriculture, Green Revolution, Industry & Poverty'] },
      { name: 'Statistics for Economics', topics: ['Collection & Presentation of Data', 'Measures of Central Tendency & Dispersion'] },
    ],
  },
  {
    name: 'Logic',
    code: 'LOG-1',
    chapters: [
      { name: 'Deductive & Inductive Logic', topics: ['Terms, Propositions & Square of Opposition', 'Syllogism, Fallacies & Mill Experimental Methods'] },
    ],
  },
  {
    name: 'Education',
    code: 'EDU-1',
    chapters: [
      { name: 'Foundations of Education', topics: ['Aims & Functions of Education', 'Formal, Informal & Non-formal Agencies', 'Educational Psychology Basics'] },
    ],
  },
  {
    name: 'Sociology & Geography',
    code: 'SOC-1',
    chapters: [
      { name: 'Introducing Sociology', topics: ['Society, Community, Social Groups & Institutions', 'Socialisation & Social Stratification'] },
      { name: 'Physical Geography & Maps', topics: ['Geomorphology, Climatology & Oceanography', 'Map Skills & Cartography'] },
    ],
  },
];

export const CHSE_ODISHA_ARTS_2ND_YEAR_SUBJECTS: SyllabusSubject[] = [
  CHSE_ENGLISH_2ND_YEAR,
  CHSE_MIL_ODIA,
  CHSE_MIL_HINDI,
  {
    name: 'History (Paper II: History of India & Odisha)',
    code: 'HIS-2',
    chapters: [
      { name: 'Ancient & Medieval India', topics: ['Harappan Civilization, Vedic Age, Mauryas & Guptas', 'Delhi Sultanate, Mughals & Bhakti/Sufi Movements'] },
      { name: 'Modern India & Freedom Movement (with Odisha)', topics: ['1857 Revolt, Gandhi & National Movement', 'Freedom Struggle & Formation of Separate Odisha Province'] },
    ],
  },
  {
    name: 'Political Science (Paper II: Democracy & International Affairs)',
    code: 'PSC-2',
    chapters: [
      { name: 'Democracy & Nation Building in India', topics: ['Party System, Elections & Coalition Politics', 'Panchayati Raj & Challenges to Nation Building'] },
      { name: 'Contemporary World Politics & India Foreign Policy', topics: ['UN, SAARC & International Organisations', 'India Relations with Neighbours & Major Powers'] },
    ],
  },
  {
    name: 'Economics (Paper II: Microeconomics & Macroeconomics)',
    code: 'ECO-2',
    chapters: [
      { name: 'Microeconomics', topics: ['Consumer Behaviour & Demand Elasticity', 'Production, Cost, Revenue & Market Forms (Perfect Competition/Monopoly)'] },
      { name: 'Macroeconomics', topics: ['National Income (GDP, GNP, NNP)', 'Money, Banking, Central Bank & Government Budget'] },
    ],
  },
  {
    name: 'Logic',
    code: 'LOG-2',
    chapters: [
      { name: 'Symbolic Logic & Rules of Inference', topics: ['Truth Tables & Propositional Logic', 'Laws of Thought & Scientific Hypothesis'] },
    ],
  },
  {
    name: 'Education',
    code: 'EDU-2',
    chapters: [
      { name: 'Educational Thinkers, Learning & Statistics', topics: ['Gandhi, Tagore, Vivekananda, Rousseau & Dewey', 'Learning Theories, Motivation & Educational Statistics'] },
    ],
  },
  {
    name: 'Psychology, Home Science & Geography',
    code: 'PSY-2',
    chapters: [
      { name: 'Psychology: Intelligence, Personality & Disorders', topics: ['Intelligence Tests & Theories', 'Stress, Coping & Psychological Disorders'] },
      { name: 'Human Geography & Indian Resources', topics: ['Population, Agriculture, Minerals & Transport in India & Odisha', 'Map Work & Statistical Diagrams'] },
    ],
  },
  {
    name: 'Elective Odia & Elective Hindi',
    code: 'EL-LANG',
    chapters: [
      { name: 'ସାହିତ୍ୟ ସମୀକ୍ଷା ଓ ଇତିହାସ (Elective Odia)', topics: ['ଓଡ଼ିଆ ସାହିତ୍ୟର ଯୁଗ ବିଭାଗ, ରସ ଓ ଅଳଙ୍କାର'] },
      { name: 'हिंदी साहित्य एवं काव्यशास्त्र (Elective Hindi)', topics: ['आधुनिक हिंदी गद्य-पद्य एवं रस-छंद-अलंकार'] },
    ],
  },
];
