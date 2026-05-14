"use client";
import { useState, useEffect, startTransition } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { formatRelativeTime } from "@/lib/utils";
import type { Project } from "@/types/project";

function statusColor(status: string) {
  if (status === "active") return "var(--success)";
  if (status === "paused") return "var(--warning)";
  return "var(--text-disabled)";
}

export default function ProjectsPage() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [redirectingProjectId, setRedirectingProjectId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", client_name: "" });

  const { data: projects, isLoading } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: () => api.get<Project[]>("/api/projects"),
    enabled: !!token,
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; client_name: string }) =>
      api.post<Project>("/api/projects", data),
    onSuccess: (project) => {
      setRedirectingProjectId(project.id);
      startTransition(() => {
        router.replace(`/projects/${project.id}/upload`);
      });
      void qc.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: () => toast.error("Projekt konnte nicht erstellt werden"),
  });

  useEffect(() => {
    if (hasHydrated && !token) router.push("/login");
  }, [token, hasHydrated, router]);

  if (!hasHydrated || !token) return null;

  if (isLoading || redirectingProjectId) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-base)" }}>
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-4 h-4 rounded-full border-2 animate-spin"
            style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
          />
          {redirectingProjectId && (
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Projekt wird geoeffnet…
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)" }}>
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>Projekte</h1>
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-default"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            <Plus size={14} />
            Neues Projekt
          </button>
        </div>

        {creating && (
          <div
            className="mb-6 p-4 rounded-lg border"
            style={{ background: "var(--bg-surface)", borderColor: "var(--border-strong)" }}
          >
            <div className="flex gap-3">
              <input
                autoFocus
                placeholder="Projektname"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="flex-1 px-3 py-1.5 rounded-md text-sm outline-none"
                style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
              />
              <input
                placeholder="Kundenname"
                value={form.client_name}
                onChange={(e) => setForm((f) => ({ ...f, client_name: e.target.value }))}
                className="flex-1 px-3 py-1.5 rounded-md text-sm outline-none"
                style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
              />
              <button
                onClick={() => createMutation.mutate(form)}
                disabled={!form.name || !form.client_name || createMutation.isPending}
                className="px-3 py-1.5 rounded-md text-sm font-medium transition-default disabled:opacity-50"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                Erstellen
              </button>
              <button
                onClick={() => setCreating(false)}
                className="px-3 py-1.5 rounded-md text-sm transition-default"
                style={{ color: "var(--text-muted)" }}
              >
                Abbrechen
              </button>
            </div>
          </div>
        )}

        {!projects?.length ? (
          <div className="text-center py-24 space-y-3">
            <p style={{ color: "var(--text-secondary)" }}>Noch keine Projekte.</p>
            <button
              onClick={() => setCreating(true)}
              className="px-4 py-2 rounded-md text-sm font-medium transition-default"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              + Erstes Projekt anlegen
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => router.push(`/projects/${p.id}/upload`)}
                className="text-left p-4 rounded-lg border transition-default"
                style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-medium text-sm" style={{ color: "var(--text-primary)" }}>{p.name}</p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{p.client_name}</p>
                  </div>
                  <span
                    className="text-xs px-2 py-0.5 rounded-sm"
                    style={{
                      background: statusColor(p.status) + "20",
                      color: statusColor(p.status),
                    }}
                  >
                    {p.status}
                  </span>
                </div>
                <p className="text-xs mt-3" style={{ color: "var(--text-muted)" }}>
                  Letztes Update: {formatRelativeTime(p.updated_at)}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
