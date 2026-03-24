import { API_BASE } from "./api";

export interface DashboardFilters {
  company?: string;
  assessmentTypeId?: string;
  dateFrom?: string;
  dateTo?: string;
  industry?: string;
  archetype?: string;
}

export function buildFilterQS(filters?: DashboardFilters): string {
  if (!filters) return "";
  const params = new URLSearchParams();
  if (filters.company) params.set("company", filters.company);
  if (filters.assessmentTypeId) params.set("assessmentTypeId", filters.assessmentTypeId);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.industry) params.set("industry", filters.industry);
  if (filters.archetype) params.set("archetype", filters.archetype);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

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

export async function fetchStats(filters?: DashboardFilters) {
  const res = await adminFetch(`/api/admin/stats${buildFilterQS(filters)}`);
  return res.json();
}

export async function fetchSessions(filters?: DashboardFilters & { since?: string; status?: string; page?: number; limit?: number }) {
  const params = new URLSearchParams();
  if (filters?.since) params.set("since", filters.since);
  if (filters?.status) params.set("status", filters.status);
  if (filters?.assessmentTypeId) params.set("assessmentTypeId", filters.assessmentTypeId);
  if (filters?.company) params.set("company", filters.company);
  if (filters?.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters?.dateTo) params.set("dateTo", filters.dateTo);
  if (filters?.industry) params.set("industry", filters.industry);
  if (filters?.archetype) params.set("archetype", filters.archetype);
  if (filters?.page) params.set("page", String(filters.page));
  if (filters?.limit) params.set("limit", String(filters.limit));
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

export async function archiveAssessment(id: string) {
  const res = await adminFetch(`/api/admin/assessments/${id}`, { method: "DELETE" });
  return res.json();
}

export async function addQuestion(assessmentId: string, question: Record<string, unknown>) {
  const res = await adminFetch(`/api/admin/assessments/${assessmentId}/questions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  return res.json();
}

export async function updateQuestion(assessmentId: string, questionId: string, changes: Record<string, unknown>) {
  const res = await adminFetch(`/api/admin/assessments/${assessmentId}/questions/${questionId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ changes }),
  });
  return res.json();
}

export async function removeQuestion(assessmentId: string, questionId: string) {
  const res = await adminFetch(`/api/admin/assessments/${assessmentId}/questions/${questionId}`, { method: "DELETE" });
  return res.json();
}

export async function reorderQuestions(assessmentId: string, questionIds: string[]) {
  const res = await adminFetch(`/api/admin/assessments/${assessmentId}/questions/reorder`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ questionIds }),
  });
  return res.json();
}

export async function fetchFunnel(filters?: DashboardFilters) {
  const res = await adminFetch(`/api/admin/funnel${buildFilterQS(filters)}`);
  return res.json();
}

export async function fetchDimensions(filters?: DashboardFilters) {
  const res = await adminFetch(`/api/admin/dimensions${buildFilterQS(filters)}`);
  return res.json();
}

export async function exportSessionsData(format: "json" | "csv") {
  const res = await adminFetch(`/api/admin/export?format=${format}`);
  if (format === "csv") return res.text();
  return res.json();
}

export interface ChatAttachment {
  filename: string;
  content: string;
}

export async function adminChat(
  messages: { role: string; content: string; timestamp: string }[],
  attachments?: ChatAttachment[],
): Promise<{ response: string }> {
  const res = await adminFetch("/api/admin/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, attachments }),
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

// --- SSE Streaming chat functions ---

import type { ToolEvent, ToolCallRecord } from "./types";

function parseSSE(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onEvent: (event: ToolEvent) => void,
): Promise<{ text: string; toolCalls: ToolCallRecord[] }> {
  const decoder = new TextDecoder();
  let buffer = "";
  let responseText = "";
  let toolCalls: ToolCallRecord[] = [];

  return new Promise((resolve, reject) => {
    function pump(): void {
      reader.read().then(({ done, value }) => {
        if (done) {
          resolve({ text: responseText, toolCalls });
          return;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let currentEvent = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            const dataStr = line.slice(6);
            try {
              const data = JSON.parse(dataStr);

              if (currentEvent === "thinking") {
                onEvent({ type: "thinking", message: data.message });
              } else if (currentEvent === "tool_start") {
                onEvent({ type: "tool_start", name: data.name, displayName: data.displayName });
              } else if (currentEvent === "tool_result") {
                onEvent({ type: "tool_result", name: data.name, success: data.success, summary: data.summary });
              } else if (currentEvent === "response") {
                responseText = data.text;
                toolCalls = data.toolCalls || [];
                onEvent({ type: "response", text: data.text });
              } else if (currentEvent === "done") {
                onEvent({ type: "done" });
              }
            } catch {
              // skip malformed events
            }
            currentEvent = "";
          }
        }

        pump();
      }).catch(reject);
    }
    pump();
  });
}

export async function adminChatStream(
  messages: { role: string; content: string; timestamp: string }[],
  onEvent: (event: ToolEvent) => void,
  attachments?: ChatAttachment[],
  pageContext?: string,
): Promise<{ text: string; toolCalls: ToolCallRecord[] }> {
  const res = await fetch(`${API_BASE}/api/admin/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ messages, attachments, pageContext }),
  });

  if (res.status === 401) {
    window.location.href = "/admin";
    throw new Error("Unauthorized");
  }
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  if (!res.body) throw new Error("No response body");

  return parseSSE(res.body.getReader(), onEvent);
}

export async function chatWithAssessmentStream(
  assessmentId: string,
  messages: { role: string; content: string; timestamp: string }[],
  onEvent: (event: ToolEvent) => void,
): Promise<{ text: string; toolCalls: ToolCallRecord[] }> {
  const res = await fetch(`${API_BASE}/api/admin/assessments/${assessmentId}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ messages }),
  });

  if (res.status === 401) {
    window.location.href = "/admin";
    throw new Error("Unauthorized");
  }
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  if (!res.body) throw new Error("No response body");

  return parseSSE(res.body.getReader(), onEvent);
}

