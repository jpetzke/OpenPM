export interface ChatMessage {
  id: string;
  project_id: string;
  user_id: string | null;
  role: "user" | "assistant" | "tool";
  content: string;
  tool_calls: Record<string, unknown> | null;
  tool_results: Record<string, unknown> | null;
  state_version: number | null;
  created_at: string;
}

export interface ChatStreamState {
  streaming: boolean;
  sending: boolean;
  streamingText: string;
  activeTools: string[];
}
