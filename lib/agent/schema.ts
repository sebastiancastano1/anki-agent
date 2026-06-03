import { z } from "zod";

export const cardSchema = z.object({
  front: z.string().min(1).describe("The question on the front of the card"),
  back: z.string().min(1).describe("The concise, accurate answer"),
  source: z
    .string()
    .url()
    .describe("The exact source URL (from web_search) supporting the answer"),
});

export const cardSetSchema = z.object({
  deckName: z.string().min(1).describe("A short, friendly name for the deck"),
  cards: z.array(cardSchema).min(1),
});

export type GeneratedCard = z.infer<typeof cardSchema>;
export type GeneratedCardSet = z.infer<typeof cardSetSchema>;

// Incremental protocol: the agent calls `add_cards` repeatedly with small
// verified batches, then `finish_deck` once with the deck name.
export const addCardsSchema = z.object({
  cards: z.array(cardSchema).min(1).describe("A small batch of verified cards"),
});
export const finishDeckSchema = z.object({
  deckName: z.string().min(1).describe("A short, friendly name for the deck"),
});
export const studyDocSchema = z.object({
  markdown: z
    .string()
    .min(1)
    .describe("A concise study guide in Markdown about the topic"),
});

export type AddCardsInput = z.infer<typeof addCardsSchema>;

const cardJsonSchema = {
  type: "object" as const,
  properties: {
    front: { type: "string", description: "The question on the front of the card" },
    back: { type: "string", description: "The concise, accurate answer" },
    source: {
      type: "string",
      format: "uri",
      description: "The exact source URL (from web_search) supporting the answer",
    },
  },
  required: ["front", "back", "source"],
};

// JSON Schemas for the Anthropic tool inputs (kept in sync with the Zod schemas).
export const addCardsJsonSchema = {
  type: "object" as const,
  properties: {
    cards: {
      type: "array",
      description: "1-3 freshly verified cards to add to the deck now",
      items: cardJsonSchema,
      minItems: 1,
    },
  },
  required: ["cards"],
};

export const finishDeckJsonSchema = {
  type: "object" as const,
  properties: {
    deckName: { type: "string", description: "A short, friendly name for the deck" },
  },
  required: ["deckName"],
};

export const studyDocJsonSchema = {
  type: "object" as const,
  properties: {
    markdown: {
      type: "string",
      description: "A concise study guide in Markdown about the topic",
    },
  },
  required: ["markdown"],
};
