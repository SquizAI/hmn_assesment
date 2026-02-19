// ============================================================
// HMN CASCADE - Employee Reality Gap Scoring Rubrics
// ============================================================
// Employee-specific archetypes, gap patterns, dimension labels,
// and service catalog for the Reality Gap Assessment — Employee Edition.

// --- Employee Scoring Dimensions ---

export const EMPLOYEE_DIMENSION_LABELS: Record<string, string> = {
  individual_capability: "Individual AI Capability",
  tool_proficiency: "Tool Proficiency & Depth",
  learning_engagement: "Learning Engagement",
  leadership_modeling: "Leadership Modeling",
  org_support: "Organizational Support",
  change_energy: "Change Energy & Sentiment",
};

export const EMPLOYEE_DIMENSION_DESCRIPTIONS: Record<string, string> = {
  individual_capability: "Personal skill level, tool usage depth, and self-directed adoption",
  tool_proficiency: "Sophistication of AI tool usage, workflow integration, and tool chaining",
  learning_engagement: "Self-directed learning, curiosity, time invested, and learning pathways used",
  leadership_modeling: "How well managers and leaders visibly model AI behavior from employee's vantage point",
  org_support: "Training provided, time allocated, resources available, and supportive culture",
  change_energy: "Personal energy for AI transformation, optimism vs fatigue, willingness to engage",
};

// --- Employee Archetype Definitions ---

export interface EmployeeArchetypeProfile {
  archetype: string;
  label: string;
  description: string;
  selfRatingRange: { min: number; max: number };
  strengths: string[];
  blindSpots: string[];
  developmentApproach: string;
  scoringPattern: Partial<Record<string, { min: number; max: number }>>;
}

