import { useState, useEffect, useRef } from "react";
import type { ToolEvent } from "../../lib/types";

interface Props {
  events: ToolEvent[];
}

const TOOL_ICONS: Record<string, string> = {
  create_assessment: "🏗",
  update_assessment: "✏️",
  add_question: "➕",
  update_question: "🔧",
  remove_question: "🗑",
  list_assessments: "📋",
  get_assessment: "📖",
  duplicate_assessment: "📑",
  archive_assessment: "📦",
  list_sessions: "📊",
  get_session: "🔍",
  delete_session: "🗑",
  get_stats: "📈",
  export_sessions: "💾",
  get_dimension_averages: "📐",
  get_completion_funnel: "🔬",
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
        <div className="bg-white/[0.05] rounded-2xl rounded-bl-md border border-white/[0.08] overflow-hidden">
          {/* Header — always visible */}
          <button
            onClick={() => setExpanded((e) => !e)}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors"
          >
            {/* Pulsing indicator */}
            <div className="relative flex-shrink-0">
              <div className="w-2.5 h-2.5 rounded-full bg-purple-400 animate-pulse" />
              <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-purple-400/50 animate-ping" />
            </div>

            {/* Status text */}
            <div className="flex-1 text-left">
              <span className="text-sm text-white/70 font-medium">
                {totalCount === 0 ? thinkingMessage : `Building... ${completedCount}/${totalCount} steps`}
              </span>
              {totalCount > 0 && (
                <span className="text-xs text-white/30 ml-2">
                  {completedCount === totalCount ? "finishing up" : steps.find((s) => s.status === "running")?.displayName || "working"}
                </span>
              )}
            </div>

            {/* Chevron */}
            <svg
              className={`w-4 h-4 text-white/30 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
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
            <div className="border-t border-white/[0.06] px-4 py-2 space-y-1">
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
                      <svg className="w-4 h-4 text-purple-400 animate-spin" fill="none" viewBox="0 0 24 24">
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
                  <span className="text-xs flex-shrink-0">{TOOL_ICONS[step.name] || "⚙️"}</span>

                  {/* Label */}
                  <span className={`text-xs flex-1 ${
                    step.status === "running" ? "text-white/60" :
                    step.status === "done" ? "text-white/40" :
                    "text-red-400/60"
                  }`}>
                    {step.status === "done" && step.summary ? step.summary : step.displayName}
                  </span>

                  {/* Duration badge */}
                  {step.endTime && (
                    <span className="text-[10px] text-white/20 tabular-nums flex-shrink-0">
                      {((step.endTime - step.startTime) / 1000).toFixed(1)}s
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Progress bar */}
          {totalCount > 0 && (
            <div className="h-0.5 bg-white/[0.04]">
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-500 ease-out"
                style={{ width: `${(completedCount / totalCount) * 100}%` }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
