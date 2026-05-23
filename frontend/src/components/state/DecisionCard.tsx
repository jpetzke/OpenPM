import { formatDate } from "@/lib/utils";
import type { Decision } from "@/types/state";
import type { DocumentMeta } from "@/hooks/useDocuments";
import type { ConflictInfo } from "@/lib/conflicts";
import { SourcePill } from "./SourcePill";
import {
  ConfidenceBadge,
  confidenceBorderClass,
} from "./ConfidenceBadge";
import { ConflictBadge } from "./ConflictBadge";

interface DecisionCardProps {
  decision: Decision;
  documentsById: Record<string, DocumentMeta>;
  conflict?: ConflictInfo;
}

export function DecisionCard({ decision, documentsById, conflict }: DecisionCardProps) {
  const sourceIds = decision.source_document_ids ?? [];
  const border = confidenceBorderClass(decision.confidence);
  return (
    <div
      id={decision.id ? `decision-${decision.id}` : undefined}
      className={`py-2 px-1 rounded-md border-b last:border-0 ${border}`}
      style={{ borderColor: "var(--border)" }}
    >
      <p className="text-xs mb-0.5" style={{ color: "var(--text-muted)" }}>
        {decision.date ? formatDate(decision.date) : "—"}
      </p>
      <div className="flex items-center gap-1.5 flex-wrap">
        <p className="text-sm" style={{ color: "var(--text-primary)" }}>
          {decision.description}
        </p>
        <ConfidenceBadge confidence={decision.confidence} />
        <ConflictBadge conflict={conflict} />
      </div>
      {sourceIds.length > 0 && (
        <div className="mt-1.5">
          <SourcePill ids={sourceIds} documents={documentsById} />
        </div>
      )}
    </div>
  );
}
