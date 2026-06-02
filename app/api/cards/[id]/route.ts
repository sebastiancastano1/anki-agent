import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

// Update a card's front/back/source.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const data: Record<string, string | null> = {};
  if (typeof body.front === "string") data.front = body.front;
  if (typeof body.back === "string") data.back = body.back;
  if ("source" in body) data.source = body.source ? String(body.source) : null;

  const card = await prisma.card.update({ where: { id }, data }).catch(() => null);
  if (!card) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(card);
}

// Delete a card.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.card.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
