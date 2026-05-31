"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useAuthStore } from "@/store/authStore";
import { refreshAccessToken } from "@/lib/authClient";
import { toast } from "sonner";
import type { ChatStreamState, ActiveToolCall, MutationCardData } from "@/types/chat";

export function useChatStream(projectId: string) {
  const token = useAuthStore((s) => s.token);
  const [state, setState] = useState<ChatStreamState>({
    streaming: false,
    sending: false,
    streamingText: "",
    activeTools: [],
    lastError: null,
  });

  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [activeToolCalls, setActiveToolCalls] = useState<ActiveToolCall[]>([]);
  const [mutationCards, setMutationCards] = useState<MutationCardData[]>([]);

  const clearError = useCallback(() => {
    setState((prev) => (prev.lastError ? { ...prev, lastError: null } : prev));
  }, []);

  const startNewSession = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    queuedText.current = "";
    streamClosedRef.current = false;
    fullTextRef.current = "";
    completionRef.current = null;
    toolCallsRef.current = [];
    setCurrentSessionId(null);
    setActiveToolCalls([]);
    setMutationCards([]);
    setState({ streaming: false, sending: false, streamingText: "", activeTools: [], lastError: null });
  }, []);

  const queuedText = useRef("");
  const rafRef = useRef<number | null>(null);
  const streamClosedRef = useRef(false);
  const completionRef = useRef<((assistantMessage: string, success: boolean, errorCode?: string, invocations?: ActiveToolCall[]) => void) | null>(null);
  const fullTextRef = useRef("");
  // Mirror of activeToolCalls that survives the message_end clear, so the
  // completion callback can hand the finished invocations to the optimistic
  // assistant message — keeping the tool rows on screen with no flicker until
  // the persisted history (which carries the same invocations) lands.
  const toolCallsRef = useRef<ActiveToolCall[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  const flushCompletionIfReady = useCallback(() => {
    if (queuedText.current || !streamClosedRef.current) return;
    streamClosedRef.current = false;
    // Clear streamingText atomically with the streaming flag. The parent
    // takes over rendering via an optimistic assistant message — keeping
    // streamingText around past stream-end caused the "ghost duplicate" flash.
    setState((prev) => ({
      ...prev,
      streaming: false,
      sending: false,
      streamingText: "",
      activeTools: [],
    }));
    const completion = completionRef.current;
    completionRef.current = null;
    const invocations = toolCallsRef.current;
    // Defer to microtask so the streamingText="" commit lands before the
    // parent invalidates / refetches the history query.
    if (completion) queueMicrotask(() => completion(fullTextRef.current, true, undefined, invocations));
  }, []);

  useEffect(() => {
    const pump = () => {
      if (queuedText.current) {
        const slice = queuedText.current.slice(0, 12);
        queuedText.current = queuedText.current.slice(slice.length);
        setState((prev) => ({
          ...prev,
          streaming: true,
          sending: false,
          streamingText: prev.streamingText + slice,
        }));
      } else {
        flushCompletionIfReady();
      }
      rafRef.current = window.requestAnimationFrame(pump);
    };
    rafRef.current = window.requestAnimationFrame(pump);
    return () => {
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
    };
  }, [flushCompletionIfReady]);

  const abort = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    queuedText.current = "";
    streamClosedRef.current = false;
    const completion = completionRef.current;
    completionRef.current = null;
    const invocations = toolCallsRef.current;
    setActiveToolCalls([]);
    setMutationCards([]);
    setState({ streaming: false, sending: false, streamingText: "", activeTools: [], lastError: null });
    // Return whatever was streamed so far so the caller can still show it.
    completion?.(fullTextRef.current, fullTextRef.current.length > 0, undefined, invocations);
  }, []);

  const sendMessage = useCallback(
    async (
      content: string,
      onComplete: (assistantMessage: string, success: boolean, errorCode?: string, invocations?: ActiveToolCall[]) => void,
      selectedModel?: string,
    ) => {
      // Clean up any previous stream.
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      queuedText.current = "";
      streamClosedRef.current = false;
      fullTextRef.current = "";
      completionRef.current = onComplete;
      toolCallsRef.current = [];
      setActiveToolCalls([]);
      setState({ streaming: false, sending: true, streamingText: "", activeTools: [], lastError: null });

      try {
        const body: Record<string, unknown> = { content };
        if (selectedModel) body.model = selectedModel;
        if (currentSessionId) body.session_id = currentSessionId;
        const bodyStr = JSON.stringify(body);

        // Hit the backend directly, bypassing the Next.js dev rewrite. The dev
        // proxy buffers/gzips chunked responses, which holds the whole SSE
        // stream until the end — tools + text would then all appear at once.
        // NEXT_PUBLIC_API_URL is wired in compose (same approach as useProjectSSE).
        const chatUrl = `${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/projects/${projectId}/chat`;

        let effectiveToken = token;
        let res = await fetch(chatUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${effectiveToken}`,
            "Content-Type": "application/json",
          },
          body: bodyStr,
          signal: controller.signal,
        });

        // On 401 attempt a silent token refresh then retry once
        if (res.status === 401) {
          const newToken = await refreshAccessToken();
          if (newToken) {
            effectiveToken = newToken;
            res = await fetch(chatUrl, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${newToken}`,
                "Content-Type": "application/json",
              },
              body: bodyStr,
              signal: controller.signal,
            });
          }
          // If still 401 after refresh (or refresh failed), signal auth failure
          if (res.status === 401) {
            completionRef.current = null;
            setState({ streaming: false, sending: false, streamingText: "", activeTools: [], lastError: { code: "auth_expired", message: "Sitzung abgelaufen" } });
            onComplete("", false, "auth_expired");
            return;
          }
        }

        if (!res.ok || !res.body) {
          completionRef.current = null;
          setState({ streaming: false, sending: false, streamingText: "", activeTools: [], lastError: null });
          onComplete("", false);
          return;
        }

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
            if (raw === "[DONE]") {
              streamClosedRef.current = true;
              flushCompletionIfReady();
              continue;
            }
            try {
              const data = JSON.parse(raw);
              if (data.type === "message_start") {
                setState((prev) => ({ ...prev, streaming: true, sending: false }));
                if (data.session_id) setCurrentSessionId(data.session_id as string);
              }
              if (data.type === "tool_call") {
                setState((prev) => ({ ...prev, activeTools: data.tools ?? [] }));
              }
              if (data.type === "tool_call_start") {
                const call: ActiveToolCall = {
                  call_id: data.call_id as string,
                  tool_name: data.tool_name as string,
                  args: (data.args as Record<string, unknown>) ?? {},
                  status: "running",
                  text_offset:
                    typeof data.text_offset === "number"
                      ? data.text_offset
                      : fullTextRef.current.length,
                };
                toolCallsRef.current = [...toolCallsRef.current, call];
                setActiveToolCalls(toolCallsRef.current);
              }
              if (data.type === "tool_call_end") {
                toolCallsRef.current = toolCallsRef.current.map(tc =>
                  tc.call_id === data.call_id
                    ? { ...tc, result_summary: data.result_summary as string | undefined, status: "done" as const }
                    : tc
                );
                setActiveToolCalls(toolCallsRef.current);
              }
              if (data.type === "mutation_card") {
                setMutationCards(prev => [...prev, {
                  undo_token: data.undo_token as string,
                  description: data.description as string,
                  expires_in: (data.expires_in as number) ?? 30,
                  created_at: Date.now(),
                }]);
              }
              if (data.type === "content_delta") {
                const delta = data.delta ?? "";
                fullTextRef.current += delta;
                queuedText.current += delta;
                setState((prev) => ({ ...prev, streaming: true, sending: false }));
              }
              if (data.type === "message_end") {
                streamClosedRef.current = true;
                setState((prev) => ({ ...prev, sending: false, activeTools: [] }));
                // Keep activeToolCalls until the next send/abort: the streaming
                // bubble unmounts when `streaming` flips false anyway, and the
                // optimistic assistant carries these same invocations forward —
                // so the inline tool rows never flicker out.
                flushCompletionIfReady();
              }
              if (data.type === "error") {
                queuedText.current = "";
                streamClosedRef.current = false;
                completionRef.current = null;
                const msg = data.message || "Chat-Antwort fehlgeschlagen";
                const code = typeof data.code === "string" ? data.code : "stream_failed";
                setState({
                  streaming: false,
                  sending: false,
                  streamingText: "",
                  activeTools: [],
                  lastError: { code, message: msg },
                });
                // Suppress toast for actionable banner-worthy errors — the in-chat
                // banner is more useful than a transient toast for these.
                if (code !== "provider_config_corrupt") {
                  toast.error(msg);
                }
                onComplete(fullTextRef.current, false);
              }
            } catch {
              // ignore parse errors
            }
          }
        }
      } catch (err: unknown) {
        // AbortError means the user cancelled — not a real error.
        if (err instanceof Error && err.name === "AbortError") return;
        completionRef.current = null;
        setState({ streaming: false, sending: false, streamingText: "", activeTools: [], lastError: null });
        toast.error("Netzwerkfehler beim Chat");
        onComplete(fullTextRef.current, false);
        return;
      }

      // Stream body fully read. Mark the stream closed and let the throttled
      // rAF pump finish draining queuedText before completing. Forcing
      // completion here while text is still queued cleared streamingText and
      // swapped in the parent's finalized message, but the pump then kept
      // re-rendering the streaming bubble from the remaining queue — producing
      // the "double response" the user saw on every reply. flushCompletionIfReady
      // (called each frame once the queue empties) handles the actual finish.
      streamClosedRef.current = true;
      flushCompletionIfReady();
    },
    [flushCompletionIfReady, projectId, token, currentSessionId],
  );

  const setSessionId = useCallback((id: string | null) => {
    setCurrentSessionId(id);
    toolCallsRef.current = [];
    setActiveToolCalls([]);
    setMutationCards([]);
    setState({ streaming: false, sending: false, streamingText: "", activeTools: [], lastError: null });
  }, []);

  return {
    ...state,
    currentSessionId,
    activeToolCalls,
    mutationCards,
    sendMessage,
    abort,
    clearError,
    startNewSession,
    setSessionId,
  };
}
