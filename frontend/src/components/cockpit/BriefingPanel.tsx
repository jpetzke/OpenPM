"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Sparkles, Copy, Check, ChevronDown, ChevronRight } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { api } from "@/lib/api";
import type { Project } from "@/types/project";

interface Props {
  projectId: string;
}

// Shared markdown renderers — compact, token-styled, used in panel + modal.
const MD_COMPONENTS = {
  h1: ({ children }: React.ComponentProps<"h1">) => (
    <h2 className="text-sm font-semibold mt-3 first:mt-0 mb-1" style={{ color: "var(--text-primary)" }}>{children}</h2>
  ),
  h2: ({ children }: React.ComponentProps<"h2">) => (
    <h3 className="text-[13px] font-semibold mt-3 first:mt-0 mb-1" style={{ color: "var(--text-primary)" }}>{children}</h3>
  ),
  h3: ({ children }: React.ComponentProps<"h3">) => (
    <h4 className="text-xs font-semibold uppercase tracking-wider mt-3 first:mt-0 mb-1" style={{ color: "var(--text-muted)" }}>{children}</h4>
  ),
  p: ({ children }: React.ComponentProps<"p">) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }: React.ComponentProps<"ul">) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
  ol: ({ children }: React.ComponentProps<"ol">) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
  strong: ({ children }: React.ComponentProps<"strong">) => (
    <strong className="font-semibold" style={{ color: "var(--text-primary)" }}>{children}</strong>
  ),
  code: ({ children }: React.ComponentProps<"code">) => (
    <code className="px-1 py-0.5 rounded text-[0.85em] font-mono" style={{ background: "var(--bg-elevated)" }}>{children}</code>
  ),
};

export function BriefingPanel({ projectId }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  // Briefing is the largest block in the sidebar — collapse it by default so the
  // sidebar opens quiet; the full text is one click away (here or in the modal).
  const [collapsed, setCollapsed] = useState(true);
  const { data: project, isLoading } = useQuery<Project>({
    queryKey: ["projects", projectId],
    queryFn: () => api.get<Project>(`/api/projects/${projectId}`),
  });

  const briefing = project?.compiled_briefing?.trim() ?? null;

  return (
    <section
      className="rounded-lg p-3.5"
      style={{ background: "var(--bg-base)", border: "1px solid var(--border)" }}
    >
      <header className="flex items-center justify-between mb-2.5">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="text-xs uppercase tracking-wide flex items-center gap-1 transition-default"
          style={{ color: "var(--text-muted)", fontWeight: 500 }}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Briefing aufklappen" : "Briefing zuklappen"}
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          Briefing
        </button>
        <div className="flex items-center gap-1.5">
          {project?.briefing_token_count != null && (
            <span
              className="text-xs px-1.5 py-0.5 rounded font-mono"
              style={{ color: "var(--text-muted)", background: "var(--bg-elevated)" }}
            >
              {project.briefing_token_count} Token
            </span>
          )}
          {project?.briefing_was_truncated && (
            <span
              className="text-xs px-1.5 py-0.5 rounded cursor-default"
              title="Briefing wurde auf Token-Budget gekürzt — Priorität ist konfigurierbar in Settings."
              style={{ color: "var(--warning)", background: "var(--warning-subtle)" }}
            >
              gekürzt
            </span>
          )}
        </div>
      </header>

      {!collapsed && (isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-3 rounded animate-pulse" style={{ background: "var(--bg-elevated)" }} />
          ))}
        </div>
      ) : briefing ? (
        <>
          <div
            className="kinetic-md relative text-xs leading-relaxed overflow-hidden"
            style={{ color: "var(--text-secondary)", maxHeight: "132px" }}
          >
            <ReactMarkdown components={MD_COMPONENTS}>{briefing}</ReactMarkdown>
            <div
              className="absolute bottom-0 left-0 right-0 h-10 pointer-events-none"
              style={{ background: "linear-gradient(transparent, var(--bg-base))" }}
            />
          </div>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="mt-2 text-xs transition-default hover:underline"
            style={{ color: "var(--accent)" }}
          >
            Vollständiges Briefing anzeigen →
          </button>
        </>
      ) : (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Noch kein Briefing erstellt. Lade Dokumente hoch, um eines zu generieren.
        </p>
      ))}

      {modalOpen && briefing && (
        <BriefingModal
          briefing={briefing}
          tokenCount={project?.briefing_token_count ?? null}
          onClose={() => setModalOpen(false)}
        />
      )}
    </section>
  );
}

function BriefingModal({
  briefing,
  tokenCount,
  onClose,
}: {
  briefing: string;
  tokenCount: number | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(briefing);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard may be unavailable; no-op
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="atmos rounded-lg max-w-2xl w-full max-h-[82vh] flex flex-col rise-in"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-strong)", boxShadow: "var(--shadow-lg)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <header
          className="flex items-center justify-between px-5 py-3 border-b shrink-0"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="flex items-center gap-2">
            <Sparkles size={15} style={{ color: "var(--accent)" }} />
            <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Briefing
            </h2>
            {tokenCount != null && (
              <span
                className="text-[11px] px-1.5 py-0.5 rounded font-mono"
                style={{ color: "var(--text-muted)", background: "var(--bg-elevated)" }}
              >
                {tokenCount} Token
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={copy}
              aria-label="Briefing kopieren"
              className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-md transition-default"
              style={{ color: copied ? "var(--success)" : "var(--text-muted)", border: "1px solid var(--border)" }}
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? "Kopiert" : "Kopieren"}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Schließen"
              className="p-1.5 rounded-md transition-default"
              style={{ color: "var(--text-muted)" }}
            >
              <X size={16} />
            </button>
          </div>
        </header>
        <div
          className="kinetic-md px-6 py-5 overflow-y-auto text-sm leading-relaxed app-scrollbar"
          style={{ color: "var(--text-secondary)" }}
        >
          <ReactMarkdown components={MD_COMPONENTS}>{briefing}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
