import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import StatusBadge from "../components/admin/StatusBadge";

interface Campaign {
  id: string;
  name: string;
  status: string;
  total_contacts: number;
  calls_completed: number;
  calls_failed: number;
  calls_pending: number;
  scheduled_at: string | null;
  calling_window_start: string | null;
  calling_window_end: string | null;
  timezone: string;
  max_concurrent_calls: number;
  created_at: string;
  updated_at: string;
}

const US_TIMEZONES = [
  { value: "America/New_York", label: "Eastern (ET)" },
  { value: "America/Chicago", label: "Central (CT)" },
  { value: "America/Denver", label: "Mountain (MT)" },
  { value: "America/Los_Angeles", label: "Pacific (PT)" },
  { value: "America/Anchorage", label: "Alaska (AKT)" },
  { value: "Pacific/Honolulu", label: "Hawaii (HT)" },
  { value: "America/Phoenix", label: "Arizona (MST)" },
];

export default function AdminCampaignsPage() {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [enableScheduling, setEnableScheduling] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [windowStart, setWindowStart] = useState("09:00");
  const [windowEnd, setWindowEnd] = useState("17:00");
  const [timezone, setTimezone] = useState("America/New_York");
  const [maxConcurrent, setMaxConcurrent] = useState(3);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchCampaigns = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/campaigns", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch campaigns");
      const data = await res.json();
      setCampaigns(data.campaigns || []);
    } catch (err) {
      console.error("Failed to load campaigns:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCampaigns(); }, []);

  const resetForm = () => {
    setNewName("");
    setEnableScheduling(false);
    setScheduleDate("");
    setScheduleTime("09:00");
    setWindowStart("09:00");
    setWindowEnd("17:00");
    setTimezone("America/New_York");
    setMaxConcurrent(3);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const payload: Record<string, unknown> = { name: newName.trim() };
      if (enableScheduling && scheduleDate && scheduleTime) {
        const scheduledAt = new Date(`${scheduleDate}T${scheduleTime}:00`);
        payload.scheduled_at = scheduledAt.toISOString();
        payload.calling_window_start = windowStart;
        payload.calling_window_end = windowEnd;
        payload.timezone = timezone;
        payload.max_concurrent_calls = maxConcurrent;
      }
      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to create campaign");
      resetForm();
      setShowNewForm(false);
      showToast("Campaign created", "success");
      fetchCampaigns();
    } catch (err) {
      showToast("Failed to create campaign", "error");
      console.error("Failed to create campaign:", err);
    } finally {
      setCreating(false);
    }
  };

  const getProgress = (c: Campaign) => {
    if (c.total_contacts === 0) return 0;
    return Math.round((c.calls_completed / c.total_contacts) * 100);
  };

  const formatScheduledDate = (isoString: string) =>
    new Date(isoString).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });

  const getMinDate = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split("T")[0];
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <div className="text-white/30 text-sm">Loading campaigns...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      {toast && <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl text-sm font-medium shadow-lg border transition-all ${toast.type === "success" ? "bg-green-500/20 text-green-400 border-green-500/30" : "bg-red-500/20 text-red-400 border-red-500/30"}`}>{toast.message}</div>}

      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-white">Campaigns</h1>
        <button onClick={() => setShowNewForm(!showNewForm)} className="px-5 py-2.5 text-sm font-medium rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-500 hover:to-blue-500 transition-all">
          New Campaign
        </button>
      </div>

      {showNewForm && (
        <div className="mb-6 p-6 bg-white/5 border border-white/10 rounded-2xl">
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="flex items-center gap-4">
              <input type="text" placeholder="Campaign name..." value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-white/30 focus:border-white/30 focus:outline-none" />
            </div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setEnableScheduling(!enableScheduling)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${enableScheduling ? "bg-purple-600" : "bg-white/10"}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${enableScheduling ? "translate-x-6" : "translate-x-1"}`} />
              </button>
              <span className="text-sm text-white/60">Schedule for later</span>
            </div>
            {enableScheduling && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4 bg-white/5 border border-white/10 rounded-xl">
                <div>
                  <label className="block text-xs text-white/40 mb-1.5">Schedule Date</label>
                  <input type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} min={getMinDate()} required={enableScheduling} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-white/30 focus:outline-none [color-scheme:dark]" />
                </div>
                <div>
                  <label className="block text-xs text-white/40 mb-1.5">Schedule Time</label>
                  <input type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} required={enableScheduling} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-white/30 focus:outline-none [color-scheme:dark]" />
                </div>
                <div>
                  <label className="block text-xs text-white/40 mb-1.5">Timezone</label>
                  <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-white/30 focus:outline-none appearance-none">
                    {US_TIMEZONES.map((tz) => <option key={tz.value} value={tz.value} className="bg-gray-900">{tz.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-white/40 mb-1.5">Window Start</label>
                  <input type="time" value={windowStart} onChange={(e) => setWindowStart(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-white/30 focus:outline-none [color-scheme:dark]" />
                </div>
                <div>
                  <label className="block text-xs text-white/40 mb-1.5">Window End</label>
                  <input type="time" value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-white/30 focus:outline-none [color-scheme:dark]" />
                </div>
                <div>
                  <label className="block text-xs text-white/40 mb-1.5">Max Concurrent Calls</label>
                  <input type="number" value={maxConcurrent} onChange={(e) => setMaxConcurrent(Math.max(1, parseInt(e.target.value) || 1))} min={1} max={20} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-white/30 focus:outline-none" />
                </div>
              </div>
            )}
            <div className="flex items-center gap-3">
              <button type="submit" disabled={creating || !newName.trim() || (enableScheduling && !scheduleDate)} className="px-5 py-2.5 text-sm font-medium rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-500 hover:to-blue-500 disabled:opacity-50 transition-all">
                {creating ? "Creating..." : enableScheduling ? "Create & Schedule" : "Create"}
              </button>
              <button type="button" onClick={() => { resetForm(); setShowNewForm(false); }} className="px-4 py-2.5 text-sm text-white/40 hover:text-white/60 transition-colors">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {campaigns.length === 0 ? (
        <div className="text-center py-16 bg-white/5 border border-white/10 rounded-2xl">
          <svg className="w-12 h-12 mx-auto text-white/20 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 010 3.46" />
          </svg>
          <p className="text-white/40 text-sm">No campaigns yet. Create your first campaign to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {campaigns.map((campaign) => {
            const progress = getProgress(campaign);
            return (
              <div key={campaign.id} onClick={() => navigate(`/admin/campaigns/${campaign.id}`)} className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/[0.07] hover:border-white/20 transition-all cursor-pointer group">
                <div className="flex items-start justify-between mb-4">
                  <h3 className="text-base font-semibold text-white group-hover:text-white/90 truncate pr-2">{campaign.name}</h3>
                  <StatusBadge status={campaign.status} size="sm" />
                </div>
                {campaign.status === "scheduled" && campaign.scheduled_at && (
                  <div className="mb-3 px-3 py-2 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                    <div className="flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-xs text-purple-400">{formatScheduledDate(campaign.scheduled_at)}</span>
                    </div>
                  </div>
                )}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-white/40">Progress</span>
                    <span className="text-xs text-white/60 font-medium">{progress}%</span>
                  </div>
                  <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-400" /><span className="text-white/40">{campaign.calls_completed} completed</span></div>
                  <div className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-400" /><span className="text-white/40">{campaign.calls_failed} failed</span></div>
                  <div className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-white/30" /><span className="text-white/40">{campaign.calls_pending} pending</span></div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
