import { describe, it, expect } from "vitest";
import { overallScore, meanStd } from "./aggregate";
import type { CardJudgement, DeckJudgement } from "./types";

const c = (score: number): { score: number; reason: string; confidence: "high" } => ({
  score,
  reason: "x",
  confidence: "high",
});

const cardJ: CardJudgement = {
  factual_accuracy: c(5),
  clarity: c(5),
  atomicity: c(5),
  relevance: c(5),
  answerability: c(5),
  retrieval_value: c(5),
  front_back_fit: c(5),
  minimal_answer: c(5),
};

const deckJ: DeckJudgement = {
  coverage: c(5),
  redundancy: c(5),
};

describe("overallScore", () => {
  it("returns 5 when every weighted criterion is maxed and no redundancy penalty", () => {
    // redundancy 5 => penalty 0; pesos suman 0.95 sobre escala 5 => normalizado a 5
    expect(overallScore(cardJ, deckJ)).toBeCloseTo(5, 5);
  });
  it("drops when redundancy is poor", () => {
    const bad: DeckJudgement = { ...deckJ, redundancy: c(1) };
    expect(overallScore(cardJ, bad)).toBeLessThan(overallScore(cardJ, deckJ));
  });
});

describe("meanStd", () => {
  it("computes mean and population std", () => {
    expect(meanStd([2, 4])).toEqual({ mean: 3, std: 1 });
  });
  it("handles empty arrays", () => {
    expect(meanStd([])).toEqual({ mean: 0, std: 0 });
  });
});
