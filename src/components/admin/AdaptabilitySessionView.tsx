import { useMemo } from "react";
import type {
  AdaptabilityAnalysis,
  AdaptabilityPillar,
  MarkerScore,
  AllMarkerCode,
  AdaptiveRegulationRating,
  HumanReviewFlag,
} from "../../lib/types";

// ============================================================
// Adaptability Session View — Admin Component
// Renders adaptability-specific analysis data within SessionDrawer
// ============================================================

interface AdaptabilitySessionViewProps {
  analysis: AdaptabilityAnalysis;
}

const PILLAR_LABELS: Record<AdaptabilityPillar, string> = {
  learning_velocity: "Learning Velocity",
  unlearning_readiness: "Unlearning Readiness",
  adaptive_agency: "Adaptive Agency",
  beginner_tolerance: "Beginner Tolerance",
};

const PILLAR_COLORS: Record<AdaptabilityPillar, string> = {
  learning_velocity: "#34d399",
  unlearning_readiness: "#a78bfa",
  adaptive_agency: "#60a5fa",
  beginner_tolerance: "#fbbf24",
};

const REGULATION_LABELS: Record<AdaptiveRegulationRating, { label: string; color: string }> = {
  4: { label: "High", color: "text-emerald-400" },
  3: { label: "Moderate", color: "text-blue-400" },
  2: { label: "Low", color: "text-amber-400" },
  1: { label: "Saturated", color: "text-red-400" },
};

