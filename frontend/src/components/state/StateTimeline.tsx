"use client";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Bot, MessageSquare, Hand, GitCommitHorizontal } from "lucide-react";
import { api } from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";
import type { StateChangelog } from "@/types/state";

// ── triggered_by → visual identity ──────────────────────────────────────────
type Trigger = "pipeline" | "chat_tool" | "manual" | string;

function triggerMeta(trigger: Trigger): {
  color: string;
  label: string;
  icon: typeof Bot;
} {
  switch (trigger) {
    case "pipeline":
      return { color: "var(--accent)", label: "Pipeline", icon: Bot };
    case "chat_tool":
      return { color: "var(--info)", label: "Chat", icon: MessageSquare };
    case "manual":
      return { color: "var(--warning)", label: "Manuell", icon: Hand };
    default:
      return { color: "var(--text-muted)", label: trigger, icon: GitCommitHorizontal };
  }
}

// ── delta parsing ───────────────────────────────────────────────────────────
const CATEGORY_LABELS: Record<string, string> = {
  "core.contacts": "Kontakte",
  "core.open_tasks": "Tasks",
  "core.deadlines": "Deadlines",
  "core.decisions": "Entscheidungen",
  "core.blockers": "Blocker",
  dynamic_sections: "Abschnitte",
};

type DeltaItem = Record<string, unknown>;
interface DeltaGroup {
  key: string;
  label: string;
  items: DeltaItem[];
}
interface ParsedDelta {
  added: DeltaGroup[];
  removed: DeltaGroup[];
  modified: DeltaGroup[];
  total: number;
}

