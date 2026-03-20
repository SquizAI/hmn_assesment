import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import { writeFileSync } from "fs";
import { join } from "path";
import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";
import {
  TOOL_DEFINITIONS, executeTool,
  listAssessmentsAdmin, getAssessmentAdmin, createAssessmentAdmin, updateAssessmentAdmin, duplicateAssessmentAdmin,
  listSessionsAdmin, getSessionAdmin, deleteSessionAdmin,
  exportSessionsAdmin, getStatsAdmin, getDimensionAveragesAdmin, getCompletionFunnelAdmin,
  listCompaniesAdmin, getCompanyDetailAdmin,
  listInvitationsAdmin, createInvitationAdmin, batchCreateInvitationsAdmin,
  getInvitationAdmin, deleteInvitationAdmin,
} from "./admin-tools.js";
import {
  loadSessionFromDb, saveSessionToDb, deleteSessionFromDb,
  listAllSessions, listSessionsPaginated, listAllAssessments, lookupSessionsByEmail,
  loadInvitationByToken, loadInvitationById, updateInvitationStatus, findInvitationBySessionId,
  loadAssessment,
} from "./supabase.js";
import { isEmailEnabled, sendInvitationEmail, sendBatchInvitationEmails, sendCompletionEmail } from "./email.js";
import { initGraphSchema, runQuery } from "./neo4j.js";
import { getCompanyIntelligence, getAssessmentSummary, getCrossCompanyBenchmarks, getThemeMap, getGrowthTimeline, getNetworkGraph } from "./graph-queries.js";
import { seedAllSessionsToGraph, extractAndSyncIntelligence } from "./graph-sync.js";
import { runAdaptabilityAnalysis, generateAdaptabilityProfile } from "./adaptability-scoring.js";
import campaignRoutes from "./routes/campaigns.js";
import contactRoutes from "./routes/contacts.js";
import callRoutes from "./routes/calls.js";
import webhookRoutes from "./routes/webhooks.js";
import searchRoutes from "./routes/search.js";
import analyticsRoutes from "./routes/analytics.js";
import settingsRoutes from "./routes/settings.js";
import cleanupRoutes from "./routes/cleanup.js";
import resumeRoutes from "./routes/resume.js";
import compareRoutes from "./routes/compare.js";
import reportPdfRoutes from "./routes/report-pdf.js";
import { addSSEClient, emitAdminEvent } from "./admin-events.js";

dotenv.config();

// ============================================================
// Simple TTL cache for expensive queries
// ============================================================

const cache = new Map<string, { data: unknown; expires: number }>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry || Date.now() > entry.expires) { cache.delete(key); return null; }
  return entry.data as T;
}

function setCache(key: string, data: unknown, ttlMs: number): void {
  cache.set(key, { data, expires: Date.now() + ttlMs });
}

function invalidateCache(prefix?: string): void {
  if (!prefix) { cache.clear(); return; }
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

// Helper: look up assessment name by ID
async function getAssessmentName(assessmentId: string): Promise<string> {
  try {
    const assessment = await loadAssessment(assessmentId);
    return assessment?.name || "AI Readiness Assessment";
  } catch {
    return "AI Readiness Assessment";
  }
}

// ============================================================
// HMN CASCADE - Express API Server
// ============================================================

const app = express();
const IS_PROD = process.env.NODE_ENV === "production";
const PORT = IS_PROD ? parseInt(process.env.PORT || "8080", 10) : 0;
const MODEL = "claude-sonnet-4-6";
const MODEL_FAST = "claude-haiku-4-5-20251001";

// --- CORS (supports HumanGlue integration) ---
const ALLOWED_ORIGINS = [
  process.env.HUMANGLUE_URL || "https://behmn.com",
  "https://www.behmn.com",
  "http://localhost:5040",  // HumanGlue dev
  "http://localhost:5173",  // Cascade dev
  "http://localhost:4173",  // Cascade preview
];

app.use(cors({
  origin: IS_PROD
    ? (origin, callback) => {
        if (!origin || ALLOWED_ORIGINS.includes(origin) || process.env.CORS_ORIGIN === origin) {
          callback(null, true);
        } else {
          callback(null, false);
        }
      }
    : true,
  credentials: true,
}));
app.use(express.json({ limit: "50mb" }));
app.use(cookieParser());

if (!process.env.JWT_SECRET || !process.env.ADMIN_PASSWORD) {
  console.error("FATAL: JWT_SECRET and ADMIN_PASSWORD environment variables are required.");
  process.exit(1);
}

const JWT_SECRET: string = process.env.JWT_SECRET;
const ADMIN_PASSWORD: string = process.env.ADMIN_PASSWORD;

// In production, serve the built frontend
if (IS_PROD) {
  const distPath = join(process.cwd(), "dist");
  app.use(express.static(distPath));
}

// --- Helpers ---

function getAnthropicClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
}

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "");
}

// --- Dashboard Filter Extraction ---

function extractDashboardFilters(query: Record<string, unknown>): import("./admin-tools.js").DashboardFilters {
  return {
    company: query.company as string | undefined,
    assessmentTypeId: query.assessmentTypeId as string | undefined,
    dateFrom: query.dateFrom as string | undefined,
    dateTo: query.dateTo as string | undefined,
    industry: query.industry as string | undefined,
    archetype: query.archetype as string | undefined,
  };
}

// --- Session Storage (Supabase) ---

async function loadSession(id: string) {
  return loadSessionFromDb(id);
}

async function saveSession(session: Record<string, unknown>) {
  (session as { updatedAt: string }).updatedAt = new Date().toISOString();
  await saveSessionToDb(session as import("../src/lib/types").InterviewSession);
}

// --- Question Bank ---

let QUESTION_BANK: Array<Record<string, unknown>> = [];
let SECTION_ORDER: string[] = [];

async function loadQuestionBank() {
  const mod = await import("../src/data/question-bank.js");
  QUESTION_BANK = mod.QUESTION_BANK;
  SECTION_ORDER = mod.SECTION_ORDER;
}

function getQuestionById(id: string) {
  return QUESTION_BANK.find((q) => q.id === id);
}

// --- Dynamic Assessment Loading (multi-assessment support) ---

interface AssessmentQuestionBank {
  questions: Array<Record<string, unknown>>;
  sectionOrder: string[];
  assessment: Record<string, unknown> | null;
}

async function getAssessmentQuestionBank(session: Record<string, unknown>): Promise<AssessmentQuestionBank> {
  const assessmentTypeId = (session.assessmentTypeId as string) || "ai-readiness";

  // For the default ai-readiness assessment, use the static question bank (backwards compatible)
  if (assessmentTypeId === "ai-readiness") {
    return { questions: QUESTION_BANK, sectionOrder: SECTION_ORDER, assessment: null };
  }

  // For other assessments, try to load from Supabase
  try {
    const assessment = await loadAssessment(assessmentTypeId);
    if (assessment?.questions?.length) {
      const sections = (assessment.sections || []) as Array<{ id: string; order: number }>;
      const sectionOrder = sections
        .sort((a, b) => a.order - b.order)
        .map((s) => s.id);
      // Cast questions to Record<string, unknown>[] for compatibility with existing code
      const questions = (assessment.questions as unknown) as Array<Record<string, unknown>>;
      return { questions, sectionOrder, assessment: assessment as unknown as Record<string, unknown> };
    }
  } catch (err) {
    console.error(`Failed to load assessment ${assessmentTypeId} from Supabase, falling back to static:`, err);
  }

  // Fallback to static question bank
  return { questions: QUESTION_BANK, sectionOrder: SECTION_ORDER, assessment: null };
}

function getQuestionFromBank(bank: Array<Record<string, unknown>>, id: string) {
  return bank.find((q) => q.id === id);
}

function substituteCompanyName(text: string, company: string): string {
  return text.replace(/\[Company\]/g, company);
}

// ============================================================
// FIRECRAWL RESEARCH
// ============================================================

async function firecrawlSearch(query: string, limit = 5): Promise<Array<{ url: string; title: string; description: string; markdown?: string }>> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY not set");

  const response = await fetch("https://api.firecrawl.dev/v1/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query,
      limit,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error(`Firecrawl search error (${response.status}):`, err);
    return [];
  }

  const data = await response.json();
  return (data.data || []).map((r: { url?: string; title?: string; description?: string; markdown?: string }) => ({
    url: r.url || "",
    title: r.title || "",
    description: r.description || "",
    markdown: r.markdown || "",
  }));
}

async function researchPerson(session: Record<string, unknown>) {
  const participant = session.participant as {
    name: string;
    role: string;
    company: string;
    industry: string;
    teamSize: string;
    email: string;
  };

  // Extract domain from business email for targeted company scraping
  const emailDomain = participant.email?.includes("@")
    ? participant.email.split("@")[1]
    : null;
  const isBusinessEmail = emailDomain && !["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com", "icloud.com", "me.com", "mail.com", "protonmail.com"].includes(emailDomain);

  const searches = [
    `"${participant.name}" "${participant.company}" ${participant.role}`,
    isBusinessEmail
      ? `site:${emailDomain} "${participant.company}" about`
      : `"${participant.company}" ${participant.industry} company`,
    `"${participant.name}" LinkedIn OR bio OR about`,
  ];

  const allResults: Array<{ url: string; title: string; description: string; markdown?: string }> = [];

  // Run searches in parallel
  const searchResults = await Promise.allSettled(
    searches.map((q) => firecrawlSearch(q, 3))
  );

  for (const result of searchResults) {
    if (result.status === "fulfilled") {
      allResults.push(...result.value);
    }
  }

  if (allResults.length === 0) {
    return {
      status: "no_results",
      personFindings: [],
      companyFindings: [],
      summary: "No public information found. We'll proceed with the interview to learn more about you directly.",
      sources: [],
    };
  }

  // Use Claude to synthesize findings
  const client = getAnthropicClient();
  const rawContent = allResults
    .map((r, i) => `[Source ${i + 1}: ${r.title}]\nURL: ${r.url}\n${r.description}\n${(r.markdown || "").substring(0, 1500)}`)
    .join("\n\n---\n\n");

  const synthesis = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: `You are a research analyst. Synthesize web search results about a person and their company into a structured profile. Return ONLY valid JSON.`,
    messages: [
      {
        role: "user",
        content: `Research subject: ${participant.name}, ${participant.role} at ${participant.company} (${participant.industry})

RAW SEARCH RESULTS:
${rawContent}

Return JSON:
{
  "personProfile": {
    "bio": "2-3 sentence bio",
    "knownRoles": ["role1", "role2"],
    "linkedinSummary": "if found",
    "notableAchievements": ["..."],
    "publicPresence": "low|medium|high"
  },
  "companyProfile": {
    "description": "2-3 sentences about the company",
    "founded": "year if known",
    "size": "if known",
    "funding": "if known",
    "products": ["..."],
    "recentNews": ["..."]
  },
  "keyInsights": ["insight1", "insight2", "..."],
  "interviewAngles": ["specific question angles based on findings"],
  "confidenceLevel": "low|medium|high"
}`,
      },
    ],
  });

  const text = synthesis.content[0].type === "text" ? synthesis.content[0].text : "{}";
  let parsed;
  try {
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    parsed = {
      personProfile: { bio: "Could not synthesize profile.", knownRoles: [], publicPresence: "low" },
      companyProfile: { description: "Could not synthesize company info." },
      keyInsights: [],
      interviewAngles: [],
      confidenceLevel: "low",
    };
  }

  return {
    status: "found",
    ...parsed,
    sources: allResults.map((r) => ({ url: r.url, title: r.title })),
    rawResultCount: allResults.length,
  };
}

// ============================================================
// SMART DEDUCTION & AUTO-POPULATE
// ============================================================

function autoPopulateDemographics(session: Record<string, unknown>): Array<Record<string, unknown>> {
  const participant = session.participant as {
    name: string; role: string; company: string; industry: string; teamSize: string; email: string;
  };
  const autoResponses: Array<Record<string, unknown>> = [];
  const now = new Date().toISOString();
  const conf = { specificity: 1.0, emotionalCharge: 0.5, consistency: 1.0 };

  // Map free-text role to button value
  if (participant.role) {
    const r = participant.role.toLowerCase();
    let val = "ic";
    if (r.includes("ceo") || r.includes("founder") || r.includes("owner") || r.includes("president")) val = "ceo_founder";
    else if (r.includes("cto") || r.includes("cfo") || r.includes("coo") || r.includes("cmo") || r.includes("chief")) val = "c_suite";
    else if (r.includes("vp") || r.includes("vice president") || r.includes("director") || r.includes("head of")) val = "vp_director";
    else if (r.includes("manager") || r.includes("lead") || r.includes("supervisor")) val = "manager";
    autoResponses.push({
      questionId: "demo_role", questionText: "What is your current role?",
      inputType: "buttons", answer: val, timestamp: now, autoPopulated: true, source: "intake",
      confidenceIndicators: conf,
    });
  }

  if (participant.industry) {
    autoResponses.push({
      questionId: "demo_industry", questionText: "What industry are you in?",
      inputType: "open_text", answer: participant.industry, timestamp: now, autoPopulated: true, source: "intake",
      confidenceIndicators: conf,
    });
  }

  if (participant.company) {
    autoResponses.push({
      questionId: "demo_company", questionText: "What is your company name?",
      inputType: "open_text", answer: participant.company, timestamp: now, autoPopulated: true, source: "intake",
      confidenceIndicators: conf,
    });
  }

  if (participant.teamSize) {
    autoResponses.push({
      questionId: "demo_team_size", questionText: "How large is your organization?",
      inputType: "buttons", answer: participant.teamSize, timestamp: now, autoPopulated: true, source: "intake",
      confidenceIndicators: conf,
    });

    // Deduce direct reports for small teams
    if (participant.teamSize === "1-10") {
      const r = participant.role?.toLowerCase() || "";
      const isLeader = r.includes("ceo") || r.includes("founder") || r.includes("owner");
      autoResponses.push({
        questionId: "demo_direct_reports", questionText: "How many direct reports do you have?",
        inputType: "slider", answer: isLeader ? 8 : 4,
        timestamp: now, autoPopulated: true, source: "deduced",
        confidenceIndicators: { specificity: 0.6, emotionalCharge: 0.5, consistency: 1.0 },
      });
    }
  }

  return autoResponses;
}

function buildDeductionContext(session: Record<string, unknown>): string {
  const participant = session.participant as {
    name: string; role: string; company: string; industry: string; teamSize: string; email: string;
  };
  const research = session.research as {
    status?: string;
    personProfile?: { bio?: string; knownRoles?: string[]; notableAchievements?: string[] };
    companyProfile?: { description?: string; founded?: string; size?: string; products?: string[]; recentNews?: string[] };
    keyInsights?: string[];
    interviewAngles?: string[];
  } | null;
  const confirmed = session.researchConfirmed;
  const corrections = session.researchCorrections as Record<string, string> | null;

  const parts: string[] = [];

  parts.push("KNOWN FACTS (already collected — NEVER ask about these):");
  parts.push(`- Full Name: ${participant.name}`);
  parts.push(`- Role: ${participant.role}`);
  parts.push(`- Company: ${participant.company}`);
  if (participant.industry) parts.push(`- Industry: ${participant.industry}`);
  if (participant.teamSize) parts.push(`- Team Size: ${participant.teamSize}`);
  if (participant.email) parts.push(`- Email Domain: ${participant.email.split("@")[1]}`);

  if (research?.status === "found" && confirmed) {
    parts.push("\nRESEARCH (confirmed by participant):");
    if (corrections?.bio) parts.push(`- Bio: ${corrections.bio}`);
    else if (research.personProfile?.bio) parts.push(`- Bio: ${research.personProfile.bio}`);
    if (corrections?.companyDescription) parts.push(`- Company: ${corrections.companyDescription}`);
    else if (research.companyProfile?.description) parts.push(`- Company: ${research.companyProfile.description}`);
    if (research.personProfile?.knownRoles?.length) parts.push(`- Known Roles: ${research.personProfile.knownRoles.join(", ")}`);
    if (research.companyProfile?.products?.length) parts.push(`- Products: ${research.companyProfile.products.join(", ")}`);
    if (research.keyInsights?.length) parts.push(`- Key Insights: ${research.keyInsights.join("; ")}`);
    if (research.interviewAngles?.length) parts.push(`- Suggested Angles: ${research.interviewAngles.join("; ")}`);
  }

  parts.push("\nDEDUCTION RULES (apply these — skip obvious questions):");

  // Team size deductions
  if (participant.teamSize === "1-10") {
    parts.push("- Team is 1-10 people. Everyone likely reports to the founder. SKIP direct reports questions.");
    parts.push("- At this size, the founder IS the tech decision-maker. SKIP 'who makes tech decisions.'");
    parts.push("- Process documentation is likely minimal — expect it, don't dwell on it.");
  } else if (participant.teamSize === "11-50") {
    parts.push("- Team is 11-50. Growing company. Likely 3-8 direct reports.");
    parts.push("- Technology decisions may still be centralized with leadership.");
  } else if (participant.teamSize === "51-200" || participant.teamSize === "201-1000") {
    parts.push("- Mid-market company. Likely has dedicated tech leadership.");
    parts.push("- Process documentation and governance are more important at this scale.");
  } else if (participant.teamSize === "1000+") {
    parts.push("- Enterprise. Focus on organizational change management, not individual tool adoption.");
    parts.push("- Shadow AI and governance questions are highly relevant.");
  }

  // Role deductions
  const r = participant.role?.toLowerCase() || "";
  if (r.includes("ceo") || r.includes("founder")) {
    parts.push("- As CEO/Founder, they have strategic authority. Focus on vision and execution gaps.");
    parts.push("- Don't ask 'who needs to approve AI decisions' — they do.");
    if (participant.teamSize === "1-10" || participant.teamSize === "11-50") {
      parts.push("- Small company CEO: their personal AI usage IS the company's AI culture.");
    }
  } else if (r.includes("cto") || r.includes("technical")) {
    parts.push("- As CTO/tech leader, they know the tech landscape. Focus on adoption barriers.");
  }

  // Industry deductions
  if (participant.industry) {
    const ind = participant.industry.toLowerCase();
    if (ind.includes("health") || ind.includes("medical") || ind.includes("pharma"))
      parts.push("- Healthcare: HIPAA, data privacy, regulation questions are critical.");
    else if (ind.includes("finance") || ind.includes("bank") || ind.includes("insurance"))
      parts.push("- Financial services: Compliance, risk management, auditability are key concerns.");
    else if (ind.includes("saas") || ind.includes("software") || ind.includes("tech"))
      parts.push("- Software/SaaS: They likely already use AI. Focus on depth, not awareness.");
    else if (ind.includes("retail") || ind.includes("ecommerce") || ind.includes("commerce"))
      parts.push("- Retail/ecommerce: Customer experience and operations optimization are key AI angles.");
    else if (ind.includes("manufacturing") || ind.includes("industrial"))
      parts.push("- Manufacturing: Process automation, quality control, predictive maintenance.");
    else if (ind.includes("ag") || ind.includes("farm") || ind.includes("food"))
      parts.push("- Agriculture/Food: Seasonal operations, supply chain, yield optimization.");
    else if (ind.includes("real estate") || ind.includes("property"))
      parts.push("- Real estate: Market analysis, property valuation, client matching are AI opportunities.");
    else if (ind.includes("media") || ind.includes("content") || ind.includes("creative"))
      parts.push("- Media/creative: Content generation, personalization, distribution optimization.");
    else if (ind.includes("education") || ind.includes("edtech"))
      parts.push("- Education: Personalized learning, administrative automation, assessment.");
    else if (ind.includes("consult") || ind.includes("agency") || ind.includes("service"))
      parts.push("- Professional services: Client delivery, knowledge management, proposal automation.");
  }

  parts.push("\nINSTRUCTIONS:");
  parts.push("- NEVER select a question whose answer is already known from intake or research.");
  parts.push("- If a question can be partially answered from context, ADAPT it to go deeper.");
  parts.push("- Use research to personalize — reference their company, products, achievements by name.");
  parts.push("- Prioritize high-weight questions that reveal genuine insight over surface-level data.");
  parts.push("- For CEO of small company: skip team governance, focus on personal AI usage + strategic vision.");
  parts.push("- DEDUCE what you can. If team is 10 people, don't ask how many direct reports.");
  parts.push("- Connect questions to what you already know — 'Given that [company] does [X], how...'");

  return parts.join("\n");
}

