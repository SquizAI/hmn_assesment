const STATUS_STYLES: Record<string, string> = {
  intake: "bg-gray-500/20 text-muted-foreground border-gray-500/30",
  in_progress: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  completed: "bg-green-500/20 text-green-300 border-green-500/30",
  analyzed: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  draft: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  active: "bg-green-500/20 text-green-300 border-green-500/30",
  archived: "bg-gray-500/20 text-muted-foreground border-gray-500/30",
  sent: "bg-sky-500/20 text-sky-300 border-sky-500/30",
  opened: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  started: "bg-primary/20 text-primary border-primary/30",
  queued: "bg-gray-500/20 text-muted-foreground border-gray-500/30",
  ringing: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  failed: "bg-red-500/20 text-red-300 border-red-500/30",
  no_answer: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  new: "bg-sky-500/20 text-sky-300 border-sky-500/30",
  called: "bg-green-500/20 text-green-300 border-green-500/30",
  paused: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  pending: "bg-gray-500/20 text-muted-foreground border-gray-500/30",
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
  queued: "Queued",
  ringing: "Ringing",
  failed: "Failed",
  no_answer: "No Answer",
  new: "New",
  called: "Called",
  paused: "Paused",
  pending: "Pending",
};

export default function StatusBadge({ status, size }: { status: string; size?: "sm" | "md" }) {
  const sizeClass = size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs";
  return (
    <span className={`inline-flex items-center rounded-full font-medium border ${sizeClass} ${STATUS_STYLES[status] || "bg-muted text-muted-foreground border-border"}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}
