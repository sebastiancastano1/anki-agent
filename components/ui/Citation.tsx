"use client";

import { ExternalLink } from "lucide-react";

/** Parse a source string into a navigable host + url, or null if not a URL. */
function parseSource(source: string): { url: string; host: string } | null {
  try {
    const url = new URL(source.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return { url: url.toString(), host: url.hostname.replace(/^www\./, "") };
  } catch {
    return null;
  }
}

/**
 * Renders a card source as a navigable chip (favicon + domain + external-link
 * icon). Falls back to plain text when the source is not a valid URL.
 */
export function Citation({ source, title }: { source: string; title?: string }) {
  const parsed = parseSource(source);

  if (!parsed) {
    return (
      <span className="text-xs text-cocoa/50">{source}</span>
    );
  }

  return (
    <a
      href={parsed.url}
      target="_blank"
      rel="noopener noreferrer"
      title={title ?? parsed.url}
      className="group inline-flex max-w-full items-center gap-1.5 rounded-full bg-clay/40 px-2.5 py-1 text-xs text-cocoa shadow-hairline transition-all duration-200 ease-cozy hover:-translate-y-0.5 hover:bg-clay/70 hover:text-espresso sm:max-w-[18rem]"
    >
      <img
        src={`https://icons.duckduckgo.com/ip3/${parsed.host}.ico`}
        alt=""
        width={14}
        height={14}
        className="h-3.5 w-3.5 shrink-0 rounded-sm"
        loading="lazy"
      />
      <span className="truncate">{title ?? parsed.host}</span>
      <ExternalLink className="h-3 w-3 shrink-0 opacity-50 transition-opacity group-hover:opacity-90" />
    </a>
  );
}
