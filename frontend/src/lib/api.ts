import { useAuthStore } from "@/store/authStore";
import { toast } from "sonner";

export interface ApiError {
  status: number;
  message: string;
  detail?: string;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  authToken?: string
): Promise<T> {
  const token = authToken ?? useAuthStore.getState().token;
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(path, { ...options, headers });

  if (res.status === 401) {
    useAuthStore.getState().clearAuth();
    if (typeof window !== "undefined") window.location.href = "/login";
    throw { status: 401, message: "Unauthorized" } as ApiError;
  }
  if (res.status === 403) {
    toast.error("Keine Berechtigung");
    throw { status: 403, message: "Forbidden" } as ApiError;
  }
  if (res.status === 413) {
    toast.error("Datei zu groß (max. 50MB)");
    throw { status: 413, message: "File too large" } as ApiError;
  }
  if (res.status >= 500 && res.status !== 503) {
    toast.error("Serverfehler, bitte erneut versuchen");
    throw { status: res.status, message: "Server error" } as ApiError;
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw { status: res.status, message: body.detail || "Request failed", detail: body.detail } as ApiError;
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  getWithToken: <T>(path: string, token: string) => request<T>(path, {}, token),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  delete: (path: string) => request<void>(path, { method: "DELETE" }),
  upload: <T>(path: string, formData: FormData) =>
    request<T>(path, { method: "POST", body: formData }),
  getToken: () => useAuthStore.getState().token,
};

export interface DiffItem {
  type: string;
  title: string;
}

export interface DiffPreview {
  additions: DiffItem[];
  removals: DiffItem[];
  modifications: DiffItem[];
}

export function replaceDocumentDryRun(
  projectId: string,
  docId: string,
  file: File
): Promise<DiffPreview> {
  const formData = new FormData();
  formData.append("file", file);
  return request<DiffPreview>(
    `/api/projects/${projectId}/documents/${docId}/replace?dry_run=true`,
    { method: "POST", body: formData }
  );
}

export function replaceDocument(
  projectId: string,
  docId: string,
  file: File
): Promise<import("@/types/document").Document> {
  const formData = new FormData();
  formData.append("file", file);
  return request<import("@/types/document").Document>(
    `/api/projects/${projectId}/documents/${docId}/replace`,
    { method: "POST", body: formData }
  );
}

export function restoreDocument(projectId: string, docId: string): Promise<void> {
  return request<void>(
    `/api/projects/${projectId}/documents/${docId}/restore`,
    { method: "POST" }
  );
}
