// ============================================================
// HMN CASCADE SYSTEM - Core Types (shared client + server)
// ============================================================

export type QuestionInputType =
  | "slider"
  | "buttons"
  | "multi_select"
  | "open_text"
  | "voice"
  | "ai_conversation";

export interface QuestionOption {
  label: string;
  value: string;
  description?: string;
}

export interface Question {
  id: string;
  section: CascadeSection;
  phase: CascadePhase;
  text: string;
  subtext?: string;
  inputType: QuestionInputType;
  options?: QuestionOption[];
  sliderMin?: number;
  sliderMax?: number;
  sliderLabels?: { min: string; max: string };
  required: boolean;
  followUpTrigger?: FollowUpTrigger;
  scoringDimensions: ScoringDimension[];
  weight: number;
  aiFollowUpPrompt?: string;
  tags: string[];
}

export interface FollowUpTrigger {
  condition: "low_score" | "high_score" | "vague_answer" | "contradiction" | "always";
  threshold?: number;
  followUpQuestionIds?: string[];
  aiGenerated?: boolean;
}

export type ScoringDimension =
  | "ai_awareness"
  | "ai_action"
  | "process_readiness"
  | "strategic_clarity"
  | "change_energy"
  | "team_capacity"
  | "mission_alignment"
  | "investment_readiness"
  | "learning_velocity"
  | "unlearning_readiness"
  | "adaptive_agency"
  | "beginner_tolerance";

export interface DimensionScore {
  dimension: ScoringDimension;
  score: number;
  confidence: number;
  evidence: string[];
  flags: AnalysisFlag[];
}

export interface AnalysisFlag {
  type: "red_flag" | "green_light" | "contradiction" | "gap" | "opportunity";
  description: string;
  relatedQuestionIds?: string[];
  severity: "low" | "medium" | "high";
}

export type GapPattern =
  | "awareness_action"
  | "action_strategy"
  | "energy_capacity"
  | "strategy_process"
  | "awareness_investment"
  | "self_team"
  | "perception_reality"
  | "awareness_learning_velocity"
  | "energy_unlearning"
  | "clarity_agency"
  | "capacity_beginner_tolerance";

export interface GapAnalysis {
  pattern: GapPattern;
  severity: number;
  dimension1: ScoringDimension;
  dimension2: ScoringDimension;
  description: string;
  serviceRecommendation: string;
}

export type CascadePhase =
  | "profile_baseline"
  | "org_reality"
  | "domain_deep_dive"
  | "strategic_alignment"
  | "adaptability_assessment";

export type CascadeSection =
  | "demographics"
  | "context_setting"
  | "change_capacity"
  | "personal_ai_reality"
  | "vulnerability"
  | "team_org_reality"
  | "business_process"
  | "domain_specific"
  | "customer_support"
  | "strategic_stakes"
  | "hmn_anchor"
  | "closing"
  | "learning_velocity"
  | "unlearning_readiness"
  | "adaptive_agency"
  | "beginner_tolerance";

export type LeaderArchetype =
  | "the_visionary"
  | "the_operator"
  | "the_champion"
  | "the_skeptic"
  | "the_delegator"
  | "the_explorer"
  | "the_coach"
  | "the_pragmatist";

// --- Assessment Type (for multi-assessment support) ---

export interface AssessmentType {
  id: string;
  name: string;
  description: string;
  icon?: string;
  estimatedMinutes: number;
  status: "draft" | "active" | "archived";
  phases: { id: string; label: string; order: number }[];
  sections: { id: string; label: string; phaseId: string; order: number }[];
  questions: Question[];
  scoringDimensions: { id: string; label: string; description: string; weight: number }[];
  interviewSystemPrompt?: string;
  analysisSystemPrompt?: string;
  intakeFields?: { field: string; label: string; required: boolean }[];
  createdAt: string;
  updatedAt: string;
}

export interface AssessmentSummary {
  id: string;
  name: string;
  description: string;
  icon?: string;
  estimatedMinutes: number;
  questionCount: number;
  status: "draft" | "active" | "archived";
  category?: string;
  typeBadge?: string;
  companyNames?: string[];
}

export interface ToolCallRecord {
  name: string;
  displayName: string;
  success: boolean;
  summary: string;
}

