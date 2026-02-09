import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../lib/api";
import Button from "../components/ui/Button";

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!password) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        navigate("/admin/chat");
      } else {
        const data = await res.json();
        setError(data.error || "Invalid password");
      }
    } catch {
      setError("Connection failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-white/5 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <img src="/hmn_logo.png" alt="HMN" className="h-8 w-auto" />
          <span className="font-semibold text-white/90">Admin</span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-semibold text-white">Admin Access</h1>
            <p className="text-white/40 text-sm">Enter your admin password to continue.</p>
          </div>

          <div className="space-y-4">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              placeholder="Password"
              autoFocus
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-white/30 transition-colors"
            />
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            <Button onClick={handleLogin} disabled={!password} loading={loading} className="w-full">
              Login
            </Button>
          </div>

          <div className="text-center">
            <a href="/" className="text-white/30 hover:text-white/50 text-sm transition-colors">Back to assessments</a>
          </div>
        </div>
      </main>
    </div>
  );
}
