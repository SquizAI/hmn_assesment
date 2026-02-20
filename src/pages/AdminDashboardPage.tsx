import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import StatCard from "../components/admin/StatCard";
import StatusBadge from "../components/admin/StatusBadge";
import { fetchStats, fetchFunnel, fetchDimensions, fetchSessions, fetchCompanies } from "../lib/admin-api";
import { fetchGraphStatus, fetchThemeMap, fetchBenchmarks, seedGraph } from "../lib/graph-api";

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

interface GraphStatusData {
  enabled: boolean;
  nodeCount: number;
}

interface ThemeEntry {
  theme: string;
  frequency: number;
  sentiment: "positive" | "negative" | "neutral";
  category: "tool" | "pain_point" | "goal" | "capability";
}

interface ArchetypeEntry {
  archetype: string;
  count: number;
}

interface IndustryBenchmark {
  industry: string;
  avgScore: number;
  sessions: number;
  topArchetype: string;
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

  const [graphStatus, setGraphStatus] = useState<GraphStatusData | null>(null);
  const [themes, setThemes] = useState<ThemeEntry[]>([]);
  const [archetypes, setArchetypes] = useState<ArchetypeEntry[]>([]);
  const [benchmarks, setBenchmarks] = useState<IndustryBenchmark[]>([]);
  const [graphLoading, setGraphLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);

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

  useEffect(() => {
    fetchGraphStatus()
      .then((status) => {
        setGraphStatus(status);
        if (status.enabled && status.nodeCount > 0) {
          return Promise.all([fetchThemeMap(), fetchBenchmarks()]);
        }
        return null;
      })
      .then((results) => {
        if (results) {
          const [themeData, benchmarkData] = results;
          setThemes(themeData.themes || []);
          setArchetypes(benchmarkData.archetypes || []);
          setBenchmarks(benchmarkData.industries || []);
        }
      })
      .catch(() => {
        // Graph not available
      })
      .finally(() => setGraphLoading(false));
  }, []);

  const handleSeed = async () => {
    setSeeding(true);
    try {
      await seedGraph();
      const status = await fetchGraphStatus();
      setGraphStatus(status);
      if (status.enabled && status.nodeCount > 0) {
        const [themeData, benchmarkData] = await Promise.all([fetchThemeMap(), fetchBenchmarks()]);
        setThemes(themeData.themes || []);
        setArchetypes(benchmarkData.archetypes || []);
        setBenchmarks(benchmarkData.industries || []);
      }
    } catch {
      // seed failed
    } finally {
      setSeeding(false);
    }
  };