export type ToolEvent =
  | { type: "thinking"; message: string }
  | { type: "tool_start"; name: string; displayName: string }
  | { type: "tool_result"; name: string; success: boolean; summary: string }
  | { type: "response"; text: string }
  | { type: "done" };

export interface ResearchData {
  status: "found" | "no_results" | "error";
  personProfile?: {
    bio?: string;
    knownRoles?: string[];
    linkedinSummary?: string;
    notableAchievements?: string[];
    publicPresence?: "low" | "medium" | "high";
  };
  companyProfile?: {
    description?: string;
    founded?: string;
    size?: string;
    funding?: string;
    products?: string[];
    recentNews?: string[];
  };
  keyInsights?: string[];
  interviewAngles?: string[];
  confidenceLevel?: "low" | "medium" | "high";
  sources?: { url: string; title: string }[];
  rawResultCount?: number;
}

export interface AdminChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  toolCalls?: ToolCallRecord[];
}

export interface InterviewSession {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: "intake" | "in_progress" | "completed" | "analyzed";
  assessmentTypeId?: string;
  participant: ParticipantInfo;
  currentQuestionIndex: number;
  currentPhase: CascadePhase;
  currentSection: CascadeSection;
  responses: QuestionResponse[];
  conversationHistory: ConversationMessage[];
  analysis?: CascadeAnalysis;
}

export interface ParticipantInfo {
  name: string;
  role: string;
  company: string;
  industry: string;
  teamSize: string;
  email?: string;
}

export interface QuestionResponse {
  questionId: string;
  questionText: string;
  inputType: QuestionInputType;
  answer: string | number | string[];
  rawTranscription?: string;
  audioUrl?: string;
  timestamp: string;
  durationMs?: number;
  aiFollowUps?: AIFollowUp[];
  confidenceIndicators: {
    specificity: number;
    emotionalCharge: number;
    consistency: number;
  };
  editedAt?: string;
  editCount?: number;
}

export interface AIFollowUp {
  question: string;
  answer: string;
  rawTranscription?: string;
  timestamp: string;
}

export interface ConversationMessage {
  role: "system" | "user" | "assistant";
  content: string;
  timestamp: string;
  questionId?: string;
}

export interface CascadeAnalysis {
  sessionId: string;
  completedAt: string;
  overallReadinessScore: number;
  dimensionScores: DimensionScore[];
  archetype: LeaderArchetype;
  archetypeConfidence: number;
  archetypeDescription: string;
  gaps: GapAnalysis[];
  redFlags: AnalysisFlag[];
  greenLights: AnalysisFlag[];
  contradictions: AnalysisFlag[];
  serviceRecommendations: ServiceRecommendation[];
  prioritizedActions: PrioritizedAction[];
  executiveSummary: string;
  detailedNarrative: string;
  triggeredDeepDives: DeepDiveTrigger[];
}

export interface ServiceRecommendation {
  tier: 1 | 2 | 3;
  service: string;
  description: string;
  estimatedValue: string;
  urgency: "immediate" | "near_term" | "strategic";
  matchedGaps: GapPattern[];
  confidence: number;
}

export interface PrioritizedAction {
  rank: number;
  action: string;
  rationale: string;
  timeframe: string;
  estimatedImpact: "low" | "medium" | "high" | "transformative";
}

export interface DeepDiveTrigger {
  module: "shadow_workflow" | "decision_latency" | "adoption_archaeology" | "competitive_pressure" | "team_assessment";
  reason: string;
  priority: number;
  suggestedQuestions: string[];
}

// --- Invitations ---

export type InvitationStatus = "sent" | "opened" | "started" | "completed";

