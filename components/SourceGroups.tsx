"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Library } from "lucide-react";
import { Citation } from "@/components/ui/Citation";
import { groupByTier, type SourceTier } from "@/lib/sources";
import { EASE_COZY } from "@/lib/motion";

export interface SourceInput {
  url: string;
  title: string;
}

// Academic tier is the only one expanded by default — the curated "best".
const DEFAULT_OPEN: Record<SourceTier, boolean> = {
  academic: true,
  trusted: false,
  other: false,
};

function Group({
  label,
  tier,
  sources,
}: {
  label: string;
  tier: SourceTier;
  sources: { url: string; title: string }[];
}) {
  const [open, setOpen] = useState(DEFAULT_OPEN[tier]);
  return (
    <div className="overflow-hidden rounded-2xl bg-white/50 ring-1 ring-clay">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium text-cocoa transition-colors hover:bg-white/60"
      >
        <span className="flex items-center gap-2">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${
              tier === "academic"
                ? "bg-sage"
                : tier === "trusted"
                  ? "bg-honey"
                  : "bg-clay"
            }`}
          />
          {label}
          <span className="text-cocoa/50">({sources.length})</span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-cocoa/50 transition-transform duration-200 ease-cozy ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.26, ease: EASE_COZY }}
            className="overflow-hidden"
          >
            <ul className="flex flex-wrap gap-2 px-3 pb-3">
              {sources.map((s) => (
                <li key={s.url} className="min-w-0 max-w-full">
                  <Citation source={s.url} title={s.title} />
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Sources grouped into credibility tiers, each tier collapsible.
 * Used live during research and on the deck page.
 */
export function SourceGroups({
  sources,
  title = "Fuentes consultadas",
}: {
  sources: SourceInput[];
  title?: string;
}) {
  if (sources.length === 0) return null;
  const groups = groupByTier(sources);

  return (
    <div className="rounded-cozy bg-white/60 p-4 shadow-soft ring-1 ring-clay backdrop-blur-md">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-cocoa">
        <Library className="h-4 w-4 text-sage" />
        {title}
        <span className="text-cocoa/50">({sources.length})</span>
      </div>
      <div className="space-y-2">
        {groups.map((g) => (
          <Group key={g.tier} label={g.label} tier={g.tier} sources={g.sources} />
        ))}
      </div>
    </div>
  );
}
