"use client";
import { useRef, useCallback, useState, useEffect } from "react";
import { Loader2, Paperclip, Send, Square } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import type { ModelInfo } from "@/types/chat";
import { startUploadWithFlow } from "@/lib/uploadFlow";
import { formatTs } from "@/lib/utils";
import { TextPasteModal } from "@/components/upload/TextPasteModal";

interface ChatInputProps {
  onFocus?: () => void;
  onSend: (message: string) => void;
  onAbort?: () => void;
  disabled: boolean;
  sending?: boolean;
  models?: ModelInfo[];
  selectedModel?: string;
  onModelChange?: (model: string) => void;
  /**
   * When provided, the paperclip and paste-image flows can upload directly to
   * the project's documents endpoint. Without it, the icon is hidden.
   */
  projectId?: string;
}

const LONG_TEXT_THRESHOLD = 200;

export function ChatInput({
  onSend,
  onAbort,
  disabled,
  sending = false,
  models = [],
  selectedModel,
  onModelChange,
  onFocus,
  projectId,
}: ChatInputProps) {
  const qc = useQueryClient();
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [pasteModal, setPasteModal] = useState<{ initial: string } | null>(null);

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

  const handleUploadFile = useCallback(
    (file: File) => {
      if (!projectId) return;
      startUploadWithFlow(file, {
        projectId,
        qc,
        onOpenTextPaste: () => setPasteModal({ initial: "" }),
      });
    },
    [projectId, qc],
  );

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      Array.from(e.target.files).forEach(handleUploadFile);
    }
    e.target.value = "";
  };

  const onPaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      if (!projectId) return; // fall through to native paste

      // 1) image clipboard items → upload as PNG screenshots.
      const items = e.clipboardData?.items ?? [];
      let imageHandled = false;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.kind === "file" && it.type.startsWith("image/")) {
          const blob = it.getAsFile();
          if (blob) {
            const ext = (it.type.split("/")[1] || "png").split(";")[0];
            const file = new File(
              [blob],
              `screenshot-${formatTs()}.${ext}`,
              { type: it.type },
            );
            handleUploadFile(file);
            imageHandled = true;
          }
        }
      }
      if (imageHandled) {
        e.preventDefault();
        return;
      }

      // 2) very long text → offer the TextPasteModal pre-filled.
      const text = e.clipboardData?.getData("text") ?? "";
      if (text.length > LONG_TEXT_THRESHOLD) {
        e.preventDefault();
        setPasteModal({ initial: text });
        return;
      }
      // 3) else native paste
    },
    [projectId, handleUploadFile],
  );

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
      data-chat-input
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
        {projectId && (
          <>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Datei anhängen"
              title="Datei anhängen"
              data-testid="chat-attach-button"
              className="p-2 rounded-md transition-default shrink-0 hover:bg-[var(--bg-elevated)]"
              style={{ color: "var(--text-muted)" }}
            >
              <Paperclip size={14} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.txt,.md,.markdown,.csv,.docx,.doc,.xlsx,.xls,.rtf,.json,.html,.htm,.log,image/*"
              onChange={onPick}
              className="sr-only"
              data-testid="chat-attach-input"
            />
          </>
        )}
        <textarea
          ref={ref}
          rows={1}
          onKeyDown={onKeyDown}
          onChange={onInput}
          onFocus={onFocus}
          onPaste={onPaste}
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

      {pasteModal && projectId && (
        <TextPasteModal
          projectId={projectId}
          initialContent={pasteModal.initial}
          onClose={() => setPasteModal(null)}
        />
      )}
    </div>
  );
}
