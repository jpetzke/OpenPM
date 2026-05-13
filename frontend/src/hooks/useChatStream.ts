"use client";
import { useState, useCallback } from "react";
import { useAuthStore } from "@/store/authStore";

interface StreamState {
  streaming: boolean;
  streamingText: string;
}

export function useChatStream(projectId: string) {
  const token = useAuthStore((s) => s.token);
  const [state, setState] = useState<StreamState>({ streaming: false, streamingText: "" });

  const sendMessage = useCallback(
    async (
      content: string,
      onComplete: (assistantMessage: string) => void
    ) => {
      setState({ streaming: true, streamingText: "" });
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
          setState({ streaming: false, streamingText: "" });
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let fullText = "";

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
              setState({ streaming: false, streamingText: "" });
              onComplete(fullText);
              return;
            }
            try {
              const data = JSON.parse(raw);
              if (data.type === "content") {
                fullText = data.text;
                setState({ streaming: true, streamingText: fullText });
              }
            } catch {
              // ignore parse errors
            }
          }
        }
      } catch {
        // network error — fail silently
      }
      setState({ streaming: false, streamingText: "" });
    },
    [projectId, token]
  );

  return { ...state, sendMessage };
}
