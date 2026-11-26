import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Download,
  Edit3,
  EyeOff,
  FileText,
  FolderUp,
  Landmark,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import type {
  AiSelectionMode,
  ProviderId,
  ProviderStatus,
  UgcNetPublicationStatus,
  UpscAdminSummary,
  UpscAreaNode,
  UpscConflictInfo,
  UpscMarkingPattern,
  UpscPaperId,
  UpscSyllabusRecord,
} from '../types';
import {
  deleteAdminUpscSyllabus,
  downloadAdminUpscSyllabusFile,
  fetchAdminAiConfig,
  fetchAdminUpscSyllabuses,
  processAdminUpscSyllabus,
  publishAdminUpscSyllabus,
  unpublishAdminUpscSyllabus,
  updateAdminUpscSyllabus,
} from '../utils/adminApi';
import { matchesSearchQuery } from '../utils/studySearch';
import { SearchBarWithVoice } from './SearchBarWithVoice';

interface AdminUpscSyllabusPanelProps {
  adminToken: string;
  onCatalogSync: () => Promise<void> | void;
  onJumpToOutdatedQuestions?: () => void;
  onOverviewRefresh?: () => Promise<void> | void;
}

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const ALLOWED_EXT_RE = /\.(pdf|docx|doc|xlsx|xls|csv|txt)$/i;

const UPSC_PAPERS: Array<{
  paperId: UpscPaperId;
  stage: 'prelims' | 'mains';
  label: string;
  shortDesc: string;
}> = [
  {
    paperId: 'prelims-gs-1',
    stage: 'prelims',
    label: 'Prelims GS Paper I',
    shortDesc: '200 Marks · 100 Qs · +2 / -0.66',
  },
  {
    paperId: 'prelims-csat',
    stage: 'prelims',
    label: 'Prelims CSAT Paper II',
    shortDesc: '200 Marks · 80 Qs · +2.5 / -0.83',
  },
  {
    paperId: 'mains-essay',
    stage: 'mains',
    label: 'Mains Essay Paper',
    shortDesc: '250 Marks · 2 Essays × 125 Marks',
  },
  {
    paperId: 'mains-gs-1',
    stage: 'mains',
    label: 'Mains GS Paper I',
    shortDesc: '250 Marks · Heritage, History, Geography, Society',
  },
  {
    paperId: 'mains-gs-2',
    stage: 'mains',
    label: 'Mains GS Paper II',
    shortDesc: '250 Marks · Polity, Governance, Social Justice, IR',
  },
  {
    paperId: 'mains-gs-3',
    stage: 'mains',
    label: 'Mains GS Paper III',
    shortDesc: '250 Marks · Economy, Tech, Environment, Security',
  },
  {
    paperId: 'mains-gs-4',
    stage: 'mains',
    label: 'Mains GS Paper IV',
    shortDesc: '250 Marks · Ethics, Integrity & Case Studies',
  },
  {
    paperId: 'mains-optional',
    stage: 'mains',
    label: 'Mains Optional Subject',
    shortDesc: '500 Marks · Paper I & II (Subject-specific)',
  },
];

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read uploaded file.'));
    reader.readAsDataURL(file);
  });
}

function getStatusClasses(status: UgcNetPublicationStatus | 'None'): string {
  switch (status) {
    case 'Published':
      return 'bg-[#DCFCE7] text-[#15803D] dark:bg-emerald-950/60 dark:text-emerald-300';
    case 'Draft':
      return 'bg-[#FEF3C7] text-[#B45309] dark:bg-amber-950/60 dark:text-amber-300';
    case 'Unpublished':
      return 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
    case 'Archived':
      return 'bg-indigo-100 text-[#4338CA] dark:bg-indigo-950/60 dark:text-indigo-300';
    case 'Failed':
      return 'bg-red-100 text-[#DC2626] dark:bg-red-950/60 dark:text-red-300';
    default:
      return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
  }
}

