// ============================================================
// Analytics Routes — Aggregate assessment insights
// ============================================================

import { Router } from "express";
import { getSupabase } from "../supabase.js";

const router = Router();

function periodToDate(period: string): string | null {
  const now = new Date();
  if (period === "7d") { now.setDate(now.getDate() - 7); return now.toISOString(); }
  if (period === "30d") { now.setDate(now.getDate() - 30); return now.toISOString(); }
  if (period === "90d") { now.setDate(now.getDate() - 90); return now.toISOString(); }
  return null; // "all"
}

// GET /api/admin/analytics?period=30d
router.get("/", async (req, res) => {
  try {
    const period = (req.query.period as string) || "30d";
    const since = periodToDate(period);

    // Fetch sessions
    let sessionQuery = getSupabase()
      .from("cascade_sessions")
      .select("id, status, created_at, participant");
    if (since) sessionQuery = sessionQuery.gte("created_at", since);
    const { data: sessions } = await sessionQuery;

    const allSessions = sessions || [];
    const completedSessions = allSessions.filter((s: Record<string, unknown>) => s.status === "analyzed" || s.status === "completed");
    const sessionIds = completedSessions.map((s: Record<string, unknown>) => s.id as string);

    // Fetch analyses
    let analyses: Record<string, unknown>[] = [];
    if (sessionIds.length > 0) {
      const { data: aData } = await getSupabase()
        .from("cascade_analyses")
        .select("*")
        .in("session_id", sessionIds);
      analyses = aData || [];
    }

    // KPIs
    const scores = analyses.map((a: Record<string, unknown>) => a.overall_readiness_score as number).filter(Boolean);
    const avgScore = scores.length ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : 0;
    const completionRate = allSessions.length ? Math.round((completedSessions.length / allSessions.length) * 100) : 0;

    // Fetch call durations
    let callQuery = getSupabase()
      .from("cascade_calls")
      .select("duration_seconds")
      .eq("status", "completed");
    if (since) callQuery = callQuery.gte("created_at", since);
    const { data: calls } = await callQuery;
    const durations = (calls || []).map((c: Record<string, unknown>) => c.duration_seconds as number).filter(Boolean);
    const avgDuration = durations.length ? Math.round(durations.reduce((s, v) => s + v, 0) / durations.length) : 0;

    // Assessments over time (group by date)
    const dateCounts: Record<string, number> = {};
    allSessions.forEach((s: Record<string, unknown>) => {
      const date = (s.created_at as string).slice(0, 10);
      dateCounts[date] = (dateCounts[date] || 0) + 1;
    });
    const assessments_over_time = Object.entries(dateCounts).sort().map(([date, count]) => ({ date, count }));

    // Dimension averages
    const dimTotals: Record<string, { sum: number; count: number }> = {};
    analyses.forEach((a: Record<string, unknown>) => {
      const dims = a.dimension_scores as Array<{ dimension: string; score: number }> | Record<string, number> | null;
      if (Array.isArray(dims)) {
        dims.forEach((ds) => {
          if (!dimTotals[ds.dimension]) dimTotals[ds.dimension] = { sum: 0, count: 0 };
          dimTotals[ds.dimension].sum += ds.score;
          dimTotals[ds.dimension].count++;
        });
      } else if (dims && typeof dims === "object") {
        Object.entries(dims).forEach(([dim, score]) => {
          if (!dimTotals[dim]) dimTotals[dim] = { sum: 0, count: 0 };
          dimTotals[dim].sum += score as number;
          dimTotals[dim].count++;
        });
      }
    });
    const dimension_averages = Object.entries(dimTotals).map(([dimension, { sum, count }]) => ({
      dimension,
      label: dimension.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      average: Math.round(sum / count),
      count,
    }));

    // Archetype distribution
    const archetypeCounts: Record<string, number> = {};
    analyses.forEach((a: Record<string, unknown>) => {
      const arch = (a.archetype as string) || "Unknown";
      archetypeCounts[arch] = (archetypeCounts[arch] || 0) + 1;
    });
    const archetype_distribution = Object.entries(archetypeCounts).map(([archetype, count]) => ({ archetype, count })).sort((a, b) => b.count - a.count);

    // Score distribution (buckets)
    const buckets = [
      { label: "0-20", min: 0, max: 20 },
      { label: "21-40", min: 21, max: 40 },
      { label: "41-60", min: 41, max: 60 },
      { label: "61-80", min: 61, max: 80 },
      { label: "81-100", min: 81, max: 100 },
    ];
    const score_distribution = buckets.map(({ label, min, max }) => ({
      label,
      count: scores.filter((s) => s >= min && s <= max).length,
    }));

    // Top gaps
    const gapCounts: Record<string, number> = {};
    analyses.forEach((a: Record<string, unknown>) => {
      const gaps = a.gaps as Array<{ pattern: string }> | null;
      if (gaps) gaps.forEach((g) => { gapCounts[g.pattern] = (gapCounts[g.pattern] || 0) + 1; });
    });
    const top_gaps = Object.entries(gapCounts).map(([gap, count]) => ({ gap, count })).sort((a, b) => b.count - a.count);

    // Industry breakdown
    const industryCounts: Record<string, number> = {};
    allSessions.forEach((s: Record<string, unknown>) => {
      const p = (s.participant || {}) as Record<string, string>;
      const co = p.company || "Unknown";
      industryCounts[co] = (industryCounts[co] || 0) + 1;
    });
    const industry_breakdown = Object.entries(industryCounts).map(([industry, count]) => ({ industry, count })).sort((a, b) => b.count - a.count);

    res.json({
      period,
      kpi: {
        total_assessments: analyses.length,
        avg_score: avgScore,
        completion_rate: completionRate,
        avg_call_duration: avgDuration,
        total_sessions: allSessions.length,
        completed_sessions: completedSessions.length,
      },
      assessments_over_time,
      dimension_averages,
      archetype_distribution,
      score_distribution,
      top_gaps,
      industry_breakdown,
    });
  } catch (err) {
    console.error("[analytics] error:", err);
    res.status(500).json({ error: "Failed to load analytics" });
  }
});

export default router;
