import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Check,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  EyeOff,
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
  UgcNetPaperType,
  UgcNetPublicCatalogResponse,
  UgcNetQuestionTypeId,
} from '../types';
import {
  fetchPublishedUgcNetSyllabus,
  generateUgcNetQuestionsApi,
  type GeneratedUgcNetQuestionItem,
} from '../utils/adminApi';
import { exportTextToPdf } from '../utils/pdfExport';
import { MarkdownRenderer } from './MarkdownRenderer';

interface UgcNetQuestionStudioProps {
  settings: AppSettings;
  ugcNetCatalog?: UgcNetPublicCatalogResponse | null;
}

const UGC_NET_QUESTION_TYPES: Array<{
  id: UgcNetQuestionTypeId;
  label: string;
  desc: string;
}> = [
  { id: 'Single-MCQ', label: 'Single Correct MCQ', desc: '4 options with 1 best key' },
  { id: 'Multiple-Select', label: 'Multiple Correct', desc: 'More than 1 correct option' },
  { id: 'Assertion-Reasoning', label: 'Assertion & Reason', desc: 'Statement (A) & Reason (R)' },
  { id: 'Match-Following', label: 'Match the Following', desc: 'List I & List II code pairs' },
  { id: 'Statement-Based', label: 'Statement-Based', desc: 'Statement I & II analysis' },
  { id: 'Teaching-Aptitude', label: 'Teaching Aptitude', desc: 'Pedagogy & evaluation cases' },
  { id: 'Research-Aptitude', label: 'Research Aptitude', desc: 'Methodology, ethics & stats' },
  { id: 'Subject-Specific', label: 'Subject-Specific', desc: 'Deep Paper 2 domain analysis' },
];

