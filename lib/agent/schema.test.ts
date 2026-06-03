import { describe, it, expect } from "vitest";
import { cardSetSchema, studyDocSchema } from "./schema";

describe("cardSetSchema", () => {
  it("accepts a valid card set", () => {
    const r = cardSetSchema.safeParse({
      deckName: "Photosynthesis",
      cards: [
        {
          front: "What is chlorophyll?",
          back: "A green pigment.",
          source: "https://en.wikipedia.org/wiki/Chlorophyll",
        },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("rejects a card whose source is not a URL", () => {
    const r = cardSetSchema.safeParse({
      deckName: "X",
      cards: [{ front: "Q", back: "A", source: "see Wikipedia" }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects a card missing a source", () => {
    const r = cardSetSchema.safeParse({
      deckName: "X",
      cards: [{ front: "Q", back: "A" }],
    });
    expect(r.success).toBe(false);
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

describe("studyDocSchema", () => {
  it("accepts non-empty markdown", () => {
    expect(studyDocSchema.safeParse({ markdown: "# Tema\n\nResumen." }).success).toBe(true);
  });

  it("rejects empty markdown", () => {
    expect(studyDocSchema.safeParse({ markdown: "" }).success).toBe(false);
  });
});
