import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Play, Layers } from "lucide-react";
import { prisma } from "@/lib/db";
import { StudyGuide } from "@/components/StudyGuide";

export const dynamic = "force-dynamic";

export default async function GuidePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deck = await prisma.deck.findUnique({ where: { id } });
  if (!deck) notFound();
  // No guide for this deck → send the user straight to the deck.
  if (!deck.studyDoc) redirect(`/deck/${id}`);

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <Link
        href={`/deck/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-cocoa/60 transition-colors hover:text-cocoa"
      >
        <ArrowLeft className="h-4 w-4" />
        {deck.name}
      </Link>

      <div className="mb-6 mt-5">
        <span className="text-xs uppercase tracking-widest text-terracotta">Guía de estudio</span>
        <h1 className="mt-1 text-3xl font-bold tracking-tightest text-espresso">{deck.name}</h1>
        <p className="mt-1 text-cocoa/60">
          Léela primero para tener el panorama; luego repasa el mazo.
        </p>
      </div>

      <StudyGuide markdown={deck.studyDoc} />

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href={`/study/${id}`}
          className="inline-flex items-center gap-2 rounded-cozy bg-sage px-5 py-2.5 font-medium text-cream shadow-soft transition-all duration-200 ease-cozy hover:-translate-y-0.5 hover:shadow-lift"
        >
          <Play className="h-4 w-4" />
          Repasar el mazo
        </Link>
        <Link
          href={`/deck/${id}`}
          className="inline-flex items-center gap-2 rounded-cozy bg-white/70 px-5 py-2.5 font-medium text-cocoa shadow-hairline transition-colors duration-200 ease-cozy hover:bg-white"
        >
          <Layers className="h-4 w-4" />
          Ver el mazo
        </Link>
      </div>
    </main>
  );
}
