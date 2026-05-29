"use client";

import { ChatInput } from "@/components/chat/ChatInput";
import type { ModelInfo } from "@/types/chat";

interface Props {
  onSend: (content: string) => void;
  onAbort?: () => void;
  disabled: boolean;
  sending: boolean;
  models?: ModelInfo[];
  selectedModel?: string;
  onModelChange?: (model: string) => void;
  onFocus?: () => void;
  projectId?: string;
  onSlashCommand?: (name: string, arg: string) => void;
}

export function StickyChatInput(props: Props) {
  return (
    <div
      className="sticky bottom-0 left-0 right-0 z-10 shrink-0"
      style={{ background: "var(--bg-base)" }}
    >
      <ChatInput {...props} />
    </div>
  );
}
