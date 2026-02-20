#!/usr/bin/env python3
"""
HMN Cascade — LangExtract Intelligence Pipeline

Batch processes all analyzed assessment sessions through Google LangExtract
to extract structured themes, tools, pain points, goals, and quotes.
Results are pushed into the Neo4j BeHuman graph database.

Usage:
    python scripts/langextract/extract.py                    # Process all unprocessed sessions
    python scripts/langextract/extract.py --reprocess        # Reprocess all sessions
    python scripts/langextract/extract.py --session ID       # Process single session
"""

import os
import sys
import json
import argparse
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client
from neo4j import GraphDatabase
from schema import (
    SessionExtraction, ExtractedTheme, ExtractedTool,
    ExtractedPainPoint, ExtractedGoal, ExtractedQuote,
)

# Load env from project root
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
load_dotenv(PROJECT_ROOT / ".env")

# ─── Configuration ───────────────────────────────────────────────────────────

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
NEO4J_URI = os.environ.get("NEO4J_URI", "bolt://localhost:7690")
NEO4J_USER = os.environ.get("NEO4J_USERNAME", "neo4j")
NEO4J_PASS = os.environ.get("NEO4J_PASSWORD", "humanglue2024")
NEO4J_DB = os.environ.get("NEO4J_DATABASE", "neo4j")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")

# ─── Clients ─────────────────────────────────────────────────────────────────

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
neo4j_driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASS))


def log(msg: str):
    print(f"[LANGEXTRACT] {datetime.now().strftime('%H:%M:%S')} {msg}")


# ─── Supabase Session Fetcher ────────────────────────────────────────────────

def fetch_analyzed_sessions(session_id: str | None = None) -> list[dict]:
    """Fetch sessions with status='analyzed' from Supabase."""
    query = supabase.table("cascade_sessions").select("*")

    if session_id:
        query = query.eq("id", session_id)
    else:
        query = query.eq("status", "analyzed")

    result = query.execute()
    sessions = result.data or []
    log(f"Fetched {len(sessions)} analyzed sessions from Supabase")
    return sessions


def get_ai_conversation_text(session: dict) -> str:
    """Extract all AI conversation and open text responses as readable text."""
    data = session.get("data") or session
    responses = data.get("responses", [])

    parts = []
    for resp in responses:
        input_type = resp.get("inputType", "")
        if input_type not in ("ai_conversation", "open_text", "voice"):
            continue

        q_text = resp.get("questionText", "Unknown question")
        answer = resp.get("answer", "")

        # Unwrap double-serialized JSON strings
        if isinstance(answer, str) and answer.startswith('"') and answer.endswith('"'):
            try:
                answer = json.loads(answer)
            except (json.JSONDecodeError, ValueError):
                pass

        parts.append(f"Q: {q_text}\nA: {answer}")

        # Include AI follow-ups
        for followup in resp.get("aiFollowUps", []):
            parts.append(f"Follow-up Q: {followup.get('question', '')}")
            parts.append(f"Follow-up A: {followup.get('answer', '')}")

    return "\n\n".join(parts)


# ─── LangExtract Processing ─────────────────────────────────────────────────

