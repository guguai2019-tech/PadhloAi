import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Captions,
  CaptionsOff,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  parseWebVttCues,
  type PlayableVideoItem,
  type SubtitleCue,
} from '../utils/videoApi';

interface EducationalVideoPlayerProps {
  video: PlayableVideoItem;
}

function formatDurationMMSS(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export const EducationalVideoPlayer: React.FC<EducationalVideoPlayerProps> = ({
  video,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(video.actualDurationSeconds || 0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [cues, setCues] = useState<SubtitleCue[]>([]);
  const [videoError, setVideoError] = useState<string | null>(null);

  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(video.actualDurationSeconds || 0);
    setVideoError(null);

    let cancelled = false;
    fetch(video.vttUrl, { cache: 'no-store' })
      .then((res) => (res.ok ? res.text() : ''))
      .then((text) => {
        if (!cancelled && text) {
          setCues(parseWebVttCues(text));
        }
      })
      .catch(() => {
        // Native track still works if fetch fails
      });
    return () => {
      cancelled = true;
    };
  }, [video.id, video.vttUrl, video.actualDurationSeconds]);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const activeCue = useMemo(() => {
    return cues.find((c) => currentTime >= c.startSec && currentTime <= c.endSec) || null;
  }, [cues, currentTime]);

  const togglePlayPause = () => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play();
    } else {
      el.pause();
    }
  };

  const handleRestart = () => {
    const el = videoRef.current;
    if (!el) return;
    el.currentTime = 0;
    void el.play();
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = Number.parseFloat(e.target.value);
    const el = videoRef.current;
    if (!el || !Number.isFinite(next)) return;
    el.currentTime = next;
    setCurrentTime(next);
  };

  const toggleMute = () => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = !el.muted;
    setIsMuted(el.muted);
  };

  const cycleSpeed = () => {
    const speeds = [1, 1.25, 1.5, 0.75];
    const idx = speeds.indexOf(playbackRate);
    const next = speeds[(idx + 1) % speeds.length];
    setPlaybackRate(next);
    if (videoRef.current) {
      videoRef.current.playbackRate = next;
    }
  };

  const toggleFullscreen = () => {
    const box = containerRef.current;
    if (!box) return;
    if (!document.fullscreenElement) {
      void box.requestFullscreen?.();
    } else {
      void document.exitFullscreen?.();
    }
  };

  const renderHighlightedCue = (text: string) => {
    const keywords = (video.highlightedKeywords || []).filter((k) => k.trim().length > 2);
    if (keywords.length === 0) return text;
    const escaped = keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const regex = new RegExp(`(${escaped.join('|')})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, idx) => {
      const matched = keywords.some((k) => k.toLowerCase() === part.toLowerCase());
      return matched ? (
        <span
          key={idx}
          className="px-1 rounded bg-amber-400/25 text-amber-200 font-bold"
        >
          {part}
        </span>
      ) : (
        <React.Fragment key={idx}>{part}</React.Fragment>
      );
    });
  };

  return (
    <div className="space-y-4">
      <div
        ref={containerRef}
        className="relative rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shadow-lg"
      >
        <div className="relative aspect-video bg-black flex items-center justify-center">
          <video
            ref={videoRef}
            src={video.streamUrl}
            poster={video.thumbnailUrl}
            playsInline
            preload="metadata"
            onClick={togglePlayPause}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => setIsPlaying(false)}
            onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            onLoadedMetadata={(e) => {
              if (e.currentTarget.duration > 0) {
                setDuration(e.currentTarget.duration);
              }
            }}
            onError={() =>
              setVideoError('Unable to stream video playback. Refresh your session or retry.')
            }
            className="w-full h-full object-contain cursor-pointer"
          />

          {/* Synchronized Subtitle Overlay (Toggled by Show/Hide Subtitles button) */}
          {showSubtitles && activeCue && (
            <div className="pointer-events-none absolute inset-x-4 bottom-4 flex justify-center">
              <div className="max-w-3xl px-4 py-2 rounded-xl bg-slate-950/85 border border-white/15 text-center text-sm sm:text-base font-medium text-white leading-snug shadow-md">
                {renderHighlightedCue(activeCue.text)}
              </div>
            </div>
          )}

          {!isPlaying && !videoError && (
            <button
              type="button"
              onClick={togglePlayPause}
              aria-label="Play educational video"
              className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-colors"
            >
              <span className="w-16 h-16 rounded-full bg-violet-600/95 hover:bg-violet-500 text-white flex items-center justify-center shadow-xl border-2 border-white/60">
                <Play className="w-7 h-7 ml-0.5" />
              </span>
            </button>
          )}

          {videoError && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/90 p-6 text-center text-red-300 text-sm">
              {videoError}
            </div>
          )}
        </div>

        {/* Custom Control Bar */}
        <div className="bg-slate-900 px-3 sm:px-4 py-2.5 border-t border-slate-800 space-y-2">
          <div className="flex items-center gap-2.5">
            <span className="text-xs font-mono text-slate-300 w-11 shrink-0">
              {formatDurationMMSS(currentTime)}
            </span>
            <input
              type="range"
              min={0}
              max={Math.max(1, duration)}
              step={0.1}
              value={Math.min(currentTime, Math.max(1, duration))}
              onChange={handleSeek}
              aria-label="Seek video timeline"
              className="flex-1 accent-violet-500 cursor-pointer h-1.5"
            />
            <span className="text-xs font-mono text-slate-400 w-11 text-right shrink-0">
              {formatDurationMMSS(duration)}
            </span>
          </div>

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={togglePlayPause}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold min-h-[34px]"
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                <span>{isPlaying ? 'Pause' : currentTime > 0 ? 'Resume' : 'Play'}</span>
              </button>
              <button
                type="button"
                onClick={handleRestart}
                title="Restart video"
                className="p-2 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={toggleMute}
                title={isMuted ? 'Unmute audio' : 'Mute audio'}
                className="p-2 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowSubtitles((s) => !s)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border min-h-[34px] ${
                  showSubtitles
                    ? 'bg-violet-600/25 border-violet-400/60 text-violet-200'
                    : 'bg-slate-800 border-slate-700 text-slate-300'
                }`}
              >
                {showSubtitles ? (
                  <Captions className="w-4 h-4" />
                ) : (
                  <CaptionsOff className="w-4 h-4" />
                )}
                <span>{showSubtitles ? 'Subtitles On' : 'Subtitles Off'}</span>
              </button>

              <button
                type="button"
                onClick={cycleSpeed}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold min-h-[34px]"
              >
                {playbackRate}x
              </button>

              <button
                type="button"
                onClick={toggleFullscreen}
                aria-label="Toggle Fullscreen"
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
              >
                {isFullscreen ? (
                  <Minimize2 className="w-4 h-4" />
                ) : (
                  <Maximize2 className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Educational Notes & Revision Questions below Player */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/70 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-violet-700 dark:text-violet-300">
            <BookOpen className="w-4 h-4" />
            <span>Lesson Summary &amp; Objectives</span>
          </div>
          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
            {video.lessonSummary}
          </p>
          {video.learningObjectives.length > 0 && (
            <ul className="list-disc pl-5 text-xs text-slate-600 dark:text-slate-400 space-y-1">
              {video.learningObjectives.map((obj, idx) => (
                <li key={idx}>{obj}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/70 space-y-2">
          <div className="text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
            Quick Revision Questions &amp; Keywords
          </div>
          {video.revisionQuestions.length > 0 && (
            <ol className="list-decimal pl-5 text-sm text-slate-700 dark:text-slate-300 space-y-1">
              {video.revisionQuestions.map((q, idx) => (
                <li key={idx}>{q}</li>
              ))}
            </ol>
          )}
          {video.highlightedKeywords.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {video.highlightedKeywords.map((kw, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 rounded-md bg-violet-100 dark:bg-violet-950/60 text-violet-800 dark:text-violet-200 text-xs font-semibold"
                >
                  {kw}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
