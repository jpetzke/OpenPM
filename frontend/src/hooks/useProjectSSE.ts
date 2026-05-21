"use client";
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuthStore } from "@/store/authStore";
import {
  type ChangeSessionInfo,
  type ExtractedSummary,
  usePipelineStore,
} from "@/store/pipelineStore";

const MAX_RETRIES = 6;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30000;
const STALL_AFTER_MS = 40000;

const PIPELINE_LABELS: Record<string, string> = {
  queued: "Eingereiht",
  parsing: "Parsen",
  summarize_extract: "Zusammenfassen & Extrahieren",
  state_merge: "State zusammenführen",
  state_persist: "State speichern",
  changelog: "Changelog",
  git_commit: "Git",
  enrich: "Embeddings & Briefing",
  complete: "Abgeschlossen",
};

function labelFor(raw: string | null | undefined): string {
  if (!raw) return "Aktivität";
  return PIPELINE_LABELS[raw] ?? raw.replaceAll("_", " ");
}

export function useProjectSSE(projectId: string) {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();

  const setPipelineStatus = usePipelineStore((s) => s.setPipelineStatus);
  const pushPipelineEvent = usePipelineStore((s) => s.pushPipelineEvent);
  const pushActivity = usePipelineStore((s) => s.pushActivity);
  const clearPipeline = usePipelineStore((s) => s.clearPipeline);
  const recordDocName = usePipelineStore((s) => s.recordDocName);
  const recordExtraction = usePipelineStore((s) => s.recordExtraction);
  const setActiveSession = usePipelineStore((s) => s.setActiveSession);
  const setSessionClosed = usePipelineStore((s) => s.setSessionClosed);
  const setConnectionState = usePipelineStore((s) => s.setConnectionState);

  const cancelledRef = useRef(false);
  const ctrlRef = useRef<AbortController | null>(null);
  const lastEventRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!token || !projectId) return;
    cancelledRef.current = false;

    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    let stallTimer: ReturnType<typeof setInterval> | null = null;

    async function connect() {
      let retries = 0;
      while (!cancelledRef.current && retries <= MAX_RETRIES) {
        const ctrl = new AbortController();
        ctrlRef.current = ctrl;
        setConnectionState(projectId, "connecting");

        try {
          // Bypass the Next.js dev rewrite for SSE, otherwise the proxy gzips
          // the chunked response (Vary: Accept-Encoding) and buffers it for
          // many seconds. Hitting the backend directly keeps the stream
          // flushing every event. NEXT_PUBLIC_API_URL is wired in compose.
          const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "";
          const sseUrl = `${apiBase}/api/projects/${projectId}/events`;
          const res = await fetch(sseUrl, {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "text/event-stream",
              "Cache-Control": "no-cache",
            },
            cache: "no-store",
            signal: ctrl.signal,
          });
          if (res.status === 401 || res.status === 403) {
            setConnectionState(projectId, "disconnected");
            return;
          }
          if (!res.ok || !res.body) throw new Error(`SSE response ${res.status}`);

          retries = 0;
          setConnectionState(projectId, "open");
          lastEventRef.current = Date.now();

          if (stallTimer) clearInterval(stallTimer);
          stallTimer = setInterval(() => {
            if (Date.now() - lastEventRef.current > STALL_AFTER_MS) {
              try {
                ctrl.abort();
              } catch {
                // ignore
              }
            }
          }, 5000);

          reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buf = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            buf = buf.replace(/\r\n/g, "\n");
            const lines = buf.split("\n");
            buf = lines.pop() ?? "";
            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const raw = line.slice(6).trim();
              if (!raw) continue;
              lastEventRef.current = Date.now();
              try {
                const data = JSON.parse(raw);
                handleEvent(data);
              } catch {
                // ignore parse errors
              }
            }
          }
        } catch {
          if (cancelledRef.current) {
            setConnectionState(projectId, "disconnected");
            return;
          }
        } finally {
          if (stallTimer) {
            clearInterval(stallTimer);
            stallTimer = null;
          }
        }

        if (cancelledRef.current) return;

        retries++;
        if (retries > MAX_RETRIES) {
          setConnectionState(projectId, "disconnected");
          return;
        }
        setConnectionState(projectId, "connecting");
        const delay = Math.min(BASE_DELAY_MS * 2 ** retries, MAX_DELAY_MS);
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    function handleEvent(data: Record<string, unknown>) {
      const event = data.event as string | undefined;
      const documentId = (data.document_id ?? null) as string | null;
      const filename = (data.filename ?? null) as string | null;
      if (documentId && filename) recordDocName(documentId, filename);

      const sessionId = (data.change_session_id ?? null) as string | null;
      const ts = (data.timestamp ?? new Date().toISOString()) as string;

      switch (event) {
        case "connected":
        case "heartbeat":
          return;

        case "document_queued":
          if (!documentId) return;
          setPipelineStatus(documentId, "pending", projectId);
          pushPipelineEvent(
            documentId,
            {
              step: 0,
              total: 9,
              label: "queued",
              status: "info",
              detail: "Eingereiht",
              timestamp: ts,
            },
            projectId,
          );
          pushActivity(projectId, {
            id: `${documentId}-queued-${ts}`,
            ts,
            documentId,
            documentName: filename ?? undefined,
            label: "Eingereiht",
            detail: null,
            status: "info",
            kind: "document",
            changeSessionId: sessionId,
          });
          qc.invalidateQueries({ queryKey: ["projects", projectId, "documents"] });
          return;

        case "document_started":
          if (!documentId) return;
          setPipelineStatus(documentId, "processing", projectId);
          pushPipelineEvent(
            documentId,
            {
              step: (data.step as number | undefined) ?? 1,
              total: (data.total as number | undefined) ?? 9,
              label: "queued",
              status: "running",
              detail: "Verarbeitung gestartet",
              timestamp: ts,
            },
            projectId,
          );
          qc.invalidateQueries({ queryKey: ["projects", projectId, "documents"] });
          return;

        case "document_progress":
          if (!documentId) return;
          pushPipelineEvent(documentId, data as Parameters<typeof pushPipelineEvent>[1], projectId);
          pushActivity(projectId, {
            id: `${documentId}-${data.step ?? "?"}-${data.label ?? "?"}-${ts}`,
            ts,
            documentId,
            documentName: filename ?? null,
            label: labelFor((data.label as string) ?? null),
            detail: (data.detail as string | null) ?? null,
            status: ((data.status as string) ?? "info") as "running" | "done" | "failed" | "info",
            kind: "document",
          });
          return;

        case "document_complete": {
          if (!documentId) return;
          setPipelineStatus(documentId, "done", projectId);
          pushPipelineEvent(
            documentId,
            {
              step: 9,
              total: 9,
              label: "complete",
              status: "done",
              detail: "Abgeschlossen",
              timestamp: ts,
            },
            projectId,
          );
          const summary = (data.extracted_summary as ExtractedSummary | undefined) ?? undefined;
          if (summary) {
            recordExtraction(projectId, {
              documentId,
              summary,
              stateVersion: data.state_version as number | undefined,
              at: ts,
            });
          }
          pushActivity(projectId, {
            id: `${documentId}-done-${ts}`,
            ts,
            documentId,
            documentName: filename ?? null,
            label: "Abgeschlossen",
            detail: summary
              ? `${summary.tasks_added} Tasks · ${summary.deadlines_added} Deadlines · ${summary.contacts_added} Kontakte`
              : null,
            status: "done",
            kind: "document",
            changeSessionId: sessionId,
          });
          qc.invalidateQueries({ queryKey: ["projects", projectId, "documents"] });
          qc.invalidateQueries({ queryKey: ["projects", projectId, "state"] });
          qc.invalidateQueries({ queryKey: ["projects", projectId, "change-session"] });
          return;
        }

        case "document_failed":
          if (!documentId) return;
          setPipelineStatus(documentId, "failed", projectId);
          pushPipelineEvent(documentId, data as Parameters<typeof pushPipelineEvent>[1], projectId);
          pushActivity(projectId, {
            id: `${documentId}-failed-${ts}`,
            ts,
            documentId,
            documentName: filename ?? null,
            label: "Fehler",
            detail: (data.error as string | null) ?? null,
            status: "failed",
            kind: "document",
          });
          toast.error(`Verarbeitung fehlgeschlagen: ${data.error || "Unbekannter Fehler"}`);
          qc.invalidateQueries({ queryKey: ["projects", projectId, "documents"] });
          return;

        case "document_deleted":
          if (!documentId) return;
          clearPipeline(documentId);
          qc.invalidateQueries({ queryKey: ["projects", projectId, "documents"] });
          return;

        case "change_session_opened": {
          const id = (data.session_id as string) ?? sessionId;
          if (!id) return;
          const info: ChangeSessionInfo = {
            id,
            started_at: (data.started_at as string) ?? ts,
            last_activity_at: ts,
            closed_at: null,
            summary: null,
            triggered_by: null,
          };
          setActiveSession(projectId, info);
          pushActivity(projectId, {
            id: `session-open-${id}`,
            ts,
            documentId: null,
            label: "Session geöffnet",
            detail: null,
            status: "info",
            kind: "session",
            changeSessionId: id,
          });
          return;
        }

        case "change_session_closed": {
          const id = (data.session_id as string) ?? null;
          if (!id) return;
          const info: ChangeSessionInfo = {
            id,
            started_at: ts,
            last_activity_at: ts,
            closed_at: (data.closed_at as string) ?? ts,
            summary: (data.summary as Record<string, unknown> | null) ?? null,
            triggered_by: (data.triggered_by as string | null) ?? null,
          };
          setSessionClosed(projectId, info);
          pushActivity(projectId, {
            id: `session-close-${id}`,
            ts,
            documentId: null,
            label: "Session geschlossen",
            detail: info.summary
              ? `${(info.summary.document_count as number | undefined) ?? "?"} Dokumente`
              : null,
            status: "done",
            kind: "session",
            changeSessionId: id,
          });
          qc.invalidateQueries({ queryKey: ["projects", projectId, "change-session"] });
          return;
        }

        default:
          return;
      }
    }

    connect();

    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      try {
        ctrlRef.current?.abort();
      } catch {
        // ignore
      }
      qc.invalidateQueries({ queryKey: ["projects", projectId, "documents"] });
      qc.invalidateQueries({ queryKey: ["projects", projectId, "change-session"] });
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelledRef.current = true;
      try {
        ctrlRef.current?.abort();
      } catch {
        // ignore
      }
      try {
        reader?.cancel().catch(() => undefined);
      } catch {
        // ignore
      }
      if (stallTimer) clearInterval(stallTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      setConnectionState(projectId, "disconnected");
    };
  }, [
    projectId,
    token,
    qc,
    setPipelineStatus,
    pushPipelineEvent,
    pushActivity,
    clearPipeline,
    recordDocName,
    recordExtraction,
    setActiveSession,
    setSessionClosed,
    setConnectionState,
  ]);
}
