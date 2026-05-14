"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Clock, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { usePipelineStore } from "@/store/pipelineStore";
import { formatDate, formatBytes } from "@/lib/utils";
import type { Document, DocumentStatus } from "@/types/document";

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
        return (
          <div
            key={doc.id}
            className="group flex items-center gap-3 px-3 py-2 rounded-md"
            style={{ background: "var(--bg-surface)" }}
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
            </div>
            {liveStatus === "failed" && (
              <button
                onClick={() => retryMutation.mutate(doc.id)}
                disabled={retryMutation.isPending}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded transition-default disabled:opacity-50"
                style={{ color: "var(--accent)" }}
              >
                <RefreshCw size={12} />
                Wiederholen
              </button>
            )}
            <button
              onClick={() => deleteMutation.mutate(doc.id)}
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
  );
}
