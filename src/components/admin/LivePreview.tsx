import type { AssessmentType } from "../../lib/types";
import type { BuilderPhase } from "./ProcessMap";

// ============================================================
// Input type display helpers
// ============================================================

const INPUT_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  ai_conversation: { label: "AI Chat", color: "bg-purple-500/20 text-purple-300 border-purple-500/30" },
  slider: { label: "Slider", color: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  buttons: { label: "Buttons", color: "bg-green-500/20 text-green-300 border-green-500/30" },
  multi_select: { label: "Multi", color: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30" },
  open_text: { label: "Text", color: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30" },
  voice: { label: "Voice", color: "bg-pink-500/20 text-pink-300 border-pink-500/30" },
};

function InputTypeBadge({ type }: { type: string }) {
  const config = INPUT_TYPE_LABELS[type] || { label: type, color: "bg-white/10 text-white/50 border-white/10" };
  return (
    <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded border ${config.color}`}>
      {config.label}
    </span>
  );
}

// ============================================================
// Component
// ============================================================

interface LivePreviewProps {
  assessment: AssessmentType | null;
  currentPhase: BuilderPhase;
}

export default function LivePreview({ assessment, currentPhase }: LivePreviewProps) {
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 pt-5 pb-3 border-b border-white/[0.06]">
        <h3 className="text-xs font-semibold text-white/30 uppercase tracking-wider">
          Live Preview
        </h3>
        {assessment && (
          <div className="flex items-center gap-2 mt-2">
            <span className="text-lg">{assessment.icon || "📋"}</span>
            <span className="text-sm font-medium text-white/80 truncate">{assessment.name}</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {!assessment ? (
          <EmptyPreview currentPhase={currentPhase} />
        ) : (
          <>
            {/* Purpose section — always show */}
            <PurposeSection assessment={assessment} />

            {/* Framework section — show when framework phase or later */}
            {(currentPhase !== "purpose") && (
              <FrameworkSection assessment={assessment} />
            )}

            {/* Questions section — show when questions phase or later */}
            {(currentPhase === "questions" || currentPhase === "scoring" || currentPhase === "review") && (
              <QuestionsSection assessment={assessment} />
            )}

            {/* Scoring section — show when scoring phase or later */}
            {(currentPhase === "scoring" || currentPhase === "review") && (
              <ScoringSection assessment={assessment} />
            )}

            {/* Review section */}
            {currentPhase === "review" && (
              <ReviewSection assessment={assessment} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Empty State
// ============================================================

function EmptyPreview({ currentPhase }: { currentPhase: BuilderPhase }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6">
      <div className="w-12 h-12 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mb-3">
        <span className="text-xl opacity-30">📋</span>
      </div>
      <p className="text-sm text-white/30 leading-relaxed">
        {currentPhase === "purpose"
          ? "Your assessment will appear here as the AI builds it. Start by describing what you want to measure."
          : "Waiting for assessment data..."}
      </p>
    </div>
  );
}

// ============================================================
// Section: Purpose
// ============================================================

function PurposeSection({ assessment }: { assessment: AssessmentType }) {
  return (
    <div className="space-y-2">
      <SectionHeader label="Purpose" icon="🎯" />
      <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-3 space-y-2">
        <div>
          <span className="text-[10px] text-white/25 uppercase tracking-wider">Name</span>
          <p className="text-sm text-white/80">{assessment.name || "—"}</p>
        </div>
        {assessment.description && (
          <div>
            <span className="text-[10px] text-white/25 uppercase tracking-wider">Description</span>
            <p className="text-xs text-white/50 leading-relaxed">{assessment.description}</p>
          </div>
        )}
        <div className="flex gap-4 text-[11px] text-white/40">
          <span>{assessment.estimatedMinutes || 15} min</span>
          <span className={`capitalize ${assessment.status === "active" ? "text-green-400" : assessment.status === "draft" ? "text-yellow-400" : "text-white/30"}`}>
            {assessment.status}
          </span>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Section: Framework
// ============================================================

function FrameworkSection({ assessment }: { assessment: AssessmentType }) {
  const phases = assessment.phases || [];
  const sections = assessment.sections || [];
  const dims = assessment.scoringDimensions || [];

  if (!phases.length && !sections.length && !dims.length) {
    return (
      <div className="space-y-2">
        <SectionHeader label="Framework" icon="🏗" />
        <GhostPlaceholder text="Phases, sections, and scoring dimensions will appear here" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <SectionHeader label="Framework" icon="🏗" />

      {/* Phases → Sections tree */}
      {phases.length > 0 && (
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-3 space-y-2">
          <span className="text-[10px] text-white/25 uppercase tracking-wider">
            Phases & Sections
          </span>
          {phases
            .sort((a, b) => a.order - b.order)
            .map((phase) => {
              const phaseSections = sections
                .filter((s) => s.phaseId === phase.id)
                .sort((a, b) => a.order - b.order);
              return (
                <div key={phase.id} className="ml-1">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-400/60" />
                    <span className="text-xs font-medium text-white/70">{phase.label}</span>
                  </div>
                  {phaseSections.map((sec) => (
                    <div key={sec.id} className="ml-5 flex items-center gap-1.5 mt-0.5">
                      <div className="w-1 h-1 rounded-full bg-white/20" />
                      <span className="text-[11px] text-white/40">{sec.label}</span>
                    </div>
                  ))}
                </div>
              );
            })}
        </div>
      )}

      {/* Scoring Dimensions */}
      {dims.length > 0 && (
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-3 space-y-2">
          <span className="text-[10px] text-white/25 uppercase tracking-wider">
            Scoring Dimensions
          </span>
          <div className="space-y-1.5">
            {dims.map((dim) => (
              <div key={dim.id} className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-white/60 truncate">{dim.label}</span>
                    <span className="text-[10px] text-white/30 tabular-nums ml-2">
                      {Math.round(dim.weight * 100)}%
                    </span>
                  </div>
                  <div className="mt-0.5 h-1 bg-white/[0.06] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-purple-500/50 to-blue-500/50 rounded-full transition-all duration-300"
                      style={{ width: `${dim.weight * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Section: Questions
// ============================================================

function QuestionsSection({ assessment }: { assessment: AssessmentType }) {
  const questions = assessment.questions || [];
  const sections = assessment.sections || [];

  if (!questions.length) {
    return (
      <div className="space-y-2">
        <SectionHeader label="Questions" icon="💬" count={0} />
        <GhostPlaceholder text="Questions will appear here as they are designed" />
      </div>
    );
  }

  // Group by section
  const sectionMap = new Map<string, typeof questions>();
  for (const q of questions) {
    const key = typeof q.section === "string" ? q.section : "unsorted";
    const arr = sectionMap.get(key) || [];
    arr.push(q);
    sectionMap.set(key, arr);
  }

  const sectionLabelMap = new Map(sections.map((s) => [s.id, s.label]));

  return (
    <div className="space-y-2">
      <SectionHeader label="Questions" icon="💬" count={questions.length} />
      {[...sectionMap.entries()].map(([sectionId, qs]) => (
        <div key={sectionId} className="space-y-1">
          <span className="text-[10px] text-white/25 uppercase tracking-wider pl-1">
            {sectionLabelMap.get(sectionId) || sectionId}
          </span>
          {qs.map((q, i) => (
            <div
              key={q.id}
              className="bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 animate-in fade-in slide-in-from-bottom-1 duration-300"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs text-white/70 leading-relaxed flex-1">{q.text}</p>
                <InputTypeBadge type={q.inputType} />
              </div>
              {(q.weight > 0 || q.scoringDimensions?.length > 0) && (
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  {q.weight > 0 && (
                    <span className="text-[10px] text-white/25">
                      w: {q.weight.toFixed(1)}
                    </span>
                  )}
                  {q.scoringDimensions?.map((dim) => (
                    <span
                      key={typeof dim === "string" ? dim : dim}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300/60 border border-purple-500/10"
                    >
                      {typeof dim === "string" ? dim.replace(/_/g, " ") : dim}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Section: Scoring
// ============================================================

function ScoringSection({ assessment }: { assessment: AssessmentType }) {
  const dims = assessment.scoringDimensions || [];
  const questions = assessment.questions || [];

  if (!dims.length) return null;

  // Build coverage: which dims have questions mapped
  const coverage = new Map<string, number>();
  for (const q of questions) {
    for (const d of q.scoringDimensions || []) {
      const key = typeof d === "string" ? d : d;
      coverage.set(key, (coverage.get(key) || 0) + 1);
    }
  }

  const totalWeight = dims.reduce((s, d) => s + d.weight, 0);

  return (
    <div className="space-y-2">
      <SectionHeader label="Scoring Coverage" icon="⚖️" />
      <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-3 space-y-2">
        {totalWeight > 0 && Math.abs(totalWeight - 1) > 0.01 && (
          <div className="text-[10px] text-yellow-400/70 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-2 py-1">
            Weights sum to {totalWeight.toFixed(2)} (should be 1.0)
          </div>
        )}
        {dims.map((dim) => {
          const count = coverage.get(dim.id) || 0;
          return (
            <div key={dim.id} className="flex items-center gap-2">
              <span className="text-[11px] text-white/50 min-w-0 flex-1 truncate">
                {dim.label}
              </span>
              <span className="text-[10px] text-white/25 tabular-nums w-8 text-right">
                {count}q
              </span>
              <div className="w-16 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    count === 0 ? "bg-red-500/40" : count < 3 ? "bg-yellow-500/40" : "bg-green-500/40"
                  }`}
                  style={{ width: `${Math.min(count / 5, 1) * 100}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// Section: Review
// ============================================================

function ReviewSection({ assessment }: { assessment: AssessmentType }) {
  const questions = assessment.questions || [];
  const dims = assessment.scoringDimensions || [];

  // Input type distribution
  const typeCounts = new Map<string, number>();
  for (const q of questions) {
    typeCounts.set(q.inputType, (typeCounts.get(q.inputType) || 0) + 1);
  }

  return (
    <div className="space-y-2">
      <SectionHeader label="Summary" icon="✅" />
      <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-3 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <StatBlock label="Questions" value={questions.length} />
          <StatBlock label="Dimensions" value={dims.length} />
          <StatBlock label="Est. Time" value={`${assessment.estimatedMinutes}m`} />
          <StatBlock label="Phases" value={assessment.phases?.length || 0} />
        </div>

        {typeCounts.size > 0 && (
          <div>
            <span className="text-[10px] text-white/25 uppercase tracking-wider">
              Input Types
            </span>
            <div className="flex flex-wrap gap-1 mt-1">
              {[...typeCounts.entries()].map(([type, count]) => (
                <span
                  key={type}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.05] border border-white/[0.08] text-white/40"
                >
                  {INPUT_TYPE_LABELS[type]?.label || type} ({count})
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Shared Primitives
// ============================================================

function SectionHeader({ label, icon, count }: { label: string; icon: string; count?: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm">{icon}</span>
      <span className="text-xs font-medium text-white/50">{label}</span>
      {count !== undefined && (
        <span className="text-[10px] text-white/25 tabular-nums">({count})</span>
      )}
    </div>
  );
}

function GhostPlaceholder({ text }: { text: string }) {
  return (
    <div className="border border-dashed border-white/[0.08] rounded-xl p-4 text-center">
      <p className="text-[11px] text-white/20 leading-relaxed">{text}</p>
    </div>
  );
}

function StatBlock({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-2 text-center">
      <div className="text-base font-semibold text-white/80 tabular-nums">{value}</div>
      <div className="text-[10px] text-white/30 mt-0.5">{label}</div>
    </div>
  );
}
