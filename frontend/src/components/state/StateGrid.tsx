import { TaskCard } from "./TaskCard";
import { ContactCard } from "./ContactCard";
import { BlockerCard } from "./BlockerCard";
import { DecisionCard } from "./DecisionCard";
import type { StateData } from "@/types/state";

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
  const contacts = state.contacts ?? [];
  const blockers = state.blockers ?? [];
  const decisions = state.decisions ?? [];

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
    </div>
  );
}
