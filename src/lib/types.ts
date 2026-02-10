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
  | "investment_readiness";

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
  | "perception_reality";

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
  | "strategic_alignment";

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
  | "closing";

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
