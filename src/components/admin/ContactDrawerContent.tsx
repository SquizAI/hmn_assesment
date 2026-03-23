import { useState, useEffect } from "react";
import StatusBadge from "./StatusBadge";
import { SessionDrawerContent } from "./SessionDrawer";
import { useDetailDrawer } from "./DetailDrawer";
import { fetchContactAssessments, callContacts } from "../../lib/admin-api";

interface Contact {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  company: string | null;
  role: string | null;
  industry: string | null;
  team_size: string | null;
  status: string;
  tags: string[];
  created_at: string;
}

interface Assessment {
  id: string;
  session_id: string;
  overall_score: number | null;
  archetype: string | null;
  assessment_type: string;
  created_at: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function scoreColor(score: number): string {
  if (score >= 70) return "text-green-400";
  if (score >= 45) return "text-yellow-400";
  return "text-red-400";
}

interface Props {
  contact: Contact;
  onClose: () => void;
}

export default function ContactDrawerContent({ contact, onClose }: Props) {
  const { openDrawer, closeDrawer } = useDetailDrawer();
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [calling, setCalling] = useState(false);
  const [callResult, setCallResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchContactAssessments(contact.id)
      .then((data) => setAssessments(data.assessments || []))
      .catch(() => setAssessments([]))
      .finally(() => setLoading(false));
  }, [contact.id]);

  const handleCallContact = async () => {
    setCalling(true);
    setCallResult(null);
    try {
      const res = await callContacts([contact.id]);
      if (res.results?.[0]?.success) {
        setCallResult({ success: true, message: "Call initiated successfully" });
      } else {
        setCallResult({ success: false, message: res.results?.[0]?.error || "Call failed" });
      }
    } catch {
      setCallResult({ success: false, message: "Failed to initiate call" });
    } finally {
      setCalling(false);
    }
  };

  const handleViewSession = (sessionId: string) => {
    openDrawer(
      <SessionDrawerContent
        sessionId={sessionId}
        onClose={closeDrawer}
        onDelete={closeDrawer}
      />
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-border shrink-0">
        <h2 className="text-lg font-semibold text-foreground">Contact Details</h2>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors text-xl leading-none hidden md:block"
        >
          &times;
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Contact Info Card */}
        <div className="bg-muted rounded-xl p-4 space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold text-foreground">{contact.name}</h3>
              {contact.role && <p className="text-sm text-muted-foreground">{contact.role}</p>}
            </div>
            <StatusBadge status={contact.status} />
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Phone</span>
              <p className="text-foreground/80 font-mono text-xs">{contact.phone}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Email</span>
              <p className="text-foreground/80 text-xs truncate">{contact.email || "\u2014"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Company</span>
              <p className="text-foreground/80">{contact.company || "\u2014"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Industry</span>
              <p className="text-foreground/80">{contact.industry || "\u2014"}</p>
            </div>
            {contact.team_size && (
              <div>
                <span className="text-muted-foreground">Team Size</span>
                <p className="text-foreground/80">{contact.team_size}</p>
              </div>
            )}
          </div>

          {/* Tags */}
          {contact.tags && contact.tags.length > 0 && (
            <div className="flex gap-1.5 flex-wrap pt-1">
              {contact.tags.map((tag) => (
                <span key={tag} className="px-2 py-0.5 text-[10px] bg-foreground/[0.06] text-muted-foreground rounded-full">
                  {tag}
                </span>
              ))}
            </div>
          )}

          <div className="text-xs text-muted-foreground pt-1">
            Added {formatDate(contact.created_at)}
          </div>
        </div>

        {/* Call Contact */}
        <div className="space-y-2">
          <button
            onClick={handleCallContact}
            disabled={calling || !contact.phone}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-sm font-medium hover:bg-blue-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {calling ? (
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
            )}
            Call Contact
          </button>
          {callResult && (
            <p className={`text-xs text-center ${callResult.success ? "text-green-400" : "text-red-400"}`}>
              {callResult.message}
            </p>
          )}
        </div>

        {/* Assessment History */}
        <div>
          <p className="text-sm text-muted-foreground font-medium mb-3">Assessment History</p>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-border border-t-white/60 rounded-full animate-spin" />
            </div>
          ) : assessments.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4">No assessments found for this contact.</p>
          ) : (
            <div className="space-y-2">
              {assessments.map((a) => (
                <div
                  key={a.id}
                  onClick={() => handleViewSession(a.session_id)}
                  className="flex items-center gap-3 px-3 py-2.5 bg-muted rounded-lg border border-border hover:bg-foreground/[0.04] cursor-pointer transition-colors"
                >
                  <span className="text-xs text-muted-foreground w-20 shrink-0">
                    {formatDate(a.created_at)}
                  </span>
                  {a.overall_score !== null && (
                    <span className={`text-sm font-semibold tabular-nums ${scoreColor(a.overall_score)}`}>
                      {Math.round(a.overall_score)}
                    </span>
                  )}
                  {a.archetype && (
                    <span className="px-2 py-0.5 text-[10px] font-medium bg-blue-500/10 text-blue-300 rounded-full border border-blue-500/20">
                      {a.archetype}
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground">{a.assessment_type}</span>
                  <div className="flex-1" />
                  <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
