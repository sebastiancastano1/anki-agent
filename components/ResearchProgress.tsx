"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Search, BookOpen, Sparkles, PenLine, Check, AlertTriangle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { EASE_COZY } from "@/lib/motion";

export type Phase = "searching" | "reading" | "generating" | "writing";

const PHASE_ORDER: Phase[] = ["searching", "reading", "generating", "writing"];

const PHASE_META: Record<Phase, { label: string; icon: LucideIcon }> = {
  searching: { label: "Buscando", icon: Search },
  reading: { label: "Leyendo y verificando", icon: BookOpen },
  generating: { label: "Generando tarjetas", icon: Sparkles },
  writing: { label: "Redactando la guía", icon: PenLine },
};

type State = "done" | "active" | "pending";

function stateFor(phase: Phase, current: Phase | null, finished: boolean): State {
  if (finished) return "done";
  if (current === null) return "pending";
  const ci = PHASE_ORDER.indexOf(current);
  const pi = PHASE_ORDER.indexOf(phase);
  if (pi < ci) return "done";
  if (pi === ci) return "active";
  return "pending";
}

export function ResearchProgress({
  phase,
  finished,
  activeQuery,
  reasoning,
  error,
}: {
  phase: Phase | null;
  finished: boolean;
  activeQuery?: string | null;
  reasoning?: string | null;
  error?: string | null;
}) {
  return (
    <div
      className="rounded-cozy bg-white/60 p-5 shadow-soft ring-1 ring-clay backdrop-blur-md"
      role="status"
      aria-live="polite"
    >
      <ol className="space-y-1">
        {PHASE_ORDER.map((p) => {
          const st = stateFor(p, phase, finished);
          const { label, icon: Icon } = PHASE_META[p];
          return (
            <li
              key={p}
              className="flex items-center gap-3 py-1.5"
              aria-current={st === "active" ? "step" : undefined}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors duration-300 ease-cozy ${
                  st === "done"
                    ? "bg-sage text-cream"
                    : st === "active"
                      ? "bg-terracotta text-cream"
                      : "bg-clay/50 text-cocoa/40"
                }`}
              >
                {st === "done" ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Icon className={`h-4 w-4 ${st === "active" ? "animate-pulse-soft" : ""}`} />
                )}
              </span>
              <div className="min-w-0">
                <p
                  className={`text-sm font-medium transition-colors ${
                    st === "pending" ? "text-cocoa/40" : "text-espresso"
                  }`}
                >
                  {label}
                </p>
                {p === "searching" && st === "active" && activeQuery && (
                  <p className="truncate text-xs text-cocoa/60">{activeQuery}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <AnimatePresence>
        {reasoning && !finished && (
          <motion.p
            key={reasoning}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE_COZY }}
            className="mt-3 border-t border-clay/70 pt-3 text-xs italic leading-relaxed text-cocoa/70"
          >
            {reasoning}
          </motion.p>
        )}
      </AnimatePresence>

      {error && (
        <div
          role="alert"
          aria-live="assertive"
          className="mt-3 flex items-start gap-2 rounded-2xl bg-terracotta/10 px-3 py-2 text-sm text-terracotta ring-1 ring-terracotta/30"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
