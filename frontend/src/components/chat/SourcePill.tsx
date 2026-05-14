import { ExternalLink } from "lucide-react";

interface SourcePillProps {
  filename: string;
  onClick?: () => void;
}

export function SourcePill({ filename, onClick }: SourcePillProps) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-xs transition-default hover:opacity-80"
      style={{
        background: "var(--bg-elevated)",
        color: "var(--text-secondary)",
        border: "1px solid var(--border)",
      }}
    >
      {filename}
      <ExternalLink size={10} />
    </button>
  );
}