function filterDeducibleQuestions(available: Array<Record<string, unknown>>, session: Record<string, unknown>): Array<Record<string, unknown>> {
  const participant = session.participant as { role: string; teamSize: string };
  const r = participant.role?.toLowerCase() || "";
  const size = participant.teamSize || "";
  const responses = session.responses as Array<{ questionId: string; answer: unknown }>;

  return available.filter((q) => {
    // Skip direct reports for tiny teams — it's obvious
    if (q.id === "demo_direct_reports" && (size === "1-10" || size === "11-50")) return false;

    // Skip tech leadership question for small companies with CEO/Founder
    if (q.id === "team_tech_leadership" && size === "1-10" && (r.includes("ceo") || r.includes("founder"))) return false;

    // Handle showCondition — skip questions whose display conditions aren't met
    const condition = q.showCondition as { questionId: string; operator: string; value: unknown } | undefined;
    if (condition?.questionId) {
      const depResponse = responses.find((resp) => resp.questionId === condition.questionId);
      if (!depResponse) return false; // Dependency not yet answered — skip for now
      const depAnswer = depResponse.answer;

      if (condition.operator === "in" && Array.isArray(condition.value)) {
        if (!(condition.value as string[]).includes(String(depAnswer))) return false;
      } else if (condition.operator === "equals") {
        if (String(depAnswer) !== String(condition.value)) return false;
      } else if (condition.operator === "not_equals") {
        if (String(depAnswer) === String(condition.value)) return false;
      }
    }

    return true;
  });
}

// ============================================================
// ROUTES
// ============================================================

// --- Invitation Lookup (public) ---

app.get("/api/invitations/lookup", async (req, res) => {
  try {
    const token = (req.query.token as string || "").trim();
    if (!token) {
      res.status(400).json({ error: "token query param required" });
      return;
    }

    const invitation = await loadInvitationByToken(token);
    if (!invitation) {
      res.status(404).json({ error: "Invitation not found" });
      return;
    }

    // Transition sent -> opened
    if (invitation.status === "sent") {
      await updateInvitationStatus(token, "opened", {
        opened_at: new Date().toISOString(),
      });
      invitation.status = "opened";
    }

    // Load assessment summary
    const assessment = await loadAssessment(invitation.assessmentId);
    const assessmentSummary = assessment ? {
      id: assessment.id,
      name: assessment.name,
      description: assessment.description,
      icon: assessment.icon,
      estimatedMinutes: assessment.estimatedMinutes,
      questionCount: assessment.questions?.length || 0,
      status: assessment.status,
    } : null;

    res.json({ invitation, assessment: assessmentSummary });
  } catch (err) {
    console.error("Invitation lookup error:", err);
    res.status(500).json({ error: "Failed to lookup invitation" });
  }
});

// --- Sessions ---

app.get("/api/sessions", requireAdmin, async (_req, res) => {
  try {
    const sessions = await listAllSessions();
    res.json({ sessions });
  } catch (err) {
    console.error("List sessions error:", err);
    res.status(500).json({ error: "Failed to list sessions" });
  }
});

