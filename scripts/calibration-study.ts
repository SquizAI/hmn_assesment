/**
 * Adaptability Index Calibration Study
 *
 * Runs dual-scoring on completed adaptability sessions to measure
 * inter-rater reliability between two independent AI scoring passes.
 *
 * Usage:
 *   npx tsx scripts/calibration-study.ts [--sessions N] [--output path]
 *
 * Target: Cohen's kappa > 0.7 for all marker scores
 */

import dotenv from "dotenv";
import { writeFileSync } from "fs";
import Anthropic from "@anthropic-ai/sdk";
import { loadSessionFromDb, listAllSessions } from "../server/supabase.js";
import { runAdaptabilityAnalysis } from "../server/adaptability-scoring.js";
import type {
  AdaptabilityAnalysis,
  AdaptabilityPillar,
  AllMarkerCode,
  MarkerScore,
} from "../src/lib/types.js";
import { MARKER_LABELS } from "../src/lib/types.js";

dotenv.config();

// ============================================================
// CLI Argument Parsing
// ============================================================

function parseArgs(): { maxSessions: number; outputPath: string | null } {
  const args = process.argv.slice(2);
  let maxSessions = Infinity;
  let outputPath: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--sessions" && args[i + 1]) {
      maxSessions = parseInt(args[i + 1], 10);
      if (isNaN(maxSessions) || maxSessions <= 0) {
        console.error("--sessions must be a positive integer");
        process.exit(1);
      }
      i++;
    } else if (args[i] === "--output" && args[i + 1]) {
      outputPath = args[i + 1];
      i++;
    } else if (args[i] === "--help" || args[i] === "-h") {
      console.log(`
Adaptability Index Calibration Study

Usage:
  npx tsx scripts/calibration-study.ts [--sessions N] [--output path]

Options:
  --sessions N    Maximum number of sessions to score (default: all)
  --output path   Write JSON report to file (default: stdout only)
  --help, -h      Show this help message
`);
      process.exit(0);
    }
  }

  return { maxSessions, outputPath };
}

// ============================================================
// Calibration Report Types
// ============================================================

interface CalibrationReport {
  runDate: string;
  sessionCount: number;
  sessionIds: string[];
  markerAgreement: Record<
    string,
    {
      kappa: number;
      weightedKappa: number;
      exactAgreement: number;
      withinOneAgreement: number;
      n: number;
    }
  >;
  pillarAgreement: Record<
    string,
    {
      kappa: number;
      weightedKappa: number;
      meanScoreDiff: number;
      maxScoreDiff: number;
    }
  >;
  overallAgreement: {
    kappa: number;
    weightedKappa: number;
    passesThreshold: boolean;
  };
  driftIndicators: {
    markersBelow07: string[];
    markersBelow05: string[];
    systematicBias: {
      marker: string;
      direction: "higher" | "lower";
      meanDiff: number;
    }[];
  };
  recommendations: string[];
}

// ============================================================
// Cohen's Kappa — Unweighted (Standard)
// ============================================================

/**
 * Compute Cohen's kappa for inter-rater reliability.
 *
 * kappa = (Po - Pe) / (1 - Pe)
 * where Po = observed agreement proportion
 *       Pe = expected agreement by chance
 *
 * If all ratings are identical (kappa undefined due to Pe=1), returns 1.0.
 */
function computeCohenKappa(ratings1: number[], ratings2: number[]): number {
  const n = ratings1.length;
  if (n === 0) return 1.0;

  // Collect all unique categories across both raters
  const categories = new Set<number>();
  for (let i = 0; i < n; i++) {
    categories.add(ratings1[i]);
    categories.add(ratings2[i]);
  }
  const cats = Array.from(categories).sort((a, b) => a - b);

  // Observed agreement: proportion of exact matches
  let agreements = 0;
  for (let i = 0; i < n; i++) {
    if (ratings1[i] === ratings2[i]) agreements++;
  }
  const Po = agreements / n;

  // Expected agreement by chance
  let Pe = 0;
  for (const c of cats) {
    const p1 = ratings1.filter((r) => r === c).length / n;
    const p2 = ratings2.filter((r) => r === c).length / n;
    Pe += p1 * p2;
  }

  // Handle edge case: perfect agreement with Pe=1 (all same category)
  if (Pe >= 1.0) return 1.0;

  return (Po - Pe) / (1 - Pe);
}

