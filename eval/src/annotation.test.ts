import { describe, it, expect, vi } from "vitest";
import { missingConfigs, HUMAN_CONFIGS } from "./annotation";

describe("missingConfigs", () => {
  it("returns configs whose name is not already present", () => {
    const existing = [{ name: "human.overall" }];
    const missing = missingConfigs(existing);
    const names = missing.map((c) => c.name);
    expect(names).not.toContain("human.overall");
    expect(names).toContain("human.factual_accuracy");
    expect(missing.length).toBe(HUMAN_CONFIGS.length - 1);
  });
  it("returns all when none exist", () => {
    expect(missingConfigs([]).length).toBe(HUMAN_CONFIGS.length);
  });
});
