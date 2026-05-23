import { create } from "zustand";
import type { DocumentStatus, PipelineLogEntry } from "@/types/document";

const ACTIVITY_LIMIT = 80;

export type ConnectionState = "connecting" | "open" | "disconnected";

export interface ExtractedSummary {
  contacts_added: number;
  tasks_added: number;
  deadlines_added: number;
  decisions_added: number;
  blockers_added: number;
  dynamic_items_added?: number;
  sample?: {
    first_task?: string | null;
    first_deadline?: string | null;
    first_contact?: string | null;
  };
}

export interface ChangeSessionInfo {
  id: string;
  started_at: string;
  last_activity_at: string;
  closed_at: string | null;
  summary: Record<string, unknown> | null;
  triggered_by: string | null;
}

export interface ActivityEntry {
  id: string;
  ts: string;
  documentId: string | null;
  documentName?: string | null;
  label: string;
  detail: string | null;
  status: PipelineLogEntry["status"] | "info";
  kind: "document" | "session";
  changeSessionId?: string | null;
}

export interface LastExtraction {
  documentId: string;
  filename?: string;
  summary: ExtractedSummary;
  stateVersion?: number;
  at: string;
}

export type ExtractedItemType =
  | "task"
  | "contact"
  | "deadline"
  | "decision"
  | "blocker"
  | "dynamic_item";

export interface ExtractedItem {
  documentId: string;
  type: ExtractedItemType;
  itemId: string;
  title: string;
  action: "added" | "updated";
  confidence: "high" | "medium" | "low";
  emittedAt: number;
}

const LIVE_ITEMS_PER_DOC_LIMIT = 40;

export interface LastStateChange {
  version: number;
  sections: string[];
  ts: number;
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
  docProject: Record<string, string>;
  docNames: Record<string, string>;
  perProjectActivity: Record<string, ActivityEntry[]>;
  perProjectLastExtraction: Record<string, LastExtraction | null>;
  perProjectActiveSession: Record<string, ChangeSessionInfo | null>;
  perProjectLastClosed: Record<string, ChangeSessionInfo | null>;
  connectionState: Record<string, ConnectionState>;
  liveItemsByDoc: Record<string, ExtractedItem[]>;
  lastItemAtByDoc: Record<string, number>;
  expandedDocs: Set<string>;
  perProjectLastStateChange: Record<string, LastStateChange | null>;

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
    projectId?: string,
  ) => void;
  pushActivity: (projectId: string, entry: ActivityEntry) => void;
  clearPipeline: (documentId: string) => void;
  recordDocName: (documentId: string, name: string) => void;
  recordExtraction: (projectId: string, payload: LastExtraction) => void;
  setActiveSession: (projectId: string, session: ChangeSessionInfo | null) => void;
  setSessionClosed: (projectId: string, session: ChangeSessionInfo) => void;
  setConnectionState: (projectId: string, state: ConnectionState) => void;
  addLiveItem: (item: ExtractedItem) => void;
  setLastStateChange: (projectId: string, payload: LastStateChange) => void;
  collapseDoc: (docId: string) => void;
  hydrateProjectFromDocuments: (
    projectId: string,
    docs: Array<{
      id: string;
      original_filename: string;
      processing_status: DocumentStatus;
      pipeline_step: number | null;
      pipeline_step_label: string | null;
      pipeline_updated_at: string | null;
      pipeline_logs: PipelineLogEntry[] | null;
    }>,
  ) => void;
}

