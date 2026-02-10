import dagre from "@dagrejs/dagre";
import type { Node, Edge } from "@xyflow/react";
import type { AssessmentType } from "./types";

// ============================================================
// Types
// ============================================================

export type BuilderPhase = "purpose" | "framework" | "questions" | "scoring" | "review";

type StepStatus = "complete" | "active" | "pending";

interface BuilderStepData {
  label: string;
  icon: string;
  status: StepStatus;
  phase: BuilderPhase;
  [key: string]: unknown;
}

interface PhaseNodeData {
  label: string;
  sectionCount: number;
  colorIndex: number;
  expandable: boolean;
  [key: string]: unknown;
}

interface SectionNodeData {
  label: string;
  questionCount: number;
  expandable: boolean;
  [key: string]: unknown;
}

interface QuestionNodeData {
  text: string;
  inputType: string;
  weight: number;
  [key: string]: unknown;
}

interface DimensionNodeData {
  label: string;
  weight: number;
  questionCount: number;
  [key: string]: unknown;
}

// ============================================================
// Constants
// ============================================================

const BUILDER_STEPS: { id: BuilderPhase; label: string; icon: string }[] = [
  { id: "purpose", label: "Purpose & Context", icon: "\uD83C\uDFAF" },
  { id: "framework", label: "Framework", icon: "\uD83C\uDFD7" },
  { id: "questions", label: "Question Design", icon: "\uD83D\uDCAC" },
  { id: "scoring", label: "Scoring & Calibration", icon: "\u2696\uFE0F" },
  { id: "review", label: "Review & Activate", icon: "\u2705" },
];

const PHASE_ORDER: BuilderPhase[] = ["purpose", "framework", "questions", "scoring", "review"];

const NODE_DIMENSIONS: Record<string, { width: number; height: number }> = {
  builderStep: { width: 200, height: 80 },
  phase: { width: 240, height: 70 },
  section: { width: 220, height: 60 },
  question: { width: 260, height: 50 },
  dimension: { width: 180, height: 50 },
};

// ============================================================
// Phase Status Helper
// ============================================================

function getStepStatus(step: BuilderPhase, currentPhase: BuilderPhase): StepStatus {
  const currentIdx = PHASE_ORDER.indexOf(currentPhase);
  const stepIdx = PHASE_ORDER.indexOf(step);
  if (stepIdx < currentIdx) return "complete";
  if (stepIdx === currentIdx) return "active";
  return "pending";
}

// ============================================================
// Build Graph from Assessment
// ============================================================

