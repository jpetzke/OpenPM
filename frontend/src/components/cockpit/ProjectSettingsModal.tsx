"use client";
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Project } from "@/types/project";

interface ProjectSettingsModalProps {
  projectId: string;
  onClose: () => void;
}

const inputStyle = {
  background: "var(--bg-elevated)",
  border: "1px solid var(--border)",
  color: "var(--text-primary)",
} as const;

export function ProjectSettingsModal({ projectId, onClose }: ProjectSettingsModalProps) {
  const qc = useQueryClient();
  const { data: project } = useQuery<Project>({
    queryKey: ["projects", projectId],
    queryFn: () => api.get<Project>(`/api/projects/${projectId}`),
  });

  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Prefill once the project loads.
  useEffect(() => {
    if (project && !hydrated) {
      setName(project.name ?? "");
      setClientName(project.client_name ?? "");
      setInstructions(project.custom_instructions ?? "");
      setHydrated(true);
    }
  }, [project, hydrated]);

  // Escape to close.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await api.patch<Project>(`/api/projects/${projectId}`, {
        name: name.trim(),
        client_name: clientName.trim(),
        custom_instructions: instructions.trim() || null,
      });
      await qc.invalidateQueries({ queryKey: ["projects", projectId] });
      await qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Einstellungen gespeichert");
      onClose();
    } catch (err) {
      toast.error((err as { message?: string })?.message ?? "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Projekteinstellungen"
    >
      <div
        className="w-full max-w-lg rounded-xl border shadow-2xl overflow-hidden"
        style={{ background: "var(--bg-overlay)", borderColor: "var(--border-strong)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: "var(--border)" }}
        >
          <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            Projekteinstellungen
          </span>
          <button onClick={onClose} aria-label="Schließen">
            <X size={16} style={{ color: "var(--text-muted)" }} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div className="space-y-1">
            <label className="block text-xs font-medium" style={{ color: "var(--text-muted)" }}>
              Name <span style={{ color: "var(--danger)" }}>*</span>
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Projektname"
              className="w-full px-3 py-2 rounded-md text-sm outline-none"
              style={inputStyle}
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium" style={{ color: "var(--text-muted)" }}>
              Kunde / Beschreibung <span style={{ color: "var(--text-disabled)" }}>(optional)</span>
            </label>
            <input
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Kundenname oder kurze Beschreibung"
              className="w-full px-3 py-2 rounded-md text-sm outline-none"
              style={inputStyle}
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium" style={{ color: "var(--text-muted)" }}>
              Anweisungen an den Assistenten{" "}
              <span style={{ color: "var(--text-disabled)" }}>(optional)</span>
            </label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="z. B. „Antworte immer auf Englisch.“ oder „Fokus auf Risiken und Termine, nenne stets die Quelldatei.“"
              rows={5}
              className="w-full px-3 py-2 rounded-md text-sm outline-none resize-y"
              style={inputStyle}
            />
            <p className="text-xs" style={{ color: "var(--text-disabled)" }}>
              Gilt für jeden Chat in diesem Projekt.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-md text-sm transition-default"
              style={{ color: "var(--text-muted)" }}
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={!name.trim() || saving}
              className="px-3 py-1.5 rounded-md text-sm font-medium transition-default disabled:opacity-50"
              style={{ background: "var(--accent)", color: "var(--primary-foreground)" }}
            >
              {saving ? "Speichern…" : "Speichern"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
