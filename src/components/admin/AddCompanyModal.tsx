import { useState, useEffect, useRef } from "react";
import { fetchAssessments, batchCreateInvitations } from "../../lib/admin-api";
import type { AssessmentSummary } from "../../lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

interface Employee {
  name: string;
  email: string;
  role: string;
}

const EMPTY_EMPLOYEE: Employee = { name: "", email: "", role: "" };

type Step = "company" | "employees" | "review";

export default function AddCompanyModal({ open, onClose, onCreated }: Props) {
  // Company info
  const [companyName, setCompanyName] = useState("");
  const [domain, setDomain] = useState("");
  const [industry, setIndustry] = useState("");

  // Employees
  const [employees, setEmployees] = useState<Employee[]>([{ ...EMPTY_EMPLOYEE }]);

  // Assessment
  const [assessments, setAssessments] = useState<AssessmentSummary[]>([]);
  const [selectedAssessment, setSelectedAssessment] = useState("");
  const [sendEmail, setSendEmail] = useState(true);

  // UI state
  const [step, setStep] = useState<Step>("company");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ created: number; emailed: number } | null>(null);
  const [error, setError] = useState("");

  const firstInputRef = useRef<HTMLInputElement>(null);
  const employeeNameRef = useRef<HTMLInputElement>(null);

  // Load assessments on open
  useEffect(() => {
    if (open) {
      fetchAssessments()
        .then((data) => {
          const active = (data.assessments || []).filter(
            (a: AssessmentSummary) => a.status === "active" || a.status === "draft"
          );
          setAssessments(active);
          if (active.length > 0 && !selectedAssessment) {
            setSelectedAssessment(active[0].id);
          }
        })
        .catch(() => {});
      setTimeout(() => firstInputRef.current?.focus(), 100);
    }
  }, [open]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setCompanyName("");
      setDomain("");
      setIndustry("");
      setEmployees([{ ...EMPTY_EMPLOYEE }]);
      setSelectedAssessment("");
      setStep("company");
      setResult(null);
      setError("");
      setSubmitting(false);
    }
  }, [open]);

  const updateEmployee = (index: number, field: keyof Employee, value: string) => {
    setEmployees((prev) => prev.map((e, i) => (i === index ? { ...e, [field]: value } : e)));
  };

  const addEmployee = () => {
    setEmployees((prev) => [...prev, { ...EMPTY_EMPLOYEE }]);
    setTimeout(() => employeeNameRef.current?.focus(), 50);
  };

  const removeEmployee = (index: number) => {
    if (employees.length <= 1) return;
    setEmployees((prev) => prev.filter((_, i) => i !== index));
  };

  // Auto-detect domain from first employee email
  const autoDetectDomain = (email: string) => {
    if (domain) return;
    const match = email.match(/@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/);
    if (match) setDomain(match[1]);
  };

  // Parse pasted CSV/text into employees
  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text");
    const lines = text.split("\n").filter((l) => l.trim());
    if (lines.length < 2) return; // Not bulk paste

    e.preventDefault();
    const parsed: Employee[] = [];

    for (const line of lines) {
      // Try CSV: "Name, email@example.com, Role" or tab-separated
      const parts = line.includes("\t") ? line.split("\t") : line.split(",");
      if (parts.length >= 2) {
        const name = parts[0].trim().replace(/^["']|["']$/g, "");
        const email = parts[1].trim().replace(/^["']|["']$/g, "");
        const role = parts[2]?.trim().replace(/^["']|["']$/g, "") || "";
        if (email.includes("@")) {
          parsed.push({ name, email, role });
        }
      }
    }

    if (parsed.length > 0) {
      setEmployees(parsed);
      if (!domain && parsed[0].email) {
        const match = parsed[0].email.match(/@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/);
        if (match) setDomain(match[1]);
      }
    }
  };

  const validEmployees = employees.filter((e) => e.name.trim() && e.email.trim() && e.email.includes("@"));

  const canProceedToEmployees = companyName.trim().length > 0;
  const canProceedToReview = validEmployees.length > 0 && selectedAssessment;

  const handleSubmit = async () => {
    if (!canProceedToReview || submitting) return;
    setSubmitting(true);
    setError("");

    try {
      const invitations = validEmployees.map((emp) => ({
        assessmentId: selectedAssessment,
        participant: {
          name: emp.name.trim(),
          email: emp.email.trim(),
          company: companyName.trim(),
          role: emp.role.trim() || undefined,
          industry: industry.trim() || undefined,
        },
      }));

      const res = await batchCreateInvitations(invitations, sendEmail);
      setResult({
        created: res.created || invitations.length,
        emailed: sendEmail ? (res.emailed || res.created || invitations.length) : 0,
      });
    } catch (err) {
      setError((err as Error)?.message || "Failed to create invitations");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const assessmentName = assessments.find((a) => a.id === selectedAssessment)?.name || selectedAssessment;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-[#0d0d1a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-base font-semibold text-white/90">
              {result ? "Done!" : step === "company" ? "New Company" : step === "employees" ? "Add Employees" : "Review & Send"}
            </h2>
            {!result && (
              <div className="flex items-center gap-2 mt-1.5">
                {(["company", "employees", "review"] as Step[]).map((s, i) => (
                  <div key={s} className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full transition-colors ${
                      s === step ? "bg-purple-400" : (["company", "employees", "review"].indexOf(step) > i ? "bg-purple-400/40" : "bg-white/10")
                    }`} />
                    <span className={`text-[10px] ${s === step ? "text-white/50" : "text-white/20"}`}>
                      {s === "company" ? "Company" : s === "employees" ? "People" : "Review"}
                    </span>
                    {i < 2 && <div className="w-4 h-px bg-white/10" />}
                  </div>
                ))}
              </div>
            )}
          </div>
          <button onClick={onClose} className="p-1 text-white/30 hover:text-white/60 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* ——— Success State ——— */}
          {result && (
            <div className="text-center py-8 space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto">
                <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white/90">{companyName} added</h3>
                <p className="text-sm text-white/40 mt-1">
                  {result.created} invitation{result.created !== 1 ? "s" : ""} created
                  {result.emailed > 0 && `, ${result.emailed} email${result.emailed !== 1 ? "s" : ""} sent`}
                </p>
              </div>
              <div className="flex justify-center gap-3 pt-2">
                <button
                  onClick={() => {
                    onCreated();
                    onClose();
                  }}
                  className="px-4 py-2 rounded-xl bg-purple-500/20 border border-purple-500/30 text-purple-300 text-sm font-medium hover:bg-purple-500/30 transition-all"
                >
                  Done
                </button>
              </div>
            </div>
          )}

          {/* ——— Step 1: Company Details ——— */}
          {!result && step === "company" && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-white/40 mb-1.5">Company Name *</label>
                <input
                  ref={firstInputRef}
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Acme Corp"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 outline-none focus:border-purple-500/40 transition-colors"
                  onKeyDown={(e) => e.key === "Enter" && canProceedToEmployees && setStep("employees")}
                />
              </div>
              <div>
                <label className="block text-xs text-white/40 mb-1.5">Domain (optional)</label>
                <input
                  type="text"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="acme.com"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 outline-none focus:border-purple-500/40 transition-colors"
                />
                <p className="text-[11px] text-white/20 mt-1">Auto-detected from employee emails</p>
              </div>
              <div>
                <label className="block text-xs text-white/40 mb-1.5">Industry (optional)</label>
                <input
                  type="text"
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  placeholder="Technology, Healthcare, Finance..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 outline-none focus:border-purple-500/40 transition-colors"
                />
              </div>
            </div>
          )}

          {/* ——— Step 2: Add Employees ——— */}
          {!result && step === "employees" && (
            <div className="space-y-4" onPaste={handlePaste}>
              <div className="flex items-center justify-between">
                <p className="text-xs text-white/40">
                  Add employees for <span className="text-white/60 font-medium">{companyName}</span>
                </p>
                <span className="text-[10px] text-white/20 bg-white/5 px-2 py-0.5 rounded-full">
                  Tip: paste CSV data
                </span>
              </div>

              {/* Employee rows */}
              <div className="space-y-2">
                {employees.map((emp, i) => (
                  <div key={i} className="flex gap-2 items-start group">
                    <div className="flex-1 grid grid-cols-3 gap-2">
                      <input
                        ref={i === employees.length - 1 ? employeeNameRef : undefined}
                        type="text"
                        value={emp.name}
                        onChange={(e) => updateEmployee(i, "name", e.target.value)}
                        placeholder="Name"
                        className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-purple-500/40 transition-colors"
                      />
                      <input
                        type="email"
                        value={emp.email}
                        onChange={(e) => {
                          updateEmployee(i, "email", e.target.value);
                          if (i === 0) autoDetectDomain(e.target.value);
                        }}
                        placeholder="email@company.com"
                        className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-purple-500/40 transition-colors"
                      />
                      <input
                        type="text"
                        value={emp.role}
                        onChange={(e) => updateEmployee(i, "role", e.target.value)}
                        placeholder="Role (optional)"
                        className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-purple-500/40 transition-colors"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addEmployee();
                          }
                        }}
                      />
                    </div>
                    <button
                      onClick={() => removeEmployee(i)}
                      className={`p-2 text-white/10 hover:text-red-400 transition-colors shrink-0 ${employees.length <= 1 ? "invisible" : ""}`}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>

              {/* Add more */}
              <button
                onClick={addEmployee}
                className="flex items-center gap-2 text-sm text-purple-400/70 hover:text-purple-300 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Add another employee
              </button>

              {/* Assessment selection */}
              <div className="pt-2 border-t border-white/5">
                <label className="block text-xs text-white/40 mb-1.5">Assessment *</label>
                <select
                  value={selectedAssessment}
                  onChange={(e) => setSelectedAssessment(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-purple-500/40 transition-colors appearance-none cursor-pointer"
                >
                  <option value="">Select an assessment...</option>
                  {assessments.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>

              {/* Send email toggle */}
              <label className="flex items-center gap-3 cursor-pointer">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={sendEmail}
                    onChange={(e) => setSendEmail(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 rounded-full bg-white/10 peer-checked:bg-purple-500/50 transition-colors" />
                  <div className="absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white/60 peer-checked:translate-x-4 peer-checked:bg-white transition-all" />
                </div>
                <span className="text-sm text-white/50">Send invitation emails</span>
              </label>
            </div>
          )}

          {/* ——— Step 3: Review ——— */}
          {!result && step === "review" && (
            <div className="space-y-4">
              {/* Company summary */}
              <div className="bg-white/[0.03] rounded-xl border border-white/10 p-4">
                <div className="flex items-center gap-3">
                  {domain && (
                    <img
                      src={`https://logo.clearbit.com/${domain}`}
                      alt=""
                      className="w-10 h-10 rounded-lg bg-white/5"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  )}
                  <div>
                    <h3 className="text-sm font-semibold text-white/90">{companyName}</h3>
                    <p className="text-xs text-white/30">
                      {domain && `${domain} · `}
                      {industry || "No industry specified"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Employee list */}
              <div className="bg-white/[0.03] rounded-xl border border-white/10 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-white/[0.06]">
                  <span className="text-xs text-white/40">
                    {validEmployees.length} employee{validEmployees.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="divide-y divide-white/5 max-h-48 overflow-y-auto">
                  {validEmployees.map((emp, i) => (
                    <div key={i} className="px-4 py-2 flex items-center justify-between">
                      <div>
                        <span className="text-sm text-white/80">{emp.name}</span>
                        <span className="text-xs text-white/30 ml-2">{emp.email}</span>
                      </div>
                      {emp.role && <span className="text-xs text-white/20">{emp.role}</span>}
                    </div>
                  ))}
                </div>
              </div>

              {/* Assessment + email info */}
              <div className="flex flex-col gap-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-white/40">Assessment</span>
                  <span className="text-white/70">{assessmentName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/40">Send emails</span>
                  <span className={sendEmail ? "text-green-400" : "text-white/30"}>
                    {sendEmail ? "Yes" : "No"}
                  </span>
                </div>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5 text-sm text-red-300">
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {!result && (
          <div className="px-6 py-4 border-t border-white/[0.06] flex items-center justify-between shrink-0">
            <button
              onClick={() => {
                if (step === "company") onClose();
                else if (step === "employees") setStep("company");
                else setStep("employees");
              }}
              className="px-4 py-2 text-sm text-white/40 hover:text-white/60 transition-colors"
            >
              {step === "company" ? "Cancel" : "Back"}
            </button>

            {step === "company" && (
              <button
                onClick={() => setStep("employees")}
                disabled={!canProceedToEmployees}
                className="px-5 py-2 rounded-xl bg-purple-500/20 border border-purple-500/30 text-purple-300 text-sm font-medium hover:bg-purple-500/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Next: Add Employees
              </button>
            )}

            {step === "employees" && (
              <button
                onClick={() => setStep("review")}
                disabled={!canProceedToReview}
                className="px-5 py-2 rounded-xl bg-purple-500/20 border border-purple-500/30 text-purple-300 text-sm font-medium hover:bg-purple-500/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Next: Review
              </button>
            )}

            {step === "review" && (
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="px-5 py-2 rounded-xl bg-purple-600 text-white text-sm font-medium hover:bg-purple-500 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {submitting ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Creating...
                  </>
                ) : (
                  <>Create {validEmployees.length} Invitation{validEmployees.length !== 1 ? "s" : ""}</>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
