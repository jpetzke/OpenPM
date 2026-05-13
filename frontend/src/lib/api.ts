import { useAuthStore } from "@/store/authStore";
import { toast } from "sonner";

export interface ApiError {
  status: number;
  message: string;
  detail?: string;
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = useAuthStore.getState().token;
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
  if (res.status >= 500) {
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
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: (path: string) => request<void>(path, { method: "DELETE" }),
  upload: <T>(path: string, formData: FormData) =>
    request<T>(path, { method: "POST", body: formData }),
  getToken: () => useAuthStore.getState().token,
};
