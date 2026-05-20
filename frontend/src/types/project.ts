export interface ProjectMember {
  id: string;
  name?: string | null;
  email: string;
}

export interface Project {
  id: string;
  name: string;
  client_name: string;
  status: string;
  compiled_briefing: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
  document_count?: number;
  open_task_count?: number | null;
  members?: ProjectMember[];
}

/**
 * Membership row (join between user and project).
 * Renamed from the previous `ProjectMember` to avoid collision with the
 * lightweight member shape returned by `GET /api/projects`.
 */
export interface ProjectMembership {
  id: string;
  project_id: string;
  user_id: string;
  role: string;
  joined_at: string;
}

export interface User {
  id: string;
  email: string;
  name: string | null;
  created_at: string;
}
