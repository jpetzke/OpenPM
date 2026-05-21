import { useAuthStore } from "@/store/authStore";

export type UploadProgress = (loaded: number, total: number) => void;

export interface UploadHandle<T> {
  promise: Promise<T>;
  cancel: () => void;
}

export interface UploadOptions {
  onProgress?: UploadProgress;
  fieldName?: string;
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

  const promise = new Promise<T>((resolve, reject) => {
    xhr.open("POST", url, true);
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
      } else {
        let detail: unknown = xhr.responseText;
        try {
          detail = JSON.parse(xhr.responseText);
        } catch {
          // leave as-is
        }
        const detailObj =
          typeof detail === "object" && detail !== null
            ? (detail as { detail?: unknown }).detail ?? detail
            : detail;
        reject({ status: xhr.status, detail: detailObj });
      }
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
