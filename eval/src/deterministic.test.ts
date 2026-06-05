import { describe, it, expect } from "vitest";
import {
  normalizeText,
  similarity,
  countMetrics,
  detectDuplication,
  atomicityHeuristic,
} from "./deterministic";
import type { GeneratedCard } from "./types";

const card = (front: string, back: string): GeneratedCard => ({
  front,
  back,
  source: "https://example.com",
});

describe("normalizeText", () => {
  it("lowercases, strips punctuation and collapses whitespace", () => {
    expect(normalizeText("  Hola, MUNDO!!  ")).toBe("hola mundo");
  });
});

describe("similarity", () => {
  it("is 1 for identical normalized strings", () => {
    expect(similarity("a b c", "a b c")).toBe(1);
  });
  it("is 0 for fully disjoint strings", () => {
    expect(similarity("a b", "c d")).toBe(0);
  });
});

describe("countMetrics", () => {
  it("reports delta, ratio and match for a deficit", () => {
    expect(countMetrics(10, 9)).toEqual({
      requested: 10,
      generated: 9,
      delta: -1,
      ratio: 0.9,
      match: 0,
    });
  });
  it("match is 1 only when generated equals requested", () => {
    expect(countMetrics(10, 10).match).toBe(1);
    expect(countMetrics(10, 25).match).toBe(0);
  });
});

describe("detectDuplication", () => {
  it("flags near-duplicate front+back pairs", () => {
    const cards = [
      card("What is a closure?", "A function with captured scope."),
      card("What is a closure?", "A function with captured scope."),
    ];
    const r = detectDuplication(cards, 0.8);
    expect(r.nearDuplicatePairs).toContainEqual([0, 1]);
  });
  it("flags same question with different answer", () => {
    const cards = [
      card("Define X", "answer one alpha beta"),
      card("Define X", "totally different gamma delta"),
    ];
    const r = detectDuplication(cards, 0.8);
    expect(r.sameQuestionDifferentAnswer).toContainEqual([0, 1]);
  });
  it("flags different question with same answer", () => {
    const cards = [
      card("Question alpha beta", "Paris is the capital"),
      card("Totally other gamma delta", "Paris is the capital"),
    ];
    const r = detectDuplication(cards, 0.8);
    expect(r.differentQuestionSameAnswer).toContainEqual([0, 1]);
  });
});

describe("atomicityHeuristic", () => {
  it("flags long answers with multiple conjunctions", () => {
    const long = "uno y dos y tres y cuatro y cinco y seis y siete y ocho mas nueve";
    const r = atomicityHeuristic(card("Q?", long));
    expect(r.flag).toBe(true);
    expect(r.reasons.length).toBeGreaterThan(0);
  });
  it("does not flag a short single-concept answer", () => {
    const r = atomicityHeuristic(card("Capital de Francia?", "París"));
    expect(r.flag).toBe(false);
  });
});
