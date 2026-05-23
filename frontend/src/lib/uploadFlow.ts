"use client";

import { toast } from "sonner";
import type { QueryClient } from "@tanstack/react-query";
import {
  isDuplicateError,
  isUnsupportedError,
  uploadFile,
  type UploadHandle,
} from "@/lib/upload";

/**
 * High-level upload entrypoint with consistent UX for 409 (duplicate) and 415
 * (unsupported media type).
 *
 * Returns the underlying handle for the *initial* attempt so progress can be
 * wired up by the caller. On 409, a `window.confirm` is shown and a second
 * attempt is fired with `allow_duplicate=true`. On 415, a toast with the
 * allowed list and a "Als Text einfügen?" action is shown.
 *
 * TODO: replace `window.confirm` + sonner-action button with a custom modal.
 */
export interface UploadFlowOptions {
  projectId: string;
  qc?: QueryClient;
  onProgress?: (loaded: number, total: number) => void;
  /** Called when the user clicks "Als Text einfügen?" on an unsupported toast. */
  onOpenTextPaste?: () => void;
  /** Called on the final terminal success (after any retry). */
  onSuccess?: () => void;
  /** Called on a terminal failure (i.e. not converted via retry). */
  onError?: (err: unknown) => void;
}

const MAX_SIZE = 50 * 1024 * 1024;

export function startUploadWithFlow(
  file: File,
  opts: UploadFlowOptions,
): UploadHandle<unknown> | null {
  if (file.size > MAX_SIZE) {
    toast.error(`${file.name}: zu groß (max. 50 MB)`);
    opts.onError?.({ status: 413, detail: "file_too_large" });
    return null;
  }

  const url = `/api/projects/${opts.projectId}/documents`;
  const handle = uploadFile<unknown>(url, file, { onProgress: opts.onProgress });

  handle.promise
    .then(() => {
      opts.qc?.invalidateQueries({
        queryKey: ["projects", opts.projectId, "documents"],
      });
      opts.onSuccess?.();
    })
    .catch((err: unknown) => {
      if (isDuplicateError(err)) {
        const ok = window.confirm(
          `Diese Datei existiert schon als „${err.existingFilename}“. Trotzdem hochladen?`,
        );
        if (!ok) {
          opts.onError?.(err);
          return;
        }
        const retry = uploadFile<unknown>(url, file, {
          onProgress: opts.onProgress,
          allowDuplicate: true,
        });
        retry.promise
          .then(() => {
            opts.qc?.invalidateQueries({
              queryKey: ["projects", opts.projectId, "documents"],
            });
            opts.onSuccess?.();
          })
          .catch((e) => {
            toast.error(`${file.name}: Upload fehlgeschlagen`);
            opts.onError?.(e);
          });
        return;
      }
      if (isUnsupportedError(err)) {
        const allowed = err.allowed.length
          ? err.allowed.join(" · ")
          : "PDF · DOCX · XLSX · CSV · TXT · MD";
        toast.error(`${file.name}: ${err.hint ?? "Format nicht unterstützt"}`, {
          description: `Erlaubt: ${allowed}`,
          action: opts.onOpenTextPaste
            ? {
                label: "Als Text einfügen?",
                onClick: () => opts.onOpenTextPaste?.(),
              }
            : undefined,
        });
        opts.onError?.(err);
        return;
      }
      // Legacy error envelope
      const detail = (err as { detail?: unknown })?.detail;
      let msg = "Upload fehlgeschlagen";
      if (typeof detail === "string") msg = detail;
      else if (detail && typeof detail === "object" && "code" in detail) {
        const code = (detail as { code?: string }).code;
        if (code === "file_too_large") msg = "Datei zu groß";
        else if (code === "unsupported_media_type") msg = "Format nicht unterstützt";
        else if (code === "no_active_llm_provider") msg = "Kein aktiver LLM-Provider";
      }
      toast.error(`${file.name}: ${msg}`);
      opts.onError?.(err);
    });

  return handle;
}
