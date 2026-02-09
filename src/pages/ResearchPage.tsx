import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { API_BASE } from "../lib/api";
import Button from "../components/ui/Button";

interface PersonProfile {
  bio?: string;
  knownRoles?: string[];
  linkedinSummary?: string;
  notableAchievements?: string[];
  publicPresence?: string;
}

interface CompanyProfile {
  description?: string;
  founded?: string;
  size?: string;
  funding?: string;
  products?: string[];
  recentNews?: string[];
}

interface Research {
  status: string;
  personProfile?: PersonProfile;
  companyProfile?: CompanyProfile;
  keyInsights?: string[];
  interviewAngles?: string[];
  confidenceLevel?: string;
  sources?: Array<{ url: string; title: string }>;
  summary?: string;
}

export default function ResearchPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [research, setResearch] = useState<Research | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"searching" | "analyzing" | "done">("searching");

  // Editable research fields
  const [editedBio, setEditedBio] = useState("");
  const [editedCompanyDesc, setEditedCompanyDesc] = useState("");
  const [editedInsights, setEditedInsights] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      try {
        setPhase("searching");
        const timer = setTimeout(() => setPhase("analyzing"), 3000);

        const res = await fetch(`${API_BASE}/api/research/${sessionId}`, { method: "POST" });
        clearTimeout(timer);

        if (!res.ok) throw new Error("Research failed");
        const data = await res.json();
        setResearch(data.research);
        // Initialize editable fields from research
        if (data.research?.personProfile?.bio) setEditedBio(data.research.personProfile.bio);
        if (data.research?.companyProfile?.description) setEditedCompanyDesc(data.research.companyProfile.description);
        if (data.research?.keyInsights) setEditedInsights([...data.research.keyInsights]);
        setPhase("done");
      } catch {
        setError("Research service unavailable. You can skip and proceed directly.");
        setPhase("done");
      } finally {
        setIsLoading(false);
      }
    })();
  }, [sessionId]);

  const handleConfirm = async (confirmed: boolean) => {
    setIsConfirming(true);
    try {
      // Send any edits as corrections
      const corrections: Record<string, unknown> = {};
      if (editedBio !== research?.personProfile?.bio) corrections.bio = editedBio;
      if (editedCompanyDesc !== research?.companyProfile?.description) corrections.companyDescription = editedCompanyDesc;
      if (JSON.stringify(editedInsights) !== JSON.stringify(research?.keyInsights)) corrections.keyInsights = editedInsights;

      await fetch(`${API_BASE}/api/research/${sessionId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed, corrections: Object.keys(corrections).length > 0 ? corrections : undefined }),
      });
      navigate(`/interview/${sessionId}`);
    } catch {
      navigate(`/interview/${sessionId}`);
    }
  };

  const handleSkip = () => navigate(`/interview/${sessionId}`);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="text-center space-y-8 max-w-lg">
          <div className="relative w-24 h-24 mx-auto">
            <div className="absolute inset-0 rounded-full border-2 border-indigo-500/20 animate-ping" />
            <div className="absolute inset-2 rounded-full border-2 border-indigo-500/40 animate-ping" style={{ animationDelay: "300ms" }} />
            <div className="absolute inset-4 rounded-full border-2 border-indigo-500/60 animate-pulse" />
            <div className="absolute inset-0 flex items-center justify-center">
              <svg className="w-8 h-8 text-indigo-400 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          </div>
          <div className="space-y-3">
            <h2 className="text-xl font-semibold text-white">
              {phase === "searching" ? "Searching the web..." : "Analyzing findings..."}
            </h2>
            <p className="text-white/40 text-sm">
              {phase === "searching"
                ? "Looking up public information about you and your company"
                : "Synthesizing research to personalize your interview"}
            </p>
          </div>
          <div className="flex justify-center gap-1.5">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="w-2 h-2 rounded-full bg-indigo-500/60 animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error && !research) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="text-center space-y-6 max-w-md">
          <div className="w-16 h-16 rounded-full bg-yellow-500/20 border border-yellow-500/30 flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <p className="text-white/60">{error}</p>
          <Button onClick={handleSkip} size="lg">Skip to Interview</Button>
        </div>
      </div>
    );
  }

  const hasFindings = research?.status === "found";

  return (
    <div className="min-h-screen px-6 py-12">
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-semibold text-white">Before we begin</h2>
          <p className="text-white/50">We did some research to personalize your interview. You can edit any details below before confirming.</p>
        </div>

        {hasFindings ? (
          <>
            {/* Person Profile */}
            {research?.personProfile && (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
                    <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-white">About You</h3>
                </div>
                {editedBio !== undefined && (
                  <textarea
                    value={editedBio}
                    onChange={(e) => setEditedBio(e.target.value)}
                    rows={3}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/70 leading-relaxed focus:outline-none focus:border-indigo-500/40 focus:bg-white/10 transition-all resize-none text-sm"
                  />
                )}
                {research.personProfile.knownRoles && research.personProfile.knownRoles.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {research.personProfile.knownRoles.map((role, i) => (
                      <span key={i} className="px-3 py-1 rounded-full text-xs bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">{role}</span>
                    ))}
                  </div>
                )}
                {research.personProfile.notableAchievements && research.personProfile.notableAchievements.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-white/40 text-xs uppercase tracking-wider">Notable</p>
                    <ul className="space-y-1">
                      {research.personProfile.notableAchievements.map((a, i) => (
                        <li key={i} className="text-white/60 text-sm flex items-start gap-2">
                          <span className="text-green-400 mt-0.5">+</span> {a}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Company Profile */}
            {research?.companyProfile && (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                    <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-white">Your Company</h3>
                </div>
                {editedCompanyDesc !== undefined && (
                  <textarea
                    value={editedCompanyDesc}
                    onChange={(e) => setEditedCompanyDesc(e.target.value)}
                    rows={3}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/70 leading-relaxed focus:outline-none focus:border-emerald-500/40 focus:bg-white/10 transition-all resize-none text-sm"
                  />
                )}
                <div className="grid grid-cols-2 gap-4">
                  {research.companyProfile.founded && (
                    <div><p className="text-white/40 text-xs">Founded</p><p className="text-white/80 text-sm">{research.companyProfile.founded}</p></div>
                  )}
                  {research.companyProfile.funding && (
                    <div><p className="text-white/40 text-xs">Funding</p><p className="text-white/80 text-sm">{research.companyProfile.funding}</p></div>
                  )}
                </div>
                {research.companyProfile.products && research.companyProfile.products.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {research.companyProfile.products.map((p, i) => (
                      <span key={i} className="px-3 py-1 rounded-full text-xs bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">{p}</span>
                    ))}
                  </div>
                )}
                {research.companyProfile.recentNews && research.companyProfile.recentNews.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-white/40 text-xs uppercase tracking-wider">Recent News</p>
                    <ul className="space-y-1">
                      {research.companyProfile.recentNews.map((n, i) => (
                        <li key={i} className="text-white/60 text-sm">{n}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Key Insights */}
            {editedInsights.length > 0 && (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-3">
                <h3 className="text-lg font-medium text-white">Key Insights</h3>
                <ul className="space-y-2">
                  {editedInsights.map((insight, i) => (
                    <li key={i} className="text-white/60 text-sm flex items-start gap-2">
                      <span className="text-indigo-400 mt-1.5 flex-shrink-0">*</span>
                      <input
                        value={insight}
                        onChange={(e) => {
                          const updated = [...editedInsights];
                          updated[i] = e.target.value;
                          setEditedInsights(updated);
                        }}
                        className="flex-1 bg-transparent border-b border-transparent hover:border-white/10 focus:border-indigo-500/40 focus:outline-none text-white/60 text-sm py-0.5 transition-colors"
                      />
                      <button
                        onClick={() => setEditedInsights(editedInsights.filter((_, j) => j !== i))}
                        className="text-white/20 hover:text-red-400/60 transition-colors flex-shrink-0"
                        title="Remove insight"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Sources */}
            {research?.sources && research.sources.length > 0 && (
              <div className="text-center">
                <p className="text-white/30 text-xs">
                  Based on {research.sources.length} sources
                  {research.confidenceLevel && ` | Confidence: ${research.confidenceLevel}`}
                </p>
              </div>
            )}

            {/* Confirmation */}
            <div className="bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 rounded-2xl p-6 text-center space-y-4">
              <h3 className="text-lg font-medium text-white">Is this information about you?</h3>
              <p className="text-white/50 text-sm">Edit anything above that's inaccurate. Confirming helps us skip redundant questions and ask smarter ones.</p>
              <div className="flex gap-4 justify-center">
                <Button onClick={() => handleConfirm(true)} loading={isConfirming} size="lg">
                  Yes, that's me
                </Button>
                <Button onClick={() => handleConfirm(false)} variant="secondary" disabled={isConfirming}>
                  Not me / Not accurate
                </Button>
              </div>
              <button onClick={handleSkip} className="text-white/30 text-xs hover:text-white/50 transition-colors">
                Skip research and start interview
              </button>
            </div>
          </>
        ) : (
          <div className="text-center space-y-6">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-8">
              <p className="text-white/60">
                {research?.summary || "We couldn't find public information about you. That's totally fine — we'll learn everything through our conversation."}
              </p>
            </div>
            <Button onClick={handleSkip} size="lg">Start Interview</Button>
          </div>
        )}
      </div>
    </div>
  );
}
