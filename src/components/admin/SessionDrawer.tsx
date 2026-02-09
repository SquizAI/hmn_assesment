import { useState, useEffect } from "react";
import { useRobot } from "./RobotToast";
import StatusBadge from "./StatusBadge";
import { fetchSession, removeSession } from "../../lib/admin-api";

interface Participant {
  name: string;
  role: string;
  company: string;
  industry: string;
  teamSize: string;
  email: string;
}

interface Response {
  questionId: string;
  questionText: string;
  answer: string;
  timestamp: string;
}

interface DimensionScore {
  dimension: string;
  score: number;
}

interface RedFlag {
  description: string;
}

interface GreenLight {
  description: string;
}

interface Analysis {
  overallReadinessScore: number;
  archetype: string;
  archetypeDescription: string;
  dimensionScores: DimensionScore[];
  redFlags: RedFlag[];
  greenLights: GreenLight[];
}

interface InterviewSession {
  id: string;
  participant: Participant;
  status: "intake" | "in_progress" | "completed" | "analyzed";
  createdAt: string;
  updatedAt: string;
  responses: Response[];
  analysis?: Analysis;
}

interface SessionDrawerProps {
  sessionId: string;
  onClose: () => void;
}

function scoreColor(score: number): string {
  if (score >= 70) return "text-green-400";
  if (score >= 40) return "text-yellow-400";
  return "text-red-400";
}

function scoreBarColor(score: number): string {
  if (score >= 70) return "bg-green-500";
  if (score >= 40) return "bg-yellow-500";
  return "bg-red-500";
}

function formatTimestamp(ts: string): string {
  const date = new Date(ts);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function SessionDrawer({ sessionId, onClose }: SessionDrawerProps) {
  const robot = useRobot();

  const [session, setSession] = useState<InterviewSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  useEffect(() => {
    robot.say("action", "BEEP BOP... pulling up customer file...");

    const load = async () => {
      setLoading(true);
      try {
        const data = await fetchSession(sessionId);
        setSession(data.session);
      } catch {
        setSession(null);
      } finally {
        setLoading(false);
      }
    };

    load();

    // Trigger slide-in animation
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setVisible(true);
      });
    });
  }, [sessionId, robot]);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 300);
  };

  const handleDelete = async () => {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      return;
    }

    robot.say("action", "KABLAM! Session obliterated!");
    try {
      await removeSession(sessionId);
      handleClose();
    } catch {
      setDeleteConfirm(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 transition-opacity duration-300"
        style={{ opacity: visible ? 1 : 0 }}
        onClick={handleClose}
      />

      {/* Drawer Panel */}
      <div
        className={`absolute right-0 top-0 h-full w-full max-w-lg bg-[#0a0a0f] border-l border-white/10 overflow-y-auto transition-transform duration-300 ease-in-out ${
          visible ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white">Session Details</h2>
          <button
            onClick={handleClose}
            className="text-white/40 hover:text-white transition-colors text-xl leading-none"
          >
            &times;
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
          </div>
        ) : !session ? (
          <div className="text-center text-white/30 py-24">
            Session not found
          </div>
        ) : (
          <div className="px-6 py-6 space-y-6">
            {/* Participant Info Card */}
            <div className="bg-white/[0.03] rounded-xl p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white">
                    {session.participant.name}
                  </h3>
                  <p className="text-sm text-white/50">{session.participant.role}</p>
                </div>
                <StatusBadge status={session.status} />
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-white/30">Company</span>
                  <p className="text-white/70">{session.participant.company}</p>
                </div>
                <div>
                  <span className="text-white/30">Industry</span>
                  <p className="text-white/70">{session.participant.industry}</p>
                </div>
                <div>
                  <span className="text-white/30">Team Size</span>
                  <p className="text-white/70">{session.participant.teamSize}</p>
                </div>
                <div>
                  <span className="text-white/30">Email</span>
                  <p className="text-white/70">{session.participant.email}</p>
                </div>
              </div>

              <div className="text-xs text-white/20 pt-1">
                Created {formatTimestamp(session.createdAt)}
              </div>
            </div>

            {/* Analysis Summary */}
            {session.analysis && (
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-white/60 uppercase tracking-wider">
                  Analysis
                </h3>

                {/* Overall Score */}
                <div className="bg-white/[0.03] rounded-xl p-4 flex items-center gap-4">
                  <div
                    className={`text-4xl font-bold ${scoreColor(
                      session.analysis.overallReadinessScore
                    )}`}
                  >
                    {session.analysis.overallReadinessScore}
                  </div>
                  <div>
                    <p className="text-sm text-white/40">Overall Readiness Score</p>
                    <p className="text-white font-medium">
                      {session.analysis.archetype}
                    </p>
                    <p className="text-xs text-white/40 mt-1">
                      {session.analysis.archetypeDescription}
                    </p>
                  </div>
                </div>

                {/* Dimension Scores */}
                <div className="bg-white/[0.03] rounded-xl p-4 space-y-3">
                  <p className="text-sm text-white/40 font-medium">
                    Dimension Scores
                  </p>
                  {session.analysis.dimensionScores.map((ds) => (
                    <div key={ds.dimension}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-white/60">{ds.dimension}</span>
                        <span className="text-white/40">{ds.score}</span>
                      </div>
                      <div className="w-full h-2 bg-white/[0.06] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${scoreBarColor(
                            ds.score
                          )}`}
                          style={{ width: `${ds.score}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Red Flags */}
                {session.analysis.redFlags.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm text-white/40 font-medium">Red Flags</p>
                    {session.analysis.redFlags.map((flag, i) => (
                      <div
                        key={i}
                        className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-sm text-red-300"
                      >
                        {flag.description}
                      </div>
                    ))}
                  </div>
                )}

                {/* Green Lights */}
                {session.analysis.greenLights.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm text-white/40 font-medium">Green Lights</p>
                    {session.analysis.greenLights.map((light, i) => (
                      <div
                        key={i}
                        className="bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2 text-sm text-green-300"
                      >
                        {light.description}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Responses */}
            {session.responses.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-white/60 uppercase tracking-wider">
                  Responses ({session.responses.length})
                </h3>
                {session.responses.map((resp, i) => (
                  <div
                    key={resp.questionId}
                    className={`rounded-lg p-3 ${
                      i % 2 === 0 ? "bg-white/[0.02]" : "bg-white/[0.04]"
                    }`}
                  >
                    <p className="text-sm text-white/50 mb-1">
                      {resp.questionText}
                    </p>
                    <p className="text-white text-sm">{resp.answer}</p>
                    <p className="text-xs text-white/20 mt-1">
                      {formatTimestamp(resp.timestamp)}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Delete Button */}
            <div className="pt-4 border-t border-white/10">
              <button
                onClick={handleDelete}
                className={`w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                  deleteConfirm
                    ? "bg-red-600 text-white hover:bg-red-700"
                    : "bg-white/[0.05] text-red-400 border border-red-500/20 hover:bg-red-500/10"
                }`}
              >
                {deleteConfirm ? "Confirm Delete?" : "Delete Session"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
