import type { Contact } from "@/types/state";
import type { DocumentMeta } from "@/hooks/useDocuments";
import type { ConflictInfo } from "@/lib/conflicts";
import { SourcePill } from "./SourcePill";
import {
  ConfidenceBadge,
  confidenceBorderClass,
} from "./ConfidenceBadge";
import { ConflictBadge } from "./ConflictBadge";

interface ContactCardProps {
  contact: Contact;
  documentsById: Record<string, DocumentMeta>;
  conflict?: ConflictInfo;
}

export function ContactCard({ contact, documentsById, conflict }: ContactCardProps) {
  const sourceIds = contact.source_document_ids ?? [];
  const border = confidenceBorderClass(contact.confidence);
  return (
    <div
      id={contact.id ? `contact-${contact.id}` : undefined}
      className={`py-2 px-1 rounded-md border-b last:border-0 ${border}`}
      style={{ borderColor: "var(--border)" }}
    >
      <div className="flex items-center gap-1.5 flex-wrap">
        <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          {contact.name}
        </p>
        <ConfidenceBadge confidence={contact.confidence} />
        <ConflictBadge conflict={conflict} />
      </div>
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
      {sourceIds.length > 0 && (
        <div className="mt-1.5">
          <SourcePill ids={sourceIds} documents={documentsById} />
        </div>
      )}
    </div>
  );
}
