import { z } from "zod";

export const cardSchema = z.object({
  front: z.string().min(1).describe("The question on the front of the card"),
  back: z.string().min(1).describe("The concise, accurate answer"),
  source: z
    .string()
    .optional()
    .describe("URL or short citation supporting the answer"),
});

export const cardSetSchema = z.object({
  deckName: z.string().min(1).describe("A short, friendly name for the deck"),
  cards: z.array(cardSchema).min(1),
});

export type GeneratedCard = z.infer<typeof cardSchema>;
export type GeneratedCardSet = z.infer<typeof cardSetSchema>;

// JSON Schema for the Anthropic tool input (kept in sync with cardSetSchema).
export const cardSetJsonSchema = {
  type: "object" as const,
  properties: {
    deckName: { type: "string", description: "A short, friendly name for the deck" },
    cards: {
      type: "array",
      items: {
        type: "object",
        properties: {
          front: { type: "string", description: "The question on the front of the card" },
          back: { type: "string", description: "The concise, accurate answer" },
          source: { type: "string", description: "URL or short citation supporting the answer" },
        },
        required: ["front", "back"],
      },
      minItems: 1,
    },
  },
  required: ["deckName", "cards"],
};
