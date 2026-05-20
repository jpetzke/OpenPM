"use client";
import { Pause, Play, Zap } from "lucide-react";

export interface BatchTimerBarProps {
  pendingCount: number;
  remaining: number;
  windowS: number;
  paused: boolean;
  onTriggerNow: () => void;
  onTogglePause: () => void;
}

/**
 * Presentational primitive — purely renders the batch countdown row.
 * All store/api/timer plumbing lives in the parent (GlobalStatusBar).
 */
export function BatchTimerBar({
  pendingCount,
  remaining,
  windowS,
  paused,
  onTriggerNow,
  onTogglePause,
}: BatchTimerBarProps) {
  if (pendingCount === 0) return null;

  const safeWindow = windowS > 0 ? windowS : 1;
  const fillPct = Math.min(100, Math.max(0, ((safeWindow - remaining) / safeWindow) * 100));
  const label =
    remaining === 0
      ? "Wird gestartet…"
      : paused
        ? "Pausiert"
        : `Verarbeitung in ${remaining}s`;

  return (
    <div className="w-full h-full flex flex-col">
      {/* progress strip */}
      <div className="h-[2px] shrink-0" style={{ background: "var(--border)" }}>
        <div
          className="h-full"
          style={{
            width: `${fillPct}%`,
            background: "var(--accent)",
            transition: paused ? "none" : "width 1s linear",
          }}
        />
      </div>

      <div className="flex flex-1 items-center gap-2 px-3">
        <span className="flex-1 text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
          {pendingCount} Dokument{pendingCount !== 1 ? "e" : ""} · {label}
        </span>

        <button
          onClick={onTriggerNow}
          title="Jetzt verarbeiten"
          className="flex items-center gap-1 rounded px-2 py-0.5 text-xs transition-default hover:opacity-70"
          style={{ color: "var(--accent)" }}
        >
          <Zap size={11} />
          Jetzt
        </button>

        <button
          onClick={onTogglePause}
          title={paused ? "Fortsetzen" : "Pausieren"}
          className="rounded p-1 transition-default hover:opacity-70"
          style={{ color: "var(--text-muted)" }}
        >
          {paused ? <Play size={12} /> : <Pause size={12} />}
        </button>
      </div>
    </div>
  );
}
