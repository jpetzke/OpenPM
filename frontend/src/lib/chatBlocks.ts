import type { ActiveToolCall, ChatMessage } from "@/types/chat";

/**
 * A rendered segment of an assistant turn: either a run of markdown prose or a
 * single tool invocation rendered as a collapsible row. The agent emits prose
 * and tool calls interleaved across rounds; we reconstruct that ordering so the
 * tool rows land at the exact spot in the conversation where they fired
 * (claude.ai style), rather than being dumped at the end.
 */
export type ChatBlock =
  | { kind: "text"; text: string }
  | { kind: "tool"; call: ActiveToolCall };

/** Safely pull the ordered tool invocations off a persisted message. */
export function getInvocations(
  message: Pick<ChatMessage, "tool_calls">,
): ActiveToolCall[] {
  const tc = message.tool_calls as { invocations?: unknown } | null;
  const inv = tc?.invocations;
  return Array.isArray(inv) ? (inv as ActiveToolCall[]) : [];
}

/**
 * Split `text` at each invocation's `text_offset` and weave the tool rows in.
 * Offsets are clamped and monotonic, so this is safe while text is still
 * streaming (offsets past the revealed text snap a tool row to the tail until
 * the prose catches up and locks it into place).
 */
export function buildChatBlocks(
  text: string,
  invocations: ActiveToolCall[],
): ChatBlock[] {
  if (invocations.length === 0) {
    return text ? [{ kind: "text", text }] : [];
  }
  const sorted = [...invocations].sort(
    (a, b) => (a.text_offset ?? 0) - (b.text_offset ?? 0),
  );
  const blocks: ChatBlock[] = [];
  let cursor = 0;
  for (const call of sorted) {
    const off = Math.min(Math.max(call.text_offset ?? 0, cursor), text.length);
    const seg = text.slice(cursor, off);
    if (seg) blocks.push({ kind: "text", text: seg });
    blocks.push({ kind: "tool", call });
    cursor = off;
  }
  const tail = text.slice(cursor);
  if (tail) blocks.push({ kind: "text", text: tail });
  return blocks;
}