app.post("/api/sessions", async (req, res) => {
  try {
    const { participant, assessmentTypeId, inviteToken } = req.body;
    if (!participant || typeof participant !== "object") {
      res.status(400).json({ error: "participant object is required" });
      return;
    }
    const { name, company, email } = participant as Record<string, unknown>;
    if (!name || typeof name !== "string" || name.trim().length < 1 || (name as string).length > 200) {
      res.status(400).json({ error: "name is required (1-200 characters)" });
      return;
    }
    if (!company || typeof company !== "string" || (company as string).trim().length < 1 || (company as string).length > 200) {
      res.status(400).json({ error: "company is required (1-200 characters)" });
      return;
    }
    if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email as string)) {
      res.status(400).json({ error: "a valid business email is required" });
      return;
    }

    // Require invite token — no self-service sign-ups
    if (!inviteToken) {
      res.status(403).json({ error: "An invitation is required to start an assessment" });
      return;
    }

    let invitation = null;
    invitation = await loadInvitationByToken(inviteToken);
    if (!invitation) {
      res.status(400).json({ error: "Invalid invitation token" });
      return;
    }
    if (invitation.sessionId) {
      res.status(400).json({ error: "This invitation has already been used", sessionId: invitation.sessionId });
      return;
    }

    const id = `hmn_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const session = {
      id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "intake",
      assessmentTypeId: assessmentTypeId || "ai-readiness",
      participant,
      currentQuestionIndex: 0,
      currentPhase: "profile_baseline",
      currentSection: "demographics",
      responses: [],
      conversationHistory: [],
      research: null,
      researchConfirmed: false,
    };

    await saveSession(session);

    // Link invitation to session
    if (invitation) {
      await updateInvitationStatus(inviteToken, "started", {
        session_id: id,
        started_at: new Date().toISOString(),
      });
    }

    res.status(201).json({ session });
  } catch (err) {
    console.error("Create session error:", err);
    res.status(500).json({ error: "Failed to create session" });
  }
});

// Mount resume/compare routers BEFORE the :sessionId wildcard
app.use("/api/sessions/resume", resumeRoutes);
app.use("/api/sessions/compare", compareRoutes);
app.use("/api/sessions/report", reportPdfRoutes);

app.get("/api/sessions/lookup", async (req, res) => {
  try {
    const email = (req.query.email as string || "").toLowerCase().trim();
    if (!email) {
      res.status(400).json({ error: "email query param required" });
      return;
    }
    const rawSessions = await lookupSessionsByEmail(email);
    const sessions = rawSessions.map((s) => ({
      id: s.id,
      status: s.status,
      createdAt: s.createdAt,
      assessmentTypeId: s.assessmentTypeId,
      participantName: s.participant?.name,
      participantCompany: s.participant?.company,
      score: (s.analysis as { overallReadinessScore?: number } | undefined)?.overallReadinessScore,
    }));
    res.json({ sessions });
  } catch (err) {
    console.error("Lookup sessions error:", err);
    res.status(500).json({ error: "Failed to lookup sessions" });
  }
});

app.get("/api/sessions/:sessionId", async (req, res) => {
  try {
    const session = await loadSession(req.params.sessionId);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    res.json({ session });
  } catch (err) {
    console.error("Get session error:", err);
    res.status(500).json({ error: "Failed to get session" });
  }
});

// --- Research (Firecrawl Deep Diligence) ---

app.post("/api/research/:sessionId", async (req, res) => {
  try {
    const session = await loadSession(req.params.sessionId);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    // If already researched, return cached results
    if (session.research) {
      res.json({ research: session.research });
      return;
    }

    console.log(`Researching: ${(session.participant as { name: string }).name} at ${(session.participant as { company: string }).company}...`);
    const research = await researchPerson(session);

    session.research = research;
    session.status = "researched";
    await saveSession(session);

    res.json({ research });
  } catch (err) {
    console.error("Research error:", err);
    res.status(500).json({ error: "Research failed", research: { status: "error", summary: "Research service unavailable. Proceeding without background intel." } });
  }
});

app.post("/api/research/:sessionId/confirm", async (req, res) => {
  try {
    const session = await loadSession(req.params.sessionId);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const { confirmed, corrections } = req.body;
    session.researchConfirmed = confirmed;
    if (corrections) {
      session.researchCorrections = corrections;
    }
    await saveSession(session);
    res.json({ ok: true });
  } catch (err) {
    console.error("Confirm research error:", err);
    res.status(500).json({ error: "Failed to confirm research" });
  }
});

// --- Interview Start ---

app.post("/api/interview/start", async (req, res) => {
  try {
  const { sessionId } = req.body;
  const session = await loadSession(sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  // Load assessment-specific question bank (dynamic for non-default assessments)
  const { questions: bankQuestions, assessment } = await getAssessmentQuestionBank(session);

  // --- RESUME: If session already has responses, resume from where they left off ---
  const existingResponses = (session.responses || []) as Array<{ questionId: string; questionText?: string; answer: unknown; autoPopulated?: boolean }>;
  const hasProgress = session.status === "in_progress" && existingResponses.length > 0;

  if (hasProgress) {
    const answeredIds = new Set(existingResponses.map((r) => r.questionId));
    const remaining = bankQuestions.filter((q) => !answeredIds.has(q.id as string));
    const smartRemaining = filterDeducibleQuestions(remaining, session as unknown as Record<string, unknown>);
    const filteredOutIds = remaining.filter((q) => !smartRemaining.some((sq) => sq.id === q.id)).map((q) => q.id as string);

    // Resume at the current question or first remaining
    let resumeQuestion = session.currentQuestionIndex !== undefined
      ? bankQuestions[session.currentQuestionIndex as number]
      : null;
    // If the current question was already answered, pick next remaining
    if (!resumeQuestion || answeredIds.has(resumeQuestion.id as string)) {
      resumeQuestion = (smartRemaining.length > 0 ? smartRemaining : remaining)[0];
    }

    if (!resumeQuestion) {
      // All questions answered — complete
      session.status = "completed";
      await saveSession(session as unknown as Record<string, unknown>);

      // Send completion thank-you email (fire-and-forget)
      const resumeParticipant = session.participant as { name?: string; email?: string };
      const resumeAssessmentName = (assessment as Record<string, unknown>)?.name as string || "HMN Assessment";
      if (isEmailEnabled() && resumeParticipant?.email) {
        sendCompletionEmail({
          to: resumeParticipant.email,
          participantName: resumeParticipant.name || "there",
          assessmentName: resumeAssessmentName,
        }).catch((err) => console.error("[EMAIL] Completion email failed:", err));
      }

      const resumeAssessmentTypeId = (session.assessmentTypeId as string) || "ai-readiness";
      res.json({ type: "complete", session, assessmentTypeId: resumeAssessmentTypeId, assessmentName: resumeAssessmentName });
      return;
    }

    const companyName = (session.participant as { company?: string })?.company || "";
    if (companyName && resumeQuestion.text) {
      resumeQuestion = { ...resumeQuestion, text: substituteCompanyName(resumeQuestion.text as string, companyName) };
    }

    const autoIds = existingResponses.filter((r) => r.autoPopulated).map((r) => r.questionId);
    const skippedQuestionIds = [...new Set([...autoIds, ...filteredOutIds])];

    console.log(`[INTERVIEW] Resuming session ${sessionId} at question ${resumeQuestion.id} (${existingResponses.length} responses saved)`);

    // Return all previously answered questions so client can show Q pills and section progress
    const answeredResponses = existingResponses.map((r) => ({
      questionId: r.questionId,
      questionText: r.questionText || "",
      answer: r.answer,
      inputType: (r as Record<string, unknown>).inputType || "open_text",
    }));

    // Count only unique responses that match actual bank questions (exclude phantom auto-populated IDs and duplicates)
    const bankIdSet = new Set(bankQuestions.map((q) => q.id as string));
    const bankAnsweredIds = new Set(existingResponses.filter((r) => bankIdSet.has(r.questionId)).map((r) => r.questionId));
    const bankAnswered = bankAnsweredIds.size;
    const effectiveTotal = bankQuestions.length - skippedQuestionIds.filter((id) => bankIdSet.has(id)).length;

    res.json({
      session,
      currentQuestion: resumeQuestion,
      skippedQuestionIds,
      autoPopulatedResponses: existingResponses.filter((r) => r.autoPopulated),
      answeredResponses,
      assessmentQuestions: bankQuestions,
      assessmentSections: assessment?.sections || null,
      assessmentPhases: assessment?.phases || null,
      assessmentScoringDimensions: assessment?.scoringDimensions || null,
      progress: {
        questionNumber: bankAnswered - skippedQuestionIds.filter((id) => bankIdSet.has(id)).length + 1,
        totalQuestions: effectiveTotal,
        phase: resumeQuestion.phase,
        section: resumeQuestion.section,
        completedPercentage: Math.round((bankAnswered / Math.max(bankQuestions.length, 1)) * 100),
      },
    });
    return;
  }

  // --- FRESH START: First time starting this session ---
  // Auto-populate demographics from intake + research (skip redundant questions)
  const autoResponses = autoPopulateDemographics(session);
  session.responses = [...autoResponses];
  const answeredIds = new Set(autoResponses.map((r) => r.questionId as string));

  // Find first non-auto-populated, non-deducible question
  const remaining = bankQuestions.filter((q) => !answeredIds.has(q.id as string));
  const smartRemaining = filterDeducibleQuestions(remaining, session);
  const filteredOutIds = remaining.filter((q) => !smartRemaining.some((sq) => sq.id === q.id)).map((q) => q.id as string);
  const firstQuestion = (smartRemaining.length > 0 ? smartRemaining : remaining)[0];

  if (!firstQuestion) {
    res.status(500).json({ error: "No questions found" });
    return;
  }

  // Apply [Company] substitution for employee assessments
  const companyName = (session.participant as { company?: string })?.company || "";
  if (companyName && firstQuestion.text) {
    firstQuestion.text = substituteCompanyName(firstQuestion.text as string, companyName);
  }

  // Compute skipped question IDs (auto-populated + deducible)
  const skippedQuestionIds = [...new Set([
    ...autoResponses.map((r) => r.questionId as string),
    ...filteredOutIds,
  ])];

  console.log(`Auto-populated ${autoResponses.length} demographics, starting at: ${firstQuestion.id}`);

  session.status = "in_progress";
  session.currentPhase = firstQuestion.phase;
  session.currentSection = firstQuestion.section;
  session.currentQuestionIndex = bankQuestions.findIndex((q) => q.id === firstQuestion.id);
  await saveSession(session);

  // Count only auto-populated responses that match actual bank questions
  const freshBankIdSet = new Set(bankQuestions.map((q) => q.id as string));
  const freshBankSkipped = skippedQuestionIds.filter((id) => freshBankIdSet.has(id)).length;
  const freshEffectiveTotal = bankQuestions.length - freshBankSkipped;

  res.json({
    session,
    currentQuestion: firstQuestion,
    skippedQuestionIds,
    autoPopulatedResponses: autoResponses,
    // Include assessment metadata so frontend can render dynamic sections/phases
    assessmentQuestions: bankQuestions,
    assessmentSections: assessment?.sections || null,
    assessmentPhases: assessment?.phases || null,
    assessmentScoringDimensions: assessment?.scoringDimensions || null,
    progress: {
      questionNumber: 1,
      totalQuestions: freshEffectiveTotal,
      phase: firstQuestion.phase,
      section: firstQuestion.section,
      completedPercentage: 0,
    },
  });
  } catch (err) {
    console.error("Interview start error:", err);
    res.status(500).json({ error: "Failed to start interview" });
  }
});

// --- Streaming AI Conversation Endpoint ---

app.post("/api/interview/conversation-stream", async (req, res) => {
  try {
    const { sessionId, questionId, answer, conversationHistory: clientHistory } = req.body;

    const session = await loadSession(sessionId);
    if (!session) { res.status(404).json({ error: "Session not found" }); return; }

    const { questions: bankQuestions, assessment } = await getAssessmentQuestionBank(session);
    const currentQuestion = getQuestionFromBank(bankQuestions, questionId) || getQuestionById(questionId);
    if (!currentQuestion) { res.status(404).json({ error: "Question not found" }); return; }

    const history = clientHistory || [];
    history.push({ role: "user", content: String(answer), timestamp: new Date().toISOString(), questionId });

    const userTurns = history.filter((m: { role: string }) => m.role === "user").length;
    const MAX_CONVERSATION_TURNS = 5;

    // Set up SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering
    res.flushHeaders();

    let aiResponse: string;

    if (userTurns >= MAX_CONVERSATION_TURNS) {
      aiResponse = "Thank you for sharing all of that — really helpful context. [QUESTION_COMPLETE]";
      res.write(`data: ${JSON.stringify({ type: "token", text: aiResponse.replace("[QUESTION_COMPLETE]", "").trim() })}\n\n`);
    } else {
      // Stream the follow-up response
      aiResponse = await streamFollowUp(res, session as unknown as Record<string, unknown>, currentQuestion, history, assessment);
    }

    // Check completion
    const farewellPatterns = /\b(goodbye|good\s*bye|take care|talk soon|thanks for (?:sharing|being|your time)|appreciate you|that['']s (?:all|everything)|we['']re (?:all )?done)\b/i;
    const isExplicitComplete = aiResponse.includes("[QUESTION_COMPLETE]");
    const isFarewellComplete = !isExplicitComplete && farewellPatterns.test(aiResponse) && userTurns >= 2;
    const isComplete = isExplicitComplete || isFarewellComplete;

    const cleanResponse = aiResponse.replace("[QUESTION_COMPLETE]", "").replace(/\*\*\[.*?\]\*\*\s*/g, "").trim();

    if (!isComplete) {
      history.push({ role: "assistant", content: cleanResponse, timestamp: new Date().toISOString(), questionId });
      res.write(`data: ${JSON.stringify({ type: "done", isComplete: false, conversationHistory: history })}\n\n`);
      res.end();
      return;
    }

    // --- Conversation complete: finalize ---
    const fullAnswer = history.filter((m: { role: string }) => m.role === "user").map((m: { content: string }) => m.content).join("\n");

    // Remove any existing response for this question
    const existingIdx = (session.responses as Array<{ questionId: string }>).findIndex((r) => r.questionId === questionId);
    if (existingIdx !== -1) session.responses.splice(existingIdx, 1);

    // Run confidence + next question in PARALLEL
    const answeredIds = new Set(session.responses.map((r: { questionId: string }) => r.questionId));
    answeredIds.add(questionId); // include this one
    const remaining = bankQuestions.filter((q) => !answeredIds.has(q.id as string));
    const smartRemaining = filterDeducibleQuestions(remaining, session);
    const questionsForAI = smartRemaining.length > 0 ? smartRemaining : remaining;

    const [confidence, selection] = await Promise.all([
      analyzeResponseConfidence(fullAnswer, currentQuestion.text as string, session.responses),
      remaining.length > 0 ? selectNextQuestion(questionsForAI, session).catch(() => null) : Promise.resolve(null),
    ]);

    session.responses.push({
      questionId,
      questionText: currentQuestion.text,
      inputType: currentQuestion.inputType,
      answer: fullAnswer,
      timestamp: new Date().toISOString(),
      aiFollowUps: history
        .filter((m: { role: string }) => m.role === "assistant")
        .map((m: { content: string; timestamp: string }, i: number) => ({
          question: m.content,
          answer: history.filter((c: { role: string }) => c.role === "user")[i + 1]?.content || "",
          timestamp: m.timestamp,
        })),
      confidenceIndicators: confidence,
    });
    session.conversationHistory.push(...history);

    if (remaining.length === 0) {
      session.status = "completed";
      await saveSession(session);
      const completionAssessmentName = (assessment as Record<string, unknown>)?.name as string || "HMN Assessment";
      const completionTypeId = (session.assessmentTypeId as string) || "ai-readiness";

      // Fire-and-forget completion email
      const participant = session.participant as { name?: string; email?: string };
      if (isEmailEnabled() && participant?.email) {
        sendCompletionEmail({ to: participant.email, participantName: participant.name || "there", assessmentName: completionAssessmentName }).catch(() => {});
      }

      res.write(`data: ${JSON.stringify({ type: "done", isComplete: true, responseType: "complete", session, assessmentTypeId: completionTypeId, assessmentName: completionAssessmentName, conversationHistory: history })}\n\n`);
      res.end();
      return;
    }

    // Resolve next question
    let nextQuestion: Record<string, unknown> | undefined;
    if (selection?.questionId) {
      const selected = getQuestionFromBank(bankQuestions, selection.questionId) || getQuestionById(selection.questionId);
      if (selected) {
        const adaptedText = selection.adaptedText && selection.adaptedText.trim().length > 3 ? selection.adaptedText : null;
        nextQuestion = { ...selected, text: adaptedText || (selected.text as string) };
      }
    }
    if (!nextQuestion) nextQuestion = remaining[0];

    // Apply [Company] substitution
    const companyName = (session.participant as { company?: string })?.company || "";
    if (companyName && nextQuestion?.text) {
      nextQuestion = { ...nextQuestion, text: substituteCompanyName(nextQuestion.text as string, companyName) };
    }

    session.currentQuestionIndex = bankQuestions.findIndex((q) => q.id === nextQuestion!.id);
    session.currentPhase = nextQuestion.phase;
    session.currentSection = nextQuestion.section;
    await saveSession(session);

    // Compute skipped IDs
    const autoIds = session.responses.filter((r: { autoPopulated?: boolean }) => r.autoPopulated).map((r: { questionId: string }) => r.questionId);
    const respondFilteredOutIds = remaining.filter((q) => !smartRemaining.some((sq) => sq.id === q.id)).map((q) => q.id as string);
    const respondSkippedIds = [...new Set([...autoIds, ...respondFilteredOutIds])];

    const respondBankIdSet = new Set(bankQuestions.map((q) => q.id as string));
    const respondBankAnsweredIds = new Set(session.responses.filter((r: { questionId: string }) => respondBankIdSet.has(r.questionId)).map((r: { questionId: string }) => r.questionId));
    const respondBankAnswered = respondBankAnsweredIds.size;
    const respondBankSkipped = respondSkippedIds.filter((id) => respondBankIdSet.has(id)).length;
    const respondEffectiveTotal = bankQuestions.length - respondBankSkipped;

    res.write(`data: ${JSON.stringify({
      type: "done",
      isComplete: true,
      responseType: "next_question",
      currentQuestion: nextQuestion,
      skippedQuestionIds: respondSkippedIds,
      conversationHistory: history,
      progress: {
        questionNumber: respondBankAnswered - respondBankSkipped + 1,
        totalQuestions: respondEffectiveTotal,
        phase: nextQuestion.phase,
        section: nextQuestion.section,
        completedPercentage: Math.round((respondBankAnswered / Math.max(bankQuestions.length, 1)) * 100),
      },
    })}\n\n`);
    res.end();
  } catch (err) {
    console.error("Conversation stream error:", err);
    try {
      res.write(`data: ${JSON.stringify({ type: "error", message: "Something went wrong. Please try again." })}\n\n`);
      res.end();
    } catch {
      // Headers already sent, can't respond
    }
  }
});

// --- Interview Respond ---

app.post("/api/interview/respond", async (req, res) => {
  try {
    const { sessionId, questionId, answer, conversationHistory, skip } = req.body;

    const session = await loadSession(sessionId);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    // Load assessment-specific question bank
    const { questions: bankQuestions, assessment } = await getAssessmentQuestionBank(session);

    const currentQuestion = getQuestionFromBank(bankQuestions, questionId) || getQuestionById(questionId);
    if (!currentQuestion) {
      res.status(404).json({ error: "Question not found" });
      return;
    }

    // Remove any existing response for this question to prevent duplicates (e.g., from retried requests after timeouts)
    const existingIdx = (session.responses as Array<{ questionId: string }>).findIndex((r) => r.questionId === questionId);
    if (existingIdx !== -1 && !conversationHistory) {
      // Only remove for non-conversation re-submissions; conversation follow-ups build on existing state
      session.responses.splice(existingIdx, 1);
    }

    // --- Handle AI Conversation (unless skipping) ---
    let aiConversationHistory: Array<{ role: string; content: string; timestamp: string; questionId?: string }> | undefined;
    if (currentQuestion.inputType === "ai_conversation" && !skip) {
      const history = conversationHistory || [];

      history.push({
        role: "user",
        content: String(answer),
        timestamp: new Date().toISOString(),
        questionId,
      });

      // Count user turns — force completion after 5 to prevent infinite loops
      const userTurns = history.filter((m: { role: string }) => m.role === "user").length;
      const MAX_CONVERSATION_TURNS = 5;

      let aiResponse: string;
      if (userTurns >= MAX_CONVERSATION_TURNS) {
        aiResponse = "Thank you for sharing all of that — really helpful context. [QUESTION_COMPLETE]";
        console.log(`[INTERVIEW] Forcing conversation completion after ${userTurns} turns for question ${questionId}`);
      } else {
        aiResponse = await generateFollowUp(session as unknown as Record<string, unknown>, currentQuestion, history, assessment);
      }

      // Detect conversation completion: explicit marker OR farewell-like response
      const farewellPatterns = /\b(goodbye|good\s*bye|take care|talk soon|thanks for (?:sharing|being|your time)|appreciate you|that['']s (?:all|everything)|we['']re (?:all )?done)\b/i;
      const isExplicitComplete = aiResponse.includes("[QUESTION_COMPLETE]");
      const isFarewellComplete = !isExplicitComplete && farewellPatterns.test(aiResponse) && userTurns >= 2;
      const isComplete = isExplicitComplete || isFarewellComplete;
      if (isFarewellComplete) {
        console.log(`[INTERVIEW] Auto-completing conversation for ${questionId} — farewell detected after ${userTurns} turns`);
      }
      // Strip [QUESTION_COMPLETE] marker and internal annotations like **[capturing: ...]** or **[RED FLAG: ...]**
      const cleanResponse = aiResponse
        .replace("[QUESTION_COMPLETE]", "")
        .replace(/\*\*\[.*?\]\*\*\s*/g, "")
        .trim();

      if (!isComplete) {
        history.push({
          role: "assistant",
          content: cleanResponse,
          timestamp: new Date().toISOString(),
          questionId,
        });

        res.json({
          type: "follow_up",
          aiResponse: cleanResponse,
          conversationHistory: history,
          isComplete: false,
        });
        return;
      }

      const fullAnswer = history
        .filter((m: { role: string }) => m.role === "user")
        .map((m: { content: string }) => m.content)
        .join("\n");

      const confidence = await analyzeResponseConfidence(fullAnswer, currentQuestion.text as string, session.responses);

      session.responses.push({
        questionId,
        questionText: currentQuestion.text,
        inputType: currentQuestion.inputType,
        answer: fullAnswer,
        timestamp: new Date().toISOString(),
        aiFollowUps: history
          .filter((m: { role: string }) => m.role === "assistant")
          .map((m: { content: string; timestamp: string }, i: number) => ({
            question: m.content,
            answer: history.filter((c: { role: string }) => c.role === "user")[i + 1]?.content || "",
            timestamp: m.timestamp,
          })),
        confidenceIndicators: confidence,
      });

      session.conversationHistory.push(...history);
      aiConversationHistory = history;
    } else if (answer === "[SKIPPED]") {
      // --- Skipped question ---
      session.responses.push({
        questionId,
        questionText: currentQuestion.text,
        inputType: currentQuestion.inputType,
        answer: "",
        skipped: true,
        timestamp: new Date().toISOString(),
        confidenceIndicators: { specificity: 0, emotionalCharge: 0, consistency: 0 },
      });
    } else {
      // --- Non-conversation response ---
      // Defer confidence analysis — run it in parallel with next question selection below
      let confidencePromise: Promise<{ specificity: number; emotionalCharge: number; consistency: number }> | null = null;
      if (currentQuestion.inputType === "open_text" || currentQuestion.inputType === "voice") {
        confidencePromise = analyzeResponseConfidence(String(answer), currentQuestion.text as string, session.responses);
      }

      // Push response with placeholder confidence (updated below after parallel resolve)
      session.responses.push({
        questionId,
        questionText: currentQuestion.text,
        inputType: currentQuestion.inputType,
        answer,
        timestamp: new Date().toISOString(),
        confidenceIndicators: { specificity: 0.8, emotionalCharge: 0.5, consistency: 0.8 },
      });

      // Store the promise to resolve after next question selection
      (session as unknown as Record<string, unknown>)._pendingConfidence = { promise: confidencePromise, responseIndex: session.responses.length - 1 };
    }

    // --- Next Question ---
    const answeredIds = new Set(session.responses.map((r: { questionId: string }) => r.questionId));
    const remaining = bankQuestions.filter((q) => !answeredIds.has(q.id as string));

    if (remaining.length === 0) {
      // Resolve any pending confidence before saving
      const pending = (session as unknown as Record<string, unknown>)._pendingConfidence as { promise: Promise<{ specificity: number; emotionalCharge: number; consistency: number }> | null; responseIndex: number } | undefined;
      if (pending?.promise) {
        const confidence = await pending.promise;
        (session.responses[pending.responseIndex] as unknown as Record<string, unknown>).confidenceIndicators = confidence;
      }
      delete (session as unknown as Record<string, unknown>)._pendingConfidence;

      session.status = "completed";
      await saveSession(session);

      // Notify admin dashboard + invalidate stats cache
      invalidateCache("stats:");
      const participantInfo = session.participant as { name?: string; email?: string; company?: string };
      emitAdminEvent({
        type: "session_completed",
        data: { sessionId: session.id, name: participantInfo?.name || "Unknown", company: participantInfo?.company || "" },
        timestamp: new Date().toISOString(),
      });

      // Send completion thank-you email (fire-and-forget)
      const participant = session.participant as { name?: string; email?: string };
      const completionAssessmentName = (assessment as Record<string, unknown>)?.name as string || "HMN Assessment";
      if (isEmailEnabled() && participant?.email) {
        sendCompletionEmail({
          to: participant.email,
          participantName: participant.name || "there",
          assessmentName: completionAssessmentName,
        }).catch((err) => console.error("[EMAIL] Completion email failed:", err));
      }

      const completionTypeId = (session.assessmentTypeId as string) || "ai-readiness";
      res.json({ type: "complete", session, assessmentTypeId: completionTypeId, assessmentName: completionAssessmentName, ...(aiConversationHistory && { conversationHistory: aiConversationHistory }) });
      return;
    }

    // Filter out questions that can be trivially deduced
    const smartRemaining = filterDeducibleQuestions(remaining, session);
    const respondFilteredOutIds = remaining.filter((q) => !smartRemaining.some((sq) => sq.id === q.id)).map((q) => q.id as string);
    const questionsForAI = smartRemaining.length > 0 ? smartRemaining : remaining;

    // Run next question selection + pending confidence in PARALLEL
    const pending = (session as unknown as Record<string, unknown>)._pendingConfidence as { promise: Promise<{ specificity: number; emotionalCharge: number; consistency: number }> | null; responseIndex: number } | undefined;

    const [selection, resolvedConfidence] = await Promise.all([
      selectNextQuestion(questionsForAI, session).catch(() => null),
      pending?.promise ?? Promise.resolve(null),
    ]);

    // Update confidence if we had a pending promise
    if (resolvedConfidence && pending) {
      (session.responses[pending.responseIndex] as unknown as Record<string, unknown>).confidenceIndicators = resolvedConfidence;
    }
    delete (session as unknown as Record<string, unknown>)._pendingConfidence;

    // Resolve next question from selection
    let nextQuestion: Record<string, unknown> | undefined;
    if (selection?.questionId) {
      const selected = getQuestionFromBank(bankQuestions, selection.questionId) || getQuestionById(selection.questionId);
      if (selected) {
        const adaptedText = selection.adaptedText && selection.adaptedText.trim().length > 3
          ? selection.adaptedText
          : null;
        nextQuestion = { ...selected, text: adaptedText || (selected.text as string) };
      } else {
        console.warn(`[INTERVIEW] selectNextQuestion returned unknown ID: ${selection.questionId}, falling back`);
      }
    }

    // Fallback: pick first remaining question
    if (!nextQuestion && remaining.length > 0) {
      nextQuestion = remaining[0];
    }

    // Safety: if still no question (shouldn't happen since remaining.length > 0 checked above)
    if (!nextQuestion) {
      console.error("[INTERVIEW] No next question available despite remaining questions existing");
      session.status = "completed";
      await saveSession(session as unknown as Record<string, unknown>);

      // Send completion thank-you email (fire-and-forget)
      const fbParticipant = session.participant as { name?: string; email?: string };
      const fbAssessmentName = (assessment as Record<string, unknown>)?.name as string || "HMN Assessment";
      if (isEmailEnabled() && fbParticipant?.email) {
        sendCompletionEmail({
          to: fbParticipant.email,
          participantName: fbParticipant.name || "there",
          assessmentName: fbAssessmentName,
        }).catch((err) => console.error("[EMAIL] Completion email failed:", err));
      }

      const fbTypeId = (session.assessmentTypeId as string) || "ai-readiness";
      res.json({ type: "complete", session, assessmentTypeId: fbTypeId, assessmentName: fbAssessmentName });
      return;
    }

    // Apply [Company] substitution
    const companyName = (session.participant as { company?: string })?.company || "";
    if (companyName && nextQuestion.text) {
      nextQuestion = { ...nextQuestion, text: substituteCompanyName(nextQuestion.text as string, companyName) };
    }

    session.currentQuestionIndex = bankQuestions.findIndex((q) => q.id === nextQuestion!.id);
    session.currentPhase = nextQuestion.phase;
    session.currentSection = nextQuestion.section;
    await saveSession(session);

    // Compute skipped IDs: auto-populated + deducible
    const autoIds = session.responses
      .filter((r: { autoPopulated?: boolean }) => r.autoPopulated)
      .map((r: { questionId: string }) => r.questionId);
    const respondSkippedIds = [...new Set([...autoIds, ...respondFilteredOutIds])];

    // Count only unique responses matching actual bank questions (exclude phantom auto-populated IDs and duplicates)
    const respondBankIdSet = new Set(bankQuestions.map((q) => q.id as string));
    const respondBankAnsweredIds = new Set(session.responses.filter((r: { questionId: string }) => respondBankIdSet.has(r.questionId)).map((r: { questionId: string }) => r.questionId));
    const respondBankAnswered = respondBankAnsweredIds.size;
    const respondBankSkipped = respondSkippedIds.filter((id) => respondBankIdSet.has(id)).length;
    const respondEffectiveTotal = bankQuestions.length - respondBankSkipped;

    res.json({
      type: "next_question",
      currentQuestion: nextQuestion,
      skippedQuestionIds: respondSkippedIds,
      ...(aiConversationHistory && { conversationHistory: aiConversationHistory }),
      progress: {
        questionNumber: respondBankAnswered - respondBankSkipped + 1,
        totalQuestions: respondEffectiveTotal,
        phase: nextQuestion.phase,
        section: nextQuestion.section,
        completedPercentage: Math.round((respondBankAnswered / Math.max(bankQuestions.length, 1)) * 100),
      },
    });
  } catch (err) {
    console.error("Respond error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- Update a previous answer ---

app.put("/api/interview/respond", async (req, res) => {
  try {
    const { sessionId, questionId, answer } = req.body;
    const session = await loadSession(sessionId);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const responseIndex = (session.responses as Array<{ questionId: string }>).findIndex(
      (r) => r.questionId === questionId
    );
    if (responseIndex === -1) {
      res.status(404).json({ error: "Response not found" });
      return;
    }

    // Load assessment-specific question bank
    const { questions: bankQuestions } = await getAssessmentQuestionBank(session);

    const currentQuestion = getQuestionFromBank(bankQuestions, questionId) || getQuestionById(questionId);
    if (!currentQuestion) {
      res.status(404).json({ error: "Question not found" });
      return;
    }

    // Re-analyze confidence for text/voice/ai_conversation answers
    let confidence = session.responses[responseIndex].confidenceIndicators;
    if (currentQuestion.inputType === "open_text" || currentQuestion.inputType === "voice" || currentQuestion.inputType === "ai_conversation") {
      confidence = await analyzeResponseConfidence(
        String(answer),
        currentQuestion.text as string,
        session.responses.filter((_: unknown, i: number) => i !== responseIndex)
      );
    }

    // Update response in-place
    session.responses[responseIndex] = {
      ...session.responses[responseIndex],
      answer,
      timestamp: new Date().toISOString(),
      editedAt: new Date().toISOString(),
      editCount: (session.responses[responseIndex].editCount || 0) + 1,
      confidenceIndicators: confidence,
      // Clear AI follow-ups for ai_conversation edits (stale context)
      ...(currentQuestion.inputType === "ai_conversation" ? { aiFollowUps: [] } : {}),
    };

    await saveSession(session);
    res.json({ ok: true, updatedResponse: session.responses[responseIndex] });
  } catch (err) {
    console.error("Update response error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- Navigate to previous question (read-only) ---

app.get("/api/interview/:sessionId/response/:questionId", async (req, res) => {
  const session = await loadSession(req.params.sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  const response = (session.responses as Array<{ questionId: string }>).find(
    (r) => r.questionId === req.params.questionId
  );
  if (!response) {
    res.status(404).json({ error: "Response not found" });
    return;
  }
  // Load assessment-specific question bank
  const { questions: bankQuestions } = await getAssessmentQuestionBank(session);
  const question = getQuestionFromBank(bankQuestions, req.params.questionId) || getQuestionById(req.params.questionId);
  res.json({ response, question });
});

// --- VAPI Voice Context ---

app.post("/api/vapi/context", async (req, res) => {
  try {
    const { sessionId, questionId } = req.body;

    const session = await loadSession(sessionId);
    if (!session) { res.status(404).json({ error: "Session not found" }); return; }

    const { questions: bankQuestions } = await getAssessmentQuestionBank(session);
    const question = getQuestionFromBank(bankQuestions, questionId) || getQuestionById(questionId);
    if (!question) { res.status(404).json({ error: "Question not found" }); return; }

    const participant = session.participant as { name?: string; role?: string; company?: string; industry?: string; teamSize?: string };
    const responses = session.responses as Array<{ questionText?: string; answer?: unknown }>;

    // Build context from prior responses
    const contextSummary = responses.length > 0
      ? responses.slice(-5).map((r) =>
          `Q: ${r.questionText}\nA: ${typeof r.answer === "object" ? JSON.stringify(r.answer) : r.answer}`
        ).join("\n\n")
      : "This is the first question — no prior responses yet.";

    const qText = (question as { text?: string }).text || "";
    const qSubtext = (question as { subtext?: string }).subtext || "";
    const qSection = (question as { section?: string }).section || "";
    const qPhase = (question as { phase?: string }).phase || "";
    const qDimensions = ((question as { scoringDimensions?: string[] }).scoringDimensions || []).join(", ");
    const qFollowUp = (question as { aiFollowUpPrompt?: string }).aiFollowUpPrompt || "";

    const systemPrompt = `You are Kascade, an expert voice interviewer calling from HMN (Human), conducting an AI readiness diagnostic assessment via voice.

PARTICIPANT CONTEXT:
- Name: ${participant.name || ""}
- Role: ${participant.role || ""}
- Company: ${participant.company || ""}
- Industry: ${participant.industry || ""}
- Team Size: ${participant.teamSize || ""}

RECENT PRIOR RESPONSES:
${contextSummary}

CURRENT QUESTION:
"${qText}"
${qSubtext ? `Context: ${qSubtext}` : ""}
- Section: ${qSection}
- Phase: ${qPhase}
- Scoring Focus: ${qDimensions}

${qFollowUp ? `FOLLOW-UP GUIDANCE:\n${qFollowUp}` : ""}

YOUR PERSONALITY & RULES:
- You are warm, direct, and genuinely curious — like a sharp consultant who actually cares
- You speak naturally and conversationally — never robotic or overly formal
- You call them by name occasionally
- You ask ONE follow-up at a time, never stack questions
- Listen for specificity: names, numbers, tools, real examples
- Listen for contradictions with prior answers
- Listen for emotional shifts — energy, frustration, excitement
- Keep your responses SHORT for voice — 1-2 sentences max before asking your follow-up
- Don't lecture, don't teach, don't summarize back to them excessively
- When the topic feels explored (usually 2-3 exchanges), wrap up naturally and say "Thank you, let's move on."
- Never break character. You are a human interviewer having a real conversation.
- Do NOT say "as an AI" or reference being artificial in any way.`;

    let firstMessage: string;
    if (responses.length === 0) {
      firstMessage = `Hey ${participant.name || "there"}, I'm Kascade calling from HMN — I'll be walking you through your assessment today. This is going to be a real conversation, not a survey. Ready to dive in? Here's what I want to start with: ${qText}`;
    } else {
      firstMessage = `Great, let's keep going. ${qText}`;
    }

    res.json({
      systemPrompt,
      firstMessage,
      questionId: (question as { id?: string }).id,
      inputType: (question as { inputType?: string }).inputType,
      isConversation: (question as { inputType?: string }).inputType === "ai_conversation",
    });
  } catch (err) {
    console.error("[VAPI Context] Error:", err);
    res.status(500).json({ error: "Failed to build voice context" });
  }
});

