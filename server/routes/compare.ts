// ============================================================
// Compare Routes — Session comparison for longitudinal tracking
// ============================================================

import { Router } from "express";
import { getSupabase } from "../supabase.js";

const router = Router();

// GET /api/sessions/compare?email=xxx&company=xxx&limit=10
router.get("/", async (req, res) => {
  try {
    const email = req.query.email as string | undefined;
    const company = req.query.company as string | undefined;
    const limit = Math.min(parseInt((req.query.limit as string) || "10"), 50);

    if (!email && !company) { res.status(400).json({ error: "email or company query parameter is required" }); return; }

    // participant is JSONB — use ->> for text extraction
    let query = getSupabase()
      .from("cascade_sessions")
      .select("*")
      .eq("status", "analyzed")
      .order("created_at", { ascending: true })
      .limit(limit);

    if (email) query = query.eq("participant->>email" as string, email);
    else if (company) query = query.eq("participant->>company" as string, company);

    const { data: rows, error } = await query;
    if (error) throw error;

    const sessionIds = (rows || []).map((r: Record<string, unknown>) => r.id as string);
    let analyses: Record<string, unknown>[] = [];
    if (sessionIds.length > 0) {
      const { data: aData } = await getSupabase()
        .from("cascade_analyses")
        .select("*")
        .in("session_id", sessionIds);
      analyses = aData || [];
    }

    const analysisMap = new Map(analyses.map((a: Record<string, unknown>) => [a.session_id, a]));

    const sessions = (rows || []).map((row: Record<string, unknown>) => {
      const analysis = analysisMap.get(row.id) as Record<string, unknown> | undefined;
      const participant = (row.participant || {}) as Record<string, string>;

      const dimensionScores: Record<string, number> = {};
      if (analysis?.dimension_scores) {
        const dims = analysis.dimension_scores as Record<string, number> | Array<{ dimension: string; score: number }>;
        if (Array.isArray(dims)) {
          dims.forEach((ds) => { dimensionScores[ds.dimension] = ds.score; });
        } else {
          Object.assign(dimensionScores, dims);
        }
      }

      const gaps = ((analysis?.gaps as Array<{ pattern: string; severity: number; description: string }>) || []).map((g) => ({
        pattern: g.pattern,
        severity: g.severity,
        description: g.description,
      }));

      return {
        sessionId: row.id,
        participantName: participant.name || "",
        participantCompany: participant.company || "",
        participantEmail: participant.email || null,
        participantRole: participant.role || "",
        createdAt: row.created_at,
        overallScore: (analysis?.overall_readiness_score as number) ?? null,
        archetype: (analysis?.archetype as string) ?? null,
        archetypeDescription: (analysis?.archetype_description as string) ?? null,
        dimensionScores,
        gaps,
        redFlagCount: ((analysis?.red_flags as unknown[]) || []).length,
        greenLightCount: ((analysis?.green_lights as unknown[]) || []).length,
      };
    });

    res.json({
      sessions,
      count: sessions.length,
      lookupKey: email ? "email" : "company",
      lookupValue: email || company,
    });
  } catch (err) {
    console.error("[compare] error:", err);
    res.status(500).json({ error: "Failed to load comparison data" });
  }
});

export default router;
