import { execFile } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import type {
  GeneratedVideoRecord,
  VideoDiagramSpec,
  VideoDurationMinutes,
  VideoGenerationJobRecord,
  VideoLanguage,
  VideoLessonPlan,
  VideoScene,
  VideoStageId,
} from '../src/types.ts';
import {
  ensurePrivateStorageDirs,
  getCurrentMonthKey,
  readDb,
  resolveSafeVideoAssetPath,
  VIDEO_TMP_DIR,
  writeDb,
  type GeneratedVideoStored,
} from './db.ts';
import { generateCompletion, normalizeUpstreamError } from './providers.ts';
import {
  buildEducationalSlideSvg,
  buildThumbnailSvg,
  getResolutionForQuality,
  maybeGenerateDiagramImageBase64,
  rasterizeSvgToPng,
} from './diagramRenderer.ts';
import { probeAudioDurationSeconds, synthesizeTeacherVoiceClip } from './ttsProvider.ts';

const execFileAsync = promisify(execFile);

const activeWorkerJobIds = new Set<string>();

function updateJobProgress(
  jobId: string,
  patch: Partial<VideoGenerationJobRecord>,
): VideoGenerationJobRecord | null {
  const db = readDb();
  const job = db.videoJobs.find((j) => j.id === jobId);
  if (!job) return null;
  Object.assign(job, patch, { updatedAt: Date.now() });
  writeDb(db);
  return job;
}

function getStageMeta(stage: VideoStageId): { label: string; percent: number } {
  switch (stage) {
    case 'queued':
      return { label: 'Queued for Generation', percent: 4 };
    case 'understanding-topic':
      return { label: 'Understanding Topic', percent: 12 };
    case 'creating-script':
      return { label: 'Creating Lesson Script', percent: 26 };
    case 'preparing-scenes':
      return { label: 'Preparing Educational Scenes', percent: 40 };
    case 'generating-diagrams':
      return { label: 'Generating Diagrams', percent: 55 };
    case 'creating-voice':
      return { label: 'Creating Teacher Voice', percent: 70 };
    case 'synchronizing-subtitles':
      return { label: 'Synchronizing Subtitles', percent: 82 };
    case 'rendering-mp4':
      return { label: 'Rendering MP4', percent: 92 };
    case 'completed':
      return { label: 'Completed', percent: 100 };
    case 'failed':
      return { label: 'Failed', percent: 0 };
  }
}

function getSceneTargetCount(durationMinutes: VideoDurationMinutes): {
  scenesCount: number;
  targetWords: number;
} {
  if (durationMinutes === 2) return { scenesCount: 5, targetWords: 230 };
  if (durationMinutes === 3) return { scenesCount: 7, targetWords: 340 };
  return { scenesCount: 9, targetWords: 520 };
}

function getLanguageScriptInstructions(language: VideoLanguage): string {
  if (language === 'odia') {
    return `ALL output text — lesson title, introduction, learning objectives, definitions, examples, scene titles, narrationScript, visualDescription, diagram node labels, onScreenBullets, formulaOrHighlight, highlightedKeywords, subtitleText, summary, and revisionQuestions — MUST be written in clear, grammatically natural Odia (ଓଡ଼ିଆ Unicode script). Standard mathematical symbols, chemical formulas, or proper scientific constants (e.g., F = ma, H₂O, CO₂) may remain standard alongside Odia explanations.`;
  }
  if (language === 'hindi') {
    return `ALL output text — lesson title, introduction, learning objectives, definitions, examples, scene titles, narrationScript, visualDescription, diagram node labels, onScreenBullets, formulaOrHighlight, highlightedKeywords, subtitleText, summary, and revisionQuestions — MUST be written in natural, accurate Hindi (Devanagari script). Keep standard formulas/symbols clear alongside Hindi.`;
  }
  return `ALL output text MUST be written in clear, student-friendly, classroom-grade English.`;
}

function extractJsonObject(rawText: string): Record<string, unknown> {
  const cleaned = rawText
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace <= firstBrace) {
    throw new Error('AI lesson planner did not return valid JSON.');
  }
  const slice = cleaned.slice(firstBrace, lastBrace + 1);
  return JSON.parse(slice) as Record<string, unknown>;
}

