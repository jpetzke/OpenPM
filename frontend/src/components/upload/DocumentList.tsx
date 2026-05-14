"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Clock, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { usePipelineStore } from "@/store/pipelineStore";
import { formatDate, formatBytes, formatRelativeTime } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BatchTimerBar } from "@/components/upload/BatchTimerBar";
import type { Document, DocumentStatus, PipelineLogEntry } from "@/types/document";

interface DocumentListProps {
  projectId: string;
}

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

const PIPELINE_STATUS_LABELS: Record<PipelineLogEntry["status"], string> = {
  running: "Laeuft",
  done: "Fertig",
  failed: "Fehler",
  info: "Info",
};

function formatPipelineLabel(label: string | null | undefined): string {
  if (!label) return "Noch keine Aktivitaet";
  return PIPELINE_LABELS[label] ?? label.replaceAll("_", " ");
}

function pipelineStatusColor(status: PipelineLogEntry["status"] | string | null | undefined): string {
  if (status === "done") return "var(--success)";
  if (status === "failed") return "var(--danger)";
  if (status === "running") return "var(--accent)";
  return "var(--text-muted)";
}

function StatusIcon({ status }: { status: DocumentStatus }) {
  if (status === "done") return <CheckCircle2 size={14} style={{ color: "var(--success)" }} />;
  if (status === "failed") return <XCircle size={14} style={{ color: "var(--danger)" }} />;
  if (status === "processing") return <Loader2 size={14} className="animate-spin" style={{ color: "var(--accent)" }} />;
  return <Clock size={14} style={{ color: "var(--text-muted)" }} />;
}

