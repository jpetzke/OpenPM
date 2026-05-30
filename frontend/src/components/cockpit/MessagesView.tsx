"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Settings as SettingsIcon, X } from "lucide-react";
import { api } from "@/lib/api";
import { ChatMessageComponent } from "@/components/chat/ChatMessage";
import { MutationCard } from "@/components/chat/MutationCard";
import type {
  ChatMessage,
  ChatStreamError,
  ActiveToolCall,
  MutationCardData,
} from "@/types/chat";

interface ChatStreamApi {
  streaming: boolean;
  sending: boolean;
  streamingText: string;
  activeTools: string[];
  lastError: ChatStreamError | null;
  currentSessionId: string | null;
  activeToolCalls: ActiveToolCall[];
  mutationCards: MutationCardData[];
  clearError: () => void;
}

interface Props {
  projectId: string;
  /** Currently-rendered session — when null, no history is fetched. */
  sessionId: string | null;
  /** Chat stream API from the parent (CockpitLayout). */
  stream: ChatStreamApi;
  /** Optimistic messages tracked by the parent (visible until history lands). */
  optimisticMessages: ChatMessage[];
  /** True when no LLM provider is configured. Shown as a banner. */
  noActiveProvider: boolean;
  selectedModel?: string;
}

export function MessagesView({
  projectId,
  sessionId,
  stream,
  optimisticMessages,
  noActiveProvider,
  selectedModel,
}: Props) {
  const qc = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [historyContainerKey, setHistoryContainerKey] = useState(0);

  const { data: history } = useQuery<ChatMessage[]>({
    queryKey: sessionId
      ? ["projects", projectId, "chat", "sessions", sessionId, "messages"]
      : ["projects", projectId, "chat", "history", "disabled"],
    queryFn: () =>
      sessionId
        ? api.get<ChatMessage[]>(
            `/api/projects/${projectId}/chat/sessions/${sessionId}/messages`,
          )
        : Promise.resolve([]),
    enabled: sessionId !== null,
  });

  // When sessionId changes, force scroll-to-bottom-after-render.
  useEffect(() => {
    setHistoryContainerKey((k) => k + 1);
  }, [sessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, stream.streamingText, stream.activeToolCalls, optimisticMessages]);

  // When stream ends, refetch history for the active session.
  // The parent already kicks off the refetch via the completion callback, but
  // we also invalidate on stream end here to be defensive.
  useEffect(() => {
    if (!stream.streaming && stream.streamingText === "") {
      if (sessionId) {
        qc.invalidateQueries({
          queryKey: ["projects", projectId, "chat", "sessions", sessionId, "messages"],
        });
      }
    }
  }, [stream.streaming, stream.streamingText, sessionId, projectId, qc]);

  const historyList = history ?? [];
  const recentHistoryContents = new Set(
    historyList.slice(-6).map((m) => `${m.role}::${m.content}`),
  );
  const filteredOptimistic = optimisticMessages.filter(
    (m) => !recentHistoryContents.has(`${m.role}::${m.content}`),
  );
  const allMessages = [...historyList, ...filteredOptimistic];
  // Render the live assistant bubble as soon as the agent starts working —
  // either prose is flowing or a tool fired first (tools render inline).
  const shouldRenderStreamingMessage =
    stream.streaming &&
    (Boolean(stream.streamingText) || stream.activeToolCalls.length > 0);

  // Defensive dedup: while a reply is actively streaming, never also show a
  // finalized assistant message that duplicates the in-flight text (the saved
  // message can land via a history refetch before the stream bubble clears).
  // The streaming bubble is the live one; hide the finalized twin until it ends.
  const liveText = shouldRenderStreamingMessage ? stream.streamingText.trim() : "";
  const visibleMessages =
    liveText.length > 8
      ? allMessages.filter(
          (m) =>
            !(
              m.role === "assistant" &&
              (m.content.trim() === liveText ||
                m.content.trim().startsWith(liveText))
            ),
        )
      : allMessages;

  return (
    <div className="flex flex-col h-full" key={historyContainerKey}>
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {noActiveProvider && (
          <div
            className="mb-4 rounded-lg border-l-2 p-4 text-sm flex items-start gap-3"
            style={{
              background: "var(--danger-subtle)",
              borderLeftColor: "var(--danger)",
              color: "var(--text-primary)",
            }}
          >
            <AlertTriangle
              size={16}
              style={{ color: "var(--danger)" }}
              className="mt-0.5 shrink-0"
            />
            <div className="flex-1">
              <p className="font-medium" style={{ color: "var(--danger)" }}>
                Kein aktiver LLM-Provider
              </p>
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
        {stream.lastError && (
          <div
            className="mb-4 rounded-lg border-l-2 p-4 text-sm flex items-start gap-3"
            style={{
              background: "var(--danger-subtle)",
              borderLeftColor: "var(--danger)",
              color: "var(--text-primary)",
            }}
          >
            <AlertTriangle
              size={16}
              style={{ color: "var(--danger)" }}
              className="mt-0.5 shrink-0"
            />
            <div className="flex-1">
              <p className="font-medium" style={{ color: "var(--danger)" }}>
                {stream.lastError.code === "provider_config_corrupt"
                  ? "Provider-Konfiguration korrupt"
                  : "Chat-Antwort fehlgeschlagen"}
              </p>
              <p className="mt-1" style={{ color: "var(--text-secondary)" }}>
                {stream.lastError.message}
              </p>
              {stream.lastError.code === "provider_config_corrupt" && (
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
              onClick={stream.clearError}
              className="shrink-0 p-1 rounded transition-default hover:opacity-100"
              style={{ opacity: 0.6, color: "var(--text-muted)" }}
              aria-label="Fehler schließen"
            >
              <X size={14} />
            </button>
          </div>
        )}
        {visibleMessages.map((msg) => (
          <ChatMessageComponent key={msg.id} message={msg} />
        ))}
        {shouldRenderStreamingMessage && (
          <ChatMessageComponent
            message={{
              id: "streaming",
              project_id: projectId,
              user_id: null,
              role: "assistant",
              content: stream.streamingText,
              // Tool rows render inline at their text offset, live.
              tool_calls: stream.activeToolCalls.length
                ? { invocations: stream.activeToolCalls }
                : null,
              tool_results: null,
              state_version: null,
              model: selectedModel ?? null,
              created_at: new Date().toISOString(),
            }}
            isStreaming
          />
        )}
        {stream.sending && !stream.streamingText && stream.activeToolCalls.length === 0 && (
          <div className="mb-4 text-xs" style={{ color: "var(--text-muted)" }}>
            Anfrage wird gesendet…
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      {stream.mutationCards.length > 0 && (
        <div className="px-4 pb-2 flex flex-col gap-1">
          {stream.mutationCards.map((card) => (
            <MutationCard
              key={card.undo_token}
              card={card}
              projectId={projectId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
