import { useState, useEffect, useRef, useCallback } from "react";
import Vapi from "@vapi-ai/web";
import { API_BASE } from "../../lib/api";

interface VapiVoiceAgentProps {
  sessionId: string;
  currentQuestionId: string;
  onTranscriptComplete: (transcript: string) => void;
  onCallStateChange?: (isActive: boolean) => void;
}

type CallStatus = "idle" | "connecting" | "active" | "ending";

interface TranscriptEntry {
  role: "user" | "assistant";
  text: string;
  timestamp: number;
}

export default function VapiVoiceAgent({
  sessionId,
  currentQuestionId,
  onTranscriptComplete,
  onCallStateChange,
}: VapiVoiceAgentProps) {
  const [callStatus, setCallStatus] = useState<CallStatus>("idle");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  const [currentSpeech, setCurrentSpeech] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);

  const vapiRef = useRef<Vapi | null>(null);
  const transcriptsRef = useRef<TranscriptEntry[]>([]);

  // Initialize Vapi instance
  useEffect(() => {
    const publicKey = import.meta.env.VITE_VAPI_PUBLIC_KEY;
    if (!publicKey) {
      setError("Vapi public key not configured");
      return;
    }

    const vapi = new Vapi(publicKey);
    vapiRef.current = vapi;

    vapi.on("call-start", () => {
      setCallStatus("active");
      setError(null);
      onCallStateChange?.(true);
    });

    vapi.on("call-end", () => {
      setCallStatus("idle");
      setIsSpeaking(false);
      setVolumeLevel(0);
      setCurrentSpeech("");
      onCallStateChange?.(false);

      // Collect all user transcripts as the final answer
      const userTranscripts = transcriptsRef.current
        .filter((t) => t.role === "user")
        .map((t) => t.text)
        .join("\n");

      if (userTranscripts.trim()) {
        onTranscriptComplete(userTranscripts);
      }

      transcriptsRef.current = [];
      setTranscripts([]);
    });

    vapi.on("speech-start", () => setIsSpeaking(true));
    vapi.on("speech-end", () => setIsSpeaking(false));
    vapi.on("volume-level", (level: number) => setVolumeLevel(level));

    vapi.on("message", (message: Record<string, unknown>) => {
      if (message.type === "transcript") {
        const role = message.role as "user" | "assistant";
        const transcriptType = message.transcriptType as string;
        const transcript = message.transcript as string;

        if (transcriptType === "final") {
          const entry: TranscriptEntry = { role, text: transcript, timestamp: Date.now() };
          transcriptsRef.current.push(entry);
          setTranscripts((prev) => [...prev, entry]);
          setCurrentSpeech("");
        } else if (transcriptType === "partial") {
          setCurrentSpeech(transcript);
        }
      }
    });

    vapi.on("error", (err: Record<string, unknown>) => {
      console.error("Vapi error:", err);
      setError("Voice connection error. Try again.");
      setCallStatus("idle");
      onCallStateChange?.(false);
    });

    return () => {
      vapi.stop();
      vapiRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset transcripts when question changes
  useEffect(() => {
    transcriptsRef.current = [];
    setTranscripts([]);
    setCurrentSpeech("");
    setError(null);
  }, [currentQuestionId]);

  const startCall = useCallback(async () => {
    if (!vapiRef.current) return;

    setCallStatus("connecting");
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/vapi/context`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, questionId: currentQuestionId }),
      });

      if (!res.ok) throw new Error("Failed to load voice context");

      const context = await res.json();

      await vapiRef.current.start({
        name: "Kascade - HMN Cascade",
        firstMessage: context.firstMessage,
        model: {
          provider: "anthropic",
          model: "claude-sonnet-4-6",
          messages: [{ role: "system", content: context.systemPrompt }],
        },
        voice: {
          provider: "11labs",
          voiceId: "uju3wxzG5OhpWcoi3SMy",
          stability: 0.55,
          similarityBoost: 0.8,
          speed: 0.9,
        },
        silenceTimeoutSeconds: 30,
        maxDurationSeconds: 300,
        backgroundDenoisingEnabled: true,
        modelOutputInMessagesEnabled: true,
      } as Record<string, unknown>);
    } catch (err) {
      console.error("Failed to start Vapi call:", err);
      setError("Couldn't connect to voice. Check your connection and try again.");
      setCallStatus("idle");
      onCallStateChange?.(false);
    }
  }, [sessionId, currentQuestionId, onCallStateChange]);

  const endCall = useCallback(() => {
    if (!vapiRef.current) return;
    setCallStatus("ending");
    vapiRef.current.stop();
  }, []);

  const toggleCall = useCallback(() => {
    if (callStatus === "idle") startCall();
    else if (callStatus === "active") endCall();
  }, [callStatus, startCall, endCall]);

  const ringScale = 1 + volumeLevel * 0.4;
  const ringOpacity = 0.15 + volumeLevel * 0.3;

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Live transcript panel */}
      {callStatus === "active" && showTranscript && (
        <div className="w-full max-w-sm bg-[#12121a]/95 backdrop-blur-xl border border-border rounded-2xl p-4 max-h-48 overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Live Transcript</span>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-xs text-green-400">Live</span>
            </div>
          </div>
          <div className="space-y-2">
            {transcripts.map((t, i) => (
              <div
                key={i}
                className={`text-sm ${
                  t.role === "user"
                    ? "text-blue-300 pl-4 border-l-2 border-blue-500/30"
                    : "text-foreground/80 pl-4 border-l-2 border-purple-500/30"
                }`}
              >
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 block mb-0.5">
                  {t.role === "user" ? "You" : "Kascade"}
                </span>
                {t.text}
              </div>
            ))}
            {currentSpeech && (
              <div className="text-sm text-muted-foreground italic pl-4 border-l-2 border-border">
                {currentSpeech}...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Status label */}
      {callStatus !== "idle" && (
        <div className="text-center">
          <span className="text-sm text-muted-foreground">
            {callStatus === "connecting" && "Connecting to Kascade..."}
            {callStatus === "active" && (isSpeaking ? "Kascade is speaking..." : "Listening...")}
            {callStatus === "ending" && "Wrapping up..."}
          </span>
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-3">
        {/* Transcript toggle */}
        {callStatus === "active" && (
          <button
            onClick={() => setShowTranscript(!showTranscript)}
            className="w-10 h-10 rounded-full bg-muted border border-border flex items-center justify-center hover:bg-muted transition-all"
            title={showTranscript ? "Hide transcript" : "Show transcript"}
          >
            <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
          </button>
        )}

        {/* Main voice button */}
        <div className="relative">
          {callStatus === "active" && (
            <>
              <span
                className="absolute inset-0 rounded-full transition-transform duration-150"
                style={{
                  transform: `scale(${ringScale + 0.2})`,
                  background: isSpeaking
                    ? `radial-gradient(circle, rgba(168, 85, 247, ${ringOpacity}) 0%, transparent 70%)`
                    : `radial-gradient(circle, rgba(59, 130, 246, ${ringOpacity}) 0%, transparent 70%)`,
                }}
              />
              <span
                className="absolute inset-0 rounded-full transition-transform duration-150"
                style={{
                  transform: `scale(${ringScale})`,
                  background: isSpeaking
                    ? `radial-gradient(circle, rgba(168, 85, 247, ${ringOpacity * 0.6}) 0%, transparent 60%)`
                    : `radial-gradient(circle, rgba(59, 130, 246, ${ringOpacity * 0.6}) 0%, transparent 60%)`,
                }}
              />
            </>
          )}

          {callStatus === "connecting" && (
            <span className="absolute inset-0 rounded-full bg-purple-500/20 animate-ping" />
          )}

          <button
            onClick={toggleCall}
            disabled={callStatus === "connecting" || callStatus === "ending"}
            className={`relative w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg
              ${
                callStatus === "active"
                  ? isSpeaking
                    ? "bg-gradient-to-br from-purple-500 to-purple-700 shadow-purple-500/40"
                    : "bg-gradient-to-br from-blue-500 to-blue-700 shadow-blue-500/40"
                  : callStatus === "connecting"
                    ? "bg-gradient-to-br from-purple-600 to-purple-800 shadow-purple-500/30 animate-pulse"
                    : "bg-gradient-to-br from-purple-600 to-blue-600 shadow-purple-500/20 hover:shadow-purple-500/40 hover:scale-105"
              }
              ${callStatus === "connecting" || callStatus === "ending" ? "cursor-wait" : "cursor-pointer"}
            `}
            title={callStatus === "idle" ? "Talk to Kascade" : "End call"}
          >
            {callStatus === "idle" ? (
              <svg className="w-7 h-7 text-foreground" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                <circle cx="19" cy="5" r="1.5" className="animate-pulse" opacity="0.8" />
                <circle cx="20.5" cy="3" r="0.8" className="animate-pulse" opacity="0.6" />
              </svg>
            ) : callStatus === "connecting" ? (
              <svg className="animate-spin h-7 w-7 text-foreground" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : callStatus === "active" ? (
              <div className="flex items-center gap-[3px]">
                {[0, 1, 2, 3, 4].map((i) => (
                  <span
                    key={i}
                    className="w-[3px] rounded-full bg-white transition-all duration-150"
                    style={{
                      height: isSpeaking
                        ? `${10 + Math.sin(Date.now() / 200 + i * 1.2) * 8 + volumeLevel * 12}px`
                        : `${6 + volumeLevel * 16}px`,
                      opacity: 0.7 + volumeLevel * 0.3,
                    }}
                  />
                ))}
              </div>
            ) : (
              <div className="w-5 h-5 rounded-sm bg-white/80" />
            )}
          </button>

          {callStatus === "idle" && (
            <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap">
              <span className="text-[11px] text-muted-foreground font-medium">Talk to Kascade</span>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2 max-w-xs">
          <p className="text-red-400 text-xs">{error}</p>
        </div>
      )}
    </div>
  );
}