function sanitizeDiagramSpec(
  rawSpec: unknown,
  fallbackTitle: string,
): VideoDiagramSpec {
  const spec = (rawSpec && typeof rawSpec === 'object' ? rawSpec : {}) as Record<
    string,
    unknown
  >;
  const validTypes = new Set([
    'cycle',
    'flowchart',
    'labeled-concept',
    'comparison',
    'timeline',
    'formula-graph',
    'geometry-physics',
  ]);
  const rawType = typeof spec.diagramType === 'string' ? spec.diagramType : 'flowchart';
  const diagramType = (
    validTypes.has(rawType) ? rawType : 'flowchart'
  ) as VideoDiagramSpec['diagramType'];

  const rawNodes = Array.isArray(spec.nodes) ? spec.nodes : [];
  const nodes = rawNodes
    .slice(0, 6)
    .map((n, idx) => {
      const obj = (n && typeof n === 'object' ? n : {}) as Record<string, unknown>;
      return {
        id: typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim() : `n${idx + 1}`,
        label:
          typeof obj.label === 'string' && obj.label.trim()
            ? obj.label.trim().slice(0, 60)
            : `Step ${idx + 1}`,
        sublabel:
          typeof obj.sublabel === 'string' && obj.sublabel.trim()
            ? obj.sublabel.trim().slice(0, 75)
            : undefined,
      };
    })
    .filter((n) => n.label.length > 0);

  if (nodes.length === 0) {
    nodes.push(
      { id: 'n1', label: fallbackTitle.slice(0, 32), sublabel: 'Core Concept' },
      { id: 'n2', label: 'Key Mechanism', sublabel: 'How it works' },
      { id: 'n3', label: 'Exam Application', sublabel: 'Key Result' },
    );
  }

  const edges = Array.isArray(spec.edges)
    ? spec.edges.slice(0, 8).map((e) => {
        const obj = (e && typeof e === 'object' ? e : {}) as Record<string, unknown>;
        return {
          from: typeof obj.from === 'string' ? obj.from : 'n1',
          to: typeof obj.to === 'string' ? obj.to : 'n2',
          label: typeof obj.label === 'string' ? obj.label.slice(0, 24) : undefined,
        };
      })
    : undefined;

  return {
    diagramType,
    title:
      typeof spec.title === 'string' && spec.title.trim()
        ? spec.title.trim().slice(0, 70)
        : fallbackTitle.slice(0, 70),
    caption:
      typeof spec.caption === 'string' && spec.caption.trim()
        ? spec.caption.trim().slice(0, 80)
        : undefined,
    formula:
      typeof spec.formula === 'string' && spec.formula.trim()
        ? spec.formula.trim().slice(0, 80)
        : undefined,
    nodes,
    edges,
  };
}

