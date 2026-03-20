import { useEffect, useState, useCallback } from "react";
import { fetchContacts as fetchContactsApi, createContact, deleteContact, callContacts } from "../lib/admin-api";
import StatusBadge from "../components/admin/StatusBadge";
import ConfirmDialog from "../components/ui/ConfirmDialog";

interface Contact {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  company: string | null;
  role: string | null;
  industry: string | null;
  team_size: string | null;
  status: string;
  tags: string[];
  campaign_id: string | null;
  created_at: string;
}

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "new", label: "New" },
  { value: "queued", label: "Queued" },
  { value: "calling", label: "Calling" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "no_answer", label: "No Answer" },
  { value: "voicemail", label: "Voicemail" },
  { value: "opted_out", label: "Opted Out" },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function AdminContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [calling, setCalling] = useState(false);
  const [newContact, setNewContact] = useState({ name: "", phone: "", email: "", company: "", role: "", industry: "", team_size: "" });
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchContactsApi({ search: search || undefined, status: statusFilter || undefined, page, limit: 50 });
      setContacts(data.contacts || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error("Failed to load contacts:", err);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, page]);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  const [searchInput, setSearchInput] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => { setSearch(searchInput); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === contacts.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(contacts.map((c) => c.id)));
  };

  const handleCallSelected = async () => {
    if (selectedIds.size === 0) return;
    setCalling(true);
    try {
      await callContacts(Array.from(selectedIds));
      showToast(`${selectedIds.size} call(s) initiated`, "success");
      setSelectedIds(new Set());
      fetchContacts();
    } catch (err) { showToast("Failed to initiate calls", "error"); console.error("Failed to initiate calls:", err); }
    finally { setCalling(false); }
  };

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createContact(newContact);
      setNewContact({ name: "", phone: "", email: "", company: "", role: "", industry: "", team_size: "" });
      setShowAddForm(false);
      showToast("Contact added", "success");
      fetchContacts();
    } catch (err) { showToast("Failed to add contact", "error"); console.error("Failed to add contact:", err); }
  };

  const handleDeleteContact = async (id: string) => {
    try { await deleteContact(id); showToast("Contact deleted", "success"); fetchContacts(); }
    catch (err) { showToast("Failed to delete contact", "error"); console.error("Failed to delete contact:", err); }
    finally { setDeleteTarget(null); }
  };

  const totalPages = Math.ceil(total / 50);

  return (
    <div className="max-w-7xl mx-auto p-6">
      {toast && <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl text-sm font-medium shadow-lg border transition-all ${toast.type === "success" ? "bg-green-500/20 text-green-400 border-green-500/30" : "bg-red-500/20 text-red-400 border-red-500/30"}`}>{toast.message}</div>}

      <div className="flex flex-wrap items-center gap-4 mb-6">
        <h1 className="text-3xl font-bold text-foreground mr-auto">Contacts</h1>
        <input type="text" placeholder="Search contacts..." value={searchInput} onChange={(e) => setSearchInput(e.target.value)} className="bg-muted border border-border rounded-lg px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-border focus:outline-none w-64" />
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="bg-muted border border-border rounded-lg px-4 py-2 text-sm text-foreground focus:border-border focus:outline-none appearance-none">
          {STATUS_OPTIONS.map((opt) => <option key={opt.value} value={opt.value} className="bg-[#12121a]">{opt.label}</option>)}
        </select>
        <button onClick={() => setShowAddForm(!showAddForm)} className="px-4 py-2 text-sm font-medium rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 text-foreground hover:from-blue-500 hover:to-blue-500 transition-all">Add Contact</button>
      </div>

      {selectedIds.size > 0 && (
        <div className="mb-4 flex items-center gap-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
          <span className="text-sm text-blue-400">{selectedIds.size} contact{selectedIds.size !== 1 ? "s" : ""} selected</span>
          <button onClick={handleCallSelected} disabled={calling} className="px-4 py-1.5 text-sm font-medium rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 text-foreground disabled:opacity-50 transition-all">
            {calling ? "Initiating..." : `Call Selected (${selectedIds.size})`}
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="text-sm text-muted-foreground hover:text-muted-foreground transition-colors">Clear</button>
        </div>
      )}

      {showAddForm && (
        <div className="mb-6 p-6 bg-muted border border-border rounded-2xl">
          <h3 className="text-sm font-semibold text-foreground mb-4">New Contact</h3>
          <form onSubmit={handleAddContact} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <input type="text" placeholder="Name *" required value={newContact.name} onChange={(e) => setNewContact({ ...newContact, name: e.target.value })} className="bg-muted border border-border rounded-lg px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-border focus:outline-none" />
            <input type="text" placeholder="Phone *" required value={newContact.phone} onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })} className="bg-muted border border-border rounded-lg px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-border focus:outline-none" />
            <input type="email" placeholder="Email" value={newContact.email} onChange={(e) => setNewContact({ ...newContact, email: e.target.value })} className="bg-muted border border-border rounded-lg px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-border focus:outline-none" />
            <input type="text" placeholder="Company" value={newContact.company} onChange={(e) => setNewContact({ ...newContact, company: e.target.value })} className="bg-muted border border-border rounded-lg px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-border focus:outline-none" />
            <input type="text" placeholder="Role" value={newContact.role} onChange={(e) => setNewContact({ ...newContact, role: e.target.value })} className="bg-muted border border-border rounded-lg px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-border focus:outline-none" />
            <input type="text" placeholder="Industry" value={newContact.industry} onChange={(e) => setNewContact({ ...newContact, industry: e.target.value })} className="bg-muted border border-border rounded-lg px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-border focus:outline-none" />
            <input type="text" placeholder="Team Size" value={newContact.team_size} onChange={(e) => setNewContact({ ...newContact, team_size: e.target.value })} className="bg-muted border border-border rounded-lg px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-border focus:outline-none" />
            <div className="flex gap-2">
              <button type="submit" className="flex-1 px-4 py-2 text-sm font-medium rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 text-foreground transition-all">Add</button>
              <button type="button" onClick={() => setShowAddForm(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-muted-foreground">Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-muted border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-muted">
                <th className="px-4 py-3 text-left"><input type="checkbox" checked={contacts.length > 0 && selectedIds.size === contacts.length} onChange={toggleSelectAll} className="rounded border-border bg-muted" /></th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Name</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Phone</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Company</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Tags</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Created</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-6 py-8 text-center text-muted-foreground text-sm">Loading...</td></tr>
              ) : contacts.length === 0 ? (
                <tr><td colSpan={8} className="px-6 py-8 text-center text-muted-foreground text-sm">No contacts found. Add contacts manually.</td></tr>
              ) : contacts.map((contact) => (
                <tr key={contact.id} className="border-b border-border hover:bg-muted transition-colors">
                  <td className="px-4 py-3"><input type="checkbox" checked={selectedIds.has(contact.id)} onChange={() => toggleSelect(contact.id)} className="rounded border-border bg-muted" /></td>
                  <td className="px-4 py-3"><p className="text-sm font-medium text-foreground">{contact.name}</p>{contact.role && <p className="text-xs text-muted-foreground">{contact.role}</p>}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground font-mono">{contact.phone}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{contact.company || "\u2014"}</td>
                  <td className="px-4 py-3"><StatusBadge status={contact.status} size="sm" /></td>
                  <td className="px-4 py-3"><div className="flex gap-1 flex-wrap">{(contact.tags || []).slice(0, 3).map((tag) => <span key={tag} className="px-1.5 py-0.5 text-[10px] bg-muted text-muted-foreground rounded">{tag}</span>)}</div></td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{formatDate(contact.created_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => setDeleteTarget(contact.id)} title="Delete" className="p-1.5 text-muted-foreground hover:text-red-400 transition-colors rounded-lg hover:bg-muted">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-border">
            <p className="text-xs text-muted-foreground">Showing {(page - 1) * 50 + 1}-{Math.min(page * 50, total)} of {total}</p>
            <div className="flex gap-1">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 text-xs rounded-lg bg-muted text-muted-foreground hover:bg-muted disabled:opacity-30 transition-colors">Prev</button>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1 text-xs rounded-lg bg-muted text-muted-foreground hover:bg-muted disabled:opacity-30 transition-colors">Next</button>
            </div>
          </div>
        )}
      </div>
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Contact"
        message="This contact and their associated data will be permanently removed."
        confirmLabel="Delete"
        onConfirm={() => deleteTarget && handleDeleteContact(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
