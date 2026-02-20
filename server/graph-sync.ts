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
    // 1. MERGE Company node (cascade-scoped)
    const companyName = session.participant.company || "Unknown";
    await runWrite(
      `MERGE (c:Company {name: $name, source: "cascade"})
       ON CREATE SET c.createdAt = datetime()`,
      { name: companyName },
    );

    // 2. MERGE Participant node (cascade-scoped)
    const email = session.participant.email || `${sessionId}@no-email`;
    await runWrite(
      `MERGE (p:Participant {email: $email, source: "cascade"})
       ON CREATE SET p.name = $name, p.role = $role, p.createdAt = datetime()
       ON MATCH SET p.name = $name, p.role = $role`,
      {
        email,
        name: session.participant.name || "Unknown",
        role: session.participant.role || "Unknown",
      },
    );

    // 3. CREATE/MERGE Session node (cascade-scoped)
    const overallScore = (session.analysis as CascadeAnalysis | undefined)?.overallReadinessScore ?? null;
    await runWrite(
      `MERGE (s:Session {id: $id, source: "cascade"})
       SET s.status = $status,
           s.createdAt = $createdAt,
           s.overallScore = $overallScore,
           s.responseCount = $responseCount`,
      {
        id: sessionId,
        status: session.status,
        createdAt: session.createdAt,
        overallScore,
        responseCount: session.responses.length,
      },
    );

    // 4. MERGE Assessment node (cascade-scoped)
    const assessmentId = session.assessmentTypeId || "ai-readiness";
    await runWrite(
      `MERGE (a:Assessment {id: $id, source: "cascade"})
       ON CREATE SET a.createdAt = datetime()`,
      { id: assessmentId },
    );

    // 5. Create relationships: Participant-[:WORKS_AT]->Company (cascade-scoped)
    await runWrite(
      `MATCH (p:Participant {email: $email, source: "cascade"}), (c:Company {name: $company, source: "cascade"})
       MERGE (p)-[:WORKS_AT]->(c)`,
      { email, company: companyName },
    );

    // Participant-[:COMPLETED]->Session
    await runWrite(
      `MATCH (p:Participant {email: $email, source: "cascade"}), (s:Session {id: $sessionId, source: "cascade"})
       MERGE (p)-[:COMPLETED]->(s)`,
      { email, sessionId },
    );

    // Session-[:FOR_ASSESSMENT]->Assessment
    await runWrite(
      `MATCH (s:Session {id: $sessionId, source: "cascade"}), (a:Assessment {id: $assessmentId, source: "cascade"})
       MERGE (s)-[:FOR_ASSESSMENT]->(a)`,
      { sessionId, assessmentId },
    );

    // 6. If analysis exists, create scoring relationships
    const analysis = session.analysis as CascadeAnalysis | undefined;
    if (analysis) {
      // Session-[:SCORED {score}]->ScoringDimension (cascade-scoped)
      if (analysis.dimensionScores?.length) {
        for (const ds of analysis.dimensionScores) {
          await runWrite(
            `MERGE (sd:ScoringDimension {name: $dimension, source: "cascade"})
             WITH sd
             MATCH (s:Session {id: $sessionId, source: "cascade"})
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

      // Session-[:CLASSIFIED_AS]->Archetype (cascade-scoped)
      if (analysis.archetype) {
        await runWrite(
          `MERGE (ar:Archetype {name: $archetype, source: "cascade"})
           WITH ar
           MATCH (s:Session {id: $sessionId, source: "cascade"})
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

      // Session-[:FLAGGED]->RedFlag (cascade-scoped)
      if (analysis.redFlags?.length) {
        for (const flag of analysis.redFlags) {
          await runWrite(
            `MATCH (s:Session {id: $sessionId, source: "cascade"})
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

      // Session-[:HIGHLIGHTED]->GreenLight (cascade-scoped)
      if (analysis.greenLights?.length) {
        for (const light of analysis.greenLights) {
          await runWrite(
            `MATCH (s:Session {id: $sessionId, source: "cascade"})
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

      // Session-[:TRIGGERED]->Recommendation (cascade-scoped)
      if (analysis.serviceRecommendations?.length) {
        for (const rec of analysis.serviceRecommendations) {
          await runWrite(
            `MATCH (s:Session {id: $sessionId, source: "cascade"})
             MERGE (r:Recommendation {service: $service, source: "cascade"})
             ON CREATE SET r.description = $description, r.tier = $tier, r.urgency = $urgency
             MERGE (s)-[rel:TRIGGERED]->(r)
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

    // Sync themes to graph (cascade-scoped)
    for (const theme of themes) {
      // MERGE Theme node
      await runWrite(
        `MERGE (t:Theme {name: $name, source: "cascade"})
         ON CREATE SET t.category = $category, t.createdAt = datetime()`,
        { name: theme.name, category: theme.category },
      );

      // Session-[:SURFACED]->Theme
      await runWrite(
        `MATCH (s:Session {id: $sessionId, source: "cascade"}), (t:Theme {name: $themeName, source: "cascade"})
         MERGE (s)-[r:SURFACED]->(t)
         SET r.sentiment = $sentiment`,
        {
          sessionId: session.id,
          themeName: theme.name,
          sentiment: theme.sentiment,
        },
      );

      // Theme-[:RELATES_TO]->ScoringDimension
      for (const dim of theme.relatedDimensions) {
        await runWrite(
          `MERGE (sd:ScoringDimension {name: $dimension, source: "cascade"})
           WITH sd
           MATCH (t:Theme {name: $themeName, source: "cascade"})
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
    await runWrite(`MATCH (n {source: "cascade"}) DETACH DELETE n`, {});
    console.log("[GRAPH] Old cascade nodes cleared");

    const sessions = await listSessionsWithResponses();
    console.log(`[GRAPH] Found ${sessions.length} sessions to seed`);

    for (let i = 0; i < sessions.length; i++) {
      const session = sessions[i];
      console.log(`[GRAPH] Seeded ${i + 1}/${sessions.length} sessions (${session.id})`);
      await syncSessionToGraph(session);
    }

    console.log(`[GRAPH] Seed complete: ${sessions.length} sessions synced`);
  } catch (err) {
    console.error("[GRAPH] Seed failed:", (err as Error).message);
  }
}
