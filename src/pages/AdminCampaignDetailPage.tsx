import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { fetchCampaignDetail, deleteCampaign, controlCampaign } from "../lib/admin-api";
import StatusBadge from "../components/admin/StatusBadge";
import ConfirmDialog from "../components/ui/ConfirmDialog";

interface Campaign {
  id: string;
  name: string;
  status: string;
  total_contacts: number;
  calls_completed: number;
  calls_failed: number;
  calls_pending: number;
  scheduled_at: string | null;
  timezone: string;
  max_concurrent_calls: number;
  created_at: string;
}

interface Contact {
  id: string;
  name: string;
  phone: string;
  company: string | null;
  status: string;
}

export default function AdminCampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetchCampaignDetail(id)
      .then((data) => { setCampaign(data.campaign); setContacts(data.contacts || []); })
      .catch(() => navigate("/admin/campaigns"))
      .finally(() => setLoading(false));
  }, [id, navigate]);

  const handleAction = async (action: "start" | "pause" | "delete") => {
    if (!id) return;
    setShowDeleteConfirm(false);
    setActionLoading(true);
    try {
      if (action === "delete") {
        await deleteCampaign(id);
        navigate("/admin/campaigns");
        return;
      }
      await controlCampaign(id, action);
      const data = await fetchCampaignDetail(id);
      setCampaign(data.campaign);
      setContacts(data.contacts || []);
      showToast(`Campaign ${action === "start" ? "started" : "paused"}`, "success");
    } catch (err) {
      showToast(`Failed to ${action} campaign`, "error");
      console.error(`Failed to ${action} campaign:`, err);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading || !campaign) {
    return <div className="flex items-center justify-center h-full min-h-[60vh]"><div className="text-muted-foreground text-sm">Loading...</div></div>;
  }

  const progress = campaign.total_contacts > 0 ? Math.round((campaign.calls_completed / campaign.total_contacts) * 100) : 0;

  return (
    <div className="max-w-5xl mx-auto p-6">
      {toast && <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl text-sm font-medium shadow-lg border transition-all ${toast.type === "success" ? "bg-green-500/20 text-green-400 border-green-500/30" : "bg-red-500/20 text-red-400 border-red-500/30"}`}>{toast.message}</div>}

      <button onClick={() => navigate("/admin/campaigns")} className="text-muted-foreground hover:text-muted-foreground text-sm mb-4 inline-flex items-center gap-1 transition-colors">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
        Back to Campaigns
      </button>

      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">{campaign.name}</h1>
          <p className="text-muted-foreground text-sm mt-1">Created {new Date(campaign.created_at).toLocaleDateString()}</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={campaign.status} />
          {campaign.status === "draft" && (
            <button onClick={() => handleAction("start")} disabled={actionLoading || campaign.total_contacts === 0} className="px-4 py-2 text-sm font-medium rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:from-green-500 hover:to-emerald-500 disabled:opacity-50 transition-all">
              {actionLoading ? "Starting..." : "Start Campaign"}
            </button>
          )}
          {campaign.status === "active" && (
            <button onClick={() => handleAction("pause")} disabled={actionLoading} className="px-4 py-2 text-sm font-medium rounded-lg bg-yellow-600/80 text-foreground hover:bg-yellow-500/80 disabled:opacity-50 transition-all">
              {actionLoading ? "Pausing..." : "Pause"}
            </button>
          )}
          <button onClick={() => setShowDeleteConfirm(true)} disabled={actionLoading} className="px-4 py-2 text-sm font-medium rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600/30 border border-red-500/20 disabled:opacity-50 transition-all">
            Delete
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-muted border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Total Contacts</p>
          <p className="text-2xl font-bold text-foreground mt-1">{campaign.total_contacts}</p>
        </div>
        <div className="bg-muted border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Completed</p>
          <p className="text-2xl font-bold text-green-400 mt-1">{campaign.calls_completed}</p>
        </div>
        <div className="bg-muted border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Failed</p>
          <p className="text-2xl font-bold text-red-400 mt-1">{campaign.calls_failed}</p>
        </div>
        <div className="bg-muted border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Progress</p>
          <p className="text-2xl font-bold text-foreground mt-1">{progress}%</p>
        </div>
      </div>

      {/* Contact List */}
      <div className="bg-muted border border-border rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground/80">Contacts ({contacts.length})</h2>
        </div>
        <table className="w-full">
          <thead>
            <tr className="bg-muted">
              <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Name</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Phone</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Company</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody>
            {contacts.length === 0 ? (
              <tr><td colSpan={4} className="px-6 py-8 text-center text-muted-foreground text-sm">No contacts in this campaign yet.</td></tr>
            ) : (
              contacts.map((c) => (
                <tr key={c.id} className="border-b border-border hover:bg-muted transition-colors">
                  <td className="px-6 py-3 text-sm text-foreground">{c.name}</td>
                  <td className="px-6 py-3 text-sm text-muted-foreground font-mono">{c.phone}</td>
                  <td className="px-6 py-3 text-sm text-muted-foreground">{c.company || "\u2014"}</td>
                  <td className="px-6 py-3"><StatusBadge status={c.status} size="sm" /></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete Campaign"
        message="This will permanently delete the campaign and all its contacts. This action cannot be undone."
        confirmLabel="Delete Campaign"
        onConfirm={() => handleAction("delete")}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}
