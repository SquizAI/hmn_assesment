// ============================================================
// Contact Routes — CRM for outreach contacts
// ============================================================

import { Router } from "express";
import { getSupabase } from "../supabase.js";
import crypto from "crypto";

const router = Router();

// List contacts with search/filter/pagination
router.get("/", async (req, res) => {
  try {
    const { search, status, campaign_id, page = "1", limit = "50" } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, parseInt(limit) || 50);
    const offset = (pageNum - 1) * limitNum;

    let query = getSupabase()
      .from("cascade_contacts")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limitNum - 1);

    if (search) query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%,company.ilike.%${search}%`);
    if (status) query = query.eq("status", status);
    if (campaign_id) query = query.eq("campaign_id", campaign_id);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({ contacts: data || [], total: count || 0, page: pageNum, limit: limitNum });
  } catch (err) {
    console.error("[contacts] list error:", err);
    res.status(500).json({ error: "Failed to list contacts" });
  }
});

// Create contact
router.post("/", async (req, res) => {
  try {
    const { name, phone, email, company, role, tags, campaign_id } = req.body;
    if (!name || !phone) { res.status(400).json({ error: "name and phone are required" }); return; }

    const id = crypto.randomUUID();
    const row = {
      id,
      name,
      phone,
      email: email || null,
      company: company || null,
      role: role || null,
      tags: tags || [],
      campaign_id: campaign_id || null,
      status: "new",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error } = await getSupabase().from("cascade_contacts").insert(row);
    if (error) throw error;

    res.json({ contact: row });
  } catch (err) {
    console.error("[contacts] create error:", err);
    res.status(500).json({ error: "Failed to create contact" });
  }
});

// Update contact
router.patch("/:id", async (req, res) => {
  try {
    const updates = { ...req.body, updated_at: new Date().toISOString() };
    delete updates.id;

    const { data, error } = await getSupabase()
      .from("cascade_contacts")
      .update(updates)
      .eq("id", req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ contact: data });
  } catch (err) {
    console.error("[contacts] update error:", err);
    res.status(500).json({ error: "Failed to update contact" });
  }
});

// Delete contact
router.delete("/:id", async (req, res) => {
  try {
    const { error } = await getSupabase()
      .from("cascade_contacts")
      .delete()
      .eq("id", req.params.id);

    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error("[contacts] delete error:", err);
    res.status(500).json({ error: "Failed to delete contact" });
  }
});

// Bulk delete
router.post("/bulk-delete", async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) { res.status(400).json({ error: "ids array required" }); return; }

    const { error } = await getSupabase()
      .from("cascade_contacts")
      .delete()
      .in("id", ids);

    if (error) throw error;
    res.json({ ok: true, deleted: ids.length });
  } catch (err) {
    console.error("[contacts] bulk-delete error:", err);
    res.status(500).json({ error: "Failed to delete contacts" });
  }
});

export default router;
