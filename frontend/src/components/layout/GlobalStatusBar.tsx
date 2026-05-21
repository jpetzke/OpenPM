"use client";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import {
  usePipelineStore,
  getProjectPipelineSummary,
} from "@/store/pipelineStore";

const BAR_HEIGHT = 44;
const FAILURE_VISIBILITY_MS = 5 * 60 * 1000;

const PIPELINE_LABELS: Record<string, string> = {
  queued: "Eingereiht",
  parsing: "Parsen",
  summarize_extract: "LLM",
  state_merge: "State zusammenführen",
  state_persist: "State speichern",
  changelog: "Changelog",
  git_commit: "Git",
  enrich: "Embeddings & Briefing",
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
  const summary = usePipelineStore(
    useShallow((s) => getProjectPipelineSummary(s, projectId)),
  );

  const failureFresh =
    summary.latestStatus === "failed" &&
    summary.latestTimestamp &&
    Date.now() - Date.parse(summary.latestTimestamp) < FAILURE_VISIBILITY_MS;

  const showProcessing = summary.processingCount > 0;
  const showFailed = !showProcessing && !!failureFresh;

  const mode: "processing" | "failed" | "idle" = showProcessing
    ? "processing"
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
            {mode === "failed" && <FailedRow projectId={projectId} />}
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
      <div className="absolute inset-0" style={{ background: "var(--bg-surface)" }} />
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
              {" "}· {processingCount} parallel
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
