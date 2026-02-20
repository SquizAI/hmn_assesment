import { useState, useEffect, useCallback, useMemo } from "react";
import StatusBadge from "../components/admin/StatusBadge";
import {
  fetchInvitations,
  createInvitation,
  removeInvitation,
  resendInvitation,
  fetchAssessments,
  checkEmailStatus,
  enrichEmail,
} from "../lib/admin-api";
import type { InvitationSummary, AssessmentSummary } from "../lib/types";
import CsvUploadModal from "../components/admin/CsvUploadModal";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StatusFilter = "all" | "sent" | "opened" | "started" | "completed";

interface CreateForm {
  assessmentId: string;
  name: string;
  email: string;
  company: string;
  role: string;
  industry: string;
  teamSize: string;
  note: string;
}

const EMPTY_FORM: CreateForm = {
  assessmentId: "",
  name: "",
  email: "",
  company: "",
  role: "",
  industry: "",
  teamSize: "",
  note: "",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTimestamp(dateStr: string | null): string {
  if (!dateStr) return "--";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getMostRelevantTimestamp(inv: InvitationSummary): { label: string; date: string | null } {
  if (inv.completedAt) return { label: "Completed", date: inv.completedAt };
  if (inv.startedAt) return { label: "Started", date: inv.startedAt };
  if (inv.openedAt) return { label: "Opened", date: inv.openedAt };
  return { label: "Created", date: inv.createdAt };
}

function buildInviteLink(token: string): string {
  return `${window.location.origin}/?invite=${token}`;
}

async function copyToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ModalBackdrop({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-lg mx-3 sm:mx-4">{children}</div>
    </div>
  );
}

function StatPill({
  label,
  count,
  colorClass,
}: {
  label: string;
  count: number;
  colorClass: string;
}) {
  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3">
      <p className={`text-xs uppercase tracking-wider ${colorClass}`}>
        {label}
      </p>
      <p
        className={`text-xl font-semibold mt-1 tabular-nums ${
          colorClass.replace("/60", "").replace("/25", "")
        }`}
      >
        {count}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function AdminInvitationsPage() {
  // ---- Data state ----
  const [invitations, setInvitations] = useState<InvitationSummary[]>([]);
  const [assessments, setAssessments] = useState<AssessmentSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // ---- UI state ----
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [assessmentFilter, setAssessmentFilter] = useState("all");

  // ---- Modal state ----
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [showAssessmentPicker, setShowAssessmentPicker] = useState(false);

  // ---- Email auto-populate state ----
  const [emailSuggestions, setEmailSuggestions] = useState<string[]>([]);
  const [showEmailSuggestions, setShowEmailSuggestions] = useState(false);
  const [enriching, setEnriching] = useState(false);

  // ---- CSV modal state ----
  const [showCsvModal, setShowCsvModal] = useState(false);

  // ---- Email state ----
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [sendEmailOnCreate, setSendEmailOnCreate] = useState(false);

  // ---- Copy link feedback ----
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // ---- Delete confirmation ----
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ---- Success toast ----
  const [toast, setToast] = useState<string | null>(null);

  // ---- Data loading ----
  const loadInvitations = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchInvitations();
      setInvitations(data.invitations ?? []);
    } catch {
      setInvitations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAssessments = useCallback(async () => {
    try {
      const data = await fetchAssessments();
      setAssessments(data.assessments ?? []);
    } catch {
      setAssessments([]);
    }
  }, []);

  useEffect(() => {
    loadInvitations();
    loadAssessments();
    checkEmailStatus().then((s) => setEmailEnabled(s.enabled)).catch(() => {});
  }, [loadInvitations, loadAssessments]);

  // ---- Auto-dismiss toast ----
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  // ---- Computed: counts per status ----
  const counts = useMemo(() => {
    const c = { total: 0, sent: 0, opened: 0, started: 0, completed: 0 };
    for (const inv of invitations) {
      c.total++;
      if (inv.status === "sent") c.sent++;
      else if (inv.status === "opened") c.opened++;
      else if (inv.status === "started") c.started++;
      else if (inv.status === "completed") c.completed++;
    }
    return c;
  }, [invitations]);

  // ---- Computed: active assessments for filters / form ----
  const activeAssessments = useMemo(
    () => assessments.filter((a) => a.status === "active"),
    [assessments]
  );

  // ---- Computed: email -> participant data lookup for auto-populate ----
  const emailLookup = useMemo(() => {
    const map = new Map<string, {
      name: string;
      company: string;
      role: string;
      industry: string;
      teamSize: string;
    }>();
    const sorted = [...invitations].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    for (const inv of sorted) {
      const email = inv.participantEmail.toLowerCase();
      if (!map.has(email)) {
        map.set(email, {
          name: inv.participantName,
          company: inv.participantCompany,
          role: inv.participantRole || "",
          industry: inv.participantIndustry || "",
          teamSize: inv.participantTeamSize || "",
        });
      }
    }
    return map;
  }, [invitations]);

  // ---- Computed: filtered invitations ----
  const filtered = useMemo(() => {
    return invitations.filter((inv) => {
      // Search filter (name, email, company)
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesSearch =
          inv.participantName.toLowerCase().includes(q) ||
          inv.participantEmail.toLowerCase().includes(q) ||
          inv.participantCompany.toLowerCase().includes(q);
        if (!matchesSearch) return false;
      }

      // Status filter
      if (statusFilter !== "all" && inv.status !== statusFilter) return false;

      // Assessment filter
      if (assessmentFilter !== "all" && inv.assessmentId !== assessmentFilter)
        return false;

      return true;
    });
  }, [invitations, search, statusFilter, assessmentFilter]);

  // ---- Handlers ----

  const handleCopyLink = useCallback(async (inv: InvitationSummary) => {
    try {
      await copyToClipboard(buildInviteLink(inv.token));
      setCopiedId(inv.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // clipboard failed silently
    }
  }, []);

  const handleDelete = useCallback(
    async (id: string) => {
      setDeleting(true);
      try {
        await removeInvitation(id);
        setDeleteTargetId(null);
        await loadInvitations();
      } catch {
        // delete failed silently
      } finally {
        setDeleting(false);
      }
    },
    [loadInvitations]
  );

  const handleResend = useCallback(
    async (inv: InvitationSummary) => {
      try {
        const result = await resendInvitation(inv.id);
        await copyToClipboard(buildInviteLink(inv.token));
        const emailMsg = result.emailSent ? " Email resent!" : "";
        setToast(`Link copied — invitation reset to Sent.${emailMsg}`);
        await loadInvitations();
      } catch {
        // resend failed silently
      }
    },
    [loadInvitations]
  );

  const handleCreateSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!form.assessmentId) {
        setCreateError("Please select an assessment.");
        return;
      }
      if (!form.name.trim()) {
        setCreateError("Name is required.");
        return;
      }
      if (!form.email.trim()) {
        setCreateError("Email is required.");
        return;
      }

      setCreating(true);
      setCreateError(null);

      try {
        const result = await createInvitation({
          assessmentId: form.assessmentId,
          participant: {
            name: form.name.trim(),
            email: form.email.trim(),
            ...(form.company.trim() && { company: form.company.trim() }),
            ...(form.role.trim() && { role: form.role.trim() }),
            ...(form.industry.trim() && { industry: form.industry.trim() }),
            ...(form.teamSize.trim() && { teamSize: form.teamSize.trim() }),
          },
          ...(form.note.trim() && { note: form.note.trim() }),
          sendEmail: sendEmailOnCreate && emailEnabled,
        });

        if (result.ok && result.invitation) {
          const link = buildInviteLink(result.invitation.token);
          await copyToClipboard(link);
          setShowCreateModal(false);
          setForm(EMPTY_FORM);
          setSendEmailOnCreate(false);
          const emailMsg = result.emailSent ? " Email sent!" : "";
          setToast(`Invitation created — link copied to clipboard!${emailMsg}`);
          await loadInvitations();
        } else {
          setCreateError("Failed to create invitation. Please try again.");
        }
      } catch {
        setCreateError("Failed to create invitation. Please try again.");
      } finally {
        setCreating(false);
      }
    },
    [form, loadInvitations]
  );

  const updateForm = useCallback(
    (field: keyof CreateForm, value: string) => {
      setForm((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  const handleEmailChange = useCallback(
    (value: string) => {
      setForm((prev) => ({ ...prev, email: value }));
      if (value.length >= 2) {
        const q = value.toLowerCase();
        const matches = Array.from(emailLookup.keys())
          .filter((email) => email.includes(q))
          .slice(0, 5);
        setEmailSuggestions(matches);
        setShowEmailSuggestions(matches.length > 0);
      } else {
        setEmailSuggestions([]);
        setShowEmailSuggestions(false);
      }
    },
    [emailLookup]
  );

  const autoFillFromEmail = useCallback(
    (email: string) => {
      const data = emailLookup.get(email.toLowerCase());
      if (data) {
        setForm((prev) => ({
          ...prev,
          name: prev.name || data.name,
          company: prev.company || data.company,
          role: prev.role || data.role,
          industry: prev.industry || data.industry,
          teamSize: prev.teamSize || data.teamSize,
        }));
        setShowEmailSuggestions(false);
        return;
      }
      setShowEmailSuggestions(false);

      // If no local match and it looks like a corporate email, try enrichment
      if (email.includes("@") && email.split("@")[1]?.includes(".")) {
        setEnriching(true);
        enrichEmail(email)
          .then((result) => {
            if (result.enriched) {
              setForm((prev) => ({
                ...prev,
                company: prev.company || result.company || "",
                industry: prev.industry || result.industry || "",
                teamSize: prev.teamSize || result.teamSize || "",
              }));
            }
          })
          .catch(() => {
            // enrichment failed silently
          })
          .finally(() => {
            setEnriching(false);
          });
      }
    },
    [emailLookup]
  );

  const openCreateModal = useCallback(() => {
    setForm({
      ...EMPTY_FORM,
      assessmentId: activeAssessments.length === 1 ? activeAssessments[0].id : "",
    });
    setCreateError(null);
    setShowCreateModal(true);
  }, [activeAssessments]);

  // ---- Render: Loading ----
  if (loading) {
    return (
      <div className="px-4 md:px-6 py-6 flex items-center justify-center min-h-[500px]">
        <span className="text-white/30 text-sm">Loading...</span>
      </div>
    );
  }

  return (
    <div className="px-4 md:px-6 py-4 md:py-6 space-y-4 md:space-y-6">
      {/* ================================================================== */}
      {/* STATS ROW                                                          */}
      {/* ================================================================== */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 md:gap-3">
        <StatPill label="Total" count={counts.total} colorClass="text-white/30" />
        <StatPill label="Sent" count={counts.sent} colorClass="text-sky-400/60" />
        <StatPill label="Opened" count={counts.opened} colorClass="text-amber-400/60" />
        <StatPill label="Started" count={counts.started} colorClass="text-indigo-400/60" />
        <StatPill label="Completed" count={counts.completed} colorClass="text-green-400/60" />
      </div>

      {/* ================================================================== */}
      {/* FILTER BAR                                                         */}
      {/* ================================================================== */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="text"
          placeholder="Search by name, email, or company..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-white/20 transition-colors sm:w-64"
        />

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-white/20 transition-colors appearance-none cursor-pointer"
        >
          <option value="all">All Statuses</option>
          <option value="sent">Sent</option>
          <option value="opened">Opened</option>
          <option value="started">Started</option>
          <option value="completed">Completed</option>
        </select>

        <select
          value={assessmentFilter}
          onChange={(e) => setAssessmentFilter(e.target.value)}
          className="bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-white/20 transition-colors appearance-none cursor-pointer"
        >
          <option value="all">All Assessments</option>
          {activeAssessments.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>

        <div className="sm:ml-auto flex items-center gap-2">
          <button
            onClick={() => setShowCsvModal(true)}
            className="px-4 py-2 text-sm font-medium rounded-xl transition-all border border-white/15 text-white/60 hover:bg-white/[0.06] hover:text-white/80"
          >
            Bulk Import
          </button>
          <button
            onClick={openCreateModal}
            className="px-4 py-2 text-sm font-medium rounded-xl transition-all bg-gradient-to-r from-purple-500/20 to-blue-500/20 border border-purple-500/20 text-purple-200 hover:from-purple-500/30 hover:to-blue-500/30 hover:text-white"
          >
            New Invitation
          </button>
        </div>
      </div>

      {/* ================================================================== */}
      {/* INVITATIONS TABLE                                                  */}
      {/* ================================================================== */}
      <div className="bg-white/[0.03] rounded-2xl border border-white/10 overflow-x-auto">
        <table className="w-full min-w-0">
          <thead>
            <tr className="bg-white/[0.02]">
              <th className="text-left text-xs text-white/40 uppercase tracking-wider px-3 md:px-4 py-3">
                Participant
              </th>
              <th className="text-left text-xs text-white/40 uppercase tracking-wider px-3 md:px-4 py-3 hidden sm:table-cell">
                Email
              </th>
              <th className="text-left text-xs text-white/40 uppercase tracking-wider px-3 md:px-4 py-3 hidden md:table-cell">
                Assessment
              </th>
              <th className="text-left text-xs text-white/40 uppercase tracking-wider px-3 md:px-4 py-3">
                Status
              </th>
              <th className="text-left text-xs text-white/40 uppercase tracking-wider px-3 md:px-4 py-3 hidden sm:table-cell">
                Activity
              </th>
              <th className="text-left text-xs text-white/40 uppercase tracking-wider px-3 md:px-4 py-3">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={3} className="text-center text-white/30 py-12">
                  {invitations.length === 0
                    ? "No invitations yet \u2014 create one to get started."
                    : "No invitations match your filters."}
                </td>
              </tr>
            ) : (
              filtered.map((inv) => (
                <tr
                  key={inv.id}
                  className="hover:bg-white/[0.04] cursor-pointer transition-colors border-t border-white/5"
                >
                  <td className="px-3 md:px-4 py-3">
                    <div className="font-medium text-white text-sm">
                      {inv.participantName}
                    </div>
                    {inv.participantCompany && (
                      <div className="text-xs text-white/30 mt-0.5">
                        {inv.participantCompany}
                      </div>
                    )}
                    {/* Show email on mobile under name */}
                    <div className="text-xs text-white/30 mt-0.5 sm:hidden">
                      {inv.participantEmail}
                    </div>
                  </td>
                  <td className="px-3 md:px-4 py-3 text-white/50 text-sm hidden sm:table-cell">
                    {inv.participantEmail}
                  </td>
                  <td className="px-3 md:px-4 py-3 text-white/50 text-sm hidden md:table-cell">
                    {inv.assessmentName}
                  </td>
                  <td className="px-3 md:px-4 py-3">
                    <StatusBadge status={inv.status} />
                  </td>
                  <td className="px-3 md:px-4 py-3 text-sm hidden sm:table-cell group/ts relative">
                    {(() => {
                      const { label, date } = getMostRelevantTimestamp(inv);
                      return (
                        <>
                          <span className="text-white/25 text-[10px] uppercase mr-1">{label}</span>
                          <span className="text-white/40">{formatTimestamp(date)}</span>
                          <div className="absolute z-40 bottom-full left-0 mb-1 hidden group-hover/ts:block bg-[#12121a] border border-white/10 rounded-lg px-3 py-2 shadow-xl min-w-[210px]">
                            <div className="text-xs space-y-1">
                              <div className="flex justify-between gap-4">
                                <span className="text-white/40">Created</span>
                                <span className="text-white/60">{formatTimestamp(inv.createdAt)}</span>
                              </div>
                              {inv.openedAt && (
                                <div className="flex justify-between gap-4">
                                  <span className="text-white/40">Opened</span>
                                  <span className="text-white/60">{formatTimestamp(inv.openedAt)}</span>
                                </div>
                              )}
                              {inv.startedAt && (
                                <div className="flex justify-between gap-4">
                                  <span className="text-white/40">Started</span>
                                  <span className="text-white/60">{formatTimestamp(inv.startedAt)}</span>
                                </div>
                              )}
                              {inv.completedAt && (
                                <div className="flex justify-between gap-4">
                                  <span className="text-white/40">Completed</span>
                                  <span className="text-white/60">{formatTimestamp(inv.completedAt)}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </td>
                  <td className="px-3 md:px-4 py-3">
                    <div className="flex items-center gap-1.5 md:gap-2 flex-wrap">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopyLink(inv);
                        }}
                        className="px-2 md:px-2.5 py-1 text-xs rounded-lg border transition-colors bg-white/[0.04] border-white/10 text-white/40 hover:bg-white/[0.08] hover:text-white/60"
                      >
                        {copiedId === inv.id ? "Copied!" : "Copy"}
                      </button>
                      {inv.status !== "sent" && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleResend(inv);
                          }}
                          className="px-2.5 py-1 text-xs rounded-lg border transition-colors bg-sky-500/10 border-sky-500/25 text-sky-400 hover:bg-sky-500/20"
                        >
                          Resend
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTargetId(inv.id);
                        }}
                        className="px-2.5 py-1 text-xs rounded-lg border transition-colors bg-red-500/10 border-red-500/25 text-red-400 hover:bg-red-500/20"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ================================================================== */}
      {/* CREATE INVITATION MODAL                                            */}
      {/* ================================================================== */}
      {showCreateModal && (
        <ModalBackdrop onClose={() => setShowCreateModal(false)}>
          <form
            onSubmit={handleCreateSubmit}
            className="bg-[#0e0e16] border border-white/10 rounded-2xl p-6 shadow-2xl max-h-[85vh] overflow-y-auto"
          >
            <h2 className="text-lg font-semibold text-white/90 mb-1">
              New Invitation
            </h2>
            <p className="text-sm text-white/40 mb-5">
              Send an assessment invitation. The link will be copied to your
              clipboard on creation.
            </p>

            {createError && (
              <div className="mb-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/25 text-red-400 text-sm">
                {createError}
              </div>
            )}

            {/* Assessment — Rich Picker */}
            <label className="block text-xs text-white/40 mb-1.5">
              Assessment <span className="text-red-400">*</span>
            </label>
            <div className="relative mb-4">
              <button
                type="button"
                onClick={() => setShowAssessmentPicker(!showAssessmentPicker)}
                className="w-full bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-sm text-left text-white outline-none focus:border-white/20 transition-colors cursor-pointer"
              >
                {form.assessmentId ? (
                  (() => {
                    const sel = activeAssessments.find(a => a.id === form.assessmentId);
                    return sel ? (
                      <span className="flex items-center gap-2">
                        <span>{sel.icon || "\u{1F4CB}"}</span>
                        <span className="text-white/90 truncate">{sel.name}</span>
                        <span className="text-white/30 text-xs ml-auto flex-shrink-0">
                          {sel.questionCount}q &middot; {sel.estimatedMinutes}min
                        </span>
                      </span>
                    ) : <span className="text-white/30">Select an assessment...</span>;
                  })()
                ) : (
                  <span className="text-white/30">Select an assessment...</span>
                )}
              </button>
              {showAssessmentPicker && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setShowAssessmentPicker(false)} />
                  <div className="absolute z-30 top-full mt-1 left-0 right-0 bg-[#12121a] border border-white/10 rounded-xl shadow-2xl overflow-hidden max-h-64 overflow-y-auto">
                    {activeAssessments.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => {
                          updateForm("assessmentId", a.id);
                          setShowAssessmentPicker(false);
                        }}
                        className={`w-full text-left px-3 py-3 flex items-start gap-3 transition-colors border-b border-white/5 last:border-b-0 ${
                          form.assessmentId === a.id
                            ? "bg-white/[0.08]"
                            : "hover:bg-white/[0.04]"
                        }`}
                      >
                        <span className="text-xl leading-none mt-0.5">{a.icon || "\u{1F4CB}"}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-white/90">{a.name}</div>
                          <div className="text-xs text-white/30 line-clamp-1 mt-0.5">{a.description}</div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-white/25">
                            <span>{a.questionCount} questions</span>
                            <span>{a.estimatedMinutes} min</span>
                          </div>
                        </div>
                        {form.assessmentId === a.id && (
                          <span className="text-green-400 text-sm mt-1">&#10003;</span>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Name */}
            <label className="block text-xs text-white/40 mb-1.5">
              Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => updateForm("name", e.target.value)}
              placeholder="Participant name"
              className="w-full bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-white/20 transition-colors mb-4"
            />

            {/* Email — with auto-suggest */}
            <label className="block text-xs text-white/40 mb-1.5">
              Email <span className="text-red-400">*</span>
            </label>
            <div className="relative mb-4">
              <input
                type="email"
                value={form.email}
                onChange={(e) => handleEmailChange(e.target.value)}
                onBlur={() => {
                  setTimeout(() => {
                    autoFillFromEmail(form.email);
                    setShowEmailSuggestions(false);
                  }, 150);
                }}
                placeholder="participant@company.com"
                className="w-full bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-white/20 transition-colors"
              />
              {enriching && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="animate-spin w-4 h-4 border-2 border-white/20 border-t-purple-400 rounded-full" />
                </div>
              )}
              {showEmailSuggestions && emailSuggestions.length > 0 && (
                <div className="absolute z-30 top-full mt-1 left-0 right-0 bg-[#12121a] border border-white/10 rounded-lg shadow-xl overflow-hidden">
                  {emailSuggestions.map((email) => {
                    const data = emailLookup.get(email);
                    return (
                      <button
                        key={email}
                        type="button"
                        onClick={() => {
                          setForm((prev) => ({ ...prev, email }));
                          autoFillFromEmail(email);
                        }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-white/[0.06] transition-colors border-b border-white/5 last:border-b-0"
                      >
                        <span className="text-white/70">{email}</span>
                        {data && (
                          <span className="text-white/25 text-xs ml-2">
                            {data.name}{data.company ? ` \u2014 ${data.company}` : ""}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Company */}
            <label className="block text-xs text-white/40 mb-1.5">
              Company
            </label>
            <input
              type="text"
              value={form.company}
              onChange={(e) => updateForm("company", e.target.value)}
              placeholder="Company name"
              className="w-full bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-white/20 transition-colors mb-4"
            />

            {/* Role + Industry side by side */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-xs text-white/40 mb-1.5">
                  Role
                </label>
                <input
                  type="text"
                  value={form.role}
                  onChange={(e) => updateForm("role", e.target.value)}
                  placeholder="e.g. VP Engineering"
                  className="w-full bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-white/20 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs text-white/40 mb-1.5">
                  Industry
                </label>
                <input
                  type="text"
                  value={form.industry}
                  onChange={(e) => updateForm("industry", e.target.value)}
                  placeholder="e.g. SaaS"
                  className="w-full bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-white/20 transition-colors"
                />
              </div>
            </div>

            {/* Team Size */}
            <label className="block text-xs text-white/40 mb-1.5">
              Team Size
            </label>
            <input
              type="text"
              value={form.teamSize}
              onChange={(e) => updateForm("teamSize", e.target.value)}
              placeholder="e.g. 50-100"
              className="w-full bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-white/20 transition-colors mb-4"
            />

            {/* Note */}
            <label className="block text-xs text-white/40 mb-1.5">
              Note
            </label>
            <textarea
              value={form.note}
              onChange={(e) => updateForm("note", e.target.value)}
              placeholder="Optional note for this invitation..."
              rows={3}
              className="w-full bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-white/20 transition-colors mb-6 resize-none"
            />

            {/* Email toggle */}
            {emailEnabled && (
              <label className="flex items-center gap-2.5 mb-6 px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendEmailOnCreate}
                  onChange={(e) => setSendEmailOnCreate(e.target.checked)}
                  className="w-4 h-4 rounded border-white/20 bg-white/5 text-purple-500 focus:ring-purple-500/30"
                />
                <div>
                  <span className="text-sm text-white/70">Send invitation email</span>
                  <p className="text-xs text-white/30">The participant will receive an email with their unique link</p>
                </div>
              </label>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-sm rounded-xl border border-white/10 text-white/50 hover:bg-white/[0.04] transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating}
                className={`px-5 py-2 text-sm font-medium rounded-xl border transition-all ${
                  creating
                    ? "bg-white/[0.04] border-white/10 text-white/25 cursor-not-allowed"
                    : "bg-white/[0.10] border-white/15 text-white hover:bg-white/[0.15]"
                }`}
              >
                {creating ? "Creating..." : sendEmailOnCreate ? "Create & Send Email" : "Create & Copy Link"}
              </button>
            </div>
          </form>
        </ModalBackdrop>
      )}

      {/* ================================================================== */}
      {/* DELETE CONFIRMATION MODAL                                          */}
      {/* ================================================================== */}
      {deleteTargetId && (
        <ModalBackdrop onClose={() => setDeleteTargetId(null)}>
          <div className="bg-[#0e0e16] border border-white/10 rounded-2xl p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-white/90 mb-1">
              Delete Invitation
            </h2>
            <p className="text-sm text-white/40 mb-5">
              Are you sure you want to delete this invitation? This action
              cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTargetId(null)}
                className="px-4 py-2 text-sm rounded-xl border border-white/10 text-white/50 hover:bg-white/[0.04] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => handleDelete(deleteTargetId)}
                className={`px-5 py-2 text-sm font-medium rounded-xl border transition-all ${
                  deleting
                    ? "bg-red-500/10 border-red-500/20 text-red-300/50 cursor-not-allowed"
                    : "bg-red-500/10 border-red-500/25 text-red-400 hover:bg-red-500/20"
                }`}
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </ModalBackdrop>
      )}

      {/* ================================================================== */}
      {/* CSV UPLOAD MODAL                                                   */}
      {/* ================================================================== */}
      {showCsvModal && (
        <CsvUploadModal
          assessments={activeAssessments}
          onClose={() => setShowCsvModal(false)}
          onComplete={() => loadInvitations()}
        />
      )}

      {/* ================================================================== */}
      {/* SUCCESS TOAST                                                      */}
      {/* ================================================================== */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-3 bg-green-500/15 border border-green-500/30 rounded-xl text-green-300 text-sm shadow-xl backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
          {toast}
        </div>
      )}
    </div>
  );
}
