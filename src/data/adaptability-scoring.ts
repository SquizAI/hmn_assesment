import type {
  AdaptabilityPillar,
  AllMarkerCode,
  ContentMarkerCode,
  ProcessMarkerCode,
  CrossPillarPattern,
  CrossPillarPatternMatch,
  MarkerConfidence,
  AdaptiveRegulationRating,
  MeaningStructureClassification,
  SystemVsIndividualClassification,
  MicroMomentResponse,
  HumanReviewTrigger,
  InterventionRouting,
} from "../lib/types";

// ============================================================
// ADAPTABILITY INDEX — Scoring Rubrics & Behavioral Markers
// ============================================================

// --- Pillar Labels & Descriptions ---

export const ADAPTABILITY_PILLAR_LABELS: Record<AdaptabilityPillar, string> = {
  learning_velocity: "Learning Velocity",
  unlearning_readiness: "Unlearning Readiness",
  adaptive_agency: "Adaptive Agency",
  beginner_tolerance: "Beginner Tolerance",
};

export const ADAPTABILITY_PILLAR_DESCRIPTIONS: Record<AdaptabilityPillar, string> = {
  learning_velocity:
    "How quickly and effectively you learn new skills, adapt learning strategies, and recover from learning failures.",
  unlearning_readiness:
    "Your capacity to let go of outdated skills, beliefs, and identity attachments when they no longer serve you.",
  adaptive_agency:
    "Your drive to take ownership of your own growth — self-directed learning, initiative without permission, and resourcefulness.",
  beginner_tolerance:
    "Your comfort with incompetence, uncertainty, and the emotional experience of being a beginner.",
};

// --- Pillar Score Ranges ---

export interface PillarScoreRange {
  label: string;
  min: number;
  max: number;
  description: string;
  interventionPath: string;
}

export const PILLAR_SCORE_RANGES: Record<AdaptabilityPillar, PillarScoreRange[]> = {
  learning_velocity: [
    {
      label: "High",
      min: 20,
      max: 25,
      description:
        "Days to weeks for productivity. Clear, transferable learning strategy. Seeks help proactively. Multiple examples of fast learning. Can articulate what accelerates and slows their learning.",
      interventionPath:
        "Champion candidate. 1.3 (Teach-to-Learn). Minimal individual development needed.",
    },
    {
      label: "Strong",
      min: 15,
      max: 19,
      description:
        "Weeks to 1-2 months. Some strategy but not fully systematic. Learns well with support. Can identify one abandoned or slow learning experience and reflect honestly.",
      interventionPath:
        "1.1 (Learning Strategy Audit) to refine existing approach. 1.4 (Tracking) for self-awareness.",
    },
    {
      label: "Developing",
      min: 10,
      max: 14,
      description:
        "2-4 months typical. No clear strategy. Needs structured training or a guide. Gets stuck without help. May blame external factors for slow learning.",
      interventionPath:
        "1.1 (Learning Strategy Audit) + 1.2 (AI-Accelerated Learning Sprints). Pair with Champion.",
    },
    {
      label: "At Risk",
      min: 0,
      max: 9,
      description:
        "4+ months or incomplete learning. Avoids new tools. Waits for mandate. Returns to old methods. Can't identify abandoned learning.",
      interventionPath:
        "1.1 + 1.2 + intensive support. Investigate whether bottleneck is actually P4 (beginner tolerance) or P2 (unlearning). Check Adaptive Regulation for saturation.",
    },
  ],
  unlearning_readiness: [
    {
      label: "High",
      min: 20,
      max: 25,
      description:
        "Capacity/purpose-based identity. Multiple clear examples of letting go. Quick belief updates. Learning-based professional identity. Energized by the questions.",
      interventionPath:
        "Champion candidate. 2.5 (Letting Go Ritual) for reinforcement. Potential Peer Mentor role.",
    },
    {
      label: "Strong",
      min: 15,
      max: 19,
      description:
        "Mixed identity. Can articulate unlearning examples with some friction. Eventually adapts but with moderate lag. Handled the 80% follow-up with effort.",
      interventionPath:
        "2.1 (Expertise Audit) to build systematic awareness. 2.3 (Deliberate Delegation) for behavioral practice.",
    },
    {
      label: "Developing",
      min: 10,
      max: 14,
      description:
        "Primarily skill-based identity. Struggles to name unlearning examples or gives examples that are really 'adding new.' Slow to update beliefs. Uncomfortable with 80% question.",
      interventionPath:
        "2.1 (Expertise Audit) + 2.2 (Identity Expansion). Pair with Champion. Route by meaning structure.",
    },
    {
      label: "At Risk",
      min: 0,
      max: 9,
      description:
        "Strong skill-based identity with visible attachment. Cannot identify anything they've unlearned. Resistant to the 80% question. Frames expertise as permanent.",
      interventionPath:
        "Coaching-intensive: 2.2 (Identity Expansion) + 2.1 (Expertise Audit) in 1:1 format. Route by meaning structure. DO NOT start with 2.3 (Delegation to AI) — identity safety must come first.",
    },
  ],
  adaptive_agency: [
    {
      label: "High",
      min: 20,
      max: 25,
      description:
        "Clear ownership mentality with multiple behavioral examples. Self-directed learning without being asked. Creative resource acquisition. Frequent initiative without permission.",
      interventionPath:
        "Champion candidate (Peer Mentor or Experimentation Lead). 3.4 (Development Budget Ownership).",
    },
    {
      label: "Strong",
      min: 15,
      max: 19,
      description:
        "Mostly self-directed with some reliance on company support. Initiative exists but may seek permission first. Would figure things out without programs but prefers having them.",
      interventionPath:
        "3.3 (Initiative Without Permission) to build the habit. 3.1 (Personal Learning Plan) to formalize.",
    },
    {
      label: "Developing",
      min: 10,
      max: 14,
      description:
        "Shared responsibility framing. Relies significantly on company programs. Limited self-directed learning. Some initiative but needs prompting.",
      interventionPath:
        "3.1 (Personal Learning Plan) + 3.2 (Resource Constraint Challenge). Pair with Champion. Review system permission structures using Q4 data.",
    },
    {
      label: "At Risk",
      min: 0,
      max: 9,
      description:
        "'Company should develop me' framing. No self-directed learning examples. Would stop developing if programs stopped. Waits for mandate.",
      interventionPath:
        "3.1 (Personal Learning Plan) in coaching-intensive format. Use Q4 data to distinguish system-driven from individual-driven low agency.",
    },
  ],
  beginner_tolerance: [
    {
      label: "High",
      min: 20,
      max: 25,
      description:
        "Recent beginner experience (chosen). Comfortable with incompetence as temporary state. Asks 'stupid' questions without much worry. Brief emotional disruption.",
      interventionPath:
        "Champion candidate. 4.4 (Beginner Stories Collection). 4.2 (Public Learning Practice) to extend.",
    },
    {
      label: "Strong",
      min: 15,
      max: 19,
      description:
        "Can tolerate beginner status but prefers competence. Will act under uncertainty when needed. Some discomfort with public learning. Asks questions sometimes, holds back sometimes.",
      interventionPath:
        "4.2 (Public Learning Practice) with graduated exposure. 4.1 (Deliberate Beginner Experiences) monthly.",
    },
    {
      label: "Developing",
      min: 10,
      max: 14,
      description:
        "Prefers to learn privately before performing. Needs significant certainty before acting. Avoids situations where they might look incompetent. Describes beginner state as painful.",
      interventionPath:
        "4.1 (Deliberate Beginner Experiences) in safe, low-stakes contexts. 4.3 (Incompetence Sits). Examine System Levers 3 and 6.",
    },
    {
      label: "At Risk",
      min: 0,
      max: 9,
      description:
        "Strong need for expert status. Avoids unfamiliar territory. Paralyzed by incomplete information. Would never ask a 'stupid' question. Visible anxiety at hypothetical beginner scenario.",
      interventionPath:
        "4.3 (Incompetence Sits) + 4.1 (Deliberate Beginner Experiences) — start extremely small and safe. Coaching-intensive. Build private tolerance first.",
    },
  ],
};