// --- Participant-facing: Request a phone call for voice assessment ---
app.post("/api/interview/request-call", async (req, res) => {
  try {
    // Check VAPI configuration before proceeding
    if (!process.env.VAPI_PRIVATE_KEY || !process.env.VAPI_PHONE_NUMBER_ID) {
      res.status(503).json({ error: "Voice calling is not configured. Please contact your administrator." });
      return;
    }

    const { sessionId, phone } = req.body;
    if (!sessionId || !phone) {
      res.status(400).json({ error: "sessionId and phone are required" });
      return;
    }

    const session = await loadSession(sessionId);
    if (!session) { res.status(404).json({ error: "Session not found" }); return; }

    const participant = session.participant as { name?: string; role?: string; company?: string; industry?: string; teamSize?: string };
    const { questions: bankQuestions } = await getAssessmentQuestionBank(session as unknown as Record<string, unknown>);

    const systemPrompt = buildOutboundSystemPrompt(participant, bankQuestions);
    const firstName = (participant.name || "there").split(" ")[0];

    const assistantConfig = {
      name: "Kascade - HMN Assessment",
      firstMessage: `Hey ${firstName}! This is Kascade calling from HMN. Thanks for making time for your assessment — I know you're busy. We've got about twenty to thirty minutes together, and I promise this won't feel like a survey. Think of it more like a strategic conversation about where you and your organization stand. Sound good?`,
      model: {
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        messages: [{ role: "system", content: systemPrompt }],
      },
      voice: {
        provider: "11labs",
        voiceId: "uju3wxzG5OhpWcoi3SMy",
        stability: 0.55,
        similarityBoost: 0.8,
        speed: 0.9,
      },
      serverUrl: VAPI_WEBHOOK_URL,
      silenceTimeoutSeconds: 45,
      maxDurationSeconds: 2400,
      backgroundDenoisingEnabled: true,
      modelOutputInMessagesEnabled: true,
      endCallMessage: "Thank you so much for your time and honesty today. Your responses are going to give us a really clear picture. Someone from HMN will be in touch soon with your personalized profile. Take care!",
    };

    // Normalize phone to E.164
    let normalizedPhone = phone.replace(/[\s\-\(\)\.]/g, "");
    if (!normalizedPhone.startsWith("+")) normalizedPhone = "+1" + normalizedPhone;

    const vapiRes = await fetch(VAPI_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.VAPI_PRIVATE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
        customer: { number: normalizedPhone },
        assistant: assistantConfig,
      }),
    });

    if (!vapiRes.ok) {
      const errBody = await vapiRes.text();
      console.error("[VAPI Participant Call] Error:", errBody);
      res.status(500).json({ error: "Failed to initiate call" });
      return;
    }

    const vapiData = await vapiRes.json() as { id: string };
    // Store call ID on session
    (session as unknown as Record<string, unknown>).vapiCallId = vapiData.id;
    (session as unknown as Record<string, unknown>).callPhone = normalizedPhone;
    (session as unknown as Record<string, unknown>).callStatus = "calling";
    saveSession(session as unknown as Record<string, unknown>);

    res.json({ success: true, vapiCallId: vapiData.id });
  } catch (err) {
    console.error("[Participant Call Request] Error:", err);
    res.status(500).json({ error: "Failed to initiate call" });
  }
});

// --- Analyze ---

app.post("/api/interview/analyze", async (req, res) => {
  try {
    const { sessionId } = req.body;
    const session = await loadSession(sessionId);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    if (session.responses.length < 5) {
      res.status(400).json({ error: "Not enough responses. Need at least 5." });
      return;
    }

    const assessmentTypeId = (session.assessmentTypeId as string) || "ai-readiness";

    if (assessmentTypeId === "adaptability-index") {
      // Run the adaptability-specific scoring engine
      const client = getAnthropicClient();
      const adaptAnalysis = await runAdaptabilityAnalysis(client, session);
      const participant = session.participant as { name: string; role: string; company: string; industry: string };
      const profile = await generateAdaptabilityProfile(client, adaptAnalysis, participant);
      session.analysis = { ...adaptAnalysis, profile } as unknown as Record<string, unknown>;
      session.adaptabilityAnalysis = adaptAnalysis;
    } else {
      // Load assessment-specific config for analysis prompt
      const { assessment } = await getAssessmentQuestionBank(session);
      const analysis = await runCascadeAnalysis(session, assessment);
      session.analysis = analysis;
    }

    session.status = "analyzed";
    await saveSession(session);

    // Notify admin dashboard + invalidate stats cache
    invalidateCache("stats:");
    const participant = session.participant as Record<string, unknown> | undefined;
    emitAdminEvent({
      type: "analysis_ready",
      data: { sessionId, name: participant?.name || "Unknown", company: participant?.company || "" },
      timestamp: new Date().toISOString(),
    });

    // Update linked invitation to completed
    try {
      const linkedInvitation = await findInvitationBySessionId(sessionId);
      if (linkedInvitation) {
        await updateInvitationStatus(linkedInvitation.token, "completed", {
          completed_at: new Date().toISOString(),
        });
      }
    } catch (invErr) {
      console.error("Failed to update invitation status:", invErr);
    }

    res.json({ analysis });
  } catch (err) {
    console.error("Analysis error:", err);
    res.status(500).json({ error: "Analysis failed" });
  }
});

// --- Adaptability Index Profile ---

app.get("/api/adaptability/profile/:sessionId", async (req, res) => {
  try {
    const session = await loadSession(req.params.sessionId);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    if (!session.analysis) {
      res.status(400).json({ error: "Session has not been analyzed yet" });
      return;
    }

    // Return the analysis and profile data
    // The profile is generated during analysis for adaptability-index assessments
    res.json({
      analysis: session.analysis,
      profile: session.analysis.profile || session.analysis,
    });
  } catch (err) {
    console.error("Profile fetch error:", err);
    res.status(500).json({ error: "Failed to load profile" });
  }
});

// --- Transcribe (Deepgram) ---

app.post("/api/transcribe", async (req, res) => {
  try {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", async () => {
      const audioBuffer = Buffer.concat(chunks);
      if (audioBuffer.length === 0) {
        res.status(400).json({ error: "Empty audio" });
        return;
      }
      const contentType = req.headers["content-type"] || "audio/webm";
      const result = await transcribeAudio(audioBuffer, contentType);
      res.json(result);
    });
  } catch (err) {
    console.error("Transcribe error:", err);
    res.status(500).json({ error: "Transcription failed" });
  }
});

app.post("/api/transcribe/form", express.raw({ type: "*/*", limit: "50mb" }), async (req, res) => {
  try {
    const audioBuffer = req.body as Buffer;
    if (!audioBuffer || audioBuffer.length === 0) {
      res.status(400).json({ error: "Empty audio" });
      return;
    }
    const result = await transcribeAudio(audioBuffer, "audio/webm");
    res.json(result);
  } catch (err) {
    console.error("Transcribe error:", err);
    res.status(500).json({ error: "Transcription failed" });
  }
});

// --- Deepgram token for client-side WebSocket streaming ---

app.get("/api/deepgram-token", (_req, res) => {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) {
    res.status(503).json({ error: "Voice transcription is not configured" });
    return;
  }
  res.json({ token: key });
});

// ============================================================
// AI FUNCTIONS
// ============================================================

function getResearchContext(session: Record<string, unknown>): string {
  const research = session.research as {
    status?: string;
    personProfile?: { bio?: string; knownRoles?: string[]; notableAchievements?: string[]; publicPresence?: string };
    companyProfile?: { description?: string; products?: string[]; recentNews?: string[] };
    keyInsights?: string[];
    interviewAngles?: string[];
  } | null;

  if (!research || research.status !== "found") return "";

  const parts: string[] = ["\nRESEARCH INTEL (from web diligence):"];
  if (research.personProfile?.bio) parts.push(`Person: ${research.personProfile.bio}`);
  if (research.personProfile?.knownRoles?.length) parts.push(`Known roles: ${research.personProfile.knownRoles.join(", ")}`);
  if (research.personProfile?.notableAchievements?.length) parts.push(`Achievements: ${research.personProfile.notableAchievements.join("; ")}`);
  if (research.companyProfile?.description) parts.push(`Company: ${research.companyProfile.description}`);
  if (research.companyProfile?.products?.length) parts.push(`Products: ${research.companyProfile.products.join(", ")}`);
  if (research.companyProfile?.recentNews?.length) parts.push(`Recent news: ${research.companyProfile.recentNews.join("; ")}`);
  if (research.keyInsights?.length) parts.push(`Key insights: ${research.keyInsights.join("; ")}`);
  if (research.interviewAngles?.length) parts.push(`Suggested angles: ${research.interviewAngles.join("; ")}`);

  return parts.join("\n");
}

/** Stream AI follow-up response via SSE, returning the full accumulated text */
async function streamFollowUp(
  sseRes: express.Response,
  session: Record<string, unknown>,
  currentQuestion: Record<string, unknown>,
  conversationHistory: Array<{ role: string; content: string }>,
  assessment?: Record<string, unknown> | null,
): Promise<string> {
  const client = getAnthropicClient();
  const participant = session.participant as { name: string; role: string; company: string; industry: string; teamSize: string };
  const responses = session.responses as Array<{ questionText: string; answer: unknown }>;
  const researchContext = getResearchContext(session);

  const recentResponses = responses.slice(-6);
  const contextSummary = recentResponses.length > 0
    ? recentResponses.map((r) => {
        const ans = typeof r.answer === "object" ? JSON.stringify(r.answer) : String(r.answer);
        return `Q: ${r.questionText}\nA: ${ans.length > 200 ? ans.slice(0, 200) + "..." : ans}`;
      }).join("\n\n")
    : "No prior responses yet.";

  const assessmentInterviewPrompt = assessment?.interviewSystemPrompt as string | undefined;
  const defaultInterviewRole = `YOUR ROLE:
- Warm, professional, genuinely curious
- Ask ONE follow-up at a time
- Dig deeper based on what they actually said
- Reference specific things you know about them/their company when relevant
- Keep responses concise (2-3 sentences before your follow-up)
- When this topic feels complete (usually 2-3 exchanges), say: [QUESTION_COMPLETE]
- Never break character. You are a human interviewer.
- Do NOT include internal annotations, bracketed notes, or markdown formatting.`;

  const systemPrompt = `${assessmentInterviewPrompt || `You are an expert interviewer for HMN (Human Machine Network), conducting an AI readiness assessment.`}

PARTICIPANT: ${participant.name}, ${participant.role} at ${participant.company} (${participant.industry}, team size: ${participant.teamSize})
${researchContext}

PRIOR RESPONSES:
${contextSummary}

CURRENT QUESTION: ${currentQuestion.section} / ${currentQuestion.phase}
SCORING: ${(currentQuestion.scoringDimensions as string[])?.join(", ") || "general"}

${currentQuestion.aiFollowUpPrompt ? `FOLLOW-UP GUIDANCE:\n${currentQuestion.aiFollowUpPrompt}` : ""}

${assessmentInterviewPrompt ? "" : defaultInterviewRole}`;

  const messages = conversationHistory
    .filter((m) => m.role !== "system")
    .slice(-10)
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content.length > 2000 ? m.content.slice(0, 2000) + "..." : m.content,
    }));

  let fullText = "";

  try {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 500,
      system: systemPrompt,
      messages,
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && (event.delta as { type: string; text?: string }).type === "text_delta") {
        const text = (event.delta as { text: string }).text;
        fullText += text;
        // Strip [QUESTION_COMPLETE] and annotations from streamed tokens
        const cleanToken = text.replace("[QUESTION_COMPLETE]", "").replace(/\*\*\[.*?\]\*\*/g, "");
        if (cleanToken) {
          sseRes.write(`data: ${JSON.stringify({ type: "token", text: cleanToken })}\n\n`);
        }
      }
    }
  } catch (err) {
    console.error("[STREAM] Follow-up streaming error:", err);
    if (!fullText) {
      fullText = "I appreciate you sharing that. Could you tell me more about your experience? [QUESTION_COMPLETE]";
      sseRes.write(`data: ${JSON.stringify({ type: "token", text: fullText.replace("[QUESTION_COMPLETE]", "") })}\n\n`);
    }
  }

  return fullText;
}

