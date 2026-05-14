export type DocumentStatus = "pending" | "processing" | "done" | "failed";

export interface PipelineLogEntry {
  timestamp: string;
  step: number | null;
  total: number;
  label: string;
  status: "running" | "done" | "failed" | "info";
  detail: string | null;
  meta: Record<string, unknown>;
}

export interface Document {
  id: string;
  project_id: string;
  original_filename: string;
  original_path: string;
  mime_type: string;
  file_size: number;
  raw_content: string | null;
  doc_metadata: Record<string, unknown> | null;
  summary: string | null;
  pipeline_logs: PipelineLogEntry[] | null;
  pipeline_step: number | null;
  pipeline_step_label: string | null;
  pipeline_updated_at: string | null;
  processing_status: DocumentStatus;
  processing_error: string | null;
  git_commit_hash: string | null;
  uploaded_by: string;
  uploaded_at: string;
}
