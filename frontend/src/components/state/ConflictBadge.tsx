"use client";

import { AlertTriangle } from "lucide-react";
import type { ConflictInfo } from "@/lib/conflicts";

interface Props {
  conflict?: ConflictInfo;
}

export function ConflictBadge({ conflict }: Props) {
  if (!conflict) return null;
  const title = `Konflikt im Feld '${conflict.field}': aktuelles Item vs '${conflict.otherValue}' (aus ${conflict.otherSourceFilename})`;
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 h-5 px-1.5 rounded-full text-[10px] font-medium leading-none whitespace-nowrap ring-1 ring-red-500/60 text-red-300 bg-red-500/10"
    >
      <AlertTriangle size={10} />
      Konflikt
    </span>
  );
}
