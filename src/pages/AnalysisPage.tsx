import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { CascadeAnalysis, DimensionScore, GapAnalysis, ServiceRecommendation, DeepDiveTrigger, ScoringDimension } from "../lib/types";
import { API_BASE } from "../lib/api";
import Button from "../components/ui/Button";

const DIM_LABELS: Record<ScoringDimension, string> = {
  ai_awareness: "AI Awareness", ai_action: "AI Action", process_readiness: "Process Readiness",
  strategic_clarity: "Strategic Clarity", change_energy: "Change Energy", team_capacity: "Team Capacity",
  mission_alignment: "Mission Alignment", investment_readiness: "Investment Readiness",
};

export default function AnalysisPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [analysis, setAnalysis] = useState<CascadeAnalysis | null>(null);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/sessions/${sessionId}`);
        const data = await res.json();
        if (data.session?.analysis) { setAnalysis(data.session.analysis); setName(data.session.participant?.name || ""); }
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, [sessionId]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-12 h-12 border-2 border-white/20 border-t-white rounded-full animate-spin" /></div>;
  if (!analysis) return <div className="min-h-screen flex items-center justify-center"><div className="text-center space-y-4"><p className="text-white/50">Analysis not found.</p><Button onClick={() => navigate("/")} variant="secondary">Home</Button></div></div>;

  return (
    <div className="min-h-screen pb-20">
      <header className="border-b border-white/5 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3"><div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-sm font-bold">H</div><span className="font-semibold text-white/90">HMN Cascade</span></div>
          <Button variant="ghost" onClick={() => navigate("/")}>New Assessment</Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12 space-y-12">
        {/* Hero */}
        <section className="text-center space-y-6">
          <h1 className="text-3xl font-bold text-white">{name ? `${name}'s` : "Your"} AI Readiness Analysis</h1>
          <div className="inline-flex items-center gap-6 bg-white/5 border border-white/10 rounded-2xl px-10 py-8">
            <div><div className="text-6xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">{analysis.overallReadinessScore}</div><div className="text-sm text-white/40 mt-1">Overall Score</div></div>
            <div className="w-px h-16 bg-white/10" />
            <div className="text-left"><div className="text-lg font-semibold text-white capitalize">{analysis.archetype.replace(/_/g, " ")}</div><div className="text-sm text-white/50 max-w-xs">{analysis.archetypeDescription}</div></div>
          </div>
        </section>

        {/* Summary */}
        {analysis.executiveSummary && (
          <section className="bg-white/5 border border-white/10 rounded-2xl p-8">
            <h2 className="text-lg font-semibold text-white mb-4">Executive Summary</h2>
            <div className="text-white/70 leading-relaxed whitespace-pre-wrap">{analysis.executiveSummary}</div>
          </section>
        )}

        {/* Scores */}
        <section>
          <h2 className="text-lg font-semibold text-white mb-6">Dimension Scores</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {analysis.dimensionScores.map((s: DimensionScore) => {
              const c = s.score >= 70 ? "bg-green-500" : s.score >= 45 ? "bg-yellow-500" : "bg-red-500";
              return (
                <div key={s.dimension} className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between"><span className="text-sm font-medium text-white">{DIM_LABELS[s.dimension]}</span><div className="flex items-center gap-2"><span className="text-lg font-bold text-white">{s.score}</span><span className="text-xs text-white/30">/ 100</span></div></div>
                  <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden"><div className={`h-full rounded-full ${c} transition-all duration-1000`} style={{ width: `${s.score}%` }} /></div>
                  {s.evidence.length > 0 && <p className="text-xs text-white/40 italic truncate">&ldquo;{s.evidence[0]}&rdquo;</p>}
                </div>
              );
            })}
          </div>
        </section>

        {/* Gaps */}
        {analysis.gaps.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-white mb-6">Gap Analysis</h2>
            <div className="space-y-4">
              {analysis.gaps.map((g: GapAnalysis, i: number) => {
                const s1 = analysis.dimensionScores.find(s => s.dimension === g.dimension1);
                const s2 = analysis.dimensionScores.find(s => s.dimension === g.dimension2);
                return (
                  <div key={i} className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-5 space-y-3">
                    <div className="flex items-center justify-between"><span className="text-sm font-medium text-orange-300 capitalize">{g.pattern.replace(/_/g, " ")}</span><span className="text-xs text-orange-300/60">Severity: {g.severity}</span></div>
                    <div className="flex items-center gap-4 text-sm"><span className="text-white/60">{DIM_LABELS[g.dimension1]}: <strong className="text-white">{s1?.score ?? "?"}</strong></span><span className="text-white/20">vs</span><span className="text-white/60">{DIM_LABELS[g.dimension2]}: <strong className="text-white">{s2?.score ?? "?"}</strong></span></div>
                    <p className="text-sm text-white/50">{g.description}</p>
                    <p className="text-xs text-orange-300/80 font-medium">{g.serviceRecommendation}</p>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Flags */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {analysis.redFlags.length > 0 && (
            <section className="bg-red-500/5 border border-red-500/20 rounded-2xl p-6">
              <h3 className="text-sm font-semibold text-red-400 uppercase tracking-wider mb-4">Watch Out For</h3>
              <ul className="space-y-3">{analysis.redFlags.map((f, i) => <li key={i} className="flex gap-2 text-sm text-white/70"><span className="text-red-400">&#x2022;</span>{f.description}</li>)}</ul>
            </section>
          )}
          {analysis.greenLights.length > 0 && (
            <section className="bg-green-500/5 border border-green-500/20 rounded-2xl p-6">
              <h3 className="text-sm font-semibold text-green-400 uppercase tracking-wider mb-4">Strengths</h3>
              <ul className="space-y-3">{analysis.greenLights.map((f, i) => <li key={i} className="flex gap-2 text-sm text-white/70"><span className="text-green-400">&#x2022;</span>{f.description}</li>)}</ul>
            </section>
          )}
        </div>

        {/* Services */}
        {analysis.serviceRecommendations.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-white mb-6">Recommended Next Steps</h2>
            <div className="space-y-4">
              {analysis.serviceRecommendations.map((r: ServiceRecommendation, i: number) => {
                const tc: Record<number, string> = { 1: "bg-blue-500/20 text-blue-300 border-blue-500/30", 2: "bg-purple-500/20 text-purple-300 border-purple-500/30", 3: "bg-amber-500/20 text-amber-300 border-amber-500/30" };
                const uc: Record<string, string> = { immediate: "text-red-400", near_term: "text-yellow-400", strategic: "text-blue-400" };
                return (
                  <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2"><span className={`px-2 py-0.5 rounded text-xs font-medium border ${tc[r.tier]}`}>Tier {r.tier}</span><span className={`text-xs ${uc[r.urgency]}`}>{r.urgency.replace("_", " ")}</span></div>
                        <h3 className="font-medium text-white">{r.service}</h3>
                        <p className="text-sm text-white/50">{r.description}</p>
                      </div>
                      <div className="text-sm font-medium text-white flex-shrink-0">{r.estimatedValue}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Deep Dives */}
        {analysis.triggeredDeepDives.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-white mb-6">Deeper Investigation Recommended</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {analysis.triggeredDeepDives.map((d: DeepDiveTrigger, i: number) => (
                <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-3">
                  <div className="flex items-center gap-2"><span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded text-xs font-medium">Priority {d.priority}</span><span className="text-sm font-medium text-white capitalize">{d.module.replace(/_/g, " ")}</span></div>
                  <p className="text-sm text-white/60">{d.reason}</p>
                  {d.suggestedQuestions.length > 0 && <div className="space-y-1"><p className="text-xs text-white/30 uppercase tracking-wider">Suggested Questions</p>{d.suggestedQuestions.map((q, j) => <p key={j} className="text-xs text-white/50 italic">&ldquo;{q}&rdquo;</p>)}</div>}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Narrative */}
        {analysis.detailedNarrative && (
          <section className="bg-white/5 border border-white/10 rounded-2xl p-8">
            <h2 className="text-lg font-semibold text-white mb-4">Detailed Analysis</h2>
            <div className="text-sm text-white/60 leading-relaxed whitespace-pre-wrap">{analysis.detailedNarrative}</div>
          </section>
        )}
      </main>
    </div>
  );
}
