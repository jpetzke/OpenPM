"use client";
import { use, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FilePlus } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { api } from "@/lib/api";
import { DropZone } from "@/components/upload/DropZone";
import { DocumentGrid } from "@/components/upload/DocumentGrid";
import { TextPasteModal } from "@/components/upload/TextPasteModal";
import { LiveExtractionPanel } from "@/components/upload/LiveExtractionPanel";
import { ActivityTimeline } from "@/components/upload/ActivityTimeline";
import { SessionBadge } from "@/components/upload/SessionBadge";
import { EmbeddingHealthBanner } from "@/components/projects/EmbeddingHealthBanner";
import { usePipelineStore } from "@/store/pipelineStore";
import type { Document } from "@/types/document";

export default function UploadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [textModalOpen, setTextModalOpen] = useState(false);

  const { data: documents } = useQuery<Document[]>({
    queryKey: ["projects", id, "documents"],
    queryFn: () => api.get<Document[]>(`/api/projects/${id}/documents`),
  });

  const counts = usePipelineStore(
    useShallow((s) => {
      let processing = 0;
      let failed = 0;
      for (const docId of Object.keys(s.docProject)) {
        if (s.docProject[docId] !== id) continue;
        const st = s.pipelines[docId];
        if (st === "processing") processing += 1;
        else if (st === "failed") failed += 1;
      }
      return { processing, failed };
    }),
  );

  const connection = usePipelineStore((s) => s.connectionState[id] ?? "connecting");
  const total = documents?.length ?? 0;

  return (
    <div className="p-6 lg:p-8 max-w-screen-2xl mx-auto">
      <EmbeddingHealthBanner projectId={id} />

      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: "var(--text-muted)" }}
          >
            Dokumente
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <SessionBadge projectId={id} />
          <span style={{ color: "var(--text-muted)" }}>
            <span style={{ color: "var(--text-primary)" }}>{total}</span> gesamt
          </span>
          <span
            style={{
              color: counts.processing > 0 ? "var(--accent)" : "var(--text-muted)",
            }}
          >
            {counts.processing} aktiv
          </span>
          {counts.failed > 0 && (
            <span style={{ color: "var(--danger)" }}>
              {counts.failed} Fehler
            </span>
          )}
          {connection === "disconnected" && (
            <span style={{ color: "var(--danger)" }}>
              ⚠ Live-Stream getrennt
            </span>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-8 space-y-4">
          <DropZone projectId={id} />
          <div className="flex justify-between items-center">
            <button
              onClick={() => setTextModalOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs transition-default"
              style={{ color: "var(--accent)" }}
            >
              <FilePlus size={12} />
              Text einfügen
            </button>
          </div>
          <DocumentGrid projectId={id} />
        </div>

        <div className="xl:col-span-4 space-y-4">
          <LiveExtractionPanel projectId={id} />
          <ActivityTimeline projectId={id} />
        </div>
      </div>

      {textModalOpen && (
        <TextPasteModal projectId={id} onClose={() => setTextModalOpen(false)} />
      )}
    </div>
  );
}
