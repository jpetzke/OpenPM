"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { takePendingMessages, bufferPendingMessage } from "@/lib/authClient";
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
import { StaleBanner } from "./StaleBanner";
import { PipelineStrip } from "./PipelineStrip";
import type { ChatMessage, ModelInfo, ChatSession } from "@/types/chat";
import type { ProjectState, StateChangelog, Task, Deadline, Blocker, Contact } from "@/types/state";
import type { Project } from "@/types/project";
import type { Document } from "@/types/document";
import type { SlashCommandName } from "@/lib/slash-commands";

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

  // Keep the latest viewMode in a ref so the keyboard effect (empty deps) reads
  // current state without re-subscribing.
  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;

  // New-chat is triggered globally via Cmd/Ctrl+N (useGlobalKeybindings emits
  // the `openpm:new-chat` event). Esc is two-stage: first unfocus the chat
  // input, then (input already blurred) close the conversation → landing.
  // Open modals consume Esc first (capture-phase listeners with stopPropagation).
  useEffect(() => {
    const onNewChat = () => handleBackToLanding();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const active = document.activeElement as HTMLElement | null;
      if (active?.closest?.("[data-chat-input]")) {
        active.blur();
        return;
      }
      if (viewModeRef.current === "conversation") {
        handleBackToLanding();
      }
    };
    window.addEventListener("openpm:new-chat", onNewChat);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("openpm:new-chat", onNewChat);
      window.removeEventListener("keydown", onKey);
    };
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
        async (assistantText, success, errorCode, invocations) => {
          // If auth expired and refresh also failed, buffer the message for replay
          if (!success && errorCode === "auth_expired") {
            bufferPendingMessage(projectId, currentSessionId, content);
          }
          if (success && (assistantText || invocations?.length)) {
            setOptimisticMessages((prev) => [
              ...prev,
              {
                id: `optimistic-assistant-${crypto.randomUUID()}`,
                project_id: projectId,
                user_id: null,
                role: "assistant",
                content: assistantText,
                // Carry the finished tool rows forward so they stay on screen
                // (at the right offset) until the persisted history lands.
                tool_calls: invocations?.length ? { invocations } : null,
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
    [projectId, selectedModel, sendMessage, qc, currentSessionId],
  );

  // Replay any messages that were buffered during a previous auth-expired session
  useEffect(() => {
    const pending = takePendingMessages(projectId);
    if (pending.length === 0) return;
    // Replay oldest-first with a small stagger so the stream doesn't collide
    let delay = 0;
    for (const msg of pending) {
      const content = msg.content;
      setTimeout(() => handleSend(content), delay);
      delay += 200;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

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
  // Slash-command executor — all commands run locally, zero LLM round-trips.
  // Local messages are pushed into optimisticMessages; they are ephemeral
  // (cleared on the next real send / reload), which is acceptable per spec.
  // -------------------------------------------------------------------------
  const pushLocalMessages = useCallback(
    (userContent: string, assistantContent: string) => {
      const now = new Date().toISOString();
      const userMsg: ChatMessage = {
        id: `local-user-${crypto.randomUUID()}`,
        project_id: projectId,
        user_id: null,
        role: "user",
        content: userContent,
        tool_calls: null,
        tool_results: null,
        state_version: null,
        model: null,
        created_at: now,
      };
      const assistantMsg: ChatMessage = {
        id: `local-assistant-${crypto.randomUUID()}`,
        project_id: projectId,
        user_id: null,
        role: "assistant",
        content: assistantContent,
        tool_calls: null,
        tool_results: null,
        state_version: null,
        model: null,
        is_local_command: true,
        created_at: now,
      };
      setOptimisticMessages((prev) => [...prev, userMsg, assistantMsg]);
      setViewMode("conversation");
    },
    [projectId],
  );

  const handleSlashCommand = useCallback(
    async (name: string, arg: string) => {
      const rawInput = arg ? `/${name} ${arg}` : `/${name}`;

      switch (name as SlashCommandName) {
        // ── /status ──────────────────────────────────────────────────────────
        case "status": {
          let stateData = qc.getQueryData<ProjectState>(["projects", projectId, "state"]);
          if (!stateData) {
            stateData = await api.get<ProjectState>(`/api/projects/${projectId}/state`);
          }
          const core = stateData?.state?.core ?? {};
          const lines = [
            "## Projektstatus",
            "",
            `| Bereich | Anzahl |`,
            `|---|---|`,
            `| Offene Aufgaben | ${core.open_tasks?.length ?? 0} |`,
            `| Fristen | ${core.deadlines?.length ?? 0} |`,
            `| Blocker | ${core.blockers?.length ?? 0} |`,
            `| Kontakte | ${core.contacts?.length ?? 0} |`,
            `| Entscheidungen | ${core.decisions?.length ?? 0} |`,
            `| State-Version | ${stateData?.version ?? "–"} |`,
          ];
          pushLocalMessages(rawInput, lines.join("\n"));
          break;
        }

        // ── /tasks ───────────────────────────────────────────────────────────
        case "tasks": {
          let stateData = qc.getQueryData<ProjectState>(["projects", projectId, "state"]);
          if (!stateData) {
            stateData = await api.get<ProjectState>(`/api/projects/${projectId}/state`);
          }
          const tasks: Task[] = (stateData?.state?.core?.open_tasks ?? [])
            .filter((t) => t.status !== "done")
            .sort((a, b) => {
              if (!a.deadline && !b.deadline) return 0;
              if (!a.deadline) return 1;
              if (!b.deadline) return -1;
              return a.deadline.localeCompare(b.deadline);
            });
          if (tasks.length === 0) {
            pushLocalMessages(rawInput, "_Keine offenen Aufgaben._");
          } else {
            const lines = [
              "## Offene Aufgaben",
              "",
              ...tasks.map((t) => {
                const due = t.deadline ? ` · Fällig: ${t.deadline}` : "";
                const who = t.assignee ? ` · ${t.assignee}` : "";
                const blocked = t.status === "blocked" ? " 🔴" : "";
                return `- **${t.title}**${blocked}${due}${who}`;
              }),
            ];
            pushLocalMessages(rawInput, lines.join("\n"));
          }
          break;
        }

        // ── /deadlines ────────────────────────────────────────────────────────
        case "deadlines": {
          let stateData = qc.getQueryData<ProjectState>(["projects", projectId, "state"]);
          if (!stateData) {
            stateData = await api.get<ProjectState>(`/api/projects/${projectId}/state`);
          }
          const today = new Date().toISOString().slice(0, 10);
          const all: Deadline[] = stateData?.state?.core?.deadlines ?? [];
          const upcoming = all
            .filter((d) => !d.date || d.date >= today)
            .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
          const overdue = all
            .filter((d) => d.date && d.date < today)
            .sort((a, b) => b.date!.localeCompare(a.date!));
          if (all.length === 0) {
            pushLocalMessages(rawInput, "_Keine Fristen eingetragen._");
          } else {
            const lines = ["## Fristen", ""];
            if (upcoming.length > 0) {
              lines.push("**Bevorstehend**", "");
              upcoming.forEach((d) => {
                lines.push(`- **${d.title}**${d.date ? ` — ${d.date}` : ""}`);
              });
            }
            if (overdue.length > 0) {
              lines.push("", "**Überfällig**", "");
              overdue.forEach((d) => {
                lines.push(`- ~~${d.title}~~ — ${d.date}`);
              });
            }
            pushLocalMessages(rawInput, lines.join("\n"));
          }
          break;
        }

        // ── /blockers ─────────────────────────────────────────────────────────
        case "blockers": {
          let stateData = qc.getQueryData<ProjectState>(["projects", projectId, "state"]);
          if (!stateData) {
            stateData = await api.get<ProjectState>(`/api/projects/${projectId}/state`);
          }
          const blockers: Blocker[] = stateData?.state?.core?.blockers ?? [];
          if (blockers.length === 0) {
            pushLocalMessages(rawInput, "_Keine Blocker._");
          } else {
            const lines = [
              "## Blocker",
              "",
              ...blockers.map((b) => `- **${b.title}**${b.description ? `\n  ${b.description}` : ""}`),
            ];
            pushLocalMessages(rawInput, lines.join("\n"));
          }
          break;
        }

        // ── /contacts ─────────────────────────────────────────────────────────
        case "contacts": {
          let stateData = qc.getQueryData<ProjectState>(["projects", projectId, "state"]);
          if (!stateData) {
            stateData = await api.get<ProjectState>(`/api/projects/${projectId}/state`);
          }
          const contacts: Contact[] = stateData?.state?.core?.contacts ?? [];
          if (contacts.length === 0) {
            pushLocalMessages(rawInput, "_Keine Kontakte._");
          } else {
            const lines = [
              "## Kontakte",
              "",
              ...contacts.map((c) => {
                const email = c.email ? ` · ${c.email}` : "";
                const role = c.role ? ` · ${c.role}` : "";
                return `- **${c.name}**${role}${email}`;
              }),
            ];
            pushLocalMessages(rawInput, lines.join("\n"));
          }
          break;
        }

        // ── /search <query> ───────────────────────────────────────────────────
        case "search": {
          if (!arg.trim()) {
            pushLocalMessages(rawInput, "_Bitte einen Suchbegriff angeben: `/search <Begriff>`_");
            break;
          }
          try {
            const result = await api.post<{
              query: string;
              results: { chunk_text: string; document_id: string; source_filename: string; score: number }[];
            }>(`/api/projects/${projectId}/search`, { query: arg, limit: 5 });
            if (result.results.length === 0) {
              pushLocalMessages(rawInput, `_Keine Treffer für „${arg}"._`);
            } else {
              const lines = [`## Suche: „${arg}"`, ""];
              result.results.forEach((r, i) => {
                const score = (r.score * 100).toFixed(0);
                const snippet = r.chunk_text.slice(0, 200).replace(/\n/g, " ");
                lines.push(
                  `**${i + 1}. ${r.source_filename}** (Score: ${score}%)`,
                  `> ${snippet}${r.chunk_text.length > 200 ? "…" : ""}`,
                  "",
                );
              });
              pushLocalMessages(rawInput, lines.join("\n"));
            }
          } catch {
            pushLocalMessages(rawInput, "_Suche fehlgeschlagen. Bitte erneut versuchen._");
          }
          break;
        }

        // ── /export ───────────────────────────────────────────────────────────
        case "export": {
          try {
            const proj = await api.get<Project>(`/api/projects/${projectId}`);
            if (!proj.compiled_briefing) {
              toast.info("Kein Briefing vorhanden");
            } else {
              const date = new Date().toISOString().slice(0, 10);
              const blob = new Blob([proj.compiled_briefing], { type: "text/markdown" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `briefing-${date}.md`;
              a.click();
              URL.revokeObjectURL(url);
              pushLocalMessages(rawInput, `_Briefing als \`briefing-${date}.md\` heruntergeladen._`);
            }
          } catch {
            toast.error("Export fehlgeschlagen");
          }
          break;
        }

        // ── /cancel ───────────────────────────────────────────────────────────
        case "cancel": {
          try {
            const docs = qc.getQueryData<Document[]>(["projects", projectId, "documents"])
              ?? await api.get<Document[]>(`/api/projects/${projectId}/documents`);
            const active = docs.filter(
              (d) => d.processing_status === "pending" || d.processing_status === "processing",
            );
            if (active.length === 0) {
              pushLocalMessages(rawInput, "_Keine laufenden Pipelines gefunden._");
              break;
            }
            await Promise.allSettled(
              active.map((d) =>
                api.delete(`/api/projects/${projectId}/documents/${d.id}?cancel_pipeline=true`),
              ),
            );
            toast.success(`${active.length} Pipeline${active.length > 1 ? "s" : ""} abgebrochen`);
            pushLocalMessages(rawInput, `_${active.length} Pipeline${active.length > 1 ? "s" : ""} abgebrochen._`);
          } catch {
            toast.error("Abbruch fehlgeschlagen");
          }
          break;
        }

        // ── /clear ────────────────────────────────────────────────────────────
        case "clear": {
          try {
            await api.post<ChatSession>(`/api/projects/${projectId}/chat/sessions`, {});
          } catch {
            // ignore — startNewSession creates a fresh client slot even without a server session
          }
          handleBackToLanding();
          break;
        }

        // ── /version ──────────────────────────────────────────────────────────
        case "version": {
          try {
            const [stateResp, historyResp] = await Promise.all([
              api.get<ProjectState>(`/api/projects/${projectId}/state`),
              api.get<StateChangelog[]>(`/api/projects/${projectId}/state/history`),
            ]);
            const latest = historyResp?.[0];
            const lines = [
              "## State-Version",
              "",
              `**Aktuelle Version:** ${stateResp?.version ?? "–"}`,
              "",
            ];
            if (latest) {
              lines.push(
                "**Letzter Changelog:**",
                `- Version ${latest.from_version ?? "–"} → ${latest.to_version}`,
                `- Auslöser: \`${latest.triggered_by}\``,
                `- ${new Date(latest.created_at).toLocaleString("de-DE")}`,
              );
            }
            pushLocalMessages(rawInput, lines.join("\n"));
          } catch {
            pushLocalMessages(rawInput, "_Versionsdaten nicht verfügbar._");
          }
          break;
        }

        // ── /help ─────────────────────────────────────────────────────────────
        case "help": {
          const lines = [
            "## Slash-Befehle",
            "",
            "| Befehl | Beschreibung |",
            "|---|---|",
            "| `/status` | Projekt-Zusammenfassung |",
            "| `/tasks` | Offene Aufgaben nach Fälligkeitsdatum |",
            "| `/deadlines` | Bevorstehende & überfällige Fristen |",
            "| `/blockers` | Offene Blocker |",
            "| `/contacts` | Kontaktliste |",
            "| `/search <Begriff>` | Semantische Dokumentensuche |",
            "| `/export` | Briefing als .md herunterladen |",
            "| `/cancel` | Laufende Pipelines abbrechen |",
            "| `/clear` | Neuen Chat starten |",
            "| `/version` | State-Version & letzter Changelog |",
            "| `/help` | Diese Übersicht |",
          ];
          pushLocalMessages(rawInput, lines.join("\n"));
          break;
        }

        default:
          pushLocalMessages(rawInput, `_Unbekannter Befehl: \`/${name}\`. Tippe \`/help\` für eine Übersicht._`);
      }
    },
    [projectId, qc, pushLocalMessages, handleBackToLanding],
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
        <PipelineStrip projectId={projectId} />
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
              onSlashCommand={handleSlashCommand}
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
              onSlashCommand={handleSlashCommand}
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
        <StaleBanner projectId={projectId} />
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
