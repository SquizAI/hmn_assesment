import { useState, useEffect } from "react";
import type { Question, ConversationMessage } from "../../lib/types";
import { API_BASE } from "../../lib/api";
import SliderInput from "./SliderInput";
import ButtonSelect from "./ButtonSelect";
import VoiceRecorder from "./VoiceRecorder";
import Button from "../ui/Button";

interface Props {
  question: Question;
  sessionId: string;
  onSubmit: (answer: string | number | string[], conversationHistory?: ConversationMessage[]) => void;
  isSubmitting: boolean;
  initialAnswer?: string | number | string[];
  isEditing?: boolean;
  onCancelEdit?: () => void;
}

export default function QuestionCard({ question, sessionId, onSubmit, isSubmitting, initialAnswer, isEditing, onCancelEdit }: Props) {
  const [textValue, setTextValue] = useState("");
  const [sliderValue, setSliderValue] = useState<number | null>(null);
  const [buttonValue, setButtonValue] = useState<string | string[] | null>(null);
  const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([]);
  const [isAiThinking, setIsAiThinking] = useState(false);
  // Voice is primary for open_text, voice, ai_conversation
  const [inputMode, setInputMode] = useState<"text" | "voice">("voice");

  useEffect(() => {
    setConversationHistory([]);
    setIsAiThinking(false);

    if (initialAnswer !== undefined) {
      // Pre-fill from previous answer for editing
      if (question.inputType === "slider") {
        setSliderValue(initialAnswer as number);
      } else if (question.inputType === "buttons" || question.inputType === "multi_select") {
        setButtonValue(initialAnswer as string | string[]);
      } else {
        // open_text, voice, ai_conversation — show as editable text
        setTextValue(String(initialAnswer));
        setInputMode("text");
      }
    } else {
      setTextValue("");
      setSliderValue(null);
      setButtonValue(null);
      setInputMode("voice");
    }
  }, [question.id, initialAnswer]);

  const handleTextSubmit = () => {
    if (!textValue.trim()) return;
    if (question.inputType === "ai_conversation" && !isEditing) {
      handleConversationSubmit(textValue.trim());
    } else {
      onSubmit(textValue.trim());
    }
  };

  const handleConversationSubmit = async (text: string) => {
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
      const res = await fetch(`${API_BASE}/api/interview/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, questionId: question.id, answer: text, conversationHistory: newHistory }),
      });
      const data = await res.json();

      if (data.type === "follow_up") {
        setConversationHistory(data.conversationHistory);
      } else {
        onSubmit(text, data.conversationHistory);
      }
    } catch (err) {
      console.error("Conversation error:", err);
    } finally {
      setIsAiThinking(false);
    }
  };

  const handleVoiceTranscription = (text: string) => {
    if (question.inputType === "ai_conversation") handleConversationSubmit(text);
    else {
      // Show transcribed text for review before submitting
      setTextValue(text);
    }
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
      <div className="mb-8">
        <h2 className="text-2xl font-semibold text-white leading-relaxed">{question.text}</h2>
        {question.subtext && <p className="text-white/50 mt-2 text-sm">{question.subtext}</p>}
      </div>

      {/* AI Conversation History */}
      {question.inputType === "ai_conversation" && !isEditing && conversationHistory.length > 0 && (
        <div className="mb-6 space-y-4 max-h-80 overflow-y-auto pr-2">
          {conversationHistory.filter(m => m.role !== "system").map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                msg.role === "user" ? "bg-blue-500/20 text-white border border-blue-500/30" : "bg-white/10 text-white/90 border border-white/10"
              }`}>{msg.content}</div>
            </div>
          ))}
          {isAiThinking && (
            <div className="flex justify-start">
              <div className="bg-white/10 rounded-2xl px-4 py-3 border border-white/10">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
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
            {/* Mode toggle — Speak is first/primary (hide voice option when editing) */}
            {!isEditing && (
              <div className="flex gap-2 justify-center">
                <button onClick={() => setInputMode("voice")} className={`px-4 py-1.5 rounded-full text-sm transition-all ${inputMode === "voice" ? "bg-white/20 text-white" : "text-white/40 hover:text-white/60"}`}>Speak</button>
                <button onClick={() => setInputMode("text")} className={`px-4 py-1.5 rounded-full text-sm transition-all ${inputMode === "text" ? "bg-white/20 text-white" : "text-white/40 hover:text-white/60"}`}>Type</button>
              </div>
            )}
            {inputMode === "voice" && !isEditing ? (
              <div className="space-y-4">
                <VoiceRecorder onTranscription={handleVoiceTranscription} />
                {/* Editable transcript review after voice recording */}
                {textValue && (
                  <div className="space-y-3">
                    <div>
                      <p className="text-white/30 text-xs mb-1.5 uppercase tracking-wider">Review & edit your response</p>
                      <textarea
                        value={textValue}
                        onChange={(e) => setTextValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleTextSubmit(); } }}
                        rows={3}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-white/30 focus:bg-white/10 transition-all resize-none"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setTextValue("")} className="px-4 py-2.5 rounded-xl text-sm text-white/40 hover:text-white/60 hover:bg-white/5 transition-all">
                        Re-record
                      </button>
                      <Button onClick={handleTextSubmit} disabled={!textValue.trim() || isAiThinking} loading={isSubmitting || isAiThinking} size="lg" className="flex-1">
                        {question.inputType === "ai_conversation" ? "Send" : "Continue"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <textarea value={textValue} onChange={(e) => setTextValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleTextSubmit(); } }}
                  placeholder={question.inputType === "ai_conversation" ? "Share your thoughts..." : "Type your response..."}
                  rows={3} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-white/30 focus:bg-white/10 transition-all resize-none" />
                <div className="flex gap-3">
                  {isEditing && <button onClick={onCancelEdit} className="px-6 py-2.5 rounded-xl text-sm text-white/40 hover:text-white/60 hover:bg-white/5 transition-all">Cancel</button>}
                  <Button onClick={handleTextSubmit} disabled={!textValue.trim() || isAiThinking} loading={isSubmitting || isAiThinking} size="lg" className={isEditing ? "flex-1" : "w-full"}>
                    {submitLabel}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
