import { useState, useEffect, useRef } from "react";
import type { Question, ConversationMessage } from "../../lib/types";
import { API_BASE } from "../../lib/api";
import SliderInput from "./SliderInput";
import ButtonSelect from "./ButtonSelect";
import VoiceRecorder from "./VoiceRecorder";
import Button from "../ui/Button";

/** Strip internal AI annotations and render basic markdown emphasis as JSX */
function formatAiMessage(text: string): React.ReactNode {
  // Remove internal annotations like **[capturing: ...]** or **[RED FLAG: ...]**
  let cleaned = text.replace(/\*\*\[.*?\]\*\*\s*/g, "").trim();

  // Split on *emphasis* markers and render as <em>
  const parts = cleaned.split(/\*(.*?)\*/g);
  if (parts.length === 1) return cleaned;

  return parts.map((part, i) =>
    i % 2 === 1 ? <em key={i}>{part}</em> : part
  );
}

interface Props {
  question: Question;
  sessionId: string;
  onSubmit: (answer: string | number | string[], conversationHistory?: ConversationMessage[]) => void;
  onConversationComplete?: (serverData: { type: string; currentQuestion?: unknown; progress?: unknown; skippedQuestionIds?: string[]; session?: unknown; conversationHistory?: ConversationMessage[] }) => void;
  isSubmitting: boolean;
  initialAnswer?: string | number | string[];
  initialConversationHistory?: ConversationMessage[];
  isEditing?: boolean;
  onCancelEdit?: () => void;
  onBack?: () => void;
  onSkip?: () => void;
  canGoBack?: boolean;
}

