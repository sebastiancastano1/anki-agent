"use client";

import { AnimatePresence, motion } from "framer-motion";

export interface ProgressItem {
  id: number;
  type: string;
  text: string;
}

const ICONS: Record<string, string> = {
  status: "✦",
  search: "🔍",
  thinking: "✎",
  error: "⚠",
};

export function ResearchProgress({ items }: { items: ProgressItem[] }) {
  return (
    <ul className="space-y-2">
      <AnimatePresence initial={false}>
        {items.map((item) => (
          <motion.li
            key={item.id}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            className={`flex items-start gap-3 rounded-2xl px-4 py-2.5 text-sm shadow-soft ring-1 ${
              item.type === "error"
                ? "bg-terracotta/10 text-terracotta ring-terracotta/30"
                : "bg-white/70 text-cocoa ring-clay"
            }`}
          >
            <span className="mt-0.5">{ICONS[item.type] ?? "·"}</span>
            <span className="flex-1 leading-snug">{item.text}</span>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}
