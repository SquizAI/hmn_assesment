import { useState, useEffect } from "react";
import { useRobot } from "./RobotToast";
import StatusBadge from "./StatusBadge";
import { fetchAssessment } from "../../lib/admin-api";

interface Phase {
  id: string;
  label: string;
  order: number;
}

interface Section {
  id: string;
  label: string;
  phaseId: string;
  order: number;
}

interface ScoringDimension {
  id: string;
  label: string;
  description: string;
  weight: number;
}

interface Question {
  id: string;
  text: string;
  section: string;
  phase: string;
  inputType: string;
  weight: number;
  scoringDimensions: string[];
  tags: string[];
}

interface AssessmentType {
  id: string;
  name: string;
  description: string;
  icon: string;
  estimatedMinutes: number;
  status: string;
  phases: Phase[];
  sections: Section[];
  questions: Question[];
  scoringDimensions: ScoringDimension[];
  createdAt: string;
  updatedAt: string;
}

interface AssessmentDrawerProps {
  assessmentId: string;
  onClose: () => void;
}

const inputTypeBadgeColors: Record<string, string> = {
  ai_conversation: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  slider: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  buttons: "bg-green-500/20 text-green-300 border-green-500/30",
  open_text: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  voice: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  multi_select: "bg-teal-500/20 text-teal-300 border-teal-500/30",
};

export default function AssessmentDrawer({
  assessmentId,
  onClose,
}: AssessmentDrawerProps) {
  const robot = useRobot();
  const [assessment, setAssessment] = useState<AssessmentType | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await fetchAssessment(assessmentId);
        setAssessment(data.assessment);
        robot.say("action", "ZAP ZAP! Assessment matrix loaded!");
      } catch (err) {
        console.error("Failed to fetch assessment:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [assessmentId]);

  const getSectionPhaseId = (section: Section): string => {
    return section.phaseId || (section as any).phase || "";
  };

  const getSectionsForPhase = (phaseId: string): Section[] => {
    return (assessment?.sections || [])
      .filter((s) => getSectionPhaseId(s) === phaseId)
      .sort((a, b) => a.order - b.order);
  };

  const getQuestionsForSection = (sectionId: string): Question[] => {
    return (assessment?.questions || []).filter((q) => q.section === sectionId);
  };

  const getSectionLabel = (sectionId: string): string => {
    const section = assessment?.sections.find((s) => s.id === sectionId);
    return section?.label || sectionId;
  };

  const allSectionIds = [
    ...new Set((assessment?.questions || []).map((q) => q.section)),
  ];

  return (
    <div className="fixed inset-0 z-40">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Drawer */}
      <div className="absolute right-0 top-0 h-full w-full max-w-2xl bg-[#0a0a0f] border-l border-white/10 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white/40" />
          </div>
        ) : assessment ? (
          <div className="p-6">
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{assessment.icon}</span>
                <div>
                  <h2 className="text-xl font-semibold text-white">
                    {assessment.name}
                  </h2>
                  <div className="mt-1">
                    <StatusBadge status={assessment.status} />
                  </div>
                </div>
              </div>
              <button
                onClick={onClose}
                className="text-white/40 hover:text-white transition-colors text-xl leading-none p-1"
              >
                &times;
              </button>
            </div>

            {/* Overview Card */}
            <div className="bg-white/[0.03] rounded-xl p-4 mb-6">
              <p className="text-sm text-white/60">{assessment.description}</p>
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-white/40">
                <span>
                  {assessment.estimatedMinutes} min estimated
                </span>
                <span>
                  {assessment.questions.length} questions
                </span>
                <span>
                  Created{" "}
                  {new Date(assessment.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>

            {/* Phases & Sections */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider mb-3">
                Phases &amp; Sections
              </h3>
              <div className="space-y-3">
                {(assessment.phases || [])
                  .sort((a, b) => a.order - b.order)
                  .map((phase) => (
                    <div key={phase.id}>
                      <h4 className="text-sm font-medium text-white/80">
                        {phase.label}
                      </h4>
                      <div className="ml-4 mt-1 space-y-1">
                        {getSectionsForPhase(phase.id).map((section) => (
                          <div
                            key={section.id}
                            className="text-xs text-white/40"
                          >
                            {section.label}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* Scoring Dimensions */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider mb-3">
                Scoring Dimensions
              </h3>
              <div className="space-y-2">
                {(assessment.scoringDimensions || []).map((dim) => (
                  <div
                    key={dim.id}
                    className="bg-white/[0.03] rounded-lg p-3 flex items-start justify-between"
                  >
                    <div>
                      <span className="text-sm text-white/80 font-medium">
                        {dim.label}
                      </span>
                      <p className="text-xs text-white/40 mt-0.5">
                        {dim.description}
                      </p>
                    </div>
                    <span className="text-xs bg-white/10 text-white/60 px-2 py-0.5 rounded-full ml-3 shrink-0">
                      {Math.round(dim.weight * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Questions List */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider mb-3">
                Questions
              </h3>
              <div className="max-h-96 overflow-y-auto space-y-4 pr-1">
                {allSectionIds.map((sectionId) => (
                  <div key={sectionId}>
                    <div className="sticky top-0 bg-[#0a0a0f] py-1 z-10">
                      <h4 className="text-xs font-semibold text-white/50 uppercase tracking-wider border-b border-white/10 pb-1">
                        {getSectionLabel(sectionId)}
                      </h4>
                    </div>
                    <div className="space-y-2 mt-2">
                      {getQuestionsForSection(sectionId).map((question) => (
                        <div
                          key={question.id}
                          className="bg-white/[0.02] rounded-lg p-3"
                        >
                          <p className="text-sm text-white/70">
                            {question.text}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded border ${
                                inputTypeBadgeColors[question.inputType] ||
                                "bg-white/10 text-white/50 border-white/20"
                              }`}
                            >
                              {question.inputType}
                            </span>
                            <span className="text-[10px] text-white/30">
                              weight: {question.weight}
                            </span>
                            {(question.scoringDimensions || []).map((dim) => (
                              <span
                                key={dim}
                                className="text-[10px] bg-white/5 text-white/30 px-1.5 py-0.5 rounded"
                              >
                                {dim}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-white/40">
            Assessment not found
          </div>
        )}
      </div>
    </div>
  );
}
