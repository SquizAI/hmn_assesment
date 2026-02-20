import { useCallback, useEffect, useState, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  BackgroundVariant,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "@dagrejs/dagre";

// ============================================================
// Types
// ============================================================

interface GraphNode {
  id: string;
  type: string;
  label: string;
  properties: Record<string, unknown>;
}

interface GraphEdge {
  source: string;
  target: string;
  type: string;
}

interface GraphVisualizationProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  loading?: boolean;
}

// ============================================================
// Node Type Config
// ============================================================

const NODE_CONFIG: Record<string, { color: string; bg: string; border: string; icon: string }> = {
  Company: { color: "text-purple-300", bg: "bg-purple-500/15", border: "border-purple-500/30", icon: "B" },
  Participant: { color: "text-blue-300", bg: "bg-blue-500/15", border: "border-blue-500/30", icon: "P" },
  Session: { color: "text-green-300", bg: "bg-green-500/15", border: "border-green-500/30", icon: "S" },
  Assessment: { color: "text-sky-300", bg: "bg-sky-500/15", border: "border-sky-500/30", icon: "A" },
  Theme: { color: "text-amber-300", bg: "bg-amber-500/15", border: "border-amber-500/30", icon: "T" },
  Archetype: { color: "text-cyan-300", bg: "bg-cyan-500/15", border: "border-cyan-500/30", icon: "Ar" },
  ScoringDimension: { color: "text-indigo-300", bg: "bg-indigo-500/15", border: "border-indigo-500/30", icon: "D" },
  Recommendation: { color: "text-rose-300", bg: "bg-rose-500/15", border: "border-rose-500/30", icon: "R" },
  RedFlag: { color: "text-red-300", bg: "bg-red-500/15", border: "border-red-500/30", icon: "!" },
  GreenLight: { color: "text-emerald-300", bg: "bg-emerald-500/15", border: "border-emerald-500/30", icon: "+" },
};

const DEFAULT_CONFIG = { color: "text-white/60", bg: "bg-white/5", border: "border-white/10", icon: "?" };

// ============================================================
// Custom Node Component
// ============================================================

function GraphNodeComponent({ data }: NodeProps) {
  const nodeType = (data.nodeType as string) || "Unknown";
  const label = (data.label as string) || nodeType;
  const config = NODE_CONFIG[nodeType] || DEFAULT_CONFIG;
  const highlighted = data.highlighted as boolean;
  const dimmed = data.dimmed as boolean;

  return (
    <div
      className={`px-3 py-2 rounded-xl border backdrop-blur-sm transition-all duration-200 ${config.bg} ${config.border} ${
        highlighted ? "ring-1 ring-white/30 scale-105" : ""
      } ${dimmed ? "opacity-20" : "opacity-100"}`}
      style={{ minWidth: 100, maxWidth: 180 }}
    >
      <Handle type="target" position={Position.Top} className="!bg-white/20 !w-1.5 !h-1.5 !border-0" />
      <div className="flex items-center gap-2">
        <span className={`text-[9px] font-bold uppercase tracking-wider ${config.color}`}>
          {config.icon}
        </span>
        <span className={`text-xs font-medium truncate ${config.color}`}>
          {label.length > 22 ? label.slice(0, 20) + "..." : label}
        </span>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-white/20 !w-1.5 !h-1.5 !border-0" />
    </div>
  );
}

const nodeTypes: NodeTypes = {
  graphNode: GraphNodeComponent,
};

// ============================================================
// Layout Helper
// ============================================================

function applyLayout(nodes: Node[], edges: Edge[]): { nodes: Node[]; edges: Edge[] } {
  if (nodes.length === 0) return { nodes, edges };

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 30, ranksep: 50, marginx: 30, marginy: 30 });

  for (const node of nodes) {
    g.setNode(node.id, { width: 160, height: 44 });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const layoutNodes = nodes.map((node) => {
    const pos = g.node(node.id);
    if (!pos) return node;
    return { ...node, position: { x: pos.x - 80, y: pos.y - 22 } };
  });

  return { nodes: layoutNodes, edges };
}

// ============================================================
// Relationship Colors
// ============================================================

const REL_COLORS: Record<string, string> = {
  WORKS_AT: "rgba(168,85,247,0.3)",
  COMPLETED: "rgba(59,130,246,0.3)",
  FOR_ASSESSMENT: "rgba(14,165,233,0.25)",
  SCORED: "rgba(99,102,241,0.25)",
  CLASSIFIED_AS: "rgba(6,182,212,0.3)",
  SURFACED: "rgba(245,158,11,0.3)",
  TRIGGERED: "rgba(244,63,94,0.25)",
  FLAGGED: "rgba(239,68,68,0.3)",
  HIGHLIGHTED: "rgba(16,185,129,0.3)",
  RELATES_TO: "rgba(255,255,255,0.1)",
};

// ============================================================
// Inner Flow Component (needs ReactFlowProvider ancestor)
// ============================================================

