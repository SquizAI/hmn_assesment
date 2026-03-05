// ============================================================
// Call History Routes — List and filter calls
// ============================================================

import { Router } from "express";
import { getSupabase } from "../supabase.js";

const router = Router();

// List calls with filter/pagination
router.get("/", async (req, res) => {
  try {
    const { status, page = "1", limit = "50" } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, parseInt(limit) || 50);
    const offset = (pageNum - 1) * limitNum;

    let query = getSupabase()
      .from("cascade_calls")
      .select("*, contact:cascade_contacts(id, name, phone, company)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limitNum - 1);

    if (status) query = query.eq("status", status);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({ calls: data || [], total: count || 0, page: pageNum, limit: limitNum });
  } catch (err) {
    console.error("[calls] list error:", err);
    res.status(500).json({ error: "Failed to list calls" });
  }
});

// Get single call detail
router.get("/:id", async (req, res) => {
  try {
    const { data, error } = await getSupabase()
      .from("cascade_calls")
      .select("*, contact:cascade_contacts(id, name, phone, company)")
      .eq("id", req.params.id)
      .single();

    if (error || !data) { res.status(404).json({ error: "Call not found" }); return; }
    res.json({ call: data });
  } catch (err) {
    console.error("[calls] get error:", err);
    res.status(500).json({ error: "Failed to get call" });
  }
});

export default router;
