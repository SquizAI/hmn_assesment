// ============================================================
// HMN CASCADE - Admin Tool Functions for Conversational Admin AI
// ============================================================

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
} from "fs";
import { join } from "path";
import type {
  AssessmentType,
  AssessmentSummary,
  Question,
  InterviewSession,
} from "../src/lib/types";

// --- Directory constants ---

const ASSESSMENTS_DIR = join(process.cwd(), "assessments");
const SESSIONS_DIR = join(process.cwd(), "sessions");

// --- Helpers ---

function ensureAssessmentsDir(): void {
  if (!existsSync(ASSESSMENTS_DIR))
    mkdirSync(ASSESSMENTS_DIR, { recursive: true });
}

function ensureSessionsDir(): void {
  if (!existsSync(SESSIONS_DIR))
    mkdirSync(SESSIONS_DIR, { recursive: true });
}

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "");
}

function assessmentPath(id: string): string {
  return join(ASSESSMENTS_DIR, `${sanitizeId(id)}.json`);
}

function sessionPath(id: string): string {
  return join(SESSIONS_DIR, `${sanitizeId(id)}.json`);
}

function loadAssessmentFile(id: string): AssessmentType | null {
  const p = assessmentPath(id);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf-8")) as AssessmentType;
}

function saveAssessmentFile(assessment: AssessmentType): void {
  ensureAssessmentsDir();
  writeFileSync(assessmentPath(assessment.id), JSON.stringify(assessment, null, 2));
}

function loadSessionFile(id: string): InterviewSession | null {
  const p = sessionPath(id);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf-8")) as InterviewSession;
}

function loadAllSessions(): InterviewSession[] {
  ensureSessionsDir();
  const files = readdirSync(SESSIONS_DIR).filter((f) => f.endsWith(".json"));
  return files.map((f) =>
    JSON.parse(readFileSync(join(SESSIONS_DIR, f), "utf-8")) as InterviewSession
  );
}

// --- Session Summary type (lightweight view) ---

interface SessionSummary {
  id: string;
  participantName: string;
  participantCompany: string;
  status: InterviewSession["status"];
  createdAt: string;
  assessmentTypeId?: string;
  responseCount: number;
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
  };
}

// ============================================================
// ASSESSMENT CRUD
// ============================================================

export function listAssessments(): AssessmentSummary[] {
  ensureAssessmentsDir();
  const files = readdirSync(ASSESSMENTS_DIR).filter((f) => f.endsWith(".json"));
  return files.map((f) => {
    const a = JSON.parse(
      readFileSync(join(ASSESSMENTS_DIR, f), "utf-8")
    ) as AssessmentType;
    return {
      id: a.id,
      name: a.name,
      description: a.description,
      icon: a.icon,
      estimatedMinutes: a.estimatedMinutes,
      questionCount: a.questions?.length ?? 0,
      status: a.status,
    };
  });
}

export function getAssessment(id: string): AssessmentType | null {
  return loadAssessmentFile(id);
}

export function createAssessment(
  config: AssessmentType
): { ok: boolean; id: string } {
  const now = new Date().toISOString();
  const assessment: AssessmentType = {
    ...config,
    createdAt: now,
    updatedAt: now,
  };
  saveAssessmentFile(assessment);
  return { ok: true, id: assessment.id };
}

export function updateAssessment(
  id: string,
  changes: Partial<AssessmentType>
): { ok: boolean } {
  const existing = loadAssessmentFile(id);
  if (!existing) return { ok: false };

  const updated: AssessmentType = {
    ...existing,
    ...changes,
    id, // Prevent id from being overwritten
    updatedAt: new Date().toISOString(),
  };
  saveAssessmentFile(updated);
  return { ok: true };
}

export function duplicateAssessment(
  sourceId: string,
  newId: string,
  newName: string
): { ok: boolean; id: string } {
  const source = loadAssessmentFile(sourceId);
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
  saveAssessmentFile(duplicate);
  return { ok: true, id: newId };
}

export function archiveAssessment(id: string): { ok: boolean } {
  return updateAssessment(id, { status: "archived" });
}

// ============================================================
// QUESTION MANAGEMENT
// ============================================================

