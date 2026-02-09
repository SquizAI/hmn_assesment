import { useState, useEffect } from "react";
import { Outlet, useNavigate, useLocation, Link } from "react-router-dom";
import { API_BASE } from "../../lib/api";
import { RobotProvider } from "./RobotToast";

const NAV_ITEMS = [
  { path: "/admin/dashboard", label: "Dashboard", icon: "📊" },
  { path: "/admin/sessions", label: "Sessions", icon: "👥" },
  { path: "/admin/assessments", label: "Assessments", icon: "📋" },
  { path: "/admin/chat", label: "AI Assistant", icon: "🤖" },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [authenticated, setAuthenticated] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/admin/verify`, { credentials: "include" })
      .then((res) => {
        if (!res.ok) navigate("/admin");
        else setAuthenticated(true);
      })
      .catch(() => navigate("/admin"));
  }, [navigate]);

  const handleLogout = () => {
    fetch(`${API_BASE}/api/admin/logout`, { method: "POST", credentials: "include" }).finally(() => {
      navigate("/admin");
    });
  };

  if (!authenticated) return null;

  const currentTitle = NAV_ITEMS.find((n) => location.pathname.startsWith(n.path))?.label || "Admin";

  return (
    <RobotProvider>
      <div className="h-screen flex overflow-hidden">
        {/* Sidebar */}
        <aside className={`${collapsed ? "w-16" : "w-56"} flex-shrink-0 bg-white/[0.02] backdrop-blur-xl border-r border-white/5 flex flex-col transition-all duration-300`}>
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

          {/* Collapse toggle */}
          <div className="p-3 border-t border-white/5">
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
          <header className="flex-shrink-0 border-b border-white/5 px-6 py-3 flex items-center justify-between bg-white/[0.01]">
            <h1 className="text-lg font-semibold text-white/90">{currentTitle}</h1>
            <div className="flex items-center gap-4">
              <a href="/" className="text-white/30 hover:text-white/50 text-sm transition-colors">View Site</a>
              <button onClick={handleLogout} className="text-white/30 hover:text-white/50 text-sm transition-colors">Logout</button>
            </div>
          </header>

          {/* Content */}
          <main className="flex-1 overflow-y-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </RobotProvider>
  );
}
