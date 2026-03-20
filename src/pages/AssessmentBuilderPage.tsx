import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ChatMessage from "../components/admin/ChatMessage";
import ChatInput from "../components/admin/ChatInput";
import ToolActivity from "../components/admin/ToolActivity";
import WorkflowCanvas from "../components/workflow/WorkflowCanvas";
import { inferPhase } from "../components/admin/ProcessMap";
import { useToast } from "../components/ui/Toast";
import type { BuilderPhase } from "../lib/graph-layout";
import { adminChatStream, chatWithAssessmentStream, fetchAssessment, fetchAssessments } from "../lib/admin-api";
import type { ChatAttachment } from "../lib/admin-api";
import type { AdminChatMessage, AssessmentType, ToolEvent, ToolCallRecord } from "../lib/types";

// ============================================================
// Constants
// ============================================================

const ALLOWED_EXTENSIONS = ["md", "txt", "json", "csv", "yaml", "yml"];
const MAX_FILE_SIZE = 500_000;
const MAX_FILES = 5;

const QUICK_ACTIONS = [
  { label: "Build an assessment from scratch", icon: "✨" },
  { label: "Build assessment from my uploaded file", icon: "📄" },
  { label: "Help me design scoring dimensions", icon: "📐" },
  { label: "Import and adapt an existing framework", icon: "🔄" },
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// ============================================================
// Component
// ============================================================

export default function AssessmentBuilderPage() {
  const navigate = useNavigate();
  const { id: urlParamId } = useParams<{ id?: string }>();
  const { toast } = useToast();

  // --- Core state ---
  const [assessmentId, setAssessmentId] = useState<string | null>(urlParamId || null);
  const [assessment, setAssessment] = useState<AssessmentType | null>(null);
  const [currentPhase, setCurrentPhase] = useState<BuilderPhase>("purpose");
  const [messages, setMessages] = useState<AdminChatMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [toolEvents, setToolEvents] = useState<ToolEvent[]>([]);

  // --- UI state ---
  const [activeQuickAction, setActiveQuickAction] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(() => {
    try { return localStorage.getItem("cascade-builder-fullscreen") === "true"; } catch { return false; }
  });
  const [chatWidth, setChatWidth] = useState(() => {
    try { return parseInt(localStorage.getItem("cascade-chat-width") || "420") || 420; } catch { return 420; }
  });
  const [isResizing, setIsResizing] = useState(false);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  // --- Refs ---
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const dragCounterRef = useRef(0);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  // ============================================================
  // Effects
  // ============================================================

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  // Persist fullscreen preference
  useEffect(() => {
    try { localStorage.setItem("cascade-builder-fullscreen", String(isFullscreen)); } catch { /* noop */ }
  }, [isFullscreen]);

  // Escape to exit fullscreen
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen) setIsFullscreen(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isFullscreen]);

  // Persist chat width
  useEffect(() => {
    try { localStorage.setItem("cascade-chat-width", String(chatWidth)); } catch { /* noop */ }
  }, [chatWidth]);

  // Chat panel resize via drag handle
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizeRef.current = { startX: e.clientX, startWidth: chatWidth };
    setIsResizing(true);
  }, [chatWidth]);

  useEffect(() => {
    if (!isResizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeRef.current) return;
      // Dragging left = increase chat width (handle is on left edge of chat)
      const delta = resizeRef.current.startX - e.clientX;
      const newWidth = Math.min(900, Math.max(320, resizeRef.current.startWidth + delta));
      setChatWidth(newWidth);
    };
    const handleMouseUp = () => {
      setIsResizing(false);
      resizeRef.current = null;
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  // Load existing assessment when editing
  useEffect(() => {
    if (assessmentId) {
      refreshAssessment();
    }
  }, [assessmentId]);

  // ============================================================
  // Assessment Refresh
  // ============================================================

  const refreshAssessment = useCallback(async () => {
    if (!assessmentId) return;
    try {
      const data = await fetchAssessment(assessmentId);
      if (data?.assessment) {
        setAssessment(data.assessment);
        setCurrentPhase(inferPhase(data.assessment));
      }
    } catch (err) {
      console.error("Failed to refresh assessment:", err);
    }
  }, [assessmentId]);

  // ============================================================
  // Detect new assessment creation (Phase 1 → Phase 2 transition)
  // ============================================================

  const detectNewAssessment = useCallback(async (): Promise<boolean> => {
    if (assessmentId) return false; // already have one
    try {
      const data = await fetchAssessments();
      const assessments = data?.assessments || [];
      // Find any assessment created in the last 60 seconds
      const recent = assessments.find(
        (a: { createdAt?: string }) =>
          a.createdAt && new Date(a.createdAt).getTime() > Date.now() - 60000,
      );
      if (recent) {
        setAssessmentId(recent.id);
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  }, [assessmentId]);

  // ============================================================
  // File Handling
  // ============================================================

  const processFiles = useCallback(async (files: FileList | File[]) => {
    const newAttachments: ChatAttachment[] = [];

    for (const file of Array.from(files)) {
      if (attachments.length + newAttachments.length >= MAX_FILES) {
        alert(`Maximum ${MAX_FILES} files allowed.`);
        break;
      }

      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        alert(`"${file.name}" is not a supported file type. Supported: ${ALLOWED_EXTENSIONS.join(", ")}`);
        continue;
      }

      if (file.size > MAX_FILE_SIZE) {
        alert(`"${file.name}" is too large (${formatFileSize(file.size)}). Max: ${formatFileSize(MAX_FILE_SIZE)}`);
        continue;
      }

      try {
        const content = await file.text();
        newAttachments.push({ filename: file.name, content });
      } catch {
        alert(`Failed to read "${file.name}".`);
      }
    }

    if (newAttachments.length > 0) {
      setAttachments((prev) => [...prev, ...newAttachments]);
    }
  }, [attachments.length]);

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processFiles(e.target.files);
    e.target.value = "";
  };

  // ============================================================
  // Drag and Drop
  // ============================================================

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.items?.length) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;
    if (e.dataTransfer.files?.length) processFiles(e.dataTransfer.files);
  };

  // ============================================================
  // Chat
  // ============================================================

  const handleSend = async (text: string) => {
    const userMsg: AdminChatMessage = {
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setIsThinking(true);
    setToolEvents([]);

    const recentMessages = newMessages.length > 20 ? newMessages.slice(-20) : newMessages;

    const onEvent = (event: ToolEvent) => {
      setToolEvents((prev) => [...prev, event]);
    };

    try {
      let result: { text: string; toolCalls: ToolCallRecord[] };

      if (assessmentId) {
        result = await chatWithAssessmentStream(assessmentId, recentMessages, onEvent);
      } else {
        result = await adminChatStream(recentMessages, onEvent, attachments.length > 0 ? attachments : undefined);
      }

      const aiMsg: AdminChatMessage = {
        role: "assistant",
        content: result.text,
        timestamp: new Date().toISOString(),
        toolCalls: result.toolCalls.length > 0 ? result.toolCalls : undefined,
      };
      setMessages([...newMessages, aiMsg]);

      // Clear attachments after first send
      if (attachments.length > 0) setAttachments([]);

      // After AI response, check if an assessment was created (Phase 1 → 2)
      if (!assessmentId) {
        const found = await detectNewAssessment();
        if (found) {
          toast("Assessment created successfully", "success");
        }
      }

      // Refresh assessment data for live preview
      if (assessmentId) {
        setTimeout(async () => {
          await refreshAssessment();
          toast("Assessment updated", "success");
        }, 500);
      }
    } catch (err) {
      console.error("Chat error:", err);
      if ((err as Error)?.message === "Unauthorized") {
        toast("Session expired — redirecting to login", "error");
        navigate("/admin");
        return;
      }
      toast("Something went wrong. Please try again.", "error");
      setMessages([
        ...newMessages,
        { role: "assistant", content: "Something went wrong. Please try again.", timestamp: new Date().toISOString() },
      ]);
    } finally {
      setIsThinking(false);
      setToolEvents([]);
      setActiveQuickAction(null);
    }
  };

  // ============================================================
  // Phase Click (revisit)
  // ============================================================

  const handlePhaseClick = (phase: BuilderPhase) => {
    const labels: Record<BuilderPhase, string> = {
      purpose: "purpose and context",
      framework: "framework and structure",
      questions: "question design",
      scoring: "scoring and calibration",
      review: "review",
    };
    handleSend(`Let's revisit the ${labels[phase]} phase. What do we have so far and what could be improved?`);
  };

  // ============================================================
  // Render Helpers
  // ============================================================

  const lastAssistantIdx = messages.reduce((acc, msg, i) => (msg.role === "assistant" ? i : acc), -1);

  // ============================================================
  // Layout
  // ============================================================

  const content = (
    <div
      className={`flex flex-col h-full ${isFullscreen ? "" : ""}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Top bar */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/admin/assessments")}
            className="text-muted-foreground/70 hover:text-muted-foreground transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
          </button>
          <div>
            <h1 className="text-sm font-semibold text-foreground/90">
              {assessment ? assessment.name : "Assessment Developer"}
            </h1>
            {assessment && (
              <p className="text-[11px] text-muted-foreground/70">{assessment.id}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Chat width presets */}
          <div className="flex items-center bg-muted/50 border border-white/[0.06] rounded-lg overflow-hidden">
            {([
              { w: 420, label: "S", title: "Narrow chat" },
              { w: 600, label: "M", title: "Medium chat" },
              { w: 800, label: "L", title: "Wide chat" },
            ] as const).map((preset) => (
              <button
                key={preset.w}
                onClick={() => setChatWidth(preset.w)}
                className={`px-2 py-1.5 text-[10px] font-semibold transition-colors ${
                  Math.abs(chatWidth - preset.w) < 30
                    ? "bg-muted text-foreground/80"
                    : "text-white/25 hover:text-muted-foreground"
                }`}
                title={preset.title}
              >
                {preset.label}
              </button>
            ))}
          </div>
          {/* Fullscreen toggle */}
          <button
            onClick={() => setIsFullscreen((f) => !f)}
            className="p-2 rounded-lg bg-muted/50 hover:bg-white/[0.06] border border-white/[0.06] text-muted-foreground/70 hover:text-muted-foreground transition-all"
            title={isFullscreen ? "Exit fullscreen (Esc)" : "Fullscreen mode"}
          >
            {isFullscreen ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* 2-Panel Body: Workflow Canvas + Chat */}
      <div className="flex-1 flex min-h-0">
        {/* Left: Workflow Canvas */}
        <div className="flex-1 min-w-0 relative">
          <WorkflowCanvas
            assessment={assessment}
            currentPhase={currentPhase}
            onPhaseClick={handlePhaseClick}
          />
        </div>

        {/* Resize handle */}
        <div
          onMouseDown={handleResizeStart}
          className={`w-1.5 shrink-0 cursor-col-resize group relative z-10 ${isResizing ? "bg-purple-500/30" : "hover:bg-muted"} transition-colors`}
          title="Drag to resize chat"
        >
          <div className={`absolute inset-y-0 -left-1 -right-1 ${isResizing ? "" : "group-hover:bg-muted"}`} />
          {/* Visible grip dots */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="w-0.5 h-0.5 rounded-full bg-white/30" />
            <div className="w-0.5 h-0.5 rounded-full bg-white/30" />
            <div className="w-0.5 h-0.5 rounded-full bg-white/30" />
          </div>
        </div>

        {/* Right: AI Conversation */}
        <div
          style={{ width: chatWidth }}
          className={`shrink-0 border-l border-white/[0.06] flex flex-col min-w-0 relative ${isResizing ? "select-none" : ""}`}
        >
          {/* Drag overlay */}
          {isDragging && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm border-2 border-dashed border-purple-400/50 rounded-xl pointer-events-none">
              <div className="text-center space-y-3">
                <div className="w-16 h-16 rounded-2xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center mx-auto">
                  <svg className="w-8 h-8 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                </div>
                <p className="text-purple-300 font-medium">Drop files to attach</p>
                <p className="text-muted-foreground/70 text-xs">{ALLOWED_EXTENSIONS.join(", ")} — max {formatFileSize(MAX_FILE_SIZE)}</p>
              </div>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-6">
            <div className="max-w-3xl mx-auto space-y-4">
              {/* Welcome state */}
              {messages.length === 0 && !assessmentId && (
                <div className="text-center py-8 space-y-6">
                  <div className="space-y-3">
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 border border-border">
                      <span className="text-2xl">🏗</span>
                    </div>
                    <h2 className="text-lg font-semibold text-foreground">Assessment Developer</h2>
                    <p className="text-muted-foreground text-sm max-w-md mx-auto leading-relaxed">
                      I'll guide you through building a complete assessment — from purpose to questions to scoring.
                      Upload files, describe what you need, or pick a quick start below.
                    </p>
                  </div>

                  {/* File drop zone */}
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="max-w-md mx-auto border-2 border-dashed border-border hover:border-purple-500/30 rounded-2xl p-6 cursor-pointer transition-all hover:bg-purple-500/5 group"
                  >
                    <div className="space-y-2">
                      <svg className="w-7 h-7 text-muted-foreground/50 group-hover:text-purple-400/60 mx-auto transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                      <p className="text-sm text-muted-foreground group-hover:text-muted-foreground transition-colors">
                        Drop files here or click to browse
                      </p>
                      <p className="text-[11px] text-muted-foreground/50">
                        {ALLOWED_EXTENSIONS.map((e) => `.${e}`).join("  ")} — up to {MAX_FILES} files
                      </p>
                    </div>
                  </div>

                  {/* Quick actions */}
                  <div className="grid grid-cols-2 gap-2 max-w-md mx-auto">
                    {QUICK_ACTIONS.map((action) => {
                      const isActive = activeQuickAction === action.label;
                      const isDisabled = isThinking;
                      return (
                        <button
                          key={action.label}
                          disabled={isDisabled}
                          onClick={() => {
                            setActiveQuickAction(action.label);
                            handleSend(action.label);
                          }}
                          className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm transition-all text-left ${
                            isActive
                              ? "bg-purple-500/10 border-purple-500/30 text-purple-300"
                              : isDisabled
                                ? "bg-white/[0.02] border-border/50 text-muted-foreground/50 cursor-not-allowed"
                                : "bg-muted/50 border-border text-muted-foreground hover:bg-white/[0.07] hover:text-foreground/90 hover:border-border"
                          }`}
                        >
                          {isActive ? (
                            <div className="w-4 h-4 border-2 border-purple-400/30 border-t-purple-400 rounded-full animate-spin shrink-0" />
                          ) : (
                            <span className="text-base">{action.icon}</span>
                          )}
                          <span className="text-xs">{isActive ? "Working..." : action.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Welcome state for editing existing */}
              {messages.length === 0 && assessmentId && assessment && (
                <div className="text-center py-8 space-y-4">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 border border-border">
                    <span className="text-2xl">{assessment.icon || "📋"}</span>
                  </div>
                  <h2 className="text-lg font-semibold text-foreground">{assessment.name}</h2>
                  <p className="text-muted-foreground text-sm max-w-md mx-auto">
                    {assessment.questions?.length || 0} questions, {assessment.phases?.length || 0} phases,{" "}
                    {assessment.scoringDimensions?.length || 0} scoring dimensions.
                    Ask me to add questions, adjust scoring, or refine the structure.
                  </p>
                  <div className="flex justify-center gap-2">
                    {[
                      { label: "Review & improve", prompt: "Show me a summary of this assessment and suggest improvements" },
                      { label: "Add questions", prompt: "Add more questions to this assessment" },
                      { label: "Calibrate scoring", prompt: "Show me the scoring coverage and suggest calibration" },
                    ].map((btn) => {
                      const isActive = activeQuickAction === btn.prompt;
                      return (
                        <button
                          key={btn.label}
                          disabled={isThinking}
                          onClick={() => {
                            setActiveQuickAction(btn.prompt);
                            handleSend(btn.prompt);
                          }}
                          className={`px-3 py-2 rounded-xl border text-xs transition-all flex items-center gap-1.5 ${
                            isActive
                              ? "bg-purple-500/10 border-purple-500/30 text-purple-300"
                              : isThinking
                                ? "bg-white/[0.02] border-border/50 text-muted-foreground/50 cursor-not-allowed"
                                : "bg-muted/50 border-border text-muted-foreground hover:bg-white/[0.07] hover:text-foreground/90"
                          }`}
                        >
                          {isActive && (
                            <div className="w-3 h-3 border-2 border-purple-400/30 border-t-purple-400 rounded-full animate-spin shrink-0" />
                          )}
                          {isActive ? "Working..." : btn.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Messages */}
              {messages.map((msg, i) => (
                <ChatMessage
                  key={i}
                  role={msg.role}
                  content={msg.content}
                  onAction={handleSend}
                  isLatest={i === lastAssistantIdx && !isThinking}
                  toolCalls={msg.toolCalls}
                />
              ))}

              {/* Tool activity / thinking indicator */}
              {isThinking && <ToolActivity events={toolEvents} />}

              <div ref={bottomRef} />
            </div>
          </div>

          {/* Bottom bar: attachments + input */}
          <div className="border-t border-border/50 shrink-0">
            {/* Attached files bar */}
            {attachments.length > 0 && (
              <div className="px-6 pt-3 pb-0">
                <div className="max-w-3xl mx-auto">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] text-white/25 uppercase tracking-wider">Attached:</span>
                    {attachments.map((att, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs"
                      >
                        <span className="truncate max-w-[120px]">{att.filename}</span>
                        <button
                          onClick={() => removeAttachment(i)}
                          className="text-purple-400/50 hover:text-purple-300 transition-colors"
                        >
                          &#x2715;
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Chat input */}
            <div className="px-6 py-4">
              <div className="max-w-3xl mx-auto flex gap-2 items-end">
                {/* File upload button */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-3 bg-muted/50 hover:bg-white/[0.06] border border-white/[0.08] rounded-xl text-muted-foreground/70 hover:text-muted-foreground transition-all shrink-0"
                  title="Attach files"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                  </svg>
                </button>
                <div className="flex-1">
                  <ChatInput
                    onSend={handleSend}
                    disabled={isThinking}
                    placeholder={
                      assessmentId
                        ? "Ask me to add questions, adjust scoring, or refine..."
                        : "Describe the assessment you want to build..."
                    }
                  />
                </div>
              </div>
            </div>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(",")}
              onChange={handleFileInput}
              className="hidden"
            />
          </div>
        </div>

      </div>
    </div>
  );

  // ============================================================
  // Fullscreen wrapper
  // ============================================================

  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col animate-in fade-in duration-200">
        {content}
      </div>
    );
  }

  return <div className="h-full flex flex-col">{content}</div>;
}