export default function QuestionCard({ question, sessionId, onSubmit, onConversationComplete, isSubmitting, initialAnswer, initialConversationHistory, isEditing, onCancelEdit, onBack, onSkip, canGoBack }: Props) {
  const [textValue, setTextValue] = useState("");
  const [sliderValue, setSliderValue] = useState<number | null>(null);
  const [buttonValue, setButtonValue] = useState<string | string[] | null>(null);
  const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([]);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [conversationError, setConversationError] = useState<string | null>(null);
  const lastMessageRef = useRef<string | null>(null);
  const suppressTranscriptionRef = useRef(false);
  const stopRecordingRef = useRef<(() => void) | null>(null);
  const conversationEndRef = useRef<HTMLDivElement>(null);
  const pageBottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll conversation container when new messages arrive or AI is thinking
  useEffect(() => {
    if (conversationEndRef.current) {
      conversationEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
    // Also scroll the whole page down so the input stays visible
    if (pageBottomRef.current) {
      pageBottomRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [conversationHistory, isAiThinking]);

  useEffect(() => {
    // Restore previous conversation if navigating back to an AI conversation question
    setConversationHistory(initialConversationHistory || []);
    setIsAiThinking(false);

    if (initialAnswer !== undefined) {
      // Pre-fill from previous answer for editing
      if (question.inputType === "slider") {
        setSliderValue(initialAnswer as number);
      } else if (question.inputType === "buttons" || question.inputType === "multi_select") {
        setButtonValue(initialAnswer as string | string[]);
      } else if (question.inputType === "ai_conversation" && initialConversationHistory?.length) {
        // AI conversation with history — don't pre-fill textarea with combined text
        setTextValue("");
      } else {
        // open_text, voice — show as editable text
        setTextValue(String(initialAnswer));
      }
    } else {
      setTextValue("");
      setSliderValue(null);
      setButtonValue(null);
    }
  }, [question.id, initialAnswer, initialConversationHistory]);

  const handleTextSubmit = () => {
    if (!textValue.trim()) return;
    // Stop recording and suppress any late transcription callbacks
    if (isRecording && stopRecordingRef.current) {
      suppressTranscriptionRef.current = true;
      stopRecordingRef.current();
    }
    if (question.inputType === "ai_conversation" && !isEditing) {
      handleConversationSubmit(textValue.trim());
    } else {
      onSubmit(textValue.trim());
    }
  };

  const handleRetry = () => {
    if (lastMessageRef.current) {
      setConversationError(null);
      handleConversationSubmit(lastMessageRef.current);
    }
  };

  const handleConversationSubmit = async (text: string) => {
    lastMessageRef.current = text;
    setIsAiThinking(true);
    setTextValue("");

    const newHistory: ConversationMessage[] = [
      ...conversationHistory,
      ...(conversationHistory.length === 0 ? [{
        role: "assistant" as const,
        content: question.text,
        timestamp: new Date().toISOString(),
        questionId: question.id,
      }] : []),
    ];

    try {
      setConversationError(null);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000); // 60s timeout

      const res = await fetch(`${API_BASE}/api/interview/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, questionId: question.id, answer: text, conversationHistory: newHistory }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        throw new Error(`Server error: ${res.status}`);
      }

      const data = await res.json();

      if (data.type === "follow_up") {
        setConversationHistory(data.conversationHistory);
      } else if (onConversationComplete) {
        // Pass server response directly — avoid double-POST
        onConversationComplete(data);
      } else {
        // Fallback for callers without onConversationComplete
        onSubmit(text, data.conversationHistory);
      }
    } catch (err) {
      console.error("Conversation error:", err);
      const message = (err as Error).name === "AbortError"
        ? "Response took too long. Try sending a shorter message."
        : "Something went wrong. Please try again.";
      setConversationError(message);
    } finally {
      setIsAiThinking(false);
    }
  };

  // Voice transcription always goes into textarea for review — never auto-submits
  const handleVoiceTranscription = (text: string) => {
    if (suppressTranscriptionRef.current) return;
    setTextValue(text);
  };

  // Live partial transcription feeds into textarea as user speaks
  const handlePartialTranscription = (text: string) => {
    if (suppressTranscriptionRef.current) return;
    setTextValue(text);
  };

  // When recording starts, allow transcription again
  const handleRecordingStateChange = (recording: boolean) => {
    if (recording) suppressTranscriptionRef.current = false;
    setIsRecording(recording);
  };

  const submitLabel = isEditing ? "Update Answer" : (question.inputType === "ai_conversation" ? "Send" : "Continue");

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Edit Banner */}
      {isEditing && (
        <div className="mb-6 flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <svg className="w-4 h-4 text-amber-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          <span className="text-amber-300/80 text-sm flex-1">Editing your previous answer</span>
          <button onClick={onCancelEdit} className="text-white/40 hover:text-white/60 text-sm transition-colors">Cancel</button>
        </div>
      )}

      {/* Question */}
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-white leading-relaxed">{question.text}</h2>
        {question.subtext && <p className="text-white/50 mt-2 text-sm">{question.subtext}</p>}
      </div>

      {/* AI Conversation History — shown during active conversation AND when reviewing a previous conversation */}
      {question.inputType === "ai_conversation" && conversationHistory.length > 0 && (
        <div className="mb-6">
          <div className="space-y-4">
            {conversationHistory.filter(m => m.role !== "system").map((msg, i, arr) => {
              // Skip the first assistant message if it just repeats the question heading
              if (i === 0 && msg.role === "assistant" && msg.content === question.text) return null;
              const isUser = msg.role === "user";
              const prevMsg = arr[i - 1];
              const sameSpeaker = prevMsg && prevMsg.role === msg.role;
              return (
                <div key={i} className={sameSpeaker ? "!mt-1.5" : ""}>
                  {isUser ? (
                    /* User messages in a bubble, right-aligned */
                    <div className="flex flex-col items-end">
                      {!sameSpeaker && (
                        <span className="text-[10px] font-medium uppercase tracking-wider mb-1.5 px-1 text-blue-400/50">You</span>
                      )}
                      <div className="max-w-[85%] px-4 py-3 text-sm leading-relaxed bg-blue-500/15 text-white/90 border border-blue-500/20 rounded-2xl rounded-br-md">
                        {msg.content}
                      </div>
                    </div>
                  ) : (
                    /* Interviewer messages as plain text, no bubble */
                    <div className="text-sm leading-relaxed text-white/90">
                      {formatAiMessage(msg.content)}
                    </div>
                  )}
                </div>
              );
            })}
            {isAiThinking && (
              <div className="flex gap-1.5 py-1">
                <span className="w-2 h-2 bg-purple-400/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 bg-purple-400/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 bg-purple-400/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            )}
            {conversationError && (
              <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-between gap-3">
                <span className="text-red-300 text-sm">{conversationError}</span>
                <button
                  onClick={handleRetry}
                  className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-white/80 text-xs font-medium transition-colors shrink-0"
                >
                  Retry
                </button>
              </div>
            )}
            <div ref={conversationEndRef} />
          </div>
        </div>
      )}

      {/* Navigation — Back / Skip */}
      {!isEditing && (canGoBack || onSkip) && (
        <div className="flex items-center justify-between mb-4">
          {canGoBack && onBack ? (
            <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-white/40 hover:text-white/60 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              Back
            </button>
          ) : <div />}
          {onSkip && (
            <button onClick={onSkip} className="text-sm text-white/30 hover:text-white/50 transition-colors">
              Skip this question
            </button>
          )}
        </div>
      )}

      {/* Inputs */}
      <div className="space-y-4">
        {question.inputType === "slider" && (
          <div className="space-y-6">
            <SliderInput min={question.sliderMin ?? 0} max={question.sliderMax ?? 10} minLabel={question.sliderLabels?.min} maxLabel={question.sliderLabels?.max} value={sliderValue ?? undefined} onChange={setSliderValue} />
            <div className="flex gap-3">
              {isEditing && <button onClick={onCancelEdit} className="px-6 py-2.5 rounded-xl text-sm text-white/40 hover:text-white/60 hover:bg-white/5 transition-all">Cancel</button>}
              <Button onClick={() => sliderValue !== null && onSubmit(sliderValue)} disabled={sliderValue === null} loading={isSubmitting} size="lg" className={isEditing ? "flex-1" : "w-full"}>{submitLabel}</Button>
            </div>
          </div>
        )}

        {(question.inputType === "buttons" || question.inputType === "multi_select") && (
          <div className="space-y-4">
            <ButtonSelect options={question.options || []} multiSelect={question.inputType === "multi_select"} onChange={(v) => setButtonValue(v)} initialValue={initialAnswer as string | string[] | undefined} />
            <div className="flex gap-3">
              {isEditing && <button onClick={onCancelEdit} className="px-6 py-2.5 rounded-xl text-sm text-white/40 hover:text-white/60 hover:bg-white/5 transition-all">Cancel</button>}
              <Button onClick={() => buttonValue !== null && onSubmit(buttonValue)} disabled={buttonValue === null} loading={isSubmitting} size="lg" className={isEditing ? "flex-1" : "w-full"}>{submitLabel}</Button>
            </div>
          </div>
        )}

        {(question.inputType === "open_text" || question.inputType === "voice" || question.inputType === "ai_conversation") && (
          <div className="space-y-4">
            {/* Read-only review for AI conversation in edit mode */}
            {isEditing && question.inputType === "ai_conversation" && conversationHistory.length > 0 ? (
              <div className="space-y-4">
                <p className="text-white/40 text-xs uppercase tracking-wider">Previous conversation</p>
                <button onClick={onCancelEdit} className="w-full px-5 py-3 rounded-xl text-sm text-white/70 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-all">
                  Return to current question
                </button>
              </div>
            ) : (
              <>
                {/* Editable textarea — type directly or review voice transcription */}
                <textarea value={textValue} onChange={(e) => { if (!isRecording) setTextValue(e.target.value); }}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleTextSubmit(); } }}
                  placeholder={isRecording ? "Listening..." : "Type or tap the mic to speak..."}
                  rows={3}
                  className={`w-full border rounded-xl px-4 py-3 text-white text-sm placeholder-white/30 focus:outline-none transition-all resize-none ${
                    isRecording
                      ? "bg-indigo-500/10 border-indigo-500/30 cursor-default"
                      : "bg-white/5 border-white/10 focus:border-white/20 focus:bg-white/[0.08]"
                  }`} />

                {/* Send button */}
                <div className="flex gap-3 items-center">
                  {isEditing && <button onClick={onCancelEdit} className="px-5 py-2.5 rounded-xl text-sm text-white/40 hover:text-white/60 hover:bg-white/5 transition-all">Cancel</button>}
                  <Button onClick={handleTextSubmit} disabled={!textValue.trim() || isAiThinking} loading={isSubmitting || isAiThinking} size="lg" className="w-full">
                    {submitLabel}
                  </Button>
                </div>

                {/* Big circle mic button with waveform */}
                {!isEditing && (
                  <VoiceRecorder
                    onTranscription={handleVoiceTranscription}
                    onPartialTranscription={handlePartialTranscription}
                    onRecordingStateChange={handleRecordingStateChange}
                    stopRef={stopRecordingRef}
                    hideIdleStatus
                    hideTranscriptionPreview
                  />
                )}

                {/* Hint */}
                {!isEditing && (
                  <p className="text-center text-white/30 text-xs">Tap the mic or press Space to speak &middot; Live transcription as you talk</p>
                )}
              </>
            )}
          </div>
        )}
      </div>
      <div ref={pageBottomRef} />
    </div>
  );
}
