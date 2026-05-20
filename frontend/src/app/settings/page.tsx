"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuthStore } from "@/store/authStore";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { PageShell } from "@/components/layout/PageShell";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ActiveSummary,
  CreateProviderBody,
  EMBEDDING_PROVIDER_TYPES,
  LLM_PROVIDER_TYPES,
  ModelRole,
  ProviderConfig,
  ProviderType,
  PROVIDER_TYPE_LABEL,
  Purpose,
  RolesResponse,
  TestResult,
  UpdateProviderBody,
  isMaskedSecret,
  providersApi,
} from "@/lib/providers";

interface FormState {
  name: string;
  purpose: Purpose;
  provider_type: ProviderType;
  credentials: Record<string, string>;
  model_assignments: Record<string, string>;
}

const defaultProviderType = (purpose: Purpose): ProviderType =>
  purpose === "llm" ? "openrouter" : "openai_compat";

const emptyForm = (purpose: Purpose): FormState => ({
  name: "",
  purpose,
  provider_type: defaultProviderType(purpose),
  credentials: {},
  model_assignments: {},
});

const PROVIDER_TYPE_LABEL_DISPLAY: Record<ProviderType, string> = {
  ...PROVIDER_TYPE_LABEL,
  kreuzberg: "Kreuzberg (lokal, kein API-Schlüssel)",
};

const settingsBreadcrumbs = [
  { label: "Projekte", href: "/projects" },
  { label: "Einstellungen" },
];

