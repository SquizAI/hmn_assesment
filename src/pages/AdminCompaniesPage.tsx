import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import StatusBadge from "../components/admin/StatusBadge";
import { fetchCompanies } from "../lib/admin-api";

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

  useEffect(() => {
    fetchCompanies()
      .then((data) => {
        setCompanies(data.companies || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

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

      {/* Company Cards */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-white/30">No companies found</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((company) => (
            <div
              key={company.company}
              className="bg-white/[0.03] rounded-2xl border border-white/10 overflow-hidden"
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

                {/* Chevron */}
                <svg
                  className={`w-4 h-4 text-white/20 transition-transform ${expandedCompany === company.company ? "rotate-180" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
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
    </div>
  );
}
