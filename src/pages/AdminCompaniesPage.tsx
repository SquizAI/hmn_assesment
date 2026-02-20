import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import StatusBadge from "../components/admin/StatusBadge";
import AddCompanyModal from "../components/admin/AddCompanyModal";
import { fetchCompanies, removeCompany } from "../lib/admin-api";

interface CompanySummary {
  company: string;
  participantCount: number;
  sessionCount: number;
  completedCount: number;
  analyzedCount: number;
  averageScore: number | null;
  completionRate: number;
  lastActivity: string;
  industries: string[];
  hasResearch: boolean;
}

function relativeDate(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  return "just now";
}

function scoreColor(score: number): string {
  if (score >= 70) return "text-green-400";
  if (score >= 45) return "text-yellow-400";
  return "text-red-400";
}

export default function AdminCompaniesPage() {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState<CompanySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"activity" | "sessions" | "score">("activity");
  const [expandedCompany, setExpandedCompany] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [shiftHeld, setShiftHeld] = useState(false);
  const [deletingCompany, setDeletingCompany] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

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

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const loadCompanies = useCallback(() => {
    setLoading(true);
    fetchCompanies()
      .then((data) => {
        setCompanies(data.companies || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadCompanies();
  }, [loadCompanies]);

  const handleDelete = async (companyName: string) => {
    if (confirmDelete !== companyName) {
      setConfirmDelete(companyName);
      return;
    }
    setDeletingCompany(companyName);
    setConfirmDelete(null);
    try {
      const result = await removeCompany(companyName);
      setCompanies((prev) => prev.filter((c) => c.company !== companyName));
      setToast(`Deleted ${companyName} — ${result.deletedSessions} sessions removed`);
    } catch {
      setToast(`Failed to delete ${companyName}`);
    } finally {
      setDeletingCompany(null);
    }
  };

  const filtered = companies
    .filter((c) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        c.company.toLowerCase().includes(q) ||
        c.industries.some((i) => i.toLowerCase().includes(q))
      );
    })
    .sort((a, b) => {
      if (sortBy === "sessions") return b.sessionCount - a.sessionCount;
      if (sortBy === "score") return (b.averageScore ?? 0) - (a.averageScore ?? 0);
      return new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime();
    });

  if (loading) {
    return (
      <div className="px-4 md:px-6 py-4 md:py-6 flex items-center justify-center h-full">
        <span className="text-white/30">Loading companies...</span>
      </div>
    );
  }

  return (
    <div className="px-4 md:px-6 py-4 md:py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white/90">Companies</h2>
          <p className="text-sm text-white/40">{companies.length} companies across all sessions</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-500/20 border border-purple-500/30 text-purple-300 text-sm font-medium hover:bg-purple-500/30 transition-all"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          <span className="hidden sm:inline">New Company</span>
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <input
          type="text"
          placeholder="Search companies or industries..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-white/20 transition-colors w-full sm:w-72"
        />
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as "activity" | "sessions" | "score")}
          className="bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-white/20 transition-colors appearance-none cursor-pointer"
        >
          <option value="activity">Recent Activity</option>
          <option value="sessions">Most Sessions</option>
          <option value="score">Highest Score</option>
        </select>
      </div>

      {/* Shift hint */}
      {shiftHeld && (
        <div className="text-xs text-red-400/60 flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-400/60" />
          Delete mode — this will remove all sessions for the company
        </div>
      )}

      {/* Company Cards */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-white/30">No companies found</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((company) => (
            <div
              key={company.company}
              className={`bg-white/[0.03] rounded-2xl border overflow-hidden transition-colors ${
                shiftHeld ? "border-red-500/15 hover:border-red-500/30" : "border-white/10"
              }`}
            >
              {/* Company Header */}
              <div
                onClick={() => setExpandedCompany(expandedCompany === company.company ? null : company.company)}
                className="flex flex-wrap items-center gap-3 md:gap-4 px-4 md:px-5 py-3 md:py-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
              >
                {/* Company icon */}
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 border border-white/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-white/60">
                    {company.company.charAt(0).toUpperCase()}
                  </span>
                </div>

                {/* Company info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-white/90 truncate">{company.company}</h3>
                    {company.hasResearch && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                        Research
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    {company.industries.map((ind) => (
                      <span key={ind} className="text-[11px] text-white/30">{ind}</span>
                    ))}
                  </div>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-3 md:gap-6 flex-shrink-0 flex-wrap">
                  <div className="text-center">
                    <span className="text-lg font-semibold text-white/80">{company.sessionCount}</span>
                    <p className="text-[10px] text-white/30">Sessions</p>
                  </div>
                  <div className="text-center">
                    <span className="text-lg font-semibold text-white/80">{company.participantCount}</span>
                    <p className="text-[10px] text-white/30">People</p>
                  </div>
                  <div className="text-center">
                    <span className={`text-lg font-semibold ${company.averageScore ? scoreColor(company.averageScore) : "text-white/30"}`}>
                      {company.averageScore ?? "\u2014"}
                    </span>
                    <p className="text-[10px] text-white/30">Avg Score</p>
                  </div>
                  <div className="text-center">
                    <span className="text-lg font-semibold text-white/80">{company.completionRate}%</span>
                    <p className="text-[10px] text-white/30">Complete</p>
                  </div>
                  <span className="text-xs text-white/20">{relativeDate(company.lastActivity)}</span>
                </div>

                {/* Delete button (shift mode) */}
                {shiftHeld && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(company.company);
                    }}
                    disabled={deletingCompany === company.company}
                    className={`px-3 py-1.5 text-xs rounded-lg border transition-colors flex-shrink-0 ${
                      confirmDelete === company.company
                        ? "bg-red-500/25 border-red-500/40 text-red-300 font-medium"
                        : "bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20"
                    } disabled:opacity-40`}
                  >
                    {deletingCompany === company.company
                      ? "..."
                      : confirmDelete === company.company
                        ? `Confirm? (${company.sessionCount} sessions)`
                        : "Delete"}
                  </button>
                )}

                {/* Chevron */}
                {!shiftHeld && (
                  <svg
                    className={`w-4 h-4 text-white/20 transition-transform ${expandedCompany === company.company ? "rotate-180" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                )}
              </div>

              {/* Expanded: View detail link */}
              {expandedCompany === company.company && (
                <div className="border-t border-white/[0.06] px-5 py-3 flex items-center justify-between">
                  <span className="text-xs text-white/30">
                    {company.completedCount} completed, {company.analyzedCount} analyzed
                  </span>
                  <button
                    onClick={() => navigate(`/admin/companies/${encodeURIComponent(company.company)}`)}
                    className="px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs font-medium hover:bg-purple-500/20 transition-all"
                  >
                    View Company Detail
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#1a1a2e] border border-white/10 text-white px-5 py-2.5 rounded-xl shadow-2xl text-sm animate-fade-in">
          {toast}
        </div>
      )}

      {/* Add Company Modal */}
      <AddCompanyModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onCreated={loadCompanies}
      />
    </div>
  );
}
