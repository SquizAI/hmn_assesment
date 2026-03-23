import { useState, useEffect } from "react";
import StatusBadge from "./StatusBadge";
import ResearchCard from "./ResearchCard";
import AdaptabilitySessionView from "./AdaptabilitySessionView";
import { fetchSession, removeSession, triggerResearch, initiateCall, getCallStatus } from "../../lib/admin-api";
import type { ResearchData, AdaptabilityAnalysis } from "../../lib/types";

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
  adaptabilityAnalysis?: AdaptabilityAnalysis;
  research?: ResearchData | null;
  assessmentTypeId?: string;
}

type TabId = "details" | "analysis" | "research" | "responses";

const TABS: { id: TabId; label: string }[] = [
  { id: "details", label: "Details" },
  { id: "analysis", label: "Analysis" },
  { id: "research", label: "Research" },
  { id: "responses", label: "Responses" },
];

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

// ─── SessionDrawerContent ────────────────────────────────────────────────────
// Standalone content component that renders inside the DetailDrawer push panel.
// No fixed overlay, no backdrop — just the content.

interface SessionDrawerContentProps {
  sessionId: string;
  onClose: () => void;
  onDelete?: () => void;
}

export function SessionDrawerContent({ sessionId, onClose, onDelete }: SessionDrawerContentProps) {
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("details");
  const [researchLoading, setResearchLoading] = useState(false);
  const [callPhone, setCallPhone] = useState("");
  const [callLoading, setCallLoading] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);
  const [callStatus, setCallStatus] = useState<{
    vapiCallId: string | null;
    callInitiatedAt: string | null;
    callCompletedAt: string | null;
    callDuration: number | null;
    callRecordingUrl: string | null;
    hasTranscript: boolean;
  } | null>(null);
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  const loadSession = async () => {
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

  useEffect(() => {
    loadSession();
    getCallStatus(sessionId).then(setCallStatus).catch(() => {});
    setActiveTab("details");
    setDeleteConfirm(false);
    setTranscriptOpen(false);
  }, [sessionId]);

  const handleDelete = async () => {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      return;
    }
    try {
      await removeSession(sessionId);
      onDelete?.();
      onClose();
    } catch {
      setDeleteConfirm(false);
    }
  };

  const handleTriggerResearch = async () => {
    setResearchLoading(true);
    try {
      await triggerResearch(sessionId);
      await loadSession();
    } catch {
      // failed
    } finally {
      setResearchLoading(false);
    }
  };

  const handleInitiateCall = async () => {
    if (!callPhone.trim()) { setCallError("Enter a phone number"); return; }
    setCallLoading(true);
    setCallError(null);
    try {
      const result = await initiateCall(sessionId, callPhone.trim());
      if (result.success) {
        setCallStatus({
          vapiCallId: result.vapiCallId || null,
          callInitiatedAt: new Date().toISOString(),
          callCompletedAt: null,
          callDuration: null,
          callRecordingUrl: null,
          hasTranscript: false,
        });
      } else {
        setCallError(result.error || "Call failed");
      }
    } catch {
      setCallError("Failed to initiate call");
    } finally {
      setCallLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-border shrink-0">
        <h2 className="text-lg font-semibold text-foreground">Session Details</h2>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors text-xl leading-none hidden md:block"
        >
          &times;
        </button>
      </div>

      {/* Tabs */}
      {!loading && session && (
        <div className="flex border-b border-border px-4 sm:px-6 shrink-0">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-2.5 text-xs font-medium transition-colors relative ${
                activeTab === tab.id
                  ? "text-foreground/90"
                  : "text-muted-foreground hover:text-muted-foreground"
              }`}
            >
              {tab.label}
              {tab.id === "research" && session.research && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 absolute top-2 -right-0.5" />
              )}
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-t" />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-border border-t-white/60 rounded-full animate-spin" />
          </div>
        ) : !session ? (
          <div className="text-center py-24 space-y-2">
            <p className="text-muted-foreground">Session not found</p>
            <p className="text-muted-foreground/60 text-xs">This session may have been deleted or not yet started.</p>
          </div>
        ) : (
          <div className="px-4 sm:px-6 py-6 space-y-6">
            {/* Details Tab */}
            {activeTab === "details" && (
              <>
                {/* Participant Info Card */}
                <div className="bg-muted rounded-xl p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-foreground">
                        {session.participant?.name || (session as any).participantName || "Unknown Participant"}
                      </h3>
                      <p className="text-sm text-muted-foreground">{session.participant?.role || (session as any).participantRole || ""}</p>
                    </div>
                    <StatusBadge status={session.status} />
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">Company</span>
                      <p className="text-foreground/80">{session.participant?.company || (session as any).participantCompany || "\u2014"}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Industry</span>
                      <p className="text-foreground/80">{session.participant?.industry || (session as any).participantIndustry || "\u2014"}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Team Size</span>
                      <p className="text-foreground/80">{session.participant?.teamSize || (session as any).participantTeamSize || "\u2014"}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Email</span>
                      <p className="text-foreground/80">{session.participant?.email || (session as any).participantEmail || "\u2014"}</p>
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground pt-1">
                    Created {formatTimestamp(session.createdAt)}
                  </div>
                </div>

                {/* Call Participant */}
                <div className="bg-muted rounded-xl p-4 space-y-3">
                  <p className="text-sm text-muted-foreground font-medium">Call Participant</p>

                  {callStatus?.vapiCallId ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${callStatus.callCompletedAt ? "bg-green-400" : "bg-yellow-400 animate-pulse"}`} />
                        <span className="text-sm text-foreground/80">
                          {callStatus.callCompletedAt
                            ? `Call completed${callStatus.callDuration ? ` (${Math.round(callStatus.callDuration / 60)}m)` : ""}`
                            : "Call in progress..."}
                        </span>
                      </div>
                      {callStatus.callRecordingUrl && (
                        <a
                          href={callStatus.callRecordingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Listen to recording
                        </a>
                      )}
                      {callStatus.hasTranscript && (
                        <div>
                          <button
                            onClick={() => setTranscriptOpen((o) => !o)}
                            className="inline-flex items-center gap-1 text-xs text-green-400/70 hover:text-green-300 transition-colors"
                          >
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                            Transcript saved
                            <svg className={`w-3 h-3 transition-transform ${transcriptOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                          </button>
                          {transcriptOpen && (session as any).callTranscript && (
                            <div className="mt-2 max-h-48 overflow-y-auto bg-muted rounded-lg p-3 text-xs text-foreground/80 font-mono whitespace-pre-wrap border border-border">
                              {(session as any).callTranscript}
                            </div>
                          )}
                        </div>
                      )}
                      <button
                        onClick={() => { setCallStatus(null); setCallPhone(""); }}
                        className="text-xs text-muted-foreground hover:text-muted-foreground transition-colors"
                      >
                        Call again
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="tel"
                          value={callPhone}
                          onChange={(e) => setCallPhone(e.target.value)}
                          placeholder="+1 (555) 123-4567"
                          className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-border"
                        />
                        <button
                          onClick={handleInitiateCall}
                          disabled={callLoading || !callPhone.trim()}
                          className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                        >
                          {callLoading ? (
                            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                          )}
                          Call
                        </button>
                      </div>
                      {callError && (
                        <p className="text-red-400 text-xs">{callError}</p>
                      )}
                      <p className="text-muted-foreground text-xs">Vapi will call and run the full assessment via voice</p>
                    </div>
                  )}
                </div>

                {/* Delete Button */}
                <div className="pt-4 border-t border-border">
                  <button
                    onClick={handleDelete}
                    className={`w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                      deleteConfirm
                        ? "bg-red-600 text-foreground hover:bg-red-700"
                        : "bg-muted text-red-400 border border-red-500/20 hover:bg-red-500/10"
                    }`}
                  >
                    {deleteConfirm ? "Confirm Delete?" : "Delete Session"}
                  </button>
                </div>
              </>
            )}

            {/* Analysis Tab */}
            {activeTab === "analysis" && (
              <>
                {session.assessmentTypeId === "adaptability-index" ? (
                  session.adaptabilityAnalysis ? (
                    <AdaptabilitySessionView analysis={session.adaptabilityAnalysis} />
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      <p>No adaptability analysis available yet</p>
                      <p className="text-xs mt-1 text-muted-foreground">Complete the session to generate analysis</p>
                    </div>
                  )
                ) : session.analysis ? (
                  <div className="space-y-4">
                    {/* Overall Score */}
                    <div className="bg-muted rounded-xl p-4 flex items-center gap-4">
                      <div
                        className={`text-4xl font-bold ${scoreColor(
                          session.analysis.overallReadinessScore
                        )}`}
                      >
                        {session.analysis.overallReadinessScore}
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Overall Readiness Score</p>
                        <p className="text-foreground font-medium">
                          {session.analysis.archetype}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {session.analysis.archetypeDescription}
                        </p>
                      </div>
                    </div>

                    {/* Dimension Scores */}
                    <div className="bg-muted rounded-xl p-4 space-y-3">
                      <p className="text-sm text-muted-foreground font-medium">Dimension Scores</p>
                      {session.analysis.dimensionScores.map((ds) => (
                        <div key={ds.dimension}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-muted-foreground">{ds.dimension}</span>
                            <span className="text-muted-foreground">{ds.score}</span>
                          </div>
                          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${scoreBarColor(ds.score)}`}
                              style={{ width: `${ds.score}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Red Flags */}
                    {session.analysis.redFlags.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground font-medium">Red Flags</p>
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
                        <p className="text-sm text-muted-foreground font-medium">Green Lights</p>
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
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <p>No analysis available yet</p>
                    <p className="text-xs mt-1 text-muted-foreground">Complete the session to generate analysis</p>
                  </div>
                )}
              </>
            )}

            {/* Research Tab */}
            {activeTab === "research" && (
              <ResearchCard
                research={(session.research as ResearchData) || null}
                onTriggerResearch={handleTriggerResearch}
                triggerLoading={researchLoading}
              />
            )}

            {/* Responses Tab */}
            {activeTab === "responses" && (
              <>
                {session.responses.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground font-medium mb-3">
                      {session.responses.length} Responses
                    </p>
                    {session.responses.map((resp, i) => (
                      <div
                        key={resp.questionId}
                        className={`rounded-lg p-3 ${
                          i % 2 === 0 ? "bg-muted" : "bg-foreground/[0.04]"
                        }`}
                      >
                        <p className="text-sm text-muted-foreground mb-1">{resp.questionText}</p>
                        <p className="text-foreground text-sm whitespace-pre-wrap">
                          {(() => {
                            const raw = resp.answer;
                            if (typeof raw !== "string") return String(raw ?? "");
                            if (raw.startsWith('"') && raw.endsWith('"')) {
                              try { return JSON.parse(raw); } catch { /* fall through */ }
                            }
                            return raw;
                          })()}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatTimestamp(resp.timestamp)}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">No responses yet</div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Legacy SessionDrawer (overlay wrapper) ──────────────────────────────────
// Kept for backward compatibility in pages not yet using DetailDrawer context.

interface SessionDrawerProps {
  sessionId: string;
  onClose: () => void;
  onDelete?: () => void;
}

export default function SessionDrawer({ sessionId, onClose, onDelete }: SessionDrawerProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setVisible(true);
      });
    });
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 300);
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
        className={`absolute right-0 top-0 h-full w-full sm:max-w-lg bg-background border-l border-border flex flex-col transition-transform duration-300 ease-in-out ${
          visible ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <SessionDrawerContent
          sessionId={sessionId}
          onClose={handleClose}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
}
