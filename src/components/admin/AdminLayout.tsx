import { useState, useEffect } from "react";
import { Outlet, useNavigate, useLocation, Link } from "react-router-dom";
import { API_BASE } from "../../lib/api";
import { fetchSessions, fetchInvitations, fetchCompanies, fetchAssessments } from "../../lib/admin-api";
import AdminChatDrawer from "./AdminChatDrawer";
import { ThemeToggle } from "../ui/ThemeToggle";

/* ── SVG icon components ── */
const IconDashboard = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
  </svg>
);
const IconSessions = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
  </svg>
);
const IconInvitations = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
  </svg>
);
const IconCompanies = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5M3.75 3v18m4.5-18v18m4.5-18v18m4.5-18v18m4.5-18v18M4.5 3h15M4.5 21h15M7.5 6.75h.008v.008H7.5V6.75zm0 3h.008v.008H7.5v-.008zm0 3h.008v.008H7.5v-.008zm4.5-6h.008v.008H12V6.75zm0 3h.008v.008H12v-.008zm0 3h.008v.008H12v-.008zm4.5-6h.008v.008h-.008V6.75zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
  </svg>
);
const IconAssessments = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
  </svg>
);
const IconBuilder = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17l-5.1 5.1a2.121 2.121 0 01-3-3l5.1-5.1m0 0L15.17 4.42a2.121 2.121 0 013 3l-7.75 7.75zM14.121 9.879L9.879 14.121M12.75 3.75h3v3" />
  </svg>
);
const IconCampaigns = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 010 3.46" />
  </svg>
);
const IconContacts = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
  </svg>
);
const IconCalls = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
  </svg>
);
const IconWebhooks = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.54a4.5 4.5 0 00-6.364-6.364L4.5 8.354a4.5 4.5 0 001.242 7.244" />
  </svg>
);
const IconAnalytics = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
  </svg>
);
const IconSearch = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
  </svg>
);
const IconSettings = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const NAV_ITEMS: { path: string; label: string; icon: React.FC; countKey?: string; section?: string }[] = [
  { path: "/admin/dashboard", label: "Dashboard", icon: IconDashboard },
  { path: "/admin/sessions", label: "Sessions", icon: IconSessions, countKey: "sessions" },
  { path: "/admin/invitations", label: "Invitations", icon: IconInvitations, countKey: "invitations" },
  { path: "/admin/companies", label: "Companies", icon: IconCompanies, countKey: "companies" },
  { path: "/admin/assessments", label: "Assessments", icon: IconAssessments, countKey: "assessments" },
  { path: "/admin/builder", label: "Builder", icon: IconBuilder },
  { path: "/admin/campaigns", label: "Campaigns", icon: IconCampaigns, section: "outreach" },
  { path: "/admin/contacts", label: "Contacts", icon: IconContacts, section: "outreach" },
  { path: "/admin/calls", label: "Calls", icon: IconCalls, section: "outreach" },
  { path: "/admin/analytics", label: "Analytics", icon: IconAnalytics, section: "tools" },
  { path: "/admin/search", label: "Search", icon: IconSearch, section: "tools" },
  { path: "/admin/webhooks", label: "Webhooks", icon: IconWebhooks, section: "tools" },
  { path: "/admin/settings", label: "Settings", icon: IconSettings, section: "tools" },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [authenticated, setAuthenticated] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    fetch(`${API_BASE}/api/admin/verify`, { credentials: "include" })
      .then((res) => {
        if (!res.ok) navigate("/admin");
        else setAuthenticated(true);
      })
      .catch(() => navigate("/admin"));
  }, [navigate]);

  // Fetch sidebar counts
  useEffect(() => {
    if (!authenticated) return;
    Promise.all([
      fetchSessions().then((d) => d.length).catch(() => 0),
      fetchInvitations().then((d) => d.length).catch(() => 0),
      fetchCompanies().then((d) => d.length).catch(() => 0),
      fetchAssessments().then((d) => d.length).catch(() => 0),
    ]).then(([sessions, invitations, companies, assessments]) => {
      setCounts({ sessions, invitations, companies, assessments });
    });
  }, [authenticated]);

  // Close mobile nav on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    fetch(`${API_BASE}/api/admin/logout`, { method: "POST", credentials: "include" }).finally(() => {
      navigate("/admin");
    });
  };

  if (!authenticated) return null;

  const currentTitle = NAV_ITEMS.find((n) => location.pathname.startsWith(n.path))?.label
    || (location.pathname.startsWith("/admin/preview") ? "Preview" : "Admin");

  return (
    <div className="h-screen flex overflow-hidden">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar — hidden on mobile, slide-in when mobileOpen */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 bg-card dark:bg-[#0a0a12] border-r border-border flex flex-col transition-all duration-300
          md:static md:translate-x-0 md:z-auto
          ${collapsed ? "md:w-16 w-56" : "md:w-56 w-56"}
          ${mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
      >
        {/* Logo area */}
        <div className={`border-b border-border flex items-center ${collapsed ? "justify-center p-3" : "gap-3 p-4"}`}>
          <img src="/hmn_logo.png" alt="HMN" className="h-7 w-7 object-contain shrink-0 hidden dark:block" />
          <img src="/hmn_logo_grey.png" alt="HMN" className="h-7 w-7 object-contain shrink-0 block dark:hidden" />
          {!collapsed && <span className="font-semibold text-foreground/90 text-sm whitespace-nowrap">Cascade Admin</span>}
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item, idx) => {
            const active = location.pathname.startsWith(item.path);
            const Icon = item.icon;
            const count = item.countKey ? counts[item.countKey] : undefined;
            const prevSection = idx > 0 ? NAV_ITEMS[idx - 1].section : undefined;
            const showDivider = item.section && item.section !== prevSection;
            return (
              <div key={item.path}>
                {showDivider && !collapsed && (
                  <div className="pt-3 pb-1 px-3">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {item.section === "outreach" ? "Outreach" : "Tools"}
                    </span>
                  </div>
                )}
                {showDivider && collapsed && <div className="my-2 mx-2 border-t border-border" />}
                <Link
                  to={item.path}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
                    active
                      ? "bg-foreground/[0.05] text-foreground border-l-2 border-primary shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  } ${collapsed ? "justify-center" : ""}`}
                >
                  <span className="shrink-0 w-5 h-5"><Icon /></span>
                  {!collapsed && (
                    <>
                      <span className="flex-1">{item.label}</span>
                      {count !== undefined && count > 0 && (
                        <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${
                          active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                        }`}>
                          {count}
                        </span>
                      )}
                    </>
                  )}
                </Link>
              </div>
            );
          })}
        </nav>

        {/* AI Assistant — sticky footer in sidebar */}
        <div className="p-2 border-t border-border">
          <button
            onClick={() => { setChatOpen((o) => !o); setMobileOpen(false); }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
              chatOpen
                ? "bg-blue-500/10 text-blue-600 dark:text-blue-300 border border-blue-500/20"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <span className="shrink-0 w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-cyan-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </span>
            {!collapsed && <span>AI Assistant</span>}
          </button>
        </div>

        {/* Collapse toggle — desktop only */}
        <div className="hidden md:block p-3 border-t border-border">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center justify-center p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
          >
            {collapsed ? "→" : "←"}
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="shrink-0 border-b border-border px-4 md:px-6 py-3 flex items-center justify-between bg-background/80 backdrop-blur-md">
          <div className="flex items-center gap-3">
            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen(true)}
              className="md:hidden p-1 text-muted-foreground hover:text-foreground/90 transition-colors"
            >
              <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M3 6h18M3 12h18M3 18h18" />
              </svg>
            </button>
            <h1 className="text-lg font-semibold text-foreground/90">{currentTitle}</h1>
          </div>
          <div className="flex items-center gap-3 md:gap-4">
            <ThemeToggle />
            <a href="/" className="text-muted-foreground hover:text-muted-foreground text-xs md:text-sm transition-colors">View Site</a>
            <button onClick={handleLogout} className="text-muted-foreground hover:text-muted-foreground text-xs md:text-sm transition-colors">Logout</button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <Outlet />
        </main>
      </div>

      {/* Floating AI Chat button — hidden on mobile (sidebar has it), visible on desktop */}
      <button
        onClick={() => setChatOpen((o) => !o)}
        className={`
          hidden md:flex fixed bottom-6 right-6 z-30 w-14 h-14 rounded-full
          bg-gradient-to-br from-blue-600 to-cyan-600
          text-foreground shadow-lg shadow-blue-900/30
          hover:shadow-xl hover:shadow-blue-900/40 hover:scale-105
          active:scale-95 transition-all duration-200
          items-center justify-center
          ${chatOpen ? "ring-2 ring-blue-400/50 ring-offset-2 ring-offset-[#0a0a12]" : ""}
        `}
        title="AI Assistant"
      >
        {chatOpen ? (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
          </svg>
        )}
      </button>

      {/* AI Chat Drawer */}
      <AdminChatDrawer open={chatOpen} onClose={() => setChatOpen(false)} pageContext={location.pathname.replace('/admin/', '') || 'dashboard'} />
    </div>
  );
}
