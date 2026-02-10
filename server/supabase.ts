// ============================================================
// HMN CASCADE - Supabase Client & Data Helpers
// ============================================================

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AssessmentType, InterviewSession, Question } from "../src/lib/types";

// --- Singleton client ---

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
    }
    _client = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _client;
}

// ============================================================
// ASSESSMENT CONFIG HELPERS
// ============================================================

export async function loadAssessment(id: string): Promise<AssessmentType | null> {
  const { data, error } = await getSupabase()
    .from("cascade_assessment_configs")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return dbRowToAssessment(data);
}

export async function saveAssessment(assessment: AssessmentType): Promise<void> {
  const row = assessmentToDbRow(assessment);
  const { error } = await getSupabase()
    .from("cascade_assessment_configs")
    .upsert(row, { onConflict: "id" });

  if (error) throw new Error(`Failed to save assessment: ${error.message}`);
}

export async function deleteAssessmentFromDb(id: string): Promise<boolean> {
  const { error } = await getSupabase()
    .from("cascade_assessment_configs")
    .delete()
    .eq("id", id);

  return !error;
}

export async function listAllAssessments(): Promise<AssessmentType[]> {
  const { data, error } = await getSupabase()
    .from("cascade_assessment_configs")
    .select("*")
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return data.map(dbRowToAssessment);
}

// ============================================================
// SESSION HELPERS
// ============================================================

export async function loadSessionFromDb(id: string): Promise<InterviewSession | null> {
  const { data: sessionRow, error } = await getSupabase()
    .from("cascade_sessions")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !sessionRow) return null;

  // Load responses
  const { data: responses } = await getSupabase()
    .from("cascade_responses")
    .select("*")
    .eq("session_id", id)
    .order("answered_at", { ascending: true });

  // Load conversation history
  const { data: convoHistory } = await getSupabase()
    .from("cascade_conversation_history")
    .select("*")
    .eq("session_id", id)
    .order("created_at", { ascending: true });

  // Load analysis
  const { data: analysisRow } = await getSupabase()
    .from("cascade_analyses")
    .select("*")
    .eq("session_id", id)
    .single();

  return dbRowToSession(sessionRow, responses || [], convoHistory || [], analysisRow);
}

export async function saveSessionToDb(session: InterviewSession): Promise<void> {
  const sb = getSupabase();

  // Upsert the session row
  const sessionRow = sessionToDbRow(session);
  const { error: sessionErr } = await sb
    .from("cascade_sessions")
    .upsert(sessionRow, { onConflict: "id" });

  if (sessionErr) throw new Error(`Failed to save session: ${sessionErr.message}`);

  // Upsert responses (delete-and-reinsert for simplicity since response array is the source of truth)
  if (session.responses && session.responses.length > 0) {
    // Delete existing responses for this session
    await sb.from("cascade_responses").delete().eq("session_id", session.id);

    // Insert all current responses
    const responseRows = session.responses.map((r) => responseToDbRow(session.id, r));
    const { error: respErr } = await sb.from("cascade_responses").insert(responseRows);
    if (respErr) console.error("Failed to save responses:", respErr.message);
  }

  // Upsert conversation history
  if (session.conversationHistory && session.conversationHistory.length > 0) {
    await sb.from("cascade_conversation_history").delete().eq("session_id", session.id);

    const convoRows = session.conversationHistory.map((m) => ({
      session_id: session.id,
      role: m.role,
      content: m.content,
      question_id: m.questionId || null,
      created_at: m.timestamp || new Date().toISOString(),
    }));
    const { error: convoErr } = await sb.from("cascade_conversation_history").insert(convoRows);
    if (convoErr) console.error("Failed to save conversation history:", convoErr.message);
  }

  // Upsert analysis if present
  if (session.analysis) {
    const analysisRow = analysisToDbRow(session.id, session.analysis);
    const { error: analysisErr } = await sb
      .from("cascade_analyses")
      .upsert(analysisRow, { onConflict: "session_id" });
    if (analysisErr) console.error("Failed to save analysis:", analysisErr.message);
  }
}

export async function deleteSessionFromDb(id: string): Promise<boolean> {
  // CASCADE will handle responses, conversation history, and analyses
  const { error } = await getSupabase()
    .from("cascade_sessions")
    .delete()
    .eq("id", id);

  return !error;
}