export const EMPLOYEE_ARCHETYPE_PROFILES: EmployeeArchetypeProfile[] = [
  {
    archetype: "the_builder",
    label: "The Builder",
    description: "Creates tools, automates workflows, integrates systems, and teaches others. Operates on personal motivation and curiosity. The agency's AI backbone — often unrecognized by leadership.",
    selfRatingRange: { min: 8, max: 10 },
    strengths: [
      "Multi-tool sophistication with workflow chaining",
      "Proactively teaches and shares discoveries",
      "Self-directed learning with personal investment (paid subscriptions, newsletters)",
      "Can articulate AI limitations and workarounds",
      "Dramatic productivity gains (100-500%)",
    ],
    blindSpots: [
      "May operate without organizational support or recognition",
      "Personal motivation is fragile without institutional backing",
      "Could leave if their AI work isn't valued",
      "May create shadow workflows that aren't documented",
    ],
    developmentApproach: "Formalize their role as internal AI champions. Give them dedicated time, recognition, and a platform to teach others. Don't just use their skills — invest in them. They're your force multipliers.",
    scoringPattern: {
      individual_capability: { min: 75, max: 100 },
      tool_proficiency: { min: 70, max: 100 },
      learning_engagement: { min: 60, max: 100 },
    },
  },
  {
    archetype: "the_proficient_user",
    label: "The Proficient User",
    description: "Multi-tool awareness with strategic judgment about when to use which tool. Quality-oriented, not just speed-focused. Approaching or aspiring to build. The natural training ground for the next wave of builders.",
    selfRatingRange: { min: 6, max: 8 },
    strengths: [
      "Strategic tool selection and switching",
      "Quality orientation (not just speed)",
      "Strong peer learning networks",
      "Can evaluate and compare AI tools for specific use cases",
      "Measurable quality and speed improvements",
    ],
    blindSpots: [
      "May overrate themselves if they haven't seen sophisticated use",
      "Tool-directed rather than workflow-directed thinking",
      "Aspires to build but hasn't crossed the threshold",
      "May not systematize or teach what they know",
    ],
    developmentApproach: "Bridge them to building. Pair them with Builders for mentorship. Give them a specific automation or workflow integration project to level up from consumer to creator. They're closest to breakthrough.",
    scoringPattern: {
      individual_capability: { min: 50, max: 75 },
      tool_proficiency: { min: 45, max: 75 },
      learning_engagement: { min: 40, max: 70 },
    },
  },
  {
    archetype: "the_competent_consumer",
    label: "The Competent Consumer",
    description: "Uses AI effectively for their role with measurable productivity gains, but not building or automating. Tool-directed rather than workflow-directed. Solid individual contributor who hasn't systematized or shared their knowledge.",
    selfRatingRange: { min: 4, max: 7 },
    strengths: [
      "Consistent daily AI usage for role-specific tasks",
      "Measurable productivity gains (30-50%)",
      "Generally accurate self-awareness",
      "Open to learning more with the right structure",
    ],
    blindSpots: [
      "Self-rating often inflated relative to actual capability",
      "Consumption is sophisticated but not systematized",
      "Hasn't taught others or shared innovations",
      "May mistake tool familiarity for tool mastery",
    ],
    developmentApproach: "Structured role-specific training with clear before/after metrics. Show them what Builders can do to recalibrate their self-assessment. Focus on workflow integration rather than tool breadth. Peer learning groups are more effective than courses for this tier.",
    scoringPattern: {
      individual_capability: { min: 30, max: 55 },
      tool_proficiency: { min: 25, max: 50 },
      learning_engagement: { min: 20, max: 50 },
    },
  },
  {
    archetype: "the_early_stage",
    label: "The Early Stage",
    description: "Learning fundamentals, needs structured support and permission. May be anxious, overwhelmed, or carrying cultural baggage ('AI is cheating'). High willingness often coexists with low capability. Underrated potential given the right support.",
    selfRatingRange: { min: 1, max: 4 },
    strengths: [
      "Often has high energy and willingness (energy ≠ capability)",
      "Honest self-awareness about where they are",
      "Open to guidance and structure",
      "Fresh perspective unclouded by bad AI habits",
    ],
    blindSpots: [
      "May be paralyzed by overwhelm or fear",
      "Doesn't know what they don't know",
      "May learn from low-quality sources (TikTok, word of mouth)",
      "Isolation from AI-forward peers compounds the gap",
    ],
    developmentApproach: "Start with psychological safety — address fear before tools. Role-specific onboarding (not generic training). Pair with a Proficient User or Builder as a buddy. Small wins first: one tool, one use case, one success. Meet them where they are, not where you wish they were.",
    scoringPattern: {
      individual_capability: { min: 0, max: 35 },
      tool_proficiency: { min: 0, max: 25 },
      learning_engagement: { min: 0, max: 30 },
    },
  },
];

// --- Employee Gap Pattern Definitions ---

export interface EmployeeGapDefinition {
  pattern: string;
  label: string;
  dimension1: string;
  dimension2: string;
  minDelta: number;
  description: string;
  serviceRecommendation: string;
  diagnosticSignal: string;
}

