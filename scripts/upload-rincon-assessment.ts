/**
 * Upload the rincon-reality-gap assessment config to Supabase.
 *
 * Run with:  npx tsx scripts/upload-rincon-assessment.ts
 *
 * The assessment JSON ships as `status: "draft"` so a normal upload will NOT
 * make it bookable on the live site. To activate it, either:
 *   1) Edit the JSON to `"status": "active"` then re-run this script, or
 *   2) Pass `--activate` when invoking this script.
 *
 * Pre-requisites:
 *   - migrations/003_runtime_context.sql has been applied (the analysis route
 *     calls loadRuntimeContexts at scoring time; without the table the call
 *     returns empty cleanly, so this is not blocking, but recommended).
 *   - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_KEY) in .env.
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

const ACTIVATE = process.argv.includes("--activate");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function main() {
  const jsonPath = join(process.cwd(), "assessments", "rincon-reality-gap.json");
  const raw = readFileSync(jsonPath, "utf-8");
  const config = JSON.parse(raw);

  if (config.id !== "rincon-reality-gap") {
    console.error(`Unexpected id in JSON: ${config.id}. Aborting.`);
    process.exit(1);
  }

  const status = ACTIVATE ? "active" : (config.status || "draft");
  const now = new Date().toISOString();

  const row = {
    id: config.id,
    name: config.name,
    description: config.description || "",
    status,
    version: 1,
    phases: config.phases || [],
    sections: config.sections || [],
    questions: config.questions || [],
    scoring_dimensions: config.scoringDimensions || [],
    settings: {
      icon: config.icon || "",
      estimatedMinutes: config.estimatedMinutes || 30,
      interviewSystemPrompt: config.interviewSystemPrompt || null,
      analysisSystemPrompt: config.analysisSystemPrompt || null,
      intakeFields: config.intakeFields || null,
      intakeNotice: config.intakeNotice || null,
    },
    created_at: now,
    updated_at: now,
  };

  console.log(`Uploading assessment: ${row.id} ("${row.name}")`);
  console.log(`  Status: ${row.status}${ACTIVATE ? " (forced via --activate)" : ""}`);
  console.log(`  Questions: ${row.questions.length}`);
  console.log(`  Phases: ${row.phases.length}`);
  console.log(`  Sections: ${row.sections.length}`);
  console.log(`  Scoring dimensions: ${row.scoring_dimensions.length}`);
  console.log(`  Intake fields: ${(row.settings.intakeFields as unknown[] | null)?.length ?? 0}`);
  console.log(`  Intake notice: ${row.settings.intakeNotice ? "yes" : "no"}`);

  const { error } = await supabase
    .from("cascade_assessment_configs")
    .upsert(row, { onConflict: "id" });

  if (error) {
    console.error("Upload failed:", error.message);
    process.exit(1);
  }

  console.log("Upload successful.");

  // Verify by reading back
  const { data, error: readErr } = await supabase
    .from("cascade_assessment_configs")
    .select("id, name, status, settings")
    .eq("id", config.id)
    .single();

  if (readErr) {
    console.warn("Verification read failed:", readErr.message);
  } else {
    const settings = (data.settings || {}) as Record<string, unknown>;
    console.log("Verified row:", {
      id: data.id,
      name: data.name,
      status: data.status,
      intakeFieldsCount: (settings.intakeFields as unknown[] | null)?.length ?? 0,
      intakeNotice: settings.intakeNotice ? "yes" : "no",
    });
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
