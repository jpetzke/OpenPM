import type { Contact } from "@/types/state";

interface ContactCardProps {
  contact: Contact;
}

export function ContactCard({ contact }: ContactCardProps) {
  return (
    <div className="py-2 border-b last:border-0" style={{ borderColor: "var(--border)" }}>
      <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{contact.name}</p>
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>{contact.role}</p>
      {contact.email && (
        <a
          href={`mailto:${contact.email}`}
          className="text-xs transition-default hover:opacity-80"
          style={{ color: "var(--accent)" }}
        >
          {contact.email}
        </a>
      )}
    </div>
  );
}
