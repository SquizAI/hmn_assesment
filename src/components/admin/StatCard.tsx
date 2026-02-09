interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  color?: "default" | "green" | "yellow" | "red" | "blue" | "purple";
}

const COLOR_MAP: Record<string, string> = {
  default: "text-white",
  green: "text-green-400",
  yellow: "text-yellow-400",
  red: "text-red-400",
  blue: "text-blue-400",
  purple: "text-purple-400",
};

export default function StatCard({ label, value, sub, color = "default" }: StatCardProps) {
  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 hover:bg-white/[0.05] transition-colors">
      <div className="text-xs text-white/40 uppercase tracking-wider mb-2">{label}</div>
      <div className={`text-3xl font-bold tabular-nums ${COLOR_MAP[color]}`}>{value}</div>
      {sub && <div className="text-xs text-white/30 mt-1">{sub}</div>}
    </div>
  );
}