export const EMPLOYEE_GAP_DEFINITIONS: EmployeeGapDefinition[] = [
  {
    pattern: "self_assessment_gap",
    label: "Self-Assessment Inflation",
    dimension1: "individual_capability",
    dimension2: "tool_proficiency",
    minDelta: 20,
    description: "Self-rating doesn't match demonstrated tool usage and behavioral evidence. People who haven't seen sophisticated AI use overrate themselves. This is an information problem, not a personality trait.",
    serviceRecommendation: "Honest baseline assessment + exposure to what 'good' looks like. Visible benchmarking through Builder demonstrations.",
    diagnosticSignal: "Compare Q1 self-rating against Q8 tool specificity and Q10 productivity evidence.",
  },
  {
    pattern: "say_do_gap",
    label: "Leadership Say-Do Gap",
    dimension1: "leadership_modeling",
    dimension2: "org_support",
    minDelta: 15,
    description: "Senior leaders talk about AI adoption but their visible behavior doesn't match. Employees notice the gap and it erodes credibility of AI initiatives.",
    serviceRecommendation: "Leadership AI immersion + visible modeling program. Leaders must use AI publicly before asking others to adopt it.",
    diagnosticSignal: "Compare Q12 manager modeling specifics against Q13 say-do examples.",
  },
  {
    pattern: "time_allocation_gap",
    label: "Learning Time Gap",
    dimension1: "learning_engagement",
    dimension2: "org_support",
    minDelta: 25,
    description: "Employees are learning on their own time with zero official allocation. The organization talks about AI adoption but doesn't invest the time for people to learn.",
    serviceRecommendation: "Structured learning time allocation + dedicated training program. Even 2-3 hours/week of protected learning time changes the dynamic.",
    diagnosticSignal: "Q5 allocated time vs actual time. If official = 0 but actual > 0, the gap is organizational.",
  },
  {
    pattern: "capability_support_gap",
    label: "Capability Without Support",
    dimension1: "individual_capability",
    dimension2: "org_support",
    minDelta: 25,
    description: "Employees have developed AI capability on their own but the organization hasn't supported, recognized, or systematized it. The best AI talent is operating on personal motivation, not institutional support — and that's fragile.",
    serviceRecommendation: "Formalize internal AI champion roles. Create recognition pathways. Budget for tools and subscriptions. Turn organic capability into organizational infrastructure.",
    diagnosticSignal: "High individual_capability scores + low org_support scores across multiple employees.",
  },
  {
    pattern: "energy_follow_through_gap",
    label: "Energy Without Follow-Through",
    dimension1: "change_energy",
    dimension2: "org_support",
    minDelta: 25,
    description: "Employees have energy for AI transformation but past initiatives haven't followed through. The organizational immune system kills adoption even when people are willing.",
    serviceRecommendation: "Execution-focused change management. Small wins program with visible results. Kill the initiatives that are quietly dying and focus on 2-3 that will actually be supported.",
    diagnosticSignal: "High Q21 energy + specific examples in Q19 of initiatives that died.",
  },
  {
    pattern: "peer_knowledge_gap",
    label: "Knowledge Isolation",
    dimension1: "individual_capability",
    dimension2: "learning_engagement",
    minDelta: 20,
    description: "Individual capability exists but knowledge isn't flowing between peers. Hidden champions aren't sharing. The peer learning network is visible but unmanaged.",
    serviceRecommendation: "Formalize peer learning networks. Monthly AI show-and-tell. Internal AI slack channel. Pair Builders with Early Stage employees as mentors.",
    diagnosticSignal: "Q3 identifies who people go to for help. Q9 reveals whether innovations are being shared. Map the informal network and support it.",
  },
  {
    pattern: "sharing_barrier_gap",
    label: "Innovation Hoarding",
    dimension1: "tool_proficiency",
    dimension2: "org_support",
    minDelta: 20,
    description: "People are discovering AI innovations but keeping them to themselves due to cultural barriers — no forum to share, no recognition, fear of judgment, or concern about job security.",
    serviceRecommendation: "Create safe sharing forums (lunch & learns, demo days). Recognize and reward AI sharing publicly. Address job security fears directly.",
    diagnosticSignal: "Q9 reveals hidden innovations and the reasons people don't share them.",
  },
];

// --- Employee Service Catalog ---

export interface EmployeeServiceDefinition {
  id: string;
  tier: 1 | 2 | 3;
  name: string;
  description: string;
  priceRange: string;
  triggeredByGaps: string[];
  triggeredByArchetypes: string[];
}

