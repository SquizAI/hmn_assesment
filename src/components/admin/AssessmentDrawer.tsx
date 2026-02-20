import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import StatusBadge from "./StatusBadge";
import {
  fetchAssessment,
  updateFullAssessment,
  updateAssessmentStatus,
  duplicateAssessmentApi,
} from "../../lib/admin-api";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Phase {
  id: string;
  label: string;
  order: number;
}

interface Section {
  id: string;
  label: string;
  phaseId: string;
  order: number;
}

interface ScoringDimension {
  id: string;
  label: string;
  description: string;
  weight: number;
}

interface Question {
  id: string;
  text: string;
  subtext?: string;
  section: string;
  phase: string;
  inputType: string;
  weight: number;
  scoringDimensions: string[];
  tags: string[];
}

interface AssessmentType {
  id: string;
  name: string;
  description: string;
  icon: string;
  estimatedMinutes: number;
  status: string;
  phases: Phase[];
  sections: Section[];
  questions: Question[];
  scoringDimensions: ScoringDimension[];
  createdAt: string;
  updatedAt: string;
}

interface AssessmentDrawerProps {
  assessmentId: string;
  onClose: () => void;
  onRefresh?: () => void;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

type TabId = "overview" | "questions" | "scoring" | "settings";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "questions", label: "Questions" },
  { id: "scoring", label: "Scoring" },
  { id: "settings", label: "Settings" },
];

const INPUT_TYPES = [
  { value: "ai_conversation", label: "AI Conversation" },
  { value: "open_text", label: "Open Text" },
  { value: "slider", label: "Slider" },
  { value: "buttons", label: "Buttons" },
  { value: "multi_select", label: "Multi Select" },
  { value: "voice", label: "Voice" },
];

const INPUT_TYPE_COLORS: Record<string, string> = {
  ai_conversation: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  slider: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  buttons: "bg-green-500/20 text-green-300 border-green-500/30",
  open_text: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  voice: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  multi_select: "bg-teal-500/20 text-teal-300 border-teal-500/30",
};

const INPUT_TYPE_LABELS: Record<string, string> = {
  ai_conversation: "AI Conversation",
  slider: "Slider",
  buttons: "Buttons",
  open_text: "Open Text",
  voice: "Voice",
  multi_select: "Multi Select",
};