function itemTitle(item: DeltaItem): string {
  for (const k of ["title", "name", "text", "label", "summary"]) {
    const v = item[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "(ohne Titel)";
}

function parseBucket(bucket: unknown): DeltaGroup[] {
  if (!bucket || typeof bucket !== "object") return [];
  const out: DeltaGroup[] = [];
  for (const [key, val] of Object.entries(bucket as Record<string, unknown>)) {
    if (!Array.isArray(val) || val.length === 0) continue;
    out.push({
      key,
      label: CATEGORY_LABELS[key] ?? key.replace(/^core\./, ""),
      items: val as DeltaItem[],
    });
  }
  return out;
}

function parseDelta(delta: Record<string, unknown>): ParsedDelta {
  const added = parseBucket(delta.added);
  const removed = parseBucket(delta.removed);
  const modified = parseBucket(delta.modified);
  const total =
    added.reduce((n, g) => n + g.items.length, 0) +
    removed.reduce((n, g) => n + g.items.length, 0) +
    modified.reduce((n, g) => n + g.items.length, 0);
  return { added, removed, modified, total };
}

/** Compact "+3 Tasks · −1 Blocker" summary for a timeline row. */
function deltaSummary(d: ParsedDelta): { text: string; net: "add" | "remove" | "mixed" | "none" } {
  const parts: string[] = [];
  for (const g of d.added) parts.push(`+${g.items.length} ${g.label}`);
  for (const g of d.removed) parts.push(`−${g.items.length} ${g.label}`);
  for (const g of d.modified) parts.push(`~${g.items.length} ${g.label}`);
  const hasAdd = d.added.length > 0;
  const hasRem = d.removed.length > 0;
  const net = hasAdd && hasRem ? "mixed" : hasAdd ? "add" : hasRem ? "remove" : d.modified.length ? "mixed" : "none";
  return { text: parts.join(" · ") || "keine Änderungen", net };
}

interface StateTimelineProps {
  projectId: string;
}

export function StateTimeline({ projectId }: StateTimelineProps) {
  const [selected, setSelected] = useState<StateChangelog | null>(null);
  const [showAll, setShowAll] = useState(false);

  const { data: history } = useQuery<StateChangelog[]>({
    queryKey: ["projects", projectId, "state", "history"],
    queryFn: () =>
      api.get<StateChangelog[]>(`/api/projects/${projectId}/state/history?limit=20`),
  });

  const shown = showAll ? (history ?? []) : (history ?? []).slice(0, 6);
  if (!history?.length) return null;

  return (
    <div className="mt-8">
      <h3
        className="text-xs font-semibold uppercase tracking-widest mb-4"
        style={{ color: "var(--text-muted)" }}
      >
        Verlauf der Änderungen
      </h3>

      <div className="relative">
        {/* vertical spine */}
        <div
          className="absolute top-1 bottom-1 w-px"
          style={{ left: 7, background: "var(--border)" }}
          aria-hidden="true"
        />
        <ol className="space-y-1">
          {shown.map((entry, i) => (
            <TimelineRow
              key={entry.id}
              entry={entry}
              delay={i * 35}
              onClick={() => setSelected(entry)}
            />
          ))}
        </ol>
      </div>

      {(history?.length ?? 0) > 6 && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          className="mt-3 ml-6 text-xs transition-default hover:underline"
          style={{ color: "var(--accent)" }}
        >
          Ältere Versionen anzeigen
        </button>
      )}
      {selected && <DiffModal changelog={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function TimelineRow({
  entry,
  delay,
  onClick,
}: {
  entry: StateChangelog;
  delay: number;
  onClick: () => void;
}) {
  const meta = triggerMeta(entry.triggered_by);
  const Icon = meta.icon;
  const parsed = useMemo(() => parseDelta(entry.delta), [entry.delta]);
  const summary = deltaSummary(parsed);
  const summaryColor =
    summary.net === "add"
      ? "var(--success)"
      : summary.net === "remove"
        ? "var(--danger)"
        : summary.net === "mixed"
          ? "var(--text-secondary)"
          : "var(--text-muted)";

  return (
    <li className="rise-in" style={{ animationDelay: `${delay}ms` }}>
      <button
        onClick={onClick}
        className="group w-full text-left flex items-start gap-3 py-2 pl-0 pr-3 rounded-md transition-default"
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-surface)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "transparent";
        }}
      >
        {/* node */}
        <span
          className="relative z-10 mt-0.5 flex items-center justify-center rounded-full shrink-0 border-2"
          style={{
            width: 16,
            height: 16,
            background: "var(--bg-base)",
            borderColor: meta.color,
          }}
        >
          <Icon size={8} style={{ color: meta.color }} />
        </span>

        {/* content */}
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-2">
            <span
              className="font-mono text-xs tabular-nums"
              style={{ color: "var(--text-primary)" }}
            >
              v{entry.from_version ?? 0}
              <span style={{ color: "var(--text-disabled)" }}> → </span>
              v{entry.to_version}
            </span>
            <span
              className="text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded"
              style={{
                color: meta.color,
                background: `color-mix(in srgb, ${meta.color} 12%, transparent)`,
              }}
            >
              {meta.label}
            </span>
          </span>
          <span
            className="block text-[11px] mt-0.5 truncate"
            style={{ color: summaryColor }}
          >
            {summary.text}
          </span>
        </span>

        <span
          className="text-[11px] shrink-0 mt-0.5 tabular-nums"
          style={{ color: "var(--text-muted)" }}
        >
          {formatRelativeTime(entry.created_at)}
        </span>
      </button>
    </li>
  );
}

// ── diff modal ──────────────────────────────────────────────────────────────
function DiffModal({
  changelog,
  onClose,
}: {
  changelog: StateChangelog;
  onClose: () => void;
}) {
  const meta = triggerMeta(changelog.triggered_by);
  const parsed = useMemo(() => parseDelta(changelog.delta), [changelog.delta]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="atmos w-full max-w-lg rounded-xl border max-h-[80vh] flex flex-col rise-in"
        style={{
          background: "var(--bg-surface)",
          borderColor: "var(--border-strong)",
          boxShadow: "var(--shadow-lg)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <header
          className="flex items-center justify-between px-4 py-3 border-b shrink-0"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className="font-mono text-sm tabular-nums"
              style={{ color: "var(--text-primary)" }}
            >
              v{changelog.from_version ?? 0} → v{changelog.to_version}
            </span>
            <span
              className="text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded"
              style={{
                color: meta.color,
                background: `color-mix(in srgb, ${meta.color} 12%, transparent)`,
              }}
            >
              {meta.label}
            </span>
            {changelog.git_commit_hash && (
              <span
                className="hidden sm:inline-flex items-center gap-1 text-[11px] font-mono px-1.5 py-0.5 rounded"
                style={{ color: "var(--text-muted)", background: "var(--bg-elevated)" }}
                title={changelog.git_commit_hash}
              >
                <GitCommitHorizontal size={11} />
                {changelog.git_commit_hash.slice(0, 7)}
              </span>
            )}
          </div>
          <button onClick={onClose} aria-label="Schließen" className="p-1 rounded-md">
            <X size={16} style={{ color: "var(--text-muted)" }} />
          </button>
        </header>

        <div className="p-4 overflow-y-auto app-scrollbar space-y-4">
          <DiffSection title="Hinzugefügt" sign="+" color="var(--success)" groups={parsed.added} />
          <DiffSection title="Geändert" sign="~" color="var(--warning)" groups={parsed.modified} />
          <DiffSection title="Entfernt" sign="−" color="var(--danger)" groups={parsed.removed} />
          {parsed.total === 0 && (
            <p className="text-xs text-center py-4" style={{ color: "var(--text-muted)" }}>
              Keine inhaltlichen Änderungen in dieser Version.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function DiffSection({
  title,
  sign,
  color,
  groups,
}: {
  title: string;
  sign: string;
  color: string;
  groups: DeltaGroup[];
}) {
  if (groups.length === 0) return null;
  return (
    <section>
      <h4
        className="text-[10px] font-semibold uppercase tracking-widest mb-2 flex items-center gap-1.5"
        style={{ color }}
      >
        <span
          className="inline-flex items-center justify-center rounded font-mono"
          style={{ width: 14, height: 14, background: `color-mix(in srgb, ${color} 16%, transparent)` }}
        >
          {sign}
        </span>
        {title}
      </h4>
      <div className="space-y-2 pl-0.5">
        {groups.map((g) => (
          <div key={g.key}>
            <p className="text-[11px] mb-1" style={{ color: "var(--text-muted)" }}>
              {g.label} · {g.items.length}
            </p>
            <ul className="space-y-0.5">
              {g.items.map((item, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-xs pl-2 py-1 rounded border-l-2"
                  style={{
                    borderColor: color,
                    background: `color-mix(in srgb, ${color} 6%, transparent)`,
                    color: "var(--text-secondary)",
                  }}
                >
                  <span className="font-mono shrink-0" style={{ color }}>{sign}</span>
                  <span className="min-w-0">{itemTitle(item)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
