"use client";

import { use, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useUsage, UsagePeriod } from "@/hooks/useUsage";
import type { Project } from "@/types/project";
import { PRICING, FALLBACK_PRICING } from "@/lib/pricing";

interface Props {
  params: Promise<{ id: string }>;
}

const PERIOD_OPTIONS: { value: UsagePeriod; label: string }[] = [
  { value: "today", label: "Heute" },
  { value: "7d", label: "7 Tage" },
  { value: "30d", label: "30 Tage" },
  { value: "mtd", label: "Dieser Monat" },
  { value: "90d", label: "90 Tage" },
];

function formatCost(usd: number) {
  if (usd < 0.001) return `$${usd.toFixed(6)}`;
  if (usd < 0.1) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function formatTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function computeHypotheticalCost(
  totalPrompt: number,
  totalCompletion: number,
  model: string
): number {
  const pricing = PRICING[model] ?? FALLBACK_PRICING;
  return (totalPrompt / 1000) * pricing.input + (totalCompletion / 1000) * pricing.output;
}

const CHEAPEST_MODEL = "anthropic/claude-haiku-4.5";

export default function UsagePage({ params }: Props) {
  const { id } = use(params);
  const [period, setPeriod] = useState<UsagePeriod>("30d");
  const [budgetInput, setBudgetInput] = useState("");
  const queryClient = useQueryClient();

  const { data: project } = useQuery<Project>({
    queryKey: ["projects", id],
    queryFn: () => api.get<Project>(`/api/projects/${id}`),
  });

  const { data: usage, isLoading } = useUsage(id, period);

  // Set initial budget input from project
  const currentBudget = project?.monthly_budget_usd ?? null;

  const budgetMutation = useMutation({
    mutationFn: (budgetUsd: number | null) =>
      api.patch(`/api/projects/${id}`, { monthly_budget_usd: budgetUsd }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", id] });
      queryClient.invalidateQueries({ queryKey: ["projects", id, "usage"] });
      toast.success("Budget gespeichert");
    },
    onError: () => toast.error("Budget konnte nicht gespeichert werden"),
  });

  const handleSaveBudget = () => {
    const val = budgetInput.trim();
    if (val === "" || val === "0") {
      budgetMutation.mutate(null);
    } else {
      const num = parseFloat(val);
      if (!isNaN(num) && num > 0) {
        budgetMutation.mutate(num);
      } else {
        toast.error("Ungültiger Budget-Wert");
      }
    }
  };

  // Hypothetical cheaper cost
  const totalPrompt = usage?.total?.prompt ?? 0;
  const totalCompletion = usage?.total?.completion ?? 0;
  const actualCost = usage?.total?.cost_usd ?? 0;
  const hypotheticalCost = computeHypotheticalCost(totalPrompt, totalCompletion, CHEAPEST_MODEL);

  return (
    <div
      className="flex flex-col h-full overflow-y-auto p-6 gap-6"
      style={{ color: "var(--text-primary)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Token-Verbrauch & Kosten</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
            {project?.name} — {project?.client_name}
          </p>
        </div>

        {/* Period selector */}
        <div className="flex gap-1.5">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setPeriod(opt.value)}
              className="px-3 py-1.5 rounded text-xs font-medium transition-colors"
              style={{
                background: period === opt.value ? "var(--accent)" : "var(--bg-elevated)",
                color: period === opt.value ? "white" : "var(--text-muted)",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <div className="text-sm" style={{ color: "var(--text-muted)" }}>Lade Daten…</div>
        </div>
      ) : usage ? (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            <SummaryCard
              label="Gesamtkosten"
              value={formatCost(usage.total.cost_usd)}
              sub={`${formatTokens(usage.total.prompt)} in · ${formatTokens(usage.total.completion)} out`}
            />
            <SummaryCard
              label="Monat bisher"
              value={formatCost(usage.month_to_date_cost_usd)}
              sub={
                usage.budget_usd
                  ? `von $${usage.budget_usd.toFixed(2)} Budget (${usage.budget_used_pct?.toFixed(0)}%)`
                  : "kein Budget gesetzt"
              }
              accent={
                usage.budget_used_pct != null && usage.budget_used_pct >= 80
                  ? usage.budget_used_pct >= 100
                    ? "danger"
                    : "warn"
                  : undefined
              }
            />
            <SummaryCard
              label="Hypothetisch (Haiku)"
              value={formatCost(hypotheticalCost)}
              sub={
                actualCost > 0
                  ? `${((1 - hypotheticalCost / actualCost) * 100).toFixed(0)}% günstiger als aktuell`
                  : "kein Verbrauch"
              }
            />
          </div>

          {/* Daily bar chart */}
          {usage.daily.length > 0 && (
            <div
              className="rounded-lg p-4"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
            >
              <h2 className="text-sm font-medium mb-3" style={{ color: "var(--text-muted)" }}>
                Tagesverbrauch (USD)
              </h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={usage.daily} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                    tickFormatter={(d: string) => d.slice(5)}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                    tickFormatter={(v: number) => `$${v.toFixed(3)}`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--bg-surface)",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                    formatter={(value) => [`$${Number(value ?? 0).toFixed(5)}`, "Kosten"]}
                  />
                  <Bar dataKey="cost_usd" fill="var(--accent)" radius={[3, 3, 0, 0]} name="Kosten" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* By model + by purpose tables */}
          <div className="grid grid-cols-2 gap-4">
            {/* By model */}
            <div
              className="rounded-lg p-4"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
            >
              <h2 className="text-sm font-medium mb-3" style={{ color: "var(--text-muted)" }}>
                Nach Modell
              </h2>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ color: "var(--text-muted)" }}>
                    <th className="text-left pb-2">Modell</th>
                    <th className="text-right pb-2">Tokens</th>
                    <th className="text-right pb-2">Kosten</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.by_model.map((m) => (
                    <tr key={m.model}>
                      <td className="py-1 pr-2 font-mono" style={{ color: "var(--text-primary)" }}>
                        {m.model.split("/").pop()}
                      </td>
                      <td className="py-1 text-right" style={{ color: "var(--text-muted)" }}>
                        {formatTokens(m.prompt + m.completion)}
                      </td>
                      <td className="py-1 text-right font-medium" style={{ color: "var(--text-primary)" }}>
                        {formatCost(m.cost_usd)}
                      </td>
                    </tr>
                  ))}
                  {usage.by_model.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-2 text-center" style={{ color: "var(--text-muted)" }}>
                        Kein Verbrauch
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* By purpose */}
            <div
              className="rounded-lg p-4"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
            >
              <h2 className="text-sm font-medium mb-3" style={{ color: "var(--text-muted)" }}>
                Nach Zweck
              </h2>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ color: "var(--text-muted)" }}>
                    <th className="text-left pb-2">Zweck</th>
                    <th className="text-right pb-2">Kosten</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.by_purpose.map((p) => (
                    <tr key={p.purpose}>
                      <td className="py-1" style={{ color: "var(--text-primary)" }}>
                        {p.purpose}
                      </td>
                      <td className="py-1 text-right font-medium" style={{ color: "var(--text-primary)" }}>
                        {formatCost(p.cost_usd)}
                      </td>
                    </tr>
                  ))}
                  {usage.by_purpose.length === 0 && (
                    <tr>
                      <td colSpan={2} className="py-2 text-center" style={{ color: "var(--text-muted)" }}>
                        Kein Verbrauch
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Budget setting */}
          <div
            className="rounded-lg p-4"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
          >
            <h2 className="text-sm font-medium mb-3" style={{ color: "var(--text-muted)" }}>
              Monats-Budget (USD)
            </h2>
            <div className="flex items-center gap-3">
              <div className="relative">
                <span
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-sm"
                  style={{ color: "var(--text-muted)" }}
                >
                  $
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder={currentBudget != null ? String(currentBudget) : "unbegrenzt"}
                  value={budgetInput}
                  onChange={(e) => setBudgetInput(e.target.value)}
                  className="pl-7 pr-3 py-2 rounded text-sm w-40"
                  style={{
                    background: "var(--bg-base)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                    outline: "none",
                  }}
                />
              </div>
              <button
                onClick={handleSaveBudget}
                disabled={budgetMutation.isPending}
                className="px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
                style={{ background: "var(--accent)", color: "white" }}
              >
                {budgetMutation.isPending ? "Speichere…" : "Speichern"}
              </button>
              {currentBudget != null && (
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Aktuell: ${currentBudget.toFixed(2)}/Monat
                </span>
              )}
            </div>
            <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
              Warnung bei 80 %, Blockierung bei 100 % des Monats-Budgets.
              Leer lassen für unbegrenzte Nutzung.
            </p>
          </div>
        </>
      ) : (
        <div className="flex items-center justify-center h-40">
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Keine Verbrauchsdaten für diesen Zeitraum.
          </p>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: "warn" | "danger";
}) {
  const valueColor = accent === "danger"
    ? "var(--danger)"
    : accent === "warn"
      ? "var(--warning)"
      : "var(--text-primary)";

  return (
    <div
      className="rounded-lg p-4"
      style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
    >
      <p className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>{label}</p>
      <p className="text-xl font-semibold" style={{ color: valueColor }}>{value}</p>
      <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{sub}</p>
    </div>
  );
}
