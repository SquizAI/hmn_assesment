import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import ChatMessage from "./ChatMessage";
import ChatInput from "./ChatInput";
import ToolActivity from "./ToolActivity";
import { adminChatStream } from "../../lib/admin-api";
import type { ChatAttachment } from "../../lib/admin-api";
import type { AdminChatMessage, ToolEvent, ToolCallRecord } from "../../lib/types";

// ============================================================
// Constants
// ============================================================

const ALLOWED_EXTENSIONS = ["md", "txt", "json", "csv", "yaml", "yml"];
const MAX_FILE_SIZE = 500_000;
const MAX_FILES = 5;

const QUICK_ACTIONS = [
  { label: "Create invitations from a list", icon: "✉️" },
  { label: "Show me all companies", icon: "🏢" },
  { label: "View recent sessions", icon: "👥" },
  { label: "Build a new assessment", icon: "✨" },
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// ============================================================
// Component
// ============================================================

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function AdminChatDrawer({ open, onClose }: Props) {
  const navigate = useNavigate();

  // --- Core state ---
  const [messages, setMessages] = useState<AdminChatMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [toolEvents, setToolEvents] = useState<ToolEvent[]>([]);

  // --- UI state ---
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  // --- Refs ---
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const dragCounterRef = useRef(0);

  // ============================================================
  // Effects
  // ============================================================

  // Auto-scroll on new messages
  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isThinking, open]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

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
      const result: { text: string; toolCalls: ToolCallRecord[] } =
        await adminChatStream(recentMessages, onEvent, attachments.length > 0 ? attachments : undefined);

      const aiMsg: AdminChatMessage = {
        role: "assistant",
        content: result.text,
        timestamp: new Date().toISOString(),
        toolCalls: result.toolCalls.length > 0 ? result.toolCalls : undefined,
      };
      setMessages([...newMessages, aiMsg]);

      // Clear attachments after first send
      if (attachments.length > 0) setAttachments([]);
    } catch (err) {
      console.error("Chat error:", err);
      if ((err as Error)?.message === "Unauthorized") {
        navigate("/admin");
        return;
      }
      setMessages([
        ...newMessages,
        { role: "assistant", content: "Something went wrong. Please try again.", timestamp: new Date().toISOString() },
      ]);
    } finally {
      setIsThinking(false);
      setToolEvents([]);
    }
  };

  // ============================================================
  // Render
  // ============================================================

  const lastAssistantIdx = messages.reduce((acc, msg, i) => (msg.role === "assistant" ? i : acc), -1);

  return (
    <>
      {/* Mobile backdrop only */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
          onClick={onClose}
        />
      )}

      {/* Drawer — mobile: fixed overlay, desktop: inline flex item that pushes content */}
      <div
        className={`
          fixed top-0 right-0 z-50 h-full w-full sm:w-[440px]
          md:static md:z-auto md:h-auto md:w-auto
          ${open ? "md:min-w-[440px] md:max-w-[440px]" : "md:min-w-0 md:max-w-0"}
          transition-all duration-300 ease-in-out
          ${open ? "translate-x-0" : "translate-x-full md:translate-x-0"}
          md:overflow-hidden
        `}
      >
        <div
          className="h-full w-full sm:w-[440px] md:w-[440px] bg-[#0c0c16] border-l border-white/[0.06] flex flex-col shadow-2xl shadow-black/40 md:shadow-none"
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 border border-white/10 flex items-center justify-center">
              <span className="text-sm">🤖</span>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white/80">Admin Assistant</h2>
              <p className="text-[10px] text-white/30">AI-powered admin tools</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition-all"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Drag overlay */}
        {isDragging && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm border-2 border-dashed border-purple-400/50 rounded-xl pointer-events-none">
            <div className="text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center mx-auto">
                <svg className="w-7 h-7 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
              </div>
              <p className="text-purple-300 font-medium text-sm">Drop files to attach</p>
              <p className="text-white/30 text-xs">{ALLOWED_EXTENSIONS.join(", ")} — max {formatFileSize(MAX_FILE_SIZE)}</p>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="space-y-3">
            {/* Welcome state */}
            {messages.length === 0 && (
              <div className="text-center py-6 space-y-5">
                <p className="text-white/40 text-xs leading-relaxed px-2">
                  Manage invitations, look up companies, view sessions, and more.
                  Paste a CSV, drop a file, or pick a quick action.
                </p>

                {/* File drop zone */}
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-white/10 hover:border-purple-500/30 rounded-xl p-4 cursor-pointer transition-all hover:bg-purple-500/5 group"
                >
                  <div className="space-y-1.5">
                    <svg className="w-6 h-6 text-white/20 group-hover:text-purple-400/60 mx-auto transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                    <p className="text-xs text-white/40 group-hover:text-white/60 transition-colors">
                      Drop CSV or files here
                    </p>
                    <p className="text-[10px] text-white/20">
                      {ALLOWED_EXTENSIONS.map((e) => `.${e}`).join("  ")}
                    </p>
                  </div>
                </div>

                {/* Quick actions */}
                <div className="grid grid-cols-2 gap-1.5">
                  {QUICK_ACTIONS.map((action) => (
                    <button
                      key={action.label}
                      onClick={() => handleSend(action.label)}
                      className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-white/50 hover:bg-white/[0.07] hover:text-white/80 hover:border-white/20 transition-all text-left"
                    >
                      <span className="text-sm shrink-0">{action.icon}</span>
                      <span className="text-[11px] leading-tight">{action.label}</span>
                    </button>
                  ))}
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
        <div className="border-t border-white/[0.06] shrink-0">
          {/* Attached files bar */}
          {attachments.length > 0 && (
            <div className="px-4 pt-2.5 pb-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-white/25 uppercase tracking-wider">Attached:</span>
                {attachments.map((att, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-500/10 border border-purple-500/20 text-purple-300 text-[11px]"
                  >
                    <span className="truncate max-w-[100px]">{att.filename}</span>
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
          )}

          {/* Chat input */}
          <div className="px-4 py-3">
            <div className="flex gap-2 items-end">
              {/* File upload button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-2.5 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.08] rounded-lg text-white/30 hover:text-white/60 transition-all shrink-0"
                title="Attach files"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                </svg>
              </button>
              <div className="flex-1">
                <ChatInput
                  onSend={handleSend}
                  disabled={isThinking}
                  placeholder="Ask anything..."
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
    </>
  );
}