def extract_intelligence(session: dict) -> SessionExtraction | None:
    """Use LangExtract + Gemini to extract structured intelligence from a session."""
    try:
        from langextract import Extractor
    except ImportError:
        log("WARNING: langextract not installed, falling back to Gemini direct extraction")
        return extract_with_gemini_direct(session)

    data = session.get("data") or session
    participant = data.get("participant", {})
    conversation_text = get_ai_conversation_text(session)

    if not conversation_text.strip():
        log(f"  No conversation text for session {session['id']}, skipping")
        return None

    extraction_prompt = f"""
You are analyzing an AI readiness assessment conversation with {participant.get('name', 'a participant')}
from {participant.get('company', 'unknown company')} ({participant.get('industry', 'unknown industry')}).
Their role is: {participant.get('role', 'unknown')}.

Extract ALL of the following from their responses:

1. THEMES: Key topics, patterns, and recurring ideas. Categorize as: tool, pain_point, goal, capability, process, culture, strategy.
   Include sentiment (positive/negative/neutral/mixed) and which scoring dimensions relate.
   Dimensions: ai_awareness, ai_action, process_readiness, strategic_clarity, change_energy, team_capacity, mission_alignment, investment_readiness

2. TOOLS: Specific AI tools, software, or platforms mentioned. Note usage frequency and sophistication.

3. PAIN POINTS: Business challenges, bottlenecks, frustrations. Rate severity: critical/high/medium/low.

4. GOALS: Transformation goals or desired outcomes. Note if AI-related and timeframe.

5. QUOTES: Standout direct quotes worth surfacing in reports. Flag if usable as testimonial.

Return structured JSON matching these exact schemas.

=== CONVERSATION TEXT ===
{conversation_text}
"""

    try:
        extractor = Extractor(
            model="gemini-3-flash-preview",
            api_key=GEMINI_API_KEY,
        )

        result = extractor.extract(
            text=conversation_text,
            instruction=extraction_prompt,
            response_model=SessionExtraction,
        )

        if result:
            result.session_id = session["id"]
            result.participant_name = participant.get("name", "Unknown")
            result.company = participant.get("company", "Unknown")
            return result

    except Exception as e:
        log(f"  LangExtract failed for {session['id']}: {e}")
        return extract_with_gemini_direct(session)

    return None


def extract_with_gemini_direct(session: dict) -> SessionExtraction | None:
    """Fallback: use Gemini API directly for extraction."""
    try:
        import google.generativeai as genai
    except ImportError:
        log("ERROR: google-generativeai not installed. pip install google-generativeai")
        return None

    if not GEMINI_API_KEY:
        log("ERROR: GEMINI_API_KEY not set")
        return None

    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel("gemini-3-flash-preview")

    data = session.get("data") or session
    participant = data.get("participant", {})
    conversation_text = get_ai_conversation_text(session)

    if not conversation_text.strip():
        return None

    prompt = f"""Analyze this AI readiness assessment conversation and extract structured intelligence.

Participant: {participant.get('name', 'Unknown')} | Company: {participant.get('company', 'Unknown')} | Role: {participant.get('role', 'Unknown')}

Return ONLY valid JSON (no markdown, no code fences) with this structure:
{{
  "themes": [{{"name": "...", "category": "tool|pain_point|goal|capability|process|culture|strategy", "sentiment": "positive|negative|neutral|mixed", "related_dimensions": ["ai_action", ...], "evidence": "...", "confidence": 0.8}}],
  "tools": [{{"name": "...", "usage_frequency": "daily|weekly|occasionally|tried_once|never", "sophistication": "basic|intermediate|advanced", "use_case": "..."}}],
  "pain_points": [{{"description": "...", "severity": "critical|high|medium|low", "area": "operations|hiring|sales|marketing|product|leadership|culture", "potential_ai_solution": "..."}}],
  "goals": [{{"description": "...", "timeframe": "immediate|near_term|long_term", "related_to_ai": true}}],
  "quotes": [{{"text": "...", "context": "...", "sentiment": "positive|negative|neutral|mixed", "usable_as_testimonial": false}}]
}}

=== CONVERSATION ===
{conversation_text}
"""

    try:
        response = model.generate_content(prompt)
        text = response.text.strip()
        # Strip markdown code fences if present
        if text.startswith("```"):
            text = text.split("\n", 1)[1] if "\n" in text else text[3:]
        if text.endswith("```"):
            text = text[:-3]
        if text.startswith("json"):
            text = text[4:]

        parsed = json.loads(text.strip())

        return SessionExtraction(
            session_id=session["id"],
            participant_name=participant.get("name", "Unknown"),
            company=participant.get("company", "Unknown"),
            themes=[ExtractedTheme(**t) for t in parsed.get("themes", [])],
            tools=[ExtractedTool(**t) for t in parsed.get("tools", [])],
            pain_points=[ExtractedPainPoint(**p) for p in parsed.get("pain_points", [])],
            goals=[ExtractedGoal(**g) for g in parsed.get("goals", [])],
            quotes=[ExtractedQuote(**q) for q in parsed.get("quotes", [])],
        )
    except Exception as e:
        log(f"  Gemini extraction failed for {session['id']}: {e}")
        return None


