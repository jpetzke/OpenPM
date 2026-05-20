import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { TaskCard } from "./TaskCard";
import { ContactCard } from "./ContactCard";
import { BlockerCard } from "./BlockerCard";
import { DecisionCard } from "./DecisionCard";
import type { DynamicSection, StateData } from "@/types/state";

interface StateGridProps {
  state: StateData;
  projectId: string;
}

const PREVIEW_COUNT = 3;

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

const NON_VISIBLE_KEYS = new Set(["id", "source_document_id", "source_document_ids"]);
function hasVisibleDynamicItemContent(item: DynamicSection["items"][number]): boolean {
  return Object.entries(item).some(([key, value]) => {
    if (NON_VISIBLE_KEYS.has(key)) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return value !== null && value !== undefined;
  });
}

function dynamicItemTitle(item: DynamicSection["items"][number]): string | null {
  const candidates = [item.title, item.label, item.summary];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim().length > 0) return c.trim();
  }
  return null;
}

function SectionCard({
  title,
  items,
}: {
  title: string;
  items: React.ReactNode[];
}) {
  const [expanded, setExpanded] = useState(false);
  const total = items.length;
  const visible = expanded ? items : items.slice(0, PREVIEW_COUNT);
  const hidden = total - visible.length;

  return (
    <section
      className="rounded-lg border overflow-hidden"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
    >
      <header
        className="flex items-center justify-between gap-3 px-4 py-3 border-b"
        style={{ borderColor: "var(--border)" }}
      >
        <span
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: "var(--text-muted)" }}
        >
          {title}
        </span>
        <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
          {total}
        </span>
      </header>
      <div className="p-4">
        {visible}
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium transition-default hover:underline"
            style={{ color: "var(--accent)" }}
          >
            <ChevronDown size={12} />
            {hidden} weitere anzeigen
          </button>
        )}
        {expanded && total > PREVIEW_COUNT && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium transition-default hover:underline"
            style={{ color: "var(--text-muted)" }}
          >
            <ChevronDown size={12} className="rotate-180" />
            Weniger anzeigen
          </button>
        )}
      </div>
    </section>
  );
}

export function StateGrid({ state, projectId }: StateGridProps) {
  const tasks = state.core?.open_tasks ?? [];
  const openTasks = tasks.filter((t) => t.status !== "done");
  const contacts = state.core?.contacts ?? [];
  const blockers = state.core?.blockers ?? [];
  const decisions = state.core?.decisions ?? [];
  const deadlines = state.core?.deadlines ?? [];
  const dynamicSections = (state.dynamic_sections ?? [])
    .map((section) => ({
      ...section,
      items: section.items.filter(hasVisibleDynamicItemContent),
    }))
    .filter((section) => hasText(section.title) && section.items.length > 0);

  const coreSections: Array<{ key: string; title: string; items: React.ReactNode[] }> = [];

  if (openTasks.length > 0) {
    coreSections.push({
      key: "tasks",
      title: "Offene Tasks",
      items: openTasks.map((t) => <TaskCard key={t.id} task={t} projectId={projectId} />),
    });
  }
  if (contacts.length > 0) {
    coreSections.push({
      key: "contacts",
      title: "Kontakte",
      items: contacts.map((c, i) => <ContactCard key={c.id ?? i} contact={c} />),
    });
  }
  if (blockers.length > 0) {
    coreSections.push({
      key: "blockers",
      title: "Blocker",
      items: blockers.map((b, i) => <BlockerCard key={b.id ?? i} blocker={b} />),
    });
  }
  if (decisions.length > 0) {
    coreSections.push({
      key: "decisions",
      title: "Entscheidungen",
      items: decisions.map((d, i) => <DecisionCard key={d.id ?? i} decision={d} />),
    });
  }
  if (deadlines.length > 0) {
    coreSections.push({
      key: "deadlines",
      title: "Deadlines",
      items: deadlines.map((d, i) => (
        <div
          key={d.id ?? i}
          className="py-2 border-b last:border-b-0"
          style={{ borderColor: "var(--border)" }}
        >
          <p className="text-sm" style={{ color: "var(--text-primary)" }}>
            {d.title}
          </p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {d.date}
          </p>
        </div>
      )),
    });
  }

  if (coreSections.length === 0 && dynamicSections.length === 0) {
    return (
      <div
        className="rounded-lg border p-5 text-sm"
        style={{
          background: "var(--bg-surface)",
          borderColor: "var(--border)",
          color: "var(--text-muted)",
        }}
      >
        Noch keine State-Informationen vorhanden.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {coreSections.map((s) => (
        <SectionCard key={s.key} title={s.title} items={s.items} />
      ))}
      {dynamicSections.map((section) => (
        <DynamicSectionCard key={section.id} section={section} />
      ))}
    </div>
  );
}

function DynamicSectionCard({ section }: { section: DynamicSection }) {
  const rendered: React.ReactNode[] = [];
  for (const item of section.items) {
    const title = dynamicItemTitle(item);
    if (!title) continue;
    const summary =
      typeof item.summary === "string" && item.summary.trim() !== title
        ? item.summary.trim()
        : null;
    rendered.push(
      <div
        key={item.id}
        className="py-2 border-b last:border-b-0"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm" style={{ color: "var(--text-primary)" }}>
            {title}
          </p>
          {item.status && (
            <span
              className="text-[10px] uppercase tracking-widest"
              style={{ color: "var(--text-muted)" }}
            >
              {item.status}
            </span>
          )}
        </div>
        {summary && (
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            {summary}
          </p>
        )}
      </div>,
    );
  }

  if (rendered.length === 0) return null;

  return <SectionCard title={section.title} items={rendered} />;
}
