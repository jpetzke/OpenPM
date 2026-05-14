"use client";
import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Document } from "@/types/document";

interface TextPasteModalProps {
  projectId: string;
  onClose: () => void;
}

export function TextPasteModal({ projectId, onClose }: TextPasteModalProps) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!title.trim() || !content.trim()) return;
    setLoading(true);
    try {
      await api.post<Document>(`/api/projects/${projectId}/documents/text`, {
        title: title.trim(),
        content: content.trim(),
      });
      qc.invalidateQueries({ queryKey: ["projects", projectId, "documents"] });
      toast.success(`${title} gespeichert`);
      onClose();
    } catch {
      toast.error("Speichern fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border shadow-2xl overflow-hidden"
        style={{ background: "var(--bg-overlay)", borderColor: "var(--border-strong)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
          <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Text einfügen</span>
          <button onClick={onClose} aria-label="Schließen">
            <X size={16} style={{ color: "var(--text-muted)" }} />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div className="space-y-1">
            <label className="block text-xs uppercase tracking-widest font-medium" style={{ color: "var(--text-muted)" }}>
              Titel
            </label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Dokumenttitel"
              className="w-full px-3 py-2 rounded-md text-sm outline-none"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs uppercase tracking-widest font-medium" style={{ color: "var(--text-muted)" }}>
              Inhalt
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Text hier einfügen..."
              rows={10}
              className="w-full px-3 py-2 rounded-md text-sm outline-none resize-none"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-md text-sm transition-default"
              style={{ color: "var(--text-muted)" }}
            >
              Abbrechen
            </button>
            <button
              onClick={submit}
              disabled={!title.trim() || !content.trim() || loading}
              className="px-3 py-1.5 rounded-md text-sm font-medium transition-default disabled:opacity-50"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              {loading ? "..." : "Speichern"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