  const isGraphEnabled = graphStatus?.enabled && (graphStatus?.nodeCount ?? 0) > 0;

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
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4">
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
        <div
          onClick={() => {
            if (graphStatus?.enabled && (graphStatus?.nodeCount ?? 0) === 0) handleSeed();
          }}
          className={`bg-white/[0.03] border border-white/10 rounded-2xl p-6 hover:bg-white/[0.05] transition-colors ${
            graphStatus?.enabled && (graphStatus?.nodeCount ?? 0) === 0 ? "cursor-pointer" : ""
          }`}
        >
          <div className="text-xs text-white/40 uppercase tracking-wider mb-2">Graph</div>
          {graphLoading ? (
            <div className="h-8 w-24 bg-white/5 rounded animate-pulse" />
          ) : (
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  graphStatus?.enabled && (graphStatus?.nodeCount ?? 0) > 0
                    ? "bg-green-400"
                    : graphStatus?.enabled
                    ? "bg-orange-400"
                    : "bg-gray-500"
                }`}
              />
              <span className="text-sm font-medium text-white/70">
                {graphStatus?.enabled && (graphStatus?.nodeCount ?? 0) > 0
                  ? "Connected"
                  : graphStatus?.enabled
                  ? "Empty"
                  : "Offline"}
              </span>
            </div>
          )}
          {graphStatus?.enabled && (graphStatus?.nodeCount ?? 0) > 0 && (
            <div className="text-xs text-white/30 mt-1">{graphStatus.nodeCount} nodes</div>
          )}
          {graphStatus?.enabled && (graphStatus?.nodeCount ?? 0) === 0 && (
            <div className="text-xs text-white/30 mt-1">Click to seed</div>
          )}
        </div>
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

      {/* Graph Intelligence Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Trending Themes */}
        <div className="bg-white/[0.03] rounded-2xl border border-white/10 p-4 md:p-6">
          <div className="flex items-center gap-2 mb-3 md:mb-4">
            <svg className="w-4 h-4 text-purple-400/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
            </svg>
            <h2 className="text-xs md:text-sm font-semibold text-white/60 uppercase tracking-wider">
              Trending Themes
            </h2>
          </div>
          {graphLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-6 bg-white/5 rounded animate-pulse" />
              ))}
            </div>
          ) : !isGraphEnabled ? (
            <div className="text-center py-8">
              <p className="text-white/30 text-sm">Connect Neo4j to see theme intelligence</p>
              {graphStatus?.enabled && (
                <button
                  onClick={handleSeed}
                  disabled={seeding}
                  className="mt-3 text-xs text-purple-400/70 hover:text-purple-400 transition-colors"
                >
                  {seeding ? "Seeding..." : "Seed Graph"}
                </button>
              )}
            </div>
          ) : themes.length === 0 ? (
            <div className="text-center py-8 text-white/30 text-sm">No themes detected yet</div>
          ) : (
            <div className="space-y-2.5">
              {themes.slice(0, 10).map((theme) => {
                const maxFreq = themes[0]?.frequency || 1;
                return (
                  <div key={theme.theme} className="flex items-center gap-2">
                    <span
                      className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        theme.sentiment === "positive"
                          ? "bg-green-400"
                          : theme.sentiment === "negative"
                          ? "bg-red-400"
                          : "bg-gray-400"
                      }`}
                    />
                    <span className="w-28 text-xs text-white/60 truncate flex-shrink-0">{theme.theme}</span>
                    <div className="flex-1 bg-white/5 rounded h-3 overflow-hidden">
                      <div
                        className="h-full rounded bg-gradient-to-r from-purple-500/60 to-blue-500/60"
                        style={{ width: `${(theme.frequency / maxFreq) * 100}%`, minWidth: "2px" }}
                      />
                    </div>
                    <span className="text-[10px] text-white/30 tabular-nums w-6 text-right flex-shrink-0">{theme.frequency}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full border flex-shrink-0 ${
                      theme.category === "tool"
                        ? "text-blue-400/70 border-blue-400/20 bg-blue-400/5"
                        : theme.category === "pain_point"
                        ? "text-red-400/70 border-red-400/20 bg-red-400/5"
                        : theme.category === "goal"
                        ? "text-green-400/70 border-green-400/20 bg-green-400/5"
                        : "text-amber-400/70 border-amber-400/20 bg-amber-400/5"
                    }`}>
                      {theme.category === "pain_point" ? "pain" : theme.category}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Archetype Distribution */}
        <div className="bg-white/[0.03] rounded-2xl border border-white/10 p-4 md:p-6">
          <h2 className="text-xs md:text-sm font-semibold text-white/60 uppercase tracking-wider mb-3 md:mb-4">
            Archetype Distribution
          </h2>
          {graphLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-6 bg-white/5 rounded animate-pulse" />
              ))}
            </div>
          ) : !isGraphEnabled ? (
            <div className="text-center py-8 text-white/30 text-sm">Graph not connected</div>
          ) : archetypes.length === 0 ? (
            <div className="text-center py-8 text-white/30 text-sm">No archetype data yet</div>
          ) : (
            <div className="space-y-2.5">
              {archetypes.map((a, idx) => {
                const maxCount = archetypes[0]?.count || 1;
                const colors = [
                  "from-purple-500/60 to-purple-600/60",
                  "from-blue-500/60 to-blue-600/60",
                  "from-cyan-500/60 to-cyan-600/60",
                  "from-green-500/60 to-green-600/60",
                  "from-amber-500/60 to-amber-600/60",
                  "from-rose-500/60 to-rose-600/60",
                  "from-indigo-500/60 to-indigo-600/60",
                  "from-teal-500/60 to-teal-600/60",
                ];
                return (
                  <div key={a.archetype} className="flex items-center gap-2">
                    <span className="w-28 text-xs text-white/60 truncate flex-shrink-0">
                      {humanize(a.archetype.replace("the_", ""))}
                    </span>
                    <div className="flex-1 bg-white/5 rounded h-4 overflow-hidden">
                      <div
                        className={`h-full rounded bg-gradient-to-r ${colors[idx % colors.length]}`}
                        style={{ width: `${(a.count / maxCount) * 100}%`, minWidth: "2px" }}
                      />
                    </div>
                    <span className="text-xs text-white/40 tabular-nums w-6 text-right flex-shrink-0">{a.count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Industry Benchmarks */}
        <div className="bg-white/[0.03] rounded-2xl border border-white/10 p-4 md:p-6">
          <h2 className="text-xs md:text-sm font-semibold text-white/60 uppercase tracking-wider mb-3 md:mb-4">
            Industry Benchmarks
          </h2>
          {graphLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-6 bg-white/5 rounded animate-pulse" />
              ))}
            </div>
          ) : !isGraphEnabled ? (
            <div className="text-center py-8 text-white/30 text-sm">Graph not connected</div>
          ) : benchmarks.length === 0 ? (
            <div className="text-center py-8 text-white/30 text-sm">No benchmark data yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className="text-left text-[10px] text-white/40 uppercase tracking-wider pb-2">Industry</th>
                    <th className="text-right text-[10px] text-white/40 uppercase tracking-wider pb-2">Avg</th>
                    <th className="text-right text-[10px] text-white/40 uppercase tracking-wider pb-2">Sessions</th>
                    <th className="text-right text-[10px] text-white/40 uppercase tracking-wider pb-2">Top Type</th>
                  </tr>
                </thead>
                <tbody>
                  {[...benchmarks]
                    .sort((a, b) => b.avgScore - a.avgScore)
                    .map((b) => (
                      <tr key={b.industry} className="border-t border-white/5">
                        <td className="py-2 text-xs text-white/60 truncate max-w-[100px]">{b.industry}</td>
                        <td className={`py-2 text-xs text-right tabular-nums font-medium ${
                          b.avgScore >= 70
                            ? "text-green-400"
                            : b.avgScore >= 45
                            ? "text-yellow-400"
                            : "text-red-400"
                        }`}>
                          {Math.round(b.avgScore)}
                        </td>
                        <td className="py-2 text-xs text-white/40 text-right tabular-nums">{b.sessions}</td>
                        <td className="py-2 text-[10px] text-white/40 text-right truncate max-w-[80px]">
                          {humanize(b.topArchetype.replace("the_", ""))}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
