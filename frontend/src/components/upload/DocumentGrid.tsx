"use client";
import { useCallback, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, restoreDocument } from "@/lib/api";
import { DocumentCard } from "@/components/upload/DocumentCard";
import { usePipelineStore } from "@/store/pipelineStore";
import type { Document } from "@/types/document";

const UNDO_MS = 30_000;

interface DocumentGridProps {
  projectId: string;
}

export function DocumentGrid({ projectId }: DocumentGridProps) {
  const qc = useQueryClient();
  const hydrate = usePipelineStore((s) => s.hydrateProjectFromDocuments);
  const pendingDeletes = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const { data: documents, isLoading } = useQuery<Document[]>({
    queryKey: ["projects", projectId, "documents"],
    queryFn: () => api.get<Document[]>(`/api/projects/${projectId}/documents`),
  });

  useEffect(() => {
    if (documents && documents.length > 0) hydrate(projectId, documents);
  }, [documents, projectId, hydrate]);

  const deleteMutation = useMutation({
    mutationFn: (docId: string) =>
      api.delete(`/api/projects/${projectId}/documents/${docId}`),
    onError: () => toast.error("Löschen fehlgeschlagen"),
  });

  const requestDelete = useCallback(
    (doc: Document) => {
      const docId = doc.id;
      qc.setQueryData<Document[]>(
        ["projects", projectId, "documents"],
        (prev) => (prev ?? []).filter((d) => d.id !== docId),
      );

      let cancelled = false;
      toast(`${doc.original_filename} wird gelöscht…`, {
        duration: UNDO_MS,
        action: {
          label: "Rückgängig",
          onClick: async () => {
            cancelled = true;
            const t = pendingDeletes.current.get(docId);
            if (t) {
              clearTimeout(t);
              pendingDeletes.current.delete(docId);
            }
            try {
              await restoreDocument(projectId, docId);
            } catch {
              // already-deleted is fine — invalidate either way
            }
            qc.invalidateQueries({ queryKey: ["projects", projectId, "documents"] });
            qc.invalidateQueries({ queryKey: ["projects", projectId, "state"] });
          },
        },
      });
      const t = setTimeout(() => {
        if (cancelled) return;
        deleteMutation.mutate(docId, {
          onSuccess: () => toast.success("Dokument gelöscht"),
        });
        pendingDeletes.current.delete(docId);
      }, UNDO_MS);
      pendingDeletes.current.set(docId, t);
    },
    [projectId, qc, deleteMutation],
  );

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-[var(--radius)] h-16 animate-pulse border"
            style={{
              borderColor: "var(--border)",
              background: "var(--bg-surface)",
            }}
          />
        ))}
      </div>
    );
  }

  if (!documents?.length) {
    return (
      <div
        className="rounded-[var(--radius)] border py-10 px-6 text-center"
        style={{
          borderColor: "var(--border)",
          background: "var(--bg-surface)",
        }}
      >
        <p className="text-sm" style={{ color: "var(--text-primary)" }}>
          Noch keine Dokumente.
        </p>
        <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
          Zieh eine Datei in das Feld oben oder klicke darauf.
        </p>
      </div>
    );
  }

  const sorted = [...documents].sort(
    (a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime(),
  );

  // Build parent → children map for EML attachment grouping
  const childrenByParent = new Map<string, Document[]>();
  const childIds = new Set<string>();
  for (const doc of sorted) {
    if (doc.parent_document_id) {
      childIds.add(doc.id);
      const existing = childrenByParent.get(doc.parent_document_id) ?? [];
      existing.push(doc);
      childrenByParent.set(doc.parent_document_id, existing);
    }
  }
  // Top-level: documents that are not children of another doc
  const topLevel = sorted.filter((d) => !childIds.has(d.id));

  return (
    <div className="space-y-2">
      {topLevel.map((doc) => (
        <DocumentCard
          key={doc.id}
          doc={doc}
          projectId={projectId}
          onDelete={requestDelete}
          attachments={childrenByParent.get(doc.id) ?? []}
        />
      ))}
    </div>
  );
}
