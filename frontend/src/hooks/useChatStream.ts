"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useAuthStore } from "@/store/authStore";
import { toast } from "sonner";
import type { ChatStreamState } from "@/types/chat";

export function useChatStream(projectId: string) {
  const token = useAuthStore((s) => s.token);
  const [state, setState] = useState<ChatStreamState>({
    streaming: false,
    sending: false,
    streamingText: "",
    activeTools: [],
  });
  const queuedText = useRef("");
  const rafRef = useRef<number | null>(null);
  const streamClosedRef = useRef(false);
  const completionRef = useRef<((assistantMessage: string, success: boolean) => void) | null>(null);
  const fullTextRef = useRef("");

  const flushCompletionIfReady = useCallback(() => {
    if (queuedText.current || !streamClosedRef.current) {
      return;
    }
    streamClosedRef.current = false;
    setState((prev) => ({
      ...prev,
      streaming: false,
      sending: false,
      activeTools: [],
    }));
    const completion = completionRef.current;
    completionRef.current = null;
    completion?.(fullTextRef.current, true);
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
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, [flushCompletionIfReady]);

  const sendMessage = useCallback(
    async (
      content: string,
      onComplete: (assistantMessage: string, success: boolean) => void
    ) => {
      queuedText.current = "";
      streamClosedRef.current = false;
      fullTextRef.current = "";
      completionRef.current = onComplete;
      setState({ streaming: false, sending: true, streamingText: "", activeTools: [] });
      try {
        const res = await fetch(`/api/projects/${projectId}/chat`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ content }),
        });
        if (!res.ok || !res.body) {
          completionRef.current = null;
          setState({ streaming: false, sending: false, streamingText: "", activeTools: [] });
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
              }
              if (data.type === "tool_call") {
                setState((prev) => ({ ...prev, activeTools: data.tools ?? [] }));
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
                flushCompletionIfReady();
              }
              if (data.type === "error") {
                queuedText.current = "";
                streamClosedRef.current = false;
                completionRef.current = null;
                setState((prev) => ({ ...prev, streaming: false, sending: false, activeTools: [] }));
                toast.error(data.message || "Chat-Antwort fehlgeschlagen");
                onComplete(fullTextRef.current, false);
              }
            } catch {
              // ignore parse errors
            }
          }
        }
      } catch {
        completionRef.current = null;
        setState((prev) => ({ ...prev, streaming: false, sending: false, activeTools: [] }));
        toast.error("Netzwerkfehler beim Chat");
        onComplete(fullTextRef.current, false);
        return;
      }
      flushCompletionIfReady();
      if (completionRef.current) {
        const completion = completionRef.current;
        completionRef.current = null;
        setState((prev) => ({ ...prev, streaming: false, sending: false, activeTools: [] }));
        completion(fullTextRef.current, fullTextRef.current.length > 0);
      }
    },
    [flushCompletionIfReady, projectId, token]
  );

  return { ...state, sendMessage };
}
