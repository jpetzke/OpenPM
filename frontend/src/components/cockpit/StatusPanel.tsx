"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { animate } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { api } from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";
import { nextDeadline, formatDeadline } from "@/lib/deadlines";
import { StateDetailModal } from "./StateDetailModal";
import { ExportButtons } from "./ExportButtons";
import { useUsage } from "@/hooks/useUsage";
import type { ProjectState } from "@/types/state";

function useFlashOnChange(version: number | undefined) {
  const [flashing, setFlashing] = useState(false);
  const prevRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (prevRef.current === undefined) {
      prevRef.current = version;
      return;
    }
    if (version !== prevRef.current) {
      prevRef.current = version;
      setFlashing(true);
      const t = setTimeout(() => setFlashing(false), 500);
      return () => clearTimeout(t);
    }
  }, [version]);
  return flashing;
}

function AnimatedCount({ value }: { value: number }) {
  const [displayed, setDisplayed] = useState(value);
  const prevRef = useRef(value);

  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    if (from === to) {
      setDisplayed(to);
      return;
    }
    const controls = animate(from, to, {
      duration: 0.2,
      ease: "easeOut",
      onUpdate: (v) => setDisplayed(Math.round(v)),
      onComplete: () => setDisplayed(to),
    });
    prevRef.current = to;
    return () => controls.stop();
  }, [value]);

  return <span data-testid="animated-count">{displayed}</span>;
}

interface Props {
  projectId: string;
}

export function StatusPanel({ projectId }: Props) {
  const [detailOpen, setDetailOpen] = useState(false);

  const { data: stateData, isLoading } = useQuery<ProjectState>({
    queryKey: ["projects", projectId, "state"],
    queryFn: () => api.get<ProjectState>(`/api/projects/${projectId}/state`),
    retry: false,
  });

  const { data: usageData } = useUsage(projectId, "today");

  const hasState = !!stateData?.state?.core;
  const todayCost = usageData?.total?.cost_usd ?? null;
  const budgetUsd = usageData?.budget_usd ?? null;
  const budgetPct = usageData?.budget_used_pct ?? null;

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

      {todayCost !== null && (
        <div
          className="mt-3 pt-3 flex flex-col gap-1.5"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <div className="flex items-center justify-between text-[12px]">
            <span style={{ color: "var(--text-muted)" }}>Verbrauch heute</span>
            <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>
              ${todayCost.toFixed(4)}
            </span>
          </div>
          {budgetUsd && budgetPct !== null && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-[11px]">
                <span style={{ color: "var(--text-muted)" }}>
                  MTD: ${usageData?.month_to_date_cost_usd?.toFixed(2)} / ${budgetUsd.toFixed(2)}
                </span>
                <span
                  style={{
                    color: budgetPct >= 80
                      ? budgetPct >= 100 ? "var(--danger)" : "var(--warning)"
                      : "var(--text-muted)",
                    fontWeight: 500,
                  }}
                >
                  {budgetPct.toFixed(0)}%
                </span>
              </div>
              <div
                className="h-1 rounded-full overflow-hidden"
                style={{ background: "var(--bg-elevated)" }}
              >
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.min(budgetPct, 100)}%`,
                    background: budgetPct >= 100
                      ? "var(--danger)"
                      : budgetPct >= 80
                        ? "var(--warning)"
                        : "var(--accent)",
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}
      <ExportButtons projectId={projectId} />
    </section>
  );
}

function StatusRows({ state }: { state: ProjectState }) {
  const core = state.state.core ?? {};
  const openTasks = (core.open_tasks ?? []).filter((t) => t.status !== "done").length;
  const blockerCount = (core.blockers ?? []).length;
  const flashing = useFlashOnChange(state.version);
  const nd = nextDeadline(state.state);

  return (
    <dl className={`flex flex-col gap-1.5 rounded ${flashing ? "flash" : ""}`}>
      <Row k="Offene Tasks" v={<AnimatedCount value={openTasks} />} />
      <Row
        k="Nächste Deadline"
        v={nd ? formatDeadline(nd.deadline, nd.isOverdue) : "—"}
        tone={nd?.isOverdue ? "danger" : undefined}
      />
      <Row
        k="Blocker"
        v={<AnimatedCount value={blockerCount} />}
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
  v: React.ReactNode;
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
