"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage as ChatMessageType, TokenUsage } from "@/types/chat";

interface ChatMessageProps {
  message: ChatMessageType;
  isStreaming?: boolean;
}

function TokenSubline({ usage }: { usage: TokenUsage }) {
  const modelLabel = usage.model.split("/").pop() ?? usage.model;
  const promptK = (usage.prompt / 1000).toFixed(1);
  const cost = usage.cost_usd.toFixed(4);
  return (
    <div
      className="mt-1.5 text-[11px] font-mono"
      style={{ color: "var(--text-muted)" }}
    >
      {modelLabel} · {promptK}k in · {usage.completion} out · ≈ ${cost}
    </div>
  );
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
            <div className="text-sm chat-md" style={{ color: "var(--text-primary)" }}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: ({ children }: React.ComponentProps<"h1">) => (
                    <h2 className="text-base font-semibold mt-3 first:mt-0 mb-1.5">{children}</h2>
                  ),
                  h2: ({ children }: React.ComponentProps<"h2">) => (
                    <h3 className="text-sm font-semibold mt-3 first:mt-0 mb-1.5">{children}</h3>
                  ),
                  h3: ({ children }: React.ComponentProps<"h3">) => (
                    <h4
                      className="text-xs font-semibold uppercase tracking-wider mt-3 first:mt-0 mb-1"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {children}
                    </h4>
                  ),
                  p: ({ children }: React.ComponentProps<"p">) => (
                    <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>
                  ),
                  a: ({ children, href }: React.ComponentProps<"a">) => (
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-2"
                      style={{ color: "var(--accent)" }}
                    >
                      {children}
                    </a>
                  ),
                  code: ({ children }: React.ComponentProps<"code">) => (
                    <code
                      className="px-1 py-0.5 rounded text-xs font-mono"
                      style={{ background: "var(--bg-elevated)" }}
                    >
                      {children}
                    </code>
                  ),
                  pre: ({ children }: React.ComponentProps<"pre">) => (
                    <pre
                      className="mb-2 p-3 rounded-md overflow-x-auto text-xs font-mono app-scrollbar"
                      style={{ background: "var(--bg-inset)", border: "1px solid var(--border)" }}
                    >
                      {children}
                    </pre>
                  ),
                  ul: ({ children }: React.ComponentProps<"ul">) => (
                    <ul className="list-disc pl-5 mb-2 space-y-0.5">{children}</ul>
                  ),
                  ol: ({ children }: React.ComponentProps<"ol">) => (
                    <ol className="list-decimal pl-5 mb-2 space-y-0.5">{children}</ol>
                  ),
                  li: ({ children }: React.ComponentProps<"li">) => (
                    <li className="leading-relaxed">{children}</li>
                  ),
                  strong: ({ children }: React.ComponentProps<"strong">) => (
                    <strong className="font-semibold">{children}</strong>
                  ),
                  blockquote: ({ children }: React.ComponentProps<"blockquote">) => (
                    <blockquote
                      className="border-l-2 pl-3 my-2 italic"
                      style={{ borderColor: "var(--border-strong)", color: "var(--text-secondary)" }}
                    >
                      {children}
                    </blockquote>
                  ),
                  hr: () => (
                    <hr className="my-3" style={{ borderColor: "var(--border)" }} />
                  ),
                  table: ({ children }: React.ComponentProps<"table">) => (
                    <div className="my-2 overflow-x-auto app-scrollbar">
                      <table
                        className="w-full text-xs border-collapse rounded-md overflow-hidden"
                        style={{ border: "1px solid var(--border)" }}
                      >
                        {children}
                      </table>
                    </div>
                  ),
                  thead: ({ children }: React.ComponentProps<"thead">) => (
                    <thead style={{ background: "var(--bg-elevated)" }}>{children}</thead>
                  ),
                  th: ({ children }: React.ComponentProps<"th">) => (
                    <th
                      className="text-left font-semibold px-2.5 py-1.5"
                      style={{ borderBottom: "1px solid var(--border)", color: "var(--text-primary)" }}
                    >
                      {children}
                    </th>
                  ),
                  td: ({ children }: React.ComponentProps<"td">) => (
                    <td
                      className="px-2.5 py-1.5 align-top"
                      style={{ borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}
                    >
                      {children}
                    </td>
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
            {!isStreaming && message.token_usage && (
              <TokenSubline usage={message.token_usage} />
            )}
            {!isStreaming && message.is_local_command && !message.token_usage && (
              <div
                className="mt-1.5 text-[11px] font-mono"
                style={{ color: "var(--text-muted)" }}
              >
                lokal · 0 Token
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
