import { Circle, Pause, Archive, CheckCircle2 } from "lucide-react";

const STATUS_CONFIG: Record<
  string,
  { icon: typeof Circle; label: string; color: string; bg: string }
> = {
  active: {
    icon: Circle,
    label: "Aktiv",
    color: "var(--success)",
    bg: "var(--success-subtle)",
  },
  paused: {
    icon: Pause,
    label: "Pausiert",
    color: "var(--warning)",
    bg: "var(--warning-subtle)",
  },
  archived: {
    icon: Archive,
    label: "Archiviert",
    color: "var(--text-muted)",
    bg: "var(--bg-elevated)",
  },
  completed: {
    icon: CheckCircle2,
    label: "Abgeschlossen",
    color: "var(--accent)",
    bg: "var(--accent-subtle)",
  },
};

export function StatusPill({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.archived;
  const Icon = config.icon;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: config.bg, color: config.color }}
    >
      <Icon size={10} fill="currentColor" strokeWidth={0} />
      {config.label}
    </span>
  );
}