// ============================================================
// Cohen's Kappa — Weighted (Linear or Quadratic)
// ============================================================

/**
 * Compute weighted Cohen's kappa for ordinal data.
 *
 * Quadratic weights (default): w(i,j) = 1 - (i-j)^2 / (k-1)^2
 * Linear weights: w(i,j) = 1 - |i-j| / (k-1)
 *
 * where k = number of categories.
 *
 * If all ratings are identical, returns 1.0.
 */
function computeWeightedKappa(
  ratings1: number[],
  ratings2: number[],
  weights: "linear" | "quadratic" = "quadratic"
): number {
  const n = ratings1.length;
  if (n === 0) return 1.0;

  // For marker scores the categories are always 1-4
  const cats = [1, 2, 3, 4];
  const k = cats.length;

  if (k <= 1) return 1.0;

  // Build weight matrix
  const w: number[][] = [];
  for (let i = 0; i < k; i++) {
    w[i] = [];
    for (let j = 0; j < k; j++) {
      const diff = Math.abs(cats[i] - cats[j]);
      if (weights === "quadratic") {
        w[i][j] = 1 - (diff * diff) / ((k - 1) * (k - 1));
      } else {
        w[i][j] = 1 - diff / (k - 1);
      }
    }
  }

  // Build observed frequency matrix
  const observed: number[][] = Array.from({ length: k }, () =>
    new Array(k).fill(0)
  );
  for (let idx = 0; idx < n; idx++) {
    const i = cats.indexOf(ratings1[idx]);
    const j = cats.indexOf(ratings2[idx]);
    if (i >= 0 && j >= 0) {
      observed[i][j]++;
    }
  }

  // Marginal totals
  const rowTotals = observed.map((row) => row.reduce((a, b) => a + b, 0));
  const colTotals = cats.map((_, j) =>
    observed.reduce((sum, row) => sum + row[j], 0)
  );

  // Expected frequency matrix (under independence)
  const expected: number[][] = Array.from({ length: k }, (_, i) =>
    Array.from({ length: k }, (_, j) => (rowTotals[i] * colTotals[j]) / n)
  );

  // Weighted observed and expected agreement
  let weightedObserved = 0;
  let weightedExpected = 0;
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      weightedObserved += w[i][j] * (observed[i][j] / n);
      weightedExpected += w[i][j] * (expected[i][j] / n);
    }
  }

  // Handle edge case
  if (weightedExpected >= 1.0) return 1.0;

  return (weightedObserved - weightedExpected) / (1 - weightedExpected);
}

// ============================================================
// Marker & Pillar Score Extraction
// ============================================================

/** All content marker codes across the 4 pillars */
const ALL_CONTENT_MARKER_CODES: AllMarkerCode[] = [
  "1A", "1B", "1C", "1D",
  "2A", "2B", "2C", "2D", "2F",
  "3A", "3B", "3C", "3D",
  "4A", "4B", "4C", "4D",
];

/** All process marker codes across the 4 pillars */
const ALL_PROCESS_MARKER_CODES: AllMarkerCode[] = [
  "1E", "1F", "2E", "3E", "4E",
];

/** All 22 scored markers (content + process, excluding routing marker 2G) */
const ALL_SCORED_MARKERS: AllMarkerCode[] = [
  ...ALL_CONTENT_MARKER_CODES,
  ...ALL_PROCESS_MARKER_CODES,
];

/**
 * Extract all individual marker scores (1-4) from an AdaptabilityAnalysis.
 * Returns a map from marker code to numeric score.
 */
