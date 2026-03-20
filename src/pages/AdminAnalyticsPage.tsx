import { useEffect, useState, useCallback, useMemo } from "react";
import { fetchAnalytics as fetchAnalyticsApi } from "../lib/admin-api";

// ============================================================
// Types
// ============================================================

interface KPI {
  total_assessments: number;
  avg_score: number;
  completion_rate: number;
  avg_call_duration: number;
  total_sessions: number;
  completed_sessions: number;
}
interface DimensionAverage {
  dimension: string;
  label: string;
  average: number;
  count: number;
}
interface AnalyticsData {
  period: string;
  kpi: KPI;
  assessments_over_time: { date: string; count: number }[];
  dimension_averages: DimensionAverage[];
  archetype_distribution: { archetype: string; count: number }[];
  score_distribution: { label: string; count: number }[];
  top_gaps: { gap: string; count: number }[];
  industry_breakdown: { industry: string; count: number }[];
}

type Period = "7d" | "30d" | "90d" | "all";
type ViewTab = "overview" | "dimensions" | "distribution" | "trends" | "gaps";

const PERIODS: { value: Period; label: string }[] = [
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
  { value: "90d", label: "90 Days" },
  { value: "all", label: "All Time" },
];

const VIEW_TABS: { value: ViewTab; label: string; icon: string }[] = [
  { value: "overview", label: "Overview", icon: "M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" },
  { value: "dimensions", label: "Dimensions", icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
  { value: "distribution", label: "Distribution", icon: "M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" },
  { value: "trends", label: "Trends", icon: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" },
  { value: "gaps", label: "Gaps & Industry", icon: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" },
];

// ============================================================
// Helpers
// ============================================================

function formatDuration(seconds: number) {
  if (!seconds) return "0:00";
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")}`;
}
function getScoreColor(score: number) {
  if (score >= 70) return "bg-gradient-to-r from-green-500 to-emerald-400";
  if (score >= 50) return "bg-gradient-to-r from-purple-600 to-blue-500";
  if (score >= 30) return "bg-gradient-to-r from-yellow-500 to-orange-400";
  return "bg-gradient-to-r from-red-500 to-pink-500";
}
function getScoreTextColor(score: number) {
  if (score >= 70) return "text-emerald-400";
  if (score >= 50) return "text-blue-400";
  if (score >= 30) return "text-yellow-400";
  return "text-red-400";
}

async function downloadCsv(url: string, filename: string) {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`Export failed: ${res.status}`);
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ============================================================
// Sub-components
// ============================================================

function KPICard({ label, value, sub, trend }: { label: string; value: string | number; sub?: string; trend?: "up" | "down" | "neutral" }) {
  return (
    <div className="bg-muted border border-border rounded-xl p-5 hover:bg-white/[0.07] transition-colors group">
      <p className="text-sm text-muted-foreground mb-1">{label}</p>
      <div className="flex items-end gap-2">
        <p className="text-3xl font-bold text-foreground">{value}</p>
        {trend && (
          <span className={`text-xs mb-1 ${trend === "up" ? "text-green-400" : trend === "down" ? "text-red-400" : "text-muted-foreground/70"}`}>
            {trend === "up" ? "\u2191" : trend === "down" ? "\u2193" : "\u2014"}
          </span>
        )}
      </div>
      {sub && <p className="text-xs text-muted-foreground mt-2">{sub}</p>}
    </div>
  );
}

function HBarChart({ items, maxValue, colorClass }: { items: { label: string; value: number }[]; maxValue: number; colorClass?: string }) {
  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-foreground/80 truncate">{item.label}</span>
            <span className="text-sm font-medium text-muted-foreground ml-2 shrink-0">{item.value}</span>
          </div>
          <div className="h-5 w-full bg-muted rounded-md overflow-hidden">
            <div
              className={`h-full rounded-md transition-all duration-700 ${colorClass || "bg-gradient-to-r from-purple-600 to-blue-500"}`}
              style={{ width: `${Math.max((item.value / maxValue) * 100, 2)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function RankedList({ items, label }: { items: { name: string; value: number }[]; label?: string }) {
  const max = Math.max(...items.map((d) => d.value), 1);
  return (
    <div className="space-y-2.5">
      {label && <h4 className="text-xs text-muted-foreground/70 uppercase tracking-wider mb-3">{label}</h4>}
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground/70 w-5 text-right shrink-0">{i + 1}</span>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between mb-1">
              <span className="text-sm text-foreground/80 truncate">{item.name}</span>
              <span className="text-xs text-muted-foreground shrink-0 ml-2">{item.value}</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400"
                style={{ width: `${Math.max((item.value / max) * 100, 2)}%` }}
              />
            </div>
          </div>
        </div>
      ))}
      {items.length === 0 && <p className="text-sm text-muted-foreground/70">No data</p>}
    </div>
  );
}

// Sparkline-style mini area chart (pure CSS/divs)
function MiniTimeline({ data }: { data: { date: string; count: number }[] }) {
  if (data.length === 0) return <p className="text-sm text-muted-foreground/70">No timeline data</p>;
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div>
      <div className="flex items-end gap-px h-32">
        {data.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group relative">
            <div
              className="w-full rounded-t-sm bg-gradient-to-t from-purple-600/80 to-blue-500/60 transition-all duration-300 hover:from-purple-500 hover:to-blue-400 cursor-default min-h-[2px]"
              style={{ height: `${Math.max((d.count / max) * 100, 2)}%` }}
            />
            {/* Tooltip */}
            <div className="absolute bottom-full mb-1 hidden group-hover:block z-10">
              <div className="bg-black/90 border border-border rounded-lg px-2 py-1 text-[10px] text-foreground whitespace-nowrap">
                {d.date}: {d.count}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-2">
        <span className="text-[10px] text-muted-foreground/60">{data[0]?.date}</span>
        <span className="text-[10px] text-muted-foreground/60">{data[data.length - 1]?.date}</span>
      </div>
    </div>
  );
}

// ============================================================
// Main Page Component
// ============================================================

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("30d");
  const [activeTab, setActiveTab] = useState<ViewTab>("overview");
  const [exporting, setExporting] = useState(false);

  // Filters
  const [selectedArchetype, setSelectedArchetype] = useState<string | null>(null);
  const [selectedIndustry, setSelectedIndustry] = useState<string | null>(null);
  const [scoreRange, setScoreRange] = useState<[number, number]>([0, 100]);
  const [dimSortBy, setDimSortBy] = useState<"score" | "name">("score");
  const [dimSortDir, setDimSortDir] = useState<"asc" | "desc">("desc");

  const fetchAnalytics = useCallback(async (p: Period) => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchAnalyticsApi(p));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics(period);
  }, [period, fetchAnalytics]);

  const handleExport = async (type: "sessions" | "profiles") => {
    setExporting(true);
    try {
      await downloadCsv(`/api/admin/export?type=${type}&period=${period}`, `${type}-export.csv`);
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setExporting(false);
    }
  };

  // Sorted/filtered dimensions
  const sortedDimensions = useMemo(() => {
    if (!data) return [];
    const dims = [...data.dimension_averages];
    dims.sort((a, b) => {
      if (dimSortBy === "score") return dimSortDir === "desc" ? b.average - a.average : a.average - b.average;
      return dimSortDir === "desc" ? b.label.localeCompare(a.label) : a.label.localeCompare(b.label);
    });
    return dims;
  }, [data, dimSortBy, dimSortDir]);

  // Active filter count
  const activeFilterCount = useMemo(() => {
    let c = 0;
    if (selectedArchetype) c++;
    if (selectedIndustry) c++;
    if (scoreRange[0] !== 0 || scoreRange[1] !== 100) c++;
    return c;
  }, [selectedArchetype, selectedIndustry, scoreRange]);

  const clearFilters = useCallback(() => {
    setSelectedArchetype(null);
    setSelectedIndustry(null);
    setScoreRange([0, 100]);
  }, []);

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Analytics</h1>
          <p className="text-muted-foreground mt-1">Aggregate assessment insights and reporting</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => handleExport("sessions")}
            disabled={exporting}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-muted text-foreground hover:bg-muted/200 border border-border disabled:opacity-50 transition-colors"
          >
            Export Assessments
          </button>
          <div className="flex items-center bg-muted border border-border rounded-xl p-1">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                  period === p.value
                    ? "bg-gradient-to-r from-purple-600 to-blue-600 text-foreground shadow-lg shadow-purple-500/20"
                    : "text-muted-foreground hover:text-foreground/90"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* View Tabs */}
      <div className="flex items-center gap-1 mb-6 border-b border-border/50 overflow-x-auto">
        {VIEW_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
              activeTab === tab.value
                ? "border-purple-500 text-foreground"
                : "border-transparent text-muted-foreground hover:text-muted-foreground"
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={tab.icon} />
            </svg>
            {tab.label}
          </button>
        ))}

        {/* Active filter indicator */}
        {activeFilterCount > 0 && (
          <div className="ml-auto flex items-center gap-2 px-3 shrink-0">
            <span className="text-[10px] text-purple-400">{activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""} active</span>
            <button onClick={clearFilters} className="text-[10px] text-muted-foreground/70 hover:text-muted-foreground underline">
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
          <p className="text-sm text-red-400">{error}</p>
          <button onClick={() => fetchAnalytics(period)} className="mt-2 text-xs text-red-300 underline">
            Retry
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-muted border border-border rounded-xl p-6 animate-pulse">
                <div className="h-3 w-24 bg-muted rounded mb-3" />
                <div className="h-8 w-16 bg-muted rounded" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[1, 2].map((i) => (
              <div key={i} className="bg-muted border border-border rounded-2xl p-6 h-48 animate-pulse" />
            ))}
          </div>
        </div>
      )}

      {/* Data views */}
      {!loading && data && (
        <>
          {/* ============================================================ */}
          {/* OVERVIEW TAB */}
          {/* ============================================================ */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              {/* KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard
                  label="Total Assessments"
                  value={data.kpi.total_assessments}
                  sub={`${data.kpi.completed_sessions} of ${data.kpi.total_sessions} completed`}
                />
                <KPICard
                  label="Avg Score"
                  value={data.kpi.avg_score || "\u2014"}
                />
                <KPICard
                  label="Completion Rate"
                  value={`${data.kpi.completion_rate}%`}
                />
                <KPICard
                  label="Avg Call Duration"
                  value={formatDuration(data.kpi.avg_call_duration)}
                />
              </div>

              {/* Timeline + Score Distribution */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-muted border border-border rounded-2xl p-6">
                  <h3 className="text-base font-semibold text-foreground mb-5">Assessments Over Time</h3>
                  <MiniTimeline data={data.assessments_over_time} />
                </div>
                <div className="bg-muted border border-border rounded-2xl p-6">
                  <h3 className="text-base font-semibold text-foreground mb-5">Score Distribution</h3>
                  {data.score_distribution.length === 0 ? (
                    <p className="text-sm text-muted-foreground/70">No data</p>
                  ) : (
                    <div className="flex items-end gap-2 h-32">
                      {data.score_distribution.map((item, i) => {
                        const max = Math.max(...data.score_distribution.map((d) => d.count), 1);
                        return (
                          <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                            <span className="text-xs text-muted-foreground mb-1">{item.count}</span>
                            <div className="w-full relative flex-1 flex items-end">
                              <div
                                className="w-full rounded-t-md bg-gradient-to-t from-blue-500 to-cyan-400 transition-all duration-700 hover:from-blue-400 hover:to-cyan-300"
                                style={{ height: `${Math.max((item.count / max) * 100, 3)}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-muted-foreground mt-2">{item.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Archetype + Industry quick view */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-muted border border-border rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="text-base font-semibold text-foreground">Archetype Distribution</h3>
                    <button onClick={() => setActiveTab("distribution")} className="text-[11px] text-purple-400/70 hover:text-purple-300">
                      View details &rarr;
                    </button>
                  </div>
                  {data.archetype_distribution.length === 0 ? (
                    <p className="text-sm text-muted-foreground/70">No data</p>
                  ) : (
                    <HBarChart
                      items={data.archetype_distribution.slice(0, 5).map((d) => ({ label: d.archetype, value: d.count }))}
                      maxValue={Math.max(...data.archetype_distribution.map((d) => d.count), 1)}
                    />
                  )}
                </div>
                <div className="bg-muted border border-border rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="text-base font-semibold text-foreground">Top Dimensions</h3>
                    <button onClick={() => setActiveTab("dimensions")} className="text-[11px] text-purple-400/70 hover:text-purple-300">
                      View all &rarr;
                    </button>
                  </div>
                  {data.dimension_averages.length === 0 ? (
                    <p className="text-sm text-muted-foreground/70">No data</p>
                  ) : (
                    <div className="space-y-3">
                      {[...data.dimension_averages].sort((a, b) => b.average - a.average).slice(0, 5).map((dim) => (
                        <div key={dim.dimension}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm text-foreground/80">{dim.label}</span>
                            <span className={`text-sm font-semibold ${getScoreTextColor(dim.average)}`}>{dim.average}</span>
                          </div>
                          <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-700 ${getScoreColor(dim.average)}`}
                              style={{ width: `${Math.max(dim.average, 1)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* DIMENSIONS TAB */}
          {/* ============================================================ */}
          {activeTab === "dimensions" && (
            <div className="space-y-6">
              {/* Sort controls */}
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">Sort by:</span>
                <button
                  onClick={() => { setDimSortBy("score"); setDimSortDir((d) => dimSortBy === "score" ? (d === "desc" ? "asc" : "desc") : "desc"); }}
                  className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${dimSortBy === "score" ? "bg-purple-500/20 border-purple-500/30 text-purple-300" : "border-border text-muted-foreground hover:text-muted-foreground"}`}
                >
                  Score {dimSortBy === "score" ? (dimSortDir === "desc" ? "\u2193" : "\u2191") : ""}
                </button>
                <button
                  onClick={() => { setDimSortBy("name"); setDimSortDir((d) => dimSortBy === "name" ? (d === "desc" ? "asc" : "desc") : "asc"); }}
                  className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${dimSortBy === "name" ? "bg-purple-500/20 border-purple-500/30 text-purple-300" : "border-border text-muted-foreground hover:text-muted-foreground"}`}
                >
                  Name {dimSortBy === "name" ? (dimSortDir === "desc" ? "\u2193" : "\u2191") : ""}
                </button>
                <div className="flex-1" />
                <span className="text-xs text-muted-foreground/70">{sortedDimensions.length} dimensions</span>
              </div>

              {/* Dimension cards — full width comparison */}
              <div className="bg-muted border border-border rounded-2xl p-6">
                <h3 className="text-base font-semibold text-foreground mb-6">All Scoring Dimensions</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
                  {sortedDimensions.map((dim) => (
                    <div key={dim.dimension} className="group">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm text-foreground/80 group-hover:text-foreground/90 transition-colors">{dim.label}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground/60">n={dim.count}</span>
                          <span className={`text-sm font-semibold ${getScoreTextColor(dim.average)}`}>
                            {dim.average}<span className="text-muted-foreground/50 font-normal text-xs">/100</span>
                          </span>
                        </div>
                      </div>
                      <div className="h-4 w-full bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${getScoreColor(dim.average)}`}
                          style={{ width: `${Math.max(dim.average, 1)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Dimension comparison — horizontal bar chart sorted by score */}
              <div className="bg-muted border border-border rounded-2xl p-6">
                <h3 className="text-base font-semibold text-foreground mb-5">Dimension Comparison</h3>
                <div className="space-y-2">
                  {[...data.dimension_averages].sort((a, b) => b.average - a.average).map((dim) => (
                    <div key={dim.dimension} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-40 truncate shrink-0">{dim.label}</span>
                      <div className="flex-1 h-6 bg-muted rounded-md overflow-hidden relative">
                        <div
                          className={`h-full rounded-md transition-all duration-700 ${getScoreColor(dim.average)}`}
                          style={{ width: `${Math.max(dim.average, 1)}%` }}
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-foreground/90">
                          {dim.average}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* DISTRIBUTION TAB */}
          {/* ============================================================ */}
          {activeTab === "distribution" && (
            <div className="space-y-6">
              {/* Filter bar */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs text-muted-foreground">Filter by archetype:</span>
                <button
                  onClick={() => setSelectedArchetype(null)}
                  className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                    !selectedArchetype ? "bg-purple-500/20 border-purple-500/30 text-purple-300" : "border-border text-muted-foreground hover:text-muted-foreground"
                  }`}
                >
                  All
                </button>
                {data.archetype_distribution.map((a) => (
                  <button
                    key={a.archetype}
                    onClick={() => setSelectedArchetype(selectedArchetype === a.archetype ? null : a.archetype)}
                    className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                      selectedArchetype === a.archetype
                        ? "bg-purple-500/20 border-purple-500/30 text-purple-300"
                        : "border-border text-muted-foreground hover:text-muted-foreground"
                    }`}
                  >
                    {a.archetype} ({a.count})
                  </button>
                ))}
              </div>

              {/* Score range filter */}
              <div className="flex items-center gap-4">
                <span className="text-xs text-muted-foreground">Score range:</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={scoreRange[0]}
                    onChange={(e) => setScoreRange([Number(e.target.value), scoreRange[1]])}
                    className="w-16 bg-muted border border-border rounded-lg px-2 py-1.5 text-xs text-foreground text-center focus:outline-none focus:border-border"
                  />
                  <span className="text-muted-foreground/50">to</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={scoreRange[1]}
                    onChange={(e) => setScoreRange([scoreRange[0], Number(e.target.value)])}
                    className="w-16 bg-muted border border-border rounded-lg px-2 py-1.5 text-xs text-foreground text-center focus:outline-none focus:border-border"
                  />
                </div>
                {(scoreRange[0] !== 0 || scoreRange[1] !== 100) && (
                  <button onClick={() => setScoreRange([0, 100])} className="text-[10px] text-muted-foreground/70 hover:text-muted-foreground underline">
                    Reset
                  </button>
                )}
              </div>

              {/* Archetype distribution — full cards */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-muted border border-border rounded-2xl p-6">
                  <h3 className="text-base font-semibold text-foreground mb-5">Archetype Distribution</h3>
                  {data.archetype_distribution.length === 0 ? (
                    <p className="text-sm text-muted-foreground/70">No data</p>
                  ) : (
                    <>
                      <HBarChart
                        items={data.archetype_distribution.map((d) => ({ label: d.archetype, value: d.count }))}
                        maxValue={Math.max(...data.archetype_distribution.map((d) => d.count), 1)}
                      />
                      {/* Donut-style percentages */}
                      <div className="mt-5 pt-4 border-t border-border/50">
                        <div className="flex flex-wrap gap-3">
                          {data.archetype_distribution.map((a) => {
                            const pct = data.kpi.total_assessments ? Math.round((a.count / data.kpi.total_assessments) * 100) : 0;
                            return (
                              <div
                                key={a.archetype}
                                className={`px-3 py-2 rounded-lg border transition-colors cursor-default ${
                                  selectedArchetype === a.archetype ? "bg-purple-500/15 border-purple-500/30" : "bg-muted/50 border-border/50"
                                }`}
                              >
                                <p className="text-lg font-bold text-foreground">{pct}%</p>
                                <p className="text-[10px] text-muted-foreground truncate max-w-20">{a.archetype}</p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}
                </div>
                <div className="bg-muted border border-border rounded-2xl p-6">
                  <h3 className="text-base font-semibold text-foreground mb-5">Score Distribution</h3>
                  {data.score_distribution.length === 0 ? (
                    <p className="text-sm text-muted-foreground/70">No data</p>
                  ) : (
                    <div className="flex items-end gap-3 h-48">
                      {data.score_distribution.map((item, i) => {
                        const max = Math.max(...data.score_distribution.map((d) => d.count), 1);
                        const isInRange =
                          parseInt(item.label.split("-")[0]) >= scoreRange[0] &&
                          parseInt(item.label.split("-")[1] || "100") <= scoreRange[1];
                        return (
                          <div key={i} className={`flex-1 flex flex-col items-center justify-end h-full transition-opacity ${isInRange ? "" : "opacity-30"}`}>
                            <span className="text-xs text-muted-foreground mb-1">{item.count}</span>
                            <div className="w-full relative flex-1 flex items-end">
                              <div
                                className="w-full rounded-t-lg bg-gradient-to-t from-blue-600 to-cyan-400 transition-all duration-700"
                                style={{ height: `${Math.max((item.count / max) * 100, 3)}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-muted-foreground mt-2">{item.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* TRENDS TAB */}
          {/* ============================================================ */}
          {activeTab === "trends" && (
            <div className="space-y-6">
              {/* Timeline — larger */}
              <div className="bg-muted border border-border rounded-2xl p-6">
                <h3 className="text-base font-semibold text-foreground mb-5">Assessment Volume Over Time</h3>
                {data.assessments_over_time.length === 0 ? (
                  <p className="text-sm text-muted-foreground/70">No timeline data for this period</p>
                ) : (
                  <>
                    <MiniTimeline data={data.assessments_over_time} />
                    {/* Summary stats */}
                    <div className="mt-5 pt-4 border-t border-border/50 grid grid-cols-3 gap-4">
                      <div>
                        <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wider">Total</p>
                        <p className="text-lg font-bold text-foreground">
                          {data.assessments_over_time.reduce((s, d) => s + d.count, 0)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wider">Peak Day</p>
                        <p className="text-lg font-bold text-foreground">
                          {Math.max(...data.assessments_over_time.map((d) => d.count))}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {data.assessments_over_time.reduce((max, d) => d.count > max.count ? d : max, data.assessments_over_time[0])?.date}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wider">Daily Avg</p>
                        <p className="text-lg font-bold text-foreground">
                          {data.assessments_over_time.length
                            ? (data.assessments_over_time.reduce((s, d) => s + d.count, 0) / data.assessments_over_time.length).toFixed(1)
                            : 0}
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* KPI summary cards — trend context */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard label="Sessions" value={data.kpi.total_sessions} sub={`${data.kpi.completed_sessions} completed`} />
                <KPICard label="Avg Score" value={data.kpi.avg_score || "\u2014"} />
                <KPICard label="Completion" value={`${data.kpi.completion_rate}%`} />
                <KPICard label="Avg Duration" value={formatDuration(data.kpi.avg_call_duration)} />
              </div>

              {/* Data table view */}
              {data.assessments_over_time.length > 0 && (
                <div className="bg-muted border border-border rounded-2xl p-6">
                  <h3 className="text-base font-semibold text-foreground mb-4">Daily Breakdown</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-2 px-3 text-muted-foreground font-medium text-xs">Date</th>
                          <th className="text-right py-2 px-3 text-muted-foreground font-medium text-xs">Assessments</th>
                          <th className="text-left py-2 px-3 text-muted-foreground font-medium text-xs w-1/2">Volume</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...data.assessments_over_time].reverse().slice(0, 20).map((d) => {
                          const max = Math.max(...data.assessments_over_time.map((x) => x.count), 1);
                          return (
                            <tr key={d.date} className="border-b border-border/50 hover:bg-muted/50">
                              <td className="py-2 px-3 text-foreground/80">{d.date}</td>
                              <td className="py-2 px-3 text-right text-muted-foreground">{d.count}</td>
                              <td className="py-2 px-3">
                                <div className="h-2 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-gradient-to-r from-purple-500 to-blue-500"
                                    style={{ width: `${(d.count / max) * 100}%` }}
                                  />
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ============================================================ */}
          {/* GAPS & INDUSTRY TAB */}
          {/* ============================================================ */}
          {activeTab === "gaps" && (
            <div className="space-y-6">
              {/* Industry filter */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs text-muted-foreground">Filter by company:</span>
                <button
                  onClick={() => setSelectedIndustry(null)}
                  className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                    !selectedIndustry ? "bg-blue-500/20 border-blue-500/30 text-blue-300" : "border-border text-muted-foreground hover:text-muted-foreground"
                  }`}
                >
                  All
                </button>
                {data.industry_breakdown.slice(0, 8).map((ind) => (
                  <button
                    key={ind.industry}
                    onClick={() => setSelectedIndustry(selectedIndustry === ind.industry ? null : ind.industry)}
                    className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                      selectedIndustry === ind.industry
                        ? "bg-blue-500/20 border-blue-500/30 text-blue-300"
                        : "border-border text-muted-foreground hover:text-muted-foreground"
                    }`}
                  >
                    {ind.industry} ({ind.count})
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-muted border border-border rounded-2xl p-6">
                  <h3 className="text-base font-semibold text-foreground mb-5">Top Gaps</h3>
                  <RankedList
                    items={data.top_gaps.slice(0, 15).map((g) => ({ name: g.gap, value: g.count }))}
                  />
                </div>
                <div className="bg-muted border border-border rounded-2xl p-6">
                  <h3 className="text-base font-semibold text-foreground mb-5">Company Breakdown</h3>
                  <RankedList
                    items={data.industry_breakdown.slice(0, 15).map((ind) => ({ name: ind.industry, value: ind.count }))}
                  />
                </div>
              </div>

              {/* Combined view — gaps + industry cross-reference */}
              <div className="bg-muted border border-border rounded-2xl p-6">
                <h3 className="text-base font-semibold text-foreground mb-2">Quick Insights</h3>
                <p className="text-xs text-muted-foreground mb-5">Summary metrics for the selected period</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="bg-muted/50 rounded-xl p-4 border border-border/50">
                    <p className="text-2xl font-bold text-foreground">{data.top_gaps.length}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">Unique Gaps</p>
                  </div>
                  <div className="bg-muted/50 rounded-xl p-4 border border-border/50">
                    <p className="text-2xl font-bold text-foreground">{data.industry_breakdown.length}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">Companies</p>
                  </div>
                  <div className="bg-muted/50 rounded-xl p-4 border border-border/50">
                    <p className="text-2xl font-bold text-foreground">{data.archetype_distribution.length}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">Archetypes</p>
                  </div>
                  <div className="bg-muted/50 rounded-xl p-4 border border-border/50">
                    <p className="text-2xl font-bold text-foreground">{data.dimension_averages.length}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">Dimensions</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
