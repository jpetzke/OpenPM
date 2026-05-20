import { create } from "zustand";
import type { DocumentStatus, PipelineLogEntry } from "@/types/document";

export interface BatchStateEntry {
  paused: boolean;
  remaining: number;
  windowS: number;
  pendingCount: number;
}

interface PipelineState {
  pipelines: Record<string, DocumentStatus>;
  details: Record<
    string,
    {
      step: number | null;
      total: number | null;
      label: string | null;
      status: string | null;
      detail: string | null;
      timestamp: string | null;
      logs: PipelineLogEntry[];
    }
  >;
  // Mapping of documentId -> projectId, populated when SSE events come in.
  docProject: Record<string, string>;
  // Per-project batch state (countdown of the 10s window before processing kicks in).
  batchState: Record<string, BatchStateEntry>;
  setPipelineStatus: (documentId: string, status: DocumentStatus, projectId?: string) => void;
  pushPipelineEvent: (
    documentId: string,
    event: {
      step?: number | null;
      total?: number | null;
      label?: string | null;
      status?: string | null;
      detail?: string | null;
      timestamp?: string | null;
      meta?: Record<string, unknown>;
    },
    projectId?: string
  ) => void;
  clearPipeline: (documentId: string) => void;
  setBatchState: (projectId: string, next: BatchStateEntry) => void;
  clearBatchState: (projectId: string) => void;
}

export const usePipelineStore = create<PipelineState>()((set) => ({
  pipelines: {},
  details: {},
  docProject: {},
  batchState: {},
  setPipelineStatus: (documentId, status, projectId) =>
    set((s) => ({
      pipelines: { ...s.pipelines, [documentId]: status },
      docProject: projectId
        ? { ...s.docProject, [documentId]: projectId }
        : s.docProject,
    })),
  pushPipelineEvent: (documentId, event, projectId) =>
    set((s) => {
      const current = s.details[documentId] ?? {
        step: null,
        total: null,
        label: null,
        status: null,
        detail: null,
        timestamp: null,
        logs: [],
      };
      const nextLog =
        event.label || event.detail
          ? [
              ...current.logs,
              {
                timestamp: event.timestamp ?? new Date().toISOString(),
                step: event.step ?? null,
                total: event.total ?? current.total ?? 0,
                label: event.label ?? "update",
                status: (event.status as PipelineLogEntry["status"]) ?? "info",
                detail: event.detail ?? null,
                meta: event.meta ?? {},
              },
            ]
          : current.logs;

      return {
        details: {
          ...s.details,
          [documentId]: {
            step: event.step ?? current.step,
            total: event.total ?? current.total,
            label: event.label ?? current.label,
            status: event.status ?? current.status,
            detail: event.detail ?? current.detail,
            timestamp: event.timestamp ?? current.timestamp,
            logs: nextLog,
          },
        },
        docProject: projectId
          ? { ...s.docProject, [documentId]: projectId }
          : s.docProject,
      };
    }),
  clearPipeline: (documentId) =>
    set((s) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [documentId]: _, ...rest } = s.pipelines;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [documentId]: __, ...detailRest } = s.details;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [documentId]: ___, ...projRest } = s.docProject;
      return { pipelines: rest, details: detailRest, docProject: projRest };
    }),
  setBatchState: (projectId, next) =>
    set((s) => ({ batchState: { ...s.batchState, [projectId]: next } })),
  clearBatchState: (projectId) =>
    set((s) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [projectId]: _, ...rest } = s.batchState;
      return { batchState: rest };
    }),
}));

export type PipelineStore = PipelineState;

export type ProjectPipelineSummary = {
  pendingCount: number;
  processingCount: number;
  latestLabel: string | null;
  latestStatus: "idle" | "pending" | "processing" | "failed" | "done";
  latestDocId: string | null;
  latestTimestamp: string | null;
};

/**
 * Combine `batchState[projectId]` and per-document pipeline data into a
 * single view-model that the GlobalStatusBar and sidebar use.
 */
export function getProjectPipelineSummary(
  state: PipelineStore,
  projectId: string
): ProjectPipelineSummary {
  const batch = state.batchState[projectId];
  const pendingCount = batch?.pendingCount ?? 0;

  // Collect document IDs known to belong to this project.
  const docIds = Object.entries(state.docProject)
    .filter(([, pid]) => pid === projectId)
    .map(([docId]) => docId);

  let processingCount = 0;
  let latestLabel: string | null = null;
  let latestStatus: ProjectPipelineSummary["latestStatus"] = "idle";
  let latestDocId: string | null = null;
  let latestTimestamp: string | null = null;
  let latestTime = -Infinity;

  for (const docId of docIds) {
    if (state.pipelines[docId] === "processing") processingCount += 1;

    const detail = state.details[docId];
    if (!detail) continue;
    const ts = detail.timestamp ? Date.parse(detail.timestamp) : NaN;
    const timeValue = Number.isFinite(ts) ? ts : 0;
    if (timeValue >= latestTime) {
      latestTime = timeValue;
      latestLabel = detail.label;
      latestDocId = docId;
      latestTimestamp = detail.timestamp;
      const docStatus = state.pipelines[docId];
      if (docStatus === "failed") latestStatus = "failed";
      else if (docStatus === "processing") latestStatus = "processing";
      else if (docStatus === "done") latestStatus = "done";
      else latestStatus = "pending";
    }
  }

  if (processingCount > 0) latestStatus = "processing";
  else if (pendingCount > 0 && latestStatus !== "failed") latestStatus = "pending";

  return {
    pendingCount,
    processingCount,
    latestLabel,
    latestStatus,
    latestDocId,
    latestTimestamp,
  };
}
