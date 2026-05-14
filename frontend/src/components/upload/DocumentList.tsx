"use client";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Clock, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { usePipelineStore } from "@/store/pipelineStore";
import { formatDate, formatBytes, formatRelativeTime } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Document, DocumentStatus, PipelineLogEntry } from "@/types/document";

interface DocumentListProps {
  projectId: string;
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
    <div className="mt-2 space-y-1" aria-live="polite">
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
  const mergedLogs = useMemo(() => {
    const persisted = document?.pipeline_logs ?? [];
    const ephemeral = liveDetail?.logs ?? [];
    const all = [...persisted, ...ephemeral];
    return all.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [document?.pipeline_logs, liveDetail?.logs]);

  if (!document) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[min(92vh,58rem)] w-[min(96vw,92rem)] max-w-[92rem] p-0 overflow-hidden" showCloseButton>
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
                  {liveDetail?.label ?? document.pipeline_step_label ?? "Noch keine Aktivität"}
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

          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden xl:grid-cols-[minmax(0,1.25fr)_minmax(22rem,0.95fr)]">
            <ScrollArea className="min-h-0 min-w-0 xl:border-r" style={{ borderColor: "var(--border)" }}>
              <div className="space-y-6 px-6 py-5">
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
            </ScrollArea>

            <div className="min-h-0 min-w-0 border-t xl:border-t-0" style={{ borderColor: "var(--border)" }}>
              <div className="shrink-0 px-6 py-5">
                <p className="text-xs uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Logs</p>
              </div>
              <ScrollArea className="h-[min(42rem,calc(92vh-13rem))] min-h-0 min-w-0 xl:h-full">
                <div className="space-y-3 px-6 pb-6">
                  {mergedLogs.length === 0 ? (
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>Noch keine Logs.</p>
                  ) : (
                    mergedLogs.map((entry, index) => (
                      <div key={`${entry.timestamp}-${index}`} className="rounded-xl p-4" style={{ background: "var(--bg-elevated)" }}>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm" style={{ color: "var(--text-primary)" }}>{entry.label}</p>
                          <span className="text-[10px] uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                            {entry.status}
                          </span>
                        </div>
                        {entry.detail && (
                          <p className="mt-1 text-xs leading-5" style={{ color: "var(--text-secondary)" }}>{entry.detail}</p>
                        )}
                        <p className="text-[11px] mt-2" style={{ color: "var(--text-muted)" }}>
                          Step {entry.step ?? "-"} / {entry.total} · {formatRelativeTime(entry.timestamp)}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
