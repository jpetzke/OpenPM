"use client";
import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Check,
  Search,
  Files,
  FileText,
  LayoutDashboard,
  History,
  PencilLine,
  Wrench,
} from "lucide-react";
import type { ActiveToolCall } from "@/types/chat";

// Copilot-respectful chips: each tool call announces its intent in plain
// language while running, and resolves to a one-line result. Expand to see
// exactly which tool ran with what arguments — nothing happens off-screen.
const TOOL_ICONS: Record<string, typeof Search> = {
  search_documents: Search,
  list_documents: Files,
  get_document_content: FileText,
  get_current_state: LayoutDashboard,
  get_state_history: History,
  update_task_status: PencilLine,
};

const TOOL_LABELS: Record<string, string> = {
  search_documents: "Durchsucht Dokumente",
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
  const accent = isRunning ? "var(--accent)" : "var(--success)";

  return (
    <div
      className="inline-flex flex-col rounded-md text-xs overflow-hidden max-w-full"
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderLeft: `2px solid ${accent}`,
      }}
    >
      <button
        className="flex items-center gap-1.5 px-2.5 py-1.5 min-w-0"
        onClick={() => setExpanded((e) => !e)}
        style={{ color: isRunning ? "var(--accent)" : "var(--text-secondary)" }}
      >
        {isRunning ? (
          <Loader2 size={12} className="animate-spin shrink-0" />
        ) : (
          <Check size={12} strokeWidth={2.5} className="shrink-0" style={{ color: "var(--success)" }} />
        )}
        <Icon size={12} className="shrink-0" style={{ color: accent }} />
        <span className={`truncate ${isRunning ? "animate-pipeline-pulse" : ""}`}>
          {isRunning ? `${label}…` : (toolCall.result_summary ?? label)}
        </span>
        {expanded ? (
          <ChevronDown size={11} className="shrink-0 ml-0.5" />
        ) : (
          <ChevronRight size={11} className="shrink-0 ml-0.5" />
        )}
      </button>

      {expanded && (
        <div
          className="px-2.5 pb-2 pt-1.5 space-y-1 border-t"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="font-mono text-[11px]" style={{ color: "var(--text-muted)" }}>
            {toolCall.tool_name}
          </div>
          {Object.keys(toolCall.args).length > 0 && (
            <div className="space-y-0.5" style={{ color: "var(--text-muted)" }}>
              {Object.entries(toolCall.args).map(([k, v]) => (
                <div key={k} className="break-words">
                  <span style={{ color: "var(--text-secondary)" }}>{k}:</span>{" "}
                  <span className="font-mono">{String(v).slice(0, 120)}</span>
                </div>
              ))}
            </div>
          )}
          {toolCall.result_summary && (
            <div style={{ color: "var(--text-secondary)" }}>→ {toolCall.result_summary}</div>
          )}
        </div>
      )}
    </div>
  );
}