export const usePipelineStore = create<PipelineState>()((set) => ({
  pipelines: {},
  details: {},
  docProject: {},
  docNames: {},
  perProjectActivity: {},
  perProjectLastExtraction: {},
  perProjectActiveSession: {},
  perProjectLastClosed: {},
  connectionState: {},
  liveItemsByDoc: {},
  lastItemAtByDoc: {},
  expandedDocs: new Set<string>(),
  perProjectLastStateChange: {},

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
      const wantsLog = event.label || event.detail;
      const nextLogs = wantsLog
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
            logs: nextLogs,
          },
        },
        docProject: projectId
          ? { ...s.docProject, [documentId]: projectId }
          : s.docProject,
      };
    }),

  pushActivity: (projectId, entry) =>
    set((s) => {
      const list = s.perProjectActivity[projectId] ?? [];
      const next = [entry, ...list].slice(0, ACTIVITY_LIMIT);
      return { perProjectActivity: { ...s.perProjectActivity, [projectId]: next } };
    }),

  clearPipeline: (documentId) =>
    set((s) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [documentId]: _, ...rest } = s.pipelines;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [documentId]: __, ...detailRest } = s.details;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [documentId]: ___, ...projRest } = s.docProject;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [documentId]: ____, ...nameRest } = s.docNames;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [documentId]: _____, ...liveRest } = s.liveItemsByDoc;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [documentId]: ______, ...lastAtRest } = s.lastItemAtByDoc;
      const nextExpanded = new Set(s.expandedDocs);
      nextExpanded.delete(documentId);
      return {
        pipelines: rest,
        details: detailRest,
        docProject: projRest,
        docNames: nameRest,
        liveItemsByDoc: liveRest,
        lastItemAtByDoc: lastAtRest,
        expandedDocs: nextExpanded,
      };
    }),

  recordDocName: (documentId, name) =>
    set((s) => ({ docNames: { ...s.docNames, [documentId]: name } })),

  recordExtraction: (projectId, payload) =>
    set((s) => ({
      perProjectLastExtraction: { ...s.perProjectLastExtraction, [projectId]: payload },
    })),

  setActiveSession: (projectId, session) =>
    set((s) => ({
      perProjectActiveSession: { ...s.perProjectActiveSession, [projectId]: session },
    })),

  setSessionClosed: (projectId, session) =>
    set((s) => ({
      perProjectActiveSession: { ...s.perProjectActiveSession, [projectId]: null },
      perProjectLastClosed: { ...s.perProjectLastClosed, [projectId]: session },
    })),

  setConnectionState: (projectId, state) =>
    set((s) => ({ connectionState: { ...s.connectionState, [projectId]: state } })),

  addLiveItem: (item) =>
    set((s) => {
      const current = s.liveItemsByDoc[item.documentId] ?? [];
      const next = [...current, item].slice(-LIVE_ITEMS_PER_DOC_LIMIT);
      const nextExpanded = new Set(s.expandedDocs);
      nextExpanded.add(item.documentId);
      return {
        liveItemsByDoc: { ...s.liveItemsByDoc, [item.documentId]: next },
        lastItemAtByDoc: { ...s.lastItemAtByDoc, [item.documentId]: Date.now() },
        expandedDocs: nextExpanded,
      };
    }),

  setLastStateChange: (projectId, payload) =>
    set((s) => ({
      perProjectLastStateChange: { ...s.perProjectLastStateChange, [projectId]: payload },
    })),

  collapseDoc: (docId) =>
    set((s) => {
      if (!s.expandedDocs.has(docId)) return {};
      const nextExpanded = new Set(s.expandedDocs);
      nextExpanded.delete(docId);
      return { expandedDocs: nextExpanded };
    }),

  hydrateProjectFromDocuments: (projectId, docs) =>
    set((s) => {
      const pipelines = { ...s.pipelines };
      const details = { ...s.details };
      const docProject = { ...s.docProject };
      const docNames = { ...s.docNames };
      for (const d of docs) {
        // Only fill gaps — never overwrite live SSE-driven state, otherwise a
        // docs-query refetch immediately after a status-change event would
        // clobber the new status with the previous DB row.
        if (!(d.id in pipelines)) pipelines[d.id] = d.processing_status;
        docProject[d.id] = projectId;
        docNames[d.id] = d.original_filename;
        if (details[d.id]) continue;
        details[d.id] = {
          step: d.pipeline_step,
          total: d.pipeline_logs?.[d.pipeline_logs.length - 1]?.total ?? null,
          label: d.pipeline_step_label,
          status: d.processing_status,
          detail: null,
          timestamp: d.pipeline_updated_at,
          logs: d.pipeline_logs ?? [],
        };
      }
      return { pipelines, details, docProject, docNames };
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

export function getProjectPipelineSummary(
  state: PipelineStore,
  projectId: string,
): ProjectPipelineSummary {
  const docIds = Object.entries(state.docProject)
    .filter(([, pid]) => pid === projectId)
    .map(([docId]) => docId);

  let pendingCount = 0;
  let processingCount = 0;
  let latestLabel: string | null = null;
  let latestStatus: ProjectPipelineSummary["latestStatus"] = "idle";
  let latestDocId: string | null = null;
  let latestTimestamp: string | null = null;
  let latestTime = -Infinity;

  for (const docId of docIds) {
    if (state.pipelines[docId] === "processing") processingCount += 1;
    if (state.pipelines[docId] === "pending") pendingCount += 1;
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
