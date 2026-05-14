import { TaskCard } from "./TaskCard";
import { ContactCard } from "./ContactCard";
import { BlockerCard } from "./BlockerCard";
import { DecisionCard } from "./DecisionCard";
import type { DynamicSection, StateData } from "@/types/state";

interface StateGridProps {
  state: StateData;
  projectId: string;
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
  const dynamicSections = state.dynamic_sections ?? [];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <GridSection title="Offene Tasks" count={openTasks.length}>
        {openTasks.length === 0 ? (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>Keine offenen Tasks</p>
        ) : (
          openTasks.map((t) => <TaskCard key={t.id} task={t} projectId={projectId} />)
        )}
      </GridSection>

      <GridSection title="Kontakte" count={contacts.length}>
        {contacts.length === 0 ? (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>Keine Kontakte</p>
        ) : (
          contacts.map((c, i) => <ContactCard key={i} contact={c} />)
        )}
      </GridSection>

      <GridSection title="Blocker" count={blockers.length}>
        {blockers.length === 0 ? (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>Keine Blocker</p>
        ) : (
          blockers.map((b, i) => <BlockerCard key={i} blocker={b} />)
        )}
      </GridSection>

      <GridSection title="Entscheidungen" count={decisions.length}>
        {decisions.length === 0 ? (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>Keine Entscheidungen</p>
        ) : (
          decisions.map((d, i) => <DecisionCard key={i} decision={d} />)
        )}
      </GridSection>

      <GridSection title="Deadlines" count={deadlines.length}>
        {deadlines.length === 0 ? (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>Keine Deadlines</p>
        ) : (
          deadlines.map((d, i) => (
            <div key={d.id ?? i} className="py-2 border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
              <p className="text-sm" style={{ color: "var(--text-primary)" }}>{d.title}</p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>{d.date}</p>
            </div>
          ))
        )}
      </GridSection>

      {dynamicSections.map((section) => (
        <DynamicSectionCard key={section.id} section={section} />
      ))}
    </div>
  );
}

function DynamicSectionCard({ section }: { section: DynamicSection }) {
  return (
    <GridSection title={section.title} count={section.items.length}>
      {section.items.length === 0 ? (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>Keine Einträge</p>
      ) : (
        section.items.map((item) => (
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
        ))
      )}
    </GridSection>
  );
}
