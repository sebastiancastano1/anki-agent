import Link from "next/link";
import { Plus } from "lucide-react";
import { listDecksWithDue } from "@/lib/decks";
import { DeckList, type DeckSummary } from "@/components/DeckList";

export const dynamic = "force-dynamic";

export default async function Home() {
  const summaries: DeckSummary[] = (await listDecksWithDue()).map((d) => ({
    id: d.id,
    name: d.name,
    topic: d.topic,
    cardCount: d.cardCount,
    dueCount: d.dueCount,
  }));

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <header className="mb-10 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tightest text-espresso">Cozy Anki</h1>
          <p className="mt-2 text-cocoa/70">
            Investiga cualquier tema y deja que el agente arme tus tarjetas.
          </p>
        </div>
        <Link
          href="/research"
          className="inline-flex shrink-0 items-center gap-2 rounded-cozy bg-terracotta px-5 py-3 font-medium text-cream shadow-soft transition-all duration-200 ease-cozy hover:-translate-y-0.5 hover:shadow-lift"
        >
          <Plus className="h-4 w-4" />
          Investigar tema
        </Link>
      </header>

      <DeckList decks={summaries} />
    </main>
  );
}
