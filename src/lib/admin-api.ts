import { API_BASE } from "./api";

const adminFetch = async (path: string, options?: RequestInit) => {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
  });
  if (res.status === 401) {
    window.location.href = "/admin";
    throw new Error("Unauthorized");
  }
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res;
};

export async function fetchStats() {
  const res = await adminFetch("/api/admin/stats");
  return res.json();
}

export async function fetchSessions(filters?: { since?: string; status?: string; assessmentTypeId?: string }) {
  const params = new URLSearchParams();
  if (filters?.since) params.set("since", filters.since);
  if (filters?.status) params.set("status", filters.status);
  if (filters?.assessmentTypeId) params.set("assessmentTypeId", filters.assessmentTypeId);
  const qs = params.toString();
  const res = await adminFetch(`/api/admin/sessions${qs ? `?${qs}` : ""}`);
  return res.json();
}

export async function fetchSession(id: string) {
  const res = await adminFetch(`/api/admin/sessions/${id}`);
  return res.json();
}

export async function removeSession(id: string) {
  const res = await adminFetch(`/api/admin/sessions/${id}`, { method: "DELETE" });
  return res.json();
}

export async function fetchAssessments() {
  const res = await adminFetch("/api/admin/assessments");
  return res.json();
}

export async function fetchAssessment(id: string) {
  const res = await adminFetch(`/api/admin/assessments/${id}`);
  return res.json();
}

export async function createNewAssessment(config: Record<string, unknown>) {
  const res = await adminFetch("/api/admin/assessments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ config }),
  });
  return res.json();
}

export async function updateFullAssessment(id: string, changes: Record<string, unknown>) {
  const res = await adminFetch(`/api/admin/assessments/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ changes }),
  });
  return res.json();
}

export async function duplicateAssessmentApi(id: string, newId: string, newName: string) {
  const res = await adminFetch(`/api/admin/assessments/${id}/duplicate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newId, newName }),
  });
  return res.json();
}

export async function updateAssessmentStatus(id: string, status: string) {
  const res = await adminFetch(`/api/admin/assessments/${id}/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  return res.json();
}

export async function fetchFunnel() {
  const res = await adminFetch("/api/admin/funnel");
  return res.json();
}

export async function fetchDimensions(assessmentTypeId?: string) {
  const qs = assessmentTypeId ? `?assessmentTypeId=${assessmentTypeId}` : "";
  const res = await adminFetch(`/api/admin/dimensions${qs}`);
  return res.json();
}

export async function exportSessionsData(format: "json" | "csv") {
  const res = await adminFetch(`/api/admin/export?format=${format}`);
  if (format === "csv") return res.text();
  return res.json();
}

export async function createAssessmentFromFile(
  content: string,
  filename: string,
): Promise<{ assessment: Record<string, unknown>; message: string }> {
  const res = await adminFetch("/api/admin/assessments/from-file", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, filename }),
  });
  return res.json();
}

export async function chatWithAssessment(
  assessmentId: string,
  messages: { role: string; content: string; timestamp: string }[],
): Promise<{ response: string }> {
  const res = await adminFetch(`/api/admin/assessments/${assessmentId}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });
  return res.json();
}

export async function createPreviewSession(assessmentId: string): Promise<{ session: { id: string } }> {
  const res = await adminFetch("/api/sessions/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assessmentTypeId: assessmentId }),
  });
  return res.json();
}

export async function deletePreviewSession(sessionId: string): Promise<void> {
  await adminFetch(`/api/admin/preview/${sessionId}`, { method: "DELETE" });
}
