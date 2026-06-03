"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Play, Trash2, X, BookOpen } from "lucide-react";
import { Citation } from "@/components/ui/Citation";
import { SourceGroups, type SourceInput } from "@/components/SourceGroups";
import { EASE_COZY } from "@/lib/motion";

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
  sources,
  hasGuide,
}: {
  deckId: string;
  name: string;
  topic: string;
  cards: Card[];
  dueCount: number;
  sources: SourceInput[];
  hasGuide: boolean;
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
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-cocoa/60 transition-colors hover:text-cocoa"
      >
        <ArrowLeft className="h-4 w-4" />
        Mazos
      </Link>

      <div className="mb-8 mt-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tightest text-espresso">{name}</h1>
          <p className="mt-1 text-cocoa/60">{topic}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {hasGuide && (
            <Link
              href={`/deck/${deckId}/guide`}
              className="inline-flex items-center gap-2 rounded-cozy bg-white/70 px-4 py-2.5 text-cocoa shadow-hairline transition-colors duration-200 ease-cozy hover:bg-white"
            >
              <BookOpen className="h-4 w-4" />
              Guía
            </Link>
          )}
          <Link
            href={`/study/${deckId}`}
            className="inline-flex items-center gap-2 rounded-cozy bg-sage px-5 py-2.5 font-medium text-cream shadow-soft transition-all duration-200 ease-cozy hover:-translate-y-0.5 hover:shadow-lift"
          >
            <Play className="h-4 w-4" />
            Repasar{dueCount > 0 ? ` (${dueCount})` : ""}
          </Link>
          <button
            onClick={deleteDeck}
            className="inline-flex items-center gap-2 rounded-cozy bg-white/70 px-4 py-2.5 text-cocoa shadow-hairline transition-colors duration-200 ease-cozy hover:bg-terracotta/10 hover:text-terracotta"
          >
            <Trash2 className="h-4 w-4" />
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
              transition={{ delay: i * 0.03, ease: EASE_COZY }}
              className="group rounded-cozy bg-white/80 p-5 shadow-soft ring-1 ring-clay"
            >
              <div className="flex justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-espresso">{c.front}</p>
                  <p className="mt-2 text-cocoa/80">{c.back}</p>
                  {c.source && (
                    <div className="mt-3">
                      <Citation source={c.source} />
                    </div>
                  )}
                </div>
                <button
                  onClick={() => deleteCard(c.id)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-cocoa/30 opacity-0 transition-all hover:bg-terracotta/10 hover:text-terracotta group-hover:opacity-100"
                  aria-label="Eliminar tarjeta"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {sources.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-lg font-semibold tracking-tight text-espresso">
            Fuentes para profundizar
          </h2>
          <SourceGroups sources={sources} title="Fuentes del mazo" />
        </section>
      )}
    </main>
  );
}
