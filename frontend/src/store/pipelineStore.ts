import { create } from "zustand";
import type { DocumentStatus } from "@/types/document";

interface PipelineState {
  pipelines: Record<string, DocumentStatus>;
  setPipelineStatus: (documentId: string, status: DocumentStatus) => void;
  clearPipeline: (documentId: string) => void;
}

export const usePipelineStore = create<PipelineState>()((set) => ({
  pipelines: {},
  setPipelineStatus: (documentId, status) =>
    set((s) => ({ pipelines: { ...s.pipelines, [documentId]: status } })),
  clearPipeline: (documentId) =>
    set((s) => {
      const { [documentId]: _, ...rest } = s.pipelines;
      return { pipelines: rest };
    }),
}));