// --- Decomposed Behavioral Marker Rubrics ---

export interface MarkerRubric {
  code: AllMarkerCode;
  label: string;
  pillar: AdaptabilityPillar;
  type: "content" | "process" | "routing";
  whatItScores: string;
  criteria: {
    score: 1 | 2 | 3 | 4;
    description: string;
    textEvidencePattern: string;
  }[];
}

export const MARKER_RUBRICS: MarkerRubric[] = [
  // --- Pillar 1: Learning Velocity ---
  {
    code: "1A",
    label: "Learning Timeline",
    pillar: "learning_velocity",
    type: "content",
    whatItScores: "Speed of learning a new tool or skill",
    criteria: [
      {
        score: 1,
        description: "4+ months or incomplete",
        textEvidencePattern:
          "Vague timeline, 'still working on it,' months-long descriptions, incomplete learning narratives",
      },
      {
        score: 2,
        description: "2-4 months",
        textEvidencePattern:
          "Multi-month timeline, 'took a while,' needed extensive support period",
      },
      {
        score: 3,
        description: "Weeks to 2 months",
        textEvidencePattern:
          "Clear timeline in weeks, distinguishes between understanding and productivity phases",
      },
      {
        score: 4,
        description: "Days to weeks",
        textEvidencePattern:
          "Rapid timeline with specific dates/durations, clear self-awareness about learning speed",
      },
    ],
  },
  {
    code: "1B",
    label: "Failure Identification",
    pillar: "learning_velocity",
    type: "content",
    whatItScores: "Ability to identify and own learning failures",
    criteria: [
      {
        score: 1,
        description: "Can't identify any",
        textEvidencePattern:
          "'I can't think of one,' long pause with no example even after scaffolding",
      },
      {
        score: 2,
        description: "Identifies one, blames externally",
        textEvidencePattern:
          "Example given but attributed to external factors — bad tool, no training, no time, manager's fault",
      },
      {
        score: 3,
        description: "Identifies one with some ownership",
        textEvidencePattern:
          "Acknowledges own role in the failure, mixed attribution between external and internal factors",
      },
      {
        score: 4,
        description: "Multiple failures identified with self-awareness",
        textEvidencePattern:
          "Multiple examples with reflective language — 'I realized,' 'looking back,' clear lessons learned",
      },
    ],
  },
  {
    code: "1C",
    label: "Learning Strategy",
    pillar: "learning_velocity",
    type: "content",
    whatItScores: "Clarity and intentionality of learning process",
    criteria: [
      {
        score: 1,
        description: "No strategy, osmosis",
        textEvidencePattern:
          "'I just kind of pick it up,' 'I figure it out,' no describable process",
      },
      {
        score: 2,
        description: "Strategy exists but vague",
        textEvidencePattern:
          "General approach mentioned but non-specific — 'I watch videos,' 'I ask around'",
      },
      {
        score: 3,
        description: "Clear but unrefinable strategy",
        textEvidencePattern:
          "Describable multi-step process but hasn't evolved — same approach regardless of what's being learned",
      },
      {
        score: 4,
        description: "Clear, refined, intentional strategy",
        textEvidencePattern:
          "Specific, multi-step process that has evolved over time; adapts approach to the type of learning; metacognitive awareness",
      },
    ],
  },
  {
    code: "1D",
    label: "Help-Seeking Behavior",
    pillar: "learning_velocity",
    type: "content",
    whatItScores: "Proactivity in seeking help during learning",
    criteria: [
      {
        score: 1,
        description: "Avoids help, isolated",
        textEvidencePattern:
          "No mention of others in learning stories, 'I prefer to figure it out myself,' avoidance of asking",
      },
      {
        score: 2,
        description: "Waits for offered help",
        textEvidencePattern:
          "Help received but not sought — 'someone showed me,' 'my manager sent me to training'",
      },
      {
        score: 3,
        description: "Seeks help when stuck",
        textEvidencePattern:
          "Mentions asking for help after hitting barriers — 'when I got stuck I asked,' 'I eventually reached out'",
      },
      {
        score: 4,
        description: "Proactively seeks help as first step",
        textEvidencePattern:
          "Help-seeking as strategy — 'first thing I did was find someone who knew,' 'I immediately looked for a mentor/community'",
      },
    ],
  },
  {
    code: "1E",
    label: "Self-Correction (Process)",
    pillar: "learning_velocity",
    type: "process",
    whatItScores: "Real-time refinement of answers during the interview",
    criteria: [
      {
        score: 1,
        description: "No refinement during answers",
        textEvidencePattern:
          "Answers are stated once and not revised; no 'actually' or 'let me rephrase' language",
      },
      {
        score: 2,
        description: "Minimal adjustment",
        textEvidencePattern:
          "Occasional small corrections but primarily cosmetic, not substantive",
      },
      {
        score: 3,
        description: "Some real-time refinement",
        textEvidencePattern:
          "Multiple instances of 'actually, let me think about that differently' or revising timeline/details",
      },
      {
        score: 4,
        description: "Active self-correction and improvement across interview",
        textEvidencePattern:
          "Frequent genuine revisions toward greater honesty/specificity; references earlier answers to correct; builds on previous reflections",
      },
    ],
  },
  {
    code: "1F",
    label: "Format Adaptation (Process)",
    pillar: "learning_velocity",
    type: "process",
    whatItScores: "Whether answer quality improves across the interview",
    criteria: [
      {
        score: 1,
        description: "Answer quality static or declining",
        textEvidencePattern:
          "Later answers are no better (or worse) than early ones; no adaptation to the interview format",
      },
      {
        score: 2,
        description: "Slight improvement",
        textEvidencePattern:
          "Marginal improvement in specificity or structure from P1 to P3/P4",
      },
      {
        score: 3,
        description: "Clear improvement in answer quality",
        textEvidencePattern:
          "Noticeably more specific, structured, or reflective answers by P3; adapting to what the interviewer is looking for",
      },
      {
        score: 4,
        description: "Markedly better answers by P3/P4",
        textEvidencePattern:
          "Dramatic improvement — answers become more behavioral, more specific, more honest as they learn the format; live demonstration of learning velocity",
      },
    ],
  },

  // --- Pillar 2: Unlearning Readiness ---
  {
    code: "2A",
    label: "Identity Structure",
    pillar: "unlearning_readiness",
    type: "content",
    whatItScores: "What their professional identity is anchored to",
    criteria: [
      {
        score: 1,
        description: "Specific tool/skill as primary descriptor",
        textEvidencePattern:
          "'I'm a [specific tool] expert,' 'I do [specific technical skill],' identity tied to particular technology or method",
      },
      {
        score: 2,
        description: "Role title",
        textEvidencePattern:
          "'I'm a VP of Operations,' 'I run the marketing team,' identity tied to position/title",
      },
      {
        score: 3,
        description: "Functional capacity",
        textEvidencePattern:
          "'I help teams solve complex problems,' 'I translate business needs into solutions,' durable but still functional",
      },
      {
        score: 4,
        description: "Purpose/mission statement",
        textEvidencePattern:
          "'I make sure customers get what they need,' 'I find patterns nobody else sees,' identity anchored to purpose not method",
      },
    ],
  },
  {
    code: "2B",
    label: "80% Reframe Speed",
    pillar: "unlearning_readiness",
    type: "content",
    whatItScores: "Speed and quality of identity reframe when 80% of role is automated",
    criteria: [
      {
        score: 1,
        description: "Failed to engage",
        textEvidencePattern:
          "Deflects the question, 'AI can't do what I do,' refuses to engage the hypothetical, visible distress",
      },
      {
        score: 2,
        description: "Restated same skills",
        textEvidencePattern:
          "Rephrases original description in different words without genuinely reframing; 'Well, I'd still be doing...'",
      },
      {
        score: 3,
        description: "Attempted reframe with effort",
        textEvidencePattern:
          "Visible effort to think differently; eventually identifies something durable but with noticeable struggle and pause",
      },
      {
        score: 4,
        description: "Reframed fluently to durable capacity",
        textEvidencePattern:
          "Quick, fluent reframe to uniquely human capacities; energized by the question rather than threatened; 'The 20% is...' with specificity",
      },
    ],
  },
  {
    code: "2C",
    label: "Unlearning Behavioral Evidence",
    pillar: "unlearning_readiness",
    type: "content",
    whatItScores: "Evidence of actually having let go of a skill/approach",
    criteria: [
      {
        score: 1,
        description: "Cannot identify unlearning example",
        textEvidencePattern:
          "'I can't really think of one,' no example provided after scaffolding",
      },
      {
        score: 2,
        description: "Example is really 'adding new'",
        textEvidencePattern:
          "Describes learning a new tool/skill without identifying what was abandoned. After redirect, still describes addition not subtraction.",
      },
      {
        score: 3,
        description: "Genuine example but forced",
        textEvidencePattern:
          "Describes an externally-imposed change. Uses language like 'we had to,' 'management decided,' 'the old system was shut down.'",
      },
      {
        score: 4,
        description: "Genuine, voluntary example with short lag",
        textEvidencePattern:
          "Describes a self-initiated change. Uses language like 'I realized,' 'I decided to stop.' Short gap between recognition and action.",
      },
    ],
  },
  {
    code: "2D",
    label: "Belief Update Evidence",
    pillar: "unlearning_readiness",
    type: "content",
    whatItScores: "Evidence of having changed a strongly held professional belief",
    criteria: [
      {
        score: 1,
        description: "Can't identify changed belief",
        textEvidencePattern:
          "Cannot name a belief they've updated; 'I don't think I've been wrong about anything major'",
      },
      {
        score: 2,
        description: "Identified one, framed as loss",
        textEvidencePattern:
          "Can name a changed belief but frames it negatively — 'I had to accept,' grieving language, sense of loss",
      },
      {
        score: 3,
        description: "Identified with moderate integration",
        textEvidencePattern:
          "Names a changed belief with mixed framing — acknowledges it was difficult but sees some benefit",
      },
      {
        score: 4,
        description: "Multiple, with growth framing",
        textEvidencePattern:
          "Multiple examples framed as growth — 'I was wrong and it was good,' 'that shift opened up...' Clear learning from the update.",
      },
    ],
  },
  {
    code: "2E",
    label: "Emotional Response Pattern (Process)",
    pillar: "unlearning_readiness",
    type: "process",
    whatItScores: "Emotional response to identity-probing questions in real time",
    criteria: [
      {
        score: 1,
        description: "Visibly defensive or shut down",
        textEvidencePattern:
          "Very short responses, deflects, changes subject, hedging spikes dramatically, disengages from the conversation",
      },
      {
        score: 2,
        description: "Uncomfortable but compliant",
        textEvidencePattern:
          "Answers the questions but with increased hedging, shorter responses, less specificity than in other sections",
      },
      {
        score: 3,
        description: "Engaged with mild discomfort",
        textEvidencePattern:
          "Some visible adjustment to the harder questions but maintains narrative quality; acknowledges discomfort without retreating",
      },
      {
        score: 4,
        description: "Curious and energized",
        textEvidencePattern:
          "Response length and quality maintained or increases; shows interest in the questions; 'That's a really interesting question'; self-reflective tone",
      },
    ],
  },
  {
    code: "2F",
    label: "Story Discrimination",
    pillar: "unlearning_readiness",
    type: "content",
    whatItScores: "Ability to distinguish 'learning new' from 'letting go of old'",
    criteria: [
      {
        score: 1,
        description: "Doesn't adjust when redirected",
        textEvidencePattern:
          "Restates the same story or says 'I can't think of anything else' after redirect",
      },
      {
        score: 2,
        description: "Attempts but fails to discriminate",
        textEvidencePattern:
          "Tries to reframe but still describes addition, not subtraction; can't identify what was abandoned",
      },
      {
        score: 3,
        description: "Successfully discriminates with effort",
        textEvidencePattern:
          "Pauses, then identifies a genuine unlearning example; noticeable cognitive effort to make the distinction",
      },
      {
        score: 4,
        description: "Self-corrects before redirect needed",
        textEvidencePattern:
          "Spontaneously distinguishes between learning and unlearning; 'Actually, that's more about learning new — what I really had to stop doing was...'",
      },
    ],
  },
  {
    code: "2G",
    label: "Meaning Structure (Routing)",
    pillar: "unlearning_readiness",
    type: "routing",
    whatItScores: "Why identity attachment exists — routes intervention, not scored numerically",
    criteria: [
      {
        score: 1,
        description: "Can't engage / deep attachment",
        textEvidencePattern:
          "Gets emotional, deflects, very brief non-answer, or strong emotional response; attachment too deep to name",
      },
      {
        score: 2,
        description: "Status/recognition",
        textEvidencePattern:
          "References respect, credibility, reputation, being recognized, being the expert, authority",
      },
      {
        score: 3,
        description: "Safety/certainty",
        textEvidencePattern:
          "References confidence, security, knowing what to do, stability, predictability, comfort",
      },
      {
        score: 4,
        description: "Purpose/meaning",
        textEvidencePattern:
          "References purpose, passion, love of the work, fulfillment, 'the thing I care about'",
      },
    ],
  },

  // --- Pillar 3: Adaptive Agency ---
  {
    code: "3A",
    label: "Self-Directed Learning",
    pillar: "adaptive_agency",
    type: "content",
    whatItScores: "Evidence of learning the company doesn't know about",
    criteria: [
      {
        score: 1,
        description: "No examples",
        textEvidencePattern:
          "Cannot identify any self-directed learning even with expanded prompt (personal or professional)",
      },
      {
        score: 2,
        description: "One vague example, prompted",
        textEvidencePattern:
          "Finds an example only after scaffolding; vague details; motivated by fear/necessity not curiosity",
      },
      {
        score: 3,
        description: "One specific example, self-motivated",
        textEvidencePattern:
          "Clear, specific example with time investment; motivated by curiosity or personal growth; moderate detail",
      },
      {
        score: 4,
        description: "Multiple specific, recent, self-motivated",
        textEvidencePattern:
          "Multiple examples readily available; recent; self-motivated; invested own time/money; specific details about what and why",
      },
    ],
  },
  {
    code: "3B",
    label: "Initiative Without Permission",
    pillar: "adaptive_agency",
    type: "content",
    whatItScores: "Evidence of starting things at work without being asked",
    criteria: [
      {
        score: 1,
        description: "Can't identify any",
        textEvidencePattern:
          "Cannot identify any example of unprompted initiative; waits to be told what to do",
      },
      {
        score: 2,
        description: "One old example, asked permission",
        textEvidencePattern:
          "Example is distant (years ago); sought approval first; one-time occurrence, not a pattern",
      },
      {
        score: 3,
        description: "Recent example, sometimes asks",
        textEvidencePattern:
          "Recent example with clear details; sometimes acts without permission, sometimes seeks approval; emerging pattern",
      },
      {
        score: 4,
        description: "Frequent, recent, no permission needed",
        textEvidencePattern:
          "Multiple recent examples; acted without asking; describes it as a pattern; 'I just do things when I see the need'",
      },
    ],
  },
  {
    code: "3C",
    label: "Resource Constraint Response",
    pillar: "adaptive_agency",
    type: "content",
    whatItScores: "What they did when resources weren't available",
    criteria: [
      {
        score: 1,
        description: "Waited and never solved",
        textEvidencePattern:
          "Waited for company to provide; never found alternative; gave up; 'there was nothing I could do'",
      },
      {
        score: 2,
        description: "Waited, eventually figured out",
        textEvidencePattern:
          "Extended wait before action; eventually found a workaround but with significant delay",
      },
      {
        score: 3,
        description: "Found workaround with moderate delay",
        textEvidencePattern:
          "Looked for alternatives within a reasonable timeframe; found free resources, asked colleagues, self-taught",
      },
      {
        score: 4,
        description: "Creative workaround, fast",
        textEvidencePattern:
          "Immediately sought alternatives; creative solutions — free courses, communities, personal investment, built own tools; fast action",
      },
    ],
  },
  {
    code: "3D",
    label: "System vs. Individual Signal",
    pillar: "adaptive_agency",
    type: "content",
    whatItScores: "Whether low agency is dispositional or organizational",
    criteria: [
      {
        score: 1,
        description: "Self-censors without trying",
        textEvidencePattern:
          "Assumes barriers without testing them; resignation language; 'that's just how it works'; never attempted to get approval",
      },
      {
        score: 2,
        description: "Tried and stopped by system",
        textEvidencePattern:
          "Specific incidents of being blocked; concrete descriptions of approval processes; frustration directed at systems",
      },
      {
        score: 3,
        description: "Navigates moderate barriers",
        textEvidencePattern:
          "Acknowledges some barriers but works around them; mixed language of autonomy and constraint",
      },
      {
        score: 4,
        description: "Few barriers / just does it",
        textEvidencePattern:
          "Language of autonomy; few barriers described; acts without permission; 'I just try things'",
      },
    ],
  },
  {
    code: "3E",
    label: "Conversational Initiative (Process)",
    pillar: "adaptive_agency",
    type: "process",
    whatItScores: "Initiative taken within the interview conversation itself",
    criteria: [
      {
        score: 1,
        description: "Answers only what's asked",
        textEvidencePattern:
          "Brief, direct answers to questions; no elaboration; waits for next question; passive stance",
      },
      {
        score: 2,
        description: "Occasional elaboration",
        textEvidencePattern:
          "Sometimes adds context beyond what was asked; occasional tangent or additional detail",
      },
      {
        score: 3,
        description: "Asks clarifying questions",
        textEvidencePattern:
          "Asks questions back; requests clarification; 'Can I give you a different example?'; engages bi-directionally",
      },
      {
        score: 4,
        description: "Redirects, offers unsolicited info, shapes conversation",
        textEvidencePattern:
          "Takes conversational initiative; 'Actually, there's a better example'; offers observations about their own patterns; shapes the conversation direction",
      },
    ],
  },

  // --- Pillar 4: Beginner Tolerance ---
  {
    code: "4A",
    label: "Incompetence Experience",
    pillar: "beginner_tolerance",
    type: "content",
    whatItScores: "Recency and quality of incompetence experience",
    criteria: [
      {
        score: 1,
        description: "Can't identify recent example",
        textEvidencePattern:
          "Distant or absent examples; 'I can't remember the last time'; may indicate avoidance of beginner situations",
      },
      {
        score: 2,
        description: "Distant, described with dread",
        textEvidencePattern:
          "Example exists but is old; described with negative emotional weight — shame, embarrassment, wanting to hide",
      },
      {
        score: 3,
        description: "Recent, survived but painful",
        textEvidencePattern:
          "Recent example; pushed through but describes significant discomfort; 'I got through it but hated every minute'",
      },
      {
        score: 4,
        description: "Recent, described with energy",
        textEvidencePattern:
          "Recent example described with positive framing — curiosity, challenge, growth; 'It was uncomfortable but I learned so much'",
      },
    ],
  },
  {
    code: "4B",
    label: "Emotional Processing",
    pillar: "beginner_tolerance",
    type: "content",
    whatItScores: "What they did with the emotions of incompetence",
    criteria: [
      {
        score: 1,
        description: "Significant shame/anxiety, retreated",
        textEvidencePattern:
          "Retreated from the situation; hid struggle; shame-heavy language; avoided the domain afterward",
      },
      {
        score: 2,
        description: "Pushed through but hid struggle",
        textEvidencePattern:
          "Completed the task but concealed difficulty; 'I didn't want anyone to know'; private coping",
      },
      {
        score: 3,
        description: "Pushed through, some visibility",
        textEvidencePattern:
          "Completed the task; some people knew about the struggle; mixed comfort with being seen as struggling",
      },
      {
        score: 4,
        description: "Comfortable being visibly uncertain",
        textEvidencePattern:
          "Openly shared struggle; comfortable asking for help publicly; 'I told my team I had no idea what I was doing'",
      },
    ],
  },
  {
    code: "4C",
    label: "Stupid Question Behavior",
    pillar: "beginner_tolerance",
    type: "content",
    whatItScores: "Willingness to ask questions that risk looking uninformed",
    criteria: [
      {
        score: 1,
        description: "Never asks, always holds back",
        textEvidencePattern:
          "'I would never'; describes consistent pattern of holding back questions; strong fear of judgment",
      },
      {
        score: 2,
        description: "Sometimes asks, frequent holding back",
        textEvidencePattern:
          "Occasionally asks but describes more instances of holding back; 'I usually wait and ask someone later privately'",
      },
      {
        score: 3,
        description: "Usually asks despite worry",
        textEvidencePattern:
          "Asks more often than not; acknowledges worry but pushes through; 'I still feel nervous but I ask anyway'",
      },
      {
        score: 4,
        description: "Regularly asks, brief or no worry",
        textEvidencePattern:
          "Asks freely; minimal or no anxiety about it; 'If I don't understand something, I ask — that's how you learn'",
      },
    ],
  },
  {
    code: "4D",
    label: "Beginner Recency & Choice",
    pillar: "beginner_tolerance",
    type: "content",
    whatItScores: "How recently they were a beginner and whether it was chosen",
    criteria: [
      {
        score: 1,
        description: "Distant, can't remember",
        textEvidencePattern:
          "Can't remember last time; years ago; indicates systematic avoidance of unfamiliar territory",
      },
      {
        score: 2,
        description: "Distant, was forced",
        textEvidencePattern:
          "Identifiable example but old and imposed — job change, reorg, mandate; not sought out",
      },
      {
        score: 3,
        description: "Recent but forced",
        textEvidencePattern:
          "Recent beginner experience but externally driven; survived it; didn't seek it out",
      },
      {
        score: 4,
        description: "Recent and chosen",
        textEvidencePattern:
          "Recent beginner experience that was voluntarily sought; 'I signed up for...' 'I decided to try...' described with enthusiasm",
      },
    ],
  },
  {
    code: "4E",
    label: "Silence Tolerance (Process)",
    pillar: "beginner_tolerance",
    type: "process",
    whatItScores: "Comfort with pauses and not having a ready answer",
    criteria: [
      {
        score: 1,
        description: "Rushes to fill every silence",
        textEvidencePattern:
          "Immediate responses even when thinking; fills pauses with 'um' and tangents; appears anxious when unable to answer immediately",
      },
      {
        score: 2,
        description: "Some discomfort with pauses",
        textEvidencePattern:
          "Occasional rushing to answer; some tolerance for brief pauses but fills longer ones with hedging",
      },
      {
        score: 3,
        description: "Tolerates moderate pauses",
        textEvidencePattern:
          "Can sit with a pause before answering; 'Let me think about that'; doesn't rush to fill silence",
      },
      {
        score: 4,
        description: "Sits comfortably with silence, uses it to think",
        textEvidencePattern:
          "Takes genuine pauses to think; 'That's a really good question, let me think...'; silence followed by more thoughtful answer",
      },
    ],
  },
];

