import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { validateResumeToken } from "../lib/api";

interface ResumeSessionData {
  id: string;
  status: string;
  participant: {
    name: string;
    role: string;
    company: string;
    industry: string;
  };
  currentPhase: string;
  currentSection: string;
  currentQuestionIndex: number;
  answeredQuestions: number;
  totalQuestions: number;
  progressPercent: number;
  createdAt: string;
  updatedAt: string;
}

const PHASE_LABELS: Record<string, string> = {
  profile_baseline: "Profile & Baseline",
  org_reality: "Organizational Reality",
  domain_deep_dive: "Domain Deep Dive",
  strategic_alignment: "Strategic Alignment",
};

const SECTION_LABELS: Record<string, string> = {
  demographics: "Demographics",
  context_setting: "Context Setting",
  change_capacity: "Change Capacity",
  personal_ai_reality: "Personal AI Reality",
  vulnerability: "Vulnerability",
  team_org_reality: "Team & Org Reality",
  business_process: "Business Process",
  domain_specific: "Domain Specific",
  customer_support: "Customer Support",
  strategic_stakes: "Strategic Stakes",
  hmn_anchor: "HMN Anchor",
  closing: "Closing",
};

export default function ResumePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [session, setSession] = useState<ResumeSessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resuming, setResuming] = useState(false);

  useEffect(() => {
    if (!token) return;
    const validate = async () => {
      try {
        const data = await validateResumeToken(token!);
        setSession(data.session);
      } catch {
        setError("Failed to validate resume link. Please check your connection and try again.");
      } finally {
        setLoading(false);
      }
    };
    validate();
  }, [token]);

  const handleContinue = () => {
    if (!session) return;
    setResuming(true);
    navigate(`/interview/${session.id}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-2 border-border border-t-white rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground">Validating your resume link...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <header className="border-b border-border/50 px-6 py-4">
          <div className="max-w-5xl mx-auto flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-sm font-bold text-foreground">H</div>
            <span className="font-semibold text-foreground/90">HMN Cascade</span>
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center px-6">
          <div className="text-center space-y-6 max-w-md">
            <div className="w-16 h-16 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center mx-auto">
              <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold text-foreground">Link Unavailable</h2>
              <p className="text-muted-foreground">{error}</p>
            </div>
            <button onClick={() => navigate("/")} className="px-6 py-2.5 text-sm font-medium rounded-lg bg-muted text-foreground hover:bg-muted/200 border border-border transition-colors">Start New Assessment</button>
          </div>
        </main>
      </div>
    );
  }

  if (!session) return null;

  const phaseLabel = PHASE_LABELS[session.currentPhase] || session.currentPhase;
  const sectionLabel = SECTION_LABELS[session.currentSection] || session.currentSection;
  const lastActive = new Date(session.updatedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  const isAlreadyComplete = session.status === "completed" || session.status === "analyzed";

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border/50 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-sm font-bold text-foreground">H</div>
          <span className="font-semibold text-foreground/90">HMN Cascade</span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-20">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold text-foreground">Welcome back, {session.participant.name}</h1>
            <p className="text-muted-foreground text-sm">Pick up right where you left off.</p>
          </div>

          <div className="bg-muted border border-border rounded-2xl overflow-hidden">
            <div className="px-6 pt-6 pb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Progress</span>
                <span className="text-sm font-medium text-foreground">{session.progressPercent}%</span>
              </div>
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all" style={{ width: `${session.progressPercent}%` }} />
              </div>
              <p className="text-xs text-muted-foreground/70 mt-2">{session.answeredQuestions} of {session.totalQuestions} questions answered</p>
            </div>

            <div className="border-t border-border/50 divide-y divide-white/5">
              {[
                { label: "Company", value: session.participant.company },
                { label: "Role", value: session.participant.role },
                { label: "Current Phase", value: phaseLabel },
                { label: "Current Section", value: sectionLabel },
                { label: "Last Active", value: lastActive },
              ].map((item) => (
                <div key={item.label} className="flex justify-between px-6 py-3">
                  <span className="text-sm text-muted-foreground">{item.label}</span>
                  <span className="text-sm text-foreground/90 font-medium">{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {isAlreadyComplete ? (
              <>
                <button onClick={() => navigate(`/analysis/${session.id}`)} className="w-full px-6 py-3 text-sm font-medium rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 text-foreground transition-all">View Your Results</button>
                <p className="text-center text-xs text-muted-foreground/70">This assessment is already complete.</p>
              </>
            ) : (
              <>
                <button onClick={handleContinue} disabled={resuming} className="w-full px-6 py-3 text-sm font-medium rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 text-foreground disabled:opacity-50 transition-all">{resuming ? "Resuming..." : "Continue Assessment"}</button>
                <button onClick={() => navigate("/")} className="w-full px-6 py-3 text-sm font-medium rounded-xl bg-muted text-muted-foreground hover:text-foreground/90 hover:bg-muted transition-all">Start Fresh Instead</button>
              </>
            )}
          </div>
        </div>
      </main>

      <footer className="border-t border-border/50 px-6 py-4">
        <div className="max-w-5xl mx-auto text-center text-xs text-muted-foreground/50">HMN Cascade Assessment System</div>
      </footer>
    </div>
  );
}