function normalizeLessonPlan(
  parsed: Record<string, unknown>,
  job: VideoGenerationJobRecord,
  scenesCount: number,
): VideoLessonPlan {
  const fallbackTitle = job.topic;
  const rawScenes = Array.isArray(parsed.scenes) ? parsed.scenes : [];
  if (rawScenes.length === 0) {
    throw new Error('Generated lesson script did not include educational scenes.');
  }

  const perSceneTargetSec = Math.max(14, Math.round((job.durationMinutes * 60) / scenesCount));

  const scenes: VideoScene[] = rawScenes.slice(0, Math.max(scenesCount, 12)).map((item, idx) => {
    const s = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const sceneTitle =
      typeof s.sceneTitle === 'string' && s.sceneTitle.trim()
        ? s.sceneTitle.trim()
        : `Part ${idx + 1}: ${job.topic}`;
    const narration =
      typeof s.narrationScript === 'string' && s.narrationScript.trim()
        ? s.narrationScript.trim()
        : `${sceneTitle}. ${job.topic}`;
    const subtitleText =
      typeof s.subtitleText === 'string' && s.subtitleText.trim()
        ? s.subtitleText.trim()
        : narration;

    const bullets = Array.isArray(s.onScreenBullets)
      ? s.onScreenBullets
          .filter((b): b is string => typeof b === 'string' && b.trim().length > 0)
          .slice(0, 4)
      : [sceneTitle];

    const keywords = Array.isArray(s.highlightedKeywords)
      ? s.highlightedKeywords
          .filter((k): k is string => typeof k === 'string' && k.trim().length > 0)
          .slice(0, 5)
      : [job.topic.slice(0, 24)];

    return {
      sceneIndex: idx,
      sceneTitle,
      narrationScript: narration,
      visualDescription:
        typeof s.visualDescription === 'string' && s.visualDescription.trim()
          ? s.visualDescription.trim()
          : `Animated concept slide explaining ${sceneTitle}`,
      diagramSpec: sanitizeDiagramSpec(s.diagramSpec, sceneTitle),
      onScreenBullets: bullets.length > 0 ? bullets : [sceneTitle],
      highlightedKeywords: keywords.length > 0 ? keywords : [job.topic.slice(0, 24)],
      formulaOrHighlight:
        typeof s.formulaOrHighlight === 'string' && s.formulaOrHighlight.trim()
          ? s.formulaOrHighlight.trim()
          : undefined,
      estimatedSeconds:
        typeof s.estimatedSeconds === 'number' && s.estimatedSeconds >= 8
          ? Math.min(60, Math.round(s.estimatedSeconds))
          : perSceneTargetSec,
      subtitleText,
    };
  });

  const strList = (v: unknown, limit = 6) =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).slice(0, limit)
      : [];

  const defs = Array.isArray(parsed.importantDefinitions)
    ? parsed.importantDefinitions
        .slice(0, 6)
        .map((d) => {
          const obj = (d && typeof d === 'object' ? d : {}) as Record<string, unknown>;
          return {
            term: typeof obj.term === 'string' ? obj.term.trim() : '',
            definition: typeof obj.definition === 'string' ? obj.definition.trim() : '',
          };
        })
        .filter((d) => d.term && d.definition)
    : [];

  return {
    title:
      typeof parsed.title === 'string' && parsed.title.trim()
        ? parsed.title.trim()
        : fallbackTitle,
    introduction:
      typeof parsed.introduction === 'string' && parsed.introduction.trim()
        ? parsed.introduction.trim()
        : `Animated lesson on ${fallbackTitle}`,
    learningObjectives: strList(parsed.learningObjectives, 5),
    stepByStepExplanation: strList(parsed.stepByStepExplanation, 6),
    importantDefinitions: defs,
    examples: strList(parsed.examples, 4),
    diagramExplanation:
      typeof parsed.diagramExplanation === 'string' ? parsed.diagramExplanation.trim() : '',
    summary:
      typeof parsed.summary === 'string' && parsed.summary.trim()
        ? parsed.summary.trim()
        : `Summary of ${fallbackTitle}`,
    revisionQuestions: strList(parsed.revisionQuestions, 4),
    scenes,
  };
}

