"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type UsagePeriod = "7d" | "30d" | "90d" | "mtd" | "today";

export interface DailyUsage {
  date: string;
  prompt: number;
  completion: number;
  cost_usd: number;
}

export interface ModelUsage {
  model: string;
  prompt: number;
  completion: number;
  cost_usd: number;
}

export interface PurposeUsage {
  purpose: string;
  cost_usd: number;
}

export interface UsageTotal {
  prompt: number;
  completion: number;
  cost_usd: number;
}

export interface UsageResponse {
  daily: DailyUsage[];
  by_model: ModelUsage[];
  by_purpose: PurposeUsage[];
  total: UsageTotal;
  budget_usd: number | null;
  month_to_date_cost_usd: number;
  budget_used_pct: number | null;
}

export function useUsage(projectId: string | undefined, period: UsagePeriod = "30d") {
  return useQuery<UsageResponse>({
    queryKey: ["projects", projectId, "usage", period],
    queryFn: () => api.get<UsageResponse>(`/api/projects/${projectId}/usage?period=${period}`),
    enabled: !!projectId,
    staleTime: 30_000, // 30s cache
    refetchOnWindowFocus: false,
  });
}
