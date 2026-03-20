import type { GapAnalysis, DimensionScore } from "../../lib/types";

interface Props {
  gaps: GapAnalysis[];
  dimensionScores: DimensionScore[];
  dimLabels?: Record<string, string>;
}

function formatDimLabel(id: string): string {
  return id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function GapAnalysisGrid({ gaps, dimensionScores, dimLabels = {} }: Props) {
  if (gaps.length === 0) return null;

  return (
    <div className="space-y-4">
      {gaps.map((g, i) => {
        const s1 = dimensionScores.find((s) => s.dimension === g.dimension1);
        const s2 = dimensionScores.find((s) => s.dimension === g.dimension2);
        return (
          <div key={i} className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-orange-300 capitalize">{g.pattern.replace(/_/g, " ")}</span>
              <span className="text-xs text-orange-300/60">Severity: {g.severity}</span>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-muted-foreground">
                {dimLabels[g.dimension1] || formatDimLabel(g.dimension1)}: <strong className="text-foreground">{s1?.score ?? "?"}</strong>
              </span>
              <span className="text-muted-foreground/50">vs</span>
              <span className="text-muted-foreground">
                {dimLabels[g.dimension2] || formatDimLabel(g.dimension2)}: <strong className="text-foreground">{s2?.score ?? "?"}</strong>
              </span>
            </div>
            <p className="text-sm text-muted-foreground">{g.description}</p>
            <p className="text-xs text-orange-300/80 font-medium">{g.serviceRecommendation}</p>
          </div>
        );
      })}
    </div>
  );
}
