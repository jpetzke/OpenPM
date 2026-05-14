"use client";
import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api";
import { StateGrid } from "@/components/state/StateGrid";
import { StateTimeline } from "@/components/state/StateTimeline";
import type { ProjectState } from "@/types/state";

export default function StatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const { data: stateData, isLoading, isError } = useQuery<ProjectState>({
    queryKey: ["projects", id, "state"],
    queryFn: () => api.get<ProjectState>(`/api/projects/${id}/state`),
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-40 rounded-lg animate-pulse"
              style={{ background: "var(--bg-surface)" }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !stateData) {
    return (
      <div className="p-6">
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Lade dein erstes Dokument hoch um den Projektstatus zu befüllen.{" "}
          <Link href={`/projects/${id}/upload`} style={{ color: "var(--accent)" }}>
            Zu Upload
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <StateGrid state={stateData.state} projectId={id} />
      <StateTimeline projectId={id} />
    </div>
  );
}
