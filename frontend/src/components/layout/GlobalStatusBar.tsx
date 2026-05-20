"use client";
import { useCallback, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { api } from "@/lib/api";
import {
  usePipelineStore,
  getProjectPipelineSummary,
} from "@/store/pipelineStore";
import { BatchTimerBar } from "@/components/upload/BatchTimerBar";
import type { Document } from "@/types/document";

const WINDOW_S = 10;
const BAR_HEIGHT = 44;
const FAILURE_VISIBILITY_MS = 5 * 60 * 1000;

const PIPELINE_LABELS: Record<string, string> = {
  queued: "Warteschlange",
  parsing: "Dokument extrahieren",
  summarizing: "Zusammenfassung erstellen",
  document_insights: "Summary speichern",
  state_load: "Projekt-State laden",
  state_extraction: "State extrahieren",
  state_merge: "State zusammenfuehren",
  state_persist: "State speichern",
  changelog: "Changelog schreiben",
  git_commit: "Git sichern",
  embeddings: "Embeddings erzeugen",
  briefing: "Briefing aktualisieren",
  complete: "Abgeschlossen",
};

function formatLabel(label: string | null | undefined): string {
  if (!label) return "Aktivität";
  return PIPELINE_LABELS[label] ?? label.replaceAll("_", " ");
}

interface GlobalStatusBarProps {
  projectId: string;
}

export function GlobalStatusBar({ projectId }: GlobalStatusBarProps) {
  const qc = useQueryClient();

  // Subscribe to per-project summary derived from store.
  // useShallow prevents the infinite loop from a fresh object being returned each call.
  const summary = usePipelineStore(
    useShallow((s) => getProjectPipelineSummary(s, projectId))
  );
  const batchState = usePipelineStore((s) => s.batchState[projectId]);
  const setBatchState = usePipelineStore((s) => s.setBatchState);
  const clearBatchState = usePipelineStore((s) => s.clearBatchState);

  // Need documents to know how many are pending. We keep this lightweight — the
  // query is shared with DocumentList via the same key so React Query dedupes.
  const { data: documents } = useQuery<Document[]>({
    queryKey: ["projects", projectId, "documents"],
    queryFn: () => api.get<Document[]>(`/api/projects/${projectId}/documents`),
    refetchInterval: 10_000,
  });

  const pipelines = usePipelineStore((s) => s.pipelines);

  const pendingDocs = useMemo(
    () =>
      (documents ?? []).filter(
        (d) => (pipelines[d.id] ?? d.processing_status) === "pending"
      ),
    [documents, pipelines]
  );

  // Reset the countdown whenever the set of pending docs changes.
  const prevIdsRef = useRef("");
  useEffect(() => {
    const ids = pendingDocs.map((d) => d.id).sort().join(",");
    if (ids === prevIdsRef.current) return;
    prevIdsRef.current = ids;

    if (pendingDocs.length === 0) {
      // No more pending → drop batch state entirely.
      if (batchState) clearBatchState(projectId);
      return;
    }

    setBatchState(projectId, {
      paused: batchState?.paused ?? false,
      remaining: batchState?.paused ? (batchState?.remaining ?? WINDOW_S) : WINDOW_S,
      windowS: WINDOW_S,
      pendingCount: pendingDocs.length,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingDocs, projectId]);

  // Tick the countdown every second while not paused.
  useEffect(() => {
    if (!batchState) return;
    if (batchState.paused) return;
    if (batchState.pendingCount === 0) return;
    if (batchState.remaining <= 0) return;

    const t = setTimeout(() => {
      setBatchState(projectId, {
        ...batchState,
        remaining: Math.max(0, batchState.remaining - 1),
      });
    }, 1000);
    return () => clearTimeout(t);
  }, [batchState, projectId, setBatchState]);

  const onTriggerNow = useCallback(async () => {
    if (batchState) {
      setBatchState(projectId, { ...batchState, remaining: 0 });
    }
    try {
      await api.post(`/api/projects/${projectId}/documents/batch/trigger`);
      qc.invalidateQueries({ queryKey: ["projects", projectId, "documents"] });
    } catch {
      // ignore — SSE will reconcile
    }
  }, [batchState, projectId, qc, setBatchState]);

  const onTogglePause = useCallback(async () => {
    if (!batchState) return;
    const willPause = !batchState.paused;
    // Optimistic update.
    setBatchState(projectId, {
      ...batchState,
      paused: willPause,
      remaining: willPause ? batchState.remaining : WINDOW_S,
    });
    try {
      if (willPause) {
        await api.post(`/api/projects/${projectId}/documents/batch/pause`);
      } else {
        await api.post(`/api/projects/${projectId}/documents/batch/resume`);
      }
    } catch {
      // SSE will reconcile.
    }
  }, [batchState, projectId, setBatchState]);

  // Decide which visual to render. Priority: processing > pending batch > failed > idle.
  const failureFresh =
    summary.latestStatus === "failed" &&
    summary.latestTimestamp &&
    Date.now() - Date.parse(summary.latestTimestamp) < FAILURE_VISIBILITY_MS;

  const showProcessing = summary.processingCount > 0;
  const showBatch =
    !showProcessing && !!batchState && batchState.pendingCount > 0 && batchState.remaining > 0;
  const showFailed = !showProcessing && !showBatch && !!failureFresh;

  const mode: "processing" | "batch" | "failed" | "idle" = showProcessing
    ? "processing"
    : showBatch
      ? "batch"
      : showFailed
        ? "failed"
        : "idle";

  return (
    <div className="shrink-0" style={{ minHeight: 0 }}>
      <AnimatePresence initial={false}>
        {mode !== "idle" && (
          <motion.div
            key={mode}
            initial={{ y: -BAR_HEIGHT, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -BAR_HEIGHT, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            style={{
              height: BAR_HEIGHT,
              background: "var(--bg-surface)",
              borderBottom: "1px solid var(--border)",
              overflow: "hidden",
            }}
          >
            {mode === "processing" && (
              <ProcessingRow
                label={formatLabel(summary.latestLabel)}
                processingCount={summary.processingCount}
              />
            )}
            {mode === "batch" && batchState && (
              <BatchTimerBar
                pendingCount={batchState.pendingCount}
                remaining={batchState.remaining}
                windowS={batchState.windowS}
                paused={batchState.paused}
                onTriggerNow={onTriggerNow}
                onTogglePause={onTogglePause}
              />
            )}
            {mode === "failed" && (
              <FailedRow projectId={projectId} />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ProcessingRow({
  label,
  processingCount,
}: {
  label: string;
  processingCount: number;
}) {
  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* shimmer track */}
      <div
        className="absolute inset-0"
        style={{ background: "var(--bg-surface)" }}
      />
      <motion.div
        className="absolute inset-y-0"
        style={{
          width: "30%",
          background:
            "linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--accent) 22%, transparent) 50%, transparent 100%)",
        }}
        animate={{ x: ["-30%", "130%"] }}
        transition={{ duration: 1.6, ease: "linear", repeat: Infinity }}
      />
      <div className="relative flex h-full items-center gap-3 px-4">
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: "var(--accent)" }}
        />
        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
          Verarbeite <span style={{ color: "var(--text-primary)" }}>{label}</span>
          {processingCount > 1 && (
            <span style={{ color: "var(--text-muted)" }}>
              {" "}
              · {processingCount} parallel
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

function FailedRow({ projectId }: { projectId: string }) {
  return (
    <div
      className="flex h-full items-center gap-3 px-4"
      style={{ background: "color-mix(in srgb, var(--danger) 8%, transparent)" }}
    >
      <AlertTriangle size={14} style={{ color: "var(--danger)" }} />
      <span className="flex-1 text-xs" style={{ color: "var(--text-secondary)" }}>
        Verarbeitung fehlgeschlagen.
      </span>
      <Link
        href={`/projects/${projectId}/upload`}
        className="text-xs underline-offset-2 hover:underline"
        style={{ color: "var(--danger)" }}
      >
        Zu den Dokumenten
      </Link>
    </div>
  );
}
