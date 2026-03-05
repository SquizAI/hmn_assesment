import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
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

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/admin/campaigns/${id}`, { credentials: "include" })
      .then((res) => { if (!res.ok) throw new Error("Not found"); return res.json(); })
      .then((data) => { setCampaign(data.campaign); setContacts(data.contacts || []); })
      .catch(() => navigate("/admin/campaigns"))
      .finally(() => setLoading(false));
  }, [id, navigate]);

  const handleAction = async (action: "start" | "pause" | "delete") => {
    if (!id) return;
    if (action === "delete" && !confirm("Delete this campaign and all its contacts?")) return;
    setActionLoading(true);
    try {
      if (action === "delete") {
        await fetch(`/api/admin/campaigns/${id}`, { method: "DELETE", credentials: "include" });
        navigate("/admin/campaigns");
        return;
      }
      await fetch(`/api/admin/campaigns/${id}/${action}`, { method: "POST", credentials: "include" });
      const res = await fetch(`/api/admin/campaigns/${id}`, { credentials: "include" });
      const data = await res.json();
      setCampaign(data.campaign);
      setContacts(data.contacts || []);
    } catch (err) {
      console.error(`Failed to ${action} campaign:`, err);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading || !campaign) {
    return <div className="flex items-center justify-center h-full min-h-[60vh]"><div className="text-white/30 text-sm">Loading...</div></div>;
  }

  const progress = campaign.total_contacts > 0 ? Math.round((campaign.calls_completed / campaign.total_contacts) * 100) : 0;

  return (
    <div className="max-w-5xl mx-auto p-6">
      <button onClick={() => navigate("/admin/campaigns")} className="text-white/40 hover:text-white/60 text-sm mb-4 inline-flex items-center gap-1 transition-colors">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
        Back to Campaigns
      </button>

      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">{campaign.name}</h1>
          <p className="text-white/40 text-sm mt-1">Created {new Date(campaign.created_at).toLocaleDateString()}</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={campaign.status} />
          {campaign.status === "draft" && (
            <button onClick={() => handleAction("start")} disabled={actionLoading || campaign.total_contacts === 0} className="px-4 py-2 text-sm font-medium rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:from-green-500 hover:to-emerald-500 disabled:opacity-50 transition-all">
              {actionLoading ? "Starting..." : "Start Campaign"}
            </button>
          )}
          {campaign.status === "active" && (
            <button onClick={() => handleAction("pause")} disabled={actionLoading} className="px-4 py-2 text-sm font-medium rounded-lg bg-yellow-600/80 text-white hover:bg-yellow-500/80 disabled:opacity-50 transition-all">
              Pause
            </button>
          )}
          <button onClick={() => handleAction("delete")} disabled={actionLoading} className="px-4 py-2 text-sm font-medium rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600/30 border border-red-500/20 disabled:opacity-50 transition-all">
            Delete
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <p className="text-xs text-white/40">Total Contacts</p>
          <p className="text-2xl font-bold text-white mt-1">{campaign.total_contacts}</p>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <p className="text-xs text-white/40">Completed</p>
          <p className="text-2xl font-bold text-green-400 mt-1">{campaign.calls_completed}</p>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <p className="text-xs text-white/40">Failed</p>
          <p className="text-2xl font-bold text-red-400 mt-1">{campaign.calls_failed}</p>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <p className="text-xs text-white/40">Progress</p>
          <p className="text-2xl font-bold text-white mt-1">{progress}%</p>
        </div>
      </div>

      {/* Contact List */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/5">
          <h2 className="text-sm font-semibold text-white/70">Contacts ({contacts.length})</h2>
        </div>
        <table className="w-full">
          <thead>
            <tr className="bg-white/5">
              <th className="text-left px-6 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">Name</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">Phone</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">Company</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody>
            {contacts.length === 0 ? (
              <tr><td colSpan={4} className="px-6 py-8 text-center text-white/30 text-sm">No contacts in this campaign yet.</td></tr>
            ) : (
              contacts.map((c) => (
                <tr key={c.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                  <td className="px-6 py-3 text-sm text-white">{c.name}</td>
                  <td className="px-6 py-3 text-sm text-white/60 font-mono">{c.phone}</td>
                  <td className="px-6 py-3 text-sm text-white/60">{c.company || "\u2014"}</td>
                  <td className="px-6 py-3"><StatusBadge status={c.status} size="sm" /></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
