import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchCampaigns as fetchCampaignsApi, createCampaign, fetchCampaignResults } from "../lib/admin-api";
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
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);
  const [campaignResults, setCampaignResults] = useState<{
    profile_count: number;
    avg_score: number | null;
    archetype_breakdown: { archetype: string; count: number }[];
    profiles: Record<string, unknown>[];
  } | null>(null);
  const [loadingResults, setLoadingResults] = useState(false);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchCampaigns = async () => {
    setLoading(true);
    try {
      const data = await fetchCampaignsApi();
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
      await createCampaign(payload);
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

  const handleViewResults = async (e: React.MouseEvent, campaignId: string) => {
    e.stopPropagation();
    if (expandedCampaign === campaignId) {
      setExpandedCampaign(null);
      return;
    }
    setExpandedCampaign(campaignId);
    setLoadingResults(true);
    try {
      const data = await fetchCampaignResults(campaignId);
      setCampaignResults(data);
    } catch {
      setCampaignResults(null);
    } finally {
      setLoadingResults(false);
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
        <div className="text-muted-foreground text-sm">Loading campaigns...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      {toast && <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl text-sm font-medium shadow-lg border transition-all ${toast.type === "success" ? "bg-green-500/20 text-green-400 border-green-500/30" : "bg-red-500/20 text-red-400 border-red-500/30"}`}>{toast.message}</div>}

      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-foreground">Campaigns</h1>
        <button onClick={() => setShowNewForm(!showNewForm)} className="px-5 py-2.5 text-sm font-medium rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:from-blue-500 hover:to-blue-500 transition-all">
          New Campaign
        </button>
      </div>

      {showNewForm && (
        <div className="mb-6 p-6 bg-muted border border-border rounded-2xl">
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="flex items-center gap-4">
              <input type="text" placeholder="Campaign name..." value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus className="flex-1 bg-muted border border-border rounded-lg px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-border focus:outline-none" />
            </div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setEnableScheduling(!enableScheduling)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${enableScheduling ? "bg-blue-600" : "bg-muted"}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${enableScheduling ? "translate-x-6" : "translate-x-1"}`} />
              </button>
              <span className="text-sm text-muted-foreground">Schedule for later</span>
            </div>
            {enableScheduling && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4 bg-muted border border-border rounded-xl">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">Schedule Date</label>
                  <input type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} min={getMinDate()} required={enableScheduling} className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:border-border focus:outline-none [color-scheme:dark]" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">Schedule Time</label>
                  <input type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} required={enableScheduling} className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:border-border focus:outline-none [color-scheme:dark]" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">Timezone</label>
                  <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:border-border focus:outline-none appearance-none">
                    {US_TIMEZONES.map((tz) => <option key={tz.value} value={tz.value} className="bg-muted">{tz.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">Window Start</label>
                  <input type="time" value={windowStart} onChange={(e) => setWindowStart(e.target.value)} className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:border-border focus:outline-none [color-scheme:dark]" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">Window End</label>
                  <input type="time" value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:border-border focus:outline-none [color-scheme:dark]" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">Max Concurrent Calls</label>
                  <input type="number" value={maxConcurrent} onChange={(e) => setMaxConcurrent(Math.max(1, parseInt(e.target.value) || 1))} min={1} max={20} className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:border-border focus:outline-none" />
                </div>
              </div>
            )}
            <div className="flex items-center gap-3">
              <button type="submit" disabled={creating || !newName.trim() || (enableScheduling && !scheduleDate)} className="px-5 py-2.5 text-sm font-medium rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:from-blue-500 hover:to-blue-500 disabled:opacity-50 transition-all">
                {creating ? "Creating..." : enableScheduling ? "Create & Schedule" : "Create"}
              </button>
              <button type="button" onClick={() => { resetForm(); setShowNewForm(false); }} className="px-4 py-2.5 text-sm text-muted-foreground hover:text-muted-foreground transition-colors">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {campaigns.length === 0 ? (
        <div className="text-center py-16 bg-muted border border-border rounded-2xl">
          <svg className="w-12 h-12 mx-auto text-muted-foreground mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 010 3.46" />
          </svg>
          <p className="text-muted-foreground text-sm">No campaigns yet. Create your first campaign to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {campaigns.map((campaign) => {
            const progress = getProgress(campaign);
            return (
              <div key={campaign.id} className="bg-muted border border-border rounded-2xl overflow-hidden hover:border-border transition-all">
                <div onClick={() => navigate(`/admin/campaigns/${campaign.id}`)} className="p-6 hover:bg-foreground/[0.07] cursor-pointer group">
                  <div className="flex items-start justify-between mb-4">
                    <h3 className="text-base font-semibold text-foreground group-hover:text-foreground/90 truncate pr-2">{campaign.name}</h3>
                    <StatusBadge status={campaign.status} size="sm" />
                  </div>
                  {campaign.status === "scheduled" && campaign.scheduled_at && (
                    <div className="mb-3 px-3 py-2 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                      <div className="flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-xs text-blue-400">{formatScheduledDate(campaign.scheduled_at)}</span>
                      </div>
                    </div>
                  )}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs text-muted-foreground">Progress</span>
                      <span className="text-xs text-muted-foreground font-medium">{progress}%</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <div className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-400" /><span className="text-muted-foreground">{campaign.calls_completed} completed</span></div>
                    <div className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-400" /><span className="text-muted-foreground">{campaign.calls_failed} failed</span></div>
                    <div className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-muted" /><span className="text-muted-foreground">{campaign.calls_pending} pending</span></div>
                  </div>
                </div>
                {/* View Results button for completed campaigns */}
                {(campaign.status === "completed" || campaign.status === "active" || campaign.calls_completed > 0) && (
                  <div className="border-t border-border px-6 py-3">
                    <button
                      onClick={(e) => handleViewResults(e, campaign.id)}
                      className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      {expandedCampaign === campaign.id ? "Hide Results" : "View Results"}
                    </button>
                  </div>
                )}
                {expandedCampaign === campaign.id && (
                  <div className="border-t border-border px-6 py-4 bg-muted">
                    {loadingResults ? (
                      <p className="text-xs text-muted-foreground">Loading results...</p>
                    ) : !campaignResults || campaignResults.profile_count === 0 ? (
                      <p className="text-xs text-muted-foreground">No profile results for this campaign yet.</p>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center gap-6">
                          <div>
                            <span className="text-lg font-semibold text-foreground">{campaignResults.profile_count}</span>
                            <p className="text-[10px] text-muted-foreground">Assessed</p>
                          </div>
                          {campaignResults.avg_score !== null && (
                            <div>
                              <span className={`text-lg font-semibold ${
                                campaignResults.avg_score >= 70 ? "text-green-400" : campaignResults.avg_score >= 45 ? "text-yellow-400" : "text-red-400"
                              }`}>
                                {campaignResults.avg_score}
                              </span>
                              <p className="text-[10px] text-muted-foreground">Avg Score</p>
                            </div>
                          )}
                          {campaignResults.archetype_breakdown.length > 0 && (
                            <div>
                              <span className="px-2 py-0.5 text-[10px] font-medium bg-blue-500/10 text-blue-300 rounded-full border border-blue-500/20">
                                {campaignResults.archetype_breakdown[0].archetype}
                              </span>
                              <p className="text-[10px] text-muted-foreground mt-1">Top Archetype</p>
                            </div>
                          )}
                        </div>
                        {campaignResults.archetype_breakdown.length > 1 && (
                          <div className="flex flex-wrap gap-2">
                            {campaignResults.archetype_breakdown.map((a) => (
                              <span key={a.archetype} className="px-2 py-1 text-[10px] bg-muted rounded border border-border text-muted-foreground">
                                {a.archetype}: {a.count}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
