import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { classifyTier } from "@/lib/sources";
import { listDecksWithDue } from "@/lib/decks";

export const runtime = "nodejs";

// List all decks with total and due-now card counts.
export async function GET() {
  const decks = await listDecksWithDue();
  return NextResponse.json(decks);
}

// Create a deck from a generated card set.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.deckName || !Array.isArray(body?.cards) || body.cards.length === 0) {
    return NextResponse.json({ error: "deckName and cards are required" }, { status: 400 });
  }

  // Dedupe consulted sources by URL before persisting.
  const rawSources: { url?: string; title?: string }[] = Array.isArray(body.sources)
    ? body.sources
    : [];
  const seen = new Set<string>();
  const sources = rawSources
    .filter((s) => s?.url && !seen.has(s.url) && seen.add(s.url))
    .map((s) => ({
      url: String(s.url),
      title: String(s.title ?? s.url),
      tier: classifyTier(String(s.url)),
    }));

  const deck = await prisma.deck.create({
    data: {
      name: String(body.deckName),
      topic: String(body.topic ?? body.deckName),
      studyDoc: body.studyDoc ? String(body.studyDoc) : null,
      cards: {
        create: body.cards.map((c: { front: string; back: string; source?: string }) => ({
          front: String(c.front),
          back: String(c.back),
          source: c.source ? String(c.source) : null,
        })),
      },
      sources: sources.length > 0 ? { create: sources } : undefined,
    },
    include: { _count: { select: { cards: true } } },
  });

  return NextResponse.json(deck, { status: 201 });
}
