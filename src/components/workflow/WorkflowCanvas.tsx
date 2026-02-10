import { useCallback, useEffect, useState, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  BackgroundVariant,
  Position,
  Handle,
  type NodeTypes,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type { AssessmentType } from "../../lib/types";
import {
  buildGraphFromAssessment,
  applyDagreLayout,
  type BuilderPhase,
} from "../../lib/graph-layout";

// ============================================================
// Props
// ============================================================

interface WorkflowCanvasProps {
  assessment: AssessmentType | null;
  currentPhase: BuilderPhase;
  onPhaseClick?: (phase: BuilderPhase) => void;
}

// ============================================================
// Input Type Badge Colors
// ============================================================

const INPUT_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  ai_conversation: { bg: "bg-amber-500/20", text: "text-amber-300" },
  slider: { bg: "bg-blue-500/20", text: "text-blue-300" },
  buttons: { bg: "bg-purple-500/20", text: "text-purple-300" },
  multi_select: { bg: "bg-violet-500/20", text: "text-violet-300" },
  open_text: { bg: "bg-gray-500/20", text: "text-gray-300" },
  voice: { bg: "bg-green-500/20", text: "text-green-300" },
};

// ============================================================
// Phase Border Colors
// ============================================================

const PHASE_BORDER_COLORS = [
  "border-l-blue-400",
  "border-l-purple-400",
  "border-l-amber-400",
  "border-l-green-400",
];

// ============================================================
// Custom Node: BuilderStep
// ============================================================

