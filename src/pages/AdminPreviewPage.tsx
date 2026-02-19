import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { Question, ConversationMessage } from "../lib/types";
import { API_BASE } from "../lib/api";
import { createPreviewSession, deletePreviewSession } from "../lib/admin-api";
import QuestionCard from "../components/interview/QuestionCard";
import ProgressBar from "../components/interview/ProgressBar";
import SectionStepper, { computeSectionProgress } from "../components/interview/SectionStepper";
import type { ComputeSectionProgressOptions } from "../components/interview/SectionStepper";

interface Progress {
  questionNumber: number;
  totalQuestions: number;
  phase: string;
  section: string;
  completedPercentage: number;
}

interface AssessmentMeta {
  questions: Array<{ id: string; section: string; phase: string; text: string }>;
  sections: Array<{ id: string; label: string; phaseId: string; order: number }> | null;
  phases: Array<{ id: string; label: string; order: number }> | null;
}

interface AnsweredQuestion {
  questionId: string;
  questionText: string;
  answer: unknown;
  inputType: string;
}

type PreviewMode = "manual" | "autopilot";

export default function AdminPreviewPage() {
  const { assessmentId } = useParams<{ assessmentId: string }>();
  const navigate = useNavigate();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isStarting, setIsStarting] = useState(true);
  const [isComplete, setIsComplete] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answeredQuestions, setAnsweredQuestions] = useState<AnsweredQuestion[]>([]);
  const [skippedQuestionIds, setSkippedQuestionIds] = useState<string[]>([]);
  const [mode, setMode] = useState<PreviewMode>("manual");
  const [analysisResult, setAnalysisResult] = useState<Record<string, unknown> | null>(null);

  // Dynamic assessment metadata
  const [assessmentMeta, setAssessmentMeta] = useState<AssessmentMeta | null>(null);

  // Create preview session and start interview
  useEffect(() => {
    if (!assessmentId) return;

    (async () => {
      try {
        // Create preview session
        const { session } = await createPreviewSession(assessmentId);
        setSessionId(session.id);

        // Start interview
        const res = await fetch(`${API_BASE}/api/interview/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: session.id }),
        });
        if (!res.ok) throw new Error("Failed to start preview");
        const data = await res.json();
        setCurrentQuestion(data.currentQuestion);
        setProgress({ ...data.progress, completedPercentage: 0 });

        // Store assessment metadata for dynamic question banks
        if (data.assessmentQuestions) {
          setAssessmentMeta({
            questions: data.assessmentQuestions,
            sections: data.assessmentSections || null,
            phases: data.assessmentPhases || null,
          });
        }

        if (data.skippedQuestionIds) setSkippedQuestionIds(data.skippedQuestionIds);
        if (data.autoPopulatedResponses) {
          setAnsweredQuestions(data.autoPopulatedResponses.map((r: { questionId: string; questionText: string; answer: unknown; inputType: string }) => ({
            questionId: r.questionId, questionText: r.questionText, answer: r.answer, inputType: r.inputType,
          })));
        }
      } catch (err) {
        console.error("Preview start error:", err);
        setError("Failed to start preview session.");
      } finally {
        setIsStarting(false);
      }
    })();
  }, [assessmentId]);

  // Build dynamic section progress options from assessment metadata
  const sectionProgressOptions = useMemo((): ComputeSectionProgressOptions | undefined => {
    if (!assessmentMeta?.sections || !assessmentMeta?.phases) return undefined;
    const sectionOrder = [...assessmentMeta.sections].sort((a: { order: number }, b: { order: number }) => a.order - b.order).map((s: { id: string }) => s.id);
    const sectionLabels: Record<string, string> = {};
    assessmentMeta.sections.forEach((s: { id: string; label: string }) => { sectionLabels[s.id] = s.label; });
    return { questionBank: assessmentMeta.questions, sectionOrder, sectionLabels };
  }, [assessmentMeta]);

  const phaseProps = useMemo(() => {
    if (!assessmentMeta?.phases || !assessmentMeta?.sections) return {};
    const phaseOrder = [...assessmentMeta.phases].sort((a: { order: number }, b: { order: number }) => a.order - b.order).map((p: { id: string }) => p.id);
    const phaseLabels: Record<string, string> = {};
    assessmentMeta.phases.forEach((p: { id: string; label: string }) => { phaseLabels[p.id] = p.label; });
    const sectionLabels: Record<string, string> = {};
    assessmentMeta.sections.forEach((s: { id: string; label: string }) => { sectionLabels[s.id] = s.label; });
    return { phaseOrder, phaseLabels, sectionLabels, questionBank: assessmentMeta.questions };
  }, [assessmentMeta]);

  const sectionProgress = useMemo(() =>
    computeSectionProgress(answeredQuestions, progress?.section || "demographics", skippedQuestionIds, sectionProgressOptions),
    [answeredQuestions, progress?.section, skippedQuestionIds, sectionProgressOptions]
  );

  const visibleAnswered = useMemo(() =>
    answeredQuestions.filter((q) => !skippedQuestionIds.includes(q.questionId)),
    [answeredQuestions, skippedQuestionIds]
  );

  const handleSubmit = async (answer: string | number | string[], conversationHistory?: ConversationMessage[]) => {
    if (!currentQuestion || !sessionId) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/interview/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, questionId: currentQuestion.id, answer, conversationHistory }),
      });
      const data = await res.json();
      if (data.type === "follow_up") return;

      setAnsweredQuestions((prev) => [
        ...prev,
        { questionId: currentQuestion.id, questionText: currentQuestion.text, answer, inputType: currentQuestion.inputType },
      ]);
      if (data.skippedQuestionIds) setSkippedQuestionIds(data.skippedQuestionIds);

      if (data.type === "complete") setIsComplete(true);
      else if (data.type === "next_question") { setCurrentQuestion(data.currentQuestion); setProgress(data.progress); }
    } catch { setError("Something went wrong."); }
    finally { setIsSubmitting(false); }
  };

  // Auto-pilot: submit a generic answer
  const handleAutopilot = () => {
    if (!currentQuestion) return;
    const autoAnswers: Record<string, string | number | string[]> = {
      slider: 7,
      buttons: "moderate",
      multi_select: ["option_1"],
      open_text: "This is an auto-generated test response for preview purposes.",
      voice: "Auto-pilot test response.",
      ai_conversation: "I think our team is making good progress in this area. We have some experience but there is room for improvement.",
    };
    const answer = autoAnswers[currentQuestion.inputType] || "Test response";
    handleSubmit(answer);
  };

  const handleAnalyze = async () => {
    if (!sessionId) return;
    setIsAnalyzing(true);
    try {
      const res = await fetch(`${API_BASE}/api/interview/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      if (!res.ok) throw new Error("Analysis failed");
      // Load the analysis result
      const sessionRes = await fetch(`${API_BASE}/api/sessions/${sessionId}`);
      const session = await sessionRes.json();
      setAnalysisResult(session.analysis || null);
    } catch { setError("Analysis failed. The preview may not have enough responses."); }
    finally { setIsAnalyzing(false); }
  };

  const handleExit = async () => {
    if (sessionId) {
      try { await deletePreviewSession(sessionId); } catch { /* ignore cleanup errors */ }
    }
    navigate("/admin/assessments");
  };

  // --- Preview banner ---
  const PreviewBanner = () => (
    <div className="bg-amber-500/15 border-b border-amber-500/25 px-4 py-2 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-amber-400 text-xs font-bold uppercase tracking-wider">Preview Mode</span>
        <span className="text-amber-300/60 text-xs">Test run — no real data saved</span>
      </div>
      <div className="flex items-center gap-2">
        {!isComplete && !analysisResult && (
          <div className="flex rounded-lg overflow-hidden border border-white/10">
            <button
              onClick={() => setMode("manual")}
              className={`px-3 py-1 text-xs font-medium transition-colors ${mode === "manual" ? "bg-white/10 text-white" : "text-white/40 hover:text-white/60"}`}
            >
              Manual
            </button>
            <button
              onClick={() => setMode("autopilot")}
              className={`px-3 py-1 text-xs font-medium transition-colors ${mode === "autopilot" ? "bg-purple-500/20 text-purple-300" : "text-white/40 hover:text-white/60"}`}
            >
              Auto-pilot
            </button>
          </div>
        )}
        <button
          onClick={handleExit}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 hover:text-white transition-colors"
        >
          Exit Preview
        </button>
      </div>
    </div>
  );

  if (isStarting) return (
    <div className="min-h-screen flex flex-col">
      <PreviewBanner />
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-2 border-amber-500/30 border-t-amber-400 rounded-full animate-spin mx-auto" />
          <p className="text-white/40">Setting up preview...</p>
        </div>
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex flex-col">
      <PreviewBanner />
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-red-400">{error}</p>
          <button onClick={handleExit} className="px-4 py-2 text-sm rounded-xl bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 transition-colors">
            Back to Assessments
          </button>
        </div>
      </div>
    </div>
  );

  // Analysis result view
  if (analysisResult) {
    const analysis = analysisResult as {
      overallReadinessScore?: number;
      archetype?: string;
      archetypeDescription?: string;
      executiveSummary?: string;
      dimensionScores?: { dimension: string; score: number }[];
      serviceRecommendations?: { service: string; description: string; tier: number }[];
    };
    return (
      <div className="min-h-screen flex flex-col">
        <PreviewBanner />
        <div className="flex-1 overflow-y-auto px-6 py-8">
          <div className="max-w-3xl mx-auto space-y-6">
            {/* Score */}
            <div className="text-center space-y-3">
              <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-white/10">
                <span className="text-3xl font-bold text-white">{analysis.overallReadinessScore ?? "—"}</span>
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">
                  {analysis.archetype?.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "Analysis Complete"}
                </h2>
                <p className="text-sm text-white/50 mt-1">{analysis.archetypeDescription || ""}</p>
              </div>
            </div>

            {/* Executive Summary */}
            {analysis.executiveSummary && (
              <div className="bg-white/3 rounded-2xl border border-white/10 p-6">
                <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-3">Executive Summary</h3>
                <p className="text-sm text-white/70 leading-relaxed">{analysis.executiveSummary}</p>
              </div>
            )}

            {/* Dimension Scores */}
            {analysis.dimensionScores && analysis.dimensionScores.length > 0 && (
              <div className="bg-white/3 rounded-2xl border border-white/10 p-6">
                <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-4">Dimension Scores</h3>
                <div className="space-y-3">
                  {analysis.dimensionScores.map((dim) => (
                    <div key={dim.dimension} className="flex items-center gap-3">
                      <span className="w-36 text-sm text-white/50 truncate">
                        {dim.dimension.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                      </span>
                      <span className="text-sm font-medium text-white/70 w-8 text-right">{Math.round(dim.score)}</span>
                      <div className="flex-1 bg-white/5 rounded-lg h-5 overflow-hidden">
                        <div
                          className={`h-full rounded-lg bg-gradient-to-r ${dim.score >= 70 ? "from-green-500 to-green-600" : dim.score >= 45 ? "from-yellow-500 to-yellow-600" : "from-red-500 to-red-600"}`}
                          style={{ width: `${dim.score}%`, minWidth: "2px" }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recommendations */}
            {analysis.serviceRecommendations && analysis.serviceRecommendations.length > 0 && (
              <div className="bg-white/3 rounded-2xl border border-white/10 p-6">
                <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-4">Recommendations</h3>
                <div className="space-y-3">
                  {analysis.serviceRecommendations.map((rec, i) => (
                    <div key={i} className="flex items-start gap-3 bg-white/3 rounded-xl p-3 border border-white/5">
                      <span className="shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-300 text-xs font-bold flex items-center justify-center">
                        {rec.tier}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-white/80">{rec.service}</p>
                        <p className="text-xs text-white/40 mt-0.5">{rec.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Completion screen
  if (isComplete) return (
    <div className="min-h-screen flex flex-col">
      <PreviewBanner />
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="text-center space-y-6 max-w-md">
          <div className="w-16 h-16 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold text-white">Preview Complete</h2>
            <p className="text-white/50 text-sm">All questions answered. Generate analysis to see results.</p>
          </div>
          <div className="flex gap-3 justify-center">
            <button
              onClick={handleAnalyze}
              disabled={isAnalyzing}
              className="px-6 py-3 rounded-xl text-sm font-medium bg-white/10 border border-white/15 text-white hover:bg-white/15 transition-colors disabled:opacity-50"
            >
              {isAnalyzing ? "Analyzing..." : "Generate Analysis"}
            </button>
            <button
              onClick={handleExit}
              className="px-6 py-3 rounded-xl text-sm text-white/50 border border-white/10 hover:bg-white/5 transition-colors"
            >
              Exit Preview
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // Main interview UI
  return (
    <div className="min-h-screen flex flex-col">
      <PreviewBanner />

      <header className="sticky top-0 z-10 bg-[#0a0a0f]/80 backdrop-blur-lg border-b border-white/5 px-6 py-3">
        <div className="max-w-3xl mx-auto space-y-2">
          <SectionStepper
            sections={sectionProgress}
            answeredQuestions={answeredQuestions}
            onQuestionClick={() => {}}
            currentSection={progress?.section || "demographics"}
            questionBank={phaseProps.questionBank}
            phaseOrder={phaseProps.phaseOrder}
            phaseLabels={phaseProps.phaseLabels}
          />
          {progress && (
            <ProgressBar
              questionNumber={progress.questionNumber}
              totalQuestions={progress.totalQuestions}
              phase={progress.phase}
              section={progress.section}
              completedPercentage={progress.completedPercentage}
              phaseLabels={phaseProps.phaseLabels}
              sectionLabels={phaseProps.sectionLabels}
            />
          )}
        </div>
      </header>

      {/* Answered question pills */}
      {visibleAnswered.length > 0 && (
        <div className="sticky top-[110px] z-10 bg-[#0a0a0f]/60 backdrop-blur-sm border-b border-white/5 px-6 py-2">
          <div className="max-w-3xl mx-auto">
            <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
              {visibleAnswered.map((q, i) => (
                <div
                  key={q.questionId}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-full text-xs bg-white/5 border border-white/10 text-white/50"
                >
                  <span className="w-4 h-4 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center shrink-0">
                    <svg className="w-2.5 h-2.5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </span>
                  <span>Q{i + 1}</span>
                </div>
              ))}
              <div className="shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-full text-xs bg-amber-500/20 border border-amber-500/30 text-amber-300">
                <span className="w-4 h-4 rounded-full bg-amber-500/30 border border-amber-500/40 flex items-center justify-center shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                </span>
                <span>Q{visibleAnswered.length + 1}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        {currentQuestion && sessionId && (
          <>
            <QuestionCard
              key={currentQuestion.id}
              question={currentQuestion}
              sessionId={sessionId}
              onSubmit={handleSubmit}
              isSubmitting={isSubmitting}
            />

            {/* Auto-pilot button */}
            {mode === "autopilot" && (
              <button
                onClick={handleAutopilot}
                disabled={isSubmitting}
                className="mt-6 px-6 py-2.5 rounded-xl text-sm font-medium bg-purple-500/15 border border-purple-500/25 text-purple-300 hover:bg-purple-500/25 transition-all disabled:opacity-50"
              >
                {isSubmitting ? "Submitting..." : "Auto-answer & Next →"}
              </button>
            )}
          </>
        )}
      </main>
    </div>
  );
}
