"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Briefcase, Calendar, BarChart2, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";
import { ChatInput } from "@/components/chat/ChatInput";
import type { Project } from "@/types/project";
import type { ChatSession, ModelInfo } from "@/types/chat";

interface Props {
  projectId: string;
  onSessionSelect: (id: string) => void;
  onPromptClick: (text: string) => void;
  // Chat-input props — der Input wird hier INLINE gerendert (kein sticky-bottom).
  onSend: (content: string) => void;
  onAbort?: () => void;
  inputDisabled: boolean;
  inputSending: boolean;
  models?: ModelInfo[];
  selectedModel?: string;
  onModelChange?: (model: string) => void;
}

const SUGGESTED_PROMPTS = [
  { icon: Briefcase, text: "Was sind die offenen Tasks?" },
  { icon: Calendar, text: "Welche Deadlines stehen an?" },
  { icon: BarChart2, text: "Fasse den aktuellen Status zusammen" },
];

export function LandingView({
  projectId,
  onSessionSelect,
  onPromptClick,
  onSend,
  onAbort,
  inputDisabled,
  inputSending,
  models,
  selectedModel,
  onModelChange,
}: Props) {
  const { data: project } = useQuery<Project>({
    queryKey: ["projects", projectId],
    queryFn: () => api.get<Project>(`/api/projects/${projectId}`),
  });

  const { data: sessions, isLoading: sessionsLoading } = useQuery<ChatSession[]>({
    queryKey: ["projects", projectId, "chat/sessions"],
    queryFn: () => api.get<ChatSession[]>(`/api/projects/${projectId}/chat/sessions`),
  });

  return (
    <div className="px-12 py-8 max-w-3xl mx-auto w-full">
      <Link
        href="/projects"
        className="inline-block text-[13px] transition-default mb-3 hover:underline"
        style={{ color: "var(--text-muted)" }}
      >
        ← Alle Projekte
      </Link>

      <h1
        className="text-2xl font-semibold mb-1 flex items-center gap-3"
        style={{ color: "var(--text-primary)" }}
      >
        {project?.name ?? "—"}
        {project && (
          <span
            className="text-[11px] px-2.5 py-0.5 rounded-full"
            style={{
              background: "var(--accent-subtle)",
              color: "var(--accent)",
            }}
          >
            ● {statusLabel(project.status)}
          </span>
        )}
      </h1>
      <p
        className="text-[13px] mb-6"
        style={{ color: "var(--text-muted)" }}
      >
        {project?.client_name ? `${project.client_name} · ` : ""}
        {project?.updated_at
          ? `Letzte Aktivität ${formatRelativeTime(project.updated_at)}`
          : ""}
        {project?.open_task_count != null
          ? ` · ${project.open_task_count} offene Tasks`
          : ""}
      </p>

      {/* PROMINENT INLINE CHAT-INPUT — wie Claude.ai Project-Page. */}
      <section
        className="mb-8 rounded-lg overflow-hidden"
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-strong)",
        }}
        aria-label="Neue Nachricht"
      >
        <ChatInput
          onSend={onSend}
          onAbort={onAbort}
          disabled={inputDisabled}
          sending={inputSending}
          models={models}
          selectedModel={selectedModel}
          onModelChange={onModelChange}
          projectId={projectId}
        />
      </section>

      <section className="mb-8" aria-label="Vorschläge">
        <h2
          className="text-xs uppercase tracking-wide mb-2"
          style={{ color: "var(--text-muted)", fontWeight: 500 }}
        >
          Vorschläge
        </h2>
        <div className="flex flex-col gap-2">
          {SUGGESTED_PROMPTS.map(({ icon: Icon, text }) => (
            <button
              key={text}
              type="button"
              onClick={() => onPromptClick(text)}
              className="rounded-lg px-3.5 py-3 text-left flex items-center gap-2.5 transition-default text-[13px]"
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
                color: "var(--text-secondary)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor =
                  "var(--border-strong)";
                (e.currentTarget as HTMLButtonElement).style.color =
                  "var(--text-primary)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor =
                  "var(--border)";
                (e.currentTarget as HTMLButtonElement).style.color =
                  "var(--text-secondary)";
              }}
            >
              <Icon size={14} style={{ color: "var(--text-muted)" }} />
              {text}
            </button>
          ))}
        </div>
      </section>

      <section aria-label="Letzte Chats">
        <h2
          className="text-[13px] mb-3"
          style={{ color: "var(--text-secondary)", fontWeight: 500 }}
        >
          Letzte Chats
        </h2>

        {sessionsLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-12 rounded animate-pulse"
                style={{ background: "var(--bg-elevated)" }}
              />
            ))}
          </div>
        ) : !sessions || sessions.length === 0 ? (
          <p className="text-xs py-3" style={{ color: "var(--text-muted)" }}>
            Noch keine vergangenen Chats. Stell oben deine erste Frage.
          </p>
        ) : (
          <ul>
            {sessions.map((session) => (
              <li key={session.id}>
                <button
                  type="button"
                  onClick={() => onSessionSelect(session.id)}
                  className="w-full flex items-start justify-between gap-4 py-3.5 px-0 text-left transition-default border-b"
                  style={{ borderColor: "var(--border)" }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background =
                      "var(--bg-surface)";
                    (e.currentTarget as HTMLButtonElement).style.paddingLeft =
                      "8px";
                    (e.currentTarget as HTMLButtonElement).style.paddingRight =
                      "8px";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background =
                      "transparent";
                    (e.currentTarget as HTMLButtonElement).style.paddingLeft =
                      "0px";
                    (e.currentTarget as HTMLButtonElement).style.paddingRight =
                      "0px";
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-sm truncate mb-0.5"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {session.title ?? "Ohne Titel"}
                    </div>
                    <div
                      className="text-xs"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {formatRelativeTime(session.last_message_at)} ·{" "}
                      {session.message_count} Nachrichten
                    </div>
                  </div>
                  <ChevronRight
                    size={16}
                    className="shrink-0 mt-1"
                    style={{ color: "var(--text-muted)" }}
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function statusLabel(s: string): string {
  if (s === "active") return "aktiv";
  if (s === "paused") return "pausiert";
  return "archiviert";
}
