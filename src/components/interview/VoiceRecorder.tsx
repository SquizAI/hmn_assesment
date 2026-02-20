import { useState, useRef, useCallback, useEffect } from "react";
import { API_BASE } from "../../lib/api";

interface VoiceRecorderProps {
  onTranscription: (text: string) => void;
  onPartialTranscription?: (text: string) => void;
  onRecordingStateChange?: (isRecording: boolean) => void;
  hideIdleStatus?: boolean;
  hideTranscriptionPreview?: boolean;
}

export default function VoiceRecorder({ onTranscription, onPartialTranscription, onRecordingStateChange, hideIdleStatus, hideTranscriptionPreview }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [partialText, setPartialText] = useState("");
  const [finalText, setFinalText] = useState("");
  const [audioLevels, setAudioLevels] = useState<number[]>(new Array(32).fill(0));

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const accumulatedRef = useRef<string>("");

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  const cleanup = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.close();
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    if (audioContextRef.current?.state !== "closed") audioContextRef.current?.close();
  };

  const updateAudioLevels = useCallback(() => {
    if (!analyserRef.current) return;
    const data = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(data);

    // Sample 32 bars from the frequency data
    const bars = 32;
    const step = Math.floor(data.length / bars);
    const levels: number[] = [];
    for (let i = 0; i < bars; i++) {
      let sum = 0;
      for (let j = 0; j < step; j++) {
        sum += data[i * step + j];
      }
      levels.push(sum / step / 255);
    }
    setAudioLevels(levels);
    animFrameRef.current = requestAnimationFrame(updateAudioLevels);
  }, []);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      setPartialText("");
      setFinalText("");
      accumulatedRef.current = "";

      // Get Deepgram token
      const tokenRes = await fetch(`${API_BASE}/api/deepgram-token`);
      const { token } = await tokenRes.json();

      // Get mic stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 },
      });
      streamRef.current = stream;

      // Set up Web Audio API for visualization
      const audioCtx = new AudioContext();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Start visualization loop
      animFrameRef.current = requestAnimationFrame(updateAudioLevels);

      // Connect to Deepgram WebSocket for live transcription
      const ws = new WebSocket(
        `wss://api.deepgram.com/v1/listen?model=nova-3&language=en&smart_format=true&punctuate=true&interim_results=true&utterance_end_ms=1500`,
        ["token", token]
      );
      wsRef.current = ws;

      ws.onopen = () => {
        // Start MediaRecorder to send audio chunks to Deepgram
        const mr = new MediaRecorder(stream, {
          mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm",
        });

        mr.ondataavailable = (e) => {
          if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
            ws.send(e.data);
          }
        };

        mediaRecorderRef.current = mr;
        mr.start(250); // Send chunks every 250ms for responsive transcription
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "Results") {
          const transcript = data.channel?.alternatives?.[0]?.transcript || "";
          const isFinal = data.is_final;

          if (isFinal && transcript) {
            accumulatedRef.current += (accumulatedRef.current ? " " : "") + transcript;
            setFinalText(accumulatedRef.current);
            setPartialText("");
            onPartialTranscription?.(accumulatedRef.current);
          } else if (transcript) {
            setPartialText(transcript);
            onPartialTranscription?.(accumulatedRef.current + (accumulatedRef.current ? " " : "") + transcript);
          }
        }
      };

      ws.onerror = () => {
        setError("Live transcription connection failed. Recording will still work.");
      };

      ws.onclose = () => {
        // When WS closes, finalize
        if (accumulatedRef.current) {
          setFinalText(accumulatedRef.current);
        }
      };

      setIsRecording(true);
      setDuration(0);
      onRecordingStateChange?.(true);
      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
    } catch {
      setError("Microphone access denied. Please allow microphone access.");
    }
  }, [onRecordingStateChange, onPartialTranscription, updateAudioLevels]);

  const stopRecording = useCallback(() => {
    // Stop MediaRecorder
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }

    // Close WebSocket
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "CloseStream" }));
      wsRef.current.close();
    }

    // Stop audio viz
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setAudioLevels(new Array(32).fill(0));

    // Stop stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    // Close audio context
    if (audioContextRef.current?.state !== "closed") {
      audioContextRef.current?.close();
    }

    setIsRecording(false);
    onRecordingStateChange?.(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }

    // Read accumulated transcription directly from ref (avoids stale state and
    // the anti-pattern of calling side-effects inside a state updater)
    const fullText = accumulatedRef.current.trim();
    if (fullText) {
      setFinalText(fullText);
      onTranscription(fullText);
    }
  }, [onRecordingStateChange, onTranscription]);

  // Spacebar hotkey to toggle recording (must be after startRecording/stopRecording definitions)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.code === "Space" && !isTranscribing) {
        e.preventDefault();
        if (isRecording) stopRecording();
        else startRecording();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isRecording, isTranscribing, startRecording, stopRecording]);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  return (
    <div className="flex flex-col items-center gap-5">
      {/* Audio Waveform Visualization */}
      <div className="flex items-end gap-[2px] h-16 w-full max-w-sm justify-center">
        {audioLevels.map((level, i) => (
          <div
            key={i}
            className="w-[6px] rounded-full transition-all duration-75"
            style={{
              height: `${Math.max(3, level * 64)}px`,
              backgroundColor: isRecording
                ? `hsl(${220 + level * 120}, 80%, ${50 + level * 30}%)`
                : "rgba(255,255,255,0.1)",
              opacity: isRecording ? 0.6 + level * 0.4 : 0.3,
            }}
          />
        ))}
      </div>

      {/* Record Button */}
      <button
        onClick={isRecording ? stopRecording : startRecording}
        disabled={isTranscribing}
        className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300
          ${isRecording
            ? "bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/30"
            : isTranscribing
            ? "bg-white/20 cursor-not-allowed"
            : "bg-white/10 hover:bg-white/20 border-2 border-white/30 hover:border-white/50"
          }`}
      >
        {isTranscribing ? (
          <svg className="animate-spin h-8 w-8 text-white" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        ) : isRecording ? (
          <div className="w-6 h-6 rounded-sm bg-white" />
        ) : (
          <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
          </svg>
        )}
        {isRecording && <span className="absolute inset-0 rounded-full bg-red-500/20 animate-ping" style={{ animationDuration: "2s" }} />}
      </button>

      {/* Status */}
      {(isTranscribing || isRecording || !hideIdleStatus) && (
        <div className="text-center">
          {isTranscribing ? (
            <p className="text-white/60 text-sm">Finalizing transcription...</p>
          ) : isRecording ? (
            <>
              <p className="text-red-400 text-sm font-medium">Recording {fmt(duration)}</p>
              <p className="text-white/40 text-xs mt-1">Tap or press Space to stop</p>
            </>
          ) : (
            <>
              <p className="text-white/50 text-sm font-medium">Tap or press Space to speak</p>
              <p className="text-white/30 text-xs mt-1">Live transcription as you talk</p>
            </>
          )}
        </div>
      )}

      {/* Live Transcription Preview */}
      {!hideTranscriptionPreview && (finalText || partialText) && (
        <div className="w-full max-w-sm bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm">
          <p className="text-white/30 text-xs mb-1 uppercase tracking-wider">Live transcription</p>
          <p className="text-white/80 leading-relaxed">
            {finalText}
            {partialText && <span className="text-white/40 italic"> {partialText}</span>}
            {isRecording && <span className="inline-block w-0.5 h-4 bg-white/60 ml-0.5 animate-pulse align-text-bottom" />}
          </p>
        </div>
      )}

      {error && <p className="text-red-400 text-sm text-center max-w-xs">{error}</p>}
    </div>
  );
}
