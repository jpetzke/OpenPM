import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Document } from "@/types/document";

export type DocumentMeta = Document;

export function useDocuments(projectId: string) {
  return useQuery<DocumentMeta[]>({
    queryKey: ["projects", projectId, "documents"],
    queryFn: () => api.get<DocumentMeta[]>(`/api/projects/${projectId}/documents`),
    enabled: Boolean(projectId),
  });
}

export function useDocumentsById(projectId: string): Record<string, DocumentMeta> {
  const { data } = useDocuments(projectId);
  return useMemo(() => {
    const m: Record<string, DocumentMeta> = {};
    (data ?? []).forEach((d) => {
      m[d.id] = d;
    });
    return m;
  }, [data]);
}
