import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runDeterministic } from "./deterministic";
import type { GeneratedCardSet } from "./types";

const bad = JSON.parse(
  readFileSync(join(process.cwd(), "eval/dataset/fixtures/bad-decks.json"), "utf8")
) as Record<string, GeneratedCardSet>;

describe("negative controls", () => {
  it("detecta duplicados", () => {
    const r = runDeterministic(bad.duplicates, 2);
    expect(r.duplication.nearDuplicatePairs.length).toBeGreaterThan(0);
  });
  it("marca respuesta excesivamente larga como no atómica", () => {
    const r = runDeterministic(bad.longAnswers, 1);
    expect(r.atomicity.some((a) => a.flag)).toBe(true);
  });
  it("detecta déficit de tarjetas", () => {
    const r = runDeterministic(bad.deficit, 10);
    expect(r.count.match).toBe(0);
    expect(r.count.delta).toBeLessThan(0);
  });
  it("detecta schema inválido", () => {
    const r = runDeterministic(bad.invalidSchema, 5);
    expect(r.schemaValid).toBe(false);
  });
});
