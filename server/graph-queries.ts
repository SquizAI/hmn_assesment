import { runQuery } from "./neo4j.js";

// ============================================================
// GRAPH QUERY LAYER — Neo4j Cypher queries for intelligence
// ============================================================

export async function getCompanyIntelligence(companyName: string) {
  console.log(`[GRAPH-QUERY] getCompanyIntelligence: ${companyName}`);

  const records = await runQuery(
    `
    MATCH (c:Company {name: $companyName, source: "cascade"})<-[:WORKS_AT]-(p:Participant {source: "cascade"})-[:COMPLETED]->(s:Session {source: "cascade"})
    OPTIONAL MATCH (s)-[:SCORED]->(d:ScoringDimension {source: "cascade"})
    OPTIONAL MATCH (s)-[:CLASSIFIED_AS]->(a:Archetype {source: "cascade"})
    OPTIONAL MATCH (s)-[:SURFACED]->(t:Theme {source: "cascade"})
    OPTIONAL MATCH (s)-[:TRIGGERED]->(r:Recommendation {source: "cascade"})
    OPTIONAL MATCH (s)-[:FLAGGED]->(rf:RedFlag {source: "cascade"})
    OPTIONAL MATCH (s)-[:HIGHLIGHTED]->(gl:GreenLight {source: "cascade"})
    RETURN p, s, d, a, t, r, rf, gl
    `,
    { companyName }
  );

  if (!records.length) {
    console.log(`[GRAPH-QUERY] No data found for company: ${companyName}`);
    return {
      participants: [],
      dimensionScores: [],
      themes: [],
      archetypeDistribution: [],
      recommendations: [],
      redFlags: [],
      greenLights: [],
      benchmarkComparison: [],
    };
  }

  // Aggregate participants
  const participantMap = new Map<string, { name: string; email: string; role: string; sessionCount: number; scores: number[]; archetype: string | null }>();
  const dimensionMap = new Map<string, { scores: number[] }>();
  const themeMap = new Map<string, { sentiment: string; frequency: number; category: string }>();
  const archetypeMap = new Map<string, number>();
  const recMap = new Map<string, { tier: string[]; confidence: number[]; count: number }>();
  const redFlagMap = new Map<string, number>();
  const greenLightMap = new Map<string, number>();

  for (const record of records) {
    const p = record.get("p");
    const s = record.get("s");
    const d = record.get("d");
    const a = record.get("a");
    const t = record.get("t");
    const r = record.get("r");
    const rf = record.get("rf");
    const gl = record.get("gl");

    if (p && s) {
      const pId = p.properties.email || p.properties.name;
      if (!participantMap.has(pId)) {
        participantMap.set(pId, {
          name: p.properties.name,
          email: p.properties.email || "",
          role: p.properties.role || "",
          sessionCount: 0,
          scores: [],
          archetype: null,
        });
      }
      const entry = participantMap.get(pId)!;
      if (s.properties.overallScore != null) {
        entry.scores.push(Number(s.properties.overallScore));
      }
      // Count unique sessions
      entry.sessionCount = new Set([...entry.scores]).size || 1;
      if (a) {
        entry.archetype = a.properties.name;
      }
    }

    if (d) {
      const dimName = d.properties.name;
      if (!dimensionMap.has(dimName)) {
        dimensionMap.set(dimName, { scores: [] });
      }
      if (d.properties.score != null) {
        dimensionMap.get(dimName)!.scores.push(Number(d.properties.score));
      }
    }

    if (a) {
      const aName = a.properties.name;
      archetypeMap.set(aName, (archetypeMap.get(aName) || 0) + 1);
    }

    if (t) {
      const tName = t.properties.name;
      if (!themeMap.has(tName)) {
        themeMap.set(tName, {
          sentiment: t.properties.sentiment || "neutral",
          frequency: 0,
          category: t.properties.category || "general",
        });
      }
      themeMap.get(tName)!.frequency++;
    }

    if (r) {
      const rService = r.properties.service || r.properties.name;
      if (!recMap.has(rService)) {
        recMap.set(rService, { tier: [], confidence: [], count: 0 });
      }
      const re = recMap.get(rService)!;
      re.count++;
      if (r.properties.tier) re.tier.push(r.properties.tier);
      if (r.properties.confidence != null) re.confidence.push(Number(r.properties.confidence));
    }

    if (rf) {
      const desc = rf.properties.description || rf.properties.name;
      redFlagMap.set(desc, (redFlagMap.get(desc) || 0) + 1);
    }

    if (gl) {
      const desc = gl.properties.description || gl.properties.name;
      greenLightMap.set(desc, (greenLightMap.get(desc) || 0) + 1);
    }
  }

  // Build participants list
  const participants = Array.from(participantMap.values()).map((p) => ({
    name: p.name,
    email: p.email,
    role: p.role,
    sessionCount: p.sessionCount,
    avgScore: p.scores.length ? p.scores.reduce((a, b) => a + b, 0) / p.scores.length : 0,
    archetype: p.archetype,
  }));

  // Build dimension scores
  const dimensionScores = Array.from(dimensionMap.entries()).map(([dimension, data]) => ({
    dimension,
    avg: data.scores.length ? data.scores.reduce((a, b) => a + b, 0) / data.scores.length : 0,
    min: data.scores.length ? Math.min(...data.scores) : 0,
    max: data.scores.length ? Math.max(...data.scores) : 0,
    count: data.scores.length,
  }));

  // Build themes sorted by frequency
  const themes = Array.from(themeMap.entries())
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.frequency - a.frequency);

  // Build archetype distribution
  const archetypeDistribution = Array.from(archetypeMap.entries()).map(([archetype, count]) => ({
    archetype,
    count,
  }));

  // Build recommendations
  const recommendations = Array.from(recMap.entries()).map(([service, data]) => ({
    service,
    tier: data.tier[0] || "standard",
    frequency: data.count,
    avgConfidence: data.confidence.length
      ? data.confidence.reduce((a, b) => a + b, 0) / data.confidence.length
      : 0,
  }));

  // Build red flags and green lights
  const redFlags = Array.from(redFlagMap.entries()).map(([description, frequency]) => ({
    description,
    frequency,
  }));

  const greenLights = Array.from(greenLightMap.entries()).map(([description, frequency]) => ({
    description,
    frequency,
  }));

  // Benchmark comparison: company avg vs global avg per dimension (cascade-only)
  const benchmarkRecords = await runQuery(
    `
    MATCH (s:Session {source: "cascade"})-[:SCORED]->(d:ScoringDimension {source: "cascade"})
    RETURN d.name AS dimension, avg(d.score) AS globalAvg
    `,
    {}
  );

  const globalAvgs = new Map<string, number>();
  for (const rec of benchmarkRecords) {
    globalAvgs.set(rec.get("dimension"), Number(rec.get("globalAvg")));
  }

  const benchmarkComparison = dimensionScores.map((ds) => ({
    dimension: ds.dimension,
    companyAvg: ds.avg,
    globalAvg: globalAvgs.get(ds.dimension) || 0,
    delta: ds.avg - (globalAvgs.get(ds.dimension) || 0),
  }));

  return {
    participants,
    dimensionScores,
    themes,
    archetypeDistribution,
    recommendations,
    redFlags,
    greenLights,
    benchmarkComparison,
  };
}

