export function ProjectCardSkeleton() {
  return (
    <div
      className="min-h-[200px] rounded-[var(--radius-md)] border p-6 animate-pulse"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
    >
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="space-y-2 flex-1">
          <div
            className="h-5 rounded w-3/4"
            style={{ background: "var(--bg-elevated)" }}
          />
          <div
            className="h-3 rounded w-1/2"
            style={{ background: "var(--bg-elevated)" }}
          />
        </div>
        <div
          className="h-5 w-16 rounded-full"
          style={{ background: "var(--bg-elevated)" }}
        />
      </div>
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-1.5">
            <div
              className="h-2 rounded w-2/3"
              style={{ background: "var(--bg-elevated)" }}
            />
            <div
              className="h-4 rounded w-1/3"
              style={{ background: "var(--bg-elevated)" }}
            />
          </div>
        ))}
      </div>
      <div
        className="pt-4 border-t"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-6 h-6 rounded-full"
              style={{ background: "var(--bg-elevated)" }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
