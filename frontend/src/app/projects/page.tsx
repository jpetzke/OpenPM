"use client";
import { useState, useEffect, startTransition } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, FileText, Activity, CheckSquare, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { providersApi } from "@/lib/providers";
import { useAuthStore } from "@/store/authStore";
import { formatRelativeTime } from "@/lib/utils";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { StatusPill } from "@/components/projects/StatusPill";
import { Stat } from "@/components/projects/Stat";
import { MemberAvatarStack } from "@/components/projects/MemberAvatarStack";
import { ProjectCardSkeleton } from "@/components/projects/ProjectCardSkeleton";
import { EmptyProjects } from "@/components/projects/EmptyProjects";
import type { Project } from "@/types/project";

// Deterministic per-id gradient offset for the top hairline
function gradientOffset(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return 20 + (h % 60); // 20-80%
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
      toast.success("Projekt angelegt");
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

  // Redirect to onboarding if no active LLM provider
  useEffect(() => {
    if (!token) return;
    providersApi.summary().then((s) => {
      if (!s.llm_active) router.replace("/onboarding");
    }).catch(() => {
      // ignore — don't block the page on error
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (!hasHydrated || !token) return null;

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ background: "var(--bg-base)" }}
    >
      <AppSidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Projekte
          </h1>
          {!creating && (
            <button
              onClick={() => setCreating(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-default"
              style={{ background: "var(--accent)", color: "var(--primary-foreground)" }}
            >
              <Plus size={14} />
              Neues Projekt
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <ProjectCardSkeleton key={i} />
            ))}
          </div>
        ) : !projects?.length && !creating ? (
          <EmptyProjects onCreate={() => setCreating(true)} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {creating && (
              <div
                className="min-h-[200px] rounded-[var(--radius-md)] border-2 p-6"
                style={{
                  background: "var(--bg-surface)",
                  borderColor: "var(--accent-ring)",
                  borderStyle: "dashed",
                }}
              >
                <p
                  className="text-xs uppercase tracking-wider mb-3"
                  style={{ color: "var(--accent)" }}
                >
                  Neues Projekt
                </p>
                <input
                  autoFocus
                  placeholder="Projektname"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-md text-sm outline-none mb-2"
                  style={{
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                  }}
                />
                <input
                  placeholder="Kundenname"
                  value={form.client_name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, client_name: e.target.value }))
                  }
                  className="w-full px-3 py-2 rounded-md text-sm outline-none mb-3"
                  style={{
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                  }}
                />
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => {
                      setCreating(false);
                      setForm({ name: "", client_name: "" });
                    }}
                    className="px-3 py-1.5 rounded-md text-sm transition-default"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Abbrechen
                  </button>
                  <button
                    onClick={() => createMutation.mutate(form)}
                    disabled={
                      !form.name || !form.client_name || createMutation.isPending
                    }
                    className="px-3 py-1.5 rounded-md text-sm font-medium transition-default disabled:opacity-50"
                    style={{ background: "var(--accent)", color: "var(--primary-foreground)" }}
                  >
                    {createMutation.isPending ? "..." : "Erstellen"}
                  </button>
                </div>
              </div>
            )}
            {projects?.map((p) => {
              const offset = gradientOffset(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => router.push(`/projects/${p.id}/state`)}
                  className="group relative text-left rounded-[var(--radius-md)] border p-6 lift-hover overflow-hidden min-h-[200px] flex flex-col"
                  style={{
                    background: "var(--bg-surface)",
                    borderColor: "var(--border)",
                  }}
                >
                  {/* Top hairline accent */}
                  <span
                    aria-hidden
                    className="absolute inset-x-0 top-0 h-px opacity-60 group-hover:opacity-100 transition-default"
                    style={{
                      background: `linear-gradient(90deg, transparent, var(--accent) ${offset}%, transparent)`,
                    }}
                  />
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-4 mb-5">
                    <div className="min-w-0">
                      <h2
                        className="text-lg font-semibold leading-tight truncate"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {p.name}
                      </h2>
                      <p
                        className="text-xs mt-1 truncate"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {p.client_name}
                      </p>
                    </div>
                    <StatusPill status={p.status} />
                  </div>
                  {/* Stats */}
                  <dl className="grid grid-cols-3 gap-3 mb-5 flex-1">
                    <Stat
                      icon={FileText}
                      label="Dokumente"
                      value={p.document_count ?? null}
                    />
                    <Stat
                      icon={Activity}
                      label="Aktivität"
                      value={formatRelativeTime(p.updated_at)}
                    />
                    <Stat
                      icon={CheckSquare}
                      label="Tasks offen"
                      value={p.open_task_count ?? null}
                    />
                  </dl>
                  {/* Footer */}
                  <div
                    className="flex items-center justify-between pt-4 border-t mt-auto"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <MemberAvatarStack members={p.members ?? []} max={3} />
                    <span
                      className="opacity-0 group-hover:opacity-100 transition-default flex items-center gap-1 text-xs font-medium"
                      style={{ color: "var(--accent)" }}
                    >
                      Öffnen <ArrowRight size={12} />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {redirectingProjectId && (
          <div
            className="fixed inset-0 grid place-items-center"
            style={{ background: "rgba(10,10,11,0.5)", backdropFilter: "blur(2px)" }}
          >
            <div className="flex flex-col items-center gap-3">
              <div
                className="w-4 h-4 rounded-full border-2 animate-spin"
                style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
              />
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Projekt wird geöffnet…
              </p>
            </div>
          </div>
        )}
        </div>
      </main>
    </div>
  );
}
