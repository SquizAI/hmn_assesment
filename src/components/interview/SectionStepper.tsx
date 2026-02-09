import { useState } from "react";
import type { CascadePhase, CascadeSection } from "../../lib/types";
import { PHASE_ORDER, PHASE_LABELS, SECTION_ORDER, SECTION_LABELS, QUESTION_BANK } from "../../data/question-bank";

export interface SectionProgress {
  section: CascadeSection;
  label: string;
  phase: CascadePhase;
  status: "completed" | "in_progress" | "upcoming" | "skipped";
  answeredCount: number;
  totalCount: number;
  questionIds: string[];
}

interface AnsweredQuestion {
  questionId: string;
  questionText: string;
  answer: unknown;
  inputType: string;
}

interface Props {
  sections: SectionProgress[];
  answeredQuestions: AnsweredQuestion[];
  onQuestionClick: (questionId: string) => void;
  currentSection: CascadeSection;
}

export function computeSectionProgress(
  answeredQuestions: AnsweredQuestion[],
  currentSection: CascadeSection,
  skippedQuestionIds: string[],
): SectionProgress[] {
  const answeredIds = new Set(answeredQuestions.map((q) => q.questionId));
  const skippedIds = new Set(skippedQuestionIds);

  return SECTION_ORDER.map((section) => {
    const sectionQuestions = QUESTION_BANK.filter((q) => q.section === section);
    const activeQuestions = sectionQuestions.filter((q) => !skippedIds.has(q.id));
    const answered = activeQuestions.filter((q) => answeredIds.has(q.id));

    let status: SectionProgress["status"];
    if (activeQuestions.length === 0) {
      status = "skipped";
    } else if (answered.length === activeQuestions.length) {
      status = "completed";
    } else if (answered.length > 0 || section === currentSection) {
      status = "in_progress";
    } else {
      status = "upcoming";
    }

    return {
      section,
      label: SECTION_LABELS[section],
      phase: sectionQuestions[0]?.phase ?? "profile_baseline",
      status,
      answeredCount: answered.length,
      totalCount: activeQuestions.length,
      questionIds: sectionQuestions.map((q) => q.id),
    };
  });
}

export default function SectionStepper({ sections, answeredQuestions, onQuestionClick, currentSection }: Props) {
  const [expandedSection, setExpandedSection] = useState<CascadeSection | null>(null);

  const answeredMap = new Map(answeredQuestions.map((q) => [q.questionId, q]));

  // Group sections by phase
  const phases = PHASE_ORDER.map((phase) => ({
    phase,
    label: PHASE_LABELS[phase],
    sections: sections.filter((s) => s.phase === phase),
  }));

  const handleSectionClick = (sp: SectionProgress) => {
    if (sp.status === "upcoming") return;
    if (sp.status === "skipped") return;
    setExpandedSection(expandedSection === sp.section ? null : sp.section);
  };

  return (
    <div className="space-y-2">
      {/* Horizontal stepper */}
      <div className="flex items-center gap-0.5 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
        {phases.map((phaseGroup, pi) => (
          <div key={phaseGroup.phase} className="flex items-center">
            {pi > 0 && <div className="w-3 h-px bg-white/10 mx-0.5" />}
            <div className="flex items-center gap-0.5">
              {phaseGroup.sections.map((sp) => {
                const isCurrent = sp.section === currentSection;
                return (
                  <button
                    key={sp.section}
                    onClick={() => handleSectionClick(sp)}
                    disabled={sp.status === "upcoming"}
                    title={`${sp.label}${sp.status === "completed" ? " (completed)" : sp.status === "in_progress" ? ` (${sp.answeredCount}/${sp.totalCount})` : sp.status === "skipped" ? " (auto-completed)" : ""}`}
                    className={`relative flex items-center gap-1 px-2 py-1 rounded-full text-[10px] transition-all whitespace-nowrap
                      ${sp.status === "completed"
                        ? "bg-green-500/15 border border-green-500/30 text-green-400 hover:bg-green-500/25 cursor-pointer"
                        : sp.status === "in_progress"
                        ? isCurrent
                          ? "bg-indigo-500/20 border border-indigo-500/40 text-indigo-300"
                          : "bg-indigo-500/10 border border-indigo-500/20 text-indigo-400/70 hover:bg-indigo-500/20 cursor-pointer"
                        : sp.status === "skipped"
                        ? "bg-white/5 border border-white/5 text-white/20"
                        : "bg-white/5 border border-white/5 text-white/20 cursor-default"
                      }
                      ${expandedSection === sp.section ? "ring-1 ring-white/20" : ""}
                    `}
                  >
                    {/* Status icon */}
                    {sp.status === "completed" ? (
                      <svg className="w-3 h-3 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    ) : sp.status === "in_progress" ? (
                      isCurrent ? (
                        <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-pulse" />
                      ) : (
                        <span className="w-2.5 h-2.5 rounded-full border border-indigo-400/50 bg-indigo-500/30" />
                      )
                    ) : sp.status === "skipped" ? (
                      <span className="w-2.5 h-2.5 flex items-center justify-center text-white/20">—</span>
                    ) : (
                      <span className="w-2.5 h-2.5 rounded-full border border-white/15" />
                    )}
                    <span>{sp.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Expanded section — shows individual questions */}
      {expandedSection && (() => {
        const sp = sections.find((s) => s.section === expandedSection);
        if (!sp) return null;
        const sectionQuestions = QUESTION_BANK.filter((q) => q.section === expandedSection);

        return (
          <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-1.5 animate-in fade-in duration-200">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-white/40 uppercase tracking-wider">{sp.label}</span>
              <button onClick={() => setExpandedSection(null)} className="text-white/30 hover:text-white/50 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            {sectionQuestions.map((q) => {
              const answered = answeredMap.get(q.id);
              const isAnswered = !!answered;
              return (
                <button
                  key={q.id}
                  onClick={() => { if (isAnswered) { onQuestionClick(q.id); setExpandedSection(null); } }}
                  disabled={!isAnswered}
                  className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all
                    ${isAnswered
                      ? "bg-white/5 hover:bg-white/10 text-white/70 cursor-pointer"
                      : "text-white/20 cursor-default"
                    }`}
                >
                  {isAnswered ? (
                    <svg className="w-3.5 h-3.5 text-green-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <span className="w-3.5 h-3.5 rounded-full border border-white/15 shrink-0" />
                  )}
                  <span className="truncate">{q.text}</span>
                  {isAnswered && (
                    <svg className="w-3 h-3 text-white/20 ml-auto shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}
