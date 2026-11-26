import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  EyeOff,
  Landmark,
  Layers,
  Loader2,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import type {
  AppSettings,
  DifficultyLevel,
  MockLanguage,
  UpscGeneratedQuestionItem,
  UpscPublicCatalogResponse,
  UpscQuestionFormatId,
  UpscStage,
} from '../types';
import {
  fetchPublishedUpscSyllabus,
  generateUpscQuestionsApi,
} from '../utils/adminApi';
import { exportTextToPdf } from '../utils/pdfExport';
import { MarkdownRenderer } from './MarkdownRenderer';

interface UpscQuestionStudioProps {
  settings: AppSettings;
  upscCatalog?: UpscPublicCatalogResponse | null;
}

const PRELIMS_FORMATS: Array<{ id: UpscQuestionFormatId; label: string; desc: string }> = [
  { id: 'single-mcq', label: 'Prelims Single MCQ', desc: '4-option conceptual & current-linked MCQ' },
  { id: 'statement-based', label: 'Statement-Based', desc: 'Consider Statements I & II / How many pairs' },
  { id: 'match-following', label: 'Match the Following', desc: 'List I & List II pair matching' },
  { id: 'assertion-reasoning', label: 'Assertion & Reason', desc: 'Statement (A) & Reason (R) analysis' },
  { id: 'concept-application', label: 'Concept Application', desc: 'Policy, economy & science application' },
  { id: 'csat-reasoning', label: 'CSAT Comprehension / Reasoning', desc: 'Reading passage, logic & numeracy' },
];

const MAINS_FORMATS: Array<{ id: UpscQuestionFormatId; label: string; desc: string }> = [
  { id: 'mains-10-mark', label: 'Mains 10-Mark (150 words)', desc: 'Concise analytical UPSC GS question' },
  { id: 'mains-15-mark', label: 'Mains 15-Mark (250 words)', desc: 'Multi-dimensional critical evaluation' },
  { id: 'mains-20-mark', label: 'Mains 20-Mark (Optional/Case)', desc: 'In-depth ethics case or optional prompt' },
  { id: 'mains-essay', label: 'UPSC Essay Prompt', desc: 'Philosophical / socio-economic essay' },
  { id: 'mains-analytical', label: 'Directive Analytical Practice', desc: 'Critically examine / Discuss / Comment' },
];

