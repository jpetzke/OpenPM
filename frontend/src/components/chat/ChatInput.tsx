"use client";
import { useRef, useCallback } from "react";
import { Send } from "lucide-react";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

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

  return (
    <div
      className="flex items-end gap-2 px-4 py-3 border-t shrink-0"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
    >
      <textarea
        ref={ref}
        rows={1}
        onKeyDown={onKeyDown}
        onChange={onInput}
        disabled={disabled}
        placeholder="Frage stellen..."
        className="flex-1 resize-none outline-none text-sm py-2 px-3 rounded-md"
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          color: "var(--text-primary)",
          maxHeight: "120px",
        }}
      />
      <button
        onClick={submit}
        disabled={disabled}
        className="p-2 rounded-md transition-default disabled:opacity-40 shrink-0"
        style={{ background: "var(--accent)", color: "#fff" }}
        title="Senden (⌘↵)"
        aria-label="Senden"
      >
        <Send size={14} />
      </button>
    </div>
  );
}
