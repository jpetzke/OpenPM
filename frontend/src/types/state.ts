export interface Task {
  id: string;
  title: string;
  status: "open" | "done" | "blocked";
  deadline?: string;
  source?: string;
}

export interface Contact {
  name: string;
  role: string;
  email?: string;
}

export interface Blocker {
  description: string;
  severity: "high" | "medium" | "low";
  days_since?: number;
}

export interface Decision {
  date: string;
  description: string;
}

export interface StateData {
  core?: { open_tasks?: Task[] };
  contacts?: Contact[];
  blockers?: Blocker[];
  decisions?: Decision[];
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
