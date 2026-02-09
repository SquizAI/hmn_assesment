import type {
  ScoringDimension,
  LeaderArchetype,
  GapPattern,
  GapAnalysis,
  DimensionScore,
} from "../lib/types";

// ============================================================
// HMN CASCADE - Scoring Rubrics & Archetype Definitions
// ============================================================

export const DIMENSION_LABELS: Record<ScoringDimension, string> = {
  ai_awareness: "AI Awareness",
  ai_action: "AI Action",
  process_readiness: "Process Readiness",
  strategic_clarity: "Strategic Clarity",
  change_energy: "Change Energy",
  team_capacity: "Team Capacity",
  mission_alignment: "Mission Alignment",
  investment_readiness: "Investment Readiness",
};

export const DIMENSION_DESCRIPTIONS: Record<ScoringDimension, string> = {
  ai_awareness: "Understanding of what AI can do and where it applies",
  ai_action: "Actually using AI tools in day-to-day work",
  process_readiness: "How well processes are documented, structured, and automatable",
  strategic_clarity: "Clear vision of where AI fits in business strategy",
  change_energy: "Personal drive and organizational will to transform",
  team_capacity: "Team's ability to adopt and execute AI initiatives",
  mission_alignment: "How well AI adoption aligns with core mission",
  investment_readiness: "Ability to justify and fund AI initiatives",
};

// --- Archetype Definitions ---

export interface ArchetypeProfile {
  archetype: LeaderArchetype;
  label: string;
  description: string;
  strengths: string[];
  blindSpots: string[];
  recommendedApproach: string;
  scoringPattern: Partial<Record<ScoringDimension, { min: number; max: number }>>;
}

export const ARCHETYPE_PROFILES: ArchetypeProfile[] = [
  {
    archetype: "the_visionary",
    label: "The Visionary",
    description: "Sees the AI future clearly but hasn't operationalized it. High on ideas, lower on execution.",
    strengths: ["Strategic thinking", "Inspirational communication", "Future-oriented"],
    blindSpots: ["Execution gap", "Team may not share the vision", "Overestimates readiness"],
    recommendedApproach: "Start with quick wins that prove the vision. Build from concrete results, not abstract strategy.",
    scoringPattern: {
      strategic_clarity: { min: 65, max: 100 },
      ai_awareness: { min: 60, max: 100 },
      ai_action: { min: 0, max: 45 },
    },
  },
  {
    archetype: "the_operator",
    label: "The Operator",
    description: "Using AI tactically for efficiency but missing the bigger strategic picture.",
    strengths: ["Practical execution", "Process-oriented", "ROI-focused"],
    blindSpots: ["May automate wrong things", "Misses transformative opportunities", "Tactical tunnel vision"],
    recommendedApproach: "Help them zoom out. Show how tactical wins compound into strategic advantage.",
    scoringPattern: {
      ai_action: { min: 55, max: 100 },
      process_readiness: { min: 50, max: 100 },
      strategic_clarity: { min: 0, max: 45 },
    },
  },
  {
    archetype: "the_champion",
    label: "The Champion",
    description: "Strong across the board. Ready to go deeper and lead others.",
    strengths: ["Balanced capability", "Natural evangelist", "Action-oriented"],
    blindSpots: ["May leave team behind", "Could move too fast for org", "Overconfidence risk"],
    recommendedApproach: "Focus on scaling their capability to the team. They're ready for advanced implementation.",
    scoringPattern: {
      ai_awareness: { min: 65, max: 100 },
      ai_action: { min: 60, max: 100 },
      change_energy: { min: 65, max: 100 },
    },
  },
  {
    archetype: "the_skeptic",
    label: "The Skeptic",
    description: "Cautious about AI, may be resistant or simply unconvinced. Needs evidence and safety.",
    strengths: ["Critical thinking", "Risk awareness", "Not easily swayed by hype"],
    blindSpots: ["Analysis paralysis", "May block team experimentation", "Falling behind peers"],
    recommendedApproach: "Start with their specific pain points, not AI capabilities. Show don't tell. Small safe experiments.",
    scoringPattern: {
      ai_awareness: { min: 0, max: 40 },
      ai_action: { min: 0, max: 30 },
      change_energy: { min: 0, max: 45 },
    },
  },
  {
    archetype: "the_delegator",
    label: "The Delegator",
    description: "Pushes AI adoption to others while avoiding personal engagement.",
    strengths: ["Trusts team", "Good at empowering others", "Recognizes AI importance"],
    blindSpots: ["Can't evaluate what they don't understand", "Team lacks direction", "Modeling gap"],
    recommendedApproach: "Get them hands-on. Even 30 minutes of personal AI use changes the dynamic. Focus on CEO-specific use cases.",
    scoringPattern: {
      ai_awareness: { min: 40, max: 70 },
      ai_action: { min: 0, max: 30 },
      team_capacity: { min: 30, max: 70 },
    },
  },
  {
    archetype: "the_explorer",
    label: "The Explorer",
    description: "Curious and experimenting broadly, but scattered. Trying everything, mastering nothing.",
    strengths: ["Curiosity", "Willingness to experiment", "Broad awareness"],
    blindSpots: ["Lack of focus", "No systematic approach", "May overwhelm team"],
    recommendedApproach: "Help them prioritize. Channel the exploration energy into 2-3 high-impact use cases.",
    scoringPattern: {
      ai_awareness: { min: 55, max: 100 },
      ai_action: { min: 40, max: 70 },
      strategic_clarity: { min: 0, max: 45 },
    },
  },
  {
    archetype: "the_coach",
    label: "The Coach",
    description: "Understands change dynamics and human factors deeply. May intellectualize rather than act.",
    strengths: ["Change management expertise", "Empathy", "Team development focus"],
    blindSpots: ["Overthinking", "Coaching others while not coaching self", "Analysis over action"],
    recommendedApproach: "Challenge them to apply their own coaching frameworks to themselves. Use their language.",
    scoringPattern: {
      change_energy: { min: 55, max: 100 },
      ai_awareness: { min: 35, max: 65 },
      ai_action: { min: 0, max: 45 },
    },
  },
  {
    archetype: "the_pragmatist",
    label: "The Pragmatist",
    description: "Only interested in proven ROI. Won't move without clear business case.",
    strengths: ["Financial discipline", "Results-oriented", "Low risk of wasted investment"],
    blindSpots: ["May miss early-mover advantage", "Waiting for proof that requires being the proof", "Overly cautious"],
    recommendedApproach: "Build the business case first. ROI projections, competitor analysis, pilot programs with measurable KPIs.",
    scoringPattern: {
      investment_readiness: { min: 20, max: 55 },
      strategic_clarity: { min: 40, max: 70 },
      ai_action: { min: 0, max: 40 },
    },
  },
];

