import { describe, it, expect } from "vitest";
import { parseCardJudgement, extractJson } from "./judge";

const validCard = {
  factual_accuracy: { score: 5, reason: "ok", confidence: "high" },
  clarity: { score: 4, reason: "ok", confidence: "high" },
  atomicity: { score: 4, reason: "ok", confidence: "medium" },
  relevance: { score: 5, reason: "ok", confidence: "high" },
  answerability: { score: 5, reason: "ok", confidence: "high" },
  retrieval_value: { score: 4, reason: "ok", confidence: "medium" },
  front_back_fit: { score: 5, reason: "ok", confidence: "high" },
  minimal_answer: { score: 5, reason: "ok", confidence: "high" },
};

describe("extractJson", () => {
  it("extracts a JSON object wrapped in prose/code fences", () => {
    const raw = "Aquí está:\n```json\n{\"a\":1}\n```\nfin";
    expect(extractJson(raw)).toEqual({ a: 1 });
  });
  it("throws on text without any JSON object", () => {
    expect(() => extractJson("no json here")).toThrow();
  });
});

describe("parseCardJudgement", () => {
  it("parses a valid card judgement", () => {
    const r = parseCardJudgement(JSON.stringify(validCard));
    expect(r.factual_accuracy.score).toBe(5);
  });
  it("throws when a criterion is missing", () => {
    const { clarity, ...rest } = validCard;
    expect(() => parseCardJudgement(JSON.stringify(rest))).toThrow();
  });
  it("throws when a score is out of range", () => {
    const bad = { ...validCard, clarity: { score: 9, reason: "x", confidence: "high" } };
    expect(() => parseCardJudgement(JSON.stringify(bad))).toThrow();
  });
});
