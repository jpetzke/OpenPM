"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import type { Project } from "@/types/project";

interface CommandPaletteProps {
  currentProjectId?: string;
}

export function CommandPalette({ currentProjectId }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();
  const token = useAuthStore((s) => s.token);

  const { data: projects } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: () => api.get<Project[]>("/api/projects"),
    enabled: !!token && open,
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const filtered = (projects ?? []).filter((p) =>
    p.name.toLowerCase().includes(query.toLowerCase()) ||
    p.client_name.toLowerCase().includes(query.toLowerCase())
  );

  const ACTIONS = [
    { label: "Upload", action: () => currentProjectId && router.push(`/projects/${currentProjectId}/upload`) },
    { label: "State", action: () => currentProjectId && router.push(`/projects/${currentProjectId}/state`) },
    { label: "Chat", action: () => currentProjectId && router.push(`/projects/${currentProjectId}/chat`) },
    { label: "Alle Projekte", action: () => router.push("/projects") },
  ];

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={() => { setOpen(false); setQuery(""); }}
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
            placeholder="Suchen..."
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
              <div className="px-3 mb-1">
                <span className="text-xs font-medium uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                  Aktionen
                </span>
              </div>
              {ACTIONS.map((a) => (
                <button
                  key={a.label}
                  onClick={() => { a.action(); setOpen(false); setQuery(""); }}
                  className="w-full text-left px-4 py-2 text-sm transition-default"
                  style={{ color: "var(--text-secondary)" }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-elevated)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                  }}
                >
                  {a.label}
                </button>
              ))}
            </>
          )}
          {filtered.length > 0 && (
            <>
              <div className="px-3 mt-2 mb-1">
                <span className="text-xs font-medium uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                  Projekte
                </span>
              </div>
              {filtered.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { router.push(`/projects/${p.id}/upload`); setOpen(false); setQuery(""); }}
                  className="w-full text-left px-4 py-2 text-sm transition-default"
                  style={{ color: "var(--text-secondary)" }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-elevated)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                  }}
                >
                  {p.name}
                  <span className="ml-2 text-xs" style={{ color: "var(--text-muted)" }}>{p.client_name}</span>
                </button>
              ))}
            </>
          )}
          {query && filtered.length === 0 && (
            <p className="px-4 py-3 text-sm" style={{ color: "var(--text-muted)" }}>Keine Ergebnisse</p>
          )}
        </div>
      </div>
    </div>
  );
}
