import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import StatCard from "../components/admin/StatCard";
import StatusBadge from "../components/admin/StatusBadge";
import { fetchStats, fetchFunnel, fetchDimensions, fetchSessions } from "../lib/admin-api";

interface Stats {
  totalSessions: number;
  completedSessions: number;
  analyzedSessions: number;
  completionRate: number;
  averageScore: number;
  assessmentBreakdown: { assessmentTypeId: string; count: number }[];
}

interface FunnelStage {
  stage: "intake" | "in_progress" | "completed" | "analyzed";
  count: number;
  percentage: number;
}

interface Dimension {
  dimension: string;
  average: number;
  count: number;
}

interface Session {
  id: string;
  participantName: string;
  participantCompany: string;
  status: string;
  createdAt: string;
  assessmentTypeId: string;
  responseCount: number;
}

const FUNNEL_COLORS: Record<string, string> = {
  intake: "from-gray-500 to-gray-600",
  in_progress: "from-blue-500 to-blue-600",
  completed: "from-green-500 to-green-600",
  analyzed: "from-purple-500 to-purple-600",
};

const FUNNEL_LABELS: Record<string, string> = {
  intake: "Intake",
  in_progress: "In Progress",
  completed: "Completed",
  analyzed: "Analyzed",
};

function humanize(snake: string): string {
  return snake
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function relativeDate(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
}

function scoreColor(score: number): "green" | "yellow" | "red" {
  if (score >= 70) return "green";
  if (score >= 45) return "yellow";
  return "red";
}

function scoreBarColor(score: number): string {
  if (score >= 70) return "from-green-500 to-green-600";
  if (score >= 45) return "from-yellow-500 to-yellow-600";
  return "from-red-500 to-red-600";
}

export default function AdminDashboardPage() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [funnel, setFunnel] = useState<FunnelStage[]>([]);
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);

  useEffect(() => {
    Promise.all([fetchStats(), fetchFunnel(), fetchDimensions(), fetchSessions()])
      .then(([statsData, funnelData, dimensionsData, sessionsData]) => {
        setStats(statsData);
        setFunnel(funnelData.funnel);
        setDimensions(dimensionsData.dimensions);
        setSessions(sessionsData.sessions);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Dashboard load error:", err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="px-6 py-6 flex items-center justify-center h-full">
        <span className="text-white/30">Loading...</span>
      </div>
    );
  }

  return (
    <div className="px-6 py-6 space-y-6">
      {/* Stat Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Sessions"
          value={stats?.totalSessions ?? 0}
          sub={`${stats?.completedSessions ?? 0} completed`}
        />
        <StatCard
          label="Completion Rate"
          value={`${stats?.completionRate ?? 0}%`}
          color={
            (stats?.completionRate ?? 0) > 50
              ? "green"
              : (stats?.completionRate ?? 0) > 25
              ? "yellow"
              : "red"
          }
        />
        <StatCard
          label="Avg Score"
          value={stats?.averageScore || "\u2014"}
          color={
            stats?.averageScore
              ? scoreColor(stats.averageScore)
              : "default"
          }
          sub="/100"
        />
        <StatCard
          label="Assessments"
          value={stats?.assessmentBreakdown?.length ?? 0}
        />
      </div>

      {/* Completion Funnel */}
      <div className="bg-white/[0.03] rounded-2xl border border-white/10 p-6">
        <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-4">
          Completion Funnel
        </h2>
        <div className="space-y-3">
          {funnel.map((stage) => (
            <div key={stage.stage} className="flex items-center gap-3">
              <span className="w-28 text-sm text-white/50 flex-shrink-0">
                {FUNNEL_LABELS[stage.stage] || stage.stage}
              </span>
              <div className="flex-1 bg-white/5 rounded-lg h-8 overflow-hidden">
                <div
                  className={`h-full rounded-lg bg-gradient-to-r ${FUNNEL_COLORS[stage.stage] || "from-gray-500 to-gray-600"}`}
                  style={{ width: `${stage.percentage}%`, minWidth: "2px" }}
                />
              </div>
              <span className="text-sm text-white/40 tabular-nums flex-shrink-0 w-24 text-right">
                {stage.count} ({stage.percentage}%)
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Two-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Dimension Averages */}
        <div className="bg-white/[0.03] rounded-2xl border border-white/10 p-6">
          <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-4">
            Dimension Averages
          </h2>
          {dimensions.length === 0 ? (
            <div className="text-center py-8 text-white/30">No dimension data yet</div>
          ) : (
            <div className="space-y-3">
              {dimensions.map((dim) => (
                <div key={dim.dimension} className="flex items-center gap-3">
                  <span className="w-36 text-sm text-white/50 flex-shrink-0 truncate">
                    {humanize(dim.dimension)}
                  </span>
                  <span className="text-sm font-medium text-white/70 tabular-nums w-8 text-right flex-shrink-0">
                    {Math.round(dim.average)}
                  </span>
                  <div className="flex-1 bg-white/5 rounded-lg h-5 overflow-hidden">
                    <div
                      className={`h-full rounded-lg bg-gradient-to-r ${scoreBarColor(dim.average)}`}
                      style={{ width: `${dim.average}%`, minWidth: "2px" }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Sessions */}
        <div className="bg-white/[0.03] rounded-2xl border border-white/10 p-6">
          <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-4">
            Recent Sessions
          </h2>
          {sessions.length === 0 ? (
            <div className="text-center py-8 text-white/30">No sessions yet</div>
          ) : (
            <div className="space-y-2">
              {sessions.slice(0, 10).map((session) => (
                <div
                  key={session.id}
                  onClick={() => navigate("/admin/sessions")}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 cursor-pointer transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-white/80 truncate block">
                      {session.participantName}
                    </span>
                    <span className="text-xs text-white/40 truncate block">
                      {session.participantCompany}
                    </span>
                  </div>
                  <StatusBadge status={session.status} />
                  <span className="text-xs text-white/30 flex-shrink-0 w-16 text-right">
                    {relativeDate(session.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
