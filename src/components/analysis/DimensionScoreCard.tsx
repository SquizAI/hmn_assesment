import type { DimensionScore } from "../../lib/types";

interface Props {
  scores: DimensionScore[];
  dimLabels?: Record<string, string>;
  maxScore?: number;
}

function formatDimLabel(id: string): string {
  return id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function DimensionScoreCard({ scores, dimLabels = {}, maxScore = 100 }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {scores.map((s) => {
        const pct = maxScore > 0 ? (s.score / maxScore) * 100 : 0;
        const c = pct >= 70 ? "bg-green-500" : pct >= 45 ? "bg-yellow-500" : "bg-red-500";
        return (
          <div key={s.dimension} className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-white">{dimLabels[s.dimension] || formatDimLabel(s.dimension)}</span>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-white">{s.score}</span>
                <span className="text-xs text-white/30">/ {maxScore}</span>
              </div>
            </div>
            <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${c} transition-all duration-1000`} style={{ width: `${pct}%` }} />
            </div>
            {s.evidence.length > 0 && (
              <p className="text-xs text-white/40 italic truncate">&ldquo;{s.evidence[0]}&rdquo;</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
