"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import { MessagesView } from "./MessagesView";
import type {
  ChatMessage,
  ChatSession,
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
  sessionId: string | null;
  stream: ChatStreamApi;
  optimisticMessages: ChatMessage[];
  noActiveProvider: boolean;
  selectedModel?: string;
  onBack: () => void;
}

export function ConversationView({
  projectId,
  sessionId,
  stream,
  optimisticMessages,
  noActiveProvider,
  selectedModel,
  onBack,
}: Props) {
  const { data: sessions } = useQuery<ChatSession[]>({
    queryKey: ["projects", projectId, "chat/sessions"],
    queryFn: () =>
      api.get<ChatSession[]>(`/api/projects/${projectId}/chat/sessions`),
    enabled: sessionId !== null,
  });

  const currentSession = sessions?.find((s) => s.id === sessionId);
  const title = sessionId
    ? (currentSession?.title ?? "Chat")
    : "Neuer Chat";

  return (
    <div className="flex flex-col h-full">
      <header
        className="flex items-center gap-3 px-6 py-3 border-b shrink-0"
        style={{ borderColor: "var(--border)" }}
      >
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md transition-default"
          style={{
            border: "1px solid var(--border)",
            color: "var(--text-secondary)",
            background: "transparent",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background =
              "var(--bg-surface)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background =
              "transparent";
          }}
        >
          <ArrowLeft size={12} />
          Zurück
        </button>
        <h2
          className="text-sm truncate"
          style={{ color: "var(--text-primary)" }}
        >
          {title}
        </h2>
      </header>

      <div className="flex-1 min-h-0">
        <MessagesView
          projectId={projectId}
          sessionId={sessionId}
          stream={stream}
          optimisticMessages={optimisticMessages}
          noActiveProvider={noActiveProvider}
          selectedModel={selectedModel}
        />
      </div>
    </div>
  );
}