function BuilderStepNode({ data }: NodeProps) {
  const status = data.status as string;
  const label = data.label as string;
  const icon = data.icon as string;

  const borderClass =
    status === "active"
      ? "border-purple-500/50 shadow-lg shadow-purple-500/10"
      : status === "complete"
        ? "border-emerald-500/30"
        : "border-white/10 opacity-50";

  return (
    <div
      className={`w-[200px] h-[80px] rounded-xl border bg-[#0f0f18] flex flex-col items-center justify-center gap-1.5 px-3 ${borderClass}`}
    >
      <Handle type="target" position={Position.Left} className="!bg-white/10 !w-2 !h-2 !border-0" />
      <Handle type="source" position={Position.Right} className="!bg-white/10 !w-2 !h-2 !border-0" />
      <Handle type="source" position={Position.Bottom} id="bottom" className="!bg-purple-500/30 !w-2 !h-2 !border-0" />

      <div className="flex items-center gap-2">
        <span className="text-base">{icon}</span>
        <span className="text-xs font-medium text-white/80 truncate">{label}</span>
      </div>

      <div className="flex items-center gap-1.5">
        {status === "complete" && (
          <div className="flex items-center gap-1">
            <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            <span className="text-[10px] text-emerald-400/70">Complete</span>
          </div>
        )}
        {status === "active" && (
          <div className="flex items-center gap-1">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500" />
            </span>
            <span className="text-[10px] text-purple-400/70">Active</span>
          </div>
        )}
        {status === "pending" && (
          <span className="text-[10px] text-white/20">Pending</span>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Custom Node: Phase
// ============================================================

function PhaseNode({ data }: NodeProps) {
  const label = data.label as string;
  const sectionCount = data.sectionCount as number;
  const colorIndex = (data.colorIndex as number) || 0;
  const expandable = data.expandable as boolean;
  const borderColor = PHASE_BORDER_COLORS[colorIndex % PHASE_BORDER_COLORS.length];

  return (
    <div
      className={`w-[240px] h-[70px] rounded-lg border border-white/10 ${borderColor} border-l-2 bg-[#0f0f18] flex items-center justify-between px-3`}
    >
      <Handle type="target" position={Position.Top} className="!bg-white/10 !w-2 !h-2 !border-0" />
      <Handle type="source" position={Position.Bottom} className="!bg-white/10 !w-2 !h-2 !border-0" />

      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-white/70 truncate">{label}</p>
        {sectionCount > 0 && (
          <span className="text-[10px] text-white/30">{sectionCount} section{sectionCount !== 1 ? "s" : ""}</span>
        )}
      </div>

      {expandable && (
        <svg
          className="w-4 h-4 text-white/20 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      )}
    </div>
  );
}

// ============================================================
// Custom Node: Section
// ============================================================

function SectionNode({ data }: NodeProps) {
  const label = data.label as string;
  const questionCount = data.questionCount as number;
  const expandable = data.expandable as boolean;

  return (
    <div className="w-[220px] h-[60px] rounded-lg border border-white/[0.08] bg-[#0c0c14] flex items-center justify-between px-3">
      <Handle type="target" position={Position.Top} className="!bg-white/10 !w-2 !h-2 !border-0" />
      <Handle type="source" position={Position.Bottom} className="!bg-white/10 !w-2 !h-2 !border-0" />

      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-white/60 truncate">{label}</p>
        {questionCount > 0 && (
          <span className="text-[10px] text-white/25">{questionCount} question{questionCount !== 1 ? "s" : ""}</span>
        )}
      </div>

      {expandable && (
        <svg
          className="w-3.5 h-3.5 text-white/15 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      )}
    </div>
  );
}

// ============================================================
// Custom Node: Question
// ============================================================

function QuestionNode({ data }: NodeProps) {
  const text = data.text as string;
  const inputType = data.inputType as string;
  const weight = data.weight as number;
  const truncated = text.length > 50 ? text.slice(0, 50) + "..." : text;
  const colors = INPUT_TYPE_COLORS[inputType] || { bg: "bg-white/10", text: "text-white/50" };

  return (
    <div className="w-[260px] h-[50px] rounded-md border border-white/[0.06] bg-[#0a0a12] flex flex-col justify-center px-3 gap-1">
      <Handle type="target" position={Position.Top} className="!bg-white/10 !w-1.5 !h-1.5 !border-0" />

      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-white/50 truncate flex-1">{truncated}</span>
        <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${colors.bg} ${colors.text} shrink-0`}>
          {inputType.replace(/_/g, " ")}
        </span>
      </div>

      {weight > 0 && (
        <div className="h-[3px] bg-white/[0.04] rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-purple-500/40 to-blue-500/40 rounded-full"
            style={{ width: `${Math.min(weight * 100, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

// ============================================================
// Custom Node: Dimension
// ============================================================

function DimensionNode({ data }: NodeProps) {
  const label = data.label as string;
  const weight = data.weight as number;
  const questionCount = data.questionCount as number;

  return (
    <div className="w-[180px] h-[50px] rounded-md border border-white/[0.06] bg-[#0a0a12] flex flex-col justify-center px-3 gap-1">
      <Handle type="target" position={Position.Top} className="!bg-white/10 !w-1.5 !h-1.5 !border-0" />

      <div className="flex items-center justify-between gap-1.5">
        <span className="text-[10px] text-white/60 truncate flex-1">{label}</span>
        <span className="text-[9px] text-white/25 tabular-nums shrink-0">{questionCount}q</span>
      </div>

      <div className="h-[3px] bg-white/[0.04] rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-purple-500/50 to-blue-500/50 rounded-full"
          style={{ width: `${Math.min(weight * 100, 100)}%` }}
        />
      </div>
    </div>
  );
}

// ============================================================
// Node Types Map
// ============================================================

const nodeTypes: NodeTypes = {
  builderStep: BuilderStepNode,
  phase: PhaseNode,
  section: SectionNode,
  question: QuestionNode,
  dimension: DimensionNode,
};

// ============================================================
// Inner Canvas (needs ReactFlowProvider ancestor)
// ============================================================

function WorkflowCanvasInner({
  assessment,
  currentPhase,
  onPhaseClick,
}: WorkflowCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const { fitView } = useReactFlow();
  const fitViewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Rebuild graph when assessment, phase, or expanded nodes change
  useEffect(() => {
    const { nodes: rawNodes, edges: rawEdges } = buildGraphFromAssessment(
      assessment,
      currentPhase,
      expandedNodes,
    );
    const { nodes: layoutNodes, edges: layoutEdges } = applyDagreLayout(rawNodes, rawEdges);
    setNodes(layoutNodes);
    setEdges(layoutEdges);

    // Fit view after layout settles
    if (fitViewTimerRef.current) clearTimeout(fitViewTimerRef.current);
    fitViewTimerRef.current = setTimeout(() => {
      fitView({ padding: 0.15, duration: 300 });
    }, 50);

    return () => {
      if (fitViewTimerRef.current) clearTimeout(fitViewTimerRef.current);
    };
  }, [assessment, currentPhase, expandedNodes, setNodes, setEdges, fitView]);

  // Handle node clicks
  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      // Builder step nodes: navigate to that phase
      if (node.type === "builderStep") {
        const phase = node.data.phase as BuilderPhase | undefined;
        if (phase && onPhaseClick) {
          const status = node.data.status as string;
          if (status === "complete") {
            onPhaseClick(phase);
          }
        }
        // Toggle expansion
        setExpandedNodes((prev) => {
          const next = new Set(prev);
          if (next.has(node.id)) {
            next.delete(node.id);
          } else {
            next.add(node.id);
          }
          return next;
        });
        return;
      }

      // Parent nodes (phase, section): toggle expansion
      if (node.type === "phase" || node.type === "section") {
        setExpandedNodes((prev) => {
          const next = new Set(prev);
          if (next.has(node.id)) {
            next.delete(node.id);
          } else {
            next.add(node.id);
          }
          return next;
        });
      }
    },
    [onPhaseClick],
  );

  // MiniMap node color
  const minimapNodeColor = useCallback((n: Node) => {
    if (n.type === "builderStep") return "#8b5cf6";
    return "rgba(255,255,255,0.1)";
  }, []);

  return (
    <div className="relative w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        fitView
        proOptions={{ hideAttribution: true }}
        style={{ background: "#0a0a0f" }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          color="rgba(255,255,255,0.04)"
          gap={24}
          size={1}
        />
        <Controls className="react-flow-controls-dark" />
        <MiniMap
          nodeColor={minimapNodeColor}
          maskColor="rgba(0,0,0,0.8)"
          style={{ background: "rgba(255,255,255,0.03)" }}
        />
      </ReactFlow>

      {/* Empty state overlay */}
      {!assessment && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center space-y-3 px-8">
            <div className="w-12 h-12 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mx-auto">
              <span className="text-xl opacity-30">{"\uD83D\uDDFA\uFE0F"}</span>
            </div>
            <p className="text-sm text-white/25 max-w-xs leading-relaxed">
              Start a conversation to begin building your assessment
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Exported Wrapper (provides ReactFlowProvider)
// ============================================================

export default function WorkflowCanvas(props: WorkflowCanvasProps) {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
