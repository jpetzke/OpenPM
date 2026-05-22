"use client";
import { useRef, useCallback, useState, useEffect } from "react";
import { Loader2, Send, Square } from "lucide-react";
import type { ModelInfo } from "@/types/chat";

interface ChatInputProps {
  onFocus?: () => void;
  onSend: (message: string) => void;
  onAbort?: () => void;
  disabled: boolean;
  sending?: boolean;
  models?: ModelInfo[];
  selectedModel?: string;
  onModelChange?: (model: string) => void;
}

export function ChatInput({
  onSend,
  onAbort,
  disabled,
  sending = false,
  models = [],
  selectedModel,
  onModelChange,
  onFocus,
}: ChatInputProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setIsMobile("ontouchstart" in window);
  }, []);

  const submit = useCallback(() => {
    const val = ref.current?.value.trim();
    if (!val || disabled) return;
    onSend(val);
    if (ref.current) {
      ref.current.value = "";
      ref.current.style.height = "auto";
    }
  }, [onSend, disabled]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isMobile) {
      // On mobile: Enter inserts newline. Cmd/Ctrl+Enter still submits.
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        submit();
      }
      return;
    }
    // Desktop: Enter submits, Shift+Enter inserts newline.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  };

  const onInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  const isActive = sending;

  return (
    <div
      className="flex flex-col gap-2 px-4 py-3 border-t shrink-0"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
    >
      {/* Model selector row */}
      {models.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs shrink-0" style={{ color: "var(--text-muted)" }}>
            Modell:
          </span>
          <select
            value={selectedModel ?? ""}
            onChange={(e) => onModelChange?.(e.target.value)}
            disabled={isActive}
            className="text-xs rounded px-2 py-1 outline-none border disabled:opacity-50"
            style={{
              background: "var(--bg-elevated)",
              borderColor: "var(--border)",
              color: "var(--text-primary)",
            }}
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Input row */}
      <div className="flex items-end gap-2">
        <textarea
          ref={ref}
          rows={1}
          onKeyDown={onKeyDown}
          onChange={onInput}
          onFocus={onFocus}
          disabled={false}
          placeholder="Frage stellen..."
          className="flex-1 resize-none outline-none text-sm py-2 px-3 rounded-md"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
            maxHeight: "120px",
          }}
        />

        {isActive ? (
          <button
            onClick={onAbort}
            className="p-2 rounded-md transition-default shrink-0"
            style={{ background: "var(--danger)", color: "var(--primary-foreground)" }}
            title="Abbrechen"
            aria-label="Abbrechen"
          >
            <Square size={14} />
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={disabled}
            className="p-2 rounded-md transition-default disabled:opacity-40 shrink-0"
            style={{ background: "var(--accent)", color: "var(--primary-foreground)" }}
            title={isMobile ? "Senden" : "Senden (⌘↵)"}
            aria-label="Senden"
          >
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        )}
      </div>
    </div>
  );
}
