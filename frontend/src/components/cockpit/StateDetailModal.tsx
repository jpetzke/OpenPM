"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { api } from "@/lib/api";
import { StateGrid } from "@/components/state/StateGrid";
import { StateTimeline } from "@/components/state/StateTimeline";
import type { ProjectState } from "@/types/state";

interface Props {
  projectId: string;
  onClose: () => void;
}

export function StateDetailModal({ projectId, onClose }: Props) {
  const { data: stateData, isLoading } = useQuery<ProjectState>({
    queryKey: ["projects", projectId, "state"],
    queryFn: () => api.get<ProjectState>(`/api/projects/${projectId}/state`),
    retry: false,
  });

  // Esc to close.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.65)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Vollständiger Projektstatus"
    >
      <div
        className="rounded-lg w-[90vw] h-[90vh] flex flex-col"
        style={{
          background: "var(--bg-base)",
          border: "1px solid var(--border-strong)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <header
          className="flex items-center justify-between px-5 py-3 border-b shrink-0"
          style={{ borderColor: "var(--border)" }}
        >
          <div>
            <h2
              className="text-sm font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              Vollständiger Projektstatus
            </h2>
            {stateData && (
              <p
                className="text-[11px] mt-0.5"
                style={{ color: "var(--text-muted)" }}
              >
                Version v{stateData.version}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="p-1.5 rounded transition-default"
            style={{ color: "var(--text-muted)" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                "var(--bg-surface)";
              (e.currentTarget as HTMLButtonElement).style.color =
                "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                "transparent";
              (e.currentTarget as HTMLButtonElement).style.color =
                "var(--text-muted)";
            }}
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto app-scrollbar px-6 py-5">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-24 rounded animate-pulse"
                  style={{ background: "var(--bg-surface)" }}
                />
              ))}
            </div>
          ) : !stateData?.state ? (
            <p
              className="text-sm text-center py-12"
              style={{ color: "var(--text-muted)" }}
            >
              Noch kein Status vorhanden — lade Dokumente hoch.
            </p>
          ) : (
            <>
              <StateGrid state={stateData.state} projectId={projectId} />
              <StateTimeline projectId={projectId} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
