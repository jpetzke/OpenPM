"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertOctagon,
  Calendar,
  CheckCircle2,
  CheckSquare,
  Clock,
  FileText,
  Image as ImageIcon,
  LayoutList,
  Loader2,
  Mail,
  Mic,
  MoreVertical,
  RefreshCw,
  Scale,
  User,
  XCircle,
  ChevronDown,
  Ban,
} from "lucide-react";
import { toast } from "sonner";
import { api, replaceDocumentDryRun, replaceDocument, type DiffPreview } from "@/lib/api";
import { DiffPreviewModal } from "./DiffPreviewModal";
import {
  usePipelineStore,
  type ExtractedItem,
  type ExtractedItemType,
} from "@/store/pipelineStore";
import { formatBytes, formatRelativeTime } from "@/lib/utils";
import {
  labelForPipelineStep,
  PHASE_ORDER,
  PIPELINE_PHASE_LABELS,
  phaseIndexForStep,
  type PipelinePhase,
} from "@/lib/pipeline-phases";
import type { Document, DocumentStatus, PipelineLogEntry } from "@/types/document";

function labelFor(raw: string | null | undefined): string {
  if (!raw) return "Bereit";
  return labelForPipelineStep(raw);
}

function StatusGlyph({ status }: { status: DocumentStatus | "cancelled" }) {
  if (status === "done")
    return <CheckCircle2 size={14} style={{ color: "var(--success)" }} />;
  if (status === "failed")
    return <XCircle size={14} style={{ color: "var(--danger)" }} />;
  if (status === "cancelled")
    return <Ban size={14} style={{ color: "var(--text-muted)" }} />;
  if (status === "completed_partial")
    return <AlertOctagon size={14} style={{ color: "var(--warning)" }} />;
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

function FormatIcon({ sourceFormat }: { sourceFormat: string | null }) {
  const color = "var(--text-muted)";
  if (sourceFormat === "eml") return <Mail size={13} style={{ color }} />;
  if (sourceFormat === "image") return <ImageIcon size={13} style={{ color }} />;
  if (sourceFormat === "audio") return <Mic size={13} style={{ color }} />;
  return <FileText size={13} style={{ color }} />;
}

interface DocumentCardProps {
  doc: Document;
  projectId: string;
  onDelete: (doc: Document) => void;
  onRestore?: (doc: Document) => void;
  /** Child documents (EML attachments) */
  attachments?: Document[];
}

type WideStatus = DocumentStatus | "cancelled";

export function DocumentCard({ doc, projectId, onDelete, onRestore, attachments = [] }: DocumentCardProps) {
  const qc = useQueryClient();
  const livePipeline = usePipelineStore((s) => s.pipelines[doc.id]);
  const liveDetail = usePipelineStore((s) => s.details[doc.id]);
  const liveItems = usePipelineStore((s) => s.liveItemsByDoc[doc.id]);
  const liveExpanded = usePipelineStore((s) => s.expandedDocs.has(doc.id));
  const lastItemAt = usePipelineStore((s) => s.lastItemAtByDoc[doc.id]);
  const collapseDoc = usePipelineStore((s) => s.collapseDoc);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [diffPreview, setDiffPreview] = useState<DiffPreview | null>(null);
  const [pendingReplaceFile, setPendingReplaceFile] = useState<File | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [attachmentsExpanded, setAttachmentsExpanded] = useState(false);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const rawStatus = (livePipeline ?? doc.processing_status ?? "pending") as WideStatus;
  const step = liveDetail?.step ?? doc.pipeline_step ?? 0;
  const total = liveDetail?.total ?? 9;
  const labelRaw = liveDetail?.label ?? doc.pipeline_step_label;
  const detailLine = liveDetail?.detail;
  const pct = Math.min(100, Math.round(((step ?? 0) / Math.max(total, 1)) * 100));
  const logs: PipelineLogEntry[] = liveDetail?.logs?.length
    ? liveDetail.logs
    : (doc.pipeline_logs ?? []);

  // Current phase index 0..3 — derived from the latest known step.
  const activePhaseIdx = useMemo(
    () => phaseIndexForStep(labelRaw ?? undefined),
    [labelRaw],
  );

  // Auto-collapse the live feed 3s after the last extracted_item, unless the
  // doc has failed (then keep it expanded for inspection).
  useEffect(() => {
    if (!liveExpanded) return;
    if (!lastItemAt) return;
    if (rawStatus === "failed") return;
    const timer = setTimeout(() => collapseDoc(doc.id), 3000);
    return () => clearTimeout(timer);
  }, [lastItemAt, liveExpanded, rawStatus, doc.id, collapseDoc]);

  const retry = useMutation({
    mutationFn: () =>
      // Stream A is moving us to `/retry`; older deployments still use
      // `/reprocess`. Fall back to the legacy path if 404.
      api
        .post<Document>(`/api/projects/${projectId}/documents/${doc.id}/retry`)
        .catch((err: { status?: number }) => {
          if (err?.status === 404) {
            return api.post<Document>(
              `/api/projects/${projectId}/documents/${doc.id}/reprocess`,
            );
          }
          throw err;
        }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["projects", projectId, "documents"] }),
    onError: () => toast.error("Erneut verarbeiten fehlgeschlagen"),
  });

  const cancel = useMutation({
    mutationFn: () =>
      api.delete(
        `/api/projects/${projectId}/documents/${doc.id}?cancel_pipeline=true`,
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["projects", projectId, "documents"] }),
    onError: () => toast.error("Abbrechen fehlgeschlagen"),
  });

  const isActive = rawStatus === "processing" || rawStatus === "pending";
  const canRetry = rawStatus === "failed" || rawStatus === "cancelled" || rawStatus === "done" || rawStatus === "completed_partial";
  const canCancel = isActive;
  const borderColor =
    rawStatus === "failed" ? "color-mix(in srgb, var(--danger) 35%, var(--border))"
    : rawStatus === "completed_partial" ? "color-mix(in srgb, var(--warning) 35%, var(--border))"
    : "var(--border)";

  return (
    <>
    <article
      className="rounded-[var(--radius)] border overflow-hidden upload-fade-up"
      data-testid="document-card"
      data-status={rawStatus}
      style={{
        background: "var(--bg-surface)",
        borderColor,
      }}
    >
      {/* Attachment indent: if this doc has a parent, show indented style */}
      {doc.parent_document_id && (
        <div
          className="flex items-center gap-1.5 px-4 pt-1.5"
        >
          <span
            className="text-[10px] font-medium px-1.5 py-0.5 rounded"
            style={{
              background: "var(--bg-elevated)",
              color: "var(--text-muted)",
            }}
          >
            Anhang
          </span>
        </div>
      )}
      <header className="flex items-start gap-3 px-4 py-3">
        <span className="pt-[3px] flex items-center gap-1">
          <FormatIcon sourceFormat={doc.source_format} />
          <StatusGlyph status={rawStatus} />
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
            {rawStatus === "processing" && labelRaw && (
              <>
                {" · "}
                <span style={{ color: "var(--accent)" }}>
                  {labelFor(labelRaw)} ({pct}%)
                </span>
              </>
            )}
            {rawStatus === "pending" && (
              <span style={{ color: "var(--text-muted)" }}> · eingereiht</span>
            )}
            {rawStatus === "done" && (
              <span style={{ color: "var(--success)" }}> · fertig</span>
            )}
            {rawStatus === "completed_partial" && (
              <span style={{ color: "var(--warning)" }}> · teilweise fertig</span>
            )}
            {rawStatus === "failed" && (
              <span style={{ color: "var(--danger)" }}> · Fehler</span>
            )}
            {rawStatus === "cancelled" && (
              <span style={{ color: "var(--text-muted)" }}> · abgebrochen</span>
            )}
          </p>
          {detailLine && rawStatus === "processing" && (
            <p
              className="mt-1 text-[11px] truncate"
              style={{ color: "var(--text-secondary)" }}
            >
              {detailLine}
            </p>
          )}
          {doc.summary && rawStatus === "done" && !expanded && (
            <p
              className="mt-2 text-xs line-clamp-2"
              style={{ color: "var(--text-secondary)", lineHeight: 1.5 }}
            >
              {doc.summary}
            </p>
          )}
          {rawStatus === "failed" && doc.processing_error && (
            <p
              className="mt-1 text-xs"
              style={{ color: "var(--danger)" }}
            >
              {doc.processing_error}
            </p>
          )}
          {/* Audio: transcribe phase pill during processing */}
          {doc.source_format === "audio" && rawStatus === "processing" && labelRaw === "transcribe" && (
            <span
              className="mt-1 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded"
              style={{ background: "var(--bg-elevated)", color: "var(--accent)" }}
            >
              <Mic size={10} />
              Transkribieren…
            </span>
          )}
          {/* EML: attachment count badge + expand toggle */}
          {attachments.length > 0 && (
            <button
              onClick={() => setAttachmentsExpanded((v) => !v)}
              className="mt-1 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded transition-colors hover:bg-[var(--bg-elevated)]"
              style={{ color: "var(--text-muted)" }}
            >
              <Mail size={10} />
              +{attachments.length} Anhang{attachments.length !== 1 ? "hänge" : ""}
              <ChevronDown
                size={10}
                style={{
                  transform: attachmentsExpanded ? "rotate(180deg)" : "none",
                  transition: "transform 180ms ease",
                }}
              />
            </button>
          )}
          {rawStatus === "completed_partial" && (
            <span
              data-testid="embedding-failed-pill"
              className="mt-1 inline-block text-[10px] px-1.5 py-0.5 rounded"
              style={{
                background: "color-mix(in srgb, var(--warning) 15%, transparent)",
                color: "var(--warning)",
                border: "1px solid color-mix(in srgb, var(--warning) 40%, transparent)",
              }}
            >
              Embedding fehlgeschlagen — Volltext-Suche eingeschränkt
            </span>
          )}

          {/* 4-phase chip row */}
          <PhaseChipRow
            status={rawStatus}
            activeIdx={activePhaseIdx}
          />

          {/* Action buttons row */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {canRetry && (
              <button
                type="button"
                onClick={() => retry.mutate()}
                disabled={retry.isPending}
                data-testid="doc-retry"
                className="text-[11px] px-2 py-0.5 rounded transition-default disabled:opacity-50 flex items-center gap-1"
                style={{
                  border: "1px solid var(--border)",
                  color: "var(--text-secondary)",
                  background: "var(--bg-elevated)",
                }}
              >
                <RefreshCw size={11} />
                Erneut versuchen
              </button>
            )}
            {canCancel && (
              <button
                type="button"
                onClick={() => cancel.mutate()}
                disabled={cancel.isPending}
                data-testid="doc-cancel"
                className="text-[11px] px-2 py-0.5 rounded transition-default disabled:opacity-50 flex items-center gap-1"
                style={{
                  border: "1px solid var(--border)",
                  color: "var(--text-secondary)",
                  background: "var(--bg-elevated)",
                }}
              >
                <Ban size={11} />
                Abbrechen
              </button>
            )}
            <button
              type="button"
              onClick={() => setDetailsOpen((v) => !v)}
              aria-expanded={detailsOpen}
              data-testid="doc-details-toggle"
              className="text-[11px] px-2 py-0.5 rounded transition-default flex items-center gap-1"
              style={{
                border: "1px solid var(--border)",
                color: "var(--text-muted)",
                background: "transparent",
              }}
            >
              <ChevronDown
                size={11}
                style={{
                  transform: detailsOpen ? "rotate(180deg)" : "none",
                  transition: "transform 180ms ease",
                }}
              />
              Details
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "Zusammenfassung einklappen" : "Zusammenfassung"}
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
          {/* Kebab menu — top-right corner, separate from error/retry area */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              aria-label="Weitere Aktionen"
              data-testid="doc-kebab"
              onClick={() => setMenuOpen((v) => !v)}
              className="p-1.5 rounded hover:bg-[var(--bg-elevated)] transition-default"
              style={{ color: "var(--text-muted)" }}
            >
              <MoreVertical size={13} />
            </button>
            {menuOpen && (
              <div
                className="absolute right-0 top-full mt-1 z-20 rounded-lg shadow-lg py-1 min-w-[140px]"
                style={{ background: "var(--bg-panel)", border: "1px solid var(--border)" }}
                onMouseLeave={() => setMenuOpen(false)}
              >
                {doc.archived_at ? (
                  <button
                    type="button"
                    className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-[var(--bg-elevated)] transition-default"
                    style={{ color: "var(--text-secondary)" }}
                    onClick={() => {
                      setMenuOpen(false);
                      if (onRestore) onRestore(doc);
                    }}
                  >
                    Wiederherstellen
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-[var(--bg-elevated)] transition-default"
                      style={{ color: "var(--text-secondary)" }}
                      disabled={replacing}
                      onClick={() => {
                        setMenuOpen(false);
                        replaceInputRef.current?.click();
                      }}
                    >
                      {replacing ? "Wird ersetzt…" : "Ersetzen…"}
                    </button>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-[var(--bg-elevated)] transition-default"
                      style={{ color: "var(--danger)" }}
                      onClick={() => {
                        setMenuOpen(false);
                        onDelete(doc);
                      }}
                    >
                      Löschen…
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          {/* Hidden file input for replace flow */}
          <input
            ref={replaceInputRef}
            type="file"
            className="sr-only"
            aria-hidden="true"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              e.target.value = "";
              setReplacing(true);
              try {
                const diff = await replaceDocumentDryRun(projectId, doc.id, file);
                setPendingReplaceFile(file);
                setDiffPreview(diff);
              } catch {
                toast.error("Vorschau fehlgeschlagen");
              } finally {
                setReplacing(false);
              }
            }}
          />
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
            <div>
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
        </section>
      )}

      {/* Live extraction feed */}
      {(liveExpanded || rawStatus === "failed") && liveItems && liveItems.length > 0 && (
        <LiveFeed items={liveItems} documentId={doc.id} />
      )}

      {detailsOpen && (
        <section
          className="px-4 pb-3 pt-2 border-t"
          style={{ borderColor: "var(--border)" }}
        >
          <h4
            className="text-[10px] font-semibold uppercase tracking-widest mb-1.5"
            style={{ color: "var(--text-muted)" }}
          >
            Pipeline
          </h4>
          <ol className="space-y-1" data-testid="doc-pipeline-log">
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
      {diffPreview && pendingReplaceFile && (
        <DiffPreviewModal
          diff={diffPreview}
          onCancel={() => {
            setDiffPreview(null);
            setPendingReplaceFile(null);
          }}
          onConfirm={async () => {
            const file = pendingReplaceFile;
            setDiffPreview(null);
            setPendingReplaceFile(null);
            setReplacing(true);
            try {
              await replaceDocument(projectId, doc.id, file);
              qc.invalidateQueries({ queryKey: ["projects", projectId, "documents"] });
              qc.invalidateQueries({ queryKey: ["projects", projectId, "state"] });
              toast.success("Dokument ersetzt");
            } catch {
              toast.error("Ersetzen fehlgeschlagen");
            } finally {
              setReplacing(false);
            }
          }}
        />
      )}
      {attachmentsExpanded && attachments.length > 0 && (
        <div className="ml-6 mt-1 space-y-1 border-l-2 pl-3" style={{ borderColor: "var(--border)" }}>
          {attachments.map((child) => (
            <DocumentCard
              key={child.id}
              doc={child}
              projectId={projectId}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </>
  );
}

function PhaseChipRow({
  status,
  activeIdx,
}: {
  status: WideStatus;
  activeIdx: number;
}) {
  return (
    <div
      className="mt-2 flex items-center gap-1"
      role="list"
      data-testid="doc-phase-row"
    >
      {PHASE_ORDER.map((p: PipelinePhase, idx) => {
        const isDone =
          status === "done" ||
          idx < activeIdx ||
          (status === "processing" && idx < activeIdx);
        const isActiveChip =
          (status === "processing" || status === "pending") && idx === activeIdx;
        const isFailed = status === "failed" && idx === activeIdx;
        let color = "var(--text-muted)";
        let bg = "transparent";
        let border = "var(--border)";
        if (isFailed) {
          color = "var(--danger)";
          border = "color-mix(in srgb, var(--danger) 50%, var(--border))";
        } else if (isActiveChip) {
          color = "var(--accent)";
          bg = "var(--accent-subtle)";
          border = "var(--accent)";
        } else if (isDone) {
          color = "var(--text-secondary)";
        }
        return (
          <span
            key={p}
            role="listitem"
            data-phase={p}
            data-active={isActiveChip}
            data-done={isDone}
            className="text-[10px] px-1.5 py-0.5 rounded"
            style={{
              border: `1px solid ${border}`,
              color,
              background: bg,
              opacity: !isActiveChip && !isDone && status !== "failed" ? 0.55 : 1,
            }}
          >
            {PIPELINE_PHASE_LABELS[p]}
          </span>
        );
      })}
    </div>
  );
}

const ITEM_ICONS: Record<ExtractedItemType, typeof User> = {
  contact: User,
  task: CheckSquare,
  deadline: Calendar,
  decision: Scale,
  blocker: AlertOctagon,
  dynamic_item: LayoutList,
};

function confidenceDotColor(c: ExtractedItem["confidence"]): string | null {
  if (c === "medium") return "var(--warning)";
  if (c === "low") return "#FB923C"; // orange
  return null;
}

function truncateMid(text: string, max = 56): string {
  if (text.length <= max) return text;
  const half = Math.floor((max - 1) / 2);
  return `${text.slice(0, half)}…${text.slice(text.length - half)}`;
}

function handleLiveItemClick(item: ExtractedItem) {
  if (typeof document === "undefined") return;
  const el = document.getElementById(`${item.type}-${item.itemId}`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("flash");
  setTimeout(() => el.classList.remove("flash"), 500);
}

function LiveFeed({
  items,
  documentId,
}: {
  items: ExtractedItem[];
  documentId: string;
}) {
  const shortDocId = documentId.slice(0, 8);
  return (
    <section
      className="px-4 pb-3 pt-2 border-t"
      data-testid="live-feed"
      style={{ borderColor: "var(--border)" }}
    >
      <h4
        className="text-[10px] font-semibold uppercase tracking-widest mb-1.5"
        style={{ color: "var(--text-muted)" }}
      >
        Live extrahiert
      </h4>
      <ul className="flex flex-col gap-1">
        {items.map((item, idx) => {
          const Icon = ITEM_ICONS[item.type] ?? LayoutList;
          const dotColor = confidenceDotColor(item.confidence);
          const tooltip = `Quelle: ${shortDocId} · Confidence: ${item.confidence}`;
          return (
            <li
              key={`${item.itemId}-${idx}`}
              data-testid="live-item"
              data-item-type={item.type}
              data-item-id={item.itemId}
              data-confidence={item.confidence}
              className="upload-fade-up"
            >
              <button
                type="button"
                onClick={() => handleLiveItemClick(item)}
                title={tooltip}
                className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[11px] transition-default hover:bg-[var(--bg-elevated)]"
                style={{
                  border: "1px solid var(--border)",
                  background: "var(--bg-base)",
                  color: "var(--text-secondary)",
                }}
              >
                <Icon size={12} style={{ color: "var(--accent)" }} />
                <span className="flex-1 truncate" title={item.title}>
                  {truncateMid(item.title)}
                </span>
                {dotColor && (
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full shrink-0"
                    style={{ background: dotColor }}
                    aria-label={`Confidence: ${item.confidence}`}
                  />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
