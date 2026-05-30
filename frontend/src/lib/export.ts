import { useAuthStore } from "@/store/authStore";

/**
 * Section U: authenticated file download. The export endpoints are GET routes
 * that require the JWT, so a plain `<a download>` won't work (no auth header).
 * Fetch with the token, then trigger a blob download, honouring the server's
 * Content-Disposition filename when present.
 */
async function downloadFile(path: string, fallbackName: string): Promise<void> {
  const token = useAuthStore.getState().token;
  const res = await fetch(path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`download failed: ${res.status}`);

  const disposition = res.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match?.[1] ?? fallbackName;

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadBriefingMd(projectId: string): Promise<void> {
  return downloadFile(`/api/projects/${projectId}/export/briefing.md`, "briefing.md");
}

export function downloadProjectZip(projectId: string): Promise<void> {
  return downloadFile(`/api/projects/${projectId}/export.zip`, "project.zip");
}

export function downloadSessionMd(projectId: string, sessionId: string): Promise<void> {
  return downloadFile(
    `/api/projects/${projectId}/chat/sessions/${sessionId}/export.md`,
    "chat.md",
  );
}

export interface ExportZipStatus {
  ready: boolean;
  mode: string;
  document_count: number;
  documents_total_bytes: number;
}

export async function getExportZipStatus(projectId: string): Promise<ExportZipStatus> {
  const { api } = await import("@/lib/api");
  return api.get<ExportZipStatus>(`/api/projects/${projectId}/export.zip/status`);
}
