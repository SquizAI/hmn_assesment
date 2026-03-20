import { useState, useEffect, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { compareSessions } from "../lib/api";

const DIMENSION_LABELS: Record<string, string> = {
  ai_awareness: "AI Awareness",
  ai_action: "AI Action",
  process_readiness: "Process Readiness",
  strategic_clarity: "Strategic Clarity",
  change_energy: "Change Energy",
  team_capacity: "Team Capacity",
  mission_alignment: "Mission Alignment",
  investment_readiness: "Investment Readiness",
};

const ALL_DIMENSIONS = ["ai_awareness", "ai_action", "process_readiness", "strategic_clarity", "change_energy", "team_capacity", "mission_alignment", "investment_readiness"];

interface CompareSession {
  sessionId: string;
  participantName: string;
  participantCompany: string;
  participantEmail: string | null;
  participantRole: string;
  createdAt: string;
  overallScore: number | null;
  archetype: string | null;
  archetypeDescription: string | null;
  dimensionScores: Record<string, number>;
  gaps: { pattern: string; severity: number; description: string }[];
  redFlagCount: number;
  greenLightCount: number;
}

function scoreColor(score: number): string {
  if (score >= 70) return "bg-green-500";
  if (score >= 45) return "bg-yellow-500";
  return "bg-red-500";
}

function scoreCellBg(score: number): string {
  if (score >= 70) return "bg-green-500/15 text-green-300";
  if (score >= 45) return "bg-yellow-500/15 text-yellow-300";
  return "bg-red-500/15 text-red-300";
}

function deltaArrow(current: number, previous: number): React.ReactNode {
  const diff = current - previous;
  if (diff === 0) return <span className="text-muted-foreground text-xs ml-1">--</span>;
  if (diff > 0) return <span className="text-green-400 text-xs ml-1 inline-flex items-center"><svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor"><path d="M6 2L10 8H2L6 2Z" /></svg>+{diff}</span>;
  return <span className="text-red-400 text-xs ml-1 inline-flex items-center"><svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor"><path d="M6 10L2 4H10L6 10Z" /></svg>{diff}</span>;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ComparePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const email = searchParams.get("email");
  const company = searchParams.get("company");

  const [sessions, setSessions] = useState<CompareSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!email && !company) { setError("No email or company specified."); setLoading(false); return; }
    const fetchData = async () => {
      try {
        const params = new URLSearchParams();
        if (email) params.set("email", email);
        else if (company) params.set("company", company);
        params.set("limit", "20");
        const data = await compareSessions(params);
        setSessions(data.sessions || []);
      } catch (err) { console.error(err); setError("Failed to load comparison data."); }
      finally { setLoading(false); }
    };
    fetchData();
  }, [email, company]);

  const allGapPatterns = useMemo(() => {
    const patterns = new Set<string>();
    sessions.forEach((s) => s.gaps.forEach((g) => patterns.add(g.pattern)));
    return Array.from(patterns);
  }, [sessions]);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-background"><div className="w-12 h-12 border-2 border-border border-t-white rounded-full animate-spin" /></div>;

  if (error) return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-background">
      <div className="text-center space-y-4">
        <p className="text-muted-foreground">{error}</p>
        <button onClick={() => navigate("/")} className="px-5 py-2.5 text-sm font-medium rounded-lg bg-muted text-foreground hover:bg-muted border border-border transition-colors">Return Home</button>
      </div>
    </div>
  );

  if (sessions.length === 0) return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-background">
      <div className="text-center space-y-4">
        <p className="text-muted-foreground">No completed assessments found for this {email ? "email" : "company"}.</p>
        <button onClick={() => navigate("/")} className="px-5 py-2.5 text-sm font-medium rounded-lg bg-muted text-foreground hover:bg-muted border border-border transition-colors">Take an Assessment</button>
      </div>
    </div>
  );

  const latestSession = sessions[sessions.length - 1];
  const firstSession = sessions[0];
  const overallDelta = sessions.length >= 2 && latestSession.overallScore !== null && firstSession.overallScore !== null ? latestSession.overallScore - firstSession.overallScore : null;

  const maxScore = 100;
  const chartHeight = 200;

  return (
    <div className="min-h-screen pb-20 bg-background">
      <header className="border-b border-border px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center text-sm font-bold text-white">H</div>
            <span className="font-semibold text-foreground/90">HMN Cascade</span>
          </div>
          <button onClick={() => navigate("/")} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground/90 transition-colors">New Assessment</button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12 space-y-12">
        <section className="text-center space-y-3">
          <h1 className="text-3xl font-bold text-foreground">Assessment History</h1>
          <p className="text-muted-foreground">
            {latestSession.participantName}
            {latestSession.participantCompany ? ` at ${latestSession.participantCompany}` : ""}
            {" "}&mdash; {sessions.length} assessment{sessions.length !== 1 ? "s" : ""}
          </p>
          {overallDelta !== null && (
            <p className="text-sm text-muted-foreground">
              Overall change:{" "}
              <span className={overallDelta >= 0 ? "text-green-400" : "text-red-400"}>{overallDelta >= 0 ? "+" : ""}{overallDelta} points</span>
              {" "}since first assessment
            </p>
          )}
        </section>

        {/* Score Timeline */}
        <section className="bg-muted border border-border rounded-2xl p-8">
          <h2 className="text-lg font-semibold text-foreground mb-6">Score Progression</h2>
          {sessions.length === 1 ? (
            <div className="text-center py-8">
              <div className="text-5xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent mb-2">{sessions[0].overallScore ?? "--"}</div>
              <p className="text-sm text-muted-foreground">Only one assessment so far. Retake to see progression.</p>
            </div>
          ) : (
            <div className="relative" style={{ height: chartHeight + 60 }}>
              <div className="absolute left-0 top-0 bottom-10 flex flex-col justify-between text-xs text-muted-foreground w-8">
                <span>100</span><span>75</span><span>50</span><span>25</span><span>0</span>
              </div>
              <div className="absolute left-10 right-0 top-0" style={{ height: chartHeight }}>
                {[0, 25, 50, 75, 100].map((val) => (
                  <div key={val} className="absolute w-full border-t border-border" style={{ top: `${((100 - val) / 100) * chartHeight}px` }} />
                ))}
              </div>
              <div className="absolute left-10 right-0 top-0" style={{ height: chartHeight }}>
                <svg className="absolute inset-0 w-full" style={{ height: chartHeight }} preserveAspectRatio="none">
                  {sessions.map((session, i) => {
                    if (i === 0) return null;
                    const prevSession = sessions[i - 1];
                    const prevScore = prevSession.overallScore ?? 0;
                    const currScore = session.overallScore ?? 0;
                    const totalPoints = sessions.length;
                    const xPrev = `${((i - 1) / (totalPoints - 1)) * 100}%`;
                    const xCurr = `${(i / (totalPoints - 1)) * 100}%`;
                    const yPrev = ((maxScore - prevScore) / maxScore) * chartHeight;
                    const yCurr = ((maxScore - currScore) / maxScore) * chartHeight;
                    return <line key={i} x1={xPrev} y1={yPrev} x2={xCurr} y2={yCurr} stroke="url(#lineGradient)" strokeWidth="2" strokeLinecap="round" />;
                  })}
                  <defs><linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#60a5fa" /><stop offset="100%" stopColor="#a78bfa" /></linearGradient></defs>
                </svg>
                {sessions.map((session, i) => {
                  const score = session.overallScore ?? 0;
                  const totalPoints = sessions.length;
                  const xPercent = totalPoints === 1 ? 50 : (i / (totalPoints - 1)) * 100;
                  const yPos = ((maxScore - score) / maxScore) * chartHeight;
                  return (
                    <div key={session.sessionId} className="absolute flex flex-col items-center" style={{ left: `${xPercent}%`, top: `${yPos}px`, transform: "translate(-50%, -50%)" }}>
                      <div className={`w-4 h-4 rounded-full border-2 border-[#0a0a0f] ${scoreColor(score)} shadow-lg`} title={`${formatDate(session.createdAt)}: ${score}`} />
                      <span className="text-xs font-bold text-foreground mt-1">{score}</span>
                    </div>
                  );
                })}
              </div>
              <div className="absolute left-10 right-0 flex justify-between text-xs text-muted-foreground" style={{ top: chartHeight + 16 }}>
                {sessions.map((session) => <span key={session.sessionId} className="text-center">{formatShortDate(session.createdAt)}</span>)}
              </div>
            </div>
          )}
        </section>

        {/* Dimension Comparison Table */}
        <section className="bg-muted border border-border rounded-2xl p-8 overflow-x-auto">
          <h2 className="text-lg font-semibold text-foreground mb-6">Dimension Comparison</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-3 text-muted-foreground font-medium min-w-[160px]">Dimension</th>
                {sessions.map((session) => <th key={session.sessionId} className="text-center py-3 px-3 text-muted-foreground font-medium min-w-[100px]">{formatShortDate(session.createdAt)}</th>)}
              </tr>
            </thead>
            <tbody>
              {ALL_DIMENSIONS.map((dim) => (
                <tr key={dim} className="border-b border-border">
                  <td className="py-3 px-3 text-foreground/80 font-medium">{DIMENSION_LABELS[dim]}</td>
                  {sessions.map((session, idx) => {
                    const score = session.dimensionScores[dim];
                    const hasScore = score !== undefined && score !== null;
                    const prevSession = idx > 0 ? sessions[idx - 1] : null;
                    const prevScore = prevSession?.dimensionScores[dim];
                    const hasPrev = prevScore !== undefined && prevScore !== null;
                    return (
                      <td key={session.sessionId} className="py-3 px-3 text-center">
                        {hasScore ? <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-lg text-sm font-semibold ${scoreCellBg(score)}`}>{score}{hasPrev && deltaArrow(score, prevScore)}</span> : <span className="text-muted-foreground">--</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr className="border-t-2 border-border">
                <td className="py-3 px-3 text-foreground font-semibold">Overall Score</td>
                {sessions.map((session, idx) => {
                  const score = session.overallScore;
                  const hasScore = score !== null && score !== undefined;
                  const prevSession = idx > 0 ? sessions[idx - 1] : null;
                  const prevScore = prevSession?.overallScore;
                  const hasPrev = prevScore !== null && prevScore !== undefined;
                  return (
                    <td key={session.sessionId} className="py-3 px-3 text-center">
                      {hasScore ? <span className={`inline-flex items-center justify-center px-3 py-1.5 rounded-lg text-sm font-bold ${scoreCellBg(score)}`}>{score}{hasPrev && deltaArrow(score, prevScore)}</span> : <span className="text-muted-foreground">--</span>}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </section>

        {/* Archetype History */}
        <section className="bg-muted border border-border rounded-2xl p-8">
          <h2 className="text-lg font-semibold text-foreground mb-6">Archetype Evolution</h2>
          <div className="flex flex-wrap gap-4">
            {sessions.map((session, idx) => {
              const prevArchetype = idx > 0 ? sessions[idx - 1].archetype : null;
              const changed = idx > 0 && session.archetype !== prevArchetype;
              return (
                <div key={session.sessionId} className={`flex-1 min-w-[180px] rounded-xl border p-5 space-y-2 ${changed ? "border-blue-500/40 bg-blue-500/10" : "border-border bg-muted"}`}>
                  <div className="text-xs text-muted-foreground">{formatDate(session.createdAt)}</div>
                  <div className="text-base font-semibold text-foreground capitalize">{session.archetype?.replace(/_/g, " ") ?? "Unknown"}</div>
                  {session.archetypeDescription && <div className="text-xs text-muted-foreground line-clamp-2">{session.archetypeDescription}</div>}
                  {changed && <div className="flex items-center gap-1 text-xs text-blue-300"><svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor"><path d="M6 1L11 6L6 11L5 10L8.5 6.5H1V5.5H8.5L5 2L6 1Z" /></svg>Changed from {prevArchetype?.replace(/_/g, " ")}</div>}
                </div>
              );
            })}
          </div>
        </section>

        {/* Gap Resolution Tracking */}
        {allGapPatterns.length > 0 && (
          <section className="bg-muted border border-border rounded-2xl p-8 overflow-x-auto">
            <h2 className="text-lg font-semibold text-foreground mb-6">Gap Resolution Tracking</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-3 text-muted-foreground font-medium min-w-[180px]">Gap Pattern</th>
                  {sessions.map((session) => <th key={session.sessionId} className="text-center py-3 px-3 text-muted-foreground font-medium min-w-[100px]">{formatShortDate(session.createdAt)}</th>)}
                </tr>
              </thead>
              <tbody>
                {allGapPatterns.map((pattern) => (
                  <tr key={pattern} className="border-b border-border">
                    <td className="py-3 px-3 text-foreground/80 font-medium capitalize">{pattern.replace(/_/g, " ")}</td>
                    {sessions.map((session, idx) => {
                      const gap = session.gaps.find((g) => g.pattern === pattern);
                      const isPresent = !!gap;
                      const wasPreviouslyPresent = sessions.slice(0, idx).some((prev) => prev.gaps.some((g) => g.pattern === pattern));
                      const isResolved = !isPresent && wasPreviouslyPresent;
                      return (
                        <td key={session.sessionId} className="py-3 px-3 text-center">
                          {isPresent ? (
                            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-orange-500/15" title={gap.description}><span className="text-orange-300 text-sm font-bold">{gap.severity}</span></span>
                          ) : isResolved ? (
                            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-green-500/15"><svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg></span>
                          ) : <span className="text-muted-foreground">&mdash;</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex gap-6 mt-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-2"><span className="inline-block w-4 h-4 rounded-full bg-orange-500/15 border border-orange-500/30" />Present (severity score)</div>
              <div className="flex items-center gap-2"><span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-green-500/15 border border-green-500/30"><svg className="w-2.5 h-2.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg></span>Resolved</div>
              <div className="flex items-center gap-2"><span className="text-muted-foreground">&mdash;</span>Never detected</div>
            </div>
          </section>
        )}

        {/* Individual Session Cards */}
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-6">Assessment Details</h2>
          <div className="space-y-4">
            {[...sessions].reverse().map((session) => (
              <div key={session.sessionId} className="bg-muted border border-border rounded-xl p-5 flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">{formatDate(session.createdAt)}</div>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl font-bold text-foreground">{session.overallScore ?? "--"}</span>
                    <span className="text-sm text-muted-foreground capitalize">{session.archetype?.replace(/_/g, " ") ?? "--"}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {session.redFlagCount} red flag{session.redFlagCount !== 1 ? "s" : ""} &middot;{" "}
                    {session.greenLightCount} strength{session.greenLightCount !== 1 ? "s" : ""} &middot;{" "}
                    {session.gaps.length} gap{session.gaps.length !== 1 ? "s" : ""}
                  </div>
                </div>
                <button onClick={() => navigate(`/analysis/${session.sessionId}`)} className="px-4 py-2 text-xs font-medium rounded-lg bg-muted text-muted-foreground hover:bg-muted transition-colors">View Full Report</button>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
