"use client";
import { useMemo } from "react";
import Link from "next/link";
import { Sparkles, ArrowUpRight } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import {
  usePipelineStore,
  type ExtractedSummary,
} from "@/store/pipelineStore";
import { formatRelativeTime } from "@/lib/utils";

interface LiveExtractionPanelProps {
  projectId: string;
}

function fieldEntries(summary: ExtractedSummary): Array<[string, number]> {
  return [
    ["Tasks", summary.tasks_added],
    ["Deadlines", summary.deadlines_added],
    ["Kontakte", summary.contacts_added],
    ["Entscheidungen", summary.decisions_added],
    ["Blocker", summary.blockers_added],
  ];
}

export function LiveExtractionPanel({ projectId }: LiveExtractionPanelProps) {
  const last = usePipelineStore(
    useShallow((s) => s.perProjectLastExtraction[projectId] ?? null),
  );
  const docNames = usePipelineStore((s) => s.docNames);
  const processingCount = usePipelineStore(
    useShallow((s) => {
      let n = 0;
      for (const docId of Object.keys(s.docProject)) {
        if (s.docProject[docId] !== projectId) continue;
        if (s.pipelines[docId] === "processing") n += 1;
      }
      return n;
    }),
  );

  const summary = last?.summary;
  const totalNew = summary
    ? summary.tasks_added +
      summary.deadlines_added +
      summary.contacts_added +
      summary.decisions_added +
      summary.blockers_added +
      (summary.dynamic_items_added ?? 0)
    : 0;

  const docName = useMemo(() => {
    if (!last) return null;
    return last.filename ?? docNames[last.documentId] ?? null;
  }, [last, docNames]);

  return (
    <aside
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
          {processingCount > 0 ? "Extrahiert gerade" : "Letzte Extraktion"}
        </span>
        <Sparkles
          size={12}
          style={{
            color: processingCount > 0 ? "var(--accent)" : "var(--text-muted)",
          }}
        />
      </header>

      {!last ? (
        <div className="px-4 py-6 text-center">
          <p className="text-sm" style={{ color: "var(--text-primary)" }}>
            Noch nichts extrahiert
          </p>
          <p
            className="mt-1 text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            Sobald ein Dokument fertig ist, erscheinen hier Tasks, Deadlines &amp; Kontakte.
          </p>
        </div>
      ) : (
        <div className="px-4 py-3 space-y-3">
          <div>
            <p
              className="text-[11px]"
              style={{ color: "var(--text-muted)" }}
            >
              {docName ?? "Dokument"} · {formatRelativeTime(last.at)}
            </p>
            <p
              className="text-2xl font-semibold mt-0.5 tabular-nums"
              style={{
                color: totalNew > 0 ? "var(--accent)" : "var(--text-secondary)",
              }}
            >
              {totalNew > 0 ? `+${totalNew}` : "—"}
              <span
                className="ml-2 text-xs font-normal"
                style={{ color: "var(--text-muted)" }}
              >
                neue Einträge
              </span>
            </p>
          </div>

          {summary && (
            <dl className="space-y-1">
              {fieldEntries(summary).map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-baseline justify-between text-xs"
                >
                  <dt style={{ color: "var(--text-secondary)" }}>{label}</dt>
                  <dd
                    className="font-mono tabular-nums"
                    style={{
                      color: value > 0 ? "var(--text-primary)" : "var(--text-muted)",
                    }}
                  >
                    {value > 0 ? `+${value}` : "·"}
                  </dd>
                </div>
              ))}
              {summary.dynamic_items_added !== undefined &&
                summary.dynamic_items_added > 0 && (
                  <div className="flex items-baseline justify-between text-xs">
                    <dt style={{ color: "var(--text-secondary)" }}>
                      Dynamische Items
                    </dt>
                    <dd
                      className="font-mono tabular-nums"
                      style={{ color: "var(--text-primary)" }}
                    >
                      +{summary.dynamic_items_added}
                    </dd>
                  </div>
                )}
            </dl>
          )}

          {summary?.sample &&
            (summary.sample.first_task || summary.sample.first_deadline) && (
              <div
                className="border-t pt-2"
                style={{ borderColor: "var(--border)" }}
              >
                <p
                  className="text-[10px] font-semibold uppercase tracking-widest mb-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  Auszug
                </p>
                {summary.sample.first_task && (
                  <p
                    className="text-xs mb-0.5"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {summary.sample.first_task}
                  </p>
                )}
                {summary.sample.first_deadline && (
                  <p
                    className="text-xs"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Deadline: {summary.sample.first_deadline}
                  </p>
                )}
              </div>
            )}

          <Link
            href={`/projects/${projectId}`}
            className="inline-flex items-center gap-1 text-xs transition-default"
            style={{ color: "var(--accent)" }}
          >
            State öffnen
            <ArrowUpRight size={12} />
          </Link>
        </div>
      )}
    </aside>
  );
}
