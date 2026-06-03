import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { StudySession } from "@/components/StudySession";

export const dynamic = "force-dynamic";

export default async function StudyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deck = await prisma.deck.findUnique({ where: { id } });
  if (!deck) notFound();

  const due = await prisma.card.findMany({
    where: { deckId: id, dueDate: { lte: new Date() } },
    orderBy: { dueDate: "asc" },
  });

  return (
    <StudySession
      deckId={deck.id}
      deckName={deck.name}
      cards={due.map((c) => ({ id: c.id, front: c.front, back: c.back, source: c.source }))}
    />
  );
}