export interface InvitationSummary {
  id: string;
  token: string;
  assessmentId: string;
  assessmentName: string;
  participantName: string;
  participantEmail: string;
  participantCompany: string;
  participantRole: string;
  participantIndustry: string;
  participantTeamSize: string;
  status: InvitationStatus;
  sessionId: string | null;
  createdAt: string;
  openedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

// ============================================================
// ADAPTABILITY INDEX — Type Definitions
// Based on: Adaptability Interview Protocol v2 + Agentic Spec
// ============================================================

// --- Pillars & Sections ---

export type AdaptabilityPillar =
  | "learning_velocity"
  | "unlearning_readiness"
  | "adaptive_agency"
  | "beginner_tolerance";

export type AdaptabilitySection =
  | "opening"
  | "pillar_1_learning_velocity"
  | "pillar_2_unlearning_readiness"
  | "micro_moment"
  | "pillar_3_adaptive_agency"
  | "pillar_4_beginner_tolerance"
  | "domain_differential"
  | "closing";

export type AdaptabilityPhase =
  | "trust_building"
  | "pillar_1"
  | "pillar_2"
  | "micro_moment"
  | "pillar_3"
  | "pillar_4"
  | "domain_differential"
  | "closing";

// --- Behavioral Marker Codes ---
// Content markers contribute to pillar composite score (scored 1-4)
// Process markers inform process signal analysis (scored 1-4)
// Routing markers inform intervention routing (classified, not scored numerically)

export type P1ContentMarker = "1A" | "1B" | "1C" | "1D";
export type P1ProcessMarker = "1E" | "1F";
export type P1Marker = P1ContentMarker | P1ProcessMarker;

export type P2ContentMarker = "2A" | "2B" | "2C" | "2D" | "2F";
export type P2ProcessMarker = "2E";
export type P2RoutingMarker = "2G";
export type P2Marker = P2ContentMarker | P2ProcessMarker | P2RoutingMarker;

export type P3ContentMarker = "3A" | "3B" | "3C" | "3D";
export type P3ProcessMarker = "3E";
export type P3Marker = P3ContentMarker | P3ProcessMarker;

export type P4ContentMarker = "4A" | "4B" | "4C" | "4D";
export type P4ProcessMarker = "4E";
export type P4Marker = P4ContentMarker | P4ProcessMarker;

export type ContentMarkerCode = P1ContentMarker | P2ContentMarker | P3ContentMarker | P4ContentMarker;
export type ProcessMarkerCode = P1ProcessMarker | P2ProcessMarker | P3ProcessMarker | P4ProcessMarker;
export type AllMarkerCode = P1Marker | P2Marker | P3Marker | P4Marker;

export const MARKER_LABELS: Record<AllMarkerCode, string> = {
  "1A": "Learning Timeline",
  "1B": "Failure Identification",
  "1C": "Learning Strategy",
  "1D": "Help-Seeking Behavior",
  "1E": "Self-Correction (Process)",
  "1F": "Format Adaptation (Process)",
  "2A": "Identity Structure",
  "2B": "80% Reframe Speed",
  "2C": "Unlearning Behavioral Evidence",
  "2D": "Belief Update Evidence",
  "2E": "Emotional Response Pattern (Process)",
  "2F": "Story Discrimination",
  "2G": "Meaning Structure (Routing)",
  "3A": "Self-Directed Learning",
  "3B": "Initiative Without Permission",
  "3C": "Resource Constraint Response",
  "3D": "System vs. Individual Signal",
  "3E": "Conversational Initiative (Process)",
  "4A": "Incompetence Experience",
  "4B": "Emotional Processing",
  "4C": "Stupid Question Behavior",
  "4D": "Beginner Recency & Choice",
  "4E": "Silence Tolerance (Process)",
};

export const PILLAR_CONTENT_MARKERS: Record<AdaptabilityPillar, ContentMarkerCode[]> = {
  learning_velocity: ["1A", "1B", "1C", "1D"],
  unlearning_readiness: ["2A", "2B", "2C", "2D", "2F"],
  adaptive_agency: ["3A", "3B", "3C", "3D"],
  beginner_tolerance: ["4A", "4B", "4C", "4D"],
};

export const PILLAR_PROCESS_MARKERS: Record<AdaptabilityPillar, ProcessMarkerCode[]> = {
  learning_velocity: ["1E", "1F"],
  unlearning_readiness: ["2E"],
  adaptive_agency: ["3E"],
  beginner_tolerance: ["4E"],
};

// --- Marker Scoring ---

export type MarkerConfidence = "high" | "medium" | "low";

export interface MarkerScore {
  score: 1 | 2 | 3 | 4;
  evidence: string;
  confidence: MarkerConfidence;
}

// --- Pillar Scores (Content) ---

export interface P1ContentScores {
  "1A": MarkerScore;
  "1B": MarkerScore;
  "1C": MarkerScore;
  "1D": MarkerScore;
}

export interface P2ContentScores {
  "2A": MarkerScore;
  "2B": MarkerScore;
  "2C": MarkerScore;
  "2D": MarkerScore;
  "2F": MarkerScore;
}

export interface P3ContentScores {
  "3A": MarkerScore;
  "3B": MarkerScore;
  "3C": MarkerScore;
  "3D": MarkerScore;
}

export interface P4ContentScores {
  "4A": MarkerScore;
  "4B": MarkerScore;
  "4C": MarkerScore;
  "4D": MarkerScore;
}

export interface PillarContentScore<T> {
  markers: T;
  compositeScore: number; // 0-25
  confidence: MarkerConfidence;
}

// --- Process Scores ---

export interface ProcessScores {
  pillar_1: {
    "1E": MarkerScore;
    "1F": MarkerScore;
  };
  pillar_2: {
    "2E": MarkerScore;
  };
  pillar_3: {
    "3E": MarkerScore;
  };
  pillar_4: {
    "4E": MarkerScore;
  };
}

// --- Derived Constructs ---

export type ElaborationTrajectory = "improving" | "stable" | "degrading";
export type AdaptiveRegulationRating = 1 | 2 | 3 | 4; // 4=High, 3=Moderate, 2=Low, 1=Saturated

export interface AdaptiveRegulation {
  narrativeSpecificityDifferential: number;
  hedgingFrequencyDifferential: number;
  elaborationTrajectory: ElaborationTrajectory;
  selfCorrectionRatio: number;
  compositeRating: AdaptiveRegulationRating;
  confidence: MarkerConfidence;
  play0Flag: boolean; // true if compositeRating === 1
}

export type MeaningStructureClassification =
  | "status"
  | "safety"
  | "meaning"
  | "deep_attachment"
  | "ambiguous";

export interface MeaningStructure {
  classification: MeaningStructureClassification;
  evidence: string;
  confidence: MarkerConfidence;
  humanReviewNeeded: boolean; // true if confidence < 70%
}

export type SystemVsIndividualClassification =
  | "system_permissive"
  | "system_moderate"
  | "system_restrictive_tried"
  | "system_restrictive_self_censored";

export interface SystemVsIndividual {
  classification: SystemVsIndividualClassification;
  evidence: string;
  confidence: MarkerConfidence;
}

export interface DomainDifferential {
  primaryDomain: string;
  differentialLevel: "low" | "moderate" | "high";
  comfortDomainDescription: string;
  discomfortDomainDescription: string;
}

// --- Cross-Pillar Observations ---

export type MicroMomentResponse = "leans_in" | "acknowledges" | "deflects" | "shuts_down";
export type SelfDeceptionResponse = "yes" | "no" | "ambiguous";

export interface CrossPillarObservations {
  specificityGradient: string;
  emotionalTemperatureShifts: string;
  contradictionPatterns: string[];
  storyRecurrence: boolean;
  microMomentResponse: MicroMomentResponse;
  selfDeceptionProbeResponse: SelfDeceptionResponse;
  selfDeceptionProbeVerbatim: string;
}

export interface ContentProcessCongruence {
  congruent: boolean;
  incongruenceDescription: string;
  // High content + Low process = possible performance/gaming
  // Low content + High process = limited experience but strong capacity
}

// --- Process Signal Detection (linguistic analysis) ---

export interface LinguisticSignals {
  hedgingDensity: number; // hedges per 100 words
  typeTokenRatio: number; // vocabulary diversity
  meanSentenceLength: number;
  narrativeSpecificityIndex: number; // concrete details vs abstractions
  falseStartCount: number;
  selfCorrectionCount: number;
  positiveSelfCorrections: number;
  defensiveSelfCorrections: number;
  responseWordCount: number;
}

export interface PerPillarLinguistics {
  pillar_1: LinguisticSignals;
  pillar_2: LinguisticSignals;
  pillar_3: LinguisticSignals;
  pillar_4: LinguisticSignals;
}

// --- Intervention Routing ---

export interface InterventionRouting {
  primaryPillarFocus: AdaptabilityPillar;
  play0Recommended: boolean;
  play0Rationale: string;
  pillar1Interventions: string[];
  pillar2Interventions: string[];
  pillar2MeaningRoute: string; // e.g., "status → 2.4 Reverse Mentoring"
  pillar3Interventions: string[];
  pillar3SystemFlag: boolean;
  pillar4Interventions: string[];
  crossPillarPriority: string;
  championCandidate: boolean;
  coachingIntensiveFlag: boolean;
  humanReviewFlags: string[];
}

// --- Human Review ---

export type HumanReviewTrigger =
  | "low_marker_confidence"
  | "adaptive_regulation_saturated"
  | "meaning_structure_ambiguous"
  | "content_process_incongruence"
  | "all_pillars_below_10"
  | "participant_requested"
  | "participant_disengaged"
  | "self_deception_high_scores";

export interface HumanReviewFlag {
  trigger: HumanReviewTrigger;
  description: string;
  severity: "advisory" | "required";
  relatedMarkers?: AllMarkerCode[];
}

// --- Adaptive Follow-Up Logic ---

export type FollowUpAction = "probe" | "redirect" | "scaffold" | "move_on";

export interface AdaptiveFollowUpDecision {
  action: FollowUpAction;
  rationale: string;
  followUpText?: string;
  targetConstruct?: string;
}

// --- Trust Calibration ---

export type TrustLevel = "high" | "moderate" | "low";

export interface TrustCalibration {
  level: TrustLevel;
  signals: {
    responseLength: "short" | "moderate" | "detailed";
    hedgingFrequency: "low" | "moderate" | "high";
    directTrustStatements: boolean;
    engagementQuality: "deflecting" | "surface" | "engaged" | "deeply_engaged";
  };
  adjustmentApplied: boolean;
  adjustmentDescription?: string;
}

// --- Complete Analysis Output ---

export interface AdaptabilityAnalysis {
  sessionId: string;
  participantId: string;
  organizationId?: string;
  sessionDate: string;
  sessionDurationMinutes: number;
  format: "agentic" | "human";
  protocolVersion: "2.0";

