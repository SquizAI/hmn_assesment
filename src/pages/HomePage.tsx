import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../lib/api";
import Button from "../components/ui/Button";
import type { AssessmentSummary } from "../lib/types";

export default function HomePage() {
  const navigate = useNavigate();
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

  useEffect(() => {
    fetch(`${API_BASE}/api/assessments`)
      .then((r) => r.json())
      .then((data) => {
        if (data.assessments?.length > 0) {
          setAssessments(data.assessments);
        }
      })
      .catch(() => {});
  }, []);

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
        }),
      });
      const data = await res.json();
      if (data.session?.id) navigate(`/research/${data.session.id}`);
    } catch (err) { console.error(err); }
    finally { setIsCreating(false); }
  };

  // If only one assessment or none loaded yet, show single-assessment hero
  const showCatalog = assessments.length > 1;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-white/5 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/hmn_logo.png" alt="HMN" className="h-8 w-auto" />
            <span className="font-semibold text-white/90">Cascade</span>
          </div>
          <a href="/admin" className="text-white/20 hover:text-white/40 text-xs transition-colors">Admin</a>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-20">
        {!showForm ? (
          showCatalog ? (
            /* Multi-assessment catalog */
            <div className="max-w-3xl w-full space-y-10">
              <div className="text-center space-y-3">
                <h1 className="text-4xl font-bold tracking-tight">
                  <span className="bg-gradient-to-r from-white via-white to-white/60 bg-clip-text text-transparent">HMN Cascade</span>{" "}
                  <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">Assessments</span>
                </h1>
                <p className="text-white/40 max-w-md mx-auto">Choose the right diagnostic for your needs.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {assessments.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => handleSelectAssessment(a)}
                    className="text-left bg-white/[0.03] border border-white/10 rounded-2xl p-6 hover:bg-white/[0.06] hover:border-white/20 transition-all group"
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
            /* Single assessment hero (original design) */
            <div className="max-w-2xl text-center space-y-8">
              <div className="space-y-4">
                <h1 className="text-5xl font-bold tracking-tight">
                  <span className="bg-gradient-to-r from-white via-white to-white/60 bg-clip-text text-transparent">AI Readiness</span><br />
                  <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">Assessment</span>
                </h1>
                <p className="text-lg text-white/50 max-w-md mx-auto">A diagnostic conversation that uncovers where you are with AI, where the gaps are, and exactly what to do next.</p>
              </div>
              <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto">
                {[{ label: "25 min", sub: "conversation" }, { label: "8", sub: "dimensions scored" }, { label: "Custom", sub: "action plan" }].map((s, i) => (
                  <div key={i} className="bg-white/5 rounded-xl p-4 border border-white/5">
                    <div className="text-xl font-semibold text-white">{s.label}</div>
                    <div className="text-xs text-white/40">{s.sub}</div>
                  </div>
                ))}
              </div>
              <Button onClick={() => { setSelectedAssessment(assessments[0] || null); setShowForm(true); }} size="lg">Begin Assessment</Button>
            </div>
          )
        ) : (
          /* Intake form */
          <div className="w-full max-w-md space-y-8">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-semibold text-white">Let's get started</h2>
              {selectedAssessment && (
                <p className="text-white/40 text-sm">{selectedAssessment.icon} {selectedAssessment.name}</p>
              )}
              <p className="text-white/30 text-xs">Tell us a bit about yourself first.</p>
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
            <div className="flex gap-3">
              <Button variant="ghost" onClick={() => setShowForm(false)} className="flex-1">Back</Button>
              <Button onClick={handleStart} disabled={!name || !company || !email} loading={isCreating} className="flex-1">Start Interview</Button>
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-white/5 px-6 py-4">
        <div className="max-w-5xl mx-auto text-center text-xs text-white/20">HMN Cascade Assessment System</div>
      </footer>
    </div>
  );
}
