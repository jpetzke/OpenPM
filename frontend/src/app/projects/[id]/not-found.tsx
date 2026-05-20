import Link from "next/link";
import { FolderX } from "lucide-react";

export default function ProjectNotFound() {
  return (
    <div
      className="flex-1 grid place-items-center px-6"
      style={{ background: "var(--bg-base)" }}
    >
      <div className="text-center max-w-sm">
        <div
          className="inline-flex items-center justify-center w-12 h-12 rounded-full mb-5"
          style={{ background: "var(--accent-subtle)" }}
        >
          <FolderX size={22} style={{ color: "var(--accent)" }} />
        </div>
        <h2
          className="text-lg font-semibold mb-2"
          style={{ color: "var(--text-primary)" }}
        >
          Projekt nicht gefunden
        </h2>
        <p
          className="text-sm mb-6"
          style={{ color: "var(--text-secondary)" }}
        >
          Dieses Projekt existiert nicht oder du hast keinen Zugriff.
        </p>
        <Link
          href="/projects"
          className="text-sm transition-default hover:underline"
          style={{ color: "var(--accent)" }}
        >
          Zu allen Projekten
        </Link>
      </div>
    </div>
  );
}
