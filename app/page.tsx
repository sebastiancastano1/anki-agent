import Link from "next/link";
import { prisma } from "@/lib/db";
import { DeckList, type DeckSummary } from "@/components/DeckList";

export const dynamic = "force-dynamic";

export default async function Home() {
  const now = new Date();
  const decks = await prisma.deck.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { cards: true } } },
  });

  const summaries: DeckSummary[] = await Promise.all(
    decks.map(async (d) => ({
      id: d.id,
      name: d.name,
      topic: d.topic,
      cardCount: d._count.cards,
      dueCount: await prisma.card.count({
        where: { deckId: d.id, dueDate: { lte: now } },
      }),
    }))
  );

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <header className="mb-10 flex items-end justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-espresso">Cozy Anki</h1>
          <p className="mt-2 text-cocoa/70">
            Investiga cualquier tema y deja que el agente arme tus tarjetas.
          </p>
        </div>
        <Link
          href="/research"
          className="rounded-cozy bg-terracotta px-5 py-3 font-medium text-cream shadow-soft transition-transform hover:-translate-y-0.5 hover:shadow-lift"
        >
          + Investigar tema
        </Link>
      </header>

      <DeckList decks={summaries} />
    </main>
  );
}
