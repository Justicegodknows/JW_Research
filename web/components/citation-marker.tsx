"use client";

import * as React from "react";
import type { Source } from "@/components/sources-panel";

type CitationMarkerProps = {
    markerText: string;
    source: Source;
};

export function CitationMarker({ markerText, source }: CitationMarkerProps) {
    const tooltipId = React.useId();

    return (
        <span className="group relative mx-0.5 inline-flex align-baseline">
            <a
                href={source.url}
                target="_blank"
                rel="noreferrer"
                aria-describedby={tooltipId}
                className="rounded-sm px-0.5 text-accent underline-offset-2 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                onClick={(e) => e.stopPropagation()}
            >
                {markerText}
            </a>

            <span
                id={tooltipId}
                role="tooltip"
                className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-72 -translate-x-1/2 rounded-md border border-border bg-popover p-3 text-left text-xs text-popover-foreground opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
            >
                <p className="font-mono text-[11px] text-accent">[{source.n}]</p>
                <p className="mt-1 line-clamp-2 font-medium text-foreground">
                    {source.title || "Untitled source"}
                </p>
                {source.publication ? (
                    <p className="mt-1 line-clamp-2 text-muted-foreground">{source.publication}</p>
                ) : null}
                <p className="mt-1 truncate text-[11px] text-muted-foreground">{source.url}</p>
            </span>
        </span>
    );
}
