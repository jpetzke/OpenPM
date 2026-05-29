"use client";

import type { SlashCommandDef } from "@/lib/slash-commands";

interface Props {
  items: SlashCommandDef[];
  activeIndex: number;
  onSelect: (name: string) => void;
  onHover: (index: number) => void;
}

export function SlashCommandPopover({ items, activeIndex, onSelect, onHover }: Props) {
  if (items.length === 0) return null;

  return (
    <div
      role="listbox"
      aria-label="Slash-Befehle"
      className="absolute bottom-full left-0 right-0 mb-1 rounded-[var(--radius)] border overflow-hidden z-20"
      style={{
        background: "var(--bg-elevated)",
        borderColor: "var(--border)",
        boxShadow: "0 -4px 16px rgba(0,0,0,0.4)",
      }}
    >
      {items.map((cmd, idx) => (
        <div
          key={cmd.name}
          role="option"
          aria-selected={idx === activeIndex}
          onMouseEnter={() => onHover(idx)}
          onMouseDown={(e) => {
            // prevent textarea blur before selection
            e.preventDefault();
            onSelect(cmd.name);
          }}
          className="flex items-baseline gap-3 px-3 py-2 cursor-pointer transition-colors"
          style={{
            background: idx === activeIndex ? "var(--accent-subtle)" : "transparent",
            borderBottom: idx < items.length - 1 ? "1px solid var(--border)" : "none",
          }}
        >
          <span
            className="font-mono text-xs font-semibold shrink-0 w-24"
            style={{ color: idx === activeIndex ? "var(--accent-hover)" : "var(--accent)" }}
          >
            /{cmd.name}
            {cmd.hint ? ` ${cmd.hint}` : ""}
          </span>
          <span className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
            {cmd.description}
          </span>
        </div>
      ))}
    </div>
  );
}
