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

const LINK_LABELS: Record<string, string> = {
  WORKS_AT: "Works At",
  COMPLETED: "Completed",
  FOR_ASSESSMENT: "For Assessment",
  SCORED: "Scored",
  CLASSIFIED_AS: "Classified As",
  SURFACED: "Surfaced",
  TRIGGERED: "Triggered",
  FLAGGED: "Flagged",
  HIGHLIGHTED: "Highlighted",
  RELATES_TO: "Relates To",
  USES_TOOL: "Uses Tool",
  HAS_PAIN_POINT: "Has Pain Point",
  HAS_GOAL: "Has Goal",
  QUOTED: "Quoted",
};

const DEFAULT_COLOR = "#666666";

// ============================================================
// Component
// ============================================================

export default function GraphVisualization({ nodes: rawNodes, edges: rawEdges, loading }: GraphVisualizationProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fullscreenRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<any>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [activeNodeTypes, setActiveNodeTypes] = useState<Set<string>>(new Set());
  const [activeEdgeTypes, setActiveEdgeTypes] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showEdgeFilters, setShowEdgeFilters] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });

  // Initialize active types from data
  useEffect(() => {
    if (rawNodes.length > 0 && activeNodeTypes.size === 0) {
      setActiveNodeTypes(new Set(rawNodes.map((n) => n.type)));
    }
  }, [rawNodes, activeNodeTypes.size]);

  useEffect(() => {
    if (rawEdges.length > 0 && activeEdgeTypes.size === 0) {
      setActiveEdgeTypes(new Set(rawEdges.map((e) => e.type)));
    }
  }, [rawEdges, activeEdgeTypes.size]);

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

  // Fullscreen toggle with Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen) setIsFullscreen(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isFullscreen]);

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

  // Selected node detail info
  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return rawNodes.find((n) => n.id === selectedNodeId) || null;
  }, [selectedNodeId, rawNodes]);

  const selectedNodeConnections = useMemo(() => {
    if (!selectedNodeId) return [];
    return rawEdges
      .filter((e) => e.source === selectedNodeId || e.target === selectedNodeId)
      .map((e) => {
        const otherId = e.source === selectedNodeId ? e.target : e.source;
        const otherNode = rawNodes.find((n) => n.id === otherId);
        return {
          direction: e.source === selectedNodeId ? "out" : "in",
          type: e.type,
          node: otherNode,
        };
      });
  }, [selectedNodeId, rawEdges, rawNodes]);

  // Search-matched node IDs
  const searchMatchIds = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.toLowerCase();
    return new Set(rawNodes.filter((n) => n.label.toLowerCase().includes(q) || n.type.toLowerCase().includes(q)).map((n) => n.id));
  }, [searchQuery, rawNodes]);

  // Filter + transform data for the 3D graph
  const graphData = useMemo(() => {
    let filteredNodes = rawNodes.filter((n) => activeNodeTypes.has(n.type));

    // If searching, further filter to only matched nodes + their neighbors
    if (searchMatchIds && searchMatchIds.size > 0) {
      const expandedIds = new Set(searchMatchIds);
      for (const e of rawEdges) {
        if (searchMatchIds.has(e.source)) expandedIds.add(e.target);
        if (searchMatchIds.has(e.target)) expandedIds.add(e.source);
      }
      filteredNodes = filteredNodes.filter((n) => expandedIds.has(n.id));
    }

    const filteredIds = new Set(filteredNodes.map((n) => n.id));

    const nodes = filteredNodes.map((n) => ({
      id: n.id,
      nodeType: n.type,
      label: n.label,
      color: NODE_COLORS[n.type] || DEFAULT_COLOR,
      val: NODE_SIZES[n.type] || 4,
    }));

    const links = rawEdges
      .filter((e) => filteredIds.has(e.source) && filteredIds.has(e.target) && activeEdgeTypes.has(e.type))
      .map((e) => ({
        source: e.source,
        target: e.target,
        relType: e.type,
        color: LINK_COLORS[e.type] || "rgba(255,255,255,0.08)",
      }));

    return { nodes, links };
  }, [rawNodes, rawEdges, activeNodeTypes, activeEdgeTypes, searchMatchIds]);

  // Node type counts for filter bar
  const nodeTypeList = useMemo(() => {
    const types = new Map<string, number>();
    for (const n of rawNodes) types.set(n.type, (types.get(n.type) || 0) + 1);
    return Array.from(types.entries()).sort((a, b) => b[1] - a[1]);
  }, [rawNodes]);

  // Edge type counts
  const edgeTypeList = useMemo(() => {
    const types = new Map<string, number>();
    for (const e of rawEdges) types.set(e.type, (types.get(e.type) || 0) + 1);
    return Array.from(types.entries()).sort((a, b) => b[1] - a[1]);
  }, [rawEdges]);

  // Custom node rendering — glowing spheres
  const nodeThreeObject = useCallback(
    (node: Record<string, unknown>) => {
      const nodeType = (node.nodeType as string) || "";
      const color = NODE_COLORS[nodeType] || DEFAULT_COLOR;
      const size = NODE_SIZES[nodeType] || 4;
      const isHighlighted = connectedSet ? connectedSet.has(node.id as string) : false;
      const isDimmed = connectedSet ? !connectedSet.has(node.id as string) : false;
      const isSearchMatch = searchMatchIds ? searchMatchIds.has(node.id as string) : false;

      const group = new THREE.Group();

      // Sphere
      const geometry = new THREE.SphereGeometry(size * 0.6, 16, 12);
      const material = new THREE.MeshPhongMaterial({
        color: new THREE.Color(color),
        transparent: true,
        opacity: isDimmed ? 0.15 : isHighlighted || isSearchMatch ? 1.0 : 0.85,
        emissive: new THREE.Color(color),
        emissiveIntensity: isHighlighted ? 0.6 : isSearchMatch ? 0.5 : 0.2,
        shininess: 80,
      });
      const sphere = new THREE.Mesh(geometry, material);
      group.add(sphere);

      // Glow ring for highlighted or search-matched nodes
      if (isHighlighted || isSearchMatch) {
        const ringGeo = new THREE.RingGeometry(size * 0.8, size * 1.0, 24);
        const ringMat = new THREE.MeshBasicMaterial({
          color: new THREE.Color(isSearchMatch && !isHighlighted ? "#facc15" : color),
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
      ctx.font = "bold 22px var(--font-sans), sans-serif";
      ctx.textAlign = "center";
      const isDark = document.documentElement.classList.contains("dark");
      const textColor = isDark ? "255,255,255" : "0,0,0";
      ctx.fillStyle = isDimmed ? `rgba(${textColor},0.15)` : `rgba(${textColor},0.85)`;
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
    [connectedSet, searchMatchIds],
  );

  const handleNodeClick = useCallback((node: Record<string, unknown>) => {
    const id = node.id as string;
    setSelectedNodeId((prev) => (prev === id ? null : id));
  }, []);

  const handleBackgroundClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const handleZoomToFit = useCallback(() => {
    graphRef.current?.zoomToFit(400, 40);
  }, []);

  const toggleNodeType = useCallback((type: string) => {
    setActiveNodeTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  const toggleEdgeType = useCallback((type: string) => {
    setActiveEdgeTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  const selectAllNodeTypes = useCallback(() => {
    setActiveNodeTypes(new Set(rawNodes.map((n) => n.type)));
  }, [rawNodes]);

  const clearAllNodeTypes = useCallback(() => {
    setActiveNodeTypes(new Set());
  }, []);

  const selectAllEdgeTypes = useCallback(() => {
    setActiveEdgeTypes(new Set(rawEdges.map((e) => e.type)));
  }, [rawEdges]);

  const clearAllEdgeTypes = useCallback(() => {
    setActiveEdgeTypes(new Set());
  }, []);

  if (loading) {
    return (
      <div className="bg-muted rounded-2xl border border-border p-6 h-[500px] flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Loading graph...</div>
      </div>
    );
  }

  if (rawNodes.length === 0) {
    return (
      <div className="bg-muted rounded-2xl border border-border p-6 h-[500px] flex items-center justify-center">
        <div className="text-muted-foreground text-sm">No graph data available. Seed the graph to populate.</div>
      </div>
    );
  }

  const graphHeight = isFullscreen ? dimensions.height : 500;

  return (
    <div
      ref={fullscreenRef}
      className={`${
        isFullscreen
          ? "fixed inset-0 z-50 bg-background"
          : "bg-muted rounded-2xl border border-border"
      } overflow-hidden flex flex-col`}
    >
      {/* Top Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border shrink-0">
        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input
            type="text"
            placeholder="Search nodes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-background border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-muted-foreground text-xs">
              &times;
            </button>
          )}
        </div>

        {/* Stats */}
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground shrink-0">
          <span>{graphData.nodes.length} nodes</span>
          <span>{graphData.links.length} edges</span>
          {searchMatchIds && <span className="text-yellow-400/70">{searchMatchIds.size} matches</span>}
        </div>

        <div className="flex-1" />

        {/* Filter toggles */}
        <button
          onClick={() => { setShowFilters((v) => !v); setShowEdgeFilters(false); }}
          className={`px-3 py-1.5 text-[10px] font-medium rounded-lg border transition-colors ${
            showFilters ? "bg-blue-500/20 border-blue-500/30 text-blue-300" : "border-border text-muted-foreground hover:text-muted-foreground"
          }`}
        >
          Node Types
        </button>
        <button
          onClick={() => { setShowEdgeFilters((v) => !v); setShowFilters(false); }}
          className={`px-3 py-1.5 text-[10px] font-medium rounded-lg border transition-colors ${
            showEdgeFilters ? "bg-blue-500/20 border-blue-500/30 text-blue-300" : "border-border text-muted-foreground hover:text-muted-foreground"
          }`}
        >
          Edge Types
        </button>

        {/* Zoom to fit */}
        <button
          onClick={handleZoomToFit}
          className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground/80 hover:bg-muted transition-colors"
          title="Zoom to fit"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
        </button>

        {/* Fullscreen toggle */}
        <button
          onClick={() => setIsFullscreen((f) => !f)}
          className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground/80 hover:bg-muted transition-colors"
          title={isFullscreen ? "Exit fullscreen (Esc)" : "Fullscreen"}
        >
          {isFullscreen ? (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" /></svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" /></svg>
          )}
        </button>
      </div>

      {/* Node Type Filter Panel (collapsible) */}
      {showFilters && (
        <div className="px-4 py-3 border-b border-border bg-muted shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Node Types</span>
            <div className="flex gap-2">
              <button onClick={selectAllNodeTypes} className="text-[10px] text-blue-400/70 hover:text-blue-300">Select All</button>
              <button onClick={clearAllNodeTypes} className="text-[10px] text-red-400/70 hover:text-red-300">Clear All</button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {nodeTypeList.map(([type, count]) => {
              const color = NODE_COLORS[type] || DEFAULT_COLOR;
              const isActive = activeNodeTypes.has(type);
              return (
                <button
                  key={type}
                  onClick={() => toggleNodeType(type)}
                  className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border transition-all ${
                    isActive
                      ? "border-border bg-muted text-foreground/90"
                      : "border-border text-muted-foreground opacity-50"
                  }`}
                  style={isActive ? { borderColor: `${color}60`, backgroundColor: `${color}15` } : undefined}
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: isActive ? color : "#444" }} />
                  {type}
                  <span className="text-muted-foreground">({count})</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Edge Type Filter Panel (collapsible) */}
      {showEdgeFilters && (
        <div className="px-4 py-3 border-b border-border bg-muted shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Relationship Types</span>
            <div className="flex gap-2">
              <button onClick={selectAllEdgeTypes} className="text-[10px] text-blue-400/70 hover:text-blue-300">Select All</button>
              <button onClick={clearAllEdgeTypes} className="text-[10px] text-red-400/70 hover:text-red-300">Clear All</button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {edgeTypeList.map(([type, count]) => {
              const color = LINK_COLORS[type] || "rgba(255,255,255,0.12)";
              const isActive = activeEdgeTypes.has(type);
              return (
                <button
                  key={type}
                  onClick={() => toggleEdgeType(type)}
                  className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border transition-all ${
                    isActive
                      ? "border-border bg-muted text-foreground/90"
                      : "border-border text-muted-foreground opacity-50"
                  }`}
                >
                  <span className="w-3 h-0.5 rounded-full shrink-0" style={{ backgroundColor: isActive ? color.replace(/[\d.]+\)$/, "0.8)") : "#444" }} />
                  {LINK_LABELS[type] || type}
                  <span className="text-muted-foreground">({count})</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 3D Graph Canvas + Detail Panel */}
      <div className="flex-1 flex relative" style={{ minHeight: isFullscreen ? 0 : 500 }}>
        <div ref={containerRef} className="flex-1" style={{ height: isFullscreen ? "100%" : 500 }} onClick={handleBackgroundClick}>
          <ForceGraph3D
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ref={graphRef as any}
            graphData={graphData}
            width={dimensions.width - (selectedNode ? 320 : 0)}
            height={graphHeight}
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

        {/* Node Detail Panel */}
        {selectedNode && (
          <div className="w-80 shrink-0 border-l border-border bg-background/50 backdrop-blur-md overflow-y-auto">
            <div className="p-4">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: NODE_COLORS[selectedNode.type] || DEFAULT_COLOR }} />
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-foreground truncate">{selectedNode.label}</h4>
                    <p className="text-[10px] text-muted-foreground">{selectedNode.type}</p>
                  </div>
                </div>
                <button onClick={() => setSelectedNodeId(null)} className="text-muted-foreground hover:text-muted-foreground text-xs shrink-0 ml-2">&times;</button>
              </div>

              {/* Properties */}
              {Object.keys(selectedNode.properties).length > 0 && (
                <div className="mb-4">
                  <h5 className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Properties</h5>
                  <div className="space-y-1.5">
                    {Object.entries(selectedNode.properties).slice(0, 12).map(([key, value]) => (
                      <div key={key} className="flex items-start gap-2 text-xs">
                        <span className="text-muted-foreground shrink-0 min-w-0">{key}:</span>
                        <span className="text-foreground/80 break-all">{typeof value === "object" ? JSON.stringify(value).slice(0, 80) : String(value).slice(0, 80)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Connections */}
              <div>
                <h5 className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
                  Connections ({selectedNodeConnections.length})
                </h5>
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {selectedNodeConnections.map((conn, i) => (
                    <button
                      key={i}
                      onClick={(e) => { e.stopPropagation(); if (conn.node) setSelectedNodeId(conn.node.id); }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted text-left transition-colors group"
                    >
                      <span className="text-[10px] text-muted-foreground w-4 shrink-0">{conn.direction === "out" ? "\u2192" : "\u2190"}</span>
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: conn.node ? NODE_COLORS[conn.node.type] || DEFAULT_COLOR : "#444" }} />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-muted-foreground group-hover:text-foreground/90 truncate">{conn.node?.label || "Unknown"}</p>
                        <p className="text-[9px] text-muted-foreground">{LINK_LABELS[conn.type] || conn.type}</p>
                      </div>
                    </button>
                  ))}
                  {selectedNodeConnections.length === 0 && (
                    <p className="text-xs text-muted-foreground px-2">No connections</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Legend */}
      <div className="flex items-center gap-3 px-4 py-2 border-t border-border overflow-x-auto shrink-0">
        <span className="text-[9px] text-muted-foreground uppercase tracking-wider shrink-0">Legend:</span>
        {Object.entries(NODE_COLORS)
          .filter(([type]) => activeNodeTypes.has(type))
          .map(([type, color]) => (
            <div key={type} className="flex items-center gap-1 shrink-0">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-[9px] text-muted-foreground">{type}</span>
            </div>
          ))}
      </div>
    </div>
  );
}
