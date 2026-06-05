import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CardJudgement, DeckJudgement } from "./types";

type Weights = {
  version: string;
  card: Record<string, number>;
  deck: { coverage: number; redundancy_penalty: number };
};

export const WEIGHTS: Weights = JSON.parse(
  readFileSync(join(process.cwd(), "eval/rubric/weights.json"), "utf8")
);

/**
 * overall_score (escala 1-5). Combina criterios ponderados de tarjeta + deck,
 * restando una penalización por redundancia. Normaliza por la suma de pesos
 * positivos para mantener la escala original.
 */
export function overallScore(card: CardJudgement, deck: DeckJudgement): number {
  const cw = WEIGHTS.card;
  let weighted = 0;
  let posWeight = 0;
  for (const [k, w] of Object.entries(cw)) {
    weighted += w * (card as Record<string, { score: number }>)[k].score;
    posWeight += w;
  }
  weighted += WEIGHTS.deck.coverage * deck.coverage.score;
  posWeight += WEIGHTS.deck.coverage;

  // redundancy: score alto = bueno; la penalización crece cuando el score baja.
  const redundancyPenalty =
    WEIGHTS.deck.redundancy_penalty * (5 - deck.redundancy.score);

  return (weighted - redundancyPenalty) / posWeight;
}

export function meanStd(xs: number[]): { mean: number; std: number } {
  if (xs.length === 0) return { mean: 0, std: 0 };
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const variance =
    xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
  return { mean, std: Math.sqrt(variance) };
}

/** Promedia un criterio de tarjeta sobre todas las tarjetas de un ítem. */
export function meanCriterion(
  cards: CardJudgement[],
  key: keyof CardJudgement
): number {
  return meanStd(cards.map((c) => c[key].score)).mean;
}
