"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UploadCloud } from "lucide-react";
import { api } from "@/lib/api";
import { useChatStream } from "@/hooks/useChatStream";
import { startUploadWithFlow } from "@/lib/uploadFlow";
import { formatTs } from "@/lib/utils";
import { TextPasteModal } from "@/components/upload/TextPasteModal";
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

  // Page-wide drag-and-drop state.
  const dragDepthRef = useRef(0);
  const [pageDragging, setPageDragging] = useState(false);
  // Page-level paste: a non-empty text paste outside any editable element opens
  // the TextPasteModal pre-filled with the clipboard text.
  const [pastePrefill, setPastePrefill] = useState<string | null>(null);

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

  // -------------------------------------------------------------------------
  // Page-wide drag-and-drop overlay. Uses the enter-counter pattern from
  // DropZone — dragenter/leave fire on every child node, so a boolean alone
  // flickers. We only update visible state when transitioning 0 ↔ 1+.
  // -------------------------------------------------------------------------
  useEffect(() => {
    const hasFiles = (e: DragEvent) =>
      !!e.dataTransfer?.types?.includes("Files");

    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepthRef.current += 1;
      if (dragDepthRef.current === 1) setPageDragging(true);
    };
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
    };
    const onLeave = (e: DragEvent) => {
      // dragleave fires on every child boundary. The counter handles that.
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) setPageDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepthRef.current = 0;
      setPageDragging(false);
      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;

      // Route drop based on target. Files dropped onto the chat input area go
      // through the same upload path; the attachment-card UI is future scope.
      const target = e.target as HTMLElement | null;
      const onChatInput = !!target?.closest?.("[data-chat-input]");
      Array.from(files).forEach((file) => {
        void onChatInput; // route is identical for now (single upload route).
        startUploadWithFlow(file, { projectId, qc });
      });
    };

    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [projectId, qc]);

  // -------------------------------------------------------------------------
  // Page-level clipboard paste (roadmap N). Fires only when the paste target is
  // NOT an editable element — ChatInput owns paste while its textarea is
  // focused (image→attachment-upload, long-text→modal, short-text→native). A
  // paste anywhere else on the cockpit: images upload as screenshots (multiple
  // images → multiple uploads); any non-empty text opens the TextPasteModal
  // (even short notes are worth keeping as a document).
  // -------------------------------------------------------------------------
  useEffect(() => {
    const isEditable = (t: EventTarget | null): boolean => {
      const el = t as HTMLElement | null;
      if (!el || !el.tagName) return false;
      if (el.closest?.("[data-chat-input]")) return true;
      if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") return true;
      return !!el.isContentEditable;
    };

    const onPaste = (e: ClipboardEvent) => {
      if (isEditable(e.target)) return; // ChatInput / native handles it
      const dt = e.clipboardData;
      if (!dt) return;

      const images: File[] = [];
      for (const it of Array.from(dt.items)) {
        if (it.kind === "file" && it.type.startsWith("image/")) {
          const blob = it.getAsFile();
          if (blob) {
            const ext = (it.type.split("/")[1] || "png").split(";")[0];
            images.push(
              new File([blob], `screenshot-${formatTs()}.${ext}`, { type: it.type }),
            );
          }
        }
      }
      if (images.length > 0) {
        e.preventDefault();
        images.forEach((f) => startUploadWithFlow(f, { projectId, qc }));
        return;
      }

      const text = dt.getData("text") ?? "";
      if (text.trim().length > 0) {
        e.preventDefault();
        setPastePrefill(text);
      }
    };

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [projectId, qc]);

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
      className="grid h-full min-h-0 relative"
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
              projectId={projectId}
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

      {/* PAGE-WIDE DROP OVERLAY — pointer-events:none so drop reaches target. */}
      {pageDragging && (
        <div
          data-testid="page-drop-overlay"
          aria-hidden="true"
          className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center"
          style={{
            background: "color-mix(in srgb, var(--accent-subtle) 88%, transparent)",
          }}
        >
          <div
            className="rounded-[var(--radius)] px-10 py-8 flex flex-col items-center gap-3 border-2 border-dashed"
            style={{
              borderColor: "var(--accent)",
              background: "color-mix(in srgb, var(--bg-surface) 92%, transparent)",
            }}
          >
            <UploadCloud size={36} style={{ color: "var(--accent)" }} />
            <p
              className="text-sm font-medium"
              style={{ color: "var(--accent)" }}
            >
              Datei hier ablegen
            </p>
          </div>
        </div>
      )}
      {pastePrefill !== null && (
        <TextPasteModal
          projectId={projectId}
          initialContent={pastePrefill}
          onClose={() => setPastePrefill(null)}
        />
      )}
    </div>
  );
}
