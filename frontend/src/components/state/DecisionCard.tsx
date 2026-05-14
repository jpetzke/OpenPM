import { formatDate } from "@/lib/utils";
import type { Decision } from "@/types/state";

interface DecisionCardProps {
  decision: Decision;
}

export function DecisionCard({ decision }: DecisionCardProps) {
  return (
    <div className="py-2 border-b last:border-0" style={{ borderColor: "var(--border)" }}>
      <p className="text-xs mb-0.5" style={{ color: "var(--text-muted)" }}>
        {decision.date ? formatDate(decision.date) : "—"}
      </p>
      <p className="text-sm" style={{ color: "var(--text-primary)" }}>{decision.description}</p>
    </div>
  );
}
