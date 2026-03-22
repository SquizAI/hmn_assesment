import { Link } from "react-router-dom";
import StatusBadge from "./StatusBadge";

interface Call {
  id: string;
  contact_id: string;
  session_id: string | null;
  status: string;
  duration_seconds: number | null;
  recording_url: string | null;
  transcript: string | null;
  transcript_messages: Array<{ role: string; message: string; timestamp?: number }> | null;
  analysis_status: string;
  created_at: string;
  contact: { id: string; name: string; phone: string; company: string | null } | null;
  profile_score: number | null;
  profile_archetype: string | null;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function scoreColor(score: number): string {
  if (score >= 70) return "text-green-400";
  if (score >= 45) return "text-yellow-400";
  return "text-red-400";
}

interface Props {
  call: Call;
  onClose: () => void;
}

export default function CallDrawerContent({ call, onClose }: Props) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-border shrink-0">
        <h2 className="text-lg font-semibold text-foreground">Call Details</h2>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors text-xl leading-none hidden md:block"
        >
          &times;
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Contact Info */}
        <div className="bg-muted rounded-xl p-4 space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold text-foreground">
                {call.contact?.name || "Unknown Contact"}
              </h3>
              {call.contact?.company && (
                <p className="text-sm text-muted-foreground">{call.contact.company}</p>
              )}
            </div>
            <StatusBadge status={call.status} />
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Phone</span>
              <p className="text-foreground/80 font-mono text-xs">{call.contact?.phone || "\u2014"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Duration</span>
              <p className="text-foreground/80">{formatDuration(call.duration_seconds)}</p>
            </div>
          </div>

          <div className="text-xs text-muted-foreground pt-1">
            {formatDate(call.created_at)}
          </div>
        </div>

        {/* Profile / Analysis */}
        {(call.profile_archetype || call.profile_score !== null) && (
          <div className="bg-muted rounded-xl p-4 space-y-2">
            <p className="text-sm text-muted-foreground font-medium">Profile</p>
            <div className="flex items-center gap-3">
              {call.profile_score !== null && (
                <span className={`text-3xl font-bold tabular-nums ${scoreColor(call.profile_score)}`}>
                  {Math.round(call.profile_score)}
                </span>
              )}
              {call.profile_archetype && (
                <span className="px-2.5 py-1 text-xs font-medium bg-blue-500/10 text-blue-300 rounded-full border border-blue-500/20">
                  {call.profile_archetype}
                </span>
              )}
            </div>
            {call.analysis_status === "completed" && call.session_id && (
              <Link
                to={`/analysis/${call.session_id}`}
                className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors mt-1"
              >
                View Full Analysis
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
              </Link>
            )}
          </div>
        )}

        {/* Recording */}
        <div className="bg-muted rounded-xl p-4 space-y-2">
          <p className="text-sm text-muted-foreground font-medium">Recording</p>
          {call.recording_url ? (
            <audio controls className="w-full h-10" preload="metadata">
              <source src={call.recording_url} />
            </audio>
          ) : (
            <p className="text-xs text-muted-foreground">No recording available</p>
          )}
        </div>

        {/* Transcript */}
        <div className="bg-muted rounded-xl p-4 space-y-2">
          <p className="text-sm text-muted-foreground font-medium">Transcript</p>
          {call.transcript_messages && call.transcript_messages.length > 0 ? (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {call.transcript_messages.map((msg, i) => (
                <div key={i} className={`flex gap-2 ${msg.role === "assistant" ? "" : "flex-row-reverse"}`}>
                  <div className={`max-w-[80%] px-3 py-2 rounded-lg text-xs ${
                    msg.role === "assistant"
                      ? "bg-primary text-primary-foreground"
                      : "bg-foreground/[0.06] text-foreground"
                  }`}>
                    {msg.message}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No transcript available</p>
          )}
        </div>
      </div>
    </div>
  );
}