export async function listAllSessions(): Promise<InterviewSession[]> {
  const { data, error } = await getSupabase()
    .from("cascade_sessions")
    .select("*")
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  // For listing, we don't need full responses/analysis — just session metadata
  return data.map((row) => dbRowToSession(row, [], [], null));
}

export async function listSessionsWithResponses(): Promise<InterviewSession[]> {
  const { data: sessions, error } = await getSupabase()
    .from("cascade_sessions")
    .select("*")
    .order("created_at", { ascending: false });

  if (error || !sessions) return [];

  // Load all analyses in bulk
  const sessionIds = sessions.map((s) => s.id);
  const { data: analyses } = await getSupabase()
    .from("cascade_analyses")
    .select("*")
    .in("session_id", sessionIds);

  const analysisMap = new Map<string, Record<string, unknown>>();
  if (analyses) {
    for (const a of analyses) {
      analysisMap.set(a.session_id, a);
    }
  }

  // Load response counts
  const { data: responseCounts } = await getSupabase()
    .from("cascade_responses")
    .select("session_id")
    .in("session_id", sessionIds);

  const responseCountMap = new Map<string, number>();
  if (responseCounts) {
    for (const r of responseCounts) {
      responseCountMap.set(r.session_id, (responseCountMap.get(r.session_id) || 0) + 1);
    }
  }

  return sessions.map((row) => {
    const session = dbRowToSession(row, [], [], analysisMap.get(row.id) || null);
    // Fake the responses array length for stats (avoid loading full responses)
    const count = responseCountMap.get(row.id) || 0;
    if (count > 0 && session.responses.length === 0) {
      session.responses = new Array(count).fill({ questionId: "", questionText: "", inputType: "open_text", answer: "", timestamp: "", confidenceIndicators: { specificity: 0, emotionalCharge: 0, consistency: 0 } });
    }
    return session;
  });
}

export async function lookupSessionsByEmail(email: string): Promise<InterviewSession[]> {
  const { data, error } = await getSupabase()
    .from("cascade_sessions")
    .select("*")
    .filter("participant->email", "eq", email)
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return data.map((row) => dbRowToSession(row, [], [], null));
}

// ============================================================
// DB ↔ APP CONVERTERS
// ============================================================

function dbRowToAssessment(row: Record<string, unknown>): AssessmentType {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string) || "",
    icon: ((row.settings as Record<string, unknown>)?.icon as string) || "",
    estimatedMinutes: ((row.settings as Record<string, unknown>)?.estimatedMinutes as number) || 30,
    status: (row.status as AssessmentType["status"]) || "draft",
    phases: (row.phases as AssessmentType["phases"]) || [],
    sections: (row.sections as AssessmentType["sections"]) || [],
    questions: (row.questions as Question[]) || [],
    scoringDimensions: (row.scoring_dimensions as AssessmentType["scoringDimensions"]) || [],
    systemPromptOverride: (row.system_prompt_override as string) || undefined,
    createdAt: (row.created_at as string) || new Date().toISOString(),
    updatedAt: (row.updated_at as string) || new Date().toISOString(),
  };
}

function assessmentToDbRow(a: AssessmentType): Record<string, unknown> {
  return {
    id: a.id,
    name: a.name,
    description: a.description || "",
    status: a.status || "draft",
    version: 1,
    phases: a.phases || [],
    sections: a.sections || [],
    questions: a.questions || [],
    scoring_dimensions: a.scoringDimensions || [],
    system_prompt_override: a.systemPromptOverride || null,
    settings: {
      icon: a.icon || "",
      estimatedMinutes: a.estimatedMinutes || 30,
    },
    updated_at: new Date().toISOString(),
  };
}

function dbRowToSession(
  row: Record<string, unknown>,
  responses: Record<string, unknown>[],
  convoHistory: Record<string, unknown>[],
  analysisRow: Record<string, unknown> | null,
): InterviewSession {
  const session: InterviewSession = {
    id: row.id as string,
    createdAt: (row.created_at as string) || new Date().toISOString(),
    updatedAt: (row.updated_at as string) || new Date().toISOString(),
    status: (row.status as InterviewSession["status"]) || "intake",
    assessmentTypeId: (row.assessment_config_id as string) || "ai-readiness",
    isPreview: (row.is_preview as boolean) || false,
    participant: (row.participant as InterviewSession["participant"]) || {
      name: "", role: "", company: "", industry: "", teamSize: "", email: "",
    },
    currentQuestionIndex: (row.current_question_index as number) || 0,
    currentPhase: (row.current_phase as string) || "profile_baseline",
    currentSection: (row.current_section as string) || "demographics",
    responses: responses.map(dbRowToResponse),
    conversationHistory: convoHistory.map((m) => ({
      role: m.role as string,
      content: m.content as string,
      timestamp: (m.created_at as string) || new Date().toISOString(),
      questionId: (m.question_id as string) || undefined,
    })),
    research: null,
    researchConfirmed: false,
  } as InterviewSession;

  if (analysisRow) {
    session.analysis = dbRowToAnalysis(analysisRow);
  }

  return session;
}

