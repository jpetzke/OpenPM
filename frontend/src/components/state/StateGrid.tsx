import { useState, useEffect, useRef } from "react";
import { ChevronDown } from "lucide-react";
import { TaskCard } from "./TaskCard";
import { ContactCard } from "./ContactCard";
import { BlockerCard } from "./BlockerCard";
import { DecisionCard } from "./DecisionCard";
import { SourcePill } from "./SourcePill";
import {
  ConfidenceBadge,
  confidenceBorderClass,
} from "./ConfidenceBadge";
import { ConflictBadge } from "./ConflictBadge";
import { useDocumentsById } from "@/hooks/useDocuments";
import { conflictForItem, type Conflict } from "@/lib/conflicts";
import { usePipelineStore } from "@/store/pipelineStore";
import type { DynamicSection, StateData } from "@/types/state";

interface StateGridProps {
  state: StateData;
  projectId: string;
}

const PREVIEW_COUNT = 3;

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

const NON_VISIBLE_KEYS = new Set([
  "id",
  "source_document_id",
  "source_document_ids",
  "confidence",
]);
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
  flashing = false,
}: {
  title: string;
  items: React.ReactNode[];
  flashing?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const total = items.length;
  const visible = expanded ? items : items.slice(0, PREVIEW_COUNT);
  const hidden = total - visible.length;

  return (
    <section
      className={`rounded-lg border overflow-hidden${flashing ? " flash" : ""}`}
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

function useFlashingSections(projectId: string): Set<string> {
  const lastStateChange = usePipelineStore(
    (s) => s.perProjectLastStateChange[projectId] ?? null,
  );
  const [flashingSections, setFlashingSections] = useState<Set<string>>(new Set());
  const prevTsRef = useRef<number | null>(null);

  useEffect(() => {
    if (!lastStateChange) return;
    if (lastStateChange.ts === prevTsRef.current) return;
    prevTsRef.current = lastStateChange.ts;
    setFlashingSections(new Set(lastStateChange.sections));
    const t = setTimeout(() => setFlashingSections(new Set()), 500);
    return () => clearTimeout(t);
  }, [lastStateChange]);

  return flashingSections;
}

export function StateGrid({ state, projectId }: StateGridProps) {
  const documentsById = useDocumentsById(projectId);
  const conflicts: Conflict[] = (state.conflicts as Conflict[] | undefined) ?? [];
  const flashingSections = useFlashingSections(projectId);

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
      items: openTasks.map((t) => (
        <TaskCard
          key={t.id}
          task={t}
          projectId={projectId}
          documentsById={documentsById}
          conflict={conflictForItem(t.id, conflicts)}
        />
      )),
    });
  }
  if (contacts.length > 0) {
    coreSections.push({
      key: "contacts",
      title: "Kontakte",
      items: contacts.map((c, i) => (
        <ContactCard
          key={c.id ?? i}
          contact={c}
          documentsById={documentsById}
          conflict={c.id ? conflictForItem(c.id, conflicts) : undefined}
        />
      )),
    });
  }
  if (blockers.length > 0) {
    coreSections.push({
      key: "blockers",
      title: "Blocker",
      items: blockers.map((b, i) => (
        <BlockerCard
          key={b.id ?? i}
          blocker={b}
          documentsById={documentsById}
          conflict={b.id ? conflictForItem(b.id, conflicts) : undefined}
        />
      )),
    });
  }
  if (decisions.length > 0) {
    coreSections.push({
      key: "decisions",
      title: "Entscheidungen",
      items: decisions.map((d, i) => (
        <DecisionCard
          key={d.id ?? i}
          decision={d}
          documentsById={documentsById}
          conflict={d.id ? conflictForItem(d.id, conflicts) : undefined}
        />
      )),
    });
  }
  if (deadlines.length > 0) {
    coreSections.push({
      key: "deadlines",
      title: "Deadlines",
      items: deadlines.map((d, i) => {
        const sourceIds = d.source_document_ids ?? [];
        const conflict = d.id ? conflictForItem(d.id, conflicts) : undefined;
        const border = confidenceBorderClass(d.confidence);
        return (
          <div
            key={d.id ?? i}
            id={d.id ? `deadline-${d.id}` : undefined}
            className={`py-2 px-1 rounded-md border-b last:border-b-0 ${border}`}
            style={{ borderColor: "var(--border)" }}
          >
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-sm" style={{ color: "var(--text-primary)" }}>
                {d.title}
              </p>
              <ConfidenceBadge confidence={d.confidence} />
              <ConflictBadge conflict={conflict} />
            </div>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {d.date}
            </p>
            {sourceIds.length > 0 && (
              <div className="mt-1.5">
                <SourcePill ids={sourceIds} documents={documentsById} />
              </div>
            )}
          </div>
        );
      }),
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
        Der Projektstatus wird automatisch aufgebaut, sobald Dokumente hochgeladen werden.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {coreSections.map((s) => (
        <SectionCard key={s.key} title={s.title} items={s.items} flashing={flashingSections.has(s.key)} />
      ))}
      {dynamicSections.map((section) => (
        <DynamicSectionCard
          key={section.id}
          section={section}
          documentsById={documentsById}
          conflicts={conflicts}
        />
      ))}
    </div>
  );
}

function DynamicSectionCard({
  section,
  documentsById,
  conflicts,
}: {
  section: DynamicSection;
  documentsById: Record<string, import("@/hooks/useDocuments").DocumentMeta>;
  conflicts: Conflict[];
}) {
  const rendered: React.ReactNode[] = [];
  for (const item of section.items) {
    const title = dynamicItemTitle(item);
    if (!title) continue;
    const summary =
      typeof item.summary === "string" && item.summary.trim() !== title
        ? item.summary.trim()
        : null;
    const sourceIds = item.source_document_ids ?? [];
    const conflict = item.id ? conflictForItem(item.id, conflicts) : undefined;
    const border = confidenceBorderClass(item.confidence);
    rendered.push(
      <div
        key={item.id}
        id={item.id ? `dynamic_item-${item.id}` : undefined}
        className={`py-2 px-1 rounded-md border-b last:border-b-0 ${border}`}
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm" style={{ color: "var(--text-primary)" }}>
              {title}
            </p>
            <ConfidenceBadge confidence={item.confidence} />
            <ConflictBadge conflict={conflict} />
          </div>
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
        {sourceIds.length > 0 && (
          <div className="mt-1.5">
            <SourcePill ids={sourceIds} documents={documentsById} />
          </div>
        )}
      </div>,
    );
  }

  if (rendered.length === 0) return null;

  return <SectionCard title={section.title} items={rendered} />;
}
