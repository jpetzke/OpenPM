"use client";
import { useState, useEffect } from "react";
import { CheckCircle2, RotateCcw } from "lucide-react";
import { api } from "@/lib/api";
import type { MutationCardData } from "@/types/chat";

interface Props {
  card: MutationCardData;
  projectId: string;
  onUndone?: () => void;
}

// Copilot-respectful mutation receipt: the assistant changed project state,
// says exactly what it did, and offers a time-boxed undo. A decaying bar makes
// the remaining window legible at a glance.
export function MutationCard({ card, projectId, onUndone }: Props) {
  const elapsed = () => Math.floor((Date.now() - card.created_at) / 1000);
  const [secondsLeft, setSecondsLeft] = useState(Math.max(0, card.expires_in - elapsed()));
  const [loading, setLoading] = useState(false);
  const [undone, setUndone] = useState(false);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const interval = setInterval(() => {
      const left = Math.max(0, card.expires_in - elapsed());
      setSecondsLeft(left);
      if (left <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.created_at, card.expires_in]);

  const handleUndo = async () => {
    setLoading(true);
    try {
      await api.post(`/api/projects/${projectId}/chat/mutations/${card.undo_token}/revert`, {});
      setUndone(true);
      onUndone?.();
    } catch {
      // silently fail — the button will remain enabled if still in time
    } finally {
      setLoading(false);
    }
  };

  if (undone) {
    return (
      <div
        className="flex items-center gap-2 text-xs px-3 py-2 rounded-md animate-fade-in"
        style={{
          background: "var(--bg-elevated)",
          color: "var(--text-muted)",
          border: "1px solid var(--border)",
          borderLeft: "2px solid var(--text-muted)",
        }}
      >
        <RotateCcw size={12} />
        <span>Rückgängig gemacht</span>
      </div>
    );
  }

  const active = secondsLeft > 0;
  const pct = active ? (secondsLeft / card.expires_in) * 100 : 0;

  return (
    <div
      className="relative overflow-hidden rounded-md animate-fade-in"
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderLeft: "2px solid var(--accent)",
      }}
    >
      <div className="flex items-center gap-2 text-xs px-3 py-2">
        <CheckCircle2 size={13} className="shrink-0" style={{ color: "var(--accent)" }} />
        <span className="flex-1 min-w-0" style={{ color: "var(--text-primary)" }}>
          {card.description}
        </span>
        <button
          onClick={handleUndo}
          disabled={loading || !active}
          className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded text-xs shrink-0 transition-default disabled:opacity-40"
          style={{
            background: "var(--bg-surface)",
            color: active ? "var(--accent)" : "var(--text-muted)",
            border: "1px solid var(--border-strong)",
          }}
        >
          <RotateCcw size={10} />
          {active ? (
            <>
              Rückgängig <span className="tabular-nums">{secondsLeft}s</span>
            </>
          ) : (
            "Abgelaufen"
          )}
        </button>
      </div>
      {/* decaying time bar */}
      <div className="h-0.5 w-full" style={{ background: "var(--border)" }}>
        <div
          className="h-full"
          style={{
            width: `${pct}%`,
            background: "var(--accent)",
            transition: "width 1s linear",
          }}
        />
      </div>
    </div>
  );
}