// --- Gap Pattern Definitions ---

export interface GapDefinition {
  pattern: GapPattern;
  label: string;
  dimension1: ScoringDimension;
  dimension2: ScoringDimension;
  minDelta: number; // Minimum score difference to trigger
  description: string;
  serviceRecommendation: string;
}

export const GAP_DEFINITIONS: GapDefinition[] = [
  {
    pattern: "awareness_action",
    label: "Knows But Doesn't Do",
    dimension1: "ai_awareness",
    dimension2: "ai_action",
    minDelta: 25,
    description: "Strong understanding of AI potential but low personal/organizational adoption.",
    serviceRecommendation: "Hands-on masterclass + implementation coaching. They need guided doing, not more learning.",
  },
  {
    pattern: "action_strategy",
    label: "Doing Without Direction",
    dimension1: "ai_action",
    dimension2: "strategic_clarity",
    minDelta: 25,
    description: "Using AI tools but without a coherent strategy. Risk of automating the wrong things.",
    serviceRecommendation: "AI strategy engagement + prioritization workshop. Channel energy into highest-impact areas.",
  },
  {
    pattern: "energy_capacity",
    label: "Leader Ready, Team Isn't",
    dimension1: "change_energy",
    dimension2: "team_capacity",
    minDelta: 25,
    description: "Leader has the drive but team lacks capability to execute.",
    serviceRecommendation: "Team upskilling program + train-the-trainer. Scale the leader's energy through the organization.",
  },
  {
    pattern: "strategy_process",
    label: "Vision Without Infrastructure",
    dimension1: "strategic_clarity",
    dimension2: "process_readiness",
    minDelta: 25,
    description: "Clear vision but processes aren't documented or structured enough for AI.",
    serviceRecommendation: "Process documentation audit + automation readiness assessment. Build the foundation first.",
  },
  {
    pattern: "awareness_investment",
    label: "Knows But Can't Justify",
    dimension1: "ai_awareness",
    dimension2: "investment_readiness",
    minDelta: 25,
    description: "Understands AI value but can't build the business case to invest.",
    serviceRecommendation: "ROI framework development + pilot program with measurable KPIs. Create the evidence.",
  },
  {
    pattern: "self_team",
    label: "Leader-Team Disconnect",
    dimension1: "ai_action",
    dimension2: "team_capacity",
    minDelta: 30,
    description: "Significant gap between leader's AI engagement and team's capability.",
    serviceRecommendation: "Team assessment + customized upskilling. Bridge the gap before it becomes a culture problem.",
  },
  {
    pattern: "perception_reality",
    label: "Self-Assessment Gap",
    dimension1: "ai_awareness",
    dimension2: "ai_action",
    minDelta: 20,
    description: "Self-rating doesn't match observed behavior and specific examples.",
    serviceRecommendation: "Honest baseline assessment + personalized development plan. Start from reality, not aspiration.",
  },
];

// --- Service Catalog ---

