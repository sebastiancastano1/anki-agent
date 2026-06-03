"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Layers, Sparkles, ChevronLeft, ChevronRight } from "lucide-react";
import { CardFlip } from "@/components/CardFlip";
import { EASE_COZY } from "@/lib/motion";

export interface DeckCard {
  front: string;
  back: string;
  source?: string;
}

/**
 * Interactive stacked deck. Cards land on top of the pile as they arrive (juicy
 * spring + sparkle); the top card is flippable and the pile can be browsed with
 * the prev/next controls.
 */
export function DeckPile({
  cards,
  building,
}: {
  cards: DeckCard[];
  building: boolean;
}) {
  const reduce = useReducedMotion();
  const [current, setCurrent] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [landed, setLanded] = useState(false);

  // When new cards arrive, bring the newest to the top of the pile.
  useEffect(() => {
    if (cards.length === 0) return;
    setCurrent(cards.length - 1);
    setFlipped(false);
    setLanded(true);
    const t = setTimeout(() => setLanded(false), 900);
    return () => clearTimeout(t);
  }, [cards.length]);

  const card = cards[current];
  const atNewest = current === cards.length - 1;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-cocoa">
          <Layers className="h-4 w-4 text-terracotta" />
          Tu mazo
          <motion.span
            key={cards.length}
            initial={reduce ? false : { scale: 1.4 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 16 }}
            className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-terracotta px-2 text-xs font-semibold text-cream"
          >
            {cards.length}
          </motion.span>
          {cards.length === 1 ? "tarjeta" : "tarjetas"}
        </div>
        {cards.length > 1 && (
          <div className="flex items-center gap-1 text-cocoa/60">
            <button
              onClick={() => {
                setCurrent((c) => Math.max(0, c - 1));
                setFlipped(false);
              }}
              disabled={current === 0}
              aria-label="Tarjeta anterior"
              className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-clay/50 disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="w-12 text-center text-xs tabular-nums">
              {current + 1}/{cards.length}
            </span>
            <button
              onClick={() => {
                setCurrent((c) => Math.min(cards.length - 1, c + 1));
                setFlipped(false);
              }}
              disabled={atNewest}
              aria-label="Tarjeta siguiente"
              className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-clay/50 disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {cards.length === 0 && building && (
        <div className="rounded-cozy bg-white/40 p-12 text-center text-sm text-cocoa/50 ring-1 ring-clay">
          <Sparkles className="mx-auto mb-2 h-5 w-5 animate-pulse-soft text-terracotta" />
          Esperando la primera tarjeta verificada…
        </div>
      )}

      {card && (
        <div className="relative">
          {/* Decorative cards underneath, suggesting a pile. */}
          {[2, 1].map((depth) =>
            current - depth >= 0 ? (
              <div
                key={depth}
                aria-hidden
                className="absolute inset-x-0 top-0 rounded-cozy bg-white/70 shadow-soft ring-1 ring-clay"
                style={{
                  height: "20rem",
                  transform: `translateY(${depth * 8}px) scale(${1 - depth * 0.03}) rotate(${depth % 2 ? -1.5 : 1.5}deg)`,
                  zIndex: 0,
                }}
              />
            ) : null
          )}

          <AnimatePresence mode="popLayout">
            <motion.div
              key={current}
              initial={
                reduce
                  ? { opacity: 0 }
                  : atNewest
                    ? { opacity: 0, y: -60, scale: 0.9, rotate: -4 }
                    : { opacity: 0, x: 24 }
              }
              animate={{ opacity: 1, y: 0, x: 0, scale: 1, rotate: 0 }}
              transition={
                reduce ? { duration: 0.2 } : { type: "spring", stiffness: 360, damping: 22 }
              }
              className="relative"
              style={{ zIndex: 1 }}
            >
              {atNewest && landed && building && !reduce && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.5, rotate: -20 }}
                  animate={{ opacity: [0, 1, 0], scale: [0.5, 1.2, 1.4], rotate: 10 }}
                  transition={{ duration: 0.9, ease: EASE_COZY }}
                  className="pointer-events-none absolute -right-1 -top-1 z-10 text-honey"
                >
                  <Sparkles className="h-6 w-6" />
                </motion.span>
              )}
              <CardFlip
                front={card.front}
                back={card.back}
                source={card.source}
                flipped={flipped}
                onClick={() => setFlipped((f) => !f)}
              />
            </motion.div>
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