async function generateFollowUp(
  session: Record<string, unknown>,
  currentQuestion: Record<string, unknown>,
  conversationHistory: Array<{ role: string; content: string }>,
  assessment?: Record<string, unknown> | null,
) {
  const client = getAnthropicClient();
  const participant = session.participant as { name: string; role: string; company: string; industry: string; teamSize: string };
  const responses = session.responses as Array<{ questionText: string; answer: unknown }>;
  const researchContext = getResearchContext(session);

  // Compact prior context: last 6 responses, truncate long answers
  const recentResponses = responses.slice(-6);
  const contextSummary = recentResponses.length > 0
    ? recentResponses.map((r) => {
        const ans = typeof r.answer === "object" ? JSON.stringify(r.answer) : String(r.answer);
        return `Q: ${r.questionText}\nA: ${ans.length > 200 ? ans.slice(0, 200) + "..." : ans}`;
      }).join("\n\n")
    : "No prior responses yet.";

  // Use assessment-specific interview prompt if available, otherwise default
  const assessmentInterviewPrompt = assessment?.interviewSystemPrompt as string | undefined;

  const defaultInterviewRole = `YOUR ROLE:
- Warm, professional, genuinely curious
- Ask ONE follow-up at a time
- Dig deeper based on what they actually said
- Reference specific things you know about them/their company when relevant
- Keep responses concise (2-3 sentences before your follow-up)
- When this topic feels complete (usually 2-3 exchanges), say: [QUESTION_COMPLETE]
- Never break character. You are a human interviewer.
- Do NOT include internal annotations, bracketed notes, or markdown formatting.`;

  const systemPrompt = `${assessmentInterviewPrompt || `You are an expert interviewer for HMN (Human Machine Network), conducting an AI readiness assessment.`}

PARTICIPANT: ${participant.name}, ${participant.role} at ${participant.company} (${participant.industry}, team size: ${participant.teamSize})
${researchContext}

PRIOR RESPONSES:
${contextSummary}

CURRENT QUESTION: ${currentQuestion.section} / ${currentQuestion.phase}
SCORING: ${(currentQuestion.scoringDimensions as string[])?.join(", ") || "general"}

${currentQuestion.aiFollowUpPrompt ? `FOLLOW-UP GUIDANCE:\n${currentQuestion.aiFollowUpPrompt}` : ""}

${assessmentInterviewPrompt ? "" : defaultInterviewRole}`;

  // Limit conversation messages to last 10 (5 exchanges) to prevent token bloat
  const messages = conversationHistory
    .filter((m) => m.role !== "system")
    .slice(-10)
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content.length > 2000 ? m.content.slice(0, 2000) + "..." : m.content,
    }));

  // Token estimation guard: ~4 chars per token
  const estimatedTokens = Math.ceil((systemPrompt.length + messages.reduce((s, m) => s + m.content.length, 0)) / 4);
  console.log(`[FOLLOW-UP] Estimated tokens: ${estimatedTokens} (system: ${systemPrompt.length} chars, messages: ${messages.length}, responses in context: ${recentResponses.length})`);

  if (estimatedTokens > 150000) {
    console.warn(`[FOLLOW-UP] Token estimate ${estimatedTokens} exceeds 150K — truncating aggressively`);
    // Nuclear fallback: strip prior responses and limit messages
    const minimalSystem = `${assessmentInterviewPrompt || "You are an expert interviewer for HMN."}\n\nPARTICIPANT: ${participant.name}, ${participant.role} at ${participant.company}\n\n${assessmentInterviewPrompt ? "" : defaultInterviewRole}`;
    const minimalMessages = messages.slice(-4).map((m) => ({ ...m, content: m.content.slice(0, 500) }));
    const response = await client.messages.create({ model: MODEL, max_tokens: 500, system: minimalSystem, messages: minimalMessages });
    return response.content[0].type === "text" ? response.content[0].text : "";
  }

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 500,
    system: systemPrompt,
    messages,
  });

  return response.content[0].type === "text" ? response.content[0].text : "";
}

