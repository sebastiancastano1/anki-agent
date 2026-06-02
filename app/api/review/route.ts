import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { scheduleNext, RATING_QUALITY, type Rating } from "@/lib/srs";

export const runtime = "nodejs";

// Record a review: compute next SM-2 state, persist, and log.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const cardId: string | undefined = body?.cardId;
  const rating: Rating | undefined = body?.rating;

  if (!cardId || !rating || !(rating in RATING_QUALITY)) {
    return NextResponse.json({ error: "cardId and valid rating required" }, { status: 400 });
  }

  const card = await prisma.card.findUnique({ where: { id: cardId } });
  if (!card) return NextResponse.json({ error: "not found" }, { status: 404 });

  const next = scheduleNext(
    { ease: card.ease, interval: card.interval, repetitions: card.repetitions },
    rating
  );

  const [updated] = await prisma.$transaction([
    prisma.card.update({
      where: { id: cardId },
      data: {
        ease: next.ease,
        interval: next.interval,
        repetitions: next.repetitions,
        dueDate: next.dueDate,
      },
    }),
    prisma.reviewLog.create({ data: { cardId, rating: RATING_QUALITY[rating] } }),
  ]);

  return NextResponse.json(updated);
}
