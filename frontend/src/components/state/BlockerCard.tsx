import { AlertTriangle } from "lucide-react";
import type { Blocker } from "@/types/state";

interface BlockerCardProps {
  blocker: Blocker;
}

function severityColor(s: string) {
  if (s === "high") return "var(--danger)";
  if (s === "medium") return "var(--warning)";
  return "var(--text-muted)";
}

export function BlockerCard({ blocker }: BlockerCardProps) {
  return (
    <div className="flex gap-2 py-2">
      <AlertTriangle size={14} className="mt-0.5 shrink-0" style={{ color: severityColor(blocker.severity) }} />
      <div>
        <p className="text-sm" style={{ color: "var(--text-primary)" }}>{blocker.description}</p>
        <div className="flex items-center gap-2 mt-1">
          {blocker.days_since !== undefined && (
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              seit {blocker.days_since} Tagen
            </span>
          )}
          <span
            className="text-xs px-1.5 py-0.5 rounded-sm"
            style={{
              background: severityColor(blocker.severity) + "20",
              color: severityColor(blocker.severity),
            }}
          >
            {blocker.severity}
          </span>
        </div>
      </div>
    </div>
  );
}
