export interface TokenUsage {
  prompt: number;
  completion: number;
  model: string;
  cost_usd: number;
  purpose: string;
}

export interface ChatMessage {
  id: string;
  project_id: string;
  user_id: string | null;
  role: "user" | "assistant" | "tool";
  content: string;
  tool_calls: Record<string, unknown> | null;
  tool_results: Record<string, unknown> | null;
  state_version: number | null;
  model: string | null;
  token_usage?: TokenUsage | null;
  created_at: string;
  /** When true, this message was produced by a local slash-command (no LLM round-trip). */
  is_local_command?: boolean;
}

export interface ChatStreamError {
  code: string;
  message: string;
}

export interface ChatStreamState {
  streaming: boolean;
  sending: boolean;
  streamingText: string;
  activeTools: string[];
  lastError: ChatStreamError | null;
}

export interface ActiveToolCall {
  call_id: string;
  tool_name: string;
  args: Record<string, unknown>;
  result_summary?: string;
  status: "running" | "done";
  /**
   * Character offset into the assistant's answer text at which this tool call
   * fired. Used to interleave the collapsed tool row at the correct position in
   * the conversation, both live and when rehydrating from history.
   */
  text_offset?: number;
}

export interface MutationCardData {
  undo_token: string;
  description: string;
  expires_in: number;  // seconds
  created_at: number;  // Date.now() at receipt
}

export interface ModelInfo {
  id: string;
  label: string;
  role: "chat" | "extraction" | "embedding";
}

export interface ChatSession {
  id: string;
  project_id: string;
  title: string | null;
  created_at: string;
  last_message_at: string;
  message_count: number;
}
