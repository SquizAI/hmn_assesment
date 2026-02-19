import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import StatCard from "../components/admin/StatCard";
import StatusBadge from "../components/admin/StatusBadge";
import { fetchStats, fetchFunnel, fetchDimensions, fetchSessions, fetchCompanies } from "../lib/admin-api";

/** Lightweight local type matching the admin stats API response shape. */
interface DashboardStats {
  totalSessions: number;
  completedSessions: number;
  analyzedSessions: number;
  completionRate: number;
  averageScore: number;
  assessmentBreakdown: { assessmentTypeId: string; count: number }[];
}

/** Lightweight local type matching the admin funnel API response shape. */
interface DashboardFunnelStage {
  stage: "intake" | "in_progress" | "completed" | "analyzed";
  count: number;
  percentage: number;
}

/** Lightweight local type matching the admin dimensions API response shape. */
interface DashboardDimension {
  dimension: string;
  average: number;
  count: number;
}

/** Lightweight local type matching the admin session summary API response shape. */
interface DashboardSession {
  id: string;
  participantName: string;
  participantCompany: string;
  status: string;
  createdAt: string;
  assessmentTypeId: string;
  responseCount: number;
}

interface DashboardCompany {
  company: string;
  sessionCount: number;
  participantCount: number;
  averageScore: number | null;
  completionRate: number;
  lastActivity: string;
  hasResearch: boolean;
}

const FUNNEL_COLORS: Record<string, string> = {
  intake: "from-gray-500 to-gray-600",
  in_progress: "from-blue-500 to-blue-600",
  completed: "from-green-500 to-green-600",
  analyzed: "from-purple-500 to-purple-600",
};

const FUNNEL_LABELS: Record<string, string> = {
  intake: "Intake",
  in_progress: "In Progress",
  completed: "Completed",
  analyzed: "Analyzed",
};