async function analyzeResponseConfidence(
  answer: string,
  questionContext: string,
  priorResponses: Array<{ questionText: string; answer: unknown }>
) {
  const client = getAnthropicClient();
  const priorContext = priorResponses.slice(-5).map((r) => `Q: ${r.questionText}\nA: ${typeof r.answer === "object" ? JSON.stringify(r.answer) : r.answer}`).join("\n");

  const response = await client.messages.create({
    model: MODEL_FAST,
    max_tokens: 200,
    system: "You analyze interview responses. Return ONLY valid JSON with no other text.",
    messages: [
      {
        role: "user",
        content: `Analyze this interview response (each 0.0 to 1.0):

QUESTION: ${questionContext}
ANSWER: ${answer}

PRIOR CONTEXT:
${priorContext}

Rate:
1. specificity (0=vague, 1=specific names/numbers/tools)
2. emotionalCharge (0=flat, 1=passionate)
3. consistency (0=contradicts prior, 1=fully consistent)

Return JSON: {"specificity": 0.0, "emotionalCharge": 0.0, "consistency": 0.0}`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "{}";
  try {
    const parsed = JSON.parse(text);
    return {
      specificity: Math.min(1, Math.max(0, parsed.specificity ?? 0.5)),
      emotionalCharge: Math.min(1, Math.max(0, parsed.emotionalCharge ?? 0.5)),
      consistency: Math.min(1, Math.max(0, parsed.consistency ?? 0.5)),
    };
  } catch {
    return { specificity: 0.5, emotionalCharge: 0.5, consistency: 0.5 };
  }
}

async function selectNextQuestion(
  availableQuestions: Array<Record<string, unknown>>,
  session: Record<string, unknown>
) {
  const client = getAnthropicClient();
  const responses = session.responses as Array<{ questionId: string; questionText: string; answer: unknown; confidenceIndicators: { specificity: number }; autoPopulated?: boolean }>;
  const deductionContext = buildDeductionContext(session);

  // Only show non-auto-populated responses as prior context
  const humanResponses = responses.filter((r) => !r.autoPopulated);
  const priorSummary = humanResponses.slice(-5).map((r) => `[${r.questionId}] ${r.questionText} → ${typeof r.answer === "object" ? JSON.stringify(r.answer) : r.answer} (specificity: ${r.confidenceIndicators.specificity.toFixed(1)})`).join("\n");
  const availableList = availableQuestions.map((q) => `- ${q.id}: "${q.text}" [${q.section}, weight: ${q.weight}, type: ${q.inputType}]`).join("\n");

  const response = await client.messages.create({
    model: MODEL_FAST,
    max_tokens: 500,
    system: `You are an expert interview question selector for HMN Cascade AI Readiness Assessment.

${deductionContext}

YOUR TASK:
Select the single best next question from the available list. You MUST:
1. NEVER pick a question whose answer is already known or easily deduced from the facts above.
2. ADAPT the question text to reference specific things you know (company name, products, industry context).
3. Prioritize high-weight questions that reveal genuine insight.
4. Consider conversational flow — what naturally follows from their prior answers?
5. For small companies with founder/CEO, skip bureaucratic/governance questions.

Return ONLY valid JSON: {"questionId": "id", "reason": "why this question next", "adaptedText": "personalized question text referencing their specific context"}`,
    messages: [
      { role: "user", content: `PRIOR ANSWERS:\n${priorSummary || "(Starting interview — no answers yet)"}\n\nAVAILABLE QUESTIONS:\n${availableList}\n\nSelect the best next question and personalize it.` },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "{}";
  try {
    return JSON.parse(text);
  } catch {
    return { questionId: availableQuestions[0].id, reason: "Default selection" };
  }
}

async function runCascadeAnalysis(session: Record<string, unknown>, assessment?: Record<string, unknown> | null) {
  const client = getAnthropicClient();
  const participant = session.participant as { name: string; role: string; company: string; industry: string; teamSize: string };
  const responses = session.responses as Array<{
    questionId: string; questionText: string; answer: unknown;
    aiFollowUps?: Array<{ question: string; answer: string }>;
    confidenceIndicators: { specificity: number; emotionalCharge: number; consistency: number };
  }>;
  const researchContext = getResearchContext(session);

  const allResponses = responses
    .filter((r) => !(r as Record<string, unknown>).skipped)
    .map((r) => {
    let answerText = typeof r.answer === "object" ? JSON.stringify(r.answer) : String(r.answer);
    if (r.aiFollowUps?.length) {
      answerText += "\n  Follow-ups:\n" + r.aiFollowUps.map((f) => `  Q: ${f.question}\n  A: ${f.answer}`).join("\n");
    }
    return `[${r.questionId}] Q: ${r.questionText}\nA: ${answerText}\nConfidence: spec=${r.confidenceIndicators.specificity.toFixed(2)}, emo=${r.confidenceIndicators.emotionalCharge.toFixed(2)}, cons=${r.confidenceIndicators.consistency.toFixed(2)}`;
  }).join("\n\n---\n\n");

  // Use assessment-specific analysis prompt if available, otherwise default
  const assessmentAnalysisPrompt = assessment?.analysisSystemPrompt as string | undefined;

  const defaultAnalysisPrompt = `You are an expert AI readiness analyst for HMN. Analyze the interview and return comprehensive JSON.

PARTICIPANT: ${participant.name}, ${participant.role} at ${participant.company} (${participant.industry}, team: ${participant.teamSize})
${researchContext}

Return ONLY valid JSON:
{
  "overallReadinessScore": <0-100>,
  "dimensionScores": [{"dimension": "<name>", "score": <0-100>, "confidence": <0-1>, "evidence": ["..."], "flags": [{"type": "red_flag|green_light|contradiction|gap|opportunity", "description": "...", "severity": "low|medium|high"}]}],
  "archetype": "<the_visionary|the_operator|the_champion|the_skeptic|the_delegator|the_explorer|the_coach|the_pragmatist>",
  "archetypeConfidence": <0-1>,
  "archetypeDescription": "...",
  "gaps": [{"pattern": "<gap_pattern>", "severity": <0-100>, "dimension1": "<dim>", "dimension2": "<dim>", "description": "...", "serviceRecommendation": "..."}],
  "redFlags": [{"type": "red_flag", "description": "...", "severity": "low|medium|high"}],
  "greenLights": [{"type": "green_light", "description": "...", "severity": "low|medium|high"}],
  "contradictions": [],
  "executiveSummary": "2-3 paragraphs",
  "detailedNarrative": "full analysis",
  "serviceRecommendations": [{"tier": 1|2|3, "service": "...", "description": "...", "estimatedValue": "$X-$Y", "urgency": "immediate|near_term|strategic", "matchedGaps": [], "confidence": <0-1>}],
  "prioritizedActions": [{"rank": 1, "action": "...", "rationale": "...", "timeframe": "...", "estimatedImpact": "low|medium|high|transformative"}],
  "triggeredDeepDives": [{"module": "shadow_workflow|decision_latency|adoption_archaeology|competitive_pressure|team_assessment", "reason": "...", "priority": <1-5>, "suggestedQuestions": ["..."]}]
}`;

  const systemPrompt = assessmentAnalysisPrompt
    ? `${assessmentAnalysisPrompt}

PARTICIPANT: ${participant.name}, ${participant.role} at ${participant.company} (${participant.industry}, team: ${participant.teamSize})
${researchContext}

Return ONLY valid JSON with: overallReadinessScore, dimensionScores, archetype, archetypeConfidence, archetypeDescription, gaps, redFlags, greenLights, contradictions, executiveSummary, detailedNarrative, serviceRecommendations, prioritizedActions, triggeredDeepDives.`
    : defaultAnalysisPrompt;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: systemPrompt,
    messages: [{ role: "user", content: `Analyze:\n\n${allResponses}` }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "{}";
  try {
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return {
      overallReadinessScore: 50, dimensionScores: [],
      archetype: "the_explorer", archetypeConfidence: 0.3,
      archetypeDescription: "Analysis requires manual review.",
      gaps: [], redFlags: [], greenLights: [], contradictions: [],
      executiveSummary: "Automated analysis could not complete. Manual review required.",
      detailedNarrative: "", serviceRecommendations: [], prioritizedActions: [], triggeredDeepDives: [],
    };
  }
}

async function transcribeAudio(audioBuffer: Buffer, mimeType: string) {
  const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY!;
  const response = await fetch(
    `https://api.deepgram.com/v1/listen?` + new URLSearchParams({ model: "nova-3", smart_format: "true", punctuate: "true", language: "en" }),
    {
      method: "POST",
      headers: { Authorization: `Token ${DEEPGRAM_API_KEY}`, "Content-Type": mimeType },
      body: new Uint8Array(audioBuffer),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Deepgram error (${response.status}): ${err}`);
  }

  const data = await response.json();
  const result = data.results?.channels?.[0]?.alternatives?.[0];
  return {
    transcript: result?.transcript || "",
    confidence: result?.confidence || 0,
    durationSeconds: data.metadata?.duration || 0,
    words: (result?.words || []).map((w: { word: string; start: number; end: number; confidence: number }) => ({
      word: w.word, start: w.start, end: w.end, confidence: w.confidence,
    })),
  };
}

// ============================================================
// ADMIN AUTH
// ============================================================

function verifyAdminToken(req: express.Request): boolean {
  const token = (req as unknown as { cookies: Record<string, string> }).cookies?.admin_token;
  if (!token) return false;
  try {
    jwt.verify(token, JWT_SECRET);
    return true;
  } catch {
    return false;
  }
}

function verifyApiKey(req: express.Request): boolean {
  const apiKey = req.headers["x-api-key"] as string | undefined;
  return !!apiKey && apiKey === process.env.CASCADE_API_KEY;
}

function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  // Accept either cookie-based admin auth OR API key auth (for server-to-server)
  if (verifyAdminToken(req) || verifyApiKey(req)) {
    next();
    return;
  }
  res.status(401).json({ error: "Unauthorized" });
}

// Simple in-memory rate limiter for login
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

app.post("/api/admin/login", (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const entry = loginAttempts.get(ip);

  if (entry && now < entry.resetAt) {
    if (entry.count >= 5) {
      res.status(429).json({ error: "Too many login attempts. Try again later." });
      return;
    }
    entry.count++;
  } else {
    loginAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
  }

  const { password } = req.body;
  if (password !== ADMIN_PASSWORD) {
    res.status(401).json({ error: "Invalid password" });
    return;
  }

  // Reset on successful login
  loginAttempts.delete(ip);

  const token = jwt.sign({ role: "admin" }, JWT_SECRET, { expiresIn: "24h" });
  res.cookie("admin_token", token, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: "lax",
    maxAge: 24 * 60 * 60 * 1000,
  });
  res.json({ ok: true });
});

app.get("/api/admin/verify", (req, res) => {
  if (verifyAdminToken(req)) {
    res.json({ valid: true });
  } else {
    res.status(401).json({ valid: false });
  }
});

app.post("/api/admin/logout", (_req, res) => {
  res.clearCookie("admin_token");
  res.json({ ok: true });
});

// ============================================================
// ADMIN SSE — Real-time event stream
// ============================================================

app.get("/api/admin/events", requireAdmin, (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write("data: {\"type\":\"connected\"}\n\n");
  addSSEClient(res);

  // Heartbeat every 30s to keep connection alive
  const heartbeat = setInterval(() => {
    try { res.write(": heartbeat\n\n"); } catch { clearInterval(heartbeat); }
  }, 30000);
  req.on("close", () => clearInterval(heartbeat));
});

// ============================================================
// ADMIN REST API (data endpoints for dashboard)
// ============================================================

app.get("/api/admin/stats", requireAdmin, async (req, res) => {
  try {
    const filters = extractDashboardFilters(req.query as Record<string, unknown>);
    const cacheKey = `stats:${JSON.stringify(filters)}`;
    const cached = getCached(cacheKey);
    if (cached) { res.json(cached); return; }
    const data = await getStatsAdmin(filters);
    setCache(cacheKey, data, 30_000); // 30s TTL
    res.json(data);
  } catch (err) { console.error("Admin stats error:", err); res.status(500).json({ error: "Failed to get stats" }); }
});

app.get("/api/admin/sessions", requireAdmin, async (req, res) => {
  try {
    const { since, status, assessmentTypeId, company, page, limit } = req.query as Record<string, string>;

    // If pagination params provided, use paginated query (new path)
    if (page || limit) {
      const result = await listSessionsPaginated({
        page: page ? parseInt(page) : 1,
        limit: limit ? parseInt(limit) : 50,
        since, status, assessmentTypeId, company,
      });
      res.json(result);
      return;
    }

    // Legacy: return all sessions (backward-compatible for dashboard etc.)
    const filters: { since?: string; status?: string; assessmentTypeId?: string } = {};
    if (since) filters.since = since;
    if (status) filters.status = status;
    if (assessmentTypeId) filters.assessmentTypeId = assessmentTypeId;
    res.json({ sessions: await listSessionsAdmin(Object.keys(filters).length > 0 ? filters : undefined) });
  } catch (err) { console.error("Admin sessions error:", err); res.status(500).json({ error: "Failed to list sessions" }); }
});

app.get("/api/admin/sessions/:id", requireAdmin, async (req, res) => {
  try {
    const session = await getSessionAdmin(String(req.params.id));
    if (!session) { res.status(404).json({ error: "Session not found" }); return; }
    res.json({ session });
  } catch (err) { console.error("Admin session error:", err); res.status(500).json({ error: "Failed to get session" }); }
});

app.delete("/api/admin/sessions/:id", requireAdmin, async (req, res) => {
  try {
    const result = await deleteSessionAdmin(String(req.params.id));
    if (!result.ok) { res.status(404).json({ error: "Session not found" }); return; }
    res.json({ ok: true });
  } catch (err) { console.error("Admin delete session error:", err); res.status(500).json({ error: "Failed to delete session" }); }
});

app.delete("/api/admin/companies/:name", requireAdmin, async (req, res) => {
  try {
    const companyName = decodeURIComponent(String(req.params.name));
    const allSessions = await listAllSessions();
    const companySessions = allSessions.filter(
      (s) => (s.participant?.company ?? "").trim() === companyName
    );
    if (companySessions.length === 0) {
      res.status(404).json({ error: "Company not found or no sessions" });
      return;
    }
    let deleted = 0;
    for (const s of companySessions) {
      const ok = await deleteSessionFromDb(s.id);
      if (ok) deleted++;
    }
    res.json({ ok: true, deletedSessions: deleted });
  } catch (err) {
    console.error("Admin delete company error:", err);
    res.status(500).json({ error: "Failed to delete company sessions" });
  }
});

app.get("/api/admin/assessments", requireAdmin, async (_req, res) => {
  try {
    const cacheKey = "assessments:list";
    const cached = getCached(cacheKey);
    if (cached) { res.json(cached); return; }
    const data = { assessments: await listAssessmentsAdmin() };
    setCache(cacheKey, data, 60_000); // 60s TTL
    res.json(data);
  } catch (err) { console.error("Admin assessments error:", err); res.status(500).json({ error: "Failed to list assessments" }); }
});

app.get("/api/admin/assessments/:id", requireAdmin, async (req, res) => {
  try {
    const assessment = await getAssessmentAdmin(String(req.params.id));
    if (!assessment) { res.status(404).json({ error: "Assessment not found" }); return; }
    res.json({ assessment });
  } catch (err) { console.error("Admin assessment error:", err); res.status(500).json({ error: "Failed to get assessment" }); }
});

app.post("/api/admin/assessments", requireAdmin, async (req, res) => {
  try {
    const { config } = req.body;
    if (!config?.id || !config?.name) { res.status(400).json({ error: "config with id and name required" }); return; }
    const result = await createAssessmentAdmin(config);
    invalidateCache("assessments:");
    res.status(201).json(result);
  } catch (err) { console.error("Admin create assessment error:", err); res.status(500).json({ error: "Failed to create assessment" }); }
});

app.put("/api/admin/assessments/:id", requireAdmin, async (req, res) => {
  try {
    const { changes } = req.body;
    if (!changes) { res.status(400).json({ error: "changes object required" }); return; }
    const result = await updateAssessmentAdmin(String(req.params.id), changes);
    if (!result.ok) { res.status(404).json({ error: "Assessment not found" }); return; }
    invalidateCache("assessments:");
    res.json({ ok: true });
  } catch (err) { console.error("Admin update assessment error:", err); res.status(500).json({ error: "Failed to update assessment" }); }
});

app.post("/api/admin/assessments/:id/duplicate", requireAdmin, async (req, res) => {
  try {
    const { newId, newName } = req.body;
    if (!newId || !newName) { res.status(400).json({ error: "newId and newName required" }); return; }
    const result = await duplicateAssessmentAdmin(String(req.params.id), newId, newName);
    if (!result.ok) { res.status(404).json({ error: "Source assessment not found" }); return; }
    res.status(201).json(result);
  } catch (err) { console.error("Admin duplicate assessment error:", err); res.status(500).json({ error: "Failed to duplicate assessment" }); }
});

app.post("/api/admin/assessments/:id/status", requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    if (!["draft", "active", "archived"].includes(status)) { res.status(400).json({ error: "Invalid status" }); return; }
    const result = await updateAssessmentAdmin(String(req.params.id), { status });
    if (!result.ok) { res.status(404).json({ error: "Assessment not found" }); return; }
    res.json({ ok: true });
  } catch (err) { console.error("Admin status update error:", err); res.status(500).json({ error: "Failed to update status" }); }
});

app.get("/api/admin/funnel", requireAdmin, async (req, res) => {
  try {
    const filters = extractDashboardFilters(req.query as Record<string, unknown>);
    res.json({ funnel: await getCompletionFunnelAdmin(filters) });
  } catch (err) { console.error("Admin funnel error:", err); res.status(500).json({ error: "Failed to get funnel" }); }
});

app.get("/api/admin/dimensions", requireAdmin, async (req, res) => {
  try {
    const filters = extractDashboardFilters(req.query as Record<string, unknown>);
    res.json({ dimensions: await getDimensionAveragesAdmin(filters) });
  } catch (err) { console.error("Admin dimensions error:", err); res.status(500).json({ error: "Failed to get dimensions" }); }
});

// --- Adaptability Calibration ---

// Trigger a calibration run (re-scores a sample of sessions and computes agreement)
app.post("/api/admin/calibration/run", requireAdmin, async (req, res) => {
  try {
    const maxSessions = Math.min(Number(req.body.maxSessions) || 10, 50);
    const client = getAnthropicClient();

    // Load completed adaptability-index sessions
    const allSessions = await listAllSessions();
    const adaptSessions = allSessions
      .filter((s: Record<string, unknown>) =>
        s.assessmentTypeId === "adaptability-index" &&
        s.status === "analyzed" &&
        s.analysis
      )
      .slice(0, maxSessions);

    if (adaptSessions.length === 0) {
      res.json({ error: "No analyzed adaptability sessions found", report: null });
      return;
    }

    // Dual-score each session: pass1 = stored, pass2 = fresh re-score
    const pairs: { sessionId: string; pass1: Record<string, number>; pass2: Record<string, number> }[] = [];

    for (const session of adaptSessions) {
      try {
        const pass1Scores = extractAllMarkerScores(session.analysis as Record<string, unknown>);
        const pass2Analysis = await runAdaptabilityAnalysis(client, session as Record<string, unknown>);
        const pass2Scores = extractAllMarkerScores(pass2Analysis as unknown as Record<string, unknown>);
        pairs.push({ sessionId: session.id as string, pass1: pass1Scores, pass2: pass2Scores });
      } catch (err) {
        console.error(`Calibration scoring failed for session ${session.id}:`, err);
      }
    }

    if (pairs.length === 0) {
      res.json({ error: "All re-scoring attempts failed", report: null });
      return;
    }

    // Compute agreement metrics
    const allMarkers = Object.keys(pairs[0].pass1);
    const markerAgreement: Record<string, { kappa: number; weightedKappa: number; exactAgreement: number; withinOneAgreement: number; n: number }> = {};

    for (const marker of allMarkers) {
      const r1 = pairs.map((p) => p.pass1[marker] ?? 0);
      const r2 = pairs.map((p) => p.pass2[marker] ?? 0);
      const exact = r1.filter((v, i) => v === r2[i]).length / r1.length;
      const withinOne = r1.filter((v, i) => Math.abs(v - r2[i]) <= 1).length / r1.length;
      markerAgreement[marker] = {
        kappa: computeKappa(r1, r2),
        weightedKappa: computeWeightedKappa(r1, r2),
        exactAgreement: Math.round(exact * 100),
        withinOneAgreement: Math.round(withinOne * 100),
        n: r1.length,
      };
    }

    // Overall
    const allR1 = allMarkers.flatMap((m) => pairs.map((p) => p.pass1[m] ?? 0));
    const allR2 = allMarkers.flatMap((m) => pairs.map((p) => p.pass2[m] ?? 0));
    const overallKappa = computeKappa(allR1, allR2);
    const overallWeighted = computeWeightedKappa(allR1, allR2);

    const report = {
      runDate: new Date().toISOString(),
      sessionCount: pairs.length,
      sessionIds: pairs.map((p) => p.sessionId),
      markerAgreement,
      overallAgreement: {
        kappa: overallKappa,
        weightedKappa: overallWeighted,
        passesThreshold: overallWeighted >= 0.7,
      },
      driftIndicators: {
        markersBelow07: allMarkers.filter((m) => markerAgreement[m].weightedKappa < 0.7),
        markersBelow05: allMarkers.filter((m) => markerAgreement[m].weightedKappa < 0.5),
      },
    };

    res.json({ report });
  } catch (err) {
    console.error("Calibration run error:", err);
    res.status(500).json({ error: "Calibration run failed" });
  }
});

// Helper: extract all marker scores from an analysis object
function extractAllMarkerScores(analysis: Record<string, unknown>): Record<string, number> {
  const scores: Record<string, number> = {};
  const pillars = [
    { key: "pillar1", codes: ["1A", "1B", "1C", "1D"] },
    { key: "pillar2", codes: ["2A", "2B", "2C", "2D"] },
    { key: "pillar3", codes: ["3A", "3B", "3C", "3D"] },
    { key: "pillar4", codes: ["4A", "4B", "4C", "4D"] },
  ];
  for (const p of pillars) {
    const pillarData = analysis[p.key] as Record<string, unknown> | undefined;
    const markers = pillarData?.markers as Record<string, { score: number }> | undefined;
    if (markers) {
      for (const code of p.codes) {
        scores[code] = markers[code]?.score ?? 0;
      }
    }
  }
  // Process markers
  const proc = analysis.processScores as Record<string, Record<string, { score: number }>> | undefined;
  if (proc) {
    for (const [, pillarProc] of Object.entries(proc)) {
      for (const [code, marker] of Object.entries(pillarProc)) {
        scores[code] = marker?.score ?? 0;
      }
    }
  }
  return scores;
}

// Cohen's kappa (unweighted)
function computeKappa(r1: number[], r2: number[]): number {
  if (r1.length === 0) return 0;
  const categories = [...new Set([...r1, ...r2])].sort();
  if (categories.length <= 1) return 1;
  const n = r1.length;
  const matrix: Record<string, Record<string, number>> = {};
  for (const c1 of categories) {
    matrix[c1] = {};
    for (const c2 of categories) matrix[c1][c2] = 0;
  }
  for (let i = 0; i < n; i++) matrix[r1[i]][r2[i]]++;
  const po = categories.reduce((sum, c) => sum + matrix[c][c], 0) / n;
  const pe = categories.reduce((sum, c) => {
    const row = categories.reduce((s, c2) => s + matrix[c][c2], 0) / n;
    const col = categories.reduce((s, c2) => s + matrix[c2][c], 0) / n;
    return sum + row * col;
  }, 0);
  return pe >= 1 ? 1 : (po - pe) / (1 - pe);
}

// Weighted kappa (quadratic weights)
function computeWeightedKappa(r1: number[], r2: number[]): number {
  if (r1.length === 0) return 0;
  const categories = [...new Set([...r1, ...r2])].sort();
  if (categories.length <= 1) return 1;
  const k = categories.length;
  const n = r1.length;
  const catIdx: Record<number, number> = {};
  categories.forEach((c, i) => (catIdx[c] = i));
  const obs: number[][] = Array.from({ length: k }, () => Array(k).fill(0));
  for (let i = 0; i < n; i++) obs[catIdx[r1[i]]][catIdx[r2[i]]]++;
  const rowSums = obs.map((row) => row.reduce((a, b) => a + b, 0));
  const colSums = Array.from({ length: k }, (_, j) => obs.reduce((a, row) => a + row[j], 0));
  let wo = 0, we = 0;
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      const w = 1 - ((i - j) * (i - j)) / ((k - 1) * (k - 1));
      wo += w * (obs[i][j] / n);
      we += w * ((rowSums[i] * colSums[j]) / (n * n));
    }
  }
  return we >= 1 ? 1 : (wo - we) / (1 - we);
}

// Company CRM endpoints
app.get("/api/admin/companies", requireAdmin, async (req, res) => {
  try {
    const filters = extractDashboardFilters(req.query as Record<string, unknown>);
    const companies = await listCompaniesAdmin(filters);
    res.json({ companies });
  } catch (err) {
    console.error("Admin companies error:", err);
    res.status(500).json({ error: "Failed to list companies" });
  }
});

app.get("/api/admin/companies/:company", requireAdmin, async (req, res) => {
  try {
    const companyName = decodeURIComponent(String(req.params.company));
    const detail = await getCompanyDetailAdmin(companyName);
    if (!detail) { res.status(404).json({ error: "Company not found" }); return; }
    res.json({ company: detail });
  } catch (err) {
    console.error("Admin company detail error:", err);
    res.status(500).json({ error: "Failed to get company detail" });
  }
});

app.post("/api/admin/sessions/:id/research", requireAdmin, async (req, res) => {
  try {
    const sessionId = sanitizeId(String(req.params.id));
    const session = await getSessionAdmin(sessionId);
    if (!session) { res.status(404).json({ error: "Session not found" }); return; }
    // If already researched, return cached
    if ((session as unknown as Record<string, unknown>).research) {
      res.json({ research: (session as unknown as Record<string, unknown>).research });
      return;
    }
    // Trigger research
    const research = await researchPerson(session as unknown as Record<string, unknown>);
    (session as unknown as Record<string, unknown>).research = research;
    await saveSession(session as unknown as Record<string, unknown>);
    res.json({ research });
  } catch (err) {
    console.error("Admin trigger research error:", err);
    res.status(500).json({ error: "Research failed" });
  }
});

// ============================================================
// ADMIN INVITATION ENDPOINTS
// ============================================================

app.get("/api/admin/invitations", requireAdmin, async (req, res) => {
  try {
    const filters: { status?: string; assessmentId?: string } = {};
    if (req.query.status) filters.status = req.query.status as string;
    if (req.query.assessmentId) filters.assessmentId = req.query.assessmentId as string;
    const invitations = await listInvitationsAdmin(filters);
    res.json({ invitations });
  } catch (err) {
    console.error("Admin invitations error:", err);
    res.status(500).json({ error: "Failed to list invitations" });
  }
});

app.post("/api/admin/invitations", requireAdmin, async (req, res) => {
  try {
    const { assessmentId, participant, note, sendEmail } = req.body;
    if (!assessmentId || !participant?.name || !participant?.email) {
      res.status(400).json({ error: "assessmentId, participant.name, and participant.email are required" });
      return;
    }
    const result = await createInvitationAdmin({ assessmentId, participant, note });

    let emailResult: { ok: boolean; error?: string } | undefined;
    console.log(`[EMAIL] sendEmail=${sendEmail}, isEmailEnabled=${isEmailEnabled()}`);
    if (sendEmail && isEmailEnabled()) {
      const assessmentName = await getAssessmentName(assessmentId);
      console.log(`[EMAIL] Sending to ${participant.email} for "${assessmentName}" token=${result.invitation.token}`);
      emailResult = await sendInvitationEmail({
        to: participant.email,
        participantName: participant.name,
        assessmentName,
        inviteToken: result.invitation.token,
        note,
      });
      console.log(`[EMAIL] Result:`, JSON.stringify(emailResult));
    } else {
      console.log(`[EMAIL] Skipped — sendEmail=${sendEmail}, enabled=${isEmailEnabled()}`);
    }

    res.status(201).json({ ...result, emailSent: emailResult?.ok ?? false, emailError: emailResult?.error });
  } catch (err) {
    console.error("Admin create invitation error:", err);
    res.status(500).json({ error: "Failed to create invitation" });
  }
});

app.post("/api/admin/invitations/batch", requireAdmin, async (req, res) => {
  try {
    const { invitations, sendEmail } = req.body;
    if (!Array.isArray(invitations) || invitations.length === 0) {
      res.status(400).json({ error: "invitations array required" });
      return;
    }
    const result = await batchCreateInvitationsAdmin(invitations);

    let emailSummary: { sent: number; failed: number; errors: Array<{ email: string; error: string }> } | undefined;
    if (sendEmail && isEmailEnabled() && result.invitations.length > 0) {
      const assessmentName = await getAssessmentName(invitations[0].assessmentId);
      emailSummary = await sendBatchInvitationEmails(
        result.invitations.map((inv: any, i: number) => ({
          to: invitations[i].participant.email,
          participantName: invitations[i].participant.name,
          assessmentName,
          inviteToken: inv.token,
          note: invitations[i].note,
        }))
      );
    }

    res.status(201).json({ ...result, emailSummary });
  } catch (err) {
    console.error("Admin batch invitations error:", err);
    res.status(500).json({ error: "Failed to create invitations" });
  }
});

app.get("/api/admin/invitations/:id", requireAdmin, async (req, res) => {
  try {
    const invitation = await getInvitationAdmin(String(req.params.id));
    if (!invitation) { res.status(404).json({ error: "Invitation not found" }); return; }
    res.json({ invitation });
  } catch (err) {
    console.error("Admin get invitation error:", err);
    res.status(500).json({ error: "Failed to get invitation" });
  }
});

app.delete("/api/admin/invitations/:id", requireAdmin, async (req, res) => {
  try {
    const result = await deleteInvitationAdmin(String(req.params.id));
    if (!result.ok) { res.status(404).json({ error: "Invitation not found" }); return; }
    res.json({ ok: true });
  } catch (err) {
    console.error("Admin delete invitation error:", err);
    res.status(500).json({ error: "Failed to delete invitation" });
  }
});

app.post("/api/admin/invitations/:id/resend", requireAdmin, async (req, res) => {
  try {
    const inv = await loadInvitationById(String(req.params.id));
    if (!inv) { res.status(404).json({ error: "Invitation not found" }); return; }

    let emailResult: { ok: boolean; error?: string } = { ok: false, error: "Email not configured" };
    console.log(`[EMAIL-RESEND] isEmailEnabled=${isEmailEnabled()}, to=${inv.participant.email}`);
    if (isEmailEnabled()) {
      const assessmentName = await getAssessmentName(inv.assessmentId);
      console.log(`[EMAIL-RESEND] Sending to ${inv.participant.email} for "${assessmentName}"`);
      emailResult = await sendInvitationEmail({
        to: inv.participant.email,
        participantName: inv.participant.name,
        assessmentName,
        inviteToken: inv.token,
      });
      console.log(`[EMAIL-RESEND] Result:`, JSON.stringify(emailResult));
    }

    await updateInvitationStatus(inv.token, "sent");
    res.json({ ok: true, token: inv.token, emailSent: emailResult.ok, emailError: emailResult.error });
  } catch (err) {
    console.error("Admin resend invitation error:", err);
    res.status(500).json({ error: "Failed to resend invitation" });
  }
});

app.get("/api/admin/email-status", requireAdmin, async (_req, res) => {
  res.json({ enabled: isEmailEnabled(), provider: "resend" });
});

app.get("/api/admin/enrich-email", requireAdmin, async (req, res) => {
  try {
    const email = (req.query.email as string || "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      res.status(400).json({ error: "Valid email required" });
      return;
    }

    const domain = email.split("@")[1];

    // Skip personal email providers
    const personalDomains = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "aol.com", "proton.me", "protonmail.com", "live.com", "me.com"];
    if (personalDomains.includes(domain)) {
      res.json({ enriched: false, reason: "personal_email" });
      return;
    }

    // Simple domain-based enrichment: fetch the company website and extract info
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const siteRes = await fetch(`https://${domain}`, {
        signal: controller.signal,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; HMN-Assessment-Bot)" },
      });
      clearTimeout(timeout);

      if (siteRes.ok) {
        const html = await siteRes.text();
        // Extract title and meta description
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
        const title = titleMatch?.[1]?.trim() || "";
        const description = descMatch?.[1]?.trim() || "";

        // Use the Anthropic API to extract structured company info
        const client = getAnthropicClient();
        const extraction = await client.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 300,
          messages: [{
            role: "user",
            content: `Extract company information from this website data for domain "${domain}".\n\nTitle: ${title}\nDescription: ${description}\n\nReturn ONLY a JSON object (no markdown, no backticks):\n{"companyName": "string or null", "industry": "string or null", "teamSize": "string range like 1-10, 11-50, 51-200, 201-1000, 1000+ or null"}`
          }],
        });

        const responseText = extraction.content[0].type === "text" ? extraction.content[0].text : "";
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const companyData = JSON.parse(jsonMatch[0]);
          res.json({
            enriched: true,
            company: companyData.companyName || domain.split(".")[0].toUpperCase(),
            industry: companyData.industry,
            teamSize: companyData.teamSize,
            domain,
          });
          return;
        }
      }
    } catch {
      // Website fetch failed, try domain name heuristic
    }

    // Fallback: derive company name from domain
    const domainName = domain.split(".")[0];
    res.json({
      enriched: true,
      company: domainName.charAt(0).toUpperCase() + domainName.slice(1),
      industry: null,
      teamSize: null,
      domain,
    });
  } catch (err) {
    console.error("Email enrichment error:", err);
    res.json({ enriched: false, reason: "error" });
  }
});

app.get("/api/admin/export", requireAdmin, async (req, res) => {
  try {
    const format = (req.query.format as string) || "json";
    const filters: { since?: string; status?: string; assessmentTypeId?: string } = {};
    if (req.query.since) filters.since = req.query.since as string;
    if (req.query.status) filters.status = req.query.status as string;
    if (req.query.assessmentTypeId) filters.assessmentTypeId = req.query.assessmentTypeId as string;
    const data = await exportSessionsAdmin(format as "json" | "csv", Object.keys(filters).length > 0 ? filters : undefined);
    if (format === "csv") {
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=sessions.csv");
    }
    res.send(data);
  } catch (err) { console.error("Admin export error:", err); res.status(500).json({ error: "Failed to export" }); }
});

// ============================================================
// ASSESSMENT LISTING (admin only — public access via invitations)
// ============================================================

app.get("/api/assessments", requireAdmin, async (_req, res) => {
  try {
    const all = await listAllAssessments();
    const assessments = all
      .filter((a) => a.status === "active")
      .map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        icon: a.icon,
        estimatedMinutes: a.estimatedMinutes,
        questionCount: a.questions?.length ?? 0,
        status: a.status,
      }));
    res.json({ assessments });
  } catch (err) {
    console.error("List assessments error:", err);
    res.json({ assessments: [] });
  }
});

