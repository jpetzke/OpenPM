"use client";
import { use, useState } from "react";
import { DropZone } from "@/components/upload/DropZone";
import { DocumentList } from "@/components/upload/DocumentList";
import { TextPasteModal } from "@/components/upload/TextPasteModal";
import { EmbeddingHealthBanner } from "@/components/projects/EmbeddingHealthBanner";

export default function UploadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [textModalOpen, setTextModalOpen] = useState(false);

  return (
    <div className="p-6 max-w-2xl">
      <EmbeddingHealthBanner projectId={id} />
      <h2
        className="text-xs font-semibold uppercase tracking-widest mb-4"
        style={{ color: "var(--text-muted)" }}
      >
        Dokumente hochladen
      </h2>
      <DropZone projectId={id} />
      <button
        onClick={() => setTextModalOpen(true)}
        className="mt-3 text-sm transition-default"
        style={{ color: "var(--accent)" }}
      >
        Text direkt einfügen
      </button>
      <div className="mt-6 border-t pt-6" style={{ borderColor: "var(--border)" }}>
        <h3
          className="text-xs font-semibold uppercase tracking-widest mb-3"
          style={{ color: "var(--text-muted)" }}
        >
          Hochgeladene Dokumente
        </h3>
        <DocumentList projectId={id} />
      </div>
      {textModalOpen && (
        <TextPasteModal projectId={id} onClose={() => setTextModalOpen(false)} />
      )}
    </div>
  );
}
