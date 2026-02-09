import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../lib/api";
import ChatMessage from "../components/admin/ChatMessage";
import ChatInput from "../components/admin/ChatInput";
import type { AdminChatMessage } from "../lib/types";

export default function AdminChatPage() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<AdminChatMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/admin/verify`, { credentials: "include" })
      .then((res) => {
        if (!res.ok) navigate("/admin");
        else setAuthenticated(true);
      })
      .catch(() => navigate("/admin"));
  }, [navigate]);

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

    try {
      const res = await fetch(`${API_BASE}/api/admin/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ messages: newMessages }),
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

  const handleLogout = () => {
    fetch(`${API_BASE}/api/admin/logout`, { method: "POST", credentials: "include" }).finally(() => {
      navigate("/admin");
    });
  };

  if (!authenticated) return null;

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-white/5 px-6 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <img src="/hmn_logo.png" alt="HMN" className="h-7 w-auto" />
          <span className="font-semibold text-white/90">Admin</span>
          <span className="text-white/20">|</span>
          <span className="text-white/40 text-sm">Assessment Management</span>
        </div>
        <div className="flex items-center gap-4">
          <a href="/" className="text-white/30 hover:text-white/50 text-sm transition-colors">View Site</a>
          <button onClick={handleLogout} className="text-white/30 hover:text-white/50 text-sm transition-colors">Logout</button>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-20 space-y-6">
              <div className="text-4xl">🎛️</div>
              <div className="space-y-2">
                <h2 className="text-xl font-semibold text-white">HMN Admin Console</h2>
                <p className="text-white/40 text-sm max-w-md mx-auto">
                  Manage assessments, view session data, and generate analytics through conversation.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 justify-center max-w-lg mx-auto">
                {[
                  "List all assessments",
                  "Show me session stats",
                  "Create a new assessment",
                  "Export completed sessions",
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => handleSend(suggestion)}
                    className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/50 text-sm hover:bg-white/10 hover:text-white/70 transition-all"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <ChatMessage key={i} role={msg.role} content={msg.content} />
          ))}

          {isThinking && (
            <div className="flex justify-start">
              <div className="bg-white/[0.07] rounded-2xl px-4 py-3 border border-white/10">
                <div className="flex gap-1.5">
                  <span className="w-2 h-2 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-white/5 px-6 py-4 flex-shrink-0">
        <div className="max-w-3xl mx-auto">
          <ChatInput onSend={handleSend} disabled={isThinking} />
        </div>
      </div>
    </div>
  );
}
