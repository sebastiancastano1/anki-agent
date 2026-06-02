"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ResearchProgress, type ProgressItem } from "@/components/ResearchProgress";

interface PreviewCard {
  front: string;
  back: string;
  source?: string;
}

export default function ResearchPage() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [running, setRunning] = useState(false);
  const [items, setItems] = useState<ProgressItem[]>([]);
  const [preview, setPreview] = useState<{ deckName: string; cards: PreviewCard[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const counter = useRef(0);

  const push = (type: string, text: string) =>
    setItems((prev) => [...prev, { id: counter.current++, type, text }]);

  async function start() {
    if (!topic.trim() || running) return;
    setRunning(true);
    setItems([]);
    setPreview(null);

    const res = await fetch("/api/research", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ topic }),
    });

    if (!res.body) {
      push("error", "No se pudo iniciar el stream.");
      setRunning(false);
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
        let ev: any;
        try {
          ev = JSON.parse(line);
        } catch {
          continue;
        }
        if (ev.type === "search") push("search", `Buscando: ${ev.query}`);
        else if (ev.type === "status") push("status", ev.message);
        else if (ev.type === "thinking") push("thinking", ev.message);
        else if (ev.type === "error") push("error", ev.message);
        else if (ev.type === "done") setPreview(ev.cards);
      }
    }
    setRunning(false);
  }

  async function save() {
    if (!preview) return;
    setSaving(true);
    const res = await fetch("/api/decks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...preview, topic }),
    });
    if (res.ok) {
      const deck = await res.json();
      router.push(`/deck/${deck.id}`);
    } else {
      push("error", "No se pudo guardar el mazo.");
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <Link href="/" className="text-sm text-cocoa/60 hover:text-cocoa">
        ← Volver
      </Link>
      <h1 className="mb-2 mt-4 text-3xl font-bold text-espresso">Investigar un tema</h1>
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
          className="flex-1 rounded-cozy bg-white/80 px-5 py-3 text-espresso shadow-soft outline-none ring-1 ring-clay focus:ring-terracotta disabled:opacity-60"
        />
        <button
          onClick={start}
          disabled={running || !topic.trim()}
          className="rounded-cozy bg-terracotta px-6 py-3 font-medium text-cream shadow-soft transition-transform hover:-translate-y-0.5 disabled:opacity-50"
        >
          {running ? "Investigando…" : "Investigar"}
        </button>
      </div>

      {running && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-6 flex items-center gap-2 text-sm text-sage"
        >
          <motion.span
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
          >
            ✦
          </motion.span>
          El agente está trabajando…
        </motion.div>
      )}

      {items.length > 0 && (
        <div className="mt-6">
          <ResearchProgress items={items} />
        </div>
      )}

      <AnimatePresence>
        {preview && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-10"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-espresso">
                {preview.deckName}{" "}
                <span className="text-sm font-normal text-cocoa/60">
                  ({preview.cards.length} tarjetas)
                </span>
              </h2>
              <button
                onClick={save}
                disabled={saving}
                className="rounded-cozy bg-sage px-5 py-2.5 font-medium text-cream shadow-soft hover:-translate-y-0.5 disabled:opacity-50"
              >
                {saving ? "Guardando…" : "Guardar mazo"}
              </button>
            </div>
            <div className="space-y-3">
              {preview.cards.map((c, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="rounded-cozy bg-white/80 p-5 shadow-soft ring-1 ring-clay"
                >
                  <p className="font-medium text-espresso">{c.front}</p>
                  <p className="mt-2 text-cocoa/80">{c.back}</p>
                  {c.source && (
                    <p className="mt-2 truncate text-xs text-cocoa/50">{c.source}</p>
                  )}
                </motion.div>
              ))}
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </main>
  );
}
