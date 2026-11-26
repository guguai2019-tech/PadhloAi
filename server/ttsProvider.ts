import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { GoogleGenAI } from '@google/genai';
import type { AdminVideoConfig, TtsProviderId, VideoLanguage } from '../src/types.ts';
import { hasGeminiApiKey } from './geminiProvider.ts';

const execFileAsync = promisify(execFile);

export const GEMINI_TTS_VOICES = [
  { id: 'Kore', label: 'Kore — Clear Female Educator (Warm & Articulate)' },
  { id: 'Puck', label: 'Puck — Friendly Teacher Voice (Energetic & Clear)' },
  { id: 'Charon', label: 'Charon — Calm Senior Lecturer (Deep & Steady)' },
  { id: 'Zephyr', label: 'Zephyr — Bright Instructor (Crisp & Engaging)' },
  { id: 'Fenrir', label: 'Fenrir — Authoritative Explainer (Strong & Steady)' },
] as const;

export interface TtsSynthesisResult {
  wavPath: string;
  durationSeconds: number;
  providerUsed: TtsProviderId;
  voiceUsed: string;
  estimatedCostUsd: number;
}

function getLanguageSpeechDirective(language: VideoLanguage): {
  style: string;
  langName: string;
} {
  if (language === 'odia') {
    return {
      langName: 'Odia',
      style:
        'Warm, clear, patient Indian school teacher speaking natural Odia with crisp pronunciation and educational pacing',
    };
  }
  if (language === 'hindi') {
    return {
      langName: 'Hindi',
      style:
        'Warm, clear, articulate Indian teacher speaking natural Hindi with steady classroom pacing and emphasis on key concepts',
    };
  }
  return {
    langName: 'English',
    style:
      'Clear, warm, engaging educational teacher explaining concepts step by step at steady classroom pace',
  };
}

export async function probeAudioDurationSeconds(filePath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);
    const parsed = Number.parseFloat(stdout.trim());
    if (Number.isFinite(parsed) && parsed > 0.2) {
      return Number(parsed.toFixed(2));
    }
  } catch {
    // Fallback below if ffprobe cannot parse
  }
  return 0;
}

export function getTtsProviderHealth(config: AdminVideoConfig): {
  provider: TtsProviderId;
  configured: boolean;
  available: boolean;
  message: string;
} {
  if (config.ttsProvider === 'custom-http-tts') {
    const url = (config.customTtsUrl || process.env.TTS_API_URL || '').trim();
    if (!url) {
      return {
        provider: 'custom-http-tts',
        configured: false,
        available: false,
        message:
          'Custom HTTP TTS URL is not set. Configure Custom TTS URL in Admin or set TTS_API_URL in server secrets.',
      };
    }
    return {
      provider: 'custom-http-tts',
      configured: true,
      available: true,
      message: `Custom HTTP Speech Provider configured (${url}).`,
    };
  }

  const hasKey = hasGeminiApiKey();
  return {
    provider: 'gemini-tts',
    configured: hasKey,
    available: hasKey,
    message: hasKey
      ? `Gemini Speech Engine (${config.ttsModel || 'gemini-3.8-flash-lite-tts'}) is connected via server-side key.`
      : 'GEMINI_API_KEY is missing on server; Gemini Speech Generation is unavailable.',
  };
}

async function normalizeToStandardWav(
  inputPath: string,
  outputWavPath: string,
  mimeType = 'audio/wav',
): Promise<number> {
  const headBuf = fs.readFileSync(inputPath).subarray(0, 4);
  const isRiffWav = headBuf.toString('ascii') === 'RIFF';
  const looksLikeRawPcm =
    !isRiffWav &&
    (mimeType.toLowerCase().includes('l16') ||
      mimeType.toLowerCase().includes('pcm') ||
      mimeType.toLowerCase().includes('raw'));

  const ffmpegArgs = looksLikeRawPcm
    ? [
        '-y',
        '-f',
        's16le',
        '-ar',
        '24000',
        '-ac',
        '1',
        '-i',
        inputPath,
        '-ar',
        '24000',
        '-ac',
        '1',
        '-c:a',
        'pcm_s16le',
        outputWavPath,
      ]
    : ['-y', '-i', inputPath, '-ar', '24000', '-ac', '1', '-c:a', 'pcm_s16le', outputWavPath];

  await execFileAsync('ffmpeg', ffmpegArgs);
  const dur = await probeAudioDurationSeconds(outputWavPath);
  if (dur <= 0.2) {
    throw new Error('Synthesized speech audio clip was empty or corrupted.');
  }
  return dur;
}