export async function getAssessmentSummary(assessmentId: string) {
  console.log(`[GRAPH-QUERY] getAssessmentSummary: ${assessmentId}`);

  const records = await runQuery(
    `
    MATCH (assess:Assessment {id: $assessmentId, source: "cascade"})<-[:FOR_ASSESSMENT]-(s:Session {source: "cascade"})
    OPTIONAL MATCH (s)-[:SCORED]->(d:ScoringDimension {source: "cascade"})
    OPTIONAL MATCH (s)-[:CLASSIFIED_AS]->(a:Archetype {source: "cascade"})
    OPTIONAL MATCH (s)-[:SURFACED]->(t:Theme {source: "cascade"})
    OPTIONAL MATCH (s)-[:TRIGGERED]->(r:Recommendation {source: "cascade"})
    OPTIONAL MATCH (s)<-[:COMPLETED]-(p:Participant {source: "cascade"})-[:WORKS_AT]->(c:Company {source: "cascade"})
    RETURN s, d, a, t, r, p, c
    `,
    { assessmentId }
  );

  if (!records.length) {
    console.log(`[GRAPH-QUERY] No data found for assessment: ${assessmentId}`);
    return {
      totalCompletions: 0,
      avgScore: 0,
      scoreDistribution: { "0-20": 0, "20-40": 0, "40-60": 0, "60-80": 0, "80-100": 0 },
      archetypeDistribution: [],
      dimensionAverages: [],
      topThemes: [],
      companies: [],
      recommendations: [],
    };
  }

  const scores: number[] = [];
  const sessionIds = new Set<string>();
  const archetypeMap = new Map<string, number>();
  const dimensionMap = new Map<string, number[]>();
  const themeMap = new Map<string, number>();
  const companySet = new Set<string>();
  const recMap = new Map<string, { count: number; tier: string[] }>();

  for (const record of records) {
    const s = record.get("s");
    const d = record.get("d");
    const a = record.get("a");
    const t = record.get("t");
    const r = record.get("r");
    const c = record.get("c");

    if (s && !sessionIds.has(s.properties.id)) {
      sessionIds.add(s.properties.id);
      if (s.properties.overallScore != null) {
        scores.push(Number(s.properties.overallScore));
      }
    }

    if (a) {
      const aName = a.properties.name;
      archetypeMap.set(aName, (archetypeMap.get(aName) || 0) + 1);
    }

    if (d) {
      const dimName = d.properties.name;
      if (!dimensionMap.has(dimName)) dimensionMap.set(dimName, []);
      if (d.properties.score != null) dimensionMap.get(dimName)!.push(Number(d.properties.score));
    }

    if (t) {
      const tName = t.properties.name;
      themeMap.set(tName, (themeMap.get(tName) || 0) + 1);
    }

    if (c) {
      companySet.add(c.properties.name);
    }

    if (r) {
      const rService = r.properties.service || r.properties.name;
      if (!recMap.has(rService)) recMap.set(rService, { count: 0, tier: [] });
      const re = recMap.get(rService)!;
      re.count++;
      if (r.properties.tier) re.tier.push(r.properties.tier);
    }
  }

  const totalCompletions = sessionIds.size;
  const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

  // Score distribution histogram
  const scoreDistribution = { "0-20": 0, "20-40": 0, "40-60": 0, "60-80": 0, "80-100": 0 };
  for (const score of scores) {
    if (score < 20) scoreDistribution["0-20"]++;
    else if (score < 40) scoreDistribution["20-40"]++;
    else if (score < 60) scoreDistribution["40-60"]++;
    else if (score < 80) scoreDistribution["60-80"]++;
    else scoreDistribution["80-100"]++;
  }

  const archetypeDistribution = Array.from(archetypeMap.entries()).map(([archetype, count]) => ({
    archetype,
    count,
  }));

  const dimensionAverages = Array.from(dimensionMap.entries()).map(([dimension, dimScores]) => ({
    dimension,
    avg: dimScores.length ? dimScores.reduce((a, b) => a + b, 0) / dimScores.length : 0,
  }));

  const topThemes = Array.from(themeMap.entries())
    .map(([name, frequency]) => ({ name, frequency }))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 20);

  const companies = Array.from(companySet);

  const recommendations = Array.from(recMap.entries())
    .map(([service, data]) => ({ service, count: data.count, topTier: data.tier[0] || "standard" }))
    .sort((a, b) => b.count - a.count);

  return {
    totalCompletions,
    avgScore,
    scoreDistribution,
    archetypeDistribution,
    dimensionAverages,
    topThemes,
    companies,
    recommendations,
  };
}