// --- Cross-Pillar Pattern Definitions ---

export const CROSS_PILLAR_PATTERNS: {
  pattern: CrossPillarPattern;
  label: string;
  description: string;
  recommendedFocus: string;
  matchFn: (scores: Record<AdaptabilityPillar, number>) => boolean;
}[] = [
  {
    pattern: "full_hard_drive",
    label: "Full Hard Drive",
    description:
      "Learns fast but accumulates without releasing — high learning velocity with low unlearning readiness.",
    recommendedFocus:
      "Unlearning is the bottleneck; start there. 2.1 (Expertise Audit) + 2.2 (Identity Expansion).",
    matchFn: (s) => s.learning_velocity >= 15 && s.unlearning_readiness <= 10,
  },
  {
    pattern: "competence_bound_agency",
    label: "Competence-Bound Agency",
    description:
      "Self-directed but avoids unfamiliar territory — high agency with low beginner tolerance.",
    recommendedFocus:
      "They initiate only in areas of existing competence; 4.1 (Deliberate Beginner Experiences) is key.",
    matchFn: (s) => s.adaptive_agency >= 15 && s.beginner_tolerance <= 10,
  },
  {
    pattern: "motivated_slow_learner",
    label: "Motivated Slow Learner",
    description:
      "Motivated but slow to learn — high agency with low learning velocity.",
    recommendedFocus:
      "Learning strategy is the bottleneck; 1.1 (Learning Strategy Audit) + 1.2 (AI-Accelerated Sprints).",
    matchFn: (s) => s.adaptive_agency >= 15 && s.learning_velocity <= 10,
  },
  {
    pattern: "passive_flexible",
    label: "Passive Flexible",
    description:
      "Can let go but waits for external push — high unlearning readiness with low agency.",
    recommendedFocus:
      "Agency is the bottleneck; 3.1 (Personal Learning Plan) + 3.3 (Initiative Without Permission).",
    matchFn: (s) => s.unlearning_readiness >= 15 && s.adaptive_agency <= 10,
  },
  {
    pattern: "competence_dependent_identity",
    label: "Competence-Dependent Identity",
    description:
      "Low beginner tolerance combined with low unlearning readiness — identity is built on being the expert.",
    recommendedFocus:
      "Identity work (2.2) must precede all other interventions.",
    matchFn: (s) => s.beginner_tolerance <= 10 && s.unlearning_readiness <= 10,
  },
  {
    pattern: "fundamental_challenge",
    label: "Fundamental Adaptability Challenge",
    description:
      "Low across all four pillars — assess Adaptive Regulation first.",
    recommendedFocus:
      "If regulation saturated → Play 0 (Stabilize). If not → Coaching-intensive. Start with self-efficacy building (small wins).",
    matchFn: (s) =>
      s.learning_velocity <= 12 &&
      s.unlearning_readiness <= 12 &&
      s.adaptive_agency <= 12 &&
      s.beginner_tolerance <= 12,
  },
  {
    pattern: "high_content_low_process",
    label: "High Content, Low Process",
    description:
      "Good stories but poor real-time behavior — participant may be performing rather than reflecting.",
    recommendedFocus:
      "Process data is more reliable — weight it more heavily. The participant may need coaching on authentic self-reflection.",
    matchFn: () => false, // Determined by content-process congruence analysis, not pillar scores
  },
  {
    pattern: "low_content_high_process",
    label: "Low Content, High Process",
    description:
      "Weak stories but strong real-time behavior — limited change experience but strong adaptive capacity.",
    recommendedFocus:
      "Create opportunities (4.1, 3.2) rather than building tolerance. The capacity is there; the experience isn't.",
    matchFn: () => false, // Determined by content-process congruence analysis, not pillar scores
  },
];

