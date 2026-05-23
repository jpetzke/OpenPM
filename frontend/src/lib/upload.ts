import { useAuthStore } from "@/store/authStore";

export type UploadProgress = (loaded: number, total: number) => void;

export interface UploadHandle<T> {
  promise: Promise<T>;
  cancel: () => void;
}

export interface UploadOptions {
  onProgress?: UploadProgress;
  fieldName?: string;
  /** When true, append `?allow_duplicate=true` to bypass 409 duplicate guard. */
  allowDuplicate?: boolean;
}

/**
 * Typed upload errors. Callers should check `err.kind` first; if absent, the
 * payload follows the legacy `{status, detail}` shape used elsewhere.
 */
export interface DuplicateUploadError {
  kind: "duplicate";
  existingDocumentId: string;
  existingFilename: string;
  status: 409;
  detail: unknown;
}

export interface UnsupportedUploadError {
  kind: "unsupported";
  allowed: string[];
  hint?: string;
  status: 415;
  detail: unknown;
}

export type TypedUploadError = DuplicateUploadError | UnsupportedUploadError;

export function isDuplicateError(e: unknown): e is DuplicateUploadError {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as { kind?: string }).kind === "duplicate"
  );
}

export function isUnsupportedError(e: unknown): e is UnsupportedUploadError {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as { kind?: string }).kind === "unsupported"
  );
}

/**
 * Upload a single file via XMLHttpRequest so we can report real progress and
 * support cancellation. Falls back to a normal POST envelope shape for the
 * JSON response. The auth token is read from the store at call time.
 */
export function uploadFile<T = unknown>(
  url: string,
  file: File,
  options: UploadOptions = {},
): UploadHandle<T> {
  const xhr = new XMLHttpRequest();
  const formData = new FormData();
  formData.append(options.fieldName ?? "file", file, file.name);

  const finalUrl = options.allowDuplicate
    ? url + (url.includes("?") ? "&" : "?") + "allow_duplicate=true"
    : url;

  const promise = new Promise<T>((resolve, reject) => {
    xhr.open("POST", finalUrl, true);
    const token = useAuthStore.getState().token;
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    if (options.onProgress) {
      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) options.onProgress?.(event.loaded, event.total);
      });
    }

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(xhr.responseText ? (JSON.parse(xhr.responseText) as T) : (undefined as T));
        } catch (err) {
          reject(err);
        }
        return;
      }
      // Parse error body once.
      let parsed: unknown = xhr.responseText;
      try {
        parsed = JSON.parse(xhr.responseText);
      } catch {
        // leave as-is
      }
      const detailObj =
        typeof parsed === "object" && parsed !== null
          ? (parsed as { detail?: unknown }).detail ?? parsed
          : parsed;

      // 409 duplicate
      if (xhr.status === 409) {
        const d = (detailObj ?? {}) as {
          code?: string;
          existing_document_id?: string;
          existing_filename?: string;
          filename?: string;
        };
        if (d?.code === "duplicate") {
          const dupErr: DuplicateUploadError = {
            kind: "duplicate",
            existingDocumentId: d.existing_document_id ?? "",
            existingFilename:
              d.existing_filename ?? d.filename ?? file.name,
            status: 409,
            detail: detailObj,
          };
          reject(dupErr);
          return;
        }
      }
      // 415 unsupported media type
      if (xhr.status === 415) {
        const d = (detailObj ?? {}) as {
          code?: string;
          allowed?: string[];
          hint?: string;
        };
        if (d?.code === "unsupported_media_type") {
          const unsupErr: UnsupportedUploadError = {
            kind: "unsupported",
            allowed: Array.isArray(d.allowed) ? d.allowed : [],
            hint: d.hint,
            status: 415,
            detail: detailObj,
          };
          reject(unsupErr);
          return;
        }
      }
      reject({ status: xhr.status, detail: detailObj });
    });
    xhr.addEventListener("error", () => reject({ status: 0, detail: "network_error" }));
    xhr.addEventListener("abort", () => reject({ status: 0, detail: "aborted" }));
    xhr.send(formData);
  });

  return {
    promise,
    cancel: () => {
      try {
        xhr.abort();
      } catch {
        // ignore
      }
    },
  };
}
