// ============================================================
// HMN CASCADE - Admin Tool Functions for Conversational Admin AI
// ============================================================

import {
  loadAssessment,
  saveAssessment,
  listAllAssessments,
  loadSessionFromDb,
  deleteSessionFromDb,
  listSessionsWithResponses,
  listAllSessions,
  generateInviteToken,
  saveInvitation,
  loadInvitationById,
  listAllInvitations,
  deleteInvitationFromDb,
  type Invitation,
} from "./supabase.js";
import type {
  AssessmentType,
  AssessmentSummary,
  Question,
  InterviewSession,
} from "../src/lib/types";
import { sendInvitationEmail, sendBatchInvitationEmails, isEmailEnabled } from "./email.js";

// --- Session Summary type (lightweight view) ---

interface SessionSummary {
  id: string;
  participantName: string;
  participantCompany: string;
  status: InterviewSession["status"];
  createdAt: string;
  assessmentTypeId?: string;
  responseCount: number;
  hasResearch: boolean;
}

export interface CompanySummary {
  company: string;
  participantCount: number;
  sessionCount: number;
  completedCount: number;
  analyzedCount: number;
  averageScore: number | null;
  completionRate: number;
  lastActivity: string;
  industries: string[];
  hasResearch: boolean;
}

export interface CompanyDetail extends CompanySummary {
  sessions: SessionSummary[];
  dimensionAverages: { dimension: string; average: number; count: number }[];
  researchData: Record<string, unknown> | null;
}

function toSessionSummary(s: InterviewSession): SessionSummary {
  return {
    id: s.id,
    participantName: s.participant?.name ?? "Unknown",
    participantCompany: s.participant?.company ?? "Unknown",
    status: s.status,
    createdAt: s.createdAt,
    assessmentTypeId: s.assessmentTypeId,
    responseCount: s.responses?.length ?? 0,
    hasResearch: !!(s as unknown as Record<string, unknown>).research,
  };
}

// ============================================================
// ASSESSMENT CRUD
// ============================================================

function deriveTypeBadge(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("survey")) return "Survey";
  if (lower.includes("readiness") || lower.includes("diagnostic")) return "Diagnostic";
  return "Assessment";
}

function deriveCategory(name: string, description: string): string {
  const text = `${name} ${description}`.toLowerCase();
  if (text.includes("ai") || text.includes("technology") || text.includes("digital") || text.includes("adaptability"))
    return "AI & Technology";
  if (text.includes("leader") || text.includes("culture") || text.includes("team") || text.includes("innovation"))
    return "Leadership & Culture";
  if (text.includes("client") || text.includes("marketing") || text.includes("service"))
    return "Client & Marketing";
  if (text.includes("reality gap") || text.includes("survey") || text.includes("organizational") || text.includes("post-"))
    return "Organizational";
  return "Other";
}

export async function listAssessmentsAdmin(): Promise<AssessmentSummary[]> {
  const [assessments, invitations] = await Promise.all([
    listAllAssessments(),
    listAllInvitations(),
  ]);

  // Build a map of assessmentId -> Set of company names from invitations
  const companyMap = new Map<string, Set<string>>();
  for (const inv of invitations) {
    const company = inv.participant?.company?.trim();
    if (company) {
      if (!companyMap.has(inv.assessmentId)) {
        companyMap.set(inv.assessmentId, new Set());
      }
      companyMap.get(inv.assessmentId)!.add(company);
    }
  }

  return assessments.map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description,
    icon: a.icon,
    estimatedMinutes: a.estimatedMinutes,
    questionCount: a.questions?.length ?? 0,
    status: a.status,
    category: deriveCategory(a.name, a.description),
    typeBadge: deriveTypeBadge(a.name),
    companyNames: companyMap.has(a.id) ? Array.from(companyMap.get(a.id)!) : [],
  }));
}

export async function getAssessmentAdmin(id: string): Promise<AssessmentType | null> {
  return loadAssessment(id);
}

export async function createAssessmentAdmin(
  config: AssessmentType
): Promise<{ ok: boolean; id: string }> {
  const now = new Date().toISOString();
  const assessment: AssessmentType = {
    ...config,
    createdAt: now,
    updatedAt: now,
  };
  await saveAssessment(assessment);
  return { ok: true, id: assessment.id };
}

