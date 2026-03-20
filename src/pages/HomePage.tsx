import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { lookupInvitation, fetchSessionPublic, createSession, lookupSessionsByEmail } from "../lib/api";
import Button from "../components/ui/Button";
import { ThemeToggle } from "../components/ui/ThemeToggle";

export default function HomePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Invite flow state
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState("");

  // Intake form state (only shown when invite token is valid)
  const [showForm, setShowForm] = useState(false);
  const [assessmentName, setAssessmentName] = useState("");
  const [assessmentId, setAssessmentId] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [company, setCompany] = useState("");
  const [industry, setIndustry] = useState("");
  const [teamSize, setTeamSize] = useState("");
  const [email, setEmail] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Sign-in state (resume existing assessment)
  const [showSignIn, setShowSignIn] = useState(false);
  const [signInEmail, setSignInEmail] = useState("");
  const [signInLoading, setSignInLoading] = useState(false);
  const [signInSessions, setSignInSessions] = useState<Array<{
    id: string; status: string; createdAt: string;
    participantName?: string; participantCompany?: string; score?: number;
  }> | null>(null);
  const [signInError, setSignInError] = useState("");

  // Detect invite token in URL
  useEffect(() => {
    const token = searchParams.get("invite");
    if (!token) return;

    setInviteToken(token);
    setInviteLoading(true);

    lookupInvitation(token)
      .then(async (data) => {
        const p = data.invitation.participant;
        setName(p.name || "");
        setEmail(p.email || "");
        if (p.company) setCompany(p.company);
        if (p.role) setRole(p.role);
        if (p.industry) setIndustry(p.industry);
        if (p.teamSize) setTeamSize(p.teamSize);
        if (data.assessment) {
          setAssessmentName(data.assessment.name || "");
          setAssessmentId(data.assessment.id || "");
        }
        setShowForm(true);

        if (data.invitation.sessionId) {
          // Auto-resume: redirect to the existing session instead of blocking
          try {
            const sessionData = await fetchSessionPublic(data.invitation.sessionId);
            {
              const s = sessionData.session;
              if (s) {
                if (s.status === "analyzed" || s.status === "completed") {
                  navigate(`/analysis/${s.id}`, { replace: true });
                } else if (s.status === "in_progress") {
                  navigate(`/interview/${s.id}`, { replace: true });
                } else {
                  navigate(`/research/${s.id}`, { replace: true });
                }
                return;
              }
            }
          } catch {
            // fallback to already_used screen
          }
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

  const handleStart = async () => {
    if (!name || !company || !email || !inviteToken) return;
    setIsCreating(true);
    try {
      const data = await createSession(
        { name, role, company, industry, teamSize, email },
        assessmentId || "ai-readiness",
        inviteToken,
      );
      if (data.session?.id) navigate(`/research/${data.session.id}`);
    } catch (err) {
      console.error(err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleSignIn = async () => {
    if (!signInEmail) return;
    setSignInLoading(true);
    setSignInError("");
    setSignInSessions(null);
    try {
      const data = await lookupSessionsByEmail(signInEmail);
      if (data.sessions?.length > 0) {
        setSignInSessions(data.sessions);
      } else {
        setSignInError("No assessments found for this email.");
      }
    } catch {
      setSignInError("Something went wrong. Please try again.");
    } finally {
      setSignInLoading(false);
    }
  };

  const handleResumeSession = (session: { id: string; status: string }) => {
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

  const STATUS_LABELS: Record<string, string> = {
    intake: "Not started",
    in_progress: "In progress",
    completed: "Completed",
    analyzed: "Results ready",
  };

  const STATUS_COLORS: Record<string, string> = {
    intake: "text-muted-foreground",
    in_progress: "text-blue-400",
    completed: "text-green-400",
    analyzed: "text-purple-400",
  };

  // ─── Render ────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b border-border/50 px-4 sm:px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/hmn_logo.png" alt="HMN" className="hidden dark:block h-8 w-auto" />
            <img src="/hmn_logo_grey.png" alt="HMN" className="block dark:hidden h-8 w-auto" />
            <span className="font-semibold text-foreground/90">Cascade</span>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            {!inviteToken && !showSignIn && (
              <button
                onClick={() => setShowSignIn(true)}
                className="text-muted-foreground/70 hover:text-muted-foreground text-sm transition-colors"
              >
                Continue Assessment
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 sm:px-6 py-12 sm:py-20">
        {/* ── Loading invite ── */}
        {inviteLoading ? (
          <div className="w-full max-w-md text-center space-y-4">
            <div className="animate-spin w-8 h-8 border-2 border-border border-t-white/60 rounded-full mx-auto" />
            <p className="text-muted-foreground text-sm">Loading your invitation...</p>
          </div>

        /* ── Invalid invite ── */
        ) : inviteError && inviteError !== "already_used" ? (
          <div className="w-full max-w-md text-center space-y-6">
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold text-foreground">Invitation Not Found</h2>
              <p className="text-muted-foreground text-sm">{inviteError}</p>
            </div>
            <Button variant="ghost" onClick={() => { setInviteError(""); setInviteToken(null); }}>
              Return Home
            </Button>
          </div>

        /* ── Already-used invite ── */
        ) : inviteError === "already_used" ? (
          <div className="w-full max-w-md text-center space-y-6">
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold text-foreground">Invitation Already Used</h2>
              <p className="text-muted-foreground text-sm">This invitation has already been used to start an assessment.</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 justify-center">
              <Button variant="ghost" onClick={() => { setInviteError(""); setInviteToken(null); }}>
                Return Home
              </Button>
              <Button onClick={() => { setInviteError(""); setShowSignIn(true); }}>
                Find My Assessment
              </Button>
            </div>
          </div>

        /* ── Sign-in / resume flow ── */
        ) : showSignIn ? (
          <div className="w-full max-w-md space-y-8">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-semibold text-foreground">Welcome back</h2>
              <p className="text-muted-foreground/70 text-sm">Enter your email to find your assessment.</p>
            </div>
            {!signInSessions ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-muted-foreground mb-1.5">Business Email</label>
                  <input
                    type="email"
                    value={signInEmail}
                    onChange={(e) => setSignInEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSignIn()}
                    placeholder="you@company.com"
                    autoFocus
                    className="w-full bg-background/50 backdrop-blur-md border border-border/50 rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all shadow-sm"
                  />
                </div>
                {signInError && <p className="text-yellow-400/80 text-sm text-center">{signInError}</p>}
                <div className="flex gap-3">
                  <Button variant="ghost" onClick={() => { setShowSignIn(false); setSignInError(""); setSignInEmail(""); }} className="flex-1">Back</Button>
                  <Button onClick={handleSignIn} disabled={!signInEmail} loading={signInLoading} className="flex-1">Find My Assessment</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-muted-foreground text-sm text-center">
                  Found {signInSessions.length} assessment{signInSessions.length !== 1 ? "s" : ""} for <span className="text-foreground/80">{signInEmail}</span>
                </p>
                <div className="space-y-2">
                  {signInSessions.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => handleResumeSession(s)}
                      className="w-full text-left bg-muted/50 border border-border rounded-xl p-4 hover:bg-muted/70 hover:border-border transition-all"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-foreground font-medium">{s.participantName}</span>
                        <span className={`text-xs font-medium ${STATUS_COLORS[s.status] || "text-muted-foreground"}`}>
                          {STATUS_LABELS[s.status] || s.status}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground/70">{s.participantCompany} — {formatDate(s.createdAt)}</span>
                        {s.score != null && (
                          <span className={`text-xs font-semibold ${s.score >= 70 ? "text-green-400" : s.score >= 45 ? "text-yellow-400" : "text-red-400"}`}>
                            {s.score}/100
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground/50 mt-1">
                        {s.status === "analyzed" ? "View your results" : s.status === "completed" ? "View analysis" : "Continue where you left off"}
                      </div>
                    </button>
                  ))}
                </div>
                <Button variant="ghost" onClick={() => { setSignInSessions(null); setSignInEmail(""); }} className="w-full">
                  Try Another Email
                </Button>
              </div>
            )}
          </div>

        /* ── Intake form (invite accepted) ── */
        ) : showForm && inviteToken ? (
          <div className="w-full max-w-md space-y-6 sm:space-y-8">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-semibold text-foreground">You've been invited</h2>
              {assessmentName && (
                <p className="text-muted-foreground text-sm">{assessmentName}</p>
              )}
              <p className="text-muted-foreground/70 text-xs">Please confirm your details and begin.</p>
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
                  <label className="block text-sm text-muted-foreground mb-1.5">
                    {f.label} {"req" in f && f.req && <span className="text-red-400">*</span>}
                  </label>
                  <input
                    type={f.label.includes("Email") ? "email" : "text"}
                    value={f.value}
                    onChange={(e) => f.set(e.target.value)}
                    placeholder={f.ph}
                    className="w-full bg-background/50 backdrop-blur-md border border-border/50 rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all shadow-sm"
                  />
                </div>
              ))}
            </div>
            <Button
              onClick={handleStart}
              disabled={!name || !company || !email}
              loading={isCreating}
              className="w-full"
              size="lg"
            >
              Confirm & Start Assessment
            </Button>
          </div>

        /* ── Default landing page (no invite) ── */
        ) : (
          <div className="max-w-2xl text-center space-y-10">
            <div className="space-y-6">
              <div className="flex justify-center">
                <img src="/hmn_logo.png" alt="HMN" className="hidden dark:block h-16 w-auto opacity-80" />
                <img src="/hmn_logo_grey.png" alt="HMN" className="block dark:hidden h-16 w-auto opacity-80" />
              </div>
              <div className="space-y-3">
                <h1 className="text-3xl sm:text-5xl font-bold tracking-tight">
                  <span className="bg-gradient-to-r from-foreground via-foreground/90 to-foreground/60 bg-clip-text text-transparent">
                    Cascade Assessments
                  </span>
                </h1>
                <p className="text-base sm:text-lg text-muted-foreground max-w-md mx-auto leading-relaxed">
                  AI-powered diagnostic assessments for organizations navigating the future of work.
                </p>
              </div>
            </div>

            <div className="bg-card/60 backdrop-blur-2xl border border-border/50 shadow-2xl rounded-3xl p-6 sm:p-8 max-w-sm mx-auto ring-1 ring-border/30">
              <div className="space-y-3">
                <div className="w-10 h-10 rounded-xl bg-muted border border-border flex items-center justify-center mx-auto">
                  <svg className="w-5 h-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                  </svg>
                </div>
                <h3 className="text-sm font-medium text-foreground/80">Invitation Required</h3>
                <p className="text-xs text-muted-foreground/70 leading-relaxed">
                  Assessments are available by invitation only. Check your email for an invitation link from your organization.
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowSignIn(true)}
              className="text-muted-foreground/70 hover:text-muted-foreground text-sm transition-colors"
            >
              Already started? Continue your assessment
            </button>
          </div>
        )}
      </main>

      <footer className="border-t border-border/50 px-4 sm:px-6 py-4">
        <div className="max-w-5xl mx-auto text-center text-xs text-muted-foreground/50">
          beHMN Assessment Platform
        </div>
      </footer>
    </div>
  );
}
