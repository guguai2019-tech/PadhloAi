import type {
  AdminVideoConfig,
  AdminVideoOverviewResponse,
  AiSelectionMode,
  GeneratedVideoRecord,
  ProviderId,
  StudentRecord,
  StudentVideoWalletResponse,
  VideoDurationMinutes,
  VideoGenerationJobRecord,
  VideoLanguage,
} from '../types';

export interface PlayableVideoItem extends GeneratedVideoRecord {
  mediaTicket: string;
  streamUrl: string;
  thumbnailUrl: string;
  vttUrl: string;
}

export interface SubtitleCue {
  startSec: number;
  endSec: number;
  text: string;
}

async function apiJson<T>(
  url: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(url, {
    cache: 'no-store',
    ...options,
    headers,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export function fetchPublicVideoConfig(): Promise<StudentVideoWalletResponse['config']> {
  return apiJson<StudentVideoWalletResponse['config']>('/api/videos/config');
}

export function signInStudentWithPasscode(payload: {
  name: string;
  email: string;
  passcode?: string;
  rollNumber?: string;
  classLevel?: string;
  examId?: string;
}): Promise<{ token: string; student: StudentRecord | null }> {
  return apiJson<{ token: string; student: StudentRecord | null }>('/api/student/session', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchStudentVideoWallet(token: string): Promise<StudentVideoWalletResponse> {
  return apiJson<StudentVideoWalletResponse>('/api/videos/wallet', { method: 'GET' }, token);
}

export function createVideoSubscriptionOrder(token: string): Promise<{
  orderId: string;
  orderToken: string;
  planName: string;
  amountInr: number;
  currency: string;
  validityMonths: number;
  creditsGranted: number;
  gatewayMode: 'razorpay' | 'verified-edu-checkout';
  razorpayKeyId?: string;
}> {
  return apiJson('/api/videos/subscription/order', { method: 'POST', body: JSON.stringify({}) }, token);
}

export function verifyVideoSubscriptionPayment(
  token: string,
  payload: {
    orderToken: string;
    paymentId?: string;
    razorpaySignature?: string;
    paymentMethod?: string;
  },
): Promise<{
  ok: boolean;
  subscription: NonNullable<StudentVideoWalletResponse['subscription']>;
  hasActiveSubscription: boolean;
  effectiveCreditsRemaining: number;
}> {
  return apiJson(
    '/api/videos/subscription/verify',
    { method: 'POST', body: JSON.stringify(payload) },
    token,
  );
}

export function startVideoGenerationJob(
  token: string,
  payload: {
    topic: string;
    customTopic?: string;
    examId?: string;
    examName?: string;
    classId?: string;
    classLabel?: string;
    subject?: string;
    chapter?: string;
    syllabusTopic?: string;
    language: VideoLanguage;
    durationMinutes: VideoDurationMinutes;
    selectionMode?: AiSelectionMode;
    provider?: ProviderId;
    model?: string;
  },
): Promise<{ job: VideoGenerationJobRecord; deduplicated?: boolean }> {
  return apiJson<{ job: VideoGenerationJobRecord; deduplicated?: boolean }>(
    '/api/videos/generate',
    { method: 'POST', body: JSON.stringify(payload) },
    token,
  );
}

export function fetchStudentVideoJobs(
  token: string,
): Promise<{ jobs: VideoGenerationJobRecord[] }> {
  return apiJson<{ jobs: VideoGenerationJobRecord[] }>('/api/videos/jobs', { method: 'GET' }, token);
}

export function retryFailedVideoJob(
  token: string,
  jobId: string,
): Promise<{ job: VideoGenerationJobRecord }> {
  return apiJson<{ job: VideoGenerationJobRecord }>(
    `/api/videos/jobs/${encodeURIComponent(jobId)}/retry`,
    { method: 'POST', body: JSON.stringify({}) },
    token,
  );
}

export function fetchStudentVideos(
  token: string,
): Promise<{ videos: PlayableVideoItem[] }> {
  return apiJson<{ videos: PlayableVideoItem[] }>('/api/videos', { method: 'GET' }, token);
}

export function deleteStudentVideo(
  token: string,
  videoId: string,
): Promise<{ ok: boolean }> {
  return apiJson<{ ok: boolean }>(
    `/api/videos/${encodeURIComponent(videoId)}`,
    { method: 'DELETE' },
    token,
  );
}

export function fetchAdminVideoOverview(
  token: string,
): Promise<AdminVideoOverviewResponse> {
  return apiJson<AdminVideoOverviewResponse>(
    '/api/admin/videos/overview',
    { method: 'GET' },
    token,
  );
}

export function updateAdminVideoConfig(
  token: string,
  patch: Partial<AdminVideoConfig>,
): Promise<{
  config: AdminVideoConfig;
  ttsStatus: AdminVideoOverviewResponse['ttsStatus'];
}> {
  return apiJson(
    '/api/admin/videos/config',
    { method: 'PUT', body: JSON.stringify(patch) },
    token,
  );
}

export function cleanupFailedVideoJobs(
  token: string,
): Promise<{ removedCount: number }> {
  return apiJson(
    '/api/admin/videos/cleanup-failed',
    { method: 'POST', body: JSON.stringify({}) },
    token,
  );
}

export function adminGrantVideoCredits(
  token: string,
  payload: { studentId: string; credits?: number; months?: number },
): Promise<{ subscription: NonNullable<StudentVideoWalletResponse['subscription']> }> {
  return apiJson(
    '/api/admin/videos/grant-credits',
    { method: 'POST', body: JSON.stringify(payload) },
    token,
  );
}

function parseVttTimestampToSeconds(ts: string): number {
  const clean = ts.trim().replace(',', '.');
  const parts = clean.split(':');
  if (parts.length === 3) {
    return (
      Number.parseFloat(parts[0]) * 3600 +
      Number.parseFloat(parts[1]) * 60 +
      Number.parseFloat(parts[2])
    );
  }
  if (parts.length === 2) {
    return Number.parseFloat(parts[0]) * 60 + Number.parseFloat(parts[1]);
  }
  return 0;
}

export function parseWebVttCues(vttText: string): SubtitleCue[] {
  const lines = vttText.replace(/\r\n/g, '\n').split('\n');
  const cues: SubtitleCue[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (line.includes('-->')) {
      const [startStr, endStr] = line.split('-->').map((s) => s.trim().split(' ')[0]);
      const startSec = parseVttTimestampToSeconds(startStr);
      const endSec = parseVttTimestampToSeconds(endStr);
      i++;
      const textParts: string[] = [];
      while (i < lines.length && lines[i].trim() !== '') {
        textParts.push(lines[i].trim());
        i++;
      }
      if (textParts.length > 0 && Number.isFinite(startSec) && Number.isFinite(endSec)) {
        cues.push({
          startSec,
          endSec,
          text: textParts.join(' '),
        });
      }
    }
    i++;
  }
  return cues;
}
