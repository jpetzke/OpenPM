"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";

interface EmbeddingsStatus {
  exists: boolean;
  collection_dim: number | null;
  provider_dim: number | null;
  mismatch: boolean;
}

export function EmbeddingHealthBanner({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const [recreating, setRecreating] = useState(false);
  const { data } = useQuery<EmbeddingsStatus>({
    queryKey: ["projects", projectId, "embeddings", "status"],
    queryFn: () => api.get<EmbeddingsStatus>(`/api/projects/${projectId}/embeddings/status`),
    refetchInterval: 30_000,
  });

  if (!data?.mismatch) return null;

  const handleRecreate = async () => {
    const confirmed = window.confirm(
      "Embedding-Index neu aufbauen?\n\n" +
        "Alle bisherigen Vektoren werden gelöscht. Dokumente müssen anschließend neu hochgeladen " +
        "oder erneut verarbeitet werden, damit die Suche funktioniert.",
    );
    if (!confirmed) return;
    setRecreating(true);
    try {
      await api.post(`/api/projects/${projectId}/embeddings/recreate`);
      await qc.invalidateQueries({ queryKey: ["projects", projectId, "embeddings", "status"] });
      await qc.invalidateQueries({ queryKey: ["projects", projectId, "documents"] });
      toast.success("Embedding-Index neu erstellt. Dokumente neu hochladen, um Suche zu nutzen.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unbekannter Fehler";
      toast.error(`Neuaufbau fehlgeschlagen: ${msg}`);
    } finally {
      setRecreating(false);
    }
  };

  return (
    <div
      className="mb-4 rounded-lg border-l-2 p-4 text-sm flex items-start gap-3"
      style={{
        background: "var(--danger-subtle)",
        borderLeftColor: "var(--danger)",
        color: "var(--text-primary)",
      }}
    >
      <AlertTriangle size={16} style={{ color: "var(--danger)" }} className="mt-0.5 shrink-0" />
      <div className="flex-1">
        <p className="font-medium" style={{ color: "var(--danger)" }}>
          Embedding-Index inkompatibel
        </p>
        <p className="mt-1" style={{ color: "var(--text-secondary)" }}>
          Die Collection wurde mit Dimension {data.collection_dim} erstellt, der aktive Provider liefert{" "}
          {data.provider_dim}. Uploads schlagen fehl, bis der Index neu aufgebaut ist.
        </p>
        <button
          type="button"
          onClick={handleRecreate}
          disabled={recreating}
          className="inline-flex items-center gap-1.5 mt-2 text-xs font-medium transition-default hover:underline disabled:opacity-50"
          style={{ color: "var(--accent)" }}
        >
          <RefreshCw size={12} className={recreating ? "animate-spin" : ""} />
          {recreating ? "Wird neu aufgebaut…" : "Embedding-Index neu aufbauen"}
        </button>
      </div>
    </div>
  );
}