// --- Company CRM API ---

export async function fetchCompanies(filters?: DashboardFilters) {
  const res = await adminFetch(`/api/admin/companies${buildFilterQS(filters)}`);
  return res.json();
}

export async function removeCompany(companyName: string) {
  const res = await adminFetch(`/api/admin/companies/${encodeURIComponent(companyName)}`, { method: "DELETE" });
  return res.json();
}

export async function fetchCompanyDetail(companyName: string) {
  const res = await adminFetch(`/api/admin/companies/${encodeURIComponent(companyName)}`);
  return res.json();
}

export async function triggerResearch(sessionId: string) {
  const res = await adminFetch(`/api/admin/sessions/${sessionId}/research`, {
    method: "POST",
  });
  return res.json();
}

export async function analyzeSession(sessionId: string) {
  const res = await fetch("/api/interview/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
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

// --- Calibration API ---

export async function runCalibration(maxSessions = 10) {
  const res = await adminFetch("/api/admin/calibration/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ maxSessions }),
  });
  return res.json();
}

// --- Invitations API ---

export async function fetchInvitations(filters?: {
  status?: string;
  assessmentId?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.assessmentId) params.set("assessmentId", filters.assessmentId);
  const qs = params.toString();
  const res = await adminFetch(`/api/admin/invitations${qs ? `?${qs}` : ""}`);
  return res.json();
}

export async function createInvitation(data: {
  assessmentId: string;
  participant: {
    name: string;
    email: string;
    company?: string;
    role?: string;
    industry?: string;
    teamSize?: string;
  };
  note?: string;
  sendEmail?: boolean;
}) {
  const res = await adminFetch("/api/admin/invitations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function batchCreateInvitations(invitations: Array<{
  assessmentId: string;
  participant: {
    name: string;
    email: string;
    company?: string;
    role?: string;
    industry?: string;
    teamSize?: string;
  };
  note?: string;
}>, sendEmail?: boolean) {
  const res = await adminFetch("/api/admin/invitations/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ invitations, sendEmail }),
  });
  return res.json();
}

export async function removeInvitation(id: string) {
  const res = await adminFetch(`/api/admin/invitations/${id}`, { method: "DELETE" });
  return res.json();
}

export async function resendInvitation(id: string) {
  const res = await adminFetch(`/api/admin/invitations/${id}/resend`, { method: "POST" });
  return res.json();
}

export async function checkEmailStatus(): Promise<{ enabled: boolean; provider: string }> {
  const res = await adminFetch("/api/admin/email-status");
  return res.json();
}

export async function enrichEmail(email: string): Promise<{
  enriched: boolean;
  reason?: string;
  company?: string;
  industry?: string | null;
  teamSize?: string | null;
  domain?: string;
}> {
  const res = await adminFetch(`/api/admin/enrich-email?email=${encodeURIComponent(email)}`);
  return res.json();
}

// --- VAPI Outbound Calling ---

export async function initiateCall(sessionId: string, phone: string): Promise<{
  success: boolean;
  vapiCallId?: string;
  error?: string;
}> {
  const res = await adminFetch("/api/admin/calls/initiate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, phone }),
  });
  return res.json();
}

export async function getCallStatus(sessionId: string): Promise<{
  vapiCallId: string | null;
  callPhone: string | null;
  callInitiatedAt: string | null;
  callCompletedAt: string | null;
  callDuration: number | null;
  callRecordingUrl: string | null;
  hasTranscript: boolean;
}> {
  const res = await adminFetch(`/api/admin/calls/${sessionId}/status`);
  return res.json();
}

// --- Contacts API ---