export function buildGraphFromAssessment(
  assessment: AssessmentType | null,
  currentPhase: BuilderPhase,
  expandedNodes: Set<string>,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // 1. Always create 5 builder step nodes
  BUILDER_STEPS.forEach((step) => {
    const status = getStepStatus(step.id, currentPhase);
    const nodeData: BuilderStepData = {
      label: step.label,
      icon: step.icon,
      status,
      phase: step.id,
    };

    nodes.push({
      id: `step-${step.id}`,
      type: "builderStep",
      position: { x: 0, y: 0 }, // will be set by dagre
      data: nodeData,
    });
  });

  // Connect builder steps horizontally
  for (let i = 0; i < BUILDER_STEPS.length - 1; i++) {
    edges.push({
      id: `edge-step-${BUILDER_STEPS[i].id}-${BUILDER_STEPS[i + 1].id}`,
      source: `step-${BUILDER_STEPS[i].id}`,
      target: `step-${BUILDER_STEPS[i + 1].id}`,
      type: "smoothstep",
      animated: false,
      style: { stroke: "rgba(255,255,255,0.08)", strokeWidth: 1.5 },
    });
  }

  if (!assessment) return { nodes, edges };

  // 2. Expand children for active/complete steps
  const phases = assessment.phases || [];
  const sections = assessment.sections || [];
  const questions = assessment.questions || [];
  const dimensions = assessment.scoringDimensions || [];

  const shouldExpand = (stepPhase: BuilderPhase): boolean => {
    const status = getStepStatus(stepPhase, currentPhase);
    return status === "active" || status === "complete";
  };

  // Framework step: show phase nodes
  if (shouldExpand("framework") && phases.length > 0) {
    const stepId = "step-framework";
    const isStepExpanded = expandedNodes.has(stepId) || getStepStatus("framework", currentPhase) === "active";

    if (isStepExpanded) {
      const sortedPhases = [...phases].sort((a, b) => a.order - b.order);
      const PHASE_COLORS = ["blue", "purple", "amber", "green"];

      sortedPhases.forEach((phase, idx) => {
        const phaseNodeId = `phase-${phase.id}`;
        const phaseSections = sections.filter((s) => s.phaseId === phase.id);
        const nodeData: PhaseNodeData = {
          label: phase.label,
          sectionCount: phaseSections.length,
          colorIndex: idx % PHASE_COLORS.length,
          expandable: phaseSections.length > 0,
        };

        nodes.push({
          id: phaseNodeId,
          type: "phase",
          position: { x: 0, y: 0 },
          data: nodeData,
        });

        // Connect step → phase
        if (idx === 0) {
          edges.push({
            id: `edge-${stepId}-${phaseNodeId}`,
            source: stepId,
            target: phaseNodeId,
            type: "smoothstep",
            style: { stroke: "rgba(139,92,246,0.3)", strokeWidth: 1.5 },
          });
        } else {
          edges.push({
            id: `edge-phase-${sortedPhases[idx - 1].id}-${phase.id}`,
            source: `phase-${sortedPhases[idx - 1].id}`,
            target: phaseNodeId,
            type: "smoothstep",
            style: { stroke: "rgba(139,92,246,0.2)", strokeWidth: 1 },
          });
        }
      });
    }
  }

  // Questions step: show phase → section → question tree
  if (shouldExpand("questions") && questions.length > 0) {
    const stepId = "step-questions";
    const isStepExpanded = expandedNodes.has(stepId) || getStepStatus("questions", currentPhase) === "active";

    if (isStepExpanded) {
      const sortedPhases = [...phases].sort((a, b) => a.order - b.order);
      const PHASE_COLORS = ["blue", "purple", "amber", "green"];
      let prevPhaseNodeId: string | null = null;

      sortedPhases.forEach((phase, pIdx) => {
        const phaseNodeId = `q-phase-${phase.id}`;
        const phaseSections = sections
          .filter((s) => s.phaseId === phase.id)
          .sort((a, b) => a.order - b.order);

        const phaseQuestions = questions.filter(
          (q) => String(q.phase) === phase.id,
        );

        if (phaseQuestions.length === 0 && phaseSections.length === 0) return;

        const nodeData: PhaseNodeData = {
          label: phase.label,
          sectionCount: phaseSections.length,
          colorIndex: pIdx % PHASE_COLORS.length,
          expandable: phaseSections.length > 0,
        };

        nodes.push({
          id: phaseNodeId,
          type: "phase",
          position: { x: 0, y: 0 },
          data: nodeData,
        });

        // Connect step → first phase or chain phases
        if (prevPhaseNodeId === null) {
          edges.push({
            id: `edge-${stepId}-${phaseNodeId}`,
            source: stepId,
            target: phaseNodeId,
            type: "smoothstep",
            style: { stroke: "rgba(139,92,246,0.3)", strokeWidth: 1.5 },
          });
        } else {
          edges.push({
            id: `edge-qp-${prevPhaseNodeId}-${phaseNodeId}`,
            source: prevPhaseNodeId,
            target: phaseNodeId,
            type: "smoothstep",
            style: { stroke: "rgba(139,92,246,0.2)", strokeWidth: 1 },
          });
        }
        prevPhaseNodeId = phaseNodeId;

        // If phase is expanded, show its sections
        const isPhaseExpanded =
          expandedNodes.has(phaseNodeId) ||
          getStepStatus("questions", currentPhase) === "active";

        if (isPhaseExpanded) {
          let prevSectionNodeId: string | null = null;

          phaseSections.forEach((section) => {
            const sectionNodeId = `section-${section.id}`;
            const sectionQuestions = questions.filter(
              (q) => String(q.section) === section.id,
            );

            const sectionData: SectionNodeData = {
              label: section.label,
              questionCount: sectionQuestions.length,
              expandable: sectionQuestions.length > 0,
            };

            nodes.push({
              id: sectionNodeId,
              type: "section",
              position: { x: 0, y: 0 },
              data: sectionData,
            });

            // Connect phase → first section or chain sections
            if (prevSectionNodeId === null) {
              edges.push({
                id: `edge-${phaseNodeId}-${sectionNodeId}`,
                source: phaseNodeId,
                target: sectionNodeId,
                type: "smoothstep",
                style: { stroke: "rgba(255,255,255,0.1)", strokeWidth: 1 },
              });
            } else {
              edges.push({
                id: `edge-sec-${prevSectionNodeId}-${sectionNodeId}`,
                source: prevSectionNodeId,
                target: sectionNodeId,
                type: "smoothstep",
                style: { stroke: "rgba(255,255,255,0.08)", strokeWidth: 1 },
              });
            }
            prevSectionNodeId = sectionNodeId;

            // If section is expanded, show questions
            const isSectionExpanded = expandedNodes.has(sectionNodeId);

            if (isSectionExpanded) {
              sectionQuestions.forEach((q, qIdx) => {
                const questionNodeId = `question-${q.id}`;
                const questionData: QuestionNodeData = {
                  text: q.text,
                  inputType: q.inputType,
                  weight: q.weight,
                };

                nodes.push({
                  id: questionNodeId,
                  type: "question",
                  position: { x: 0, y: 0 },
                  data: questionData,
                });

                if (qIdx === 0) {
                  edges.push({
                    id: `edge-${sectionNodeId}-${questionNodeId}`,
                    source: sectionNodeId,
                    target: questionNodeId,
                    type: "smoothstep",
                    style: { stroke: "rgba(255,255,255,0.06)", strokeWidth: 1 },
                  });
                } else {
                  const prevQId = `question-${sectionQuestions[qIdx - 1].id}`;
                  edges.push({
                    id: `edge-q-${prevQId}-${questionNodeId}`,
                    source: prevQId,
                    target: questionNodeId,
                    type: "smoothstep",
                    style: { stroke: "rgba(255,255,255,0.06)", strokeWidth: 1 },
                  });
                }
              });
            }
          });
        }
      });
    }
  }

  // Scoring step: show scoring dimension nodes
  if (shouldExpand("scoring") && dimensions.length > 0) {
    const stepId = "step-scoring";
    const isStepExpanded = expandedNodes.has(stepId) || getStepStatus("scoring", currentPhase) === "active";

    if (isStepExpanded) {
      dimensions.forEach((dim, idx) => {
        const dimNodeId = `dim-${dim.id}`;

        // Count questions mapped to this dimension
        const mappedCount = questions.filter((q) =>
          q.scoringDimensions?.some((sd) => String(sd) === dim.id),
        ).length;

        const dimData: DimensionNodeData = {
          label: dim.label,
          weight: dim.weight,
          questionCount: mappedCount,
        };

        nodes.push({
          id: dimNodeId,
          type: "dimension",
          position: { x: 0, y: 0 },
          data: dimData,
        });

        if (idx === 0) {
          edges.push({
            id: `edge-${stepId}-${dimNodeId}`,
            source: stepId,
            target: dimNodeId,
            type: "smoothstep",
            style: { stroke: "rgba(139,92,246,0.3)", strokeWidth: 1.5 },
          });
        } else {
          const prevDimId = `dim-${dimensions[idx - 1].id}`;
          edges.push({
            id: `edge-dim-${prevDimId}-${dimNodeId}`,
            source: prevDimId,
            target: dimNodeId,
            type: "smoothstep",
            style: { stroke: "rgba(139,92,246,0.2)", strokeWidth: 1 },
          });
        }
      });
    }
  }

  // Review step: expand all (same as having everything expanded)
  if (getStepStatus("review", currentPhase) === "active") {
    // The review phase inherits all expanded children from previous steps.
    // Since we already expand based on complete/active status, review
    // will see framework, questions, and scoring expansions automatically.
  }

  return { nodes, edges };
}

