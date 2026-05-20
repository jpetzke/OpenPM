"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Settings as SettingsIcon, X } from "lucide-react";
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
  const { streaming, sending, streamingText, activeTools, lastError, sendMessage, abort, clearError } = useChatStream(projectId);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [optimisticMessages, setOptimisticMessages] = useState<ChatMessage[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | undefined>(undefined);

  const { data: history } = useQuery<ChatMessage[]>({
    queryKey: ["projects", projectId, "chat", "history"],
    queryFn: () => api.get<ChatMessage[]>(`/api/projects/${projectId}/chat/history`),
  });

  const { data: models, error: modelsError } = useQuery<ModelInfo[]>({
    queryKey: ["settings", "models"],
    queryFn: () => api.get<ModelInfo[]>("/api/settings/models"),
    retry: false,
  });

  const noActiveProvider = (modelsError as { status?: number } | null)?.status === 503;

  // Set default model once models are loaded. Prefer chat role.
  useEffect(() => {
    if (!models || models.length === 0 || selectedModel) return;
    const chatModel = models.find((m) => m.role === "chat") ?? models[0];
    setSelectedModel(chatModel.id);
  }, [models, selectedModel]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, streamingText, optimisticMessages]);

  const handleSend = (content: string) => {
    const optimisticUser: ChatMessage = {
      id: `optimistic-user-${crypto.randomUUID()}`,
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
    setOptimisticMessages((prev) => [...prev, optimisticUser]);

    sendMessage(
      content,
      async (assistantText, success) => {
        // The streaming bubble is gone (useChatStream clears streamingText
        // atomically). Keep an optimistic assistant up until the history
        // refetch resolves, so the message never visibly disappears between
        // stream-end and the new history landing.
        if (success && assistantText) {
          setOptimisticMessages((prev) => [
            ...prev,
            {
              id: `optimistic-assistant-${crypto.randomUUID()}`,
              project_id: projectId,
              user_id: null,
              role: "assistant",
              content: assistantText,
              tool_calls: null,
              tool_results: null,
              state_version: null,
              model: selectedModel ?? null,
              created_at: new Date().toISOString(),
            },
          ]);
        }
        try {
          await qc.refetchQueries({
            queryKey: ["projects", projectId, "chat", "history"],
            exact: true,
          });
        } finally {
          setOptimisticMessages([]);
        }
      },
      selectedModel,
    );
  };

  const handleAbort = () => {
    abort();
    setOptimisticMessages([]);
    qc.invalidateQueries({ queryKey: ["projects", projectId, "chat", "history"] });
  };

  // Dedupe optimistic messages whose content already landed in history.
  // Pairs match by role + content (within last N history entries — cheap O(N)).
  const historyList = history ?? [];
  const recentHistoryContents = new Set(
    historyList.slice(-6).map((m) => `${m.role}::${m.content}`),
  );
  const filteredOptimistic = optimisticMessages.filter(
    (m) => !recentHistoryContents.has(`${m.role}::${m.content}`),
  );
  const allMessages = [...historyList, ...filteredOptimistic];
  // Streaming bubble: only render while text is actively flowing. The atomic
  // clear in flushCompletionIfReady drops streamingText the moment streaming
  // ends, so this guard collapses cleanly without a "ghost frame".
  const shouldRenderStreamingMessage = streaming && Boolean(streamingText);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {noActiveProvider && (
          <div
            className="mb-4 rounded-lg border-l-2 p-4 text-sm flex items-start gap-3"
            style={{ background: "var(--danger-subtle)", borderLeftColor: "var(--danger)", color: "var(--text-primary)" }}
          >
            <AlertTriangle size={16} style={{ color: "var(--danger)" }} className="mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-medium" style={{ color: "var(--danger)" }}>Kein aktiver LLM-Provider</p>
              <p className="mt-1" style={{ color: "var(--text-secondary)" }}>
                Konfiguriere einen Provider in den Einstellungen und aktiviere ihn, um den Chat zu nutzen.
              </p>
              <Link
                href="/settings"
                className="inline-flex items-center gap-1.5 mt-2 text-xs font-medium transition-default hover:underline"
                style={{ color: "var(--accent)" }}
              >
                <SettingsIcon size={12} /> Zu den Einstellungen
              </Link>
            </div>
          </div>
        )}
        {lastError && (
          <div
            className="mb-4 rounded-lg border-l-2 p-4 text-sm flex items-start gap-3"
            style={{ background: "var(--danger-subtle)", borderLeftColor: "var(--danger)", color: "var(--text-primary)" }}
          >
            <AlertTriangle size={16} style={{ color: "var(--danger)" }} className="mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-medium" style={{ color: "var(--danger)" }}>
                {lastError.code === "provider_config_corrupt"
                  ? "Provider-Konfiguration korrupt"
                  : "Chat-Antwort fehlgeschlagen"}
              </p>
              <p className="mt-1" style={{ color: "var(--text-secondary)" }}>{lastError.message}</p>
              {lastError.code === "provider_config_corrupt" && (
                <Link
                  href="/settings"
                  className="inline-flex items-center gap-1.5 mt-2 text-xs font-medium transition-default hover:underline"
                  style={{ color: "var(--accent)" }}
                >
                  <SettingsIcon size={12} /> Provider neu konfigurieren
                </Link>
              )}
            </div>
            <button
              onClick={clearError}
              className="shrink-0 p-1 rounded transition-default hover:opacity-100"
              style={{ opacity: 0.6, color: "var(--text-muted)" }}
              aria-label="Fehler schließen"
            >
              <X size={14} />
            </button>
          </div>
        )}
        {allMessages.length === 0 && !streaming && !noActiveProvider && (
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
