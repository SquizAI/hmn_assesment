import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { adminSearch } from "../lib/admin-api";
import StatusBadge from "../components/admin/StatusBadge";
import { SessionDrawerContent } from "../components/admin/SessionDrawer";
import ContactDrawerContent from "../components/admin/ContactDrawerContent";
import CallDrawerContent from "../components/admin/CallDrawerContent";
import { useDetailDrawer } from "../components/admin/DetailDrawer";

interface SessionResult { id: string; participant_name: string; participant_company: string; participant_email: string | null; status: string; overall_score: number | null; archetype: string | null; created_at: string; }
interface ContactResult { id: string; name: string; phone: string; email: string | null; company: string | null; status: string; created_at: string; }
interface CallResult { id: string; status: string; duration_seconds: number | null; transcript_snippet: string | null; contact_name: string | null; contact_company: string | null; created_at: string; }
interface ProfileResult { id: string; session_id: string; participant_name: string; participant_company: string | null; archetype: string | null; overall_score: number | null; executive_summary: string | null; assessment_type: string; created_at: string; }
interface SearchResponse { sessions: { results: SessionResult[]; total: number }; contacts: { results: ContactResult[]; total: number }; calls: { results: CallResult[]; total: number }; profiles: { results: ProfileResult[]; total: number }; query: string; }

type SearchType = "all" | "sessions" | "contacts" | "calls" | "profiles";
const TABS: { label: string; value: SearchType }[] = [{ label: "All", value: "all" }, { label: "Sessions", value: "sessions" }, { label: "Contacts", value: "contacts" }, { label: "Calls", value: "calls" }, { label: "Profiles", value: "profiles" }];

