"use client";
import { useState, useCallback } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Document } from "@/types/document";

interface DropZoneProps {
  projectId: string;
}

const MAX_SIZE = 50 * 1024 * 1024;

export function DropZone({ projectId }: DropZoneProps) {
  const qc = useQueryClient();
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  const upload = useCallback(
    async (file: File) => {
      if (file.size > MAX_SIZE) {
        toast.error("Datei zu groß (max. 50MB)");
        return;
      }
      setUploading(true);
      const fd = new FormData();
      fd.append("file", file);
      try {
        await api.upload<Document>(`/api/projects/${projectId}/documents`, fd);
        qc.invalidateQueries({ queryKey: ["projects", projectId, "documents"] });
        toast.success(`${file.name} hochgeladen`);
      } catch {
        toast.error(`Upload fehlgeschlagen: ${file.name}`);
      } finally {
        setUploading(false);
      }
    },
    [projectId, qc]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      Array.from(e.dataTransfer.files).forEach(upload);
    },
    [upload]
  );

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    Array.from(e.target.files ?? []).forEach(upload);
    e.target.value = "";
  };

  return (
    <label
      onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className="block border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-default"
      style={{
        borderColor: dragging ? "var(--accent)" : "var(--border-strong)",
        background: dragging ? "var(--accent-subtle)" : "var(--bg-surface)",
      }}
    >
      <input type="file" className="sr-only" multiple onChange={onFileInput} />
      <Upload
        size={24}
        className="mx-auto mb-3"
        style={{ color: dragging ? "var(--accent)" : "var(--text-muted)" }}
      />
      <p className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
        {uploading ? "Wird hochgeladen..." : "Dateien hier hinziehen"}
      </p>
      <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
        oder klicken zum Auswählen · PDF · DOCX · XLSX · TXT · und mehr
      </p>
    </label>
  );
}
