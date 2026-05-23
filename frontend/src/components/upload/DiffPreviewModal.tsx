"use client";

import type { DiffPreview, DiffItem } from "@/lib/api";

interface Props {
  diff: DiffPreview;
  onConfirm: () => void;
  onCancel: () => void;
}

function DiffSection({
  title,
  items,
  borderColor,
  labelColor,
}: {
  title: string;
  items: DiffItem[];
  borderColor: string;
  labelColor: string;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <h4
        className="text-[10px] font-semibold uppercase tracking-widest mb-1.5"
        style={{ color: labelColor }}
      >
        {title} ({items.length})
      </h4>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li
            key={i}
            className="flex items-center gap-2 px-2 py-1.5 rounded text-[11px]"
            style={{
              border: `1px solid ${borderColor}`,
              background: `color-mix(in srgb, ${borderColor} 8%, transparent)`,
              color: "var(--text-secondary)",
            }}
          >
            <span
              className="shrink-0 text-[9px] uppercase font-semibold tracking-wider"
              style={{ color: labelColor }}
            >
              {item.type}
            </span>
            <span className="flex-1 truncate">{item.title}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DiffPreviewModal({ diff, onConfirm, onCancel }: Props) {
  const total = diff.additions.length + diff.removals.length + diff.modifications.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="w-full max-w-md rounded-xl p-5 flex flex-col gap-4"
        style={{
          background: "var(--bg-panel)",
          border: "1px solid var(--border)",
          maxHeight: "80vh",
          overflowY: "auto",
        }}
      >
        <div>
          <h2
            className="text-sm font-semibold mb-0.5"
            style={{ color: "var(--text-primary)" }}
          >
            Vorschau der Änderungen
          </h2>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            {total === 0
              ? "Keine Änderungen am Projektstatus erwartet."
              : `${total} Änderung${total !== 1 ? "en" : ""} am Projektstatus erwartet.`}
          </p>
        </div>

        {total === 0 ? (
          <p
            className="text-[12px] text-center py-4 italic"
            style={{ color: "var(--text-muted)" }}
          >
            Das Ersetzen ändert keine State-Einträge.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <DiffSection
              title="Hinzugefügt"
              items={diff.additions}
              borderColor="var(--success)"
              labelColor="var(--success)"
            />
            <DiffSection
              title="Entfernt"
              items={diff.removals}
              borderColor="var(--danger)"
              labelColor="var(--danger)"
            />
            <DiffSection
              title="Geändert"
              items={diff.modifications}
              borderColor="var(--warning)"
              labelColor="var(--warning)"
            />
          </div>
        )}

        <div className="flex gap-2 justify-end pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded text-xs transition-default"
            style={{
              border: "1px solid var(--border)",
              color: "var(--text-muted)",
              background: "transparent",
            }}
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-3 py-1.5 rounded text-xs font-medium transition-default"
            style={{
              background: "var(--accent)",
              color: "white",
              border: "1px solid var(--accent)",
            }}
          >
            Ersetzen bestätigen
          </button>
        </div>
      </div>
    </div>
  );
}
