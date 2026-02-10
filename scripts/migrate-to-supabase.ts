/**
 * One-time migration script: JSON files → Supabase
 *
 * Usage:
 *   npx tsx scripts/migrate-to-supabase.ts
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env
 */

import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ASSESSMENTS_DIR = join(process.cwd(), "assessments");
const SESSIONS_DIR = join(process.cwd(), "sessions");

// --- Assessment migration ---

async function migrateAssessments() {
  if (!existsSync(ASSESSMENTS_DIR)) {
    console.log("No assessments directory — skipping");
    return 0;
  }

  const files = readdirSync(ASSESSMENTS_DIR).filter((f) => f.endsWith(".json"));
  let count = 0;

  for (const file of files) {
    const data = JSON.parse(readFileSync(join(ASSESSMENTS_DIR, file), "utf-8"));
    const row = {
      id: data.id,
      name: data.name,
      description: data.description || "",
      status: data.status || "draft",
      version: 1,
      phases: data.phases || [],
      sections: data.sections || [],
      questions: data.questions || [],
      scoring_dimensions: data.scoringDimensions || [],
      system_prompt_override: data.systemPromptOverride || null,
      settings: {
        icon: data.icon || "",
        estimatedMinutes: data.estimatedMinutes || 30,
      },
      updated_at: data.updatedAt || new Date().toISOString(),
    };

    const { error } = await supabase
      .from("cascade_assessment_configs")
      .upsert(row, { onConflict: "id" });

    if (error) {
      console.error(`  FAIL assessment ${data.id}: ${error.message}`);
    } else {
      console.log(`  OK assessment: ${data.id} (${data.name})`);
      count++;
    }
  }

  return count;
}

// --- Session migration ---

async function migrateSessions() {
  if (!existsSync(SESSIONS_DIR)) {
    console.log("No sessions directory — skipping");
    return 0;
  }

  const files = readdirSync(SESSIONS_DIR).filter((f) => f.endsWith(".json"));
  let count = 0;

  for (const file of files) {
    const data = JSON.parse(readFileSync(join(SESSIONS_DIR, file), "utf-8"));

    // 1. Upsert session row
    const sessionRow = {
      id: data.id,
      assessment_config_id: data.assessmentTypeId || "ai-readiness",
      status: data.status || "intake",
      is_preview: data.isPreview || false,
      participant: data.participant || {},
      current_question_index: data.currentQuestionIndex || 0,
      current_phase: data.currentPhase || null,
      current_section: data.currentSection || null,
      started_at: data.status !== "intake" ? (data.createdAt || new Date().toISOString()) : null,
      completed_at: (data.status === "completed" || data.status === "analyzed") ? (data.updatedAt || new Date().toISOString()) : null,
      analyzed_at: data.status === "analyzed" ? (data.updatedAt || new Date().toISOString()) : null,
      updated_at: data.updatedAt || new Date().toISOString(),
    };

    const { error: sessionErr } = await supabase
      .from("cascade_sessions")
      .upsert(sessionRow, { onConflict: "id" });

    if (sessionErr) {
      console.error(`  FAIL session ${data.id}: ${sessionErr.message}`);
      continue;
    }

    // 2. Insert responses
    if (data.responses && data.responses.length > 0) {
      // Delete existing first (for idempotent re-runs)
      await supabase.from("cascade_responses").delete().eq("session_id", data.id);

      const responseRows = data.responses.map((r: Record<string, unknown>) => ({
        session_id: data.id,
        question_id: r.questionId || "",
        question_text: r.questionText || "",
        input_type: r.inputType || "open_text",
        answer: typeof r.answer === "string" || typeof r.answer === "number"
          ? JSON.stringify(r.answer)
          : r.answer,
        raw_transcription: r.rawTranscription || null,
        audio_url: r.audioUrl || null,
        duration_ms: r.durationMs || null,
        confidence_indicators: r.confidenceIndicators || {},
        ai_follow_ups: r.aiFollowUps || [],
        answered_at: r.timestamp || new Date().toISOString(),
      }));

      const { error: respErr } = await supabase
        .from("cascade_responses")
        .insert(responseRows);

      if (respErr) {
        console.error(`  WARN responses for ${data.id}: ${respErr.message}`);
      }
    }

    // 3. Insert conversation history
    if (data.conversationHistory && data.conversationHistory.length > 0) {
      await supabase.from("cascade_conversation_history").delete().eq("session_id", data.id);

      const convoRows = data.conversationHistory.map((m: Record<string, unknown>) => ({
        session_id: data.id,
        role: m.role || "user",
        content: m.content || "",
        question_id: m.questionId || null,
        created_at: m.timestamp || new Date().toISOString(),
      }));

      const { error: convoErr } = await supabase
        .from("cascade_conversation_history")
        .insert(convoRows);

      if (convoErr) {
        console.error(`  WARN convo history for ${data.id}: ${convoErr.message}`);
      }
    }

    // 4. Insert analysis
    if (data.analysis) {
      const a = data.analysis;
      const analysisRow = {
        session_id: data.id,
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

      const { error: analysisErr } = await supabase
        .from("cascade_analyses")
        .upsert(analysisRow, { onConflict: "session_id" });

      if (analysisErr) {
        console.error(`  WARN analysis for ${data.id}: ${analysisErr.message}`);
      }
    }

    console.log(`  OK session: ${data.id} (${data.participant?.name || "?"}, ${data.status}, ${data.responses?.length || 0} responses)`);
    count++;
  }

  return count;
}

// --- Main ---

async function main() {
  console.log("=== HMN Cascade → Supabase Migration ===\n");
  console.log(`Supabase: ${SUPABASE_URL}`);

  console.log("\n--- Assessments ---");
  const assessmentCount = await migrateAssessments();

  console.log("\n--- Sessions ---");
  const sessionCount = await migrateSessions();

  console.log(`\n=== Done: ${assessmentCount} assessments, ${sessionCount} sessions migrated ===`);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