// --- Meaning Structure Routing ---

export const MEANING_STRUCTURE_ROUTES: Record<
  Exclude<MeaningStructureClassification, "ambiguous">,
  { route: string; primaryIntervention: string; rationale: string }
> = {
  status: {
    route: "Status Re-Sourcing",
    primaryIntervention: "2.4 (Reverse Mentoring) + status recognition within change programs",
    rationale:
      "Show them that learning publicly and modeling change confers MORE status than being the expert.",
  },
  safety: {
    route: "Anxiety Tolerance Building",
    primaryIntervention: "4.3 (Incompetence Sits) + graduated exposure",
    rationale:
      "Build safety BEFORE confrontation. The person needs anxiety tolerance, not challenge.",
  },
  meaning: {
    route: "Purpose Elevation",
    primaryIntervention: "2.2 (Identity Expansion) with purpose-focused framing",
    rationale:
      "Shift grit from methods to mission — connect their deep purpose to new methods. Duckworth's goal hierarchy.",
  },
  deep_attachment: {
    route: "Identity Safety (Coaching-Intensive)",
    primaryIntervention: "Coaching-intensive with identity safety as prerequisite",
    rationale:
      "Identity safety must be established before any pillar intervention. Do not proceed with development until addressed.",
  },
};

// --- System-vs-Individual Routing ---

