import { AlertTriangle } from "lucide-react";
import type { Blocker } from "@/types/state";
import type { DocumentMeta } from "@/hooks/useDocuments";
import type { ConflictInfo } from "@/lib/conflicts";
import { SourcePill } from "./SourcePill";
import {
  ConfidenceBadge,
  confidenceBorderClass,
} from "./ConfidenceBadge";
import { ConflictBadge } from "./ConflictBadge";

interface BlockerCardProps {
  blocker: Blocker;
  documentsById: Record<string, DocumentMeta>;
  conflict?: ConflictInfo;
}

function severityColor(s: string | undefined) {
  if (s === "high") return "var(--danger)";
  if (s === "medium") return "var(--warning)";
  return "var(--text-muted)";
}

export function BlockerCard({ blocker, documentsById, conflict }: BlockerCardProps) {
  const label = blocker.title ?? blocker.description ?? "";
  const sourceIds = blocker.source_document_ids ?? [];
  const border = confidenceBorderClass(blocker.confidence);

  return (
    <div
      id={blocker.id ? `blocker-${blocker.id}` : undefined}
      className={`flex gap-2 py-2 px-1 rounded-md ${border}`}
    >
      <AlertTriangle
        size={14}
        className="mt-0.5 shrink-0"
        style={{ color: severityColor(blocker.severity) }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-sm" style={{ color: "var(--text-primary)" }}>{label}</p>
          <ConfidenceBadge confidence={blocker.confidence} />
          <ConflictBadge conflict={conflict} />
        </div>
        <div className="flex items-center gap-2 mt-1">
          {blocker.days_since !== undefined && (
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              seit {blocker.days_since} Tagen
            </span>
          )}
          {blocker.severity && (
            <span
              className="text-xs px-1.5 py-0.5 rounded-sm"
              style={{
                background: severityColor(blocker.severity) + "20",
                color: severityColor(blocker.severity),
              }}
            >
              {blocker.severity}
            </span>
          )}
        </div>
        {sourceIds.length > 0 && (
          <div className="mt-1.5">
            <SourcePill ids={sourceIds} documents={documentsById} />
          </div>
        )}
      </div>
    </div>
  );
}
