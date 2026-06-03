"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Sparkles } from "lucide-react";
import { ResearchProgress, type Phase } from "@/components/ResearchProgress";
import { SourceGroups, type SourceInput } from "@/components/SourceGroups";
import { DeckPile, type DeckCard } from "@/components/DeckPile";
import { Button } from "@/components/ui/Button";
import { useStaggeredReveal } from "@/lib/useStaggeredReveal";
import { EASE_COZY } from "@/lib/motion";
import type { ProgressEvent } from "@/lib/agent/researchAgent";

export default function ResearchPage() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<Phase | null>(null);
  const [activeQuery, setActiveQuery] = useState<string | null>(null);
  const [reasoning, setReasoning] = useState<string | null>(null);
  const [sources, setSources] = useState<SourceInput[]>([]);
  const [cards, setCards] = useState<DeckCard[]>([]);
  const [deckName, setDeckName] = useState<string | null>(null);
  const [studyDoc, setStudyDoc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const seen = useRef<Set<string>>(new Set());

  // Reveal cards one at a time even when they arrive in batches.
  const { visible, revealing } = useStaggeredReveal(cards, 350);

  const finished = deckName !== null;
  const started = running || finished || cards.length > 0 || phase !== null || !!error;
  const building = running || revealing;

  function reset() {
    setPhase(null);
    setActiveQuery(null);
    setReasoning(null);
    setSources([]);
    setCards([]);
    setDeckName(null);
    setStudyDoc(null);
    setError(null);
    seen.current = new Set();
  }

  async function start() {
    if (!topic.trim() || running) return;
    setRunning(true);
    reset();

    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topic }),
      });

      if (!res.ok || !res.body) {
        setError("No se pudo iniciar la investigación. Inténtalo de nuevo.");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.replace(/^data: /, "").trim();
          if (!line) continue;
          let ev: ProgressEvent;
          try {
            ev = JSON.parse(line) as ProgressEvent;
          } catch {
            continue;
          }
          if (ev.type === "phase") setPhase(ev.phase);
          else if (ev.type === "search") setActiveQuery(ev.query);
          else if (ev.type === "source") {
            if (!seen.current.has(ev.url)) {
              seen.current.add(ev.url);
              setSources((prev) => [...prev, { url: ev.url, title: ev.title }]);
            }
          } else if (ev.type === "card") {
            setCards((prev) => [...prev, ev.card]);
          } else if (ev.type === "study_doc") {
            setStudyDoc(ev.markdown);
          } else if (ev.type === "thinking" || ev.type === "status") {
            setReasoning(ev.message);
          } else if (ev.type === "error") setError(ev.message);
          else if (ev.type === "done") {
            setCards(ev.cards.cards);
            setDeckName(ev.cards.deckName);
            if (ev.cards.studyDoc) setStudyDoc(ev.cards.studyDoc);
          }
        }
      }
    } catch {
      setError("Se interrumpió la conexión durante la investigación. Revisa tu red e inténtalo de nuevo.");
    } finally {
      setRunning(false);
    }
  }

  async function save() {
    if (!deckName) return;
    setSaving(true);
    try {
      const res = await fetch("/api/decks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deckName, cards, sources, studyDoc, topic }),
      });
      if (res.ok) {
        const deck = await res.json();
        // Suggest studying first: land on the guide, which links to review.
        router.push(studyDoc ? `/deck/${deck.id}/guide` : `/deck/${deck.id}`);
        return;
      }
      setError("No se pudo guardar el mazo.");
    } catch {
      setError("No se pudo guardar el mazo. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-cocoa/60 transition-colors hover:text-cocoa"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver
      </Link>
      <h1 className="mb-2 mt-5 text-3xl font-bold tracking-tightest text-espresso">
        Investigar un tema
      </h1>
      <p className="mb-8 text-cocoa/70">
        El agente investiga, verifica fuentes y arma las preguntas más relevantes.
      </p>

      <div className="flex gap-3">
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && start()}
          disabled={running}
          placeholder="p. ej. La fotosíntesis, La Revolución Francesa…"
          className="flex-1 rounded-cozy bg-white/80 px-5 py-3 text-espresso shadow-soft ring-1 ring-clay transition-shadow placeholder:text-cocoa/40 focus:ring-terracotta disabled:opacity-60"
        />
        <Button onClick={start} loading={running} disabled={!topic.trim()}>
          {!running && <Sparkles className="h-4 w-4" />}
          {running ? "Investigando…" : "Investigar"}
        </Button>
      </div>

      <AnimatePresence>
        {started && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, ease: EASE_COZY }}
            className="mt-8 grid gap-6 lg:grid-cols-[340px_1fr]"
          >
            {/* Left: the work bench — progress + collapsible grouped sources. */}
            <div className="space-y-4 lg:sticky lg:top-8 lg:self-start">
              <ResearchProgress
                phase={phase}
                finished={finished}
                activeQuery={activeQuery}
                reasoning={reasoning}
                error={error}
              />
              <SourceGroups sources={sources} />
            </div>

            {/* Right: the deck pile that grows in real time. */}
            <div>
              <DeckPile cards={visible} building={building} />

              <AnimatePresence>
                {finished && !revealing && (
                  <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: EASE_COZY }}
                    className="mt-6 rounded-cozy bg-sage/10 p-5 ring-1 ring-sage/30"
                  >
                    <p className="font-semibold text-espresso">{deckName}</p>
                    <p className="text-sm text-cocoa/60">
                      {cards.length} tarjetas listas.{" "}
                      {studyDoc
                        ? "Te sugerimos leer la guía de estudio y luego repasar el mazo."
                        : "Guárdalo para empezar a repasar."}
                    </p>
                    <Button
                      variant="secondary"
                      onClick={save}
                      loading={saving}
                      className="mt-4 w-full"
                    >
                      {studyDoc ? "Guardar y leer la guía" : "Guardar mazo"}
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
