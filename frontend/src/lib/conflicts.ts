export interface ConflictSide {
  id: string;
  value: unknown;
  source_document_ids: string[];
  source_filename: string;
}

export interface Conflict {
  type: string;
  title: string;
  field: string;
  a: ConflictSide;
  b: ConflictSide;
}

export interface ConflictInfo {
  field: string;
  otherValue: string;
  otherSourceFilename: string;
}

export function conflictForItem(
  itemId: string,
  conflicts: Conflict[],
): ConflictInfo | undefined {
  if (!itemId) return undefined;
  for (const c of conflicts) {
    if (c.a.id === itemId) {
      return {
        field: c.field,
        otherValue: String(c.b.value),
        otherSourceFilename: c.b.source_filename,
      };
    }
    if (c.b.id === itemId) {
      return {
        field: c.field,
        otherValue: String(c.a.value),
        otherSourceFilename: c.a.source_filename,
      };
    }
  }
  return undefined;
}