function MarkerScoreRow({ code, marker }: { code: string; marker: MarkerScore }) {
  const confidenceColor =
    marker.confidence === "high"
      ? "text-emerald-400"
      : marker.confidence === "medium"
      ? "text-amber-400"
      : "text-red-400";

  return (
    <div className="flex items-start gap-3 py-2 border-b border-border last:border-0">
      <span className="text-muted-foreground font-mono text-xs w-6 flex-shrink-0 pt-0.5">
        {code}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5">
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className={`w-4 h-4 rounded-sm text-[10px] flex items-center justify-center ${
                  s <= marker.score
                    ? "bg-emerald-500/30 text-emerald-300"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {s}
              </div>
            ))}
          </div>
          <span className={`text-[10px] ${confidenceColor}`}>
            {marker.confidence}
          </span>
        </div>
        <p className="text-muted-foreground text-[11px] mt-1 leading-relaxed truncate">
          {marker.evidence}
        </p>
      </div>
    </div>
  );
}

export default function AdaptabilitySessionView({ analysis }: AdaptabilitySessionViewProps) {
  const pillars = useMemo(
    () => [
      { key: "learning_velocity" as AdaptabilityPillar, label: "P1: Learning Velocity", score: analysis.pillar1.compositeScore, markers: analysis.pillar1.markers },
      { key: "unlearning_readiness" as AdaptabilityPillar, label: "P2: Unlearning Readiness", score: analysis.pillar2.compositeScore, markers: analysis.pillar2.markers },
      { key: "adaptive_agency" as AdaptabilityPillar, label: "P3: Adaptive Agency", score: analysis.pillar3.compositeScore, markers: analysis.pillar3.markers },
      { key: "beginner_tolerance" as AdaptabilityPillar, label: "P4: Beginner Tolerance", score: analysis.pillar4.compositeScore, markers: analysis.pillar4.markers },
    ],
    [analysis]
  );

  const regulation = REGULATION_LABELS[analysis.adaptiveRegulation.compositeRating];

  return (
    <div className="space-y-6">
      {/* Overall Score + Key Metrics */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-muted p-3 text-center">
          <p className="text-2xl font-semibold text-foreground">
            {analysis.overallAdaptabilityScore}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">Overall / 100</p>
        </div>
        <div className="rounded-lg border border-border bg-muted p-3 text-center">
          <p className={`text-lg font-medium ${regulation.color}`}>
            {regulation.label}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">Adaptive Regulation</p>
        </div>
        <div className="rounded-lg border border-border bg-muted p-3 text-center">
          <p className="text-lg font-medium text-foreground/80 capitalize">
            {analysis.meaningStructure.classification.replace(/_/g, " ")}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">Meaning Structure</p>
        </div>
      </div>

      {/* Play 0 Alert */}
      {analysis.interventionRouting.play0Recommended && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
          <p className="text-red-400 text-xs font-medium">
            Play 0 Recommended — Stabilize Before Developing
          </p>
          <p className="text-muted-foreground text-[11px] mt-1">
            {analysis.interventionRouting.play0Rationale}
          </p>
        </div>
      )}

      {/* Human Review Flags */}
      {analysis.humanReviewFlags.length > 0 && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 space-y-2">
          <p className="text-amber-400 text-xs font-medium">
            Human Review {analysis.humanReviewRequired ? "Required" : "Advisory"}
          </p>
          {analysis.humanReviewFlags.map((flag, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className={`text-[10px] px-1 py-0.5 rounded ${
                flag.severity === "required"
                  ? "bg-red-500/20 text-red-400"
                  : "bg-amber-500/20 text-amber-400"
              }`}>
                {flag.severity}
              </span>
              <p className="text-muted-foreground text-[11px]">{flag.description}</p>
            </div>
          ))}
        </div>
      )}

      {/* 4-Pillar Scores */}
      <div className="space-y-3">
        <h4 className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
          Pillar Scores
        </h4>
        {pillars.map((pillar) => (
          <div key={pillar.key} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs">{pillar.label}</span>
              <span className="text-muted-foreground font-mono text-xs">
                {pillar.score}/25
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(pillar.score / 25) * 100}%`,
                  backgroundColor: PILLAR_COLORS[pillar.key],
                  opacity: 0.7,
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Content Markers Detail (collapsible per pillar) */}
      <div className="space-y-3">
        <h4 className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
          Behavioral Markers
        </h4>
        {pillars.map((pillar) => (
          <details key={pillar.key} className="rounded-lg border border-border bg-muted">
            <summary className="px-3 py-2 cursor-pointer text-muted-foreground text-xs hover:text-foreground/90 transition-colors">
              {pillar.label} — Content Markers
            </summary>
            <div className="px-3 pb-2">
              {Object.entries(pillar.markers as unknown as Record<string, MarkerScore>).map(([code, marker]) => (
                <MarkerScoreRow key={code} code={code} marker={marker} />
              ))}
            </div>
          </details>
        ))}
      </div>

      {/* Process Scores */}
      <details className="rounded-lg border border-border bg-muted">
        <summary className="px-3 py-2 cursor-pointer text-muted-foreground text-xs hover:text-foreground/90 transition-colors">
          Process Markers
        </summary>
        <div className="px-3 pb-2">
          <MarkerScoreRow code="1E" marker={analysis.processScores.pillar_1["1E"]} />
          <MarkerScoreRow code="1F" marker={analysis.processScores.pillar_1["1F"]} />
          <MarkerScoreRow code="2E" marker={analysis.processScores.pillar_2["2E"]} />
          <MarkerScoreRow code="3E" marker={analysis.processScores.pillar_3["3E"]} />
          <MarkerScoreRow code="4E" marker={analysis.processScores.pillar_4["4E"]} />
        </div>
      </details>

      {/* Derived Constructs */}
      <div className="space-y-3">
        <h4 className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
          Derived Constructs
        </h4>

        {/* Adaptive Regulation Details */}
        <div className="rounded-lg border border-border bg-muted p-3 space-y-2">
          <p className="text-muted-foreground text-xs font-medium">Adaptive Regulation</p>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div>
              <span className="text-muted-foreground">Specificity diff:</span>{" "}
              <span className="text-muted-foreground">
                {analysis.adaptiveRegulation.narrativeSpecificityDifferential.toFixed(3)}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Hedging diff:</span>{" "}
              <span className="text-muted-foreground">
                {analysis.adaptiveRegulation.hedgingFrequencyDifferential.toFixed(2)}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Elaboration:</span>{" "}
              <span className="text-muted-foreground">
                {analysis.adaptiveRegulation.elaborationTrajectory}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Self-correction ratio:</span>{" "}
              <span className="text-muted-foreground">
                {analysis.adaptiveRegulation.selfCorrectionRatio.toFixed(3)}
              </span>
            </div>
          </div>
        </div>

        {/* System vs Individual */}
        <div className="rounded-lg border border-border bg-muted p-3 space-y-1">
          <p className="text-muted-foreground text-xs font-medium">System vs. Individual</p>
          <p className="text-muted-foreground text-[11px] capitalize">
            {analysis.systemVsIndividual.classification.replace(/_/g, " ")}
          </p>
          <p className="text-muted-foreground text-[10px]">{analysis.systemVsIndividual.evidence}</p>
        </div>

        {/* Cross-Pillar Observations */}
        <details className="rounded-lg border border-border bg-muted">
          <summary className="px-3 py-2 cursor-pointer text-muted-foreground text-xs hover:text-foreground/90">
            Cross-Pillar Observations
          </summary>
          <div className="px-3 pb-3 space-y-2 text-[11px]">
            <div>
              <span className="text-muted-foreground">Micro-moment:</span>{" "}
              <span className="text-muted-foreground capitalize">
                {analysis.crossPillarObservations.microMomentResponse.replace(/_/g, " ")}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Self-deception probe:</span>{" "}
              <span className="text-muted-foreground">
                {analysis.crossPillarObservations.selfDeceptionProbeResponse}
              </span>
            </div>
            {analysis.crossPillarObservations.selfDeceptionProbeVerbatim && (
              <div>
                <span className="text-muted-foreground">Verbatim:</span>{" "}
                <span className="text-muted-foreground italic">
                  &ldquo;{analysis.crossPillarObservations.selfDeceptionProbeVerbatim}&rdquo;
                </span>
              </div>
            )}
            <div>
              <span className="text-muted-foreground">Content-process:</span>{" "}
              <span className="text-muted-foreground">
                {analysis.contentProcessCongruence.congruent ? "Congruent" : "Incongruent"}
              </span>
            </div>
            {!analysis.contentProcessCongruence.congruent && (
              <p className="text-muted-foreground text-[10px]">
                {analysis.contentProcessCongruence.incongruenceDescription}
              </p>
            )}
            {analysis.crossPillarObservations.contradictionPatterns.length > 0 && (
              <div>
                <span className="text-muted-foreground">Contradictions:</span>
                <ul className="mt-1 space-y-1">
                  {analysis.crossPillarObservations.contradictionPatterns.map((c, i) => (
                    <li key={i} className="text-muted-foreground text-[10px] pl-2">
                      - {c}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </details>
      </div>

      {/* Intervention Routing */}
      <details className="rounded-lg border border-border bg-muted">
        <summary className="px-3 py-2 cursor-pointer text-muted-foreground text-xs hover:text-foreground/90">
          Intervention Routing
        </summary>
        <div className="px-3 pb-3 space-y-2 text-[11px]">
          <div>
            <span className="text-muted-foreground">Primary focus:</span>{" "}
            <span className="text-muted-foreground capitalize">
              {analysis.interventionRouting.primaryPillarFocus.replace(/_/g, " ")}
            </span>
          </div>
          {analysis.interventionRouting.championCandidate && (
            <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
              Champion Candidate
            </span>
          )}
          {analysis.interventionRouting.coachingIntensiveFlag && (
            <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 ml-1">
              Coaching Intensive
            </span>
          )}
          {analysis.interventionRouting.pillar2MeaningRoute && (
            <div>
              <span className="text-muted-foreground">P2 meaning route:</span>{" "}
              <span className="text-muted-foreground">{analysis.interventionRouting.pillar2MeaningRoute}</span>
            </div>
          )}
          {analysis.interventionRouting.pillar3SystemFlag && (
            <div className="text-amber-400/60">System barriers flagged in P3</div>
          )}
          {analysis.interventionRouting.crossPillarPriority && (
            <div>
              <span className="text-muted-foreground">Cross-pillar priority:</span>{" "}
              <span className="text-muted-foreground">{analysis.interventionRouting.crossPillarPriority}</span>
            </div>
          )}
        </div>
      </details>

      {/* Executive Summary */}
      {analysis.executiveSummary && (
        <div className="space-y-2">
          <h4 className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
            Executive Summary
          </h4>
          <p className="text-muted-foreground text-xs leading-relaxed">
            {analysis.executiveSummary}
          </p>
        </div>
      )}
    </div>
  );
}
