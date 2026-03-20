import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { ConversationMessage, AdaptabilityPhase, AdaptabilitySection } from "../lib/types";
import { startInterview, submitAnswer, skipQuestion, analyzeSession } from "../lib/api";
import QuestionCard from "../components/interview/QuestionCard";
import ProgressBar from "../components/interview/ProgressBar";
import Button from "../components/ui/Button";

// ============================================================
// Adaptability Index Interview Page
// Adaptive conversational flow with phase transitions,
// trust calibration, and micro-moment delivery
// ============================================================

const PHASE_LABELS: Record<AdaptabilityPhase, string> = {
  trust_building: "Opening & Trust",
  pillar_1: "Learning Velocity",
  pillar_2: "Unlearning Readiness",
  micro_moment: "Reflection Moment",
  pillar_3: "Adaptive Agency",
  pillar_4: "Beginner Tolerance",
  domain_differential: "Domain Comparison",
  closing: "Closing",
};

const PHASE_DESCRIPTIONS: Record<AdaptabilityPhase, string> = {
  trust_building: "Setting up our conversation",
  pillar_1: "How you learn new things",
  pillar_2: "How you let go of old things",
  micro_moment: "A brief moment of reflection",
  pillar_3: "How you take ownership of your growth",
  pillar_4: "How you handle being a beginner",
  domain_differential: "Where your adaptability varies",
  closing: "Wrapping up",
};

const PHASE_ORDER: AdaptabilityPhase[] = [
  "trust_building", "pillar_1", "pillar_2", "micro_moment",
  "pillar_3", "pillar_4", "domain_differential", "closing",
];

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

