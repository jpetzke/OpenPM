"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, X } from "lucide-react";
import { api } from "@/lib/api";
import type { Project } from "@/types/project";

interface Props {
  projectId: string;
}

/**
 * Section T: static stale notice over the cockpit status block. Rendered only
 * when the backend flags the project stale (no activity > 14d) or there are
 * overdue deadlines, and the user hasn't dismissed it since the last activity.
 * Text is template-generated server-side (zero LLM / zero token).
 */
export function StaleBanner({ projectId }: Props) {
  const qc = useQueryClient();
  const { data: project } = useQuery<Project>({
    queryKey: ["projects", projectId],
    queryFn: () => api.get<Project>(`/api/projects/${projectId}`),
  });

  const dismiss = useMutation({
    mutationFn: () => api.post(`/api/projects/${projectId}/stale/dismiss`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects", projectId] }),
  });

  const notice = project?.stale_notice;
  if (!notice || !notice.is_stale || notice.dismissed) return null;

  return (
    <div
      data-testid="stale-banner"
      role="status"
      className="flex items-start gap-2.5 rounded-lg p-3 text-sm"
      style={{
        background: "var(--warning-subtle, var(--accent-subtle))",
        border: "1px solid var(--warning, var(--border-strong))",
        color: "var(--text-primary)",
      }}
    >
      <AlertTriangle
        size={16}
        className="mt-0.5 shrink-0"
        style={{ color: "var(--warning)" }}
        aria-hidden
      />
      <p className="flex-1 leading-snug">{notice.text_de || notice.text_en}</p>
      <button
        type="button"
        aria-label="Hinweis ausblenden"
        onClick={() => dismiss.mutate()}
        disabled={dismiss.isPending}
        className="shrink-0 rounded p-0.5 transition-opacity hover:opacity-70 disabled:opacity-40"
        style={{ color: "var(--text-muted)" }}
      >
        <X size={14} />
      </button>
    </div>
  );
}