export const UgcNetQuestionStudio: React.FC<UgcNetQuestionStudioProps> = ({
  settings,
  ugcNetCatalog,
}) => {
  const [liveCatalog, setLiveCatalog] = useState<UgcNetPublicCatalogResponse | null>(
    ugcNetCatalog ?? null,
  );
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  const [paperType, setPaperType] = useState<UgcNetPaperType>('paper-1');
  const [subjectId, setSubjectId] = useState<string>('');
  const [unitScope, setUnitScope] = useState<'all' | 'selected'>('all');
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [selectedSubtopics, setSelectedSubtopics] = useState<string[]>([]);

  const [selectedTypes, setSelectedTypes] = useState<UgcNetQuestionTypeId[]>([
    'Single-MCQ',
    'Assertion-Reasoning',
    'Match-Following',
    'Statement-Based',
  ]);
  const [questionCount, setQuestionCount] = useState<number>(10);
  const [marksPerQuestion, setMarksPerQuestion] = useState<number>(2);
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('Mixed');
  const [language, setLanguage] = useState<MockLanguage>('english');

  const [generating, setGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [generatedQuestions, setGeneratedQuestions] = useState<GeneratedUgcNetQuestionItem[]>([]);
  const [metaResult, setMetaResult] = useState<{
    versionLabel: string;
    subjectName: string;
    providerUsed: string;
    modelUsed: string;
  } | null>(null);
  const [showAnswers, setShowAnswers] = useState(true);
  const [copied, setCopied] = useState(false);

  const refreshCatalog = async () => {
    setLoadingCatalog(true);
    try {
      const data = await fetchPublishedUgcNetSyllabus();
      setLiveCatalog(data);
    } catch {
      // Keep last known
    } finally {
      setLoadingCatalog(false);
    }
  };

  useEffect(() => {
    if (ugcNetCatalog) {
      setLiveCatalog(ugcNetCatalog);
    } else {
      void refreshCatalog();
    }
  }, [ugcNetCatalog]);

  const paper1 = liveCatalog?.paper1 || null;
  const paper2Subjects = liveCatalog?.paper2Subjects || [];
  const hasAnyPublished = Boolean(paper1 || paper2Subjects.length > 0);

  // Auto-select valid published paper/subject
  useEffect(() => {
    if (paperType === 'paper-1' && !paper1 && paper2Subjects.length > 0) {
      setPaperType('paper-2');
      setSubjectId(paper2Subjects[0].subjectId);
      return;
    }
    if (paperType === 'paper-2') {
      if (paper2Subjects.length === 0 && paper1) {
        setPaperType('paper-1');
        return;
      }
      if (
        paper2Subjects.length > 0 &&
        !paper2Subjects.some((s) => s.subjectId === subjectId)
      ) {
        setSubjectId(paper2Subjects[0].subjectId);
      }
    }
  }, [paper1, paper2Subjects, paperType, subjectId]);

  const activeSyllabus = useMemo(() => {
    if (paperType === 'paper-1') return paper1;
    return paper2Subjects.find((s) => s.subjectId === subjectId) || null;
  }, [paperType, paper1, paper2Subjects, subjectId]);

  // Reset unit/topic filters when active syllabus version or subject changes
  useEffect(() => {
    if (!activeSyllabus) {
      setSelectedUnitIds([]);
      setSelectedTopicIds([]);
      setSelectedSubtopics([]);
      return;
    }
    setUnitScope('all');
    setSelectedUnitIds(activeSyllabus.units.map((u) => u.unitId));
    setSelectedTopicIds([]);
    setSelectedSubtopics([]);
  }, [activeSyllabus?.syllabusVersionId]);

  const visibleTopics = useMemo(() => {
    if (!activeSyllabus) return [];
    const unitsToScan =
      unitScope === 'all'
        ? activeSyllabus.units
        : activeSyllabus.units.filter((u) => selectedUnitIds.includes(u.unitId));
    return unitsToScan.flatMap((u) =>
      u.topics.map((t) => ({
        ...t,
        unitId: u.unitId,
        unitTitle: u.title,
      })),
    );
  }, [activeSyllabus, unitScope, selectedUnitIds]);

  const visibleSubtopics = useMemo(() => {
    const topicSet = new Set(selectedTopicIds);
    const topicsToScan =
      topicSet.size > 0
        ? visibleTopics.filter((t) => topicSet.has(t.topicId))
        : visibleTopics;
    return Array.from(
      new Set(topicsToScan.flatMap((t) => t.subtopics.map((s) => s.title))),
    );
  }, [visibleTopics, selectedTopicIds]);

  const toggleQuestionType = (id: UgcNetQuestionTypeId) => {
    setSelectedTypes((prev) =>
      prev.includes(id)
        ? prev.length > 1
          ? prev.filter((x) => x !== id)
          : prev
        : [...prev, id],
    );
  };

  const handleGenerate = async () => {
    setErrorMsg('');
    if (!activeSyllabus) {
      setErrorMsg('No active published UGC NET syllabus found for your selection.');
      return;
    }
    if (paperType === 'paper-2' && !subjectId) {
      setErrorMsg('Select a published UGC NET Paper 2 subject.');
      return;
    }
    setGenerating(true);
    try {
      const unitIdsPayload =
        unitScope === 'all' ? undefined : selectedUnitIds;
      const res = await generateUgcNetQuestionsApi({
        paperType,
        subjectId: paperType === 'paper-2' ? activeSyllabus.subjectId : undefined,
        syllabusVersionId: activeSyllabus.syllabusVersionId,
        unitIds: unitIdsPayload,
        topicIds: selectedTopicIds.length > 0 ? selectedTopicIds : undefined,
        subtopicNames: selectedSubtopics.length > 0 ? selectedSubtopics : undefined,
        questionTypes: selectedTypes,
        totalCount: questionCount,
        marksPerQuestion,
        difficulty,
        language,
        selectionMode: settings.selectionMode,
        provider: settings.provider,
        model: settings.model,
      });

      setGeneratedQuestions(res.questions);
      setMetaResult({
        versionLabel: res.syllabusVersionLabel,
        subjectName: res.subjectName,
        providerUsed: res.providerUsed,
        modelUsed: res.modelUsed,
      });
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'UGC NET question generation failed.',
      );
    } finally {
      setGenerating(false);
    }
  };

  const formatMarkdownExport = () => {
    return generatedQuestions
      .map((q) => {
        const extra = [
          q.assertionText ? `   Assertion (A): ${q.assertionText}` : '',
          q.reasonText ? `   Reason (R): ${q.reasonText}` : '',
          q.matchColumns
            ? `   Column A: ${q.matchColumns.columnA.join(' | ')}\n   Column B: ${q.matchColumns.columnB.join(' | ')}`
            : '',
          q.options?.length
            ? q.options.map((o, i) => `   (${String.fromCharCode(65 + i)}) ${o}`).join('\n')
            : '',
        ]
          .filter(Boolean)
          .join('\n');
        return `Q${q.number} [${q.questionType} · ${q.marks} Marks · ${q.unitTitle}]: ${q.question}\n${extra}\n   Answer: ${q.correctAnswer}\n   Explanation: ${q.explanation}`;
      })
      .join('\n\n');
  };

  if (!hasAnyPublished) {
    return (
      <div className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center space-y-4">
        <div className="w-12 h-12 mx-auto rounded-2xl bg-gradient-to-br from-[#4338CA] to-[#06B6D4] text-white flex items-center justify-center">
          <BookOpen className="w-6 h-6" />
        </div>
        <h3 className="font-display font-bold text-lg text-[#0F172A] dark:text-white">
          No Admin-Published UGC NET Syllabus Available Yet
        </h3>
        <p className="text-sm text-[#64748B] dark:text-slate-400 max-w-lg mx-auto">
          UGC NET Paper 1 and Paper 2 questions are generated strictly from Admin-approved and published syllabus documents. Once an Administrator publishes Paper 1 or a Paper 2 subject in Admin Panel, it appears here automatically.
        </p>
        <button
          type="button"
          onClick={() => void refreshCatalog()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#4338CA] to-[#2563EB] text-white text-xs font-bold shadow-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingCatalog ? 'animate-spin' : ''}`} />
          <span>Check Published Syllabuses</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="no-print rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
        <div className="px-6 py-4 bg-gradient-to-r from-[#4338CA] to-[#2563EB] text-white flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-cyan-200 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Synchronized UGC NET Centralized Curriculum</span>
            </div>
            <h2 className="font-display font-bold text-xl mt-0.5">
              NTA UGC NET / JRF Question Generator
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
          {/* Paper Selection Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <button
              type="button"
              disabled={!paper1}
              onClick={() => setPaperType('paper-1')}
              className={`text-left p-4 rounded-xl border-2 transition-all ${
                paperType === 'paper-1'
                  ? 'border-[#4338CA] bg-indigo-50/70 dark:bg-indigo-950/40 shadow-xs'
                  : 'border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 disabled:opacity-50'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-display font-bold text-sm text-[#0F172A] dark:text-white">
                  Paper 1 — General Teaching &amp; Research Aptitude
                </span>
                <span className="px-2 py-0.5 rounded bg-white dark:bg-slate-800 text-[11px] font-bold text-[#4338CA] dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 tabular-nums">
                  {paper1 ? paper1.versionLabel : 'Not Published'}
                </span>
              </div>
              <div className="text-xs text-[#64748B] dark:text-slate-400 mt-1 tabular-nums">
                {paper1
                  ? `${paper1.unitCount} Units · ${paper1.topicCount} Topics · Direct Unit → Topic selection`
                  : 'Admin has not published Paper 1 syllabus yet.'}
              </div>
            </button>

            <button
              type="button"
              disabled={paper2Subjects.length === 0}
              onClick={() => setPaperType('paper-2')}
              className={`text-left p-4 rounded-xl border-2 transition-all ${
                paperType === 'paper-2'
                  ? 'border-[#2563EB] bg-blue-50/70 dark:bg-blue-950/40 shadow-xs'
                  : 'border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 disabled:opacity-50'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-display font-bold text-sm text-[#0F172A] dark:text-white">
                  Paper 2 — Subject-Specific Syllabus
                </span>
                <span className="px-2 py-0.5 rounded bg-white dark:bg-slate-800 text-[11px] font-bold text-[#2563EB] dark:text-blue-300 border border-blue-200 dark:border-blue-800 tabular-nums">
                  {paper2Subjects.length} Published Subjects
                </span>
              </div>
              <div className="text-xs text-[#64748B] dark:text-slate-400 mt-1">
                {paper2Subjects.length > 0
                  ? 'Requires selecting an Admin-published Paper 2 subject below'
                  : 'No Paper 2 subject published by Admin yet.'}
              </div>
            </button>
          </div>

          {/* Paper 2 Subject Selection (Required ONLY for Paper 2) */}
          {paperType === 'paper-2' && (
            <div className="rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <label className="block text-xs font-bold text-[#0F172A] dark:text-white mb-1.5">
                Paper 2 Subject (Published by Admin) *
              </label>
              <select
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-sm font-medium"
              >
                {paper2Subjects.map((s) => (
                  <option key={s.syllabusVersionId} value={s.subjectId}>
                    {s.subjectName}
                    {s.subjectCode ? ` (${s.subjectCode})` : ''} — {s.versionLabel} ({s.unitCount} Units · {s.topicCount} Topics)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Cascading Unit -> Topic -> Subtopic Selection */}
          {activeSyllabus && (
            <div className="rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 text-xs font-bold text-[#0F172A] dark:text-white">
                    <Layers className="w-4 h-4 text-[#4338CA]" />
                    <span>
                      Select Units &amp; Topics — {activeSyllabus.subjectName}
                    </span>
                  </div>
                  <div className="text-[11px] text-[#64748B] dark:text-slate-400 mt-0.5 tabular-nums">
                    Active Version: <strong>{activeSyllabus.versionLabel}</strong> · {activeSyllabus.unitCount} Units · {activeSyllabus.topicCount} Topics
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setUnitScope('all');
                      setSelectedUnitIds(activeSyllabus.units.map((u) => u.unitId));
                      setSelectedTopicIds([]);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      unitScope === 'all'
                        ? 'bg-gradient-to-r from-[#4338CA] to-[#2563EB] text-white border-transparent'
                        : 'border-[#E2E8F0] dark:border-slate-700 text-[#64748B]'
                    }`}
                  >
                    All Units ({activeSyllabus.units.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setUnitScope('selected');
                      if (selectedUnitIds.length === 0 && activeSyllabus.units[0]) {
                        setSelectedUnitIds([activeSyllabus.units[0].unitId]);
                      }
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      unitScope === 'selected'
                        ? 'bg-gradient-to-r from-[#4338CA] to-[#2563EB] text-white border-transparent'
                        : 'border-[#E2E8F0] dark:border-slate-700 text-[#64748B]'
                    }`}
                  >
                    Specific Units / Topics
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
                {/* Clickable Units List */}
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-[#64748B]">
                    Published Units (Click to select/deselect)
                  </div>
                  <div className="max-h-52 overflow-y-auto space-y-1 p-2.5 rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-[#F8FAFC] dark:bg-slate-950">
                    {activeSyllabus.units.map((u) => {
                      const active = selectedUnitIds.includes(u.unitId);
                      return (
                        <label
                          key={u.unitId}
                          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-900 cursor-pointer text-xs"
                        >
                          <input
                            type="checkbox"
                            checked={active}
                            onChange={(e) => {
                              setUnitScope('selected');
                              setSelectedUnitIds((prev) => {
                                const next = e.target.checked
                                  ? Array.from(new Set([...prev, u.unitId]))
                                  : prev.filter((id) => id !== u.unitId);
                                return next.length > 0 ? next : [u.unitId];
                              });
                            }}
                            className="accent-[#4338CA]"
                          />
                          <span className="font-medium text-[#0F172A] dark:text-slate-200 flex-1">
                            {u.title}
                          </span>
                          <span className="text-[10px] text-[#64748B] tabular-nums">
                            {u.topics.length} topics
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Clickable Topics + Optional Subtopics */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#64748B]">
                      Published Topics (Leave empty for all topics in selected units)
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
                    Subtopic Focus (Optional — click to narrow generation):
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                    {visibleSubtopics.slice(0, 40).map((sub) => {
                      const active = selectedSubtopics.includes(sub);
                      return (
                        <button
                          key={sub}
                          type="button"
                          onClick={() =>
                            setSelectedSubtopics((prev) =>
                              prev.includes(sub)
                                ? prev.filter((s) => s !== sub)
                                : [...prev, sub],
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

          {/* Supported UGC NET Question Formats & Generation Settings */}
          <div className="rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold text-[#0F172A] dark:text-white">
              <SlidersHorizontal className="w-4 h-4 text-[#2563EB]" />
              <span>UGC NET Question Types ({selectedTypes.length} selected)</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {UGC_NET_QUESTION_TYPES.map((qt) => {
                const checked = selectedTypes.includes(qt.id);
                return (
                  <label
                    key={qt.id}
                    className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                      checked
                        ? 'border-[#4338CA] bg-indigo-50/60 dark:bg-indigo-950/30'
                        : 'border-[#E2E8F0] dark:border-slate-800 bg-[#F8FAFC] dark:bg-slate-950'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleQuestionType(qt.id)}
                      className="accent-[#4338CA] mt-0.5"
                    />
                    <div>
                      <div className="text-xs font-bold text-[#0F172A] dark:text-white">
                        {qt.label}
                      </div>
                      <div className="text-[11px] text-[#64748B] dark:text-slate-400">
                        {qt.desc}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
              <div>
                <label className="block text-xs font-semibold text-[#64748B] mb-1">
                  Question Count
                </label>
                <input
                  type="number"
                  min={1}
                  max={40}
                  value={questionCount}
                  onChange={(e) => setQuestionCount(Math.min(40, Math.max(1, Number(e.target.value) || 10)))}
                  className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-sm tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#64748B] mb-1">
                  Marks Per Question
                </label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={marksPerQuestion}
                  onChange={(e) => setMarksPerQuestion(Math.max(1, Number(e.target.value) || 2))}
                  className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-sm tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#64748B] mb-1">
                  Difficulty
                </label>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as DifficultyLevel)}
                  className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-sm"
                >
                  <option value="Mixed">Mixed (NTA Level)</option>
                  <option value="Easy">Easy</option>
                  <option value="Medium">Medium</option>
                  <option value="Hard">Hard / Research</option>
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
                Active AI Provider:{' '}
                <strong className="text-[#0F172A] dark:text-white">
                  {settings.selectionMode === 'auto'
                    ? 'Auto (Configured Default)'
                    : `${settings.provider.toUpperCase()} (${settings.model || 'Default'})`}
                </strong>
              </div>
              <button
                type="button"
                disabled={generating || !activeSyllabus}
                onClick={() => void handleGenerate()}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#4338CA] to-[#2563EB] hover:from-[#3730A3] hover:to-[#1D4ED8] disabled:opacity-50 text-white text-sm font-bold shadow-xs"
              >
                {generating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Generating Validated Questions...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Generate UGC NET Questions</span>
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

      {/* Generated Question Bank Output */}
      {generatedQuestions.length > 0 && (
        <div className="space-y-4">
          <div className="no-print flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-bold text-[#0F172A] dark:text-white tabular-nums">
                <CheckCircle2 className="w-4 h-4 text-[#16A34A]" />
                <span>Generated {generatedQuestions.length} Syllabus-Validated UGC NET Questions</span>
              </div>
              {metaResult && (
                <div className="text-xs text-[#64748B] dark:text-slate-400 mt-0.5">
                  {metaResult.subjectName} · {metaResult.versionLabel} · Generated with {metaResult.providerUsed} ({metaResult.modelUsed})
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
                <span>{showAnswers ? 'Hide Key' : 'Show Key'}</span>
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
                    `UGC NET — ${metaResult?.subjectName || 'Practice Paper'} (${metaResult?.versionLabel || ''})`,
                    formatMarkdownExport(),
                    `UGC_NET_${paperType}_Questions.pdf`,
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
                key={q.number}
                className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3 print-avoid-break"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-[#4338CA] dark:text-indigo-300 font-bold tabular-nums">
                      Q{q.number} · {q.questionType}
                    </span>
                    <span className="text-[#64748B] dark:text-slate-400">
                      {q.unitTitle} · {q.topicTitle}
                    </span>
                  </div>
                  <span className="font-semibold text-[#0F172A] dark:text-slate-200 tabular-nums">
                    {q.marks} Marks · {q.difficulty}
                  </span>
                </div>

                {q.assertionText && (
                  <div className="p-3 rounded-xl bg-[#F8FAFC] dark:bg-slate-950 border border-[#E2E8F0] dark:border-slate-800 text-xs space-y-1">
                    <div>
                      <strong>Assertion (A):</strong> {q.assertionText}
                    </div>
                    {q.reasonText && (
                      <div>
                        <strong>Reason (R):</strong> {q.reasonText}
                      </div>
                    )}
                  </div>
                )}

                {q.matchColumns && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 rounded-xl bg-[#F8FAFC] dark:bg-slate-950 border border-[#E2E8F0] dark:border-slate-800 text-xs">
                    <div>
                      <div className="font-bold mb-1">List I</div>
                      {q.matchColumns.columnA.map((item, i) => (
                        <div key={i}>{item}</div>
                      ))}
                    </div>
                    <div>
                      <div className="font-bold mb-1">List II</div>
                      {q.matchColumns.columnB.map((item, i) => (
                        <div key={i}>{item}</div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="text-sm font-medium text-[#0F172A] dark:text-white">
                  <MarkdownRenderer content={q.question} />
                </div>

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
                    <div className="font-bold text-[#15803D] dark:text-emerald-300">
                      Answer: <MarkdownRenderer content={q.correctAnswer} className="inline" />
                    </div>
                    {q.explanation && (
                      <div className="text-[#0F172A] dark:text-slate-300">
                        <span className="font-semibold">Explanation: </span>
                        <MarkdownRenderer content={q.explanation} className="inline" />
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
