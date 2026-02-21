import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { Question, ConversationMessage } from "../lib/types";
import { API_BASE } from "../lib/api";
import { QUESTION_BANK } from "../data/question-bank";
import QuestionCard from "../components/interview/QuestionCard";
import ProgressBar from "../components/interview/ProgressBar";
import SectionStepper, { computeSectionProgress } from "../components/interview/SectionStepper";
import type { ComputeSectionProgressOptions } from "../components/interview/SectionStepper";
import Button from "../components/ui/Button";

interface Progress {
  questionNumber: number;
  totalQuestions: number;
  phase: string;
  section: string;
  completedPercentage: number;
}

interface AnsweredQuestion {
  questionId: string;
  questionText: string;
  answer: unknown;
  inputType: string;
}

interface AssessmentMeta {
  questions: Array<{ id: string; section: string; phase: string; text: string }>;
  sections: Array<{ id: string; label: string; phaseId: string; order: number }> | null;
  phases: Array<{ id: string; label: string; order: number }> | null;
}

export default function InterviewPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isStarting, setIsStarting] = useState(true);
  const [isComplete, setIsComplete] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answeredQuestions, setAnsweredQuestions] = useState<AnsweredQuestion[]>([]);
  const [skippedQuestionIds, setSkippedQuestionIds] = useState<string[]>([]);
  const [conversationHistories, setConversationHistories] = useState<Record<string, ConversationMessage[]>>({});

  // Dynamic assessment metadata (populated from server for non-default assessments)
  const [assessmentMeta, setAssessmentMeta] = useState<AssessmentMeta | null>(null);

  // Scroll to top when a new question loads
  useEffect(() => {
    if (currentQuestion) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [currentQuestion?.id]);

  // Edit mode state
  const [editingQuestion, setEditingQuestion] = useState<{
    question: Question;
    previousAnswer: unknown;
  } | null>(null);
  const [savedCurrentQuestion, setSavedCurrentQuestion] = useState<Question | null>(null);
  const [savedProgress, setSavedProgress] = useState<Progress | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/interview/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        if (!res.ok) throw new Error("Failed to start");
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

        // Capture skipped + answered for section progress and Q pills
        if (data.skippedQuestionIds) setSkippedQuestionIds(data.skippedQuestionIds);
        // Use answeredResponses (all prior answers) on resume, fallback to autoPopulatedResponses for fresh starts
        const priorResponses = data.answeredResponses || data.autoPopulatedResponses;
        if (priorResponses) {
          setAnsweredQuestions(priorResponses.map((r: { questionId: string; questionText: string; answer: unknown; inputType: string }) => ({
            questionId: r.questionId,
            questionText: r.questionText,
            answer: r.answer,
            inputType: r.inputType,
          })));
        }
      } catch { setError("Failed to start interview."); }
      finally { setIsStarting(false); }
    })();
  }, [sessionId]);

  // Build dynamic section progress options from assessment metadata
  const sectionProgressOptions = useMemo((): ComputeSectionProgressOptions | undefined => {
    if (!assessmentMeta?.sections || !assessmentMeta?.phases) return undefined; // Use defaults

    const sectionOrder = [...assessmentMeta.sections].sort((a: { order: number }, b: { order: number }) => a.order - b.order).map((s: { id: string }) => s.id);
    const sectionLabels: Record<string, string> = {};
    assessmentMeta.sections.forEach((s: { id: string; label: string }) => { sectionLabels[s.id] = s.label; });

    return {
      questionBank: assessmentMeta.questions,
      sectionOrder,
      sectionLabels,
    };
  }, [assessmentMeta]);

  // Phase metadata for child components
  const phaseProps = useMemo(() => {
    if (!assessmentMeta?.phases || !assessmentMeta?.sections) return {};

    const phaseOrder = [...assessmentMeta.phases].sort((a: { order: number }, b: { order: number }) => a.order - b.order).map((p: { id: string }) => p.id);
    const phaseLabels: Record<string, string> = {};
    assessmentMeta.phases.forEach((p: { id: string; label: string }) => { phaseLabels[p.id] = p.label; });
    const sectionLabels: Record<string, string> = {};
    assessmentMeta.sections.forEach((s: { id: string; label: string }) => { sectionLabels[s.id] = s.label; });

    return { phaseOrder, phaseLabels, sectionLabels, questionBank: assessmentMeta.questions };
  }, [assessmentMeta]);

  // Compute section progress
  const sectionProgress = useMemo(() =>
    computeSectionProgress(
      answeredQuestions,
      progress?.section || "demographics",
      skippedQuestionIds,
      sectionProgressOptions,
    ),
    [answeredQuestions, progress?.section, skippedQuestionIds, sectionProgressOptions]
  );

  // Non-skipped answered questions (for pills display)
  const visibleAnswered = useMemo(() =>
    answeredQuestions.filter((q) => !skippedQuestionIds.includes(q.questionId)),
    [answeredQuestions, skippedQuestionIds]
  );

  const handleSubmit = async (answer: string | number | string[], conversationHistory?: ConversationMessage[]) => {
    if (!currentQuestion) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/interview/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, questionId: currentQuestion.id, answer, conversationHistory }),
      });
      const data = await res.json();
      if (data.type === "follow_up") return; // QuestionCard handles this

      // Save conversation history if present (fallback path for AI conversations)
      if (data.conversationHistory) {
        setConversationHistories((prev) => ({ ...prev, [currentQuestion.id]: data.conversationHistory }));
      }

      // Track answered question
      setAnsweredQuestions((prev) => [
        ...prev,
        { questionId: currentQuestion.id, questionText: currentQuestion.text, answer, inputType: currentQuestion.inputType },
      ]);

      // Update skipped IDs if server provides them
      if (data.skippedQuestionIds) setSkippedQuestionIds(data.skippedQuestionIds);

      if (data.type === "complete") setIsComplete(true);
      else if (data.type === "next_question") { setCurrentQuestion(data.currentQuestion); setProgress(data.progress); }
    } catch { setError("Something went wrong."); }
    finally { setIsSubmitting(false); }
  };

  // --- AI Conversation Completion (direct server data, no double-POST) ---

  const handleConversationComplete = (serverData: { type: string; currentQuestion?: unknown; progress?: unknown; skippedQuestionIds?: string[]; session?: unknown; conversationHistory?: ConversationMessage[] }) => {
    if (!currentQuestion) return;

    // Save the conversation history for this question so it can be reviewed on back-nav
    if (serverData.conversationHistory) {
      setConversationHistories((prev) => ({ ...prev, [currentQuestion.id]: serverData.conversationHistory! }));
    }

    // Track the answered question
    setAnsweredQuestions((prev) => [
      ...prev,
      { questionId: currentQuestion.id, questionText: currentQuestion.text, answer: "(conversation)", inputType: currentQuestion.inputType },
    ]);

    // Update skipped IDs if server provides them
    if (serverData.skippedQuestionIds) setSkippedQuestionIds(serverData.skippedQuestionIds);

    if (serverData.type === "complete") {
      setIsComplete(true);
    } else if (serverData.type === "next_question") {
      setCurrentQuestion(serverData.currentQuestion as Question);
      setProgress(serverData.progress as Progress);
    }
  };

  // --- Backward Navigation ---

  const handleNavigateBack = (questionId: string) => {
    const answered = answeredQuestions.find((q) => q.questionId === questionId);
    if (!answered) return;

    // Find the full Question object — check dynamic assessment bank first, then static
    const dynamicBank = assessmentMeta?.questions;
    const fullQuestion = (dynamicBank?.find((q: { id: string }) => q.id === questionId) || QUESTION_BANK.find((q) => q.id === questionId)) as Question | undefined;
    if (!fullQuestion) return;

    // Save current position
    setSavedCurrentQuestion(currentQuestion);
    setSavedProgress(progress);

    setEditingQuestion({
      question: fullQuestion,
      previousAnswer: answered.answer,
    });
  };

  const handleEditSubmit = async (answer: string | number | string[]) => {
    if (!editingQuestion) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/interview/respond`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, questionId: editingQuestion.question.id, answer }),
      });
      if (!res.ok) throw new Error("Update failed");

      // Update answeredQuestions in-place
      setAnsweredQuestions((prev) =>
        prev.map((q) =>
          q.questionId === editingQuestion.question.id ? { ...q, answer } : q
        )
      );

      // Return to current question
      exitEditMode();
    } catch { setError("Failed to update answer."); }
    finally { setIsSubmitting(false); }
  };

  const exitEditMode = () => {
    setEditingQuestion(null);
    if (savedCurrentQuestion) setCurrentQuestion(savedCurrentQuestion);
    if (savedProgress) setProgress(savedProgress);
    setSavedCurrentQuestion(null);
    setSavedProgress(null);
  };

  // --- Back / Skip from QuestionCard ---

  const handleGoBack = () => {
    if (visibleAnswered.length === 0) return;
    const lastAnswered = visibleAnswered[visibleAnswered.length - 1];
    handleNavigateBack(lastAnswered.questionId);
  };

  const handleSkip = async () => {
    if (!currentQuestion) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/interview/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, questionId: currentQuestion.id, answer: "[SKIPPED]", skip: true }),
      });
      const data = await res.json();

      // Track as skipped
      setSkippedQuestionIds((prev) => [...prev, currentQuestion.id]);

      if (data.type === "complete") setIsComplete(true);
      else if (data.type === "next_question") { setCurrentQuestion(data.currentQuestion); setProgress(data.progress); }
      if (data.skippedQuestionIds) setSkippedQuestionIds(data.skippedQuestionIds);
    } catch { setError("Something went wrong."); }
    finally { setIsSubmitting(false); }
  };

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    try {
      const res = await fetch(`${API_BASE}/api/interview/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      if (!res.ok) throw new Error("Analysis failed");
      navigate(`/analysis/${sessionId}`);
    } catch { setError("Analysis failed."); }
    finally { setIsAnalyzing(false); }
  };

  if (isStarting) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="w-12 h-12 border-2 border-white/20 border-t-white rounded-full animate-spin mx-auto" />
        <p className="text-white/40">Preparing your interview...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-4"><p className="text-red-400">{error}</p><Button onClick={() => navigate("/")} variant="secondary">Return Home</Button></div>
    </div>
  );

  if (isComplete) return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="text-center space-y-8 max-w-md">
        <div className="w-16 h-16 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center mx-auto">
          <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold text-white">Interview Complete</h2>
          <p className="text-white/50">Ready to generate your personalized AI readiness analysis.</p>
        </div>
        <Button onClick={handleAnalyze} loading={isAnalyzing} size="lg">{isAnalyzing ? "Analyzing..." : "Generate My Analysis"}</Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-10 bg-[#0a0a0f]/80 backdrop-blur-lg border-b border-white/5 px-6 py-3">
        <div className="max-w-3xl mx-auto space-y-2">
          {/* Section Stepper */}
          <SectionStepper
            sections={sectionProgress}
            answeredQuestions={answeredQuestions}
            onQuestionClick={handleNavigateBack}
            currentSection={progress?.section || "demographics"}
            questionBank={phaseProps.questionBank}
            phaseOrder={phaseProps.phaseOrder}
            phaseLabels={phaseProps.phaseLabels}
          />
          {/* Current progress bar */}
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

      {/* Question pills — answered questions for quick backward navigation */}
      {visibleAnswered.length > 0 && (
        <div className="sticky top-[110px] z-10 bg-[#0a0a0f]/60 backdrop-blur-sm border-b border-white/5 px-6 py-2">
          <div className="max-w-3xl mx-auto">
            <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
              {visibleAnswered.map((q, i) => {
                const isBeingEdited = editingQuestion?.question.id === q.questionId;
                return (
                  <button
                    key={q.questionId}
                    onClick={() => handleNavigateBack(q.questionId)}
                    className={`shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-full text-xs transition-all
                      ${isBeingEdited
                        ? "bg-amber-500/20 border border-amber-500/30 text-amber-300"
                        : "bg-white/5 border border-white/10 text-white/50 hover:bg-white/10 hover:text-white/70"
                      }`}
                    title={q.questionText}
                  >
                    {isBeingEdited ? (
                      <svg className="w-3.5 h-3.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    ) : (
                      <span className="w-4 h-4 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center shrink-0">
                        <svg className="w-2.5 h-2.5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </span>
                    )}
                    <span className="truncate max-w-[120px]">Q{i + 1}</span>
                  </button>
                );
              })}
              {/* Current question indicator */}
              {!editingQuestion && (
                <div className="shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-full text-xs bg-indigo-500/20 border border-indigo-500/30 text-indigo-300">
                  <span className="w-4 h-4 rounded-full bg-indigo-500/30 border border-indigo-500/40 flex items-center justify-center shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                  </span>
                  <span>Q{visibleAnswered.length + 1}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 px-6 pt-6 pb-12">
        {editingQuestion ? (
          <QuestionCard
            key={`edit-${editingQuestion.question.id}`}
            question={editingQuestion.question}
            sessionId={sessionId!}
            onSubmit={handleEditSubmit}
            isSubmitting={isSubmitting}
            initialAnswer={editingQuestion.previousAnswer as string | number | string[]}
            initialConversationHistory={conversationHistories[editingQuestion.question.id]}
            isEditing={true}
            onCancelEdit={exitEditMode}
          />
        ) : (
          currentQuestion && sessionId && (
            <QuestionCard
              key={currentQuestion.id}
              question={currentQuestion}
              sessionId={sessionId}
              onSubmit={handleSubmit}
              onConversationComplete={handleConversationComplete}
              isSubmitting={isSubmitting}
              onBack={handleGoBack}
              onSkip={handleSkip}
              canGoBack={visibleAnswered.length > 0}
            />
          )
        )}
      </main>
    </div>
  );
}