function GraphFlowInner({ nodes: rawNodes, edges: rawEdges, loading }: GraphVisualizationProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string | null>(null);

  // Derive connected node set for highlighting
  const connectedSet = useMemo(() => {
    if (!selectedNodeId) return null;
    const set = new Set<string>([selectedNodeId]);
    for (const e of rawEdges) {
      if (e.source === selectedNodeId) set.add(e.target);
      if (e.target === selectedNodeId) set.add(e.source);
    }
    return set;
  }, [selectedNodeId, rawEdges]);

  // Build ReactFlow nodes + edges
  const { flowNodes, flowEdges } = useMemo(() => {
    // Filter by type if active
    const filteredNodes = filterType ? rawNodes.filter((n) => n.type === filterType) : rawNodes;
    const filteredNodeIds = new Set(filteredNodes.map((n) => n.id));

    const flowNodesRaw: Node[] = filteredNodes.map((n) => ({
      id: n.id,
      type: "graphNode",
      position: { x: 0, y: 0 },
      data: {
        label: n.label,
        nodeType: n.type,
        highlighted: connectedSet ? connectedSet.has(n.id) : false,
        dimmed: connectedSet ? !connectedSet.has(n.id) : false,
      },
    }));

    const flowEdgesRaw: Edge[] = rawEdges
      .filter((e) => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target))
      .map((e, i) => ({
        id: `e-${i}-${e.source}-${e.target}`,
        source: e.source,
        target: e.target,
        type: "smoothstep",
        animated: e.type === "SURFACED" || e.type === "TRIGGERED",
        style: {
          stroke: REL_COLORS[e.type] || "rgba(255,255,255,0.08)",
          strokeWidth: connectedSet?.has(e.source) && connectedSet?.has(e.target) ? 2 : 1,
        },
        label: e.type.replace(/_/g, " "),
        labelStyle: { fill: "rgba(255,255,255,0.25)", fontSize: 8 },
        labelBgStyle: { fill: "rgba(0,0,0,0.6)", fillOpacity: 0.6 },
        labelBgPadding: [4, 2] as [number, number],
      }));

    const layout = applyLayout(flowNodesRaw, flowEdgesRaw);
    return { flowNodes: layout.nodes, flowEdges: layout.edges };
  }, [rawNodes, rawEdges, filterType, connectedSet]);

  const [nodes, setNodes, onNodesChange] = useNodesState(flowNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowEdges);

  useEffect(() => {
    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [flowNodes, flowEdges, setNodes, setEdges]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeId((prev) => (prev === node.id ? null : node.id));
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  // Unique node types for filter
  const nodeTypeList = useMemo(() => {
    const types = new Map<string, number>();
    for (const n of rawNodes) {
      types.set(n.type, (types.get(n.type) || 0) + 1);
    }
    return Array.from(types.entries()).sort((a, b) => b[1] - a[1]);
  }, [rawNodes]);

  if (loading) {
    return (
      <div className="bg-white/[0.03] rounded-2xl border border-white/10 p-6 h-[500px] flex items-center justify-center">
        <div className="text-white/30 text-sm">Loading graph...</div>
      </div>
    );
  }

  if (rawNodes.length === 0) {
    return (
      <div className="bg-white/[0.03] rounded-2xl border border-white/10 p-6 h-[500px] flex items-center justify-center">
        <div className="text-white/30 text-sm">No graph data available. Seed the graph to populate.</div>
      </div>
    );
  }

  return (
    <div className="bg-white/[0.03] rounded-2xl border border-white/10 overflow-hidden">
      {/* Filter Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.06] overflow-x-auto">
        <span className="text-[10px] text-white/30 uppercase tracking-wider flex-shrink-0">Filter:</span>
        <button
          onClick={() => setFilterType(null)}
          className={`text-[10px] px-2.5 py-1 rounded-full border transition-colors flex-shrink-0 ${
            filterType === null
              ? "border-white/30 bg-white/10 text-white/80"
              : "border-white/10 text-white/40 hover:text-white/60"
          }`}
        >
          All ({rawNodes.length})
        </button>
        {nodeTypeList.map(([type, count]) => {
          const config = NODE_CONFIG[type] || DEFAULT_CONFIG;
          return (
            <button
              key={type}
              onClick={() => setFilterType(filterType === type ? null : type)}
              className={`text-[10px] px-2.5 py-1 rounded-full border transition-colors flex-shrink-0 ${
                filterType === type
                  ? `${config.border} ${config.bg} ${config.color}`
                  : "border-white/10 text-white/40 hover:text-white/60"
              }`}
            >
              {type} ({count})
            </button>
          );
        })}
      </div>

      {/* Graph Canvas */}
      <div style={{ height: 460 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.2}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgba(255,255,255,0.03)" />
          <Controls
            showInteractive={false}
            className="!bg-white/5 !border-white/10 !rounded-xl [&>button]:!bg-white/5 [&>button]:!border-white/10 [&>button]:!text-white/40 [&>button:hover]:!bg-white/10"
          />
          <MiniMap
            nodeColor={(n) => {
              const type = (n.data?.nodeType as string) || "";
              const colors: Record<string, string> = {
                Company: "#a855f7",
                Participant: "#3b82f6",
                Session: "#22c55e",
                Theme: "#f59e0b",
                Archetype: "#06b6d4",
                ScoringDimension: "#6366f1",
                Recommendation: "#f43f5e",
                RedFlag: "#ef4444",
                GreenLight: "#10b981",
              };
              return colors[type] || "#666";
            }}
            maskColor="rgba(0,0,0,0.7)"
            style={{ background: "rgba(255,255,255,0.03)" }}
            className="!border-white/10 !rounded-xl"
          />
        </ReactFlow>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 px-4 py-2 border-t border-white/[0.06] overflow-x-auto">
        <span className="text-[9px] text-white/25 uppercase tracking-wider flex-shrink-0">Legend:</span>
        {Object.entries(NODE_CONFIG).map(([type, config]) => (
          <div key={type} className="flex items-center gap-1 flex-shrink-0">
            <span className={`w-2 h-2 rounded-full ${config.bg} border ${config.border}`} />
            <span className="text-[9px] text-white/30">{type}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Exported Component (with Provider wrapper)
// ============================================================

export default function GraphVisualization(props: GraphVisualizationProps) {
  return (
    <ReactFlowProvider>
      <GraphFlowInner {...props} />
    </ReactFlowProvider>
  );
}
