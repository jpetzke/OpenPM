"use client";
import { CheckSquare, Square, AlertCircle } from "lucide-react";
import { useOptimisticTask } from "@/hooks/useOptimisticTask";
import { formatDate } from "@/lib/utils";
import type { Task } from "@/types/state";
import type { DocumentMeta } from "@/hooks/useDocuments";
import type { ConflictInfo } from "@/lib/conflicts";
import { SourcePill } from "./SourcePill";
import {
  ConfidenceBadge,
  confidenceBorderClass,
} from "./ConfidenceBadge";
import { ConflictBadge } from "./ConflictBadge";

interface TaskCardProps {
  task: Task;
  projectId: string;
  documentsById: Record<string, DocumentMeta>;
  conflict?: ConflictInfo;
}

export function TaskCard({
  task,
  projectId,
  documentsById,
  conflict,
}: TaskCardProps) {
  const mutation = useOptimisticTask(projectId);
  const isDone = task.status === "done";
  const isBlocked = task.status === "blocked";

  const toggle = () => {
    mutation.mutate({ taskId: task.id, status: isDone ? "open" : "done" });
  };

  const deadlineDate = task.deadline ? new Date(task.deadline) : null;
  const now = new Date();
  const daysUntil = deadlineDate
    ? Math.ceil((deadlineDate.getTime() - now.getTime()) / 86_400_000)
    : null;
  const deadlineColor =
    daysUntil === null
      ? "var(--text-muted)"
      : daysUntil < 0
      ? "var(--danger)"
      : daysUntil < 3
      ? "var(--warning)"
      : "var(--text-muted)";

  const sourceIds =
    task.source_document_ids ??
    (task.source_document_id ? [task.source_document_id] : []);

  const border = confidenceBorderClass(task.confidence);

  return (
    <div
      id={`task-${task.id}`}
      className={`flex items-start gap-2 py-2 px-1 rounded-md ${border}`}
    >
      <button
        onClick={toggle}
        disabled={mutation.isPending}
        className="mt-0.5 shrink-0 transition-default disabled:opacity-50"
        aria-label={isDone ? "Als offen markieren" : "Als erledigt markieren"}
      >
        {isDone ? (
          <CheckSquare size={16} style={{ color: "var(--accent)" }} />
        ) : isBlocked ? (
          <AlertCircle size={16} style={{ color: "var(--warning)" }} />
        ) : (
          <Square size={16} style={{ color: "var(--text-muted)" }} />
        )}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p
            className="text-sm"
            style={{
              color: isDone ? "var(--text-muted)" : "var(--text-primary)",
              textDecoration: isDone ? "line-through" : "none",
            }}
          >
            {task.title}
          </p>
          <ConfidenceBadge confidence={task.confidence} />
          <ConflictBadge conflict={conflict} />
        </div>
        {task.deadline && (
          <p className="text-xs mt-0.5" style={{ color: deadlineColor }}>
            fällig {formatDate(task.deadline)}
          </p>
        )}
        {sourceIds.length > 0 && (
          <div className="mt-1.5">
            <SourcePill ids={sourceIds} documents={documentsById} projectId={projectId} />
          </div>
        )}
      </div>
    </div>
  );
}
