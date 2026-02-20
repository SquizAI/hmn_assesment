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

// --- Theme Extraction via Claude ---

interface ExtractedTheme {
  name: string;
  sentiment: "positive" | "negative" | "neutral";
  category: string;
  relatedDimensions: string[];
}

export async function extractAndSyncThemes(session: InterviewSession): Promise<void> {
  if (!isGraphEnabled()) return;

  // Filter to free-text and AI conversation responses
  const textResponses = session.responses.filter(
    (r: QuestionResponse) => r.inputType === "ai_conversation" || r.inputType === "open_text",
  );

  if (textResponses.length === 0) {
    console.log(`[GRAPH] No text responses for session ${session.id}, skipping theme extraction`);
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("[GRAPH] ANTHROPIC_API_KEY not set, skipping theme extraction");
    return;
  }

  // Build content from responses
  const responseTexts = textResponses.map((r: QuestionResponse) => {
    const followUps = (r.aiFollowUps || [])
      .map((f) => `  Follow-up Q: ${f.question}\n  Follow-up A: ${f.answer}`)
      .join("\n");
    const answerStr = Array.isArray(r.answer) ? r.answer.join(", ") : String(r.answer);
    return `Q: ${r.questionText}\nA: ${answerStr}${followUps ? "\n" + followUps : ""}`;
  }).join("\n\n");

  try {
    const anthropic = new Anthropic({ apiKey });
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Analyze the following interview responses and extract key themes. Return ONLY valid JSON with no additional text.

Interview responses:
${responseTexts}

Return this exact JSON structure:
{
  "themes": [
    {
      "name": "theme name (short, 2-5 words)",
      "sentiment": "positive" | "negative" | "neutral",
      "category": "tool" | "pain_point" | "opportunity" | "culture" | "process" | "strategy",
      "relatedDimensions": ["ai_awareness", "ai_action", "process_readiness", "strategic_clarity", "change_energy", "team_capacity", "mission_alignment", "investment_readiness"]
    }
  ]
}

Extract 3-8 themes. Only include dimensions that are directly relevant.`,
        },
      ],
    });

    // Parse the response
    const content = message.content[0];
    if (content.type !== "text") return;

    let themes: ExtractedTheme[];
    try {
      // Handle potential markdown code blocks in the response
      let jsonStr = content.text.trim();
      if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
      }
      const parsed = JSON.parse(jsonStr);
      themes = parsed.themes || [];
    } catch (parseErr) {
      console.error("[GRAPH] Failed to parse theme extraction response:", (parseErr as Error).message);
      return;
    }

    // Sync themes to graph (cascade-tagged)
    for (const theme of themes) {
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
         SET r.sentiment = $sentiment`,
        {
          sessionId: session.id,
          themeName: theme.name,
          sentiment: theme.sentiment,
        },
      );

      for (const dim of theme.relatedDimensions) {
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

    console.log(`[GRAPH] Extracted and synced ${themes.length} themes for session ${session.id}`);
  } catch (err) {
    console.error(`[GRAPH] Theme extraction failed for session ${session.id}:`, (err as Error).message);
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
