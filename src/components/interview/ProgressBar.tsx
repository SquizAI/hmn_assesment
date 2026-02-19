const DEFAULT_PHASE_LABELS: Record<string, string> = {
  profile_baseline: "Profile & Baseline",
  org_reality: "Organizational Reality",
  domain_deep_dive: "Domain Deep Dive",
  strategic_alignment: "Strategic Alignment",
};

const DEFAULT_SECTION_LABELS: Record<string, string> = {
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

function formatLabel(id: string): string {
  return id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

interface Props {
  questionNumber: number;
  totalQuestions: number;
  phase: string;
  section: string;
  completedPercentage: number;
  phaseLabels?: Record<string, string>;
  sectionLabels?: Record<string, string>;
}

export default function ProgressBar({ questionNumber, totalQuestions, phase, section, completedPercentage, phaseLabels, sectionLabels }: Props) {
  const pLabels = phaseLabels || DEFAULT_PHASE_LABELS;
  const sLabels = sectionLabels || DEFAULT_SECTION_LABELS;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-medium text-white/40 uppercase tracking-wider">{pLabels[phase] || formatLabel(phase)}</span>
          <span className="text-white/20 mx-2">/</span>
          <span className="text-xs text-white/60">{sLabels[section] || formatLabel(section)}</span>
        </div>
        <span className="text-xs text-white/40">{questionNumber} of {totalQuestions}</span>
      </div>
      <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-700 ease-out" style={{ width: `${completedPercentage}%` }} />
      </div>
    </div>
  );
}
