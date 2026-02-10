import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import StatusBadge from "../components/admin/StatusBadge";
import ResearchCard from "../components/admin/ResearchCard";
import SessionDrawer from "../components/admin/SessionDrawer";
import { fetchCompanyDetail, triggerResearch } from "../lib/admin-api";
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

  const [detail, setDetail] = useState<CompanyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [researchLoading, setResearchLoading] = useState(false);

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
        <span className="text-white/30">Loading company detail...</span>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="px-6 py-6 text-center">
        <p className="text-white/40">Company not found</p>
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
          className="text-white/30 hover:text-white/60 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
        </button>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-white/90">{detail.company}</h2>
          <div className="flex items-center gap-2 mt-0.5">
            {detail.industries.map((ind) => (
              <span key={ind} className="text-xs px-2 py-0.5 rounded-full bg-white/[0.05] border border-white/10 text-white/40">
                {ind}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white/[0.03] rounded-xl border border-white/10 p-4">
          <span className="text-2xl font-bold text-white/80">{detail.sessionCount}</span>
          <p className="text-xs text-white/30 mt-1">Total Sessions</p>
        </div>
        <div className="bg-white/[0.03] rounded-xl border border-white/10 p-4">
          <span className="text-2xl font-bold text-white/80">{detail.participantCount}</span>
          <p className="text-xs text-white/30 mt-1">Participants</p>
        </div>
        <div className="bg-white/[0.03] rounded-xl border border-white/10 p-4">
          <span className={`text-2xl font-bold ${detail.averageScore ? scoreTextColor(detail.averageScore) : "text-white/30"}`}>
            {detail.averageScore ?? "\u2014"}
          </span>
          <p className="text-xs text-white/30 mt-1">Avg Score</p>
        </div>
        <div className="bg-white/[0.03] rounded-xl border border-white/10 p-4">
          <span className="text-2xl font-bold text-white/80">{detail.completionRate}%</span>
          <p className="text-xs text-white/30 mt-1">Completion Rate</p>
        </div>
      </div>

      {/* Two-column: Research + Dimensions | Sessions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Research + Dimensions */}
        <div className="space-y-6">
          {/* Research Card */}
          <div className="bg-white/[0.03] rounded-2xl border border-white/10 p-5">
            <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-4">Company Research</h3>
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
            <div className="bg-white/[0.03] rounded-2xl border border-white/10 p-5">
              <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-4">
                Dimension Averages
              </h3>
              <div className="space-y-3">
                {detail.dimensionAverages.map((dim) => (
                  <div key={dim.dimension} className="flex items-center gap-3">
                    <span className="w-36 text-sm text-white/50 flex-shrink-0 truncate">
                      {humanize(dim.dimension)}
                    </span>
                    <span className="text-sm font-medium text-white/70 tabular-nums w-8 text-right flex-shrink-0">
                      {Math.round(dim.average)}
                    </span>
                    <div className="flex-1 bg-white/5 rounded-lg h-5 overflow-hidden">
                      <div
                        className={`h-full rounded-lg ${scoreBarColor(dim.average)}`}
                        style={{ width: `${dim.average}%`, minWidth: "2px" }}
                      />
                    </div>
                    <span className="text-[10px] text-white/20 w-8 text-right">{dim.count}s</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Sessions Table */}
        <div className="bg-white/[0.03] rounded-2xl border border-white/10 overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.06]">
            <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider">
              Sessions ({detail.sessions.length})
            </h3>
          </div>
          <div className="overflow-y-auto max-h-[600px]">
            <table className="w-full">
              <thead>
                <tr className="bg-white/[0.02]">
                  <th className="text-left text-xs text-white/40 uppercase tracking-wider px-4 py-2.5">Name</th>
                  <th className="text-left text-xs text-white/40 uppercase tracking-wider px-4 py-2.5">Status</th>
                  <th className="text-left text-xs text-white/40 uppercase tracking-wider px-4 py-2.5">Date</th>
                  <th className="text-left text-xs text-white/40 uppercase tracking-wider px-4 py-2.5 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {detail.sessions.map((session) => (
                  <tr
                    key={session.id}
                    onClick={() => setSelectedSessionId(session.id)}
                    className="hover:bg-white/[0.04] cursor-pointer transition-colors border-t border-white/5"
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white/80">{session.participantName}</span>
                        {session.hasResearch && (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" title="Has research" />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={session.status} />
                    </td>
                    <td className="px-4 py-2.5 text-xs text-white/30">
                      {formatDate(session.createdAt)}
                    </td>
                    <td className="px-4 py-2.5">
                      <svg className="w-4 h-4 text-white/15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
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

      {/* Session Drawer */}
      {selectedSessionId && (
        <SessionDrawer
          sessionId={selectedSessionId}
          onClose={() => setSelectedSessionId(null)}
          onDelete={() => { setSelectedSessionId(null); loadDetail(); }}
        />
      )}
    </div>
  );
}
