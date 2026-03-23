import { useState, useEffect, useRef, type JSX } from "react";
import type { ToolEvent } from "../../lib/types";

interface Props {
  events: ToolEvent[];
}

const TOOL_ICONS: Record<string, (props: { className?: string }) => JSX.Element> = {
  create_assessment: ({ className }) => <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" /></svg>,
  update_assessment: ({ className }) => <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></svg>,
  add_question: ({ className }) => <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>,
  update_question: ({ className }) => <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" /></svg>,
  remove_question: ({ className }) => <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>,
  list_assessments: ({ className }) => <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>,
  get_assessment: ({ className }) => <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" /></svg>,
  duplicate_assessment: ({ className }) => <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>,
  archive_assessment: ({ className }) => <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8v13H3V8" /><path d="M1 3h22v5H1z" /><path d="M10 12h4" /></svg>,
  list_sessions: ({ className }) => <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 20V10M12 20V4M6 20v-6" /></svg>,
  get_session: ({ className }) => <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>,
  delete_session: ({ className }) => <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>,
  get_stats: ({ className }) => <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 6l-9.5 9.5-5-5L1 18" /><path d="M17 6h6v6" /></svg>,
  export_sessions: ({ className }) => <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></svg>,
  get_dimension_averages: ({ className }) => <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21.7 2.3a1 1 0 00-1.4 0L2.3 20.3a1 1 0 000 1.4l.7.7a1 1 0 001.4 0L22.4 4.4a1 1 0 000-1.4l-.7-.7z" /><path d="M18.5 5.5l-2 2M14.5 9.5l-2 2M10.5 13.5l-2 2M6.5 17.5l-2 2" /></svg>,
  get_completion_funnel: ({ className }) => <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 18h8" /><path d="M3 22h18" /><path d="M14 22a7 7 0 100-14h-1" /><path d="M9 14h2" /><path d="M9 12a2 2 0 01-2-2V6h6v4a2 2 0 01-2 2z" /><path d="M12 6V3a1 1 0 00-1-1H8a1 1 0 00-1 1v3" /></svg>,
};

interface ToolStep {
  name: string;
  displayName: string;
  status: "running" | "done" | "error";
  summary?: string;
  startTime: number;
  endTime?: number;
}

export default function ToolActivity({ events }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [steps, setSteps] = useState<ToolStep[]>([]);
  const [thinkingMessage, setThinkingMessage] = useState("Analyzing...");
  const hasAutoExpanded = useRef(false);

  useEffect(() => {
    const newSteps: ToolStep[] = [];
    let lastThinking = "Analyzing...";

    for (const event of events) {
      if (event.type === "thinking") {
        lastThinking = event.message;
      } else if (event.type === "tool_start") {
        newSteps.push({
          name: event.name,
          displayName: event.displayName,
          status: "running",
          startTime: Date.now(),
        });
        if (!hasAutoExpanded.current) {
          hasAutoExpanded.current = true;
          setExpanded(true);
        }
      } else if (event.type === "tool_result") {
        const existing = [...newSteps].reverse().find((s) => s.name === event.name && s.status === "running");
        if (existing) {
          existing.status = event.success ? "done" : "error";
          existing.summary = event.summary;
          existing.endTime = Date.now();
        }
      }
    }

    setSteps(newSteps);
    setThinkingMessage(lastThinking);
  }, [events]);

  const completedCount = steps.filter((s) => s.status === "done").length;
  const totalCount = steps.length;

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] w-full">
        <div className="bg-muted rounded-2xl rounded-bl-md border border-border overflow-hidden">
          {/* Header — always visible */}
          <button
            onClick={() => setExpanded((e) => !e)}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors"
          >
            {/* Pulsing indicator */}
            <div className="relative flex-shrink-0">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-pulse" />
              <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-blue-400/50 animate-ping" />
            </div>

            {/* Status text */}
            <div className="flex-1 text-left">
              <span className="text-sm text-foreground/80 font-medium">
                {totalCount === 0 ? thinkingMessage : `Building... ${completedCount}/${totalCount} steps`}
              </span>
              {totalCount > 0 && (
                <span className="text-xs text-muted-foreground ml-2">
                  {completedCount === totalCount ? "finishing up" : steps.find((s) => s.status === "running")?.displayName || "working"}
                </span>
              )}
            </div>

            {/* Chevron */}
            <svg
              className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </button>

          {/* Expanded tool list */}
          {expanded && steps.length > 0 && (
            <div className="border-t border-border px-4 py-2 space-y-1">
              {steps.map((step, i) => (
                <div
                  key={`${step.name}-${i}`}
                  className={`flex items-center gap-2.5 py-1.5 transition-all ${
                    step.status === "running" ? "animate-in slide-in-from-left-2 duration-300" : ""
                  }`}
                >
                  {/* Status icon */}
                  <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                    {step.status === "running" ? (
                      <svg className="w-4 h-4 text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : step.status === "done" ? (
                      <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                  </div>

                  {/* Tool icon */}
                  <span className="text-xs flex-shrink-0 flex items-center text-muted-foreground">
                    {TOOL_ICONS[step.name]
                      ? TOOL_ICONS[step.name]({})
                      : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></svg>
                    }
                  </span>

                  {/* Label */}
                  <span className={`text-xs flex-1 ${
                    step.status === "running" ? "text-muted-foreground" :
                    step.status === "done" ? "text-muted-foreground" :
                    "text-red-400/60"
                  }`}>
                    {step.status === "done" && step.summary ? step.summary : step.displayName}
                  </span>

                  {/* Duration badge */}
                  {step.endTime && (
                    <span className="text-[10px] text-muted-foreground tabular-nums flex-shrink-0">
                      {((step.endTime - step.startTime) / 1000).toFixed(1)}s
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Progress bar */}
          {totalCount > 0 && (
            <div className="h-0.5 bg-foreground/[0.04]">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all duration-500 ease-out"
                style={{ width: `${(completedCount / totalCount) * 100}%` }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
