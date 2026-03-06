// ============================================================
// Webhook Routes — CRUD + test for webhook integrations
// ============================================================

import { Router } from "express";
import { getSupabase } from "../supabase.js";
import crypto from "crypto";

const router = Router();

// List webhooks
router.get("/", async (_req, res) => {
  try {
    const { data, error } = await getSupabase()
      .from("cascade_webhooks")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json({ webhooks: data || [] });
  } catch (err) {
    console.error("[webhooks] list error:", err);
    res.status(500).json({ error: "Failed to list webhooks" });
  }
});

// Create webhook
router.post("/", async (req, res) => {
  try {
    const { url, campaign_id, events, secret, is_active } = req.body;
    if (!url || !events?.length) { res.status(400).json({ error: "url and events are required" }); return; }
    // Validate URL format
    try { const u = new URL(url); if (!["http:", "https:"].includes(u.protocol)) throw new Error(); }
    catch { res.status(400).json({ error: "url must be a valid http/https URL" }); return; }
    if (!Array.isArray(events)) { res.status(400).json({ error: "events must be an array" }); return; }

    const id = crypto.randomUUID();
    const row = {
      id,
      url,
      campaign_id: campaign_id || null,
      events,
      secret: secret || null,
      is_active: is_active !== false,
      created_at: new Date().toISOString(),
    };

    const { error } = await getSupabase().from("cascade_webhooks").insert(row);
    if (error) throw error;

    res.json({ webhook: row });
  } catch (err) {
    console.error("[webhooks] create error:", err);
    res.status(500).json({ error: "Failed to create webhook" });
  }
});

// Update webhook
router.patch("/:id", async (req, res) => {
  try {
    const updates = { ...req.body };
    delete updates.id;
    delete updates.created_at;

    const { data, error } = await getSupabase()
      .from("cascade_webhooks")
      .update(updates)
      .eq("id", req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ webhook: data });
  } catch (err) {
    console.error("[webhooks] update error:", err);
    res.status(500).json({ error: "Failed to update webhook" });
  }
});

// Delete webhook
router.delete("/:id", async (req, res) => {
  try {
    const { error } = await getSupabase()
      .from("cascade_webhooks")
      .delete()
      .eq("id", req.params.id);

    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error("[webhooks] delete error:", err);
    res.status(500).json({ error: "Failed to delete webhook" });
  }
});

// Test webhook
router.post("/:id/test", async (req, res) => {
  try {
    const { data: webhook, error } = await getSupabase()
      .from("cascade_webhooks")
      .select("*")
      .eq("id", req.params.id)
      .single();

    if (error || !webhook) { res.status(404).json({ error: "Webhook not found" }); return; }

    const payload = {
      event: "test",
      timestamp: new Date().toISOString(),
      data: { message: "This is a test webhook from HMN Cascade" },
    };

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (webhook.secret) headers["X-Webhook-Secret"] = webhook.secret;

    const response = await fetch(webhook.url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });

    res.json({ success: response.ok, status: response.status });
  } catch (err) {
    console.error("[webhooks] test error:", err);
    res.json({ success: false, status: "error", message: err instanceof Error ? err.message : "Request failed" });
  }
});

export default router;
