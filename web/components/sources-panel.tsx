"use client";

import * as React from "react";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

export type Source = {
  n: number;
  title: string;
  publication: string;
  url: string;
  score?: number;
};

export function SourcesPanel({ sources }: { sources: Source[] }) {
  const [open, setOpen] = React.useState(false);
  if (!sources || sources.length === 0) return null;

  return (
    <div className="mt-3 overflow-hidden rounded-md border border-border bg-card/50 transition-all duration-200 ease-out">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors duration-200"
      >
        <span className="flex items-center gap-1.5">
          <span
            className={cn(
              "flex h-4 w-4 items-center justify-center rounded bg-muted transition-transform duration-200",
              open && "rotate-90"
            )}
          >
            <ChevronRight className="h-3 w-3" />
          </span>
          Sources ({sources.length})
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>

      <div
        className={cn(
          "grid transition-all duration-300 ease-out",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}
      >
        <ol className="overflow-hidden border-t border-border px-3 py-3 text-xs">
          {sources.map((s) => (
            <li
              key={s.n}
              className="flex gap-2 py-1.5 last:pb-0 animate-[slide-down_0.3s_ease-out_forwards]"
            >
              <span className="shrink-0 font-mono text-accent">
                [{s.n}]
              </span>
              <div className="min-w-0">
                <div className="truncate font-medium text-foreground">
                  {s.title}
                </div>
                {s.publication && (
                  <div className="truncate text-muted-foreground">
                    {s.publication}
                  </div>
                )}
                {s.url && (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(
                      "mt-0.5 inline-flex items-center gap-1 text-[11px]",
                      "text-accent hover:underline hover:text-accent/80"
                    )}
                  >
                    <ExternalLink className="h-3 w-3" />
                    <span className="truncate">{s.url}</span>
                  </a>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
