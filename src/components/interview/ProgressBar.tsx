import type { CascadePhase, CascadeSection } from "../../lib/types";

const PHASE_LABELS: Record<CascadePhase, string> = {
  profile_baseline: "Profile & Baseline",
  org_reality: "Organizational Reality",
  domain_deep_dive: "Domain Deep Dive",
  strategic_alignment: "Strategic Alignment",
};

const SECTION_LABELS: Record<CascadeSection, string> = {
  demographics: "About You",
  context_setting: "Your Story",
  change_capacity: "Change Readiness",
  personal_ai_reality: "Your AI Reality",
  vulnerability: "Private Learning",
  team_org_reality: "Team & Organization",
  business_process: "Business Processes",
  domain_specific: "Your Industry",
  customer_support: "Customer Experience",
  strategic_stakes: "Strategic Stakes",
  hmn_anchor: "Human Value",
  closing: "Reflection",
};

interface Props {
  questionNumber: number;
  totalQuestions: number;
  phase: CascadePhase;
  section: CascadeSection;
  completedPercentage: number;
}

export default function ProgressBar({ questionNumber, totalQuestions, phase, section, completedPercentage }: Props) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-medium text-white/40 uppercase tracking-wider">{PHASE_LABELS[phase]}</span>
          <span className="text-white/20 mx-2">/</span>
          <span className="text-xs text-white/60">{SECTION_LABELS[section]}</span>
        </div>
        <span className="text-xs text-white/40">{questionNumber} of {totalQuestions}</span>
      </div>
      <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-700 ease-out" style={{ width: `${completedPercentage}%` }} />
      </div>
    </div>
  );
}
