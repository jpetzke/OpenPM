"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Folder,
  FileText,
  MessageSquare,
  LayoutDashboard,
  FolderOpen,
  Archive,
  CornerDownLeft,
  ArrowUpDown,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { useUiStore } from "@/store/uiStore";
import {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
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

  const run = (action: () => void) => {
    action();
    close();
  };

  const { data: projects } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: () => api.get<Project[]>("/api/projects"),
    enabled: !!token && open,
  });

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

  const actions = [
    {
      label: "Dokumente",
      icon: FolderOpen,
      hint: "Upload & Dateien",
      action: () => currentProjectId && router.push(`/projects/${currentProjectId}#docs`),
      disabled: !currentProjectId,
    },
    {
      label: "Status",
      icon: LayoutDashboard,
      hint: "Projektstatus",
      action: () => currentProjectId && router.push(`/projects/${currentProjectId}#state`),
      disabled: !currentProjectId,
    },
    {
      label: "Chat-Archiv",
      icon: Archive,
      hint: "Frühere Chats",
      action: () => currentProjectId && router.push(`/projects/${currentProjectId}#archive`),
      disabled: !currentProjectId,
    },
    {
      label: "Alle Projekte",
      icon: Folder,
      hint: "Übersicht",
      action: () => router.push("/projects"),
      disabled: false,
    },
  ];

  return (
    <CommandDialog
      open={open}
      onOpenChange={(o: boolean) => (o ? setOpen(true) : close())}
      className="max-w-xl!"
      title="Befehlspalette"
      description="Projekte, Chats und Dokumente durchsuchen"
    >
      <Command>
      <CommandInput
        placeholder="Projekte, Chats, Dokumente suchen…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList className="max-h-[55vh]">
        <CommandEmpty>
          <span style={{ color: "var(--text-muted)" }}>Keine Ergebnisse</span>
        </CommandEmpty>

        <CommandGroup heading="Aktionen">
          {actions
            .filter((a) => !a.disabled)
            .map((a) => {
              const Icon = a.icon;
              return (
                <CommandItem
                  key={a.label}
                  value={`aktion ${a.label} ${a.hint}`}
                  onSelect={() => run(a.action)}
                >
                  <Icon style={{ color: "var(--text-muted)" }} />
                  <span>{a.label}</span>
                  <span
                    className="ml-auto text-xs"
                    style={{ color: "var(--text-disabled)" }}
                  >
                    {a.hint}
                  </span>
                </CommandItem>
              );
            })}
        </CommandGroup>

        {(projects?.length ?? 0) > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Projekte">
              {projects!.map((p) => (
                <CommandItem
                  key={p.id}
                  value={`projekt ${p.name} ${p.client_name}`}
                  onSelect={() => run(() => router.push(`/projects/${p.id}`))}
                >
                  <Folder style={{ color: "var(--accent)" }} />
                  <span>{p.name}</span>
                  {p.client_name && (
                    <span
                      className="ml-auto text-xs"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {p.client_name}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {(sessions?.length ?? 0) > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Chats">
              {sessions!.map((s) => (
                <CommandItem
                  key={s.id}
                  value={`chat ${s.title ?? "Unbenannter Chat"}`}
                  onSelect={() =>
                    run(() => router.push(`/projects/${s.project_id}#archive`))
                  }
                >
                  <MessageSquare style={{ color: "var(--info)" }} />
                  <span className="truncate">{s.title ?? "Unbenannter Chat"}</span>
                  <span
                    className="ml-auto text-xs tabular-nums"
                    style={{ color: "var(--text-disabled)" }}
                  >
                    {s.message_count} Nachr.
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {(documents?.length ?? 0) > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Dokumente">
              {documents!.map((d) => (
                <CommandItem
                  key={d.id}
                  value={`dokument ${d.original_filename}`}
                  onSelect={() =>
                    run(() => router.push(`/projects/${d.project_id}#docs`))
                  }
                >
                  <FileText style={{ color: "var(--text-muted)" }} />
                  <span className="truncate">{d.original_filename}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
      </Command>

      {/* Raycast-style footer with keyboard hints. */}
      <div
        className="flex items-center justify-between px-3 py-2 mt-1 border-t text-[11px]"
        style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
      >
        <span className="flex items-center gap-1.5">
          <ArrowUpDown size={11} /> Navigieren
        </span>
        <span className="flex items-center gap-1.5">
          <CornerDownLeft size={11} /> Öffnen
          <kbd
            className="ml-2 px-1.5 py-0.5 rounded font-mono"
            style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}
          >
            Esc
          </kbd>{" "}
          Schließen
        </span>
      </div>
    </CommandDialog>
  );
}
