// ============================================================
// Cleanup Routes — Manual and cron-triggered data cleanup
// ============================================================

import { Router } from "express";
import { getSupabase } from "../supabase.js";

const router = Router();

// POST /api/admin/cron/cleanup — Run data cleanup based on retention settings
router.post("/cleanup", async (_req, res) => {
  try {
    // Get retention settings
    const { data: settingsRow } = await getSupabase()
      .from("cascade_settings")
      .select("value")
      .eq("key", "retention")
      .single();

    const settings = settingsRow?.value;
    if (!settings?.retention_days || settings.retention_days <= 0) {
      res.json({ deleted: 0, message: "No retention policy configured" });
      return;
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - settings.retention_days);

    // Find sessions to delete
    const { data: oldSessions } = await getSupabase()
      .from("cascade_sessions")
      .select("id")
      .lt("created_at", cutoff.toISOString());

    const ids = (oldSessions || []).map((s: Record<string, unknown>) => s.id as string);

    if (ids.length === 0) {
      res.json({ deleted: 0, message: "No sessions to clean up" });
      return;
    }

    // Delete related data first
    await getSupabase().from("cascade_responses").delete().in("session_id", ids);
    await getSupabase().from("cascade_conversation_history").delete().in("session_id", ids);
    await getSupabase().from("cascade_analyses").delete().in("session_id", ids);
    await getSupabase().from("cascade_sessions").delete().in("id", ids);

    // Clean up expired resume tokens
    const { count: expiredTokens } = await getSupabase()
      .from("cascade_resume_tokens")
      .delete({ count: "exact" })
      .lt("expires_at", new Date().toISOString());

    // Update last_cleanup_at
    await getSupabase()
      .from("cascade_settings")
      .update({ value: { ...settings, last_cleanup_at: new Date().toISOString() }, updated_at: new Date().toISOString() })
      .eq("key", "retention");

    res.json({ deleted: ids.length, expiredTokensCleaned: expiredTokens || 0 });
  } catch (err) {
    console.error("[cleanup] error:", err);
    res.status(500).json({ error: "Cleanup failed" });
  }
});

export default router;
