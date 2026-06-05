import { cardSetSchema } from "../../lib/agent/schema";
import type {
  DeterministicResult,
  GeneratedCard,
  GeneratedCardSet,
} from "./types";

/** Minúsculas, sin puntuación, espacios colapsados. */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Similitud Jaccard sobre tokens del texto normalizado (0..1). */
export function similarity(a: string, b: string): number {
  const ta = new Set(normalizeText(a).split(" ").filter(Boolean));
  const tb = new Set(normalizeText(b).split(" ").filter(Boolean));
  if (ta.size === 0 && tb.size === 0) return 1;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function countMetrics(
  requested: number,
  generated: number
): DeterministicResult["count"] {
  const delta = generated - requested;
  const ratio = requested === 0 ? 0 : generated / requested;
  return {
    requested,
    generated,
    delta,
    ratio,
    match: delta === 0 ? 1 : 0,
  };
}

export function detectDuplication(
  cards: GeneratedCard[],
  threshold: number
): DeterministicResult["duplication"] {
  const nearDuplicatePairs: Array<[number, number]> = [];
  const sameQuestionDifferentAnswer: Array<[number, number]> = [];
  const differentQuestionSameAnswer: Array<[number, number]> = [];
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      const qSim = similarity(cards[i].front, cards[j].front);
      const aSim = similarity(cards[i].back, cards[j].back);
      const bothSim = similarity(
        `${cards[i].front} ${cards[i].back}`,
        `${cards[j].front} ${cards[j].back}`
      );
      if (bothSim >= threshold) nearDuplicatePairs.push([i, j]);
      if (qSim >= threshold && aSim < threshold)
        sameQuestionDifferentAnswer.push([i, j]);
      if (qSim < threshold && aSim >= threshold)
        differentQuestionSameAnswer.push([i, j]);
    }
  }
  return {
    nearDuplicatePairs,
    sameQuestionDifferentAnswer,
    differentQuestionSameAnswer,
  };
}

const CONJ = /\b(y|e|o|u|and|or|así como|además|también)\b/giu;

/** Señal auxiliar de no-atomicidad. NO es un score fuerte. */
export function atomicityHeuristic(card: GeneratedCard): {
  flag: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  const words = normalizeText(card.back).split(" ").filter(Boolean).length;
  const conjunctions = (card.back.match(CONJ) ?? []).length;
  if (words > 25) reasons.push(`respuesta larga (${words} palabras)`);
  if (conjunctions >= 3)
    reasons.push(`muchas conjunciones (${conjunctions})`);
  // Se marca si coinciden longitud + conjunciones, o si hay una densidad de
  // conjunciones muy alta (señal clara de respuesta multi-concepto), para no
  // castigar relaciones legítimas tipo "X e Y".
  const flag = reasons.length >= 2 || conjunctions >= 5;
  return { flag, reasons };
}

/** Aplica todos los checks deterministas a un deck. */
export function runDeterministic(
  deck: GeneratedCardSet | null,
  requestedCount: number,
  threshold = 0.8
): DeterministicResult {
  const parsed = deck ? cardSetSchema.safeParse(deck) : { success: false as const };
  const cards = deck?.cards ?? [];
  return {
    schemaValid: parsed.success,
    count: countMetrics(requestedCount, cards.length),
    duplication: detectDuplication(cards, threshold),
    atomicity: cards.map((c, index) => ({
      index,
      ...atomicityHeuristic(c),
    })),
  };
}
