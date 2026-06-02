import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { DeckView } from "@/components/DeckView";

export const dynamic = "force-dynamic";

export default async function DeckPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deck = await prisma.deck.findUnique({
    where: { id },
    include: { cards: { orderBy: { createdAt: "asc" } } },
  });
  if (!deck) notFound();

  const dueCount = await prisma.card.count({
    where: { deckId: id, dueDate: { lte: new Date() } },
  });

  return (
    <DeckView
      deckId={deck.id}
      name={deck.name}
      topic={deck.topic}
      dueCount={dueCount}
      cards={deck.cards.map((c) => ({
        id: c.id,
        front: c.front,
        back: c.back,
        source: c.source,
      }))}
    />
  );
}
