"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { api } from "@/lib/api";
import {
  providersApi,
  LLM_PROVIDER_TYPES,
  PROVIDER_TYPE_LABEL,
  type ProviderType,
  type CreateProviderBody,
} from "@/lib/providers";
import type { Project } from "@/types/project";

const PROVIDER_TYPE_LABEL_DISPLAY: Record<ProviderType, string> = {
  ...PROVIDER_TYPE_LABEL,
  kreuzberg: "Kreuzberg (lokal, kein API-Schlüssel)",
};

type Step = 1 | 2 | 3;

interface ProviderFormState {
  name: string;
  provider_type: ProviderType;
  credentials: Record<string, string>;
  model_assignments: Record<string, string>;
}

export default function OnboardingPage() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);

  const [step, setStep] = useState<Step>(1);

  // Step 1: provider form state
  const [form, setForm] = useState<ProviderFormState>({
    name: "LLM Provider",
    provider_type: "openrouter",
    credentials: {},
    model_assignments: {},
  });
  const [saving, setSaving] = useState(false);
  const [savedProviderId, setSavedProviderId] = useState<string | null>(null);

  // Step 2: test state
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string | null; latencyMs?: number } | null>(null);

  // Step 3: project form
  const [projectName, setProjectName] = useState("");
  const [clientName, setClientName] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);

  useEffect(() => {
    if (hasHydrated && !token) router.replace("/login");
  }, [token, hasHydrated, router]);

  // If already has a provider configured, skip to step 3 (allow completing onboarding)
  useEffect(() => {
    if (!token) return;
    providersApi.summary().then((s) => {
      if (s.llm_active) {
        // Provider already set up — jump to project creation step
        setStep(3);
      }
    }).catch(() => {});
  }, [token]);

  if (!hasHydrated || !token) return null;

  const setCred = (key: string, value: string) =>
    setForm((f) => ({ ...f, credentials: { ...f.credentials, [key]: value } }));

  const formNeedsApiKey = form.provider_type !== "kreuzberg";
  const formNeedsBaseUrl = form.provider_type === "openai_compat";
  const formNeedsAzure = form.provider_type === "azure_openai";

  const isFormValid =
    !!form.name &&
    (!formNeedsApiKey || !!form.credentials.api_key) &&
    (!formNeedsBaseUrl || !!form.credentials.base_url) &&
    (!formNeedsAzure || (!!form.credentials.endpoint && !!form.credentials.api_version));

  const handleSaveProvider = async () => {
    if (!isFormValid || saving) return;
    setSaving(true);
    try {
      const body: CreateProviderBody = {
        name: form.name,
        provider_type: form.provider_type,
        purpose: "llm",
        credentials: form.credentials,
        model_assignments: form.model_assignments,
      };
      const created = await providersApi.create(body);
      await providersApi.activate(created.id);
      setSavedProviderId(created.id);
      toast.success("Provider gespeichert und aktiviert");
      setStep(2);
    } catch (err) {
      toast.error((err as { message?: string })?.message ?? "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    const idToTest = savedProviderId;
    if (!idToTest) return;
    setTesting(true);
    setTestResult(null);
    const t0 = performance.now();
    try {
      const result = await providersApi.test(idToTest);
      const latencyMs = Math.round(performance.now() - t0);
      setTestResult({ ...result, latencyMs });
      if (!result.ok) {
        toast.error(`Test fehlgeschlagen: ${result.error ?? "Unbekannter Fehler"}`);
      }
    } catch (err) {
      const latencyMs = Math.round(performance.now() - t0);
      const message = (err as { message?: string })?.message ?? "Unbekannter Fehler";
      setTestResult({ ok: false, error: message, latencyMs });
      toast.error(`Test fehlgeschlagen: ${message}`);
    } finally {
      setTesting(false);
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim() || creatingProject) return;
    setCreatingProject(true);
    try {
      const project = await api.post<Project>("/api/projects", {
        name: projectName.trim(),
        client_name: clientName.trim(),
      });
      toast.success("Projekt angelegt — los geht's!");
      router.replace(`/projects/${project.id}/upload`);
    } catch (err) {
      toast.error((err as { message?: string })?.message ?? "Projekt konnte nicht erstellt werden");
      setCreatingProject(false);
    }
  };

  const modelPlaceholder =
    form.provider_type === "azure_openai"
      ? "Deployment-Name (z.B. gpt-4.1)"
      : "openai/gpt-4.1";

  const steps: { num: Step; label: string }[] = [
    { num: 1, label: "Provider" },
    { num: 2, label: "Verbindung testen" },
    { num: 3, label: "Erstes Projekt" },
  ];

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
      style={{ background: "var(--bg-base)" }}
    >
      {/* Brand */}
      <p className="text-sm font-semibold mb-8" style={{ color: "var(--text-primary)" }}>
        OpenPM
      </p>

      {/* Stepper */}
      <div className="flex items-center gap-2 mb-10">
        {steps.map((s, idx) => {
          const done = step > s.num;
          const active = step === s.num;
          return (
            <div key={s.num} className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
                  style={{
                    background: done
                      ? "var(--success)"
                      : active
                      ? "var(--accent)"
                      : "var(--bg-elevated)",
                    color: done || active ? "#fff" : "var(--text-muted)",
                  }}
                >
                  {done ? <CheckCircle2 size={14} /> : s.num}
                </div>
                <span
                  className="text-sm hidden sm:block"
                  style={{
                    color: active ? "var(--text-primary)" : "var(--text-muted)",
                    fontWeight: active ? 500 : 400,
                  }}
                >
                  {s.label}
                </span>
              </div>
              {idx < steps.length - 1 && (
                <div
                  className="w-8 h-px mx-1"
                  style={{ background: step > s.num ? "var(--success)" : "var(--border-strong)" }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Card */}
      <div
        className="w-full max-w-md rounded-xl border shadow-md"
        style={{ background: "var(--bg-surface)", borderColor: "var(--border-strong)" }}
      >
        {/* ── STEP 1: Provider ───────────────────────────────────────────────── */}
        {step === 1 && (
          <div className="p-6 space-y-4">
            <div>
              <h1 className="text-base font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
                LLM Provider einrichten
              </h1>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                OpenPM benötigt einen LLM-Provider um Dokumente zu verarbeiten und den Chat zu betreiben.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs mb-1 font-medium" style={{ color: "var(--text-muted)" }}>
                  Name
                </label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="z.B. OpenRouter"
                  className="w-full text-sm px-3 py-2 rounded-md outline-none"
                  style={{
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border-strong)",
                    color: "var(--text-primary)",
                  }}
                />
              </div>

              <div>
                <label className="block text-xs mb-1 font-medium" style={{ color: "var(--text-muted)" }}>
                  Provider-Typ
                </label>
                <select
                  value={form.provider_type}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      provider_type: e.target.value as ProviderType,
                      credentials: {},
                    }))
                  }
                  className="w-full text-sm px-3 py-2 rounded-md outline-none"
                  style={{
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border-strong)",
                    color: "var(--text-primary)",
                  }}
                >
                  {LLM_PROVIDER_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {PROVIDER_TYPE_LABEL_DISPLAY[t]}
                    </option>
                  ))}
                </select>
              </div>

              {formNeedsApiKey && (
                <div>
                  <label className="block text-xs mb-1 font-medium" style={{ color: "var(--text-muted)" }}>
                    API Key
                  </label>
                  <input
                    type="password"
                    value={form.credentials.api_key ?? ""}
                    onChange={(e) => setCred("api_key", e.target.value)}
                    placeholder="sk-..."
                    className="w-full text-sm px-3 py-2 rounded-md outline-none"
                    style={{
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--border-strong)",
                      color: "var(--text-primary)",
                    }}
                  />
                </div>
              )}

              {formNeedsBaseUrl && (
                <div>
                  <label className="block text-xs mb-1 font-medium" style={{ color: "var(--text-muted)" }}>
                    Base URL
                  </label>
                  <input
                    value={form.credentials.base_url ?? ""}
                    onChange={(e) => setCred("base_url", e.target.value)}
                    placeholder="https://api.openai.com/v1"
                    className="w-full text-sm px-3 py-2 rounded-md outline-none"
                    style={{
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--border-strong)",
                      color: "var(--text-primary)",
                    }}
                  />
                </div>
              )}

              {formNeedsAzure && (
                <>
                  <div>
                    <label className="block text-xs mb-1 font-medium" style={{ color: "var(--text-muted)" }}>
                      Endpoint URL
                    </label>
                    <input
                      value={form.credentials.endpoint ?? ""}
                      onChange={(e) => setCred("endpoint", e.target.value)}
                      placeholder="https://<resource>.openai.azure.com/"
                      className="w-full text-sm px-3 py-2 rounded-md outline-none"
                      style={{
                        background: "var(--bg-elevated)",
                        border: "1px solid var(--border-strong)",
                        color: "var(--text-primary)",
                      }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs mb-1 font-medium" style={{ color: "var(--text-muted)" }}>
                      API Version
                    </label>
                    <input
                      value={form.credentials.api_version ?? ""}
                      onChange={(e) => setCred("api_version", e.target.value)}
                      placeholder="2025-03-01-preview"
                      className="w-full text-sm px-3 py-2 rounded-md outline-none"
                      style={{
                        background: "var(--bg-elevated)",
                        border: "1px solid var(--border-strong)",
                        color: "var(--text-primary)",
                      }}
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs mb-1 font-medium" style={{ color: "var(--text-muted)" }}>
                  Modell (optional)
                </label>
                <input
                  value={form.model_assignments.chat ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      model_assignments: { ...f.model_assignments, chat: e.target.value, extraction: e.target.value },
                    }))
                  }
                  placeholder={modelPlaceholder}
                  className="w-full text-sm px-3 py-2 rounded-md outline-none font-mono"
                  style={{
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border-strong)",
                    color: "var(--text-primary)",
                  }}
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={handleSaveProvider}
                disabled={!isFormValid || saving}
                className="px-4 py-2 rounded-md text-sm font-medium transition-default disabled:opacity-40"
                style={{ background: "var(--accent)", color: "var(--primary-foreground)" }}
              >
                {saving ? <Loader2 size={14} className="animate-spin inline mr-1" /> : null}
                {saving ? "Speichern…" : "Weiter"}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: Test connection ─────────────────────────────────────────── */}
        {step === 2 && (
          <div className="p-6 space-y-4">
            <div>
              <h1 className="text-base font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
                Verbindung testen
              </h1>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Überprüfe ob die Verbindung zum Provider funktioniert.
              </p>
            </div>

            {!testResult && (
              <div
                className="rounded-lg p-4 text-center"
                style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
              >
                <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
                  Klicke auf den Button um einen Test-Request zu senden.
                </p>
                <button
                  onClick={handleTestConnection}
                  disabled={testing}
                  className="px-4 py-2 rounded-md text-sm font-medium transition-default disabled:opacity-40"
                  style={{ background: "var(--accent)", color: "var(--primary-foreground)" }}
                >
                  {testing ? (
                    <>
                      <Loader2 size={14} className="animate-spin inline mr-1.5" />
                      Verbinde…
                    </>
                  ) : (
                    "Verbindung testen"
                  )}
                </button>
              </div>
            )}

            {testResult && (
              <div
                className="rounded-lg p-4 border-l-2"
                style={{
                  background: testResult.ok ? "var(--success-subtle)" : "var(--danger-subtle)",
                  borderLeftColor: testResult.ok ? "var(--success)" : "var(--danger)",
                }}
              >
                {testResult.ok ? (
                  <p className="text-sm font-medium" style={{ color: "var(--success)" }}>
                    ✓ Verbindung OK · {testResult.latencyMs}ms · ≈ $0.00
                  </p>
                ) : (
                  <p className="text-sm font-medium" style={{ color: "var(--danger)" }}>
                    ✗ {testResult.error ?? "Fehler beim Verbindungstest"}
                  </p>
                )}
                <button
                  onClick={handleTestConnection}
                  disabled={testing}
                  className="mt-2 text-xs transition-default disabled:opacity-40"
                  style={{ color: testResult.ok ? "var(--success)" : "var(--danger)" }}
                >
                  Erneut testen
                </button>
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => setStep(1)}
                className="px-3 py-1.5 rounded-md text-sm transition-default"
                style={{ color: "var(--text-muted)" }}
              >
                Zurück
              </button>
              <button
                onClick={() => setStep(3)}
                className="px-4 py-2 rounded-md text-sm font-medium transition-default"
                style={{ background: "var(--accent)", color: "var(--primary-foreground)" }}
              >
                Weiter
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: First project ────────────────────────────────────────────── */}
        {step === 3 && (
          <form onSubmit={handleCreateProject} className="p-6 space-y-4">
            <div>
              <h1 className="text-base font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
                Erstes Projekt erstellen
              </h1>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Gib deinem ersten Projekt einen Namen und leg direkt los.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs mb-1 font-medium" style={{ color: "var(--text-muted)" }}>
                  Projektname <span style={{ color: "var(--danger)" }}>*</span>
                </label>
                <input
                  autoFocus
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="Mein erstes Projekt"
                  className="w-full text-sm px-3 py-2 rounded-md outline-none"
                  style={{
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border-strong)",
                    color: "var(--text-primary)",
                  }}
                />
              </div>
              <div>
                <label className="block text-xs mb-1 font-medium" style={{ color: "var(--text-muted)" }}>
                  Kunde / Beschreibung{" "}
                  <span style={{ color: "var(--text-disabled)" }}>(optional)</span>
                </label>
                <input
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Kundenname oder kurze Beschreibung"
                  className="w-full text-sm px-3 py-2 rounded-md outline-none"
                  style={{
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border-strong)",
                    color: "var(--text-primary)",
                  }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              {savedProviderId ? (
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="px-3 py-1.5 rounded-md text-sm transition-default"
                  style={{ color: "var(--text-muted)" }}
                >
                  Zurück
                </button>
              ) : (
                <span />
              )}
              <button
                type="submit"
                disabled={!projectName.trim() || creatingProject}
                className="px-4 py-2 rounded-md text-sm font-medium transition-default disabled:opacity-40"
                style={{ background: "var(--accent)", color: "var(--primary-foreground)" }}
              >
                {creatingProject ? (
                  <>
                    <Loader2 size={14} className="animate-spin inline mr-1.5" />
                    Erstellen…
                  </>
                ) : (
                  "Projekt erstellen"
                )}
              </button>
            </div>
          </form>
        )}
      </div>

      <p className="mt-6 text-xs" style={{ color: "var(--text-disabled)" }}>
        Du kannst weitere Provider jederzeit in den{" "}
        <a href="/settings" style={{ color: "var(--text-muted)" }} className="underline">
          Einstellungen
        </a>{" "}
        konfigurieren.
      </p>
    </div>
  );
}