# ─── Neo4j Sync ──────────────────────────────────────────────────────────────

def sync_extraction_to_graph(extraction: SessionExtraction):
    """Push extracted intelligence into Neo4j as nodes and relationships."""
    with neo4j_driver.session(database=NEO4J_DB) as session:
        # Sync themes
        for theme in extraction.themes:
            session.run("""
                MERGE (t:Theme {name: $name})
                SET t.category = $category, t.updatedAt = datetime()
                WITH t
                MATCH (s:Session {id: $sessionId})
                MERGE (s)-[r:SURFACED]->(t)
                SET r.sentiment = $sentiment, r.confidence = $confidence, r.evidence = $evidence
            """, {
                "name": theme.name,
                "category": theme.category.value,
                "sessionId": extraction.session_id,
                "sentiment": theme.sentiment.value,
                "confidence": theme.confidence,
                "evidence": theme.evidence,
            })

            # Link theme to scoring dimensions
            for dim in theme.related_dimensions:
                session.run("""
                    MERGE (t:Theme {name: $theme})
                    MERGE (d:ScoringDimension {name: $dim})
                    MERGE (t)-[:RELATES_TO]->(d)
                """, {"theme": theme.name, "dim": dim})

        # Sync tools
        for tool in extraction.tools:
            session.run("""
                MERGE (t:Tool {name: $name})
                SET t.updatedAt = datetime()
                WITH t
                MATCH (s:Session {id: $sessionId})
                MERGE (s)-[r:USES_TOOL]->(t)
                SET r.frequency = $frequency, r.sophistication = $sophistication, r.useCase = $useCase
            """, {
                "name": tool.name,
                "sessionId": extraction.session_id,
                "frequency": tool.usage_frequency or "unknown",
                "sophistication": tool.sophistication or "unknown",
                "useCase": tool.use_case or "",
            })

        # Sync pain points
        for pp in extraction.pain_points:
            session.run("""
                MERGE (p:PainPoint {description: $desc})
                SET p.severity = $severity, p.area = $area, p.updatedAt = datetime()
                WITH p
                MATCH (s:Session {id: $sessionId})
                MERGE (s)-[r:HAS_PAIN_POINT]->(p)
                SET r.potentialAiSolution = $solution
            """, {
                "desc": pp.description,
                "severity": pp.severity,
                "area": pp.area,
                "sessionId": extraction.session_id,
                "solution": pp.potential_ai_solution or "",
            })

        # Sync goals
        for goal in extraction.goals:
            session.run("""
                MERGE (g:Goal {description: $desc})
                SET g.timeframe = $timeframe, g.relatedToAi = $aiRelated, g.updatedAt = datetime()
                WITH g
                MATCH (s:Session {id: $sessionId})
                MERGE (s)-[:HAS_GOAL]->(g)
            """, {
                "desc": goal.description,
                "timeframe": goal.timeframe or "unspecified",
                "aiRelated": goal.related_to_ai,
                "sessionId": extraction.session_id,
            })

        # Sync quotes
        for quote in extraction.quotes:
            session.run("""
                MATCH (s:Session {id: $sessionId})
                CREATE (q:Quote {text: $text, context: $context, sentiment: $sentiment, testimonial: $testimonial, createdAt: datetime()})
                CREATE (s)-[:QUOTED]->(q)
            """, {
                "sessionId": extraction.session_id,
                "text": quote.text,
                "context": quote.context,
                "sentiment": quote.sentiment.value,
                "testimonial": quote.usable_as_testimonial,
            })

    log(f"  Synced to Neo4j: {len(extraction.themes)} themes, {len(extraction.tools)} tools, "
        f"{len(extraction.pain_points)} pain points, {len(extraction.goals)} goals, {len(extraction.quotes)} quotes")


