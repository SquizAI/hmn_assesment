import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import StatusBadge from "../components/admin/StatusBadge";
import SessionDrawer from "../components/admin/SessionDrawer";
import { fetchSessions, removeSession, exportSessionsData, fetchAssessments } from "../lib/admin-api";
import type { AssessmentSummary } from "../lib/types";

interface Session {
  id: string;
  participantName: string;
  participantCompany: string;
  status: string;
  createdAt: string;
  assessmentTypeId: string;
  responseCount: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelative(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatAbsolute(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function isWithinDateRange(dateStr: string, range: string): boolean {
  if (range === "all") return true;
  const date = new Date(dateStr);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (range === "today") return date >= startOfToday;
  if (range === "week") {
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    return date >= startOfWeek;
  }
  if (range === "month") {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return date >= startOfMonth;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------

function StatCard({ label, value, active, onClick }: { label: string; value: number; active?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center px-4 py-2.5 rounded-xl border transition-all min-w-[80px] ${
        active
          ? "bg-white/[0.08] border-white/20 text-white"
          : "bg-white/[0.03] border-white/5 text-white/40 hover:bg-white/[0.05] hover:border-white/10"
      }`}
    >
      <span className="text-lg font-semibold">{value}</span>
      <span className="text-[10px] uppercase tracking-wider mt-0.5">{label}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AdminSessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [assessments, setAssessments] = useState<AssessmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [assessmentFilter, setAssessmentFilter] = useState("all");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [useRelativeTime, setUseRelativeTime] = useState(true);
  const [shiftHeld, setShiftHeld] = useState(false);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);

  const exportRef = useRef<HTMLDivElement>(null);
  const formatTs = useRelativeTime ? formatRelative : formatAbsolute;

  // Track shift key
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.key === "Shift") setShiftHeld(true); };
    const up = (e: KeyboardEvent) => { if (e.key === "Shift") setShiftHeld(false); };
    const blur = () => setShiftHeld(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  // Close export dropdown on outside click
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, []);

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchSessions();
      setSessions(data.sessions);
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
    fetchAssessments().then((d) => setAssessments(d.assessments ?? [])).catch(() => {});
  }, [loadSessions]);

  // Derived data for filters
  const companies = useMemo(() => {
    const set = new Set<string>();
    sessions.forEach((s) => {
      if (s.participantCompany && s.participantCompany !== "Unknown") set.add(s.participantCompany);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [sessions]);

  const assessmentMap = useMemo(() => {
    const map = new Map<string, string>();
    assessments.forEach((a) => map.set(a.id, a.name));
    return map;
  }, [assessments]);

  // Unique assessment IDs actually used in sessions
  const sessionAssessmentIds = useMemo(() => {
    const set = new Set<string>();
    sessions.forEach((s) => { if (s.assessmentTypeId) set.add(s.assessmentTypeId); });
    return Array.from(set);
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      const matchesSearch =
        !search ||
        s.participantName.toLowerCase().includes(search.toLowerCase()) ||
        s.participantCompany.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || s.status === statusFilter;
      const matchesDate = isWithinDateRange(s.createdAt, dateFilter);
      const matchesAssessment = assessmentFilter === "all" || s.assessmentTypeId === assessmentFilter;
      const matchesCompany = companyFilter === "all" || s.participantCompany === companyFilter;
      return matchesSearch && matchesStatus && matchesDate && matchesAssessment && matchesCompany;
    });
  }, [sessions, search, statusFilter, dateFilter, assessmentFilter, companyFilter]);

  // Stats
  const stats = useMemo(() => {
    const total = sessions.length;
    const inProgress = sessions.filter((s) => s.status === "in_progress").length;
    const researched = sessions.filter((s) => s.status === "researched").length;
    const completed = sessions.filter((s) => s.status === "completed").length;
    const analyzed = sessions.filter((s) => s.status === "analyzed").length;
    return { total, inProgress, researched, completed, analyzed };
  }, [sessions]);

  const handleExport = async (format: "csv" | "json") => {
    setExportOpen(false);
    try {
      const data = await exportSessionsData(format);
      const mimeType = format === "csv" ? "text/csv" : "application/json";
      const content = format === "json" ? JSON.stringify(data, null, 2) : data;
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `sessions-export.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      // export failed silently
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeletingIds((prev) => new Set(prev).add(id));
    try {
      await removeSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      setToast("Session deleted");
    } catch {
      setToast("Failed to delete session");
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleRowClick = (id: string) => {
    setSelectedSessionId(id);
  };

  const selectCls =
    "bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-white/20 transition-colors appearance-none cursor-pointer";

  return (
    <div className="px-4 md:px-6 py-6">
      {/* Stat Cards */}
      <div className="flex flex-wrap gap-2 mb-5">
        <StatCard label="Total" value={stats.total} active={statusFilter === "all"} onClick={() => setStatusFilter("all")} />
        <StatCard label="In Progress" value={stats.inProgress} active={statusFilter === "in_progress"} onClick={() => setStatusFilter(statusFilter === "in_progress" ? "all" : "in_progress")} />
        <StatCard label="Researched" value={stats.researched} active={statusFilter === "researched"} onClick={() => setStatusFilter(statusFilter === "researched" ? "all" : "researched")} />
        <StatCard label="Completed" value={stats.completed} active={statusFilter === "completed"} onClick={() => setStatusFilter(statusFilter === "completed" ? "all" : "completed")} />
        <StatCard label="Analyzed" value={stats.analyzed} active={statusFilter === "analyzed"} onClick={() => setStatusFilter(statusFilter === "analyzed" ? "all" : "analyzed")} />
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center flex-wrap gap-2 sm:gap-3 mb-6">
        <input
          type="text"
          placeholder="Search by name or company..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-auto bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-white/20 transition-colors"
        />

        <div className="flex gap-2 sm:gap-3 flex-wrap">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectCls}>
            <option value="all">All Statuses</option>
            <option value="intake">Intake</option>
            <option value="researched">Researched</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="analyzed">Analyzed</option>
          </select>

          <select value={assessmentFilter} onChange={(e) => setAssessmentFilter(e.target.value)} className={selectCls}>
            <option value="all">All Assessments</option>
            {sessionAssessmentIds.map((id) => (
              <option key={id} value={id}>
                {assessmentMap.get(id) || id}
              </option>
            ))}
          </select>

          <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} className={selectCls}>
            <option value="all">All Companies</option>
            {companies.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className={selectCls}>
            <option value="all">All time</option>
            <option value="today">Today</option>
            <option value="week">This week</option>
            <option value="month">This month</option>
          </select>
        </div>

        <div className="sm:ml-auto relative" ref={exportRef}>
          <button
            onClick={() => setExportOpen(!exportOpen)}
            className="w-full sm:w-auto bg-white/[0.05] border border-white/10 rounded-lg px-4 py-2 text-sm text-white hover:bg-white/[0.08] transition-colors"
          >
            Export
          </button>
          {exportOpen && (
            <div className="absolute right-0 sm:right-0 left-0 sm:left-auto top-full mt-1 bg-[#12121a] border border-white/10 rounded-lg overflow-hidden shadow-xl z-20 sm:min-w-[120px]">
              <button
                onClick={() => handleExport("csv")}
                className="block w-full text-left px-4 py-2 text-sm text-white hover:bg-white/[0.06] transition-colors"
              >
                CSV
              </button>
              <button
                onClick={() => handleExport("json")}
                className="block w-full text-left px-4 py-2 text-sm text-white hover:bg-white/[0.06] transition-colors"
              >
                JSON
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Shift hint */}
      {shiftHeld && (
        <div className="mb-3 text-xs text-red-400/60 flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-400/60" />
          Delete mode — click the red button to remove a session
        </div>
      )}

      {/* Sessions Table */}
      <div className="bg-white/[0.03] rounded-2xl border border-white/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-white/[0.02]">
                <th className="text-left text-xs text-white/40 uppercase tracking-wider px-4 py-3">
                  Name
                </th>
                <th className="hidden sm:table-cell text-left text-xs text-white/40 uppercase tracking-wider px-4 py-3">
                  Company
                </th>
                <th className="hidden lg:table-cell text-left text-xs text-white/40 uppercase tracking-wider px-4 py-3">
                  Assessment
                </th>
                <th className="text-left text-xs text-white/40 uppercase tracking-wider px-4 py-3">
                  Status
                </th>
                <th className="hidden sm:table-cell text-left text-xs text-white/40 uppercase tracking-wider px-4 py-3">
                  Responses
                </th>
                <th
                  className="hidden sm:table-cell text-left text-xs text-white/40 uppercase tracking-wider px-4 py-3 cursor-pointer select-none hover:text-white/60 transition-colors"
                  onClick={() => setUseRelativeTime((v) => !v)}
                  title={useRelativeTime ? "Click for date/time" : "Click for relative time"}
                >
                  {useRelativeTime ? "Activity" : "Date / Time"}
                  <span className="ml-1 text-[10px] text-white/20">⇄</span>
                </th>
                {shiftHeld && (
                  <th className="text-left text-xs text-red-400/50 uppercase tracking-wider px-4 py-3 w-[80px]">
                    Delete
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={shiftHeld ? 7 : 6} className="text-center text-white/30 py-12">
                    Loading sessions...
                  </td>
                </tr>
              ) : filteredSessions.length === 0 ? (
                <tr>
                  <td colSpan={shiftHeld ? 7 : 6} className="text-center text-white/30 py-12">
                    No sessions found
                  </td>
                </tr>
              ) : (
                filteredSessions.map((session) => (
                  <tr
                    key={session.id}
                    onClick={() => handleRowClick(session.id)}
                    className={`hover:bg-white/[0.04] cursor-pointer transition-colors border-t border-white/5 ${
                      shiftHeld ? "hover:bg-red-500/[0.04]" : ""
                    }`}
                  >
                    <td className="px-4 py-3 font-medium text-white">
                      {session.participantName}
                      <div className="text-xs text-white/30 mt-0.5 sm:hidden">
                        {session.participantCompany}
                      </div>
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 text-white/50">
                      {session.participantCompany}
                    </td>
                    <td className="hidden lg:table-cell px-4 py-3 text-white/40 text-sm max-w-[200px] truncate">
                      {assessmentMap.get(session.assessmentTypeId) || session.assessmentTypeId}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={session.status} />
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 text-white/40">
                      {session.responseCount}
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 text-white/30 text-sm">
                      {formatTs(session.createdAt)}
                    </td>
                    {shiftHeld && (
                      <td className="px-4 py-3">
                        <button
                          onClick={(e) => handleDelete(e, session.id)}
                          disabled={deletingIds.has(session.id)}
                          className="px-2.5 py-1 text-xs rounded-lg border transition-colors bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20 hover:text-red-300 disabled:opacity-40"
                        >
                          {deletingIds.has(session.id) ? "..." : "Delete"}
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Table footer with count */}
        <div className="border-t border-white/5 px-4 py-2.5 flex items-center justify-between text-xs text-white/30">
          <span>
            {filteredSessions.length === sessions.length
              ? `${sessions.length} sessions`
              : `${filteredSessions.length} of ${sessions.length} sessions`}
          </span>
          {shiftHeld && <span className="text-red-400/40">Hold Shift to delete</span>}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#1a1a2e] border border-white/10 text-white px-5 py-2.5 rounded-xl shadow-2xl text-sm animate-fade-in">
          {toast}
        </div>
      )}

      {/* Session Drawer */}
      {selectedSessionId && (
        <SessionDrawer
          sessionId={selectedSessionId}
          onClose={() => setSelectedSessionId(null)}
          onDelete={() => { setSelectedSessionId(null); loadSessions(); }}
        />
      )}
    </div>
  );
}
