import Anthropic from "@anthropic-ai/sdk";
import type {
  AdaptabilityPillar,
  AllMarkerCode,
  MarkerScore,
  MarkerConfidence,
  P1ContentScores,
  P2ContentScores,
  P3ContentScores,
  P4ContentScores,
  PillarContentScore,
  ProcessScores,
  AdaptiveRegulation,
  AdaptiveRegulationRating,
  ElaborationTrajectory,
  MeaningStructure,
  MeaningStructureClassification,
  SystemVsIndividual,
  SystemVsIndividualClassification,
  DomainDifferential,
  CrossPillarObservations,
  MicroMomentResponse,
  SelfDeceptionResponse,
  ContentProcessCongruence,
  LinguisticSignals,
  PerPillarLinguistics,
  InterventionRouting,
  HumanReviewFlag,
  HumanReviewTrigger,
  AdaptabilityAnalysis,
  AdaptabilityProfile,
  AdaptabilityQuestionResponse,
  TrustCalibration,
  TrustLevel,
} from "../src/lib/types.js";
import {
  ADAPTABILITY_SCORING_SYSTEM_PROMPT,
  ADAPTABILITY_PILLAR_LABELS,
  PILLAR_SCORE_RANGES,
  MEANING_STRUCTURE_ROUTES,
  SYSTEM_VS_INDIVIDUAL_ROUTES,
  ADAPTIVE_REGULATION_LEVELS,
  CROSS_PILLAR_PATTERNS,
  assessPlay0,
  assessHumanReview,
} from "../src/data/adaptability-scoring.js";

// ============================================================
// ADAPTABILITY INDEX — Server-Side Scoring Engine
// Uses Claude API structured outputs + adaptive thinking
// ============================================================

const MODEL_SCORING = "claude-sonnet-4-6";
const MODEL_FAST = "claude-haiku-4-5-20251001";

// --- Hedging Lexicon (for process signal detection) ---

const UNCERTAINTY_HEDGES = new Set([
  "i think", "i believe", "probably", "maybe", "i guess",
  "sort of", "kind of", "perhaps", "i suppose", "it seems",
  "i feel like", "more or less", "in a way", "to some extent",
]);

const MINIMIZERS = new Set([
  "just", "only", "a little", "not really", "merely", "simply",
]);

const DISTANCING = new Set([
  "you know", "like", "i mean", "basically", "essentially",
  "honestly", "to be honest", "in general", "technically",
]);

const DEFLECTION_MARKERS = new Set([
  "that's a hard question", "that's a good question",
  "i'm not sure what you're looking for", "can we move on",
  "i don't know if this is what you mean",
]);

const FALSE_START_INDICATORS = new Set([
  "well...", "so...", "i mean...", "um...", "uh...",
  "well,", "so,", "i mean,",
]);

// --- Linguistic Signal Computation ---

