"use client";
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuthStore } from "@/store/authStore";
import { usePipelineStore } from "@/store/pipelineStore";

const MAX_RETRIES = 6;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30000;

export function useProjectSSE(projectId: string) {
  const token = useAuthStore((s) => s.token);
  const setPipelineStatus = usePipelineStore((s) => s.setPipelineStatus);
  const pushPipelineEvent = usePipelineStore((s) => s.pushPipelineEvent);
  const qc = useQueryClient();
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!token || !projectId) return;

    cancelledRef.current = false;
    const ctrl = new AbortController();

    async function connect() {
      let retries = 0;

      while (!cancelledRef.current && retries <= MAX_RETRIES) {
        try {
          const res = await fetch(`/api/projects/${projectId}/events`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: ctrl.signal,
          });

          if (res.status === 401 || res.status === 403) return;
          if (!res.ok || !res.body) {
            throw new Error(`SSE response ${res.status}`);
          }

          retries = 0;
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
                    setPipelineStatus(data.document_id, "processing", projectId);
                    pushPipelineEvent(
                      data.document_id,
                      {
                        step: data.step ?? 1,
                        total: data.total ?? 10,
                        label: data.label ?? "queued",
                        status: "running",
                        detail: "Dokumentverarbeitung gestartet",
                        timestamp: data.timestamp ?? new Date().toISOString(),
                      },
                      projectId,
                    );
                    qc.invalidateQueries({ queryKey: ["projects", projectId, "documents"] });
                    break;
                  case "pipeline_progress":
                    pushPipelineEvent(data.document_id, data, projectId);
                    qc.invalidateQueries({ queryKey: ["projects", projectId, "documents"] });
                    break;
                  case "pipeline_complete":
                    setPipelineStatus(data.document_id, "done", projectId);
                    pushPipelineEvent(data.document_id, data, projectId);
                    qc.invalidateQueries({ queryKey: ["projects", projectId, "documents"] });
                    qc.invalidateQueries({ queryKey: ["projects", projectId, "state"] });
                    break;
                  case "pipeline_failed":
                    setPipelineStatus(data.document_id, "failed", projectId);
                    pushPipelineEvent(data.document_id, data, projectId);
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
          if ((err as Error).name === "AbortError" || cancelledRef.current) return;
        }

        if (!cancelledRef.current) {
          retries++;
          const delay = Math.min(BASE_DELAY_MS * 2 ** retries, MAX_DELAY_MS);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    connect();

    return () => {
      cancelledRef.current = true;
      ctrl.abort();
    };
  }, [projectId, token, qc, setPipelineStatus, pushPipelineEvent]);
}
