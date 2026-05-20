import { ReactNode } from "react";
import { Breadcrumbs, BreadcrumbItem } from "./Breadcrumbs";

interface PageShellProps {
  title: string;
  breadcrumbs?: BreadcrumbItem[];
  actions?: ReactNode;
  children: ReactNode;
}

export function PageShell({ title, breadcrumbs, actions, children }: PageShellProps) {
  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)" }}>
      <div className="max-w-3xl mx-auto px-6 py-10">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <div className="mb-4">
            <Breadcrumbs items={breadcrumbs} />
          </div>
        )}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
            {title}
          </h1>
          {actions}
        </div>
        {children}
      </div>
    </div>
  );
}
