export interface Project {
  id: string;
  name: string;
  client_name: string;
  status: string;
  compiled_briefing: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
}

export interface ProjectMember {
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