function extractMarkerScores(
  analysis: AdaptabilityAnalysis
): Record<string, number> {
  const scores: Record<string, number> = {};

  // Content markers from pillar scores
  const p1m = analysis.pillar1.markers;
  scores["1A"] = p1m["1A"].score;
  scores["1B"] = p1m["1B"].score;
  scores["1C"] = p1m["1C"].score;
  scores["1D"] = p1m["1D"].score;

  const p2m = analysis.pillar2.markers;
  scores["2A"] = p2m["2A"].score;
  scores["2B"] = p2m["2B"].score;
  scores["2C"] = p2m["2C"].score;
  scores["2D"] = p2m["2D"].score;
  scores["2F"] = p2m["2F"].score;

  const p3m = analysis.pillar3.markers;
  scores["3A"] = p3m["3A"].score;
  scores["3B"] = p3m["3B"].score;
  scores["3C"] = p3m["3C"].score;
  scores["3D"] = p3m["3D"].score;

  const p4m = analysis.pillar4.markers;
  scores["4A"] = p4m["4A"].score;
  scores["4B"] = p4m["4B"].score;
  scores["4C"] = p4m["4C"].score;
  scores["4D"] = p4m["4D"].score;

  // Process markers
  scores["1E"] = analysis.processScores.pillar_1["1E"].score;
  scores["1F"] = analysis.processScores.pillar_1["1F"].score;
  scores["2E"] = analysis.processScores.pillar_2["2E"].score;
  scores["3E"] = analysis.processScores.pillar_3["3E"].score;
  scores["4E"] = analysis.processScores.pillar_4["4E"].score;

  return scores;
}

/**
 * Extract the 4 pillar composite scores (0-25 each) from an AdaptabilityAnalysis.
 */
function extractPillarComposites(
  analysis: AdaptabilityAnalysis
): Record<string, number> {
  return {
    learning_velocity: analysis.pillar1.compositeScore,
    unlearning_readiness: analysis.pillar2.compositeScore,
    adaptive_agency: analysis.pillar3.compositeScore,
    beginner_tolerance: analysis.pillar4.compositeScore,
  };
}

// ============================================================
// Recommendation Generation
// ============================================================

function generateRecommendations(report: CalibrationReport): string[] {
  const recs: string[] = [];

  // Overall assessment
  if (report.overallAgreement.passesThreshold) {
    recs.push(
      `Overall inter-rater reliability is acceptable (weighted kappa = ${report.overallAgreement.weightedKappa.toFixed(3)}). Scoring engine is suitable for production use.`
    );
  } else {
    recs.push(
      `CRITICAL: Overall inter-rater reliability is below threshold (weighted kappa = ${report.overallAgreement.weightedKappa.toFixed(3)} < 0.7). Scoring engine requires prompt engineering refinement before production use.`
    );
  }

  // Critical markers
  if (report.driftIndicators.markersBelow05.length > 0) {
    const labels = report.driftIndicators.markersBelow05
      .map((m) => `${m} (${MARKER_LABELS[m as AllMarkerCode] || m})`)
      .join(", ");
    recs.push(
      `CRITICAL: Markers with kappa < 0.5 need immediate attention: ${labels}. Consider adding more explicit scoring anchors in the system prompt.`
    );
  }

  // Moderate concern markers
  const moderateConcern = report.driftIndicators.markersBelow07.filter(
    (m) => !report.driftIndicators.markersBelow05.includes(m)
  );
  if (moderateConcern.length > 0) {
    const labels = moderateConcern
      .map((m) => `${m} (${MARKER_LABELS[m as AllMarkerCode] || m})`)
      .join(", ");
    recs.push(
      `Moderate concern: Markers with kappa 0.5-0.7 should be reviewed: ${labels}. Consider adding behavioral exemplars for each score level.`
    );
  }

  // Systematic bias
  if (report.driftIndicators.systematicBias.length > 0) {
    for (const bias of report.driftIndicators.systematicBias) {
      const label = MARKER_LABELS[bias.marker as AllMarkerCode] || bias.marker;
      recs.push(
        `Systematic bias detected for ${bias.marker} (${label}): second pass consistently scores ${bias.direction} by ${Math.abs(bias.meanDiff).toFixed(2)} points. Review scoring rubric for ambiguity.`
      );
    }
  }

  // Pillar-level issues
  const pillarLabels: Record<string, string> = {
    learning_velocity: "Learning Velocity (P1)",
    unlearning_readiness: "Unlearning Readiness (P2)",
    adaptive_agency: "Adaptive Agency (P3)",
    beginner_tolerance: "Beginner Tolerance (P4)",
  };

  for (const [pillar, agreement] of Object.entries(report.pillarAgreement)) {
    if (agreement.weightedKappa < 0.7) {
      recs.push(
        `Pillar ${pillarLabels[pillar] || pillar} has low composite reliability (weighted kappa = ${agreement.weightedKappa.toFixed(3)}). Mean score difference: ${agreement.meanScoreDiff.toFixed(2)}, max difference: ${agreement.maxScoreDiff.toFixed(2)}.`
      );
    }
  }

  // Sample size warning
  if (report.sessionCount < 10) {
    recs.push(
      `WARNING: Only ${report.sessionCount} session(s) scored. Results may not be stable. Recommend at least 20 sessions for reliable kappa estimates.`
    );
  } else if (report.sessionCount < 20) {
    recs.push(
      `Note: ${report.sessionCount} sessions scored. Kappa estimates will stabilize further with 20+ sessions.`
    );
  }

  return recs;
}

