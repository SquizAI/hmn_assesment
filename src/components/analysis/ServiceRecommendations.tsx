import type { ServiceRecommendation } from "../../lib/types";

interface Props {
  recommendations: ServiceRecommendation[];
}

const TIER_COLORS: Record<number, string> = {
  1: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  2: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  3: "bg-amber-500/20 text-amber-300 border-amber-500/30",
};

const URGENCY_COLORS: Record<string, string> = {
  immediate: "text-red-400",
  near_term: "text-yellow-400",
  strategic: "text-blue-400",
};

export default function ServiceRecommendations({ recommendations }: Props) {
  if (recommendations.length === 0) return null;

  return (
    <div className="space-y-4">
      {recommendations.map((r, i) => (
        <div key={i} className="bg-muted border border-border rounded-xl p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2 flex-1">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded text-xs font-medium border ${TIER_COLORS[r.tier] || TIER_COLORS[3]}`}>
                  Tier {r.tier}
                </span>
                <span className={`text-xs ${URGENCY_COLORS[r.urgency] || "text-muted-foreground"}`}>
                  {r.urgency.replace("_", " ")}
                </span>
              </div>
              <h3 className="font-medium text-foreground">{r.service}</h3>
              <p className="text-sm text-muted-foreground">{r.description}</p>
            </div>
            <div className="text-sm font-medium text-foreground flex-shrink-0">{r.estimatedValue}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
