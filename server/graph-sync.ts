// ============================================================
// HMN CASCADE - Session-to-Graph Sync Module
// ============================================================

import Anthropic from "@anthropic-ai/sdk";
import { isGraphEnabled, runWrite } from "./neo4j.js";
import { listSessionsWithResponses } from "./supabase.js";
import type { InterviewSession, QuestionResponse, CascadeAnalysis } from "../src/lib/types";

// --- Main Sync Function ---

export async function syncSessionToGraph(session: InterviewSession): Promise<void> {
  if (!isGraphEnabled()) return;

  const sessionId = session.id;
  console.log(`[GRAPH] Syncing session ${sessionId} to graph...`);

  try {
    // 1. MERGE Company node — tag with source:cascade
    const companyName = session.participant.company || "Unknown";
    await runWrite(
      `MERGE (c:Company {name: $name})
       ON CREATE SET c.createdAt = datetime()
       SET c.source = "cascade"`,
      { name: companyName },
    );

    // 2. MERGE Participant node — tag with source:cascade
    const email = session.participant.email || `${sessionId}@no-email`;
    await runWrite(
      `MERGE (p:Participant {email: $email})
       ON CREATE SET p.name = $name, p.role = $role, p.createdAt = datetime()
       ON MATCH SET p.name = $name, p.role = $role
       SET p.source = "cascade"`,
      {
        email,
        name: session.participant.name || "Unknown",
        role: session.participant.role || "Unknown",
      },
    );

    // 3. MERGE Session node — tag with source:cascade
    const overallScore = (session.analysis as CascadeAnalysis | undefined)?.overallReadinessScore ?? null;
    await runWrite(
      `MERGE (s:Session {id: $id})
       SET s.status = $status,
           s.createdAt = $createdAt,
           s.overallScore = $overallScore,
           s.responseCount = $responseCount,
           s.source = "cascade"`,
      {
        id: sessionId,
        status: session.status,
        createdAt: session.createdAt,
        overallScore,
        responseCount: session.responses.length,
      },
    );

    // 4. MERGE Assessment node — tag with source:cascade
    const assessmentId = session.assessmentTypeId || "ai-readiness";
    await runWrite(
      `MERGE (a:Assessment {id: $id})
       ON CREATE SET a.createdAt = datetime()
       SET a.source = "cascade"`,
      { id: assessmentId },
    );

    // 5. Create relationships (match cascade-tagged nodes)
    await runWrite(
      `MATCH (p:Participant {email: $email}), (c:Company {name: $company})
       WHERE p.source = "cascade" AND c.source = "cascade"
       MERGE (p)-[:WORKS_AT]->(c)`,
      { email, company: companyName },
    );

    await runWrite(
      `MATCH (p:Participant {email: $email}), (s:Session {id: $sessionId})
       WHERE p.source = "cascade" AND s.source = "cascade"
       MERGE (p)-[:COMPLETED]->(s)`,
      { email, sessionId },
    );

    await runWrite(
      `MATCH (s:Session {id: $sessionId}), (a:Assessment {id: $assessmentId})
       WHERE s.source = "cascade" AND a.source = "cascade"
       MERGE (s)-[:FOR_ASSESSMENT]->(a)`,
      { sessionId, assessmentId },
    );

    // 6. If analysis exists, create scoring relationships
    const analysis = session.analysis as CascadeAnalysis | undefined;
    if (analysis) {
      if (analysis.dimensionScores?.length) {
        for (const ds of analysis.dimensionScores) {
          await runWrite(
            `MERGE (sd:ScoringDimension {name: $dimension})
             SET sd.source = "cascade"
             WITH sd
             MATCH (s:Session {id: $sessionId}) WHERE s.source = "cascade"
             MERGE (s)-[r:SCORED]->(sd)
             SET r.score = $score, r.confidence = $confidence`,
            {
              dimension: ds.dimension,
              sessionId,
              score: ds.score,
              confidence: ds.confidence,
            },
          );
        }
      }

      if (analysis.archetype) {
        await runWrite(
          `MERGE (ar:Archetype {name: $archetype})
           SET ar.source = "cascade"
           WITH ar
           MATCH (s:Session {id: $sessionId}) WHERE s.source = "cascade"
           MERGE (s)-[r:CLASSIFIED_AS]->(ar)
           SET r.confidence = $confidence, r.description = $description`,
          {
            archetype: analysis.archetype,
            sessionId,
            confidence: analysis.archetypeConfidence ?? null,
            description: analysis.archetypeDescription || "",
          },
        );
      }

      if (analysis.redFlags?.length) {
        for (const flag of analysis.redFlags) {
          await runWrite(
            `MATCH (s:Session {id: $sessionId}) WHERE s.source = "cascade"
             CREATE (rf:RedFlag {description: $description, severity: $severity, type: $type, source: "cascade", createdAt: datetime()})
             CREATE (s)-[:FLAGGED]->(rf)`,
            {
              sessionId,
              description: flag.description,
              severity: flag.severity,
              type: flag.type,
            },
          );
        }
      }

      if (analysis.greenLights?.length) {
        for (const light of analysis.greenLights) {
          await runWrite(
            `MATCH (s:Session {id: $sessionId}) WHERE s.source = "cascade"
             CREATE (gl:GreenLight {description: $description, severity: $severity, type: $type, source: "cascade", createdAt: datetime()})
             CREATE (s)-[:HIGHLIGHTED]->(gl)`,
            {
              sessionId,
              description: light.description,
              severity: light.severity,
              type: light.type,
            },
          );
        }
      }

      if (analysis.serviceRecommendations?.length) {
        for (const rec of analysis.serviceRecommendations) {
          await runWrite(
            `MERGE (r:Recommendation {service: $service})
             SET r.source = "cascade"
             WITH r
             MATCH (s:Session {id: $sessionId}) WHERE s.source = "cascade"
             MERGE (s)-[rel:TRIGGERED]->(r)
             ON CREATE SET r.description = $description, r.tier = $tier, r.urgency = $urgency
             SET rel.estimatedValue = $estimatedValue, rel.confidence = $confidence`,
            {
              sessionId,
              service: rec.service,
              description: rec.description,
              tier: rec.tier,
              urgency: rec.urgency,
              estimatedValue: rec.estimatedValue || "",
              confidence: rec.confidence ?? null,
            },
          );
        }
      }
    }

    // 7. Extract and sync themes from AI conversation responses
    await extractAndSyncThemes(session);

    console.log(`[GRAPH] Session ${sessionId} synced successfully`);
  } catch (err) {
    console.error(`[GRAPH] Failed to sync session ${sessionId}:`, (err as Error).message);
  }
}

