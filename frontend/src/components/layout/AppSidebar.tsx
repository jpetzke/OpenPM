"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  LogOut,
  Loader2,
  Settings,
  BarChart2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  MoreVertical,
  Archive,
  ArchiveRestore,
} from "lucide-react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { useUiStore } from "@/store/uiStore";
import { usePipelineStore, getProjectPipelineSummary } from "@/store/pipelineStore";
import type { PipelineStore } from "@/store/pipelineStore";
import { NewProjectModal } from "./NewProjectModal";
import type { Project } from "@/types/project";

function statusDotColor(status: string) {
  if (status === "active") return "var(--success)";
  if (status === "paused") return "var(--warning)";
  return "var(--text-disabled)";
}

/** First letter(s) of project name for collapsed icon mode */
function projectInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

interface AppSidebarProps {
  currentProjectId?: string;
}

export function AppSidebar({ currentProjectId }: AppSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, clearAuth, token, refreshToken } = useAuthStore();
  const { sidebarCollapsed, toggleSidebar } = useUiStore();
  const qc = useQueryClient();

  const [showNewProject, setShowNewProject] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);

  const pipelineSlice = usePipelineStore(
    useShallow((s) => ({
      pipelines: s.pipelines,
      details: s.details,
      docProject: s.docProject,
    }))
  );
  const pipelineState = pipelineSlice as unknown as PipelineStore;

  const { data: projects } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: () => api.get<Project[]>("/api/projects"),
    enabled: !!token,
  });

  const { data: allProjects } = useQuery<Project[]>({
    queryKey: ["projects", "include_archived"],
    queryFn: () => api.get<Project[]>("/api/projects?include_archived=true"),
    enabled: !!token && archiveOpen,
  });

  const activeProjects = [...(projects ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  const archivedProjects = [...(allProjects ?? [])]
    .filter((p) => !!p.archived_at)
    .sort((a, b) => a.name.localeCompare(b.name));

  const handleLogout = async () => {
    try {
      await api.post("/api/auth/logout", refreshToken ? { refresh_token: refreshToken } : undefined);
    } catch {
      // ignore — proceed with local logout regardless
    }
    clearAuth();
    router.push("/login");
  };

  const handleArchive = async (project: Project) => {
    setMenuOpenId(null);
    if (!window.confirm(`Projekt "${project.name}" archivieren?`)) return;
    setArchivingId(project.id);
    try {
      await api.post(`/api/projects/${project.id}/archive`);
      await qc.invalidateQueries({ queryKey: ["projects"] });
      await qc.invalidateQueries({ queryKey: ["projects", "include_archived"] });
      toast.success(`"${project.name}" archiviert`);
      if (currentProjectId === project.id) router.push("/projects");
    } catch (err) {
      const status = (err as { status?: number })?.status;
      if (status === 403) {
        toast.error("Nur Projekteigentümer können archivieren");
      } else {
        toast.error("Archivieren fehlgeschlagen");
      }
    } finally {
      setArchivingId(null);
    }
  };

  const handleUnarchive = async (project: Project) => {
    setArchivingId(project.id);
    try {
      await api.post(`/api/projects/${project.id}/unarchive`);
      await qc.invalidateQueries({ queryKey: ["projects"] });
      await qc.invalidateQueries({ queryKey: ["projects", "include_archived"] });
      toast.success(`"${project.name}" wiederhergestellt`);
    } catch (err) {
      const status = (err as { status?: number })?.status;
      if (status === 403) {
        toast.error("Nur Projekteigentümer können archivieren/dearchivieren");
      } else {
        toast.error("Dearchivieren fehlgeschlagen");
      }
    } finally {
      setArchivingId(null);
    }
  };

  const sidebarWidth = sidebarCollapsed ? 64 : "var(--sidebar-width)";

  return (
    <>
      <aside
        className="flex flex-col h-full shrink-0 transition-all"
        style={{
          width: typeof sidebarWidth === "number" ? `${sidebarWidth}px` : sidebarWidth,
          background: "var(--bg-surface)",
          borderRight: "1px solid var(--border)",
          overflow: "hidden",
        }}
      >
        {/* Header with collapse toggle */}
        <div
          className="px-2 py-3 border-b flex items-center justify-between shrink-0"
          style={{ borderColor: "var(--border)" }}
        >
          {!sidebarCollapsed && (
            <Link href="/projects">
              <span className="text-sm font-semibold px-2" style={{ color: "var(--text-primary)" }}>
                OpenPM
              </span>
            </Link>
          )}
          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded transition-default hover:opacity-70 shrink-0"
            aria-label={sidebarCollapsed ? "Sidebar ausklappen" : "Sidebar einklappen"}
            style={{ color: "var(--text-muted)", marginLeft: sidebarCollapsed ? "auto" : undefined, marginRight: sidebarCollapsed ? "auto" : undefined }}
          >
            {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          {!sidebarCollapsed && (
            <div className="px-3 mb-1">
              <span
                className="text-xs font-medium uppercase tracking-widest"
                style={{ color: "var(--text-muted)" }}
              >
                Projekte
              </span>
            </div>
          )}

          {activeProjects.map((p) => {
            const isActive = p.id === currentProjectId;
            const summary = getProjectPipelineSummary(pipelineState, p.id);
            const isProcessing = summary.processingCount > 0 || summary.pendingCount > 0;
            const hasFailed = (p.failed_document_count ?? 0) > 0;
            const hasUnread = !isActive && (p.unread_change_count ?? 0) > 0;
            const hasBadge = isProcessing || hasFailed || hasUnread;

            if (sidebarCollapsed) {
              return (
                <div key={p.id} className="relative mx-1 my-0.5">
                  <Link
                    href={`/projects/${p.id}`}
                    className="flex items-center justify-center w-12 h-9 rounded-md transition-default mx-auto"
                    style={{
                      background: isActive ? "var(--bg-elevated)" : "transparent",
                      color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                    }}
                    title={p.name}
                  >
                    <span className="text-xs font-semibold">
                      {projectInitials(p.name)}
                    </span>
                  </Link>
                  {hasBadge && (
                    <span
                      className="absolute top-1 right-1 w-2 h-2 rounded-full"
                      style={{
                        background: hasFailed
                          ? "var(--danger)"
                          : isProcessing
                          ? "var(--accent)"
                          : "var(--accent)",
                      }}
                    />
                  )}
                </div>
              );
            }

            return (
              <div
                key={p.id}
                className="group relative flex items-center gap-1 mx-1 rounded-md"
                style={{
                  background: isActive ? "var(--bg-elevated)" : "transparent",
                }}
              >
                <Link
                  href={`/projects/${p.id}`}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm transition-default flex-1 min-w-0"
                  style={{
                    color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: statusDotColor(p.status) }}
                  />
                  <span className="flex-1 truncate">{p.name}</span>

                  {/* Processing spinner */}
                  {isProcessing && (
                    <Loader2
                      size={12}
                      className="animate-spin shrink-0"
                      style={{ color: "var(--text-muted)" }}
                    />
                  )}

                  {/* Failed document badge */}
                  {hasFailed && !isProcessing && (
                    <span
                      className="text-[10px] font-semibold px-1 py-0.5 rounded shrink-0 leading-none"
                      style={{ background: "var(--danger-subtle)", color: "var(--danger)" }}
                    >
                      {p.failed_document_count}
                    </span>
                  )}

                  {/* Unread changes badge */}
                  {hasUnread && !hasFailed && !isProcessing && (
                    <span
                      className="text-[10px] font-semibold px-1 py-0.5 rounded shrink-0 leading-none"
                      style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}
                    >
                      {p.unread_change_count}
                    </span>
                  )}
                </Link>

                {/* Kebab menu (visible on hover) */}
                <div className="pr-1 opacity-0 group-hover:opacity-100 transition-default shrink-0">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setMenuOpenId(menuOpenId === p.id ? null : p.id);
                    }}
                    className="p-1 rounded transition-default"
                    aria-label="Projektoptionen"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <MoreVertical size={13} />
                  </button>
                </div>

                {/* Dropdown menu */}
                {menuOpenId === p.id && (
                  <>
                    {/* Click-away overlay */}
                    <div
                      className="fixed inset-0 z-30"
                      onClick={() => setMenuOpenId(null)}
                    />
                    <div
                      className="absolute right-0 top-full z-40 rounded-md border shadow-md py-1 min-w-[160px]"
                      style={{
                        background: "var(--bg-overlay)",
                        borderColor: "var(--border-strong)",
                      }}
                    >
                      <button
                        onClick={() => handleArchive(p)}
                        disabled={archivingId === p.id}
                        className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-xs transition-default disabled:opacity-40"
                        style={{ color: "var(--text-secondary)" }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.background =
                            "var(--bg-elevated)";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.background = "transparent";
                        }}
                      >
                        <Archive size={12} />
                        Archivieren
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}

          {/* New project button */}
          {sidebarCollapsed ? (
            <div className="mx-1 my-0.5">
              <button
                onClick={() => setShowNewProject(true)}
                className="flex items-center justify-center w-12 h-9 rounded-md transition-default mx-auto hover:opacity-70"
                style={{ color: "var(--text-muted)" }}
                title="Neues Projekt"
              >
                <Plus size={14} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowNewProject(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md mx-1 text-sm mt-1 transition-default hover:opacity-70 w-[calc(100%-8px)]"
              style={{ color: "var(--text-muted)" }}
            >
              <Plus size={14} />
              <span>Neues Projekt</span>
            </button>
          )}

          {/* Archive section */}
          {!sidebarCollapsed && (
            <div className="mt-3">
              <button
                onClick={() => setArchiveOpen((v) => !v)}
                className="flex items-center gap-2 px-3 py-1 w-full text-xs transition-default hover:opacity-80"
                style={{ color: "var(--text-disabled)" }}
              >
                <Archive size={12} />
                <span className="flex-1 text-left uppercase tracking-widest font-medium">
                  Archiv
                </span>
                <ChevronDown
                  size={12}
                  style={{
                    transform: archiveOpen ? "rotate(0deg)" : "rotate(-90deg)",
                    transition: "transform 180ms",
                  }}
                />
              </button>

              {archiveOpen && (
                <div className="mt-1">
                  {archivedProjects.length === 0 ? (
                    <p
                      className="px-5 py-2 text-xs"
                      style={{ color: "var(--text-disabled)" }}
                    >
                      Keine archivierten Projekte
                    </p>
                  ) : (
                    archivedProjects.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center gap-1 mx-1 rounded-md group"
                      >
                        <Link
                          href={`/projects/${p.id}`}
                          className="flex items-center gap-2 px-3 py-1.5 text-sm transition-default flex-1 min-w-0"
                          style={{ color: "var(--text-disabled)" }}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ background: "var(--text-disabled)" }}
                          />
                          <span className="flex-1 truncate italic">{p.name}</span>
                        </Link>
                        <div className="pr-1 opacity-0 group-hover:opacity-100 transition-default shrink-0">
                          <button
                            onClick={() => handleUnarchive(p)}
                            disabled={archivingId === p.id}
                            className="p-1 rounded transition-default disabled:opacity-40"
                            aria-label="Aus Archiv holen"
                            title="Aus Archiv holen"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {archivingId === p.id ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <ArchiveRestore size={12} />
                            )}
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </nav>

        {/* Footer */}
        <div
          className="px-3 py-3 border-t flex items-center gap-2"
          style={{ borderColor: "var(--border)" }}
        >
          {!sidebarCollapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-xs truncate" style={{ color: "var(--text-secondary)" }}>
                {user?.name || user?.email || "—"}
              </p>
            </div>
          )}
          {currentProjectId && (
            <Link
              href={`/projects/${currentProjectId}/usage`}
              className="p-1 rounded transition-default hover:opacity-70"
              aria-label="Verbrauch"
            >
              <BarChart2
                size={14}
                style={{
                  color: pathname.includes("/usage")
                    ? "var(--accent)"
                    : "var(--text-muted)",
                }}
              />
            </Link>
          )}
          <Link
            href="/settings"
            className="p-1 rounded transition-default hover:opacity-70"
            aria-label="Einstellungen"
          >
            <Settings
              size={14}
              style={{
                color: pathname === "/settings" ? "var(--accent)" : "var(--text-muted)",
              }}
            />
          </Link>
          <button
            onClick={handleLogout}
            className="p-1 rounded transition-default hover:opacity-70"
            aria-label="Abmelden"
          >
            <LogOut size={14} style={{ color: "var(--text-muted)" }} />
          </button>
        </div>
      </aside>

      {showNewProject && <NewProjectModal onClose={() => setShowNewProject(false)} />}
    </>
  );
}
