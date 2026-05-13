"use client";
import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { useProjectSSE } from "@/hooks/useProjectSSE";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { ProjectHeader } from "@/components/layout/ProjectHeader";
import { CommandPalette } from "@/components/layout/CommandPalette";
import type { Project } from "@/types/project";

export default function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const token = useAuthStore((s) => s.token);

  useProjectSSE(id);

  useEffect(() => {
    if (!token) router.push("/login");
  }, [token, router]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === "1") {
        e.preventDefault();
        router.push(`/projects/${id}/upload`);
      }
      if (e.key === "2") {
        e.preventDefault();
        router.push(`/projects/${id}/state`);
      }
      if (e.key === "3") {
        e.preventDefault();
        router.push(`/projects/${id}/chat`);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [id, router]);

  const { data: project, isLoading } = useQuery<Project>({
    queryKey: ["projects", id],
    queryFn: () => api.get<Project>(`/api/projects/${id}`),
    enabled: !!token,
  });

  if (!token) return null;

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg-base)" }}>
      <AppSidebar currentProjectId={id} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {project && <ProjectHeader project={project} />}
        {isLoading && !project && (
          <div
            className="h-20 border-b animate-pulse shrink-0"
            style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
          />
        )}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
      <CommandPalette currentProjectId={id} />
    </div>
  );
}