// --- Intelligence Extraction via Claude (replaces standalone LangExtract pipeline) ---

interface ExtractedTheme {
  name: string;
  sentiment: "positive" | "negative" | "neutral" | "mixed";
  category: string;
  relatedDimensions: string[];
  evidence?: string;
  confidence?: number;
}

interface ExtractedTool {
  name: string;
  usageFrequency?: string;
  sophistication?: string;
  useCase?: string;
}

interface ExtractedPainPoint {
  description: string;
  severity: string;
  area: string;
  potentialAiSolution?: string;
}

interface ExtractedGoal {
  description: string;
  timeframe?: string;
  relatedToAi: boolean;
}

interface ExtractedQuote {
  text: string;
  context: string;
  sentiment: string;
  usableAsTestimonial: boolean;
}

interface SessionIntelligence {
  themes: ExtractedTheme[];
  tools: ExtractedTool[];
  painPoints: ExtractedPainPoint[];
  goals: ExtractedGoal[];
  quotes: ExtractedQuote[];
}

function buildResponseText(session: InterviewSession): string {
  const textResponses = session.responses.filter(
    (r: QuestionResponse) =>
      (r.inputType === "ai_conversation" || r.inputType === "open_text") &&
      !(r as Record<string, unknown>).skipped,
  );

  return textResponses.map((r: QuestionResponse) => {
    const followUps = (r.aiFollowUps || [])
      .map((f) => `  Follow-up Q: ${f.question}\n  Follow-up A: ${f.answer}`)
      .join("\n");
    const answerStr = Array.isArray(r.answer) ? r.answer.join(", ") : String(r.answer);
    return `Q: ${r.questionText}\nA: ${answerStr}${followUps ? "\n" + followUps : ""}`;
  }).join("\n\n");
}

function parseJsonResponse(text: string): unknown {
  let jsonStr = text.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }
  return JSON.parse(jsonStr);
}