function isSchemaFieldMismatchError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || '');
  return (
    msg.includes('Invalid JSON payload') ||
    msg.includes('Cannot find field') ||
    msg.includes('Unknown name') ||
    msg.includes('speechMetadata') ||
    msg.includes('speechConfig')
  );
}

const GEMINI_TTS_STRATEGIES: Array<{
  apiVersion: 'v1beta' | 'v1alpha';
  includeSpeechMetadata: boolean;
  includeSpeechConfig: boolean;
}> = [
  { apiVersion: 'v1beta', includeSpeechMetadata: true, includeSpeechConfig: true },
  { apiVersion: 'v1alpha', includeSpeechMetadata: true, includeSpeechConfig: true },
  { apiVersion: 'v1beta', includeSpeechMetadata: false, includeSpeechConfig: true },
  { apiVersion: 'v1alpha', includeSpeechMetadata: false, includeSpeechConfig: true },
  { apiVersion: 'v1beta', includeSpeechMetadata: false, includeSpeechConfig: false },
];

let cachedWinningStrategyIdx: number | null = null;

function isRateLimitOrTransientError(err: unknown): { is429: boolean; is5xx: boolean } {
  const msg = (err instanceof Error ? err.message : String(err || '')).toLowerCase();
  const status = (err as { status?: number })?.status;
  const is429 =
    status === 429 ||
    msg.includes('resource_exhausted') ||
    msg.includes('"code":429') ||
    msg.includes('rate limit') ||
    msg.includes('quota');
  const is5xx =
    status === 503 ||
    msg.includes('"code":503') ||
    msg.includes('unavailable') ||
    msg.includes('overloaded') ||
    msg.includes('timeout') ||
    msg.includes('network');
  return { is429, is5xx };
}

async function invokeGeminiTtsOnce(params: {
  apiKey: string;
  model: string;
  cleanText: string;
  style: string;
  voiceName: string;
  strategy: (typeof GEMINI_TTS_STRATEGIES)[number];
}): Promise<{ data: string; mimeType: string }> {
  const { apiKey, model, cleanText, style, voiceName, strategy } = params;
  const ai = new GoogleGenAI({
    apiKey,
    apiVersion: strategy.apiVersion,
    httpOptions: {
      apiVersion: strategy.apiVersion,
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const partPayload: Record<string, unknown> = { text: cleanText };
  if (strategy.includeSpeechMetadata) {
    partPayload.speechMetadata = { style };
  }

  const configPayload: Record<string, unknown> = {
    responseModalities: ['AUDIO'],
  };
  if (strategy.includeSpeechConfig) {
    configPayload.speechConfig = {
      voiceConfig: {
        prebuiltVoiceConfig: {
          voiceName,
        },
      },
    };
  }

  const response = await Promise.race([
    ai.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [partPayload as unknown as { text: string }],
        },
      ],
      config: configPayload,
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Gemini TTS request timed out after 30s.')), 30000),
    ),
  ]);

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const audioPart = parts.find((p) => Boolean(p?.inlineData?.data));
  const data = audioPart?.inlineData?.data;
  if (!data) {
    throw new Error('Speech synthesis provider returned empty audio.');
  }
  return {
    data,
    mimeType: audioPart?.inlineData?.mimeType || 'audio/wav',
  };
}

