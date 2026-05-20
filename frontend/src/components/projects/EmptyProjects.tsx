import { FolderPlus } from "lucide-react";

export function EmptyProjects({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="text-center py-24">
      <div
        className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-6"
        style={{ background: "var(--accent-subtle)" }}
      >
        <FolderPlus size={28} style={{ color: "var(--accent)" }} />
      </div>
      <h2
        className="text-2xl font-semibold mb-3"
        style={{ color: "var(--text-primary)" }}
      >
        Noch nichts hier
      </h2>
      <p
        className="text-sm max-w-md mx-auto mb-8"
        style={{ color: "var(--text-secondary)" }}
      >
        Lege dein erstes Projekt an, um Dokumente zu sammeln, State zu
        extrahieren und Briefings zu generieren.
      </p>
      <button
        onClick={onCreate}
        className="px-5 py-2.5 rounded-md text-sm font-medium transition-default"
        style={{ background: "var(--accent)", color: "var(--primary-foreground)" }}
      >
        Erstes Projekt anlegen
      </button>
    </div>
  );
}