function formatSrtTimestamp(sec: number): string {
  const totalMs = Math.max(0, Math.round(sec * 1000));
  const hrs = Math.floor(totalMs / 3600000);
  const mins = Math.floor((totalMs % 3600000) / 60000);
  const secs = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function formatVttTimestamp(sec: number): string {
  return formatSrtTimestamp(sec).replace(',', '.');
}

function splitCaptionChunks(text: string): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [''];
  // Split gently on sentence punctuation first, then keep <= 78 chars per cue
  const sentences = clean
    .split(/(?<=[।.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const cues: string[] = [];
  for (const sent of sentences.length > 0 ? sentences : [clean]) {
    if (sent.length <= 78) {
      cues.push(sent);
    } else {
      const words = sent.split(' ');
      let buf = '';
      for (const w of words) {
        if (!buf) {
          buf = w;
        } else if (buf.length + 1 + w.length <= 74) {
          buf += ` ${w}`;
        } else {
          cues.push(buf);
          buf = w;
        }
      }
      if (buf) cues.push(buf);
    }
  }
  return cues.length > 0 ? cues : [clean];
}

function buildSynchronizedSubtitles(
  scenes: VideoScene[],
  sceneClipDurations: number[],
): { vtt: string; srt: string } {
  const vttLines = ['WEBVTT', ''];
  const srtLines: string[] = [];
  let cueIndex = 1;
  let timelineCursor = 0;

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const clipDur = sceneClipDurations[i] || 5;
    const chunks = splitCaptionChunks(scene.subtitleText || scene.narrationScript);
    const totalChars = chunks.reduce((s, c) => s + Math.max(1, c.length), 0);
    // Keep last 0.3s silent tail clean
    const activeSpeechSpan = Math.max(1.2, clipDur - 0.3);
    let localCursor = 0;

    for (let c = 0; c < chunks.length; c++) {
      const chunk = chunks[c];
      const weight = Math.max(1, chunk.length) / Math.max(1, totalChars);
      const chunkDur =
        c === chunks.length - 1
          ? Math.max(0.8, activeSpeechSpan - localCursor)
          : Math.max(0.8, activeSpeechSpan * weight);
      const startSec = timelineCursor + localCursor;
      const endSec = Math.min(timelineCursor + clipDur - 0.05, startSec + chunkDur);

      vttLines.push(`${cueIndex}`);
      vttLines.push(`${formatVttTimestamp(startSec)} --> ${formatVttTimestamp(endSec)}`);
      vttLines.push(chunk);
      vttLines.push('');

      srtLines.push(`${cueIndex}`);
      srtLines.push(`${formatSrtTimestamp(startSec)} --> ${formatSrtTimestamp(endSec)}`);
      srtLines.push(chunk);
      srtLines.push('');

      cueIndex++;
      localCursor += chunkDur;
    }

    timelineCursor += clipDur;
  }

  return {
    vtt: vttLines.join('\n'),
    srt: srtLines.join('\n'),
  };
}

async function renderSceneAnimatedClip(params: {
  framePaths: [string, string, string];
  wavPath: string;
  sceneDurationSec: number;
  width: number;
  height: number;
  outputMp4Path: string;
}): Promise<number> {
  const { framePaths, wavPath, sceneDurationSec, width, height, outputMp4Path } = params;
  // Total clip duration = measured speech audio + 0.35s smooth transition tail
  const totalDur = Math.max(3.6, Number((sceneDurationSec + 0.35).toFixed(2)));
  const fadeDur = 0.45;
  const seg1 = Number((totalDur * 0.30).toFixed(2));
  const seg2 = Number((totalDur * 0.35).toFixed(2));
  const seg3 = Number((totalDur - seg1 - seg2).toFixed(2));

  const offset1 = Number(Math.max(0.4, seg1 - fadeDur).toFixed(2));
  const offset2 = Number(Math.max(offset1 + 0.6, seg1 + seg2 - 2 * fadeDur).toFixed(2));
  const input1Dur = Number((seg1 + fadeDur).toFixed(2));
  const input2Dur = Number((seg2 + fadeDur).toFixed(2));
  const input3Dur = Number((seg3 + fadeDur + 0.4).toFixed(2));

  // Pad audio to exact totalDur so video & audio never drift
  const filterComplex = [
    `[0:v]scale=${width}:${height},format=yuv420p[v0]`,
    `[1:v]scale=${width}:${height},format=yuv420p[v1]`,
    `[2:v]scale=${width}:${height},format=yuv420p[v2]`,
    `[v0][v1]xfade=transition=fade:duration=${fadeDur}:offset=${offset1}[vf1]`,
    `[vf1][v2]xfade=transition=slideleft:duration=${fadeDur}:offset=${offset2},trim=duration=${totalDur},setpts=PTS-STARTPTS[vout]`,
    `[3:a]aresample=44100,aformat=channel_layouts=stereo,apad=whole_dur=${totalDur}[aout]`,
  ].join(';');

  await execFileAsync('ffmpeg', [
    '-y',
    '-loop',
    '1',
    '-t',
    String(input1Dur),
    '-i',
    framePaths[0],
    '-loop',
    '1',
    '-t',
    String(input2Dur),
    '-i',
    framePaths[1],
    '-loop',
    '1',
    '-t',
    String(input3Dur),
    '-i',
    framePaths[2],
    '-i',
    wavPath,
    '-filter_complex',
    filterComplex,
    '-map',
    '[vout]',
    '-map',
    '[aout]',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '23',
    '-r',
    '25',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-t',
    String(totalDur),
    outputMp4Path,
  ]);

  const actualClipDur = await probeAudioDurationSeconds(outputMp4Path);
  return actualClipDur > 0 ? actualClipDur : totalDur;
}

async function probeMp4Validity(mp4Path: string): Promise<{
  valid: boolean;
  durationSeconds: number;
}> {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'stream=codec_type:format=duration',
      '-of',
      'json',
      mp4Path,
    ]);
    const parsed = JSON.parse(stdout) as {
      streams?: Array<{ codec_type?: string }>;
      format?: { duration?: string };
    };
    const types = new Set((parsed.streams || []).map((s) => s.codec_type));
    const dur = Number.parseFloat(parsed.format?.duration || '0');
    return {
      valid: types.has('video') && types.has('audio') && Number.isFinite(dur) && dur > 1,
      durationSeconds: Number.isFinite(dur) ? Number(dur.toFixed(2)) : 0,
    };
  } catch {
    return { valid: false, durationSeconds: 0 };
  }
}

