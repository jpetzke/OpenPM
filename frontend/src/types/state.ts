export interface Task {
  id: string;
  title: string;
  status: "open" | "done" | "blocked";
  deadline?: string;
  assignee?: string | null;
  source_document_id?: string;
}

export interface Contact {
  id?: string;
  name: string;
  role: string;
  email?: string;
  phone?: string | null;
}

export interface Blocker {
  id?: string;
  title?: string;
  description?: string;
  severity?: "high" | "medium" | "low";
  days_since?: number;
}

export interface Decision {
  id?: string;
  title?: string;
  date: string;
  description: string;
}

export interface Deadline {
  id?: string;
  title: string;
  date: string;
  description?: string;
}

export interface DynamicStateItem {
  id: string;
  title?: string;
  label?: string;
  summary?: string;
  status?: "open" | "done" | "blocked" | "info";
  date?: string;
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

export interface StateData {
  core?: StateCore;
  dynamic_sections?: DynamicSection[];
  custom?: Record<string, unknown>;
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
