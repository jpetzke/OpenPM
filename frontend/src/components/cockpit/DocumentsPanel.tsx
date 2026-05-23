"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FileText,
  Plus,
  X,
  Loader2,
  AlertCircle,
  Trash2,
  UploadCloud,
  MoreVertical,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { toast } from "sonner";
import {
  api,
  restoreDocument,
  replaceDocument,
  replaceDocumentDryRun,
  type DiffPreview,
} from "@/lib/api";
import { usePipelineStore } from "@/store/pipelineStore";
import { DropZone } from "@/components/upload/DropZone";
import { TextPasteModal } from "@/components/upload/TextPasteModal";
import { DiffPreviewModal } from "@/components/upload/DiffPreviewModal";
import { startUploadWithFlow } from "@/lib/uploadFlow";
import { formatRelativeTime } from "@/lib/utils";
import type { Document, DocumentStatus } from "@/types/document";

interface Props {
  projectId: string;
}

const UNDO_MS = 30_000;

function StatusIcon({ status }: { status: DocumentStatus }) {
  if (status === "processing" || status === "pending") {
    return (
      <Loader2
        size={12}
        className="animate-spin shrink-0"
        style={{ color: "var(--accent)" }}
      />
    );
  }
  if (status === "failed") {
    return (
      <AlertCircle
        size={12}
        className="shrink-0"
        style={{ color: "var(--danger)" }}
      />
    );
  }
  return (
    <FileText
      size={12}
      className="shrink-0"
      style={{ color: "var(--text-muted)" }}
    />
  );
}

export function DocumentsPanel({ projectId }: Props) {
  const qc = useQueryClient();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [pasteModalOpen, setPasteModalOpen] = useState(false);
  const pendingDeletes = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  // Direkt-Drop auf das Panel (ohne erst den "+"-Toggle zu klicken).
  // dragDepth-Counter gegen Flicker beim Überfahren von Kind-Elementen.
  const dragDepthRef = useRef(0);
  const [dragging, setDragging] = useState(false);

  const handleDirectDrop = useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) return;
      for (const file of list) {
        startUploadWithFlow(file, {
          projectId,
          qc,
          onOpenTextPaste: () => setPasteModalOpen(true),
          onSuccess: () => {
            toast.success(`${file.name} hochgeladen`);
          },
        });
      }
    },
    [projectId, qc],
  );

  const onDragEnter = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer?.types?.includes("Files")) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    if (dragDepthRef.current === 1) setDragging(true);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer?.types?.includes("Files")) return;
    e.preventDefault();
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragging(false);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      dragDepthRef.current = 0;
      setDragging(false);
      if (e.dataTransfer?.files?.length) {
        handleDirectDrop(e.dataTransfer.files);
      }
    },
    [handleDirectDrop],
  );

  // Auto-open upload zone when redirected from /upload (hash #docs).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash === "#docs") {
      setUploadOpen(true);
    }
  }, []);

  const { data: documents, isLoading } = useQuery<Document[]>({
    queryKey: ["projects", projectId, "documents"],
    queryFn: () => api.get<Document[]>(`/api/projects/${projectId}/documents`),
  });

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
              // Ignore if already deleted
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

  const liveCounts = usePipelineStore(
    useShallow((s) => {
      let processing = 0;
      for (const docId of Object.keys(s.docProject)) {
        if (s.docProject[docId] !== projectId) continue;
        if (s.pipelines[docId] === "processing") processing += 1;
      }
      return { processing };
    }),
  );

  const total = documents?.length ?? 0;
  const sorted = (documents ?? [])
    .slice()
    .sort(
      (a, b) =>
        new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime(),
    );

  return (
    <section
      className="rounded-lg p-3.5 relative transition-default"
      style={{
        background: "var(--bg-base)",
        border: `1px solid ${dragging ? "var(--accent)" : "var(--border)"}`,
        boxShadow: dragging
          ? "0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent)"
          : "none",
      }}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      aria-label="Dokumente — Datei zum Hochladen hier ablegen"
    >
      {dragging && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center rounded-lg pointer-events-none"
          style={{
            background: "color-mix(in srgb, var(--accent-subtle) 92%, transparent)",
            border: "2px dashed var(--accent)",
          }}
        >
          <div className="flex flex-col items-center gap-2">
            <UploadCloud size={28} style={{ color: "var(--accent)" }} />
            <p
              className="text-sm font-medium"
              style={{ color: "var(--accent)" }}
            >
              Hier ablegen…
            </p>
          </div>
        </div>
      )}
      <header className="flex items-center justify-between mb-2.5">
        <span
          className="text-xs uppercase tracking-wide"
          style={{ color: "var(--text-muted)", fontWeight: 500 }}
        >
          Dokumente · {total}
        </span>
        <button
          type="button"
          aria-label={uploadOpen ? "Upload schließen" : "Upload öffnen"}
          onClick={() => setUploadOpen((o) => !o)}
          className="rounded transition-default flex items-center justify-center"
          style={{
            width: 22,
            height: 22,
            color: uploadOpen ? "var(--accent)" : "var(--text-muted)",
            border: "1px solid var(--border)",
            background: uploadOpen ? "var(--accent-subtle)" : "transparent",
          }}
        >
          {uploadOpen ? <X size={12} /> : <Plus size={12} />}
        </button>
      </header>

      {uploadOpen && (
        <div className="mb-3">
          <DropZone projectId={projectId} />
        </div>
      )}

      {isLoading ? (
        <div className="space-y-1.5">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-6 rounded animate-pulse"
              style={{ background: "var(--bg-elevated)" }}
            />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <p
          className="text-xs italic text-center py-4"
          style={{ color: "var(--text-muted)" }}
        >
          Noch keine Dokumente.
        </p>
      ) : (
        <ul className="flex flex-col gap-0.5" data-testid="documents-list">
          {sorted.map((doc) => (
            <DocumentRow
              key={doc.id}
              doc={doc}
              projectId={projectId}
              onDelete={() => requestDelete(doc)}
            />
          ))}
        </ul>
      )}

      {liveCounts.processing > 0 && (
        <div className="upload-bar mt-2" aria-label="Verarbeitung läuft">
          <div className="progress" />
        </div>
      )}

      {pasteModalOpen && (
        <TextPasteModal
          projectId={projectId}
          onClose={() => setPasteModalOpen(false)}
        />
      )}
    </section>
  );
}