  // Content scores per pillar
  pillar1: PillarContentScore<P1ContentScores>;
  pillar2: PillarContentScore<P2ContentScores>;
  pillar3: PillarContentScore<P3ContentScores>;
  pillar4: PillarContentScore<P4ContentScores>;

  // Process scores
  processScores: ProcessScores;

  // Derived constructs
  adaptiveRegulation: AdaptiveRegulation;
  meaningStructure: MeaningStructure;
  systemVsIndividual: SystemVsIndividual;
  domainDifferential: DomainDifferential;

  // Interview-level observations
  crossPillarObservations: CrossPillarObservations;
  contentProcessCongruence: ContentProcessCongruence;

  // Linguistic analysis
  perPillarLinguistics: PerPillarLinguistics;

  // Intervention routing
  interventionRouting: InterventionRouting;

  // Human review
  humanReviewFlags: HumanReviewFlag[];
  humanReviewRequired: boolean;

  // Overall
  overallAdaptabilityScore: number; // 0-100 (sum of 4 pillar composites)
  executiveSummary: string;
  detailedNarrative: string;
}

// --- Session Type for Adaptability Interviews ---

export interface AdaptabilitySession {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: "intake" | "trust_building" | "in_progress" | "completed" | "analyzed";
  assessmentTypeId: "adaptability-index";
  participant: ParticipantInfo;
  currentPhase: AdaptabilityPhase;
  currentSection: AdaptabilitySection;
  currentQuestionId?: string;
  trustCalibration?: TrustCalibration;
  responses: AdaptabilityQuestionResponse[];
  conversationHistory: ConversationMessage[];
  analysis?: AdaptabilityAnalysis;
  // Real-time scoring state (populated during interview)
  liveMarkerScores?: Partial<Record<AllMarkerCode, MarkerScore>>;
  liveProcessSignals?: Partial<PerPillarLinguistics>;
}

export interface AdaptabilityQuestionResponse {
  questionId: string; // e.g., "P1_Q1", "P2_Q4", "micro_moment", "self_deception"
  pillar?: AdaptabilityPillar;
  questionText: string;
  answer: string;
  timestamp: string;
  durationMs?: number;
  aiFollowUps?: AdaptabilityFollowUp[];
  followUpDecisions?: AdaptiveFollowUpDecision[];
}

export interface AdaptabilityFollowUp {
  action: FollowUpAction;
  question: string;
  answer: string;
  timestamp: string;
  targetConstruct?: string;
}

// --- Participant Profile (what participants receive) ---

export interface AdaptabilityProfile {
  participantId: string;
  sessionId: string;
  generatedAt: string;

