import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import ForceGraph3D from "react-force-graph-3d";
import * as THREE from "three";

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
// Node Type Config — colors for each entity type
// ============================================================

const NODE_COLORS: Record<string, string> = {
  Company: "#a855f7",
  Participant: "#3b82f6",
  Session: "#22c55e",
  Assessment: "#0ea5e9",
  Theme: "#f59e0b",
  Archetype: "#06b6d4",
  ScoringDimension: "#6366f1",
  Recommendation: "#f43f5e",
  RedFlag: "#ef4444",
  GreenLight: "#10b981",
  Tool: "#e879f9",
  PainPoint: "#fb923c",
  Goal: "#facc15",
  Quote: "#94a3b8",
};

const NODE_SIZES: Record<string, number> = {
  Company: 10,
  Participant: 7,
  Session: 6,
  Assessment: 8,
  Theme: 5,
  Archetype: 7,
  ScoringDimension: 5,
  Recommendation: 5,
  RedFlag: 4,
  GreenLight: 4,
  Tool: 4,
  PainPoint: 4,
  Goal: 4,
  Quote: 3,
};

const LINK_COLORS: Record<string, string> = {
  WORKS_AT: "rgba(168,85,247,0.4)",
  COMPLETED: "rgba(59,130,246,0.4)",
  FOR_ASSESSMENT: "rgba(14,165,233,0.3)",
  SCORED: "rgba(99,102,241,0.3)",
  CLASSIFIED_AS: "rgba(6,182,212,0.4)",
  SURFACED: "rgba(245,158,11,0.4)",
  TRIGGERED: "rgba(244,63,94,0.3)",
  FLAGGED: "rgba(239,68,68,0.4)",
  HIGHLIGHTED: "rgba(16,185,129,0.4)",
  RELATES_TO: "rgba(255,255,255,0.12)",
  USES_TOOL: "rgba(232,121,249,0.3)",
  HAS_PAIN_POINT: "rgba(251,146,60,0.3)",
  HAS_GOAL: "rgba(250,204,21,0.3)",
  QUOTED: "rgba(148,163,184,0.3)",
};

const DEFAULT_COLOR = "#666666";

// ============================================================
// Component
// ============================================================

