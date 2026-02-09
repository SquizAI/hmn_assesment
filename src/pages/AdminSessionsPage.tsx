import { useState, useEffect, useCallback, useRef } from "react";
import StatusBadge from "../components/admin/StatusBadge";
import SessionDrawer from "../components/admin/SessionDrawer";
import { fetchSessions, exportSessionsData } from "../lib/admin-api";

interface Session {
  id: string;
  participantName: string;
  participantCompany: string;
  status: string;
  createdAt: string;
  assessmentTypeId: string;
  responseCount: number;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isWithinDateRange(
  dateStr: string,
  range: string
): boolean {
  if (range === "all") return true;
  const date = new Date(dateStr);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (range === "today") {
    return date >= startOfToday;
  }
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

export default function AdminSessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  const exportRef = useRef<HTMLDivElement>(null);

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
  }, [loadSessions]);

  const filteredSessions = sessions.filter((s) => {
    const matchesSearch =
      !search ||
      s.participantName.toLowerCase().includes(search.toLowerCase()) ||
      s.participantCompany.toLowerCase().includes(search.toLowerCase());

    const matchesStatus =
      statusFilter === "all" || s.status === statusFilter;

    const matchesDate = isWithinDateRange(s.createdAt, dateFilter);

    return matchesSearch && matchesStatus && matchesDate;
  });

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

  const handleRowClick = (id: string) => {
    setSelectedSessionId(id);
  };

  return (
    <div className="px-6 py-6">
      {/* Filter Bar */}
      <div className="flex items-center gap-3 mb-6">
        <input
          type="text"
          placeholder="Search by name or company..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-white/20 transition-colors"
        />

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-white/20 transition-colors appearance-none cursor-pointer"
        >
          <option value="all">All</option>
          <option value="intake">Intake</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="analyzed">Analyzed</option>
        </select>

        <select
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-white/20 transition-colors appearance-none cursor-pointer"
        >
          <option value="all">All time</option>
          <option value="today">Today</option>
          <option value="week">This week</option>
          <option value="month">This month</option>
        </select>

        <div className="ml-auto relative" ref={exportRef}>
          <button
            onClick={() => setExportOpen(!exportOpen)}
            className="bg-white/[0.05] border border-white/10 rounded-lg px-4 py-2 text-sm text-white hover:bg-white/[0.08] transition-colors"
          >
            Export
          </button>
          {exportOpen && (
            <div className="absolute right-0 top-full mt-1 bg-[#12121a] border border-white/10 rounded-lg overflow-hidden shadow-xl z-20">
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

      {/* Sessions Table */}
      <div className="bg-white/[0.03] rounded-2xl border border-white/10 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-white/[0.02]">
              <th className="text-left text-xs text-white/40 uppercase tracking-wider px-4 py-3">
                Name
              </th>
              <th className="text-left text-xs text-white/40 uppercase tracking-wider px-4 py-3">
                Company
              </th>
              <th className="text-left text-xs text-white/40 uppercase tracking-wider px-4 py-3">
                Status
              </th>
              <th className="text-left text-xs text-white/40 uppercase tracking-wider px-4 py-3">
                Responses
              </th>
              <th className="text-left text-xs text-white/40 uppercase tracking-wider px-4 py-3">
                Date
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="text-center text-white/30 py-12">
                  Loading sessions...
                </td>
              </tr>
            ) : filteredSessions.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center text-white/30 py-12">
                  No sessions found
                </td>
              </tr>
            ) : (
              filteredSessions.map((session) => (
                <tr
                  key={session.id}
                  onClick={() => handleRowClick(session.id)}
                  className="hover:bg-white/[0.04] cursor-pointer transition-colors border-t border-white/5"
                >
                  <td className="px-4 py-3 font-medium text-white">
                    {session.participantName}
                  </td>
                  <td className="px-4 py-3 text-white/50">
                    {session.participantCompany}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={session.status} />
                  </td>
                  <td className="px-4 py-3 text-white/40">
                    {session.responseCount}
                  </td>
                  <td className="px-4 py-3 text-white/30">
                    {formatDate(session.createdAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

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
