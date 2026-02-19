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
): Promise<{ text: string; toolCalls: ToolCallRecord[] }> {
  const res = await fetch(`${API_BASE}/api/admin/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ messages, attachments }),
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

export async function fetchCompanies() {
  const res = await adminFetch("/api/admin/companies");
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
}>) {
  const res = await adminFetch("/api/admin/invitations/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ invitations }),
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
