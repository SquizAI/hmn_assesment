import { useEffect, useState, useCallback } from "react";
import ConfirmDialog from "../components/ui/ConfirmDialog";

interface Webhook {
  id: string;
  campaign_id: string | null;
  url: string;
  secret: string | null;
  events: string[];
  is_active: boolean;
  created_at: string;
}

interface Campaign { id: string; name: string; status: string; }

const ALL_EVENTS = [
  { value: "call_started", label: "Call Started", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  { value: "call_completed", label: "Call Completed", color: "bg-green-500/20 text-green-400 border-green-500/30" },
  { value: "call_failed", label: "Call Failed", color: "bg-red-500/20 text-red-400 border-red-500/30" },
  { value: "campaign_completed", label: "Campaign Completed", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  { value: "assessment_completed", label: "Assessment Completed", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
];

function getEventColor(event: string) { return ALL_EVENTS.find((e) => e.value === event)?.color || "bg-white/10 text-white/60 border-white/20"; }
function getEventLabel(event: string) { return ALL_EVENTS.find((e) => e.value === event)?.label || event; }

export default function AdminWebhooksPage() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<Webhook | null>(null);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [formCampaignId, setFormCampaignId] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formEvents, setFormEvents] = useState<string[]>(["call_completed", "campaign_completed"]);
  const [formSecret, setFormSecret] = useState("");
  const [formActive, setFormActive] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [whRes, campRes] = await Promise.all([
        fetch("/api/admin/webhooks", { credentials: "include" }),
        fetch("/api/admin/campaigns", { credentials: "include" }),
      ]);
      if (whRes.ok) { const d = await whRes.json(); setWebhooks(d.webhooks || []); }
      if (campRes.ok) { const d = await campRes.json(); setCampaigns(d.campaigns || []); }
    } catch (err) { console.error("Failed to load data:", err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const resetForm = () => { setFormCampaignId(""); setFormUrl(""); setFormEvents(["call_completed", "campaign_completed"]); setFormSecret(""); setFormActive(true); setEditingWebhook(null); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formUrl.trim() || formEvents.length === 0) return;
    setSaving(true);
    try {
      if (editingWebhook) {
        const res = await fetch(`/api/admin/webhooks/${editingWebhook.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ url: formUrl.trim(), events: formEvents, secret: formSecret.trim() || null, is_active: formActive }) });
        if (!res.ok) throw new Error("Failed to update");
        showToast("Webhook updated", "success");
      } else {
        const res = await fetch("/api/admin/webhooks", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ url: formUrl.trim(), campaign_id: formCampaignId || null, events: formEvents, secret: formSecret.trim() || null, is_active: formActive }) });
        if (!res.ok) throw new Error("Failed to create");
        showToast("Webhook created", "success");
      }
      resetForm(); setShowForm(false); fetchData();
    } catch (err) { showToast(err instanceof Error ? err.message : "Failed", "error"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    try { await fetch(`/api/admin/webhooks/${id}`, { method: "DELETE", credentials: "include" }); showToast("Deleted", "success"); fetchData(); }
    catch { showToast("Failed to delete", "error"); }
    finally { setDeleteTarget(null); }
  };

  const handleToggle = async (wh: Webhook) => {
    try { await fetch(`/api/admin/webhooks/${wh.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ is_active: !wh.is_active }) }); fetchData(); }
    catch { showToast("Failed to toggle", "error"); }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      const res = await fetch(`/api/admin/webhooks/${id}/test`, { method: "POST", credentials: "include" });
      const data = await res.json();
      showToast(data.success ? `Test successful (${data.status})` : `Test failed: ${data.status}`, data.success ? "success" : "error");
    } catch { showToast("Test request failed", "error"); }
    finally { setTestingId(null); }
  };

  const getCampaignName = (id: string | null) => id ? campaigns.find((c) => c.id === id)?.name || "Unknown" : "No Campaign";

  if (loading) return <div className="flex items-center justify-center h-full min-h-[60vh]"><div className="text-white/30 text-sm">Loading webhooks...</div></div>;

  return (
    <div className="max-w-7xl mx-auto p-6">
      {toast && <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl text-sm font-medium shadow-lg border transition-all ${toast.type === "success" ? "bg-green-500/20 text-green-400 border-green-500/30" : "bg-red-500/20 text-red-400 border-red-500/30"}`}>{toast.message}</div>}

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Webhooks</h1>
          <p className="text-sm text-white/40 mt-1">Configure webhook URLs to receive event notifications</p>
        </div>
        <button onClick={() => { resetForm(); setShowForm(true); }} className="px-5 py-2.5 text-sm font-medium rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-500 hover:to-blue-500 transition-all">Add Webhook</button>
      </div>

      {showForm && (
        <div className="mb-6 p-6 bg-white/5 border border-white/10 rounded-2xl">
          <h2 className="text-lg font-semibold text-white mb-4">{editingWebhook ? "Edit Webhook" : "New Webhook"}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!editingWebhook && (
              <div>
                <label className="block text-xs text-white/40 mb-1.5">Campaign (optional)</label>
                <select value={formCampaignId} onChange={(e) => setFormCampaignId(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:border-white/30 focus:outline-none appearance-none">
                  <option value="" className="bg-gray-900">Global (no campaign)</option>
                  {campaigns.map((c) => <option key={c.id} value={c.id} className="bg-gray-900">{c.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs text-white/40 mb-1.5">Webhook URL</label>
              <input type="url" placeholder="https://example.com/webhook" value={formUrl} onChange={(e) => setFormUrl(e.target.value)} required className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-white/30 focus:border-white/30 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-white/40 mb-2">Events</label>
              <div className="flex flex-wrap gap-2">
                {ALL_EVENTS.map((event) => (
                  <button key={event.value} type="button" onClick={() => setFormEvents((prev) => prev.includes(event.value) ? prev.filter((e) => e !== event.value) : [...prev, event.value])} className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${formEvents.includes(event.value) ? event.color : "bg-white/5 text-white/30 border-white/10"}`}>
                    {event.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs text-white/40 mb-1.5">Secret (optional)</label>
              <input type="text" placeholder="Sent as X-Webhook-Secret header" value={formSecret} onChange={(e) => setFormSecret(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-white/30 focus:border-white/30 focus:outline-none" />
            </div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setFormActive(!formActive)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${formActive ? "bg-purple-600" : "bg-white/10"}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formActive ? "translate-x-6" : "translate-x-1"}`} />
              </button>
              <span className="text-sm text-white/60">Active</span>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button type="submit" disabled={saving || !formUrl.trim() || formEvents.length === 0} className="px-5 py-2.5 text-sm font-medium rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 text-white disabled:opacity-50 transition-all">{saving ? "Saving..." : editingWebhook ? "Update" : "Create"}</button>
              <button type="button" onClick={() => { resetForm(); setShowForm(false); }} className="px-4 py-2.5 text-sm text-white/40 hover:text-white/60">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {webhooks.length === 0 ? (
        <div className="text-center py-16 bg-white/5 border border-white/10 rounded-2xl">
          <p className="text-white/40 text-sm">No webhooks configured. Add a webhook to receive event notifications.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {webhooks.map((wh) => (
            <div key={wh.id} className={`bg-white/5 border rounded-2xl p-5 transition-all ${wh.is_active ? "border-white/10 hover:border-white/20" : "border-white/5 opacity-60"}`}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0 mr-3">
                  <p className="text-sm font-mono text-white/80 truncate" title={wh.url}>{wh.url}</p>
                  <p className="text-xs text-white/30 mt-0.5">{getCampaignName(wh.campaign_id)}</p>
                </div>
                <button onClick={() => handleToggle(wh)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${wh.is_active ? "bg-green-600" : "bg-white/10"}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${wh.is_active ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-4">
                {wh.events.map((event) => <span key={event} className={`px-2 py-0.5 text-[10px] font-medium rounded-md border ${getEventColor(event)}`}>{getEventLabel(event)}</span>)}
              </div>
              <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                <button onClick={() => handleTest(wh.id)} disabled={testingId === wh.id} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white/5 text-white/60 hover:bg-white/10 disabled:opacity-50 transition-all">{testingId === wh.id ? "Testing..." : "Test"}</button>
                <button onClick={() => { setEditingWebhook(wh); setFormUrl(wh.url); setFormEvents([...wh.events]); setFormSecret(wh.secret || ""); setFormActive(wh.is_active); setShowForm(true); }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white/5 text-white/60 hover:bg-white/10 transition-all">Edit</button>
                <button onClick={() => setDeleteTarget(wh.id)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white/5 text-red-400/60 hover:bg-red-500/10 hover:text-red-400 transition-all ml-auto">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Webhook"
        message="This webhook will stop receiving event notifications. This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
