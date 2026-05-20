"use client";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Brotkrumen" className="flex items-center gap-1.5 text-xs">
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1;
        return (
          <div key={idx} className="flex items-center gap-1.5">
            {idx > 0 && (
              <ChevronRight size={12} style={{ color: "var(--text-disabled)" }} />
            )}
            {item.href && !isLast ? (
              <Link
                href={item.href}
                className="transition-default hover:underline"
                style={{ color: "var(--text-muted)" }}
              >
                {item.label}
              </Link>
            ) : (
              <span style={{ color: isLast ? "var(--text-primary)" : "var(--text-muted)" }}>
                {item.label}
              </span>
            )}
          </div>
        );
      })}
    </nav>
  );
}
