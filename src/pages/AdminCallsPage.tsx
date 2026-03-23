import { useEffect, useState, useCallback, Fragment } from "react";
import { Link } from "react-router-dom";
import { fetchCalls as fetchCallsApi } from "../lib/admin-api";
import StatusBadge from "../components/admin/StatusBadge";
import CallDrawerContent from "../components/admin/CallDrawerContent";
import { useDetailDrawer } from "../components/admin/DetailDrawer";

interface Call {
  id: string;
  contact_id: string;
  session_id: string | null;
  status: string;
  duration_seconds: number | null;
  recording_url: string | null;
  transcript: string | null;
  transcript_messages: Array<{ role: string; message: string; timestamp?: number }> | null;
  analysis_status: string;
  created_at: string;
  contact: { id: string; name: string; phone: string; company: string | null } | null;
  profile_score: number | null;
  profile_archetype: string | null;
}

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "queued", label: "Queued" },
  { value: "ringing", label: "Ringing" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "no_answer", label: "No Answer" },
];

function formatDuration(seconds: number | null): string {
  if (!seconds) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}


export default function AdminCallsPage() {
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const { openDrawer, closeDrawer } = useDetailDrawer();
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchCalls = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchCallsApi({ status: statusFilter || undefined, page, limit: 50 });
      setCalls(data.calls || []);
      setTotal(data.total || 0);
    } catch (err) { console.error("Failed to load calls:", err); }
    finally { setLoading(false); }
  }, [statusFilter, page]);

  useEffect(() => { fetchCalls(); }, [fetchCalls]);

  const totalPages = Math.ceil(total / 50);

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="flex flex-wrap items-center gap-4 mb-8">
        <h1 className="text-3xl font-bold text-foreground mr-auto">Call History</h1>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="bg-muted border border-border rounded-lg px-4 py-2 text-sm text-foreground focus:border-border focus:outline-none appearance-none">
          {STATUS_OPTIONS.map((opt) => <option key={opt.value} value={opt.value} className="bg-card">{opt.label}</option>)}
        </select>
      </div>

      <div className="bg-muted border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-muted">
                <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Contact</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Phone</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Duration</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Recording</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Profile</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Analysis</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Date</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-6 py-8 text-center text-muted-foreground text-sm">Loading...</td></tr>
              ) : calls.length === 0 ? (
                <tr><td colSpan={8} className="px-6 py-8 text-center text-muted-foreground text-sm">No calls found.</td></tr>
              ) : calls.map((call) => (
                <Fragment key={call.id}>
                  <tr onClick={() => openDrawer(
                    <CallDrawerContent call={call} onClose={closeDrawer} />
                  )} className="border-b border-border hover:bg-muted cursor-pointer transition-all">
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-foreground">{call.contact?.name || "Unknown"}</p>
                      {call.contact?.company && <p className="text-xs text-muted-foreground">{call.contact.company}</p>}
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground font-mono">{call.contact?.phone || "\u2014"}</td>
                    <td className="px-6 py-4"><StatusBadge status={call.status} size="sm" /></td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">{formatDuration(call.duration_seconds)}</td>
                    <td className="px-6 py-4">
                      {call.recording_url ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-400/70">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" /></svg>
                          Available
                        </span>
                      ) : <span className="text-xs text-muted-foreground">&mdash;</span>}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {call.profile_archetype && (
                          <span className="px-2 py-0.5 text-[10px] font-medium bg-blue-500/10 text-blue-300 rounded-full border border-blue-500/20">
                            {call.profile_archetype}
                          </span>
                        )}
                        {call.profile_score !== null && (
                          <span className={`text-xs font-semibold tabular-nums ${
                            call.profile_score >= 70 ? "text-green-400" : call.profile_score >= 45 ? "text-yellow-400" : "text-red-400"
                          }`}>
                            {Math.round(call.profile_score)}
                          </span>
                        )}
                        {!call.profile_archetype && call.profile_score === null && (
                          <span className="text-xs text-muted-foreground">&mdash;</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {call.analysis_status === "completed" && call.session_id ? (
                        <Link to={`/analysis/${call.session_id}`} onClick={(e) => e.stopPropagation()} className="text-xs text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors">View Analysis</Link>
                      ) : <StatusBadge status={call.analysis_status} size="sm" />}
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">{formatDate(call.created_at)}</td>
                  </tr>
                  {/* Call detail now opens in the push DetailDrawer */}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-border">
            <p className="text-xs text-muted-foreground">Showing {(page - 1) * 50 + 1}-{Math.min(page * 50, total)} of {total}</p>
            <div className="flex gap-1">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 text-xs rounded-lg bg-muted text-muted-foreground hover:bg-muted disabled:opacity-30 transition-colors">Prev</button>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1 text-xs rounded-lg bg-muted text-muted-foreground hover:bg-muted disabled:opacity-30 transition-colors">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
