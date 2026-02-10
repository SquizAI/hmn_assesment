import { useState, type ReactNode, type ReactElement } from "react";
import QuestionEditPopover, { type QuestionData } from "./QuestionEditPopover";
import type { ToolCallRecord } from "../../lib/types";

interface Props {
  role: "user" | "assistant";
  content: string;
  onAction?: (action: string) => void;
  isLatest?: boolean;
  toolCalls?: ToolCallRecord[];
}

/** Detect whether a table row looks like a question (has a q_ or demo_ ID) */
function parseQuestionFromRow(cells: string[]): QuestionData | null {
  if (cells.length < 2) return null;
  const first = cells[0].trim();
  if (!/^(q_|demo_|quest_)\w+/.test(first)) return null;
  return {
    id: first,
    text: cells[1]?.trim() || "",
    inputType: cells.length > 2 ? cells[2]?.trim() : undefined,
    weight: cells.length > 3 ? cells[3]?.trim() : undefined,
    section: cells.length > 4 ? cells[4]?.trim() : undefined,
  };
}

/** Parse ```actions\n...\n``` block from end of message */
function extractActions(text: string): { body: string; actions: string[] } {
  const match = text.match(/```actions\s*\n([\s\S]*?)```\s*$/);
  if (!match) return { body: text, actions: [] };
  const body = text.slice(0, match.index).trimEnd();
  const actions = match[1]
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return { body, actions };
}