export async function getCrossCompanyBenchmarks() {
  console.log("[GRAPH-QUERY] getCrossCompanyBenchmarks");

  // Industry averages (cascade-only)
  const industryResult = await runQuery(
    `
    MATCH (c:Company {source: "cascade"})<-[:WORKS_AT]-(p:Participant {source: "cascade"})-[:COMPLETED]->(s:Session {source: "cascade"})
    WHERE c.industry IS NOT NULL
    OPTIONAL MATCH (s)-[:CLASSIFIED_AS]->(a:Archetype {source: "cascade"})
    WITH c.industry AS industry, s, a
    RETURN industry,
           avg(s.overallScore) AS avgScore,
           count(DISTINCT s) AS sessionCount,
           head(collect(a.name)) AS topArchetype
    ORDER BY avgScore DESC
    `,
    {}
  );

  const industryAverages = industryResult.map((rec) => ({
    industry: rec.get("industry"),
    avgScore: Number(rec.get("avgScore")) || 0,
    sessionCount: Number(rec.get("sessionCount")) || 0,
    topArchetype: rec.get("topArchetype") || null,
  }));

  // Company ranking (cascade-only)
  const companyResult = await runQuery(
    `
    MATCH (c:Company {source: "cascade"})<-[:WORKS_AT]-(p:Participant {source: "cascade"})-[:COMPLETED]->(s:Session {source: "cascade"})
    WITH c.name AS company,
         avg(s.overallScore) AS avgScore,
         count(DISTINCT s) AS sessionCount,
         count(DISTINCT p) AS participantCount
    RETURN company, avgScore, sessionCount, participantCount
    ORDER BY avgScore DESC
    `,
    {}
  );

  const companyRanking = companyResult.map((rec) => ({
    company: rec.get("company"),
    avgScore: Number(rec.get("avgScore")) || 0,
    sessionCount: Number(rec.get("sessionCount")) || 0,
    completionRate: Number(rec.get("participantCount")) || 0,
  }));

  // Trending themes (top 20, cascade-only)
  const themeResult = await runQuery(
    `
    MATCH (s:Session {source: "cascade"})-[:SURFACED]->(t:Theme {source: "cascade"})
    WITH t.name AS name, t.sentiment AS sentiment,
         count(*) AS frequency,
         t.category AS category
    RETURN name, frequency, sentiment, category
    ORDER BY frequency DESC
    LIMIT 20
    `,
    {}
  );

  const trendingThemes = themeResult.map((rec) => ({
    name: rec.get("name"),
    frequency: Number(rec.get("frequency")) || 0,
    sentiment: rec.get("sentiment") || "neutral",
    growthRate: 0, // Would need historical data to calculate
  }));

  // Recommendation frequency (cascade-only)
  const recResult = await runQuery(
    `
    MATCH (s:Session {source: "cascade"})-[:TRIGGERED]->(r:Recommendation {source: "cascade"})
    WITH coalesce(r.service, r.name) AS service, count(*) AS count,
         collect(r.tier) AS tiers
    RETURN service, count, head(tiers) AS avgTier
    ORDER BY count DESC
    `,
    {}
  );

  const recommendationFrequency = recResult.map((rec) => ({
    service: rec.get("service"),
    count: Number(rec.get("count")) || 0,
    avgTier: rec.get("avgTier") || "standard",
  }));

  return {
    industryAverages,
    companyRanking,
    trendingThemes,
    recommendationFrequency,
  };
}