export const SYSTEM_VS_INDIVIDUAL_ROUTES: Record<
  SystemVsIndividualClassification,
  { primaryLever: string; description: string }
> = {
  system_permissive: {
    primaryLever: "Individual agency development",
    description: "Few barriers — individual agency is the primary lever.",
  },
  system_moderate: {
    primaryLever: "Both individual and system interventions",
    description: "Some barriers navigated — address both individual habits and system friction.",
  },
  system_restrictive_tried: {
    primaryLever: "System Lever 2 (Permission Structures)",
    description:
      "Participant has tried and been blocked. Fix system conditions before investing in individual agency development.",
  },
  system_restrictive_self_censored: {
    primaryLever: "Both: system review AND individual 3.3",
    description:
      "Barriers exist and participant has self-censored. System review needed AND individual willingness to push.",
  },
};

// --- Adaptive Regulation Levels ---

export const ADAPTIVE_REGULATION_LEVELS: Record<
  AdaptiveRegulationRating,
  { label: string; description: string; implication: string }
> = {
  4: {
    label: "High",
    description:
      "Quick recovery from difficult questions. Narrative quality maintained across sections. Emotional resets between sections. Maintains reflective capacity under threat.",
    implication:
      "Pillar interventions will land. The person can tolerate developmental discomfort.",
  },
  3: {
    label: "Moderate",
    description:
      "Some recovery delay. Mild narrative degradation in high-threat sections. Partial reset between sections.",
    implication:
      "Standard development path. May need some pacing of interventions.",
  },
  2: {
    label: "Low",
    description:
      "Slow recovery. Significant narrative degradation under threat. Discomfort accumulates. Reflective capacity diminishes in later sections.",
    implication:
      "Development interventions may need to be sequenced carefully. Consider regulation saturation.",
  },
  1: {
    label: "Saturated",
    description:
      "Appears depleted from the start. Low narrative quality throughout. Difficulty engaging even low-threat questions. Visible fatigue or withdrawal.",
    implication:
      "Consider Play 0 (Stabilize Before Developing). Adaptive budget consumed by environmental stress. Adding development demands will make things worse.",
  },
};