export const EMPLOYEE_SERVICE_CATALOG: EmployeeServiceDefinition[] = [
  {
    id: "emp_reality_report",
    tier: 1,
    name: "Reality Gap Report",
    description: "Aggregated employee assessment with tier distribution, gap patterns, hidden champion map, and prioritized organizational actions.",
    priceRange: "$2,000 - $5,000",
    triggeredByGaps: [],
    triggeredByArchetypes: [],
  },
  {
    id: "emp_role_training",
    tier: 2,
    name: "Role-Specific AI Training",
    description: "Customized training tracks for each role/function — not generic AI courses. Includes hands-on exercises with tools relevant to each person's daily work.",
    priceRange: "$5,000 - $15,000",
    triggeredByGaps: ["self_assessment_gap", "capability_support_gap"],
    triggeredByArchetypes: ["the_competent_consumer", "the_early_stage"],
  },
  {
    id: "emp_builder_program",
    tier: 2,
    name: "Builder Development Program",
    description: "Advanced program for Proficient Users ready to become Builders. Workflow automation, custom tool creation, and internal champion development.",
    priceRange: "$8,000 - $20,000",
    triggeredByGaps: ["peer_knowledge_gap"],
    triggeredByArchetypes: ["the_proficient_user"],
  },
  {
    id: "emp_leadership_immersion",
    tier: 2,
    name: "Leadership AI Immersion",
    description: "Get managers visibly using AI. Hands-on sessions where leaders build something real — then present it to their teams. Closes the say-do gap from the top.",
    priceRange: "$10,000 - $25,000",
    triggeredByGaps: ["say_do_gap"],
    triggeredByArchetypes: ["the_builder", "the_proficient_user"],
  },
  {
    id: "emp_peer_network",
    tier: 1,
    name: "Peer Learning Network Design",
    description: "Map the informal AI knowledge network. Formalize champion roles. Create sharing forums, buddy systems, and recognition pathways.",
    priceRange: "$3,000 - $8,000",
    triggeredByGaps: ["peer_knowledge_gap", "sharing_barrier_gap"],
    triggeredByArchetypes: ["the_builder"],
  },
  {
    id: "emp_change_management",
    tier: 3,
    name: "AI Transformation Change Management",
    description: "Full organizational change management for AI adoption. Addresses follow-through patterns, accountability structures, time allocation, and culture.",
    priceRange: "$20,000 - $50,000",
    triggeredByGaps: ["energy_follow_through_gap", "time_allocation_gap", "say_do_gap"],
    triggeredByArchetypes: ["the_early_stage", "the_competent_consumer"],
  },
  {
    id: "emp_onboarding_redesign",
    tier: 2,
    name: "AI-First Onboarding Redesign",
    description: "Redesign employee onboarding to include AI orientation by role. Address 'AI is cheating' mindset in junior hires. Create clear learning pathways from Day 1.",
    priceRange: "$5,000 - $12,000",
    triggeredByGaps: ["capability_support_gap"],
    triggeredByArchetypes: ["the_early_stage"],
  },
];

// --- Employee Scoring Analysis Prompt ---

export const EMPLOYEE_SCORING_SYSTEM_PROMPT = `You are an expert analyst for the Reality Gap Assessment — Employee Edition.
You analyze interview responses to score individual employees and surface organizational patterns.

SCORING DIMENSIONS (score each 0-100):
1. Individual AI Capability — Personal skill level, tool usage depth, self-directed adoption
2. Tool Proficiency & Depth — Sophistication of AI tool usage, workflow integration, tool chaining
3. Learning Engagement — Self-directed learning, curiosity, time invested, learning pathways
4. Leadership Modeling (Observed) — How well managers/leaders visibly model AI behavior
5. Organizational Support — Training, time allocation, resources, culture
6. Change Energy & Sentiment — Personal energy for AI transformation, optimism vs fatigue

SCORING GUIDELINES:
- 0-20: Critical gap. No evidence of capability or support.
- 21-40: Early stage. Awareness but minimal action or investment.
- 41-60: Developing. Some evidence, inconsistent application.
- 61-80: Capable. Clear evidence, growing sophistication.
- 81-100: Advanced. Strong evidence, teaching others, systematic.

EMPLOYEE ARCHETYPES:
- the_builder (8-10): Creates tools, automates workflows, teaches others
- the_proficient_user (6.5-7.5): Multi-tool, strategic judgment, quality-focused
- the_competent_consumer (4-6): Uses AI effectively but not building/automating
- the_early_stage (1-4): Learning fundamentals, needs structured support

CRITICAL ANALYSIS:
Compare self-rated capability against tool specificity, productivity evidence, and behavioral examples.
The gap between self-perception and evidence is the MOST VALUABLE diagnostic signal.
People who haven't seen sophisticated AI use overrate themselves — this is an information problem, not a personality trait.

For each dimension provide:
- Score (0-100)
- Confidence (0-1)
- Key evidence (specific quotes or data points)
- Flags (red flags, green lights, contradictions)

Be honest and direct. Don't inflate scores. The goal is accurate diagnosis, not flattery.`;
