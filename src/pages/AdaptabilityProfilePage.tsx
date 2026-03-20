import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { fetchAdaptabilityProfile } from "../lib/api";
import type { AdaptabilityAnalysis, AdaptabilityProfile, AdaptabilityPillar } from "../lib/types";
import Button from "../components/ui/Button";

// ============================================================
// Adaptability Profile Page
// Displays the participant's Adaptability Index profile:
// radar chart, strengths, development edges, 90-day plan
// ============================================================

const PILLAR_COLORS: Record<AdaptabilityPillar, string> = {
  learning_velocity: "#34d399",     // emerald-400
  unlearning_readiness: "#a78bfa",  // violet-400
  adaptive_agency: "#60a5fa",       // blue-400
  beginner_tolerance: "#fbbf24",    // amber-400
};

const STATUS_COLORS = {
  strength: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  developing: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  growth_edge: "text-rose-400 bg-rose-500/10 border-rose-500/20",
};

const STATUS_LABELS = {
  strength: "Strength",
  developing: "Developing",
  growth_edge: "Growth Edge",
};

export default function AdaptabilityProfilePage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const [analysis, setAnalysis] = useState<AdaptabilityAnalysis | null>(null);
  const [profile, setProfile] = useState<AdaptabilityProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchAdaptabilityProfile(sessionId!);
        setAnalysis(data.analysis);
        setProfile(data.profile);
      } catch {
        setError("Failed to load your Adaptability Profile.");
      } finally {
        setLoading(false);
      }
    })();
  }, [sessionId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-2 border-emerald-500/20 border-t-emerald-400 rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground">Loading your Adaptability Profile...</p>
        </div>
      </div>
    );
  }

  if (error || !analysis || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        <div className="text-center space-y-4">
          <p className="text-red-400">{error || "Profile not available."}</p>
          <Button onClick={() => navigate("/")} variant="secondary">Return Home</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 pb-20">
      {/* Header */}
      <div className="border-b border-border/50 bg-slate-950/60 backdrop-blur-xl">
        <div className="max-w-3xl mx-auto px-6 py-8">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-foreground">
              Your Adaptability Profile
            </h1>
            <p className="text-muted-foreground text-sm">
              Personal and confidential. Generated from your Adaptability Index conversation.
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-12">
        {/* Play 0 Alert */}
        {profile.play0Recommended && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center">
                <span className="text-amber-400 text-sm">!</span>
              </div>
              <h3 className="text-amber-400 font-medium">
                Stabilize Before Developing
              </h3>
            </div>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Your profile suggests your adaptive capacity may be stretched by
              current demands. Before adding development activities, consider
              reducing the number of simultaneous changes in your environment.
              The most effective thing you can do right now is create stability
              in some areas so you have capacity for the areas that matter most.
            </p>
          </div>
        )}

        {/* Adaptive Regulation Note */}
        {profile.adaptiveRegulationNote && (
          <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-6 space-y-2">
            <h3 className="text-violet-400 font-medium text-sm">
              Adaptive Regulation
            </h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
              {profile.adaptiveRegulationNote}
            </p>
          </div>
        )}

        {/* Section 1: Pillar Scores Visual */}
        <section className="space-y-6">
          <h2 className="text-lg font-medium text-foreground">
            Your Four Pillars
          </h2>
          <div className="grid gap-4">
            {profile.pillarScores.map((ps) => (
              <div
                key={ps.pillar}
                className="rounded-xl border border-border/50 bg-muted/30 p-5"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: PILLAR_COLORS[ps.pillar] }}
                    />
                    <span className="text-foreground/90 font-medium">
                      {ps.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS[ps.status]}`}
                    >
                      {STATUS_LABELS[ps.status]}
                    </span>
                    <span className="text-muted-foreground font-mono text-sm">
                      {ps.score}/25
                    </span>
                  </div>
                </div>
                {/* Score bar */}
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-1000"
                    style={{
                      width: `${(ps.score / 25) * 100}%`,
                      backgroundColor: PILLAR_COLORS[ps.pillar],
                      opacity: 0.7,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          {/* Overall score */}
          <div className="text-center pt-2">
            <span className="text-muted-foreground/70 text-sm">Overall Adaptability: </span>
            <span className="text-muted-foreground font-mono">
              {analysis.overallAdaptabilityScore}/100
            </span>
          </div>
        </section>

        {/* Section 2: Strengths */}
        {profile.strengths.length > 0 && (
          <section className="space-y-6">
            <h2 className="text-lg font-medium text-foreground">
              Your Strengths
            </h2>
            <div className="space-y-4">
              {profile.strengths.map((s, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-emerald-500/10 bg-emerald-500/[0.02] p-6 space-y-3"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: PILLAR_COLORS[s.pillar] }}
                    />
                    <span className="text-emerald-400/80 text-sm font-medium">
                      {s.pillar.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                    </span>
                  </div>
                  <p className="text-foreground/80 text-sm leading-relaxed">
                    {s.behavioralDescription}
                  </p>
                  {s.evidence && (
                    <p className="text-muted-foreground text-xs italic border-l-2 border-emerald-500/20 pl-3">
                      {s.evidence}
                    </p>
                  )}
                  <p className="text-muted-foreground text-sm">
                    <span className="text-emerald-400/60">How to leverage:</span>{" "}
                    {s.leverageAdvice}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Section 3: Development Edge */}
        {profile.developmentEdges.length > 0 && (
          <section className="space-y-6">
            <h2 className="text-lg font-medium text-foreground">
              Your Development Edge
            </h2>
            <div className="space-y-4">
              {profile.developmentEdges.map((de, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-border/50 bg-muted/30 p-6 space-y-4"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: PILLAR_COLORS[de.pillar] }}
                    />
                    <span className="text-muted-foreground text-sm font-medium">
                      {de.pillar.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                    </span>
                  </div>
                  <p className="text-foreground/80 text-sm leading-relaxed">
                    {de.behavioralDescription}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {de.observation}
                  </p>
                  <div className="rounded-lg bg-muted/30 border border-border/50 p-4 space-y-2">
                    <p className="text-muted-foreground text-sm">
                      <span className="text-muted-foreground">Why this matters:</span>{" "}
                      {de.whyItMatters}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {de.researchInsight}
                    </p>
                  </div>
                  <p className="text-muted-foreground/70 text-xs">
                    {de.normalization}
                  </p>
                  {de.domainSpecific && (
                    <p className="text-muted-foreground text-xs italic">
                      {de.domainSpecific}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Section 4: 90-Day Development Plan */}
        {profile.developmentPlan.length > 0 && (
          <section className="space-y-6">
            <h2 className="text-lg font-medium text-foreground">
              Your 90-Day Development Plan
            </h2>
            <div className="space-y-4">
              {profile.developmentPlan.map((phase) => (
                <div
                  key={phase.phase}
                  className="rounded-xl border border-border/50 bg-muted/30 p-6 space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-foreground/90 font-medium">
                        Phase {phase.phase}: {phase.theme}
                      </h3>
                      <span className="text-muted-foreground/70 text-xs">
                        {phase.weekRange} &middot; {phase.timeCommitment}
                      </span>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                      <span className="text-muted-foreground text-sm font-mono">
                        {phase.phase}
                      </span>
                    </div>
                  </div>
                  <ul className="space-y-2">
                    {phase.actions.map((action, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/40 mt-1.5 flex-shrink-0" />
                        <span className="text-muted-foreground text-sm">
                          {action}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="rounded-lg bg-transparent border border-border/50 p-3 space-y-1">
                    <p className="text-muted-foreground text-xs">
                      <span className="text-muted-foreground/70">You may experience:</span>{" "}
                      {phase.expectedExperience}
                    </p>
                    <p className="text-muted-foreground text-xs italic">
                      Reflect: {phase.reflectionQuestion}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Section 5: Career Context */}
        {profile.careerContext && (
          <section className="space-y-4">
            <h2 className="text-lg font-medium text-foreground">
              What This Means for Your Career
            </h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              {profile.careerContext}
            </p>
          </section>
        )}

        {/* Section 6: Re-assessment */}
        <section className="rounded-xl border border-border/50 bg-muted/30 p-6 space-y-3">
          <h3 className="text-foreground/80 font-medium">Your Re-Assessment</h3>
          {profile.reassessmentDate && (
            <p className="text-muted-foreground text-sm">
              Scheduled: {new Date(profile.reassessmentDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </p>
          )}
          <p className="text-muted-foreground text-sm leading-relaxed">
            {profile.reassessmentNote}
          </p>
          <p className="text-muted-foreground/70 text-xs italic">
            The goal isn't a perfect score — it's meaningful progress on your
            development edge.
          </p>
        </section>

        {/* Human Review Notice */}
        {analysis.humanReviewRequired && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5 space-y-2">
            <p className="text-amber-400/80 text-sm font-medium">
              Human Review Pending
            </p>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Some aspects of your profile have been flagged for review by a
              human assessor to ensure accuracy. You may receive an updated
              profile after this review.
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="text-center pt-4 space-y-4">
          <p className="text-muted-foreground/50 text-xs">
            This assessment was AI-conducted using both content analysis and
            linguistic process signals. You may request a human review of your
            scores at any time.
          </p>
          <Button
            onClick={() => navigate("/")}
            variant="secondary"
            size="sm"
          >
            Return Home
          </Button>
        </div>
      </div>
    </div>
  );
}
