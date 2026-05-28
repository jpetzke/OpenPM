"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Settings as SettingsIcon, X } from "lucide-react";
import { api } from "@/lib/api";
import { useChatStream } from "@/hooks/useChatStream";
import { ChatMessageComponent } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { ToolPill } from "./ToolPill";
import { MutationCard } from "./MutationCard";
import type { ChatMessage, ModelInfo } from "@/types/chat";

interface ChatInterfaceProps {
  projectId: string;
  onInputFocus?: () => void;
  onSessionIdChange?: (id: string | null) => void;
  onStartNewSession?: (fn: () => void) => void;
  /** When true, the ChatInput is not rendered. The parent provides one. */
  hideInput?: boolean;
  /**
   * Initial user-provided text to immediately send when mounted.
   * Used when the landing-view's chat input transitions into conversation.
   */
  initialPrompt?: string | null;
  onInitialPromptHandled?: () => void;
}

export function ChatInterface({
  projectId,
  onInputFocus,
  onSessionIdChange,
  onStartNewSession,
  hideInput = false,
  initialPrompt = null,
  onInitialPromptHandled,
}: ChatInterfaceProps) {
  const qc = useQueryClient();
  const { streaming, sending, streamingText, activeTools, lastError, currentSessionId, activeToolCalls, mutationCards, sendMessage, abort, clearError, startNewSession } = useChatStream(projectId);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [optimisticMessages, setOptimisticMessages] = useState<ChatMessage[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | undefined>(undefined);

  // Only fetch history when a specific session is active.
  // When currentSessionId is null (new chat), show empty state.
  const { data: history } = useQuery<ChatMessage[]>({
    queryKey: currentSessionId
      ? ["projects", projectId, "chat", "sessions", currentSessionId, "messages"]
      : ["projects", projectId, "chat", "history", "disabled"],
    queryFn: () =>
      currentSessionId
        ? api.get<ChatMessage[]>(`/api/projects/${projectId}/chat/sessions/${currentSessionId}/messages`)
        : Promise.resolve([]),
    enabled: currentSessionId !== null,
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

  // Propagate currentSessionId changes upward.
  useEffect(() => {
    onSessionIdChange?.(currentSessionId);
  }, [currentSessionId, onSessionIdChange]);

  // Register startNewSession with parent so ChatPanel/CockpitLayout can trigger it.
  useEffect(() => {
    onStartNewSession?.(startNewSession);
  }, [startNewSession, onStartNewSession]);

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

  // Fire-and-forget the initial prompt exactly once.
  const handledInitialRef = useRef<string | null>(null);
  useEffect(() => {
    if (!initialPrompt) return;
    if (handledInitialRef.current === initialPrompt) return;
    handledInitialRef.current = initialPrompt;
    handleSend(initialPrompt);
    onInitialPromptHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt]);

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
                  : lastError.code === "budget_exceeded"
                    ? "Monats-Budget aufgebraucht"
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
              {lastError.code === "budget_exceeded" && (
                <Link
                  href={`/projects/${projectId}/usage`}
                  className="inline-flex items-center gap-1.5 mt-2 text-xs font-medium transition-default hover:underline"
                  style={{ color: "var(--accent)" }}
                >
                  Budget erhöhen →
                </Link>
              )}
            </div>
            {/* budget_exceeded banner is non-dismissable */}
            {lastError.code !== "budget_exceeded" && (
              <button
                onClick={clearError}
                className="shrink-0 p-1 rounded transition-default hover:opacity-100"
                style={{ opacity: 0.6, color: "var(--text-muted)" }}
                aria-label="Fehler schließen"
              >
                <X size={14} />
              </button>
            )}
          </div>
        )}
        {allMessages.length === 0 && !streaming && !sending && !noActiveProvider && !hideInput && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4 py-12">
            <p className="text-sm mb-2" style={{ color: "var(--text-muted)" }}>Stell eine Frage zu diesem Projekt</p>
            {["Was sind die offenen Tasks?", "Welche Deadlines stehen an?", "Fasse den aktuellen Status zusammen"].map(prompt => (
              <button
                key={prompt}
                onClick={() => handleSend(prompt)}
                className="text-sm px-4 py-2 rounded-lg w-full max-w-sm text-left"
                style={{ background: "var(--bg-surface)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
              >
                {prompt}
              </button>
            ))}
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
        {activeToolCalls.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {activeToolCalls.map(tc => (
              <ToolPill key={tc.call_id} toolCall={tc} />
            ))}
          </div>
        )}
        {activeTools.length > 0 && activeToolCalls.length === 0 && (
          <div className="mb-4 text-xs" style={{ color: "var(--text-muted)" }}>
            Nutzt Tools: {activeTools.join(", ")}
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      {mutationCards.length > 0 && (
        <div className="px-4 pb-2 flex flex-col gap-1">
          {mutationCards.map(card => (
            <MutationCard key={card.undo_token} card={card} projectId={projectId} />
          ))}
        </div>
      )}
      {!hideInput && (
        <ChatInput
          onSend={handleSend}
          onAbort={handleAbort}
          disabled={sending && !streaming}
          sending={sending || streaming}
          models={models}
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
          onFocus={onInputFocus}
        />
      )}
    </div>
  );
}
