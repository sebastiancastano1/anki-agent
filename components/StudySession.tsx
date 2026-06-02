"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { CardFlip } from "@/components/CardFlip";
import { ReviewButtons } from "@/components/ReviewButtons";
import type { Rating } from "@/lib/srs";

interface Card {
  id: string;
  front: string;
  back: string;
}

export function StudySession({ deckId, deckName, cards }: { deckId: string; deckName: string; cards: Card[] }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [reviewed, setReviewed] = useState(0);

  const current = cards[index];
  const finished = index >= cards.length;

  async function rate(rating: Rating) {
    if (!current) return;
    const card = current;
    setReviewed((r) => r + 1);
    setFlipped(false);
    // advance after the flip-back animation begins
    setTimeout(() => setIndex((i) => i + 1), 250);
    await fetch("/api/review", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cardId: card.id, rating }),
    });
  }

  if (cards.length === 0) {
    return (
      <Wrapper deckId={deckId} deckName={deckName}>
        <Empty message="No hay tarjetas por repasar ahora. ¡Vuelve más tarde! 🌿" />
      </Wrapper>
    );
  }

  if (finished) {
    return (
      <Wrapper deckId={deckId} deckName={deckName}>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 18 }}
          className="rounded-cozy bg-white/80 p-12 text-center shadow-soft ring-1 ring-clay"
        >
          <div className="text-5xl">🎉</div>
          <h2 className="mt-4 text-2xl font-semibold text-espresso">¡Sesión completa!</h2>
          <p className="mt-2 text-cocoa/70">Repasaste {reviewed} tarjetas.</p>
          <Link
            href={`/deck/${deckId}`}
            className="mt-6 inline-block rounded-cozy bg-sage px-5 py-2.5 font-medium text-cream shadow-soft hover:-translate-y-0.5"
          >
            Volver al mazo
          </Link>
        </motion.div>
      </Wrapper>
    );
  }

  return (
    <Wrapper deckId={deckId} deckName={deckName}>
      <div className="mb-6 h-2 w-full overflow-hidden rounded-full bg-clay/50">
        <motion.div
          className="h-full bg-sage"
          animate={{ width: `${(index / cards.length) * 100}%` }}
          transition={{ ease: "easeOut" }}
        />
      </div>
      <p className="mb-4 text-center text-sm text-cocoa/50">
        {index + 1} / {cards.length}
      </p>

      <AnimatePresence mode="wait">
        <motion.div
          key={current.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
        >
          <CardFlip
            front={current.front}
            back={current.back}
            flipped={flipped}
            onClick={() => setFlipped((f) => !f)}
          />
        </motion.div>
      </AnimatePresence>

      <div className="mt-8">
        {flipped ? (
          <ReviewButtons onRate={rate} />
        ) : (
          <button
            onClick={() => setFlipped(true)}
            className="w-full rounded-cozy bg-terracotta px-4 py-3 font-medium text-cream shadow-soft hover:-translate-y-0.5"
          >
            Mostrar respuesta
          </button>
        )}
      </div>
    </Wrapper>
  );
}

function Wrapper({ deckId, deckName, children }: { deckId: string; deckName: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <Link href={`/deck/${deckId}`} className="text-sm text-cocoa/60 hover:text-cocoa">
        ← {deckName}
      </Link>
      <div className="mt-6">{children}</div>
    </main>
  );
}

function Empty({ message }: { message: string }) {
  return (
    <div className="rounded-cozy bg-white/70 p-12 text-center text-cocoa/70 shadow-soft ring-1 ring-clay">
      {message}
    </div>
  );
}
