import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { API_BASE } from "../lib/api";
import Button from "../components/ui/Button";
import type { AssessmentSummary } from "../lib/types";

interface SessionLookup {
  id: string;
  status: string;
  createdAt: string;
  assessmentTypeId?: string;
  participantName?: string;
  participantCompany?: string;
  score?: number;
}

const STATUS_LABELS: Record<string, string> = {
  intake: "Not started",
  in_progress: "In progress",
  completed: "Completed",
  analyzed: "Results ready",
};

const STATUS_COLORS: Record<string, string> = {
  intake: "text-gray-400",
  in_progress: "text-blue-400",
  completed: "text-green-400",
  analyzed: "text-purple-400",
};

export default function HomePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [assessments, setAssessments] = useState<AssessmentSummary[]>([]);
  const [selectedAssessment, setSelectedAssessment] = useState<AssessmentSummary | null>(null);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [company, setCompany] = useState("");
  const [industry, setIndustry] = useState("");
  const [teamSize, setTeamSize] = useState("");
  const [email, setEmail] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Invite state
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState("");

  // Sign-in state
  const [showSignIn, setShowSignIn] = useState(false);
  const [signInEmail, setSignInEmail] = useState("");
  const [signInLoading, setSignInLoading] = useState(false);
  const [signInSessions, setSignInSessions] = useState<SessionLookup[] | null>(null);
  const [signInError, setSignInError] = useState("");

  useEffect(() => {
    fetch(`${API_BASE}/api/assessments`)
      .then((r) => r.json())
      .then((data) => {
        if (data.assessments?.length > 0) {
          setAssessments(data.assessments);
          // Auto-select assessment from ?assessment=<id> query param (e.g. shared link)
          const assessmentParam = searchParams.get("assessment");
          if (assessmentParam) {
            const match = data.assessments.find((a: AssessmentSummary) => a.id === assessmentParam);
            if (match) {
              setSelectedAssessment(match);
              setShowForm(true);
            }
          }
        }
      })
      .catch(() => {});
  }, [searchParams]);

  // Invite token detection
  useEffect(() => {
    const token = searchParams.get("invite");
    if (!token) return;

    setInviteToken(token);
    setInviteLoading(true);

    fetch(`${API_BASE}/api/invitations/lookup?token=${encodeURIComponent(token)}`)
      .then((r) => {
        if (!r.ok) throw new Error("Invalid invitation");
        return r.json();
      })
      .then((data) => {
        // Pre-fill form fields
        const p = data.invitation.participant;
        setName(p.name || "");
        setEmail(p.email || "");
        if (p.company) setCompany(p.company);
        if (p.role) setRole(p.role);
        if (p.industry) setIndustry(p.industry);
        if (p.teamSize) setTeamSize(p.teamSize);

        // Auto-select assessment
        if (data.assessment) setSelectedAssessment(data.assessment);

        // Jump to form
        setShowForm(true);

        // Handle already-used invitation
        if (data.invitation.sessionId) {
          setInviteError("already_used");
        }
      })
      .catch(() => {
        setInviteError("This invitation link is invalid or has expired.");
      })
      .finally(() => {
        setInviteLoading(false);
      });
  }, [searchParams]);

  const handleSelectAssessment = (a: AssessmentSummary) => {
    setSelectedAssessment(a);
    setShowForm(true);
  };

  const handleStart = async () => {
    if (!name || !company || !email) return;
    setIsCreating(true);
    try {
      const res = await fetch(`${API_BASE}/api/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participant: { name, role, company, industry, teamSize, email },
          assessmentTypeId: selectedAssessment?.id || "ai-readiness",
          inviteToken: inviteToken || undefined,
        }),
      });
      const data = await res.json();
      if (data.session?.id) navigate(`/research/${data.session.id}`);
    } catch (err) { console.error(err); }
    finally { setIsCreating(false); }
  };

  const handleSignIn = async () => {
    if (!signInEmail) return;
    setSignInLoading(true);
    setSignInError("");
    setSignInSessions(null);
    try {
      const res = await fetch(`${API_BASE}/api/sessions/lookup?email=${encodeURIComponent(signInEmail)}`);
      const data = await res.json();
      if (data.sessions?.length > 0) {
        setSignInSessions(data.sessions);
      } else {
        setSignInError("No assessments found for this email. Start a new one below.");
      }
    } catch {
      setSignInError("Something went wrong. Please try again.");
    } finally {
      setSignInLoading(false);
    }
  };

  const handleResumeSession = (session: SessionLookup) => {
    if (session.status === "analyzed" || session.status === "completed") {
      navigate(`/analysis/${session.id}`);
    } else if (session.status === "in_progress") {
      navigate(`/interview/${session.id}`);
    } else {
      navigate(`/research/${session.id}`);
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const showCatalog = assessments.length > 1;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-white/5 px-4 sm:px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/hmn_logo.png" alt="HMN" className="h-8 w-auto" />
            <span className="font-semibold text-white/90">Cascade</span>
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            {!showSignIn && !showForm && (
              <button onClick={() => setShowSignIn(true)} className="text-white/40 hover:text-white/70 text-sm transition-colors flex items-center gap-1.5">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:hidden" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3.586L7.707 9.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 10.586V7z" clipRule="evenodd" /></svg>
                <span className="hidden sm:inline">Continue Assessment</span>
                <span className="sm:hidden">Continue</span>
              </button>
            )}
            <a href="/admin" className="text-white/20 hover:text-white/40 text-xs transition-colors">Admin</a>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 sm:px-6 py-12 sm:py-20">
        {inviteLoading ? (
          /* Invite loading state */
          <div className="w-full max-w-md text-center space-y-4">
            <div className="animate-spin w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full mx-auto" />
            <p className="text-white/40 text-sm">Loading your invitation...</p>
          </div>
        ) : inviteError && inviteError !== "already_used" ? (
          /* Invite error state (invalid/expired) */
          <div className="w-full max-w-md text-center space-y-6">
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold text-white">Invitation Not Found</h2>
              <p className="text-white/40 text-sm">{inviteError}</p>
            </div>
            <Button onClick={() => { setInviteError(""); setInviteToken(null); }}>Browse Assessments</Button>
          </div>
        ) : inviteError === "already_used" ? (
          /* Invite already used state */
          <div className="w-full max-w-md text-center space-y-6">
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold text-white">Invitation Already Used</h2>
              <p className="text-white/40 text-sm">This invitation has already been used to start an assessment.</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 justify-center">
              <Button variant="ghost" onClick={() => { setInviteError(""); setInviteToken(null); }}>Start Fresh</Button>
              <Button onClick={() => setShowSignIn(true)}>Find My Assessment</Button>
            </div>
          </div>
        ) : showSignIn ? (
          /* Sign-in flow */
          <div className="w-full max-w-md space-y-8">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-semibold text-white">Welcome back</h2>
              <p className="text-white/30 text-sm">Enter your email to find your assessment.</p>
            </div>

            {!signInSessions ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-white/50 mb-1.5">Business Email</label>
                  <input
                    type="email"
                    value={signInEmail}
                    onChange={(e) => setSignInEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSignIn()}
                    placeholder="you@company.com"
                    autoFocus
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-white/30 transition-colors"
                  />
                </div>
                {signInError && <p className="text-yellow-400/80 text-sm text-center">{signInError}</p>}
                <div className="flex gap-2 sm:gap-3">
                  <Button variant="ghost" onClick={() => { setShowSignIn(false); setSignInError(""); setSignInEmail(""); }} className="flex-1 min-w-0">Back</Button>
                  <Button onClick={handleSignIn} disabled={!signInEmail} loading={signInLoading} className="flex-1 min-w-0">Find My Assessment</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-white/40 text-sm text-center">
                  Found {signInSessions.length} assessment{signInSessions.length !== 1 ? "s" : ""} for <span className="text-white/70">{signInEmail}</span>
                </p>
                <div className="space-y-2">
                  {signInSessions.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => handleResumeSession(s)}
                      className="w-full text-left bg-white/[0.03] border border-white/10 rounded-xl p-4 hover:bg-white/[0.06] hover:border-white/20 transition-all"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-white font-medium">{s.participantName}</span>
                        <span className={`text-xs font-medium ${STATUS_COLORS[s.status] || "text-white/40"}`}>
                          {STATUS_LABELS[s.status] || s.status}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-white/30">{s.participantCompany} — {formatDate(s.createdAt)}</span>
                        {s.score != null && (
                          <span className={`text-xs font-semibold ${s.score >= 70 ? "text-green-400" : s.score >= 45 ? "text-yellow-400" : "text-red-400"}`}>
                            {s.score}/100
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-white/20 mt-1">
                        {s.status === "analyzed" ? "View your results →" : s.status === "completed" ? "View analysis →" : "Continue where you left off →"}
                      </div>
                    </button>
                  ))}
                </div>
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                  <Button variant="ghost" onClick={() => { setSignInSessions(null); setSignInEmail(""); }} className="flex-1 min-w-0">Try Another Email</Button>
                  <Button variant="secondary" onClick={() => { setShowSignIn(false); setSignInSessions(null); setSignInEmail(""); }} className="flex-1 min-w-0">Start New Assessment</Button>
                </div>
              </div>
            )}
          </div>
        ) : !showForm ? (
          showCatalog ? (
            /* Multi-assessment catalog */
            <div className="max-w-3xl w-full space-y-10">
              <div className="text-center space-y-3">
                <h1 className="text-2xl sm:text-4xl font-bold tracking-tight">
                  <span className="bg-gradient-to-r from-white via-white to-white/60 bg-clip-text text-transparent">HMN Cascade</span>{" "}
                  <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">Assessments</span>
                </h1>
                <p className="text-white/40 max-w-md mx-auto">Choose the right diagnostic for your needs.</p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {assessments.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => handleSelectAssessment(a)}
                    className="text-left bg-white/[0.03] border border-white/10 rounded-2xl p-4 sm:p-6 hover:bg-white/[0.06] hover:border-white/20 transition-all group"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <span className="text-2xl">{a.icon || "📋"}</span>
                      <span className="text-xs text-white/30 bg-white/5 px-2 py-0.5 rounded-full">{a.estimatedMinutes} min</span>
                    </div>
                    <h3 className="text-lg font-semibold text-white mb-1 group-hover:text-white/90">{a.name}</h3>
                    <p className="text-sm text-white/40 mb-3 line-clamp-2">{a.description}</p>
                    <div className="text-xs text-white/30">{a.questionCount} questions</div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Single assessment hero */
            <div className="max-w-2xl text-center space-y-8">
              <div className="space-y-4">
                <h1 className="text-3xl sm:text-5xl font-bold tracking-tight">
                  <span className="bg-gradient-to-r from-white via-white to-white/60 bg-clip-text text-transparent">AI Readiness</span><br />
                  <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">Assessment</span>
                </h1>
                <p className="text-base sm:text-lg text-white/50 max-w-md mx-auto">A diagnostic conversation that uncovers where you are with AI, where the gaps are, and exactly what to do next.</p>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:gap-4 max-w-lg mx-auto">
                {[{ label: "25 min", sub: "conversation" }, { label: "8", sub: "dimensions scored" }, { label: "Custom", sub: "action plan" }].map((s, i) => (
                  <div key={i} className="bg-white/5 rounded-xl p-2.5 sm:p-4 border border-white/5">
                    <div className="text-base sm:text-xl font-semibold text-white">{s.label}</div>
                    <div className="text-[10px] sm:text-xs text-white/40">{s.sub}</div>
                  </div>
                ))}
              </div>
              <Button onClick={() => { setSelectedAssessment(assessments[0] || null); setShowForm(true); }} size="lg">Begin Assessment</Button>
            </div>
          )
        ) : (
          /* Intake form */
          <div className="w-full max-w-md space-y-6 sm:space-y-8">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-semibold text-white">{inviteToken ? "You've been invited" : "Let's get started"}</h2>
              {selectedAssessment && (
                <p className="text-white/40 text-sm">{selectedAssessment.icon} {selectedAssessment.name}</p>
              )}
              <p className="text-white/30 text-xs">{inviteToken ? "Please confirm your details and begin." : "Tell us a bit about yourself first."}</p>
            </div>
            <div className="space-y-4">
              {([
                { label: "Your Name", value: name, set: setName, ph: "e.g. Frankie Grundler", req: true },
                { label: "Your Role", value: role, set: setRole, ph: "e.g. CEO & Founder" },
                { label: "Company", value: company, set: setCompany, ph: "e.g. Quick Organics", req: true },
                { label: "Industry", value: industry, set: setIndustry, ph: "e.g. AgTech / SaaS" },
                { label: "Team Size", value: teamSize, set: setTeamSize, ph: "e.g. 11-50" },
                { label: "Business Email", value: email, set: setEmail, ph: "you@company.com", req: true },
              ] as const).map((f) => (
                <div key={f.label}>
                  <label className="block text-sm text-white/50 mb-1.5">{f.label} {"req" in f && f.req && <span className="text-red-400">*</span>}</label>
                  <input type={f.label.includes("Email") ? "email" : "text"} value={f.value} onChange={(e) => f.set(e.target.value)} placeholder={f.ph}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-white/30 transition-colors" />
                </div>
              ))}
            </div>
            <div className="flex gap-2 sm:gap-3">
              <Button variant="ghost" onClick={() => setShowForm(false)} className="flex-1 min-w-0">Back</Button>
              <Button onClick={handleStart} disabled={!name || !company || !email} loading={isCreating} className="flex-1 min-w-0">{inviteToken ? "Confirm & Start" : "Start Interview"}</Button>
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-white/5 px-4 sm:px-6 py-4">
        <div className="max-w-5xl mx-auto text-center text-xs text-white/20">HMN Cascade Assessment System</div>
      </footer>
    </div>
  );
}
