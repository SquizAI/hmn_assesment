import { useState, useEffect, useCallback, useMemo } from "react";
import Papa from "papaparse";
import type { AssessmentSummary } from "../../lib/types";
import type { SystemField, FieldMapping, NameDetection } from "../../lib/csv-field-mapper";
import {
  autoMapFields,
  detectNameColumns,
  extractRowValue,
  validateEmail,
  getUnmappedColumns,
} from "../../lib/csv-field-mapper";
import { batchCreateInvitations, checkEmailStatus } from "../../lib/admin-api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Step = "upload" | "mapping" | "preview" | "importing" | "results";

interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

interface RowPreview {
  index: number;
  name: string;
  email: string;
  company: string;
  role: string;
  industry: string;
  teamSize: string;
  note: string;
  excluded: boolean;
  errors: string[];
  warnings: string[];
}

interface ImportResults {
  created: number;
  emailsSent: number;
  emailsFailed: number;
  errors: Array<{ row: number; email: string; error: string }>;
}

interface Props {
  assessments: AssessmentSummary[];
  onClose: () => void;
  onComplete: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SYSTEM_FIELDS: Array<{ field: SystemField; label: string; required: boolean }> = [
  { field: "name", label: "Name", required: true },
  { field: "email", label: "Email", required: true },
  { field: "company", label: "Company", required: false },
  { field: "role", label: "Role", required: false },
  { field: "industry", label: "Industry", required: false },
  { field: "teamSize", label: "Team Size", required: false },
  { field: "note", label: "Note", required: false },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CsvUploadModal({ assessments, onClose, onComplete }: Props) {
  const [step, setStep] = useState<Step>("upload");
  const [assessmentId, setAssessmentId] = useState(assessments.length === 1 ? assessments[0].id : "");
  const [csvData, setCsvData] = useState<ParsedCsv | null>(null);
  const [fileName, setFileName] = useState("");
  const [mappings, setMappings] = useState<FieldMapping[]>([]);
  const [nameDetection, setNameDetection] = useState<NameDetection>({ type: "none", columns: [] });
  const [rows, setRows] = useState<RowPreview[]>([]);
  const [sendEmail, setSendEmail] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [results, setResults] = useState<ImportResults | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    checkEmailStatus().then((s) => setEmailEnabled(s.enabled)).catch(() => {});
  }, []);

  // ---- Step 1: Parse CSV ----

