import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { adminLogin } from "../lib/admin-api";
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
      const { ok, data } = await adminLogin(password);
      if (ok) {
        navigate("/admin/dashboard");
      } else {
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
      <header className="border-b border-border/50 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <img src="/hmn_logo.png" alt="HMN" className="hidden dark:block h-8 w-auto" />
          <img src="/hmn_logo_grey.png" alt="HMN" className="block dark:hidden h-8 w-auto" />
          <span className="font-semibold text-foreground/90">Admin</span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-semibold text-foreground">Admin Access</h1>
            <p className="text-muted-foreground text-sm">Enter your admin password to continue.</p>
          </div>

          <div className="space-y-4">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              placeholder="Password"
              autoFocus
              className="w-full bg-muted border border-border rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-border transition-colors"
            />
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            <Button onClick={handleLogin} disabled={!password} loading={loading} className="w-full">
              Login
            </Button>
          </div>

          <div className="text-center">
            <a href="/" className="text-muted-foreground/70 hover:text-muted-foreground text-sm transition-colors">Back to assessments</a>
          </div>
        </div>
      </main>
    </div>
  );
}
