"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight } from "lucide-react";
import { api } from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";
import { StateDetailModal } from "./StateDetailModal";
import type { ProjectState } from "@/types/state";

interface Props {
  projectId: string;
}

function formatGermanDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate().toString().padStart(2, "0")}.${(d.getMonth() + 1).toString().padStart(2, "0")}.${d.getFullYear()}`;
}

export function StatusPanel({ projectId }: Props) {
  const [detailOpen, setDetailOpen] = useState(false);

  const { data: stateData, isLoading } = useQuery<ProjectState>({
    queryKey: ["projects", projectId, "state"],
    queryFn: () => api.get<ProjectState>(`/api/projects/${projectId}/state`),
    retry: false,
  });

  const hasState = !!stateData?.state?.core;

  return (
    <section
      className="rounded-lg p-3.5"
      style={{ background: "var(--bg-base)", border: "1px solid var(--border)" }}
    >
      <header className="flex items-center justify-between mb-2.5">
        <button
          type="button"
          onClick={() => hasState && setDetailOpen(true)}
          disabled={!hasState}
          className="text-xs uppercase tracking-wide flex items-center gap-1 transition-default disabled:cursor-default"
          style={{
            color: "var(--text-muted)",
            fontWeight: 500,
            cursor: hasState ? "pointer" : "default",
          }}
          onMouseEnter={(e) => {
            if (hasState) {
              (e.currentTarget as HTMLButtonElement).style.color =
                "var(--text-primary)";
            }
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color =
              "var(--text-muted)";
          }}
          aria-label={hasState ? "Vollständigen Status öffnen" : "Status"}
        >
          Status
          {hasState && <ArrowUpRight size={11} />}
        </button>
      </header>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-5 rounded animate-pulse"
              style={{ background: "var(--bg-elevated)" }}
            />
          ))}
        </div>
      ) : !hasState ? (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Noch kein Status — lade Dokumente hoch.
        </p>
      ) : (
        <>
          <StatusRows state={stateData!} />
          <button
            type="button"
            onClick={() => setDetailOpen(true)}
            className="mt-3 text-xs transition-default hover:underline"
            style={{ color: "var(--accent)" }}
          >
            Vollständigen Status anzeigen →
          </button>
        </>
      )}

      {detailOpen && (
        <StateDetailModal
          projectId={projectId}
          onClose={() => setDetailOpen(false)}
        />
      )}
    </section>
  );
}

function StatusRows({ state }: { state: ProjectState }) {
  const core = state.state.core ?? {};
  const openTasks = (core.open_tasks ?? []).filter((t) => t.status !== "done").length;
  const blockerCount = (core.blockers ?? []).length;
  const now = new Date();
  const nextDeadline = (core.deadlines ?? [])
    .filter((d) => d.date && new Date(d.date) >= now)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];

  return (
    <dl className="flex flex-col gap-1.5">
      <Row k="Offene Tasks" v={String(openTasks)} />
      <Row
        k="Nächste Deadline"
        v={nextDeadline ? formatGermanDate(nextDeadline.date) : "—"}
      />
      <Row
        k="Blocker"
        v={String(blockerCount)}
        tone={blockerCount > 0 ? "warn" : undefined}
      />
      <Row k="Letztes Update" v={formatRelativeTime(state.created_at)} />
      <Row k="State-Version" v={`v${state.version}`} />
    </dl>
  );
}

function Row({
  k,
  v,
  tone,
}: {
  k: string;
  v: string;
  tone?: "warn" | "danger";
}) {
  const valueColor =
    tone === "warn"
      ? "var(--warning)"
      : tone === "danger"
        ? "var(--danger)"
        : "var(--text-primary)";
  return (
    <div className="flex items-center justify-between text-[13px] py-0.5">
      <dt style={{ color: "var(--text-muted)" }}>{k}</dt>
      <dd style={{ color: valueColor, fontWeight: 500 }}>{v}</dd>
    </div>
  );
}
