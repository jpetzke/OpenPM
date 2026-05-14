import { create } from "zustand";
import type { DocumentStatus, PipelineLogEntry } from "@/types/document";

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
  setPipelineStatus: (documentId: string, status: DocumentStatus) => void;
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
    }
  ) => void;
  clearPipeline: (documentId: string) => void;
}

export const usePipelineStore = create<PipelineState>()((set) => ({
  pipelines: {},
  details: {},
  setPipelineStatus: (documentId, status) =>
    set((s) => ({ pipelines: { ...s.pipelines, [documentId]: status } })),
  pushPipelineEvent: (documentId, event) =>
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
      };
    }),
  clearPipeline: (documentId) =>
    set((s) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [documentId]: _, ...rest } = s.pipelines;
      const { [documentId]: __, ...detailRest } = s.details;
      return { pipelines: rest, details: detailRest };
    }),
}));