export async function getThemeMap() {
  console.log("[GRAPH-QUERY] getThemeMap");

  // All themes with their associations (cascade-only)
  const themeResult = await runQuery(
    `
    MATCH (s:Session {source: "cascade"})-[:SURFACED]->(t:Theme {source: "cascade"})
    OPTIONAL MATCH (s)<-[:COMPLETED]-(p:Participant {source: "cascade"})-[:WORKS_AT]->(c:Company {source: "cascade"})
    OPTIONAL MATCH (s)-[:SCORED]->(d:ScoringDimension {source: "cascade"})
    WITH t.name AS name, t.sentiment AS sentiment, t.category AS category,
         collect(DISTINCT c.name) AS companies,
         collect(DISTINCT d.name) AS dimensions,
         count(DISTINCT s) AS frequency
    RETURN name, frequency, sentiment, category, companies, dimensions
    ORDER BY frequency DESC
    `,
    {}
  );

  const themes = themeResult.map((rec) => ({
    name: rec.get("name"),
    frequency: Number(rec.get("frequency")) || 0,
    sentiment: rec.get("sentiment") || "neutral",
    category: rec.get("category") || "general",
    companies: (rec.get("companies") as string[]).filter(Boolean),
    dimensions: (rec.get("dimensions") as string[]).filter(Boolean),
  }));

  // Co-occurrences: themes appearing in the same sessions (cascade-only)
  const coResult = await runQuery(
    `
    MATCH (s:Session {source: "cascade"})-[:SURFACED]->(t1:Theme {source: "cascade"})
    MATCH (s)-[:SURFACED]->(t2:Theme {source: "cascade"})
    WHERE id(t1) < id(t2)
    WITH t1.name AS theme1, t2.name AS theme2, count(DISTINCT s) AS frequency
    WHERE frequency > 1
    RETURN theme1, theme2, frequency
    ORDER BY frequency DESC
    LIMIT 50
    `,
    {}
  );

  const coOccurrences = coResult.map((rec) => ({
    theme1: rec.get("theme1"),
    theme2: rec.get("theme2"),
    frequency: Number(rec.get("frequency")) || 0,
  }));

  // Dimension-to-theme mapping (cascade-only)
  const dimThemeResult = await runQuery(
    `
    MATCH (s:Session {source: "cascade"})-[:SCORED]->(d:ScoringDimension {source: "cascade"})
    MATCH (s)-[:SURFACED]->(t:Theme {source: "cascade"})
    WITH d.name AS dimension, collect(DISTINCT t.name) AS themes
    RETURN dimension, themes
    ORDER BY dimension
    `,
    {}
  );

  const dimensionThemeMap = dimThemeResult.map((rec) => ({
    dimension: rec.get("dimension"),
    themes: rec.get("themes") as string[],
  }));

  return {
    themes,
    coOccurrences,
    dimensionThemeMap,
  };
}