async function synthesizeWithGeminiTts(
  text: string,
  language: VideoLanguage,
  voiceName: string,
  modelId: string,
  outputWavPath: string,
): Promise<TtsSynthesisResult> {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'Speech generation failed: GEMINI_API_KEY is not configured on the server.',
    );
  }

  const cleanText = text.replace(/\s+/g, ' ').trim();
  if (!cleanText) {
    throw new Error('Cannot synthesize empty scene narration script.');
  }

  const directive = getLanguageSpeechDirective(language);
  const validVoice = GEMINI_TTS_VOICES.some((v) => v.id === voiceName) ? voiceName : 'Kore';
  const primaryModel =
    modelId === 'gemini-3.8-flash-tts' ? 'gemini-3.8-flash-tts' : 'gemini-3.8-flash-lite-tts';
  const backupModel =
    primaryModel === 'gemini-3.8-flash-lite-tts'
      ? 'gemini-3.8-flash-tts'
      : 'gemini-3.8-flash-lite-tts';

  // Order strategies with cached working index first so subsequent scenes do 1 API call only
  const strategyOrder =
    cachedWinningStrategyIdx !== null
      ? [
          cachedWinningStrategyIdx,
          ...GEMINI_TTS_STRATEGIES.map((_, i) => i).filter((i) => i !== cachedWinningStrategyIdx),
        ]
      : GEMINI_TTS_STRATEGIES.map((_, i) => i);

  let audioResult: { data: string; mimeType: string } | null = null;
  let lastError: unknown = null;

  for (const modelCandidate of [primaryModel, backupModel]) {
    let modelExhaustedRateLimit = false;
    for (const sIdx of strategyOrder) {
      const strategy = GEMINI_TTS_STRATEGIES[sIdx];
      const delays = [3500, 7500, 14000];
      for (let attempt = 0; attempt <= delays.length; attempt++) {
        try {
          audioResult = await invokeGeminiTtsOnce({
            apiKey,
            model: modelCandidate,
            cleanText,
            style: directive.style,
            voiceName: validVoice,
            strategy,
          });
          cachedWinningStrategyIdx = sIdx;
          break;
        } catch (err) {
          lastError = err;
          if (isSchemaFieldMismatchError(err)) {
            break; // Immediately try next schema strategy
          }
          const { is429, is5xx } = isRateLimitOrTransientError(err);
          if ((is429 || is5xx) && attempt < delays.length) {
            await new Promise((r) => setTimeout(r, delays[attempt]));
            continue;
          }
          if (is429) {
            modelExhaustedRateLimit = true;
            break;
          }
          throw err;
        }
      }
      if (audioResult || modelExhaustedRateLimit) break;
    }
    if (audioResult) break;
  }

  if (!audioResult) {
    throw lastError instanceof Error
      ? lastError
      : new Error('Speech synthesis failed on all API versions.');
  }

  const rawBuf = Buffer.from(audioResult.data, 'base64');
  const rawPath = `${outputWavPath}.raw.audio`;
  fs.writeFileSync(rawPath, rawBuf);
  try {
    const durationSeconds = await normalizeToStandardWav(
      rawPath,
      outputWavPath,
      audioResult.mimeType,
    );
    const estimatedCostUsd = Number(((cleanText.length / 1000) * 0.004).toFixed(5));
    return {
      wavPath: outputWavPath,
      durationSeconds,
      providerUsed: 'gemini-tts',
      voiceUsed: validVoice,
      estimatedCostUsd,
    };
  } finally {
    if (fs.existsSync(rawPath)) fs.unlinkSync(rawPath);
  }
}

async function synthesizeWithCustomHttpTts(
  text: string,
  language: VideoLanguage,
  voiceName: string,
  config: AdminVideoConfig,
  outputWavPath: string,
): Promise<TtsSynthesisResult> {
  const endpointUrl = (config.customTtsUrl || process.env.TTS_API_URL || '').trim();
  if (!endpointUrl) {
    throw new Error(
      'Custom HTTP TTS provider selected, but no TTS endpoint URL is configured.',
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(endpointUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Invalid protocol');
    }
  } catch {
    throw new Error('Invalid Custom HTTP TTS URL configuration.');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const apiKey = (process.env.TTS_API_KEY || '').trim();
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const cleanText = text.replace(/\s+/g, ' ').trim();
  const res = await fetch(parsed.toString(), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: process.env.TTS_MODEL || 'tts-1',
      input: cleanText,
      voice: voiceName || 'alloy',
      language,
      response_format: 'wav',
    }),
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(
      `Custom HTTP TTS failed (${res.status}): ${msg.slice(0, 180) || res.statusText}`,
    );
  }

  const arr = await res.arrayBuffer();
  const rawBuf = Buffer.from(arr);
  if (rawBuf.length < 256) {
    throw new Error('Custom HTTP TTS returned insufficient audio bytes.');
  }
  const rawPath = path.join(
    path.dirname(outputWavPath),
    `${path.basename(outputWavPath, '.wav')}.raw.audio`,
  );
  fs.writeFileSync(rawPath, rawBuf);
  try {
    const durationSeconds = await normalizeToStandardWav(rawPath, outputWavPath);
    const estimatedCostUsd = Number(((cleanText.length / 1000) * 0.005).toFixed(5));
    return {
      wavPath: outputWavPath,
      durationSeconds,
      providerUsed: 'custom-http-tts',
      voiceUsed: voiceName || 'default',
      estimatedCostUsd,
    };
  } finally {
    if (fs.existsSync(rawPath)) fs.unlinkSync(rawPath);
  }
}

export async function synthesizeTeacherVoiceClip(params: {
  text: string;
  language: VideoLanguage;
  config: AdminVideoConfig;
  outputWavPath: string;
}): Promise<TtsSynthesisResult> {
  const { text, language, config, outputWavPath } = params;
  const voiceName = config.voices?.[language] || 'Kore';

  if (config.ttsProvider === 'custom-http-tts') {
    return synthesizeWithCustomHttpTts(text, language, voiceName, config, outputWavPath);
  }

  return synthesizeWithGeminiTts(
    text,
    language,
    voiceName,
    config.ttsModel || 'gemini-3.8-flash-lite-tts',
    outputWavPath,
  );
}
