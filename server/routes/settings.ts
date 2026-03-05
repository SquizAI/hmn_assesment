// ============================================================
// Settings Routes — Data retention and system preferences
// ============================================================

import { Router } from "express";
import { getSupabase } from "../supabase.js";

const router = Router();

const SETTINGS_KEY = "retention";

// GET retention settings
router.get("/retention", async (_req, res) => {
  try {
    const { data } = await getSupabase()
      .from("cascade_settings")
      .select("*")
      .eq("key", SETTINGS_KEY)
      .single();

    if (data?.value) {
      res.json(data.value);
    } else {
      res.json({ retention_days: null, auto_cleanup: false, last_cleanup_at: null });
    }
  } catch {
    res.json({ retention_days: null, auto_cleanup: false, last_cleanup_at: null });
  }
});

// PUT retention settings
router.put("/retention", async (req, res) => {
  try {
    const { retention_days, auto_cleanup } = req.body;
    const value = { retention_days, auto_cleanup, last_cleanup_at: null as string | null };

    // Try to get existing to preserve last_cleanup_at
    const { data: existing } = await getSupabase()
      .from("cascade_settings")
      .select("value")
      .eq("key", SETTINGS_KEY)
      .single();

    if (existing?.value?.last_cleanup_at) {
      value.last_cleanup_at = existing.value.last_cleanup_at;
    }

    const { error } = await getSupabase()
      .from("cascade_settings")
      .upsert({ key: SETTINGS_KEY, value, updated_at: new Date().toISOString() }, { onConflict: "key" });

    if (error) throw error;
    res.json(value);
  } catch (err) {
    console.error("[settings] save error:", err);
    res.status(500).json({ error: "Failed to save settings" });
  }
});

// GET retention preview — how many sessions would be deleted
router.get("/retention/preview", async (req, res) => {
  try {
    const days = parseInt(req.query.days as string);
    if (!days || days <= 0) { res.json({ count: 0, oldest: null }); return; }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const { data, count } = await getSupabase()
      .from("cascade_sessions")
      .select("created_at", { count: "exact" })
      .lt("created_at", cutoff.toISOString())
      .order("created_at", { ascending: true })
      .limit(1);

    res.json({ count: count || 0, oldest: data?.[0]?.created_at || null });
  } catch (err) {
    console.error("[settings] preview error:", err);
    res.status(500).json({ error: "Failed to preview" });
  }
});

export default router;