function humanize(snake: string): string {
  return snake
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function relativeDate(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
}

function scoreColor(score: number): "green" | "yellow" | "red" {
  if (score >= 70) return "green";
  if (score >= 45) return "yellow";
  return "red";
}

function scoreBarColor(score: number): string {
  if (score >= 70) return "from-green-500 to-green-600";
  if (score >= 45) return "from-yellow-500 to-yellow-600";
  return "from-red-500 to-red-600";
}

export default function AdminDashboardPage() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [funnel, setFunnel] = useState<DashboardFunnelStage[]>([]);
  const [dimensions, setDimensions] = useState<DashboardDimension[]>([]);
  const [sessions, setSessions] = useState<DashboardSession[]>([]);
  const [companies, setCompanies] = useState<DashboardCompany[]>([]);

  useEffect(() => {
    Promise.all([fetchStats(), fetchFunnel(), fetchDimensions(), fetchSessions(), fetchCompanies()])
      .then(([statsData, funnelData, dimensionsData, sessionsData, companiesData]) => {
        setStats(statsData);
        setFunnel(funnelData.funnel);
        setDimensions(dimensionsData.dimensions);
        setSessions(sessionsData.sessions);
        setCompanies(companiesData.companies || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Dashboard load error:", err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="px-4 md:px-6 py-4 md:py-6 flex items-center justify-center h-full">
        <span className="text-white/30">Loading...</span>
      </div>
    );
  }

  return (
    <div className="px-4 md:px-6 py-4 md:py-6 space-y-4 md:space-y-6">
      {/* Stat Cards Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label="Total Sessions"
          value={stats?.totalSessions ?? 0}
          sub={`${stats?.completedSessions ?? 0} completed`}
        />
        <StatCard
          label="Completion Rate"
          value={`${stats?.completionRate ?? 0}%`}
          color={
            (stats?.completionRate ?? 0) > 50
              ? "green"
              : (stats?.completionRate ?? 0) > 25
              ? "yellow"
              : "red"
          }
        />
        <StatCard
          label="Avg Score"
          value={stats?.averageScore || "\u2014"}
          color={
            stats?.averageScore
              ? scoreColor(stats.averageScore)
              : "default"
          }
          sub="/100"
        />
        <StatCard
          label="Assessments"
          value={stats?.assessmentBreakdown?.length ?? 0}
        />
      </div>

      {/* Completion Funnel */}
      <div className="bg-white/[0.03] rounded-2xl border border-white/10 p-4 md:p-6">
        <h2 className="text-xs md:text-sm font-semibold text-white/60 uppercase tracking-wider mb-3 md:mb-4">
          Completion Funnel
        </h2>
        <div className="space-y-3">
          {funnel.map((stage) => (
            <div key={stage.stage} className="flex items-center gap-2 md:gap-3">
              <span className="w-20 md:w-28 text-xs md:text-sm text-white/50 flex-shrink-0">
                {FUNNEL_LABELS[stage.stage] || stage.stage}
              </span>
              <div className="flex-1 bg-white/5 rounded-lg h-6 md:h-8 overflow-hidden">
                <div
                  className={`h-full rounded-lg bg-gradient-to-r ${FUNNEL_COLORS[stage.stage] || "from-gray-500 to-gray-600"}`}
                  style={{ width: `${stage.percentage}%`, minWidth: "2px" }}
                />
              </div>
              <span className="text-xs md:text-sm text-white/40 tabular-nums flex-shrink-0 w-16 md:w-24 text-right">
                {stage.count} ({stage.percentage}%)
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Two-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Dimension Averages */}
        <div className="bg-white/[0.03] rounded-2xl border border-white/10 p-4 md:p-6">
          <h2 className="text-xs md:text-sm font-semibold text-white/60 uppercase tracking-wider mb-3 md:mb-4">
            Dimension Averages
          </h2>
          {dimensions.length === 0 ? (
            <div className="text-center py-8 text-white/30">No dimension data yet</div>
          ) : (
            <div className="space-y-3">
              {dimensions.map((dim) => (
                <div key={dim.dimension} className="flex items-center gap-2 md:gap-3">
                  <span className="w-24 md:w-36 text-xs md:text-sm text-white/50 flex-shrink-0 truncate">
                    {humanize(dim.dimension)}
                  </span>
                  <span className="text-xs md:text-sm font-medium text-white/70 tabular-nums w-7 md:w-8 text-right flex-shrink-0">
                    {Math.round(dim.average)}
                  </span>
                  <div className="flex-1 bg-white/5 rounded-lg h-4 md:h-5 overflow-hidden">
                    <div
                      className={`h-full rounded-lg bg-gradient-to-r ${scoreBarColor(dim.average)}`}
                      style={{ width: `${dim.average}%`, minWidth: "2px" }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Companies */}
        <div className="bg-white/[0.03] rounded-2xl border border-white/10 p-4 md:p-6">
          <div className="flex items-center justify-between mb-3 md:mb-4">
            <h2 className="text-xs md:text-sm font-semibold text-white/60 uppercase tracking-wider">
              Top Companies
            </h2>
            <button
              onClick={() => navigate("/admin/companies")}
              className="text-xs text-blue-400/60 hover:text-blue-400 transition-colors"
            >
              View all
            </button>
          </div>
          {companies.length === 0 ? (
            <div className="text-center py-8 text-white/30">No companies yet</div>
          ) : (
            <div className="space-y-2">
              {companies.slice(0, 8).map((company) => (
                <div
                  key={company.company}
                  onClick={() => navigate(`/admin/companies/${encodeURIComponent(company.company)}`)}
                  className="flex items-center gap-2 md:gap-3 px-2 md:px-3 py-2 md:py-2.5 rounded-xl hover:bg-white/5 cursor-pointer transition-colors"
                >
                  <div className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-gradient-to-br from-purple-500/15 to-blue-500/15 border border-white/10 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-white/50">
                      {company.company.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs md:text-sm font-medium text-white/80 truncate block">
                      {company.company}
                    </span>
                    <span className="text-[10px] md:text-xs text-white/30">
                      {company.sessionCount} session{company.sessionCount !== 1 ? "s" : ""} · {company.participantCount} people
                    </span>
                  </div>
                  {company.averageScore !== null && (
                    <span className={`text-xs md:text-sm font-semibold tabular-nums ${scoreColor(company.averageScore) === "green" ? "text-green-400" : scoreColor(company.averageScore) === "yellow" ? "text-yellow-400" : "text-red-400"}`}>
                      {company.averageScore}
                    </span>
                  )}
                  {company.hasResearch && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                  )}
                  <span className="text-[10px] md:text-xs text-white/20 shrink-0 w-12 md:w-14 text-right">
                    {relativeDate(company.lastActivity)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
