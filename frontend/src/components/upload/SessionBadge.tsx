"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useShallow } from "zustand/react/shallow";
import { toast } from "sonner";
import { Square } from "lucide-react";
import { api } from "@/lib/api";
import { usePipelineStore, type ChangeSessionInfo } from "@/store/pipelineStore";
import { formatRelativeTime } from "@/lib/utils";

interface SessionBadgeProps {
  projectId: string;
}

export function SessionBadge({ projectId }: SessionBadgeProps) {
  const qc = useQueryClient();
  const localActive = usePipelineStore(
    useShallow((s) => s.perProjectActiveSession[projectId] ?? null),
  );

  const { data: fetched } = useQuery<ChangeSessionInfo | null>({
    queryKey: ["projects", projectId, "change-session"],
    queryFn: () =>
      api.get<ChangeSessionInfo | null>(
        `/api/projects/${projectId}/change-sessions/current`,
      ),
    staleTime: 30_000,
  });

  const active = localActive ?? fetched ?? null;

  const close = useMutation({
    mutationFn: () => api.post(`/api/projects/${projectId}/change-sessions/close`),
    onSuccess: () => {
      toast.success("Session geschlossen");
      qc.invalidateQueries({ queryKey: ["projects", projectId, "change-session"] });
    },
    onError: () => toast.error("Session konnte nicht geschlossen werden"),
  });

  if (!active) {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-[11px]"
        style={{ color: "var(--text-muted)" }}
      >
        <span
          aria-hidden
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{ background: "var(--text-muted)" }}
        />
        Keine offene Session
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        if (window.confirm("Aktuelle Session jetzt schließen?")) close.mutate();
      }}
      disabled={close.isPending}
      className="inline-flex items-center gap-1.5 text-[11px] transition-default disabled:opacity-50"
      style={{ color: "var(--accent)" }}
      aria-label="Session schließen"
    >
      <span
        aria-hidden
        className="inline-block w-1.5 h-1.5 rounded-full"
        style={{
          background: "var(--accent)",
          boxShadow: "0 0 0 3px var(--accent-subtle)",
        }}
      />
      Session offen · seit {formatRelativeTime(active.started_at)}
      <Square size={9} className="ml-0.5 opacity-60" />
    </button>
  );
}
