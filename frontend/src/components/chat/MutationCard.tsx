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
        className="flex items-center gap-2 text-xs px-3 py-2 rounded-md"
        style={{ background: "var(--bg-elevated)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
      >
        <RotateCcw size={11} />
        <span>Rückgängig gemacht</span>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-2 text-xs px-3 py-2 rounded-md"
      style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
    >
      <CheckCircle2 size={11} style={{ color: "var(--accent)" }} />
      <span style={{ color: "var(--text-primary)" }}>{card.description}</span>
      <button
        onClick={handleUndo}
        disabled={loading || secondsLeft <= 0}
        className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded text-xs disabled:opacity-40"
        style={{
          background: "var(--bg-surface)",
          color: secondsLeft > 0 ? "var(--accent)" : "var(--text-muted)",
          border: "1px solid var(--border-strong)",
        }}
      >
        <RotateCcw size={10} />
        {secondsLeft > 0 ? `Rückgängig ${secondsLeft}s` : "Abgelaufen"}
      </button>
    </div>
  );
}
