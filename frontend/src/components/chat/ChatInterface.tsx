"use client";
import { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useChatStream } from "@/hooks/useChatStream";
import { ChatMessageComponent } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import type { ChatMessage, ModelInfo } from "@/types/chat";

interface ChatInterfaceProps {
  projectId: string;
}

export function ChatInterface({ projectId }: ChatInterfaceProps) {
  const qc = useQueryClient();
  const { streaming, sending, streamingText, activeTools, sendMessage, abort } = useChatStream(projectId);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [optimisticMessages, setOptimisticMessages] = useState<ChatMessage[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | undefined>(undefined);

  const { data: history } = useQuery<ChatMessage[]>({
    queryKey: ["projects", projectId, "chat", "history"],
    queryFn: () => api.get<ChatMessage[]>(`/api/projects/${projectId}/chat/history`),
  });

  const { data: models } = useQuery<ModelInfo[]>({
    queryKey: ["settings", "models"],
    queryFn: () => api.get<ModelInfo[]>("/api/settings/models"),
    staleTime: Infinity,
  });

  // Set default model once models are loaded.
  useEffect(() => {
    if (models && models.length > 0 && !selectedModel) {
      setSelectedModel(models[0].id);
    }
  }, [models, selectedModel]);

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
      model: selectedModel ?? null,
      created_at: new Date().toISOString(),
    };
    setOptimisticMessages((prev) => [...prev, optimistic]);

    sendMessage(
      content,
      () => {
        setOptimisticMessages([]);
        qc.invalidateQueries({ queryKey: ["projects", projectId, "chat", "history"] });
      },
      selectedModel,
    );
  };

  const handleAbort = () => {
    abort();
    setOptimisticMessages([]);
    qc.invalidateQueries({ queryKey: ["projects", projectId, "chat", "history"] });
  };

  const allMessages = [...(history ?? []), ...optimisticMessages];
  const lastHistoryAssistant = [...(history ?? [])].reverse().find((m) => m.role === "assistant");
  const shouldRenderStreamingMessage =
    streaming && Boolean(streamingText) && lastHistoryAssistant?.content !== streamingText;

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
        {shouldRenderStreamingMessage && (
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
              model: selectedModel ?? null,
              created_at: new Date().toISOString(),
            }}
            isStreaming
          />
        )}
        {sending && !streamingText && (
          <div className="mb-4 text-xs" style={{ color: "var(--text-muted)" }}>
            Anfrage wird gesendet…
          </div>
        )}
        {activeTools.length > 0 && (
          <div className="mb-4 text-xs" style={{ color: "var(--text-muted)" }}>
            Nutzt Tools: {activeTools.join(", ")}
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <ChatInput
        onSend={handleSend}
        onAbort={handleAbort}
        disabled={sending && !streaming}
        sending={sending || streaming}
        models={models}
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
      />
    </div>
  );
}