export default function AdaptabilityInterviewPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const [currentQuestion, setCurrentQuestion] = useState<Record<string, unknown> | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isStarting, setIsStarting] = useState(true);
  const [isComplete, setIsComplete] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answeredQuestions, setAnsweredQuestions] = useState<AnsweredQuestion[]>([]);
  const [skippedQuestionIds, setSkippedQuestionIds] = useState<string[]>([]);
  const [conversationHistories, setConversationHistories] = useState<Record<string, ConversationMessage[]>>({});

  // Phase transition state
  const [currentPhase, setCurrentPhase] = useState<AdaptabilityPhase>("trust_building");
  const [showTransition, setShowTransition] = useState(false);
  const [transitionPhase, setTransitionPhase] = useState<AdaptabilityPhase | null>(null);

  // Start the interview
  useEffect(() => {
    (async () => {
      try {
        const data = await startInterview(sessionId!);
        setCurrentQuestion(data.currentQuestion);
        setProgress({ ...data.progress, completedPercentage: 0 });
        if (data.skippedQuestionIds) setSkippedQuestionIds(data.skippedQuestionIds);
        if (data.answeredResponses || data.autoPopulatedResponses) {
          const priorResponses = data.answeredResponses || data.autoPopulatedResponses;
          setAnsweredQuestions(priorResponses.map((r: { questionId: string; questionText: string; answer: unknown; inputType: string }) => ({
            questionId: r.questionId,
            questionText: r.questionText,
            answer: r.answer,
            inputType: r.inputType,
          })));
        }
        // Set initial phase from the first question
        if (data.currentQuestion?.phase) {
          setCurrentPhase(data.currentQuestion.phase as AdaptabilityPhase);
        }
      } catch {
        setError("Failed to start interview.");
      } finally {
        setIsStarting(false);
      }
    })();
  }, [sessionId]);

  // Scroll to top on new question
  useEffect(() => {
    if (currentQuestion) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [currentQuestion]);

  // Handle phase transitions
  const handlePhaseTransition = useCallback((newPhase: AdaptabilityPhase) => {
    if (newPhase !== currentPhase) {
      setTransitionPhase(newPhase);
      setShowTransition(true);
      // Auto-dismiss after 3 seconds
      setTimeout(() => {
        setShowTransition(false);
        setTransitionPhase(null);
        setCurrentPhase(newPhase);
      }, 3000);
    }
  }, [currentPhase]);

  // Submit answer
  const handleSubmit = async (answer: string | number | string[], conversationHistory?: ConversationMessage[]) => {
    if (!currentQuestion) return;
    setIsSubmitting(true);
    try {
      const data = await submitAnswer(sessionId!, currentQuestion.id as string, answer as string, conversationHistory);
      if (data.type === "follow_up") return; // QuestionCard handles follow-ups

      // Save conversation history
      if (data.conversationHistory) {
        setConversationHistories((prev) => ({
          ...prev,
          [currentQuestion.id as string]: data.conversationHistory,
        }));
      }

      // Track answered question
      setAnsweredQuestions((prev) => [
        ...prev,
        {
          questionId: currentQuestion.id as string,
          questionText: currentQuestion.text as string,
          answer,
          inputType: currentQuestion.inputType as string,
        },
      ]);

      if (data.skippedQuestionIds) setSkippedQuestionIds(data.skippedQuestionIds);

      if (data.type === "complete") {
        setIsComplete(true);
      } else if (data.type === "next_question") {
        // Check for phase transition
        const newPhase = data.currentQuestion?.phase as AdaptabilityPhase | undefined;
        if (newPhase && newPhase !== currentPhase) {
          handlePhaseTransition(newPhase);
        }
        setCurrentQuestion(data.currentQuestion);
        setProgress(data.progress);
      }
    } catch {
      setError("Something went wrong.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle AI conversation completion (direct server data)
  const handleConversationComplete = (serverData: {
    type: string;
    currentQuestion?: unknown;
    progress?: unknown;
    skippedQuestionIds?: string[];
    conversationHistory?: ConversationMessage[];
  }) => {
    if (!currentQuestion) return;

    if (serverData.conversationHistory) {
      setConversationHistories((prev) => ({
        ...prev,
        [currentQuestion.id as string]: serverData.conversationHistory!,
      }));
    }

    setAnsweredQuestions((prev) => [
      ...prev,
      {
        questionId: currentQuestion.id as string,
        questionText: currentQuestion.text as string,
        answer: "(conversation)",
        inputType: currentQuestion.inputType as string,
      },
    ]);

    if (serverData.skippedQuestionIds) setSkippedQuestionIds(serverData.skippedQuestionIds);

    if (serverData.type === "complete") {
      setIsComplete(true);
    } else if (serverData.type === "next_question") {
      const newQuestion = serverData.currentQuestion as Record<string, unknown>;
      const newPhase = newQuestion?.phase as AdaptabilityPhase | undefined;
      if (newPhase && newPhase !== currentPhase) {
        handlePhaseTransition(newPhase);
      }
      setCurrentQuestion(newQuestion);
      setProgress(serverData.progress as Progress);
    }
  };

  // Skip question
  const handleSkip = async () => {
    if (!currentQuestion) return;
    setIsSubmitting(true);
    try {
      const data = await skipQuestion(sessionId!, currentQuestion.id as string);
      setSkippedQuestionIds((prev) => [...prev, currentQuestion.id as string]);

      if (data.type === "complete") {
        setIsComplete(true);
      } else if (data.type === "next_question") {
        const newPhase = data.currentQuestion?.phase as AdaptabilityPhase | undefined;
        if (newPhase && newPhase !== currentPhase) {
          handlePhaseTransition(newPhase);
        }
        setCurrentQuestion(data.currentQuestion);
        setProgress(data.progress);
      }
      if (data.skippedQuestionIds) setSkippedQuestionIds(data.skippedQuestionIds);
    } catch {
      setError("Something went wrong.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Analyze
  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    try {
      await analyzeSession(sessionId!);
      navigate(`/adaptability-profile/${sessionId}`);
    } catch {
      setError("Analysis failed.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Phase progress indicator
  const phaseProgress = useMemo(() => {
    const currentIdx = PHASE_ORDER.indexOf(currentPhase);
    return {
      current: currentIdx,
      total: PHASE_ORDER.length,
      percentage: Math.round(((currentIdx + 1) / PHASE_ORDER.length) * 100),
    };
  }, [currentPhase]);

  // --- Render ---

  if (isStarting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        <div className="text-center space-y-6">
          <div className="w-16 h-16 border-2 border-emerald-500/20 border-t-emerald-400 rounded-full animate-spin mx-auto" />
          <div className="space-y-2">
            <p className="text-muted-foreground text-lg">Preparing your Adaptability conversation...</p>
            <p className="text-muted-foreground text-sm">This is a reflective conversation, not a test.</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        <div className="text-center space-y-4">
          <p className="text-red-400">{error}</p>
          <Button onClick={() => navigate("/")} variant="secondary">
            Return Home
          </Button>
        </div>
      </div>
    );
  }

  // Phase transition overlay
  if (showTransition && transitionPhase) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        <div className="text-center space-y-6 max-w-md px-6 animate-fade-in">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto">
            <span className="text-emerald-400 text-lg font-medium">
              {PHASE_ORDER.indexOf(transitionPhase) + 1}
            </span>
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-medium text-foreground">
              {PHASE_LABELS[transitionPhase]}
            </h2>
            <p className="text-muted-foreground text-sm">
              {PHASE_DESCRIPTIONS[transitionPhase]}
            </p>
          </div>
          <div className="flex justify-center gap-1.5">
            {PHASE_ORDER.map((phase, i) => (
              <div
                key={phase}
                className={`h-1 rounded-full transition-all duration-500 ${
                  i <= PHASE_ORDER.indexOf(transitionPhase)
                    ? "w-8 bg-emerald-500/60"
                    : "w-4 bg-muted"
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Completion screen
  if (isComplete) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        <div className="text-center space-y-8 max-w-md">
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto">
            <svg
              className="w-8 h-8 text-emerald-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <div className="space-y-3">
            <h2 className="text-2xl font-semibold text-foreground">
              Conversation Complete
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              Thank you for your honesty and openness. Your responses will now be
              analyzed to generate your personal Adaptability Profile — a
              strengths-led report with a 90-day development plan tailored to
              your specific pattern.
            </p>
            <p className="text-muted-foreground text-sm">
              Remember: adaptability is a set of muscles, not a personality
              trait. The profile is a starting point, not a verdict.
            </p>
          </div>
          <div className="space-y-3">
            <Button onClick={handleAnalyze} loading={isAnalyzing} size="lg">
              {isAnalyzing
                ? "Generating Your Profile..."
                : "Generate My Adaptability Profile"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!currentQuestion) return null;

  const isRequired = currentQuestion.required as boolean;
  const questionText = currentQuestion.text as string;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Header with phase indicator */}
      <div className="sticky top-0 z-10 bg-slate-950/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-2xl mx-auto px-6 py-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-emerald-400/80">
                {PHASE_LABELS[currentPhase]}
              </span>
              <span className="text-xs text-muted-foreground">
                {progress?.questionNumber}/{progress?.totalQuestions}
              </span>
            </div>
            <span className="text-xs text-muted-foreground">
              Adaptability Index
            </span>
          </div>
          {/* Phase progress dots */}
          <div className="flex gap-1">
            {PHASE_ORDER.map((phase, i) => (
              <div
                key={phase}
                className={`h-0.5 flex-1 rounded-full transition-all ${
                  i < phaseProgress.current
                    ? "bg-emerald-500/60"
                    : i === phaseProgress.current
                    ? "bg-emerald-400"
                    : "bg-muted"
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-2xl mx-auto px-6 py-8">
        <QuestionCard
          question={currentQuestion as any}
          onSubmit={handleSubmit}
          onConversationComplete={handleConversationComplete}
          onSkip={!isRequired ? handleSkip : undefined}
          isSubmitting={isSubmitting}
          sessionId={sessionId || ""}
          initialConversationHistory={conversationHistories[currentQuestion.id as string]}
        />
      </div>
    </div>
  );
}
