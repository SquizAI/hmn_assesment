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
  listAllSessions, listAllAssessments, lookupSessionsByEmail,
  loadInvitationByToken, loadInvitationById, updateInvitationStatus, findInvitationBySessionId,
  loadAssessment,
} from "./supabase.js";
import { isEmailEnabled, sendInvitationEmail, sendBatchInvitationEmails } from "./email.js";
import { initGraphSchema, runQuery } from "./neo4j.js";
import { getCompanyIntelligence, getAssessmentSummary, getCrossCompanyBenchmarks, getThemeMap, getGrowthTimeline, getNetworkGraph } from "./graph-queries.js";
import { seedAllSessionsToGraph, extractAndSyncIntelligence } from "./graph-sync.js";

dotenv.config();

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

  return available.filter((q) => {
    // Skip direct reports for tiny teams — it's obvious
    if (q.id === "demo_direct_reports" && (size === "1-10" || size === "11-50")) return false;

    // Skip tech leadership question for small companies with CEO/Founder
    if (q.id === "team_tech_leadership" && size === "1-10" && (r.includes("ceo") || r.includes("founder"))) return false;

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
    if (!participant?.name || !participant?.company || !participant?.email) {
      res.status(400).json({ error: "name, company, and business email are required" });
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
      questionNumber: autoResponses.length + 1,
      totalQuestions: bankQuestions.length,
      phase: firstQuestion.phase,
      section: firstQuestion.section,
      completedPercentage: Math.round((autoResponses.length / bankQuestions.length) * 100),
    },
  });
  } catch (err) {
    console.error("Interview start error:", err);
    res.status(500).json({ error: "Failed to start interview" });
  }
});

// --- Interview Respond ---

app.post("/api/interview/respond", async (req, res) => {
  try {
    const { sessionId, questionId, answer, conversationHistory } = req.body;

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

    // --- Handle AI Conversation ---
    if (currentQuestion.inputType === "ai_conversation") {
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

      const isComplete = aiResponse.includes("[QUESTION_COMPLETE]");
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
      let confidence = { specificity: 0.8, emotionalCharge: 0.5, consistency: 0.8 };
      if (currentQuestion.inputType === "open_text" || currentQuestion.inputType === "voice") {
        confidence = await analyzeResponseConfidence(String(answer), currentQuestion.text as string, session.responses);
      }

      session.responses.push({
        questionId,
        questionText: currentQuestion.text,
        inputType: currentQuestion.inputType,
        answer,
        timestamp: new Date().toISOString(),
        confidenceIndicators: confidence,
      });
    }

    // --- Next Question ---
    const answeredIds = new Set(session.responses.map((r: { questionId: string }) => r.questionId));
    const remaining = bankQuestions.filter((q) => !answeredIds.has(q.id as string));

    if (remaining.length === 0) {
      session.status = "completed";
      await saveSession(session);
      res.json({ type: "complete", session });
      return;
    }

    // Filter out questions that can be trivially deduced
    const smartRemaining = filterDeducibleQuestions(remaining, session);
    const respondFilteredOutIds = remaining.filter((q) => !smartRemaining.some((sq) => sq.id === q.id)).map((q) => q.id as string);
    const questionsForAI = smartRemaining.length > 0 ? smartRemaining : remaining;

    // AI-powered question selection (with deduction context)
    let nextQuestion: Record<string, unknown> | undefined;
    try {
      const selection = await selectNextQuestion(questionsForAI, session);
      if (selection?.questionId) {
        // Validate the returned ID exists in the question bank
        const selected = getQuestionFromBank(bankQuestions, selection.questionId) || getQuestionById(selection.questionId);
        if (selected) {
          nextQuestion = { ...selected, text: selection.adaptedText || selected.text };
        } else {
          console.warn(`[INTERVIEW] selectNextQuestion returned unknown ID: ${selection.questionId}, falling back`);
        }
      }
    } catch (selErr) {
      console.error("[INTERVIEW] selectNextQuestion failed:", (selErr as Error).message);
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
      res.json({ type: "complete", session });
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

    res.json({
      type: "next_question",
      currentQuestion: nextQuestion,
      skippedQuestionIds: respondSkippedIds,
      progress: {
        questionNumber: session.responses.length + 1,
        totalQuestions: bankQuestions.length,
        phase: nextQuestion.phase,
        section: nextQuestion.section,
        completedPercentage: Math.round((session.responses.length / bankQuestions.length) * 100),
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

    // Load assessment-specific config for analysis prompt
    const { assessment } = await getAssessmentQuestionBank(session);
    const analysis = await runCascadeAnalysis(session, assessment);
    session.analysis = analysis;
    session.status = "analyzed";
    await saveSession(session);

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

  const contextSummary = responses.length > 0
    ? responses.map((r) => `Q: ${r.questionText}\nA: ${typeof r.answer === "object" ? JSON.stringify(r.answer) : r.answer}`).join("\n\n")
    : "No prior responses yet.";

  // Use assessment-specific interview prompt if available, otherwise default
  const assessmentInterviewPrompt = assessment?.interviewSystemPrompt as string | undefined;

  const defaultInterviewRole = `YOUR ROLE:
- Warm, professional, genuinely curious
- Ask ONE follow-up at a time
- Dig deeper based on what they actually said
- USE your research intel to ask more targeted, informed questions
- Reference specific things you know about them/their company when relevant
- Listen for specificity vs. vagueness, contradictions, emotional charge
- Keep responses concise (2-3 sentences before your follow-up)
- When this topic feels complete (usually 2-3 exchanges), say: [QUESTION_COMPLETE]
- Never break character. You are a human interviewer.
- CRITICAL: Do NOT include internal annotations, bracketed notes, markdown formatting, or meta-commentary in your responses (e.g. no **[capturing: ...]**, no **[RED FLAG: ...]**, no *emphasis*). Write in plain conversational English as a real human interviewer would speak.`;

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
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

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
// ADMIN REST API (data endpoints for dashboard)
// ============================================================

app.get("/api/admin/stats", requireAdmin, async (req, res) => {
  try {
    const filters = extractDashboardFilters(req.query as Record<string, unknown>);
    res.json(await getStatsAdmin(filters));
  } catch (err) { console.error("Admin stats error:", err); res.status(500).json({ error: "Failed to get stats" }); }
});

app.get("/api/admin/sessions", requireAdmin, async (req, res) => {
  try {
    const filters: { since?: string; status?: string; assessmentTypeId?: string } = {};
    if (req.query.since) filters.since = req.query.since as string;
    if (req.query.status) filters.status = req.query.status as string;
    if (req.query.assessmentTypeId) filters.assessmentTypeId = req.query.assessmentTypeId as string;
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
  try { res.json({ assessments: await listAssessmentsAdmin() }); }
  catch (err) { console.error("Admin assessments error:", err); res.status(500).json({ error: "Failed to list assessments" }); }
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
    res.status(201).json(result);
  } catch (err) { console.error("Admin create assessment error:", err); res.status(500).json({ error: "Failed to create assessment" }); }
});

app.put("/api/admin/assessments/:id", requireAdmin, async (req, res) => {
  try {
    const { changes } = req.body;
    if (!changes) { res.status(400).json({ error: "changes object required" }); return; }
    const result = await updateAssessmentAdmin(String(req.params.id), changes);
    if (!result.ok) { res.status(404).json({ error: "Assessment not found" }); return; }
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