export function addQuestion(
  assessmentId: string,
  question: Question
): { ok: boolean } {
  const assessment = loadAssessmentFile(assessmentId);
  if (!assessment) return { ok: false };

  assessment.questions.push(question);
  assessment.updatedAt = new Date().toISOString();
  saveAssessmentFile(assessment);
  return { ok: true };
}

export function updateQuestion(
  assessmentId: string,
  questionId: string,
  changes: Partial<Question>
): { ok: boolean } {
  const assessment = loadAssessmentFile(assessmentId);
  if (!assessment) return { ok: false };

  const idx = assessment.questions.findIndex((q) => q.id === questionId);
  if (idx === -1) return { ok: false };

  assessment.questions[idx] = { ...assessment.questions[idx], ...changes };
  assessment.updatedAt = new Date().toISOString();
  saveAssessmentFile(assessment);
  return { ok: true };
}

export function removeQuestion(
  assessmentId: string,
  questionId: string
): { ok: boolean } {
  const assessment = loadAssessmentFile(assessmentId);
  if (!assessment) return { ok: false };

  const before = assessment.questions.length;
  assessment.questions = assessment.questions.filter((q) => q.id !== questionId);

  if (assessment.questions.length === before) return { ok: false };

  assessment.updatedAt = new Date().toISOString();
  saveAssessmentFile(assessment);
  return { ok: true };
}

// ============================================================
// SESSION MANAGEMENT
// ============================================================

