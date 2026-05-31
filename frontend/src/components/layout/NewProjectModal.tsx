"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Project } from "@/types/project";

interface NewProjectModalProps {
  onClose: () => void;
}

export function NewProjectModal({ onClose }: NewProjectModalProps) {
  const router = useRouter();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [saving, setSaving] = useState(false);

  // Escape to close
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
      const project = await api.post<Project>("/api/projects", {
        name: name.trim(),
        client_name: clientName.trim(),
      });
      await qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Projekt angelegt");
      onClose();
      router.push(`/projects/${project.id}#docs`);
    } catch (err) {
      toast.error((err as { message?: string })?.message ?? "Projekt konnte nicht erstellt werden");
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
      aria-label="Neues Projekt erstellen"
    >
      <div
        className="w-full max-w-md rounded-xl border shadow-2xl overflow-hidden"
        style={{ background: "var(--bg-overlay)", borderColor: "var(--border-strong)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: "var(--border)" }}
        >
          <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            Neues Projekt
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
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
              }}
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
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
              }}
            />
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
              {saving ? "Erstellen…" : "Erstellen"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