app.get("/api/assessments/:id", requireAdmin, async (req, res) => {
  try {
    const assessment = await loadAssessment(req.params.id as string);
    if (!assessment) {
      res.status(404).json({ error: "Assessment not found" });
      return;
    }
    res.json({
      id: assessment.id,
      name: assessment.name,
      description: assessment.description,
      icon: assessment.icon,
      estimatedMinutes: assessment.estimatedMinutes,
      questionCount: assessment.questions?.length || 0,
      status: assessment.status,
      phases: assessment.phases,
      sections: assessment.sections,
      scoringDimensions: assessment.scoringDimensions,
    });
  } catch (err) {
    console.error("Get assessment error:", err);
    res.status(500).json({ error: "Failed to get assessment" });
  }
});

// ============================================================
// ADMIN CHAT (conversational AI with tool use)
// ============================================================

const ADMIN_SYSTEM_PROMPT = `You are the HMN Cascade Admin Assistant — an expert AI that helps administrators manage the entire assessment platform through conversation.

PRIMARY CAPABILITIES:
- **Assessments**: Create, edit, duplicate, and manage assessments from documents or descriptions
- **Invitations**: Create and send invitations (single or batch from CSV/pasted data), track status
- **Companies**: Look up companies, view session data, fetch company logos
- **Sessions**: View, analyze, export interview sessions and analytics
- **Data**: Export data, generate reports, view stats and completion funnels

INVITATION MANAGEMENT:
- When the user provides a list of people (CSV, plain text, or pasted data), parse it and use batch_create_invitations to create and send emails
- Always confirm the assessment type before creating invitations — use list_assessments to show available options
- After creating invitations, report: invitations created, emails sent, any failures
- For a single person, use create_invitation. For multiple people, use batch_create_invitations.
- Emails are sent automatically unless the user says otherwise

COMPANY ENRICHMENT:
- When creating invitations or looking up companies, use lookup_company_logo to fetch their logo from their domain
- Extract domain from email addresses (e.g., matty@lvng.ai → lvng.ai, alex@behmn.com → behmn.com)
- Include logo URLs in your responses when available

ASSESSMENT BUILDING:
When the user uploads files or asks to build an assessment, analyze them thoroughly:
1. Extract key themes, topics, competencies, and frameworks
2. Design phases and sections that map to the document structure
3. Generate 15-30 questions with varied input types
4. Create scoring dimensions that align with the document's evaluation criteria
5. Set appropriate weights based on document emphasis
6. Always ask if the user wants adjustments after the first draft

BUILDING ASSESSMENTS FROM DOCUMENTS:
When the user uploads files, analyze them thoroughly:
1. Extract key themes, topics, competencies, and frameworks
2. Design phases and sections that map to the document structure
3. Generate 15-30 questions with varied input types
4. Create scoring dimensions that align with the document's evaluation criteria
5. Set appropriate weights based on document emphasis
6. Always ask if the user wants adjustments after the first draft

ASSESSMENT STRUCTURE:
- Phases: High-level stages (e.g., "Profile & Baseline", "Deep Dive", "Strategic Alignment")
- Sections: Groups within phases (e.g., "About You", "Team Reality", "Industry Context")
- Questions: Individual items with input types, scoring dimensions, weights
- Scoring Dimensions: What the assessment measures (weights should sum to 1.0)

QUESTION INPUT TYPES:
- "ai_conversation": Open-ended with AI follow-ups (best for deep exploration, use for 40-60% of questions)
- "slider": Numeric scale (needs sliderMin, sliderMax, sliderLabels)
- "buttons": Single-select from options (needs options array)
- "multi_select": Multiple select from options (needs options array)
- "open_text": Free text response
- "voice": Voice input with transcription

Each question needs: id, section, phase, text, inputType, required, scoringDimensions[], weight (0-1), tags[]
For ai_conversation questions, include aiFollowUpPrompt with guidance for the AI interviewer.

BEHAVIOR:
- Be conversational and proactive — suggest improvements
- Use markdown formatting (tables, bold, lists) for data display
- For destructive actions (delete, archive), always confirm before executing
- After creating an assessment, offer to refine questions, adjust weights, or preview it
- Keep responses concise but informative

RESPONSE FORMAT:
- ALWAYS end your response with 2-4 suggested follow-up actions
- Format them EXACTLY like this at the very end of your response:

\`\`\`actions
Refine the questions
Adjust scoring weights
Preview this assessment
\`\`\`

- Each line inside the actions block is one clickable action button
- Make actions contextually relevant to what you just discussed
- Keep action labels short (under 40 chars) and action-oriented
- Always include at least 2 suggested actions

GUIDED BUILDING PROCESS:
When building a new assessment, guide the admin through 5 phases in order. You MUST follow this methodology:

**Phase 1 — PURPOSE & CONTEXT** (<!-- PHASE:purpose -->)
Ask about the assessment's goal, target audience, what competencies it should measure, and estimated duration.
Don't create the assessment until you have a clear understanding of the purpose.

**Phase 2 — FRAMEWORK & STRUCTURE** (<!-- PHASE:framework -->)
Design phases (high-level stages), sections (groups within phases), and scoring dimensions.
Explain WHY each phase/section exists and what it measures.
Create the assessment at this point using create_assessment with full structure.

**Phase 3 — QUESTION DESIGN** (<!-- PHASE:questions -->)
Build questions section-by-section. For EVERY question you create:
> **Why this question**: Explain what competency or behavior it measures and why it matters
> **Maps to**: List which scoring dimensions it maps to and why
> **Input type rationale**: Explain why this input type (slider, buttons, ai_conversation, etc.) was chosen

Aim for 40-60% ai_conversation questions for deep exploration. Use sliders for self-assessment, buttons for categorical choices, and multi_select for comprehensive coverage.

**Phase 4 — SCORING & CALIBRATION** (<!-- PHASE:scoring -->)
Review all question weights and dimension mappings. Show a coverage analysis:
- Which dimensions have strong coverage vs gaps
- Whether weights are balanced appropriately
- Suggest calibration adjustments

**Phase 5 — REVIEW & ACTIVATE** (<!-- PHASE:review -->)
Summarize the complete assessment. Show stats: total questions, estimated time, dimension coverage.
Offer to preview or activate the assessment.

IMPORTANT: Include phase markers (<!-- PHASE:xxx -->) in your responses so the UI can track progress.
Always explain your methodology — the admin should understand WHY you're making each design decision.`;

// ---- Tool display names for SSE streaming ----

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  create_assessment: "Creating assessment",
  update_assessment: "Updating assessment",
  add_question: "Adding question",
  update_question: "Updating question",
  remove_question: "Removing question",
  list_assessments: "Listing assessments",
  get_assessment: "Reading assessment data",
  duplicate_assessment: "Duplicating assessment",
  archive_assessment: "Archiving assessment",
  list_sessions: "Loading sessions",
  get_session: "Loading session details",
  delete_session: "Deleting session",
  get_stats: "Gathering statistics",
  export_sessions: "Exporting data",
  get_dimension_averages: "Analyzing dimensions",
  get_completion_funnel: "Analyzing completion funnel",
  list_invitations: "Loading invitations",
  create_invitation: "Creating invitation",
  batch_create_invitations: "Creating invitations",
  get_invitation: "Loading invitation",
  delete_invitation: "Deleting invitation",
  list_companies: "Loading companies",
  get_company_detail: "Loading company details",
  lookup_company_logo: "Looking up company logo",
};

function getToolDisplayName(name: string, input: Record<string, unknown>): string {
  const base = TOOL_DISPLAY_NAMES[name] || name;
  // Add context from input
  if (name === "create_assessment" && input.name) return `${base} "${input.name}"`;
  if (name === "add_question" && input.text) {
    const text = String(input.text);
    return `${base}: "${text.length > 50 ? text.slice(0, 50) + "..." : text}"`;
  }
  if (name === "update_question" && input.questionId) return `${base} ${input.questionId}`;
  if (name === "update_assessment" && input.changes) return `${base} configuration`;
  if (name === "create_invitation" && input.participant) {
    const p = input.participant as Record<string, string>;
    return `${base} for ${p.name || p.email || "participant"}`;
  }
  if (name === "batch_create_invitations" && input.participants) {
    const count = (input.participants as unknown[]).length;
    return `${base} (${count} people)`;
  }
  if (name === "get_company_detail" && input.companyName) return `${base} for ${input.companyName}`;
  if (name === "lookup_company_logo" && input.domain) return `${base} for ${input.domain}`;
  return base;
}

function getToolSummary(name: string, input: Record<string, unknown>, result: unknown, success: boolean): string {
  if (!success) return `Failed: ${name}`;
  switch (name) {
    case "create_assessment": return `Created "${input.name || "assessment"}"`;
    case "add_question": return `Added question "${String(input.text || "").slice(0, 40)}${String(input.text || "").length > 40 ? "..." : ""}"`;
    case "update_question": return `Updated question ${input.questionId}`;
    case "update_assessment": return "Updated assessment configuration";
    case "remove_question": return `Removed question ${input.questionId}`;
    case "get_assessment": return "Loaded assessment data";
    case "list_assessments": return "Retrieved assessments list";
    case "duplicate_assessment": return `Duplicated to "${input.newName || input.newId}"`;
    case "archive_assessment": return "Archived assessment";
    case "list_invitations": return "Retrieved invitations list";
    case "create_invitation": {
      const p = input.participant as Record<string, string> | undefined;
      return `Created invitation for ${p?.name || p?.email || "participant"}`;
    }
    case "batch_create_invitations": {
      const r = result as { invitations?: unknown[] } | undefined;
      return `Created ${r?.invitations?.length || 0} invitations`;
    }
    case "get_invitation": return "Loaded invitation details";
    case "delete_invitation": return "Deleted invitation";
    case "list_companies": return "Retrieved companies list";
    case "get_company_detail": return `Loaded details for ${input.companyName || "company"}`;
    case "lookup_company_logo": {
      const lr = result as { found?: boolean } | undefined;
      return lr?.found ? `Found logo for ${input.domain}` : `No logo found for ${input.domain}`;
    }
    default: return `Completed ${TOOL_DISPLAY_NAMES[name] || name}`;
  }
}

type SSEWriter = {
  sendEvent: (event: string, data: Record<string, unknown>) => void;
  end: () => void;
};

function initSSE(res: import("express").Response): SSEWriter {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering
  res.flushHeaders();
  return {
    sendEvent(event: string, data: Record<string, unknown>) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    end() {
      res.write("event: done\ndata: {}\n\n");
      res.end();
    },
  };
}

async function runToolLoop(
  client: Anthropic,
  systemPrompt: string,
  anthropicMessages: Anthropic.Messages.MessageParam[],
  tools: Anthropic.Messages.Tool[],
  maxTokens: number,
  sse: SSEWriter,
): Promise<{ finalText: string; toolCalls: { name: string; displayName: string; success: boolean; summary: string }[] }> {
  const allToolCalls: { name: string; displayName: string; success: boolean; summary: string }[] = [];

  sse.sendEvent("thinking", { message: "Analyzing your request..." });

  let response = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system: systemPrompt,
    tools,
    messages: anthropicMessages,
  });

  const toolMessages = [...anthropicMessages];
  let maxIterations = 10;

  while (response.stop_reason === "tool_use" && maxIterations-- > 0) {
    const assistantContent = response.content;
    toolMessages.push({ role: "assistant" as const, content: assistantContent as unknown as string });

    const toolResults: Array<{ type: "tool_result"; tool_use_id: string; content: string }> = [];
    for (const block of assistantContent) {
      if (block.type === "tool_use") {
        const input = block.input as Record<string, unknown>;
        const displayName = getToolDisplayName(block.name, input);

        sse.sendEvent("tool_start", { name: block.name, displayName });

        console.log(`Tool call: ${block.name}(${JSON.stringify(input)})`);
        let result: unknown;
        let success = true;
        try {
          result = await executeTool(block.name, input);
        } catch (err) {
          result = { error: String(err) };
          success = false;
        }

        const summary = getToolSummary(block.name, input, result, success);
        allToolCalls.push({ name: block.name, displayName, success, summary });

        sse.sendEvent("tool_result", { name: block.name, success, summary });

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(result, null, 2),
        });
      }
    }

    toolMessages.push({ role: "user" as const, content: toolResults as unknown as string });

    sse.sendEvent("thinking", { message: "Processing results..." });

    response = await client.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      tools,
      messages: toolMessages as Anthropic.Messages.MessageParam[],
    });
  }

  const textBlocks = response.content.filter((b) => b.type === "text");
  const finalText = textBlocks.map((b) => b.type === "text" ? b.text : "").join("\n");

  return { finalText, toolCalls: allToolCalls };
}

// ---- Assessment-scoped chat (conversational editing) ----

const ASSESSMENT_TOOL_NAMES = new Set([
  "get_assessment", "update_assessment", "add_question",
  "update_question", "remove_question", "duplicate_assessment", "archive_assessment",
]);

const ASSESSMENT_TOOLS = TOOL_DEFINITIONS.filter((t) => ASSESSMENT_TOOL_NAMES.has(t.name));

app.post("/api/admin/assessments/:id/chat", requireAdmin, async (req, res) => {
  try {
    const assessmentId = sanitizeId(String(req.params.id));
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
      res.status(400).json({ error: "messages array required" });
      return;
    }

    // Load assessment context
    const assessment = await getAssessmentAdmin(assessmentId);
    if (!assessment) {
      res.status(404).json({ error: "Assessment not found" });
      return;
    }

    const systemPrompt = `You are editing the assessment "${assessment.name}" (id: ${assessmentId}).

CURRENT ASSESSMENT STATE:
- Status: ${assessment.status}
- Questions: ${assessment.questions?.length ?? 0}
- Phases: ${(assessment.phases || []).map((p: { label: string }) => p.label).join(", ")}
- Sections: ${(assessment.sections || []).map((s: { label: string }) => s.label).join(", ")}
- Scoring Dimensions: ${(assessment.scoringDimensions || []).map((d: { label: string }) => d.label).join(", ")}

TOOLS AVAILABLE:
You can get_assessment, update_assessment, add_question, update_question, remove_question, duplicate_assessment, or archive_assessment.
Always use assessmentId="${assessmentId}" when calling tools that need it.

BEHAVIOR:
- Be conversational and helpful
- Use markdown formatting for clarity
- For destructive actions, confirm before executing
- After making changes, briefly summarize what changed
- Keep responses concise

QUESTION INPUT TYPES:
- "ai_conversation": Open-ended with AI follow-ups
- "slider": Numeric scale (needs sliderMin, sliderMax, sliderLabels)
- "buttons": Single-select from options
- "multi_select": Multiple select from options
- "open_text": Free text
- "voice": Voice input with transcription

Each question needs: id, section, phase, text, inputType, required, scoringDimensions[], weight (0-1), tags[]

RESPONSE FORMAT:
End with 2-3 suggested follow-up actions:
\`\`\`actions
Show all questions
Update scoring weights
Add a new question
\`\`\``;

    const client = getAnthropicClient();
    const anthropicMessages = messages.map((m: { role: string; content: string }) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    const sse = initSSE(res);
    const { finalText, toolCalls } = await runToolLoop(
      client, systemPrompt, anthropicMessages,
      ASSESSMENT_TOOLS as Anthropic.Messages.Tool[], 4000, sse,
    );

    sse.sendEvent("response", { text: finalText || "Done! The assessment has been updated.", toolCalls });
    sse.end();
  } catch (err) {
    console.error("Assessment chat error:", err);
    // If headers already sent (SSE started), we can't send JSON error
    if (!res.headersSent) {
      res.status(500).json({ error: "Chat failed" });
    } else {
      res.write(`event: error\ndata: ${JSON.stringify({ error: "Chat failed" })}\n\n`);
      res.end();
    }
  }
});

// ---- General admin chat ----

