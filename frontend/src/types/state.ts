export type ConfidenceLevel = "high" | "medium" | "low";

export interface Task {
  id: string;
  title: string;
  status: "open" | "done" | "blocked";
  deadline?: string;
  assignee?: string | null;
  source_document_id?: string;
  source_document_ids?: string[];
  confidence?: ConfidenceLevel;
}

export interface Contact {
  id?: string;
  name: string;
  role: string;
  email?: string;
  phone?: string | null;
  source_document_ids?: string[];
  confidence?: ConfidenceLevel;
}

export interface Blocker {
  id?: string;
  title?: string;
  description?: string;
  severity?: "high" | "medium" | "low";
  days_since?: number;
  source_document_ids?: string[];
  confidence?: ConfidenceLevel;
}

export interface Decision {
  id?: string;
  title?: string;
  date: string;
  description: string;
  source_document_ids?: string[];
  confidence?: ConfidenceLevel;
}

export interface Deadline {
  id?: string;
  title: string;
  date: string;
  description?: string;
  source_document_ids?: string[];
  confidence?: ConfidenceLevel;
}

export interface DynamicStateItem {
  id: string;
  title?: string;
  label?: string;
  summary?: string;
  status?: "open" | "done" | "blocked" | "info";
  date?: string;
  source_document_ids?: string[];
  confidence?: ConfidenceLevel;
  [key: string]: unknown;
}

export interface DynamicSection {
  id: string;
  title: string;
  kind: string;
  items: DynamicStateItem[];
  source_document_ids?: string[];
}

export interface StateCore {
  contacts?: Contact[];
  open_tasks?: Task[];
  deadlines?: Deadline[];
  decisions?: Decision[];
  blockers?: Blocker[];
}

export interface StateConflict {
  type: string;
  title: string;
  field: string;
  a: {
    id: string;
    value: unknown;
    source_document_ids: string[];
    source_filename: string;
  };
  b: {
    id: string;
    value: unknown;
    source_document_ids: string[];
    source_filename: string;
  };
}

export interface StateData {
  core?: StateCore;
  dynamic_sections?: DynamicSection[];
  custom?: Record<string, unknown>;
  conflicts?: StateConflict[];
}

export interface ProjectState {
  id: string;
  project_id: string;
  version: number;
  state: StateData;
  triggered_by_document_id: string | null;
  created_at: string;
}

export interface StateChangelog {
  id: string;
  project_id: string;
  from_version: number | null;
  to_version: number;
  delta: Record<string, unknown>;
  document_id: string | null;
  triggered_by: string;
  git_commit_hash: string | null;
  created_at: string;
}
