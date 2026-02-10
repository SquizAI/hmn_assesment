import type { AssessmentType } from "../../lib/types";

// ============================================================
// Builder Phase Types
// ============================================================

export type BuilderPhase = "purpose" | "framework" | "questions" | "scoring" | "review";

export function inferPhase(assessment: AssessmentType | null): BuilderPhase {
  if (!assessment) return "purpose";
  if (!assessment.phases?.length || !assessment.sections?.length) return "framework";
  if (!assessment.questions?.length) return "questions";

  const hasWeights = assessment.questions.some((q) => q.weight > 0);
  const hasDimMappings = assessment.questions.some(
    (q) => q.scoringDimensions?.length > 0,
  );
  if (!hasWeights || !hasDimMappings) return "scoring";

  return "review";
}

// ============================================================
// Phase Definitions
// ============================================================

interface PhaseConfig {
  id: BuilderPhase;
  label: string;
  description: string;
  icon: string;
}

const PHASES: PhaseConfig[] = [
  {
    id: "purpose",
    label: "Purpose & Context",
    description: "Define what this assessment measures and who takes it",
    icon: "🎯",
  },
  {
    id: "framework",
    label: "Framework",
    description: "Design phases, sections, and scoring dimensions",
    icon: "🏗",
  },
  {
    id: "questions",
    label: "Question Design",
    description: "Build questions with proper input types and mapping",
    icon: "💬",
  },
  {
    id: "scoring",
    label: "Scoring & Calibration",
    description: "Calibrate weights and verify dimension coverage",
    icon: "⚖️",
  },
  {
    id: "review",
    label: "Review & Activate",
    description: "Preview, test, and finalize the assessment",
    icon: "✅",
  },
];

const PHASE_ORDER: BuilderPhase[] = ["purpose", "framework", "questions", "scoring", "review"];

function getPhaseIndex(phase: BuilderPhase): number {
  return PHASE_ORDER.indexOf(phase);
}

// ============================================================
// Phase Summary Helpers
// ============================================================

function getPhaseSummary(
  phase: BuilderPhase,
  assessment: AssessmentType | null,
): string | null {
  if (!assessment) return null;

  switch (phase) {
    case "purpose":
      return assessment.name || null;
    case "framework": {
      const parts: string[] = [];
      if (assessment.phases?.length) parts.push(`${assessment.phases.length} phases`);
      if (assessment.sections?.length) parts.push(`${assessment.sections.length} sections`);
      if (assessment.scoringDimensions?.length)
        parts.push(`${assessment.scoringDimensions.length} dimensions`);
      return parts.length > 0 ? parts.join(", ") : null;
    }
    case "questions":
      return assessment.questions?.length
        ? `${assessment.questions.length} questions`
        : null;
    case "scoring": {
      const withWeights = assessment.questions?.filter((q) => q.weight > 0).length ?? 0;
      const withDims = assessment.questions?.filter(
        (q) => q.scoringDimensions?.length > 0,
      ).length ?? 0;
      if (withWeights || withDims) {
        return `${withWeights} weighted, ${withDims} mapped`;
      }
      return null;
    }
    case "review":
      return assessment.status === "active" ? "Active" : null;
    default:
      return null;
  }
}

// ============================================================
// Component
// ============================================================

interface ProcessMapProps {
  currentPhase: BuilderPhase;
  assessment: AssessmentType | null;
  onPhaseClick: (phase: BuilderPhase) => void;
}

export default function ProcessMap({
  currentPhase,
  assessment,
  onPhaseClick,
}: ProcessMapProps) {
  const currentIdx = getPhaseIndex(currentPhase);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 pt-5 pb-4">
        <h3 className="text-xs font-semibold text-white/30 uppercase tracking-wider">
          Cascade Methodology
        </h3>
      </div>

      {/* Phase Steps */}
      <div className="flex-1 px-4 space-y-1">
        {PHASES.map((phase, idx) => {
          const phaseIdx = getPhaseIndex(phase.id);
          const isComplete = phaseIdx < currentIdx;
          const isActive = phase.id === currentPhase;
          const isPending = phaseIdx > currentIdx;
          const summary = isComplete ? getPhaseSummary(phase.id, assessment) : null;
          const canClick = isComplete; // can only click completed phases

          return (
            <div key={phase.id} className="relative">
              {/* Connecting line */}
              {idx < PHASES.length - 1 && (
                <div
                  className={`absolute left-[15px] top-[36px] w-[2px] h-[calc(100%_-_12px)] ${
                    isComplete ? "bg-purple-500/40" : "bg-white/[0.06]"
                  }`}
                  style={isPending ? { backgroundImage: "repeating-linear-gradient(to bottom, transparent, transparent 3px, rgba(255,255,255,0.06) 3px, rgba(255,255,255,0.06) 6px)" } : undefined}
                />
              )}

              <button
                onClick={() => canClick && onPhaseClick(phase.id)}
                disabled={!canClick}
                className={`
                  relative w-full text-left flex items-start gap-3 px-2 py-2.5 rounded-xl transition-all
                  ${isActive ? "bg-purple-500/10 border border-purple-500/20" : "border border-transparent"}
                  ${canClick ? "hover:bg-white/[0.04] cursor-pointer" : "cursor-default"}
                  ${isPending ? "opacity-40" : ""}
                `}
              >
                {/* Status indicator */}
                <div
                  className={`
                    shrink-0 w-[30px] h-[30px] rounded-lg flex items-center justify-center text-sm
                    ${isComplete ? "bg-purple-500/20 text-purple-300" : ""}
                    ${isActive ? "bg-purple-500/30 text-purple-200" : ""}
                    ${isPending ? "bg-white/[0.04] text-white/20" : ""}
                  `}
                >
                  {isComplete ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  ) : (
                    <span>{phase.icon}</span>
                  )}
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm font-medium leading-tight ${
                        isActive ? "text-white" : isComplete ? "text-white/70" : "text-white/30"
                      }`}
                    >
                      {phase.label}
                    </span>
                    {isActive && (
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500" />
                      </span>
                    )}
                  </div>

                  {/* Description or summary */}
                  {isActive && (
                    <p className="text-[11px] text-white/40 mt-0.5 leading-snug">
                      {phase.description}
                    </p>
                  )}
                  {isComplete && summary && (
                    <p className="text-[11px] text-purple-300/60 mt-0.5 leading-snug truncate">
                      {summary}
                    </p>
                  )}
                </div>
              </button>
            </div>
          );
        })}
      </div>

      {/* Footer: Phase counter */}
      <div className="px-4 pb-4 pt-2 border-t border-white/[0.06]">
        <div className="flex items-center justify-between text-[11px] text-white/25">
          <span>Phase {currentIdx + 1} of {PHASES.length}</span>
          <span>{Math.round(((currentIdx) / PHASES.length) * 100)}%</span>
        </div>
        <div className="mt-1.5 h-1 bg-white/[0.06] rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-purple-500/60 to-blue-500/60 rounded-full transition-all duration-500"
            style={{ width: `${(currentIdx / PHASES.length) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
