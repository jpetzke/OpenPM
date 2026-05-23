"use client";

import type { DocumentMeta } from "@/hooks/useDocuments";

interface Props {
  ids: string[];
  documents: Record<string, DocumentMeta>;
  projectId?: string;
}

function truncateMid(text: string, max = 18): string {
  if (text.length <= max) return text;
  const half = Math.floor((max - 1) / 2);
  return `${text.slice(0, half)}…${text.slice(text.length - half)}`;
}

function openDocumentDrawer(documentId: string) {
  if (typeof document === "undefined") return;
  document.dispatchEvent(
    new CustomEvent("openDocumentDrawer", { detail: { documentId } }),
  );
}

interface PillProps {
  label: string;
  title: string;
  variant: "doc" | "chat" | "manual" | "legacy" | "more";
  onClick?: () => void;
}

function Pill({ label, title, variant, onClick }: PillProps) {
  const base =
    "inline-flex items-center h-5 px-2 rounded-full text-[10px] font-medium leading-none whitespace-nowrap transition-default";
  let cls = "";
  const style: React.CSSProperties = {};
  if (variant === "doc") {
    cls =
      "ring-1 ring-indigo-400/40 text-indigo-200 bg-indigo-500/10 hover:bg-indigo-500/20 cursor-pointer";
  } else if (variant === "chat") {
    cls = "ring-1 ring-indigo-400/30 text-indigo-300 bg-indigo-500/5";
  } else if (variant === "manual") {
    cls = "ring-1 ring-slate-500/40 text-slate-300 bg-slate-500/10";
  } else if (variant === "legacy") {
    cls = "ring-1 ring-slate-600/40 text-slate-400 italic bg-transparent";
  } else if (variant === "more") {
    cls = "ring-1 ring-slate-500/40 text-slate-300 bg-slate-500/10";
  }
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={title}
        className={`${base} ${cls}`}
        style={style}
      >
        {label}
      </button>
    );
  }
  return (
    <span title={title} className={`${base} ${cls}`} style={style}>
      {label}
    </span>
  );
}

interface ResolvedPill {
  key: string;
  label: string;
  title: string;
  variant: PillProps["variant"];
  onClick?: () => void;
}

function resolvePill(
  id: string,
  documents: Record<string, DocumentMeta>,
): ResolvedPill {
  if (id.startsWith("chat:")) {
    const snippet = id.slice("chat:".length);
    return {
      key: id,
      label: "aus Chat",
      title: `Quelle: Chat-Session ${snippet}`,
      variant: "chat",
    };
  }
  if (id.startsWith("manual:")) {
    return {
      key: id,
      label: "manuell",
      title: "Manuell hinzugefügt",
      variant: "manual",
    };
  }
  if (id === "legacy:pre-migration") {
    return {
      key: id,
      label: "Quelle vor Migration verloren",
      title: "Item stammt aus der Zeit vor Source-Tracking",
      variant: "legacy",
    };
  }
  if (id.startsWith("orphaned:")) {
    return {
      key: id,
      label: "Quell-Dokument gelöscht",
      title: "Quell-Dokument gelöscht — Item wurde nach der Löschung manuell oder per Chat geändert",
      variant: "legacy",
    };
  }
  const doc = documents[id];
  const filename = doc?.original_filename ?? "(unbekannt)";
  return {
    key: id,
    label: truncateMid(filename, 18),
    title: filename,
    variant: "doc",
    onClick: () => openDocumentDrawer(id),
  };
}

export function SourcePill({ ids, documents }: Props) {
  if (!ids || ids.length === 0) return null;

  const visible = ids.slice(0, 2);
  const rest = ids.slice(2);
  const showOverflow = ids.length > 3;

  // If exactly 3, show all three without a "+N more" pill.
  const visiblePills: ResolvedPill[] = showOverflow
    ? visible.map((id) => resolvePill(id, documents))
    : ids.map((id) => resolvePill(id, documents));

  let overflowPill: ResolvedPill | null = null;
  if (showOverflow) {
    const restLabels = rest
      .map((id) => {
        const p = resolvePill(id, documents);
        return p.title;
      })
      .join("\n");
    overflowPill = {
      key: "more",
      label: `+${rest.length} weitere`,
      title: restLabels,
      variant: "more",
    };
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {visiblePills.map((p) => (
        <Pill
          key={p.key}
          label={p.label}
          title={p.title}
          variant={p.variant}
          onClick={p.onClick}
        />
      ))}
      {overflowPill && (
        <Pill
          label={overflowPill.label}
          title={overflowPill.title}
          variant={overflowPill.variant}
        />
      )}
    </div>
  );
}
