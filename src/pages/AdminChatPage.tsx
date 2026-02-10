import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import ChatMessage from "../components/admin/ChatMessage";
import ChatInput from "../components/admin/ChatInput";
import { adminChat } from "../lib/admin-api";
import type { ChatAttachment } from "../lib/admin-api";
import type { AdminChatMessage } from "../lib/types";

const ALLOWED_EXTENSIONS = ["md", "txt", "json", "csv", "yaml", "yml"];
const MAX_FILE_SIZE = 500_000; // 500KB
const MAX_FILES = 5;

const QUICK_ACTIONS = [
  { label: "Build assessment from my uploaded file", icon: "📄" },
  { label: "Create a quick 10-question assessment", icon: "✨" },
  { label: "Help me design scoring dimensions", icon: "📐" },
  { label: "Import and adapt an existing framework", icon: "🔄" },
  { label: "List all existing assessments", icon: "📋" },
  { label: "Show session analytics", icon: "📊" },
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export default function AdminChatPage() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<AdminChatMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const dragCounterRef = useRef(0);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  // ---- File handling ----

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

  // ---- Drag and drop ----

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

  // ---- Chat ----

  const handleSend = async (text: string) => {
    const userMsg: AdminChatMessage = {
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setIsThinking(true);

    const recentMessages = newMessages.length > 20 ? newMessages.slice(-20) : newMessages;

    try {
      const data = await adminChat(recentMessages, attachments.length > 0 ? attachments : undefined);
      const aiMsg: AdminChatMessage = {
        role: "assistant",
        content: data.response,
        timestamp: new Date().toISOString(),
      };
      setMessages([...newMessages, aiMsg]);
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
    }
  };

  const lastAssistantIdx = messages.reduce((acc, msg, i) => (msg.role === "assistant" ? i : acc), -1);

  return (
    <div
      className="h-full flex flex-col relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
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
            <p className="text-white/30 text-xs">{ALLOWED_EXTENSIONS.join(", ")} — max {formatFileSize(MAX_FILE_SIZE)}</p>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-12 space-y-8">
              <div className="space-y-3">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 border border-white/10">
                  <span className="text-3xl">🏗</span>
                </div>
                <h2 className="text-xl font-semibold text-white">Assessment Builder</h2>
                <p className="text-white/40 text-sm max-w-md mx-auto leading-relaxed">
                  Upload your content, describe what you want, and I'll build a complete assessment.
                  Drop files from Codex, paste frameworks, or just describe the assessment you need.
                </p>
              </div>

              {/* File drop zone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="max-w-md mx-auto border-2 border-dashed border-white/10 hover:border-purple-500/30 rounded-2xl p-8 cursor-pointer transition-all hover:bg-purple-500/5 group"
              >
                <div className="space-y-2">
                  <svg className="w-8 h-8 text-white/20 group-hover:text-purple-400/60 mx-auto transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                  <p className="text-sm text-white/40 group-hover:text-white/60 transition-colors">
                    Drop files here or click to browse
                  </p>
                  <p className="text-[11px] text-white/20">
                    {ALLOWED_EXTENSIONS.map((e) => `.${e}`).join("  ")} — up to {MAX_FILES} files, {formatFileSize(MAX_FILE_SIZE)} each
                  </p>
                </div>
              </div>

              {/* Quick actions */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-w-lg mx-auto">
                {QUICK_ACTIONS.map((action) => (
                  <button
                    key={action.label}
                    onClick={() => handleSend(action.label)}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-white/50 text-sm hover:bg-white/[0.07] hover:text-white/80 hover:border-white/20 transition-all text-left"
                  >
                    <span className="text-base">{action.icon}</span>
                    <span className="text-xs">{action.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <ChatMessage
              key={i}
              role={msg.role}
              content={msg.content}
              onAction={handleSend}
              isLatest={i === lastAssistantIdx && !isThinking}
            />
          ))}

          {isThinking && (
            <div className="flex justify-start">
              <div className="bg-white/[0.05] rounded-2xl rounded-bl-md px-5 py-3.5 border border-white/[0.08]">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-purple-400/60 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 bg-purple-400/60 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 bg-purple-400/60 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                  <span className="text-xs text-white/30 ml-1">Building...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Bottom bar: attachments + input */}
      <div className="border-t border-white/5 shrink-0">
        {/* Attached files bar */}
        {attachments.length > 0 && (
          <div className="px-6 pt-3 pb-0">
            <div className="max-w-3xl mx-auto">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] text-white/25 uppercase tracking-wider">Attached:</span>
                {attachments.map((att, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs"
                  >
                    <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                    <span className="max-w-[140px] truncate">{att.filename}</span>
                    <span className="text-purple-400/40 text-[10px]">
                      {formatFileSize(att.content.length)}
                    </span>
                    <button
                      onClick={() => removeAttachment(i)}
                      className="p-0.5 rounded hover:bg-purple-500/20 text-purple-400/50 hover:text-purple-300 transition-colors"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
                {attachments.length < MAX_FILES && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-white/30 hover:text-white/50 hover:bg-white/5 transition-colors"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    Add file
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Input row */}
        <div className="px-6 py-4">
          <div className="max-w-3xl mx-auto flex items-end gap-2">
            {/* Attach button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="shrink-0 p-2.5 rounded-xl text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors"
              title="Attach files"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
              </svg>
            </button>

            {/* Chat input (flex-1) */}
            <div className="flex-1">
              <ChatInput
                onSend={handleSend}
                disabled={isThinking}
                placeholder={attachments.length > 0
                  ? "Describe the assessment you want to build from these files..."
                  : "Describe an assessment, or attach files first..."
                }
              />
            </div>
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
  );
}
