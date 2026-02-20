import { useMemo, useState } from "react";

interface TimelinePoint {
  date: string;
  sessions: number;
  cumulativeSessions: number;
}

interface GrowthTimelineProps {
  data: TimelinePoint[];
  loading?: boolean;
}

export default function GrowthTimeline({ data, loading }: GrowthTimelineProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const { path, areaPath, points, maxY, xLabels, yLabels } = useMemo(() => {
    if (data.length === 0) return { path: "", areaPath: "", points: [], maxY: 0, xLabels: [], yLabels: [] };

    const W = 100; // viewBox width percentage
    const H = 100; // viewBox height percentage
    const PAD_X = 8;
    const PAD_Y = 8;
    const plotW = W - PAD_X * 2;
    const plotH = H - PAD_Y * 2;

    const maxVal = Math.max(...data.map((d) => d.cumulativeSessions), 1);
    // Round up to nearest nice number
    const niceMax = Math.ceil(maxVal / 5) * 5 || 5;

    const pts = data.map((d, i) => {
      const x = PAD_X + (i / Math.max(data.length - 1, 1)) * plotW;
      const y = PAD_Y + plotH - (d.cumulativeSessions / niceMax) * plotH;
      return { x, y, ...d };
    });

    // SVG path
    const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
    // Area path (fill under curve)
    const area =
      linePath +
      ` L ${pts[pts.length - 1].x} ${PAD_Y + plotH} L ${pts[0].x} ${PAD_Y + plotH} Z`;

    // X labels (show ~5 evenly spaced dates)
    const labelCount = Math.min(5, data.length);
    const xLbls = [];
    for (let i = 0; i < labelCount; i++) {
      const idx = Math.round((i / (labelCount - 1 || 1)) * (data.length - 1));
      const d = data[idx];
      const p = pts[idx];
      if (d && p) {
        const date = new Date(d.date);
        xLbls.push({ x: p.x, label: `${date.getMonth() + 1}/${date.getDate()}` });
      }
    }

    // Y labels
    const ySteps = 4;
    const yLbls = [];
    for (let i = 0; i <= ySteps; i++) {
      const val = Math.round((niceMax / ySteps) * i);
      const y = PAD_Y + plotH - (val / niceMax) * plotH;
      yLbls.push({ y, label: String(val) });
    }

    return { path: linePath, areaPath: area, points: pts, maxY: niceMax, xLabels: xLbls, yLabels: yLbls };
  }, [data]);

  if (loading) {
    return (
      <div className="bg-white/[0.03] rounded-2xl border border-white/10 p-6">
        <div className="h-4 w-32 bg-white/5 rounded animate-pulse mb-4" />
        <div className="h-48 bg-white/5 rounded animate-pulse" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-white/[0.03] rounded-2xl border border-white/10 p-6">
        <h2 className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-4">
          Growth Timeline
        </h2>
        <div className="h-48 flex items-center justify-center text-white/30 text-sm">
          No timeline data yet
        </div>
      </div>
    );
  }

  const latest = data[data.length - 1];
  const prevWeek = data.length > 7 ? data[data.length - 8] : data[0];
  const growth = prevWeek.cumulativeSessions > 0
    ? Math.round(((latest.cumulativeSessions - prevWeek.cumulativeSessions) / prevWeek.cumulativeSessions) * 100)
    : 100;

  return (
    <div className="bg-white/[0.03] rounded-2xl border border-white/10 p-4 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-semibold text-white/60 uppercase tracking-wider">
          Growth Timeline
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-white/90 tabular-nums">{latest.cumulativeSessions}</span>
          <span className="text-xs text-white/40">total</span>
          {growth !== 0 && (
            <span className={`text-xs font-medium ${growth > 0 ? "text-green-400" : "text-red-400"}`}>
              {growth > 0 ? "+" : ""}{growth}%
            </span>
          )}
        </div>
      </div>

      <div className="relative" style={{ height: 200 }}>
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="w-full h-full"
          onMouseLeave={() => setHoveredIdx(null)}
        >
          <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(139,92,246,0.3)" />
              <stop offset="100%" stopColor="rgba(59,130,246,0.02)" />
            </linearGradient>
          </defs>

          {/* Y grid lines */}
          {yLabels.map((yl, i) => (
            <line
              key={i}
              x1="8"
              x2="92"
              y1={yl.y}
              y2={yl.y}
              stroke="rgba(255,255,255,0.04)"
              strokeWidth="0.3"
            />
          ))}

          {/* Area fill */}
          <path d={areaPath} fill="url(#areaGrad)" />

          {/* Line */}
          <path d={path} fill="none" stroke="rgba(139,92,246,0.8)" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round" />

          {/* Hover targets */}
          {points.map((p, i) => (
            <rect
              key={i}
              x={p.x - 2}
              y="0"
              width="4"
              height="100"
              fill="transparent"
              onMouseEnter={() => setHoveredIdx(i)}
              style={{ cursor: "crosshair" }}
            />
          ))}

          {/* Hovered point */}
          {hoveredIdx !== null && points[hoveredIdx] && (
            <>
              <line
                x1={points[hoveredIdx].x}
                x2={points[hoveredIdx].x}
                y1="8"
                y2="92"
                stroke="rgba(255,255,255,0.15)"
                strokeWidth="0.3"
                strokeDasharray="1,1"
              />
              <circle
                cx={points[hoveredIdx].x}
                cy={points[hoveredIdx].y}
                r="1.2"
                fill="#8b5cf6"
                stroke="rgba(255,255,255,0.5)"
                strokeWidth="0.3"
              />
            </>
          )}
        </svg>

        {/* Y-axis labels */}
        <div className="absolute left-0 top-0 bottom-0 w-8 flex flex-col justify-between pointer-events-none" style={{ paddingTop: '4%', paddingBottom: '4%' }}>
          {[...yLabels].reverse().map((yl, i) => (
            <span key={i} className="text-[9px] text-white/25 tabular-nums text-right pr-1">
              {yl.label}
            </span>
          ))}
        </div>

        {/* X-axis labels */}
        <div className="absolute bottom-0 left-8 right-0 flex justify-between pointer-events-none px-1">
          {xLabels.map((xl, i) => (
            <span key={i} className="text-[9px] text-white/25 tabular-nums">
              {xl.label}
            </span>
          ))}
        </div>

        {/* Tooltip */}
        {hoveredIdx !== null && points[hoveredIdx] && (
          <div
            className="absolute bg-black/80 border border-white/10 rounded-lg px-2.5 py-1.5 pointer-events-none"
            style={{
              left: `${points[hoveredIdx].x}%`,
              top: `${points[hoveredIdx].y - 12}%`,
              transform: "translate(-50%, -100%)",
            }}
          >
            <div className="text-[10px] text-white/50">{points[hoveredIdx].date}</div>
            <div className="text-xs font-medium text-white/90">
              {points[hoveredIdx].cumulativeSessions} sessions
              {points[hoveredIdx].sessions > 0 && (
                <span className="text-green-400 ml-1">+{points[hoveredIdx].sessions}</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
