import { useState, useEffect, useRef, useCallback } from "react";
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
  const [callPhone, setCallPhone] = useState("");
  const [callLoading, setCallLoading] = useState(false);
  const [callStatus, setCallStatus] = useState<"idle" | "calling" | "completed">("idle");
  const [callError, setCallError] = useState<string | null>(null);
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

    // Immediately show the user's message in the conversation
    const userMsg: ConversationMessage = {
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
      questionId: question.id,
    };
    const historyWithUser = [...newHistory, userMsg];
    setConversationHistory(historyWithUser);

    try {
      setConversationError(null);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000); // 120s timeout

      const res = await fetch(`${API_BASE}/api/interview/conversation-stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, questionId: question.id, answer: text, conversationHistory: newHistory }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        throw new Error(`Server error: ${res.status}`);
      }

      // Stream SSE response — show tokens as they arrive
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let streamedText = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));

            if (event.type === "token") {
              streamedText += event.text;
              // Update conversation with streaming assistant message
              setConversationHistory([
                ...historyWithUser,
                { role: "assistant" as const, content: streamedText, timestamp: new Date().toISOString(), questionId: question.id },
              ]);
            } else if (event.type === "done") {
              setIsAiThinking(false);
              if (!event.isComplete) {
                // Still in conversation — update with server's history
                setConversationHistory(event.conversationHistory);
              } else if (event.responseType === "complete" && onConversationComplete) {
                onConversationComplete(event);
              } else if (event.responseType === "next_question" && onConversationComplete) {
                onConversationComplete({ type: "next_question", ...event });
              } else if (onConversationComplete) {
                onConversationComplete(event);
              } else {
                onSubmit(text, event.conversationHistory);
              }
            } else if (event.type === "error") {
              setConversationError(event.message);
            }
          } catch {
            // Skip malformed SSE lines
          }
        }
      }
    } catch (err) {
      console.error("Conversation error:", err);
      const message = (err as Error).name === "AbortError"
        ? "Response took too long. Try sending a shorter message."
        : "Something went wrong. Please try again.";
      setConversationError(message);
      // Restore history without the streaming message
      setConversationHistory(historyWithUser);
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

  // Request a phone call for voice assessment
  const handleRequestCall = useCallback(async () => {
    if (!callPhone.trim()) return;
    setCallLoading(true);
    setCallError(null);
    try {
      const res = await fetch(`${API_BASE}/api/interview/request-call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, phone: callPhone }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to initiate call");
      }
      setCallStatus("calling");
    } catch (err) {
      setCallError((err as Error).message);
    } finally {
      setCallLoading(false);
    }
  }, [sessionId, callPhone]);

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
          <button onClick={onCancelEdit} className="text-muted-foreground hover:text-muted-foreground text-sm transition-colors">Cancel</button>
        </div>
      )}

      {/* Question */}
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-foreground leading-relaxed">{question.text || "Please share your thoughts on this topic."}</h2>
        {question.subtext && <p className="text-muted-foreground mt-2 text-sm">{question.subtext}</p>}
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
                      <div className="max-w-[85%] px-4 py-3 text-sm leading-relaxed bg-blue-500/15 text-foreground/90 border border-blue-500/20 rounded-2xl rounded-br-md">
                        {msg.content}
                      </div>
                    </div>
                  ) : (
                    /* Interviewer messages as plain text, no bubble */
                    <div className="text-sm leading-relaxed text-foreground/90">
                      {formatAiMessage(msg.content)}
                    </div>
                  )}
                </div>
              );
            })}
            {isAiThinking && (
              <div className="flex gap-1.5 py-1">
                <span className="w-2 h-2 bg-blue-400/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 bg-blue-400/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 bg-blue-400/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            )}
            {conversationError && (
              <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-between gap-3">
                <span className="text-red-300 text-sm">{conversationError}</span>
                <button
                  onClick={handleRetry}
                  className="px-3 py-1 rounded-lg bg-muted hover:bg-foreground/15 text-foreground/90 text-xs font-medium transition-colors shrink-0"
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
            <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-muted-foreground transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              Back
            </button>
          ) : <div />}
          {onSkip && (
            <button onClick={onSkip} className="text-sm text-muted-foreground hover:text-muted-foreground transition-colors">
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
              {isEditing && <button onClick={onCancelEdit} className="px-6 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-muted-foreground hover:bg-muted transition-all">Cancel</button>}
              <Button onClick={() => sliderValue !== null && onSubmit(sliderValue)} disabled={sliderValue === null} loading={isSubmitting} size="lg" className={isEditing ? "flex-1" : "w-full"}>{submitLabel}</Button>
            </div>
          </div>
        )}

        {(question.inputType === "buttons" || question.inputType === "multi_select") && (
          <div className="space-y-4">
            <ButtonSelect options={question.options || []} multiSelect={question.inputType === "multi_select"} onChange={(v) => setButtonValue(v)} initialValue={initialAnswer as string | string[] | undefined} />
            <div className="flex gap-3">
              {isEditing && <button onClick={onCancelEdit} className="px-6 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-muted-foreground hover:bg-muted transition-all">Cancel</button>}
              <Button onClick={() => buttonValue !== null && onSubmit(buttonValue)} disabled={buttonValue === null} loading={isSubmitting} size="lg" className={isEditing ? "flex-1" : "w-full"}>{submitLabel}</Button>
            </div>
          </div>
        )}

        {(question.inputType === "open_text" || question.inputType === "voice" || question.inputType === "ai_conversation") && (
          <div className="space-y-4">
            {/* Read-only review for AI conversation in edit mode */}
            {isEditing && question.inputType === "ai_conversation" && conversationHistory.length > 0 ? (
              <div className="space-y-4">
                <p className="text-muted-foreground text-xs uppercase tracking-wider">Previous conversation</p>
                <button onClick={onCancelEdit} className="w-full px-5 py-3 rounded-xl text-sm text-foreground/80 hover:text-foreground bg-muted hover:bg-muted border border-border transition-all">
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
                  className={`w-full border rounded-xl px-4 py-3 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none transition-all resize-none ${
                    isRecording
                      ? "bg-primary/10 border-primary/30 cursor-default"
                      : "bg-muted border-border focus:border-border focus:bg-foreground/[0.08]"
                  }`} />

                {/* Send button */}
                <div className="flex gap-3 items-center">
                  {isEditing && <button onClick={onCancelEdit} className="px-5 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-muted-foreground hover:bg-muted transition-all">Cancel</button>}
                  <Button onClick={handleTextSubmit} disabled={!textValue.trim() || isAiThinking} loading={isSubmitting || isAiThinking} size="lg" className="w-full">
                    {submitLabel}
                  </Button>
                </div>

                {/* Voice input options */}
                {!isEditing && (
                  <div className="space-y-4">
                    {/* Phone call option — take assessment by phone */}
                    {question.inputType === "ai_conversation" && (
                      <div className="pt-2">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="flex-1 h-px bg-muted" />
                          <span className="text-xs text-muted-foreground uppercase tracking-wider">or take this assessment by phone</span>
                          <div className="flex-1 h-px bg-muted" />
                        </div>
                        {callStatus === "idle" ? (
                          <div className="space-y-2">
                            <div className="flex gap-2">
                              <input
                                type="tel"
                                value={callPhone}
                                onChange={(e) => setCallPhone(e.target.value)}
                                placeholder="+1 (555) 123-4567"
                                className="flex-1 bg-muted border border-border rounded-xl px-4 py-3 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:border-blue-500/40 transition-all"
                              />
                              <button
                                onClick={handleRequestCall}
                                disabled={!callPhone.trim() || callLoading}
                                className="px-5 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-all flex items-center gap-2 whitespace-nowrap"
                              >
                                {callLoading ? (
                                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                  </svg>
                                ) : (
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                  </svg>
                                )}
                                Call me
                              </button>
                            </div>
                            {callError && <p className="text-red-400 text-xs text-center">{callError}</p>}
                          </div>
                        ) : callStatus === "calling" ? (
                          <div className="flex items-center justify-center gap-3 py-4 px-4 rounded-xl bg-green-500/5 border border-green-500/20">
                            <span className="w-3 h-3 rounded-full bg-green-400 animate-pulse" />
                            <span className="text-green-300 text-sm">Kascade is calling you now — pick up to start your assessment</span>
                          </div>
                        ) : callStatus === "completed" ? (
                          <div className="flex items-center justify-center gap-2 py-4 px-4 rounded-xl bg-green-500/5 border border-green-500/20">
                            <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            <span className="text-green-300 text-sm">Call completed — your responses have been recorded</span>
                          </div>
                        ) : null}
                      </div>
                    )}

                    {/* Deepgram mic button — speech-to-text dictation */}
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-px bg-muted" />
                      <span className="text-xs text-muted-foreground uppercase tracking-wider">or dictate</span>
                      <div className="flex-1 h-px bg-muted" />
                    </div>
                    <VoiceRecorder
                      onTranscription={handleVoiceTranscription}
                      onPartialTranscription={handlePartialTranscription}
                      onRecordingStateChange={handleRecordingStateChange}
                      stopRef={stopRecordingRef}
                      hideIdleStatus
                      hideTranscriptionPreview
                    />

                    {/* Hint */}
                    <p className="text-center text-muted-foreground text-xs">
                      {question.inputType === "ai_conversation"
                        ? "Enter your phone number for a voice assessment, or type / dictate your responses"
                        : "Tap the mic or press Space to speak \u00B7 Live transcription as you talk"}
                    </p>
                  </div>
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
