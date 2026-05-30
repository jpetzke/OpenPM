"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  ListChecks,
  AlertTriangle,
  Users,
  Gavel,
  CalendarClock,
} from "lucide-react";
import { api } from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";
import { nextDeadline } from "@/lib/deadlines";
import { StateDetailModal } from "./StateDetailModal";
import { ExportButtons } from "./ExportButtons";
import { useUsage } from "@/hooks/useUsage";
import { useFlashOnChange } from "@/hooks/useFlashOnChange";
import { CountUp } from "@/components/ui/CountUp";
import type { ProjectState } from "@/types/state";

// rAF count-up replaces the former framer-motion AnimatedCount (roadmap V).
function AnimatedCount({ value }: { value: number }) {
  return <CountUp value={value} className="" />;
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
  const contactCount = (core.contacts ?? []).length;
  const decisionCount = (core.decisions ?? []).length;
  const flashing = useFlashOnChange(state.version);
  const nd = nextDeadline(state.state);

  return (
    <div className={`rounded ${flashing ? "flash" : ""}`}>
      {/* Glance cards — high-contrast, tactile, staggered reveal. */}
      <div className="grid grid-cols-2 gap-2">
        <GlanceCard
          icon={ListChecks}
          label="Offene Tasks"
          value={openTasks}
          tone={openTasks > 0 ? "accent" : "neutral"}
          delay={0}
        />
        <GlanceCard
          icon={AlertTriangle}
          label="Blocker"
          value={blockerCount}
          tone={blockerCount > 0 ? "warn" : "neutral"}
          delay={40}
        />
        <GlanceCard
          icon={Users}
          label="Kontakte"
          value={contactCount}
          tone="neutral"
          delay={80}
        />
        <GlanceCard
          icon={Gavel}
          label="Entscheidungen"
          value={decisionCount}
          tone="neutral"
          delay={120}
        />
      </div>

      {/* Next-deadline strip spanning full width. */}
      <DeadlineStrip nd={nd} />

      {/* Version + freshness footer line. */}
      <div
        className="mt-2.5 flex items-center justify-between text-[11px]"
        style={{ color: "var(--text-muted)" }}
      >
        <span className="font-mono tabular-nums">v{state.version}</span>
        <span>aktualisiert {formatRelativeTime(state.created_at)}</span>
      </div>
    </div>
  );
}

const TONE_COLOR: Record<"accent" | "warn" | "danger" | "neutral", string> = {
  accent: "var(--accent)",
  warn: "var(--warning)",
  danger: "var(--danger)",
  neutral: "var(--text-secondary)",
};

function GlanceCard({
  icon: Icon,
  label,
  value,
  tone,
  delay,
}: {
  icon: typeof ListChecks;
  label: string;
  value: number;
  tone: "accent" | "warn" | "danger" | "neutral";
  delay: number;
}) {
  const accent = TONE_COLOR[tone];
  const active = tone !== "neutral" && value > 0;
  return (
    <div
      className="rise-in lift-hover rounded-[var(--radius-sm)] border p-2.5 flex flex-col gap-1.5"
      style={{
        background: active
          ? `color-mix(in srgb, ${accent} 8%, var(--bg-elevated))`
          : "var(--bg-elevated)",
        borderColor: active
          ? `color-mix(in srgb, ${accent} 35%, var(--border))`
          : "var(--border)",
        animationDelay: `${delay}ms`,
      }}
    >
      <div className="flex items-center gap-1.5">
        <Icon size={12} style={{ color: active ? accent : "var(--text-muted)" }} />
        <span
          className="text-[10px] font-medium uppercase tracking-wider truncate"
          style={{ color: "var(--text-muted)" }}
        >
          {label}
        </span>
      </div>
      <span
        className="text-2xl font-semibold tabular-nums leading-none"
        style={{ color: active ? accent : "var(--text-primary)" }}
      >
        <AnimatedCount value={value} />
      </span>
    </div>
  );
}

function DeadlineStrip({
  nd,
}: {
  nd: ReturnType<typeof nextDeadline>;
}) {
  const overdue = nd?.isOverdue ?? false;
  const accent = overdue ? "var(--danger)" : "var(--accent)";
  const raw = nd?.deadline.date ?? "";
  const d = raw ? new Date(raw) : null;
  const dateStr =
    d && !isNaN(d.getTime())
      ? `${d.getDate().toString().padStart(2, "0")}.${(d.getMonth() + 1)
          .toString()
          .padStart(2, "0")}.${d.getFullYear()}`
      : null;

  return (
    <div
      className="rise-in mt-2 rounded-[var(--radius-sm)] border p-2.5 flex items-center gap-2.5"
      style={{
        background: nd
          ? `color-mix(in srgb, ${accent} 7%, var(--bg-elevated))`
          : "var(--bg-elevated)",
        borderColor: nd
          ? `color-mix(in srgb, ${accent} 30%, var(--border))`
          : "var(--border)",
        animationDelay: "160ms",
      }}
    >
      <CalendarClock
        size={15}
        className="shrink-0"
        style={{ color: nd ? accent : "var(--text-muted)" }}
      />
      <div className="min-w-0 flex-1">
        <p
          className="text-[10px] font-medium uppercase tracking-wider"
          style={{ color: "var(--text-muted)" }}
        >
          {overdue ? "Überfällig" : "Nächste Deadline"}
        </p>
        {nd ? (
          <p
            className="text-[13px] font-medium truncate"
            style={{ color: "var(--text-primary)" }}
            title={nd.deadline.title ?? undefined}
          >
            {nd.deadline.title || dateStr}
          </p>
        ) : (
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
            Keine offenen Fristen
          </p>
        )}
      </div>
      {nd && dateStr && (
        <span
          className="shrink-0 text-xs font-mono tabular-nums font-semibold"
          style={{ color: accent }}
        >
          {dateStr}
        </span>
      )}
    </div>
  );
}
