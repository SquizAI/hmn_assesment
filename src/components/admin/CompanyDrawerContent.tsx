import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import StatusBadge from "./StatusBadge";
import { SessionDrawerContent } from "./SessionDrawer";
import { useDetailDrawer } from "./DetailDrawer";
import { fetchCompanyDetail } from "../../lib/admin-api";

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
}

function scoreColor(score: number): string {
  if (score >= 70) return "text-green-400";
  if (score >= 45) return "text-yellow-400";
  return "text-red-400";
}

function scoreBarColor(score: number): string {
  if (score >= 70) return "bg-green-500";
  if (score >= 45) return "bg-yellow-500";
  return "bg-red-500";
}

function relativeDate(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  return "just now";
}

interface Props {
  companyName: string;
  onClose: () => void;
}

export default function CompanyDrawerContent({ companyName, onClose }: Props) {
  const navigate = useNavigate();
  const { openDrawer, closeDrawer } = useDetailDrawer();
  const [detail, setDetail] = useState<CompanyDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchCompanyDetail(companyName)
      .then((data) => setDetail(data?.company ?? data))
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [companyName]);

  const handleSessionClick = (sessionId: string) => {
    openDrawer(
      <SessionDrawerContent
        sessionId={sessionId}
        onClose={closeDrawer}
        onDelete={closeDrawer}
      />
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-border border-t-white/60 rounded-full animate-spin" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="text-center py-24 space-y-2">
        <p className="text-muted-foreground">Company not found</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-500/20 border border-border flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-bold text-muted-foreground">
              {detail.company.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-foreground truncate">{detail.company}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              {detail.industries.map((ind) => (
                <span key={ind} className="text-[11px] text-muted-foreground">{ind}</span>
              ))}
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors text-xl leading-none hidden md:block"
        >
          &times;
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-muted rounded-xl p-3 text-center">
            <span className="text-2xl font-semibold text-foreground/90">{detail.sessionCount}</span>
            <p className="text-[10px] text-muted-foreground mt-0.5">Sessions</p>
          </div>
          <div className="bg-muted rounded-xl p-3 text-center">
            <span className="text-2xl font-semibold text-foreground/90">{detail.participantCount}</span>
            <p className="text-[10px] text-muted-foreground mt-0.5">Participants</p>
          </div>
          <div className="bg-muted rounded-xl p-3 text-center">
            <span className={`text-2xl font-semibold ${detail.averageScore ? scoreColor(detail.averageScore) : "text-muted-foreground"}`}>
              {detail.averageScore ? Math.round(detail.averageScore) : "\u2014"}
            </span>
            <p className="text-[10px] text-muted-foreground mt-0.5">Avg Score</p>
          </div>
          <div className="bg-muted rounded-xl p-3 text-center">
            <span className="text-2xl font-semibold text-foreground/90">{detail.completionRate}%</span>
            <p className="text-[10px] text-muted-foreground mt-0.5">Completion</p>
          </div>
        </div>

        {/* Dimension Averages */}
        {detail.dimensionAverages.length > 0 && (
          <div className="bg-muted rounded-xl p-4 space-y-3">
            <p className="text-sm text-muted-foreground font-medium">Dimension Averages</p>
            {detail.dimensionAverages.map((d) => (
              <div key={d.dimension}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">{d.dimension}</span>
                  <span className="text-muted-foreground">{Math.round(d.average)}</span>
                </div>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${scoreBarColor(d.average)}`}
                    style={{ width: `${d.average}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Research indicator */}
        {detail.hasResearch && (
          <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-xs text-emerald-400">Company research available</span>
          </div>
        )}

        {/* Sessions List */}
        <div>
          <p className="text-sm text-muted-foreground font-medium mb-3">
            Sessions ({detail.sessions.length})
          </p>
          <div className="space-y-1">
            {detail.sessions.map((s) => (
              <div
                key={s.id}
                onClick={() => handleSessionClick(s.id)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-foreground/[0.04] cursor-pointer transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground/90 truncate">{s.participantName}</p>
                  <p className="text-xs text-muted-foreground">{relativeDate(s.createdAt)}</p>
                </div>
                <StatusBadge status={s.status} size="sm" />
                {s.hasResearch && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* View Full Detail button */}
        <button
          onClick={() => {
            onClose();
            navigate(`/admin/companies/${encodeURIComponent(detail.company)}`);
          }}
          className="w-full px-4 py-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-sm font-medium hover:bg-blue-500/20 transition-all"
        >
          View Full Company Detail
        </button>
      </div>
    </div>
  );
}