export interface ServiceDefinition {
  id: string;
  tier: 1 | 2 | 3;
  name: string;
  description: string;
  priceRange: string;
  triggeredByGaps: GapPattern[];
  triggeredByArchetypes: LeaderArchetype[];
  minReadinessScore?: number;
  maxReadinessScore?: number;
}

export const SERVICE_CATALOG: ServiceDefinition[] = [
  {
    id: "scorecard",
    tier: 1,
    name: "AI Readiness Scorecard",
    description: "Personalized diagnostic with leader archetype, gap analysis, and top 3 priorities.",
    priceRange: "$500 - $2,000",
    triggeredByGaps: [],
    triggeredByArchetypes: [],
  },
  {
    id: "masterclass_individual",
    tier: 2,
    name: "Customized AI Masterclass",
    description: "Personalized curriculum with industry-specific use cases, hands-on exercises, and change management playbook.",
    priceRange: "$5,000 - $15,000",
    triggeredByGaps: ["awareness_action", "perception_reality"],
    triggeredByArchetypes: ["the_visionary", "the_explorer", "the_coach", "the_skeptic"],
  },
  {
    id: "team_upskilling",
    tier: 2,
    name: "Team AI Upskilling Program",
    description: "Structured training for 5-50 team members, customized by role and function.",
    priceRange: "$10,000 - $30,000",
    triggeredByGaps: ["energy_capacity", "self_team"],
    triggeredByArchetypes: ["the_champion", "the_delegator"],
  },
  {
    id: "strategy_engagement",
    tier: 3,
    name: "AI Strategy Engagement",
    description: "Deep-dive strategy development including competitive analysis, prioritized use cases, and implementation roadmap.",
    priceRange: "$15,000 - $40,000",
    triggeredByGaps: ["action_strategy", "strategy_process", "awareness_investment"],
    triggeredByArchetypes: ["the_operator", "the_pragmatist"],
  },
  {
    id: "process_audit",
    tier: 2,
    name: "Process & Automation Readiness Audit",
    description: "Map all processes, identify automation candidates, estimate ROI per process.",
    priceRange: "$8,000 - $20,000",
    triggeredByGaps: ["strategy_process"],
    triggeredByArchetypes: ["the_operator", "the_pragmatist"],
  },
  {
    id: "ai_retainer",
    tier: 3,
    name: "Fractional AI Strategy Retainer",
    description: "Ongoing monthly advisory: quarterly assessments, team coaching, implementation guidance.",
    priceRange: "$3,000 - $8,000/month",
    triggeredByGaps: ["energy_capacity", "awareness_action", "action_strategy"],
    triggeredByArchetypes: ["the_champion", "the_visionary"],
  },
  {
    id: "implementation",
    tier: 3,
    name: "AI Implementation Support",
    description: "Hands-on help building and deploying specific AI solutions for identified use cases.",
    priceRange: "$20,000 - $75,000",
    triggeredByGaps: ["strategy_process", "awareness_action"],
    triggeredByArchetypes: ["the_champion", "the_operator"],
    minReadinessScore: 40,
  },
  {
    id: "pilot_program",
    tier: 2,
    name: "AI Pilot Program",
    description: "90-day controlled experiment with one high-impact use case. Measurable KPIs and clear success criteria.",
    priceRange: "$10,000 - $25,000",
    triggeredByGaps: ["awareness_investment"],
    triggeredByArchetypes: ["the_pragmatist", "the_skeptic"],
    maxReadinessScore: 50,
  },
];

// --- Scoring Analysis Prompt ---

export const SCORING_SYSTEM_PROMPT = `You are an expert AI readiness analyst for HMN (Human Machine Network).
You analyze interview responses to score organizations and leaders across 8 dimensions.

SCORING DIMENSIONS (score each 0-100):
1. AI Awareness - Understanding of what AI can do and where it applies
2. AI Action - Actually using AI tools in day-to-day work
3. Process Readiness - How well processes are documented and automatable
4. Strategic Clarity - Clear vision of where AI fits in business strategy
5. Change Energy - Personal drive and organizational will to transform
6. Team Capacity - Team's ability to adopt and execute AI initiatives
7. Mission Alignment - How well AI adoption aligns with core mission
8. Investment Readiness - Ability to justify and fund AI initiatives

SCORING GUIDELINES:
- 0-20: Critical gap. No evidence of capability.
- 21-40: Early stage. Awareness but minimal action.
- 41-60: Developing. Some evidence, inconsistent.
- 61-80: Capable. Clear evidence, room to grow.
- 81-100: Advanced. Strong evidence, teaching others.

For each dimension provide:
- Score (0-100)
- Confidence (0-1, based on how much evidence you have)
- Key evidence (specific quotes or data points)
- Flags (red flags, green lights, contradictions)

Also identify:
- Overall readiness score (weighted average)
- Leader archetype (best fit from the defined archetypes)
- Gap patterns (where dimension scores diverge significantly)
- Contradictions (where answers conflict with each other)

Be honest and direct. Don't inflate scores. The goal is accurate diagnosis, not flattery.`;