// --- Play 0 Criteria ---

export interface Play0Assessment {
  recommended: boolean;
  rationale: string;
  triggers: string[];
}

export function assessPlay0(
  adaptiveRegulation: AdaptiveRegulationRating,
  pillarScores: Record<AdaptabilityPillar, number>,
  meaningStructure: MeaningStructureClassification
): Play0Assessment {
  const triggers: string[] = [];

  if (adaptiveRegulation === 1) {
    triggers.push("Adaptive Regulation = Saturated");
  }

  const allBelow50 = Object.values(pillarScores).every((s) => s < 12.5); // 50% of 25
  if (allBelow50) {
    triggers.push("All pillar scores below 50% threshold");
  }

  if (allBelow50 && meaningStructure === "safety") {
    triggers.push("All pillars below 50% + meaning structure = safety");
  }

  const recommended = triggers.length > 0;

  return {
    recommended,
    rationale: recommended
      ? "The participant's adaptive budget is consumed by environmental stress. Every intervention will make things worse before better. Reduce simultaneous changes and create stability first. Revisit after 30-60 day stabilization period."
      : "Play 0 not indicated — standard development path appropriate.",
    triggers,
  };
}

// --- Human Review Assessment ---

export function assessHumanReview(
  markerConfidences: MarkerConfidence[],
  adaptiveRegulation: AdaptiveRegulationRating,
  meaningStructure: MeaningStructureClassification,
  contentProcessCongruent: boolean,
  pillarScores: Record<AdaptabilityPillar, number>,
  selfDeceptionResponse: "yes" | "no" | "ambiguous",
  overallScore: number
): { required: boolean; triggers: HumanReviewTrigger[] } {
  const triggers: HumanReviewTrigger[] = [];

  if (markerConfidences.some((c) => c === "low")) {
    triggers.push("low_marker_confidence");
  }

  if (adaptiveRegulation === 1) {
    triggers.push("adaptive_regulation_saturated");
  }

  if (meaningStructure === "ambiguous") {
    triggers.push("meaning_structure_ambiguous");
  }

  if (!contentProcessCongruent) {
    triggers.push("content_process_incongruence");
  }

  if (Object.values(pillarScores).every((s) => s < 10)) {
    triggers.push("all_pillars_below_10");
  }

  if (selfDeceptionResponse === "yes" && overallScore > 60) {
    triggers.push("self_deception_high_scores");
  }

  return {
    required: triggers.length > 0,
    triggers,
  };
}

