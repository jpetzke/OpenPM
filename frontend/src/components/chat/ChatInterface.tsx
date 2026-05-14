"use client";
import { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useChatStream } from "@/hooks/useChatStream";
import { ChatMessageComponent } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import type { ChatMessage } from "@/types/chat";

interface ChatInterfaceProps {
  projectId: string;
}

export function ChatInterface({ projectId }: ChatInterfaceProps) {
  const qc = useQueryClient();
  const { streaming, streamingText, sendMessage } = useChatStream(projectId);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [optimisticMessages, setOptimisticMessages] = useState<ChatMessage[]>([]);

  const { data: history } = useQuery<ChatMessage[]>({
    queryKey: ["projects", projectId, "chat", "history"],
    queryFn: () =>
      api.get<ChatMessage[]>(`/api/projects/${projectId}/chat/history`),
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, streamingText, optimisticMessages]);

  const handleSend = (content: string) => {
    const optimistic: ChatMessage = {
      id: crypto.randomUUID(),
      project_id: projectId,
      user_id: null,
      role: "user",
      content,
      tool_calls: null,
      tool_results: null,
      state_version: null,
      created_at: new Date().toISOString(),
    };
    setOptimisticMessages((prev) => [...prev, optimistic]);

    sendMessage(content, () => {
      setOptimisticMessages([]);
      qc.invalidateQueries({ queryKey: ["projects", projectId, "chat", "history"] });
    });
  };

  const allMessages = [...(history ?? []), ...optimisticMessages];

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {allMessages.length === 0 && !streaming && (
          <div className="h-full flex items-center justify-center">
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Stell eine Frage zu diesem Projekt.
            </p>
          </div>
        )}
        {allMessages.map((msg) => (
          <ChatMessageComponent key={msg.id} message={msg} />
        ))}
        {streaming && streamingText && (
          <ChatMessageComponent
            message={{
              id: "streaming",
              project_id: projectId,
              user_id: null,
              role: "assistant",
              content: streamingText,
              tool_calls: null,
              tool_results: null,
              state_version: null,
              created_at: new Date().toISOString(),
            }}
            isStreaming
          />
        )}
        <div ref={bottomRef} />
      </div>
      <ChatInput onSend={handleSend} disabled={streaming} />
    </div>
  );
}