export default function GraphVisualization({ nodes: rawNodes, edges: rawEdges, loading }: GraphVisualizationProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<any>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setDimensions({ width, height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Build connected set for highlighting
  const connectedSet = useMemo(() => {
    if (!selectedNodeId) return null;
    const set = new Set<string>([selectedNodeId]);
    for (const e of rawEdges) {
      if (e.source === selectedNodeId) set.add(e.target);
      if (e.target === selectedNodeId) set.add(e.source);
    }
    return set;
  }, [selectedNodeId, rawEdges]);

  // Filter + transform data for the 3D graph
  const graphData = useMemo(() => {
    const filteredNodes = filterType ? rawNodes.filter((n) => n.type === filterType) : rawNodes;
    const filteredIds = new Set(filteredNodes.map((n) => n.id));

    const nodes = filteredNodes.map((n) => ({
      id: n.id,
      nodeType: n.type,
      label: n.label,
      color: NODE_COLORS[n.type] || DEFAULT_COLOR,
      val: NODE_SIZES[n.type] || 4,
    }));

    const links = rawEdges
      .filter((e) => filteredIds.has(e.source) && filteredIds.has(e.target))
      .map((e) => ({
        source: e.source,
        target: e.target,
        relType: e.type,
        color: LINK_COLORS[e.type] || "rgba(255,255,255,0.08)",
      }));

    return { nodes, links };
  }, [rawNodes, rawEdges, filterType]);

  // Node type counts for filter bar
  const nodeTypeList = useMemo(() => {
    const types = new Map<string, number>();
    for (const n of rawNodes) types.set(n.type, (types.get(n.type) || 0) + 1);
    return Array.from(types.entries()).sort((a, b) => b[1] - a[1]);
  }, [rawNodes]);

  // Custom node rendering — glowing spheres
  const nodeThreeObject = useCallback(
    (node: Record<string, unknown>) => {
      const nodeType = (node.nodeType as string) || "";
      const color = NODE_COLORS[nodeType] || DEFAULT_COLOR;
      const size = NODE_SIZES[nodeType] || 4;
      const isHighlighted = connectedSet ? connectedSet.has(node.id as string) : false;
      const isDimmed = connectedSet ? !connectedSet.has(node.id as string) : false;

      const group = new THREE.Group();

      // Sphere
      const geometry = new THREE.SphereGeometry(size * 0.6, 16, 12);
      const material = new THREE.MeshPhongMaterial({
        color: new THREE.Color(color),
        transparent: true,
        opacity: isDimmed ? 0.15 : isHighlighted ? 1.0 : 0.85,
        emissive: new THREE.Color(color),
        emissiveIntensity: isHighlighted ? 0.6 : 0.2,
        shininess: 80,
      });
      const sphere = new THREE.Mesh(geometry, material);
      group.add(sphere);

      // Glow ring for highlighted nodes
      if (isHighlighted) {
        const ringGeo = new THREE.RingGeometry(size * 0.8, size * 1.0, 24);
        const ringMat = new THREE.MeshBasicMaterial({
          color: new THREE.Color(color),
          transparent: true,
          opacity: 0.4,
          side: THREE.DoubleSide,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        group.add(ring);
      }

      // Label sprite
      const label = (node.label as string) || nodeType;
      const displayLabel = label.length > 20 ? label.slice(0, 18) + "..." : label;
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d")!;
      canvas.width = 256;
      canvas.height = 64;
      ctx.font = "bold 22px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = isDimmed ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.85)";
      ctx.fillText(displayLabel, 128, 40);

      const texture = new THREE.CanvasTexture(canvas);
      texture.minFilter = THREE.LinearFilter;
      const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.scale.set(size * 3.5, size * 0.9, 1);
      sprite.position.set(0, -(size * 0.8 + 2), 0);
      group.add(sprite);

      return group;
    },
    [connectedSet],
  );

  const handleNodeClick = useCallback((node: Record<string, unknown>) => {
    const id = node.id as string;
    setSelectedNodeId((prev) => (prev === id ? null : id));
  }, []);

  const handleBackgroundClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

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
        <span className="text-[10px] text-white/30 uppercase tracking-wider shrink-0">Filter:</span>
        <button
          onClick={() => setFilterType(null)}
          className={`text-[10px] px-2.5 py-1 rounded-full border transition-colors shrink-0 ${
            filterType === null
              ? "border-white/30 bg-white/10 text-white/80"
              : "border-white/10 text-white/40 hover:text-white/60"
          }`}
        >
          All ({rawNodes.length})
        </button>
        {nodeTypeList.map(([type, count]) => {
          const color = NODE_COLORS[type] || DEFAULT_COLOR;
          return (
            <button
              key={type}
              onClick={() => setFilterType(filterType === type ? null : type)}
              className={`text-[10px] px-2.5 py-1 rounded-full border transition-colors shrink-0 ${
                filterType === type
                  ? "border-white/30 bg-white/10 text-white/90"
                  : "border-white/10 text-white/40 hover:text-white/60"
              }`}
              style={filterType === type ? { borderColor: color, color } : undefined}
            >
              {type} ({count})
            </button>
          );
        })}
      </div>

      {/* 3D Graph Canvas */}
      <div ref={containerRef} style={{ height: 500 }} onClick={handleBackgroundClick}>
        <ForceGraph3D
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ref={graphRef as any}
          graphData={graphData}
          width={dimensions.width}
          height={500}
          backgroundColor="rgba(0,0,0,0)"
          nodeThreeObject={nodeThreeObject}
          nodeThreeObjectExtend={false}
          linkColor={(link: Record<string, unknown>) => (link.color as string) || "rgba(255,255,255,0.08)"}
          linkWidth={0.5}
          linkOpacity={0.6}
          linkDirectionalParticles={2}
          linkDirectionalParticleWidth={0.8}
          linkDirectionalParticleSpeed={0.005}
          linkDirectionalParticleColor={(link: Record<string, unknown>) => (link.color as string) || "rgba(255,255,255,0.3)"}
          onNodeClick={handleNodeClick}
          enableNavigationControls
          showNavInfo={false}
          warmupTicks={50}
          cooldownTicks={100}
        />
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 px-4 py-2 border-t border-white/[0.06] overflow-x-auto">
        <span className="text-[9px] text-white/25 uppercase tracking-wider shrink-0">Legend:</span>
        {Object.entries(NODE_COLORS).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1 shrink-0">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-[9px] text-white/30">{type}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
