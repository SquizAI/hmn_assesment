import express from "express";
import cors from "cors";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join } from "path";
import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";

dotenv.config();

// ============================================================
// HMN CASCADE - Express API Server
// ============================================================

const app = express();
const IS_PROD = process.env.NODE_ENV === "production";
const PORT = IS_PROD ? parseInt(process.env.PORT || "8080", 10) : 0;
const MODEL = "claude-sonnet-4-5-20250929";
const SESSIONS_DIR = join(process.cwd(), "sessions");

app.use(cors());
app.use(express.json({ limit: "50mb" }));

// In production, serve the built frontend
if (IS_PROD) {
  const distPath = join(process.cwd(), "dist");
  app.use(express.static(distPath));
}

// --- Helpers ---

function ensureDir() {
  if (!existsSync(SESSIONS_DIR)) mkdirSync(SESSIONS_DIR, { recursive: true });
}

function getAnthropicClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
}

// --- Session Storage ---

function sessionPath(id: string) {
  return join(SESSIONS_DIR, `${id}.json`);
}

function loadSession(id: string) {
  const p = sessionPath(id);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf-8"));
}

function saveSession(session: Record<string, unknown>) {
  ensureDir();
  (session as { updatedAt: string }).updatedAt = new Date().toISOString();
  writeFileSync(sessionPath(session.id as string), JSON.stringify(session, null, 2));
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

// --- Sessions ---

app.get("/api/sessions", (_req, res) => {
  ensureDir();
  const files = readdirSync(SESSIONS_DIR).filter((f) => f.endsWith(".json"));
  const sessions = files
    .map((f) => JSON.parse(readFileSync(join(SESSIONS_DIR, f), "utf-8")))
    .sort(
      (a: { createdAt: string }, b: { createdAt: string }) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  res.json({ sessions });
});

app.post("/api/sessions", (req, res) => {
  const { participant } = req.body;
  if (!participant?.name || !participant?.company || !participant?.email) {
    res.status(400).json({ error: "name, company, and business email are required" });
    return;
  }

  const id = `hmn_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const session = {
    id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "intake",
    participant,
    currentQuestionIndex: 0,
    currentPhase: "profile_baseline",
    currentSection: "demographics",
    responses: [],
    conversationHistory: [],
    research: null,
    researchConfirmed: false,
  };

  saveSession(session);
  res.status(201).json({ session });
});

app.get("/api/sessions/:sessionId", (req, res) => {
  const session = loadSession(req.params.sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  res.json({ session });
});

// --- Research (Firecrawl Deep Diligence) ---

app.post("/api/research/:sessionId", async (req, res) => {
  try {
    const session = loadSession(req.params.sessionId);
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
    saveSession(session);

    res.json({ research });
  } catch (err) {
    console.error("Research error:", err);
    res.status(500).json({ error: "Research failed", research: { status: "error", summary: "Research service unavailable. Proceeding without background intel." } });
  }
});

app.post("/api/research/:sessionId/confirm", (req, res) => {
  const session = loadSession(req.params.sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const { confirmed, corrections } = req.body;
  session.researchConfirmed = confirmed;
  if (corrections) {
    session.researchCorrections = corrections;
  }
  saveSession(session);
  res.json({ ok: true });
});

// --- Interview Start ---

app.post("/api/interview/start", (req, res) => {
  const { sessionId } = req.body;
  const session = loadSession(sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  // Auto-populate demographics from intake + research (skip redundant questions)
  const autoResponses = autoPopulateDemographics(session);
  session.responses = [...autoResponses];
  const answeredIds = new Set(autoResponses.map((r) => r.questionId as string));

  // Find first non-auto-populated, non-deducible question
  const remaining = QUESTION_BANK.filter((q) => !answeredIds.has(q.id as string));
  const smartRemaining = filterDeducibleQuestions(remaining, session);
  const filteredOutIds = remaining.filter((q) => !smartRemaining.some((sq) => sq.id === q.id)).map((q) => q.id as string);
  const firstQuestion = (smartRemaining.length > 0 ? smartRemaining : remaining)[0];

  if (!firstQuestion) {
    res.status(500).json({ error: "No questions found" });
    return;
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
  session.currentQuestionIndex = QUESTION_BANK.findIndex((q) => q.id === firstQuestion.id);
  saveSession(session);

  res.json({
    session,
    currentQuestion: firstQuestion,
    skippedQuestionIds,
    autoPopulatedResponses: autoResponses,
    progress: {
      questionNumber: autoResponses.length + 1,
      totalQuestions: QUESTION_BANK.length,
      phase: firstQuestion.phase,
      section: firstQuestion.section,
      completedPercentage: Math.round((autoResponses.length / QUESTION_BANK.length) * 100),
    },
  });
});

// --- Interview Respond ---

app.post("/api/interview/respond", async (req, res) => {
  try {
    const { sessionId, questionId, answer, conversationHistory } = req.body;

    const session = loadSession(sessionId);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const currentQuestion = getQuestionById(questionId);
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

      const aiResponse = await generateFollowUp(session, currentQuestion, history);

      const isComplete = aiResponse.includes("[QUESTION_COMPLETE]");
      const cleanResponse = aiResponse.replace("[QUESTION_COMPLETE]", "").trim();

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
    const remaining = QUESTION_BANK.filter((q) => !answeredIds.has(q.id as string));

    if (remaining.length === 0) {
      session.status = "completed";
      saveSession(session);
      res.json({ type: "complete", session });
      return;
    }

    // Filter out questions that can be trivially deduced
    const smartRemaining = filterDeducibleQuestions(remaining, session);
    const respondFilteredOutIds = remaining.filter((q) => !smartRemaining.some((sq) => sq.id === q.id)).map((q) => q.id as string);
    const questionsForAI = smartRemaining.length > 0 ? smartRemaining : remaining;

    // AI-powered question selection (with deduction context)
    let nextQuestion;
    try {
      const selection = await selectNextQuestion(questionsForAI, session);
      const selected = getQuestionById(selection.questionId);
      if (selected) {
        nextQuestion = { ...selected, text: selection.adaptedText || selected.text };
      }
    } catch {
      // fallback
    }

    if (!nextQuestion) nextQuestion = remaining[0];

    session.currentQuestionIndex = QUESTION_BANK.findIndex((q) => q.id === nextQuestion!.id);
    session.currentPhase = nextQuestion.phase;
    session.currentSection = nextQuestion.section;
    saveSession(session);

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
        totalQuestions: QUESTION_BANK.length,
        phase: nextQuestion.phase,
        section: nextQuestion.section,
        completedPercentage: Math.round((session.responses.length / QUESTION_BANK.length) * 100),
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
    const session = loadSession(sessionId);
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

    const currentQuestion = getQuestionById(questionId);
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

    saveSession(session);
    res.json({ ok: true, updatedResponse: session.responses[responseIndex] });
  } catch (err) {
    console.error("Update response error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- Navigate to previous question (read-only) ---

app.get("/api/interview/:sessionId/response/:questionId", (req, res) => {
  const session = loadSession(req.params.sessionId);
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
  const question = getQuestionById(req.params.questionId);
  res.json({ response, question });
});

// --- Analyze ---

app.post("/api/interview/analyze", async (req, res) => {
  try {
    const { sessionId } = req.body;
    const session = loadSession(sessionId);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    if (session.responses.length < 5) {
      res.status(400).json({ error: "Not enough responses. Need at least 5." });
      return;
    }

    const analysis = await runCascadeAnalysis(session);
    session.analysis = analysis;
    session.status = "analyzed";
    saveSession(session);

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
  res.json({ token: process.env.DEEPGRAM_API_KEY });
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
  conversationHistory: Array<{ role: string; content: string }>
) {
  const client = getAnthropicClient();
  const participant = session.participant as { name: string; role: string; company: string; industry: string; teamSize: string };
  const responses = session.responses as Array<{ questionText: string; answer: unknown }>;
  const researchContext = getResearchContext(session);

  const contextSummary = responses.length > 0
    ? responses.map((r) => `Q: ${r.questionText}\nA: ${typeof r.answer === "object" ? JSON.stringify(r.answer) : r.answer}`).join("\n\n")
    : "No prior responses yet.";

  const systemPrompt = `You are an expert interviewer for HMN (Human Machine Network), conducting an AI readiness assessment.

PARTICIPANT: ${participant.name}, ${participant.role} at ${participant.company} (${participant.industry}, team size: ${participant.teamSize})
${researchContext}

PRIOR RESPONSES:
${contextSummary}

CURRENT QUESTION: ${currentQuestion.section} / ${currentQuestion.phase}
SCORING: ${(currentQuestion.scoringDimensions as string[])?.join(", ") || "general"}

${currentQuestion.aiFollowUpPrompt ? `FOLLOW-UP GUIDANCE:\n${currentQuestion.aiFollowUpPrompt}` : ""}

YOUR ROLE:
- Warm, professional, genuinely curious
- Ask ONE follow-up at a time
- Dig deeper based on what they actually said
- USE your research intel to ask more targeted, informed questions
- Reference specific things you know about them/their company when relevant
- Listen for specificity vs. vagueness, contradictions, emotional charge
- Keep responses concise (2-3 sentences before your follow-up)
- When this topic feels complete (usually 2-3 exchanges), say: [QUESTION_COMPLETE]
- Never break character. You are a human interviewer.`;

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
    model: MODEL,
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
    model: MODEL,
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

async function runCascadeAnalysis(session: Record<string, unknown>) {
  const client = getAnthropicClient();
  const participant = session.participant as { name: string; role: string; company: string; industry: string; teamSize: string };
  const responses = session.responses as Array<{
    questionId: string; questionText: string; answer: unknown;
    aiFollowUps?: Array<{ question: string; answer: string }>;
    confidenceIndicators: { specificity: number; emotionalCharge: number; consistency: number };
  }>;
  const researchContext = getResearchContext(session);

  const allResponses = responses.map((r) => {
    let answerText = typeof r.answer === "object" ? JSON.stringify(r.answer) : String(r.answer);
    if (r.aiFollowUps?.length) {
      answerText += "\n  Follow-ups:\n" + r.aiFollowUps.map((f) => `  Q: ${f.question}\n  A: ${f.answer}`).join("\n");
    }
    return `[${r.questionId}] Q: ${r.questionText}\nA: ${answerText}\nConfidence: spec=${r.confidenceIndicators.specificity.toFixed(2)}, emo=${r.confidenceIndicators.emotionalCharge.toFixed(2)}, cons=${r.confidenceIndicators.consistency.toFixed(2)}`;
  }).join("\n\n---\n\n");

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: `You are an expert AI readiness analyst for HMN. Analyze the interview and return comprehensive JSON.

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
}`,
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
// SPA FALLBACK (must be after all API routes)
// ============================================================

if (IS_PROD) {
  app.get("*", (_req, res) => {
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
  });
});
