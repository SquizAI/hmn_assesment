// ============================================================
// Campaign Routes — CRUD + scheduling for outreach campaigns
// ============================================================

import { Router } from "express";
import { getSupabase } from "../supabase.js";
import crypto from "crypto";

const router = Router();

// List all campaigns
router.get("/", async (_req, res) => {
  try {
    const { data, error } = await getSupabase()
      .from("cascade_campaigns")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json({ campaigns: data || [] });
  } catch (err) {
    console.error("[campaigns] list error:", err);
    res.status(500).json({ error: "Failed to list campaigns" });
  }
});

// Get campaign by ID with contacts
router.get("/:id", async (req, res) => {
  try {
    const { data: campaign, error } = await getSupabase()
      .from("cascade_campaigns")
      .select("*")
      .eq("id", req.params.id)
      .single();

    if (error || !campaign) { res.status(404).json({ error: "Campaign not found" }); return; }

    // Get contacts for this campaign
    const { data: contacts } = await getSupabase()
      .from("cascade_contacts")
      .select("*")
      .eq("campaign_id", req.params.id)
      .order("created_at", { ascending: false });

    res.json({ campaign, contacts: contacts || [] });
  } catch (err) {
    console.error("[campaigns] get error:", err);
    res.status(500).json({ error: "Failed to get campaign" });
  }
});

// Get campaign results (profile aggregation)
router.get("/:id/results", async (req, res) => {
  try {
    const { data: profiles, error } = await getSupabase()
      .from("cascade_profiles")
      .select("id, session_id, overall_score, archetype, gaps, assessment_type, participant_name, participant_company, created_at")
      .eq("campaign_id", req.params.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const allProfiles = profiles || [];
    const scores = allProfiles
      .map((p: Record<string, unknown>) => p.overall_score as number)
      .filter((s): s is number => s !== null && s !== undefined);
    const avg_score = scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : null;

    // Archetype breakdown
    const archCounts: Record<string, number> = {};
    allProfiles.forEach((p: Record<string, unknown>) => {
      const arch = (p.archetype as string) || "Unknown";
      archCounts[arch] = (archCounts[arch] || 0) + 1;
    });
    const archetype_breakdown = Object.entries(archCounts)
      .map(([archetype, count]) => ({ archetype, count }))
      .sort((a, b) => b.count - a.count);

    // Gap frequencies
    const gapCounts: Record<string, number> = {};
    allProfiles.forEach((p: Record<string, unknown>) => {
      const gaps = p.gaps as Array<{ pattern?: string; gap?: string; title?: string }> | null;
      if (Array.isArray(gaps)) {
        gaps.forEach((g) => {
          const label = g.pattern || g.gap || g.title || "Unknown";
          gapCounts[label] = (gapCounts[label] || 0) + 1;
        });
      }
    });
    const gap_frequencies = Object.entries(gapCounts)
      .map(([gap, count]) => ({ gap, count }))
      .sort((a, b) => b.count - a.count);

    res.json({
      profile_count: allProfiles.length,
      avg_score,
      archetype_breakdown,
      gap_frequencies,
      profiles: allProfiles,
    });
  } catch (err) {
    console.error("[campaigns] results error:", err);
    res.status(500).json({ error: "Failed to load campaign results" });
  }
});

// Create campaign
router.post("/", async (req, res) => {
  try {
    const { name, description, assessment_id, schedule } = req.body;
    if (!name) { res.status(400).json({ error: "name is required" }); return; }

    const id = crypto.randomUUID();
    const row = {
      id,
      name,
      description: description || null,
      assessment_id: assessment_id || null,
      status: "draft",
      schedule: schedule || null,
      stats: { total_contacts: 0, calls_made: 0, calls_completed: 0, calls_failed: 0, avg_duration: 0 },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error } = await getSupabase().from("cascade_campaigns").insert(row);
    if (error) throw error;

    res.json({ campaign: row });
  } catch (err) {
    console.error("[campaigns] create error:", err);
    res.status(500).json({ error: "Failed to create campaign" });
  }
});

// Update campaign
router.patch("/:id", async (req, res) => {
  try {
    const updates = { ...req.body, updated_at: new Date().toISOString() };
    delete updates.id;
    delete updates.created_at;

    const { data, error } = await getSupabase()
      .from("cascade_campaigns")
      .update(updates)
      .eq("id", req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ campaign: data });
  } catch (err) {
    console.error("[campaigns] update error:", err);
    res.status(500).json({ error: "Failed to update campaign" });
  }
});

// Delete campaign
router.delete("/:id", async (req, res) => {
  try {
    const { error } = await getSupabase()
      .from("cascade_campaigns")
      .delete()
      .eq("id", req.params.id);

    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error("[campaigns] delete error:", err);
    res.status(500).json({ error: "Failed to delete campaign" });
  }
});

// Start campaign
router.post("/:id/start", async (req, res) => {
  try {
    const { data, error } = await getSupabase()
      .from("cascade_campaigns")
      .update({ status: "active", started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ campaign: data });
  } catch (err) {
    console.error("[campaigns] start error:", err);
    res.status(500).json({ error: "Failed to start campaign" });
  }
});

// Pause campaign
router.post("/:id/pause", async (req, res) => {
  try {
    const { data, error } = await getSupabase()
      .from("cascade_campaigns")
      .update({ status: "paused", updated_at: new Date().toISOString() })
      .eq("id", req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ campaign: data });
  } catch (err) {
    console.error("[campaigns] pause error:", err);
    res.status(500).json({ error: "Failed to pause campaign" });
  }
});

export default router;
