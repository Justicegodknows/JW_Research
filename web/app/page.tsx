"use client";

import * as React from "react";
import { useChat } from "@ai-sdk/react";
import { Send, Loader2, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SourcesPanel, type Source } from "@/components/sources-panel";
import { cn } from "@/lib/utils";

type SourcesByMessageId = Record<string, Source[]>;

export default function ChatPage() {
  const [sourcesByMsg, setSourcesByMsg] = React.useState<SourcesByMessageId>({});
  const pendingSourcesRef = React.useRef<Source[] | null>(null);

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    status,
    stop
  } = useChat({
    api: "/api/chat",
    onResponse(response) {
      const raw = response.headers.get("x-jw-sources");
      if (raw) {
        try {
          const parsed = JSON.parse(decodeURIComponent(raw)) as Source[];
          pendingSourcesRef.current = parsed;
        } catch {
          pendingSourcesRef.current = null;
        }
      }
    },
    onFinish(message) {
      if (pendingSourcesRef.current) {
        const s = pendingSourcesRef.current;
        setSourcesByMsg((prev) => ({ ...prev, [message.id]: s }));
        pendingSourcesRef.current = null;
      }
    }
  });

  const isLoading = status === "submitted" || status === "streaming";

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const form = (e.target as HTMLElement).closest("form");
      form?.requestSubmit();
    }
  };

  const scrollRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth"
    });
  }, [messages, isLoading]);

  return (
    <div className="flex h-screen flex-col">
      <header className="border-b border-border">
        <div className="container flex h-14 items-center gap-2">
          <BookOpen className="h-5 w-5" />
          <h1 className="text-sm font-semibold">JW Research</h1>
          <span className="ml-2 text-xs text-muted-foreground">
            Grounded answers from JW Library
          </span>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="container max-w-3xl py-6">
          {messages.length === 0 && (
            <div className="mt-20 text-center text-sm text-muted-foreground">
              <p className="mb-2">Ask a question about JW Library content.</p>
              <p className="text-xs">
                Every claim will be cited with [n] and a Sources panel.
              </p>
            </div>
          )}

          <ul className="space-y-6">
            {messages.map((m) => {
              const isUser = m.role === "user";
              const text =
                typeof m.content === "string"
                  ? m.content
                  : (m as unknown as { content: string }).content || "";
              const srcs = sourcesByMsg[m.id];

              return (
                <li
                  key={m.id}
                  className={cn(
                    "flex",
                    isUser ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-lg px-4 py-3 text-sm leading-relaxed",
                      isUser
                        ? "bg-primary text-primary-foreground"
                        : "bg-card text-card-foreground border border-border"
                    )}
                  >
                    <div className="whitespace-pre-wrap">{text}</div>
                    {!isUser && srcs && <SourcesPanel sources={srcs} />}
                  </div>
                </li>
              );
            })}

            {isLoading && (
              <li className="flex justify-start">
                <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Searching sources and thinking...
                </div>
              </li>
            )}
          </ul>
        </div>
      </div>

      <div className="border-t border-border bg-background">
        <div className="container max-w-3xl py-3">
          <form onSubmit={handleSubmit} className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={handleInputChange}
              onKeyDown={onKeyDown}
              placeholder="Ask anything about JW Library content..."
              rows={2}
              className="flex-1"
              disabled={isLoading}
            />
            {isLoading ? (
              <Button type="button" variant="outline" onClick={() => stop()}>
                Stop
              </Button>
            ) : (
              <Button type="submit" size="icon" disabled={!input.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            )}
          </form>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Enter to send, Shift+Enter for newline. Answers are grounded; if
            context is insufficient the model will refuse.
          </p>
        </div>
      </div>
    </div>
  );
}
