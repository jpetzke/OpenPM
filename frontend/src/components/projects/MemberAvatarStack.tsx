import { ProjectMember } from "@/types/project";

function initials(member: ProjectMember): string {
  const src = member.name?.trim() || member.email;
  const parts = src.split(/[\s@.]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.slice(0, 2) || "?").toUpperCase();
}

export function MemberAvatarStack({
  members,
  max = 3,
}: {
  members: ProjectMember[];
  max?: number;
}) {
  if (!members?.length) return null;
  const shown = members.slice(0, max);
  const overflow = members.length - shown.length;
  return (
    <div className="flex -space-x-1.5">
      {shown.map((m) => (
        <div
          key={m.id}
          title={m.name ?? m.email}
          className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium ring-2"
          style={{
            background: "var(--bg-elevated)",
            color: "var(--text-secondary)",
            // ring color matches card background so the avatars "cut out" the stack edge
            // @ts-expect-error CSS variable for tailwind ring color
            "--tw-ring-color": "var(--bg-surface)",
          }}
        >
          {initials(m)}
        </div>
      ))}
      {overflow > 0 && (
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium ring-2"
          style={{
            background: "var(--bg-elevated)",
            color: "var(--text-muted)",
            // @ts-expect-error CSS variable for tailwind ring color
            "--tw-ring-color": "var(--bg-surface)",
          }}
        >
          +{overflow}
        </div>
      )}
    </div>
  );
}
