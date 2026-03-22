/**
 * Upload the combined AI Readiness + Adaptability assessment config to Supabase.
 * Run with: npx tsx scripts/upload-combined-assessment.ts
 */
import { readFileSync } from "fs";
import { join } from "path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY / SUPABASE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function main() {
  const jsonPath = join(process.cwd(), "assessments", "combined-readiness-adaptability.json");
  const raw = readFileSync(jsonPath, "utf-8");
  const config = JSON.parse(raw);

  // Also include the Phase 5 questions from the question bank
  // These are the adapt_* questions that get merged with the standard question bank
  const questionBankPath = join(process.cwd(), "src", "data", "question-bank.ts");
  const qbSource = readFileSync(questionBankPath, "utf-8");

  // Extract adapt_ questions from the question bank source
  // (The combined config doesn't embed questions — it uses the static question bank which now includes Phase 5)
  const adaptQuestionCount = (qbSource.match(/id: "adapt_/g) || []).length;

  const now = new Date().toISOString();

  const row = {
    id: config.id,
    name: config.name,
    description: config.description || "",
    status: config.status || "active",
    version: 1,
    phases: config.phases || [],
    sections: config.sections || [],
    questions: config.questions || [],
    scoring_dimensions: config.scoringDimensions || [],
    settings: {
      icon: config.icon || "",
      estimatedMinutes: config.estimatedMinutes || 40,
      interviewSystemPrompt: config.interviewSystemPrompt || null,
      analysisSystemPrompt: config.analysisSystemPrompt || null,
    },
    created_at: now,
    updated_at: now,
  };

  console.log(`Uploading assessment: ${row.id} ("${row.name}")`);
  console.log(`  Phases: ${row.phases.length}`);
  console.log(`  Sections: ${row.sections.length}`);
  console.log(`  Scoring dimensions: ${row.scoring_dimensions.length}`);
  console.log(`  Adaptability questions in bank: ${adaptQuestionCount}`);

  const { error } = await supabase
    .from("cascade_assessment_configs")
    .upsert(row, { onConflict: "id" });

  if (error) {
    console.error("Upload failed:", error.message);
    process.exit(1);
  }

  console.log("Upload successful!");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
