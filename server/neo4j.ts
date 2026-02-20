// ============================================================
// HMN CASCADE - Neo4j Graph Database Driver & Helpers
// ============================================================

import neo4j, { type Driver, type Record as Neo4jRecord, type Session } from "neo4j-driver";

// --- Configuration ---

const NEO4J_URI = process.env.NEO4J_URI || "bolt://localhost:7690";
const NEO4J_USERNAME = process.env.NEO4J_USERNAME || "neo4j";
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || "humanglue2024";
const NEO4J_DATABASE = process.env.NEO4J_DATABASE || "neo4j";

// --- Lazy Singleton Driver ---

let _driver: Driver | null = null;

export function getDriver(): Driver {
  if (!_driver) {
    console.log(`[GRAPH] Connecting to Neo4j at ${NEO4J_URI}`);
    _driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USERNAME, NEO4J_PASSWORD));
  }
  return _driver;
}

// --- Query Helpers ---

export async function runQuery(cypher: string, params?: Record<string, unknown>): Promise<Neo4jRecord[]> {
  let session: Session | null = null;
  try {
    session = getDriver().session({ database: NEO4J_DATABASE });
    const result = await session.run(cypher, params || {});
    return result.records;
  } catch (err) {
    console.error("[GRAPH] Query error:", (err as Error).message);
    return [];
  } finally {
    if (session) await session.close();
  }
}

export async function runWrite(cypher: string, params?: Record<string, unknown>): Promise<Neo4jRecord[]> {
  let session: Session | null = null;
  try {
    session = getDriver().session({ database: NEO4J_DATABASE });
    const result = await session.executeWrite(async (tx) => {
      return tx.run(cypher, params || {});
    });
    return result.records;
  } catch (err) {
    console.error("[GRAPH] Write error:", (err as Error).message);
    return [];
  } finally {
    if (session) await session.close();
  }
}

// --- Lifecycle ---

export async function closeDriver(): Promise<void> {
  if (_driver) {
    console.log("[GRAPH] Closing Neo4j driver");
    try {
      await _driver.close();
    } catch (err) {
      console.error("[GRAPH] Error closing driver:", (err as Error).message);
    }
    _driver = null;
  }
}

export function isGraphEnabled(): boolean {
  return !!process.env.NEO4J_URI;
}

// --- Schema Initialization ---

export async function initGraphSchema(): Promise<void> {
  if (!isGraphEnabled()) {
    console.log("[GRAPH] Neo4j not configured (NEO4J_URI not set), skipping schema init");
    return;
  }

  console.log("[GRAPH] Initializing graph schema (constraints + indexes)...");

  const constraints = [
    "CREATE CONSTRAINT unique_company_name IF NOT EXISTS FOR (c:Company) REQUIRE c.name IS UNIQUE",
    "CREATE CONSTRAINT unique_participant_email IF NOT EXISTS FOR (p:Participant) REQUIRE p.email IS UNIQUE",
    "CREATE CONSTRAINT unique_session_id IF NOT EXISTS FOR (s:Session) REQUIRE s.id IS UNIQUE",
    "CREATE CONSTRAINT unique_assessment_id IF NOT EXISTS FOR (a:Assessment) REQUIRE a.id IS UNIQUE",
  ];

  const indexes = [
    "CREATE INDEX theme_name IF NOT EXISTS FOR (t:Theme) ON (t.name)",
    "CREATE INDEX scoring_dimension_name IF NOT EXISTS FOR (sd:ScoringDimension) ON (sd.name)",
    "CREATE INDEX archetype_name IF NOT EXISTS FOR (ar:Archetype) ON (ar.name)",
  ];

  for (const stmt of [...constraints, ...indexes]) {
    try {
      await runWrite(stmt);
    } catch (err) {
      console.error("[GRAPH] Schema statement failed:", stmt, (err as Error).message);
    }
  }

  console.log("[GRAPH] Schema initialization complete");
}