export async function updateAssessmentAdmin(
  id: string,
  changes: Partial<AssessmentType>
): Promise<{ ok: boolean }> {
  const existing = await loadAssessment(id);
  if (!existing) return { ok: false };

  const updated: AssessmentType = {
    ...existing,
    ...changes,
    id, // Prevent id from being overwritten
    updatedAt: new Date().toISOString(),
  };
  await saveAssessment(updated);
  return { ok: true };
}

export async function duplicateAssessmentAdmin(
  sourceId: string,
  newId: string,
  newName: string
): Promise<{ ok: boolean; id: string }> {
  const source = await loadAssessment(sourceId);
  if (!source) return { ok: false, id: "" };

  const now = new Date().toISOString();
  const duplicate: AssessmentType = {
    ...source,
    id: newId,
    name: newName,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
  await saveAssessment(duplicate);
  return { ok: true, id: newId };
}

export async function archiveAssessmentAdmin(id: string): Promise<{ ok: boolean }> {
  return updateAssessmentAdmin(id, { status: "archived" });
}

// ============================================================
// QUESTION MANAGEMENT
// ============================================================

export async function addQuestionAdmin(
  assessmentId: string,
  question: Question
): Promise<{ ok: boolean }> {
  const assessment = await loadAssessment(assessmentId);
  if (!assessment) return { ok: false };

  assessment.questions.push(question);
  assessment.updatedAt = new Date().toISOString();
  await saveAssessment(assessment);
  return { ok: true };
}

export async function updateQuestionAdmin(
  assessmentId: string,
  questionId: string,
  changes: Partial<Question>
): Promise<{ ok: boolean }> {
  const assessment = await loadAssessment(assessmentId);
  if (!assessment) return { ok: false };

  const idx = assessment.questions.findIndex((q) => q.id === questionId);
  if (idx === -1) return { ok: false };

  assessment.questions[idx] = { ...assessment.questions[idx], ...changes };
  assessment.updatedAt = new Date().toISOString();
  await saveAssessment(assessment);
  return { ok: true };
}

export async function removeQuestionAdmin(
  assessmentId: string,
  questionId: string
): Promise<{ ok: boolean }> {
  const assessment = await loadAssessment(assessmentId);
  if (!assessment) return { ok: false };

  const before = assessment.questions.length;
  assessment.questions = assessment.questions.filter((q) => q.id !== questionId);

  if (assessment.questions.length === before) return { ok: false };

  assessment.updatedAt = new Date().toISOString();
  await saveAssessment(assessment);
  return { ok: true };
}

// ============================================================
// SESSION MANAGEMENT
// ============================================================

export async function listSessionsAdmin(
  filters?: { since?: string; status?: string; assessmentTypeId?: string }
): Promise<SessionSummary[]> {
  const sessions = await listAllSessions();

  let filtered = sessions;

  if (filters?.since) {
    const sinceDate = new Date(filters.since).getTime();
    filtered = filtered.filter(
      (s) => new Date(s.createdAt).getTime() >= sinceDate
    );
  }

  if (filters?.status) {
    filtered = filtered.filter((s) => s.status === filters.status);
  }

  if (filters?.assessmentTypeId) {
    filtered = filtered.filter(
      (s) => s.assessmentTypeId === filters.assessmentTypeId
    );
  }

  return filtered
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    .map(toSessionSummary);
}

export async function getSessionAdmin(id: string): Promise<InterviewSession | null> {
  return loadSessionFromDb(id);
}

export async function deleteSessionAdmin(id: string): Promise<{ ok: boolean }> {
  const deleted = await deleteSessionFromDb(id);
  return { ok: deleted };
}

export async function exportSessionsAdmin(
  format: "json" | "csv",
  filters?: { since?: string; status?: string; assessmentTypeId?: string }
): Promise<string> {
  const sessions = await listSessionsWithResponses();

  let filtered = sessions;

  if (filters?.since) {
    const sinceDate = new Date(filters.since).getTime();
    filtered = filtered.filter(
      (s) => new Date(s.createdAt).getTime() >= sinceDate
    );
  }

  if (filters?.status) {
    filtered = filtered.filter((s) => s.status === filters.status);
  }

  if (filters?.assessmentTypeId) {
    filtered = filtered.filter(
      (s) => s.assessmentTypeId === filters.assessmentTypeId
    );
  }

  if (format === "json") {
    return JSON.stringify(filtered, null, 2);
  }

  // CSV format
  const headers = [
    "id",
    "name",
    "company",
    "status",
    "createdAt",
    "responseCount",
    "overallScore",
  ];

  const rows = filtered.map((s) => {
    const analysis = s.analysis as
      | { overallReadinessScore?: number }
      | undefined;
    return [
      csvEscape(s.id),
      csvEscape(s.participant?.name ?? ""),
      csvEscape(s.participant?.company ?? ""),
      csvEscape(s.status),
      csvEscape(s.createdAt),
      String(s.responses?.length ?? 0),
      String(analysis?.overallReadinessScore ?? ""),
    ].join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// ============================================================
// COMPANY AGGREGATION
// ============================================================

export async function listCompaniesAdmin(): Promise<CompanySummary[]> {
  const sessions = await listSessionsWithResponses();

  // Group sessions by company
  const companyMap = new Map<string, InterviewSession[]>();
  for (const s of sessions) {
    const company = (s.participant?.company ?? "").trim() || "(No Company)";
    const existing = companyMap.get(company) ?? [];
    existing.push(s);
    companyMap.set(company, existing);
  }

  const result: CompanySummary[] = [];
  for (const [company, companySessions] of companyMap) {
    // Unique participants by email or name
    const participantSet = new Set<string>();
    const industrySet = new Set<string>();
    let hasResearch = false;

    for (const s of companySessions) {
      const key = s.participant?.email || s.participant?.name || s.id;
      participantSet.add(key);
      if (s.participant?.industry) industrySet.add(s.participant.industry);
      if ((s as unknown as Record<string, unknown>).research) hasResearch = true;
    }

    const completedSessions = companySessions.filter(
      (s) => s.status === "completed" || s.status === "analyzed"
    );
    const analyzedSessions = companySessions.filter((s) => s.status === "analyzed");

    // Average score from analysis.overallReadinessScore
    const scores = companySessions
      .filter((s) => s.analysis)
      .map((s) => {
        const analysis = s.analysis as
          | { overallReadinessScore?: number }
          | undefined;
        return analysis?.overallReadinessScore ?? null;
      })
      .filter((score): score is number => score !== null);

    const averageScore =
      scores.length > 0
        ? Math.round(scores.reduce((sum, sc) => sum + sc, 0) / scores.length)
        : null;

    // Last activity
    const lastActivity = companySessions
      .map((s) => s.updatedAt || s.createdAt)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];

    result.push({
      company,
      participantCount: participantSet.size,
      sessionCount: companySessions.length,
      completedCount: completedSessions.length,
      analyzedCount: analyzedSessions.length,
      averageScore,
      completionRate:
        companySessions.length > 0
          ? Math.round((completedSessions.length / companySessions.length) * 100)
          : 0,
      lastActivity,
      industries: Array.from(industrySet),
      hasResearch,
    });
  }

  // Sort by lastActivity descending
  result.sort(
    (a, b) =>
      new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
  );

  return result;
}

export async function getCompanyDetailAdmin(
  companyName: string
): Promise<CompanyDetail | null> {
  const sessions = await listSessionsWithResponses();

  // Filter sessions by company name match
  const companySessions = sessions.filter((s) => {
    const company = (s.participant?.company ?? "").trim() || "(No Company)";
    return company === companyName;
  });

  if (companySessions.length === 0) return null;

  // Build session summaries
  const sessionSummaries = companySessions.map(toSessionSummary);

  // Unique participants
  const participantSet = new Set<string>();
  const industrySet = new Set<string>();
  let hasResearch = false;
  let researchData: Record<string, unknown> | null = null;

  for (const s of companySessions) {
    const key = s.participant?.email || s.participant?.name || s.id;
    participantSet.add(key);
    if (s.participant?.industry) industrySet.add(s.participant.industry);
    if ((s as unknown as Record<string, unknown>).research) {
      hasResearch = true;
      if (!researchData) {
        researchData = (s as unknown as Record<string, unknown>).research as Record<string, unknown>;
      }
    }
  }

  const completedSessions = companySessions.filter(
    (s) => s.status === "completed" || s.status === "analyzed"
  );
  const analyzedSessions = companySessions.filter((s) => s.status === "analyzed");

  // Average score
  const scores = companySessions
    .filter((s) => s.analysis)
    .map((s) => {
      const analysis = s.analysis as
        | { overallReadinessScore?: number }
        | undefined;
      return analysis?.overallReadinessScore ?? null;
    })
    .filter((score): score is number => score !== null);

  const averageScore =
    scores.length > 0
      ? Math.round(scores.reduce((sum, sc) => sum + sc, 0) / scores.length)
      : null;

  // Last activity
  const lastActivity = companySessions
    .map((s) => s.updatedAt || s.createdAt)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];

  // Build dimension averages from analyzed sessions
  const dimensionMap = new Map<string, { total: number; count: number }>();
  for (const s of analyzedSessions) {
    const analysis = s.analysis as
      | { dimensionScores?: { dimension: string; score: number }[] }
      | undefined;
    if (!analysis?.dimensionScores) continue;

    for (const ds of analysis.dimensionScores) {
      const existing = dimensionMap.get(ds.dimension) ?? { total: 0, count: 0 };
      existing.total += ds.score;
      existing.count += 1;
      dimensionMap.set(ds.dimension, existing);
    }
  }

  const dimensionAverages = Array.from(dimensionMap.entries()).map(
    ([dimension, data]) => ({
      dimension,
      average: Math.round(data.total / data.count),
      count: data.count,
    })
  );

  return {
    company: companyName,
    participantCount: participantSet.size,
    sessionCount: companySessions.length,
    completedCount: completedSessions.length,
    analyzedCount: analyzedSessions.length,
    averageScore,
    completionRate:
      companySessions.length > 0
        ? Math.round((completedSessions.length / companySessions.length) * 100)
        : 0,
    lastActivity,
    industries: Array.from(industrySet),
    hasResearch,
    sessions: sessionSummaries,
    dimensionAverages,
    researchData,
  };
}

// ============================================================
// ANALYTICS
// ============================================================

interface StatsResult {
  totalSessions: number;
  completedSessions: number;
  analyzedSessions: number;
  completionRate: number;
  averageScore: number;
  assessmentBreakdown: { assessmentTypeId: string; count: number }[];
}

export async function getStatsAdmin(): Promise<StatsResult> {
  const sessions = await listSessionsWithResponses();

  const total = sessions.length;
  const completed = sessions.filter(
    (s) => s.status === "completed" || s.status === "analyzed"
  ).length;
  const analyzed = sessions.filter((s) => s.status === "analyzed").length;

  const scores = sessions
    .filter((s) => s.analysis)
    .map((s) => {
      const analysis = s.analysis as
        | { overallReadinessScore?: number }
        | undefined;
      return analysis?.overallReadinessScore ?? null;
    })
    .filter((score): score is number => score !== null);

  const averageScore =
    scores.length > 0
      ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length)
      : 0;

  const breakdownMap = new Map<string, number>();
  for (const s of sessions) {
    const typeId = s.assessmentTypeId ?? "default";
    breakdownMap.set(typeId, (breakdownMap.get(typeId) ?? 0) + 1);
  }

  const assessmentBreakdown = Array.from(breakdownMap.entries()).map(
    ([assessmentTypeId, count]) => ({ assessmentTypeId, count })
  );

  return {
    totalSessions: total,
    completedSessions: completed,
    analyzedSessions: analyzed,
    completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
    averageScore,
    assessmentBreakdown,
  };
}

export async function getDimensionAveragesAdmin(
  assessmentTypeId?: string
): Promise<{ dimension: string; average: number; count: number }[]> {
  let sessions = (await listSessionsWithResponses()).filter((s) => s.status === "analyzed" && s.analysis);

  if (assessmentTypeId) {
    sessions = sessions.filter((s) => s.assessmentTypeId === assessmentTypeId);
  }

  const dimensionMap = new Map<string, { total: number; count: number }>();

  for (const s of sessions) {
    const analysis = s.analysis as
      | { dimensionScores?: { dimension: string; score: number }[] }
      | undefined;
    if (!analysis?.dimensionScores) continue;

    for (const ds of analysis.dimensionScores) {
      const existing = dimensionMap.get(ds.dimension) ?? { total: 0, count: 0 };
      existing.total += ds.score;
      existing.count += 1;
      dimensionMap.set(ds.dimension, existing);
    }
  }

  return Array.from(dimensionMap.entries()).map(([dimension, data]) => ({
    dimension,
    average: Math.round(data.total / data.count),
    count: data.count,
  }));
}

export async function getCompletionFunnelAdmin(): Promise<{
  stage: string;
  count: number;
  percentage: number;
}[]> {
  const sessions = await listAllSessions();
  const total = sessions.length;

  const stages = ["intake", "in_progress", "completed", "analyzed"] as const;
  const stageIndex: Record<string, number> = {
    intake: 0,
    in_progress: 1,
    completed: 2,
    analyzed: 3,
  };

  return stages.map((stage) => {
    const minIndex = stageIndex[stage];
    const count = sessions.filter((s) => (stageIndex[s.status] ?? -1) >= minIndex).length;
    return {
      stage,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0,
    };
  });
}

// ============================================================
// INVITATION MANAGEMENT
// ============================================================

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
  status: Invitation["status"];
  sessionId: string | null;
  createdAt: string;
  openedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export async function listInvitationsAdmin(filters?: {
  status?: string;
  assessmentId?: string;
}): Promise<InvitationSummary[]> {
  const [invitations, assessments] = await Promise.all([
    listAllInvitations(),
    listAllAssessments(),
  ]);

  const nameMap = new Map(assessments.map((a) => [a.id, a.name]));

  let filtered = invitations;
  if (filters?.status) filtered = filtered.filter((i) => i.status === filters.status);
  if (filters?.assessmentId) filtered = filtered.filter((i) => i.assessmentId === filters.assessmentId);

  return filtered.map((inv) => ({
    id: inv.id,
    token: inv.token,
    assessmentId: inv.assessmentId,
    assessmentName: nameMap.get(inv.assessmentId) || inv.assessmentId,
    participantName: inv.participant.name,
    participantEmail: inv.participant.email,
    participantCompany: inv.participant.company || "",
    participantRole: inv.participant.role || "",
    participantIndustry: inv.participant.industry || "",
    participantTeamSize: inv.participant.teamSize || "",
    status: inv.status,
    sessionId: inv.sessionId,
    createdAt: inv.createdAt,
    openedAt: inv.openedAt,
    startedAt: inv.startedAt,
    completedAt: inv.completedAt,
  }));
}

export async function createInvitationAdmin(data: {
  assessmentId: string;
  participant: {
    name: string;
    email: string;
    company?: string;
    role?: string;
    industry?: string;
    teamSize?: string;
  };
  note?: string;
}): Promise<{ ok: boolean; invitation: Invitation }> {
  const token = generateInviteToken();
  const now = new Date().toISOString();

  const invitation: Invitation = {
    id: token, // Use token as id for simplicity; Supabase will generate UUID
    token,
    assessmentId: data.assessmentId,
    participant: data.participant,
    status: "sent",
    sessionId: null,
    note: data.note || null,
    createdAt: now,
    updatedAt: now,
    openedAt: null,
    startedAt: null,
    completedAt: null,
  };

  // Let Supabase generate the UUID id
  const row = {
    token: invitation.token,
    assessment_id: invitation.assessmentId,
    participant_name: invitation.participant.name,
    participant_email: invitation.participant.email,
    participant_company: invitation.participant.company || null,
    participant_role: invitation.participant.role || null,
    participant_industry: invitation.participant.industry || null,
    participant_team_size: invitation.participant.teamSize || null,
    status: "sent",
    note: invitation.note,
  };

  const { getSupabase } = await import("./supabase.js");
  const { data: inserted, error } = await getSupabase()
    .from("cascade_invitations")
    .insert(row)
    .select()
    .single();

  if (error) throw new Error(`Failed to create invitation: ${error.message}`);

  // Return with the DB-generated id
  invitation.id = inserted.id;
  return { ok: true, invitation };
}

export async function batchCreateInvitationsAdmin(items: Array<{
  assessmentId: string;
  participant: {
    name: string;
    email: string;
    company?: string;
    role?: string;
    industry?: string;
    teamSize?: string;
  };
  note?: string;
}>): Promise<{ ok: boolean; invitations: Invitation[]; errors: Array<{ index: number; email: string; error: string }> }> {
  const results: Invitation[] = [];
  const errors: Array<{ index: number; email: string; error: string }> = [];
  for (let i = 0; i < items.length; i++) {
    try {
      const { invitation } = await createInvitationAdmin(items[i]);
      results.push(invitation);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error(`Failed to create invitation for ${items[i].participant.email}:`, message);
      errors.push({ index: i, email: items[i].participant.email, error: message });
    }
  }
  return { ok: errors.length === 0, invitations: results, errors };
}

export async function getInvitationAdmin(id: string): Promise<Invitation | null> {
  return loadInvitationById(id);
}

export async function deleteInvitationAdmin(id: string): Promise<{ ok: boolean }> {
  const success = await deleteInvitationFromDb(id);
  return { ok: success };
}

// ============================================================
// TOOL DEFINITIONS (for Anthropic tool_use API)
// ============================================================

export const TOOL_DEFINITIONS = [
  {
    name: "list_assessments",
    description:
      "List all assessment types with their status, question count, and basic info",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [] as string[],
    },
  },
  {
    name: "get_assessment",
    description:
      "Get full details of a specific assessment type including all questions",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Assessment type ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "create_assessment",
    description:
      "Create a new assessment type with phases, sections, questions, and scoring dimensions",
    input_schema: {
      type: "object" as const,
      properties: {
        config: {
          type: "object",
          description:
            "Full AssessmentType configuration object including id, name, description, phases, sections, questions, and scoringDimensions",
        },
      },
      required: ["config"],
    },
  },
  {
    name: "update_assessment",
    description:
      "Update an existing assessment type. Merges provided fields with the existing configuration.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Assessment type ID to update" },
        changes: {
          type: "object",
          description:
            "Partial AssessmentType fields to merge (e.g. name, description, status, estimatedMinutes)",
        },
      },
      required: ["id", "changes"],
    },
  },
  {
    name: "duplicate_assessment",
    description:
      "Duplicate an existing assessment type with a new ID and name. The copy starts as a draft.",
    input_schema: {
      type: "object" as const,
      properties: {
        sourceId: { type: "string", description: "ID of the assessment to duplicate" },
        newId: { type: "string", description: "ID for the new duplicated assessment" },
        newName: { type: "string", description: "Name for the new duplicated assessment" },
      },
      required: ["sourceId", "newId", "newName"],
    },
  },
  {
    name: "archive_assessment",
    description: "Archive an assessment type by setting its status to 'archived'",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Assessment type ID to archive" },
      },
      required: ["id"],
    },
  },
  {
    name: "add_question",
    description: "Add a new question to an existing assessment type",
    input_schema: {
      type: "object" as const,
      properties: {
        assessmentId: { type: "string", description: "Assessment type ID to add the question to" },
        question: {
          type: "object",
          description:
            "Full Question object with id, text, section, phase, inputType, weight, scoringDimensions, etc.",
        },
      },
      required: ["assessmentId", "question"],
    },
  },
  {
    name: "update_question",
    description: "Update a specific question within an assessment type. Merges provided fields.",
    input_schema: {
      type: "object" as const,
      properties: {
        assessmentId: { type: "string", description: "Assessment type ID containing the question" },
        questionId: { type: "string", description: "ID of the question to update" },
        changes: { type: "object", description: "Partial Question fields to merge (e.g. text, weight, inputType)" },
      },
      required: ["assessmentId", "questionId", "changes"],
    },
  },
  {
    name: "remove_question",
    description: "Remove a question from an assessment type by its ID",
    input_schema: {
      type: "object" as const,
      properties: {
        assessmentId: { type: "string", description: "Assessment type ID containing the question" },
        questionId: { type: "string", description: "ID of the question to remove" },
      },
      required: ["assessmentId", "questionId"],
    },
  },
  {
    name: "list_sessions",
    description: "List interview sessions with optional filters for date, status, and assessment type",
    input_schema: {
      type: "object" as const,
      properties: {
        since: { type: "string", description: "ISO date string — only return sessions created on or after this date" },
        status: { type: "string", description: "Filter by session status", enum: ["intake", "in_progress", "completed", "analyzed"] },
        assessmentTypeId: { type: "string", description: "Filter by assessment type ID" },
      },
      required: [] as string[],
    },
  },
  {
    name: "get_session",
    description: "Get the full details of a specific interview session including all responses and analysis",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Session ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_session",
    description: "Permanently delete an interview session",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Session ID to delete" },
      },
      required: ["id"],
    },
  },
  {
    name: "export_sessions",
    description: "Export interview sessions as JSON or CSV, with optional filters",
    input_schema: {
      type: "object" as const,
      properties: {
        format: { type: "string", description: "Export format", enum: ["json", "csv"] },
        since: { type: "string", description: "ISO date string filter" },
        status: { type: "string", description: "Filter by session status", enum: ["intake", "in_progress", "completed", "analyzed"] },
        assessmentTypeId: { type: "string", description: "Filter by assessment type ID" },
      },
      required: ["format"],
    },
  },
  {
    name: "get_stats",
    description: "Get aggregate statistics across all sessions",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [] as string[],
    },
  },
  {
    name: "get_dimension_averages",
    description: "Get average scores per scoring dimension across all analyzed sessions",
    input_schema: {
      type: "object" as const,
      properties: {
        assessmentTypeId: { type: "string", description: "Optional assessment type ID to filter" },
      },
      required: [] as string[],
    },
  },
  {
    name: "get_completion_funnel",
    description: "Get the count and percentage of sessions at each status stage",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [] as string[],
    },
  },

  // --- Invitation Tools ---
  {
    name: "list_invitations",
    description: "List all invitations with optional filters for status and assessment type",
    input_schema: {
      type: "object" as const,
      properties: {
        status: { type: "string", description: "Filter by invitation status", enum: ["sent", "opened", "started", "completed"] },
        assessmentId: { type: "string", description: "Filter by assessment type ID" },
      },
      required: [] as string[],
    },
  },
  {
    name: "create_invitation",
    description: "Create a single invitation and send the email. Requires assessmentId and participant info (name, email, company, role).",
    input_schema: {
      type: "object" as const,
      properties: {
        assessmentId: { type: "string", description: "Assessment type ID for this invitation" },
        participant: {
          type: "object",
          description: "Participant details: name, email, company, role, industry, teamSize",
          properties: {
            name: { type: "string" },
            email: { type: "string" },
            company: { type: "string" },
            role: { type: "string" },
            industry: { type: "string" },
            teamSize: { type: "string" },
          },
          required: ["name", "email"],
        },
        note: { type: "string", description: "Optional personal note included in the invitation email" },
        sendEmail: { type: "boolean", description: "Whether to send the invitation email (default: true)" },
      },
      required: ["assessmentId", "participant"],
    },
  },
  {
    name: "batch_create_invitations",
    description: "Create multiple invitations at once from a list of participants and send emails. Use when the user provides CSV data or a list of people.",
    input_schema: {
      type: "object" as const,
      properties: {
        assessmentId: { type: "string", description: "Assessment type ID for all invitations" },
        participants: {
          type: "array",
          description: "Array of participant objects, each with name, email, company, role, industry, teamSize",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              email: { type: "string" },
              company: { type: "string" },
              role: { type: "string" },
              industry: { type: "string" },
              teamSize: { type: "string" },
            },
            required: ["name", "email"],
          },
        },
        note: { type: "string", description: "Optional note included in all invitation emails" },
        sendEmail: { type: "boolean", description: "Whether to send invitation emails (default: true)" },
      },
      required: ["assessmentId", "participants"],
    },
  },
  {
    name: "get_invitation",
    description: "Get full details of a specific invitation by its ID",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Invitation ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_invitation",
    description: "Permanently delete an invitation by its ID",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Invitation ID to delete" },
      },
      required: ["id"],
    },
  },

  // --- Company Tools ---
  {
    name: "list_companies",
    description: "List all companies with their participant counts, session counts, completion rates, and average scores",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [] as string[],
    },
  },
  {
    name: "get_company_detail",
    description: "Get detailed information about a specific company including all sessions, dimension averages, and research data",
    input_schema: {
      type: "object" as const,
      properties: {
        companyName: { type: "string", description: "Exact company name to look up" },
      },
      required: ["companyName"],
    },
  },
  {
    name: "lookup_company_logo",
    description: "Look up a company logo URL from their domain. Uses Clearbit Logo API. Extract domain from email addresses (e.g., user@acme.com → acme.com).",
    input_schema: {
      type: "object" as const,
      properties: {
        domain: { type: "string", description: "Company domain (e.g., 'acme.com', 'lvng.ai')" },
      },
      required: ["domain"],
    },
  },
];

