"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import type { StateChangelog } from "@/types/state";

interface StateTimelineProps {
  projectId: string;
}

function DiffModal({ changelog, onClose }: { changelog: StateChangelog; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border shadow-2xl max-h-[80vh] flex flex-col"
        style={{ background: "var(--bg-overlay)", borderColor: "var(--border-strong)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-4 py-3 border-b shrink-0"
          style={{ borderColor: "var(--border)" }}
        >
          <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            Version {changelog.to_version} — {changelog.triggered_by}
          </span>
          <button onClick={onClose} aria-label="Schließen">
            <X size={16} style={{ color: "var(--text-muted)" }} />
          </button>
        </div>
        <div className="p-4 overflow-y-auto">
          <pre
            className="text-xs font-mono whitespace-pre-wrap break-all"
            style={{ color: "var(--text-secondary)" }}
          >
            {JSON.stringify(changelog.delta, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}

export function StateTimeline({ projectId }: StateTimelineProps) {
  const [selected, setSelected] = useState<StateChangelog | null>(null);
  const [showAll, setShowAll] = useState(false);

  const { data: history } = useQuery<StateChangelog[]>({
    queryKey: ["projects", projectId, "state", "history"],
    queryFn: () =>
      api.get<StateChangelog[]>(`/api/projects/${projectId}/state/history?limit=20`),
  });

  const shown = showAll ? (history ?? []) : (history ?? []).slice(0, 5);

  if (!history?.length) return null;

  return (
    <div className="mt-8">
      <h3
        className="text-xs font-semibold uppercase tracking-widest mb-3"
        style={{ color: "var(--text-muted)" }}
      >
        Letzte Änderungen
      </h3>
      <div className="space-y-0.5">
        {shown.map((entry) => (
          <button
            key={entry.id}
            onClick={() => setSelected(entry)}
            className="w-full text-left flex items-center gap-3 py-2 px-3 rounded-md transition-default"
            style={{ color: "var(--text-secondary)" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-surface)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "transparent";
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: "var(--accent)" }}
            />
            <span className="text-xs flex-1 truncate">{entry.triggered_by}</span>
            <span className="text-xs shrink-0" style={{ color: "var(--text-muted)" }}>
              {formatDate(entry.created_at)}
            </span>
          </button>
        ))}
      </div>
      {(history?.length ?? 0) > 5 && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          className="mt-2 text-xs transition-default"
          style={{ color: "var(--accent)" }}
        >
          Mehr anzeigen
        </button>
      )}
      {selected && <DiffModal changelog={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
