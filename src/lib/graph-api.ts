import { API_BASE } from "./api";
import { buildFilterQS } from "./admin-api";
import type { DashboardFilters } from "./admin-api";

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

export async function fetchBenchmarks(filters?: DashboardFilters) {
  const res = await graphFetch(`/api/admin/graph/benchmarks${buildFilterQS(filters)}`);
  return res.json();
}

export async function fetchThemeMap(filters?: DashboardFilters) {
  const res = await graphFetch(`/api/admin/graph/themes${buildFilterQS(filters)}`);
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

export async function fetchGrowthTimeline(filters?: DashboardFilters) {
  const res = await graphFetch(`/api/admin/graph/timeline${buildFilterQS(filters)}`);
  return res.json();
}

export async function fetchNetworkGraph(filters?: DashboardFilters) {
  const res = await graphFetch(`/api/admin/graph/network${buildFilterQS(filters)}`);
  return res.json();
}
