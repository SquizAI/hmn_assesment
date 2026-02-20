import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import StatusBadge from "../components/admin/StatusBadge";
import AssessmentDrawer from "../components/admin/AssessmentDrawer";
import {
  fetchAssessments,
  updateAssessmentStatus,
  duplicateAssessmentApi,
} from "../lib/admin-api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Assessment {
  id: string;
  name: string;
  description: string;
  icon: string;
  estimatedMinutes: number;
  questionCount: number;
  status: string; // "draft" | "active" | "archived"
  category?: string;
  typeBadge?: string;
  companyNames?: string[];
}

type StatusFilter = "all" | "active" | "draft" | "archived";

type SortKey = "name" | "questionCount" | "estimatedMinutes" | "status";
type SortDir = "asc" | "desc";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function statusOrder(status: string): number {
  if (status === "active") return 0;
  if (status === "draft") return 1;
  return 2;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FilterTab({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        relative px-4 py-2 text-sm font-medium rounded-lg transition-all
        ${
          active
            ? "bg-white/[0.08] text-white border border-white/15"
            : "text-white/40 hover:text-white/60 hover:bg-white/[0.04] border border-transparent"
        }
      `}
    >
      {label}
      <span
        className={`ml-2 text-xs tabular-nums ${
          active ? "text-white/60" : "text-white/25"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function QuickAction({
  label,
  color,
  onClick,
}: {
  label: string;
  color: "green" | "gray" | "blue" | "red" | "amber";
  onClick: (e: React.MouseEvent) => void;
}) {
  const colorMap: Record<string, string> = {
    green:
      "bg-green-500/10 border-green-500/25 text-green-400 hover:bg-green-500/20",
    gray: "bg-gray-500/10 border-gray-500/25 text-gray-400 hover:bg-gray-500/20",
    blue: "bg-blue-500/10 border-blue-500/25 text-blue-400 hover:bg-blue-500/20",
    red: "bg-red-500/10 border-red-500/25 text-red-400 hover:bg-red-500/20",
    amber:
      "bg-amber-500/10 border-amber-500/25 text-amber-400 hover:bg-amber-500/20",
  };

  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${colorMap[color]}`}
    >
      {label}
    </button>
  );
}

function ModalBackdrop({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md mx-4">{children}</div>
    </div>
  );
}

function EmptyState({
  filter,
  onClear,
  onCreate,
}: {
  filter: StatusFilter;
  onClear: () => void;
  onCreate: () => void;
}) {
  if (filter !== "all") {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="text-4xl mb-4 opacity-30">
          {filter === "draft" ? "📝" : filter === "active" ? "✅" : "📦"}
        </div>
        <p className="text-white/40 text-sm mb-1">
          No {filter} assessments found.
        </p>
        <button
          onClick={onClear}
          className="text-sm text-blue-400 hover:text-blue-300 mt-2 transition-colors"
        >
          Show all assessments
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="text-5xl mb-4 opacity-30">📋</div>
      <p className="text-white/50 text-sm mb-1">No assessments yet.</p>
      <p className="text-white/30 text-xs mb-5">
        Create your first assessment to get started.
      </p>
      <button
        onClick={onCreate}
        className="px-5 py-2.5 text-sm font-medium rounded-xl bg-white/[0.08] border border-white/15 text-white hover:bg-white/[0.12] transition-colors"
      >
        + Create Assessment
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function AdminAssessmentsPage() {
  const navigate = useNavigate();

  // ---- Data state ----
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ---- UI state ----
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<
    string | null
  >(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [companyFilter, setCompanyFilter] = useState("all");

  // ---- View mode ----
  const [viewMode, setViewMode] = useState<"gallery" | "list">(() => {
    try {
      const saved = localStorage.getItem("cascade-assessments-view");
      return saved === "list" ? "list" : "gallery";
    } catch {
      return "gallery";
    }
  });

  useEffect(() => {
    try { localStorage.setItem("cascade-assessments-view", viewMode); } catch { /* noop */ }
  }, [viewMode]);

  // ---- Modal state ----
  const [duplicateTarget, setDuplicateTarget] = useState<Assessment | null>(
    null
  );

  // ---- Action in-flight tracking ----
  const [actionInFlight, setActionInFlight] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // ---- Search input ref ----
  const searchRef = useRef<HTMLInputElement>(null);

  // ---- Data loading ----
  const loadAssessments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAssessments();
      setAssessments(data.assessments ?? []);
    } catch (err) {
      console.error("Failed to fetch assessments:", err);
      setError("Failed to load assessments. Please try again.");
      setAssessments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAssessments();
  }, [loadAssessments]);

  // ---- Keyboard shortcut: Cmd+K or Ctrl+K focuses search ----
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ---- Computed: counts per status ----
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

  const categories = useMemo(() => {
    const set = new Set<string>();
    assessments.forEach((a) => { if (a.category) set.add(a.category); });
    return Array.from(set).sort();
  }, [assessments]);

  const companies = useMemo(() => {
    const set = new Set<string>();
    assessments.forEach((a) => { (a.companyNames || []).forEach((c) => set.add(c)); });
    return Array.from(set).sort();
  }, [assessments]);

  // ---- Computed: filtered + sorted assessments ----
  const filtered = useMemo(() => {
    let list = assessments;

    // Status filter
    if (statusFilter !== "all") {
      list = list.filter((a) => a.status === statusFilter);
    }

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q) ||
          a.id.toLowerCase().includes(q)
      );
    }

    // Category filter
    if (categoryFilter !== "all") {
      list = list.filter((a) => a.category === categoryFilter);
    }
    // Company filter
    if (companyFilter !== "all") {
      list = list.filter((a) => (a.companyNames || []).includes(companyFilter));
    }

    // Sort
    const sorted = [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "questionCount":
          cmp = a.questionCount - b.questionCount;
          break;
        case "estimatedMinutes":
          cmp = a.estimatedMinutes - b.estimatedMinutes;
          break;
        case "status":
          cmp = statusOrder(a.status) - statusOrder(b.status);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return sorted;
  }, [assessments, statusFilter, search, categoryFilter, companyFilter, sortKey, sortDir]);

  // ---- Handlers ----

  const handleStatusChange = useCallback(
    async (e: React.MouseEvent, id: string, newStatus: string) => {
      e.stopPropagation();
      setActionInFlight(id);
      try {
        const result = await updateAssessmentStatus(id, newStatus);
        if (result.ok) {
          await loadAssessments();
        }
      } catch (err) {
        console.error("Failed to update assessment status:", err);
      } finally {
        setActionInFlight(null);
      }
    },
    [loadAssessments]
  );

  const handleDuplicate = useCallback(
    (e: React.MouseEvent, assessment: Assessment) => {
      e.stopPropagation();
      setDuplicateTarget(assessment);
    },
    []
  );

  const handleCopyLink = useCallback(
    (e: React.MouseEvent, assessmentId: string) => {
      e.stopPropagation();
      const url = `${window.location.origin}/?assessment=${encodeURIComponent(assessmentId)}`;
      navigator.clipboard.writeText(url).then(() => {
        setCopiedId(assessmentId);
        setTimeout(() => setCopiedId(null), 2000);
      });
    },
    []
  );

  const handleSortToggle = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir("asc");
      }
    },
    [sortKey]
  );

  const handleDrawerClose = useCallback(() => {
    setSelectedAssessmentId(null);
    // Refresh in case edits were made inside the drawer
    loadAssessments();
  }, [loadAssessments]);

  // ---- Sort indicator helper ----
  const sortArrow = (key: SortKey) => {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
  };

  // ---- Render: Loading ----
  if (loading) {
    return (
      <div className="px-4 md:px-6 py-6 flex flex-col items-center justify-center min-h-[500px] gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white/40" />
        <span className="text-white/30 text-sm">Loading assessments...</span>
      </div>
    );
  }

  // ---- Render: Error ----
  if (error && assessments.length === 0) {
    return (
      <div className="px-4 md:px-6 py-6 flex flex-col items-center justify-center min-h-[500px] gap-4">
        <div className="text-4xl opacity-30">⚠</div>
        <p className="text-white/50 text-sm">{error}</p>
        <button
          onClick={loadAssessments}
          className="px-4 py-2 text-sm rounded-xl bg-white/[0.06] border border-white/10 text-white hover:bg-white/[0.10] transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="px-4 md:px-6 py-6 space-y-6">
      {/* ================================================================== */}
      {/* HEADER ROW                                                         */}
      {/* ================================================================== */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white/90 tracking-tight">
            Assessments
          </h1>
          <p className="text-sm text-white/40 mt-0.5">
            Manage, create, and monitor your assessment library.
          </p>
        </div>

        <button
          onClick={() => navigate("/admin/builder")}
          className="w-full sm:w-auto px-4 py-2 text-sm font-medium rounded-xl transition-all bg-gradient-to-r from-purple-500/20 to-blue-500/20 border border-purple-500/20 text-purple-200 hover:from-purple-500/30 hover:to-blue-500/30 hover:text-white"
        >
          Build Assessment
        </button>
      </div>

      {/* ================================================================== */}
      {/* FILTER BAR                                                         */}
      {/* ================================================================== */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Status tabs */}
        <div className="flex items-center gap-1 overflow-x-auto">
          {(["all", "active", "draft", "archived"] as StatusFilter[]).map(
            (tab) => (
              <FilterTab
                key={tab}
                label={tab === "all" ? "All" : tab.charAt(0).toUpperCase() + tab.slice(1)}
                count={counts[tab]}
                active={statusFilter === tab}
                onClick={() => setStatusFilter(tab)}
              />
            )
          )}
        </div>

        {/* Search + Sort */}
        <div className="flex items-center flex-wrap gap-2">
          <div className="relative">
            <input
              ref={searchRef}
              type="text"
              placeholder="Search assessments..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-white/[0.05] border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-white/20 transition-colors w-full sm:w-56"
            />
            {/* Search icon */}
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
              />
            </svg>
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/50 text-xs"
              >
                &#x2715;
              </button>
            )}
          </div>

          {/* Category filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/50 outline-none focus:border-white/20 transition-colors"
          >
            <option value="all">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          {/* Company filter */}
          {companies.length > 0 && (
            <select
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              className="bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/50 outline-none focus:border-white/20 transition-colors"
            >
              <option value="all">All Companies</option>
              {companies.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}

          {/* Sort dropdown */}
          <div className="relative group">
            <button className="bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/50 hover:bg-white/[0.08] transition-colors flex items-center gap-1">
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
                  d="M3 7h18M3 12h12M3 17h6"
                />
              </svg>
              <span className="hidden sm:inline">Sort</span>
            </button>
            <div className="absolute right-0 top-full mt-1 bg-[#12121a] border border-white/10 rounded-lg overflow-hidden shadow-xl z-20 opacity-0 pointer-events-none group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity min-w-[160px]">
              {(
                [
                  ["name", "Name"],
                  ["questionCount", "Questions"],
                  ["estimatedMinutes", "Duration"],
                  ["status", "Status"],
                ] as [SortKey, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => handleSortToggle(key)}
                  className={`block w-full text-left px-4 py-2 text-sm transition-colors ${
                    sortKey === key
                      ? "text-white bg-white/[0.06]"
                      : "text-white/50 hover:bg-white/[0.04]"
                  }`}
                >
                  {label}
                  {sortArrow(key)}
                </button>
              ))}
            </div>
          </div>

          {/* View toggle */}
          <div className="flex items-center bg-white/[0.05] border border-white/10 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode("gallery")}
              className={`p-2 transition-colors ${
                viewMode === "gallery" ? "bg-white/[0.08] text-white/70" : "text-white/30 hover:text-white/50"
              }`}
              title="Gallery view"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
              </svg>
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-2 transition-colors ${
                viewMode === "list" ? "bg-white/[0.08] text-white/70" : "text-white/30 hover:text-white/50"
              }`}
              title="List view"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* ================================================================== */}
      {/* SUMMARY STATS ROW                                                  */}
      {/* ================================================================== */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3">
          <p className="text-xs text-white/30 uppercase tracking-wider">
            Total
          </p>
          <p className="text-lg md:text-xl font-semibold text-white/90 mt-1 tabular-nums">
            {counts.all}
          </p>
        </div>
        <div className="bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3">
          <p className="text-xs text-green-400/60 uppercase tracking-wider">
            Active
          </p>
          <p className="text-lg md:text-xl font-semibold text-green-400 mt-1 tabular-nums">
            {counts.active}
          </p>
        </div>
        <div className="bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3">
          <p className="text-xs text-yellow-400/60 uppercase tracking-wider">
            Draft
          </p>
          <p className="text-lg md:text-xl font-semibold text-yellow-400 mt-1 tabular-nums">
            {counts.draft}
          </p>
        </div>
        <div className="bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3">
          <p className="text-xs text-white/25 uppercase tracking-wider">
            Archived
          </p>
          <p className="text-lg md:text-xl font-semibold text-white/40 mt-1 tabular-nums">
            {counts.archived}
          </p>
        </div>
      </div>

      {/* ================================================================== */}
      {/* ASSESSMENT CARDS GRID                                              */}
      {/* ================================================================== */}
      {filtered.length === 0 ? (
        <EmptyState
          filter={statusFilter}
          onClear={() => {
            setStatusFilter("all");
            setSearch("");
          }}
          onCreate={() => navigate("/admin/builder")}
        />
      ) : viewMode === "gallery" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((assessment) => {
            const isInFlight = actionInFlight === assessment.id;
            return (
              <div
                key={assessment.id}
                onClick={() => setSelectedAssessmentId(assessment.id)}
                className={`
                  group relative bg-white/[0.03] border border-white/10 rounded-2xl p-5
                  hover:bg-white/[0.06] hover:border-white/20 transition-all cursor-pointer
                  ${isInFlight ? "opacity-60 pointer-events-none" : ""}
                `}
              >
                {/* Top row: icon + status + edit */}
                <div className="flex items-start justify-between mb-3">
                  <span className="text-3xl leading-none">
                    {assessment.icon}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/admin/builder/${assessment.id}`);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-white/10 text-white/30 hover:text-white/60 transition-all"
                      title="Edit in Builder"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                      </svg>
                    </button>
                    <StatusBadge status={assessment.status} />
                  </div>
                </div>

                {/* Name */}
                <h3 className="text-sm md:text-base font-semibold text-white/90 leading-snug">
                  {assessment.name}
                </h3>

                {/* Description */}
                <p className="text-sm text-white/40 mt-1.5 line-clamp-2 leading-relaxed">
                  {assessment.description}
                </p>

                {/* Stats row */}
                <div className="mt-4 flex items-center gap-4 text-xs text-white/30">
                  <span className="flex items-center gap-1">
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    {assessment.questionCount} questions
                  </span>
                  <span className="flex items-center gap-1">
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    {assessment.estimatedMinutes} min
                  </span>
                  <span className="ml-auto text-white/20 text-[11px] font-mono">
                    {assessment.id}
                  </span>
                </div>

                {/* Type + Category badges */}
                <div className="mt-3 flex items-center gap-1.5">
                  {assessment.typeBadge && (
                    <span className={`px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider rounded-full ${
                      assessment.typeBadge === "Survey" ? "bg-purple-500/15 text-purple-300" :
                      assessment.typeBadge === "Diagnostic" ? "bg-blue-500/15 text-blue-300" :
                      "bg-white/[0.06] text-white/40"
                    }`}>
                      {assessment.typeBadge}
                    </span>
                  )}
                  {assessment.category && (
                    <span className="px-2 py-0.5 text-[10px] text-white/25 bg-white/[0.03] rounded-full">
                      {assessment.category}
                    </span>
                  )}
                </div>

                {/* Divider */}
                <div className="border-t border-white/[0.06] mt-4 pt-3" />

                {/* Quick actions */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {assessment.status === "draft" && (
                    <QuickAction
                      label="Activate"
                      color="green"
                      onClick={(e) =>
                        handleStatusChange(e, assessment.id, "active")
                      }
                    />
                  )}
                  {assessment.status === "active" && (
                    <QuickAction
                      label="Archive"
                      color="gray"
                      onClick={(e) =>
                        handleStatusChange(e, assessment.id, "archived")
                      }
                    />
                  )}
                  {assessment.status === "archived" && (
                    <QuickAction
                      label="Reactivate"
                      color="blue"
                      onClick={(e) =>
                        handleStatusChange(e, assessment.id, "active")
                      }
                    />
                  )}
                  {assessment.status !== "archived" &&
                    assessment.status !== "draft" && (
                      <QuickAction
                        label="Draft"
                        color="amber"
                        onClick={(e) =>
                          handleStatusChange(e, assessment.id, "draft")
                        }
                      />
                    )}
                  <QuickAction
                    label="Preview"
                    color="blue"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/admin/preview/${assessment.id}`);
                    }}
                  />
                  <QuickAction
                    label="Duplicate"
                    color="blue"
                    onClick={(e) => handleDuplicate(e, assessment)}
                  />
                  <QuickAction
                    label={copiedId === assessment.id ? "Copied!" : "Copy Link"}
                    color={copiedId === assessment.id ? "green" : "blue"}
                    onClick={(e) => handleCopyLink(e, assessment.id)}
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedAssessmentId(assessment.id);
                    }}
                    className="ml-auto px-2.5 py-1 text-xs rounded-lg border transition-colors bg-white/[0.04] border-white/10 text-white/40 hover:bg-white/[0.08] hover:text-white/60"
                  >
                    View Details
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ---- LIST VIEW ---- */
        <div className="bg-white/[0.03] rounded-2xl border border-white/10 overflow-hidden">
          <div className="divide-y divide-white/5">
            {filtered.map((assessment) => {
              const isInFlight = actionInFlight === assessment.id;
              return (
                <div
                  key={assessment.id}
                  onClick={() => setSelectedAssessmentId(assessment.id)}
                  className={`group flex items-center gap-4 px-4 py-3 hover:bg-white/[0.04] transition-colors cursor-pointer ${
                    isInFlight ? "opacity-60 pointer-events-none" : ""
                  }`}
                >
                  {/* Icon */}
                  <span className="text-2xl leading-none flex-shrink-0">{assessment.icon}</span>

                  {/* Name + description */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium text-white/90 truncate">{assessment.name}</h3>
                      <StatusBadge status={assessment.status} />
                      {assessment.typeBadge && (
                        <span className={`px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider rounded-full ${
                          assessment.typeBadge === "Survey" ? "bg-purple-500/15 text-purple-300" :
                          assessment.typeBadge === "Diagnostic" ? "bg-blue-500/15 text-blue-300" :
                          "bg-white/[0.06] text-white/40"
                        }`}>
                          {assessment.typeBadge}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-white/30 truncate mt-0.5">{assessment.description}</p>
                  </div>

                  {/* Stats */}
                  <div className="hidden sm:flex items-center gap-4 text-xs text-white/30 flex-shrink-0">
                    <span>{assessment.questionCount} questions</span>
                    <span>{assessment.estimatedMinutes} min</span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {assessment.status === "draft" && (
                      <QuickAction label="Activate" color="green" onClick={(e) => handleStatusChange(e, assessment.id, "active")} />
                    )}
                    {assessment.status === "active" && (
                      <QuickAction label="Archive" color="gray" onClick={(e) => handleStatusChange(e, assessment.id, "archived")} />
                    )}
                    {assessment.status === "archived" && (
                      <QuickAction label="Reactivate" color="blue" onClick={(e) => handleStatusChange(e, assessment.id, "active")} />
                    )}
                    <QuickAction
                      label={copiedId === assessment.id ? "Copied!" : "Copy Link"}
                      color={copiedId === assessment.id ? "green" : "blue"}
                      onClick={(e) => handleCopyLink(e, assessment.id)}
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/admin/builder/${assessment.id}`);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-white/10 text-white/30 hover:text-white/60 transition-all"
                      title="Edit in Builder"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* DUPLICATE MODAL                                                    */}
      {/* ================================================================== */}
      {duplicateTarget && (
        <DuplicateAssessmentModal
          source={duplicateTarget}
          onClose={() => setDuplicateTarget(null)}
          onDuplicated={() => {
            setDuplicateTarget(null);
            loadAssessments();
          }}
        />
      )}

      {/* ================================================================== */}
      {/* ASSESSMENT DRAWER                                                  */}
      {/* ================================================================== */}
      {selectedAssessmentId && (
        <AssessmentDrawer
          assessmentId={selectedAssessmentId}
          onClose={handleDrawerClose}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Duplicate Assessment Modal
// ---------------------------------------------------------------------------

function DuplicateAssessmentModal({
  source,
  onClose,
  onDuplicated,
}: {
  source: Assessment;
  onClose: () => void;
  onDuplicated: () => void;
}) {
  const [name, setName] = useState(`${source.name} (Copy)`);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generatedId = useMemo(() => {
    const slug = slugify(name) || `${source.id}-copy`;
    return `${slug}-${Date.now().toString(36).slice(-4)}`;
  }, [name, source.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await duplicateAssessmentApi(source.id, generatedId, name.trim());
      onDuplicated();
    } catch (err) {
      console.error("Failed to duplicate assessment:", err);
      setError("Failed to duplicate assessment. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalBackdrop onClose={onClose}>
      <form
        onSubmit={handleSubmit}
        className="bg-[#0e0e16] border border-white/10 rounded-2xl p-6 shadow-2xl"
      >
        <h2 className="text-lg font-semibold text-white/90 mb-1">
          Duplicate Assessment
        </h2>
        <p className="text-sm text-white/40 mb-5">
          Create a copy of{" "}
          <span className="text-white/60 font-medium">{source.name}</span> with
          all its questions and configuration.
        </p>

        {error && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/25 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Source preview */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 mb-5 flex items-center gap-3">
          <span className="text-2xl">{source.icon}</span>
          <div>
            <p className="text-sm text-white/70 font-medium">{source.name}</p>
            <p className="text-xs text-white/30">
              {source.questionCount} questions &middot;{" "}
              {source.estimatedMinutes} min
            </p>
          </div>
          <StatusBadge status={source.status} />
        </div>

        {/* New name */}
        <label className="block text-xs text-white/40 mb-1.5">
          New Assessment Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          className="w-full bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/25 outline-none focus:border-white/20 transition-colors mb-1"
        />
        <p className="text-[11px] text-white/20 mb-6 font-mono">
          ID: {generatedId}
        </p>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-xl border border-white/10 text-white/50 hover:bg-white/[0.04] transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className={`px-5 py-2 text-sm font-medium rounded-xl border transition-all ${
              submitting || !name.trim()
                ? "bg-white/[0.04] border-white/10 text-white/25 cursor-not-allowed"
                : "bg-white/[0.10] border-white/15 text-white hover:bg-white/[0.15]"
            }`}
          >
            {submitting ? "Duplicating..." : "Duplicate"}
          </button>
        </div>
      </form>
    </ModalBackdrop>
  );
}
