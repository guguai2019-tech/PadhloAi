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
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import type {
  AiSelectionMode,
  ProviderId,
  ProviderStatus,
  UgcNetAdminSummary,
  UgcNetConflictInfo,
  UgcNetPaperType,
  UgcNetPublicationStatus,
  UgcNetSyllabusRecord,
  UgcNetUnitNode,
} from '../types';
import {
  deleteAdminUgcNetSyllabus,
  downloadAdminUgcNetSyllabusFile,
  fetchAdminAiConfig,
  fetchAdminUgcNetSyllabuses,
  processAdminUgcNetSyllabus,
  publishAdminUgcNetSyllabus,
  unpublishAdminUgcNetSyllabus,
  updateAdminUgcNetSyllabus,
} from '../utils/adminApi';

interface AdminUgcNetSyllabusPanelProps {
  adminToken: string;
  onCatalogSync: () => Promise<void> | void;
  onJumpToOutdatedQuestions?: () => void;
  onOverviewRefresh?: () => Promise<void> | void;
}

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const ALLOWED_EXT_RE = /\.(pdf|docx|doc|xlsx|xls|csv|txt)$/i;

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read uploaded file.'));
    reader.readAsDataURL(file);
  });
}

function getStatusBadgeClasses(status: UgcNetPublicationStatus | 'Not Uploaded' | 'None'): string {
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

export const AdminUgcNetSyllabusPanel: React.FC<AdminUgcNetSyllabusPanelProps> = ({
  adminToken,
  onCatalogSync,
  onJumpToOutdatedQuestions,
  onOverviewRefresh,
}) => {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<UgcNetAdminSummary | null>(null);
  const [records, setRecords] = useState<UgcNetSyllabusRecord[]>([]);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);

  // Upload & AI extraction form
  const [paperType, setPaperType] = useState<UgcNetPaperType>('paper-1');
  const [subjectName, setSubjectName] = useState('');
  const [subjectCode, setSubjectCode] = useState('');
  const [academicSession, setAcademicSession] = useState('2026-27');
  const [selectionMode, setSelectionMode] = useState<AiSelectionMode>('auto');
  const [selectedProvider, setSelectedProvider] = useState<ProviderId>('gemini');
  const [selectedModel, setSelectedModel] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [processing, setProcessing] = useState(false);
  const [progressStep, setProgressStep] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [actionNotice, setActionNotice] = useState('');

  // Preview / Editor state
  const [editingRecord, setEditingRecord] = useState<UgcNetSyllabusRecord | null>(null);
  const [editUnits, setEditUnits] = useState<UgcNetUnitNode[]>([]);
  const [editSubjectName, setEditSubjectName] = useState('');
  const [editSubjectCode, setEditSubjectCode] = useState('');
  const [editSession, setEditSession] = useState('');
  const [conflictInfo, setConflictInfo] = useState<UgcNetConflictInfo | null>(null);
  const [resolutionMode, setResolutionMode] = useState<'new-version' | 'replace'>('new-version');
  const [savingEdit, setSavingEdit] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Filters & inline delete confirmation
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [filterPaper, setFilterPaper] = useState<'all' | UgcNetPaperType>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | UgcNetPublicationStatus>('all');
  const [filterSubject, setFilterSubject] = useState('all');
  const [filterVersion, setFilterVersion] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [ugcRes, aiRes] = await Promise.all([
        fetchAdminUgcNetSyllabuses(adminToken),
        fetchAdminAiConfig(adminToken).catch(() => null),
      ]);
      setSummary(ugcRes.summary);
      setRecords(ugcRes.records);
      if (aiRes) {
        setProviders(aiRes.providers);
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Unable to load UGC NET records.');
    } finally {
      setLoading(false);
    }
  }, [adminToken]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openRecordEditor = (rec: UgcNetSyllabusRecord) => {
    setEditingRecord(rec);
    setEditUnits(JSON.parse(JSON.stringify(rec.units || [])) as UgcNetUnitNode[]);
    setEditSubjectName(rec.subjectName);
    setEditSubjectCode(rec.subjectCode || '');
    setEditSession(rec.academicSession);

    const activeConflict = records.find(
      (r) =>
        r.id !== rec.id &&
        r.paperType === rec.paperType &&
        r.subjectId === rec.subjectId &&
        r.isActivePublished &&
        r.publicationStatus === 'Published',
    );
    if (activeConflict) {
      setConflictInfo({
        hasConflict: true,
        existingVersionId: activeConflict.id,
        existingVersionLabel: activeConflict.versionLabel,
        existingAcademicSession: activeConflict.academicSession,
        existingPublishedAt: activeConflict.publishedAt,
        message: `Active published syllabus (${activeConflict.versionLabel}) exists for ${activeConflict.subjectName}. Choose Replace Active Version or Create New Academic Version.`,
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
      setUploadError('File exceeds the 25 MB upload size limit.');
      return;
    }
    setSelectedFile(file);
  };

  const handleProcessUpload = async () => {
    setUploadError('');
    setActionNotice('');
    if (!selectedFile) {
      setUploadError('Choose a UGC NET syllabus file first.');
      return;
    }
    if (paperType === 'paper-2' && !subjectName.trim()) {
      setUploadError('Enter the Paper 2 subject name (e.g., Computer Science and Applications).');
      return;
    }

    setProcessing(true);
    setProgressStep('Validating file & computing duplicate checksum...');
    try {
      const base64 = await readFileAsBase64(selectedFile);
      setProgressStep('Extracting curriculum text & running AI syllabus extraction...');

      const res = await processAdminUgcNetSyllabus(adminToken, {
        fileName: selectedFile.name,
        mimeType: selectedFile.type,
        fileBase64: base64,
        paperType,
        subjectName: paperType === 'paper-2' ? subjectName.trim() : undefined,
        subjectCode: paperType === 'paper-2' && subjectCode.trim() ? subjectCode.trim() : undefined,
        academicSession: academicSession.trim() || '2026-27',
        selectionMode,
        provider: selectionMode === 'auto' ? undefined : selectedProvider,
        model: selectionMode === 'auto' ? undefined : selectedModel,
      });

      setSummary(res.summary);
      setRecords((prev) => [res.syllabus, ...prev]);
      setConflictInfo(res.conflict);
      setEditingRecord(res.syllabus);
      setEditUnits(JSON.parse(JSON.stringify(res.syllabus.units)) as UgcNetUnitNode[]);
      setEditSubjectName(res.syllabus.subjectName);
      setEditSubjectCode(res.syllabus.subjectCode || '');
      setEditSession(res.syllabus.academicSession);
      setSelectedFile(null);
      setActionNotice(
        `Extracted ${res.syllabus.unitCount} units and ${res.syllabus.topicCount} topics into Draft (${res.syllabus.versionLabel}). Review below and click Publish when ready.`,
      );
      await loadData();
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : 'UGC NET syllabus extraction failed.',
      );
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
      const res = await updateAdminUgcNetSyllabus(adminToken, editingRecord.id, {
        subjectName: editingRecord.paperType === 'paper-2' ? editSubjectName : undefined,
        subjectCode: editingRecord.paperType === 'paper-2' ? editSubjectCode : undefined,
        academicSession: editSession,
        units: editUnits,
      });
      setEditingRecord(res.syllabus);
      setEditUnits(JSON.parse(JSON.stringify(res.syllabus.units)) as UgcNetUnitNode[]);
      setSummary(res.summary);
      setConflictInfo(res.conflict);
      setRecords((prev) => prev.map((r) => (r.id === res.syllabus.id ? res.syllabus : r)));
      if (res.syllabus.isActivePublished) {
        await onCatalogSync();
      }
      setActionNotice(
        `Saved ${res.syllabus.versionLabel} (${res.syllabus.unitCount} units, ${res.syllabus.topicCount} topics).`,
      );
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to save draft edits.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handlePublishRecord = async (
    targetId?: string,
    modeOverride?: 'replace' | 'new-version',
  ) => {
    const id = targetId || editingRecord?.id;
    if (!id) return;
    setPublishing(true);
    setUploadError('');
    setActionNotice('');
    try {
      const isEditingThis = editingRecord?.id === id;
      const res = await publishAdminUgcNetSyllabus(adminToken, id, {
        resolutionMode: modeOverride || resolutionMode,
        units: isEditingThis ? editUnits : undefined,
        academicSession: isEditingThis ? editSession : undefined,
        subjectName: isEditingThis && editingRecord?.paperType === 'paper-2' ? editSubjectName : undefined,
        subjectCode: isEditingThis && editingRecord?.paperType === 'paper-2' ? editSubjectCode : undefined,
      });

      setSummary(res.summary);
      await loadData();
      await onCatalogSync();
      if (onOverviewRefresh) await onOverviewRefresh();
      if (isEditingThis) {
        setEditingRecord(res.syllabus);
      }
      setActionNotice(
        `Published ${res.syllabus.paperLabel}${res.syllabus.paperType === 'paper-2' ? ` (${res.syllabus.subjectName})` : ''} · ${res.syllabus.versionLabel}. Question Generation & Mock Test synced immediately.${res.flaggedQuestions > 0 ? ` Flagged ${res.flaggedQuestions} outdated question bank item(s) for review.` : ''}`,
      );
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to publish syllabus.');
    } finally {
      setPublishing(false);
    }
  };

  const handleUnpublishRecord = async (rec: UgcNetSyllabusRecord) => {
    setUploadError('');
    setActionNotice('');
    try {
      const res = await unpublishAdminUgcNetSyllabus(adminToken, rec.id);
      setSummary(res.summary);
      await loadData();
      await onCatalogSync();
      if (onOverviewRefresh) await onOverviewRefresh();
      if (editingRecord?.id === rec.id) {
        setEditingRecord(res.syllabus);
      }
      setActionNotice(
        `Unpublished ${rec.subjectName} (${rec.versionLabel}). Removed from student Question Generation & Mock Test portals.`,
      );
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to unpublish record.');
    }
  };

  const handleDeleteRecord = async (rec: UgcNetSyllabusRecord) => {
    setUploadError('');
    setActionNotice('');
    try {
      const res = await deleteAdminUgcNetSyllabus(adminToken, rec.id);
      setSummary(res.summary);
      setConfirmDeleteId(null);
      if (editingRecord?.id === rec.id) {
        setEditingRecord(null);
      }
      await loadData();
      await onCatalogSync();
      if (onOverviewRefresh) await onOverviewRefresh();
      setActionNotice(`Deleted ${rec.subjectName} (${rec.versionLabel}).`);
    } catch (err) {
      setConfirmDeleteId(null);
      await loadData();
      setUploadError(err instanceof Error ? err.message : 'Failed to delete syllabus version.');
    }
  };

  // Tree editor helpers (Add / Edit / Delete / Reorder Units, Topics, Subtopics)
  const moveUnit = (uIdx: number, dir: -1 | 1) => {
    const target = uIdx + dir;
    if (target < 0 || target >= editUnits.length) return;
    const next = [...editUnits];
    [next[uIdx], next[target]] = [next[target], next[uIdx]];
    setEditUnits(next.map((u, i) => ({ ...u, order: i + 1 })));
  };

  const moveTopic = (uIdx: number, tIdx: number, dir: -1 | 1) => {
    const topics = editUnits[uIdx]?.topics || [];
    const target = tIdx + dir;
    if (target < 0 || target >= topics.length) return;
    const next = [...editUnits];
    const nextTopics = [...topics];
    [nextTopics[tIdx], nextTopics[target]] = [nextTopics[target], nextTopics[tIdx]];
    next[uIdx] = {
      ...next[uIdx],
      topics: nextTopics.map((t, i) => ({ ...t, order: i + 1 })),
    };
    setEditUnits(next);
  };

  const uniqueSubjects = useMemo(
    () =>
      Array.from(
        new Set(records.filter((r) => r.paperType === 'paper-2').map((r) => r.subjectName)),
      ).sort(),
    [records],
  );

  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      if (filterPaper !== 'all' && r.paperType !== filterPaper) return false;
      if (filterStatus !== 'all' && r.publicationStatus !== filterStatus) return false;
      if (filterSubject !== 'all' && r.subjectName !== filterSubject) return false;
      if (
        filterVersion.trim() &&
        !r.versionLabel.toLowerCase().includes(filterVersion.trim().toLowerCase()) &&
        !r.academicSession.toLowerCase().includes(filterVersion.trim().toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [records, filterPaper, filterStatus, filterSubject, filterVersion]);

  const activeProviderObj = providers.find((p) => p.id === selectedProvider);
  const availableModels = activeProviderObj?.models.filter((m) => m.enabled !== false) || [];

  return (
    <div className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
      {/* Header Banner */}
      <div className="px-6 py-5 bg-gradient-to-r from-[#4338CA] to-[#2563EB] text-white flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-200">
            <Sparkles className="w-4 h-4" />
            <span>UGC NET Automatic Syllabus Integration</span>
          </div>
          <h3 className="font-display font-bold text-xl mt-1">
            UGC NET Paper 1 &amp; Paper 2 Syllabus Studio
          </h3>
          <p className="text-xs text-indigo-100 mt-0.5 max-w-2xl">
            Upload NTA UGC NET PDF, Word, Excel, or CSV files once. AI extracts Units, Topics, and Subtopics for review. Publishing updates Question Generation and Mock Tests instantly.
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
        {/* Part 10 – Dedicated UGC NET Status Card */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-slate-400">
              UGC NET Paper 1 Status
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span
                className={`px-2.5 py-0.5 rounded-md text-xs font-bold ${getStatusBadgeClasses(
                  summary?.paper1Status || 'Not Uploaded',
                )}`}
              >
                {summary?.paper1Status || 'Not Uploaded'}
              </span>
              {summary?.paper1VersionLabel && (
                <span className="text-xs font-semibold text-[#4338CA] dark:text-indigo-300 tabular-nums">
                  {summary.paper1VersionLabel}
                </span>
              )}
            </div>
            <div className="mt-2 text-xs text-[#64748B] dark:text-slate-400 tabular-nums">
              {summary?.paper1UnitCount || 0} units · {summary?.paper1TopicCount || 0} topics
            </div>
          </div>

          <div className="rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-slate-400">
              Paper 2 Subjects Published
            </div>
            <div className="mt-1.5 font-display font-bold text-2xl text-[#0F172A] dark:text-white tabular-nums">
              {summary?.paper2PublishedCount ?? 0}
            </div>
            <div className="mt-1 text-xs text-[#64748B] dark:text-slate-400 tabular-nums">
              {summary?.paper2UnitCount || 0} units · {summary?.paper2TopicCount || 0} topics ({summary?.paper2TotalRecords || 0} total versions)
            </div>
          </div>

          <div className="rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-slate-400">
              Last Updated &amp; Sync Status
            </div>
            <div className="mt-1.5 font-semibold text-sm text-[#0F172A] dark:text-white tabular-nums">
              {summary?.latestUpdatedAt
                ? new Date(summary.latestUpdatedAt).toLocaleString()
                : 'No uploads yet'}
            </div>
            <div className="mt-1.5 flex items-center gap-2 text-xs text-[#64748B] dark:text-slate-400">
              <span>Latest status:</span>
              <span
                className={`px-2 py-0.5 rounded font-bold ${getStatusBadgeClasses(
                  summary?.latestProcessingStatus || 'None',
                )}`}
              >
                {summary?.latestProcessingStatus || 'None'}
              </span>
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
                <span>Review Outdated Questions</span>
              </button>
            ) : (
              <span className="mt-2 text-xs text-[#16A34A] font-medium">
                All UGC NET questions aligned
              </span>
            )}
          </div>
        </div>

        {/* Upload & AI Extraction Form */}
        <div className="rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="font-display font-bold text-base text-[#0F172A] dark:text-white">
                Upload &amp; Extract UGC NET Syllabus
              </h4>
              <p className="text-xs text-[#64748B] dark:text-slate-400">
                Uploaded syllabuses stay in Draft for Admin inspection &amp; editing until explicitly published.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-[#0F172A] dark:text-slate-200 mb-1">
                Paper Selection
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['paper-1', 'paper-2'] as const).map((pt) => (
                  <button
                    key={pt}
                    type="button"
                    onClick={() => setPaperType(pt)}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                      paperType === pt
                        ? 'border-[#4338CA] bg-indigo-50 text-[#4338CA] dark:bg-indigo-950/50 dark:text-indigo-200'
                        : 'border-[#E2E8F0] dark:border-slate-700 text-[#64748B] hover:border-slate-300'
                    }`}
                  >
                    {pt === 'paper-1' ? 'Paper 1 (General)' : 'Paper 2 (Subject)'}
                  </button>
                ))}
              </div>
            </div>

            {paperType === 'paper-2' ? (
              <>
                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] dark:text-slate-200 mb-1">
                    Paper 2 Subject Name *
                  </label>
                  <input
                    type="text"
                    list="ugc-net-existing-paper2-subjects"
                    value={subjectName}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSubjectName(val);
                      const matched = records.find(
                        (r) =>
                          r.paperType === 'paper-2' &&
                          r.subjectName.toLowerCase() === val.trim().toLowerCase() &&
                          r.subjectCode,
                      );
                      if (matched?.subjectCode) {
                        setSubjectCode(matched.subjectCode);
                      }
                    }}
                    placeholder="Enter or pick Paper 2 subject"
                    className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-sm"
                  />
                  <datalist id="ugc-net-existing-paper2-subjects">
                    {uniqueSubjects.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] dark:text-slate-200 mb-1">
                    Subject Code (Optional)
                  </label>
                  <input
                    type="text"
                    value={subjectCode}
                    onChange={(e) => setSubjectCode(e.target.value)}
                    placeholder="e.g. 87"
                    className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-sm"
                  />
                </div>
              </>
            ) : (
              <div className="lg:col-span-2 flex items-end">
                <div className="w-full px-3.5 py-2 rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/70 dark:bg-indigo-950/30 text-xs text-[#4338CA] dark:text-indigo-200 font-medium">
                  General Paper on Teaching &amp; Research Aptitude — AI extracts Unit → Topic → Subtopic hierarchy automatically.
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-[#0F172A] dark:text-slate-200 mb-1">
                Academic Session
              </label>
              <input
                type="text"
                value={academicSession}
                onChange={(e) => setAcademicSession(e.target.value)}
                placeholder="e.g. 2026-27"
                className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-sm"
              />
            </div>
          </div>

          {/* AI Provider / Model Selection */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-[#0F172A] dark:text-slate-200 mb-1">
                Extraction AI Mode
              </label>
              <select
                value={selectionMode}
                onChange={(e) => setSelectionMode(e.target.value as AiSelectionMode)}
                className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-sm"
              >
                <option value="auto">Auto (Default Configured AI)</option>
                <option value="gemini">Google Gemini</option>
                <option value="ollama">Ollama Local Open-Source AI</option>
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
                      const nextProv = e.target.value as ProviderId;
                      setSelectedProvider(nextProv);
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

          {/* Drag and Drop Area */}
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0] || null;
              handleFilePick(f);
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
                    : 'Drag & drop UGC NET syllabus file here, or click to browse'}
                </div>
                <div className="text-xs text-[#64748B] dark:text-slate-400">
                  {selectedFile
                    ? `${(selectedFile.size / 1024).toFixed(1)} KB · Ready for AI extraction`
                    : 'Supports PDF, DOCX, DOC, XLSX, XLS, CSV, TXT (max 25 MB)'}
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
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>Process &amp; Preview</span>
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

        {/* Interactive Preview, Edit, Reorder & Publish Studio */}
        {editingRecord && (
          <div className="rounded-xl border-2 border-[#4338CA]/40 bg-white dark:bg-slate-900 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E8F0] dark:border-slate-800 pb-3.5">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`px-2.5 py-0.5 rounded-md text-xs font-bold ${getStatusBadgeClasses(
                      editingRecord.publicationStatus,
                    )}`}
                  >
                    {editingRecord.publicationStatus}
                  </span>
                  <span className="text-xs font-bold text-[#4338CA] dark:text-indigo-300 tabular-nums">
                    {editingRecord.versionLabel}
                  </span>
                  <span className="text-xs text-[#64748B] dark:text-slate-400">
                    Source: {editingRecord.fileName} ({editingRecord.fileType})
                  </span>
                </div>
                <h4 className="font-display font-bold text-base text-[#0F172A] dark:text-white mt-1">
                  Review, Edit &amp; Reorder Extracted Hierarchy
                </h4>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    void downloadAdminUgcNetSyllabusFile(
                      adminToken,
                      editingRecord.id,
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
                  onClick={() => void handlePublishRecord(editingRecord.id)}
                  disabled={publishing || editUnits.length === 0}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#16A34A] hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold shadow-xs"
                >
                  {publishing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
                  <span>Approve &amp; Publish to Students</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEditingRecord(null)}
                  className="px-3 py-2 rounded-xl text-xs font-semibold text-[#64748B] hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Close Preview
                </button>
              </div>
            </div>

            {editingRecord.warnings && editingRecord.warnings.length > 0 && (
              <div className="p-3.5 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#B45309] dark:text-amber-300">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Extraction Warnings ({editingRecord.warnings.length})</span>
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
                  Existing Published Version Detected: {conflictInfo.existingVersionLabel}
                </div>
                <p className="text-xs text-[#64748B] dark:text-slate-300">{conflictInfo.message}</p>
                <div className="flex flex-wrap gap-3 text-xs font-semibold">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="ugcResMode"
                      checked={resolutionMode === 'new-version'}
                      onChange={() => setResolutionMode('new-version')}
                    />
                    <span>Create New Academic Version (Recommended — preserves history)</span>
                  </label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="ugcResMode"
                      checked={resolutionMode === 'replace'}
                      onChange={() => setResolutionMode('replace')}
                    />
                    <span>Replace Active Version (Archives previous)</span>
                  </label>
                </div>
              </div>
            )}

            {/* Metadata Editors */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {editingRecord.paperType === 'paper-2' && (
                <>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                      Subject Name
                    </label>
                    <input
                      type="text"
                      value={editSubjectName}
                      onChange={(e) => setEditSubjectName(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                      Subject Code
                    </label>
                    <input
                      type="text"
                      value={editSubjectCode}
                      onChange={(e) => setEditSubjectCode(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-sm"
                    />
                  </div>
                </>
              )}
              <div>
                <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                  Academic Session
                </label>
                <input
                  type="text"
                  value={editSession}
                  onChange={(e) => setEditSession(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-sm"
                />
              </div>
            </div>

            {/* Unit -> Topic -> Subtopic Interactive Editor */}
            <div className="flex items-center justify-between pt-1">
              <div className="text-xs font-bold text-[#0F172A] dark:text-white tabular-nums">
                Units ({editUnits.length}) · Topics ({editUnits.reduce((s, u) => s + u.topics.length, 0)})
              </div>
              <button
                type="button"
                onClick={() =>
                  setEditUnits((prev) => [
                    ...prev,
                    {
                      unitId: `unit-new-${Date.now().toString(36)}`,
                      unitNumber: prev.length + 1,
                      title: `Unit ${prev.length + 1}: New Unit`,
                      order: prev.length + 1,
                      topics: [
                        {
                          topicId: `top-new-${Date.now().toString(36)}`,
                          title: 'New Topic',
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
                <span>Add Unit</span>
              </button>
            </div>

            <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
              {editUnits.map((unit, uIdx) => (
                <div
                  key={unit.unitId || uIdx}
                  className="rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-[#F8FAFC] dark:bg-slate-950 p-3.5 space-y-2.5"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-[#4338CA] text-white text-[11px] font-bold tabular-nums">
                      U{uIdx + 1}
                    </span>
                    <input
                      type="text"
                      value={unit.title}
                      onChange={(e) => {
                        const next = [...editUnits];
                        next[uIdx] = { ...unit, title: e.target.value };
                        setEditUnits(next);
                      }}
                      className="flex-1 min-w-[200px] px-2.5 py-1 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-semibold"
                    />
                    <button
                      type="button"
                      disabled={uIdx === 0}
                      onClick={() => moveUnit(uIdx, -1)}
                      title="Move Unit Up"
                      className="p-1.5 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-slate-900 disabled:opacity-40"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={uIdx === editUnits.length - 1}
                      onClick={() => moveUnit(uIdx, 1)}
                      title="Move Unit Down"
                      className="p-1.5 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-slate-900 disabled:opacity-40"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const next = [...editUnits];
                        next[uIdx] = {
                          ...unit,
                          topics: [
                            ...unit.topics,
                            {
                              topicId: `top-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
                              title: 'New Topic',
                              order: unit.topics.length + 1,
                              subtopics: [],
                            },
                          ],
                        };
                        setEditUnits(next);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-[#2563EB] dark:text-blue-300 text-xs font-semibold"
                    >
                      <Plus className="w-3 h-3" /> Topic
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditUnits((prev) => prev.filter((_, idx) => idx !== uIdx))}
                      className="p-1.5 rounded-lg text-[#DC2626] hover:bg-red-50 dark:hover:bg-red-950/30"
                      title="Delete Unit"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Topics inside Unit */}
                  <div className="space-y-2 pl-3 sm:pl-5">
                    {unit.topics.map((topic, tIdx) => (
                      <div
                        key={topic.topicId || tIdx}
                        className="rounded-lg border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 space-y-1.5"
                      >
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] font-bold text-[#64748B] tabular-nums">
                            {uIdx + 1}.{tIdx + 1}
                          </span>
                          <input
                            type="text"
                            value={topic.title}
                            onChange={(e) => {
                              const next = [...editUnits];
                              const nextTopics = [...unit.topics];
                              nextTopics[tIdx] = { ...topic, title: e.target.value };
                              next[uIdx] = { ...unit, topics: nextTopics };
                              setEditUnits(next);
                            }}
                            className="flex-1 min-w-[180px] px-2 py-1 rounded border border-[#E2E8F0] dark:border-slate-700 text-xs font-medium bg-[#F8FAFC] dark:bg-slate-950"
                          />
                          <button
                            type="button"
                            disabled={tIdx === 0}
                            onClick={() => moveTopic(uIdx, tIdx, -1)}
                            className="p-1 rounded border border-[#E2E8F0] dark:border-slate-700 disabled:opacity-40"
                            title="Move Topic Up"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            disabled={tIdx === unit.topics.length - 1}
                            onClick={() => moveTopic(uIdx, tIdx, 1)}
                            className="p-1 rounded border border-[#E2E8F0] dark:border-slate-700 disabled:opacity-40"
                            title="Move Topic Down"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const next = [...editUnits];
                              const nextTopics = unit.topics.filter((_, idx) => idx !== tIdx);
                              next[uIdx] = { ...unit, topics: nextTopics };
                              setEditUnits(next);
                            }}
                            className="p-1 rounded text-[#DC2626] hover:bg-red-50"
                            title="Delete Topic"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>

                        {/* Subtopics comma-separated quick editor */}
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
                              const next = [...editUnits];
                              const nextTopics = [...unit.topics];
                              nextTopics[tIdx] = {
                                ...topic,
                                subtopics: parts.map((title, sIdx) => ({
                                  subtopicId:
                                    topic.subtopics[sIdx]?.subtopicId ||
                                    `sub-${uIdx + 1}-${tIdx + 1}-${sIdx + 1}`,
                                  title,
                                  order: sIdx + 1,
                                })),
                              };
                              next[uIdx] = { ...unit, topics: nextTopics };
                              setEditUnits(next);
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

        {/* Filterable UGC NET Syllabus History & Management Table */}
        <div className="rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="font-display font-bold text-base text-[#0F172A] dark:text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#4338CA]" />
                <span>UGC NET Syllabus Versions &amp; Publication Control ({filteredRecords.length})</span>
              </h4>
            </div>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            <select
              value={filterPaper}
              onChange={(e) => setFilterPaper(e.target.value as 'all' | UgcNetPaperType)}
              className="px-3 py-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-xs font-medium"
            >
              <option value="all">All Papers (Paper 1 &amp; 2)</option>
              <option value="paper-1">Paper 1 (General)</option>
              <option value="paper-2">Paper 2 (Subject-Specific)</option>
            </select>

            <select
              value={filterSubject}
              onChange={(e) => setFilterSubject(e.target.value)}
              className="px-3 py-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-xs font-medium"
            >
              <option value="all">All Subjects</option>
              {uniqueSubjects.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as 'all' | UgcNetPublicationStatus)}
              className="px-3 py-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-xs font-medium"
            >
              <option value="all">All Publication Statuses</option>
              <option value="Published">Published</option>
              <option value="Draft">Draft</option>
              <option value="Unpublished">Unpublished</option>
              <option value="Archived">Archived</option>
              <option value="Failed">Failed</option>
            </select>

            <input
              type="text"
              value={filterVersion}
              onChange={(e) => setFilterVersion(e.target.value)}
              placeholder="Filter version or session..."
              className="px-3 py-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 text-xs"
            />
          </div>

          {filteredRecords.length === 0 ? (
            <div className="p-8 rounded-xl border border-dashed border-[#CBD5E1] dark:border-slate-700 text-center text-xs sm:text-sm text-[#64748B]">
              No UGC NET syllabus versions uploaded yet. Upload Paper 1 or Paper 2 syllabus PDFs above to sync them cleanly across Question Generation and Mock Tests.
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredRecords.map((rec) => (
                <div
                  key={rec.id}
                  className="p-3.5 rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-[#F8FAFC] dark:bg-slate-950 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-bold ${getStatusBadgeClasses(
                          rec.publicationStatus,
                        )}`}
                      >
                        {rec.publicationStatus}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-[#4338CA] dark:text-indigo-300 text-[11px] font-bold">
                        {rec.paperType === 'paper-1' ? 'Paper 1' : 'Paper 2'}
                      </span>
                      <span className="text-xs font-bold text-[#0F172A] dark:text-white truncate">
                        {rec.subjectName}
                        {rec.subjectCode ? ` (${rec.subjectCode})` : ''}
                      </span>
                      <span className="text-xs font-semibold text-[#2563EB] dark:text-blue-300 tabular-nums">
                        {rec.versionLabel}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#64748B] dark:text-slate-400 flex flex-wrap items-center gap-2 tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        <FileText className="w-3 h-3" /> {rec.fileName}
                      </span>
                      <span>· {rec.unitCount} units</span>
                      <span>· {rec.topicCount} topics</span>
                      <span>· {rec.subtopicCount} subtopics</span>
                      {rec.aiProviderUsed && (
                        <span>
                          · {rec.aiProviderUsed} ({rec.aiModelUsed})
                        </span>
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
                        onClick={() => openRecordEditor(rec)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold hover:border-[#4338CA]"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-[#4338CA]" />
                        <span>Preview / Edit</span>
                      </button>
                    )}

                    {rec.publicationStatus !== 'Published' && rec.units.length > 0 && (
                      <button
                        type="button"
                        onClick={() => void handlePublishRecord(rec.id, 'new-version')}
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
                        void downloadAdminUgcNetSyllabusFile(adminToken, rec.id, rec.fileName)
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold"
                      title="Download Original Preserved Syllabus File"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>

                    {confirmDeleteId === rec.id ? (
                      <div className="inline-flex items-center gap-1.5 pl-2">
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
                              `Unpublish ${rec.subjectName} (${rec.versionLabel}) before deleting an active published version.`,
                            );
                            return;
                          }
                          setConfirmDeleteId(rec.id);
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
      </div>
    </div>
  );
};
