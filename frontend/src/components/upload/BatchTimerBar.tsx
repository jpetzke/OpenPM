"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, Zap } from "lucide-react";
import { api } from "@/lib/api";
import type { Document } from "@/types/document";

const WINDOW_S = 10;

interface BatchTimerBarProps {
  projectId: string;
  pendingDocs: Document[];
  onTriggered?: () => void;
}

export function BatchTimerBar({ projectId, pendingDocs, onTriggered }: BatchTimerBarProps) {
  const [remaining, setRemaining] = useState(WINDOW_S);
  const [paused, setPaused] = useState(false);
  const prevIdsRef = useRef("");

  // Reset the countdown whenever the set of pending docs changes (new upload arrived)
  useEffect(() => {
    const ids = pendingDocs.map((d) => d.id).sort().join(",");
    if (ids === prevIdsRef.current) return;
    prevIdsRef.current = ids;
    if (pendingDocs.length > 0 && !paused) setRemaining(WINDOW_S);
  }, [pendingDocs, paused]);

  // Tick every second while not paused
  useEffect(() => {
    if (paused || pendingDocs.length === 0 || remaining <= 0) return;
    const t = setTimeout(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearTimeout(t);
  }, [paused, pendingDocs.length, remaining]);

  const skip = useCallback(async () => {
    setRemaining(0);
    try {
      await api.post(`/api/projects/${projectId}/documents/batch/trigger`);
      onTriggered?.();
    } catch {}
  }, [projectId, onTriggered]);

  const togglePause = useCallback(async () => {
    try {
      if (paused) {
        await api.post(`/api/projects/${projectId}/documents/batch/resume`);
        setPaused(false);
        setRemaining(WINDOW_S);
      } else {
        await api.post(`/api/projects/${projectId}/documents/batch/pause`);
        setPaused(true);
      }
    } catch {}
  }, [paused, projectId]);

  if (pendingDocs.length === 0) return null;

  const fillPct = ((WINDOW_S - remaining) / WINDOW_S) * 100;
  const label =
    remaining === 0
      ? "Wird gestartet…"
      : paused
        ? "Pausiert"
        : `Verarbeitung in ${remaining}s`;

  return (
    <div
      className="rounded-lg mb-2 overflow-hidden"
      style={{ border: "1px solid var(--border)", background: "var(--bg-elevated)" }}
    >
      {/* progress strip */}
      <div className="h-[2px]" style={{ background: "var(--border)" }}>
        <div
          className="h-full"
          style={{
            width: `${fillPct}%`,
            background: "var(--accent)",
            transition: paused ? "none" : "width 1s linear",
          }}
        />
      </div>

      <div className="flex items-center gap-2 px-3 py-2">
        <span className="flex-1 text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
          {pendingDocs.length} Dokument{pendingDocs.length !== 1 ? "e" : ""} · {label}
        </span>

        <button
          onClick={skip}
          title="Jetzt verarbeiten"
          className="flex items-center gap-1 rounded px-2 py-0.5 text-xs transition-default hover:opacity-70"
          style={{ color: "var(--accent)" }}
        >
          <Zap size={11} />
          Jetzt
        </button>

        <button
          onClick={togglePause}
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
