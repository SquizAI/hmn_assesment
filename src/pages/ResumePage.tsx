import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";

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
        const res = await fetch(`/api/sessions/resume/${token}`);
        if (!res.ok) {
          const data = await res.json();
          setError(res.status === 404 ? (data.error || "This resume link is invalid or has expired.") : "Something went wrong. Please try again.");
          return;
        }
        const data = await res.json();
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
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f]">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-2 border-white/20 border-t-white rounded-full animate-spin mx-auto" />
          <p className="text-white/40">Validating your resume link...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col bg-[#0a0a0f]">
        <header className="border-b border-white/5 px-6 py-4">
          <div className="max-w-5xl mx-auto flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-sm font-bold text-white">H</div>
            <span className="font-semibold text-white/90">HMN Cascade</span>
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center px-6">
          <div className="text-center space-y-6 max-w-md">
            <div className="w-16 h-16 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center mx-auto">
              <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold text-white">Link Unavailable</h2>
              <p className="text-white/50">{error}</p>
            </div>
            <button onClick={() => navigate("/")} className="px-6 py-2.5 text-sm font-medium rounded-lg bg-white/10 text-white hover:bg-white/20 border border-white/10 transition-colors">Start New Assessment</button>
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
    <div className="min-h-screen flex flex-col bg-[#0a0a0f]">
      <header className="border-b border-white/5 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-sm font-bold text-white">H</div>
          <span className="font-semibold text-white/90">HMN Cascade</span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-20">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold text-white">Welcome back, {session.participant.name}</h1>
            <p className="text-white/40 text-sm">Pick up right where you left off.</p>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            <div className="px-6 pt-6 pb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-white/50">Progress</span>
                <span className="text-sm font-medium text-white">{session.progressPercent}%</span>
              </div>
              <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all" style={{ width: `${session.progressPercent}%` }} />
              </div>
              <p className="text-xs text-white/30 mt-2">{session.answeredQuestions} of {session.totalQuestions} questions answered</p>
            </div>

            <div className="border-t border-white/5 divide-y divide-white/5">
              {[
                { label: "Company", value: session.participant.company },
                { label: "Role", value: session.participant.role },
                { label: "Current Phase", value: phaseLabel },
                { label: "Current Section", value: sectionLabel },
                { label: "Last Active", value: lastActive },
              ].map((item) => (
                <div key={item.label} className="flex justify-between px-6 py-3">
                  <span className="text-sm text-white/40">{item.label}</span>
                  <span className="text-sm text-white/80 font-medium">{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {isAlreadyComplete ? (
              <>
                <button onClick={() => navigate(`/analysis/${session.id}`)} className="w-full px-6 py-3 text-sm font-medium rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 text-white transition-all">View Your Results</button>
                <p className="text-center text-xs text-white/30">This assessment is already complete.</p>
              </>
            ) : (
              <>
                <button onClick={handleContinue} disabled={resuming} className="w-full px-6 py-3 text-sm font-medium rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 text-white disabled:opacity-50 transition-all">{resuming ? "Resuming..." : "Continue Assessment"}</button>
                <button onClick={() => navigate("/")} className="w-full px-6 py-3 text-sm font-medium rounded-xl bg-white/5 text-white/50 hover:text-white/80 hover:bg-white/10 transition-all">Start Fresh Instead</button>
              </>
            )}
          </div>
        </div>
      </main>

      <footer className="border-t border-white/5 px-6 py-4">
        <div className="max-w-5xl mx-auto text-center text-xs text-white/20">HMN Cascade Assessment System</div>
      </footer>
    </div>
  );
}
