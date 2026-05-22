"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useChatStream } from "@/hooks/useChatStream";
import { LandingView } from "./LandingView";
import { ConversationView } from "./ConversationView";
import { StickyChatInput } from "./StickyChatInput";
import { StatusPanel } from "./StatusPanel";
import { DocumentsPanel } from "./DocumentsPanel";
import { BriefingPanel } from "./BriefingPanel";
import type { ChatMessage, ModelInfo } from "@/types/chat";

interface Props {
  projectId: string;
}

export function CockpitLayout({ projectId }: Props) {
  const qc = useQueryClient();
  const stream = useChatStream(projectId);
  const {
    streaming,
    sending,
    streamingText,
    activeTools,
    lastError,
    currentSessionId,
    activeToolCalls,
    mutationCards,
    sendMessage,
    abort,
    clearError,
    startNewSession,
    setSessionId,
  } = stream;

  const [selectedModel, setSelectedModel] = useState<string | undefined>(undefined);
  const [optimisticMessages, setOptimisticMessages] = useState<ChatMessage[]>([]);
  // Local view state: when null && messages empty → landing, otherwise conversation.
  const [viewMode, setViewMode] = useState<"landing" | "conversation">("landing");

  const { data: models, error: modelsError } = useQuery<ModelInfo[]>({
    queryKey: ["settings", "models"],
    queryFn: () => api.get<ModelInfo[]>("/api/settings/models"),
    retry: false,
  });
  const noActiveProvider =
    (modelsError as { status?: number } | null)?.status === 503;

  // Set default model once models are loaded. Prefer chat role.
  useEffect(() => {
    if (!models || models.length === 0 || selectedModel) return;
    const chatModel = models.find((m) => m.role === "chat") ?? models[0];
    setSelectedModel(chatModel.id);
  }, [models, selectedModel]);

  // Switch to conversation when a session is active OR when streaming starts.
  useEffect(() => {
    if (currentSessionId || streaming || sending || optimisticMessages.length > 0) {
      setViewMode("conversation");
    }
  }, [currentSessionId, streaming, sending, optimisticMessages.length]);

  // Cmd+N / Ctrl+N — new chat (back to landing).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "n" && !e.shiftKey) {
        e.preventDefault();
        handleBackToLanding();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSend = useCallback(
    (content: string) => {
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
      setViewMode("conversation");

      sendMessage(
        content,
        async (assistantText, success) => {
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
            // Refetch both the session list and the active session's messages.
            await Promise.all([
              qc.refetchQueries({
                queryKey: ["projects", projectId, "chat/sessions"],
                exact: true,
              }),
              qc.refetchQueries({
                queryKey: ["projects", projectId, "chat", "history"],
                exact: true,
              }),
            ]);
          } finally {
            setOptimisticMessages([]);
          }
        },
        selectedModel,
      );
    },
    [projectId, selectedModel, sendMessage, qc],
  );

  const handleAbort = useCallback(() => {
    abort();
    setOptimisticMessages([]);
    qc.invalidateQueries({
      queryKey: ["projects", projectId, "chat", "history"],
    });
  }, [abort, projectId, qc]);

  const handleSessionSelect = useCallback(
    (id: string) => {
      abort();
      setOptimisticMessages([]);
      setSessionId(id);
      setViewMode("conversation");
    },
    [abort, setSessionId],
  );

  const handleBackToLanding = useCallback(() => {
    abort();
    setOptimisticMessages([]);
    startNewSession();
    setViewMode("landing");
  }, [abort, startNewSession]);

  const handlePromptClick = useCallback(
    (text: string) => {
      handleSend(text);
    },
    [handleSend],
  );

  const streamApi = useMemo(
    () => ({
      streaming,
      sending,
      streamingText,
      activeTools,
      lastError,
      currentSessionId,
      activeToolCalls,
      mutationCards,
      clearError,
    }),
    [
      streaming,
      sending,
      streamingText,
      activeTools,
      lastError,
      currentSessionId,
      activeToolCalls,
      mutationCards,
      clearError,
    ],
  );

  const inputSending = sending || streaming;

  return (
    <div
      className="grid h-full min-h-0"
      style={{
        background: "var(--bg-base)",
        gridTemplateColumns: "1fr 340px",
      }}
    >
      {/* CENTER COLUMN */}
      <div className="flex flex-col h-full min-h-0 min-w-0 overflow-hidden">
        <div className="flex-1 min-h-0 overflow-y-auto">
          {viewMode === "landing" ? (
            <LandingView
              projectId={projectId}
              onSessionSelect={handleSessionSelect}
              onPromptClick={handlePromptClick}
              onSend={handleSend}
              onAbort={handleAbort}
              inputDisabled={inputSending && !streaming}
              inputSending={inputSending}
              models={models}
              selectedModel={selectedModel}
              onModelChange={setSelectedModel}
            />
          ) : (
            <ConversationView
              projectId={projectId}
              sessionId={currentSessionId}
              stream={streamApi}
              optimisticMessages={optimisticMessages}
              noActiveProvider={noActiveProvider}
              selectedModel={selectedModel}
              onBack={handleBackToLanding}
            />
          )}
        </div>
        {viewMode === "conversation" && (
          <div
            className="shrink-0 border-t"
            style={{ borderColor: "var(--border)" }}
          >
            <StickyChatInput
              onSend={handleSend}
              onAbort={handleAbort}
              disabled={inputSending && !streaming}
              sending={inputSending}
              models={models}
              selectedModel={selectedModel}
              onModelChange={setSelectedModel}
            />
          </div>
        )}
      </div>

      {/* RIGHT COLUMN */}
      <aside
        className="border-l h-full min-h-0 overflow-y-auto flex flex-col gap-3 px-3 py-4 app-scrollbar"
        style={{
          background: "var(--bg-surface)",
          borderColor: "var(--border)",
        }}
      >
        <StatusPanel projectId={projectId} />
        <DocumentsPanel projectId={projectId} />
        <BriefingPanel projectId={projectId} />
      </aside>
    </div>
  );
}