function sessionToDbRow(s: InterviewSession): Record<string, unknown> {
  return {
    id: s.id,
    assessment_config_id: s.assessmentTypeId || "ai-readiness",
    status: s.status,
    is_preview: s.isPreview || false,
    participant: s.participant,
    current_question_index: s.currentQuestionIndex || 0,
    current_phase: s.currentPhase || null,
    current_section: s.currentSection || null,
    started_at: s.status !== "intake" ? (s.createdAt || new Date().toISOString()) : null,
    completed_at: (s.status === "completed" || s.status === "analyzed") ? new Date().toISOString() : null,
    analyzed_at: s.status === "analyzed" ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };
}

function dbRowToResponse(row: Record<string, unknown>): Record<string, unknown> {
  return {
    questionId: row.question_id,
    questionText: row.question_text,
    inputType: row.input_type,
    answer: row.answer,
    rawTranscription: row.raw_transcription || undefined,
    audioUrl: row.audio_url || undefined,
    durationMs: row.duration_ms || undefined,
    timestamp: row.answered_at || new Date().toISOString(),
    confidenceIndicators: row.confidence_indicators || { specificity: 0.5, emotionalCharge: 0.5, consistency: 0.5 },
    aiFollowUps: row.ai_follow_ups || [],
  };
}

function responseToDbRow(sessionId: string, r: Record<string, unknown>): Record<string, unknown> {
  return {
    session_id: sessionId,
    question_id: r.questionId,
    question_text: r.questionText || "",
    input_type: r.inputType || "open_text",
    answer: typeof r.answer === "string" || typeof r.answer === "number" ? JSON.stringify(r.answer) : r.answer,
    raw_transcription: r.rawTranscription || null,
    audio_url: r.audioUrl || null,
    duration_ms: r.durationMs || null,
    confidence_indicators: r.confidenceIndicators || {},
    ai_follow_ups: r.aiFollowUps || [],
    answered_at: r.timestamp || new Date().toISOString(),
  };
}

function dbRowToAnalysis(row: Record<string, unknown>): Record<string, unknown> {
  return {
    overallReadinessScore: row.overall_readiness_score,
    dimensionScores: row.dimension_scores || [],
    archetype: row.archetype,
    archetypeConfidence: row.archetype_confidence,
    archetypeDescription: row.archetype_description,
    gaps: row.gaps || [],
    redFlags: row.red_flags || [],
    greenLights: row.green_lights || [],
    contradictions: row.contradictions || [],
    serviceRecommendations: row.service_recommendations || [],
    prioritizedActions: row.prioritized_actions || [],
    executiveSummary: row.executive_summary,
    detailedNarrative: row.detailed_narrative,
    triggeredDeepDives: row.triggered_deep_dives || [],
    sessionId: row.session_id,
    completedAt: row.completed_at,
  };
}

function analysisToDbRow(sessionId: string, a: Record<string, unknown>): Record<string, unknown> {
  return {
    session_id: sessionId,
    overall_readiness_score: a.overallReadinessScore || null,
    dimension_scores: a.dimensionScores || [],
    archetype: a.archetype || null,
    archetype_confidence: a.archetypeConfidence || null,
    archetype_description: a.archetypeDescription || null,
    gaps: a.gaps || [],
    red_flags: a.redFlags || [],
    green_lights: a.greenLights || [],
    contradictions: a.contradictions || [],
    service_recommendations: a.serviceRecommendations || [],
    prioritized_actions: a.prioritizedActions || [],
    executive_summary: a.executiveSummary || null,
    detailed_narrative: a.detailedNarrative || null,
    triggered_deep_dives: a.triggeredDeepDives || [],
    completed_at: a.completedAt || new Date().toISOString(),
  };
}
