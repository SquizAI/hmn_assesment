// ============================================================
// Unified Assessment Completion Pipeline
// Centralizes all post-assessment actions: profile creation,
// webhooks, email, SSE events, graph sync, invitation/campaign updates
// ============================================================

import { getSupabase } from "./supabase.js";
import { dispatchWebhookEvent } from "./webhook-dispatch.js";
import { sendCompletionEmail } from "./email.js";
import { emitAdminEvent } from "./admin-events.js";
import { syncSessionToGraph, extractAndSyncIntelligence } from "./graph-sync.js";
import type { InterviewSession } from "../src/lib/types";

export async function completeAssessment(params: {
  session: InterviewSession;
  analysis: Record<string, unknown>;
  assessmentType: "cascade" | "adaptability" | "combined";
  contactId?: string;
  invitationId?: string;
  campaignId?: string;
}): Promise<{ profileId: string }> {
  const { session, analysis, assessmentType, contactId, invitationId, campaignId } = params;

  // 1. Create cascade_profiles row
  const profileData = {
    session_id: session.id,
    contact_id: contactId || null,
    invitation_id: invitationId || null,
    campaign_id: campaignId || null,
    assessment_type: assessmentType,
    overall_score: (analysis.overallReadinessScore as number) ?? (analysis.overallScore as number) ?? null,
    archetype: (analysis.archetype as string) ?? null,
    archetype_confidence: (analysis.archetypeConfidence as number) ?? null,
    dimension_scores: analysis.dimensionScores ?? null,
    gaps: analysis.gaps ?? null,
    red_flags: analysis.redFlags ?? null,
    green_lights: analysis.greenLights ?? null,
    contradictions: analysis.contradictions ?? null,
    service_recommendations: analysis.serviceRecommendations ?? null,
    deep_dive_triggers: (analysis.triggeredDeepDives ?? analysis.deepDiveTriggers) ?? null,
    prioritized_actions: analysis.prioritizedActions ?? null,
    executive_summary: (analysis.executiveSummary as string) ?? null,
    adaptability_scores: assessmentType !== "cascade" ? ((analysis.pillarScores ?? analysis.adaptabilityScores) ?? null) : null,
    adaptability_profile: assessmentType !== "cascade" ? ((analysis.profile ?? analysis.adaptabilityProfile) ?? null) : null,
    participant_name: session.participant?.name ?? null,
    participant_email: session.participant?.email ?? null,
    participant_company: session.participant?.company ?? null,
    participant_role: session.participant?.role ?? null,
    participant_industry: session.participant?.industry ?? null,
  };

  const { data: profile, error: profileError } = await getSupabase()
    .from("cascade_profiles")
    .upsert(profileData, { onConflict: "session_id" })
    .select("id")
    .single();

  if (profileError) {
    console.error("[assessment-completion] Failed to create profile:", profileError);
  }

  const profileId = profile?.id ?? "unknown";

  // 2. Fire webhooks (fire-and-forget)
  dispatchWebhookEvent("assessment_completed", {
    sessionId: session.id,
    profileId,
    assessmentType,
    participant: session.participant as unknown as Record<string, unknown>,
    overallScore: profileData.overall_score,
    archetype: profileData.archetype,
    completedAt: new Date().toISOString(),
  });

  // 3. Send completion email (fire-and-forget)
  if (session.participant?.email) {
    sendCompletionEmail({
      to: session.participant.email,
      participantName: session.participant.name || "Participant",
      assessmentName: assessmentType === "adaptability" ? "Adaptability Index" : "AI Readiness Assessment",
    }).catch((err) => console.error("[assessment-completion] Email failed:", err));
  }

  // 4. Emit SSE event for admin dashboard
  emitAdminEvent({
    type: "analysis_ready",
    data: {
      sessionId: session.id,
      profileId,
      name: session.participant?.name || "Unknown",
      company: session.participant?.company || "",
      overallScore: profileData.overall_score,
      archetype: profileData.archetype,
      assessmentType,
    },
    timestamp: new Date().toISOString(),
  });

  // 5. Sync to Neo4j graph (if enabled, fire-and-forget)
  try {
    await syncSessionToGraph(session);
    await extractAndSyncIntelligence(session);
  } catch (err) {
    console.error("[assessment-completion] Graph sync failed:", err);
  }

  // 6. Update invitation status if applicable
  if (invitationId) {
    await getSupabase()
      .from("cascade_invitations")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", invitationId);
  }

  // 7. Update contact status if applicable
  if (contactId) {
    await getSupabase()
      .from("cascade_contacts")
      .update({ status: "assessed", last_assessed_at: new Date().toISOString() })
      .eq("id", contactId);
  }

  // 8. Update campaign progress if applicable
  if (campaignId) {
    const { data: campaign } = await getSupabase()
      .from("cascade_campaigns")
      .select("stats")
      .eq("id", campaignId)
      .single();

    if (campaign) {
      const stats = (campaign.stats || {}) as Record<string, number>;
      const newCompleted = (stats.calls_completed || 0) + 1;
      const totalContacts = stats.total_contacts || 0;
      const updatedStats = { ...stats, calls_completed: newCompleted };

      const updates: Record<string, unknown> = { stats: updatedStats, updated_at: new Date().toISOString() };
      if (newCompleted >= totalContacts && totalContacts > 0) {
        updates.status = "completed";
        dispatchWebhookEvent("campaign_completed", { campaignId, totalCompleted: newCompleted });
      }

      await getSupabase().from("cascade_campaigns").update(updates).eq("id", campaignId);
    }
  }

  return { profileId };
}