function formatDate(iso: string) { return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
function formatDuration(s: number | null) { if (!s) return "--:--"; return `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`; }

export default function AdminSearchPage() {
  const navigate = useNavigate();
  const { openDrawer, closeDrawer } = useDetailDrawer();
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get("q") || "";
  const [inputValue, setInputValue] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const [activeTab, setActiveTab] = useState<SearchType>("all");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SearchResponse | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const timer = setTimeout(() => { setQuery(inputValue); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [inputValue]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (activeTab !== "all") params.set("type", activeTab);
    navigate(`/admin/search${params.toString() ? `?${params}` : ""}`, { replace: true });
  }, [query, activeTab, navigate]);

  const fetchResults = useCallback(async () => {
    if (!query.trim()) { setData(null); return; }
    setLoading(true);
    try {
      setData(await adminSearch({ q: query, type: activeTab, page, limit: 20 }));
    } catch (err) { console.error("Search error:", err); }
    finally { setLoading(false); }
  }, [query, activeTab, page]);

  useEffect(() => { fetchResults(); }, [fetchResults]);

  const totalAll = (data?.sessions.total || 0) + (data?.contacts.total || 0) + (data?.calls.total || 0) + (data?.profiles?.total || 0);

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Search</h1>
        <p className="text-muted-foreground mt-1">Search across sessions, contacts, and calls</p>
      </div>

      <div className="relative mb-6">
        <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
        <input ref={inputRef} type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)} placeholder="Search by name, company, email, industry..." className="w-full bg-muted border border-border rounded-xl pl-12 pr-4 py-3.5 text-foreground placeholder:text-muted-foreground text-base focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/20 transition-all" />
        {inputValue && <button onClick={() => { setInputValue(""); inputRef.current?.focus(); }} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-muted-foreground"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>}
      </div>

      <div className="flex gap-1 mb-6 p-1 bg-muted rounded-xl w-fit">
        {TABS.map((tab) => {
          const count = tab.value === "all" ? totalAll : tab.value === "sessions" ? data?.sessions.total || 0 : tab.value === "contacts" ? data?.contacts.total || 0 : tab.value === "profiles" ? data?.profiles?.total || 0 : data?.calls.total || 0;
          return (
            <button key={tab.value} onClick={() => { setActiveTab(tab.value); setPage(1); }} className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === tab.value ? "bg-muted text-foreground" : "text-muted-foreground hover:text-muted-foreground"}`}>
              {tab.label}{data && query && <span className="ml-1.5 text-xs text-muted-foreground">{count}</span>}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2,3].map((i) => <div key={i} className="bg-muted border border-border rounded-xl p-4 animate-pulse"><div className="h-4 w-40 bg-muted rounded" /></div>)}</div>
      ) : !query.trim() ? (
        <div className="text-center py-20"><p className="text-muted-foreground text-sm">Start typing to search across all records</p></div>
      ) : data && totalAll === 0 ? (
        <div className="text-center py-20"><p className="text-muted-foreground text-sm">No results found for "{query}"</p></div>
      ) : (
        <div className="space-y-8">
          {(activeTab === "all" || activeTab === "sessions") && data && data.sessions.results.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Sessions <span className="ml-2 text-muted-foreground font-normal normal-case">({data.sessions.total})</span></h2>
              <div className="space-y-2">
                {data.sessions.results.map((s) => (
                  <div key={s.id} onClick={() => openDrawer(<SessionDrawerContent sessionId={s.id} onClose={closeDrawer} />)} className="block bg-muted border border-border rounded-xl p-4 hover:bg-foreground/[0.08] transition-all cursor-pointer">
                    <div className="flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-foreground">{s.participant_name}</span>
                        {s.participant_company && <span className="ml-3 text-xs text-muted-foreground">{s.participant_company}</span>}
                      </div>
                      <div className="flex items-center gap-3">
                        {s.overall_score !== null && <span className="text-sm font-semibold text-foreground/80">{Math.round(s.overall_score)}</span>}
                        {s.archetype && <span className="px-2 py-0.5 text-[10px] font-medium bg-blue-500/10 text-blue-300 rounded-full">{s.archetype}</span>}
                        <span className="text-xs text-muted-foreground">{formatDate(s.created_at)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {(activeTab === "all" || activeTab === "contacts") && data && data.contacts.results.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Contacts <span className="ml-2 text-muted-foreground font-normal normal-case">({data.contacts.total})</span></h2>
              <div className="space-y-2">
                {data.contacts.results.map((c) => (
                  <div key={c.id} onClick={() => openDrawer(<ContactDrawerContent contact={{ id: c.id, name: c.name, phone: c.phone, email: c.email, company: c.company, role: null, industry: null, team_size: null, status: c.status, tags: [], created_at: c.created_at }} onClose={closeDrawer} />)} className="block bg-muted border border-border rounded-xl p-4 hover:bg-foreground/[0.08] transition-all cursor-pointer">
                    <div className="flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-foreground">{c.name}</span>
                        {c.company && <span className="ml-3 text-xs text-muted-foreground">{c.company}</span>}
                        <div className="mt-1"><span className="text-xs text-muted-foreground font-mono">{c.phone}</span>{c.email && <span className="ml-3 text-xs text-muted-foreground">{c.email}</span>}</div>
                      </div>
                      <StatusBadge status={c.status} size="sm" />
                      <span className="text-xs text-muted-foreground">{formatDate(c.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {(activeTab === "all" || activeTab === "calls") && data && data.calls.results.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Calls <span className="ml-2 text-muted-foreground font-normal normal-case">({data.calls.total})</span></h2>
              <div className="space-y-2">
                {data.calls.results.map((call) => (
                  <div key={call.id} onClick={() => openDrawer(<CallDrawerContent call={{ id: call.id, contact_id: "", session_id: null, status: call.status, duration_seconds: call.duration_seconds, recording_url: null, transcript: null, transcript_messages: null, analysis_status: "pending", created_at: call.created_at, contact: call.contact_name ? { id: "", name: call.contact_name, phone: "", company: call.contact_company } : null, profile_score: null, profile_archetype: null }} onClose={closeDrawer} />)} className="block bg-muted border border-border rounded-xl p-4 hover:bg-foreground/[0.08] transition-all cursor-pointer">
                    <div className="flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-foreground">{call.contact_name || "Unknown"}</span>
                        {call.transcript_snippet && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{call.transcript_snippet}</p>}
                      </div>
                      <StatusBadge status={call.status} size="sm" />
                      <span className="text-xs text-muted-foreground font-mono">{formatDuration(call.duration_seconds)}</span>
                      <span className="text-xs text-muted-foreground">{formatDate(call.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {(activeTab === "all" || activeTab === "profiles") && data && data.profiles?.results && data.profiles.results.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Profiles <span className="ml-2 text-muted-foreground font-normal normal-case">({data.profiles.total})</span></h2>
              <div className="space-y-2">
                {data.profiles.results.map((profile) => (
                  <div key={profile.id} onClick={() => openDrawer(<SessionDrawerContent sessionId={profile.session_id} onClose={closeDrawer} />)} className="block bg-muted border border-border rounded-xl p-4 hover:bg-foreground/[0.08] transition-all cursor-pointer">
                    <div className="flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-foreground">{profile.participant_name || "Unknown"}</span>
                        {profile.participant_company && <span className="ml-3 text-xs text-muted-foreground">{profile.participant_company}</span>}
                        {profile.executive_summary && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{profile.executive_summary}</p>}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {profile.overall_score !== null && (
                          <span className={`text-sm font-semibold tabular-nums ${
                            profile.overall_score >= 70 ? "text-green-400" : profile.overall_score >= 45 ? "text-yellow-400" : "text-red-400"
                          }`}>
                            {Math.round(profile.overall_score)}
                          </span>
                        )}
                        {profile.archetype && (
                          <span className="px-2 py-0.5 text-[10px] font-medium bg-blue-500/10 text-blue-300 rounded-full border border-blue-500/20">
                            {profile.archetype}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">{formatDate(profile.created_at)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
