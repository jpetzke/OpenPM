"use client";
import { useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { usePipelineStore } from "@/store/pipelineStore";
import { formatRelativeTime } from "@/lib/utils";

interface ActivityTimelineProps {
  projectId: string;
}

const VISIBLE = 16;

function dotColor(status: string) {
  if (status === "failed") return "var(--danger)";
  if (status === "done") return "var(--success)";
  if (status === "running") return "var(--accent)";
  return "var(--text-muted)";
}

export function ActivityTimeline({ projectId }: ActivityTimelineProps) {
  const entries = usePipelineStore(
    useShallow((s) => s.perProjectActivity[projectId] ?? []),
  );
  const visible = entries.slice(0, VISIBLE);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (el.scrollTop < 12) el.scrollTop = 0;
  }, [visible.length]);

  return (
    <section
      className="rounded-[var(--radius)] border"
      style={{
        borderColor: "var(--border)",
        background: "var(--bg-surface)",
      }}
    >
      <header
        className="flex items-center justify-between px-4 py-2.5 border-b"
        style={{ borderColor: "var(--border)" }}
      >
        <span
          className="text-[10px] font-semibold uppercase tracking-widest"
          style={{ color: "var(--text-muted)" }}
        >
          Aktivität
        </span>
        <span
          className="text-[10px] font-mono tabular-nums"
          style={{ color: "var(--text-muted)" }}
        >
          {visible.length}
        </span>
      </header>
      <div ref={containerRef} className="max-h-[260px] overflow-y-auto app-scrollable">
        {visible.length === 0 ? (
          <p
            className="px-4 py-5 text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            Noch keine Aktivität.
          </p>
        ) : (
          <ul>
            {visible.map((entry, i) => (
              <li
                key={entry.id}
                className="px-4 py-2 flex items-baseline gap-2.5"
                style={{
                  borderTop:
                    i === 0 ? "none" : "1px solid var(--border)",
                }}
              >
                <span
                  aria-hidden
                  className="inline-block w-[5px] h-[5px] rounded-full shrink-0 mt-[6px]"
                  style={{ background: dotColor(entry.status) }}
                />
                <span
                  className="text-[10px] font-mono shrink-0 w-[52px] tabular-nums"
                  style={{ color: "var(--text-muted)" }}
                >
                  {formatRelativeTime(entry.ts)}
                </span>
                <span className="flex-1 min-w-0 text-xs">
                  {entry.documentName && (
                    <span
                      className="mr-1.5 truncate"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {entry.documentName}
                    </span>
                  )}
                  <span style={{ color: "var(--text-primary)" }}>
                    {entry.label}
                  </span>
                  {entry.detail && (
                    <span
                      className="ml-1.5"
                      style={{ color: "var(--text-muted)" }}
                    >
                      — {entry.detail}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
