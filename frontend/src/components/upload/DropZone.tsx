"use client";
import { useCallback, useRef, useState } from "react";
import { UploadCloud, X, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  uploadFile,
  type UploadHandle,
  isDuplicateError,
  isUnsupportedError,
} from "@/lib/upload";
import { TextPasteModal } from "./TextPasteModal";
import { formatBytes } from "@/lib/utils";

interface DropZoneProps {
  projectId: string;
}

const MAX_SIZE = 50 * 1024 * 1024;
const ALLOWED_HINT = "PDF · DOCX · XLSX · CSV · TXT · MD";

type ItemStatus = "uploading" | "done" | "error" | "cancelled";

interface UploadItem {
  id: string;
  file: File;
  progress: number;
  status: ItemStatus;
  error?: string;
  handle?: UploadHandle<unknown>;
}

function shortError(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object" && "code" in detail) {
    const code = (detail as { code?: string }).code;
    if (code === "file_too_large") return "Datei zu groß";
    if (code === "unsupported_media_type") return "Format nicht unterstützt";
    if (code === "no_active_llm_provider") return "Kein aktiver LLM-Provider";
  }
  return "Upload fehlgeschlagen";
}

export function DropZone({ projectId }: DropZoneProps) {
  const qc = useQueryClient();
  // Use an enter-counter, not a boolean: dragenter/dragleave fire on EVERY
  // child node, so a single boolean flickers between purple and reset as the
  // pointer crosses inner elements.
  const dragDepthRef = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [pasteModalOpen, setPasteModalOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const startUpload = useCallback(
    (file: File, opts: { allowDuplicate?: boolean } = {}) => {
      if (file.size > MAX_SIZE) {
        toast.error(`${file.name}: zu groß (max. 50 MB)`);
        return;
      }
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const handle = uploadFile<unknown>(
        `/api/projects/${projectId}/documents`,
        file,
        {
          allowDuplicate: opts.allowDuplicate,
          onProgress: (loaded, total) => {
            const pct = total > 0 ? loaded / total : 0;
            setItems((prev) =>
              prev.map((it) => (it.id === id ? { ...it, progress: pct } : it)),
            );
          },
        },
      );
      setItems((prev) => [
        ...prev,
        { id, file, progress: 0, status: "uploading", handle },
      ]);
      handle.promise
        .then(() => {
          setItems((prev) =>
            prev.map((it) =>
              it.id === id ? { ...it, status: "done", progress: 1 } : it,
            ),
          );
          qc.invalidateQueries({ queryKey: ["projects", projectId, "documents"] });
          setTimeout(() => {
            setItems((prev) => prev.filter((it) => it.id !== id));
          }, 1200);
        })
        .catch((err: unknown) => {
          // 409 duplicate — ask, then retry with allow_duplicate=true.
          if (isDuplicateError(err)) {
            setItems((prev) => prev.filter((it) => it.id !== id));
            const ok = window.confirm(
              `Diese Datei existiert schon als „${err.existingFilename}“. Trotzdem hochladen?`,
            );
            if (ok) startUpload(file, { allowDuplicate: true });
            return;
          }
          // 415 unsupported — toast + offer paste fallback.
          if (isUnsupportedError(err)) {
            const allowed = err.allowed.length
              ? err.allowed.join(" · ")
              : "PDF · DOCX · XLSX · CSV · TXT · MD";
            setItems((prev) =>
              prev.map((it) =>
                it.id === id
                  ? { ...it, status: "error", error: "Format nicht unterstützt" }
                  : it,
              ),
            );
            toast.error(`${file.name}: Format nicht unterstützt`, {
              description: `Erlaubt: ${allowed}`,
              action: {
                label: "Als Text einfügen?",
                onClick: () => setPasteModalOpen(true),
              },
            });
            return;
          }
          const msg = shortError((err as { detail?: unknown })?.detail ?? err);
          setItems((prev) =>
            prev.map((it) =>
              it.id === id ? { ...it, status: "error", error: msg } : it,
            ),
          );
          toast.error(`${file.name}: ${msg}`);
        });
    },
    [projectId, qc],
  );

  const handleFiles = (files: FileList | File[]) => {
    Array.from(files).forEach((f) => startUpload(f));
  };

  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepthRef.current += 1;
    if (dragDepthRef.current === 1) setDragging(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepthRef.current = 0;
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) handleFiles(e.target.files);
    e.target.value = "";
  };

  const cancelItem = (id: string) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        it.handle?.cancel();
        return { ...it, status: "cancelled" };
      }),
    );
  };

  const removeItem = (id: string) =>
    setItems((prev) => prev.filter((it) => it.id !== id));

  return (
    <div className="space-y-3">
      <div
        onDragEnter={onDragEnter}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        role="button"
        tabIndex={0}
        aria-label="Dokumente hochladen"
        className="relative cursor-pointer rounded-[var(--radius)] border-2 border-dashed px-8 py-12 text-center overflow-hidden transition-default focus-visible:outline-none"
        style={{
          borderColor: dragging ? "var(--accent)" : "var(--border-strong)",
          background: dragging ? "var(--accent-subtle)" : "var(--bg-surface)",
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.txt,.md,.markdown,.csv,.docx,.doc,.xlsx,.xls,.rtf,.json,.html,.htm,.log"
          onChange={onPick}
          className="sr-only"
        />
        {dragging && (
          <div className="absolute inset-0 pointer-events-none upload-shimmer" />
        )}
        <UploadCloud
          size={22}
          className="mx-auto mb-3"
          style={{
            color: dragging ? "var(--accent)" : "var(--text-muted)",
          }}
        />
        <p
          className="text-sm font-medium"
          style={{ color: "var(--text-primary)" }}
        >
          {dragging ? "Loslassen zum Hochladen" : "Dateien hierher ziehen"}
        </p>
        <p
          className="text-xs mt-1"
          style={{ color: "var(--text-muted)" }}
        >
          {ALLOWED_HINT} · bis 50 MB
        </p>
      </div>

      {pasteModalOpen && (
        <TextPasteModal
          projectId={projectId}
          onClose={() => setPasteModalOpen(false)}
        />
      )}

      {items.length > 0 && (
        <ul className="space-y-1">
          {items.map((it) => (
            <li
              key={it.id}
              className="rounded-[var(--radius)] border px-3 py-2 flex items-center gap-3 upload-fade-up"
              style={{
                borderColor: "var(--border)",
                background: "var(--bg-surface)",
              }}
            >
              <span
                className="text-[11px] font-mono shrink-0 min-w-[40px] tabular-nums"
                style={{ color: "var(--text-muted)" }}
              >
                {it.status === "uploading"
                  ? `${Math.round(it.progress * 100)}%`
                  : it.status === "done"
                    ? "100%"
                    : it.status === "error"
                      ? "Fehler"
                      : "Abbr."}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 min-w-0">
                  <span
                    className="text-sm truncate"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {it.file.name}
                  </span>
                  <span
                    className="text-[11px] shrink-0"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {formatBytes(it.file.size)}
                  </span>
                </div>
                {it.status === "uploading" && (
                  <div
                    className="mt-1.5 h-[2px] w-full overflow-hidden rounded-full"
                    style={{ background: "var(--bg-elevated)" }}
                  >
                    <div
                      className="h-full transition-[width] duration-200"
                      style={{
                        width: `${Math.round(it.progress * 100)}%`,
                        background: "var(--accent)",
                      }}
                    />
                  </div>
                )}
                {it.status === "error" && (
                  <p
                    className="mt-1 text-[12px]"
                    style={{ color: "var(--danger)" }}
                  >
                    {it.error}
                  </p>
                )}
              </div>
              {it.status === "uploading" ? (
                <button
                  type="button"
                  aria-label="Upload abbrechen"
                  onClick={() => cancelItem(it.id)}
                  className="p-1 rounded transition-default"
                  style={{ color: "var(--text-muted)" }}
                >
                  <X size={14} />
                </button>
              ) : it.status === "done" ? (
                <CheckCircle2 size={14} style={{ color: "var(--success)" }} />
              ) : it.status === "error" ? (
                <button
                  type="button"
                  aria-label="Eintrag entfernen"
                  onClick={() => removeItem(it.id)}
                  className="p-1 rounded transition-default"
                  style={{ color: "var(--text-muted)" }}
                >
                  <X size={14} />
                </button>
              ) : (
                <AlertCircle size={14} style={{ color: "var(--text-muted)" }} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
