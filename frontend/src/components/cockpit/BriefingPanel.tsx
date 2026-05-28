"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { api } from "@/lib/api";
import type { Project } from "@/types/project";

interface Props {
  projectId: string;
}

export function BriefingPanel({ projectId }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const { data: project, isLoading } = useQuery<Project>({
    queryKey: ["projects", projectId],
    queryFn: () => api.get<Project>(`/api/projects/${projectId}`),
  });

  const briefing = project?.compiled_briefing?.trim() ?? null;

  return (
    <section
      className="rounded-lg p-3.5"
      style={{ background: "var(--bg-base)", border: "1px solid var(--border)" }}
    >
      <header className="flex items-center justify-between mb-2.5">
        <span
          className="text-xs uppercase tracking-wide"
          style={{ color: "var(--text-muted)", fontWeight: 500 }}
        >
          Briefing
        </span>
        <div className="flex items-center gap-1.5">
          {project?.briefing_token_count != null && (
            <span
              className="text-xs px-1.5 py-0.5 rounded"
              style={{
                color: "var(--text-muted)",
                background: "var(--bg-elevated)",
              }}
            >
              {project.briefing_token_count} Token
            </span>
          )}
          {project?.briefing_was_truncated && (
            <span
              className="text-xs px-1.5 py-0.5 rounded cursor-default"
              title="Briefing wurde auf Token-Budget gekürzt — Priorität ist konfigurierbar in Settings."
              style={{
                color: "var(--warning)",
                background: "var(--warning-subtle)",
              }}
            >
              gekürzt
            </span>
          )}
        </div>
      </header>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-3 rounded animate-pulse"
              style={{ background: "var(--bg-elevated)" }}
            />
          ))}
        </div>
      ) : briefing ? (
        <>
          <div
            className="relative text-xs leading-relaxed overflow-hidden"
            style={{
              color: "var(--text-secondary)",
              maxHeight: "120px",
            }}
          >
            <div className="line-clamp-5 whitespace-pre-wrap">{briefing}</div>
            <div
              className="absolute bottom-0 left-0 right-0 h-8 pointer-events-none"
              style={{
                background:
                  "linear-gradient(transparent, var(--bg-base))",
              }}
            />
          </div>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="mt-2 text-xs transition-default hover:underline"
            style={{ color: "var(--accent)" }}
          >
            Vollständiges Briefing anzeigen →
          </button>
        </>
      ) : (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Noch kein Briefing erstellt. Lade Dokumente hoch, um eines zu generieren.
        </p>
      )}

      {modalOpen && briefing && (
        <BriefingModal briefing={briefing} onClose={() => setModalOpen(false)} />
      )}
    </section>
  );
}

function BriefingModal({
  briefing,
  onClose,
}: {
  briefing: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.65)" }}
      onClick={onClose}
    >
      <div
        className="rounded-lg max-w-2xl w-full max-h-[80vh] flex flex-col"
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-strong)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <header
          className="flex items-center justify-between px-5 py-3 border-b"
          style={{ borderColor: "var(--border)" }}
        >
          <h2
            className="text-sm font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            Briefing
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="p-1 rounded transition-default"
            style={{ color: "var(--text-muted)" }}
          >
            <X size={16} />
          </button>
        </header>
        <div
          className="px-5 py-4 overflow-y-auto text-sm whitespace-pre-wrap leading-relaxed"
          style={{ color: "var(--text-primary)" }}
        >
          {briefing}
        </div>
      </div>
    </div>
  );
}
