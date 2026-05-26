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
    <div className="mt-3 rounded-md border border-border bg-card/50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <span className="flex items-center gap-1">
          {open ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          Sources ({sources.length})
        </span>
      </button>

      {open && (
        <ol className="space-y-2 border-t border-border px-3 py-3 text-xs">
          {sources.map((s) => (
            <li key={s.n} className="flex gap-2">
              <span className="shrink-0 font-mono text-muted-foreground">
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
                      "text-blue-500 hover:underline"
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
      )}
    </div>
  );
}
