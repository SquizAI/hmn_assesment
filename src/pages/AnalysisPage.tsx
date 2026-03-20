import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { CascadeAnalysis, DeepDiveTrigger } from "../lib/types";
import { fetchSessionPublic, fetchAssessmentConfig, downloadReportPdf } from "../lib/api";
import Button from "../components/ui/Button";
import DimensionScoreCard from "../components/analysis/DimensionScoreCard";
import GapAnalysisGrid from "../components/analysis/GapAnalysisGrid";
import FlagsList from "../components/analysis/FlagsList";
import ServiceRecommendations from "../components/analysis/ServiceRecommendations";

// Default labels for the ai-readiness assessment
const DEFAULT_DIM_LABELS: Record<string, string> = {
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
  const [dimLabels, setDimLabels] = useState<Record<string, string>>(DEFAULT_DIM_LABELS);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchSessionPublic(sessionId!);
        if (data.session?.analysis) {
          setAnalysis(data.session.analysis);
          setName(data.session.participant?.name || "");

          // Load assessment-specific dimension labels if available
          const assessmentId = data.session.assessmentTypeId;
          if (assessmentId && assessmentId !== "ai-readiness") {
            try {
              const assessmentData = await fetchAssessmentConfig(assessmentId);
              if (assessmentData.scoringDimensions?.length) {
                const labels: Record<string, string> = {};
                assessmentData.scoringDimensions.forEach((d: { id: string; label: string }) => {
                  labels[d.id] = d.label;
                });
                setDimLabels(labels);
              }
            } catch { /* fall back to default labels */ }
          }
        }
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, [sessionId]);

  const handleDownloadPdf = async () => {
    if (!sessionId) return;
    setDownloading(true);
    try {
      const blob = await downloadReportPdf(sessionId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `HMN-Cascade-Report-${name.replace(/\s+/g, "-") || "Assessment"}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF download failed:", err);
    } finally {
      setDownloading(false);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-12 h-12 border-2 border-border border-t-white rounded-full animate-spin" /></div>;
  if (!analysis) return <div className="min-h-screen flex items-center justify-center"><div className="text-center space-y-4"><p className="text-muted-foreground">Analysis not found.</p><Button onClick={() => navigate("/")} variant="secondary">Home</Button></div></div>;

  return (
    <div className="min-h-screen pb-20">
      <header className="border-b border-border/50 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3"><div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-sm font-bold">H</div><span className="font-semibold text-foreground/90">HMN Cascade</span></div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={handleDownloadPdf} disabled={downloading}>
              {downloading ? "Generating..." : "Download PDF"}
            </Button>
            <Button variant="ghost" onClick={() => navigate("/")}>New Assessment</Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12 space-y-12">
        {/* Hero */}
        <section className="text-center space-y-6">
          <h1 className="text-3xl font-bold text-foreground">{name ? `${name}'s` : "Your"} AI Readiness Analysis</h1>
          <div className="inline-flex items-center gap-6 bg-muted border border-border rounded-2xl px-10 py-8">
            <div><div className="text-6xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">{analysis.overallReadinessScore}</div><div className="text-sm text-muted-foreground mt-1">Overall Score</div></div>
            <div className="w-px h-16 bg-muted" />
            <div className="text-left"><div className="text-lg font-semibold text-foreground capitalize">{analysis.archetype.replace(/_/g, " ")}</div><div className="text-sm text-muted-foreground max-w-xs">{analysis.archetypeDescription}</div></div>
          </div>
        </section>

        {/* Summary */}
        {analysis.executiveSummary && (
          <section className="bg-muted border border-border rounded-2xl p-8">
            <h2 className="text-lg font-semibold text-foreground mb-4">Executive Summary</h2>
            <div className="text-foreground/80 leading-relaxed whitespace-pre-wrap">{analysis.executiveSummary}</div>
          </section>
        )}

        {/* Dimension Scores */}
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-6">Dimension Scores</h2>
          <DimensionScoreCard scores={analysis.dimensionScores} dimLabels={dimLabels} />
        </section>

        {/* Gap Analysis */}
        {analysis.gaps.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-6">Gap Analysis</h2>
            <GapAnalysisGrid gaps={analysis.gaps} dimensionScores={analysis.dimensionScores} dimLabels={dimLabels} />
          </section>
        )}

        {/* Red Flags & Green Lights */}
        <FlagsList redFlags={analysis.redFlags} greenLights={analysis.greenLights} />

        {/* Service Recommendations */}
        {analysis.serviceRecommendations.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-6">Recommended Next Steps</h2>
            <ServiceRecommendations recommendations={analysis.serviceRecommendations} />
          </section>
        )}

        {/* Deep Dives */}
        {analysis.triggeredDeepDives.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-6">Deeper Investigation Recommended</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {analysis.triggeredDeepDives.map((d: DeepDiveTrigger, i: number) => (
                <div key={i} className="bg-muted border border-border rounded-xl p-5 space-y-3">
                  <div className="flex items-center gap-2"><span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded text-xs font-medium">Priority {d.priority}</span><span className="text-sm font-medium text-foreground capitalize">{d.module.replace(/_/g, " ")}</span></div>
                  <p className="text-sm text-muted-foreground">{d.reason}</p>
                  {d.suggestedQuestions.length > 0 && <div className="space-y-1"><p className="text-xs text-muted-foreground/70 uppercase tracking-wider">Suggested Questions</p>{d.suggestedQuestions.map((q, j) => <p key={j} className="text-xs text-muted-foreground italic">&ldquo;{q}&rdquo;</p>)}</div>}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Narrative */}
        {analysis.detailedNarrative && (
          <section className="bg-muted border border-border rounded-2xl p-8">
            <h2 className="text-lg font-semibold text-foreground mb-4">Detailed Analysis</h2>
            <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{analysis.detailedNarrative}</div>
          </section>
        )}
      </main>
    </div>
  );
}
