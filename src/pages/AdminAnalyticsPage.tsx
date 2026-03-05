import { useEffect, useState, useCallback } from "react";

interface KPI { total_assessments: number; avg_score: number; completion_rate: number; avg_call_duration: number; total_sessions: number; completed_sessions: number; }
interface DimensionAverage { dimension: string; label: string; average: number; count: number; }
interface AnalyticsData {
  period: string; kpi: KPI;
  assessments_over_time: { date: string; count: number }[];
  dimension_averages: DimensionAverage[];
  archetype_distribution: { archetype: string; count: number }[];
  score_distribution: { label: string; count: number }[];
  top_gaps: { gap: string; count: number }[];
  industry_breakdown: { industry: string; count: number }[];
}

type Period = "7d" | "30d" | "90d" | "all";
const PERIODS: { value: Period; label: string }[] = [{ value: "7d", label: "7 Days" }, { value: "30d", label: "30 Days" }, { value: "90d", label: "90 Days" }, { value: "all", label: "All Time" }];

function formatDuration(seconds: number) { if (!seconds) return "0:00"; return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")}`; }
function getScoreColor(score: number) { if (score >= 70) return "bg-gradient-to-r from-green-500 to-emerald-400"; if (score >= 50) return "bg-gradient-to-r from-purple-600 to-blue-500"; if (score >= 30) return "bg-gradient-to-r from-yellow-500 to-orange-400"; return "bg-gradient-to-r from-red-500 to-pink-500"; }

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

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("30d");
  const [exporting, setExporting] = useState(false);

  const fetchAnalytics = useCallback(async (p: Period) => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/admin/analytics?period=${p}`, { credentials: "include" });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      setData(await res.json());
    } catch (err) { setError(err instanceof Error ? err.message : "Unknown error"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAnalytics(period); }, [period, fetchAnalytics]);

  const handleExport = async (type: "sessions" | "profiles") => {
    setExporting(true);
    try { await downloadCsv(`/api/admin/export?type=${type}&period=${period}`, `${type}-export.csv`); }
    catch (err) { console.error("Export failed:", err); }
    finally { setExporting(false); }
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Analytics</h1>
          <p className="text-white/40 mt-1">Aggregate assessment insights and reporting</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => handleExport("sessions")} disabled={exporting} className="px-4 py-2 text-sm font-medium rounded-lg bg-white/10 text-white hover:bg-white/20 border border-white/10 disabled:opacity-50 transition-colors">Export Assessments</button>
          <div className="flex items-center bg-white/5 border border-white/10 rounded-xl p-1">
            {PERIODS.map((p) => (
              <button key={p.value} onClick={() => setPeriod(p.value)} className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${period === p.value ? "bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg shadow-purple-500/20" : "text-white/50 hover:text-white/80"}`}>{p.label}</button>
            ))}
          </div>
        </div>
      </div>

      {error && <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl"><p className="text-sm text-red-400">{error}</p><button onClick={() => fetchAnalytics(period)} className="mt-2 text-xs text-red-300 underline">Retry</button></div>}

      {loading && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{[1,2,3,4].map((i) => <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-6 animate-pulse"><div className="h-3 w-24 bg-white/10 rounded mb-3" /><div className="h-8 w-16 bg-white/10 rounded" /></div>)}</div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">{[1,2].map((i) => <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-6 h-48 animate-pulse" />)}</div>
        </div>
      )}

      {!loading && data && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white/5 border border-white/10 rounded-xl p-6"><p className="text-sm text-white/50">Total Assessments</p><p className="text-3xl font-bold text-white mt-1">{data.kpi.total_assessments}</p><p className="text-xs text-white/40 mt-2">{data.kpi.completed_sessions} of {data.kpi.total_sessions} completed</p></div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-6"><p className="text-sm text-white/50">Avg Score</p><p className="text-3xl font-bold text-white mt-1">{data.kpi.avg_score || "\u2014"}</p></div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-6"><p className="text-sm text-white/50">Completion Rate</p><p className="text-3xl font-bold text-white mt-1">{data.kpi.completion_rate}%</p></div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-6"><p className="text-sm text-white/50">Avg Call Duration</p><p className="text-3xl font-bold text-white mt-1">{formatDuration(data.kpi.avg_call_duration)}</p></div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Archetype Distribution */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
              <h3 className="text-base font-semibold text-white mb-5">Archetype Distribution</h3>
              {data.archetype_distribution.length === 0 ? <p className="text-sm text-white/30">No data</p> : (
                <div className="space-y-3">
                  {data.archetype_distribution.map((item, i) => {
                    const max = Math.max(...data.archetype_distribution.map((d) => d.count), 1);
                    return (
                      <div key={i}>
                        <div className="flex items-center justify-between mb-1"><span className="text-sm text-white/70 truncate">{item.archetype}</span><span className="text-sm font-medium text-white/50">{item.count}</span></div>
                        <div className="h-5 w-full bg-white/5 rounded-md overflow-hidden"><div className="h-full rounded-md bg-gradient-to-r from-purple-600 to-blue-500 transition-all duration-700" style={{ width: `${Math.max((item.count / max) * 100, 2)}%` }} /></div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {/* Score Distribution */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
              <h3 className="text-base font-semibold text-white mb-5">Score Distribution</h3>
              {data.score_distribution.length === 0 ? <p className="text-sm text-white/30">No data</p> : (
                <div className="flex items-end gap-2 h-48">
                  {data.score_distribution.map((item, i) => {
                    const max = Math.max(...data.score_distribution.map((d) => d.count), 1);
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                        <span className="text-xs text-white/50 mb-1">{item.count}</span>
                        <div className="w-full relative flex-1 flex items-end"><div className="w-full rounded-t-md bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-700" style={{ height: `${Math.max((item.count / max) * 100, 3)}%` }} /></div>
                        <span className="text-[10px] text-white/40 mt-2">{item.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Dimension Averages */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <h3 className="text-base font-semibold text-white mb-5">Dimension Averages</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
              {data.dimension_averages.map((dim) => (
                <div key={dim.dimension}>
                  <div className="flex items-center justify-between mb-1.5"><span className="text-sm text-white/70">{dim.label}</span><span className="text-sm font-semibold text-white">{dim.average}<span className="text-white/30 font-normal">/100</span></span></div>
                  <div className="h-3 w-full bg-white/5 rounded-full overflow-hidden"><div className={`h-full rounded-full transition-all duration-700 ${getScoreColor(dim.average)}`} style={{ width: `${Math.max(dim.average, 1)}%` }} /></div>
                </div>
              ))}
            </div>
          </div>

          {/* Gaps + Industry */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
              <h3 className="text-base font-semibold text-white mb-5">Top Gaps</h3>
              {data.top_gaps.length === 0 ? <p className="text-sm text-white/30">No gaps identified</p> : (
                <div className="space-y-3">{data.top_gaps.slice(0, 10).map((item, i) => {
                  const max = Math.max(...data.top_gaps.map((d) => d.count), 1);
                  return (<div key={i} className="flex items-center gap-3"><span className="text-xs text-white/30 w-5 text-right">{i+1}</span><div className="flex-1"><div className="flex justify-between mb-1"><span className="text-sm text-white/70 truncate">{item.gap}</span><span className="text-xs text-white/40">{item.count}</span></div><div className="h-1.5 bg-white/5 rounded-full overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400" style={{ width: `${Math.max((item.count / max) * 100, 2)}%` }} /></div></div></div>);
                })}</div>
              )}
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
              <h3 className="text-base font-semibold text-white mb-5">Industry Breakdown</h3>
              {data.industry_breakdown.length === 0 ? <p className="text-sm text-white/30">No data</p> : (
                <div className="space-y-3">{data.industry_breakdown.slice(0, 10).map((item, i) => {
                  const max = Math.max(...data.industry_breakdown.map((d) => d.count), 1);
                  return (<div key={i} className="flex items-center gap-3"><span className="text-xs text-white/30 w-5 text-right">{i+1}</span><div className="flex-1"><div className="flex justify-between mb-1"><span className="text-sm text-white/70 truncate">{item.industry}</span><span className="text-xs text-white/40">{item.count}</span></div><div className="h-1.5 bg-white/5 rounded-full overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400" style={{ width: `${Math.max((item.count / max) * 100, 2)}%` }} /></div></div></div>);
                })}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
