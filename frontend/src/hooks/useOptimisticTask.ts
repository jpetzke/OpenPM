"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { ProjectState } from "@/types/state";

export function useOptimisticTask(projectId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: string }) =>
      api.patch<ProjectState>(`/api/projects/${projectId}/state/tasks/${taskId}`, { status }),

    onMutate: async ({ taskId, status }) => {
      await qc.cancelQueries({ queryKey: ["projects", projectId, "state"] });
      const previous = qc.getQueryData<ProjectState>(["projects", projectId, "state"]);
      qc.setQueryData<ProjectState>(["projects", projectId, "state"], (old) => {
        if (!old) return old;
        return {
          ...old,
          state: {
            ...old.state,
            core: {
              ...old.state.core,
              open_tasks: old.state.core?.open_tasks?.map((t) =>
                t.id === taskId ? { ...t, status: status as "open" | "done" | "blocked" } : t
              ),
            },
          },
        };
      });
      return { previous };
    },

    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(["projects", projectId, "state"], ctx.previous);
      }
      toast.error("Task-Update fehlgeschlagen");
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["projects", projectId, "state"] });
    },
  });
}
