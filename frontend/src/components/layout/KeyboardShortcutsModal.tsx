"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { useUiStore } from "@/store/uiStore";
import { KEY_BINDINGS, shortcutLabel } from "@/lib/keybindings";

/** Cheat-sheet overlay (opened via Cmd/Ctrl+/). Lists all global shortcuts
 *  plus the two-stage Esc behaviour. */
export function KeyboardShortcutsModal() {
  const open = useUiStore((s) => s.shortcutsModalOpen);
  const setOpen = useUiStore((s) => s.setShortcutsModalOpen);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center pt-28"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-md rounded-xl border shadow-2xl overflow-hidden"
        style={{ background: "var(--bg-overlay)", borderColor: "var(--border-strong)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: "var(--border)" }}
        >
          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Tastenkürzel
          </span>
          <button onClick={() => setOpen(false)} aria-label="Schließen">
            <X size={16} style={{ color: "var(--text-muted)" }} />
          </button>
        </div>
        <div className="py-2">
          {KEY_BINDINGS.map((b) => (
            <div
              key={b.id}
              className="flex items-center justify-between px-4 py-2 text-sm"
              style={{ color: "var(--text-secondary)" }}
            >
              <span>{b.description}</span>
              <kbd
                className="text-xs px-1.5 py-0.5 rounded font-mono"
                style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}
              >
                {shortcutLabel(b.key)}
              </kbd>
            </div>
          ))}
          <div
            className="flex items-center justify-between px-4 py-2 text-sm border-t mt-1"
            style={{ color: "var(--text-secondary)", borderColor: "var(--border)" }}
          >
            <span>Eingabe verlassen · Chat schließen</span>
            <kbd
              className="text-xs px-1.5 py-0.5 rounded font-mono"
              style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}
            >
              Esc / Esc Esc
            </kbd>
          </div>
        </div>
      </div>
    </div>
  );
}
