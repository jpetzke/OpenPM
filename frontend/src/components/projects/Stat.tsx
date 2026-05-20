import { LucideIcon } from "lucide-react";

export function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number | null | undefined;
}) {
  const display =
    value === null || value === undefined ? "—" : String(value);
  return (
    <div className="flex flex-col gap-1">
      <div
        className="flex items-center gap-1.5"
        style={{ color: "var(--text-muted)" }}
      >
        <Icon size={12} />
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <div
        className="text-sm font-medium tabular-nums"
        style={{ color: "var(--text-primary)" }}
      >
        {display}
      </div>
    </div>
  );
}
