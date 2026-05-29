"use client";
import { use, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { useProjectSSE } from "@/hooks/useProjectSSE";
import { useGlobalKeybindings } from "@/hooks/useGlobalKeybindings";
import { useTokenRefresh } from "@/hooks/useTokenRefresh";
import { startBroadcastChannelListener } from "@/lib/authClient";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { KeyboardShortcutsModal } from "@/components/layout/KeyboardShortcutsModal";
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
  const qc = useQueryClient();
  const seenCalledRef = useRef(false);

  useProjectSSE(id);
  useGlobalKeybindings();
  useTokenRefresh();

  // Start cross-tab BroadcastChannel listener once per layout mount
  useEffect(() => {
    const stop = startBroadcastChannelListener();
    return stop;
  }, []);

  useEffect(() => {
    if (hasHydrated && !token) router.push("/login");
  }, [token, hasHydrated, router]);

  // Mark project as seen on mount (fire-and-forget, once per mount)
  useEffect(() => {
    if (!token || !id || seenCalledRef.current) return;
    seenCalledRef.current = true;
    api
      .post(`/api/projects/${id}/seen`)
      .then(() => qc.invalidateQueries({ queryKey: ["projects"] }))
      .catch(() => {
        // non-critical — ignore errors
      });
  }, [token, id, qc]);

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
      <KeyboardShortcutsModal />
    </div>
  );
}
