"use client";

import { AlertCircle } from "lucide-react";

interface Props {
  confidence?: "high" | "medium" | "low";
}

export function ConfidenceBadge({ confidence }: Props) {
  if (!confidence || confidence === "high") return null;
  const isLow = confidence === "low";
  const cls = isLow
    ? "ring-1 ring-orange-500/60 text-orange-300 bg-orange-500/10"
    : "ring-1 ring-amber-400/40 text-amber-300 bg-amber-500/10";
  const title = isLow
    ? "Niedrige Konfidenz — bitte prüfen"
    : "Mittlere Konfidenz — bitte prüfen";
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 h-5 px-1.5 rounded-full text-[10px] font-medium leading-none whitespace-nowrap ${cls}`}
    >
      <AlertCircle size={10} />
      Bitte prüfen
    </span>
  );
}

export function confidenceBorderClass(confidence?: string): string {
  if (confidence === "medium") return "ring-1 ring-amber-400/40";
  if (confidence === "low") return "ring-1 ring-orange-500/60";
  return "";
}
