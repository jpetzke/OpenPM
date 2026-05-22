"use client";
import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { useProjectSSE } from "@/hooks/useProjectSSE";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { GlobalStatusBar } from "@/components/layout/GlobalStatusBar";
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
  const hasHydrated = useAuthStore((s) => s.hasHydrated);

  useProjectSSE(id);

  useEffect(() => {
    if (hasHydrated && !token) router.push("/login");
  }, [token, hasHydrated, router]);

  // Prefetch project so the cockpit's LandingView and BriefingPanel are
  // populated before they mount their own queries.
  useQuery<Project>({
    queryKey: ["projects", id],
    queryFn: () => api.get<Project>(`/api/projects/${id}`),
    enabled: !!token,
  });

  if (!hasHydrated || !token) return null;

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg-base)" }}>
      <AppSidebar currentProjectId={id} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <GlobalStatusBar projectId={id} />
        <main className="flex-1 min-h-0 overflow-hidden">
          {children}
        </main>
      </div>
      <CommandPalette currentProjectId={id} />
    </div>
  );
}
