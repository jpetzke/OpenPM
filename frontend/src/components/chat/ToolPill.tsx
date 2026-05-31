"use client";
import { useState } from "react";
import {
  ChevronRight,
  Loader2,
  Search,
  Files,
  FileText,
  LayoutDashboard,
  History,
  PencilLine,
  MessagesSquare,
  Wrench,
} from "lucide-react";
import type { ActiveToolCall } from "@/types/chat";

// A single agent tool call, rendered as a quiet, claude.ai-style collapsible
// row that sits inline at the point in the answer where the tool fired.
// Collapsed by default: one muted line with an icon + chevron. Click to unfold
// the exact tool name, arguments, and one-line result — nothing runs off-screen.
const TOOL_ICONS: Record<string, typeof Search> = {
  search_documents: Search,
  search_chat_history: MessagesSquare,
  list_documents: Files,
  get_document_content: FileText,
  get_current_state: LayoutDashboard,
  get_state_history: History,
  update_task_status: PencilLine,
};

// Present-tense, while-running labels. Once done we prefer the result summary.
const TOOL_LABELS: Record<string, string> = {
  search_documents: "Durchsucht Dokumente",
  search_chat_history: "Durchsucht Chatverlauf",
  list_documents: "Listet Dokumente auf",
  get_document_content: "Liest Dokument",
  get_current_state: "Liest Projektstatus",
  get_state_history: "Liest State-Historie",
  update_task_status: "Aktualisiert Task",
};

interface Props {
  toolCall: ActiveToolCall;
}

export function ToolPill({ toolCall }: Props) {
  const [expanded, setExpanded] = useState(false);
  const Icon = TOOL_ICONS[toolCall.tool_name] ?? Wrench;
  const label = TOOL_LABELS[toolCall.tool_name] ?? toolCall.tool_name;
  const isRunning = toolCall.status === "running";
  const headline = isRunning
    ? `${label}…`
    : (toolCall.result_summary ?? label);
  const args = Object.entries(toolCall.args ?? {});

  return (
    <div className="my-1.5">
      <button
        type="button"
        data-testid="tool-row"
        onClick={() => setExpanded((e) => !e)}
        className="group inline-flex max-w-full items-center gap-1.5 rounded-md -ml-1.5 px-1.5 py-1 text-xs transition-default"
        style={{ color: isRunning ? "var(--accent)" : "var(--text-muted)" }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background =
            "var(--bg-elevated)";
          if (!isRunning)
            (e.currentTarget as HTMLButtonElement).style.color =
              "var(--text-secondary)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "transparent";
          if (!isRunning)
            (e.currentTarget as HTMLButtonElement).style.color =
              "var(--text-muted)";
        }}
        aria-expanded={expanded}
      >
        {isRunning ? (
          <Loader2 size={13} className="shrink-0 animate-spin" />
        ) : (
          <Icon size={13} className="shrink-0" style={{ opacity: 0.85 }} />
        )}
        <span className={`truncate ${isRunning ? "animate-pipeline-pulse" : ""}`}>
          {headline}
        </span>
        <ChevronRight
          size={12}
          className="shrink-0 transition-transform"
          style={{
            transform: expanded ? "rotate(90deg)" : "none",
            opacity: 0.6,
          }}
        />
      </button>

      {expanded && (
        <div
          className="mt-1 ml-1.5 space-y-1 pl-3 text-xs animate-fade-in"
          style={{ borderLeft: "1px solid var(--border)" }}
        >
          <div
            className="font-mono text-[11px]"
            style={{ color: "var(--text-muted)" }}
          >
            {toolCall.tool_name}
          </div>
          {args.length > 0 && (
            <div className="space-y-0.5" style={{ color: "var(--text-muted)" }}>
              {args.map(([k, v]) => (
                <div key={k} className="break-words">
                  <span style={{ color: "var(--text-secondary)" }}>{k}</span>:{" "}
                  <span className="font-mono">{String(v).slice(0, 160)}</span>
                </div>
              ))}
            </div>
          )}
          {toolCall.result_summary && !isRunning && (
            <div style={{ color: "var(--text-secondary)" }}>
              → {toolCall.result_summary}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