app.post("/api/admin/chat", requireAdmin, async (req, res) => {
  try {
    const { messages, attachments } = req.body;
    if (!messages || !Array.isArray(messages)) {
      res.status(400).json({ error: "messages array required" });
      return;
    }

    // Build system prompt with optional file attachments
    let systemPrompt = ADMIN_SYSTEM_PROMPT;
    if (attachments && Array.isArray(attachments) && attachments.length > 0) {
      const fileContextParts = attachments
        .filter((a: { filename?: string; content?: string }) => a.filename && a.content)
        .map((a: { filename: string; content: string }) =>
          `--- ${a.filename} ---\n${a.content.slice(0, 50000)}\n--- end ${a.filename} ---`
        );
      if (fileContextParts.length > 0) {
        systemPrompt += `\n\nREFERENCE DOCUMENTS:\nThe user has uploaded the following files as context for building assessments. Use these as the primary source material.\n\n${fileContextParts.join("\n\n")}`;
      }
    }

    const client = getAnthropicClient();
    const anthropicMessages = messages.map((m: { role: string; content: string }) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    const sse = initSSE(res);
    const { finalText, toolCalls } = await runToolLoop(
      client, systemPrompt, anthropicMessages,
      TOOL_DEFINITIONS as Anthropic.Messages.Tool[], 8000, sse,
    );

    sse.sendEvent("response", { text: finalText || "I completed the requested action.", toolCalls });
    sse.end();
  } catch (err) {
    console.error("Admin chat error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Chat failed" });
    } else {
      res.write(`event: error\ndata: ${JSON.stringify({ error: "Chat failed" })}\n\n`);
      res.end();
    }
  }
});

// ============================================================
// PREVIEW SESSION ENDPOINTS
// ============================================================

app.post("/api/sessions/preview", requireAdmin, async (req, res) => {
  try {
    const { assessmentTypeId } = req.body;
    if (!assessmentTypeId) {
      res.status(400).json({ error: "assessmentTypeId required" });
      return;
    }

    const id = `preview_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const session = {
      id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "intake",
      assessmentTypeId: sanitizeId(String(assessmentTypeId)),
      isPreview: true,
      participant: {
        name: "Preview User",
        role: "Admin Tester",
        company: "Preview Mode",
        industry: "Technology",
        teamSize: "10-50",
        email: "preview@test.local",
      },
      currentQuestionIndex: 0,
      currentPhase: "profile_baseline",
      currentSection: "demographics",
      responses: [],
      conversationHistory: [],
      research: null,
      researchConfirmed: true,
    };

    await saveSession(session);
    res.status(201).json({ session });
  } catch (err) {
    console.error("Create preview session error:", err);
    res.status(500).json({ error: "Failed to create preview session" });
  }
});

app.delete("/api/admin/preview/:sessionId", requireAdmin, async (req, res) => {
  try {
    const id = sanitizeId(String(req.params.sessionId));
    if (!id.startsWith("preview_")) {
      res.status(403).json({ error: "Can only delete preview sessions" });
      return;
    }
    const deleted = await deleteSessionFromDb(id);
    if (deleted) {
      res.json({ ok: true });
    } else {
      res.status(404).json({ error: "Preview session not found" });
    }
  } catch (err) {
    console.error("Delete preview session error:", err);
    res.status(500).json({ error: "Failed to delete preview session" });
  }
});

// ============================================================
// GRAPH INTELLIGENCE ENDPOINTS
// ============================================================

app.get("/api/admin/graph/company/:name", requireAdmin, async (req, res) => {
  try {
    const data = await getCompanyIntelligence(String(req.params.name));
    res.json(data);
  } catch (err) {
    console.error("[GRAPH] Company intelligence error:", err);
    res.status(500).json({ error: "Failed to fetch company intelligence" });
  }
});

app.get("/api/admin/graph/assessment/:id", requireAdmin, async (req, res) => {
  try {
    const data = await getAssessmentSummary(String(req.params.id));
    res.json(data);
  } catch (err) {
    console.error("[GRAPH] Assessment summary error:", err);
    res.status(500).json({ error: "Failed to fetch assessment summary" });
  }
});

app.get("/api/admin/graph/benchmarks", requireAdmin, async (req, res) => {
  try {
    const { company, assessmentTypeId } = extractDashboardFilters(req.query as Record<string, unknown>);
    const data = await getCrossCompanyBenchmarks({ company, assessmentTypeId });
    res.json(data);
  } catch (err) {
    console.error("[GRAPH] Benchmarks error:", err);
    res.status(500).json({ error: "Failed to fetch benchmarks" });
  }
});

app.get("/api/admin/graph/themes", requireAdmin, async (req, res) => {
  try {
    const { company, assessmentTypeId } = extractDashboardFilters(req.query as Record<string, unknown>);
    const data = await getThemeMap({ company, assessmentTypeId });
    res.json(data);
  } catch (err) {
    console.error("[GRAPH] Theme map error:", err);
    res.status(500).json({ error: "Failed to fetch theme map" });
  }
});

app.get("/api/admin/graph/timeline", requireAdmin, async (req, res) => {
  try {
    const { company, assessmentTypeId } = extractDashboardFilters(req.query as Record<string, unknown>);
    const data = await getGrowthTimeline({ company, assessmentTypeId });
    res.json(data);
  } catch (err) {
    console.error("[GRAPH] Timeline error:", err);
    res.status(500).json({ error: "Failed to fetch growth timeline" });
  }
});

app.get("/api/admin/graph/network", requireAdmin, async (req, res) => {
  try {
    const { company, assessmentTypeId } = extractDashboardFilters(req.query as Record<string, unknown>);
    const data = await getNetworkGraph({ company, assessmentTypeId });
    res.json(data);
  } catch (err) {
    console.error("[GRAPH] Network graph error:", err);
    res.status(500).json({ error: "Failed to fetch network graph" });
  }
});

app.post("/api/admin/graph/seed", requireAdmin, async (_req, res) => {
  try {
    const result = await seedAllSessionsToGraph();
    res.json(result);
  } catch (err) {
    console.error("[GRAPH] Seed error:", err);
    res.status(500).json({ error: "Failed to seed graph" });
  }
});

// Re-run intelligence extraction (tools, pain points, goals, quotes) for all analyzed sessions
app.post("/api/admin/graph/extract", requireAdmin, async (_req, res) => {
  try {
    const sessions = await listAllSessions();
    const analyzed = sessions.filter((s) => s.status === "analyzed" || s.status === "completed");
    let success = 0;
    for (const session of analyzed) {
      try {
        await extractAndSyncIntelligence(session);
        success++;
      } catch (err) {
        console.error(`[GRAPH] Extract failed for ${session.id}:`, err);
      }
    }
    res.json({ processed: analyzed.length, success });
  } catch (err) {
    console.error("[GRAPH] Extract error:", err);
    res.status(500).json({ error: "Failed to run intelligence extraction" });
  }
});

app.get("/api/admin/graph/status", requireAdmin, async (_req, res) => {
  try {
    const nodeResult = await runQuery("MATCH (n) WHERE n.source = 'cascade' RETURN count(n) AS count", {});
    const relResult = await runQuery("MATCH (a)-[r]->(b) WHERE a.source = 'cascade' AND b.source = 'cascade' RETURN count(r) AS count", {});
    const nodeCount = nodeResult.length ? Number(nodeResult[0].get("count")) : 0;
    const relCount = relResult.length ? Number(relResult[0].get("count")) : 0;
    res.json({ enabled: true, nodeCount, relCount });
  } catch (err) {
    console.error("[GRAPH] Status check error:", err);
    res.json({ enabled: false, nodeCount: 0, relCount: 0 });
  }
});

// ============================================================
// VAPI OUTBOUND CALLING
// ============================================================

const VAPI_API_URL = "https://api.vapi.ai/call";
const VAPI_WEBHOOK_URL = `${process.env.APP_URL || "http://localhost:3001"}/api/vapi/webhook`;

function buildOutboundSystemPrompt(participant: {
  name?: string; role?: string; company?: string; industry?: string; teamSize?: string;
}, questions: Array<Record<string, unknown>>): string {
  const name = participant.name || "there";
  const company = participant.company || "your company";
  const role = participant.role || "your role";
  const industry = participant.industry || "your industry";
  const teamSize = participant.teamSize || "your team";

  // Build question blocks grouped by phase/section
  const questionBlocks = questions.map((q) => {
    const lines: string[] = [];
    lines.push(`[SECTION: ${q.section} | QUESTION: ${q.id}]`);
    if ((q.weight as number) >= 0.9) lines.push(`** HIGH PRIORITY (weight: ${q.weight}) **`);
    lines.push(`Ask: "${q.text}"`);
    if (q.subtext) lines.push(`Context: ${q.subtext}`);
    if (q.inputType === "slider") {
      lines.push(`[SLIDER: Convert to verbal scale]`);
    } else if (q.inputType === "buttons" && Array.isArray(q.options)) {
      const labels = (q.options as Array<{ label: string }>).map((o) => o.label).join(", ");
      lines.push(`[CHOICES: ${labels}]`);
    } else if (q.inputType === "ai_conversation") {
      lines.push(`[CONVERSATION: Deep-dive, aim for 2-3 exchanges]`);
    }
    if (q.aiFollowUpPrompt) lines.push(`Follow-up guidance: ${q.aiFollowUpPrompt}`);
    if (Array.isArray(q.scoringDimensions) && q.scoringDimensions.length > 0) {
      lines.push(`Scoring: ${(q.scoringDimensions as string[]).join(", ")}`);
    }
    return lines.join("\n");
  }).join("\n\n");

  return `You are Kascade, an AI assessment interviewer for HMN (Human) — a strategic AI readiness and human potential assessment.

=== YOUR PERSONALITY ===
You are warm, direct, and genuinely curious. Think: a sharp management consultant who actually cares. You speak naturally and conversationally — never robotic. You listen deeply and respond to what people ACTUALLY say.

=== VOICE OUTPUT RULES ===
This is a VOICE conversation. Write all numbers as spoken words. Avoid abbreviations, URLs, or special characters.

=== PARTICIPANT CONTEXT ===
Name: ${name}
Company: ${company}
Role: ${role}
Industry: ${industry}
Team Size: ${teamSize}

=== CRITICAL: SECTION MARKERS ===
Markers like [SECTION: ... | QUESTION: ...] are for internal tracking. NEVER say them aloud.

=== HOW TO HANDLE QUESTION TYPES ===
- Slider questions: Ask conversationally, never recite scales robotically
- Button/choice questions: Frame naturally, don't list all options mechanically
- AI conversation questions: Heart of assessment, aim for 2-3 exchanges per question
- Open text: Simple factual, ask and move on

=== TRANSITIONS ===
Use natural transitions between sections. Between phases, acknowledge the shift.

=== THE QUESTIONS ===
${questionBlocks}

=== CLOSING ===
After the final question, thank them warmly. Mention their responses will be analyzed for a personalized profile. Someone from HMN will follow up.

=== RULES ===
1. NEVER read section markers aloud
2. NEVER skip an entire section
3. Keep pace conversational
4. Listen for contradictions between sections
5. Use their words in follow-ups
6. NEVER break character
7. Pronounce "HMN" as "human"`;
}

// Initiate outbound call to a session participant
app.post("/api/admin/calls/initiate", requireAdmin, async (req, res) => {
  try {
    // Check VAPI configuration
    if (!process.env.VAPI_PRIVATE_KEY || !process.env.VAPI_PHONE_NUMBER_ID) {
      res.status(503).json({ error: "Voice calling is not configured. Set VAPI_PRIVATE_KEY and VAPI_PHONE_NUMBER_ID environment variables." });
      return;
    }

    const { sessionId, phone } = req.body;
    if (!sessionId || !phone) {
      res.status(400).json({ error: "sessionId and phone are required" });
      return;
    }

    const session = await loadSession(sessionId);
    if (!session) { res.status(404).json({ error: "Session not found" }); return; }

    const participant = session.participant as { name?: string; role?: string; company?: string; industry?: string; teamSize?: string };
    const { questions: bankQuestions } = await getAssessmentQuestionBank(session as unknown as Record<string, unknown>);

    // Build assistant config with full question bank
    const systemPrompt = buildOutboundSystemPrompt(participant, bankQuestions);
    const firstName = (participant.name || "there").split(" ")[0];

    const assistantConfig = {
      name: "Kascade - HMN Assessment",
      firstMessage: `Hey ${firstName}! This is Kascade calling from HMN. Thanks for making time for your assessment — I know you're busy. We've got about twenty to thirty minutes together, and I promise this won't feel like a survey. Think of it more like a strategic conversation about where you and your organization stand. Sound good?`,
      model: {
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        messages: [{ role: "system", content: systemPrompt }],
      },
      voice: {
        provider: "11labs",
        voiceId: "uju3wxzG5OhpWcoi3SMy",
        stability: 0.55,
        similarityBoost: 0.8,
        speed: 0.9,
      },
      serverUrl: VAPI_WEBHOOK_URL,
      silenceTimeoutSeconds: 45,
      maxDurationSeconds: 2400,
      backgroundDenoisingEnabled: true,
      modelOutputInMessagesEnabled: true,
      endCallMessage: "Thank you so much for your time and honesty today. Your responses are going to give us a really clear picture. Someone from HMN will be in touch soon with your personalized profile. Take care!",
    };

    // Call VAPI API
    const vapiRes = await fetch(VAPI_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.VAPI_PRIVATE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        assistant: assistantConfig,
        phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
        customer: { number: phone, name: participant.name || "Participant" },
      }),
    });

    if (!vapiRes.ok) {
      const errorBody = await vapiRes.text();
      console.error("[VAPI] Call initiation failed:", vapiRes.status, errorBody);
      res.status(502).json({ error: `VAPI error: ${vapiRes.status}`, details: errorBody });
      return;
    }

    const vapiData = await vapiRes.json();
    const vapiCallId = vapiData.id;

    // Store the call reference on the session
    const sessionRec = session as unknown as Record<string, unknown>;
    sessionRec.vapiCallId = vapiCallId;
    sessionRec.callPhone = phone;
    sessionRec.callInitiatedAt = new Date().toISOString();
    await saveSession(sessionRec);

    res.json({ success: true, vapiCallId, sessionId });
  } catch (err) {
    console.error("[VAPI] Call initiation error:", err);
    res.status(500).json({ error: "Failed to initiate call" });
  }
});

// VAPI Webhook — receives call status updates and end-of-call reports
app.post("/api/vapi/webhook", async (req, res) => {
  try {
    const body = req.body;
    const messageType = body.message?.type;

    if (messageType === "end-of-call-report") {
      const vapiCallId = body.message.call?.id;
      const transcript = body.message.artifact?.transcript || "";
      const messages = body.message.artifact?.messages || [];
      const recordingUrl = body.message.artifact?.recordingUrl;
      const durationSeconds = body.message.durationSeconds;

      console.log(`[VAPI Webhook] End-of-call for ${vapiCallId}, duration: ${durationSeconds}s, transcript length: ${transcript.length}`);

      // Find the session linked to this VAPI call
      const allSessions = await listAllSessions();
      const session = allSessions.find(
        (s) => (s as unknown as Record<string, unknown>).vapiCallId === vapiCallId
      );

      if (session) {
        // Store transcript and recording on the session
        const rec = session as unknown as Record<string, unknown>;
        rec.callTranscript = transcript;
        rec.callMessages = messages;
        rec.callRecordingUrl = recordingUrl;
        rec.callDuration = durationSeconds;
        rec.callCompletedAt = new Date().toISOString();
        rec.status = "completed";
        await saveSession(rec);
        console.log(`[VAPI Webhook] Session ${session.id} updated with call transcript`);
      } else {
        console.warn(`[VAPI Webhook] No session found for vapiCallId ${vapiCallId}`);
      }
    } else if (messageType === "status-update") {
      const status = body.message.status;
      console.log(`[VAPI Webhook] Status update: ${status} for call ${body.message.call?.id}`);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("[VAPI Webhook] Error:", err);
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

// Get call status for a session
app.get("/api/admin/calls/:sessionId/status", requireAdmin, async (req, res) => {
  try {
    const session = await loadSession(req.params.sessionId as string);
    if (!session) { res.status(404).json({ error: "Session not found" }); return; }

    const s = session as unknown as Record<string, unknown>;
    res.json({
      vapiCallId: s.vapiCallId || null,
      callPhone: s.callPhone || null,
      callInitiatedAt: s.callInitiatedAt || null,
      callCompletedAt: s.callCompletedAt || null,
      callDuration: s.callDuration || null,
      callRecordingUrl: s.callRecordingUrl || null,
      hasTranscript: !!(s.callTranscript),
    });
  } catch (err) {
    console.error("[VAPI] Call status error:", err);
    res.status(500).json({ error: "Failed to get call status" });
  }
});

// ============================================================
// ROUTE MODULES (v1 feature ports)
// ============================================================

app.use("/api/admin/campaigns", requireAdmin, campaignRoutes);
app.use("/api/admin/contacts", requireAdmin, contactRoutes);
app.use("/api/admin/calls-history", requireAdmin, callRoutes);
app.use("/api/admin/webhooks", requireAdmin, webhookRoutes);
app.use("/api/admin/search", requireAdmin, searchRoutes);
app.use("/api/admin/analytics", requireAdmin, analyticsRoutes);
app.use("/api/admin/settings", requireAdmin, settingsRoutes);
app.use("/api/admin/cron", requireAdmin, cleanupRoutes);
// Health check
app.get("/api/health", (_req, res) => { res.json({ status: "ok", timestamp: new Date().toISOString() }); });
app.get("/live", (_req, res) => { res.status(200).send("OK"); });
app.get("/ready", (_req, res) => { res.status(200).send("OK"); });

// ============================================================
// SPA FALLBACK (must be after all API routes)
// ============================================================

if (IS_PROD) {
  app.get("/{*splat}", (_req, res) => {
    res.sendFile(join(process.cwd(), "dist", "index.html"));
  });
}

// ============================================================
// START
// ============================================================

loadQuestionBank().then(() => {
  const server = app.listen(PORT, () => {
    const addr = server.address();
    const actualPort = typeof addr === "object" && addr ? addr.port : PORT;
    writeFileSync(join(process.cwd(), ".server-port"), String(actualPort));
    console.log(`HMN Cascade API running on http://localhost:${actualPort}`);
    console.log(`${QUESTION_BANK.length} questions loaded`);

    // Initialize Neo4j graph schema (fire and forget)
    initGraphSchema().catch((err) =>
      console.error("[GRAPH] Schema init failed:", err)
    );
  });
});
