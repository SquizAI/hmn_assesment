// API calls go to same origin — Vite proxies /api to Express
export const API_BASE = "";

// --- Public API helpers (no auth required) ---

async function publicFetch(path: string, options?: RequestInit): Promise<Response> {
  const res = await fetch(`${API_BASE}${path}`, options);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res;
}

export async function fetchSessionPublic(sessionId: string) {
  const res = await publicFetch(`/api/sessions/${sessionId}`);
  return res.json();
}

export async function fetchAssessmentConfig(assessmentId: string) {
  const res = await publicFetch(`/api/assessments/${assessmentId}`);
  return res.json();
}

export async function createSession(participant: Record<string, string>, assessmentTypeId: string, inviteToken?: string) {
  const res = await publicFetch("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ participant, assessmentTypeId, inviteToken }),
  });
  return res.json();
}

export async function lookupSessionsByEmail(email: string) {
  const res = await publicFetch(`/api/sessions/lookup?email=${encodeURIComponent(email)}`);
  return res.json();
}

export async function validateResumeToken(token: string) {
  const res = await publicFetch(`/api/sessions/resume/${token}`);
  return res.json();
}

export async function compareSessions(params: URLSearchParams) {
  const res = await publicFetch(`/api/sessions/compare?${params.toString()}`);
  return res.json();
}

export async function lookupInvitation(token: string) {
  const res = await publicFetch(`/api/invitations/lookup?token=${encodeURIComponent(token)}`);
  return res.json();
}

// --- Interview API ---

export async function startInterview(sessionId: string) {
  const res = await publicFetch("/api/interview/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });
  return res.json();
}

export async function submitAnswer(sessionId: string, questionId: string, answer: string, conversationHistory?: Array<{ role: string; content: string }>) {
  const res = await publicFetch("/api/interview/respond", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, questionId, answer, conversationHistory }),
  });
  return res.json();
}

export async function updateAnswer(sessionId: string, questionId: string, answer: string) {
  const res = await publicFetch("/api/interview/respond", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, questionId, answer }),
  });
  return res.json();
}

export async function skipQuestion(sessionId: string, questionId: string) {
  const res = await publicFetch("/api/interview/respond", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, questionId, answer: "[SKIPPED]", skip: true }),
  });
  return res.json();
}

export async function analyzeSession(sessionId: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180000); // 3 minute timeout for analysis
  try {
    const res = await publicFetch("/api/interview/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
      signal: controller.signal,
    });
    return res.json();
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new Error("Analysis is taking longer than expected. Please try again.");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// --- Research API ---

export async function runResearch(sessionId: string) {
  const res = await publicFetch(`/api/research/${sessionId}`, { method: "POST" });
  return res.json();
}

export async function confirmResearch(sessionId: string, confirmed: boolean, corrections?: Record<string, string>) {
  const res = await publicFetch(`/api/research/${sessionId}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirmed, corrections }),
  });
  return res.json();
}

// --- Adaptability API ---

export async function fetchAdaptabilityProfile(sessionId: string) {
  const res = await publicFetch(`/api/adaptability/profile/${sessionId}`);
  return res.json();
}

export async function downloadReportPdf(sessionId: string) {
  const res = await fetch(`${API_BASE}/api/sessions/report/${sessionId}`);
  if (!res.ok) throw new Error(`PDF download failed: ${res.status}`);
  return res.blob();
}
