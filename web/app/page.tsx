"use client";

import * as React from "react";
import { useChat } from "@ai-sdk/react";
import { Send, Loader2, BookOpen, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CitationMarker } from "@/components/citation-marker";
import { SourcesPanel, type Source } from "@/components/sources-panel";
import { cn } from "@/lib/utils";

type SourcesByMessageId = Record<string, Source[]>;

// Parse citations like [1], [2] and convert to interactive markers.
function parseContentWithCitations(
  content: string,
  sources: Source[] | undefined
): React.ReactNode {
  if (!sources || sources.length === 0) {
    return content;
  }

  const citationMap = new Map<number, Source>();
  sources.forEach((s) => {
    if (s.n && s.url) {
      citationMap.set(s.n, s);
    }
  });

  // Regex to match [1], [2], etc.
  const parts = content.split(/(\[\d+\])/g);

  return parts.map((part, idx) => {
    const match = part.match(/^\[(\d+)\]$/);
    if (match) {
      const num = parseInt(match[1], 10);
      const source = citationMap.get(num);
      if (source) {
        return <CitationMarker key={idx} markerText={part} source={source} />;
      }
    }
    return part;
  });
}

export default function ChatPage() {
  const [sourcesByMsg, setSourcesByMsg] = React.useState<SourcesByMessageId>({});
  const [isLoading, setIsLoading] = React.useState(false);
  const [uiError, setUiError] = React.useState<string | null>(null);
  const [lastSubmittedInput, setLastSubmittedInput] = React.useState("");
  const finalAssistantMessageRef = React.useRef("");
  const pendingSourcesRef = React.useRef<Source[] | null>(null);

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    append,
    stop
  } = useChat({
    api: "/api/chat",
    streamProtocol: "data",
    onResponse(response) {
      if (!response.ok) {
        setIsLoading(false);
        pendingSourcesRef.current = null;
        setUiError("Request failed. Please check your backend and environment settings.");
        return;
      }

      setUiError(null);
      setIsLoading(true);
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
      setIsLoading(false);
      finalAssistantMessageRef.current = message.content;
      if (pendingSourcesRef.current) {
        const s = pendingSourcesRef.current;
        setSourcesByMsg((prev) => ({ ...prev, [message.id]: s }));
        pendingSourcesRef.current = null;
      }
    },
    onError(error) {
      setIsLoading(false);
      pendingSourcesRef.current = null;
      setUiError(error?.message || "Request failed. Please try again.");
    }
  });

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    setUiError(null);
    setLastSubmittedInput(input.trim());
    handleSubmit(e);
  };

  const onRetry = async () => {
    const text = lastSubmittedInput.trim();
    if (!text || isLoading) return;
    setUiError(null);
    await append({ role: "user", content: text });
  };

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
      {/* Enhanced Header */}
      <header className="border-b border-border/50 glass sticky top-0 z-10">
        <div className="container flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 border border-accent/20">
              <BookOpen className="h-5 w-5 text-accent" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight">
                JW Research
              </h1>
              <p className="text-xs text-muted-foreground">
                Grounded answers from JW Library
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-muted/50 text-xs text-muted-foreground">
            <Sparkles className="h-3 w-3 text-accent" />
            <span>AI Powered</span>
          </div>
        </div>
      </header>

      {/* Chat Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="container max-w-3xl py-8">
          {messages.length === 0 && (
            <div className="mt-16 text-center">
              <div className="mb-6 flex justify-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 border border-accent/20 animate-pulse-glow">
                  <Sparkles className="h-8 w-8 text-accent" />
                </div>
              </div>
              <h2 className="mb-2 text-lg font-medium">
                What would you like to explore?
              </h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Ask questions about JW Library publications. Each answer is
                grounded with source citations.
              </p>
            </div>
          )}

          <ul className="space-y-6">
            {messages.map((m, idx) => {
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
                    "flex animate-slide-up",
                    isUser ? "justify-end" : "justify-start"
                  )}
                  style={{ animationDelay: `${idx * 50}ms` }}
                >
                  <div
                    className={cn(
                      "max-w-[85%] sm:max-w-[85%] w-full rounded-2xl px-4 sm:px-5 py-3 sm:py-4 text-sm leading-relaxed shadow-sm",
                      isUser
                        ? "bg-primary text-primary-foreground"
                        : "bg-card text-card-foreground border border-border/50"
                    )}
                  >
                    <div className="whitespace-pre-wrap">
                      {isUser ? text : parseContentWithCitations(text, srcs)}
                    </div>
                    {!isUser && srcs && <SourcesPanel sources={srcs} />}
                  </div>
                </li>
              );
            })}

            {isLoading && (
              <li className="flex justify-start animate-fade-in">
                <div className="flex items-center gap-3 rounded-2xl border border-border/50 bg-card px-5 py-4 text-sm shadow-sm">
                  <div className="flex gap-1">
                    <span className="h-2 w-2 rounded-full bg-accent animate-bounce [animation-delay:-0.3s]" />
                    <span className="h-2 w-2 rounded-full bg-accent animate-bounce [animation-delay:-0.15s]" />
                    <span className="h-2 w-2 rounded-full bg-accent animate-bounce" />
                  </div>
                  <span className="text-muted-foreground">
                    Searching sources and thinking...
                  </span>
                </div>
              </li>
            )}
          </ul>
        </div>
      </div>

      {/* Enhanced Input Area */}
      <div className="border-t border-border/50 glass">
        <div className="container max-w-3xl py-4">
          {uiError && (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <span>{uiError}</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void onRetry()}
                disabled={isLoading || !lastSubmittedInput.trim()}
              >
                Retry
              </Button>
            </div>
          )}

          <form onSubmit={onSubmit} className="flex items-end gap-3">
            <Textarea
              value={input}
              onChange={handleInputChange}
              onKeyDown={onKeyDown}
              placeholder="Ask anything about JW Library content..."
              rows={1}
              className="flex-1 min-h-[44px] sm:min-h-[60px] resize-none text-base"
              disabled={isLoading}
            />
            {isLoading ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => stop()}
                className="h-auto px-4"
              >
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Stop
              </Button>
            ) : (
              <Button
                type="submit"
                size="icon"
                disabled={!input.trim()}
                className="h-10 w-10"
              >
                <Send className="h-4 w-4" />
              </Button>
            )}
          </form>
          <p className="mt-2 hidden sm:block text-center text-[11px] text-muted-foreground">
            Press <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">Enter</kbd> to send,{' '}
            <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">Shift+Enter</kbd> for new line. Answers are grounded
            with sources.
          </p>
          <p className="mt-2 block sm:hidden text-center text-[11px] text-muted-foreground">
            Tap send button or press Enter. Answers are grounded with sources.
          </p>
        </div>
      </div>
    </div>
  );
}
