import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import StatCard from "../components/admin/StatCard";
import { fetchStats, fetchFunnel, fetchDimensions, fetchSessions, fetchCompanies, fetchAssessments } from "../lib/admin-api";
import type { DashboardFilters } from "../lib/admin-api";
import {
  fetchGraphStatus,
  fetchThemeMap,
  fetchBenchmarks,
  seedGraph,
  fetchGrowthTimeline,
  fetchNetworkGraph,
} from "../lib/graph-api";
import GraphVisualization from "../components/admin/GraphVisualization";
import GrowthTimeline from "../components/admin/GrowthTimeline";
import DimensionRadar from "../components/admin/DimensionRadar";
import InsightCards from "../components/admin/InsightCards";
import RiskSignals from "../components/admin/RiskSignals";
import FilterBar from "../components/admin/FilterBar";

// ============================================================
// Local Types
// ============================================================

interface DashboardStats {
  totalSessions: number;
  completedSessions: number;
  analyzedSessions: number;
  completionRate: number;
  averageScore: number;
  assessmentBreakdown: { assessmentTypeId: string; count: number }[];
}

interface FunnelStage {
  stage: "intake" | "in_progress" | "completed" | "analyzed";
  count: number;
  percentage: number;
}

interface DashboardDimension {
  dimension: string;
  average: number;
  count: number;
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
  category: string;
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

interface TimelinePoint {
  date: string;
  sessions: number;
  cumulativeSessions: number;
}

interface GraphNode {
  id: string;
  type: string;
  label: string;
  properties: Record<string, unknown>;
}

interface GraphEdge {
  source: string;
  target: string;
  type: string;
}

// ============================================================
// Helpers
// ============================================================

function humanize(snake: string): string {
  return snake
    .replace(/^the_/, "")
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function relativeDate(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor(diff / 60000);
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

// ============================================================
// Component
// ============================================================

export default function AdminDashboardPage() {
  const navigate = useNavigate();

  // Filters
  const [filters, setFilters] = useState<DashboardFilters>({});
  const [assessmentList, setAssessmentList] = useState<{ id: string; name: string }[]>([]);

  // Core data
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [funnel, setFunnel] = useState<FunnelStage[]>([]);
  const [dimensions, setDimensions] = useState<DashboardDimension[]>([]);
  const [companies, setCompanies] = useState<DashboardCompany[]>([]);

  // Graph data
  const [graphStatus, setGraphStatus] = useState<GraphStatusData | null>(null);
  const [themes, setThemes] = useState<ThemeEntry[]>([]);
  const [archetypes, setArchetypes] = useState<ArchetypeEntry[]>([]);
  const [benchmarks, setBenchmarks] = useState<IndustryBenchmark[]>([]);
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);
  const [graphNodes, setGraphNodes] = useState<GraphNode[]>([]);
  const [graphEdges, setGraphEdges] = useState<GraphEdge[]>([]);
  const [graphLoading, setGraphLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);

  // Red flags + green lights from benchmarks
  const [redFlags, setRedFlags] = useState<{ description: string; frequency: number }[]>([]);
  const [greenLights, setGreenLights] = useState<{ description: string; frequency: number }[]>([]);

  // Load assessment list once (for filter dropdown)
  useEffect(() => {
    fetchAssessments()
      .then((data) => {
        const list = (data.assessments ?? data ?? []) as { id: string; title?: string; name?: string }[];
        setAssessmentList(list.map((a) => ({ id: a.id, name: a.title || a.name || a.id })));
      })
      .catch(() => {});
  }, []);

  // Derive unique company names, industries, archetypes for filter dropdowns
  const companyNames = useMemo(() => companies.map((c) => c.company).filter(Boolean), [companies]);
  const industryList = useMemo(() => {
    if (!benchmarks.length) return [];
    return [...new Set(benchmarks.map((b) => b.industry).filter(Boolean))];
  }, [benchmarks]);
  const archetypeList = useMemo(() => {
    if (!archetypes.length) return [];
    return archetypes.map((a) => a.archetype).filter(Boolean);
  }, [archetypes]);

  const handleFilterChange = useCallback((next: DashboardFilters) => {
    setFilters(next);
  }, []);

  // Load core data (re-fetches when filters change)
  useEffect(() => {
    setLoading(true);
    Promise.all([fetchStats(filters), fetchFunnel(filters), fetchDimensions(filters), fetchSessions(filters), fetchCompanies(filters)])
      .then(([statsData, funnelData, _dimensionsData, _sessionsData, companiesData]) => {
        setStats(statsData);
        setFunnel(funnelData.funnel);
        setDimensions(_dimensionsData.dimensions);
        setCompanies(companiesData.companies || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Dashboard load error:", err);
        setLoading(false);
      });
  }, [filters]);

  // Load graph data (re-fetches when filters change)
  useEffect(() => {
    setGraphLoading(true);
    fetchGraphStatus()
      .then((status) => {
        setGraphStatus(status);
        if (status.enabled && status.nodeCount > 0) {
          return Promise.all([
            fetchThemeMap(filters),
            fetchBenchmarks(filters),
            fetchGrowthTimeline(filters),
            fetchNetworkGraph(filters),
          ]);
        }
        return null;
      })
      .then((results) => {
        if (results) {
          const [themeData, benchmarkData, timelineData, networkData] = results;
          setThemes(themeData.themes || []);
          setArchetypes(benchmarkData.archetypes || []);
          setBenchmarks(benchmarkData.industries || []);
          setTimeline(timelineData.timeline || []);
          setGraphNodes(networkData.nodes || []);
          setGraphEdges(networkData.edges || []);

          // Extract red flags and green lights from theme data if available
          if (themeData.themes) {
            const flags = (themeData.themes as { name: string; frequency: number; sentiment: string }[])
              .filter((t) => t.sentiment === "negative")
              .map((t) => ({ description: t.name, frequency: t.frequency }));
            const lights = (themeData.themes as { name: string; frequency: number; sentiment: string }[])
              .filter((t) => t.sentiment === "positive")
              .map((t) => ({ description: t.name, frequency: t.frequency }));
            setRedFlags(flags);
            setGreenLights(lights);
          }
        }
      })
      .catch(() => {})
      .finally(() => setGraphLoading(false));
  }, [filters]);

  const handleSeed = async () => {
    setSeeding(true);
    try {
      await seedGraph();
      const status = await fetchGraphStatus();
      setGraphStatus(status);
      if (status.enabled && status.nodeCount > 0) {
        const [themeData, benchmarkData, timelineData, networkData] = await Promise.all([
          fetchThemeMap(filters),
          fetchBenchmarks(filters),
          fetchGrowthTimeline(filters),
          fetchNetworkGraph(filters),
        ]);
        setThemes(themeData.themes || []);
        setArchetypes(benchmarkData.archetypes || []);
        setBenchmarks(benchmarkData.industries || []);
        setTimeline(timelineData.timeline || []);
        setGraphNodes(networkData.nodes || []);
        setGraphEdges(networkData.edges || []);
      }
    } catch {
      // seed failed
    } finally {
      setSeeding(false);
    }
  };

  const isGraphEnabled = graphStatus?.enabled && (graphStatus?.nodeCount ?? 0) > 0;

  // Computed insight data
  const topArchetype = useMemo(() => {
    if (archetypes.length === 0) return null;
    const sorted = [...archetypes].sort((a, b) => b.count - a.count);
    return sorted[0];
  }, [archetypes]);

  const topTheme = useMemo(() => {
    if (themes.length === 0) return null;
    return themes[0];
  }, [themes]);

  if (loading) {
    return (
      <div className="px-4 md:px-6 py-4 md:py-6 flex items-center justify-center h-full">
        <span className="text-white/30">Loading...</span>
      </div>
    );
  }

  return (
    <div className="px-4 md:px-6 py-4 md:py-6 space-y-4 md:space-y-5">
      {/* ============================================ */}
      {/* FILTER BAR                                   */}
      {/* ============================================ */}
      <FilterBar
        filters={filters}
        onChange={handleFilterChange}
        companies={companyNames}
        assessments={assessmentList}
        industries={industryList}
        archetypes={archetypeList}
      />

      {/* ============================================ */}
      {/* ROW 1: Insight Story Cards                  */}
      {/* ============================================ */}
      <InsightCards
        totalSessions={stats?.totalSessions ?? 0}
        completionRate={stats?.completionRate ?? 0}
        averageScore={stats?.averageScore ?? 0}
        topArchetype={topArchetype ? { name: topArchetype.archetype, count: topArchetype.count } : null}
        topTheme={topTheme ? { name: topTheme.theme, frequency: topTheme.frequency, sentiment: topTheme.sentiment } : null}
        redFlagCount={redFlags.length}
        companyCount={companies.length}
        loading={loading}
      />

      {/* ============================================ */}
      {/* ROW 2: Growth Timeline + Stat Cards          */}
      {/* ============================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Growth Timeline (2/3 width) */}
        <div className="lg:col-span-2">
          <GrowthTimeline data={timeline} loading={graphLoading} />
        </div>

        {/* Stat Cards (1/3 width) */}
        <div className="grid grid-cols-2 gap-3 content-start">
          <StatCard
            label="Total Sessions"
            value={stats?.totalSessions ?? 0}
            sub={`${stats?.completedSessions ?? 0} completed`}
          />
          <StatCard
            label="Completion Rate"
            value={`${stats?.completionRate ?? 0}%`}
            color={
              (stats?.completionRate ?? 0) > 50 ? "green" : (stats?.completionRate ?? 0) > 25 ? "yellow" : "red"
            }
          />
          <StatCard
            label="Avg Score"
            value={stats?.averageScore || "\u2014"}
            color={stats?.averageScore ? scoreColor(stats.averageScore) : "default"}
            sub="/100"
          />
          {/* Graph status card */}
          <div
            onClick={() => {
              if (graphStatus?.enabled && (graphStatus?.nodeCount ?? 0) === 0) handleSeed();
            }}
            className={`bg-white/[0.03] border border-white/10 rounded-2xl p-4 hover:bg-white/[0.05] transition-colors ${
              graphStatus?.enabled && (graphStatus?.nodeCount ?? 0) === 0 ? "cursor-pointer" : ""
            }`}
          >
            <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1.5">Graph</div>
            {graphLoading ? (
              <div className="h-6 w-16 bg-white/5 rounded animate-pulse" />
            ) : (
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    isGraphEnabled ? "bg-green-400" : graphStatus?.enabled ? "bg-orange-400" : "bg-gray-500"
                  }`}
                />
                <span className="text-sm font-medium text-white/70">
                  {isGraphEnabled ? "Connected" : graphStatus?.enabled ? "Empty" : "Offline"}
                </span>
              </div>
            )}
            {isGraphEnabled && (
              <div className="text-[10px] text-white/30 mt-0.5">{graphStatus!.nodeCount} nodes</div>
            )}
            {graphStatus?.enabled && (graphStatus?.nodeCount ?? 0) === 0 && (
              <div className="text-[10px] text-white/30 mt-0.5">
                {seeding ? "Seeding..." : "Click to seed"}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ============================================ */}
      {/* ROW 3: Interactive Graph Visualization       */}
      {/* ============================================ */}
      <GraphVisualization nodes={graphNodes} edges={graphEdges} loading={graphLoading} />

      {/* ============================================ */}
      {/* ROW 4: Dimension Radar + Archetypes + Risk   */}
      {/* ============================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <DimensionRadar dimensions={dimensions} loading={loading} />

        {/* Archetype Distribution — Donut Chart */}
        <div className="bg-white/[0.03] rounded-2xl border border-white/10 p-4 md:p-6">
          <h2 className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-3">
            Archetype Distribution
          </h2>
          {graphLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-6 bg-white/5 rounded animate-pulse" />
              ))}
            </div>
          ) : !isGraphEnabled || archetypes.length === 0 ? (
            <div className="text-center py-8 text-white/30 text-sm">
              {isGraphEnabled ? "No archetype data yet" : "Graph not connected"}
            </div>
          ) : (
            <div>
              {/* SVG Donut */}
              <div className="flex justify-center mb-3">
                <svg viewBox="0 0 100 100" className="w-32 h-32">
                  {(() => {
                    const total = archetypes.reduce((s, a) => s + a.count, 0);
                    const colors = ["#a855f7", "#3b82f6", "#06b6d4", "#22c55e", "#f59e0b", "#f43f5e", "#6366f1", "#14b8a6"];
                    let cumAngle = -90;
                    return archetypes.map((a, i) => {
                      const pct = a.count / total;
                      const angle = pct * 360;
                      const startAngle = cumAngle;
                      cumAngle += angle;
                      const endAngle = cumAngle;
                      const startRad = (startAngle * Math.PI) / 180;
                      const endRad = (endAngle * Math.PI) / 180;
                      const largeArc = angle > 180 ? 1 : 0;
                      const x1 = 50 + 35 * Math.cos(startRad);
                      const y1 = 50 + 35 * Math.sin(startRad);
                      const x2 = 50 + 35 * Math.cos(endRad);
                      const y2 = 50 + 35 * Math.sin(endRad);
                      const ix1 = 50 + 22 * Math.cos(endRad);
                      const iy1 = 50 + 22 * Math.sin(endRad);
                      const ix2 = 50 + 22 * Math.cos(startRad);
                      const iy2 = 50 + 22 * Math.sin(startRad);
                      return (
                        <path
                          key={i}
                          d={`M ${x1} ${y1} A 35 35 0 ${largeArc} 1 ${x2} ${y2} L ${ix1} ${iy1} A 22 22 0 ${largeArc} 0 ${ix2} ${iy2} Z`}
                          fill={colors[i % colors.length]}
                          opacity={0.7}
                          stroke="rgba(0,0,0,0.3)"
                          strokeWidth="0.5"
                        />
                      );
                    });
                  })()}
                  <text x="50" y="48" textAnchor="middle" className="fill-white/80" style={{ fontSize: "8px", fontWeight: 700 }}>
                    {archetypes.reduce((s, a) => s + a.count, 0)}
                  </text>
                  <text x="50" y="56" textAnchor="middle" className="fill-white/40" style={{ fontSize: "4px" }}>
                    total
                  </text>
                </svg>
              </div>
              {/* Legend */}
              <div className="space-y-1.5">
                {archetypes
                  .sort((a, b) => b.count - a.count)
                  .map((a, i) => {
                    const colors = ["bg-purple-500", "bg-blue-500", "bg-cyan-500", "bg-green-500", "bg-amber-500", "bg-rose-500", "bg-indigo-500", "bg-teal-500"];
                    const total = archetypes.reduce((s, x) => s + x.count, 0);
                    const pct = total > 0 ? Math.round((a.count / total) * 100) : 0;
                    return (
                      <div key={a.archetype} className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${colors[i % colors.length]} opacity-70`} />
                        <span className="text-xs text-white/60 flex-1 truncate">
                          {humanize(a.archetype)}
                        </span>
                        <span className="text-[10px] text-white/40 tabular-nums">{a.count}</span>
                        <span className="text-[10px] text-white/25 tabular-nums w-8 text-right">{pct}%</span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>

        <RiskSignals redFlags={redFlags} greenLights={greenLights} loading={graphLoading} />
      </div>

      {/* ============================================ */}
      {/* ROW 5: Company Leaderboard + Themes          */}
      {/* ============================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Company Leaderboard */}
        <div className="bg-white/[0.03] rounded-2xl border border-white/10 p-4 md:p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-white/60 uppercase tracking-wider">
              Company Leaderboard
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
            <div className="space-y-1.5">
              {companies.slice(0, 10).map((company, idx) => (
                <div
                  key={company.company}
                  onClick={() => navigate(`/admin/companies/${encodeURIComponent(company.company)}`)}
                  className="flex items-center gap-2 px-2.5 py-2 rounded-xl hover:bg-white/5 cursor-pointer transition-colors"
                >
                  {/* Rank */}
                  <span className="text-[10px] text-white/20 tabular-nums w-4 text-right flex-shrink-0">
                    {idx + 1}
                  </span>
                  {/* Avatar */}
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-500/15 to-blue-500/15 border border-white/10 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-white/50">
                      {company.company.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium text-white/80 truncate block">{company.company}</span>
                    <span className="text-[10px] text-white/30">
                      {company.sessionCount} session{company.sessionCount !== 1 ? "s" : ""} · {company.participantCount} people
                    </span>
                  </div>
                  {/* Score */}
                  {company.averageScore !== null && (
                    <span
                      className={`text-sm font-semibold tabular-nums ${
                        scoreColor(company.averageScore) === "green"
                          ? "text-green-400"
                          : scoreColor(company.averageScore) === "yellow"
                          ? "text-yellow-400"
                          : "text-red-400"
                      }`}
                    >
                      {company.averageScore}
                    </span>
                  )}
                  {company.hasResearch && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                  )}
                  <span className="text-[10px] text-white/20 shrink-0 w-12 text-right">
                    {relativeDate(company.lastActivity)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Theme Intelligence */}
        <div className="bg-white/[0.03] rounded-2xl border border-white/10 p-4 md:p-6">
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-4 h-4 text-purple-400/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
            </svg>
            <h2 className="text-xs font-semibold text-white/60 uppercase tracking-wider">
              Theme Intelligence
            </h2>
          </div>
          {graphLoading ? (
            <div className="space-y-3">
              {[...Array(6)].map((_, i) => (
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
            <div className="space-y-2">
              {themes.slice(0, 12).map((theme) => {
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
                    <span className="text-[10px] text-white/30 tabular-nums w-5 text-right flex-shrink-0">
                      {theme.frequency}
                    </span>
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded-full border flex-shrink-0 ${
                        theme.category === "tool"
                          ? "text-blue-400/70 border-blue-400/20 bg-blue-400/5"
                          : theme.category === "pain_point"
                          ? "text-red-400/70 border-red-400/20 bg-red-400/5"
                          : theme.category === "goal"
                          ? "text-green-400/70 border-green-400/20 bg-green-400/5"
                          : "text-amber-400/70 border-amber-400/20 bg-amber-400/5"
                      }`}
                    >
                      {theme.category === "pain_point" ? "pain" : theme.category}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ============================================ */}
      {/* ROW 6: Funnel + Industry Benchmarks          */}
      {/* ============================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Completion Funnel */}
        <div className="bg-white/[0.03] rounded-2xl border border-white/10 p-4 md:p-6">
          <h2 className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-3">
            Completion Funnel
          </h2>
          <div className="space-y-2.5">
            {funnel.map((stage, i) => {
              const nextStage = funnel[i + 1];
              const convRate = nextStage && stage.count > 0 ? Math.round((nextStage.count / stage.count) * 100) : null;
              return (
                <div key={stage.stage}>
                  <div className="flex items-center gap-2">
                    <span className="w-20 text-xs text-white/50 flex-shrink-0">
                      {FUNNEL_LABELS[stage.stage] || stage.stage}
                    </span>
                    <div className="flex-1 bg-white/5 rounded-lg h-6 overflow-hidden">
                      <div
                        className={`h-full rounded-lg bg-gradient-to-r ${FUNNEL_COLORS[stage.stage] || "from-gray-500 to-gray-600"}`}
                        style={{ width: `${stage.percentage}%`, minWidth: "2px" }}
                      />
                    </div>
                    <span className="text-xs text-white/40 tabular-nums flex-shrink-0 w-20 text-right">
                      {stage.count} ({stage.percentage}%)
                    </span>
                  </div>
                  {convRate !== null && (
                    <div className="flex items-center gap-2 ml-20 mt-0.5">
                      <span className="text-[9px] text-white/20">
                        {convRate}% conversion
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Industry Benchmarks */}
        <div className="bg-white/[0.03] rounded-2xl border border-white/10 p-4 md:p-6">
          <h2 className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-3">
            Industry Benchmarks
          </h2>
          {graphLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-6 bg-white/5 rounded animate-pulse" />
              ))}
            </div>
          ) : !isGraphEnabled || benchmarks.length === 0 ? (
            <div className="text-center py-8 text-white/30 text-sm">
              {isGraphEnabled ? "No benchmark data yet" : "Graph not connected"}
            </div>
          ) : (
            <div className="space-y-2.5">
              {[...benchmarks]
                .sort((a, b) => b.avgScore - a.avgScore)
                .map((b) => (
                  <div key={b.industry} className="flex items-center gap-2">
                    <span className="w-24 text-xs text-white/60 truncate flex-shrink-0">{b.industry}</span>
                    <div className="flex-1 bg-white/5 rounded h-5 overflow-hidden">
                      <div
                        className={`h-full rounded bg-gradient-to-r ${
                          b.avgScore >= 70
                            ? "from-green-500/50 to-green-600/50"
                            : b.avgScore >= 45
                            ? "from-yellow-500/50 to-yellow-600/50"
                            : "from-red-500/50 to-red-600/50"
                        }`}
                        style={{ width: `${b.avgScore}%`, minWidth: "2px" }}
                      />
                    </div>
                    <span
                      className={`text-xs font-medium tabular-nums w-7 text-right flex-shrink-0 ${
                        b.avgScore >= 70 ? "text-green-400" : b.avgScore >= 45 ? "text-yellow-400" : "text-red-400"
                      }`}
                    >
                      {Math.round(b.avgScore)}
                    </span>
                    <span className="text-[10px] text-white/25 tabular-nums w-4 text-right flex-shrink-0">
                      {b.sessions}
                    </span>
                    <span className="text-[9px] text-white/25 truncate w-16 text-right flex-shrink-0">
                      {humanize(b.topArchetype || "unknown")}
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