// ============================================================
// Apply Dagre Layout
// ============================================================

export function applyDagreLayout(
  nodes: Node[],
  edges: Edge[],
): { nodes: Node[]; edges: Edge[] } {
  if (nodes.length === 0) return { nodes, edges };

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: "TB",
    nodesep: 40,
    ranksep: 60,
    marginx: 40,
    marginy: 40,
  });

  // Add nodes to the dagre graph
  for (const node of nodes) {
    const dims = NODE_DIMENSIONS[node.type || "builderStep"] || NODE_DIMENSIONS.builderStep;
    g.setNode(node.id, {
      width: dims.width,
      height: dims.height,
      ...(node.type === "builderStep" ? { rank: 0 } : {}),
    });
  }

  // Add edges to the dagre graph
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  // Compute layout
  dagre.layout(g);

  // Apply computed positions back to nodes
  const layoutNodes = nodes.map((node) => {
    const dagreNode = g.node(node.id);
    if (!dagreNode) return node;

    const dims = NODE_DIMENSIONS[node.type || "builderStep"] || NODE_DIMENSIONS.builderStep;
    return {
      ...node,
      position: {
        x: dagreNode.x - dims.width / 2,
        y: dagreNode.y - dims.height / 2,
      },
    };
  });

  return { nodes: layoutNodes, edges };
}
