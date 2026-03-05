// ============================================================
// Search Routes — Cross-entity search across sessions, contacts, calls
// ============================================================

import { Router } from "express";
import { getSupabase } from "../supabase.js";

const router = Router();

// GET /api/admin/search?q=term&type=all|sessions|contacts|calls&page=1&limit=20
router.get("/", async (req, res) => {
  try {
    const { q, type = "all", page = "1", limit = "20" } = req.query as Record<string, string>;
    if (!q?.trim()) { res.json({ sessions: { results: [], total: 0 }, contacts: { results: [], total: 0 }, calls: { results: [], total: 0 }, query: "" }); return; }

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, parseInt(limit) || 20);
    const offset = (pageNum - 1) * limitNum;
    const searchTerm = q.trim();

    const results: Record<string, { results: unknown[]; total: number }> = {
      sessions: { results: [], total: 0 },
      contacts: { results: [], total: 0 },
      calls: { results: [], total: 0 },
    };

    // Search sessions — participant is JSONB, use raw SQL via RPC or filter in-app
    if (type === "all" || type === "sessions") {
      // Supabase JS doesn't support JSONB ilike directly, so fetch recent and filter
      const { data } = await getSupabase()
        .from("cascade_sessions")
        .select("id, participant, status, created_at")
        .order("created_at", { ascending: false })
        .limit(200);

      const term = searchTerm.toLowerCase();
      const filtered = (data || []).filter((s: Record<string, unknown>) => {
        const p = (s.participant || {}) as Record<string, string>;
        return (p.name || "").toLowerCase().includes(term) ||
               (p.company || "").toLowerCase().includes(term) ||
               (p.email || "").toLowerCase().includes(term);
      });

      const paged = filtered.slice(offset, offset + limitNum);
      const sessionIds = paged.map((s: Record<string, unknown>) => s.id as string);

      let analyses: Record<string, unknown>[] = [];
      if (sessionIds.length > 0) {
        const { data: aData } = await getSupabase()
          .from("cascade_analyses")
          .select("session_id, overall_readiness_score, archetype")
          .in("session_id", sessionIds);
        analyses = aData || [];
      }

      const analysisMap = new Map(analyses.map((a: Record<string, unknown>) => [a.session_id, a]));
      results.sessions = {
        results: paged.map((s: Record<string, unknown>) => {
          const p = (s.participant || {}) as Record<string, string>;
          const a = analysisMap.get(s.id) as Record<string, unknown> | undefined;
          return {
            id: s.id,
            participant_name: p.name || "",
            participant_company: p.company || "",
            participant_email: p.email || "",
            status: s.status,
            created_at: s.created_at,
            overall_score: a?.overall_readiness_score ?? null,
            archetype: a?.archetype ?? null,
          };
        }),
        total: filtered.length,
      };
    }

    // Search contacts
    if (type === "all" || type === "contacts") {
      const { data, count } = await getSupabase()
        .from("cascade_contacts")
        .select("*", { count: "exact" })
        .or(`name.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,company.ilike.%${searchTerm}%`)
        .order("created_at", { ascending: false })
        .range(offset, offset + limitNum - 1);

      results.contacts = { results: data || [], total: count || 0 };
    }

    // Search calls
    if (type === "all" || type === "calls") {
      const { data, count } = await getSupabase()
        .from("cascade_calls")
        .select("id, status, duration_seconds, created_at, contact_id", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + limitNum - 1);

      const contactIds = [...new Set((data || []).map((c: Record<string, unknown>) => c.contact_id).filter(Boolean))] as string[];
      let contactMap = new Map<string, Record<string, unknown>>();
      if (contactIds.length > 0) {
        const { data: cData } = await getSupabase()
          .from("cascade_contacts")
          .select("id, name, company")
          .in("id", contactIds);
        contactMap = new Map((cData || []).map((c: Record<string, unknown>) => [c.id as string, c]));
      }

      results.calls = {
        results: (data || []).map((c: Record<string, unknown>) => {
          const contact = contactMap.get(c.contact_id as string);
          return { ...c, contact_name: (contact?.name as string) || null, contact_company: (contact?.company as string) || null };
        }),
        total: count || 0,
      };
    }

    res.json({ ...results, query: q });
  } catch (err) {
    console.error("[search] error:", err);
    res.status(500).json({ error: "Search failed" });
  }
});

export default router;
