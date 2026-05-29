"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { useUiStore } from "@/store/uiStore";
import type { Project } from "@/types/project";
import type { Document } from "@/types/document";
import type { ChatSession } from "@/types/chat";

interface CommandPaletteProps {
  currentProjectId?: string;
}

export function CommandPalette({ currentProjectId }: CommandPaletteProps) {
  const open = useUiStore((s) => s.commandPaletteOpen);
  const setOpen = useUiStore((s) => s.setCommandPaletteOpen);
  const [query, setQuery] = useState("");
  const router = useRouter();
  const token = useAuthStore((s) => s.token);

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  const { data: projects } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: () => api.get<Project[]>("/api/projects"),
    enabled: !!token && open,
  });

  // Current-project documents + chat sessions extend the search scope beyond
  // project names (roadmap P: Projekte / Chats / Dokumente).
  const { data: documents } = useQuery<Document[]>({
    queryKey: ["projects", currentProjectId, "documents"],
    queryFn: () => api.get<Document[]>(`/api/projects/${currentProjectId}/documents`),
    enabled: !!token && open && !!currentProjectId,
  });

  const { data: sessions } = useQuery<ChatSession[]>({
    queryKey: ["projects", currentProjectId, "chat/sessions"],
    queryFn: () => api.get<ChatSession[]>(`/api/projects/${currentProjectId}/chat/sessions`),
    enabled: !!token && open && !!currentProjectId,
  });

  // Close on Escape (open/toggle is owned by the global keybindings hook).
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const q = query.toLowerCase();
  const filteredProjects = (projects ?? []).filter(
    (p) =>
      p.name.toLowerCase().includes(q) || p.client_name.toLowerCase().includes(q),
  );
  const filteredDocs = q
    ? (documents ?? []).filter((d) => d.original_filename.toLowerCase().includes(q))
    : [];
  const filteredSessions = q
    ? (sessions ?? []).filter((s) => (s.title ?? "").toLowerCase().includes(q))
    : [];

  const ACTIONS = [
    { label: "Dokumente", action: () => currentProjectId && router.push(`/projects/${currentProjectId}#docs`) },
    { label: "Status", action: () => currentProjectId && router.push(`/projects/${currentProjectId}#state`) },
    { label: "Chat-Archiv", action: () => currentProjectId && router.push(`/projects/${currentProjectId}#archive`) },
    { label: "Alle Projekte", action: () => router.push("/projects") },
  ];

  if (!open) return null;

  const sectionLabel = (label: string) => (
    <div className="px-3 mt-2 mb-1">
      <span className="text-xs font-medium uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
    </div>
  );

  const row = (key: string, primary: string, secondary: string | null, action: () => void) => (
    <button
      key={key}
      onClick={() => {
        action();
        close();
      }}
      className="w-full text-left px-4 py-2 text-sm transition-default"
      style={{ color: "var(--text-secondary)" }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-elevated)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "transparent";
      }}
    >
      {primary}
      {secondary ? (
        <span className="ml-2 text-xs" style={{ color: "var(--text-muted)" }}>
          {secondary}
        </span>
      ) : null}
    </button>
  );

  const noResults =
    query &&
    filteredProjects.length === 0 &&
    filteredDocs.length === 0 &&
    filteredSessions.length === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={close}
    >
      <div
        className="w-full max-w-lg rounded-xl border shadow-2xl overflow-hidden"
        style={{ background: "var(--bg-overlay)", borderColor: "var(--border-strong)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 border-b" style={{ borderColor: "var(--border)" }}>
          <Search size={16} style={{ color: "var(--text-muted)" }} />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Projekte, Chats, Dokumente suchen..."
            className="flex-1 py-3 text-sm bg-transparent outline-none"
            style={{ color: "var(--text-primary)" }}
          />
          <kbd
            className="text-xs px-1.5 py-0.5 rounded"
            style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}
          >
            Esc
          </kbd>
        </div>
        <div className="py-2 max-h-80 overflow-y-auto">
          {!query && (
            <>
              {sectionLabel("Aktionen")}
              {ACTIONS.map((a) => row(a.label, a.label, null, a.action))}
            </>
          )}
          {filteredProjects.length > 0 && (
            <>
              {sectionLabel("Projekte")}
              {filteredProjects.map((p) =>
                row(p.id, p.name, p.client_name, () => router.push(`/projects/${p.id}`)),
              )}
            </>
          )}
          {filteredSessions.length > 0 && (
            <>
              {sectionLabel("Chats")}
              {filteredSessions.map((s) =>
                row(s.id, s.title ?? "Unbenannter Chat", null, () =>
                  router.push(`/projects/${s.project_id}#archive`),
                ),
              )}
            </>
          )}
          {filteredDocs.length > 0 && (
            <>
              {sectionLabel("Dokumente")}
              {filteredDocs.map((d) =>
                row(d.id, d.original_filename, null, () =>
                  router.push(`/projects/${d.project_id}#docs`),
                ),
              )}
            </>
          )}
          {noResults && (
            <p className="px-4 py-3 text-sm" style={{ color: "var(--text-muted)" }}>
              Keine Ergebnisse
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