  const handleFile = useCallback((file: File) => {
    setParseError(null);
    setFileName(file.name);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const headers = result.meta.fields || [];
        const data = result.data as Record<string, string>[];
        if (headers.length === 0 || data.length === 0) {
          setParseError("No data found in CSV file.");
          return;
        }
        setCsvData({ headers, rows: data });
        const autoMappings = autoMapFields(headers);
        setMappings(autoMappings);
        setNameDetection(detectNameColumns(headers));
        setStep("mapping");
      },
      error: () => {
        setParseError("Failed to parse CSV file. Please check the format.");
      },
    });
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.type === "text/csv" || file.name.endsWith(".csv"))) {
      handleFile(file);
    } else {
      setParseError("Please upload a .csv file.");
    }
  }, [handleFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  // ---- Step 2: Update mapping ----

  const updateMapping = useCallback((systemField: SystemField, csvColumn: string | null) => {
    setMappings((prev) =>
      prev.map((m) =>
        m.systemField === systemField
          ? { ...m, csvColumn, confidence: csvColumn ? 1.0 : 0 }
          : m
      )
    );
  }, []);

  // ---- Step 2 -> 3: Build preview rows ----

  const buildPreview = useCallback(() => {
    if (!csvData) return;
    const nd = detectNameColumns(csvData.headers);
    setNameDetection(nd);
    const emailsSeen = new Set<string>();

    const previews: RowPreview[] = csvData.rows.map((row, index) => {
      const values: Record<SystemField, string> = {} as Record<SystemField, string>;
      for (const mapping of mappings) {
        values[mapping.systemField] = extractRowValue(row, mapping, nd);
      }

      const errors: string[] = [];
      const warnings: string[] = [];

      if (!values.name) errors.push("Missing name");
      if (!values.email) errors.push("Missing email");
      else if (!validateEmail(values.email)) errors.push("Invalid email format");

      if (values.email) {
        const lower = values.email.toLowerCase();
        if (emailsSeen.has(lower)) warnings.push("Duplicate email in CSV");
        emailsSeen.add(lower);
      }

      return {
        index,
        ...values,
        excluded: errors.length > 0,
        errors,
        warnings,
      };
    });

    setRows(previews);
    setStep("preview");
  }, [csvData, mappings]);

  // ---- Step 3 -> 4: Import ----

  const validRows = useMemo(() => rows.filter((r) => !r.excluded), [rows]);

  const handleImport = useCallback(async () => {
    if (!assessmentId || validRows.length === 0) return;
    setStep("importing");
    setImporting(true);
    setImportProgress(0);

    const invitations = validRows.map((row) => ({
      assessmentId,
      participant: {
        name: row.name,
        email: row.email,
        ...(row.company && { company: row.company }),
        ...(row.role && { role: row.role }),
        ...(row.industry && { industry: row.industry }),
        ...(row.teamSize && { teamSize: row.teamSize }),
      },
      ...(row.note && { note: row.note }),
    }));

    try {
      const CHUNK_SIZE = 50;
      let totalCreated = 0;
      let totalEmailsSent = 0;
      let totalEmailsFailed = 0;
      const allErrors: ImportResults["errors"] = [];

      for (let i = 0; i < invitations.length; i += CHUNK_SIZE) {
        const chunk = invitations.slice(i, i + CHUNK_SIZE);
        const result = await batchCreateInvitations(chunk, sendEmail && emailEnabled);

        totalCreated += result.invitations?.length || 0;
        if (result.emailSummary) {
          totalEmailsSent += result.emailSummary.sent || 0;
          totalEmailsFailed += result.emailSummary.failed || 0;
          if (result.emailSummary.errors) {
            allErrors.push(
              ...result.emailSummary.errors.map((e: { email: string; error: string }) => ({
                row: i,
                email: e.email,
                error: e.error,
              }))
            );
          }
        }
        if (result.errors) {
          allErrors.push(
            ...result.errors.map((e: { index: number; error: string }) => ({
              row: i + e.index,
              email: invitations[i + e.index]?.participant?.email || "unknown",
              error: e.error,
            }))
          );
        }

        setImportProgress(Math.min(100, Math.round(((i + chunk.length) / invitations.length) * 100)));
      }

      setResults({
        created: totalCreated,
        emailsSent: totalEmailsSent,
        emailsFailed: totalEmailsFailed,
        errors: allErrors,
      });
      setStep("results");
    } catch (err) {
      setResults({
        created: 0,
        emailsSent: 0,
        emailsFailed: 0,
        errors: [{ row: 0, email: "", error: err instanceof Error ? err.message : "Import failed" }],
      });
      setStep("results");
    } finally {
      setImporting(false);
    }
  }, [assessmentId, validRows, sendEmail, emailEnabled]);

  const toggleRowExclusion = useCallback((index: number) => {
    setRows((prev) =>
      prev.map((r) => (r.index === index ? { ...r, excluded: !r.excluded } : r))
    );
  }, []);

  // ---- Computed ----
  const requiredFieldsMapped = useMemo(
    () => mappings.filter((m) => m.required).every((m) => m.csvColumn),
    [mappings]
  );

  const unmappedColumns = useMemo(
    () => (csvData ? getUnmappedColumns(csvData.headers, mappings) : []),
    [csvData, mappings]
  );

  const selectedAssessment = useMemo(
    () => assessments.find((a) => a.id === assessmentId),
    [assessments, assessmentId]
  );

  // ---- Render ----
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl mx-3 sm:mx-4 max-h-[90vh] flex flex-col">
        <div className="bg-[#0e0e16] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between flex-shrink-0">
            <div>
              <h2 className="text-lg font-semibold text-white/90">Bulk Import</h2>
              <p className="text-xs text-white/30 mt-0.5">
                {step === "upload" && "Upload a CSV file with participant data"}
                {step === "mapping" && "Map CSV columns to fields"}
                {step === "preview" && `${validRows.length} of ${rows.length} rows ready`}
                {step === "importing" && "Importing..."}
                {step === "results" && "Import complete"}
              </p>
            </div>
            <button onClick={onClose} className="text-white/20 hover:text-white/40 text-xl leading-none">&times;</button>
          </div>

          {/* Steps indicator */}
          <div className="px-6 py-3 border-b border-white/5 flex items-center gap-2 flex-shrink-0">
            {["Upload", "Map Fields", "Preview", "Import"].map((label, i) => {
              const stepOrder: Step[] = ["upload", "mapping", "preview", "importing"];
              const current = stepOrder.indexOf(step === "results" ? "importing" : step);
              const isActive = i <= current;
              return (
                <div key={label} className="flex items-center gap-2">
                  {i > 0 && <div className={`w-6 h-px ${isActive ? "bg-purple-500/50" : "bg-white/10"}`} />}
                  <div className={`text-xs font-medium ${isActive ? "text-purple-400" : "text-white/20"}`}>
                    {label}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {/* ---- STEP 1: UPLOAD ---- */}
            {step === "upload" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-white/40 mb-1.5">
                    Assessment <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={assessmentId}
                    onChange={(e) => setAssessmentId(e.target.value)}
                    className="w-full bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-white/20 appearance-none cursor-pointer"
                  >
                    <option value="">Select an assessment...</option>
                    {assessments.filter((a) => a.status === "active").map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>

                <div
                  onDrop={handleDrop}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors ${
                    dragOver
                      ? "border-purple-500/50 bg-purple-500/5"
                      : "border-white/10 hover:border-white/20"
                  }`}
                >
                  <div className="text-3xl mb-3 opacity-30">CSV</div>
                  <p className="text-sm text-white/50 mb-2">
                    Drag & drop your CSV file here
                  </p>
                  <p className="text-xs text-white/20 mb-4">or</p>
                  <label className="inline-block px-4 py-2 text-sm font-medium rounded-xl border border-white/15 text-white/70 hover:bg-white/[0.05] cursor-pointer transition-colors">
                    Browse Files
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleFileInput}
                      className="hidden"
                    />
                  </label>
                </div>

                {parseError && (
                  <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/25 text-red-400 text-sm">
                    {parseError}
                  </div>
                )}
              </div>
            )}

            {/* ---- STEP 2: MAPPING ---- */}
            {step === "mapping" && csvData && (
              <div className="space-y-4">
                <div className="text-sm text-white/40">
                  Detected <strong className="text-white/70">{csvData.headers.length}</strong> columns and{" "}
                  <strong className="text-white/70">{csvData.rows.length}</strong> rows in{" "}
                  <strong className="text-white/70">{fileName}</strong>
                </div>

                <div className="space-y-2">
                  {SYSTEM_FIELDS.map(({ field, label, required }) => {
                    const mapping = mappings.find((m) => m.systemField === field);
                    const isMapped = !!mapping?.csvColumn;
                    return (
                      <div
                        key={field}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${
                          isMapped
                            ? "border-green-500/20 bg-green-500/5"
                            : required
                            ? "border-red-500/20 bg-red-500/5"
                            : "border-white/5 bg-white/[0.02]"
                        }`}
                      >
                        <div className="w-24 flex-shrink-0">
                          <span className="text-sm text-white/70">{label}</span>
                          {required && <span className="text-red-400 text-xs ml-1">*</span>}
                        </div>
                        <span className="text-white/20">&rarr;</span>
                        <select
                          value={mapping?.csvColumn || ""}
                          onChange={(e) => updateMapping(field, e.target.value || null)}
                          className="flex-1 bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white outline-none focus:border-white/20 appearance-none cursor-pointer"
                        >
                          <option value="">Not mapped</option>
                          {field === "name" && nameDetection.type === "composite" && (
                            <option value={`${nameDetection.columns[0]} + ${nameDetection.columns[1]}`}>
                              {nameDetection.columns[0]} + {nameDetection.columns[1]} (combined)
                            </option>
                          )}
                          {csvData.headers.map((h) => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                        {isMapped && <span className="text-green-400 text-sm">&#10003;</span>}
                      </div>
                    );
                  })}
                </div>

                {unmappedColumns.length > 0 && (
                  <div className="text-xs text-white/20">
                    Ignored columns: {unmappedColumns.join(", ")}
                  </div>
                )}
              </div>
            )}

            {/* ---- STEP 3: PREVIEW ---- */}
            {step === "preview" && (
              <div className="space-y-4">
                {emailEnabled && (
                  <label className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/5">
                    <input
                      type="checkbox"
                      checked={sendEmail}
                      onChange={(e) => setSendEmail(e.target.checked)}
                      className="w-4 h-4 rounded border-white/20 bg-white/5 text-purple-500 focus:ring-purple-500/30"
                    />
                    <div>
                      <span className="text-sm text-white/70">Send invitation emails</span>
                      <p className="text-xs text-white/30">Each participant will receive an email with their unique link</p>
                    </div>
                  </label>
                )}

                <div className="flex items-center gap-4 text-sm">
                  <span className="text-green-400">{validRows.length} valid</span>
                  <span className="text-red-400">{rows.filter((r) => r.errors.length > 0).length} errors</span>
                  <span className="text-amber-400">{rows.filter((r) => r.warnings.length > 0).length} warnings</span>
                  {selectedAssessment && (
                    <span className="text-white/30 ml-auto">{selectedAssessment.name}</span>
                  )}
                </div>

                <div className="overflow-x-auto rounded-xl border border-white/10">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-white/[0.03]">
                        <th className="px-2 py-2 text-left text-xs text-white/30 w-8"></th>
                        <th className="px-2 py-2 text-left text-xs text-white/30">Name</th>
                        <th className="px-2 py-2 text-left text-xs text-white/30">Email</th>
                        <th className="px-2 py-2 text-left text-xs text-white/30 hidden sm:table-cell">Company</th>
                        <th className="px-2 py-2 text-left text-xs text-white/30 hidden md:table-cell">Role</th>
                        <th className="px-2 py-2 text-left text-xs text-white/30 w-16">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 100).map((row) => (
                        <tr
                          key={row.index}
                          className={`border-t border-white/5 ${
                            row.excluded
                              ? "opacity-40"
                              : row.errors.length > 0
                              ? "bg-red-500/5"
                              : row.warnings.length > 0
                              ? "bg-amber-500/5"
                              : ""
                          }`}
                        >
                          <td className="px-2 py-1.5">
                            <input
                              type="checkbox"
                              checked={!row.excluded}
                              onChange={() => toggleRowExclusion(row.index)}
                              className="w-3.5 h-3.5 rounded border-white/20 bg-white/5"
                            />
                          </td>
                          <td className="px-2 py-1.5 text-white/70">{row.name || "\u2014"}</td>
                          <td className="px-2 py-1.5 text-white/50">{row.email || "\u2014"}</td>
                          <td className="px-2 py-1.5 text-white/40 hidden sm:table-cell">{row.company || "\u2014"}</td>
                          <td className="px-2 py-1.5 text-white/40 hidden md:table-cell">{row.role || "\u2014"}</td>
                          <td className="px-2 py-1.5">
                            {row.errors.length > 0 && (
                              <span className="text-xs text-red-400" title={row.errors.join(", ")}>Error</span>
                            )}
                            {row.errors.length === 0 && row.warnings.length > 0 && (
                              <span className="text-xs text-amber-400" title={row.warnings.join(", ")}>Warn</span>
                            )}
                            {row.errors.length === 0 && row.warnings.length === 0 && (
                              <span className="text-xs text-green-400">OK</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {rows.length > 100 && (
                    <div className="px-3 py-2 text-xs text-white/20 text-center border-t border-white/5">
                      Showing first 100 of {rows.length} rows
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ---- STEP 4: IMPORTING ---- */}
            {step === "importing" && (
              <div className="py-12 text-center space-y-4">
                <p className="text-sm text-white/50">
                  Creating {validRows.length} invitation{validRows.length !== 1 ? "s" : ""}...
                </p>
                <div className="w-full bg-white/5 rounded-full h-2 max-w-xs mx-auto">
                  <div
                    className="bg-gradient-to-r from-purple-500 to-blue-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${importProgress}%` }}
                  />
                </div>
                <p className="text-xs text-white/30">{importProgress}%</p>
              </div>
            )}

            {/* ---- STEP 5: RESULTS ---- */}
            {step === "results" && results && (
              <div className="space-y-4">
                <div className="text-center py-6">
                  <h3 className="text-lg font-semibold text-white/90">
                    {results.created} invitation{results.created !== 1 ? "s" : ""} created
                  </h3>
                  {results.emailsSent > 0 && (
                    <p className="text-sm text-green-400 mt-1">
                      {results.emailsSent} email{results.emailsSent !== 1 ? "s" : ""} sent
                    </p>
                  )}
                  {results.emailsFailed > 0 && (
                    <p className="text-sm text-amber-400 mt-1">
                      {results.emailsFailed} email{results.emailsFailed !== 1 ? "s" : ""} failed
                    </p>
                  )}
                </div>

                {results.errors.length > 0 && (
                  <div className="rounded-xl border border-red-500/20 overflow-hidden">
                    <div className="px-3 py-2 bg-red-500/10 text-xs text-red-400 font-medium">
                      {results.errors.length} error{results.errors.length !== 1 ? "s" : ""}
                    </div>
                    <div className="max-h-40 overflow-y-auto">
                      {results.errors.map((err, i) => (
                        <div key={i} className="px-3 py-1.5 text-xs text-white/40 border-t border-red-500/10">
                          {err.email && <span className="text-white/60">{err.email}: </span>}
                          {err.error}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-white/5 flex items-center justify-between flex-shrink-0">
            <div>
              {step === "mapping" && (
                <button
                  onClick={() => { setStep("upload"); setCsvData(null); setFileName(""); }}
                  className="px-3 py-1.5 text-sm text-white/40 hover:text-white/60 transition-colors"
                >
                  &larr; Back
                </button>
              )}
              {step === "preview" && (
                <button
                  onClick={() => setStep("mapping")}
                  className="px-3 py-1.5 text-sm text-white/40 hover:text-white/60 transition-colors"
                >
                  &larr; Back
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {step !== "importing" && step !== "results" && (
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm rounded-xl border border-white/10 text-white/50 hover:bg-white/[0.04] transition-colors"
                >
                  Cancel
                </button>
              )}
              {step === "mapping" && (
                <button
                  onClick={buildPreview}
                  disabled={!requiredFieldsMapped}
                  className={`px-5 py-2 text-sm font-medium rounded-xl border transition-all ${
                    requiredFieldsMapped
                      ? "bg-white/[0.10] border-white/15 text-white hover:bg-white/[0.15]"
                      : "bg-white/[0.04] border-white/10 text-white/25 cursor-not-allowed"
                  }`}
                >
                  Preview &rarr;
                </button>
              )}
              {step === "preview" && (
                <button
                  onClick={handleImport}
                  disabled={validRows.length === 0 || !assessmentId}
                  className={`px-5 py-2 text-sm font-medium rounded-xl border transition-all ${
                    validRows.length > 0 && assessmentId
                      ? "bg-gradient-to-r from-purple-500/20 to-blue-500/20 border-purple-500/20 text-purple-200 hover:from-purple-500/30 hover:to-blue-500/30 hover:text-white"
                      : "bg-white/[0.04] border-white/10 text-white/25 cursor-not-allowed"
                  }`}
                >
                  Import {validRows.length} invitation{validRows.length !== 1 ? "s" : ""}
                  {sendEmail && emailEnabled ? " & Send Emails" : ""}
                </button>
              )}
              {step === "results" && (
                <button
                  onClick={() => { onComplete(); onClose(); }}
                  className="px-5 py-2 text-sm font-medium rounded-xl border bg-white/[0.10] border-white/15 text-white hover:bg-white/[0.15] transition-all"
                >
                  Done
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