// ============================================================
// TOOL EXECUTOR (async)
// ============================================================

export async function executeTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case "list_assessments":
      return listAssessmentsAdmin();

    case "get_assessment":
      return getAssessmentAdmin(args.id as string);

    case "create_assessment":
      return createAssessmentAdmin(args.config as AssessmentType);

    case "update_assessment":
      return updateAssessmentAdmin(
        args.id as string,
        args.changes as Partial<AssessmentType>
      );

    case "duplicate_assessment":
      return duplicateAssessmentAdmin(
        args.sourceId as string,
        args.newId as string,
        args.newName as string
      );

    case "archive_assessment":
      return archiveAssessmentAdmin(args.id as string);

    case "add_question":
      return addQuestionAdmin(
        args.assessmentId as string,
        args.question as Question
      );

    case "update_question":
      return updateQuestionAdmin(
        args.assessmentId as string,
        args.questionId as string,
        args.changes as Partial<Question>
      );

    case "remove_question":
      return removeQuestionAdmin(
        args.assessmentId as string,
        args.questionId as string
      );

    case "list_sessions":
      return listSessionsAdmin(
        args as { since?: string; status?: string; assessmentTypeId?: string }
      );

    case "get_session":
      return getSessionAdmin(args.id as string);

    case "delete_session":
      return deleteSessionAdmin(args.id as string);

    case "export_sessions":
      return exportSessionsAdmin(args.format as "json" | "csv", {
        since: args.since as string | undefined,
        status: args.status as string | undefined,
        assessmentTypeId: args.assessmentTypeId as string | undefined,
      });

    case "get_stats":
      return getStatsAdmin();

    case "get_dimension_averages":
      return getDimensionAveragesAdmin(args.assessmentTypeId as string | undefined);

    case "get_completion_funnel":
      return getCompletionFunnelAdmin();

    // --- Invitation tools ---

    case "list_invitations":
      return listInvitationsAdmin(
        args as { status?: string; assessmentId?: string }
      );

    case "create_invitation": {
      const result = await createInvitationAdmin({
        assessmentId: args.assessmentId as string,
        participant: args.participant as {
          name: string;
          email: string;
          company?: string;
          role?: string;
          industry?: string;
          teamSize?: string;
        },
        note: args.note as string | undefined,
      });
      // Auto-send email unless explicitly disabled
      if (result.ok && args.sendEmail !== false) {
        // Look up the assessment name for the email
        const assessments = await listAllAssessments();
        const assessmentName =
          assessments.find((a) => a.id === (args.assessmentId as string))?.name ||
          (args.assessmentId as string);
        const emailResult = await sendInvitationEmail({
          to: result.invitation.participant.email,
          participantName: result.invitation.participant.name,
          assessmentName,
          inviteToken: result.invitation.token,
          note: args.note as string | undefined,
        });
        return { ...result, emailSent: emailResult.ok, emailError: emailResult.error };
      }
      return result;
    }

    case "batch_create_invitations": {
      const participants = args.participants as Array<{
        name: string;
        email: string;
        company?: string;
        role?: string;
        industry?: string;
        teamSize?: string;
      }>;
      const items = participants.map((p) => ({
        assessmentId: args.assessmentId as string,
        participant: p,
        note: args.note as string | undefined,
      }));
      const batchResult = await batchCreateInvitationsAdmin(items);

      // Auto-send emails unless explicitly disabled
      if (args.sendEmail !== false && batchResult.invitations.length > 0) {
        const assessments = await listAllAssessments();
        const assessmentName =
          assessments.find((a) => a.id === (args.assessmentId as string))?.name ||
          (args.assessmentId as string);
        const emailPayloads = batchResult.invitations.map((inv) => ({
          to: inv.participant.email,
          participantName: inv.participant.name,
          assessmentName,
          inviteToken: inv.token,
          note: args.note as string | undefined,
        }));
        const emailResults = await sendBatchInvitationEmails(emailPayloads);
        return {
          ...batchResult,
          emailsSent: emailResults.sent,
          emailsFailed: emailResults.failed,
          emailErrors: emailResults.errors,
        };
      }
      return batchResult;
    }

    case "get_invitation":
      return getInvitationAdmin(args.id as string);

    case "delete_invitation":
      return deleteInvitationAdmin(args.id as string);

    // --- Company tools ---

    case "list_companies":
      return listCompaniesAdmin();

    case "get_company_detail":
      return getCompanyDetailAdmin(args.companyName as string);

    case "lookup_company_logo": {
      const domain = args.domain as string;
      const logoUrl = `https://logo.clearbit.com/${domain}`;
      try {
        const checkRes = await fetch(logoUrl, { method: "HEAD" });
        return { domain, logoUrl: checkRes.ok ? logoUrl : null, found: checkRes.ok };
      } catch {
        return { domain, logoUrl: null, found: false };
      }
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}
