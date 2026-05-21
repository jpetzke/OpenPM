"use client";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Plus, LogOut, Loader2, Settings } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { usePipelineStore, getProjectPipelineSummary } from "@/store/pipelineStore";
import type { PipelineStore } from "@/store/pipelineStore";
import type { Project } from "@/types/project";

function statusDotColor(status: string) {
  if (status === "active") return "var(--success)";
  if (status === "paused") return "var(--warning)";
  return "var(--text-disabled)";
}

interface AppSidebarProps {
  currentProjectId?: string;
}

export function AppSidebar({ currentProjectId }: AppSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, clearAuth, token } = useAuthStore();
  // Subscribe only to the slices needed for per-project summaries. useShallow
  // prevents the sidebar from re-rendering on every unrelated store update.
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

  const sorted = [...(projects ?? [])].sort((a, b) => a.name.localeCompare(b.name));

  const handleLogout = async () => {
    try {
      await api.post("/api/auth/logout");
    } catch {
      // ignore errors
    }
    clearAuth();
    router.push("/login");
  };

  return (
    <aside
      className="flex flex-col h-full shrink-0"
      style={{
        width: "var(--sidebar-width)",
        background: "var(--bg-surface)",
        borderRight: "1px solid var(--border)",
      }}
    >
      <div className="px-4 py-4 border-b" style={{ borderColor: "var(--border)" }}>
        <Link href="/projects">
          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>OpenPM</span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        <div className="px-3 mb-1">
          <span className="text-xs font-medium uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
            Projekte
          </span>
        </div>
        {sorted.map((p) => {
          const isActive = p.id === currentProjectId;
          const summary = getProjectPipelineSummary(pipelineState, p.id);
          const isProcessing =
            summary.processingCount > 0 || summary.pendingCount > 0;
          return (
            <Link
              key={p.id}
              href={`/projects/${p.id}/upload`}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md mx-1 text-sm transition-default"
              style={{
                color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                background: isActive ? "var(--bg-elevated)" : "transparent",
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: statusDotColor(p.status) }}
              />
              <span className="flex-1 truncate">{p.name}</span>
              {isProcessing && (
                <Loader2 size={12} className="animate-spin shrink-0" style={{ color: "var(--text-muted)" }} />
              )}
            </Link>
          );
        })}

        <Link
          href="/projects"
          className="flex items-center gap-2 px-3 py-1.5 rounded-md mx-1 text-sm mt-1 transition-default"
          style={{ color: "var(--text-muted)" }}
        >
          <Plus size={14} />
          <span>Neues Projekt</span>
        </Link>
      </nav>

      <div className="px-3 py-3 border-t flex items-center gap-2" style={{ borderColor: "var(--border)" }}>
        <div className="flex-1 min-w-0">
          <p className="text-xs truncate" style={{ color: "var(--text-secondary)" }}>
            {user?.name || user?.email || "—"}
          </p>
        </div>
        <Link
          href="/settings"
          className="p-1 rounded transition-default hover:opacity-70"
          aria-label="Einstellungen"
        >
          <Settings size={14} style={{ color: pathname === "/settings" ? "var(--accent)" : "var(--text-muted)" }} />
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
  );
}
