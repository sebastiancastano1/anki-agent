import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

// Get a deck with its cards.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deck = await prisma.deck.findUnique({
    where: { id },
    include: { cards: { orderBy: { createdAt: "asc" } } },
  });
  if (!deck) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(deck);
}

// Delete a deck (cascades to cards).
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.deck.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
