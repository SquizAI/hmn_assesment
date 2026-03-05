// ============================================================
// Resume Routes — Magic link session resume
// ============================================================

import { Router } from "express";
import { getSupabase } from "../supabase.js";
import crypto from "crypto";

const router = Router();

// POST /api/sessions/resume — Generate a magic-link resume token
router.post("/", async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) { res.status(400).json({ error: "sessionId is required" }); return; }

    const { data: session, error } = await getSupabase()
      .from("cascade_sessions")
      .select("id, status, participant")
      .eq("id", sessionId)
      .single();

    if (error || !session) { res.status(404).json({ error: "Session not found" }); return; }
    if (session.status === "analyzed") { res.status(400).json({ error: "This session has already been completed and analyzed" }); return; }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7-day expiry

    const { error: insertErr } = await getSupabase()
      .from("cascade_resume_tokens")
      .insert({ token, session_id: sessionId, expires_at: expiresAt.toISOString(), created_at: new Date().toISOString() });

    if (insertErr) throw insertErr;

    const appUrl = (process.env.APP_URL || process.env.CORS_ORIGIN || "http://localhost:5173").replace(/\/$/, "");
    const resumeUrl = `${appUrl}/resume/${token}`;

    res.json({ resumeUrl, token });
  } catch (err) {
    console.error("[resume] generate error:", err);
    res.status(500).json({ error: "Failed to generate resume link" });
  }
});

// GET /api/sessions/resume/:token — Validate a resume token
router.get("/:token", async (req, res) => {
  try {
    const { token } = req.params;
    if (!token) { res.status(400).json({ error: "Token is required" }); return; }

    const { data: tokenRow, error } = await getSupabase()
      .from("cascade_resume_tokens")
      .select("*")
      .eq("token", token)
      .single();

    if (error || !tokenRow) { res.status(404).json({ error: "Invalid or expired resume link" }); return; }

    // Check expiry
    if (new Date(tokenRow.expires_at) < new Date()) {
      res.status(404).json({ error: "This resume link has expired" });
      return;
    }

    // Load session
    const { data: session } = await getSupabase()
      .from("cascade_sessions")
      .select("*")
      .eq("id", tokenRow.session_id)
      .single();

    if (!session) { res.status(404).json({ error: "Session not found" }); return; }

    // Count responses for progress
    const { count: answeredCount } = await getSupabase()
      .from("cascade_responses")
      .select("id", { count: "exact" })
      .eq("session_id", session.id);

    const totalQuestions = 32; // Approximate
    const answered = answeredCount || 0;
    const progressPercent = totalQuestions > 0 ? Math.round((answered / totalQuestions) * 100) : 0;

    res.json({
      session: {
        id: session.id,
        status: session.status,
        participant: {
          name: (session.participant as Record<string, string>)?.name || "",
          role: (session.participant as Record<string, string>)?.role || "",
          company: (session.participant as Record<string, string>)?.company || "",
          industry: (session.participant as Record<string, string>)?.industry || "",
        },
        currentPhase: session.current_phase || "profile_baseline",
        currentSection: session.current_section || "demographics",
        currentQuestionIndex: session.current_question_index || 0,
        answeredQuestions: answered,
        totalQuestions,
        progressPercent,
        createdAt: session.created_at,
        updatedAt: session.updated_at,
      },
    });
  } catch (err) {
    console.error("[resume] validate error:", err);
    res.status(500).json({ error: "Failed to validate resume token" });
  }
});

export default router;
