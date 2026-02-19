const STATUS_STYLES: Record<string, string> = {
  intake: "bg-gray-500/20 text-gray-300 border-gray-500/30",
  in_progress: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  completed: "bg-green-500/20 text-green-300 border-green-500/30",
  analyzed: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  draft: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  active: "bg-green-500/20 text-green-300 border-green-500/30",
  archived: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  sent: "bg-sky-500/20 text-sky-300 border-sky-500/30",
  opened: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  started: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
};

const STATUS_LABELS: Record<string, string> = {
  intake: "Intake",
  in_progress: "In Progress",
  completed: "Completed",
  analyzed: "Analyzed",
  draft: "Draft",
  active: "Active",
  archived: "Archived",
  sent: "Sent",
  opened: "Opened",
  started: "Started",
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_STYLES[status] || "bg-white/10 text-white/50 border-white/20"}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}
