import { useEffect, useState } from "react";
import { fetchRetentionSettings, saveRetentionSettings, previewCleanup, runCleanup } from "../lib/admin-api";
import ConfirmDialog from "../components/ui/ConfirmDialog";

interface RetentionSettings {
  retention_days: number | null;
  auto_cleanup: boolean;
  last_cleanup_at: string | null;
}

const RETENTION_OPTIONS = [
  { value: 30, label: "30 Days" },
  { value: 60, label: "60 Days" },
  { value: 90, label: "90 Days" },
  { value: 180, label: "6 Months" },
  { value: 365, label: "1 Year" },
  { value: 0, label: "Forever" },
];

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<RetentionSettings>({ retention_days: null, auto_cleanup: false, last_cleanup_at: null });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [preview, setPreview] = useState<{ count: number; oldest: string | null } | null>(null);
  const [showCleanupConfirm, setShowCleanupConfirm] = useState(false);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    fetchRetentionSettings()
      .then((data) => { if (data) setSettings(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveRetentionSettings(settings);
      showToast("Settings saved", "success");
    } catch { showToast("Failed to save settings", "error"); }
    finally { setSaving(false); }
  };

  const handlePreview = async () => {
    if (!settings.retention_days) return;
    try {
      const data = await previewCleanup(settings.retention_days!);
      setPreview(data);
    } catch { /* ignore */ }
  };

  const handleCleanup = async () => {
    setShowCleanupConfirm(false);
    setCleaning(true);
    try {
      const data = await runCleanup();
      showToast(`Cleanup complete. ${data.deleted || 0} sessions removed.`, "success");
    } catch { showToast("Cleanup failed", "error"); }
    finally { setCleaning(false); }
  };

  if (loading) return <div className="flex items-center justify-center h-full min-h-[60vh]"><div className="text-muted-foreground text-sm">Loading settings...</div></div>;

  return (
    <div className="max-w-3xl mx-auto p-6">
      {toast && <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl text-sm font-medium shadow-lg border ${toast.type === "success" ? "bg-green-500/20 text-green-400 border-green-500/30" : "bg-red-500/20 text-red-400 border-red-500/30"}`}>{toast.message}</div>}

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">Configure data retention and system preferences</p>
      </div>

      <div className="bg-muted border border-border rounded-2xl p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-1">Data Retention</h2>
          <p className="text-sm text-muted-foreground">Configure how long session data is kept before automatic cleanup</p>
        </div>

        <div>
          <label className="block text-sm text-muted-foreground mb-2">Retention Period</label>
          <select
            value={settings.retention_days ?? 0}
            onChange={(e) => {
              const val = parseInt(e.target.value);
              setSettings({ ...settings, retention_days: val === 0 ? null : val });
              setPreview(null);
            }}
            className="w-full bg-muted border border-border rounded-lg px-4 py-2.5 text-sm text-foreground focus:border-border focus:outline-none appearance-none"
          >
            {RETENTION_OPTIONS.map((opt) => <option key={opt.value} value={opt.value} className="bg-muted">{opt.label}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setSettings({ ...settings, auto_cleanup: !settings.auto_cleanup })} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.auto_cleanup ? "bg-blue-600" : "bg-muted"}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.auto_cleanup ? "translate-x-6" : "translate-x-1"}`} />
          </button>
          <span className="text-sm text-muted-foreground">Auto-cleanup (runs daily)</span>
        </div>

        {settings.last_cleanup_at && (
          <p className="text-xs text-muted-foreground">Last cleanup: {new Date(settings.last_cleanup_at).toLocaleString()}</p>
        )}

        {settings.retention_days && (
          <div>
            <button onClick={handlePreview} className="text-xs text-blue-400 hover:text-blue-300 underline">Preview what would be deleted</button>
            {preview && (
              <div className="mt-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                <p className="text-sm text-amber-400">{preview.count} session{preview.count !== 1 ? "s" : ""} would be deleted</p>
                {preview.oldest && <p className="text-xs text-amber-400/60 mt-1">Oldest: {new Date(preview.oldest).toLocaleDateString()}</p>}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-3 pt-4 border-t border-border">
          <button onClick={handleSave} disabled={saving} className="px-5 py-2.5 text-sm font-medium rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 text-white disabled:opacity-50 transition-all">{saving ? "Saving..." : "Save Settings"}</button>
          <button onClick={() => setShowCleanupConfirm(true)} disabled={cleaning || !settings.retention_days} className="px-4 py-2.5 text-sm font-medium rounded-lg bg-muted text-foreground hover:bg-muted border border-border disabled:opacity-50 transition-colors">{cleaning ? "Cleaning..." : "Run Cleanup Now"}</button>
        </div>
      </div>

      <ConfirmDialog
        open={showCleanupConfirm}
        title="Run Data Cleanup"
        message="This will permanently delete sessions older than the configured retention period. This action cannot be undone."
        confirmLabel="Run Cleanup"
        variant="warning"
        onConfirm={handleCleanup}
        onCancel={() => setShowCleanupConfirm(false)}
      />
    </div>
  );
}
