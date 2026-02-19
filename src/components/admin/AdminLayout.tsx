import { useState, useEffect } from "react";
import { Outlet, useNavigate, useLocation, Link } from "react-router-dom";
import { API_BASE } from "../../lib/api";

const NAV_ITEMS = [
  { path: "/admin/dashboard", label: "Dashboard", icon: "📊" },
  { path: "/admin/sessions", label: "Sessions", icon: "👥" },
  { path: "/admin/invitations", label: "Invitations", icon: "✉️" },
  { path: "/admin/companies", label: "Companies", icon: "🏢" },
  { path: "/admin/assessments", label: "Assessments", icon: "📋" },
  { path: "/admin/builder", label: "Builder", icon: "🏗" },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [authenticated, setAuthenticated] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/admin/verify`, { credentials: "include" })
      .then((res) => {
        if (!res.ok) navigate("/admin");
        else setAuthenticated(true);
      })
      .catch(() => navigate("/admin"));
  }, [navigate]);

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
          fixed inset-y-0 left-0 z-50 w-56 bg-[#0a0a12] border-r border-white/5 flex flex-col transition-transform duration-300
          md:static md:translate-x-0 md:z-auto
          ${collapsed ? "md:w-16" : "md:w-56"}
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        {/* Logo area */}
        <div className="p-4 border-b border-white/5 flex items-center gap-3">
          <img src="/hmn_logo.png" alt="HMN" className="h-7 w-auto flex-shrink-0" />
          {!collapsed && <span className="font-semibold text-white/90 text-sm">Cascade Admin</span>}
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-4 px-2 space-y-1">
          {NAV_ITEMS.map((item) => {
            const active = location.pathname.startsWith(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
                  active
                    ? "bg-white/10 text-white border-l-2 border-blue-400"
                    : "text-white/40 hover:text-white/70 hover:bg-white/5"
                }`}
              >
                <span className="text-lg flex-shrink-0">{item.icon}</span>
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

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
        <header className="flex-shrink-0 border-b border-white/5 px-4 md:px-6 py-3 flex items-center justify-between bg-white/[0.01]">
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
    </div>
  );
}
