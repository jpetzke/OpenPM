"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { api } from "@/lib/api";
import { AppSidebar } from "@/components/layout/AppSidebar";

interface AppSettings {
  embeddings_enabled: boolean;
}

export default function SettingsPage() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);

  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (hasHydrated && !token) router.push("/login");
  }, [token, hasHydrated, router]);

  useEffect(() => {
    if (!token) return;
    api.get<AppSettings>("/api/settings").then(setSettings);
  }, [token]);

  if (!hasHydrated || !token) return null;

  const toggle = async (key: keyof AppSettings, value: boolean) => {
    setSaving(true);
    try {
      const updated = await api.patch<AppSettings>("/api/settings", { [key]: value });
      setSettings(updated);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg-base)" }}>
      <AppSidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-12">
          <h1 className="text-xl font-semibold mb-8" style={{ color: "var(--text-primary)" }}>
            Einstellungen
          </h1>

          <div
            className="rounded-lg border p-6 space-y-6"
            style={{ background: "var(--bg-surface)", borderColor: "var(--border-strong)" }}
          >
            <div>
              <p className="text-xs font-medium uppercase tracking-widest mb-4" style={{ color: "var(--text-muted)" }}>
                Funktionen
              </p>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    Embeddings
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    Semantische Suche in Dokumenten für den Chat. Deaktivieren wenn kein Embedding-Modell verfügbar.
                  </p>
                </div>
                <button
                  role="switch"
                  aria-checked={settings?.embeddings_enabled ?? true}
                  disabled={saving || !settings}
                  onClick={() => toggle("embeddings_enabled", !settings?.embeddings_enabled)}
                  className="relative shrink-0 rounded-full transition-colors duration-200 disabled:opacity-40"
                  style={{
                    width: 40,
                    height: 22,
                    background: settings?.embeddings_enabled ? "var(--accent)" : "var(--bg-elevated)",
                    border: "1px solid var(--border-strong)",
                  }}
                >
                  <span
                    className="absolute top-0.5 rounded-full transition-transform duration-200"
                    style={{
                      width: 16,
                      height: 16,
                      background: "var(--text-primary)",
                      left: settings?.embeddings_enabled ? "calc(100% - 18px)" : 2,
                    }}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