const STATUS_OPTIONS = ["draft", "active", "archived"] as const;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function generateId(): string {
  return `asmnt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AssessmentDrawer({
  assessmentId,
  onClose,
  onRefresh,
}: AssessmentDrawerProps) {
  // Core state
  const [assessment, setAssessment] = useState<AssessmentType | null>(null);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  // Editing state
  const [edits, setEdits] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);

  // Duplicate modal state
  const [showDuplicate, setShowDuplicate] = useState(false);
  const [dupName, setDupName] = useState("");
  const [duplicating, setDuplicating] = useState(false);

  // Question expansion & inline editing
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null);
  const [questionEdits, setQuestionEdits] = useState<Record<string, Partial<Question>>>({});

  // Copy-to-clipboard feedback
  const [copied, setCopied] = useState(false);

  // Archive confirmation
  const [archiveConfirm, setArchiveConfirm] = useState(false);

  // Navigation
  const navigate = useNavigate();

  // Ref for name input
  const nameInputRef = useRef<HTMLInputElement>(null);

  const hasUnsavedChanges = Object.keys(edits).length > 0 || Object.keys(questionEdits).length > 0;

  /* ---- Data loading ---- */

  const loadAssessment = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAssessment(assessmentId);
      setAssessment(data.assessment);
      setEdits({});
      setQuestionEdits({});
    } catch (err) {
      console.error("Failed to fetch assessment:", err);
    } finally {
      setLoading(false);
    }
  }, [assessmentId]);

  useEffect(() => {
    loadAssessment();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setVisible(true));
    });
  }, [loadAssessment]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  /* ---- Close with animation ---- */

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 300);
  };

  /* ---- Edit helpers ---- */

  const setEdit = (key: string, value: unknown) => {
    setEdits((prev) => {
      // If value matches original, remove the edit
      if (assessment && (assessment as unknown as Record<string, unknown>)[key] === value) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: value };
    });
  };

  const getField = <K extends keyof AssessmentType>(key: K): AssessmentType[K] => {
    if (key in edits) return edits[key] as AssessmentType[K];
    return assessment?.[key] as AssessmentType[K];
  };

  /* ---- Question edit helpers ---- */

  const setQuestionEdit = (questionId: string, field: keyof Question, value: unknown) => {
    setQuestionEdits((prev) => {
      const original = assessment?.questions.find((q) => q.id === questionId);
      if (!original) return prev;

      const currentEdits = prev[questionId] || {};
      const originalValue = original[field];

      // If value matches original, remove that field edit
      if (value === originalValue) {
        const { [field]: _, ...rest } = currentEdits;
        if (Object.keys(rest).length === 0) {
          const { [questionId]: __, ...remaining } = prev;
          return remaining;
        }
        return { ...prev, [questionId]: rest };
      }

      return { ...prev, [questionId]: { ...currentEdits, [field]: value } };
    });
  };

  const getQuestionField = <K extends keyof Question>(questionId: string, field: K): Question[K] => {
    const editValue = questionEdits[questionId]?.[field];
    if (editValue !== undefined) return editValue as Question[K];
    const original = assessment?.questions.find((q) => q.id === questionId);
    return original?.[field] as Question[K];
  };

  const revertQuestion = (questionId: string) => {
    setQuestionEdits((prev) => {
      const { [questionId]: _, ...rest } = prev;
      return rest;
    });
  };

  /* ---- Save changes ---- */

  const handleSave = async () => {
    if (!assessment || !hasUnsavedChanges) return;
    setSaving(true);
    try {
      const changes: Record<string, unknown> = { ...edits };

      // Merge question edits into the full questions array
      if (Object.keys(questionEdits).length > 0) {
        changes.questions = assessment.questions.map((q) => {
          const qEdits = questionEdits[q.id];
          return qEdits ? { ...q, ...qEdits } : q;
        });
      }

      await updateFullAssessment(assessment.id, changes);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
      await loadAssessment();
      setQuestionEdits({});
    } catch (err) {
      console.error("Failed to save:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    setEdits({});
    setQuestionEdits({});
  };

  /* ---- Status change ---- */

  const handleStatusChange = async (newStatus: string) => {
    if (!assessment || newStatus === assessment.status) return;
    setStatusUpdating(true);
    try {
      await updateAssessmentStatus(assessment.id, newStatus);
      await loadAssessment();
    } catch (err) {
      console.error("Failed to update status:", err);
    } finally {
      setStatusUpdating(false);
    }
  };

  /* ---- Duplicate ---- */

  const handleDuplicate = async () => {
    if (!assessment || !dupName.trim()) return;
    setDuplicating(true);
    try {
      const newId = generateId();
      await duplicateAssessmentApi(assessment.id, newId, dupName.trim());
      setShowDuplicate(false);
      onRefresh?.();
      setDupName("");
    } catch (err) {
      console.error("Failed to duplicate:", err);
    } finally {
      setDuplicating(false);
    }
  };

  /* ---- Copy ID ---- */

  const handleCopyId = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  /* ---- Derived data ---- */

  const sectionMap = new Map<string, Section>();
  (assessment?.sections || []).forEach((s) => sectionMap.set(s.id, s));

  const questionsBySection = new Map<string, Question[]>();
  (assessment?.questions || []).forEach((q) => {
    const existing = questionsBySection.get(q.section) || [];
    existing.push(q);
    questionsBySection.set(q.section, existing);
  });

  const orderedSectionIds = [...questionsBySection.keys()].sort((a, b) => {
    const sa = sectionMap.get(a);
    const sb = sectionMap.get(b);
    return (sa?.order ?? 0) - (sb?.order ?? 0);
  });

  const totalWeight = (assessment?.scoringDimensions || []).reduce(
    (sum, d) => sum + d.weight,
    0,
  );

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */

  return (
    <div className="fixed inset-0 z-40">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 transition-opacity duration-300"
        style={{ opacity: visible ? 1 : 0 }}
        onClick={handleClose}
      />

      {/* Drawer Panel */}
      <div
        className={`absolute right-0 top-0 h-full w-full max-w-2xl bg-[#0a0a0f] border-l border-white/10 flex flex-col transition-transform duration-300 ease-in-out ${
          visible ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
          </div>
        ) : !assessment ? (
          <div className="flex items-center justify-center h-full text-white/40">
            Assessment not found
          </div>
        ) : (
          <>
            {/* ============================================================ */}
            {/* HEADER                                                        */}
            {/* ============================================================ */}
            <div className="shrink-0 px-6 pt-5 pb-0">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {/* Editable icon */}
                  <input
                    type="text"
                    value={getField("icon")}
                    onChange={(e) => setEdit("icon", e.target.value)}
                    className="text-3xl w-12 h-12 text-center bg-transparent border border-transparent hover:border-white/10 focus:border-white/20 rounded-lg outline-none transition-colors shrink-0"
                    maxLength={4}
                    title="Click to edit icon"
                  />
                  <div className="min-w-0 flex-1">
                    {/* Editable name */}
                    <input
                      ref={nameInputRef}
                      type="text"
                      value={getField("name")}
                      onChange={(e) => setEdit("name", e.target.value)}
                      className="text-xl font-semibold text-white bg-transparent border border-transparent hover:border-white/10 focus:border-white/20 rounded-lg px-2 py-1 -ml-2 w-full outline-none transition-colors"
                      title="Click to edit name"
                    />
                    <div className="mt-1 ml-0.5">
                      <StatusBadge status={assessment.status} />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 mt-1">
                  <button
                    onClick={() => navigate(`/admin/builder/${assessmentId}`)}
                    className="px-3 py-1.5 text-xs rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-300 hover:bg-purple-500/20 transition-colors"
                  >
                    Open in Builder
                  </button>
                  <button
                    onClick={handleClose}
                    className="text-white/40 hover:text-white transition-colors text-2xl leading-none p-1"
                    aria-label="Close drawer"
                  >
                    &times;
                  </button>
                </div>
              </div>

              {/* Tab navigation */}
              <nav className="flex gap-1 mt-5 border-b border-white/10">
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
                      activeTab === tab.id
                        ? "text-white"
                        : "text-white/40 hover:text-white/70"
                    }`}
                  >
                    {tab.label}
                    {activeTab === tab.id && (
                      <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-white rounded-full" />
                    )}
                  </button>
                ))}
              </nav>
            </div>

            {/* ============================================================ */}
            {/* SCROLLABLE CONTENT                                            */}
            {/* ============================================================ */}
            <div className="flex-1 overflow-y-auto px-6 py-6">
              {/* ------ OVERVIEW TAB ------ */}
              {activeTab === "overview" && (
                <div className="space-y-6">
                  {/* Description */}
                  <div>
                    <label className="block text-xs font-medium text-white/40 uppercase tracking-wider mb-2">
                      Description
                    </label>
                    <textarea
                      value={getField("description")}
                      onChange={(e) => setEdit("description", e.target.value)}
                      rows={3}
                      className="w-full bg-white/3 border border-white/10 rounded-xl px-4 py-3 text-sm text-white/80 placeholder-white/20 outline-none focus:border-white/20 transition-colors resize-none"
                      placeholder="Assessment description..."
                    />
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-4 gap-3">
                    {[
                      {
                        label: "Questions",
                        value: assessment.questions.length,
                      },
                      {
                        label: "Est. Time",
                        value: `${assessment.estimatedMinutes}m`,
                      },
                      { label: "Phases", value: assessment.phases.length },
                      { label: "Sections", value: assessment.sections.length },
                    ].map((stat) => (
                      <div
                        key={stat.label}
                        className="bg-white/3 border border-white/10 rounded-xl p-3 text-center"
                      >
                        <div className="text-lg font-semibold text-white">
                          {stat.value}
                        </div>
                        <div className="text-[11px] text-white/40 mt-0.5">
                          {stat.label}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Status toggle */}
                  <div>
                    <label className="block text-xs font-medium text-white/40 uppercase tracking-wider mb-2">
                      Status
                    </label>
                    <div className="flex gap-2">
                      {STATUS_OPTIONS.map((s) => (
                        <button
                          key={s}
                          disabled={statusUpdating}
                          onClick={() => handleStatusChange(s)}
                          className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
                            assessment.status === s
                              ? s === "draft"
                                ? "bg-yellow-500/20 text-yellow-300 border-yellow-500/30"
                                : s === "active"
                                  ? "bg-green-500/20 text-green-300 border-green-500/30"
                                  : "bg-gray-500/20 text-gray-300 border-gray-500/30"
                              : "bg-white/3 text-white/40 border-white/10 hover:bg-white/6 hover:text-white/60"
                          } ${statusUpdating ? "opacity-50 cursor-not-allowed" : ""}`}
                        >
                          {s.charAt(0).toUpperCase() + s.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Phases & Sections preview */}
                  <div>
                    <label className="block text-xs font-medium text-white/40 uppercase tracking-wider mb-2">
                      Structure
                    </label>
                    <div className="bg-white/3 border border-white/10 rounded-xl p-4 space-y-3">
                      {(assessment.phases || [])
                        .sort((a, b) => a.order - b.order)
                        .map((phase) => {
                          const phaseSections = (
                            assessment.sections || []
                          )
                            .filter(
                              (s) =>
                                s.phaseId === phase.id ||
                                (s as unknown as Record<string, unknown>).phase === phase.id,
                            )
                            .sort((a, b) => a.order - b.order);
                          const phaseQuestionCount = phaseSections.reduce(
                            (sum, s) =>
                              sum +
                              (assessment.questions || []).filter(
                                (q) => q.section === s.id,
                              ).length,
                            0,
                          );
                          return (
                            <div key={phase.id}>
                              <div className="flex items-center justify-between">
                                <h4 className="text-sm font-medium text-white/80">
                                  {phase.label}
                                </h4>
                                <span className="text-xs text-white/30">
                                  {phaseQuestionCount} questions
                                </span>
                              </div>
                              <div className="ml-4 mt-1.5 space-y-1">
                                {phaseSections.map((sec) => (
                                  <div
                                    key={sec.id}
                                    className="flex items-center justify-between text-xs"
                                  >
                                    <span className="text-white/50">
                                      {sec.label}
                                    </span>
                                    <span className="text-white/25">
                                      {(assessment.questions || []).filter(
                                        (q) => q.section === sec.id,
                                      ).length}{" "}
                                      q
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>

                  {/* Preview */}
                  <div>
                    <button
                      onClick={() => navigate(`/admin/preview/${assessment.id}`)}
                      className="w-full bg-purple-500/10 border border-purple-500/20 rounded-xl px-4 py-3 text-sm text-purple-300 hover:bg-purple-500/20 hover:text-purple-200 transition-colors text-left flex items-center gap-3"
                    >
                      <svg
                        className="w-4 h-4 shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z"
                        />
                      </svg>
                      Preview Assessment
                    </button>
                  </div>

                  {/* Duplicate */}
                  <div>
                    <button
                      onClick={() => {
                        setDupName(`${assessment.name} (Copy)`);
                        setShowDuplicate(true);
                      }}
                      className="w-full bg-white/3 border border-white/10 rounded-xl px-4 py-3 text-sm text-white/60 hover:bg-white/6 hover:text-white/80 transition-colors text-left flex items-center gap-3"
                    >
                      <svg
                        className="w-4 h-4 shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75"
                        />
                      </svg>
                      Duplicate Assessment
                    </button>
                  </div>

                  {/* Timestamps */}
                  <div className="bg-white/3 border border-white/10 rounded-xl p-4">
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <span className="text-white/30">Created</span>
                        <p className="text-white/60 mt-0.5">
                          {formatDate(assessment.createdAt)}
                        </p>
                      </div>
                      <div>
                        <span className="text-white/30">Last Updated</span>
                        <p className="text-white/60 mt-0.5">
                          {formatDate(assessment.updatedAt)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ------ QUESTIONS TAB ------ */}
              {activeTab === "questions" && (
                <div className="space-y-5">
                  {/* Count header */}
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm text-white/60">
                      <span className="text-white font-semibold">
                        {assessment.questions.length}
                      </span>{" "}
                      questions across{" "}
                      <span className="text-white font-semibold">
                        {orderedSectionIds.length}
                      </span>{" "}
                      sections
                    </h3>
                    {/* Input type legend */}
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(INPUT_TYPE_COLORS)
                        .filter(([type]) =>
                          assessment.questions.some(
                            (q) => q.inputType === type,
                          ),
                        )
                        .map(([type, colors]) => (
                          <span
                            key={type}
                            className={`text-[9px] px-1.5 py-0.5 rounded border ${colors}`}
                          >
                            {INPUT_TYPE_LABELS[type] || type}
                          </span>
                        ))}
                    </div>
                  </div>

                  {/* Questions grouped by section */}
                  {orderedSectionIds.map((sectionId) => {
                    const section = sectionMap.get(sectionId);
                    const questions = questionsBySection.get(sectionId) || [];
                    return (
                      <div key={sectionId}>
                        {/* Section header */}
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="text-xs font-semibold text-white/50 uppercase tracking-wider">
                            {section?.label || sectionId}
                          </h4>
                          <span className="text-[10px] text-white/25">
                            ({questions.length})
                          </span>
                          <div className="flex-1 h-px bg-white/10" />
                        </div>

                        <div className="space-y-2">
                          {questions.map((question) => {
                            const isExpanded =
                              expandedQuestion === question.id;
                            const isModified = !!questionEdits[question.id];
                            const displayText = getQuestionField(question.id, "text");
                            const displayWeight = getQuestionField(question.id, "weight");
                            const displayInputType = getQuestionField(question.id, "inputType");
                            return (
                              <div
                                key={question.id}
                                className={`bg-white/3 border rounded-xl transition-colors cursor-pointer ${
                                  isModified
                                    ? "border-purple-500/30 border-l-2 border-l-purple-500/60"
                                    : isExpanded
                                      ? "border-white/20"
                                      : "border-white/10 hover:border-white/15"
                                }`}
                                onClick={() =>
                                  setExpandedQuestion(
                                    isExpanded ? null : question.id,
                                  )
                                }
                              >
                                {/* Question summary row */}
                                <div className="p-3 flex items-start gap-3">
                                  <div className="flex-1 min-w-0">
                                    <p className={`text-sm leading-relaxed ${isModified ? "text-purple-200/80" : "text-white/75"}`}>
                                      {displayText}
                                    </p>
                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                      <span
                                        className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${
                                          INPUT_TYPE_COLORS[
                                            displayInputType
                                          ] ||
                                          "bg-white/10 text-white/50 border-white/20"
                                        }`}
                                      >
                                        {INPUT_TYPE_LABELS[
                                          displayInputType
                                        ] || displayInputType}
                                      </span>
                                      <span className="text-[10px] text-white/30">
                                        weight: {displayWeight}
                                      </span>
                                      {isModified && (
                                        <span className="text-[10px] bg-purple-500/15 text-purple-300 border border-purple-500/20 px-1.5 py-0.5 rounded font-medium">
                                          Modified
                                        </span>
                                      )}
                                      {question.scoringDimensions
                                        .slice(0, 3)
                                        .map((dim) => (
                                          <span
                                            key={dim}
                                            className="text-[10px] bg-white/5 text-white/30 px-1.5 py-0.5 rounded"
                                          >
                                            {dim}
                                          </span>
                                        ))}
                                      {question.scoringDimensions.length >
                                        3 && (
                                        <span className="text-[10px] text-white/20">
                                          +
                                          {question.scoringDimensions
                                            .length - 3}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  {/* Expand chevron */}
                                  <svg
                                    className={`w-4 h-4 text-white/20 shrink-0 mt-1 transition-transform ${
                                      isExpanded ? "rotate-180" : ""
                                    }`}
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth={2}
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      d="M19.5 8.25l-7.5 7.5-7.5-7.5"
                                    />
                                  </svg>
                                </div>

                                {/* Expanded inline editor */}
                                {isExpanded && (
                                  <div
                                    className="border-t border-white/10 px-3 py-3 space-y-3"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {/* Modified indicator + revert */}
                                    {isModified && (
                                      <div className="flex items-center justify-between">
                                        <span className="text-[11px] text-purple-300/70">
                                          Question modified — save below
                                        </span>
                                        <button
                                          onClick={() => revertQuestion(question.id)}
                                          className="text-[11px] text-white/30 hover:text-white/60 transition-colors"
                                        >
                                          Revert
                                        </button>
                                      </div>
                                    )}

                                    {/* Editable: Question text */}
                                    <div className="space-y-1">
                                      <label className="text-[11px] text-white/40 uppercase tracking-wider">
                                        Question Text
                                      </label>
                                      <textarea
                                        value={getQuestionField(question.id, "text")}
                                        onChange={(e) => setQuestionEdit(question.id, "text", e.target.value)}
                                        autoFocus
                                        rows={3}
                                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-purple-500/40 focus:ring-1 focus:ring-purple-500/20 resize-none"
                                      />
                                    </div>

                                    {/* Editable: Subtext */}
                                    <div className="space-y-1">
                                      <label className="text-[11px] text-white/40 uppercase tracking-wider">
                                        Subtext
                                      </label>
                                      <input
                                        type="text"
                                        value={getQuestionField(question.id, "subtext") || ""}
                                        onChange={(e) => setQuestionEdit(question.id, "subtext", e.target.value || undefined)}
                                        placeholder="Optional helper text..."
                                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-purple-500/40 focus:ring-1 focus:ring-purple-500/20"
                                      />
                                    </div>

                                    {/* Editable: Input type + Weight row */}
                                    <div className="grid grid-cols-2 gap-3">
                                      <div className="space-y-1">
                                        <label className="text-[11px] text-white/40 uppercase tracking-wider">
                                          Input Type
                                        </label>
                                        <select
                                          value={getQuestionField(question.id, "inputType")}
                                          onChange={(e) => setQuestionEdit(question.id, "inputType", e.target.value)}
                                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/40 appearance-none"
                                        >
                                          {INPUT_TYPES.map((t) => (
                                            <option key={t.value} value={t.value} className="bg-[#141420]">
                                              {t.label}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                      <div className="space-y-1">
                                        <label className="text-[11px] text-white/40 uppercase tracking-wider">
                                          Weight
                                        </label>
                                        <input
                                          type="number"
                                          min="0"
                                          max="1"
                                          step="0.1"
                                          value={getQuestionField(question.id, "weight")}
                                          onChange={(e) => setQuestionEdit(question.id, "weight", parseFloat(e.target.value) || 0)}
                                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/40"
                                        />
                                      </div>
                                    </div>

                                    {/* Read-only metadata */}
                                    <div className="grid grid-cols-3 gap-3 text-xs pt-2 border-t border-white/5">
                                      <div>
                                        <span className="text-white/30">
                                          ID
                                        </span>
                                        <p className="text-white/50 font-mono mt-0.5 break-all text-[10px]">
                                          {question.id}
                                        </p>
                                      </div>
                                      <div>
                                        <span className="text-white/30">
                                          Phase
                                        </span>
                                        <p className="text-white/50 mt-0.5">
                                          {assessment.phases.find(
                                            (p) => p.id === question.phase,
                                          )?.label || question.phase}
                                        </p>
                                      </div>
                                      <div>
                                        <span className="text-white/30">
                                          Section
                                        </span>
                                        <p className="text-white/50 mt-0.5">
                                          {section?.label || question.section}
                                        </p>
                                      </div>
                                    </div>

                                    {/* Scoring dimensions */}
                                    {question.scoringDimensions.length > 0 && (
                                      <div>
                                        <span className="text-[11px] text-white/30">
                                          Scoring Dimensions
                                        </span>
                                        <div className="flex flex-wrap gap-1.5 mt-1">
                                          {question.scoringDimensions.map(
                                            (dim) => (
                                              <span
                                                key={dim}
                                                className="text-[10px] bg-purple-500/10 text-purple-300 border border-purple-500/20 px-2 py-0.5 rounded-full"
                                              >
                                                {dim}
                                              </span>
                                            ),
                                          )}
                                        </div>
                                      </div>
                                    )}

                                    {/* Tags */}
                                    {question.tags &&
                                      question.tags.length > 0 && (
                                        <div>
                                          <span className="text-[11px] text-white/30">
                                            Tags
                                          </span>
                                          <div className="flex flex-wrap gap-1.5 mt-1">
                                            {question.tags.map((tag) => (
                                              <span
                                                key={tag}
                                                className="text-[10px] bg-white/5 text-white/40 border border-white/10 px-2 py-0.5 rounded-full"
                                              >
                                                {tag}
                                              </span>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ------ SCORING TAB ------ */}
              {activeTab === "scoring" && (
                <div className="space-y-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm text-white/60">
                      <span className="text-white font-semibold">
                        {assessment.scoringDimensions.length}
                      </span>{" "}
                      scoring dimensions
                    </h3>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full border ${
                        Math.abs(totalWeight - 1) < 0.01
                          ? "bg-green-500/15 text-green-300 border-green-500/25"
                          : "bg-yellow-500/15 text-yellow-300 border-yellow-500/25"
                      }`}
                    >
                      Total: {Math.round(totalWeight * 100)}%
                    </span>
                  </div>

                  <div className="space-y-3">
                    {(assessment.scoringDimensions || []).map((dim) => {
                      const pct = Math.round(dim.weight * 100);
                      return (
                        <div
                          key={dim.id}
                          className="bg-white/3 border border-white/10 rounded-xl p-4"
                        >
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div className="min-w-0 flex-1">
                              <h4 className="text-sm font-medium text-white/85">
                                {dim.label}
                              </h4>
                              <p className="text-xs text-white/40 mt-0.5 leading-relaxed">
                                {dim.description}
                              </p>
                            </div>
                            <span className="text-sm font-semibold text-white/70 shrink-0 tabular-nums">
                              {pct}%
                            </span>
                          </div>
                          {/* Weight bar */}
                          <div className="w-full h-2 bg-white/6 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-linear-to-r from-blue-500/80 to-purple-500/80 transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          {/* Linked questions count */}
                          <div className="mt-2 text-[10px] text-white/25">
                            {
                              assessment.questions.filter((q) =>
                                q.scoringDimensions.includes(dim.id),
                              ).length
                            }{" "}
                            questions linked
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ------ SETTINGS TAB ------ */}
              {activeTab === "settings" && (
                <div className="space-y-6">
                  {/* Estimated minutes */}
                  <div>
                    <label className="block text-xs font-medium text-white/40 uppercase tracking-wider mb-2">
                      Estimated Duration (minutes)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={300}
                      value={getField("estimatedMinutes")}
                      onChange={(e) =>
                        setEdit(
                          "estimatedMinutes",
                          parseInt(e.target.value, 10) || 0,
                        )
                      }
                      className="w-full bg-white/3 border border-white/10 rounded-xl px-4 py-3 text-sm text-white/80 outline-none focus:border-white/20 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>

                  {/* Icon */}
                  <div>
                    <label className="block text-xs font-medium text-white/40 uppercase tracking-wider mb-2">
                      Icon (Emoji)
                    </label>
                    <input
                      type="text"
                      value={getField("icon")}
                      onChange={(e) => setEdit("icon", e.target.value)}
                      className="w-full bg-white/3 border border-white/10 rounded-xl px-4 py-3 text-2xl outline-none focus:border-white/20 transition-colors"
                      maxLength={4}
                    />
                  </div>

                  {/* Assessment ID */}
                  <div>
                    <label className="block text-xs font-medium text-white/40 uppercase tracking-wider mb-2">
                      Assessment ID
                    </label>
                    <div
                      onClick={() => handleCopyId(assessment.id)}
                      className="w-full bg-white/3 border border-white/10 rounded-xl px-4 py-3 text-sm text-white/50 font-mono cursor-pointer hover:bg-white/5 transition-colors flex items-center justify-between"
                      title="Click to copy"
                    >
                      <span className="truncate">{assessment.id}</span>
                      <span className="text-[10px] text-white/25 shrink-0 ml-2">
                        {copied ? "Copied!" : "Click to copy"}
                      </span>
                    </div>
                  </div>

                  {/* Timestamps */}
                  <div className="bg-white/3 border border-white/10 rounded-xl p-4">
                    <label className="block text-xs font-medium text-white/40 uppercase tracking-wider mb-3">
                      Timestamps
                    </label>
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <span className="text-white/30">Created</span>
                        <p className="text-white/60 mt-0.5">
                          {formatDate(assessment.createdAt)}
                        </p>
                      </div>
                      <div>
                        <span className="text-white/30">Last Updated</span>
                        <p className="text-white/60 mt-0.5">
                          {formatDate(assessment.updatedAt)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Danger zone */}
                  <div className="border border-red-500/20 rounded-xl p-4 space-y-3">
                    <label className="block text-xs font-medium text-red-400/70 uppercase tracking-wider">
                      Danger Zone
                    </label>

                    {assessment.status !== "archived" ? (
                      <button
                        onClick={() => {
                          if (!archiveConfirm) {
                            setArchiveConfirm(true);
                            return;
                          }
                          handleStatusChange("archived");
                          setArchiveConfirm(false);
                        }}
                        onBlur={() => setArchiveConfirm(false)}
                        className={`w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                          archiveConfirm
                            ? "bg-red-600 text-white hover:bg-red-700"
                            : "bg-white/3 text-red-400 border border-red-500/20 hover:bg-red-500/10"
                        }`}
                      >
                        {archiveConfirm
                          ? "Confirm Archive?"
                          : "Archive Assessment"}
                      </button>
                    ) : (
                      <div className="text-xs text-white/30">
                        This assessment is already archived. Change status
                        above to reactivate.
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>

            {/* ============================================================ */}
            {/* FLOATING SAVE BAR                                             */}
            {/* ============================================================ */}
            {hasUnsavedChanges && (
              <div className="shrink-0 border-t border-white/10 bg-[#0a0a0f] px-6 py-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-white/40">
                    {(() => {
                      const count = Object.keys(edits).length + Object.keys(questionEdits).length;
                      return `${count} unsaved ${count === 1 ? "change" : "changes"}`;
                    })()}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={handleDiscard}
                      className="px-4 py-2 rounded-lg text-sm text-white/50 hover:text-white/70 bg-white/3 border border-white/10 hover:bg-white/6 transition-colors"
                    >
                      Discard
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="px-5 py-2 rounded-lg text-sm font-medium bg-white text-black hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {saving ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-black/20 border-t-black/60 rounded-full animate-spin" />
                          Saving...
                        </>
                      ) : saveSuccess ? (
                        <>
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M4.5 12.75l6 6 9-13.5"
                            />
                          </svg>
                          Saved!
                        </>
                      ) : (
                        "Save Changes"
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ============================================================ */}
      {/* DUPLICATE MODAL                                               */}
      {/* ============================================================ */}
      {showDuplicate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setShowDuplicate(false)}
          />
          <div className="relative bg-[#111118] border border-white/10 rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl">
            <h3 className="text-lg font-semibold text-white mb-1">
              Duplicate Assessment
            </h3>
            <p className="text-sm text-white/40 mb-4">
              Create a copy of this assessment with a new name.
            </p>
            <label className="block text-xs font-medium text-white/40 uppercase tracking-wider mb-2">
              New Assessment Name
            </label>
            <input
              type="text"
              value={dupName}
              onChange={(e) => setDupName(e.target.value)}
              autoFocus
              className="w-full bg-white/3 border border-white/10 rounded-xl px-4 py-3 text-sm text-white/80 outline-none focus:border-white/20 transition-colors mb-4"
              placeholder="Assessment name..."
              onKeyDown={(e) => {
                if (e.key === "Enter") handleDuplicate();
              }}
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowDuplicate(false)}
                className="px-4 py-2 rounded-lg text-sm text-white/50 hover:text-white/70 bg-white/3 border border-white/10 hover:bg-white/6 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDuplicate}
                disabled={duplicating || !dupName.trim()}
                className="px-5 py-2 rounded-lg text-sm font-medium bg-white text-black hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {duplicating ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-black/20 border-t-black/60 rounded-full animate-spin" />
                    Duplicating...
                  </>
                ) : (
                  "Duplicate"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