export default function SettingsPage() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);

  const [summary, setSummary] = useState<ActiveSummary | null>(null);
  const [roles, setRoles] = useState<RolesResponse | null>(null);
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ProviderConfig | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm("llm"));
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean; error?: string | null } | null>(null);

  useEffect(() => {
    if (hasHydrated && !token) router.push("/login");
  }, [token, hasHydrated, router]);

  const refreshAll = async () => {
    const [s, r, list] = await Promise.all([
      providersApi.summary(),
      providersApi.roles(),
      providersApi.list(),
    ]);
    setSummary(s);
    setRoles(r);
    setProviders(list);
  };

  useEffect(() => {
    if (!token) return;
    refreshAll().catch(() => {});
  }, [token]);

  const formRoles: ModelRole[] = useMemo(
    () => (form.purpose === "llm" ? roles?.llm ?? ["chat", "extraction"] : roles?.embedding ?? ["embedding"]),
    [form.purpose, roles],
  );

  if (!hasHydrated || !token) return null;

  const openCreate = (purpose: Purpose) => {
    setEditing(null);
    setForm(emptyForm(purpose));
    setTestResult(null);
    setShowForm(true);
  };

  const openEdit = (p: ProviderConfig) => {
    setEditing(p);
    // Never pre-fill credential inputs with masked values — that lets the
    // user accidentally save the placeholder back as the real credential
    // (a previous bug poisoned stored endpoints with bullet chars).
    // Empty inputs + "leer = unverändert" placeholder is the safe pattern.
    setForm({
      name: p.name,
      purpose: p.purpose,
      provider_type: p.provider_type,
      credentials: {},
      model_assignments: { ...p.model_assignments } as Record<string, string>,
    });
    setTestResult(null);
    setShowForm(true);
  };

  const buildCreateBody = (): CreateProviderBody => ({
    name: form.name,
    provider_type: form.provider_type,
    purpose: form.purpose,
    credentials: form.credentials,
    model_assignments: form.model_assignments,
  });

  const buildUpdateBody = (original: ProviderConfig): UpdateProviderBody => {
    const credentials: Record<string, string> = {};
    for (const [k, v] of Object.entries(form.credentials)) {
      if (typeof v === "string" && v.length > 0 && !isMaskedSecret(v)) credentials[k] = v;
    }
    const body: UpdateProviderBody = {
      name: form.name !== original.name ? form.name : undefined,
      model_assignments: form.model_assignments,
    };
    if (Object.keys(credentials).length > 0) body.credentials = credentials;
    return body;
  };

  const saveProvider = async () => {
    setSaving(true);
    const isEdit = !!editing;
    try {
      if (editing) {
        const updated = await providersApi.update(editing.id, buildUpdateBody(editing));
        setProviders((ps) => ps.map((p) => (p.id === updated.id ? updated : p)));
      } else {
        const created = await providersApi.create(buildCreateBody());
        setProviders((ps) => [...ps, created]);
      }
      setShowForm(false);
      await refreshAll();
      toast.success(isEdit ? "Änderungen gespeichert" : "Provider gespeichert");
    } catch (err) {
      toast.error((err as { message?: string })?.message ?? "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  };

  const deleteProvider = async (p: ProviderConfig) => {
    if (!window.confirm(`Provider "${p.name}" wirklich löschen?`)) return;
    try {
      await providersApi.remove(p.id);
      setProviders((ps) => ps.filter((x) => x.id !== p.id));
      await refreshAll();
      toast.success("Provider gelöscht");
    } catch (err) {
      toast.error((err as { message?: string })?.message ?? "Löschen fehlgeschlagen");
    }
  };

  const activateProvider = async (p: ProviderConfig) => {
    try {
      const updated = await providersApi.activate(p.id);
      setProviders((ps) =>
        ps.map((x) => (x.purpose === p.purpose ? { ...x, is_active: x.id === updated.id } : x)),
      );
      await refreshAll();
      toast.success(`${p.name} ist jetzt aktiv`);
    } catch (err) {
      toast.error((err as { message?: string })?.message ?? "Aktivieren fehlgeschlagen");
    }
  };

  const testProvider = async (id: string) => {
    setTestingId(id);
    try {
      const result: TestResult = await providersApi.test(id);
      setTestResult({ id, ...result });
      if (result.ok) {
        toast.success("Verbindung erfolgreich");
      } else {
        toast.error(`Test fehlgeschlagen: ${result.error ?? "Unbekannter Fehler"}`);
      }
    } catch (err) {
      const message = (err as { message?: string })?.message ?? "Unbekannter Fehler";
      setTestResult({ id, ok: false, error: message });
      toast.error(`Test fehlgeschlagen: ${message}`);
    } finally {
      setTestingId(null);
    }
  };

  const llmProviders = providers.filter((p) => p.purpose === "llm");
  const embeddingProviders = providers.filter((p) => p.purpose === "embedding");
  const formNeedsApiKey = form.provider_type !== "kreuzberg";
  const formNeedsBaseUrl = form.provider_type === "openai_compat";
  const formNeedsAzure = form.provider_type === "azure_openai";
  const modelPlaceholder =
    form.provider_type === "azure_openai"
      ? "Deployment-Name (z.B. gpt-4.1)"
      : form.purpose === "llm"
        ? "openai/gpt-4.1"
        : "text-embedding-3-small";

  const isFormValid =
    !!form.name &&
    (!formNeedsApiKey || !!editing || !!form.credentials.api_key) &&
    (!formNeedsBaseUrl || !!form.credentials.base_url) &&
    (!formNeedsAzure || (!!form.credentials.endpoint && !!form.credentials.api_version));

  const isFormDirty = (() => {
    if (!editing) return !!form.name;
    if (form.name !== editing.name) return true;
    const originalAssignments = editing.model_assignments as Record<string, string>;
    const assignmentKeys = new Set([
      ...Object.keys(originalAssignments),
      ...Object.keys(form.model_assignments),
    ]);
    for (const key of assignmentKeys) {
      if ((originalAssignments[key] ?? "") !== (form.model_assignments[key] ?? "")) return true;
    }
    for (const v of Object.values(form.credentials)) {
      if (typeof v === "string" && v.length > 0 && !isMaskedSecret(v)) return true;
    }
    return false;
  })();

  const isSaveDisabled = saving || !isFormDirty || !isFormValid;

  const setCred = (key: string, value: string) =>
    setForm((f) => ({ ...f, credentials: { ...f.credentials, [key]: value } }));

  const renderProviderCard = (p: ProviderConfig) => (
    <div
      key={p.id}
      className="rounded-lg border p-4"
      style={{
        background: "var(--bg-surface)",
        borderColor: p.health === "corrupt"
          ? "var(--danger)"
          : p.is_active
            ? "var(--accent)"
            : "var(--border-strong)",
      }}
    >
      {p.health === "corrupt" && (
        <div
          className="mb-3 p-2 rounded-md text-xs border-l-2"
          style={{
            background: "var(--danger-subtle)",
            borderLeftColor: "var(--danger)",
            color: "var(--danger)",
          }}
        >
          <strong>Konfiguration korrupt:</strong> {p.health_detail ?? "Anmeldedaten enthalten Mask-Platzhalter."}{" "}
          Bitte über &quot;Bearbeiten&quot; alle Felder neu eingeben.
        </div>
      )}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              {p.name}
            </span>
            {p.is_active && (
              <span
                className="text-xs px-1.5 py-0.5 rounded"
                style={{ background: "var(--accent)", color: "var(--primary-foreground)" }}
              >
                Aktiv
              </span>
            )}
            <span
              className="text-xs px-1.5 py-0.5 rounded"
              style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}
            >
              {PROVIDER_TYPE_LABEL_DISPLAY[p.provider_type]}
            </span>
          </div>
          {"api_key" in p.credentials && p.credentials.api_key && (
            <p className="text-xs font-mono truncate" style={{ color: "var(--text-muted)" }}>
              {p.credentials.api_key}
            </p>
          )}
          {"base_url" in p.credentials && p.credentials.base_url && (
            <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
              {p.credentials.base_url}
            </p>
          )}
          {Object.keys(p.model_assignments).length > 0 && (
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
              {Object.entries(p.model_assignments).map(([role, model]) => (
                <span key={role} className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {role}: <span style={{ color: "var(--text-primary)" }}>{model}</span>
                </span>
              ))}
            </div>
          )}
          {testResult?.id === p.id && (
            <p
              className="text-xs mt-1"
              style={{ color: testResult.ok ? "var(--success)" : "var(--danger)" }}
            >
              {testResult.ok ? "✓ Verbindung OK" : `✗ ${testResult.error ?? "Fehler"}`}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
          <button
            onClick={() => testProvider(p.id)}
            disabled={testingId === p.id}
            className="text-xs px-2 py-1 rounded transition-colors disabled:opacity-40"
            style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}
          >
            {testingId === p.id ? "…" : "Test"}
          </button>
          {!p.is_active && (
            <button
              onClick={() => activateProvider(p)}
              className="text-xs px-2 py-1 rounded transition-colors"
              style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}
            >
              Aktivieren
            </button>
          )}
          <button
            onClick={() => openEdit(p)}
            className="text-xs px-2 py-1 rounded transition-colors"
            style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}
          >
            Bearbeiten
          </button>
          {!p.is_active && (
            <button
              onClick={() => deleteProvider(p)}
              className="text-xs px-2 py-1 rounded transition-colors"
              style={{ background: "var(--bg-elevated)", color: "var(--danger)" }}
            >
              Löschen
            </button>
          )}
        </div>
      </div>
    </div>
  );

  const allowedTypes = form.purpose === "llm" ? LLM_PROVIDER_TYPES : EMBEDDING_PROVIDER_TYPES;

  const renderProviderForm = (title: string) => {
    const disabledReason = !isFormDirty
      ? "Keine Änderungen"
      : !isFormValid
        ? "Pflichtfelder fehlen"
        : null;

    return (
      <form
        className="mt-3 rounded-lg border p-5 space-y-4"
        style={{ background: "var(--bg-surface)", borderColor: "var(--border-strong)" }}
        onSubmit={(e) => {
          e.preventDefault();
          if (!isSaveDisabled) saveProvider();
        }}
      >
        <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          {editing ? "Provider bearbeiten" : `Neuer ${title}`}
        </p>

        <div>
          <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>Name</label>
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder={form.purpose === "llm" ? "z.B. BLAID Azure" : "z.B. OpenAI Embeddings"}
            className="w-full text-sm px-3 py-2 rounded-md outline-none"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-strong)", color: "var(--text-primary)" }}
          />
        </div>

        {!editing && (
          <div>
            <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>Provider-Typ</label>
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
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-strong)", color: "var(--text-primary)" }}
            >
              {allowedTypes.map((t) => (
                <option key={t} value={t}>
                  {PROVIDER_TYPE_LABEL_DISPLAY[t]}
                </option>
              ))}
            </select>
          </div>
        )}

        {formNeedsApiKey && (
          <div>
            <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>API Key</label>
            <input
              type="password"
              value={form.credentials.api_key ?? ""}
              onChange={(e) => setCred("api_key", e.target.value)}
              placeholder={editing ? "Leer lassen = unverändert (vorhandener Wert bleibt erhalten)" : "sk-..."}
              className="w-full text-sm px-3 py-2 rounded-md outline-none"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-strong)", color: "var(--text-primary)" }}
            />
          </div>
        )}

        {formNeedsBaseUrl && (
          <div>
            <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>Base URL</label>
            <input
              value={form.credentials.base_url ?? ""}
              onChange={(e) => setCred("base_url", e.target.value)}
              placeholder={editing ? "Leer lassen = unverändert" : "https://api.openai.com/v1"}
              className="w-full text-sm px-3 py-2 rounded-md outline-none"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-strong)", color: "var(--text-primary)" }}
            />
          </div>
        )}

        {formNeedsAzure && (
          <>
            <div>
              <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>Endpoint URL</label>
              <input
                value={form.credentials.endpoint ?? ""}
                onChange={(e) => setCred("endpoint", e.target.value)}
                placeholder={editing ? "Leer lassen = unverändert" : "https://<resource>.openai.azure.com/"}
                className="w-full text-sm px-3 py-2 rounded-md outline-none"
                style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-strong)", color: "var(--text-primary)" }}
              />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>API Version</label>
              <input
                value={form.credentials.api_version ?? ""}
                onChange={(e) => setCred("api_version", e.target.value)}
                placeholder={editing ? "Leer lassen = unverändert" : "2025-03-01-preview"}
                className="w-full text-sm px-3 py-2 rounded-md outline-none"
                style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-strong)", color: "var(--text-primary)" }}
              />
            </div>
          </>
        )}

        <div>
          <label className="text-xs mb-2 block" style={{ color: "var(--text-muted)" }}>Model Assignments</label>
          <div className="space-y-2">
            {formRoles.map((role) => (
              <div key={role} className="flex items-center gap-2">
                <span className="text-xs w-20 shrink-0" style={{ color: "var(--text-muted)" }}>{role}</span>
                <input
                  value={form.model_assignments[role] ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      model_assignments: { ...f.model_assignments, [role]: e.target.value },
                    }))
                  }
                  placeholder={modelPlaceholder}
                  className="flex-1 text-sm px-3 py-1.5 rounded-md outline-none font-mono"
                  style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-strong)", color: "var(--text-primary)" }}
                />
              </div>
            ))}
          </div>
        </div>

        {testResult && editing && testResult.id === editing.id && (
          <div
            className="p-3 rounded-md flex items-start gap-2 text-sm border-l-2"
            style={{
              background: testResult.ok ? "var(--success-subtle)" : "var(--danger-subtle)",
              borderLeftColor: testResult.ok ? "var(--success)" : "var(--danger)",
              color: testResult.ok ? "var(--success)" : "var(--danger)",
            }}
          >
            {testResult.ok ? (
              <span>Verbindung erfolgreich</span>
            ) : (
              <span>Test fehlgeschlagen: {testResult.error ?? "Unbekannter Fehler"}</span>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          {disabledReason ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger render={<span tabIndex={0} className="inline-block" />}>
                  <button
                    type="submit"
                    disabled
                    title={disabledReason}
                    className="text-xs px-3 py-1.5 rounded-md transition-colors disabled:opacity-40 pointer-events-none"
                    style={{ background: "var(--accent)", color: "var(--primary-foreground)" }}
                  >
                    {saving ? "Speichern…" : "Speichern"}
                  </button>
                </TooltipTrigger>
                <TooltipContent>{disabledReason}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <button
              type="submit"
              disabled={saving}
              className="text-xs px-3 py-1.5 rounded-md transition-colors disabled:opacity-40"
              style={{ background: "var(--accent)", color: "var(--primary-foreground)" }}
            >
              {saving ? "Speichern…" : "Speichern"}
            </button>
          )}
          {editing && (
            <button
              type="button"
              onClick={() => testProvider(editing.id)}
              disabled={testingId === editing.id}
              className="text-xs px-3 py-1.5 rounded-md transition-colors disabled:opacity-40"
              style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}
            >
              {testingId === editing.id ? "Teste…" : "Verbindung testen"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowForm(false)}
            className="text-xs px-3 py-1.5 rounded-md transition-colors"
            style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}
          >
            Abbrechen
          </button>
        </div>
      </form>
    );
  };

  const renderProviderSection = (title: string, purpose: Purpose, list: ProviderConfig[]) => (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{title}</h2>
        <button
          onClick={() => openCreate(purpose)}
          className="text-xs px-3 py-1.5 rounded-md transition-colors"
          style={{ background: "var(--accent)", color: "var(--primary-foreground)" }}
        >
          + Neu
        </button>
      </div>

      {list.length === 0 && !(showForm && form.purpose === purpose) && (
        <div
          className="rounded-lg border p-5 text-center"
          style={{ background: "var(--bg-surface)", borderColor: "var(--border-strong)" }}
        >
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Kein Provider konfiguriert.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {list.map((p) => renderProviderCard(p))}
      </div>

      {showForm && form.purpose === purpose && renderProviderForm(title)}
    </div>
  );

  if (!summary) {
    return (
      <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg-base)" }}>
        <AppSidebar />
        <main className="flex-1 overflow-y-auto">
          <PageShell title="Einstellungen" breadcrumbs={settingsBreadcrumbs}>
            <div className="space-y-4 animate-pulse">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-32 rounded-[var(--radius-md)]"
                  style={{ background: "var(--bg-surface)" }}
                />
              ))}
            </div>
          </PageShell>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg-base)" }}>
      <AppSidebar />
      <main className="flex-1 overflow-y-auto">
        <PageShell title="Einstellungen" breadcrumbs={settingsBreadcrumbs}>
          <div
            className="rounded-lg border p-6"
            style={{ background: "var(--bg-surface)", borderColor: "var(--border-strong)" }}
          >
            <p className="text-xs font-medium uppercase tracking-widest mb-4" style={{ color: "var(--text-muted)" }}>
              Status
            </p>
            <div className="space-y-2 text-sm" style={{ color: "var(--text-primary)" }}>
              <p>
                LLM:{" "}
                <span style={{ color: summary?.llm_active ? "var(--accent)" : "var(--danger)" }}>
                  {summary?.llm_active ? "Provider aktiv" : "kein aktiver Provider"}
                </span>
              </p>
              <p>
                Embeddings:{" "}
                <span style={{ color: summary?.embedding_active ? "var(--accent)" : "var(--text-muted)" }}>
                  {summary?.embedding_active ? "Provider aktiv" : "deaktiviert (kein aktiver Provider)"}
                </span>
              </p>
            </div>
          </div>

          {renderProviderSection("LLM Provider", "llm", llmProviders)}
          {renderProviderSection("Embedding Provider", "embedding", embeddingProviders)}
        </PageShell>
      </main>
    </div>
  );
}
