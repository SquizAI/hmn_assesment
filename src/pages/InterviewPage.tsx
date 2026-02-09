import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { Question, ConversationMessage, CascadePhase, CascadeSection } from "../lib/types";
import { API_BASE } from "../lib/api";
import { QUESTION_BANK } from "../data/question-bank";
import QuestionCard from "../components/interview/QuestionCard";
import ProgressBar from "../components/interview/ProgressBar";
import SectionStepper, { computeSectionProgress } from "../components/interview/SectionStepper";
import Button from "../components/ui/Button";

interface Progress {
  questionNumber: number;
  totalQuestions: number;
  phase: CascadePhase;
  section: CascadeSection;
  completedPercentage: number;
}

interface AnsweredQuestion {
  questionId: string;
  questionText: string;
  answer: unknown;
  inputType: string;
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

        // Capture skipped + auto-populated for section progress
        if (data.skippedQuestionIds) setSkippedQuestionIds(data.skippedQuestionIds);
        if (data.autoPopulatedResponses) {
          setAnsweredQuestions(data.autoPopulatedResponses.map((r: { questionId: string; questionText: string; answer: unknown; inputType: string }) => ({
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

  // Compute section progress
  const sectionProgress = useMemo(() =>
    computeSectionProgress(
      answeredQuestions,
      progress?.section || "demographics",
      skippedQuestionIds,
    ),
    [answeredQuestions, progress?.section, skippedQuestionIds]
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

  // --- Backward Navigation ---

  const handleNavigateBack = (questionId: string) => {
    const answered = answeredQuestions.find((q) => q.questionId === questionId);
    if (!answered) return;

    // Find the full Question object from the bank
    const fullQuestion = QUESTION_BANK.find((q) => q.id === questionId);
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
          />
          {/* Current progress bar */}
          {progress && (
            <ProgressBar
              questionNumber={progress.questionNumber}
              totalQuestions={progress.totalQuestions}
              phase={progress.phase}
              section={progress.section}
              completedPercentage={progress.completedPercentage}
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

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        {editingQuestion ? (
          <QuestionCard
            key={`edit-${editingQuestion.question.id}`}
            question={editingQuestion.question}
            sessionId={sessionId!}
            onSubmit={handleEditSubmit}
            isSubmitting={isSubmitting}
            initialAnswer={editingQuestion.previousAnswer as string | number | string[]}
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
              isSubmitting={isSubmitting}
            />
          )
        )}
      </main>
    </div>
  );
}
