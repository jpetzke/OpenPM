"use client";

import { useState } from "react";
import { Download, FileArchive, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  downloadBriefingMd,
  downloadProjectZip,
  getExportZipStatus,
  type ExportZipStatus,
} from "@/lib/export";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Section U: export controls in the status-block footer. Briefing downloads
 * directly; the full ZIP snapshot opens a confirm modal showing the size first
 * (it bundles every original document).
 */
export function ExportButtons({ projectId }: { projectId: string }) {
  const [busy, setBusy] = useState<null | "briefing" | "zip">(null);
  const [confirm, setConfirm] = useState<ExportZipStatus | null>(null);

  async function onBriefing() {
    setBusy("briefing");
    try {
      await downloadBriefingMd(projectId);
    } catch {
      toast.error("Export fehlgeschlagen");
    } finally {
      setBusy(null);
    }
  }

  async function onOpenZip() {
    try {
      const status = await getExportZipStatus(projectId);
      setConfirm(status);
    } catch {
      toast.error("Export-Status nicht verfügbar");
    }
  }

  async function onConfirmZip() {
    setConfirm(null);
    setBusy("zip");
    try {
      await downloadProjectZip(projectId);
      toast.success("Snapshot heruntergeladen");
    } catch {
      toast.error("ZIP-Export fehlgeschlagen");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className="mt-3 pt-3 flex items-center gap-2"
      style={{ borderTop: "1px solid var(--border)" }}
    >
      <span className="text-[11px] uppercase tracking-wide mr-auto" style={{ color: "var(--text-muted)" }}>
        Export
      </span>
      <button
        type="button"
        data-testid="export-briefing"
        onClick={onBriefing}
        disabled={busy !== null}
        className="flex items-center gap-1 text-[11px] px-2 py-1 rounded transition-default disabled:opacity-50"
        style={{ color: "var(--text-secondary)", border: "1px solid var(--border)" }}
      >
        {busy === "briefing" ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
        Briefing
      </button>
      <button
        type="button"
        data-testid="export-zip"
        onClick={onOpenZip}
        disabled={busy !== null}
        className="flex items-center gap-1 text-[11px] px-2 py-1 rounded transition-default disabled:opacity-50"
        style={{ color: "var(--text-secondary)", border: "1px solid var(--border)" }}
      >
        {busy === "zip" ? <Loader2 size={11} className="animate-spin" /> : <FileArchive size={11} />}
        ZIP
      </button>

      {confirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "var(--bg-overlay)" }}
          onClick={() => setConfirm(null)}
        >
          <div
            role="dialog"
            aria-label="Voll-Export bestätigen"
            className="rounded-lg p-4 max-w-sm w-full flex flex-col gap-3"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--border-strong)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              Voll-Export (ZIP)
            </h3>
            <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Der Snapshot enthält Briefing, State, History und{" "}
              <strong>{confirm.document_count} Original-Dokumente</strong>{" "}
              (~{formatBytes(confirm.documents_total_bytes)}). Fortfahren?
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirm(null)}
                className="text-[12px] px-3 py-1.5 rounded transition-default"
                style={{ color: "var(--text-secondary)", border: "1px solid var(--border)" }}
              >
                Abbrechen
              </button>
              <button
                type="button"
                data-testid="export-zip-confirm"
                onClick={onConfirmZip}
                className="text-[12px] px-3 py-1.5 rounded transition-default"
                style={{ background: "var(--accent)", color: "white" }}
              >
                Herunterladen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
