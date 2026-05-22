"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useAuthStore } from "@/store/authStore";
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
    setCurrentSessionId(null);
    setActiveToolCalls([]);
    setMutationCards([]);
    setState({ streaming: false, sending: false, streamingText: "", activeTools: [], lastError: null });
  }, []);

  const queuedText = useRef("");
  const rafRef = useRef<number | null>(null);
  const streamClosedRef = useRef(false);
  const completionRef = useRef<((assistantMessage: string, success: boolean) => void) | null>(null);
  const fullTextRef = useRef("");
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
    // Defer to microtask so the streamingText="" commit lands before the
    // parent invalidates / refetches the history query.
    if (completion) queueMicrotask(() => completion(fullTextRef.current, true));
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
    setActiveToolCalls([]);
    setMutationCards([]);
    setState({ streaming: false, sending: false, streamingText: "", activeTools: [], lastError: null });
    // Return whatever was streamed so far so the caller can still show it.
    completion?.(fullTextRef.current, fullTextRef.current.length > 0);
  }, []);

  const sendMessage = useCallback(
    async (
      content: string,
      onComplete: (assistantMessage: string, success: boolean) => void,
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
      setState({ streaming: false, sending: true, streamingText: "", activeTools: [], lastError: null });

      try {
        const body: Record<string, unknown> = { content };
        if (selectedModel) body.model = selectedModel;
        if (currentSessionId) body.session_id = currentSessionId;

        const res = await fetch(`/api/projects/${projectId}/chat`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

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
                setActiveToolCalls(prev => [...prev, {
                  call_id: data.call_id as string,
                  tool_name: data.tool_name as string,
                  args: (data.args as Record<string, unknown>) ?? {},
                  status: "running",
                }]);
              }
              if (data.type === "tool_call_end") {
                setActiveToolCalls(prev => prev.map(tc =>
                  tc.call_id === data.call_id
                    ? { ...tc, result_summary: data.result_summary as string | undefined, status: "done" }
                    : tc
                ));
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
                setActiveToolCalls([]);
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

      flushCompletionIfReady();
      if (completionRef.current) {
        const completion = completionRef.current;
        completionRef.current = null;
        setState({ streaming: false, sending: false, streamingText: "", activeTools: [], lastError: null });
        queueMicrotask(() => completion(fullTextRef.current, fullTextRef.current.length > 0));
      }
    },
    [flushCompletionIfReady, projectId, token, currentSessionId],
  );

  const setSessionId = useCallback((id: string | null) => {
    setCurrentSessionId(id);
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
