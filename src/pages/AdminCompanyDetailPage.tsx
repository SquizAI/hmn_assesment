import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import StatusBadge from "../components/admin/StatusBadge";
import ResearchCard from "../components/admin/ResearchCard";
import { SessionDrawerContent } from "../components/admin/SessionDrawer";
import { useDetailDrawer } from "../components/admin/DetailDrawer";
import { fetchCompanyDetail, triggerResearch } from "../lib/admin-api";
import { fetchCompanyIntelligence, seedGraph } from "../lib/graph-api";
import type { ResearchData } from "../lib/types";

interface SessionSummary {
  id: string;
  participantName: string;
  participantCompany: string;
  status: string;
  createdAt: string;
  assessmentTypeId: string;
  responseCount: number;
  hasResearch: boolean;
}

interface DimensionAvg {
  dimension: string;
  average: number;
  count: number;
}

interface CompanyDetail {
  company: string;
  participantCount: number;
  sessionCount: number;
  completedCount: number;
  analyzedCount: number;
  averageScore: number | null;
  completionRate: number;
  lastActivity: string;
  industries: string[];
  hasResearch: boolean;
  sessions: SessionSummary[];
  dimensionAverages: DimensionAvg[];
  researchData: ResearchData | null;
}

type IntelTab = "themes" | "people" | "recommendations" | "benchmark";

interface IntelTheme {
  theme: string;
  frequency: number;
  sentiment: "positive" | "negative" | "neutral";
  category: "tool" | "pain_point" | "goal" | "capability";
}

interface IntelParticipant {
  name: string;
  role: string;
  archetype: string;
  overallScore: number;
  sessionId: string;
}

interface IntelRecommendation {
  service: string;
  description: string;
  tier: number;
  estimatedValue: string;
  urgency: string;
  frequency: number;
  confidence: number;
}

interface IntelBenchmark {
  dimension: string;
  companyAvg: number;
  globalAvg: number;
}

interface CompanyIntelligence {
  themes: IntelTheme[];
  participants: IntelParticipant[];
  recommendations: IntelRecommendation[];
  benchmarks: IntelBenchmark[];
}

