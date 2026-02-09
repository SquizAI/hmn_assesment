import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../lib/api";
import ChatMessage from "../components/admin/ChatMessage";
import ChatInput from "../components/admin/ChatInput";
import type { AdminChatMessage } from "../lib/types";

const QUICK_ACTIONS = [
  { label: "List all assessments", icon: "📋" },
  { label: "Show me session stats", icon: "📊" },
  { label: "Create a new assessment", icon: "✨" },
  { label: "Show recent sessions", icon: "👥" },
  { label: "Export completed sessions", icon: "📤" },
  { label: "Show dimension averages", icon: "📈" },
];

export default function AdminChatPage() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<AdminChatMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  const handleSend = async (text: string) => {
    const userMsg: AdminChatMessage = {
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setIsThinking(true);

    // Truncate to the last 20 messages to prevent unbounded context growth
    const recentMessages = newMessages.length > 20
      ? newMessages.slice(-20)
      : newMessages;

    try {
      const res = await fetch(`${API_BASE}/api/admin/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ messages: recentMessages }),
      });

      if (!res.ok) {
        if (res.status === 401) {
          navigate("/admin");
          return;
        }
        throw new Error("Chat request failed");
      }

      const data = await res.json();
      const aiMsg: AdminChatMessage = {
        role: "assistant",
        content: data.response,
        timestamp: new Date().toISOString(),
      };
      setMessages([...newMessages, aiMsg]);
    } catch (err) {
      console.error("Chat error:", err);
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
    <div className="h-full flex flex-col">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-16 space-y-8">
              <div className="space-y-3">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-white/10">
                  <span className="text-3xl">🤖</span>
                </div>
                <h2 className="text-xl font-semibold text-white">Cascade AI Assistant</h2>
                <p className="text-white/40 text-sm max-w-md mx-auto leading-relaxed">
                  Manage assessments, analyze sessions, create new diagnostics, and generate reports — all through conversation.
                </p>
              </div>
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
                    <span className="w-1.5 h-1.5 bg-blue-400/60 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 bg-blue-400/60 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 bg-blue-400/60 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                  <span className="text-xs text-white/30 ml-1">Thinking...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-white/5 px-6 py-4 shrink-0">
        <div className="max-w-3xl mx-auto">
          <ChatInput onSend={handleSend} disabled={isThinking} />
        </div>
      </div>
    </div>
  );
}
