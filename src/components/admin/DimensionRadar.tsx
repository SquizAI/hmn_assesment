import { useMemo } from "react";

interface DimensionData {
  dimension: string;
  average: number;
  count: number;
}

interface DimensionRadarProps {
  dimensions: DimensionData[];
  loading?: boolean;
}

const DIMENSION_LABELS: Record<string, string> = {
  ai_awareness: "AI Awareness",
  ai_action: "AI Action",
  process_readiness: "Process",
  strategic_clarity: "Strategy",
  change_energy: "Change",
  team_capacity: "Team",
  mission_alignment: "Mission",
  investment_readiness: "Investment",
};

export default function DimensionRadar({ dimensions, loading }: DimensionRadarProps) {
  const { polygon, gridLines, labelPositions, avgScore } = useMemo(() => {
    if (dimensions.length === 0) {
      return { polygon: "", gridLines: { rings: [] as string[], axes: [] as { x2: number; y2: number }[] }, labelPositions: [] as { x: number; y: number; label: string; score: number; anchor: "start" | "middle" | "end" }[], avgScore: 0 };
    }

    const cx = 50;
    const cy = 50;
    const R = 38; // max radius
    const n = dimensions.length;

    // Grid rings at 25%, 50%, 75%, 100%
    const rings = [0.25, 0.5, 0.75, 1.0];
    const grids = rings.map((pct) => {
      const pts = [];
      for (let i = 0; i < n; i++) {
        const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
        pts.push({
          x: cx + Math.cos(angle) * R * pct,
          y: cy + Math.sin(angle) * R * pct,
        });
      }
      return pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + " Z";
    });

    // Axis lines
    const axes = [];
    for (let i = 0; i < n; i++) {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
      axes.push({
        x2: cx + Math.cos(angle) * R,
        y2: cy + Math.sin(angle) * R,
      });
    }

    // Data polygon
    const dataPts = dimensions.map((d, i) => {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
      const r = (d.average / 100) * R;
      return {
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r,
      };
    });
    const dataPath = dataPts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + " Z";

    // Label positions (just outside the octagon)
    const labels = dimensions.map((d, i) => {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
      const labelR = R + 9;
      return {
        x: cx + Math.cos(angle) * labelR,
        y: cy + Math.sin(angle) * labelR,
        label: DIMENSION_LABELS[d.dimension] || d.dimension.replace(/_/g, " "),
        score: Math.round(d.average),
        anchor: (Math.abs(Math.cos(angle)) < 0.1 ? "middle" : Math.cos(angle) > 0 ? "start" : "end") as "start" | "middle" | "end",
      };
    });

    const avg = dimensions.reduce((sum, d) => sum + d.average, 0) / dimensions.length;

    return {
      polygon: dataPath,
      gridLines: { rings: grids, axes },
      labelPositions: labels,
      avgScore: Math.round(avg),
    };
  }, [dimensions]);

  if (loading) {
    return (
      <div className="bg-white/[0.03] rounded-2xl border border-white/10 p-6">
        <div className="h-4 w-28 bg-white/5 rounded animate-pulse mb-4" />
        <div className="h-52 bg-white/5 rounded-full animate-pulse mx-auto w-52" />
      </div>
    );
  }

  if (dimensions.length === 0) {
    return (
      <div className="bg-white/[0.03] rounded-2xl border border-white/10 p-6">
        <h2 className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-4">
          Dimension Radar
        </h2>
        <div className="h-52 flex items-center justify-center text-white/30 text-sm">
          No dimension data yet
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/[0.03] rounded-2xl border border-white/10 p-4 md:p-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-white/60 uppercase tracking-wider">
          Dimension Radar
        </h2>
        <div className="flex items-center gap-1.5">
          <span className="text-lg font-bold text-white/90 tabular-nums">{avgScore}</span>
          <span className="text-xs text-white/40">/100 avg</span>
        </div>
      </div>

      <div className="flex items-center justify-center">
        <svg viewBox="0 0 100 100" className="w-full max-w-[280px]" style={{ aspectRatio: "1" }}>
          <defs>
            <linearGradient id="radarGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(139,92,246,0.35)" />
              <stop offset="100%" stopColor="rgba(59,130,246,0.15)" />
            </linearGradient>
          </defs>

          {/* Grid rings */}
          {gridLines.rings?.map((ring, i) => (
            <path key={i} d={ring} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="0.3" />
          ))}

          {/* Axis lines */}
          {gridLines.axes?.map((axis, i) => (
            <line key={i} x1="50" y1="50" x2={axis.x2} y2={axis.y2} stroke="rgba(255,255,255,0.06)" strokeWidth="0.2" />
          ))}

          {/* Data polygon */}
          <path d={polygon} fill="url(#radarGrad)" stroke="rgba(139,92,246,0.7)" strokeWidth="0.6" />

          {/* Data points */}
          {dimensions.map((d, i) => {
            const n = dimensions.length;
            const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
            const r = (d.average / 100) * 38;
            const x = 50 + Math.cos(angle) * r;
            const y = 50 + Math.sin(angle) * r;
            return (
              <circle key={i} cx={x} cy={y} r="1" fill="#8b5cf6" stroke="rgba(255,255,255,0.4)" strokeWidth="0.3" />
            );
          })}

          {/* Labels */}
          {labelPositions.map((lbl, i) => (
            <g key={i}>
              <text
                x={lbl.x}
                y={lbl.y - 1.5}
                textAnchor={lbl.anchor}
                className="fill-white/50"
                style={{ fontSize: "3px", fontWeight: 500 }}
              >
                {lbl.label}
              </text>
              <text
                x={lbl.x}
                y={lbl.y + 2.5}
                textAnchor={lbl.anchor}
                className={lbl.score >= 70 ? "fill-green-400" : lbl.score >= 45 ? "fill-yellow-400" : "fill-red-400"}
                style={{ fontSize: "2.8px", fontWeight: 700 }}
              >
                {lbl.score}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