# ─── Main Pipeline ───────────────────────────────────────────────────────────

def get_processed_session_ids() -> set[str]:
    """Get session IDs that have already been processed (have SURFACED relationships)."""
    with neo4j_driver.session(database=NEO4J_DB) as session:
        result = session.run("""
            MATCH (s:Session)-[:SURFACED]->(:Theme)
            RETURN DISTINCT s.id AS id
        """)
        return {record["id"] for record in result}


def main():
    parser = argparse.ArgumentParser(description="HMN Cascade LangExtract Intelligence Pipeline")
    parser.add_argument("--reprocess", action="store_true", help="Reprocess all sessions, even already processed ones")
    parser.add_argument("--session", type=str, help="Process a single session by ID")
    args = parser.parse_args()

    log("Starting intelligence extraction pipeline")
    log(f"Neo4j: {NEO4J_URI} | Supabase: {SUPABASE_URL[:40]}...")

    # Verify Neo4j connection
    try:
        with neo4j_driver.session(database=NEO4J_DB) as session:
            result = session.run("RETURN 1 AS n")
            result.single()
        log("Neo4j connection verified")
    except Exception as e:
        log(f"ERROR: Cannot connect to Neo4j: {e}")
        sys.exit(1)

    # Fetch sessions
    sessions = fetch_analyzed_sessions(session_id=args.session)

    if not sessions:
        log("No analyzed sessions found")
        return

    # Filter already processed (unless --reprocess)
    if not args.reprocess and not args.session:
        already_processed = get_processed_session_ids()
        before = len(sessions)
        sessions = [s for s in sessions if s["id"] not in already_processed]
        log(f"Filtered: {before} total, {len(already_processed)} already processed, {len(sessions)} to process")

    if not sessions:
        log("All sessions already processed. Use --reprocess to re-extract.")
        return

    # Process each session
    success_count = 0
    for i, session_row in enumerate(sessions, 1):
        sid = session_row["id"]
        data = session_row.get("data") or session_row
        participant = data.get("participant", {})
        name = participant.get("name", "Unknown")
        company = participant.get("company", "Unknown")

        log(f"[{i}/{len(sessions)}] Processing {name} @ {company} (session: {sid[:20]}...)")

        extraction = extract_intelligence(session_row)
        if extraction:
            sync_extraction_to_graph(extraction)
            success_count += 1
        else:
            log(f"  No extraction produced for session {sid}")

    log(f"Pipeline complete: {success_count}/{len(sessions)} sessions processed successfully")

    # Summary stats
    with neo4j_driver.session(database=NEO4J_DB) as session:
        result = session.run("""
            MATCH (t:Theme) WITH count(t) AS themes
            MATCH (tool:Tool) WITH themes, count(tool) AS tools
            MATCH (pp:PainPoint) WITH themes, tools, count(pp) AS painPoints
            MATCH (g:Goal) WITH themes, tools, painPoints, count(g) AS goals
            MATCH (q:Quote) WITH themes, tools, painPoints, goals, count(q) AS quotes
            RETURN themes, tools, painPoints, goals, quotes
        """)
        stats = result.single()
        if stats:
            log(f"Graph totals: {stats['themes']} themes, {stats['tools']} tools, "
                f"{stats['painPoints']} pain points, {stats['goals']} goals, {stats['quotes']} quotes")

    neo4j_driver.close()


if __name__ == "__main__":
    main()
