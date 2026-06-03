import { prisma } from "@/lib/db";

export interface DeckWithCounts {
  id: string;
  name: string;
  topic: string;
  studyDoc: string | null;
  createdAt: Date;
  cardCount: number;
  dueCount: number;
}

/**
 * List all decks with their total and due-now card counts.
 *
 * Uses two constant-cost queries (a findMany + a single grouped count) instead
 * of the old N+1 pattern that issued one `card.count` per deck. The due count
 * is resolved by `groupBy` over `dueDate <= now`, then joined in memory.
 */
export async function listDecksWithDue(): Promise<DeckWithCounts[]> {
  const now = new Date();

  const [decks, dueGroups] = await Promise.all([
    prisma.deck.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { cards: true } } },
    }),
    prisma.card.groupBy({
      by: ["deckId"],
      where: { dueDate: { lte: now } },
      _count: { _all: true },
    }),
  ]);

  const dueByDeck = new Map(dueGroups.map((g) => [g.deckId, g._count._all]));

  return decks.map((d) => ({
    id: d.id,
    name: d.name,
    topic: d.topic,
    studyDoc: d.studyDoc,
    createdAt: d.createdAt,
    cardCount: d._count.cards,
    dueCount: dueByDeck.get(d.id) ?? 0,
  }));
}
