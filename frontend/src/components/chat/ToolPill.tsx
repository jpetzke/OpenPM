"use client";
import { useState } from "react";
import { ChevronDown, ChevronRight, Loader2, CheckCircle2 } from "lucide-react";
import type { ActiveToolCall } from "@/types/chat";

const TOOL_ICONS: Record<string, string> = {
  search_documents: "🔍",
  list_documents: "📄",
  get_document_content: "📖",
  get_current_state: "📊",
  get_state_history: "🕐",
  update_task_status: "✏️",
};

const TOOL_LABELS: Record<string, string> = {
  search_documents: "Durchsuche Dokumente",
  list_documents: "Liste Dokumente auf",
  get_document_content: "Lade Dokument",
  get_current_state: "Lese Projektstatus",
  get_state_history: "Lese State-Historie",
  update_task_status: "Aktualisiere Task",
};

interface Props {
  toolCall: ActiveToolCall;
}

export function ToolPill({ toolCall }: Props) {
  const [expanded, setExpanded] = useState(false);
  const icon = TOOL_ICONS[toolCall.tool_name] ?? "🔧";
  const label = TOOL_LABELS[toolCall.tool_name] ?? toolCall.tool_name;
  const isRunning = toolCall.status === "running";

  return (
    <div
      className="inline-flex flex-col rounded-md text-xs my-0.5 overflow-hidden"
      style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
    >
      <button
        className="flex items-center gap-1.5 px-2.5 py-1.5"
        onClick={() => setExpanded(e => !e)}
        style={{ color: isRunning ? "var(--accent)" : "var(--text-secondary)" }}
      >
        {isRunning
          ? <Loader2 size={11} className="animate-spin" />
          : <CheckCircle2 size={11} style={{ color: "var(--accent)" }} />
        }
        <span>{icon} {isRunning ? `${label}…` : (toolCall.result_summary ?? label)}</span>
        {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
      </button>

      {expanded && (
        <div className="px-2.5 pb-2 space-y-1 border-t" style={{ borderColor: "var(--border)" }}>
          <div className="pt-1.5" style={{ color: "var(--text-muted)" }}>
            <span className="font-mono">{toolCall.tool_name}</span>
          </div>
          {Object.keys(toolCall.args).length > 0 && (
            <div style={{ color: "var(--text-muted)" }}>
              {Object.entries(toolCall.args).map(([k, v]) => (
                <div key={k}><span style={{ color: "var(--text-secondary)" }}>{k}:</span> {String(v).slice(0, 100)}</div>
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
