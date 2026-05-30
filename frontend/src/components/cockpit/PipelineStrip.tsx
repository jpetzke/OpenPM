"use client";

import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { FileText, ScanLine, GitMerge, Search, Check } from "lucide-react";
import { usePipelineStore } from "@/store/pipelineStore";
import {
  PHASE_ORDER,
  PIPELINE_PHASE_LABELS,
  phaseIndexForStep,
  labelForPipelineStep,
  type PipelinePhase,
} from "@/lib/pipeline-phases";

const PHASE_ICONS: Record<PipelinePhase, typeof FileText> = {
  read: FileText,
  analyze: ScanLine,
  merge: GitMerge,
  index: Search,
};

interface Props {
  projectId: string;
}

/**
 * Feature 1 — the cinematic pipeline strip.
 *
 * A horizontal "engine" that lights up live as a document moves through the
 * 9-step backend pipeline, collapsed into the 4 canonical phases
 * (read → analyze → merge → index). Visible only while a document for this
 * project is actually being processed; it animates itself in/out.
 *
 * Phase detection reads the raw backend step name from the pipeline store
 * (`details[docId].label`) and maps it through `phaseIndexForStep`. No new
 * data plumbing — it rides the existing SSE → pipelineStore pathway.
 */
export function PipelineStrip({ projectId }: Props) {
  const active = usePipelineStore(
    useShallow((s) => {
      let bestId: string | null = null;
      let bestTime = -Infinity;
      for (const [docId, pid] of Object.entries(s.docProject)) {
        if (pid !== projectId) continue;
        const status = s.pipelines[docId];
        if (status !== "processing" && status !== "pending") continue;
        const ts = s.details[docId]?.timestamp;
        const t = ts ? Date.parse(ts) : 0;
        if (t >= bestTime) {
          bestTime = t;
          bestId = docId;
        }
      }
      if (!bestId) return null;
      const d = s.details[bestId];
      return {
        docId: bestId,
        name: s.docNames[bestId] ?? "Dokument",
        rawStep: d?.label ?? null,
        step: d?.step ?? null,
        total: d?.total ?? 9,
        status: s.pipelines[bestId],
      };
    }),
  );

  const activePhase = useMemo(
    () => (active ? phaseIndexForStep(active.rawStep) : 0),
    [active],
  );

  if (!active) return null;

  const stepLabel = labelForPipelineStep(active.rawStep);
  const pct =
    active.step != null && active.total
      ? Math.round((active.step / active.total) * 100)
      : null;

  return (
    <div
      data-testid="pipeline-strip"
      className="rise-in atmos shrink-0 border-b px-6 py-3.5"
      style={{
        borderColor: "var(--border)",
        background:
          "linear-gradient(180deg, color-mix(in srgb, var(--accent) 6%, var(--bg-surface)) 0%, var(--bg-base) 100%)",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="relative flex h-2 w-2 shrink-0"
            aria-hidden="true"
          >
            <span
              className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-pipeline-pulse"
              style={{ background: "var(--accent)" }}
            />
            <span
              className="relative inline-flex rounded-full h-2 w-2"
              style={{ background: "var(--accent)" }}
            />
          </span>
          <span
            className="text-[11px] font-semibold uppercase tracking-widest shrink-0"
            style={{ color: "var(--accent)" }}
          >
            Verarbeitung läuft
          </span>
          <span
            className="text-xs truncate"
            style={{ color: "var(--text-muted)" }}
          >
            · {active.name}
          </span>
        </div>
        <span
          className="text-[11px] font-mono tabular-nums shrink-0"
          style={{ color: "var(--text-muted)" }}
        >
          {active.step != null ? `${active.step}/${active.total}` : ""}
          {pct != null ? ` · ${pct}%` : ""}
        </span>
      </div>

      {/* Phase engine */}
      <div className="flex items-center">
        {PHASE_ORDER.map((phase, i) => {
          const Icon = PHASE_ICONS[phase];
          const done = i < activePhase;
          const current = i === activePhase;
          const nodeColor = done
            ? "var(--accent)"
            : current
              ? "var(--accent)"
              : "var(--text-disabled)";
          const nodeBg = done
            ? "var(--accent)"
            : current
              ? "color-mix(in srgb, var(--accent) 16%, var(--bg-elevated))"
              : "var(--bg-elevated)";

          return (
            <div key={phase} className="flex items-center flex-1 last:flex-none">
              {/* Node */}
              <div className="flex flex-col items-center gap-1.5 shrink-0">
                <div
                  className={`flex items-center justify-center rounded-[var(--radius-sm)] border transition-default ${
                    current ? "node-glow" : ""
                  }`}
                  style={{
                    width: 34,
                    height: 34,
                    background: nodeBg,
                    borderColor: done || current ? "var(--accent)" : "var(--border)",
                    color: done ? "#fff" : nodeColor,
                  }}
                >
                  {done ? (
                    <Check size={16} strokeWidth={2.5} />
                  ) : (
                    <Icon
                      size={15}
                      className={current ? "animate-pipeline-pulse" : ""}
                    />
                  )}
                </div>
                <span
                  className="text-[10px] font-medium whitespace-nowrap"
                  style={{
                    color:
                      done || current
                        ? "var(--text-secondary)"
                        : "var(--text-disabled)",
                  }}
                >
                  {PIPELINE_PHASE_LABELS[phase]}
                </span>
              </div>

              {/* Connector to next node */}
              {i < PHASE_ORDER.length - 1 && (
                <div
                  className="relative flex-1 mx-2 overflow-hidden rounded-full -mt-5"
                  style={{ height: 2, background: "var(--border)" }}
                >
                  {/* filled portion for completed gaps */}
                  {i < activePhase && (
                    <div
                      className="absolute inset-0 rounded-full"
                      style={{ background: "var(--accent)" }}
                    />
                  )}
                  {/* animated sweep on the gap leading into the active node */}
                  {i === activePhase - 1 && (
                    <div className="absolute inset-0 strip-sweep" />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {stepLabel && (
        <p
          className="mt-2.5 text-xs animate-fade-in"
          style={{ color: "var(--text-secondary)" }}
        >
          {stepLabel}
          <span className="animate-pipeline-pulse" style={{ color: "var(--text-muted)" }}>
            …
          </span>
        </p>
      )}
    </div>
  );
}