export const UpscQuestionStudio: React.FC<UpscQuestionStudioProps> = ({
  settings,
  upscCatalog,
}) => {
  const [liveCatalog, setLiveCatalog] = useState<UpscPublicCatalogResponse | null>(
    upscCatalog ?? null,
  );
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  const [stage, setStage] = useState<UpscStage>('prelims');
  const [selectedPaperVersionId, setSelectedPaperVersionId] = useState<string>('');
  const [areaScope, setAreaScope] = useState<'all' | 'selected'>('all');
  const [selectedAreaIds, setSelectedAreaIds] = useState<string[]>([]);
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [selectedSubtopics, setSelectedSubtopics] = useState<string[]>([]);

  const [selectedFormats, setSelectedFormats] = useState<UpscQuestionFormatId[]>([
    'single-mcq',
    'statement-based',
  ]);
  const [questionCount, setQuestionCount] = useState<number>(8);
  const [mainsMarks, setMainsMarks] = useState<10 | 15 | 20>(15);
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('Mixed');
  const [language, setLanguage] = useState<MockLanguage>('english');

  const [generating, setGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [generatedQuestions, setGeneratedQuestions] = useState<UpscGeneratedQuestionItem[]>([]);
  const [metaResult, setMetaResult] = useState<{
    paperLabel: string;
    versionLabel: string;
    providerUsed: string;
    modelUsed: string;
  } | null>(null);
  const [showAnswers, setShowAnswers] = useState(true);
  const [copied, setCopied] = useState(false);

  const refreshCatalog = async () => {
    setLoadingCatalog(true);
    try {
      const data = await fetchPublishedUpscSyllabus();
      setLiveCatalog(data);
    } catch {
      // Keep last known
    } finally {
      setLoadingCatalog(false);
    }
  };

  useEffect(() => {
    if (upscCatalog) {
      setLiveCatalog(upscCatalog);
    } else {
      void refreshCatalog();
    }
  }, [upscCatalog]);

  const prelimsPapers = liveCatalog?.prelims || [];
  const mainsPapers = liveCatalog?.mains || [];
  const hasAnyPublished = prelimsPapers.length > 0 || mainsPapers.length > 0;

  useEffect(() => {
    if (stage === 'prelims' && prelimsPapers.length === 0 && mainsPapers.length > 0) {
      setStage('mains');
    } else if (stage === 'mains' && mainsPapers.length === 0 && prelimsPapers.length > 0) {
      setStage('prelims');
    }
  }, [stage, prelimsPapers.length, mainsPapers.length]);

  const stagePapers = stage === 'prelims' ? prelimsPapers : mainsPapers;

  useEffect(() => {
    if (
      stagePapers.length > 0 &&
      !stagePapers.some((p) => p.syllabusVersionId === selectedPaperVersionId)
    ) {
      setSelectedPaperVersionId(stagePapers[0].syllabusVersionId);
    }
  }, [stagePapers, selectedPaperVersionId]);

  useEffect(() => {
    if (stage === 'prelims') {
      setSelectedFormats(['single-mcq', 'statement-based']);
    } else {
      setSelectedFormats(['mains-15-mark', 'mains-analytical']);
    }
  }, [stage]);

  const activePaper = useMemo(
    () => stagePapers.find((p) => p.syllabusVersionId === selectedPaperVersionId) || null,
    [stagePapers, selectedPaperVersionId],
  );

  useEffect(() => {
    if (!activePaper) {
      setSelectedAreaIds([]);
      setSelectedTopicIds([]);
      setSelectedSubtopics([]);
      return;
    }
    setAreaScope('all');
    setSelectedAreaIds(activePaper.areas.map((a) => a.areaId));
    setSelectedTopicIds([]);
    setSelectedSubtopics([]);
  }, [activePaper?.syllabusVersionId]);

  const visibleTopics = useMemo(() => {
    if (!activePaper) return [];
    const areas =
      areaScope === 'all'
        ? activePaper.areas
        : activePaper.areas.filter((a) => selectedAreaIds.includes(a.areaId));
    return areas.flatMap((a) =>
      a.topics.map((t) => ({
        ...t,
        areaId: a.areaId,
        areaTitle: a.title,
      })),
    );
  }, [activePaper, areaScope, selectedAreaIds]);

  const visibleSubtopics = useMemo(() => {
    const tSet = new Set(selectedTopicIds);
    const scan = tSet.size > 0 ? visibleTopics.filter((t) => tSet.has(t.topicId)) : visibleTopics;
    return Array.from(new Set(scan.flatMap((t) => t.subtopics.map((s) => s.title))));
  }, [visibleTopics, selectedTopicIds]);

  const activeFormatCatalog = stage === 'prelims' ? PRELIMS_FORMATS : MAINS_FORMATS;

  const toggleFormat = (id: UpscQuestionFormatId) => {
    setSelectedFormats((prev) =>
      prev.includes(id)
        ? prev.length > 1
          ? prev.filter((x) => x !== id)
          : prev
        : [...prev, id],
    );
  };

  const handleGenerate = async () => {
    setErrorMsg('');
    if (!activePaper) {
      setErrorMsg('Select a published UPSC syllabus paper first.');
      return;
    }
    setGenerating(true);
    try {
      const res = await generateUpscQuestionsApi({
        syllabusVersionId: activePaper.syllabusVersionId,
        areaIds: areaScope === 'all' ? undefined : selectedAreaIds,
        topicIds: selectedTopicIds.length > 0 ? selectedTopicIds : undefined,
        subtopicNames: selectedSubtopics.length > 0 ? selectedSubtopics : undefined,
        formats: selectedFormats,
        count: questionCount,
        marks: mainsMarks,
        difficulty,
        language,
        selectionMode: settings.selectionMode,
        provider: settings.provider,
        model: settings.model,
      });

      setGeneratedQuestions(res.questions);
      setMetaResult({
        paperLabel: res.paperLabel,
        versionLabel: res.versionLabel,
        providerUsed: res.providerUsed,
        modelUsed: res.modelUsed,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'UPSC question generation failed.');
    } finally {
      setGenerating(false);
    }
  };

  const formatMarkdownExport = () => {
    return generatedQuestions
      .map((q) => {
        const lines: string[] = [
          `Q${q.id} [${q.format}${q.marks ? ` · ${q.marks} Marks` : ''}${q.wordLimit ? ` · ${q.wordLimit} Words` : ''} · ${q.areaTitle} — ${q.topicTitle}]:`,
        ];
        if (q.passage) lines.push(`Passage: ${q.passage}`);
        lines.push(q.question);
        if (q.options?.length) {
          lines.push(
            q.options.map((o, i) => `   (${String.fromCharCode(65 + i)}) ${o}`).join('\n'),
          );
        }
        if (typeof q.correctIndex === 'number' && q.options?.[q.correctIndex]) {
          lines.push(
            `   Answer: (${String.fromCharCode(65 + q.correctIndex)}) ${q.options[q.correctIndex]}`,
          );
        }
        if (q.explanation) lines.push(`   Explanation: ${q.explanation}`);
        if (q.modelPoints?.length) {
          lines.push(`   Model Answer Key Points:\n   - ${q.modelPoints.join('\n   - ')}`);
        }
        return lines.join('\n');
      })
      .join('\n\n');
  };

  if (!hasAnyPublished) {
    return (
      <div className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center space-y-4">
        <div className="w-12 h-12 mx-auto rounded-2xl bg-gradient-to-br from-[#4338CA] to-[#06B6D4] text-white flex items-center justify-center">
          <Landmark className="w-6 h-6" />
        </div>
        <h3 className="font-display font-bold text-lg text-[#0F172A] dark:text-white">
          No Admin-Published UPSC Syllabus Available Yet
        </h3>
        <p className="text-sm text-[#64748B] dark:text-slate-400 max-w-lg mx-auto">
          UPSC Prelims and Mains questions are strictly generated from Admin-uploaded and published UPSC syllabuses. Once Admin publishes a Prelims or Mains paper in Admin Panel, it synchronizes here automatically.
        </p>
        <button
          type="button"
          onClick={() => void refreshCatalog()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#4338CA] to-[#2563EB] text-white text-xs font-bold shadow-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingCatalog ? 'animate-spin' : ''}`} />
          <span>Check Published UPSC Syllabuses</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="no-print rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
        <div className="px-6 py-4 bg-gradient-to-r from-[#4338CA] to-[#2563EB] text-white flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-cyan-200 flex items-center gap-1.5">
              <Landmark className="w-3.5 h-3.5" />
              <span>Centralized Published UPSC Curriculum</span>
            </div>
            <h2 className="font-display font-bold text-xl mt-0.5">
              UPSC Civil Services Question Generator (Prelims &amp; Mains)
            </h2>
          </div>

          <button
            type="button"
            onClick={() => void refreshCatalog()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-xs font-semibold"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingCatalog ? 'animate-spin' : ''}`} />
            <span>Sync Syllabus</span>
          </button>
        </div>

        <div className="p-5 space-y-5 bg-[#F8FAFC] dark:bg-slate-950/60">
          {/* Stage & Published Paper Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <button
              type="button"
              disabled={prelimsPapers.length === 0}
              onClick={() => setStage('prelims')}
              className={`text-left p-4 rounded-xl border-2 transition-all ${
                stage === 'prelims'
                  ? 'border-[#4338CA] bg-indigo-50/70 dark:bg-indigo-950/40'
                  : 'border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 disabled:opacity-50'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-display font-bold text-sm text-[#0F172A] dark:text-white">
                  UPSC Prelims (Objective)
                </span>
                <span className="text-[11px] font-bold text-[#4338CA] dark:text-indigo-300 tabular-nums">
                  {prelimsPapers.length} Published
                </span>
              </div>
              <div className="text-xs text-[#64748B] dark:text-slate-400 mt-1">
                {prelimsPapers.length > 0
                  ? prelimsPapers.map((p) => p.paperLabel).join(' · ')
                  : 'No Prelims paper published yet.'}
              </div>
            </button>

            <button
              type="button"
              disabled={mainsPapers.length === 0}
              onClick={() => setStage('mains')}
              className={`text-left p-4 rounded-xl border-2 transition-all ${
                stage === 'mains'
                  ? 'border-[#2563EB] bg-blue-50/70 dark:bg-blue-950/40'
                  : 'border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 disabled:opacity-50'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-display font-bold text-sm text-[#0F172A] dark:text-white">
                  UPSC Mains (Analytical &amp; Essay)
                </span>
                <span className="text-[11px] font-bold text-[#2563EB] dark:text-cyan-300 tabular-nums">
                  {mainsPapers.length} Published
                </span>
              </div>
              <div className="text-xs text-[#64748B] dark:text-slate-400 mt-1">
                {mainsPapers.length > 0
                  ? mainsPapers.map((p) => p.paperLabel).join(' · ')
                  : 'No Mains paper published yet.'}
              </div>
            </button>
          </div>

          {stagePapers.length > 0 && (
            <div className="rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <label className="block text-xs font-bold text-[#0F172A] dark:text-white mb-1.5">
                Published UPSC Paper *
              </label>
              <select
                value={selectedPaperVersionId}
                onChange={(e) => setSelectedPaperVersionId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-sm font-medium"
              >
                {stagePapers.map((p) => (
                  <option key={p.syllabusVersionId} value={p.syllabusVersionId}>
                    {p.paperLabel}
                    {p.optionalSubjectName ? ` — ${p.optionalSubjectName}` : ''} · {p.versionLabel} ({p.areaCount} areas · {p.topicCount} topics)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Cascading Areas -> Topics -> Subtopics */}
          {activePaper && (
            <div className="rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 text-xs font-bold text-[#0F172A] dark:text-white">
                    <Layers className="w-4 h-4 text-[#4338CA]" />
                    <span>
                      Select Areas &amp; Topics — {activePaper.paperLabel}
                    </span>
                  </div>
                  <div className="text-[11px] text-[#64748B] dark:text-slate-400 mt-0.5 tabular-nums">
                    {activePaper.versionLabel} · {activePaper.areaCount} Areas · {activePaper.topicCount} Topics
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAreaScope('all');
                      setSelectedAreaIds(activePaper.areas.map((a) => a.areaId));
                      setSelectedTopicIds([]);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      areaScope === 'all'
                        ? 'bg-gradient-to-r from-[#4338CA] to-[#2563EB] text-white border-transparent'
                        : 'border-[#E2E8F0] dark:border-slate-700 text-[#64748B]'
                    }`}
                  >
                    Full Paper ({activePaper.areas.length} Areas)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAreaScope('selected');
                      if (selectedAreaIds.length === 0 && activePaper.areas[0]) {
                        setSelectedAreaIds([activePaper.areas[0].areaId]);
                      }
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      areaScope === 'selected'
                        ? 'bg-gradient-to-r from-[#4338CA] to-[#2563EB] text-white border-transparent'
                        : 'border-[#E2E8F0] dark:border-slate-700 text-[#64748B]'
                    }`}
                  >
                    Specific Areas / Topics
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-[#64748B]">
                    Published Subject Areas
                  </div>
                  <div className="max-h-52 overflow-y-auto space-y-1 p-2.5 rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-[#F8FAFC] dark:bg-slate-950">
                    {activePaper.areas.map((a) => {
                      const active = selectedAreaIds.includes(a.areaId);
                      return (
                        <label
                          key={a.areaId}
                          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-900 cursor-pointer text-xs"
                        >
                          <input
                            type="checkbox"
                            checked={active}
                            onChange={(e) => {
                              setAreaScope('selected');
                              setSelectedAreaIds((prev) => {
                                const next = e.target.checked
                                  ? Array.from(new Set([...prev, a.areaId]))
                                  : prev.filter((id) => id !== a.areaId);
                                return next.length > 0 ? next : [a.areaId];
                              });
                            }}
                            className="accent-[#4338CA]"
                          />
                          <span className="font-medium text-[#0F172A] dark:text-slate-200 flex-1">
                            {a.title}
                          </span>
                          <span className="text-[10px] text-[#64748B] tabular-nums">
                            {a.topics.length} topics
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#64748B]">
                      Published Topics (Optional filter)
                    </span>
                    {selectedTopicIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTopicIds([]);
                          setSelectedSubtopics([]);
                        }}
                        className="text-[11px] font-semibold text-[#2563EB] hover:underline"
                      >
                        Clear Topic Filter
                      </button>
                    )}
                  </div>
                  <div className="max-h-52 overflow-y-auto space-y-1 p-2.5 rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-[#F8FAFC] dark:bg-slate-950">
                    {visibleTopics.map((t) => {
                      const checked = selectedTopicIds.includes(t.topicId);
                      return (
                        <label
                          key={t.topicId}
                          className="flex items-start gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-900 cursor-pointer text-xs"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setSelectedTopicIds((prev) =>
                                e.target.checked
                                  ? Array.from(new Set([...prev, t.topicId]))
                                  : prev.filter((id) => id !== t.topicId),
                              );
                            }}
                            className="accent-[#2563EB] mt-0.5"
                          />
                          <div>
                            <div className="font-medium text-[#0F172A] dark:text-slate-200">
                              {t.title}
                            </div>
                            {t.subtopics.length > 0 && (
                              <div className="text-[10px] text-[#64748B] mt-0.5">
                                {t.subtopics.map((s) => s.title).join(' · ')}
                              </div>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              {visibleSubtopics.length > 0 && (
                <div className="space-y-1.5 pt-1 border-t border-[#E2E8F0] dark:border-slate-800">
                  <div className="text-[11px] font-semibold text-[#64748B]">
                    Subtopic Focus (Optional):
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                    {visibleSubtopics.slice(0, 36).map((sub) => {
                      const active = selectedSubtopics.includes(sub);
                      return (
                        <button
                          key={sub}
                          type="button"
                          onClick={() =>
                            setSelectedSubtopics((prev) =>
                              prev.includes(sub) ? prev.filter((s) => s !== sub) : [...prev, sub],
                            )
                          }
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                            active
                              ? 'bg-[#06B6D4] text-white border-[#06B6D4]'
                              : 'border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-[#0F172A] dark:text-slate-300'
                          }`}
                        >
                          {sub}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Formats & Controls */}
          <div className="rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold text-[#0F172A] dark:text-white">
              <SlidersHorizontal className="w-4 h-4 text-[#2563EB]" />
              <span>
                UPSC Question Formats ({selectedFormats.length} selected)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {activeFormatCatalog.map((fmt) => {
                const checked = selectedFormats.includes(fmt.id);
                return (
                  <label
                    key={fmt.id}
                    className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                      checked
                        ? 'border-[#4338CA] bg-indigo-50/60 dark:bg-indigo-950/30'
                        : 'border-[#E2E8F0] dark:border-slate-800 bg-[#F8FAFC] dark:bg-slate-950'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleFormat(fmt.id)}
                      className="accent-[#4338CA] mt-0.5"
                    />
                    <div>
                      <div className="text-xs font-bold text-[#0F172A] dark:text-white">
                        {fmt.label}
                      </div>
                      <div className="text-[11px] text-[#64748B] dark:text-slate-400">
                        {fmt.desc}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
              <div>
                <label className="block text-xs font-semibold text-[#64748B] mb-1">
                  Question Count (1–20)
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={questionCount}
                  onChange={(e) =>
                    setQuestionCount(Math.min(20, Math.max(1, Number(e.target.value) || 8)))
                  }
                  className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-sm tabular-nums"
                />
              </div>

              {stage === 'mains' && (
                <div>
                  <label className="block text-xs font-semibold text-[#64748B] mb-1">
                    Default Mains Weightage
                  </label>
                  <select
                    value={mainsMarks}
                    onChange={(e) => setMainsMarks(Number(e.target.value) as 10 | 15 | 20)}
                    className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-sm tabular-nums"
                  >
                    <option value={10}>10 Marks (150 Words)</option>
                    <option value={15}>15 Marks (250 Words)</option>
                    <option value={20}>20 Marks (300 Words)</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#64748B] mb-1">
                  Difficulty
                </label>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as DifficultyLevel)}
                  className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-sm"
                >
                  <option value="Mixed">Mixed (UPSC Standard)</option>
                  <option value="Easy">Conceptual Foundation</option>
                  <option value="Medium">Moderate Analytical</option>
                  <option value="Hard">High Analytical / Elimination</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#64748B] mb-1">
                  Language
                </label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as MockLanguage)}
                  className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-sm"
                >
                  <option value="english">English</option>
                  <option value="hindi">Hindi (हिंदी)</option>
                  <option value="odia">Odia (ଓଡ଼ିଆ)</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#E2E8F0] dark:border-slate-800">
              <div className="text-xs text-[#64748B] dark:text-slate-400">
                Active AI:{' '}
                <strong className="text-[#0F172A] dark:text-white">
                  {settings.selectionMode === 'auto'
                    ? 'Auto (Default Configured)'
                    : `${settings.provider.toUpperCase()} (${settings.model || 'Default'})`}
                </strong>
              </div>
              <button
                type="button"
                disabled={generating || !activePaper}
                onClick={() => void handleGenerate()}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#4338CA] to-[#2563EB] hover:from-[#3730A3] hover:to-[#1D4ED8] disabled:opacity-50 text-white text-sm font-bold shadow-xs"
              >
                {generating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Generating UPSC Questions...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Generate UPSC Questions</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3.5 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-sm text-[#DC2626] dark:text-red-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>
      </div>

      {generatedQuestions.length > 0 && (
        <div className="space-y-4">
          <div className="no-print flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-bold text-[#0F172A] dark:text-white tabular-nums">
                <CheckCircle2 className="w-4 h-4 text-[#16A34A]" />
                <span>Generated {generatedQuestions.length} UPSC Questions</span>
              </div>
              {metaResult && (
                <div className="text-xs text-[#64748B] dark:text-slate-400 mt-0.5">
                  {metaResult.paperLabel} · {metaResult.versionLabel} · {metaResult.providerUsed} ({metaResult.modelUsed})
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAnswers((s) => !s)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E2E8F0] dark:border-slate-700 text-xs font-semibold"
              >
                {showAnswers ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>{showAnswers ? 'Hide Keys / Hints' : 'Show Keys / Hints'}</span>
              </button>
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(formatMarkdownExport());
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1800);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E2E8F0] dark:border-slate-700 text-xs font-semibold"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-[#16A34A]" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  exportTextToPdf(
                    `UPSC — ${metaResult?.paperLabel || 'Practice Set'} (${metaResult?.versionLabel || ''})`,
                    formatMarkdownExport(),
                    `UPSC_${stage}_Questions.pdf`,
                  )
                }
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#4338CA] to-[#2563EB] text-white text-xs font-bold"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download PDF</span>
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {generatedQuestions.map((q) => (
              <div
                key={q.id}
                className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3 print-avoid-break"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-[#4338CA] dark:text-indigo-300 font-bold tabular-nums">
                      Q{q.id} · {q.format}
                    </span>
                    <span className="text-[#64748B] dark:text-slate-400">
                      {q.areaTitle} · {q.topicTitle}
                    </span>
                  </div>
                  {(q.marks || q.wordLimit) && (
                    <span className="font-semibold text-[#0F172A] dark:text-slate-200 tabular-nums">
                      {q.marks ? `${q.marks} Marks` : ''}
                      {q.marks && q.wordLimit ? ' · ' : ''}
                      {q.wordLimit ? `${q.wordLimit} Words` : ''}
                    </span>
                  )}
                </div>

                {q.passage && (
                  <div className="p-3 rounded-xl bg-[#F8FAFC] dark:bg-slate-950 border border-[#E2E8F0] dark:border-slate-800 text-xs leading-relaxed">
                    <div className="font-bold text-[#4338CA] dark:text-indigo-300 mb-1">Passage / Case Extract</div>
                    <MarkdownRenderer content={q.passage} />
                  </div>
                )}

                <div className="text-sm font-medium text-[#0F172A] dark:text-white">
                  <MarkdownRenderer content={q.question} />
                </div>

                {q.directiveNote && (
                  <div className="text-[11px] text-[#2563EB] dark:text-cyan-300 font-medium">
                    Directive Focus: {q.directiveNote}
                  </div>
                )}

                {q.options && q.options.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {q.options.map((opt, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-[#F8FAFC] dark:bg-slate-950 text-xs flex gap-2"
                      >
                        <span className="font-bold text-[#4338CA] dark:text-indigo-300">
                          {String.fromCharCode(65 + idx)}.
                        </span>
                        <MarkdownRenderer content={opt} />
                      </div>
                    ))}
                  </div>
                )}

                {showAnswers && (
                  <div className="p-3.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 text-xs space-y-1.5">
                    {typeof q.correctIndex === 'number' && q.options?.[q.correctIndex] && (
                      <div className="font-bold text-[#15803D] dark:text-emerald-300">
                        Answer: ({String.fromCharCode(65 + q.correctIndex)}) {q.options[q.correctIndex]}
                      </div>
                    )}
                    {q.explanation && (
                      <div className="text-[#0F172A] dark:text-slate-300">
                        <span className="font-semibold">Explanation: </span>
                        <MarkdownRenderer content={q.explanation} className="inline" />
                      </div>
                    )}
                    {q.modelPoints && q.modelPoints.length > 0 && (
                      <div className="space-y-1">
                        <div className="font-bold text-[#15803D] dark:text-emerald-300">
                          Mains Answer Approach &amp; Key Points:
                        </div>
                        <ul className="list-disc pl-4 space-y-0.5 text-[#0F172A] dark:text-slate-200">
                          {q.modelPoints.map((pt, i) => (
                            <li key={i}>{pt}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