export async function extractAndSyncThemes(session: InterviewSession): Promise<void> {
  return extractAndSyncIntelligence(session);
}

export async function extractAndSyncIntelligence(session: InterviewSession): Promise<void> {
  if (!isGraphEnabled()) return;

  const responseTexts = buildResponseText(session);
  if (!responseTexts.trim()) {
    console.log(`[GRAPH] No text responses for session ${session.id}, skipping intelligence extraction`);
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("[GRAPH] ANTHROPIC_API_KEY not set, skipping intelligence extraction");
    return;
  }

  const participant = session.participant;

  try {
    const anthropic = new Anthropic({ apiKey });
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: `Analyze this AI readiness assessment conversation with ${participant.name || "a participant"} from ${participant.company || "unknown company"} (${participant.role || "unknown role"}).

Extract ALL of the following. Return ONLY valid JSON, no additional text.

{
  "themes": [
    {
      "name": "short theme name (2-5 words)",
      "sentiment": "positive" | "negative" | "neutral" | "mixed",
      "category": "tool" | "pain_point" | "goal" | "capability" | "process" | "culture" | "strategy",
      "relatedDimensions": ["ai_awareness", "ai_action", "process_readiness", "strategic_clarity", "change_energy", "team_capacity", "mission_alignment", "investment_readiness"],
      "evidence": "supporting quote or paraphrase",
      "confidence": 0.8
    }
  ],
  "tools": [
    {
      "name": "tool name",
      "usageFrequency": "daily" | "weekly" | "occasionally" | "tried_once" | "never",
      "sophistication": "basic" | "intermediate" | "advanced",
      "useCase": "what they use it for"
    }
  ],
  "painPoints": [
    {
      "description": "the challenge",
      "severity": "critical" | "high" | "medium" | "low",
      "area": "operations" | "hiring" | "sales" | "marketing" | "product" | "leadership" | "culture",
      "potentialAiSolution": "how AI could help"
    }
  ],
  "goals": [
    {
      "description": "desired outcome",
      "timeframe": "immediate" | "near_term" | "long_term",
      "relatedToAi": true
    }
  ],
  "quotes": [
    {
      "text": "exact or near-exact quote",
      "context": "what prompted it",
      "sentiment": "positive" | "negative" | "neutral",
      "usableAsTestimonial": false
    }
  ]
}

Extract 3-8 themes, all tools mentioned, top pain points, goals, and 1-3 standout quotes.

=== CONVERSATION ===
${responseTexts}`,
        },
      ],
    });

    const content = message.content[0];
    if (content.type !== "text") return;

    let intel: SessionIntelligence;
    try {
      const parsed = parseJsonResponse(content.text) as SessionIntelligence;
      intel = {
        themes: parsed.themes || [],
        tools: parsed.tools || [],
        painPoints: parsed.painPoints || [],
        goals: parsed.goals || [],
        quotes: parsed.quotes || [],
      };
    } catch (parseErr) {
      console.error("[GRAPH] Failed to parse intelligence extraction:", (parseErr as Error).message);
      return;
    }

    const sessionId = session.id;

    // --- Sync themes ---
    for (const theme of intel.themes) {
      await runWrite(
        `MERGE (t:Theme {name: $name})
         ON CREATE SET t.category = $category, t.createdAt = datetime()
         SET t.source = "cascade"`,
        { name: theme.name, category: theme.category },
      );
      await runWrite(
        `MATCH (s:Session {id: $sessionId}), (t:Theme {name: $themeName})
         WHERE s.source = "cascade" AND t.source = "cascade"
         MERGE (s)-[r:SURFACED]->(t)
         SET r.sentiment = $sentiment, r.confidence = $confidence, r.evidence = $evidence`,
        {
          sessionId,
          themeName: theme.name,
          sentiment: theme.sentiment,
          confidence: theme.confidence ?? 0.8,
          evidence: theme.evidence || "",
        },
      );
      for (const dim of theme.relatedDimensions || []) {
        await runWrite(
          `MERGE (sd:ScoringDimension {name: $dimension})
           SET sd.source = "cascade"
           WITH sd
           MATCH (t:Theme {name: $themeName}) WHERE t.source = "cascade"
           MERGE (t)-[:RELATES_TO]->(sd)`,
          { dimension: dim, themeName: theme.name },
        );
      }
    }

    // --- Sync tools ---
    for (const tool of intel.tools) {
      await runWrite(
        `MERGE (t:Tool {name: $name})
         ON CREATE SET t.createdAt = datetime()
         SET t.source = "cascade"
         WITH t
         MATCH (s:Session {id: $sessionId}) WHERE s.source = "cascade"
         MERGE (s)-[r:USES_TOOL]->(t)
         SET r.frequency = $frequency, r.sophistication = $sophistication, r.useCase = $useCase`,
        {
          name: tool.name,
          sessionId,
          frequency: tool.usageFrequency || "unknown",
          sophistication: tool.sophistication || "unknown",
          useCase: tool.useCase || "",
        },
      );
    }

    // --- Sync pain points ---
    for (const pp of intel.painPoints) {
      await runWrite(
        `MERGE (p:PainPoint {description: $desc})
         ON CREATE SET p.createdAt = datetime()
         SET p.severity = $severity, p.area = $area, p.source = "cascade"
         WITH p
         MATCH (s:Session {id: $sessionId}) WHERE s.source = "cascade"
         MERGE (s)-[r:HAS_PAIN_POINT]->(p)
         SET r.potentialAiSolution = $solution`,
        {
          desc: pp.description,
          sessionId,
          severity: pp.severity,
          area: pp.area,
          solution: pp.potentialAiSolution || "",
        },
      );
    }

    // --- Sync goals ---
    for (const goal of intel.goals) {
      await runWrite(
        `MERGE (g:Goal {description: $desc})
         ON CREATE SET g.createdAt = datetime()
         SET g.timeframe = $timeframe, g.relatedToAi = $aiRelated, g.source = "cascade"
         WITH g
         MATCH (s:Session {id: $sessionId}) WHERE s.source = "cascade"
         MERGE (s)-[:HAS_GOAL]->(g)`,
        {
          desc: goal.description,
          sessionId,
          timeframe: goal.timeframe || "unspecified",
          aiRelated: goal.relatedToAi ?? false,
        },
      );
    }

    // --- Sync quotes ---
    for (const quote of intel.quotes) {
      await runWrite(
        `MATCH (s:Session {id: $sessionId}) WHERE s.source = "cascade"
         CREATE (q:Quote {text: $text, context: $context, sentiment: $sentiment, testimonial: $testimonial, source: "cascade", createdAt: datetime()})
         CREATE (s)-[:QUOTED]->(q)`,
        {
          sessionId,
          text: quote.text,
          context: quote.context,
          sentiment: quote.sentiment,
          testimonial: quote.usableAsTestimonial ?? false,
        },
      );
    }

    console.log(`[GRAPH] Intelligence extracted for session ${sessionId}: ${intel.themes.length} themes, ${intel.tools.length} tools, ${intel.painPoints.length} pain points, ${intel.goals.length} goals, ${intel.quotes.length} quotes`);
  } catch (err) {
    console.error(`[GRAPH] Intelligence extraction failed for session ${session.id}:`, (err as Error).message);
  }
}

// --- Batch Seed Function ---

export async function seedAllSessionsToGraph(): Promise<void> {
  if (!isGraphEnabled()) {
    console.log("[GRAPH] Neo4j not configured, skipping seed");
    return;
  }

  console.log("[GRAPH] Starting full session seed to graph...");

  try {
    // Clean up existing cascade-tagged nodes before re-seeding
    console.log("[GRAPH] Clearing old cascade-tagged nodes...");
    await runWrite(`MATCH (n) WHERE n.source = "cascade" DETACH DELETE n`, {});
    console.log("[GRAPH] Old cascade nodes cleared");

    const sessions = await listSessionsWithResponses();
    console.log(`[GRAPH] Found ${sessions.length} sessions to seed`);

    for (let i = 0; i < sessions.length; i++) {
      const session = sessions[i];
      console.log(`[GRAPH] Seeding ${i + 1}/${sessions.length} (${session.id})`);
      await syncSessionToGraph(session);
    }

    console.log(`[GRAPH] Seed complete: ${sessions.length} sessions synced`);
  } catch (err) {
    console.error("[GRAPH] Seed failed:", (err as Error).message);
  }
}
