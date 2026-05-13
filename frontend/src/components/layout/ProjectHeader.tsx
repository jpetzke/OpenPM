"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";
import type { Project } from "@/types/project";
import { ProjectTabs } from "./ProjectTabs";

interface ProjectHeaderProps {
  project: Project;
}

const STATUS_OPTIONS = ["active", "paused", "archived"] as const;

function statusLabel(s: string) {
  if (s === "active") return "aktiv";
  if (s === "paused") return "pausiert";
  return "archiviert";
}

function statusDotColor(s: string) {
  if (s === "active") return "var(--success)";
  if (s === "paused") return "var(--warning)";
  return "var(--text-disabled)";
}

export function ProjectHeader({ project }: ProjectHeaderProps) {
  const qc = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: (status: string) =>
      api.patch<Project>(`/api/projects/${project.id}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["projects", project.id] });
    },
    onError: () => toast.error("Status-Update fehlgeschlagen"),
  });

  return (
    <div
      className="shrink-0 border-b"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
    >
      <div className="px-6 pt-4 pb-0">
        <div className="flex items-center justify-between mb-0.5">
          <h1 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            {project.name}
          </h1>
          <div className="relative group">
            <button
              className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-md transition-default"
              style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)" }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: statusDotColor(project.status) }}
              />
              {statusLabel(project.status)}
              <ChevronDown size={12} />
            </button>
            <div
              className="absolute right-0 mt-1 w-32 rounded-md border py-1 z-50 hidden group-hover:block"
              style={{ background: "var(--bg-overlay)", borderColor: "var(--border-strong)" }}
            >
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => updateMutation.mutate(s)}
                  className="w-full text-left px-3 py-1.5 text-xs transition-default"
                  style={{ color: "var(--text-secondary)" }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-elevated)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                  }}
                >
                  {statusLabel(s)}
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
          {project.client_name} · Letztes Update: {formatRelativeTime(project.updated_at)}
        </p>
        <ProjectTabs projectId={project.id} />
      </div>
    </div>
  );
}
