import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

// List all decks with card counts.
export async function GET() {
  const decks = await prisma.deck.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { cards: true } } },
  });
  const now = new Date();
  const withDue = await Promise.all(
    decks.map(async (d) => ({
      ...d,
      dueCount: await prisma.card.count({
        where: { deckId: d.id, dueDate: { lte: now } },
      }),
    }))
  );
  return NextResponse.json(withDue);
}

// Create a deck from a generated card set.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.deckName || !Array.isArray(body?.cards) || body.cards.length === 0) {
    return NextResponse.json({ error: "deckName and cards are required" }, { status: 400 });
  }

  const deck = await prisma.deck.create({
    data: {
      name: String(body.deckName),
      topic: String(body.topic ?? body.deckName),
      cards: {
        create: body.cards.map((c: { front: string; back: string; source?: string }) => ({
          front: String(c.front),
          back: String(c.back),
          source: c.source ? String(c.source) : null,
        })),
      },
    },
    include: { _count: { select: { cards: true } } },
  });

  return NextResponse.json(deck, { status: 201 });
}