export function computeLinguisticSignals(text: string): LinguisticSignals {
  if (!text || text.trim().length === 0) {
    return {
      hedgingDensity: 0,
      typeTokenRatio: 0,
      meanSentenceLength: 0,
      narrativeSpecificityIndex: 0,
      falseStartCount: 0,
      selfCorrectionCount: 0,
      positiveSelfCorrections: 0,
      defensiveSelfCorrections: 0,
      responseWordCount: 0,
    };
  }

  const lowerText = text.toLowerCase();
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const wordCount = words.length;

  if (wordCount === 0) {
    return {
      hedgingDensity: 0, typeTokenRatio: 0, meanSentenceLength: 0,
      narrativeSpecificityIndex: 0, falseStartCount: 0, selfCorrectionCount: 0,
      positiveSelfCorrections: 0, defensiveSelfCorrections: 0, responseWordCount: 0,
    };
  }

  // Hedging density: hedges per 100 words
  let hedgeCount = 0;
  for (const hedge of UNCERTAINTY_HEDGES) {
    const regex = new RegExp(hedge.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const matches = lowerText.match(regex);
    hedgeCount += matches ? matches.length : 0;
  }
  for (const min of MINIMIZERS) {
    const regex = new RegExp(`\\b${min.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    const matches = lowerText.match(regex);
    hedgeCount += matches ? matches.length : 0;
  }
  const hedgingDensity = (hedgeCount / wordCount) * 100;

  // Type-token ratio (vocabulary diversity)
  const uniqueWords = new Set(words.map((w) => w.toLowerCase().replace(/[^a-z']/g, "")));
  const typeTokenRatio = uniqueWords.size / wordCount;

  // Mean sentence length
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const meanSentenceLength = sentences.length > 0 ? wordCount / sentences.length : wordCount;

  // Narrative specificity index: ratio of concrete details to abstract statements
  // Concrete indicators: numbers, dates, proper nouns (capitalized words), specific actions
  const concretePatterns = /\b\d+\b|(?:january|february|march|april|may|june|july|august|september|october|november|december)\b|\b(?:monday|tuesday|wednesday|thursday|friday)\b|\b(?:last (?:week|month|year))\b/gi;
  const concreteMatches = lowerText.match(concretePatterns) || [];
  const properNouns = words.filter((w) => /^[A-Z][a-z]/.test(w) && words.indexOf(w) > 0);
  const concreteCount = concreteMatches.length + properNouns.length;

  // Abstract indicators: generalizations
  const abstractPatterns = /\b(?:always|never|everyone|nobody|generally|typically|usually|in general)\b/gi;
  const abstractMatches = lowerText.match(abstractPatterns) || [];
  const abstractCount = abstractMatches.length + hedgeCount;

  const totalSignals = concreteCount + abstractCount;
  const narrativeSpecificityIndex = totalSignals > 0 ? concreteCount / totalSignals : 0.5;

  // False start count
  let falseStartCount = 0;
  for (const starter of FALSE_START_INDICATORS) {
    const regex = new RegExp(starter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const matches = lowerText.match(regex);
    falseStartCount += matches ? matches.length : 0;
  }

  // Self-correction detection
  const positiveCorrectionPatterns = /actually,?\s|let me (?:rephrase|think about) that|what (?:really|actually) happened|to be more (?:specific|precise|honest)|i should (?:clarify|add)/gi;
  const defensiveCorrectionPatterns = /well,?\s+i wouldn't say|i don't mean|that's not exactly|not that i|i didn't mean to (?:say|imply)/gi;

  const positiveMatches = lowerText.match(positiveCorrectionPatterns) || [];
  const defensiveMatches = lowerText.match(defensiveCorrectionPatterns) || [];

  return {
    hedgingDensity: Math.round(hedgingDensity * 100) / 100,
    typeTokenRatio: Math.round(typeTokenRatio * 1000) / 1000,
    meanSentenceLength: Math.round(meanSentenceLength * 10) / 10,
    narrativeSpecificityIndex: Math.round(narrativeSpecificityIndex * 1000) / 1000,
    falseStartCount,
    selfCorrectionCount: positiveMatches.length + defensiveMatches.length,
    positiveSelfCorrections: positiveMatches.length,
    defensiveSelfCorrections: defensiveMatches.length,
    responseWordCount: wordCount,
  };
}

// Compute per-pillar linguistics from responses
export function computePerPillarLinguistics(
  responses: AdaptabilityQuestionResponse[]
): PerPillarLinguistics {
  const pillarTexts: Record<AdaptabilityPillar, string> = {
    learning_velocity: "",
    unlearning_readiness: "",
    adaptive_agency: "",
    beginner_tolerance: "",
  };

  for (const r of responses) {
    if (!r.pillar) continue;
    const allText = [
      r.answer,
      ...(r.aiFollowUps?.map((f) => f.answer) || []),
    ].join(" ");
    pillarTexts[r.pillar] += " " + allText;
  }

  return {
    pillar_1: computeLinguisticSignals(pillarTexts.learning_velocity),
    pillar_2: computeLinguisticSignals(pillarTexts.unlearning_readiness),
    pillar_3: computeLinguisticSignals(pillarTexts.adaptive_agency),
    pillar_4: computeLinguisticSignals(pillarTexts.beginner_tolerance),
  };
}

// --- Adaptive Regulation Computation ---

export function computeAdaptiveRegulation(
  linguistics: PerPillarLinguistics
): AdaptiveRegulation {
  // Low-threat sections: P1, P3 | High-threat sections: P2, P4
  const lowThreatSpecificity =
    (linguistics.pillar_1.narrativeSpecificityIndex + linguistics.pillar_3.narrativeSpecificityIndex) / 2;
  const highThreatSpecificity =
    (linguistics.pillar_2.narrativeSpecificityIndex + linguistics.pillar_4.narrativeSpecificityIndex) / 2;
  const narrativeSpecificityDifferential = lowThreatSpecificity - highThreatSpecificity;

  const highThreatHedging =
    (linguistics.pillar_2.hedgingDensity + linguistics.pillar_4.hedgingDensity) / 2;
  const lowThreatHedging =
    (linguistics.pillar_1.hedgingDensity + linguistics.pillar_3.hedgingDensity) / 2;
  const hedgingFrequencyDifferential = highThreatHedging - lowThreatHedging;

  // Elaboration trajectory: compare word count and quality across session
  const earlyWordCount = linguistics.pillar_1.responseWordCount;
  const lateWordCount = linguistics.pillar_4.responseWordCount;
  let elaborationTrajectory: ElaborationTrajectory;
  if (earlyWordCount === 0 || lateWordCount === 0) {
    elaborationTrajectory = "stable";
  } else {
    const ratio = lateWordCount / earlyWordCount;
    if (ratio > 1.15) elaborationTrajectory = "improving";
    else if (ratio < 0.7) elaborationTrajectory = "degrading";
    else elaborationTrajectory = "stable";
  }

  // Self-correction ratio
  const totalSelfCorrections =
    linguistics.pillar_1.selfCorrectionCount +
    linguistics.pillar_2.selfCorrectionCount +
    linguistics.pillar_3.selfCorrectionCount +
    linguistics.pillar_4.selfCorrectionCount;
  const totalPositive =
    linguistics.pillar_1.positiveSelfCorrections +
    linguistics.pillar_2.positiveSelfCorrections +
    linguistics.pillar_3.positiveSelfCorrections +
    linguistics.pillar_4.positiveSelfCorrections;
  const selfCorrectionRatio = totalSelfCorrections > 0 ? totalPositive / totalSelfCorrections : 0.5;

  // Composite rating (1-4)
  // Higher differential = lower regulation
  let score = 0;

  // Narrative specificity differential (0 = no degradation, >0.3 = significant)
  if (narrativeSpecificityDifferential < 0.05) score += 4;
  else if (narrativeSpecificityDifferential < 0.15) score += 3;
  else if (narrativeSpecificityDifferential < 0.3) score += 2;
  else score += 1;

  // Hedging frequency differential (0 = no increase, >5 = significant)
  if (hedgingFrequencyDifferential < 1) score += 4;
  else if (hedgingFrequencyDifferential < 3) score += 3;
  else if (hedgingFrequencyDifferential < 6) score += 2;
  else score += 1;

  // Elaboration trajectory
  if (elaborationTrajectory === "improving") score += 4;
  else if (elaborationTrajectory === "stable") score += 3;
  else score += 1;

  // Self-correction ratio
  if (selfCorrectionRatio > 0.7) score += 4;
  else if (selfCorrectionRatio > 0.4) score += 3;
  else if (selfCorrectionRatio > 0.2) score += 2;
  else score += 1;

  const avgScore = score / 4;
  let compositeRating: AdaptiveRegulationRating;
  if (avgScore >= 3.5) compositeRating = 4;
  else if (avgScore >= 2.5) compositeRating = 3;
  else if (avgScore >= 1.5) compositeRating = 2;
  else compositeRating = 1;

  // Confidence based on data quality
  const totalWords =
    linguistics.pillar_1.responseWordCount +
    linguistics.pillar_2.responseWordCount +
    linguistics.pillar_3.responseWordCount +
    linguistics.pillar_4.responseWordCount;
  let confidence: MarkerConfidence;
  if (totalWords > 1000) confidence = "high";
  else if (totalWords > 400) confidence = "medium";
  else confidence = "low";

  return {
    narrativeSpecificityDifferential: Math.round(narrativeSpecificityDifferential * 1000) / 1000,
    hedgingFrequencyDifferential: Math.round(hedgingFrequencyDifferential * 100) / 100,
    elaborationTrajectory,
    selfCorrectionRatio: Math.round(selfCorrectionRatio * 1000) / 1000,
    compositeRating,
    confidence,
    play0Flag: compositeRating === 1,
  };
}

// --- Trust Calibration (during interview) ---

export async function calibrateTrust(
  client: Anthropic,
  openingResponse: string,
): Promise<TrustCalibration> {
  const response = await client.messages.create({
    model: MODEL_FAST,
    max_tokens: 300,
    system: "You assess trust levels from opening interview responses. Return ONLY valid JSON.",
    messages: [
      {
        role: "user",
        content: `Assess trust level from this opening response:

"${openingResponse}"

Return JSON:
{
  "level": "high" | "moderate" | "low",
  "responseLength": "short" | "moderate" | "detailed",
  "hedgingFrequency": "low" | "moderate" | "high",
  "directTrustStatements": true/false,
  "engagementQuality": "deflecting" | "surface" | "engaged" | "deeply_engaged",
  "adjustmentNeeded": true/false,
  "adjustmentDescription": "string or null"
}`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "{}";
  try {
    const parsed = JSON.parse(text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
    return {
      level: parsed.level || "moderate",
      signals: {
        responseLength: parsed.responseLength || "moderate",
        hedgingFrequency: parsed.hedgingFrequency || "moderate",
        directTrustStatements: parsed.directTrustStatements || false,
        engagementQuality: parsed.engagementQuality || "surface",
      },
      adjustmentApplied: parsed.adjustmentNeeded || false,
      adjustmentDescription: parsed.adjustmentDescription || undefined,
    };
  } catch {
    return {
      level: "moderate",
      signals: {
        responseLength: "moderate",
        hedgingFrequency: "moderate",
        directTrustStatements: false,
        engagementQuality: "surface",
      },
      adjustmentApplied: false,
    };
  }
}

// --- Full Scoring Engine (Post-Session Analysis) ---

export async function runAdaptabilityAnalysis(
  client: Anthropic,
  session: {
    id: string;
    participant: { name: string; role: string; company: string; industry: string; teamSize: string };
    responses: AdaptabilityQuestionResponse[];
    conversationHistory: Array<{ role: string; content: string; timestamp: string; questionId?: string }>;
  },
  organizationId?: string,
): Promise<AdaptabilityAnalysis> {
  const { id: sessionId, participant, responses, conversationHistory } = session;

  // --- Step 1: Build transcript for scoring ---
  const transcript = responses
    .map((r) => {
      let answerText = r.answer;
      if (r.aiFollowUps?.length) {
        answerText +=
          "\n  Follow-ups:\n" +
          r.aiFollowUps.map((f) => `  Q: ${f.question}\n  A: ${f.answer}`).join("\n");
      }
      return `[${r.questionId}] Q: ${r.questionText}\nA: ${answerText}`;
    })
    .join("\n\n---\n\n");

  // --- Step 2: Compute linguistic signals locally ---
  const perPillarLinguistics = computePerPillarLinguistics(responses);
  const adaptiveRegulation = computeAdaptiveRegulation(perPillarLinguistics);

  // --- Step 3: AI-powered marker scoring with adaptive thinking ---
  const markerScoringPrompt = `${ADAPTABILITY_SCORING_SYSTEM_PROMPT}

PARTICIPANT: ${participant.name}, ${participant.role} at ${participant.company} (${participant.industry}, team: ${participant.teamSize})

LINGUISTIC ANALYSIS (pre-computed):
- P1 hedging density: ${perPillarLinguistics.pillar_1.hedgingDensity}/100 words
- P2 hedging density: ${perPillarLinguistics.pillar_2.hedgingDensity}/100 words
- P3 hedging density: ${perPillarLinguistics.pillar_3.hedgingDensity}/100 words
- P4 hedging density: ${perPillarLinguistics.pillar_4.hedgingDensity}/100 words
- Narrative specificity: P1=${perPillarLinguistics.pillar_1.narrativeSpecificityIndex}, P2=${perPillarLinguistics.pillar_2.narrativeSpecificityIndex}, P3=${perPillarLinguistics.pillar_3.narrativeSpecificityIndex}, P4=${perPillarLinguistics.pillar_4.narrativeSpecificityIndex}
- Adaptive Regulation pre-computation: ${adaptiveRegulation.compositeRating}/4 (${ADAPTIVE_REGULATION_LEVELS[adaptiveRegulation.compositeRating].label})

TRANSCRIPT:
${transcript}

Score ALL behavioral markers. Return ONLY valid JSON matching the exact schema below.`;

  const scoringResponse = await client.messages.create({
    model: MODEL_SCORING,
    max_tokens: 8000,
    thinking: { type: "enabled", budget_tokens: 4000 },
    system: markerScoringPrompt,
    messages: [
      {
        role: "user",
        content: `Score every behavioral marker (1A through 4E, plus 2G) for this interview transcript. For each marker, provide a score (1-4), evidence (direct quote from transcript), and confidence (high/medium/low).

Also classify:
- Meaning structure from P2_Q4 (status/safety/meaning/deep_attachment/ambiguous)
- System vs individual from P3_Q4
- Micro-moment response (leans_in/acknowledges/deflects/shuts_down)
- Self-deception probe response (yes/no/ambiguous)
- Cross-pillar observations
- Content-process congruence
- Intervention routing recommendations

Return JSON:
{
  "contentMarkers": {
    "1A": { "score": 1-4, "evidence": "...", "confidence": "high|medium|low" },
    "1B": { ... }, "1C": { ... }, "1D": { ... },
    "2A": { ... }, "2B": { ... }, "2C": { ... }, "2D": { ... }, "2F": { ... },
    "3A": { ... }, "3B": { ... }, "3C": { ... }, "3D": { ... },
    "4A": { ... }, "4B": { ... }, "4C": { ... }, "4D": { ... }
  },
  "processMarkers": {
    "1E": { "score": 1-4, "evidence": "...", "confidence": "high|medium|low" },
    "1F": { ... }, "2E": { ... }, "3E": { ... }, "4E": { ... }
  },
  "meaningStructure": {
    "classification": "status|safety|meaning|deep_attachment|ambiguous",
    "evidence": "...",
    "confidence": "high|medium|low",
    "humanReviewNeeded": true|false
  },
  "systemVsIndividual": {
    "classification": "system_permissive|system_moderate|system_restrictive_tried|system_restrictive_self_censored",
    "evidence": "...",
    "confidence": "high|medium|low"
  },
  "domainDifferential": {
    "primaryDomain": "...",
    "differentialLevel": "low|moderate|high",
    "comfortDomainDescription": "...",
    "discomfortDomainDescription": "..."
  },
  "crossPillarObservations": {
    "specificityGradient": "...",
    "emotionalTemperatureShifts": "...",
    "contradictionPatterns": ["..."],
    "storyRecurrence": true|false,
    "microMomentResponse": "leans_in|acknowledges|deflects|shuts_down",
    "selfDeceptionProbeResponse": "yes|no|ambiguous",
    "selfDeceptionProbeVerbatim": "..."
  },
  "contentProcessCongruence": {
    "congruent": true|false,
    "incongruenceDescription": "..."
  },
  "interventionRouting": {
    "primaryPillarFocus": "learning_velocity|unlearning_readiness|adaptive_agency|beginner_tolerance",
    "play0Recommended": true|false,
    "play0Rationale": "...",
    "pillar1Interventions": ["..."],
    "pillar2Interventions": ["..."],
    "pillar2MeaningRoute": "...",
    "pillar3Interventions": ["..."],
    "pillar3SystemFlag": true|false,
    "pillar4Interventions": ["..."],
    "crossPillarPriority": "...",
    "championCandidate": true|false,
    "coachingIntensiveFlag": true|false,
    "humanReviewFlags": ["..."]
  },
  "executiveSummary": "2-3 paragraphs",
  "detailedNarrative": "full analysis"
}`,
      },
    ],
  });

  // Extract response text (skip thinking blocks)
  let scoringText = "";
  for (const block of scoringResponse.content) {
    if (block.type === "text") {
      scoringText = block.text;
      break;
    }
  }

  // Parse the scoring response
  let scoringData: Record<string, unknown>;
  try {
    const cleaned = scoringText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    scoringData = JSON.parse(cleaned);
  } catch {
    console.error("[ADAPTABILITY] Failed to parse scoring response, using defaults");
    scoringData = buildDefaultScoringData();
  }

  // --- Step 4: Assemble the complete analysis ---
  const cm = scoringData.contentMarkers as Record<string, MarkerScore> || {};
  const pm = scoringData.processMarkers as Record<string, MarkerScore> || {};

  // Build pillar content scores
  const pillar1 = buildPillarScore<P1ContentScores>(
    { "1A": cm["1A"], "1B": cm["1B"], "1C": cm["1C"], "1D": cm["1D"] },
    4 // 4 markers, max 16, scaled to 0-25
  );
  const pillar2 = buildPillarScore<P2ContentScores>(
    { "2A": cm["2A"], "2B": cm["2B"], "2C": cm["2C"], "2D": cm["2D"], "2F": cm["2F"] },
    5 // 5 markers, max 20, scaled to 0-25
  );
  const pillar3 = buildPillarScore<P3ContentScores>(
    { "3A": cm["3A"], "3B": cm["3B"], "3C": cm["3C"], "3D": cm["3D"] },
    4
  );
  const pillar4 = buildPillarScore<P4ContentScores>(
    { "4A": cm["4A"], "4B": cm["4B"], "4C": cm["4C"], "4D": cm["4D"] },
    4
  );

  // Build process scores
  const processScores: ProcessScores = {
    pillar_1: {
      "1E": pm["1E"] || defaultMarker(),
      "1F": pm["1F"] || defaultMarker(),
    },
    pillar_2: {
      "2E": pm["2E"] || defaultMarker(),
    },
    pillar_3: {
      "3E": pm["3E"] || defaultMarker(),
    },
    pillar_4: {
      "4E": pm["4E"] || defaultMarker(),
    },
  };

  // Extract derived constructs
  const meaningStructure = (scoringData.meaningStructure || {
    classification: "ambiguous",
    evidence: "Unable to classify",
    confidence: "low",
    humanReviewNeeded: true,
  }) as MeaningStructure;

  const systemVsIndividual = (scoringData.systemVsIndividual || {
    classification: "system_moderate",
    evidence: "Insufficient data",
    confidence: "low",
  }) as SystemVsIndividual;

  const domainDifferential = (scoringData.domainDifferential || {
    primaryDomain: "unknown",
    differentialLevel: "low",
    comfortDomainDescription: "",
    discomfortDomainDescription: "",
  }) as DomainDifferential;

  const crossPillarObservations = (scoringData.crossPillarObservations || {
    specificityGradient: "",
    emotionalTemperatureShifts: "",
    contradictionPatterns: [],
    storyRecurrence: false,
    microMomentResponse: "acknowledges",
    selfDeceptionProbeResponse: "ambiguous",
    selfDeceptionProbeVerbatim: "",
  }) as CrossPillarObservations;

  const contentProcessCongruence = (scoringData.contentProcessCongruence || {
    congruent: true,
    incongruenceDescription: "",
  }) as ContentProcessCongruence;

  const interventionRouting = (scoringData.interventionRouting || buildDefaultRouting(pillar1.compositeScore, pillar2.compositeScore, pillar3.compositeScore, pillar4.compositeScore)) as InterventionRouting;

  // Collect all marker confidences for human review assessment
  const allConfidences: MarkerConfidence[] = [
    ...Object.values(cm).map((m: unknown) => (m as MarkerScore)?.confidence || "low"),
    ...Object.values(pm).map((m: unknown) => (m as MarkerScore)?.confidence || "low"),
  ];

  const pillarScores: Record<AdaptabilityPillar, number> = {
    learning_velocity: pillar1.compositeScore,
    unlearning_readiness: pillar2.compositeScore,
    adaptive_agency: pillar3.compositeScore,
    beginner_tolerance: pillar4.compositeScore,
  };

  // Assess Play 0
  const play0 = assessPlay0(
    adaptiveRegulation.compositeRating,
    pillarScores,
    meaningStructure.classification
  );
  if (play0.recommended) {
    interventionRouting.play0Recommended = true;
    interventionRouting.play0Rationale = play0.rationale;
  }

  // Assess human review needs
  const humanReview = assessHumanReview(
    allConfidences,
    adaptiveRegulation.compositeRating,
    meaningStructure.classification,
    contentProcessCongruence.congruent,
    pillarScores,
    crossPillarObservations.selfDeceptionProbeResponse,
    pillar1.compositeScore + pillar2.compositeScore + pillar3.compositeScore + pillar4.compositeScore
  );

  const humanReviewFlags: HumanReviewFlag[] = humanReview.triggers.map((trigger) => ({
    trigger,
    description: getHumanReviewDescription(trigger),
    severity: getHumanReviewSeverity(trigger),
  }));

  // Detect cross-pillar patterns
  const matchedPatterns = CROSS_PILLAR_PATTERNS.filter((p) => p.matchFn(pillarScores));

  const overallScore = pillar1.compositeScore + pillar2.compositeScore + pillar3.compositeScore + pillar4.compositeScore;

  // Calculate session duration from first/last response timestamps
  const timestamps = responses.map((r) => new Date(r.timestamp).getTime()).filter((t) => !isNaN(t));
  const durationMinutes = timestamps.length >= 2
    ? Math.round((Math.max(...timestamps) - Math.min(...timestamps)) / 60000)
    : 0;

  return {
    sessionId,
    participantId: sessionId, // Use session ID as participant ID for now
    organizationId,
    sessionDate: new Date().toISOString(),
    sessionDurationMinutes: durationMinutes,
    format: "agentic",
    protocolVersion: "2.0",

    pillar1,
    pillar2,
    pillar3,
    pillar4,

    processScores,

    adaptiveRegulation,
    meaningStructure,
    systemVsIndividual,
    domainDifferential,

    crossPillarObservations,
    contentProcessCongruence,

    perPillarLinguistics,

    interventionRouting,

    humanReviewFlags,
    humanReviewRequired: humanReview.required,

    overallAdaptabilityScore: overallScore,
    executiveSummary: (scoringData.executiveSummary as string) || "Analysis pending manual review.",
    detailedNarrative: (scoringData.detailedNarrative as string) || "",
  };
}

// --- Profile Generation ---

export async function generateAdaptabilityProfile(
  client: Anthropic,
  analysis: AdaptabilityAnalysis,
  participant: { name: string; role: string; company: string; industry: string },
): Promise<AdaptabilityProfile> {
  const pillarScoresArray = [
    { pillar: "learning_velocity" as AdaptabilityPillar, score: analysis.pillar1.compositeScore },
    { pillar: "unlearning_readiness" as AdaptabilityPillar, score: analysis.pillar2.compositeScore },
    { pillar: "adaptive_agency" as AdaptabilityPillar, score: analysis.pillar3.compositeScore },
    { pillar: "beginner_tolerance" as AdaptabilityPillar, score: analysis.pillar4.compositeScore },
  ];

  const profileScores = pillarScoresArray.map((ps) => {
    let status: "strength" | "developing" | "growth_edge";
    if (ps.score >= 18) status = "strength";
    else if (ps.score >= 12) status = "developing";
    else status = "growth_edge";

    return {
      pillar: ps.pillar,
      label: ADAPTABILITY_PILLAR_LABELS[ps.pillar],
      score: ps.score,
      status,
    };
  });

  // Generate the narrative portions using Claude
  const profilePrompt = `Generate a personal Adaptability Profile for ${participant.name} (${participant.role} at ${participant.company}, ${participant.industry}).

SCORES:
- Learning Velocity: ${analysis.pillar1.compositeScore}/25
- Unlearning Readiness: ${analysis.pillar2.compositeScore}/25
- Adaptive Agency: ${analysis.pillar3.compositeScore}/25
- Beginner Tolerance: ${analysis.pillar4.compositeScore}/25
- Overall: ${analysis.overallAdaptabilityScore}/100
- Adaptive Regulation: ${ADAPTIVE_REGULATION_LEVELS[analysis.adaptiveRegulation.compositeRating].label}
- Meaning Structure: ${analysis.meaningStructure.classification}
${analysis.interventionRouting.play0Recommended ? "- PLAY 0 RECOMMENDED: Stabilize before developing" : ""}

ANALYSIS SUMMARY:
${analysis.executiveSummary}

INTERVENTION ROUTING:
${JSON.stringify(analysis.interventionRouting, null, 2)}

REPORT DESIGN PRINCIPLES:
1. Strengths lead — open with what's working
2. Narrative over numbers — scores contextualized with behavioral descriptions
3. Development, not judgment — every score framed as development opportunity
4. Theirs, not the company's — personal and private, not institutional
5. Actionable — every section ends with "what you can do about this"
6. Domain-aware — recommendations specific to domains where participant is strong vs rigid

Return ONLY valid JSON:
{
  "strengths": [{ "pillar": "...", "behavioralDescription": "...", "evidence": "...", "leverageAdvice": "..." }],
  "developmentEdges": [{ "pillar": "...", "behavioralDescription": "...", "observation": "...", "whyItMatters": "...", "researchInsight": "...", "normalization": "...", "domainSpecific": "..." }],
  "developmentPlan": [
    { "phase": 1, "weekRange": "Weeks 1-4", "theme": "Awareness & Small Experiments", "actions": ["..."], "timeCommitment": "30-60 min/week", "expectedExperience": "...", "reflectionQuestion": "..." },
    { "phase": 2, "weekRange": "Weeks 5-8", "theme": "Behavioral Practice", "actions": ["..."], "timeCommitment": "...", "expectedExperience": "...", "reflectionQuestion": "..." },
    { "phase": 3, "weekRange": "Weeks 9-12", "theme": "Integration & Habit Building", "actions": ["..."], "timeCommitment": "...", "expectedExperience": "...", "reflectionQuestion": "..." }
  ],
  "careerContext": "paragraph connecting profile to career resilience",
  "reassessmentNote": "encouraging note about the 90-day re-assessment"
}`;

  const profileResponse = await client.messages.create({
    model: MODEL_SCORING,
    max_tokens: 4000,
    thinking: { type: "enabled", budget_tokens: 2000 },
    system: "You generate personal Adaptability Profiles that are warm, honest, actionable, and strengths-led. Return ONLY valid JSON.",
    messages: [{ role: "user", content: profilePrompt }],
  });

  let profileText = "";
  for (const block of profileResponse.content) {
    if (block.type === "text") {
      profileText = block.text;
      break;
    }
  }

  let profileData: Record<string, unknown>;
  try {
    const cleaned = profileText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    profileData = JSON.parse(cleaned);
  } catch {
    console.error("[ADAPTABILITY] Failed to parse profile response");
    profileData = {
      strengths: [],
      developmentEdges: [],
      developmentPlan: [],
      careerContext: "Your adaptability profile reveals a unique combination of strengths that position you well for navigating change.",
      reassessmentNote: "Your 90-day re-assessment will measure meaningful progress on your development edge.",
    };
  }

  return {
    participantId: analysis.sessionId,
    sessionId: analysis.sessionId,
    generatedAt: new Date().toISOString(),
    pillarScores: profileScores,
    strengths: (profileData.strengths || []) as AdaptabilityProfile["strengths"],
    developmentEdges: (profileData.developmentEdges || []) as AdaptabilityProfile["developmentEdges"],
    developmentPlan: (profileData.developmentPlan || []) as AdaptabilityProfile["developmentPlan"],
    careerContext: (profileData.careerContext as string) || "",
    reassessmentNote: (profileData.reassessmentNote as string) || "",
    play0Recommended: analysis.interventionRouting.play0Recommended,
    adaptiveRegulationNote: analysis.adaptiveRegulation.compositeRating <= 2
      ? `Your Adaptive Regulation was assessed as ${ADAPTIVE_REGULATION_LEVELS[analysis.adaptiveRegulation.compositeRating].label}. ${ADAPTIVE_REGULATION_LEVELS[analysis.adaptiveRegulation.compositeRating].implication}`
      : undefined,
  };
}

// --- Helper Functions ---

function defaultMarker(): MarkerScore {
  return { score: 2, evidence: "Insufficient data for scoring", confidence: "low" };
}

function buildPillarScore<T>(markers: Record<string, MarkerScore | undefined>, markerCount: number): PillarContentScore<T> {
  const safeMarkers: Record<string, MarkerScore> = {};
  let totalScore = 0;
  let lowestConfidence: MarkerConfidence = "high";

  for (const [key, marker] of Object.entries(markers)) {
    const m = marker || defaultMarker();
    safeMarkers[key] = m;
    totalScore += m.score;
    if (m.confidence === "low") lowestConfidence = "low";
    else if (m.confidence === "medium" && lowestConfidence !== "low") lowestConfidence = "medium";
  }

  const maxScore = markerCount * 4;
  const compositeScore = Math.round((totalScore / maxScore) * 25 * 10) / 10;

  return {
    markers: safeMarkers as T,
    compositeScore,
    confidence: lowestConfidence,
  };
}

function buildDefaultScoringData(): Record<string, unknown> {
  const dm = () => ({ score: 2, evidence: "Unable to score — analysis requires manual review", confidence: "low" });
  return {
    contentMarkers: {
      "1A": dm(), "1B": dm(), "1C": dm(), "1D": dm(),
      "2A": dm(), "2B": dm(), "2C": dm(), "2D": dm(), "2F": dm(),
      "3A": dm(), "3B": dm(), "3C": dm(), "3D": dm(),
      "4A": dm(), "4B": dm(), "4C": dm(), "4D": dm(),
    },
    processMarkers: {
      "1E": dm(), "1F": dm(), "2E": dm(), "3E": dm(), "4E": dm(),
    },
    meaningStructure: { classification: "ambiguous", evidence: "", confidence: "low", humanReviewNeeded: true },
    systemVsIndividual: { classification: "system_moderate", evidence: "", confidence: "low" },
    domainDifferential: { primaryDomain: "unknown", differentialLevel: "low", comfortDomainDescription: "", discomfortDomainDescription: "" },
    crossPillarObservations: {
      specificityGradient: "", emotionalTemperatureShifts: "", contradictionPatterns: [],
      storyRecurrence: false, microMomentResponse: "acknowledges",
      selfDeceptionProbeResponse: "ambiguous", selfDeceptionProbeVerbatim: "",
    },
    contentProcessCongruence: { congruent: true, incongruenceDescription: "" },
    interventionRouting: buildDefaultRouting(12.5, 12.5, 12.5, 12.5),
    executiveSummary: "Automated analysis could not complete. Manual review required.",
    detailedNarrative: "",
  };
}

function buildDefaultRouting(p1: number, p2: number, p3: number, p4: number): InterventionRouting {
  const scores = [
    { pillar: "learning_velocity" as AdaptabilityPillar, score: p1 },
    { pillar: "unlearning_readiness" as AdaptabilityPillar, score: p2 },
    { pillar: "adaptive_agency" as AdaptabilityPillar, score: p3 },
    { pillar: "beginner_tolerance" as AdaptabilityPillar, score: p4 },
  ];
  const lowest = scores.reduce((a, b) => (a.score < b.score ? a : b));

  return {
    primaryPillarFocus: lowest.pillar,
    play0Recommended: false,
    play0Rationale: "",
    pillar1Interventions: [],
    pillar2Interventions: [],
    pillar2MeaningRoute: "",
    pillar3Interventions: [],
    pillar3SystemFlag: false,
    pillar4Interventions: [],
    crossPillarPriority: "",
    championCandidate: false,
    coachingIntensiveFlag: false,
    humanReviewFlags: [],
  };
}

function getHumanReviewDescription(trigger: HumanReviewTrigger): string {
  const descriptions: Record<HumanReviewTrigger, string> = {
    low_marker_confidence: "One or more behavioral markers scored with low confidence — insufficient evidence for reliable scoring.",
    adaptive_regulation_saturated: "Adaptive Regulation assessed as Saturated — highest-stakes assessment requiring human confirmation.",
    meaning_structure_ambiguous: "Meaning structure could not be reliably classified — wrong classification routes to wrong intervention.",
    content_process_incongruence: "Content scores and process scores diverge significantly — possible performance or gaming.",
    all_pillars_below_10: "All pillar scores below 10 — extremely low scores need human confirmation before routing.",
    participant_requested: "Participant explicitly requested human review during the session.",
    participant_disengaged: "Participant showed signs of disengagement — multiple non-responses or very short answers throughout.",
    self_deception_high_scores: "Self-deception probe response was 'yes' combined with significantly above-average scores — may indicate unreliable scores.",
  };
  return descriptions[trigger];
}

function getHumanReviewSeverity(trigger: HumanReviewTrigger): "advisory" | "required" {
  const required: HumanReviewTrigger[] = [
    "adaptive_regulation_saturated",
    "meaning_structure_ambiguous",
    "all_pillars_below_10",
    "participant_requested",
  ];
  return required.includes(trigger) ? "required" : "advisory";
}