// ============================================================
// Main Calibration Pipeline
// ============================================================

async function main() {
  const { maxSessions, outputPath } = parseArgs();

  console.log("=== Adaptability Index Calibration Study ===\n");
  console.log(`Target: Cohen's weighted kappa >= 0.7 for all markers`);
  console.log(`Max sessions: ${maxSessions === Infinity ? "all" : maxSessions}`);
  if (outputPath) console.log(`Output: ${outputPath}`);
  console.log("");

  // Validate environment
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is required in .env");
    process.exit(1);
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env"
    );
    process.exit(1);
  }

  const anthropic = new Anthropic();

  // --- Step 1: Load completed adaptability-index sessions ---
  console.log("Loading sessions from database...");
  const allSessions = await listAllSessions();
  const candidateSessions = allSessions.filter(
    (s) =>
      s.assessmentTypeId === "adaptability-index" &&
      (s.status === "completed" || s.status === "analyzed")
  );

  if (candidateSessions.length === 0) {
    console.error(
      "No completed adaptability-index sessions found in the database."
    );
    process.exit(1);
  }

  const sessionsToScore = candidateSessions.slice(0, maxSessions);
  console.log(
    `Found ${candidateSessions.length} completed sessions, scoring ${sessionsToScore.length}.\n`
  );

  // --- Step 2: Dual-score each session ---
  const scoredPairs: {
    sessionId: string;
    pass1: AdaptabilityAnalysis;
    pass2: AdaptabilityAnalysis;
  }[] = [];

  for (let i = 0; i < sessionsToScore.length; i++) {
    const sessionMeta = sessionsToScore[i];
    console.log(
      `[${i + 1}/${sessionsToScore.length}] Scoring session ${sessionMeta.id} (${sessionMeta.participant?.name || "unknown"})...`
    );

    // Load full session with responses and conversation history
    const fullSession = await loadSessionFromDb(sessionMeta.id);
    if (!fullSession) {
      console.error(`  Could not load full session ${sessionMeta.id}, skipping.`);
      continue;
    }

    // Check if the session already has an analysis (pass 1 = stored analysis)
    // We need the session to have responses for re-scoring
    const responses = fullSession.responses as unknown as Array<{
      questionId: string;
      pillar?: AdaptabilityPillar;
      questionText: string;
      answer: string;
      timestamp: string;
      durationMs?: number;
      aiFollowUps?: Array<{
        action: string;
        question: string;
        answer: string;
        timestamp: string;
        targetConstruct?: string;
      }>;
      followUpDecisions?: Array<{
        action: string;
        rationale: string;
        followUpText?: string;
        targetConstruct?: string;
      }>;
    }>;

    if (!responses || responses.length === 0) {
      console.error(`  Session ${sessionMeta.id} has no responses, skipping.`);
      continue;
    }

    const sessionInput = {
      id: fullSession.id,
      participant: fullSession.participant,
      responses,
      conversationHistory: fullSession.conversationHistory,
    };

    // Pass 1: Use existing stored analysis if available, otherwise score fresh
    let pass1: AdaptabilityAnalysis;
    if (
      fullSession.analysis &&
      (fullSession.analysis as unknown as AdaptabilityAnalysis).pillar1
    ) {
      console.log("  Pass 1: Using stored analysis.");
      pass1 = fullSession.analysis as unknown as AdaptabilityAnalysis;
    } else {
      console.log("  Pass 1: Running fresh scoring...");
      pass1 = await runAdaptabilityAnalysis(anthropic, sessionInput);
    }

    // Pass 2: Always run a fresh independent scoring pass
    console.log("  Pass 2: Running fresh re-scoring...");
    const pass2 = await runAdaptabilityAnalysis(anthropic, sessionInput);

    scoredPairs.push({ sessionId: fullSession.id, pass1, pass2 });
    console.log(`  Done. Overall scores: Pass1=${pass1.overallAdaptabilityScore}, Pass2=${pass2.overallAdaptabilityScore}\n`);
  }

  if (scoredPairs.length === 0) {
    console.error("No sessions could be scored. Exiting.");
    process.exit(1);
  }

  // --- Step 3: Compute agreement statistics ---
  console.log("Computing inter-rater reliability statistics...\n");

  // Collect per-marker rating vectors
  const markerRatings1: Record<string, number[]> = {};
  const markerRatings2: Record<string, number[]> = {};

  for (const marker of ALL_SCORED_MARKERS) {
    markerRatings1[marker] = [];
    markerRatings2[marker] = [];
  }

  // Collect per-pillar composite vectors
  const pillarScores1: Record<string, number[]> = {
    learning_velocity: [],
    unlearning_readiness: [],
    adaptive_agency: [],
    beginner_tolerance: [],
  };
  const pillarScores2: Record<string, number[]> = {
    learning_velocity: [],
    unlearning_readiness: [],
    adaptive_agency: [],
    beginner_tolerance: [],
  };

  for (const pair of scoredPairs) {
    const scores1 = extractMarkerScores(pair.pass1);
    const scores2 = extractMarkerScores(pair.pass2);

    for (const marker of ALL_SCORED_MARKERS) {
      if (scores1[marker] !== undefined && scores2[marker] !== undefined) {
        markerRatings1[marker].push(scores1[marker]);
        markerRatings2[marker].push(scores2[marker]);
      }
    }

    const pillars1 = extractPillarComposites(pair.pass1);
    const pillars2 = extractPillarComposites(pair.pass2);

    for (const pillar of Object.keys(pillarScores1)) {
      pillarScores1[pillar].push(pillars1[pillar]);
      pillarScores2[pillar].push(pillars2[pillar]);
    }
  }

  // --- Compute per-marker agreement ---
  const markerAgreement: CalibrationReport["markerAgreement"] = {};

  for (const marker of ALL_SCORED_MARKERS) {
    const r1 = markerRatings1[marker];
    const r2 = markerRatings2[marker];
    const n = r1.length;

    if (n === 0) {
      markerAgreement[marker] = {
        kappa: 1.0,
        weightedKappa: 1.0,
        exactAgreement: 100,
        withinOneAgreement: 100,
        n: 0,
      };
      continue;
    }

    const kappa = computeCohenKappa(r1, r2);
    const weightedKappa = computeWeightedKappa(r1, r2, "quadratic");

    // Exact agreement percentage
    let exact = 0;
    let withinOne = 0;
    for (let i = 0; i < n; i++) {
      if (r1[i] === r2[i]) exact++;
      if (Math.abs(r1[i] - r2[i]) <= 1) withinOne++;
    }

    markerAgreement[marker] = {
      kappa: Math.round(kappa * 1000) / 1000,
      weightedKappa: Math.round(weightedKappa * 1000) / 1000,
      exactAgreement: Math.round((exact / n) * 10000) / 100,
      withinOneAgreement: Math.round((withinOne / n) * 10000) / 100,
      n,
    };
  }

  // --- Compute per-pillar agreement ---
  // For pillar composites (continuous 0-25), we discretize into bins for kappa:
  // Bin 1: 0-6.25, Bin 2: 6.25-12.5, Bin 3: 12.5-18.75, Bin 4: 18.75-25
  function discretizePillarScore(score: number): number {
    if (score < 6.25) return 1;
    if (score < 12.5) return 2;
    if (score < 18.75) return 3;
    return 4;
  }

  const pillarAgreement: CalibrationReport["pillarAgreement"] = {};

  for (const pillar of Object.keys(pillarScores1)) {
    const s1 = pillarScores1[pillar];
    const s2 = pillarScores2[pillar];
    const n = s1.length;

    if (n === 0) {
      pillarAgreement[pillar] = {
        kappa: 1.0,
        weightedKappa: 1.0,
        meanScoreDiff: 0,
        maxScoreDiff: 0,
      };
      continue;
    }

    const disc1 = s1.map(discretizePillarScore);
    const disc2 = s2.map(discretizePillarScore);

    const kappa = computeCohenKappa(disc1, disc2);
    const weightedKappa = computeWeightedKappa(disc1, disc2, "quadratic");

    // Continuous score differences
    let totalDiff = 0;
    let maxDiff = 0;
    for (let i = 0; i < n; i++) {
      const diff = Math.abs(s1[i] - s2[i]);
      totalDiff += diff;
      if (diff > maxDiff) maxDiff = diff;
    }

    pillarAgreement[pillar] = {
      kappa: Math.round(kappa * 1000) / 1000,
      weightedKappa: Math.round(weightedKappa * 1000) / 1000,
      meanScoreDiff: Math.round((totalDiff / n) * 100) / 100,
      maxScoreDiff: Math.round(maxDiff * 100) / 100,
    };
  }

  // --- Compute overall agreement ---
  // Concatenate all marker ratings across all markers
  const allRatings1: number[] = [];
  const allRatings2: number[] = [];
  for (const marker of ALL_SCORED_MARKERS) {
    allRatings1.push(...markerRatings1[marker]);
    allRatings2.push(...markerRatings2[marker]);
  }

  const overallKappa = computeCohenKappa(allRatings1, allRatings2);
  const overallWeightedKappa = computeWeightedKappa(
    allRatings1,
    allRatings2,
    "quadratic"
  );

  const overallAgreement: CalibrationReport["overallAgreement"] = {
    kappa: Math.round(overallKappa * 1000) / 1000,
    weightedKappa: Math.round(overallWeightedKappa * 1000) / 1000,
    passesThreshold: overallWeightedKappa >= 0.7,
  };

  // --- Drift indicators ---
  const markersBelow07: string[] = [];
  const markersBelow05: string[] = [];
  const systematicBias: CalibrationReport["driftIndicators"]["systematicBias"] =
    [];

  for (const marker of ALL_SCORED_MARKERS) {
    const agreement = markerAgreement[marker];
    if (agreement.n === 0) continue;

    if (agreement.weightedKappa < 0.7) markersBelow07.push(marker);
    if (agreement.weightedKappa < 0.5) markersBelow05.push(marker);

    // Check for systematic bias: mean difference in scores
    const r1 = markerRatings1[marker];
    const r2 = markerRatings2[marker];
    let totalDiff = 0;
    for (let i = 0; i < r1.length; i++) {
      totalDiff += r2[i] - r1[i]; // positive = pass2 higher
    }
    const meanDiff = totalDiff / r1.length;

    // Flag if mean difference > 0.5 (half a score point on average)
    if (Math.abs(meanDiff) > 0.5) {
      systematicBias.push({
        marker,
        direction: meanDiff > 0 ? "higher" : "lower",
        meanDiff: Math.round(meanDiff * 100) / 100,
      });
    }
  }

  const driftIndicators: CalibrationReport["driftIndicators"] = {
    markersBelow07,
    markersBelow05,
    systematicBias,
  };

  // --- Assemble report ---
  const report: CalibrationReport = {
    runDate: new Date().toISOString(),
    sessionCount: scoredPairs.length,
    sessionIds: scoredPairs.map((p) => p.sessionId),
    markerAgreement,
    pillarAgreement,
    overallAgreement,
    driftIndicators,
    recommendations: [], // filled below
  };

  report.recommendations = generateRecommendations(report);

  // --- Step 4: Output report ---
  console.log("=== CALIBRATION REPORT ===\n");

  console.log(`Sessions scored: ${report.sessionCount}`);
  console.log(
    `Overall kappa: ${report.overallAgreement.kappa.toFixed(3)} (unweighted), ${report.overallAgreement.weightedKappa.toFixed(3)} (weighted)`
  );
  console.log(
    `Threshold: ${report.overallAgreement.passesThreshold ? "PASS" : "FAIL"}\n`
  );

  console.log("--- Marker Agreement ---");
  for (const marker of ALL_SCORED_MARKERS) {
    const a = report.markerAgreement[marker];
    const label = MARKER_LABELS[marker] || marker;
    const flag =
      a.weightedKappa < 0.5
        ? " ** CRITICAL"
        : a.weightedKappa < 0.7
          ? " * BELOW THRESHOLD"
          : "";
    console.log(
      `  ${marker} (${label}): wK=${a.weightedKappa.toFixed(3)}, exact=${a.exactAgreement}%, +/-1=${a.withinOneAgreement}%, n=${a.n}${flag}`
    );
  }

  console.log("\n--- Pillar Agreement ---");
  const pillarLabels: Record<string, string> = {
    learning_velocity: "Learning Velocity (P1)",
    unlearning_readiness: "Unlearning Readiness (P2)",
    adaptive_agency: "Adaptive Agency (P3)",
    beginner_tolerance: "Beginner Tolerance (P4)",
  };
  for (const [pillar, agreement] of Object.entries(report.pillarAgreement)) {
    const label = pillarLabels[pillar] || pillar;
    console.log(
      `  ${label}: wK=${agreement.weightedKappa.toFixed(3)}, meanDiff=${agreement.meanScoreDiff.toFixed(2)}, maxDiff=${agreement.maxScoreDiff.toFixed(2)}`
    );
  }

  if (report.driftIndicators.systematicBias.length > 0) {
    console.log("\n--- Systematic Bias ---");
    for (const bias of report.driftIndicators.systematicBias) {
      const label = MARKER_LABELS[bias.marker as AllMarkerCode] || bias.marker;
      console.log(
        `  ${bias.marker} (${label}): Pass 2 scores ${bias.direction} by ${Math.abs(bias.meanDiff).toFixed(2)}`
      );
    }
  }

  console.log("\n--- Recommendations ---");
  for (const rec of report.recommendations) {
    console.log(`  - ${rec}`);
  }

  // Write to file if requested
  const reportJson = JSON.stringify(report, null, 2);

  if (outputPath) {
    writeFileSync(outputPath, reportJson, "utf-8");
    console.log(`\nReport written to: ${outputPath}`);
  }

  // Also print full JSON to stdout
  console.log("\n--- Full JSON Report ---");
  console.log(reportJson);

  // Exit code based on threshold
  if (report.overallAgreement.passesThreshold) {
    console.log("\nResult: PASS — All markers meet reliability threshold.");
    process.exit(0);
  } else {
    console.log(
      "\nResult: FAIL — One or more markers below reliability threshold."
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Calibration study failed:", err);
  process.exit(1);
});
