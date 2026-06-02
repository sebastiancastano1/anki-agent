"use client";

import Link from "next/link";
import { motion } from "framer-motion";

export interface DeckSummary {
  id: string;
  name: string;
  topic: string;
  cardCount: number;
  dueCount: number;
}

export function DeckList({ decks }: { decks: DeckSummary[] }) {
  if (decks.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-cozy bg-white/60 p-10 text-center text-cocoa/70 shadow-soft ring-1 ring-clay"
      >
        Aún no tienes mazos. Investiga un tema para crear el primero ✨
      </motion.div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {decks.map((deck, i) => (
        <motion.div
          key={deck.id}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
          whileHover={{ y: -4 }}
        >
          <Link
            href={`/deck/${deck.id}`}
            className="block rounded-cozy bg-white/80 p-6 shadow-soft ring-1 ring-clay transition-shadow hover:shadow-lift"
          >
            <h3 className="text-lg font-semibold text-espresso">{deck.name}</h3>
            <p className="mt-1 line-clamp-1 text-sm text-cocoa/60">{deck.topic}</p>
            <div className="mt-4 flex items-center gap-3 text-sm">
              <span className="rounded-full bg-clay/60 px-3 py-1 text-cocoa">
                {deck.cardCount} tarjetas
              </span>
              {deck.dueCount > 0 && (
                <span className="rounded-full bg-sage/20 px-3 py-1 font-medium text-sage">
                  {deck.dueCount} por repasar
                </span>
              )}
            </div>
          </Link>
        </motion.div>
      ))}
    </div>
  );
}