function humanize(snake: string): string {
  return snake
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function scoreBarColor(score: number): string {
  if (score >= 70) return "bg-green-500";
  if (score >= 45) return "bg-yellow-500";
  return "bg-red-500";
}

function scoreTextColor(score: number): string {
  if (score >= 70) return "text-green-400";
  if (score >= 45) return "text-yellow-400";
  return "text-red-400";
}

export default function AdminCompanyDetailPage() {
  const { company: companyParam } = useParams<{ company: string }>();
  const navigate = useNavigate();
  const companyName = decodeURIComponent(companyParam || "");

  const { openDrawer, closeDrawer } = useDetailDrawer();
  const [detail, setDetail] = useState<CompanyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [researchLoading, setResearchLoading] = useState(false);
  const [activeIntelTab, setActiveIntelTab] = useState<IntelTab>("themes");
  const [intel, setIntel] = useState<CompanyIntelligence | null>(null);
  const [intelLoading, setIntelLoading] = useState(true);
  const [intelError, setIntelError] = useState(false);
  const [seedingGraph, setSeedingGraph] = useState(false);

  const loadDetail = () => {
    if (!companyName) return;
    setLoading(true);
    fetchCompanyDetail(companyName)
      .then((data) => {
        setDetail(data.company || null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    loadDetail();
  }, [companyName]);

  useEffect(() => {
    if (!companyName) return;
    setIntelLoading(true);
    setIntelError(false);
    fetchCompanyIntelligence(companyName)
      .then((data) => {
        setIntel(data);
        setIntelLoading(false);
      })
      .catch(() => {
        setIntelError(true);
        setIntelLoading(false);
      });
  }, [companyName]);

  const handleSeedGraph = async () => {
    setSeedingGraph(true);
    try {
      await seedGraph();
      const data = await fetchCompanyIntelligence(companyName);
      setIntel(data);
      setIntelError(false);
    } catch {
      // seed failed
    } finally {
      setSeedingGraph(false);
    }
  };

  const handleTriggerResearch = async () => {
    if (!detail || detail.sessions.length === 0) return;
    setResearchLoading(true);
    try {
      const firstSession = detail.sessions[0];
      await triggerResearch(firstSession.id);
      loadDetail();
    } catch {
      // failed
    } finally {
      setResearchLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="px-6 py-6 flex items-center justify-center h-full">
        <span className="text-muted-foreground">Loading company detail...</span>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="px-6 py-6 text-center">
        <p className="text-muted-foreground">Company not found</p>
        <button
          onClick={() => navigate("/admin/companies")}
          className="mt-4 text-blue-400 hover:text-blue-300 text-sm"
        >
          Back to Companies
        </button>
      </div>
    );
  }

  return (
    <div className="px-6 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate("/admin/companies")}
          className="text-muted-foreground hover:text-muted-foreground transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
        </button>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-foreground/90">{detail.company}</h2>
          <div className="flex items-center gap-2 mt-0.5">
            {detail.industries.map((ind) => (
              <span key={ind} className="text-xs px-2 py-0.5 rounded-full bg-muted border border-border text-muted-foreground">
                {ind}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-muted rounded-xl border border-border p-4">
          <span className="text-2xl font-bold text-foreground/90">{detail.sessionCount}</span>
          <p className="text-xs text-muted-foreground mt-1">Total Sessions</p>
        </div>
        <div className="bg-muted rounded-xl border border-border p-4">
          <span className="text-2xl font-bold text-foreground/90">{detail.participantCount}</span>
          <p className="text-xs text-muted-foreground mt-1">Participants</p>
        </div>
        <div className="bg-muted rounded-xl border border-border p-4">
          <span className={`text-2xl font-bold ${detail.averageScore ? scoreTextColor(detail.averageScore) : "text-muted-foreground"}`}>
            {detail.averageScore ?? "\u2014"}
          </span>
          <p className="text-xs text-muted-foreground mt-1">Avg Score</p>
        </div>
        <div className="bg-muted rounded-xl border border-border p-4">
          <span className="text-2xl font-bold text-foreground/90">{detail.completionRate}%</span>
          <p className="text-xs text-muted-foreground mt-1">Completion Rate</p>
        </div>
      </div>

      {/* Two-column: Research + Dimensions | Sessions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Research + Dimensions */}
        <div className="space-y-6">
          {/* Research Card */}
          <div className="bg-muted rounded-2xl border border-border p-5">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Company Research</h3>
            <ResearchCard
              research={detail.researchData}
              onTriggerResearch={handleTriggerResearch}
              triggerLoading={researchLoading}
              showPersonProfile={false}
              showCompanyProfile={true}
            />
          </div>

          {/* Dimension Averages */}
          {detail.dimensionAverages.length > 0 && (
            <div className="bg-muted rounded-2xl border border-border p-5">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                Dimension Averages
              </h3>
              <div className="space-y-3">
                {detail.dimensionAverages.map((dim) => (
                  <div key={dim.dimension} className="flex items-center gap-3">
                    <span className="w-36 text-sm text-muted-foreground flex-shrink-0 truncate">
                      {humanize(dim.dimension)}
                    </span>
                    <span className="text-sm font-medium text-foreground/80 tabular-nums w-8 text-right flex-shrink-0">
                      {Math.round(dim.average)}
                    </span>
                    <div className="flex-1 bg-muted rounded-lg h-5 overflow-hidden">
                      <div
                        className={`h-full rounded-lg ${scoreBarColor(dim.average)}`}
                        style={{ width: `${dim.average}%`, minWidth: "2px" }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground w-8 text-right">{dim.count}s</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Sessions Table */}
        <div className="bg-muted rounded-2xl border border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Sessions ({detail.sessions.length})
            </h3>
          </div>
          <div className="overflow-y-auto max-h-[600px]">
            <table className="w-full">
              <thead>
                <tr className="bg-muted">
                  <th className="text-left text-xs text-muted-foreground uppercase tracking-wider px-4 py-2.5">Name</th>
                  <th className="text-left text-xs text-muted-foreground uppercase tracking-wider px-4 py-2.5">Status</th>
                  <th className="text-left text-xs text-muted-foreground uppercase tracking-wider px-4 py-2.5">Date</th>
                  <th className="text-left text-xs text-muted-foreground uppercase tracking-wider px-4 py-2.5 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {detail.sessions.map((session) => (
                  <tr
                    key={session.id}
                    onClick={() => openDrawer(<SessionDrawerContent sessionId={session.id} onClose={closeDrawer} onDelete={() => { closeDrawer(); loadDetail(); }} />)}
                    className="hover:bg-foreground/[0.04] cursor-pointer transition-colors border-t border-border"
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground/90">{session.participantName}</span>
                        {session.hasResearch && (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" title="Has research" />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={session.status} />
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {formatDate(session.createdAt)}
                    </td>
                    <td className="px-4 py-2.5">
                      <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                      </svg>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Graph Intelligence Section */}
      <div className="bg-muted rounded-2xl border border-border overflow-hidden">
        {/* Tab Header */}
        <div className="flex items-center border-b border-border px-5">
          {(["themes", "people", "recommendations", "benchmark"] as IntelTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveIntelTab(tab)}
              className={`px-4 py-3 text-xs font-medium uppercase tracking-wider transition-colors relative ${
                activeIntelTab === tab
                  ? "text-foreground/90"
                  : "text-muted-foreground hover:text-muted-foreground"
              }`}
            >
              {tab === "recommendations" ? "Recs" : humanize(tab)}
              {activeIntelTab === tab && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500/70 rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="p-5">
          {intelLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-8 bg-muted rounded animate-pulse" />
              ))}
            </div>
          ) : intelError || !intel ? (
            <div className="text-center py-10">
              <p className="text-muted-foreground text-sm">
                Intelligence data not yet available — seed the graph to populate
              </p>
              <button
                onClick={handleSeedGraph}
                disabled={seedingGraph}
                className="mt-3 px-4 py-2 text-xs font-medium text-blue-400/80 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/15 border border-blue-500/20 rounded-lg transition-colors"
              >
                {seedingGraph ? "Seeding..." : "Seed Graph"}
              </button>
            </div>
          ) : (
            <>
              {/* Themes Tab */}
              {activeIntelTab === "themes" && (
                <div className="space-y-4">
                  {(["tool", "pain_point", "goal", "capability"] as const).map((cat) => {
                    const catThemes = (intel.themes || []).filter((t) => t.category === cat);
                    if (catThemes.length === 0) return null;
                    return (
                      <div key={cat}>
                        <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                          {cat === "pain_point" ? "Pain Points" : humanize(cat) + "s"}
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {catThemes.map((theme) => (
                            <span
                              key={theme.theme}
                              className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${
                                theme.sentiment === "positive"
                                  ? "border-green-500/20 bg-green-500/5 text-green-400/80"
                                  : theme.sentiment === "negative"
                                  ? "border-red-500/20 bg-red-500/5 text-red-400/80"
                                  : "border-border bg-muted text-muted-foreground"
                              }`}
                            >
                              {theme.theme}
                              <span className="text-[10px] opacity-60">{theme.frequency}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {(!intel.themes || intel.themes.length === 0) && (
                    <div className="text-center py-6 text-muted-foreground text-sm">No themes detected</div>
                  )}
                </div>
              )}

              {/* People Tab */}
              {activeIntelTab === "people" && (
                <div>
                  {(!intel.participants || intel.participants.length === 0) ? (
                    <div className="text-center py-6 text-muted-foreground text-sm">No participant data</div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {intel.participants.map((p) => (
                        <div
                          key={p.sessionId}
                          onClick={() => openDrawer(<SessionDrawerContent sessionId={p.sessionId} onClose={closeDrawer} onDelete={() => { closeDrawer(); loadDetail(); }} />)}
                          className="bg-muted rounded-xl border border-border p-4 hover:bg-muted cursor-pointer transition-colors"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-foreground/90 truncate">{p.name}</span>
                            <span className={`text-sm font-bold tabular-nums ${p.overallScore != null ? scoreTextColor(p.overallScore) : "text-muted-foreground"}`}>
                              {p.overallScore != null ? Math.round(p.overallScore) : "—"}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{p.role}</p>
                          <span className="inline-block mt-2 text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400/70">
                            {p.archetype ? humanize(p.archetype.replace("the_", "")) : "Pending"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Recommendations Tab */}
              {activeIntelTab === "recommendations" && (
                <div>
                  {(!intel.recommendations || intel.recommendations.length === 0) ? (
                    <div className="text-center py-6 text-muted-foreground text-sm">No recommendations yet</div>
                  ) : (
                    <div className="space-y-3">
                      {[...intel.recommendations]
                        .sort((a, b) => b.frequency - a.frequency)
                        .map((rec, idx) => (
                          <div key={idx} className="flex items-start gap-3 p-3 rounded-xl bg-muted border border-border">
                            <span className={`mt-0.5 text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                              rec.tier === 1
                                ? "bg-blue-500/15 text-blue-400 border border-blue-500/20"
                                : rec.tier === 2
                                ? "bg-blue-500/15 text-blue-400 border border-blue-500/20"
                                : "bg-gray-500/15 text-muted-foreground border border-gray-500/20"
                            }`}>
                              T{rec.tier}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-foreground/90">{rec.service}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                                  rec.urgency === "immediate"
                                    ? "text-red-400/70 bg-red-500/10 border border-red-500/15"
                                    : rec.urgency === "near_term"
                                    ? "text-yellow-400/70 bg-yellow-500/10 border border-yellow-500/15"
                                    : "text-blue-400/70 bg-blue-500/10 border border-blue-500/15"
                                }`}>
                                  {humanize(rec.urgency)}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">{rec.description}</p>
                              <div className="flex items-center gap-3 mt-2">
                                <span className="text-[10px] text-muted-foreground">{rec.estimatedValue}</span>
                                <span className="text-[10px] text-muted-foreground">{rec.frequency}x triggered</span>
                                <div className="flex-1 max-w-[80px] bg-muted rounded h-1.5 overflow-hidden">
                                  <div
                                    className="h-full rounded bg-blue-500/50"
                                    style={{ width: `${rec.confidence * 100}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}

              {/* Benchmark Tab */}
              {activeIntelTab === "benchmark" && (
                <div>
                  {(!intel.benchmarks || intel.benchmarks.length === 0) ? (
                    <div className="text-center py-6 text-muted-foreground text-sm">No benchmark data</div>
                  ) : (
                    <div className="space-y-4">
                      {intel.benchmarks.map((b) => {
                        const aboveAvg = b.companyAvg >= b.globalAvg;
                        return (
                          <div key={b.dimension}>
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-xs text-muted-foreground">{humanize(b.dimension)}</span>
                              <span className={`text-[10px] ${aboveAvg ? "text-green-400/60" : "text-red-400/60"}`}>
                                {aboveAvg ? "+" : ""}{Math.round(b.companyAvg - b.globalAvg)}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-blue-400/50 w-7 text-right flex-shrink-0">{Math.round(b.companyAvg)}</span>
                              <div className="flex-1 bg-muted rounded h-3 overflow-hidden relative">
                                <div
                                  className="absolute h-full rounded bg-blue-500/50"
                                  style={{ width: `${b.companyAvg}%`, minWidth: "2px" }}
                                />
                                <div
                                  className="absolute h-full rounded bg-muted"
                                  style={{ width: `${b.globalAvg}%`, minWidth: "2px" }}
                                />
                              </div>
                              <span className="text-[10px] text-muted-foreground w-7 text-right flex-shrink-0">{Math.round(b.globalAvg)}</span>
                            </div>
                            <div className="flex justify-between mt-0.5">
                              <span className="text-[9px] text-blue-400/30">Company</span>
                              <span className="text-[9px] text-muted-foreground">Global</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Session detail now opens in the push DetailDrawer context */}
    </div>
  );
}
