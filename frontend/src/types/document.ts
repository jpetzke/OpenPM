export type DocumentStatus = "pending" | "processing" | "done" | "failed";

export interface Document {
  id: string;
  project_id: string;
  original_filename: string;
  original_path: string;
  mime_type: string;
  file_size: number;
  processing_status: DocumentStatus;
  processing_error: string | null;
  git_commit_hash: string | null;
  uploaded_by: string;
  uploaded_at: string;
}