function DocumentRow({
  doc,
  projectId,
  onDelete,
}: {
  doc: Document;
  projectId: string;
  onDelete: () => void;
}) {
  const qc = useQueryClient();
  const livePipeline = usePipelineStore((s) => s.pipelines[doc.id]);
  const status: DocumentStatus = livePipeline ?? doc.processing_status;
  const [hover, setHover] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [diff, setDiff] = useState<DiffPreview | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [replacing, setReplacing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handle(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [menuOpen]);

  return (
    <li
      data-testid="document-row"
      data-status={status}
      className="flex flex-col gap-1 px-1.5 py-1.5 rounded text-[13px] transition-default cursor-default"
      style={{
        color: "var(--text-secondary)",
        background: hover ? "var(--bg-elevated)" : "transparent",
      }}
      title={doc.original_filename}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="flex items-center gap-2">
        <StatusIcon status={status} />
        <span className="flex-1 truncate min-w-0">{doc.original_filename}</span>
        {hover || menuOpen ? (
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              aria-label="Dokument löschen"
              onClick={onDelete}
              className="p-1 rounded transition-default"
              style={{ color: "var(--text-muted)" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = "var(--danger)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)";
              }}
            >
              <Trash2 size={12} />
            </button>
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                aria-label="Weitere Aktionen"
                data-testid="doc-kebab"
                onClick={() => setMenuOpen((v) => !v)}
                className="p-1 rounded transition-default"
                style={{ color: "var(--text-muted)" }}
              >
                <MoreVertical size={12} />
              </button>
              {menuOpen && (
                <div
                  className="absolute right-0 top-full mt-1 z-20 rounded-lg shadow-lg py-1 min-w-[140px]"
                  style={{ background: "var(--bg-panel, var(--bg-surface))", border: "1px solid var(--border)" }}
                >
                  <button
                    type="button"
                    className="w-full text-left px-3 py-1.5 text-[12px] transition-default hover:bg-[var(--bg-elevated)]"
                    style={{ color: "var(--text-secondary)" }}
                    disabled={replacing}
                    onClick={() => {
                      setMenuOpen(false);
                      fileRef.current?.click();
                    }}
                  >
                    {replacing ? "Wird ersetzt…" : "Ersetzen…"}
                  </button>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-1.5 text-[12px] transition-default hover:bg-[var(--bg-elevated)]"
                    style={{ color: "var(--danger)" }}
                    onClick={() => {
                      setMenuOpen(false);
                      onDelete();
                    }}
                  >
                    Löschen…
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <span
            className="text-[11px] shrink-0 tabular-nums"
            style={{ color: "var(--text-muted)" }}
          >
            {formatRelativeTime(doc.uploaded_at)}
          </span>
        )}
      </div>
      {status === "failed" && doc.processing_error && (
        <p
          className="text-[11px] pl-5"
          style={{ color: "var(--danger)" }}
        >
          {doc.processing_error}
        </p>
      )}
      {status === "completed_partial" && (
        <span
          data-testid="embedding-failed-pill"
          className="self-start text-[10px] px-1.5 py-0.5 rounded ml-5"
          style={{
            background: "color-mix(in srgb, var(--warning) 15%, transparent)",
            color: "var(--warning)",
            border: "1px solid color-mix(in srgb, var(--warning) 40%, transparent)",
          }}
        >
          Embedding fehlgeschlagen — Volltext-Suche eingeschränkt
        </span>
      )}
      <input
        ref={fileRef}
        type="file"
        className="sr-only"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setReplacing(true);
          try {
            const preview = await replaceDocumentDryRun(projectId, doc.id, f);
            setPendingFile(f);
            setDiff(preview);
          } catch {
            toast.error("Vorschau fehlgeschlagen");
          } finally {
            setReplacing(false);
          }
        }}
      />
      {diff && pendingFile && (
        <DiffPreviewModal
          diff={diff}
          onCancel={() => {
            setDiff(null);
            setPendingFile(null);
          }}
          onConfirm={async () => {
            const file = pendingFile;
            setDiff(null);
            setPendingFile(null);
            if (!file) return;
            try {
              await replaceDocument(projectId, doc.id, file);
              toast.success("Dokument ersetzt");
              qc.invalidateQueries({ queryKey: ["projects", projectId, "documents"] });
              qc.invalidateQueries({ queryKey: ["projects", projectId, "state"] });
            } catch {
              toast.error("Ersetzen fehlgeschlagen");
            }
          }}
        />
      )}
    </li>
  );
}