async function executeVideoGenerationJob(jobId: string): Promise<void> {
  ensurePrivateStorageDirs();
  const jobWorkDir = path.join(VIDEO_TMP_DIR, jobId);
  fs.mkdirSync(jobWorkDir, { recursive: true });

  let totalCostUsd = 0;
  const dbSnapshot = readDb();
  const initialJob = dbSnapshot.videoJobs.find((j) => j.id === jobId);
  if (!initialJob) return;

  const videoConfig = dbSnapshot.videoConfig;
  const videoId = `vid-${crypto.randomUUID().slice(0, 10)}`;
  const videoKey = `${videoId}.mp4`;
  const thumbKey = `${videoId}.png`;
  const vttKey = `${videoId}.vtt`;
  const srtKey = `${videoId}.srt`;

  const finalMp4Path = resolveSafeVideoAssetPath('video', videoKey);
  const finalThumbPath = resolveSafeVideoAssetPath('thumbnail', thumbKey);
  const finalVttPath = resolveSafeVideoAssetPath('vtt', vttKey);
  const finalSrtPath = resolveSafeVideoAssetPath('srt', srtKey);

  try {
    // STEP 1: Understanding Topic
    const s1 = getStageMeta('understanding-topic');
    updateJobProgress(jobId, {
      status: 'processing',
      stage: 'understanding-topic',
      stageLabel: s1.label,
      progressPercent: s1.percent,
      errorMessage: undefined,
    });

    const { scenesCount, targetWords } = getSceneTargetCount(initialJob.durationMinutes);
    const syllabusContext = [
      initialJob.examName ? `Examination/Board: ${initialJob.examName}` : '',
      initialJob.classLabel ? `Class/Paper: ${initialJob.classLabel}` : '',
      initialJob.subject ? `Subject: ${initialJob.subject}` : '',
      initialJob.chapter ? `Chapter: ${initialJob.chapter}` : '',
      initialJob.syllabusTopic ? `Syllabus Topic: ${initialJob.syllabusTopic}` : '',
      initialJob.customTopic ? `Custom Focus: ${initialJob.customTopic}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    // STEP 2: Creating Lesson Script
    const s2 = getStageMeta('creating-script');
    updateJobProgress(jobId, {
      stage: 'creating-script',
      stageLabel: s2.label,
      progressPercent: s2.percent,
    });

    const scriptPrompt = `Create a structured animated educational video lesson plan on the topic:
"${initialJob.topic}"

Context:
${syllabusContext || 'General Academic Curriculum'}
Target Duration: ${initialJob.durationMinutes} minutes (${scenesCount} scenes total, total narration roughly ${targetWords} words across all scenes).
Language Rule: ${getLanguageScriptInstructions(initialJob.language)}

Return STRICT valid JSON only (no markdown outside JSON) with this exact structure:
{
  "title": "Lesson Title",
  "introduction": "Brief welcoming overview",
  "learningObjectives": ["Objective 1", "Objective 2", "Objective 3"],
  "stepByStepExplanation": ["Step 1", "Step 2", "Step 3"],
  "importantDefinitions": [{"term": "Term", "definition": "Clear definition"}],
  "examples": ["Real-world or solved exam example"],
  "diagramExplanation": "How the visual diagrams connect concepts",
  "summary": "Concise lesson recap",
  "revisionQuestions": ["Practice question 1", "Practice question 2"],
  "scenes": [
    {
      "sceneTitle": "Concise slide heading",
      "narrationScript": "Clear natural spoken teacher explanation (2-4 sentences, spoken classroom tone, NO bullet symbols or markdown)",
      "visualDescription": "What appears visually on the animated educational slide",
      "diagramSpec": {
        "diagramType": "cycle | flowchart | labeled-concept | comparison | timeline | formula-graph | geometry-physics",
        "title": "Short diagram heading",
        "caption": "Short caption or key takeaway",
        "formula": "Optional formula/equation if applicable",
        "nodes": [
          {"id": "n1", "label": "Short node label", "sublabel": "Optional 2-4 word detail"}
        ],
        "edges": [
          {"from": "n1", "to": "n2", "label": "Optional link label"}
        ]
      },
      "onScreenBullets": ["Short crisp point 1", "Short crisp point 2", "Short crisp point 3"],
      "highlightedKeywords": ["Keyword 1", "Keyword 2", "Keyword 3"],
      "formulaOrHighlight": "Key formula, definition, or exam takeaway (short)",
      "subtitleText": "Exact spoken subtitle text matching narrationScript",
      "estimatedSeconds": 22
    }
  ]
}

Important:
- Cover Introduction, Learning Objectives, Step-by-step Concepts, Definitions, Examples, Diagram Explanation, Summary, and Revision Questions across the ${scenesCount} scenes!
- Choose the most educational diagramType for each scene (e.g., "cycle" for biological/water/carbon cycles, "geometry-physics" for force/optics/triangles, "formula-graph" for math/physics laws, "comparison" for differences, "timeline" for history, "flowchart" for processes).
- Keep narrationScript natural to speak aloud cleanly without markdown characters like ** or #.`;

    const scriptSelectionMode =
      initialJob.selectionMode || videoConfig.defaultScriptProvider || 'auto';
    const scriptRes = await generateCompletion({
      selectionMode: scriptSelectionMode,
      provider:
        initialJob.provider ||
        (scriptSelectionMode === 'ollama' ? 'ollama' : 'gemini'),
      model: initialJob.model || '',
      systemInstruction:
        'You are an expert curriculum video scriptwriter and academic instructional designer. Always output valid JSON.',
      messages: [{ role: 'user', content: scriptPrompt }],
      responseMimeType: 'application/json',
    });

    totalCostUsd += scriptRes.providerUsed === 'gemini' ? 0.008 : 0.001;

    // STEP 3: Preparing Educational Scenes
    const s3 = getStageMeta('preparing-scenes');
    updateJobProgress(jobId, {
      stage: 'preparing-scenes',
      stageLabel: s3.label,
      progressPercent: s3.percent,
    });

    const parsedJson = extractJsonObject(scriptRes.text);
    const lessonPlan = normalizeLessonPlan(parsedJson, initialJob, scenesCount);

    updateJobProgress(jobId, {
      lessonTitle: lessonPlan.title,
      sceneCount: lessonPlan.scenes.length,
    });

    // STEP 4: Generating Diagrams
    const s4 = getStageMeta('generating-diagrams');
    updateJobProgress(jobId, {
      stage: 'generating-diagrams',
      stageLabel: s4.label,
      progressPercent: s4.percent,
    });

    const diagramImages: Array<string | undefined> = [];
    let diagramProviderUsed = 'svg-vector';
    for (let i = 0; i < lessonPlan.scenes.length; i++) {
      const diag = await maybeGenerateDiagramImageBase64({
        diagramProvider: videoConfig.diagramProvider,
        scene: lessonPlan.scenes[i],
        topic: initialJob.topic,
      });
      diagramImages.push(diag.base64);
      if (diag.providerUsed === 'gemini-image') {
        diagramProviderUsed = 'gemini-image';
        totalCostUsd += 0.02;
      }
    }

    // STEP 5: Creating Teacher Voice (Dedicated Speech Generation Provider)
    const s5 = getStageMeta('creating-voice');
    updateJobProgress(jobId, {
      stage: 'creating-voice',
      stageLabel: s5.label,
      progressPercent: s5.percent,
    });

    const sceneWavPaths: string[] = [];
    const sceneAudioDurations: number[] = [];
    let ttsProviderUsed: string = videoConfig.ttsProvider;
    let voiceUsed: string = videoConfig.voices[initialJob.language] || 'Kore';

    for (let i = 0; i < lessonPlan.scenes.length; i++) {
      if (i > 0) {
        await new Promise((r) => setTimeout(r, 1000));
      }
      const scene = lessonPlan.scenes[i];
      const wavPath = path.join(jobWorkDir, `scene_${i}.wav`);
      const ttsRes = await synthesizeTeacherVoiceClip({
        text: scene.narrationScript,
        language: initialJob.language,
        config: videoConfig,
        outputWavPath: wavPath,
      });
      sceneWavPaths.push(ttsRes.wavPath);
      sceneAudioDurations.push(ttsRes.durationSeconds);
      scene.actualAudioSeconds = ttsRes.durationSeconds;
      ttsProviderUsed = ttsRes.providerUsed;
      voiceUsed = ttsRes.voiceUsed;
      totalCostUsd += ttsRes.estimatedCostUsd;
    }

    // STEP 6: Synchronizing Subtitles
    const s6 = getStageMeta('synchronizing-subtitles');
    updateJobProgress(jobId, {
      stage: 'synchronizing-subtitles',
      stageLabel: s6.label,
      progressPercent: s6.percent,
    });

    // Each scene clip duration is exact speech audio + 0.35s tail
    const plannedClipDurations = sceneAudioDurations.map((d) =>
      Math.max(3.6, Number((d + 0.35).toFixed(2))),
    );

    // STEP 7: Rendering MP4 (Animated Progressive Slides + Diagrams + Subtitles + Audio)
    const s7 = getStageMeta('rendering-mp4');
    updateJobProgress(jobId, {
      stage: 'rendering-mp4',
      stageLabel: s7.label,
      progressPercent: s7.percent,
    });

    const { width, height } = getResolutionForQuality(videoConfig.videoQuality);
    const subjectLabel =
      [initialJob.subject, initialJob.classLabel].filter(Boolean).join(' · ') ||
      initialJob.examName ||
      'PadhloAI';

    const sceneMp4Paths: string[] = [];
    const actualClipDurations: number[] = [];

    for (let i = 0; i < lessonPlan.scenes.length; i++) {
      const scene = lessonPlan.scenes[i];
      const f1 = path.join(jobWorkDir, `scene_${i}_f1.png`);
      const f2 = path.join(jobWorkDir, `scene_${i}_f2.png`);
      const f3 = path.join(jobWorkDir, `scene_${i}_f3.png`);

      for (const [step, outPng] of [
        [1, f1],
        [2, f2],
        [3, f3],
      ] as const) {
        const svg = buildEducationalSlideSvg({
          scene,
          totalScenes: lessonPlan.scenes.length,
          lessonTitle: lessonPlan.title,
          subjectLabel,
          language: initialJob.language,
          revealStep: step,
          diagramImageBase64: diagramImages[i],
        });
        await rasterizeSvgToPng(
          svg,
          path.join(jobWorkDir, `scene_${i}_f${step}.svg`),
          outPng,
          width,
          height,
        );
      }

      const sceneClipPath = path.join(jobWorkDir, `scene_${i}.mp4`);
      const realClipDur = await renderSceneAnimatedClip({
        framePaths: [f1, f2, f3],
        wavPath: sceneWavPaths[i],
        sceneDurationSec: sceneAudioDurations[i],
        width,
        height,
        outputMp4Path: sceneClipPath,
      });
      sceneMp4Paths.push(sceneClipPath);
      actualClipDurations.push(realClipDur);
    }

    // Build synchronized subtitles using real measured clip durations
    const subs = buildSynchronizedSubtitles(
      lessonPlan.scenes,
      actualClipDurations.length === lessonPlan.scenes.length
        ? actualClipDurations
        : plannedClipDurations,
    );
    fs.writeFileSync(finalVttPath, subs.vtt, 'utf8');
    fs.writeFileSync(finalSrtPath, subs.srt, 'utf8');

    // Concatenate all scene clips + embed soft mov_text subtitles + faststart
    const concatListPath = path.join(jobWorkDir, 'concat_list.txt');
    const concatBody = sceneMp4Paths
      .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
      .join('\n');
    fs.writeFileSync(concatListPath, concatBody, 'utf8');

    await execFileAsync('ffmpeg', [
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      concatListPath,
      '-i',
      finalSrtPath,
      '-map',
      '0:v',
      '-map',
      '0:a',
      '-map',
      '1:0',
      '-c:v',
      'copy',
      '-c:a',
      'copy',
      '-c:s',
      'mov_text',
      '-metadata:s:s:0',
      `language=${initialJob.language === 'hindi' ? 'hin' : initialJob.language === 'odia' ? 'ori' : 'eng'}`,
      '-movflags',
      '+faststart',
      finalMp4Path,
    ]);

    // Validate final MP4 stream integrity
    const probe = await probeMp4Validity(finalMp4Path);
    if (!probe.valid || !fs.existsSync(finalMp4Path)) {
      throw new Error('Rendered MP4 failed stream verification.');
    }

    // Render crisp video thumbnail
    const allKeywords = Array.from(
      new Set(lessonPlan.scenes.flatMap((sc) => sc.highlightedKeywords || [])),
    ).slice(0, 8);

    const thumbSvg = buildThumbnailSvg({
      lessonTitle: lessonPlan.title,
      subjectLabel,
      topic: initialJob.topic,
      language: initialJob.language,
      durationMinutes: initialJob.durationMinutes,
      keywords: allKeywords,
    });
    await rasterizeSvgToPng(
      thumbSvg,
      path.join(jobWorkDir, 'thumb.svg'),
      finalThumbPath,
      width,
      height,
    );

    const fileStats = fs.statSync(finalMp4Path);
    const roundedCost = Number(totalCostUsd.toFixed(4));

    // STEP 8: Atomic Commit & Credit Deduction ONLY AFTER Successful MP4 Completion
    const db = readDb();
    const job = db.videoJobs.find((j) => j.id === jobId);
    const sub = db.videoSubscriptions.find(
      (s) => s.studentId === initialJob.studentId && s.status === 'active',
    );

    if (sub && sub.creditsRemaining > 0) {
      sub.creditsRemaining = Math.max(0, sub.creditsRemaining - 1);
      sub.updatedAt = Date.now();
    }

    const videoRecord: GeneratedVideoStored = {
      id: videoId,
      jobId,
      studentId: initialJob.studentId,
      title: lessonPlan.title,
      topic: initialJob.topic,
      examId: initialJob.examId,
      examName: initialJob.examName,
      classId: initialJob.classId,
      classLabel: initialJob.classLabel,
      subject: initialJob.subject,
      chapter: initialJob.chapter,
      language: initialJob.language,
      requestedDurationMinutes: initialJob.durationMinutes,
      actualDurationSeconds: probe.durationSeconds,
      quality: videoConfig.videoQuality,
      fileSizeBytes: fileStats.size,
      sceneCount: lessonPlan.scenes.length,
      highlightedKeywords: allKeywords,
      lessonSummary: lessonPlan.summary,
      learningObjectives: lessonPlan.learningObjectives,
      revisionQuestions: lessonPlan.revisionQuestions,
      aiProviderUsed: scriptRes.providerUsed,
      aiModelUsed: scriptRes.modelUsed,
      ttsProviderUsed,
      voiceUsed,
      diagramProviderUsed,
      estimatedCostUsd: roundedCost,
      status: 'completed',
      createdAt: Date.now(),
      videoStorageKey: videoKey,
      thumbnailStorageKey: thumbKey,
      vttStorageKey: vttKey,
      srtStorageKey: srtKey,
    };

    db.generatedVideos.unshift(videoRecord);
    db.videoCostLedger.unshift({
      id: `cost-${crypto.randomUUID().slice(0, 8)}`,
      jobId,
      studentId: initialJob.studentId,
      monthKey: getCurrentMonthKey(),
      costUsd: roundedCost,
      provider: `${scriptRes.providerUsed}+${ttsProviderUsed}`,
      createdAt: Date.now(),
    });

    if (job) {
      const doneMeta = getStageMeta('completed');
      job.status = 'completed';
      job.stage = 'completed';
      job.stageLabel = doneMeta.label;
      job.progressPercent = doneMeta.percent;
      job.videoId = videoId;
      job.lessonTitle = lessonPlan.title;
      job.sceneCount = lessonPlan.scenes.length;
      job.estimatedCostUsd = roundedCost;
      job.creditDeducted = true;
      job.completedAt = Date.now();
      job.updatedAt = Date.now();
    }

    writeDb(db);
  } catch (err) {
    // Cleanup any partial output assets on failure; NEVER deduct credit!
    for (const p of [finalMp4Path, finalThumbPath, finalVttPath, finalSrtPath]) {
      try {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } catch {
        // Ignore cleanup errors
      }
    }
    const norm = normalizeUpstreamError(err);
    const errMsg = norm.message || 'Video generation failed unexpectedly.';
    updateJobProgress(jobId, {
      status: 'failed',
      stage: 'failed',
      stageLabel: 'Failed — No credit deducted',
      progressPercent: 0,
      errorMessage: `${errMsg} (No video credit was deducted.)`,
      estimatedCostUsd: Number(totalCostUsd.toFixed(4)),
      creditDeducted: false,
    });
  } finally {
    // Always remove intermediate WAV/PNG/SVG temp files
    try {
      fs.rmSync(jobWorkDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

export function pumpVideoQueue(): void {
  const db = readDb();
  const maxConcurrent = db.videoConfig.maxConcurrentJobs || 2;
  if (activeWorkerJobIds.size >= maxConcurrent) return;

  const queuedJobs = db.videoJobs
    .filter((j) => j.status === 'queued' && !activeWorkerJobIds.has(j.id))
    .sort((a, b) => a.createdAt - b.createdAt);

  for (const job of queuedJobs) {
    if (activeWorkerJobIds.size >= maxConcurrent) break;
    activeWorkerJobIds.add(job.id);
    void executeVideoGenerationJob(job.id).finally(() => {
      activeWorkerJobIds.delete(job.id);
      pumpVideoQueue();
    });
  }
}

export function getPublicVideoRecordForStudent(
  rec: GeneratedVideoStored,
): GeneratedVideoRecord {
  const {
    videoStorageKey: _v,
    thumbnailStorageKey: _t,
    vttStorageKey: _vtt,
    srtStorageKey: _srt,
    ...safe
  } = rec;
  return safe;
}
