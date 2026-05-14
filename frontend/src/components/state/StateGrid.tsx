import { TaskCard } from "./TaskCard";
import { ContactCard } from "./ContactCard";
import { BlockerCard } from "./BlockerCard";
import { DecisionCard } from "./DecisionCard";
import type { DynamicSection, StateData } from "@/types/state";

interface StateGridProps {
  state: StateData;
  projectId: string;
}

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function hasVisibleDynamicItemContent(item: DynamicSection["items"][number]): boolean {
  return Object.values(item).some((value) => {
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return value !== null && value !== undefined;
  });
}

function GridSection({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div
      className="rounded-lg border p-4"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
    >
      <div className="flex items-center justify-between mb-3">
        <span
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: "var(--text-muted)" }}
        >
          {title}
        </span>
        <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
          {count}
        </span>
      </div>
      <div>{children}</div>
    </div>
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

  const sections = [
    openTasks.length > 0
      ? {
          key: "tasks",
          title: "Offene Tasks",
          count: openTasks.length,
          content: openTasks.map((t) => <TaskCard key={t.id} task={t} projectId={projectId} />),
        }
      : null,
    contacts.length > 0
      ? {
          key: "contacts",
          title: "Kontakte",
          count: contacts.length,
          content: contacts.map((c, i) => <ContactCard key={c.id ?? i} contact={c} />),
        }
      : null,
    blockers.length > 0
      ? {
          key: "blockers",
          title: "Blocker",
          count: blockers.length,
          content: blockers.map((b, i) => <BlockerCard key={b.id ?? i} blocker={b} />),
        }
      : null,
    decisions.length > 0
      ? {
          key: "decisions",
          title: "Entscheidungen",
          count: decisions.length,
          content: decisions.map((d, i) => <DecisionCard key={d.id ?? i} decision={d} />),
        }
      : null,
    deadlines.length > 0
      ? {
          key: "deadlines",
          title: "Deadlines",
          count: deadlines.length,
          content: deadlines.map((d, i) => (
            <div key={d.id ?? i} className="py-2 border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
              <p className="text-sm" style={{ color: "var(--text-primary)" }}>{d.title}</p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>{d.date}</p>
            </div>
          )),
        }
      : null,
  ].filter(Boolean) as Array<{ key: string; title: string; count: number; content: React.ReactNode }>;

  return (
    <>
      {sections.length === 0 && dynamicSections.length === 0 ? (
        <div
          className="rounded-lg border p-5 text-sm"
          style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-muted)" }}
        >
          Noch keine State-Informationen vorhanden.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {sections.map((section) => (
            <GridSection key={section.key} title={section.title} count={section.count}>
              {section.content}
            </GridSection>
          ))}

          {dynamicSections.map((section) => (
            <DynamicSectionCard key={section.id} section={section} />
          ))}
        </div>
      )}
    </>
  );
}

function DynamicSectionCard({ section }: { section: DynamicSection }) {
  return (
    <GridSection title={section.title} count={section.items.length}>
      {section.items.map((item) => (
        <div key={item.id} className="py-2 border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm" style={{ color: "var(--text-primary)" }}>
              {item.title ?? item.label ?? "Eintrag"}
            </p>
            {item.status && (
              <span className="text-[10px] uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                {item.status}
              </span>
            )}
          </div>
          {item.summary && (
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              {item.summary}
            </p>
          )}
        </div>
      ))}
    </GridSection>
  );
}
