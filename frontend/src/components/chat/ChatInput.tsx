"use client";
import { useRef, useCallback, useState, useEffect } from "react";
import { Loader2, Paperclip, Send, Square } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import type { ModelInfo } from "@/types/chat";
import { startUploadWithFlow } from "@/lib/uploadFlow";
import { formatTs } from "@/lib/utils";
import { PASTE_THRESHOLD_CHARS } from "@/lib/ui-config";
import { TextPasteModal } from "@/components/upload/TextPasteModal";
import { SlashCommandPopover } from "./SlashCommandPopover";
import {
  matchSlashCommands,
  parseSlashCommand,
  type SlashCommandDef,
} from "@/lib/slash-commands";

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
  /**
   * Called instead of onSend when the user submits a slash command.
   * `arg` is the text after the command name (empty string if none).
   */
  onSlashCommand?: (name: string, arg: string) => void;
}

const LONG_TEXT_THRESHOLD = PASTE_THRESHOLD_CHARS;

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
  onSlashCommand,
}: ChatInputProps) {
  const qc = useQueryClient();
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [pasteModal, setPasteModal] = useState<{ initial: string } | null>(null);

  // Slash-command popover state
  const [slashMatches, setSlashMatches] = useState<SlashCommandDef[]>([]);
  const [slashActiveIdx, setSlashActiveIdx] = useState(0);

  const slashOpen = slashMatches.length > 0;

  useEffect(() => {
    setIsMobile("ontouchstart" in window);
  }, []);

  // Cmd/Ctrl+U (global keybinding) dispatches this event; open the file picker.
  useEffect(() => {
    if (!projectId) return;
    const open = () => fileInputRef.current?.click();
    window.addEventListener("openpm:open-file-picker", open);
    return () => window.removeEventListener("openpm:open-file-picker", open);
  }, [projectId]);

  const clearInput = useCallback(() => {
    if (ref.current) {
      ref.current.value = "";
      ref.current.style.height = "auto";
    }
    setSlashMatches([]);
    setSlashActiveIdx(0);
  }, []);

  const submit = useCallback(() => {
    const val = ref.current?.value.trim();
    if (!val || disabled) return;

    // Try to parse as a slash command first.
    const parsed = parseSlashCommand(val);
    if (parsed && onSlashCommand) {
      onSlashCommand(parsed.name, parsed.arg);
      clearInput();
      return;
    }

    onSend(val);
    clearInput();
  }, [onSend, onSlashCommand, disabled, clearInput]);

  /** Insert `/name ` into textarea and close popover (for no-arg commands). */
  const selectSlashCommand = useCallback((name: string) => {
    const def = slashMatches.find((c) => c.name === name) ?? slashMatches[0];
    if (!def) return;

    if (ref.current) {
      if (def.takesArg) {
        ref.current.value = `/${name} `;
      } else {
        // No arg: execute immediately
        if (onSlashCommand) {
          onSlashCommand(name, "");
          clearInput();
          return;
        }
        ref.current.value = `/${name} `;
      }
      // Trigger height auto-resize
      ref.current.style.height = "auto";
      ref.current.style.height = Math.min(ref.current.scrollHeight, 120) + "px";
      ref.current.focus();
    }
    setSlashMatches([]);
    setSlashActiveIdx(0);
  }, [slashMatches, onSlashCommand, clearInput]);

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
    // Slash popover takes priority for navigation keys.
    if (slashOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashActiveIdx((i) => (i + 1) % slashMatches.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashActiveIdx((i) => (i - 1 + slashMatches.length) % slashMatches.length);
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        selectSlashCommand(slashMatches[slashActiveIdx]?.name ?? slashMatches[0].name);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSlashMatches([]);
        setSlashActiveIdx(0);
        return;
      }
    }

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

    // Compute slash-command matches whenever value changes.
    const val = el.value;
    if (val.startsWith("/") && !val.includes(" ")) {
      // Still typing the command name
      const matches = matchSlashCommands(val);
      setSlashMatches(matches);
      setSlashActiveIdx(0);
    } else if (val === "") {
      setSlashMatches([]);
      setSlashActiveIdx(0);
    } else {
      // Once a space is typed (argument mode) or value doesn't start with /
      setSlashMatches([]);
    }
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
      <div className="flex items-end gap-2 relative">
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
              accept=".pdf,.txt,.md,.markdown,.csv,.docx,.doc,.xlsx,.xls,.rtf,.json,.html,.htm,.log,.eml,.png,.jpg,.jpeg,.webp,.mp3,.m4a,.wav,.ogg,image/*"
              onChange={onPick}
              className="sr-only"
              data-testid="chat-attach-input"
            />
          </>
        )}
        <div className="flex-1 relative">
          {slashOpen && (
            <SlashCommandPopover
              items={slashMatches}
              activeIndex={slashActiveIdx}
              onSelect={selectSlashCommand}
              onHover={setSlashActiveIdx}
            />
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
            className="w-full resize-none outline-none text-sm py-2 px-3 rounded-md"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
              maxHeight: "120px",
            }}
          />
        </div>

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