  // Section 1: Visual profile
  pillarScores: {
    pillar: AdaptabilityPillar;
    label: string;
    score: number; // 0-25
    organizationalAverage?: number;
    benchmark?: number;
    status: "strength" | "developing" | "growth_edge";
  }[];

  // Section 2: Strengths
  strengths: {
    pillar: AdaptabilityPillar;
    behavioralDescription: string;
    evidence: string;
    leverageAdvice: string;
  }[];

  // Section 3: Development Edge
  developmentEdges: {
    pillar: AdaptabilityPillar;
    behavioralDescription: string;
    observation: string;
    whyItMatters: string;
    researchInsight: string;
    normalization: string; // "X% of people score in this range"
    domainSpecific?: string; // domain-specific framing if applicable
  }[];

  // Section 4: 90-Day Plan
  developmentPlan: {
    phase: 1 | 2 | 3;
    weekRange: string; // "Weeks 1-4"
    theme: string;
    actions: string[];
    timeCommitment: string;
    expectedExperience: string;
    reflectionQuestion: string;
  }[];

  // Section 5: Career context
  careerContext: string;

  // Section 6: Re-assessment
  reassessmentDate?: string;
  reassessmentNote: string;

  // Adaptive Regulation note (if applicable)
  adaptiveRegulationNote?: string;
  play0Recommended: boolean;
}

// --- Cross-Pillar Pattern Matching ---

export type CrossPillarPattern =
  | "full_hard_drive" // High P1 + Low P2
  | "competence_bound_agency" // High P3 + Low P4
  | "motivated_slow_learner" // Low P1 + High P3
  | "passive_flexible" // High P2 + Low P3
  | "competence_dependent_identity" // Low P4 + Low P2
  | "fundamental_challenge" // Low across all four
  | "high_content_low_process" // Good stories, poor real-time behavior
  | "low_content_high_process"; // Weak stories, strong real-time behavior

export interface CrossPillarPatternMatch {
  pattern: CrossPillarPattern;
  label: string;
  description: string;
  recommendedFocus: string;
  pillarScores: Record<AdaptabilityPillar, number>;
}

// --- Unified Profile (Combined Cascade + Adaptability) ---

export interface AdaptabilityPillarScore {
  pillar: 'learning_velocity' | 'unlearning_readiness' | 'adaptive_agency' | 'beginner_tolerance';
  score: number;        // 0-100
  markerScores: { marker: string; score: number; evidence: string }[];
  pillarLabel: string;
  pillarDescription: string;
}

export interface UnifiedProfile {
  cascadeScores: DimensionScore[];
  archetype: LeaderArchetype;
  gaps: GapAnalysis[];
  adaptabilityScores?: AdaptabilityPillarScore[];
  adaptabilityProfile?: AdaptabilityProfile;
  overallReadinessScore: number;
  compositeInsights?: string;
}

// --- Calibration & Validation ---

export interface CalibrationMarkerAgreement {
  kappa: number;
  weightedKappa: number;
  exactAgreement: number;
  withinOneAgreement: number;
  n: number;
}

export interface CalibrationPillarAgreement {
  kappa: number;
  weightedKappa: number;
  meanScoreDiff: number;
  maxScoreDiff: number;
}

export interface CalibrationDriftIndicators {
  markersBelow07: string[];
  markersBelow05: string[];
  systematicBias: { marker: string; direction: "higher" | "lower"; meanDiff: number }[];
}

export interface CalibrationReport {
  runDate: string;
  sessionCount: number;
  sessionIds: string[];
  markerAgreement: Record<string, CalibrationMarkerAgreement>;
  pillarAgreement: Record<string, CalibrationPillarAgreement>;
  overallAgreement: {
    kappa: number;
    weightedKappa: number;
    passesThreshold: boolean;
  };
  driftIndicators: CalibrationDriftIndicators;
  recommendations: string[];
}
