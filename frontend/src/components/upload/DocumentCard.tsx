"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  Trash2,
  XCircle,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { usePipelineStore } from "@/store/pipelineStore";
import { formatBytes, formatRelativeTime } from "@/lib/utils";
import type { Document, DocumentStatus, PipelineLogEntry } from "@/types/document";

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

function labelFor(raw: string | null | undefined): string {
  if (!raw) return "Bereit";
  return PIPELINE_LABELS[raw] ?? raw.replaceAll("_", " ");
}

function StatusGlyph({ status }: { status: DocumentStatus }) {
  if (status === "done")
    return <CheckCircle2 size={14} style={{ color: "var(--success)" }} />;
  if (status === "failed")
    return <XCircle size={14} style={{ color: "var(--danger)" }} />;
  if (status === "processing")
    return (
      <Loader2
        size={14}
        className="animate-spin"
        style={{ color: "var(--accent)" }}
      />
    );
  return <Clock size={14} style={{ color: "var(--text-muted)" }} />;
}

interface DocumentCardProps {
  doc: Document;
  projectId: string;
  onDelete: (doc: Document) => void;
}

export function DocumentCard({ doc, projectId, onDelete }: DocumentCardProps) {
  const qc = useQueryClient();
  const livePipeline = usePipelineStore((s) => s.pipelines[doc.id]);
  const liveDetail = usePipelineStore((s) => s.details[doc.id]);
  const [expanded, setExpanded] = useState(false);
  const status: DocumentStatus = livePipeline ?? doc.processing_status;
  const step = liveDetail?.step ?? doc.pipeline_step ?? 0;
  const total = liveDetail?.total ?? 9;
  const labelRaw = liveDetail?.label ?? doc.pipeline_step_label;
  const detailLine = liveDetail?.detail;
  const pct = Math.min(100, Math.round(((step ?? 0) / Math.max(total, 1)) * 100));
  const logs: PipelineLogEntry[] = liveDetail?.logs?.length
    ? liveDetail.logs
    : (doc.pipeline_logs ?? []);

  const retry = useMutation({
    mutationFn: () =>
      api.post<Document>(`/api/projects/${projectId}/documents/${doc.id}/reprocess`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects", projectId, "documents"] }),
    onError: () => toast.error("Erneut verarbeiten fehlgeschlagen"),
  });

  const isActive = status === "processing" || status === "pending";
  const borderColor =
    status === "failed" ? "color-mix(in srgb, var(--danger) 35%, var(--border))" : "var(--border)";

  return (
    <article
      className="rounded-[var(--radius)] border overflow-hidden upload-fade-up"
      style={{
        background: "var(--bg-surface)",
        borderColor,
      }}
    >
      <header className="flex items-start gap-3 px-4 py-3">
        <span className="pt-[3px]">
          <StatusGlyph status={status} />
        </span>
        <div className="flex-1 min-w-0">
          <h3
            className="text-sm font-medium truncate"
            style={{ color: "var(--text-primary)" }}
          >
            {doc.original_filename}
          </h3>
          <p
            className="mt-0.5 text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            {formatBytes(doc.file_size)} · {formatRelativeTime(doc.uploaded_at)}
            {status === "processing" && labelRaw && (
              <>
                {" · "}
                <span style={{ color: "var(--accent)" }}>
                  {labelFor(labelRaw)} ({pct}%)
                </span>
              </>
            )}
            {status === "pending" && (
              <span style={{ color: "var(--text-muted)" }}> · eingereiht</span>
            )}
            {status === "done" && (
              <span style={{ color: "var(--success)" }}> · fertig</span>
            )}
            {status === "failed" && (
              <span style={{ color: "var(--danger)" }}> · Fehler</span>
            )}
          </p>
          {detailLine && status === "processing" && (
            <p
              className="mt-1 text-[11px] truncate"
              style={{ color: "var(--text-secondary)" }}
            >
              {detailLine}
            </p>
          )}
          {doc.summary && status === "done" && !expanded && (
            <p
              className="mt-2 text-xs line-clamp-2"
              style={{ color: "var(--text-secondary)", lineHeight: 1.5 }}
            >
              {doc.summary}
            </p>
          )}
          {status === "failed" && doc.processing_error && (
            <p
              className="mt-1 text-xs"
              style={{ color: "var(--danger)" }}
            >
              {doc.processing_error}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {(status === "failed" || status === "done") && (
            <button
              onClick={() => retry.mutate()}
              disabled={retry.isPending}
              aria-label="Erneut verarbeiten"
              className="p-1.5 rounded hover:bg-[var(--bg-elevated)] transition-default disabled:opacity-50"
              style={{ color: "var(--text-muted)" }}
            >
              <RefreshCw size={13} />
            </button>
          )}
          <button
            onClick={() => onDelete(doc)}
            aria-label="Dokument löschen"
            className="p-1.5 rounded hover:bg-[var(--bg-elevated)] transition-default"
            style={{ color: "var(--text-muted)" }}
          >
            <Trash2 size={13} />
          </button>
          <button
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "Einklappen" : "Details"}
            className="p-1.5 rounded hover:bg-[var(--bg-elevated)] transition-default"
            style={{ color: "var(--text-muted)" }}
          >
            <ChevronDown
              size={14}
              style={{
                transform: expanded ? "rotate(180deg)" : "none",
                transition: "transform 180ms ease",
              }}
            />
          </button>
        </div>
      </header>

      {isActive && (
        <div
          className="h-[2px] w-full"
          style={{ background: "var(--bg-elevated)" }}
        >
          <div
            className="h-full transition-[width] duration-300"
            style={{
              width: `${pct}%`,
              background: "var(--accent)",
            }}
          />
        </div>
      )}

      {expanded && (
        <section
          className="px-4 pb-3 pt-2 border-t"
          style={{ borderColor: "var(--border)" }}
        >
          {doc.summary && (
            <div className="mb-3">
              <h4
                className="text-[10px] font-semibold uppercase tracking-widest mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Zusammenfassung
              </h4>
              <p
                className="text-xs"
                style={{ color: "var(--text-secondary)", lineHeight: 1.5 }}
              >
                {doc.summary}
              </p>
            </div>
          )}
          <h4
            className="text-[10px] font-semibold uppercase tracking-widest mb-1.5"
            style={{ color: "var(--text-muted)" }}
          >
            Pipeline
          </h4>
          <ol className="space-y-1">
            {logs.map((log, idx) => (
              <li
                key={`${log.timestamp}-${idx}`}
                className="flex items-start gap-2 text-[11px]"
              >
                <span
                  className="font-mono shrink-0 w-4 text-right tabular-nums"
                  style={{ color: "var(--text-muted)" }}
                >
                  {log.step ?? "·"}
                </span>
                <span
                  className="shrink-0"
                  style={{
                    color:
                      log.status === "failed"
                        ? "var(--danger)"
                        : log.status === "done"
                          ? "var(--success)"
                          : "var(--accent)",
                  }}
                >
                  {labelFor(log.label)}
                </span>
                {log.detail && (
                  <span
                    className="truncate"
                    style={{ color: "var(--text-muted)" }}
                  >
                    — {log.detail}
                  </span>
                )}
              </li>
            ))}
            {logs.length === 0 && (
              <li
                className="text-[11px]"
                style={{ color: "var(--text-muted)" }}
              >
                Keine Pipeline-Einträge.
              </li>
            )}
          </ol>
        </section>
      )}
    </article>
  );
}
