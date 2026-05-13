"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface ProjectTabsProps {
  projectId: string;
}

const TABS = [
  { label: "Upload", path: "upload" },
  { label: "State", path: "state" },
  { label: "Chat", path: "chat" },
];

export function ProjectTabs({ projectId }: ProjectTabsProps) {
  const pathname = usePathname();

  return (
    <div className="flex gap-0">
      {TABS.map(({ label, path }) => {
        const href = `/projects/${projectId}/${path}`;
        const isActive = pathname === href;
        return (
          <Link
            key={path}
            href={href}
            className="px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-default"
            style={{
              color: isActive ? "var(--text-primary)" : "var(--text-muted)",
              borderBottomColor: isActive ? "var(--accent)" : "transparent",
            }}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
