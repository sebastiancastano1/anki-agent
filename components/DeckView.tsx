"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

interface Card {
  id: string;
  front: string;
  back: string;
  source: string | null;
}

export function DeckView({
  deckId,
  name,
  topic,
  cards: initialCards,
  dueCount,
}: {
  deckId: string;
  name: string;
  topic: string;
  cards: Card[];
  dueCount: number;
}) {
  const router = useRouter();
  const [cards, setCards] = useState(initialCards);

  async function deleteCard(id: string) {
    setCards((prev) => prev.filter((c) => c.id !== id));
    await fetch(`/api/cards/${id}`, { method: "DELETE" });
  }

  async function deleteDeck() {
    if (!confirm("¿Eliminar este mazo y todas sus tarjetas?")) return;
    await fetch(`/api/decks/${deckId}`, { method: "DELETE" });
    router.push("/");
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <Link href="/" className="text-sm text-cocoa/60 hover:text-cocoa">
        ← Mazos
      </Link>

      <div className="mb-8 mt-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-espresso">{name}</h1>
          <p className="mt-1 text-cocoa/60">{topic}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link
            href={`/study/${deckId}`}
            className="rounded-cozy bg-sage px-5 py-2.5 font-medium text-cream shadow-soft hover:-translate-y-0.5"
          >
            Repasar{dueCount > 0 ? ` (${dueCount})` : ""}
          </Link>
          <button
            onClick={deleteDeck}
            className="rounded-cozy bg-white/70 px-4 py-2.5 text-cocoa shadow-soft ring-1 ring-clay hover:bg-terracotta/10 hover:text-terracotta"
          >
            Eliminar
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <AnimatePresence>
          {cards.map((c, i) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ delay: i * 0.03 }}
              className="group rounded-cozy bg-white/80 p-5 shadow-soft ring-1 ring-clay"
            >
              <div className="flex justify-between gap-4">
                <div className="flex-1">
                  <p className="font-medium text-espresso">{c.front}</p>
                  <p className="mt-2 text-cocoa/80">{c.back}</p>
                  {c.source && (
                    <p className="mt-2 truncate text-xs text-cocoa/50">{c.source}</p>
                  )}
                </div>
                <button
                  onClick={() => deleteCard(c.id)}
                  className="h-fit rounded-full px-2 text-cocoa/30 opacity-0 transition-opacity hover:text-terracotta group-hover:opacity-100"
                  aria-label="Eliminar tarjeta"
                >
                  ✕
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </main>
  );
}