export function DocumentList({ projectId }: DocumentListProps) {
  const qc = useQueryClient();
  const pipelines = usePipelineStore((s) => s.pipelines);
  const details = usePipelineStore((s) => s.details);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

  const { data: documents, isLoading } = useQuery<Document[]>({
    queryKey: ["projects", projectId, "documents"],
    queryFn: () => api.get<Document[]>(`/api/projects/${projectId}/documents`),
    refetchInterval: 10_000,
  });

  const pendingDocs = (documents ?? []).filter(
    (d) => (pipelines[d.id] ?? d.processing_status) === "pending"
  );

  const retryMutation = useMutation({
    mutationFn: (docId: string) =>
      api.post<Document>(`/api/projects/${projectId}/documents/${docId}/reprocess`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects", projectId, "documents"] }),
    onError: () => toast.error("Reprocess fehlgeschlagen"),
  });

  const deleteMutation = useMutation({
    mutationFn: (docId: string) =>
      api.delete(`/api/projects/${projectId}/documents/${docId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects", projectId, "documents"] });
      toast.success("Dokument gelöscht");
    },
    onError: () => toast.error("Löschen fehlgeschlagen"),
  });

  if (isLoading) {
    return (
      <div className="space-y-2 mt-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-10 rounded animate-pulse" style={{ background: "var(--bg-elevated)" }} />
        ))}
      </div>
    );
  }

  if (!documents?.length) {
    return (
      <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
        Noch keine Dokumente hochgeladen.
      </p>
    );
  }

  return (
    <div className="mt-2" aria-live="polite">
      <BatchTimerBar
        projectId={projectId}
        pendingDocs={pendingDocs}
        onTriggered={() => qc.invalidateQueries({ queryKey: ["projects", projectId, "documents"] })}
      />
      <div className="space-y-1">
      {documents.map((doc) => {
        const liveStatus: DocumentStatus = pipelines[doc.id] ?? doc.processing_status;
        const liveDetail = details[doc.id];
        return (
          <div
            key={doc.id}
            className="group flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer"
            style={{ background: "var(--bg-surface)" }}
            onClick={() => setSelectedDocId(doc.id)}
          >
            <StatusIcon status={liveStatus} />
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate" style={{ color: "var(--text-primary)" }}>
                {doc.original_filename}
              </p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                {formatDate(doc.uploaded_at)} · {formatBytes(doc.file_size)}
                {liveStatus === "processing" && " · Wird verarbeitet…"}
                {liveStatus === "pending" && " · Warteschlange"}
                {liveStatus === "failed" && doc.processing_error && ` · ${doc.processing_error}`}
              </p>
              {liveDetail?.detail && (
                <p className="text-[11px] mt-1 truncate" style={{ color: "var(--text-muted)" }}>
                  {liveDetail.detail}
                </p>
              )}
            </div>
            {liveStatus === "failed" && (
              <button
                onClick={(e) => { e.stopPropagation(); retryMutation.mutate(doc.id); }}
                disabled={retryMutation.isPending}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded transition-default disabled:opacity-50"
                style={{ color: "var(--accent)" }}
              >
                <RefreshCw size={12} />
                Wiederholen
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(doc.id); }}
              disabled={deleteMutation.isPending}
              className="p-1 rounded transition-default opacity-0 group-hover:opacity-100 disabled:opacity-50"
              style={{ color: "var(--text-muted)" }}
              aria-label="Dokument löschen"
            >
              <Trash2 size={14} />
            </button>
          </div>
        );
      })}
      </div>
      <DocumentDetailDialog
        document={documents.find((doc) => doc.id === selectedDocId) ?? null}
        liveDetail={selectedDocId ? details[selectedDocId] : undefined}
        open={selectedDocId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedDocId(null);
        }}
      />
    </div>
  );
}

function DocumentDetailDialog({
  document,
  liveDetail,
  open,
  onOpenChange,
}: {
  document: Document | null;
  liveDetail?: {
    step: number | null;
    total: number | null;
    label: string | null;
    status: string | null;
    detail: string | null;
    timestamp: string | null;
    logs: PipelineLogEntry[];
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const timelineEntries = useMemo(() => {
    const persisted = document?.pipeline_logs ?? [];
    const ephemeral = liveDetail?.logs ?? [];
    const merged = [...persisted, ...ephemeral].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    const seen = new Set<string>();

    return merged.filter((entry) => {
      const key = [entry.timestamp, entry.step ?? "", entry.total, entry.label, entry.status, entry.detail ?? ""].join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [document?.pipeline_logs, liveDetail?.logs]);
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [timelineEntries.length, open]);

  if (!document) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="h-[min(92vh,58rem)] w-[min(96vw,92rem)] max-w-[92rem] p-0 overflow-hidden sm:max-w-[min(96vw,92rem)]"
        showCloseButton
      >
        <div className="flex h-full min-h-0 flex-col" style={{ background: "var(--bg-surface)" }}>
          <DialogHeader className="shrink-0 px-6 pt-6">
            <DialogTitle>{document.original_filename}</DialogTitle>
            <DialogDescription>
              {document.processing_status} · {formatBytes(document.file_size)} · hochgeladen {formatRelativeTime(document.uploaded_at)}
            </DialogDescription>
          </DialogHeader>

          <div className="shrink-0 border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Pipeline</p>
                <p className="text-sm" style={{ color: "var(--text-primary)" }}>
                  {formatPipelineLabel(liveDetail?.label ?? document.pipeline_step_label)}
                </p>
                {(liveDetail?.detail ?? document.processing_error) && (
                  <p className="mt-1 text-xs break-words" style={{ color: "var(--text-muted)" }}>
                    {liveDetail?.detail ?? document.processing_error}
                  </p>
                )}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm" style={{ color: "var(--text-primary)" }}>
                  {liveDetail?.step ?? document.pipeline_step ?? 0}/{liveDetail?.total ?? 10}
                </p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {liveDetail?.timestamp
                    ? formatRelativeTime(liveDetail.timestamp)
                    : document.pipeline_updated_at
                      ? formatRelativeTime(document.pipeline_updated_at)
                      : "keine Updates"}
                </p>
              </div>
            </div>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1.25fr)_minmax(24rem,0.95fr)]">
            <div
              className="app-scrollable min-h-0 min-w-0 overflow-y-auto lg:border-r"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="space-y-6 px-6 py-5 pr-8">
                <section>
                  <p className="mb-2 text-xs uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Summary</p>
                  <div className="rounded-xl p-4" style={{ background: "var(--bg-elevated)" }}>
                    <p className="text-sm whitespace-pre-wrap leading-6" style={{ color: "var(--text-primary)" }}>
                      {document.summary || "Noch keine Summary verfügbar."}
                    </p>
                  </div>
                </section>

                <section className="min-h-0">
                  <p className="mb-2 text-xs uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Raw Text</p>
                  <div
                    className="rounded-xl p-4 text-xs whitespace-pre-wrap leading-6"
                    style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)" }}
                  >
                    {document.raw_content || "Noch kein extrahierter Text verfügbar."}
                  </div>
                </section>
              </div>
            </div>

            <div className="flex min-h-0 min-w-0 flex-col border-t lg:border-t-0" style={{ borderColor: "var(--border)" }}>
              <div className="shrink-0 px-6 py-5">
                <p className="text-xs uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Pipeline-Verlauf</p>
              </div>
              <div className="app-scrollable min-h-0 min-w-0 flex-1 overflow-y-auto">
                <div className="space-y-3 px-6 pb-10 pr-8">
                  {timelineEntries.length === 0 ? (
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>Noch keine Logs.</p>
                  ) : (
                    timelineEntries.map((entry) => (
                      <div
                        key={[entry.timestamp, entry.step ?? "", entry.label, entry.status, entry.detail ?? ""].join("|")}
                        className="rounded-xl border p-4 animate-in fade-in-0 zoom-in-95 duration-200"
                        style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm" style={{ color: "var(--text-primary)" }}>
                              {formatPipelineLabel(entry.label)}
                            </p>
                            <p className="mt-1 text-[11px] uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                              Schritt {entry.step ?? "-"} von {entry.total}
                            </p>
                          </div>
                          <span
                            className="rounded-full px-2.5 py-1 text-[10px] uppercase tracking-widest"
                            style={{
                              color: pipelineStatusColor(entry.status),
                              background: `${pipelineStatusColor(entry.status)}18`,
                            }}
                          >
                            {PIPELINE_STATUS_LABELS[entry.status]}
                          </span>
                        </div>
                        {entry.detail && (
                          <p className="mt-3 text-xs leading-5" style={{ color: "var(--text-secondary)" }}>
                            {entry.detail}
                          </p>
                        )}
                        <p className="text-[11px] mt-2" style={{ color: "var(--text-muted)" }}>
                          {formatRelativeTime(entry.timestamp)}
                        </p>
                      </div>
                    ))
                  )}
                  <div ref={scrollAnchorRef} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
