interface InsightCardsProps {
  totalSessions: number;
  completionRate: number;
  averageScore: number;
  topArchetype: { name: string; count: number } | null;
  topTheme: { name: string; frequency: number; sentiment: string } | null;
  redFlagCount: number;
  companyCount: number;
  loading?: boolean;
}

function humanize(snake: string): string {
  return snake
    .replace(/^the_/, "")
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function InsightCards({
  totalSessions,
  completionRate,
  averageScore,
  topArchetype,
  topTheme,
  redFlagCount,
  companyCount,
  loading,
}: InsightCardsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white/[0.03] rounded-2xl border border-white/10 p-4 h-24 animate-pulse" />
        ))}
      </div>
    );
  }

  const cards: { label: string; value: string; detail: string; color: string }[] = [];

  // Session velocity
  cards.push({
    label: "Sessions Tracked",
    value: String(totalSessions),
    detail: `${completionRate}% completion rate across ${companyCount} ${companyCount === 1 ? "company" : "companies"}`,
    color: "from-purple-500/20 to-blue-500/20",
  });

  // Average score
  if (averageScore > 0) {
    const level = averageScore >= 70 ? "Strong" : averageScore >= 45 ? "Moderate" : "Early-stage";
    cards.push({
      label: "Avg Readiness",
      value: `${Math.round(averageScore)}/100`,
      detail: `${level} readiness across all assessed participants`,
      color: averageScore >= 70 ? "from-green-500/20 to-emerald-500/20" : averageScore >= 45 ? "from-yellow-500/20 to-amber-500/20" : "from-red-500/20 to-orange-500/20",
    });
  }

  // Top archetype
  if (topArchetype) {
    cards.push({
      label: "Dominant Archetype",
      value: humanize(topArchetype.name),
      detail: `${topArchetype.count} participant${topArchetype.count !== 1 ? "s" : ""} classified as this type`,
      color: "from-cyan-500/20 to-sky-500/20",
    });
  }

  // Top theme or red flag alert
  if (redFlagCount > 2) {
    cards.push({
      label: "Risk Alerts",
      value: `${redFlagCount} flags`,
      detail: "Red flags detected across sessions requiring attention",
      color: "from-red-500/20 to-rose-500/20",
    });
  } else if (topTheme) {
    cards.push({
      label: "Top Theme",
      value: topTheme.name,
      detail: `Mentioned ${topTheme.frequency} time${topTheme.frequency !== 1 ? "s" : ""} — ${topTheme.sentiment} sentiment`,
      color: topTheme.sentiment === "positive" ? "from-green-500/20 to-teal-500/20" : topTheme.sentiment === "negative" ? "from-red-500/20 to-pink-500/20" : "from-gray-500/20 to-slate-500/20",
    });
  }

  if (cards.length === 0) return null;

  return (
    <div className={`grid grid-cols-2 ${cards.length >= 4 ? "lg:grid-cols-4" : cards.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2"} gap-3`}>
      {cards.map((card, i) => (
        <div
          key={i}
          className={`bg-gradient-to-br ${card.color} rounded-2xl border border-white/[0.08] p-4 hover:border-white/15 transition-colors`}
        >
          <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1.5">{card.label}</div>
          <div className="text-lg font-bold text-white/90 truncate">{card.value}</div>
          <div className="text-[11px] text-white/40 mt-1 leading-tight line-clamp-2">{card.detail}</div>
        </div>
      ))}
    </div>
  );
}