export async function fetchContacts(filters?: { search?: string; status?: string; page?: number; limit?: number }) {
  const params = new URLSearchParams();
  if (filters?.search) params.set("search", filters.search);
  if (filters?.status) params.set("status", filters.status);
  if (filters?.page) params.set("page", String(filters.page));
  if (filters?.limit) params.set("limit", String(filters.limit));
  const qs = params.toString();
  const res = await adminFetch(`/api/admin/contacts${qs ? `?${qs}` : ""}`);
  return res.json();
}

export async function createContact(contact: Record<string, unknown>) {
  const res = await adminFetch("/api/admin/contacts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(contact),
  });
  return res.json();
}

export async function deleteContact(id: string) {
  const res = await adminFetch(`/api/admin/contacts/${id}`, { method: "DELETE" });
  return res.json();
}

export async function callContacts(contactIds: string[]) {
  const res = await adminFetch("/api/admin/calls/initiate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contactIds }),
  });
  return res.json();
}

// --- Campaigns API ---

export async function fetchCampaigns() {
  const res = await adminFetch("/api/admin/campaigns");
  return res.json();
}

export async function createCampaign(payload: Record<string, unknown>) {
  const res = await adminFetch("/api/admin/campaigns", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function fetchCampaignDetail(id: string) {
  const res = await adminFetch(`/api/admin/campaigns/${id}`);
  return res.json();
}

export async function deleteCampaign(id: string) {
  const res = await adminFetch(`/api/admin/campaigns/${id}`, { method: "DELETE" });
  return res.json();
}

export async function controlCampaign(id: string, action: "start" | "pause") {
  const res = await adminFetch(`/api/admin/campaigns/${id}/${action}`, { method: "POST" });
  return res.json();
}

// --- Settings API ---

export async function fetchRetentionSettings() {
  const res = await adminFetch("/api/admin/settings/retention");
  return res.json();
}

export async function saveRetentionSettings(settings: { retention_days: number | null; auto_cleanup: boolean; last_cleanup_at: string | null }) {
  const res = await adminFetch("/api/admin/settings/retention", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  return res.json();
}

export async function previewCleanup(days: number) {
  const res = await adminFetch(`/api/admin/settings/retention/preview?days=${days}`);
  return res.json();
}

export async function runCleanup() {
  const res = await adminFetch("/api/admin/cron/cleanup", { method: "POST" });
  return res.json();
}

// --- Webhooks API ---

export async function fetchWebhooks() {
  const res = await adminFetch("/api/admin/webhooks");
  return res.json();
}

export async function createWebhook(data: Record<string, unknown>) {
  const res = await adminFetch("/api/admin/webhooks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function updateWebhook(id: string, data: Record<string, unknown>) {
  const res = await adminFetch(`/api/admin/webhooks/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteWebhook(id: string) {
  const res = await adminFetch(`/api/admin/webhooks/${id}`, { method: "DELETE" });
  return res.json();
}

export async function testWebhook(id: string) {
  const res = await adminFetch(`/api/admin/webhooks/${id}/test`, { method: "POST" });
  return res.json();
}

// --- Auth API ---

export async function adminLogin(password: string) {
  const res = await fetch(`${API_BASE}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ password }),
  });
  return { ok: res.ok, data: await res.json() };
}

// --- Analytics API ---

export async function fetchAnalytics(period: string) {
  const res = await adminFetch(`/api/admin/analytics?period=${period}`);
  return res.json();
}

// --- Search API ---

export async function adminSearch(params: { q: string; type?: string; page?: number; limit?: number }) {
  const searchParams = new URLSearchParams();
  searchParams.set("q", params.q);
  if (params.type) searchParams.set("type", params.type);
  if (params.page) searchParams.set("page", String(params.page));
  if (params.limit) searchParams.set("limit", String(params.limit));
  const res = await adminFetch(`/api/admin/search?${searchParams.toString()}`);
  return res.json();
}

// --- Calls API ---

export async function fetchCalls(filters?: { status?: string; page?: number; limit?: number }) {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.page) params.set("page", String(filters.page));
  if (filters?.limit) params.set("limit", String(filters.limit));
  const qs = params.toString();
  const res = await adminFetch(`/api/admin/calls${qs ? `?${qs}` : ""}`);
  return res.json();
}

// --- Profile Stats API ---

export async function fetchProfileStats(filters?: DashboardFilters) {
  const res = await adminFetch(`/api/admin/profile-stats${buildFilterQS(filters)}`);
  return res.json();
}

export async function fetchContactAssessments(contactId: string) {
  const res = await adminFetch(`/api/admin/contacts/${contactId}/assessments`);
  return res.json();
}

export async function fetchCampaignResults(campaignId: string) {
  const res = await adminFetch(`/api/admin/campaigns/${campaignId}/results`);
  return res.json();
}
