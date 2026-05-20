import Link from "next/link";
import { FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <main
      className="min-h-screen grid place-items-center px-6"
      style={{ background: "var(--bg-base)" }}
    >
      <div className="text-center max-w-md">
        <div
          className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-6"
          style={{ background: "var(--accent-subtle)" }}
        >
          <FileQuestion size={26} style={{ color: "var(--accent)" }} />
        </div>
        <p
          className="text-xs uppercase tracking-widest mb-2"
          style={{ color: "var(--accent)" }}
        >
          404
        </p>
        <h1
          className="text-2xl font-semibold mb-3"
          style={{ color: "var(--text-primary)" }}
        >
          Seite nicht gefunden
        </h1>
        <p
          className="text-sm mb-8"
          style={{ color: "var(--text-secondary)" }}
        >
          Die Seite, die du suchst, gibt es nicht (mehr). Vielleicht wurde sie verschoben.
        </p>
        <Link
          href="/projects"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-default"
          style={{ background: "var(--accent)", color: "var(--primary-foreground)" }}
        >
          Zurück zu Projekten
        </Link>
      </div>
    </main>
  );
}