export const AdminUpscSyllabusPanel: React.FC<AdminUpscSyllabusPanelProps> = ({
  adminToken,
  onCatalogSync,
  onJumpToOutdatedQuestions,
  onOverviewRefresh,
}) => {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<UpscAdminSummary | null>(null);
  const [records, setRecords] = useState<UpscSyllabusRecord[]>([]);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);

  // Upload form state
  const [stageFilter, setStageFilter] = useState<'prelims' | 'mains'>('prelims');
  const [paperId, setPaperId] = useState<UpscPaperId>('prelims-gs-1');
  const [optionalSubjectName, setOptionalSubjectName] = useState('');
  const [examYear, setExamYear] = useState('2026');
  const [selectionMode, setSelectionMode] = useState<AiSelectionMode>('auto');
  const [selectedProvider, setSelectedProvider] = useState<ProviderId>('gemini');
  const [selectedModel, setSelectedModel] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [processing, setProcessing] = useState(false);
  const [progressStep, setProgressStep] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [actionNotice, setActionNotice] = useState('');

  // Draft Preview & Edit studio state
  const [editingRecord, setEditingRecord] = useState<UpscSyllabusRecord | null>(null);
  const [editAreas, setEditAreas] = useState<UpscAreaNode[]>([]);
  const [editOptionalName, setEditOptionalName] = useState('');
  const [editExamYear, setEditExamYear] = useState('');
  const [editPattern, setEditPattern] = useState<UpscMarkingPattern | null>(null);
  const [conflictInfo, setConflictInfo] = useState<UpscConflictInfo | null>(null);
  const [resolutionMode, setResolutionMode] = useState<'new-version' | 'replace'>('new-version');
  const [savingEdit, setSavingEdit] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // History filters & delete confirmation
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [filterStage, setFilterStage] = useState<'all' | 'prelims' | 'mains'>('all');
  const [filterPaperId, setFilterPaperId] = useState<'all' | UpscPaperId>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | UgcNetPublicationStatus>('all');
  const [filterSearch, setFilterSearch] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [upscRes, aiRes] = await Promise.all([
        fetchAdminUpscSyllabuses(adminToken),
        fetchAdminAiConfig(adminToken).catch(() => null),
      ]);
      setSummary(upscRes.summary);
      setRecords(upscRes.records);
      if (aiRes) setProviders(aiRes.providers);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Unable to load UPSC syllabus records.');
    } finally {
      setLoading(false);
    }
  }, [adminToken]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openEditor = (rec: UpscSyllabusRecord) => {
    setEditingRecord(rec);
    setEditAreas(JSON.parse(JSON.stringify(rec.areas || [])) as UpscAreaNode[]);
    setEditOptionalName(rec.optionalSubjectName || '');
    setEditExamYear(rec.examYear);
    setEditPattern({ ...rec.markingPattern });

    const activeConflict = records.find(
      (r) =>
        r.syllabusVersionId !== rec.syllabusVersionId &&
        r.paperId === rec.paperId &&
        r.subjectId === rec.subjectId &&
        r.isActivePublished &&
        r.publicationStatus === 'Published',
    );
    if (activeConflict) {
      setConflictInfo({
        hasConflict: true,
        existingVersionId: activeConflict.syllabusVersionId,
        existingVersionLabel: activeConflict.versionLabel,
        existingExamYear: activeConflict.examYear,
        existingPublishedAt: activeConflict.publishedAt,
        message: `Active published UPSC syllabus (${activeConflict.versionLabel}) exists for ${activeConflict.paperLabel}. Choose Replace Active Version or Create New Version.`,
      });
    } else {
      setConflictInfo({ hasConflict: false });
    }
  };

  const handleFilePick = (file: File | null) => {
    setUploadError('');
    setActionNotice('');
    if (!file) {
      setSelectedFile(null);
      return;
    }
    if (!ALLOWED_EXT_RE.test(file.name)) {
      setUploadError('Unsupported file format. Upload PDF, DOCX, DOC, XLSX, XLS, CSV, or TXT.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError('File exceeds the 25 MB upload limit.');
      return;
    }
    setSelectedFile(file);
  };

  const handleProcessUpload = async () => {
    setUploadError('');
    setActionNotice('');
    if (!selectedFile) {
      setUploadError('Select a UPSC syllabus document first.');
      return;
    }
    if (paperId === 'mains-optional' && !optionalSubjectName.trim()) {
      setUploadError('Enter the Optional Subject Name (e.g., PSIR, Sociology, Geography, Anthropology).');
      return;
    }

    setProcessing(true);
    setProgressStep('Validating document & running AI UPSC syllabus extraction...');
    try {
      const fileBase64 = await readFileAsBase64(selectedFile);
      const res = await processAdminUpscSyllabus(adminToken, {
        fileName: selectedFile.name,
        mimeType: selectedFile.type,
        fileBase64,
        paperId,
        optionalSubjectName: paperId === 'mains-optional' ? optionalSubjectName.trim() : undefined,
        examYear: examYear.trim() || '2026',
        selectionMode,
        provider: selectionMode === 'auto' ? undefined : selectedProvider,
        model: selectionMode === 'auto' ? undefined : selectedModel,
      });

      setSummary(res.summary);
      setConflictInfo(res.conflict);
      setEditingRecord(res.draft);
      setEditAreas(JSON.parse(JSON.stringify(res.draft.areas || [])) as UpscAreaNode[]);
      setEditOptionalName(res.draft.optionalSubjectName || '');
      setEditExamYear(res.draft.examYear);
      setEditPattern({ ...res.draft.markingPattern });
      setSelectedFile(null);

      setActionNotice(
        res.duplicateDetected
          ? res.message || `Identical syllabus loaded (${res.draft.versionLabel}).`
          : `Extracted ${res.draft.areaCount} subject areas and ${res.draft.topicCount} topics into Draft (${res.draft.versionLabel}). Inspect & edit below before publishing.`,
      );
      await loadData();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'UPSC syllabus processing failed.');
      await loadData();
    } finally {
      setProcessing(false);
      setProgressStep('');
    }
  };

  const handleSaveDraft = async () => {
    if (!editingRecord) return;
    setSavingEdit(true);
    setUploadError('');
    setActionNotice('');
    try {
      const res = await updateAdminUpscSyllabus(adminToken, editingRecord.syllabusVersionId, {
        optionalSubjectName: editingRecord.paperId === 'mains-optional' ? editOptionalName : undefined,
        examYear: editExamYear,
        markingPattern: editPattern || undefined,
        areas: editAreas,
      });
      setEditingRecord(res.syllabus);
      setEditAreas(JSON.parse(JSON.stringify(res.syllabus.areas || [])) as UpscAreaNode[]);
      setEditPattern({ ...res.syllabus.markingPattern });
      setSummary(res.summary);
      setConflictInfo(res.conflict);
      setRecords((prev) =>
        prev.map((r) => (r.syllabusVersionId === res.syllabus.syllabusVersionId ? res.syllabus : r)),
      );
      if (res.syllabus.isActivePublished) {
        await onCatalogSync();
      }
      setActionNotice(
        `Saved ${res.syllabus.versionLabel} (${res.syllabus.areaCount} areas, ${res.syllabus.topicCount} topics).`,
      );
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to save UPSC draft edits.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handlePublishRecord = async (
    targetId?: string,
    modeOverride?: 'replace' | 'new-version',
  ) => {
    const id = targetId || editingRecord?.syllabusVersionId;
    if (!id) return;
    setPublishing(true);
    setUploadError('');
    setActionNotice('');
    try {
      // Save unsaved edits in editor before publishing if editing same record
      if (editingRecord && editingRecord.syllabusVersionId === id) {
        await updateAdminUpscSyllabus(adminToken, id, {
          optionalSubjectName: editingRecord.paperId === 'mains-optional' ? editOptionalName : undefined,
          examYear: editExamYear,
          markingPattern: editPattern || undefined,
          areas: editAreas,
        });
      }
      const res = await publishAdminUpscSyllabus(adminToken, id, {
        resolutionMode: modeOverride || resolutionMode,
      });
      setSummary(res.summary);
      await loadData();
      await onCatalogSync();
      if (onOverviewRefresh) await onOverviewRefresh();
      if (editingRecord?.syllabusVersionId === id) {
        setEditingRecord(res.syllabus);
      }
      setActionNotice(
        `Published ${res.syllabus.paperLabel}${res.syllabus.optionalSubjectName ? ` (${res.syllabus.optionalSubjectName})` : ''} · ${res.syllabus.versionLabel}. Synced live across UPSC Portal, Mock Tests, and Question Generation.${res.flaggedQuestions > 0 ? ` Flagged ${res.flaggedQuestions} outdated question(s) for review.` : ''}`,
      );
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to publish UPSC syllabus.');
    } finally {
      setPublishing(false);
    }
  };

  const handleUnpublishRecord = async (rec: UpscSyllabusRecord) => {
    setUploadError('');
    setActionNotice('');
    try {
      const res = await unpublishAdminUpscSyllabus(adminToken, rec.syllabusVersionId);
      setSummary(res.summary);
      await loadData();
      await onCatalogSync();
      if (onOverviewRefresh) await onOverviewRefresh();
      if (editingRecord?.syllabusVersionId === rec.syllabusVersionId) {
        setEditingRecord(res.syllabus);
      }
      setActionNotice(
        `Unpublished ${rec.paperLabel} (${rec.versionLabel}). Removed from live student portals.`,
      );
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to unpublish UPSC version.');
    }
  };

  const handleDeleteRecord = async (rec: UpscSyllabusRecord) => {
    setUploadError('');
    setActionNotice('');
    try {
      const res = await deleteAdminUpscSyllabus(adminToken, rec.syllabusVersionId);
      setSummary(res.summary);
      setConfirmDeleteId(null);
      if (editingRecord?.syllabusVersionId === rec.syllabusVersionId) {
        setEditingRecord(null);
      }
      await loadData();
      await onCatalogSync();
      if (onOverviewRefresh) await onOverviewRefresh();
      setActionNotice(`Deleted ${rec.paperLabel} (${rec.versionLabel}).`);
    } catch (err) {
      setConfirmDeleteId(null);
      await loadData();
      setUploadError(err instanceof Error ? err.message : 'Failed to delete UPSC syllabus record.');
    }
  };

  // Hierarchy Reorder Helpers
  const moveArea = (aIdx: number, dir: -1 | 1) => {
    const target = aIdx + dir;
    if (target < 0 || target >= editAreas.length) return;
    const next = [...editAreas];
    [next[aIdx], next[target]] = [next[target], next[aIdx]];
    setEditAreas(next.map((a, i) => ({ ...a, order: i + 1 })));
  };

  const moveTopic = (aIdx: number, tIdx: number, dir: -1 | 1) => {
    const topics = editAreas[aIdx]?.topics || [];
    const target = tIdx + dir;
    if (target < 0 || target >= topics.length) return;
    const next = [...editAreas];
    const nextTopics = [...topics];
    [nextTopics[tIdx], nextTopics[target]] = [nextTopics[target], nextTopics[tIdx]];
    next[aIdx] = {
      ...next[aIdx],
      topics: nextTopics.map((t, i) => ({ ...t, order: i + 1 })),
    };
    setEditAreas(next);
  };

  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      if (filterStage !== 'all' && r.stage !== filterStage) return false;
      if (filterPaperId !== 'all' && r.paperId !== filterPaperId) return false;
      if (filterStatus !== 'all' && r.publicationStatus !== filterStatus) return false;
      if (filterSearch.trim()) {
        const hay = `${r.paperLabel} ${r.subjectName} ${r.optionalSubjectName || ''} ${r.versionLabel} ${r.fileName}`;
        if (!matchesSearchQuery(hay, filterSearch)) return false;
      }
      return true;
    });
  }, [records, filterStage, filterPaperId, filterStatus, filterSearch]);

  const stagePapers = UPSC_PAPERS.filter((p) => p.stage === stageFilter);
  const activeProviderObj = providers.find((p) => p.id === selectedProvider);
  const availableModels = activeProviderObj?.models.filter((m) => m.enabled !== false) || [];

  return (
    <div className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
      {/* Banner Header */}
      <div className="px-6 py-5 bg-gradient-to-r from-[#4338CA] to-[#2563EB] text-white flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-200">
            <Landmark className="w-4 h-4" />
            <span>UPSC Civil Services Examination (CSE)</span>
          </div>
          <h3 className="font-display font-bold text-xl mt-1">
            UPSC Prelims &amp; Mains Centralized Syllabus Studio
          </h3>
          <p className="text-xs text-indigo-100 mt-0.5 max-w-2xl">
            Upload official UPSC Prelims (GS I / CSAT II) and Mains (Essay, GS I–IV, Optional) documents once. AI extracts Areas, Topics, Subtopics &amp; Marking Patterns into Draft — publishing syncs Student UPSC Portal, Question Generation, and Mock Tests automatically.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadData()}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-semibold transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Status</span>
        </button>
      </div>

      <div className="p-5 sm:p-6 space-y-6 bg-[#F8FAFC] dark:bg-slate-950/60">
        {/* 4 Summary Tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-slate-400">
              Published Prelims Papers
            </div>
            <div className="mt-1.5 font-display font-bold text-2xl text-[#0F172A] dark:text-white tabular-nums">
              {summary?.prelimsPublishedCount ?? 0} <span className="text-xs font-normal text-[#64748B]">/ 2</span>
            </div>
            <div className="mt-1 text-xs text-[#64748B] dark:text-slate-400">
              GS Paper I &amp; CSAT Paper II
            </div>
          </div>

          <div className="rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-slate-400">
              Published Mains Papers
            </div>
            <div className="mt-1.5 font-display font-bold text-2xl text-[#0F172A] dark:text-white tabular-nums">
              {summary?.mainsPublishedCount ?? 0}
            </div>
            <div className="mt-1 text-xs text-[#64748B] dark:text-slate-400 tabular-nums">
              Includes {summary?.optionalPublishedCount ?? 0} Optional Subject(s)
            </div>
          </div>

          <div className="rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-slate-400">
              Published Coverage
            </div>
            <div className="mt-1.5 font-display font-bold text-2xl text-[#0F172A] dark:text-white tabular-nums">
              {summary?.totalAreas ?? 0} <span className="text-xs font-normal text-[#64748B]">Areas</span>
            </div>
            <div className="mt-1 text-xs text-[#64748B] dark:text-slate-400 tabular-nums">
              {summary?.totalTopics ?? 0} topics · {summary?.totalRecords ?? 0} versions stored
            </div>
          </div>

          <div className="rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-slate-400">
                Outdated Bank Questions
              </div>
              <div className="mt-1.5 font-display font-bold text-2xl text-[#0F172A] dark:text-white tabular-nums">
                {summary?.outdatedQuestionsCount ?? 0}
              </div>
            </div>
            {(summary?.outdatedQuestionsCount || 0) > 0 && onJumpToOutdatedQuestions ? (
              <button
                type="button"
                onClick={onJumpToOutdatedQuestions}
                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#D97706] hover:underline"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Review Flagged Questions</span>
              </button>
            ) : (
              <span className="mt-2 text-xs text-[#16A34A] font-medium">
                All UPSC questions aligned
              </span>
            )}
          </div>
        </div>

        {/* Upload & AI Extraction Form */}
        <div className="rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="font-display font-bold text-base text-[#0F172A] dark:text-white">
                Upload &amp; Extract UPSC Syllabus Document
              </h4>
              <p className="text-xs text-[#64748B] dark:text-slate-400">
                Zero hardcoded UPSC syllabuses — uploaded documents stay in Draft until you review &amp; publish.
              </p>
            </div>

            <div className="inline-flex rounded-xl border border-[#E2E8F0] dark:border-slate-700 p-1 bg-[#F8FAFC] dark:bg-slate-950">
              {(['prelims', 'mains'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => {
                    setStageFilter(st);
                    const first = UPSC_PAPERS.find((p) => p.stage === st);
                    if (first) setPaperId(first.paperId);
                  }}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    stageFilter === st
                      ? 'bg-gradient-to-r from-[#4338CA] to-[#2563EB] text-white shadow-xs'
                      : 'text-[#64748B] hover:text-[#0F172A] dark:hover:text-white'
                  }`}
                >
                  {st === 'prelims' ? 'UPSC Prelims' : 'UPSC Mains'}
                </button>
              ))}
            </div>
          </div>

          {/* Paper Cards inside selected stage */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {stagePapers.map((p) => {
              const active = paperId === p.paperId;
              return (
                <button
                  key={p.paperId}
                  type="button"
                  onClick={() => setPaperId(p.paperId)}
                  className={`text-left p-3 rounded-xl border transition-all ${
                    active
                      ? 'border-[#4338CA] bg-indigo-50/70 dark:bg-indigo-950/40'
                      : 'border-[#E2E8F0] dark:border-slate-800 bg-[#F8FAFC] dark:bg-slate-950 hover:border-slate-300'
                  }`}
                >
                  <div className="text-xs font-bold text-[#0F172A] dark:text-white">
                    {p.label}
                  </div>
                  <div className="text-[11px] text-[#64748B] dark:text-slate-400 mt-0.5">
                    {p.shortDesc}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Metadata & AI Controls */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5">
            {paperId === 'mains-optional' && (
              <div>
                <label className="block text-xs font-semibold text-[#0F172A] dark:text-slate-200 mb-1">
                  Optional Subject Name *
                </label>
                <input
                  type="text"
                  value={optionalSubjectName}
                  onChange={(e) => setOptionalSubjectName(e.target.value)}
                  placeholder="e.g. PSIR, Sociology, Geography"
                  className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-sm"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-[#0F172A] dark:text-slate-200 mb-1">
                Exam Cycle / Year
              </label>
              <input
                type="text"
                value={examYear}
                onChange={(e) => setExamYear(e.target.value)}
                placeholder="e.g. 2026"
                className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0F172A] dark:text-slate-200 mb-1">
                Extraction AI Mode
              </label>
              <select
                value={selectionMode}
                onChange={(e) => setSelectionMode(e.target.value as AiSelectionMode)}
                className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-sm"
              >
                <option value="auto">Auto (Configured AI)</option>
                <option value="gemini">Google Gemini</option>
                <option value="ollama">Ollama Local AI</option>
              </select>
            </div>

            {selectionMode !== 'auto' && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] dark:text-slate-200 mb-1">
                    Provider
                  </label>
                  <select
                    value={selectedProvider}
                    onChange={(e) => {
                      setSelectedProvider(e.target.value as ProviderId);
                      setSelectedModel('');
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-sm"
                  >
                    <option value="gemini">Google Gemini</option>
                    <option value="ollama">Ollama Local</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] dark:text-slate-200 mb-1">
                    Model ({availableModels.length} ready)
                  </label>
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-sm"
                  >
                    <option value="">Default {selectedProvider} model</option>
                    {availableModels.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>

          {/* Drag & Drop Upload Box */}
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              handleFilePick(e.dataTransfer.files?.[0] || null);
            }}
            className={`flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
              dragOver
                ? 'border-[#06B6D4] bg-cyan-50/60 dark:bg-cyan-950/30'
                : 'border-[#CBD5E1] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 hover:border-[#2563EB]'
            }`}
          >
            <input
              type="file"
              accept=".pdf,.docx,.doc,.xlsx,.xls,.csv,.txt"
              onChange={(e) => handleFilePick(e.target.files?.[0] || null)}
              className="hidden"
            />
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#4338CA] to-[#06B6D4] text-white flex items-center justify-center shrink-0">
                <FolderUp className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-semibold text-[#0F172A] dark:text-white">
                  {selectedFile
                    ? selectedFile.name
                    : 'Drag & drop UPSC syllabus PDF / DOCX / XLSX / TXT here'}
                </div>
                <div className="text-xs text-[#64748B] dark:text-slate-400">
                  {selectedFile
                    ? `${(selectedFile.size / 1024).toFixed(1)} KB · Ready for AI extraction`
                    : 'Target: ' +
                      (UPSC_PAPERS.find((p) => p.paperId === paperId)?.label || paperId) +
                      (paperId === 'mains-optional' && optionalSubjectName.trim()
                        ? ` (${optionalSubjectName.trim()})`
                        : '')}
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={processing || !selectedFile}
              onClick={(e) => {
                e.preventDefault();
                void handleProcessUpload();
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#4338CA] to-[#2563EB] hover:from-[#3730A3] hover:to-[#1D4ED8] disabled:opacity-50 text-white text-sm font-semibold shadow-xs shrink-0"
            >
              {processing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Extracting...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>Extract to Draft</span>
                </>
              )}
            </button>
          </label>

          {processing && progressStep && (
            <div className="flex items-center gap-2 text-xs font-medium text-[#2563EB] dark:text-cyan-300">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>{progressStep}</span>
            </div>
          )}

          {uploadError && (
            <div className="p-3.5 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-xs sm:text-sm text-[#DC2626] dark:text-red-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{uploadError}</span>
            </div>
          )}

          {actionNotice && (
            <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 text-xs sm:text-sm text-[#15803D] dark:text-emerald-300 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{actionNotice}</span>
            </div>
          )}
        </div>

        {/* Interactive Draft Review, Marking Pattern & Hierarchy Editor */}
        {editingRecord && (
          <div className="rounded-xl border-2 border-[#4338CA]/40 bg-white dark:bg-slate-900 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E8F0] dark:border-slate-800 pb-3.5">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`px-2.5 py-0.5 rounded-md text-xs font-bold ${getStatusClasses(
                      editingRecord.publicationStatus,
                    )}`}
                  >
                    {editingRecord.publicationStatus}
                  </span>
                  <span className="text-xs font-bold text-[#4338CA] dark:text-indigo-300 tabular-nums">
                    {editingRecord.paperLabel}
                    {editingRecord.optionalSubjectName ? ` · ${editingRecord.optionalSubjectName}` : ''} · {editingRecord.versionLabel}
                  </span>
                  <span className="text-xs text-[#64748B] dark:text-slate-400">
                    {editingRecord.fileName}
                  </span>
                </div>
                <h4 className="font-display font-bold text-base text-[#0F172A] dark:text-white mt-1">
                  Review Marking Pattern &amp; Edit Extracted Areas / Topics
                </h4>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    void downloadAdminUpscSyllabusFile(
                      adminToken,
                      editingRecord.syllabusVersionId,
                      editingRecord.fileName,
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Original File</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveDraft()}
                  disabled={savingEdit}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#2563EB]/40 text-[#2563EB] dark:text-blue-300 bg-blue-50/70 dark:bg-blue-950/30 text-xs font-semibold"
                >
                  {savingEdit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  <span>Save Draft</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handlePublishRecord(editingRecord.syllabusVersionId)}
                  disabled={publishing || editAreas.length === 0}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#16A34A] hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold shadow-xs"
                >
                  {publishing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
                  <span>Approve &amp; Publish Live</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEditingRecord(null)}
                  className="px-3 py-2 rounded-xl text-xs font-semibold text-[#64748B] hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Close
                </button>
              </div>
            </div>

            {editingRecord.warnings && editingRecord.warnings.length > 0 && (
              <div className="p-3.5 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#B45309] dark:text-amber-300">
                  <AlertTriangle className="w-4 h-4" />
                  <span>AI Extraction Warnings ({editingRecord.warnings.length})</span>
                </div>
                <ul className="list-disc pl-5 text-xs text-amber-900 dark:text-amber-200 space-y-0.5">
                  {editingRecord.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {conflictInfo?.hasConflict && (
              <div className="p-3.5 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/70 dark:bg-indigo-950/30 space-y-2">
                <div className="text-xs font-bold text-[#4338CA] dark:text-indigo-200">
                  Active Published Version Detected: {conflictInfo.existingVersionLabel}
                </div>
                <p className="text-xs text-[#64748B] dark:text-slate-300">{conflictInfo.message}</p>
                <div className="flex flex-wrap gap-4 text-xs font-semibold">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="upscResMode"
                      checked={resolutionMode === 'new-version'}
                      onChange={() => setResolutionMode('new-version')}
                    />
                    <span>Create New Version (Recommended — archives previous cleanly)</span>
                  </label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="upscResMode"
                      checked={resolutionMode === 'replace'}
                      onChange={() => setResolutionMode('replace')}
                    />
                    <span>Replace Active Version</span>
                  </label>
                </div>
              </div>
            )}

            {/* Metadata + Marking Pattern Editor */}
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {editingRecord.paperId === 'mains-optional' && (
                <div className="md:col-span-2">
                  <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                    Optional Subject
                  </label>
                  <input
                    type="text"
                    value={editOptionalName}
                    onChange={(e) => setEditOptionalName(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-xs font-medium"
                  />
                </div>
              )}
              <div>
                <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                  Exam Year
                </label>
                <input
                  type="text"
                  value={editExamYear}
                  onChange={(e) => setEditExamYear(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-xs tabular-nums"
                />
              </div>
              {editPattern && (
                <>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                      Total Marks
                    </label>
                    <input
                      type="number"
                      value={editPattern.totalMarks}
                      onChange={(e) =>
                        setEditPattern({ ...editPattern, totalMarks: Number(e.target.value) || 200 })
                      }
                      className="w-full px-3 py-1.5 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-xs tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                      Duration (min)
                    </label>
                    <input
                      type="number"
                      value={editPattern.durationMinutes}
                      onChange={(e) =>
                        setEditPattern({
                          ...editPattern,
                          durationMinutes: Number(e.target.value) || 120,
                        })
                      }
                      className="w-full px-3 py-1.5 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-xs tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                      Marks / Q &amp; Neg. Penalty
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        step="0.5"
                        value={editPattern.marksPerQuestion ?? 2}
                        onChange={(e) =>
                          setEditPattern({
                            ...editPattern,
                            marksPerQuestion: Number(e.target.value) || 2,
                          })
                        }
                        className="w-16 px-2 py-1.5 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-xs tabular-nums"
                      />
                      <input
                        type="number"
                        step="0.01"
                        value={editPattern.negativeMarksPerWrong ?? 0}
                        onChange={(e) =>
                          setEditPattern({
                            ...editPattern,
                            negativeMarksPerWrong: Math.max(0, Number(e.target.value) || 0),
                            negativeMarkingEnabled: Number(e.target.value) > 0,
                          })
                        }
                        className="w-16 px-2 py-1.5 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-xs tabular-nums"
                        title="Negative marks deducted per wrong answer"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>

            {editPattern && (
              <div className="flex items-center gap-2 text-xs">
                <SlidersHorizontal className="w-3.5 h-3.5 text-[#4338CA]" />
                <input
                  type="text"
                  value={editPattern.wordLimitGuidelines || ''}
                  onChange={(e) =>
                    setEditPattern({ ...editPattern, wordLimitGuidelines: e.target.value })
                  }
                  placeholder="Word limit or negative marking guidelines note..."
                  className="flex-1 px-3 py-1.5 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-xs"
                />
              </div>
            )}

            {/* Area -> Topic -> Subtopic Interactive Editor */}
            <div className="flex items-center justify-between pt-1">
              <div className="text-xs font-bold text-[#0F172A] dark:text-white tabular-nums">
                Subject Areas ({editAreas.length}) · Topics ({editAreas.reduce((s, a) => s + a.topics.length, 0)})
              </div>
              <button
                type="button"
                onClick={() =>
                  setEditAreas((prev) => [
                    ...prev,
                    {
                      areaId: `area-new-${Date.now().toString(36)}`,
                      title: `Area ${prev.length + 1}: New Subject Area`,
                      order: prev.length + 1,
                      topics: [
                        {
                          topicId: `top-new-${Date.now().toString(36)}`,
                          title: 'New Syllabus Topic',
                          order: 1,
                          subtopics: [],
                        },
                      ],
                    },
                  ])
                }
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-[#4338CA] dark:text-indigo-200 text-xs font-bold hover:bg-indigo-100"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Area / Subject</span>
              </button>
            </div>

            <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
              {editAreas.map((area, aIdx) => (
                <div
                  key={area.areaId || aIdx}
                  className="rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-[#F8FAFC] dark:bg-slate-950 p-3.5 space-y-2.5"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-[#4338CA] text-white text-[11px] font-bold tabular-nums">
                      A{aIdx + 1}
                    </span>
                    <input
                      type="text"
                      value={area.title}
                      onChange={(e) => {
                        const next = [...editAreas];
                        next[aIdx] = { ...area, title: e.target.value };
                        setEditAreas(next);
                      }}
                      className="flex-1 min-w-[200px] px-2.5 py-1 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-semibold"
                    />
                    <button
                      type="button"
                      disabled={aIdx === 0}
                      onClick={() => moveArea(aIdx, -1)}
                      className="p-1.5 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-slate-900 disabled:opacity-40"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={aIdx === editAreas.length - 1}
                      onClick={() => moveArea(aIdx, 1)}
                      className="p-1.5 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-slate-900 disabled:opacity-40"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const next = [...editAreas];
                        next[aIdx] = {
                          ...area,
                          topics: [
                            ...area.topics,
                            {
                              topicId: `top-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
                              title: 'New Topic',
                              order: area.topics.length + 1,
                              subtopics: [],
                            },
                          ],
                        };
                        setEditAreas(next);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-[#2563EB] dark:text-blue-300 text-xs font-semibold"
                    >
                      <Plus className="w-3 h-3" /> Topic
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditAreas((prev) => prev.filter((_, idx) => idx !== aIdx))}
                      className="p-1.5 rounded-lg text-[#DC2626] hover:bg-red-50 dark:hover:bg-red-950/30"
                      title="Delete Area"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="space-y-2 pl-3 sm:pl-5">
                    {area.topics.map((topic, tIdx) => (
                      <div
                        key={topic.topicId || tIdx}
                        className="rounded-lg border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 space-y-1.5"
                      >
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] font-bold text-[#64748B] tabular-nums">
                            {aIdx + 1}.{tIdx + 1}
                          </span>
                          <input
                            type="text"
                            value={topic.title}
                            onChange={(e) => {
                              const next = [...editAreas];
                              const nextTopics = [...area.topics];
                              nextTopics[tIdx] = { ...topic, title: e.target.value };
                              next[aIdx] = { ...area, topics: nextTopics };
                              setEditAreas(next);
                            }}
                            className="flex-1 min-w-[180px] px-2 py-1 rounded border border-[#E2E8F0] dark:border-slate-700 text-xs font-medium bg-[#F8FAFC] dark:bg-slate-950"
                          />
                          <button
                            type="button"
                            disabled={tIdx === 0}
                            onClick={() => moveTopic(aIdx, tIdx, -1)}
                            className="p-1 rounded border border-[#E2E8F0] dark:border-slate-700 disabled:opacity-40"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            disabled={tIdx === area.topics.length - 1}
                            onClick={() => moveTopic(aIdx, tIdx, 1)}
                            className="p-1 rounded border border-[#E2E8F0] dark:border-slate-700 disabled:opacity-40"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const next = [...editAreas];
                              next[aIdx] = {
                                ...area,
                                topics: area.topics.filter((_, idx) => idx !== tIdx),
                              };
                              setEditAreas(next);
                            }}
                            className="p-1 rounded text-[#DC2626] hover:bg-red-50"
                            title="Delete Topic"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>

                        <div className="flex items-center gap-2 pl-5">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-[#64748B] shrink-0">
                            Subtopics:
                          </span>
                          <input
                            type="text"
                            value={topic.subtopics.map((s) => s.title).join(', ')}
                            onChange={(e) => {
                              const parts = e.target.value
                                .split(',')
                                .map((s) => s.trim())
                                .filter(Boolean);
                              const next = [...editAreas];
                              const nextTopics = [...area.topics];
                              nextTopics[tIdx] = {
                                ...topic,
                                subtopics: parts.map((title, sIdx) => ({
                                  subtopicId:
                                    topic.subtopics[sIdx]?.subtopicId ||
                                    `sub-${aIdx + 1}-${tIdx + 1}-${sIdx + 1}`,
                                  title,
                                  order: sIdx + 1,
                                })),
                              };
                              next[aIdx] = { ...area, topics: nextTopics };
                              setEditAreas(next);
                            }}
                            placeholder="Comma-separated subtopics (optional)"
                            className="flex-1 px-2 py-1 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-[11px]"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filterable UPSC Version & Publication History */}
        <div className="rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-display font-bold text-base text-[#0F172A] dark:text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#4338CA]" />
              <span>UPSC Syllabus Versions &amp; Publication Control ({filteredRecords.length})</span>
            </h4>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            <select
              value={filterStage}
              onChange={(e) => setFilterStage(e.target.value as 'all' | 'prelims' | 'mains')}
              className="px-3 py-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-xs font-medium"
            >
              <option value="all">All Stages (Prelims &amp; Mains)</option>
              <option value="prelims">UPSC Prelims</option>
              <option value="mains">UPSC Mains</option>
            </select>

            <select
              value={filterPaperId}
              onChange={(e) => setFilterPaperId(e.target.value as 'all' | UpscPaperId)}
              className="px-3 py-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-xs font-medium"
            >
              <option value="all">All Papers</option>
              {UPSC_PAPERS.map((p) => (
                <option key={p.paperId} value={p.paperId}>
                  {p.label}
                </option>
              ))}
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as 'all' | UgcNetPublicationStatus)}
              className="px-3 py-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-xs font-medium"
            >
              <option value="all">All Statuses</option>
              <option value="Published">Published</option>
              <option value="Draft">Draft</option>
              <option value="Unpublished">Unpublished</option>
              <option value="Archived">Archived</option>
              <option value="Failed">Failed</option>
            </select>

            <SearchBarWithVoice
              compact
              value={filterSearch}
              onChange={setFilterSearch}
              placeholder="Search paper, optional, file..."
              ariaLabel="Search UPSC syllabus records"
            />
          </div>

          {filteredRecords.length === 0 ? (
            <div className="p-8 rounded-xl border border-dashed border-[#CBD5E1] dark:border-slate-700 text-center text-xs sm:text-sm text-[#64748B]">
              No UPSC syllabus records uploaded yet. Upload a UPSC Prelims or Mains PDF/DOCX/XLSX/TXT above — only published versions become visible to students.
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredRecords.map((rec) => (
                <div
                  key={rec.syllabusVersionId}
                  className="p-3.5 rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-[#F8FAFC] dark:bg-slate-950 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-bold ${getStatusClasses(
                          rec.publicationStatus,
                        )}`}
                      >
                        {rec.publicationStatus}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-[#4338CA] dark:text-indigo-300 text-[11px] font-bold uppercase">
                        {rec.stage}
                      </span>
                      <span className="text-xs font-bold text-[#0F172A] dark:text-white truncate">
                        {rec.paperLabel}
                        {rec.optionalSubjectName ? ` — ${rec.optionalSubjectName}` : ''}
                      </span>
                      <span className="text-xs font-semibold text-[#2563EB] dark:text-blue-300 tabular-nums">
                        {rec.versionLabel}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#64748B] dark:text-slate-400 flex flex-wrap items-center gap-2 tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        <FileText className="w-3 h-3" /> {rec.fileName}
                      </span>
                      <span>· {rec.areaCount} areas</span>
                      <span>· {rec.topicCount} topics</span>
                      <span>· {rec.subtopicCount} subtopics</span>
                      <span>
                        · {rec.markingPattern.totalMarks} marks / {rec.markingPattern.durationMinutes} min
                      </span>
                      {rec.markingPattern.negativeMarkingEnabled && (
                        <span>· -{rec.markingPattern.negativeMarksPerWrong} neg</span>
                      )}
                    </div>
                    {rec.errorMessage && (
                      <div className="text-[11px] text-[#DC2626] font-medium">{rec.errorMessage}</div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    {rec.publicationStatus !== 'Failed' && (
                      <button
                        type="button"
                        onClick={() => openEditor(rec)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold hover:border-[#4338CA]"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-[#4338CA]" />
                        <span>Review / Edit</span>
                      </button>
                    )}

                    {rec.publicationStatus !== 'Published' && rec.areas.length > 0 && (
                      <button
                        type="button"
                        onClick={() => void handlePublishRecord(rec.syllabusVersionId, 'new-version')}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#16A34A] hover:bg-emerald-700 text-white text-xs font-semibold"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Publish</span>
                      </button>
                    )}

                    {rec.isActivePublished && rec.publicationStatus === 'Published' && (
                      <button
                        type="button"
                        onClick={() => void handleUnpublishRecord(rec)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/40 text-[#B45309] dark:text-amber-300 text-xs font-semibold"
                      >
                        <EyeOff className="w-3.5 h-3.5" />
                        <span>Unpublish</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        void downloadAdminUpscSyllabusFile(
                          adminToken,
                          rec.syllabusVersionId,
                          rec.fileName,
                        )
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold"
                      title="Download Original Syllabus File"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>

                    {confirmDeleteId === rec.syllabusVersionId ? (
                      <div className="inline-flex items-center gap-1.5 pl-1">
                        <button
                          type="button"
                          onClick={() => void handleDeleteRecord(rec)}
                          className="px-2.5 py-1.5 rounded-lg bg-[#DC2626] hover:bg-red-700 text-white text-xs font-semibold whitespace-nowrap"
                        >
                          Confirm Delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2 py-1.5 rounded-lg border border-[#E2E8F0] dark:border-slate-700 text-xs font-semibold"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          if (rec.isActivePublished && rec.publicationStatus === 'Published') {
                            setUploadError(
                              `Unpublish ${rec.paperLabel} (${rec.versionLabel}) before deleting an active published version.`,
                            );
                            return;
                          }
                          setConfirmDeleteId(rec.syllabusVersionId);
                        }}
                        className="p-1.5 rounded-lg text-[#DC2626] hover:bg-red-50 dark:hover:bg-red-950/30"
                        title="Delete Version"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 text-[11px] text-[#64748B] dark:text-slate-400">
          <Sparkles className="w-3.5 h-3.5 text-[#06B6D4] shrink-0" />
          <span>
            Note: Publishing any UPSC paper automatically updates the Student UPSC Hub, Mock Test (Prelims GS I / CSAT II), Question Generation, and Catalog SSE subscribers.
          </span>
        </div>
      </div>
    </div>
  );
};