export function listSessions(
  filters?: { since?: string; status?: string; assessmentTypeId?: string }
): SessionSummary[] {
  const sessions = loadAllSessions();

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

export function getSession(id: string): InterviewSession | null {
  return loadSessionFile(id);
}

export function deleteSession(id: string): { ok: boolean } {
  const p = sessionPath(id);
  if (!existsSync(p)) return { ok: false };
  unlinkSync(p);
  return { ok: true };
}

export function exportSessions(
  format: "json" | "csv",
  filters?: { since?: string; status?: string; assessmentTypeId?: string }
): string {
  const sessions = loadAllSessions();

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

export function getStats(): StatsResult {
  const sessions = loadAllSessions();

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

  // Assessment type breakdown
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

export function getDimensionAverages(
  assessmentTypeId?: string
): { dimension: string; average: number; count: number }[] {
  let sessions = loadAllSessions().filter((s) => s.status === "analyzed" && s.analysis);

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

export function getCompletionFunnel(): {
  stage: string;
  count: number;
  percentage: number;
}[] {
  const sessions = loadAllSessions();
  const total = sessions.length;

  const stages = ["intake", "in_progress", "completed", "analyzed"] as const;
  const stageIndex: Record<string, number> = {
    intake: 0,
    in_progress: 1,
    completed: 2,
    analyzed: 3,
  };

  // Cumulative: count sessions that REACHED each stage (not just currently at it)
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
        id: {
          type: "string",
          description: "Assessment type ID",
        },
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
        id: {
          type: "string",
          description: "Assessment type ID to update",
        },
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
        sourceId: {
          type: "string",
          description: "ID of the assessment to duplicate",
        },
        newId: {
          type: "string",
          description: "ID for the new duplicated assessment",
        },
        newName: {
          type: "string",
          description: "Name for the new duplicated assessment",
        },
      },
      required: ["sourceId", "newId", "newName"],
    },
  },
  {
    name: "archive_assessment",
    description:
      "Archive an assessment type by setting its status to 'archived'",
    input_schema: {
      type: "object" as const,
      properties: {
        id: {
          type: "string",
          description: "Assessment type ID to archive",
        },
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
        assessmentId: {
          type: "string",
          description: "Assessment type ID to add the question to",
        },
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
    description:
      "Update a specific question within an assessment type. Merges provided fields.",
    input_schema: {
      type: "object" as const,
      properties: {
        assessmentId: {
          type: "string",
          description: "Assessment type ID containing the question",
        },
        questionId: {
          type: "string",
          description: "ID of the question to update",
        },
        changes: {
          type: "object",
          description:
            "Partial Question fields to merge (e.g. text, weight, inputType)",
        },
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
        assessmentId: {
          type: "string",
          description: "Assessment type ID containing the question",
        },
        questionId: {
          type: "string",
          description: "ID of the question to remove",
        },
      },
      required: ["assessmentId", "questionId"],
    },
  },
  {
    name: "list_sessions",
    description:
      "List interview sessions with optional filters for date, status, and assessment type",
    input_schema: {
      type: "object" as const,
      properties: {
        since: {
          type: "string",
          description:
            "ISO date string — only return sessions created on or after this date",
        },
        status: {
          type: "string",
          description:
            "Filter by session status: intake, in_progress, completed, or analyzed",
          enum: ["intake", "in_progress", "completed", "analyzed"],
        },
        assessmentTypeId: {
          type: "string",
          description: "Filter by assessment type ID",
        },
      },
      required: [] as string[],
    },
  },
  {
    name: "get_session",
    description:
      "Get the full details of a specific interview session including all responses and analysis",
    input_schema: {
      type: "object" as const,
      properties: {
        id: {
          type: "string",
          description: "Session ID",
        },
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
        id: {
          type: "string",
          description: "Session ID to delete",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "export_sessions",
    description:
      "Export interview sessions as JSON or CSV, with optional filters",
    input_schema: {
      type: "object" as const,
      properties: {
        format: {
          type: "string",
          description: "Export format",
          enum: ["json", "csv"],
        },
        since: {
          type: "string",
          description: "ISO date string filter for sessions created on or after",
        },
        status: {
          type: "string",
          description: "Filter by session status",
          enum: ["intake", "in_progress", "completed", "analyzed"],
        },
        assessmentTypeId: {
          type: "string",
          description: "Filter by assessment type ID",
        },
      },
      required: ["format"],
    },
  },
  {
    name: "get_stats",
    description:
      "Get aggregate statistics across all sessions: totals, completion rate, average score, and breakdown by assessment type",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [] as string[],
    },
  },
  {
    name: "get_dimension_averages",
    description:
      "Get average scores per scoring dimension across all analyzed sessions, optionally filtered by assessment type",
    input_schema: {
      type: "object" as const,
      properties: {
        assessmentTypeId: {
          type: "string",
          description:
            "Optional assessment type ID to filter dimension averages",
        },
      },
      required: [] as string[],
    },
  },
  {
    name: "get_completion_funnel",
    description:
      "Get the count and percentage of sessions at each status stage: intake, in_progress, completed, analyzed",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [] as string[],
    },
  },
];

// ============================================================
// TOOL EXECUTOR
// ============================================================

export function executeTool(
  name: string,
  args: Record<string, unknown>
): unknown {
  switch (name) {
    case "list_assessments":
      return listAssessments();

    case "get_assessment":
      return getAssessment(args.id as string);

    case "create_assessment":
      return createAssessment(args.config as AssessmentType);

    case "update_assessment":
      return updateAssessment(
        args.id as string,
        args.changes as Partial<AssessmentType>
      );

    case "duplicate_assessment":
      return duplicateAssessment(
        args.sourceId as string,
        args.newId as string,
        args.newName as string
      );

    case "archive_assessment":
      return archiveAssessment(args.id as string);

    case "add_question":
      return addQuestion(
        args.assessmentId as string,
        args.question as Question
      );

    case "update_question":
      return updateQuestion(
        args.assessmentId as string,
        args.questionId as string,
        args.changes as Partial<Question>
      );

    case "remove_question":
      return removeQuestion(
        args.assessmentId as string,
        args.questionId as string
      );

    case "list_sessions":
      return listSessions(
        args as { since?: string; status?: string; assessmentTypeId?: string }
      );

    case "get_session":
      return getSession(args.id as string);

    case "delete_session":
      return deleteSession(args.id as string);

    case "export_sessions":
      return exportSessions(args.format as "json" | "csv", {
        since: args.since as string | undefined,
        status: args.status as string | undefined,
        assessmentTypeId: args.assessmentTypeId as string | undefined,
      });

    case "get_stats":
      return getStats();

    case "get_dimension_averages":
      return getDimensionAverages(args.assessmentTypeId as string | undefined);

    case "get_completion_funnel":
      return getCompletionFunnel();

    default:
      return { error: `Unknown tool: ${name}` };
  }
}
