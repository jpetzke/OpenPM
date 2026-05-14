"use client";
import ReactMarkdown from "react-markdown";
import type { ChatMessage as ChatMessageType } from "@/types/chat";

interface ChatMessageProps {
  message: ChatMessageType;
  isStreaming?: boolean;
}

export function ChatMessageComponent({ message, isStreaming }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      <div className="max-w-[75%]">
        {isUser ? (
          <div
            className="px-4 py-2.5 rounded-lg text-sm"
            style={{ background: "var(--bg-elevated)", color: "var(--text-primary)" }}
          >
            {message.content}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-sm" style={{ color: "var(--text-primary)" }}>
              <ReactMarkdown
                components={{
                  p: ({ children }: React.ComponentProps<"p">) => (
                    <p className="mb-2 last:mb-0">{children}</p>
                  ),
                  code: ({ children }: React.ComponentProps<"code">) => (
                    <code
                      className="px-1 py-0.5 rounded text-xs font-mono"
                      style={{ background: "var(--bg-elevated)" }}
                    >
                      {children}
                    </code>
                  ),
                  ul: ({ children }: React.ComponentProps<"ul">) => (
                    <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>
                  ),
                  ol: ({ children }: React.ComponentProps<"ol">) => (
                    <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>
                  ),
                  strong: ({ children }: React.ComponentProps<"strong">) => (
                    <strong className="font-semibold">{children}</strong>
                  ),
                }}
              >
                {message.content}
              </ReactMarkdown>
              {isStreaming && (
                <span
                  className="inline-block w-0.5 h-4 ml-0.5 animate-pulse align-middle"
                  style={{ background: "var(--accent)" }}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
