import type { StateData, Deadline } from "@/types/state";

export interface NextDeadlineResult {
  deadline: Deadline & { status?: string };
  isOverdue: boolean;
}

export function nextDeadline(state: StateData | null | undefined): NextDeadlineResult | null {
  const deadlines = (state?.core?.deadlines ?? []) as Array<Deadline & { status?: string }>;
  if (deadlines.length === 0) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcoming: Array<[Date, string, Deadline & { status?: string }]> = [];
  const overdue: Array<[Date, string, Deadline & { status?: string }]> = [];

  for (const item of deadlines) {
    if (item.status === "resolved") continue;
    const raw = item.date;
    if (!raw) continue;
    const d = new Date(raw);
    if (isNaN(d.getTime())) continue;
    d.setHours(0, 0, 0, 0);
    const title = item.title ?? "";
    if (d >= today) {
      upcoming.push([d, title, item]);
    } else {
      overdue.push([d, title, item]);
    }
  }

  const sort = <T extends [Date, string, unknown]>(arr: T[]) =>
    arr.sort((a, b) => a[0].getTime() - b[0].getTime() || a[1].localeCompare(b[1]));

  if (upcoming.length > 0) {
    sort(upcoming);
    return { deadline: upcoming[0][2], isOverdue: false };
  }
  if (overdue.length > 0) {
    sort(overdue);
    return { deadline: overdue[0][2], isOverdue: true };
  }
  return null;
}

export function formatDeadline(deadline: Deadline, isOverdue: boolean): string {
  const raw = deadline.date ?? "";
  const d = new Date(raw);
  if (isNaN(d.getTime())) return isOverdue ? "Überfällig" : "Nächste Deadline";
  const formatted = `${d.getDate().toString().padStart(2, "0")}.${(d.getMonth() + 1).toString().padStart(2, "0")}.`;
  return isOverdue ? `Überfällig seit ${formatted}` : `Nächste Deadline: ${formatted}`;
}
