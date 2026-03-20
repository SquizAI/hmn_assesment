interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  color?: "default" | "green" | "yellow" | "red" | "blue" | "purple";
}

const COLOR_MAP: Record<string, string> = {
  default: "text-foreground",
  green: "text-green-400",
  yellow: "text-yellow-400",
  red: "text-red-400",
  blue: "text-blue-400",
  purple: "text-purple-400",
};

export default function StatCard({ label, value, sub, color = "default" }: StatCardProps) {
  return (
    <div className="bg-muted border border-border rounded-2xl p-6 hover:bg-muted transition-colors">
      <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">{label}</div>
      <div className={`text-3xl font-bold tabular-nums ${COLOR_MAP[color]}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}
