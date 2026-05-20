"use client";
import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error boundary:", error);
  }, [error]);

  return (
    <main
      className="min-h-screen grid place-items-center px-6"
      style={{ background: "var(--bg-base)" }}
    >
      <div className="text-center max-w-md">
        <div
          className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-6"
          style={{ background: "var(--danger-subtle)" }}
        >
          <AlertTriangle size={26} style={{ color: "var(--danger)" }} />
        </div>
        <h1
          className="text-2xl font-semibold mb-3"
          style={{ color: "var(--text-primary)" }}
        >
          Etwas ist schiefgelaufen
        </h1>
        <p
          className="text-sm mb-2"
          style={{ color: "var(--text-secondary)" }}
        >
          Ein unerwarteter Fehler ist aufgetreten.
        </p>
        {error.message && (
          <p
            className="text-xs font-mono mb-8 px-3 py-2 rounded-md"
            style={{
              color: "var(--text-muted)",
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
            }}
          >
            {error.message}
          </p>
        )}
        <div className="flex gap-2 justify-center">
          <button
            onClick={reset}
            className="px-4 py-2 rounded-md text-sm font-medium transition-default"
            style={{ background: "var(--accent)", color: "var(--primary-foreground)" }}
          >
            Erneut versuchen
          </button>
          <button
            onClick={() => (window.location.href = "/projects")}
            className="px-4 py-2 rounded-md text-sm font-medium transition-default border"
            style={{
              borderColor: "var(--border-strong)",
              color: "var(--text-primary)",
              background: "transparent",
            }}
          >
            Zur Startseite
          </button>
        </div>
      </div>
    </main>
  );
}
