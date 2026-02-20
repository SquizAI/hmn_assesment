import { API_BASE } from "./api";

const graphFetch = async (path: string, options?: RequestInit) => {
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

export async function fetchCompanyIntelligence(companyName: string) {
  const res = await graphFetch(`/api/admin/graph/company/${encodeURIComponent(companyName)}`);
  return res.json();
}

export async function fetchAssessmentSummary(assessmentId: string) {
  const res = await graphFetch(`/api/admin/graph/assessment/${encodeURIComponent(assessmentId)}`);
  return res.json();
}

export async function fetchBenchmarks() {
  const res = await graphFetch("/api/admin/graph/benchmarks");
  return res.json();
}

export async function fetchThemeMap() {
  const res = await graphFetch("/api/admin/graph/themes");
  return res.json();
}

export async function seedGraph() {
  const res = await graphFetch("/api/admin/graph/seed", { method: "POST" });
  return res.json();
}

export async function fetchGraphStatus() {
  const res = await graphFetch("/api/admin/graph/status");
  return res.json();
}