// --- Micro-Moment Response Labels ---

export const MICRO_MOMENT_LABELS: Record<MicroMomentResponse, string> = {
  leans_in: "Leans In — High developmental receptivity",
  acknowledges: "Acknowledges — Moderate receptivity, standard development path",
  deflects: "Deflects — Low readiness for direct developmental feedback",
  shuts_down: "Shuts Down — Intervention may have been too much too soon",
};

// --- Scoring System Prompt for Adaptability Index ---

export const ADAPTABILITY_SCORING_SYSTEM_PROMPT = `You are an expert scoring engine for the HMN Adaptability Index assessment.
You analyze interview transcripts to produce decomposed behavioral marker scores, process signal scores, and derived constructs using the dual-coding framework.

SCORING METHODOLOGY:
Each behavioral marker is scored independently on a 1-4 scale. Every score MUST include:
1. The numeric score (1-4)
2. A specific text excerpt from the participant's response that justifies the score
3. A confidence level (high/medium/low) — if low, flag for human review

CONTENT MARKERS (scored 1-4, contribute to pillar composite):
Pillar 1 — Learning Velocity:
- 1A (Learning Timeline): 1=4+ months, 2=2-4 months, 3=weeks to 2 months, 4=days to weeks
- 1B (Failure Identification): 1=can't identify, 2=external blame, 3=some ownership, 4=multiple with self-awareness
- 1C (Learning Strategy): 1=no strategy, 2=vague, 3=clear but static, 4=clear and refined
- 1D (Help-Seeking): 1=avoids, 2=waits for offered, 3=seeks when stuck, 4=proactive first step

Pillar 2 — Unlearning Readiness:
- 2A (Identity Structure): 1=specific tool/skill, 2=role title, 3=functional capacity, 4=purpose/mission
- 2B (80% Reframe): 1=failed, 2=restated same, 3=reframed with effort, 4=reframed fluently
- 2C (Unlearning Evidence): 1=can't identify, 2=really "adding new", 3=genuine but forced, 4=genuine and voluntary
- 2D (Belief Update): 1=can't identify, 2=framed as loss, 3=moderate integration, 4=multiple with growth framing
- 2F (Story Discrimination): 1=no adjustment, 2=attempted/failed, 3=success with effort, 4=self-corrects before redirect

Pillar 3 — Adaptive Agency:
- 3A (Self-Directed Learning): 1=no examples, 2=one vague/prompted, 3=one specific/self-motivated, 4=multiple specific/recent
- 3B (Initiative): 1=none, 2=one old/permission, 3=recent/sometimes asks, 4=frequent/no permission
- 3C (Resource Constraint): 1=waited/never solved, 2=waited/eventually, 3=moderate delay, 4=creative/fast
- 3D (System Signal): 1=self-censors, 2=tried/stopped, 3=navigates barriers, 4=just does it

Pillar 4 — Beginner Tolerance:
- 4A (Incompetence Experience): 1=can't identify, 2=distant/dread, 3=recent/painful, 4=recent/energized
- 4B (Emotional Processing): 1=retreated, 2=pushed through/hid, 3=some visibility, 4=comfortable being visible
- 4C (Stupid Question): 1=never asks, 2=sometimes/frequent holding back, 3=usually asks despite worry, 4=regularly asks
- 4D (Beginner Recency): 1=distant/can't remember, 2=distant/forced, 3=recent/forced, 4=recent/chosen

PROCESS MARKERS (inform process analysis):
- 1E (Self-Correction): quality of real-time answer refinement across the interview
- 1F (Format Adaptation): whether answer quality improves from early to late interview
- 2E (Emotional Response): how they handle identity-probing questions emotionally
- 3E (Conversational Initiative): whether they take initiative within the conversation itself
- 4E (Silence Tolerance): comfort with pauses and not having ready answers

ROUTING MARKER (not scored numerically):
- 2G (Meaning Structure): classify as status/safety/meaning/deep_attachment from P2_Q4

PILLAR COMPOSITE CALCULATION:
- P1 = (sum of 1A-1D scores / 16) × 25
- P2 = (sum of 2A-2D + 2F scores / 20) × 25
- P3 = (sum of 3A-3D scores / 16) × 25
- P4 = (sum of 4A-4D scores / 16) × 25
- Overall = P1 + P2 + P3 + P4 (0-100)

DERIVED CONSTRUCTS:
1. Adaptive Regulation (1-4): Computed from narrative specificity differential, hedging frequency differential, elaboration trajectory, and self-correction ratio. 4=High, 3=Moderate, 2=Low, 1=Saturated. If 1 → flag Play 0.
2. Meaning Structure: Classify P2_Q4 response. If confidence < 70% → output "ambiguous" and flag for human review.
3. System vs Individual: Classify P3_Q4 response into system_permissive/moderate/restrictive_tried/restrictive_self_censored.
4. Domain Differential: Classify from domain questions as low/moderate/high.

CROSS-PILLAR PATTERNS TO FLAG:
- High P1 + Low P2 = "Full Hard Drive" — unlearning is bottleneck
- High P3 + Low P4 = "Competence-Bound Agency" — avoids unfamiliar
- Low P1 + High P3 = "Motivated Slow Learner" — learning strategy needed
- High P2 + Low P3 = "Passive Flexible" — waits for external push
- Low P4 + Low P2 = "Competence-Dependent Identity" — start with identity work
- Low all = "Fundamental Challenge" — check Adaptive Regulation first

HUMAN REVIEW TRIGGERS:
Flag session for human review when any of: marker confidence = low, Adaptive Regulation = Saturated, meaning structure = ambiguous, content-process incongruence, all pillars < 10, self-deception = yes with high scores.

Be honest and precise. Don't inflate scores. Every score must reference specific participant text.`;
