import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import StatusBadge from "../components/admin/StatusBadge";
import {
  fetchAssessments,
  fetchAssessment,
  updateFullAssessment,
  updateAssessmentStatus,
  duplicateAssessmentApi,
  archiveAssessment,
  addQuestion,
  updateQuestion,
  removeQuestion,
  reorderQuestions,
} from "../lib/admin-api";
import type { AssessmentType, Question, QuestionInputType, ScoringDimension } from "../lib/types";

// ============================================================
// Types
// ============================================================

interface AssessmentSummaryItem {
  id: string;
  name: string;
  description: string;
  icon: string;
  estimatedMinutes: number;
  questionCount: number;
  status: "draft" | "active" | "archived";
  category?: string;
  typeBadge?: string;
}

type ViewMode = "list" | "editor";
type EditorTab = "metadata" | "structure" | "questions" | "scoring";

// ============================================================
// Constants
// ============================================================

const INPUT_TYPE_OPTIONS: { value: QuestionInputType; label: string }[] = [
  { value: "slider", label: "Slider" },
  { value: "buttons", label: "Buttons" },
  { value: "multi_select", label: "Multi Select" },
  { value: "open_text", label: "Open Text" },
  { value: "voice", label: "Voice" },
  { value: "ai_conversation", label: "AI Conversation" },
];

const INPUT_TYPE_COLORS: Record<string, string> = {
  ai_conversation: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  slider: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  buttons: "bg-green-500/20 text-green-300 border-green-500/30",
  open_text: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  voice: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  multi_select: "bg-teal-500/20 text-teal-300 border-teal-500/30",
};

const FOLLOW_UP_CONDITIONS = ["low_score", "high_score", "vague_answer", "contradiction", "always"] as const;

// ============================================================
// Helpers
// ============================================================

