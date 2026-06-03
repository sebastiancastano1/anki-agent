"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Eye } from "lucide-react";
import { CardFlip } from "@/components/CardFlip";
import { ReviewButtons } from "@/components/ReviewButtons";
import { EASE_COZY } from "@/lib/motion";
import type { Rating } from "@/lib/srs";

interface Card {
  id: string;
  front: string;
  back: string;
  source?: string | null;
}

const KEY_TO_RATING: Record<string, Rating> = {
  "1": "again",
  "2": "hard",
  "3": "good",
  "4": "easy",
};

export function StudySession({ deckId, deckName, cards }: { deckId: string; deckName: string; cards: Card[] }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);

  const current = cards[index];
  const finished = index >= cards.length;

  async function rate(rating: Rating) {
    if (!current) return;
    const card = current;
    setFlipped(false);
    // advance after the flip-back animation begins
    setTimeout(() => setIndex((i) => i + 1), 250);
    // Only count the review once the SM-2 state is actually persisted.
    // If the POST fails the schedule would silently diverge from the DB,
    // so surface the error and roll the advance back instead.
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cardId: card.id, rating }),
      });
      if (!res.ok) throw new Error(`review failed: ${res.status}`);
      setReviewed((r) => r + 1);
      setSaveError(null);
    } catch {
      // Roll back the optimistic advance so the card can be retried.
      setTimeout(() => {
        setIndex((i) => Math.max(0, i - 1));
        setFlipped(true);
      }, 250);
      setSaveError("No se pudo guardar tu respuesta. Revisa tu conexión e inténtalo de nuevo.");
    }
  }

  // Keyboard shortcuts: Space/Enter flips, 1-4 rate (only when flipped).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (finished || !current) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (flipped && KEY_TO_RATING[e.key]) {
        e.preventDefault();
        rate(KEY_TO_RATING[e.key]);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flipped, finished, current]);

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
            className="mt-6 inline-flex items-center gap-2 rounded-cozy bg-sage px-5 py-2.5 font-medium text-cream shadow-soft transition-all duration-200 ease-cozy hover:-translate-y-0.5 hover:shadow-lift"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver al mazo
          </Link>
        </motion.div>
      </Wrapper>
    );
  }

  return (
    <Wrapper deckId={deckId} deckName={deckName}>
      <div
        className="mb-6 h-2 w-full overflow-hidden rounded-full bg-clay/50"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={cards.length}
        aria-valuenow={index}
        aria-label="Progreso de la sesión de estudio"
      >
        <motion.div
          className="h-full bg-sage"
          animate={{ width: `${(index / cards.length) * 100}%` }}
          transition={{ ease: "easeOut" }}
        />
      </div>
      <p className="mb-4 text-center text-sm text-cocoa/70">
        {index + 1} / {cards.length}
      </p>

      {saveError && (
        <div
          role="alert"
          aria-live="assertive"
          className="mb-4 rounded-2xl bg-terracotta/10 px-4 py-2.5 text-center text-sm text-terracotta ring-1 ring-terracotta/30"
        >
          {saveError}
        </div>
      )}

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
            source={current.source}
            flipped={flipped}
            onClick={() => setFlipped((f) => !f)}
          />
        </motion.div>
      </AnimatePresence>

      <div className="mt-8">
        {flipped ? (
          <ReviewButtons onRate={rate} />
        ) : (
          <motion.button
            onClick={() => setFlipped(true)}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.98 }}
            transition={{ duration: 0.18, ease: EASE_COZY }}
            className="flex w-full items-center justify-center gap-2 rounded-cozy bg-terracotta px-4 py-3 font-medium text-cream shadow-soft transition-shadow hover:shadow-lift"
          >
            <Eye className="h-4 w-4" />
            Mostrar respuesta
            <span className="ml-1 text-xs text-cream/60">espacio</span>
          </motion.button>
        )}
      </div>
    </Wrapper>
  );
}

function Wrapper({ deckId, deckName, children }: { deckId: string; deckName: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <Link
        href={`/deck/${deckId}`}
        className="inline-flex items-center gap-1.5 text-sm text-cocoa/60 transition-colors hover:text-cocoa"
      >
        <ArrowLeft className="h-4 w-4" />
        {deckName}
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
