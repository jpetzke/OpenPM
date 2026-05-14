"use client";
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuthStore } from "@/store/authStore";
import { usePipelineStore } from "@/store/pipelineStore";

export function useProjectSSE(projectId: string) {
  const token = useAuthStore((s) => s.token);
  const setPipelineStatus = usePipelineStore((s) => s.setPipelineStatus);
  const qc = useQueryClient();
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!token || !projectId) return;

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/events`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) return;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6).trim();
            if (!raw) continue;
            try {
              const data = JSON.parse(raw);
              switch (data.event) {
                case "pipeline_started":
                  setPipelineStatus(data.document_id, "processing");
                  qc.invalidateQueries({ queryKey: ["projects", projectId, "documents"] });
                  break;
                case "pipeline_complete":
                  setPipelineStatus(data.document_id, "done");
                  qc.invalidateQueries({ queryKey: ["projects", projectId, "documents"] });
                  qc.invalidateQueries({ queryKey: ["projects", projectId, "state"] });
                  break;
                case "pipeline_failed":
                  setPipelineStatus(data.document_id, "failed");
                  qc.invalidateQueries({ queryKey: ["projects", projectId, "documents"] });
                  toast.error(`Verarbeitung fehlgeschlagen: ${data.error || "Unbekannter Fehler"}`);
                  break;
              }
            } catch {
              // ignore parse errors for non-JSON SSE lines
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          // Connection dropped silently — reconnect logic omitted for MVP
        }
      }
    })();

    return () => {
      ctrl.abort();
    };
  }, [projectId, token, qc, setPipelineStatus]);
}