function generateQuestionId(): string {
  return `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function generateAssessmentId(): string {
  return `asmnt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ============================================================
// Main Component
// ============================================================

export default function AdminAssessmentBuilderPage() {
  const navigate = useNavigate();

  // List state
  const [assessments, setAssessments] = useState<AssessmentSummaryItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "draft" | "archived">("all");
  const [search, setSearch] = useState("");

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Editor state
  const [assessment, setAssessment] = useState<AssessmentType | null>(null);
  const [editorLoading, setEditorLoading] = useState(false);
  const [editorTab, setEditorTab] = useState<EditorTab>("metadata");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Question editor state
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(null);
  const [showAddQuestion, setShowAddQuestion] = useState(false);

  // Duplicate modal
  const [duplicateTarget, setDuplicateTarget] = useState<AssessmentSummaryItem | null>(null);
  const [dupName, setDupName] = useState("");
  const [duplicating, setDuplicating] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // ============================================================
  // Data Loading
  // ============================================================

  const loadAssessments = useCallback(async () => {
    setListLoading(true);
    try {
      const data = await fetchAssessments();
      setAssessments(data.assessments ?? []);
    } catch {
      showToast("Failed to load assessments", "error");
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => { loadAssessments(); }, [loadAssessments]);

  const loadAssessment = useCallback(async (id: string) => {
    setEditorLoading(true);
    try {
      const data = await fetchAssessment(id);
      if (data?.assessment) {
        setAssessment(data.assessment);
        setDirty(false);
      }
    } catch {
      showToast("Failed to load assessment", "error");
    } finally {
      setEditorLoading(false);
    }
  }, []);

  // ============================================================
  // Filtered list
  // ============================================================

  const filtered = useMemo(() => {
    let list = assessments;
    if (statusFilter !== "all") list = list.filter((a) => a.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (a) => a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q) || a.id.toLowerCase().includes(q),
      );
    }
    return list;
  }, [assessments, statusFilter, search]);

  const counts = useMemo(() => {
    const c = { all: 0, active: 0, draft: 0, archived: 0 };
    for (const a of assessments) {
      c.all++;
      if (a.status === "active") c.active++;
      else if (a.status === "draft") c.draft++;
      else if (a.status === "archived") c.archived++;
    }
    return c;
  }, [assessments]);

  // ============================================================
  // Handlers
  // ============================================================

  const handleSelectAssessment = (id: string) => {
    setSelectedId(id);
    setViewMode("editor");
    setEditorTab("metadata");
    setExpandedQuestionId(null);
    setShowAddQuestion(false);
    loadAssessment(id);
  };

  const handleBackToList = () => {
    if (dirty) {
      if (!confirm("You have unsaved changes. Discard them?")) return;
    }
    setViewMode("list");
    setSelectedId(null);
    setAssessment(null);
    setDirty(false);
    loadAssessments();
  };

  const handleMetadataChange = (field: keyof AssessmentType, value: unknown) => {
    if (!assessment) return;
    setAssessment({ ...assessment, [field]: value } as AssessmentType);
    setDirty(true);
  };

  const handleSave = async () => {
    if (!assessment) return;
    setSaving(true);
    try {
      await updateFullAssessment(assessment.id, {
        name: assessment.name,
        description: assessment.description,
        icon: assessment.icon,
        estimatedMinutes: assessment.estimatedMinutes,
        status: assessment.status,
        phases: assessment.phases,
        sections: assessment.sections,
        questions: assessment.questions,
        scoringDimensions: assessment.scoringDimensions,
        interviewSystemPrompt: assessment.interviewSystemPrompt,
        analysisSystemPrompt: assessment.analysisSystemPrompt,
      });
      setDirty(false);
      showToast("Assessment saved", "success");
      loadAssessments();
    } catch {
      showToast("Failed to save assessment", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    if (!selectedId) return;
    loadAssessment(selectedId);
  };

  const handleStatusChange = async (id: string, newStatus: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await updateAssessmentStatus(id, newStatus);
      showToast(`Status changed to ${newStatus}`, "success");
      loadAssessments();
      if (assessment && assessment.id === id) {
        setAssessment({ ...assessment, status: newStatus as AssessmentType["status"] });
      }
    } catch {
      showToast("Failed to update status", "error");
    }
  };

  const handleArchive = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await archiveAssessment(id);
      showToast("Assessment archived", "success");
      if (viewMode === "editor" && selectedId === id) handleBackToList();
      else loadAssessments();
    } catch {
      showToast("Failed to archive assessment", "error");
    }
  };

  const handleDuplicate = async () => {
    if (!duplicateTarget || !dupName.trim()) return;
    setDuplicating(true);
    try {
      const newId = generateAssessmentId();
      await duplicateAssessmentApi(duplicateTarget.id, newId, dupName.trim());
      setDuplicateTarget(null);
      setDupName("");
      showToast("Assessment duplicated", "success");
      loadAssessments();
    } catch {
      showToast("Failed to duplicate assessment", "error");
    } finally {
      setDuplicating(false);
    }
  };

  // ---- Question handlers ----

  const handleAddQuestion = async (question: Question) => {
    if (!assessment) return;
    try {
      await addQuestion(assessment.id, question as unknown as Record<string, unknown>);
      setShowAddQuestion(false);
      await loadAssessment(assessment.id);
      showToast("Question added", "success");
    } catch {
      showToast("Failed to add question", "error");
    }
  };

  const handleUpdateQuestion = (questionId: string, changes: Partial<Question>) => {
    if (!assessment) return;
    setAssessment({
      ...assessment,
      questions: assessment.questions.map((q) =>
        q.id === questionId ? { ...q, ...changes } : q,
      ),
    });
    setDirty(true);
  };

  const handleRemoveQuestion = async (questionId: string) => {
    if (!assessment) return;
    if (!confirm("Remove this question?")) return;
    try {
      await removeQuestion(assessment.id, questionId);
      await loadAssessment(assessment.id);
      showToast("Question removed", "success");
    } catch {
      showToast("Failed to remove question", "error");
    }
  };

  const handleMoveQuestion = (index: number, direction: "up" | "down") => {
    if (!assessment) return;
    const questions = [...assessment.questions];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= questions.length) return;
    [questions[index], questions[targetIndex]] = [questions[targetIndex], questions[index]];
    setAssessment({ ...assessment, questions });
    setDirty(true);
  };

  // ---- Phase / Section handlers ----

  const handleAddPhase = () => {
    if (!assessment) return;
    const order = assessment.phases.length;
    const id = `phase_${Date.now().toString(36)}`;
    setAssessment({
      ...assessment,
      phases: [...assessment.phases, { id, label: `Phase ${order + 1}`, order }],
    });
    setDirty(true);
  };

  const handleRemovePhase = (phaseId: string) => {
    if (!assessment) return;
    setAssessment({
      ...assessment,
      phases: assessment.phases.filter((p) => p.id !== phaseId),
      sections: assessment.sections.filter((s) => s.phaseId !== phaseId),
    });
    setDirty(true);
  };

  const handleAddSection = (phaseId: string) => {
    if (!assessment) return;
    const phaseSections = assessment.sections.filter((s) => s.phaseId === phaseId);
    const order = phaseSections.length;
    const id = `section_${Date.now().toString(36)}`;
    setAssessment({
      ...assessment,
      sections: [...assessment.sections, { id, label: `Section ${order + 1}`, phaseId, order }],
    });
    setDirty(true);
  };

  const handleRemoveSection = (sectionId: string) => {
    if (!assessment) return;
    setAssessment({
      ...assessment,
      sections: assessment.sections.filter((s) => s.id !== sectionId),
    });
    setDirty(true);
  };

  // ---- Scoring dimension handlers ----

  const handleAddDimension = () => {
    if (!assessment) return;
    const id = `dim_${Date.now().toString(36)}`;
    setAssessment({
      ...assessment,
      scoringDimensions: [
        ...assessment.scoringDimensions,
        { id, label: "New Dimension", description: "", weight: 1 },
      ],
    });
    setDirty(true);
  };

  const handleRemoveDimension = (dimId: string) => {
    if (!assessment) return;
    setAssessment({
      ...assessment,
      scoringDimensions: assessment.scoringDimensions.filter((d) => d.id !== dimId),
    });
    setDirty(true);
  };

  const handleUpdateDimension = (dimId: string, changes: Partial<{ id: string; label: string; description: string; weight: number }>) => {
    if (!assessment) return;
    setAssessment({
      ...assessment,
      scoringDimensions: assessment.scoringDimensions.map((d) =>
        d.id === dimId ? { ...d, ...changes } : d,
      ),
    });
    setDirty(true);
  };

  // ============================================================
  // Render: List View
  // ============================================================

  if (viewMode === "list") {
    return (
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {toast && (
          <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl text-sm font-medium shadow-lg border transition-all ${toast.type === "success" ? "bg-green-500/20 text-green-400 border-green-500/30" : "bg-red-500/20 text-red-400 border-red-500/30"}`}>
            {toast.message}
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground/90 tracking-tight">Assessment Templates</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Manage, create, and edit your assessment library.</p>
          </div>
          <button
            onClick={() => navigate("/admin/builder")}
            className="w-full sm:w-auto px-4 py-2 text-sm font-medium rounded-xl transition-all bg-gradient-to-r from-blue-600 to-cyan-500 text-white hover:opacity-90 shadow-lg shadow-blue-500/20"
          >
            + Create Assessment
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-1">
            {(["all", "active", "draft", "archived"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setStatusFilter(tab)}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                  statusFilter === tab
                    ? "bg-foreground/[0.08] text-foreground border border-foreground/15"
                    : "text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] border border-transparent"
                }`}
              >
                {tab === "all" ? "All" : tab.charAt(0).toUpperCase() + tab.slice(1)}
                <span className="ml-2 text-xs tabular-nums text-muted-foreground">{counts[tab]}</span>
              </button>
            ))}
          </div>
          <div className="relative">
            <input
              type="text"
              placeholder="Search assessments..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-muted border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-border transition-colors w-full sm:w-64"
            />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total", value: counts.all, color: "text-foreground/90" },
            { label: "Active", value: counts.active, color: "text-green-400" },
            { label: "Draft", value: counts.draft, color: "text-yellow-400" },
            { label: "Archived", value: counts.archived, color: "text-muted-foreground" },
          ].map((stat) => (
            <div key={stat.label} className="bg-muted border border-border rounded-xl px-4 py-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">{stat.label}</p>
              <p className={`text-lg font-semibold ${stat.color} mt-1 tabular-nums`}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Assessment cards */}
        {listLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground/40" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="text-5xl mb-4 opacity-30">&#128203;</div>
            <p className="text-muted-foreground text-sm mb-1">No assessments found.</p>
            <button onClick={() => navigate("/admin/builder")} className="mt-4 px-5 py-2.5 text-sm font-medium rounded-xl bg-foreground/[0.08] border border-foreground/15 text-foreground hover:bg-foreground/[0.12] transition-colors">
              + Create Assessment
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((a) => (
              <div
                key={a.id}
                onClick={() => handleSelectAssessment(a.id)}
                className="group relative bg-muted border border-border rounded-2xl p-5 hover:border-foreground/15 transition-all cursor-pointer"
              >
                <div className="flex items-start justify-between mb-3">
                  <span className="text-3xl leading-none">{a.icon}</span>
                  <StatusBadge status={a.status} />
                </div>
                <h3 className="text-sm md:text-base font-semibold text-foreground/90 leading-snug">{a.name}</h3>
                <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2 leading-relaxed">{a.description}</p>
                <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
                  <span>{a.questionCount} questions</span>
                  <span>{a.estimatedMinutes} min</span>
                  <span className="ml-auto text-[11px] font-mono">{a.id}</span>
                </div>
                <div className="border-t border-border mt-4 pt-3 flex items-center gap-1.5 flex-wrap">
                  {a.status === "draft" && (
                    <button onClick={(e) => handleStatusChange(a.id, "active", e)} className="px-2.5 py-1 text-xs rounded-lg border bg-green-500/10 border-green-500/25 text-green-400 hover:bg-green-500/20 transition-colors">Activate</button>
                  )}
                  {a.status === "active" && (
                    <button onClick={(e) => handleArchive(a.id, e)} className="px-2.5 py-1 text-xs rounded-lg border bg-gray-500/10 border-gray-500/25 text-muted-foreground hover:bg-gray-500/20 transition-colors">Archive</button>
                  )}
                  {a.status === "archived" && (
                    <button onClick={(e) => handleStatusChange(a.id, "active", e)} className="px-2.5 py-1 text-xs rounded-lg border bg-blue-500/10 border-blue-500/25 text-blue-400 hover:bg-blue-500/20 transition-colors">Reactivate</button>
                  )}
                  <button onClick={(e) => { e.stopPropagation(); setDuplicateTarget(a); setDupName(`${a.name} (Copy)`); }} className="px-2.5 py-1 text-xs rounded-lg border bg-blue-500/10 border-blue-500/25 text-blue-400 hover:bg-blue-500/20 transition-colors">Duplicate</button>
                  <button onClick={(e) => { e.stopPropagation(); navigate(`/admin/preview/${a.id}`); }} className="px-2.5 py-1 text-xs rounded-lg border bg-blue-500/10 border-blue-500/25 text-blue-400 hover:bg-blue-500/20 transition-colors">Preview</button>
                  <button onClick={(e) => { e.stopPropagation(); handleSelectAssessment(a.id); }} className="ml-auto px-2.5 py-1 text-xs rounded-lg border bg-foreground/[0.04] border-border text-muted-foreground hover:bg-foreground/[0.08] transition-colors">Edit</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Duplicate modal */}
        {duplicateTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDuplicateTarget(null)} />
            <div className="relative bg-card border border-border rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl">
              <h2 className="text-lg font-semibold text-foreground/90 mb-4">Duplicate Assessment</h2>
              <label className="block text-xs text-muted-foreground mb-1.5">New Assessment Name</label>
              <input
                type="text"
                value={dupName}
                onChange={(e) => setDupName(e.target.value)}
                autoFocus
                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-border mb-4"
                onKeyDown={(e) => { if (e.key === "Enter") handleDuplicate(); }}
              />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setDuplicateTarget(null)} className="px-4 py-2 text-sm rounded-lg border border-border text-muted-foreground hover:bg-foreground/[0.04] transition-colors">Cancel</button>
                <button onClick={handleDuplicate} disabled={duplicating || !dupName.trim()} className="px-5 py-2 text-sm font-medium rounded-lg bg-foreground/[0.10] border border-foreground/15 text-foreground hover:bg-foreground/[0.15] disabled:opacity-50 transition-colors">
                  {duplicating ? "Duplicating..." : "Duplicate"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================================================
  // Render: Editor View
  // ============================================================

  return (
    <div className="h-full flex flex-col">
      {toast && (
        <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl text-sm font-medium shadow-lg border transition-all ${toast.type === "success" ? "bg-green-500/20 text-green-400 border-green-500/30" : "bg-red-500/20 text-red-400 border-red-500/30"}`}>
          {toast.message}
        </div>
      )}

      {/* Editor header */}
      <div className="shrink-0 border-b border-border px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={handleBackToList} className="text-muted-foreground hover:text-foreground transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
          </button>
          {assessment && (
            <div className="flex items-center gap-2">
              <span className="text-xl">{assessment.icon}</span>
              <div>
                <h1 className="text-sm font-semibold text-foreground/90">{assessment.name}</h1>
                <p className="text-[11px] text-muted-foreground font-mono">{assessment.id}</p>
              </div>
              <StatusBadge status={assessment.status} />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {assessment && (
            <button
              onClick={() => navigate(`/admin/preview/${assessment.id}`)}
              className="px-3 py-1.5 text-xs rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-colors"
            >
              Preview
            </button>
          )}
          {assessment && (
            <button
              onClick={() => navigate(`/admin/builder/${assessment.id}`)}
              className="px-3 py-1.5 text-xs rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300 hover:bg-blue-500/20 transition-colors"
            >
              AI Builder
            </button>
          )}
          {dirty && (
            <>
              <button onClick={handleDiscard} className="px-3 py-1.5 text-xs rounded-lg border border-border text-muted-foreground hover:bg-foreground/[0.04] transition-colors">
                Discard
              </button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-1.5 text-xs font-medium rounded-lg bg-white text-black hover:bg-foreground/90 disabled:opacity-50 transition-colors">
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </>
          )}
        </div>
      </div>

      {editorLoading || !assessment ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground/40" />
        </div>
      ) : (
        <div className="flex-1 flex min-h-0">
          {/* Editor sidebar tabs */}
          <nav className="shrink-0 w-48 border-r border-border py-4 px-2 space-y-1">
            {([
              { id: "metadata" as EditorTab, label: "Metadata", icon: "M11.25 4.5l7.5 7.5-7.5 7.5m-6-15l7.5 7.5-7.5 7.5" },
              { id: "structure" as EditorTab, label: "Phases & Sections", icon: "M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6z" },
              { id: "questions" as EditorTab, label: "Questions", icon: "M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" },
              { id: "scoring" as EditorTab, label: "Scoring", icon: "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" },
            ]).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setEditorTab(tab.id)}
                className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm transition-all ${
                  editorTab === tab.id
                    ? "bg-foreground/[0.08] text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]"
                }`}
              >
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
                </svg>
                {tab.label}
              </button>
            ))}

            {/* Status controls */}
            <div className="pt-4 mt-4 border-t border-border space-y-1.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider px-3 mb-2">Status</p>
              {(["draft", "active", "archived"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => handleStatusChange(assessment.id, s)}
                  className={`w-full px-3 py-1.5 rounded-lg text-xs font-medium border transition-all text-left ${
                    assessment.status === s
                      ? s === "draft" ? "bg-yellow-500/20 text-yellow-300 border-yellow-500/30"
                      : s === "active" ? "bg-green-500/20 text-green-300 border-green-500/30"
                      : "bg-gray-500/20 text-muted-foreground border-gray-500/30"
                      : "bg-muted text-muted-foreground border-border hover:bg-foreground/[0.04]"
                  }`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </nav>

          {/* Editor content */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-4xl">
              {/* METADATA TAB */}
              {editorTab === "metadata" && (
                <div className="space-y-6">
                  <h2 className="text-lg font-semibold text-foreground/90">Assessment Metadata</h2>

                  <div className="grid grid-cols-[80px_1fr] gap-4 items-start">
                    <div>
                      <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-1.5">Icon</label>
                      <input
                        type="text"
                        value={assessment.icon || ""}
                        onChange={(e) => handleMetadataChange("icon", e.target.value)}
                        className="w-full bg-muted border border-border rounded-lg px-3 py-3 text-2xl text-center outline-none focus:border-border transition-colors"
                        maxLength={4}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-1.5">Name</label>
                      <input
                        type="text"
                        value={assessment.name}
                        onChange={(e) => handleMetadataChange("name", e.target.value)}
                        className="w-full bg-muted border border-border rounded-lg px-4 py-3 text-sm text-foreground outline-none focus:border-border transition-colors"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-1.5">Description</label>
                    <textarea
                      value={assessment.description}
                      onChange={(e) => handleMetadataChange("description", e.target.value)}
                      rows={3}
                      className="w-full bg-muted border border-border rounded-lg px-4 py-3 text-sm text-foreground outline-none focus:border-border transition-colors resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-1.5">Estimated Minutes</label>
                      <input
                        type="number"
                        min={1}
                        max={300}
                        value={assessment.estimatedMinutes}
                        onChange={(e) => handleMetadataChange("estimatedMinutes", parseInt(e.target.value) || 0)}
                        className="w-full bg-muted border border-border rounded-lg px-4 py-3 text-sm text-foreground outline-none focus:border-border transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-1.5">Status</label>
                      <select
                        value={assessment.status}
                        onChange={(e) => handleStatusChange(assessment.id, e.target.value)}
                        className="w-full bg-muted border border-border rounded-lg px-4 py-3 text-sm text-foreground outline-none focus:border-border transition-colors appearance-none"
                      >
                        <option value="draft">Draft</option>
                        <option value="active">Active</option>
                        <option value="archived">Archived</option>
                      </select>
                    </div>
                  </div>

                  {/* Summary stats */}
                  <div className="grid grid-cols-4 gap-3">
                    {[
                      { label: "Questions", value: assessment.questions.length },
                      { label: "Phases", value: assessment.phases.length },
                      { label: "Sections", value: assessment.sections.length },
                      { label: "Dimensions", value: assessment.scoringDimensions.length },
                    ].map((stat) => (
                      <div key={stat.label} className="bg-muted border border-border rounded-xl p-3 text-center">
                        <div className="text-lg font-semibold text-foreground">{stat.value}</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">{stat.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Timestamps */}
                  <div className="bg-muted border border-border rounded-xl p-4">
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <span className="text-muted-foreground">Created</span>
                        <p className="text-foreground/70 mt-0.5">{new Date(assessment.createdAt).toLocaleString()}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Last Updated</span>
                        <p className="text-foreground/70 mt-0.5">{new Date(assessment.updatedAt).toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* STRUCTURE TAB */}
              {editorTab === "structure" && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-foreground/90">Phases & Sections</h2>
                    <button onClick={handleAddPhase} className="px-3 py-1.5 text-xs rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-colors">
                      + Add Phase
                    </button>
                  </div>

                  {assessment.phases.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground text-sm">
                      No phases defined. Add a phase to get started.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {[...assessment.phases].sort((a, b) => a.order - b.order).map((phase, phaseIdx) => {
                        const phaseSections = assessment.sections
                          .filter((s) => s.phaseId === phase.id)
                          .sort((a, b) => a.order - b.order);
                        const phaseQuestionCount = phaseSections.reduce(
                          (sum, s) => sum + assessment.questions.filter((q) => q.section === s.id).length, 0
                        );

                        return (
                          <div key={phase.id} className="bg-muted border border-border rounded-xl p-4">
                            <div className="flex items-center gap-3 mb-3">
                              <span className="text-xs text-muted-foreground font-mono w-6 shrink-0">#{phaseIdx + 1}</span>
                              <input
                                type="text"
                                value={phase.label}
                                onChange={(e) => {
                                  setAssessment({
                                    ...assessment,
                                    phases: assessment.phases.map((p) => p.id === phase.id ? { ...p, label: e.target.value } : p),
                                  });
                                  setDirty(true);
                                }}
                                className="flex-1 bg-transparent border border-transparent hover:border-border focus:border-border rounded-lg px-2 py-1 text-sm font-medium text-foreground/90 outline-none transition-colors"
                              />
                              <span className="text-xs text-muted-foreground">{phaseQuestionCount} questions</span>
                              <button
                                onClick={() => handleAddSection(phase.id)}
                                className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                              >
                                + Section
                              </button>
                              <button
                                onClick={() => handleRemovePhase(phase.id)}
                                className="text-muted-foreground hover:text-red-400 transition-colors p-1"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>

                            {phaseSections.length > 0 && (
                              <div className="ml-8 space-y-1.5">
                                {phaseSections.map((sec) => {
                                  const secQuestionCount = assessment.questions.filter((q) => q.section === sec.id).length;
                                  return (
                                    <div key={sec.id} className="flex items-center gap-2 group">
                                      <div className="w-1 h-4 bg-border rounded-full" />
                                      <input
                                        type="text"
                                        value={sec.label}
                                        onChange={(e) => {
                                          setAssessment({
                                            ...assessment,
                                            sections: assessment.sections.map((s) => s.id === sec.id ? { ...s, label: e.target.value } : s),
                                          });
                                          setDirty(true);
                                        }}
                                        className="flex-1 bg-transparent border border-transparent hover:border-border focus:border-border rounded px-2 py-0.5 text-xs text-muted-foreground outline-none transition-colors"
                                      />
                                      <span className="text-[10px] text-muted-foreground">{secQuestionCount} q</span>
                                      <button
                                        onClick={() => handleRemoveSection(sec.id)}
                                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-all p-0.5"
                                      >
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* QUESTIONS TAB */}
              {editorTab === "questions" && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-foreground/90">
                      Questions <span className="text-muted-foreground font-normal text-sm ml-1">({assessment.questions.length})</span>
                    </h2>
                    <button
                      onClick={() => setShowAddQuestion(true)}
                      className="px-3 py-1.5 text-xs rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-colors"
                    >
                      + Add Question
                    </button>
                  </div>

                  {/* Input type legend */}
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(INPUT_TYPE_COLORS)
                      .filter(([type]) => assessment.questions.some((q) => q.inputType === type))
                      .map(([type, colors]) => (
                        <span key={type} className={`text-[9px] px-1.5 py-0.5 rounded border ${colors}`}>
                          {INPUT_TYPE_OPTIONS.find((o) => o.value === type)?.label || type}
                        </span>
                      ))}
                  </div>

                  {/* Question list */}
                  {assessment.questions.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground text-sm">
                      No questions yet. Add your first question above.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {assessment.questions.map((question, idx) => {
                        const isExpanded = expandedQuestionId === question.id;
                        const section = assessment.sections.find((s) => s.id === question.section);

                        return (
                          <div key={question.id} className={`bg-muted border rounded-xl transition-colors ${isExpanded ? "border-blue-500/30" : "border-border hover:border-foreground/15"}`}>
                            {/* Summary row */}
                            <div
                              className="p-3 flex items-start gap-3 cursor-pointer"
                              onClick={() => setExpandedQuestionId(isExpanded ? null : question.id)}
                            >
                              {/* Reorder buttons */}
                              <div className="flex flex-col gap-0.5 shrink-0 mt-0.5">
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleMoveQuestion(idx, "up"); }}
                                  disabled={idx === 0}
                                  className="text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors"
                                >
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                                  </svg>
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleMoveQuestion(idx, "down"); }}
                                  disabled={idx === assessment.questions.length - 1}
                                  className="text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors"
                                >
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                  </svg>
                                </button>
                              </div>

                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-foreground/80 leading-relaxed">{question.text}</p>
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${INPUT_TYPE_COLORS[question.inputType] || "bg-muted text-muted-foreground border-border"}`}>
                                    {INPUT_TYPE_OPTIONS.find((o) => o.value === question.inputType)?.label || question.inputType}
                                  </span>
                                  {section && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{section.label}</span>
                                  )}
                                  <span className="text-[10px] text-muted-foreground">w:{question.weight}</span>
                                  {question.scoringDimensions.slice(0, 2).map((dim) => (
                                    <span key={dim} className="text-[10px] bg-blue-500/10 text-blue-300 border border-blue-500/20 px-1.5 py-0.5 rounded">{dim}</span>
                                  ))}
                                  {question.scoringDimensions.length > 2 && (
                                    <span className="text-[10px] text-muted-foreground">+{question.scoringDimensions.length - 2}</span>
                                  )}
                                </div>
                              </div>

                              {/* Actions */}
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleRemoveQuestion(question.id); }}
                                  className="p-1 text-muted-foreground hover:text-red-400 transition-colors rounded"
                                >
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                  </svg>
                                </button>
                                <svg className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                </svg>
                              </div>
                            </div>

                            {/* Expanded editor */}
                            {isExpanded && (
                              <div className="border-t border-border px-4 py-4 space-y-4" onClick={(e) => e.stopPropagation()}>
                                <div>
                                  <label className="block text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Question Text</label>
                                  <textarea
                                    value={question.text}
                                    onChange={(e) => handleUpdateQuestion(question.id, { text: e.target.value })}
                                    rows={3}
                                    className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-blue-500/40 resize-none"
                                  />
                                </div>

                                <div className="grid grid-cols-3 gap-3">
                                  <div>
                                    <label className="block text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Input Type</label>
                                    <select
                                      value={question.inputType}
                                      onChange={(e) => handleUpdateQuestion(question.id, { inputType: e.target.value as QuestionInputType })}
                                      className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-blue-500/40 appearance-none"
                                    >
                                      {INPUT_TYPE_OPTIONS.map((t) => (
                                        <option key={t.value} value={t.value} className="bg-card">{t.label}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Weight</label>
                                    <input
                                      type="number"
                                      min={0.5}
                                      max={3}
                                      step={0.5}
                                      value={question.weight}
                                      onChange={(e) => handleUpdateQuestion(question.id, { weight: parseFloat(e.target.value) || 1 })}
                                      className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-blue-500/40"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Required</label>
                                    <button
                                      onClick={() => handleUpdateQuestion(question.id, { required: !question.required })}
                                      className={`w-full px-3 py-2 rounded-lg text-sm border transition-colors ${
                                        question.required
                                          ? "bg-green-500/20 text-green-300 border-green-500/30"
                                          : "bg-muted text-muted-foreground border-border"
                                      }`}
                                    >
                                      {question.required ? "Required" : "Optional"}
                                    </button>
                                  </div>
                                </div>

                                {/* Options editor for buttons/multi_select */}
                                {(question.inputType === "buttons" || question.inputType === "multi_select") && (
                                  <div>
                                    <label className="block text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Options</label>
                                    <div className="space-y-1.5">
                                      {(question.options || []).map((opt, optIdx) => (
                                        <div key={optIdx} className="flex items-center gap-2">
                                          <input
                                            type="text"
                                            value={opt.label}
                                            onChange={(e) => {
                                              const newOptions = [...(question.options || [])];
                                              newOptions[optIdx] = { ...opt, label: e.target.value };
                                              handleUpdateQuestion(question.id, { options: newOptions });
                                            }}
                                            placeholder="Label"
                                            className="flex-1 bg-muted border border-border rounded px-2 py-1 text-xs text-foreground outline-none"
                                          />
                                          <input
                                            type="text"
                                            value={opt.value}
                                            onChange={(e) => {
                                              const newOptions = [...(question.options || [])];
                                              newOptions[optIdx] = { ...opt, value: e.target.value };
                                              handleUpdateQuestion(question.id, { options: newOptions });
                                            }}
                                            placeholder="Value"
                                            className="w-24 bg-muted border border-border rounded px-2 py-1 text-xs text-foreground outline-none"
                                          />
                                          <button
                                            onClick={() => {
                                              const newOptions = (question.options || []).filter((_, i) => i !== optIdx);
                                              handleUpdateQuestion(question.id, { options: newOptions });
                                            }}
                                            className="text-muted-foreground hover:text-red-400 transition-colors"
                                          >
                                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                          </button>
                                        </div>
                                      ))}
                                      <button
                                        onClick={() => {
                                          const newOptions = [...(question.options || []), { label: "", value: "" }];
                                          handleUpdateQuestion(question.id, { options: newOptions });
                                        }}
                                        className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                                      >
                                        + Add Option
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {/* Scoring dimensions */}
                                <div>
                                  <label className="block text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Scoring Dimensions</label>
                                  <div className="flex flex-wrap gap-1.5">
                                    {assessment.scoringDimensions.map((dim) => {
                                      const isSelected = question.scoringDimensions.includes(dim.id as ScoringDimension);
                                      return (
                                        <button
                                          key={dim.id}
                                          onClick={() => {
                                            const newDims = isSelected
                                              ? question.scoringDimensions.filter((d) => d !== dim.id)
                                              : [...question.scoringDimensions, dim.id as ScoringDimension];
                                            handleUpdateQuestion(question.id, { scoringDimensions: newDims });
                                          }}
                                          className={`text-[10px] px-2 py-1 rounded-full border transition-colors ${
                                            isSelected
                                              ? "bg-blue-500/20 text-blue-300 border-blue-500/30"
                                              : "bg-muted text-muted-foreground border-border hover:border-blue-500/30"
                                          }`}
                                        >
                                          {dim.label}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>

                                {/* AI Follow-up prompt */}
                                <div>
                                  <label className="block text-[11px] text-muted-foreground uppercase tracking-wider mb-1">AI Follow-up Prompt (optional)</label>
                                  <textarea
                                    value={question.aiFollowUpPrompt || ""}
                                    onChange={(e) => handleUpdateQuestion(question.id, { aiFollowUpPrompt: e.target.value || undefined })}
                                    rows={2}
                                    placeholder="Custom prompt for AI follow-up..."
                                    className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-blue-500/40 resize-none"
                                  />
                                </div>

                                {/* Follow-up triggers */}
                                <div>
                                  <label className="block text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Follow-up Trigger</label>
                                  <div className="flex flex-wrap gap-1.5">
                                    {FOLLOW_UP_CONDITIONS.map((cond) => {
                                      const isSelected = question.followUpTrigger?.condition === cond;
                                      return (
                                        <button
                                          key={cond}
                                          onClick={() => {
                                            handleUpdateQuestion(question.id, {
                                              followUpTrigger: isSelected ? undefined : { condition: cond },
                                            });
                                          }}
                                          className={`text-[10px] px-2 py-1 rounded-full border transition-colors ${
                                            isSelected
                                              ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                                              : "bg-muted text-muted-foreground border-border hover:border-amber-500/30"
                                          }`}
                                        >
                                          {cond.replace(/_/g, " ")}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>

                                {/* Tags */}
                                <div>
                                  <label className="block text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Tags (comma-separated)</label>
                                  <input
                                    type="text"
                                    value={(question.tags || []).join(", ")}
                                    onChange={(e) => {
                                      const tags = e.target.value.split(",").map((t) => t.trim()).filter(Boolean);
                                      handleUpdateQuestion(question.id, { tags });
                                    }}
                                    placeholder="tag1, tag2, ..."
                                    className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-blue-500/40"
                                  />
                                </div>

                                {/* Read-only metadata */}
                                <div className="grid grid-cols-3 gap-3 text-xs pt-3 border-t border-border">
                                  <div>
                                    <span className="text-muted-foreground">ID</span>
                                    <p className="text-foreground/60 font-mono mt-0.5 text-[10px] break-all">{question.id}</p>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Phase</span>
                                    <p className="text-foreground/60 mt-0.5">{assessment.phases.find((p) => p.id === question.phase)?.label || question.phase}</p>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Section</span>
                                    <p className="text-foreground/60 mt-0.5">{section?.label || question.section}</p>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Add Question Form */}
                  {showAddQuestion && (
                    <AddQuestionForm
                      assessment={assessment}
                      onAdd={handleAddQuestion}
                      onCancel={() => setShowAddQuestion(false)}
                    />
                  )}
                </div>
              )}

              {/* SCORING TAB */}
              {editorTab === "scoring" && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-foreground/90">
                      Scoring Dimensions <span className="text-muted-foreground font-normal text-sm ml-1">({assessment.scoringDimensions.length})</span>
                    </h2>
                    <button onClick={handleAddDimension} className="px-3 py-1.5 text-xs rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-colors">
                      + Add Dimension
                    </button>
                  </div>

                  {/* Total weight indicator */}
                  {assessment.scoringDimensions.length > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Total weight:</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${
                        Math.abs(assessment.scoringDimensions.reduce((s, d) => s + d.weight, 0) - 1) < 0.01
                          ? "bg-green-500/15 text-green-300 border-green-500/25"
                          : "bg-yellow-500/15 text-yellow-300 border-yellow-500/25"
                      }`}>
                        {Math.round(assessment.scoringDimensions.reduce((s, d) => s + d.weight, 0) * 100)}%
                      </span>
                    </div>
                  )}

                  {assessment.scoringDimensions.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground text-sm">
                      No scoring dimensions defined. Add your first dimension above.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {assessment.scoringDimensions.map((dim) => {
                        const linkedCount = assessment.questions.filter((q) =>
                          q.scoringDimensions.includes(dim.id as ScoringDimension)
                        ).length;

                        return (
                          <div key={dim.id} className="bg-muted border border-border rounded-xl p-4 space-y-3">
                            <div className="flex items-start gap-3">
                              <div className="flex-1 space-y-2">
                                <input
                                  type="text"
                                  value={dim.label}
                                  onChange={(e) => handleUpdateDimension(dim.id, { label: e.target.value })}
                                  className="w-full bg-transparent border border-transparent hover:border-border focus:border-border rounded px-2 py-1 text-sm font-medium text-foreground/90 outline-none transition-colors"
                                />
                                <textarea
                                  value={dim.description}
                                  onChange={(e) => handleUpdateDimension(dim.id, { description: e.target.value })}
                                  rows={2}
                                  placeholder="Dimension description..."
                                  className="w-full bg-muted border border-border rounded px-2 py-1 text-xs text-muted-foreground outline-none focus:border-blue-500/40 resize-none"
                                />
                              </div>
                              <div className="shrink-0 space-y-1 text-right">
                                <div className="flex items-center gap-1.5">
                                  <label className="text-[10px] text-muted-foreground">Weight:</label>
                                  <input
                                    type="number"
                                    min={0}
                                    max={1}
                                    step={0.05}
                                    value={dim.weight}
                                    onChange={(e) => handleUpdateDimension(dim.id, { weight: parseFloat(e.target.value) || 0 })}
                                    className="w-16 bg-muted border border-border rounded px-2 py-1 text-xs text-foreground outline-none text-right"
                                  />
                                </div>
                                <p className="text-[10px] text-muted-foreground">{linkedCount} questions linked</p>
                                <button
                                  onClick={() => handleRemoveDimension(dim.id)}
                                  className="text-[10px] text-muted-foreground hover:text-red-400 transition-colors"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                            {/* Weight bar */}
                            <div className="w-full h-1.5 bg-foreground/[0.06] rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-blue-500/80 to-cyan-500/80 transition-all duration-300"
                                style={{ width: `${Math.round(dim.weight * 100)}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Floating save bar */}
      {dirty && (
        <div className="shrink-0 border-t border-border bg-background px-6 py-3 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">You have unsaved changes</span>
          <div className="flex gap-2">
            <button onClick={handleDiscard} className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground bg-muted border border-border hover:bg-foreground/[0.06] transition-colors">
              Discard
            </button>
            <button onClick={handleSave} disabled={saving} className="px-5 py-2 rounded-lg text-sm font-medium bg-white text-black hover:bg-foreground/90 transition-colors disabled:opacity-50 flex items-center gap-2">
              {saving ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-black/20 border-t-black/60 rounded-full animate-spin" />
                  Saving...
                </>
              ) : "Save Changes"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Add Question Form Component
// ============================================================

function AddQuestionForm({
  assessment,
  onAdd,
  onCancel,
}: {
  assessment: AssessmentType;
  onAdd: (question: Question) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  const [inputType, setInputType] = useState<QuestionInputType>("ai_conversation");
  const [section, setSection] = useState(assessment.sections[0]?.id || "");
  const [phase, setPhase] = useState(assessment.phases[0]?.id || "");
  const [weight, setWeight] = useState(1);
  const [required, setRequired] = useState(true);
  const [selectedDimensions, setSelectedDimensions] = useState<ScoringDimension[]>([]);
  const [tags, setTags] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;

    const question: Question = {
      id: generateQuestionId(),
      text: text.trim(),
      inputType,
      section: section as Question["section"],
      phase: phase as Question["phase"],
      weight,
      required,
      scoringDimensions: selectedDimensions,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
    };

    onAdd(question);
  };

  return (
    <div className="bg-muted border border-blue-500/30 rounded-xl p-5 space-y-4">
      <h3 className="text-sm font-semibold text-foreground/90">Add New Question</h3>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Question Text</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            autoFocus
            placeholder="Enter your question..."
            className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-blue-500/40 resize-none"
          />
        </div>

        <div className="grid grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Input Type</label>
            <select
              value={inputType}
              onChange={(e) => setInputType(e.target.value as QuestionInputType)}
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none appearance-none"
            >
              {INPUT_TYPE_OPTIONS.map((t) => (
                <option key={t.value} value={t.value} className="bg-card">{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Phase</label>
            <select
              value={phase}
              onChange={(e) => setPhase(e.target.value)}
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none appearance-none"
            >
              {assessment.phases.map((p) => <option key={p.id} value={p.id} className="bg-card">{p.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Section</label>
            <select
              value={section}
              onChange={(e) => setSection(e.target.value)}
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none appearance-none"
            >
              {assessment.sections
                .filter((s) => !phase || s.phaseId === phase)
                .map((s) => <option key={s.id} value={s.id} className="bg-card">{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Weight</label>
            <input
              type="number"
              min={0.5}
              max={3}
              step={0.5}
              value={weight}
              onChange={(e) => setWeight(parseFloat(e.target.value) || 1)}
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Scoring Dimensions</label>
          <div className="flex flex-wrap gap-1.5">
            {assessment.scoringDimensions.map((dim) => {
              const isSelected = selectedDimensions.includes(dim.id as ScoringDimension);
              return (
                <button
                  key={dim.id}
                  type="button"
                  onClick={() => {
                    setSelectedDimensions(
                      isSelected
                        ? selectedDimensions.filter((d) => d !== dim.id)
                        : [...selectedDimensions, dim.id as ScoringDimension],
                    );
                  }}
                  className={`text-[10px] px-2 py-1 rounded-full border transition-colors ${
                    isSelected
                      ? "bg-blue-500/20 text-blue-300 border-blue-500/30"
                      : "bg-muted text-muted-foreground border-border hover:border-blue-500/30"
                  }`}
                >
                  {dim.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Tags (comma-separated)</label>
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="tag1, tag2, ..."
            className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
        </div>

        <div className="flex items-center justify-between pt-2">
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={required}
              onChange={(e) => setRequired(e.target.checked)}
              className="rounded border-border"
            />
            Required
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={onCancel} className="px-4 py-2 text-sm rounded-lg border border-border text-muted-foreground hover:bg-foreground/[0.04] transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={!text.trim()} className="px-5 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 transition-colors">
              Add Question
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
