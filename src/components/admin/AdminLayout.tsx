import { useState, useEffect } from "react";
import { Outlet, useNavigate, useLocation, Link } from "react-router-dom";
import { API_BASE } from "../../lib/api";
import { fetchSessions, fetchInvitations, fetchCompanies, fetchAssessments } from "../../lib/admin-api";
import AdminChatDrawer from "./AdminChatDrawer";

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

const NAV_ITEMS: { path: string; label: string; icon: React.FC; countKey?: string }[] = [
  { path: "/admin/dashboard", label: "Dashboard", icon: IconDashboard },
  { path: "/admin/sessions", label: "Sessions", icon: IconSessions, countKey: "sessions" },
  { path: "/admin/invitations", label: "Invitations", icon: IconInvitations, countKey: "invitations" },
  { path: "/admin/companies", label: "Companies", icon: IconCompanies, countKey: "companies" },
  { path: "/admin/assessments", label: "Assessments", icon: IconAssessments, countKey: "assessments" },
  { path: "/admin/builder", label: "Builder", icon: IconBuilder },
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

  const currentTitle = NAV_ITEMS.find((n) => location.pathname.startsWith(n.path))?.label || "Admin";

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
          fixed inset-y-0 left-0 z-50 bg-[#0a0a12] border-r border-white/5 flex flex-col transition-all duration-300
          md:static md:translate-x-0 md:z-auto
          ${collapsed ? "md:w-16 w-56" : "md:w-56 w-56"}
          ${mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
      >
        {/* Logo area */}
        <div className={`border-b border-white/5 flex items-center ${collapsed ? "justify-center p-3" : "gap-3 p-4"}`}>
          <img src="/hmn_logo.png" alt="HMN" className="h-7 w-7 object-contain shrink-0" />
          {!collapsed && <span className="font-semibold text-white/90 text-sm whitespace-nowrap">Cascade Admin</span>}
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-4 px-2 space-y-1">
          {NAV_ITEMS.map((item) => {
            const active = location.pathname.startsWith(item.path);
            const Icon = item.icon;
            const count = item.countKey ? counts[item.countKey] : undefined;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
                  active
                    ? "bg-white/10 text-white border-l-2 border-blue-400"
                    : "text-white/40 hover:text-white/70 hover:bg-white/5"
                } ${collapsed ? "justify-center" : ""}`}
              >
                <span className="shrink-0 w-5 h-5"><Icon /></span>
                {!collapsed && (
                  <>
                    <span className="flex-1">{item.label}</span>
                    {count !== undefined && count > 0 && (
                      <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${
                        active ? "bg-blue-500/20 text-blue-300" : "bg-white/5 text-white/30"
                      }`}>
                        {count}
                      </span>
                    )}
                  </>
                )}
              </Link>
            );
          })}
        </nav>

        {/* AI Assistant — sticky footer in sidebar */}
        <div className="p-2 border-t border-white/5">
          <button
            onClick={() => { setChatOpen((o) => !o); setMobileOpen(false); }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
              chatOpen
                ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                : "text-white/40 hover:text-white/70 hover:bg-white/5"
            }`}
          >
            <span className="shrink-0 w-7 h-7 rounded-lg bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </span>
            {!collapsed && <span>AI Assistant</span>}
          </button>
        </div>

        {/* Collapse toggle — desktop only */}
        <div className="hidden md:block p-3 border-t border-white/5">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center justify-center p-2 rounded-lg text-white/20 hover:text-white/40 hover:bg-white/5 transition-all"
          >
            {collapsed ? "→" : "←"}
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="shrink-0 border-b border-white/5 px-4 md:px-6 py-3 flex items-center justify-between bg-white/[0.01]">
          <div className="flex items-center gap-3">
            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen(true)}
              className="md:hidden p-1 text-white/50 hover:text-white/80 transition-colors"
            >
              <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M3 6h18M3 12h18M3 18h18" />
              </svg>
            </button>
            <h1 className="text-lg font-semibold text-white/90">{currentTitle}</h1>
          </div>
          <div className="flex items-center gap-3 md:gap-4">
            <a href="/" className="text-white/30 hover:text-white/50 text-xs md:text-sm transition-colors">View Site</a>
            <button onClick={handleLogout} className="text-white/30 hover:text-white/50 text-xs md:text-sm transition-colors">Logout</button>
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
          bg-gradient-to-br from-purple-600 to-blue-600
          text-white shadow-lg shadow-purple-900/30
          hover:shadow-xl hover:shadow-purple-900/40 hover:scale-105
          active:scale-95 transition-all duration-200
          items-center justify-center
          ${chatOpen ? "ring-2 ring-purple-400/50 ring-offset-2 ring-offset-[#0a0a12]" : ""}
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
      <AdminChatDrawer open={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  );
}
