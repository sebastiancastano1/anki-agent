import { describe, it, expect } from "vitest";
import { cardSetSchema } from "./schema";

describe("cardSetSchema", () => {
  it("accepts a valid card set", () => {
    const r = cardSetSchema.safeParse({
      deckName: "Photosynthesis",
      cards: [{ front: "What is chlorophyll?", back: "A green pigment.", source: "https://x" }],
    });
    expect(r.success).toBe(true);
  });

  it("rejects an empty card list", () => {
    const r = cardSetSchema.safeParse({ deckName: "X", cards: [] });
    expect(r.success).toBe(false);
  });

  it("rejects cards missing a back", () => {
    const r = cardSetSchema.safeParse({
      deckName: "X",
      cards: [{ front: "Q" }],
    });
    expect(r.success).toBe(false);
  });
});