export default function ChatMessage({ role, content, onAction, isLatest, toolCalls }: Props) {
  const isUser = role === "user";
  const { body, actions } = isUser ? { body: content, actions: [] } : extractActions(content);
  const [editingQuestion, setEditingQuestion] = useState<QuestionData | null>(null);
  const [toolsExpanded, setToolsExpanded] = useState(false);

  const renderContent = (text: string) => {
    const lines = text.split("\n");
    const elements: ReactElement[] = [];
    let inTable = false;
    let tableRows: string[][] = [];
    let inCodeBlock = false;
    let codeLines: string[] = [];
    let codeLang = "";

    const flushTable = () => {
      if (tableRows.length > 0) {
        // Check if any data rows contain question IDs
        const dataRows = tableRows.slice(2); // skip header + separator
        const hasQuestions = dataRows.some((row) => parseQuestionFromRow(row) !== null);

        elements.push(
          <div key={`table-${elements.length}`} className="overflow-x-auto my-3">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-white/[0.04]">
                  {tableRows[0].map((cell, i) => (
                    <th key={i} className="text-left px-3 py-2 border-b border-white/10 text-white/70 font-semibold text-xs uppercase tracking-wider">{cell.trim()}</th>
                  ))}
                  {hasQuestions && (
                    <th className="w-8 border-b border-white/10" />
                  )}
                </tr>
              </thead>
              <tbody>
                {dataRows.map((row, i) => {
                  const question = parseQuestionFromRow(row);
                  return (
                    <tr
                      key={i}
                      className={`transition-colors ${question ? "hover:bg-purple-500/[0.06] cursor-pointer group" : "hover:bg-white/[0.02]"}`}
                      onClick={question ? () => setEditingQuestion(question) : undefined}
                    >
                      {row.map((cell, j) => (
                        <td key={j} className={`px-3 py-2 border-b border-white/5 ${question ? "text-white/70 group-hover:text-white/90" : "text-white/60"}`}>
                          {cell.trim()}
                        </td>
                      ))}
                      {hasQuestions && (
                        <td className="px-1 py-2 border-b border-white/5">
                          {question && (
                            <svg className="w-3.5 h-3.5 text-purple-400/0 group-hover:text-purple-400/60 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                            </svg>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {hasQuestions && (
              <p className="text-[10px] text-purple-400/40 mt-1 pl-1">Click a question to edit</p>
            )}
          </div>
        );
        tableRows = [];
      }
      inTable = false;
    };

    const flushCode = () => {
      elements.push(
        <div key={`code-${elements.length}`} className="my-3 rounded-lg overflow-hidden">
          <div className="bg-white/[0.06] px-3 py-1.5 text-[10px] text-white/30 uppercase tracking-widest border-b border-white/5">
            {codeLang || "code"}
          </div>
          <pre className="bg-white/[0.03] px-4 py-3 overflow-x-auto text-sm">
            <code className="text-green-300/80 font-mono">{codeLines.join("\n")}</code>
          </pre>
        </div>
      );
      codeLines = [];
      codeLang = "";
      inCodeBlock = false;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Code block toggle
      if (line.trim().startsWith("```")) {
        if (inCodeBlock) {
          flushCode();
          continue;
        } else {
          if (inTable) flushTable();
          inCodeBlock = true;
          codeLang = line.trim().slice(3).trim();
          continue;
        }
      }
      if (inCodeBlock) {
        codeLines.push(line);
        continue;
      }

      // Table detection
      if (line.includes("|") && line.trim().startsWith("|")) {
        if (!inTable) inTable = true;
        tableRows.push(line.split("|").filter(Boolean));
        continue;
      } else if (inTable) {
        flushTable();
      }

      // Empty line
      if (!line.trim()) {
        elements.push(<div key={`sp-${i}`} className="h-2" />);
        continue;
      }

      // Headers
      if (line.startsWith("### ")) {
        elements.push(<h4 key={i} className="font-semibold text-white mt-3 mb-1.5 text-sm">{formatInline(line.slice(4))}</h4>);
        continue;
      }
      if (line.startsWith("## ")) {
        elements.push(<h3 key={i} className="font-bold text-white mt-4 mb-2 text-base border-b border-white/10 pb-1">{formatInline(line.slice(3))}</h3>);
        continue;
      }
      if (line.startsWith("# ")) {
        elements.push(<h2 key={i} className="font-bold text-white mt-4 mb-2 text-lg">{formatInline(line.slice(2))}</h2>);
        continue;
      }

      // Horizontal rule
      if (line.trim() === "---" || line.trim() === "***") {
        elements.push(<hr key={i} className="border-white/10 my-3" />);
        continue;
      }

      // List items
      if (line.match(/^[-*•]\s/)) {
        elements.push(
          <div key={i} className="flex gap-2.5 ml-1 py-0.5">
            <span className="text-blue-400/60 mt-0.5 text-xs">{"\u25B8"}</span>
            <span className="flex-1">{formatInline(line.slice(2))}</span>
          </div>
        );
        continue;
      }
      if (line.match(/^\d+\.\s/)) {
        const num = line.match(/^(\d+)\./)?.[1];
        elements.push(
          <div key={i} className="flex gap-2.5 ml-1 py-0.5">
            <span className="text-blue-400/70 mt-0.5 tabular-nums text-xs font-semibold min-w-[1rem]">{num}.</span>
            <span className="flex-1">{formatInline(line.replace(/^\d+\.\s/, ""))}</span>
          </div>
        );
        continue;
      }

      // Regular paragraph
      elements.push(<p key={i} className="py-0.5">{formatInline(line)}</p>);
    }

    if (inTable) flushTable();
    if (inCodeBlock) flushCode();
    return elements;
  };

  const formatInline = (text: string): ReactNode[] => {
    const parts: ReactNode[] = [];
    let remaining = text;
    let key = 0;

    while (remaining.length > 0) {
      // Bold
      const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
      if (boldMatch && boldMatch.index !== undefined) {
        if (boldMatch.index > 0) parts.push(remaining.slice(0, boldMatch.index));
        parts.push(<strong key={key++} className="font-semibold text-white">{boldMatch[1]}</strong>);
        remaining = remaining.slice(boldMatch.index + boldMatch[0].length);
        continue;
      }

      // Inline code
      const codeMatch = remaining.match(/`(.+?)`/);
      if (codeMatch && codeMatch.index !== undefined) {
        if (codeMatch.index > 0) parts.push(remaining.slice(0, codeMatch.index));
        parts.push(<code key={key++} className="bg-white/10 px-1.5 py-0.5 rounded text-xs font-mono text-purple-300">{codeMatch[1]}</code>);
        remaining = remaining.slice(codeMatch.index + codeMatch[0].length);
        continue;
      }

      // Italic
      const italicMatch = remaining.match(/\*(.+?)\*/);
      if (italicMatch && italicMatch.index !== undefined) {
        if (italicMatch.index > 0) parts.push(remaining.slice(0, italicMatch.index));
        parts.push(<em key={key++} className="italic text-white/70">{italicMatch[1]}</em>);
        remaining = remaining.slice(italicMatch.index + italicMatch[0].length);
        continue;
      }

      parts.push(remaining);
      break;
    }

    return parts;
  };

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] space-y-0 ${
        isUser
          ? "bg-blue-500/15 rounded-2xl rounded-br-md px-4 py-3 text-sm leading-relaxed text-white border border-blue-500/20"
          : "space-y-3"
      }`}>
        {isUser ? (
          <p>{content}</p>
        ) : (
          <>
            {/* Collapsed tool calls from this message */}
            {toolCalls && toolCalls.length > 0 && (
              <button
                onClick={() => setToolsExpanded((e) => !e)}
                className="flex items-center gap-2 text-[11px] text-white/30 hover:text-white/50 transition-colors py-1 px-1 group"
              >
                <svg
                  className={`w-3 h-3 transition-transform duration-200 ${toolsExpanded ? "rotate-180" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
                <span>Used {toolCalls.length} tool{toolCalls.length > 1 ? "s" : ""}</span>
              </button>
            )}
            {toolsExpanded && toolCalls && (
              <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] px-3 py-2 space-y-1 mb-1">
                {toolCalls.map((tc, i) => (
                  <div key={i} className="flex items-center gap-2 text-[11px]">
                    {tc.success ? (
                      <svg className="w-3 h-3 text-emerald-400/60 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    ) : (
                      <svg className="w-3 h-3 text-red-400/60 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                    <span className="text-white/40">{tc.summary || tc.displayName}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="bg-white/[0.05] rounded-2xl rounded-bl-md px-4 py-3 text-sm leading-relaxed text-white/90 border border-white/[0.08]">
              {renderContent(body)}
            </div>
            {actions.length > 0 && isLatest && onAction && (
              <div className="flex flex-wrap gap-2 pl-1">
                {actions.map((action) => (
                  <button
                    key={action}
                    onClick={() => onAction(action)}
                    className="px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs font-medium hover:bg-blue-500/20 hover:border-blue-500/30 hover:text-blue-200 transition-all active:scale-95"
                  >
                    {action}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Question edit popover */}
      {editingQuestion && onAction && (
        <QuestionEditPopover
          question={editingQuestion}
          onSave={(cmd) => {
            onAction(cmd);
            setEditingQuestion(null);
          }}
          onClose={() => setEditingQuestion(null)}
        />
      )}
    </div>
  );
}
