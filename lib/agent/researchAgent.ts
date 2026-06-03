import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT, userPrompt } from "./prompts";
import {
  addCardsJsonSchema,
  addCardsSchema,
  finishDeckJsonSchema,
  finishDeckSchema,
  studyDocJsonSchema,
  studyDocSchema,
  type GeneratedCard,
  type GeneratedCardSet,
} from "./schema";

const MODEL = "claude-sonnet-4-6";
const MAX_TURNS = 20;

export type ResearchPhase = "searching" | "reading" | "generating" | "writing";

export type DoneDeck = GeneratedCardSet & { studyDoc: string | null };

export type ProgressEvent =
  | { type: "status"; message: string }
  | { type: "phase"; phase: ResearchPhase }
  | { type: "search"; query: string }
  | { type: "source"; url: string; title: string }
  | { type: "thinking"; message: string }
  | { type: "card"; card: GeneratedCard }
  | { type: "study_doc"; markdown: string }
  | { type: "done"; cards: DoneDeck }
  | { type: "error"; message: string };

/**
 * Run the deep-research agent. The agent emits verified cards incrementally via
 * the "add_cards" tool (yielded as "card" events) and finishes by naming the
 * deck via "finish_deck" (yielded as a final "done" event), or yields "error".
 */
export async function* runResearchAgent(
  topic: string,
  count?: number
): AsyncGenerator<ProgressEvent> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    yield { type: "error", message: "Falta ANTHROPIC_API_KEY en el entorno." };
    return;
  }

  const client = new Anthropic({ apiKey });

  const tools: Anthropic.Tool[] | any[] = [
    { type: "web_search_20250305", name: "web_search", max_uses: 8 },
    {
      name: "add_cards",
      description:
        "Add a small batch (1-3) of freshly verified flashcards to the deck. Call repeatedly as you verify more.",
      input_schema: addCardsJsonSchema,
    },
    {
      name: "emit_study_doc",
      description:
        "Write the study guide for the topic in Markdown. Call exactly once, after the cards and before finish_deck.",
      input_schema: studyDocJsonSchema,
    },
    {
      name: "finish_deck",
      description: "Finish the deck with a friendly name. Call exactly once when done.",
      input_schema: finishDeckJsonSchema,
    },
  ];

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userPrompt(topic, count) },
  ];

  // Accumulates every validated card across the incremental batches.
  const collected: GeneratedCard[] = [];
  let studyDoc: string | null = null;

  yield { type: "status", message: "Iniciando investigación…" };

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 8000,
        system: SYSTEM_PROMPT,
        tools: tools as Anthropic.Tool[],
        messages,
      });

      messages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type === "text" && block.text.trim()) {
          yield { type: "thinking", message: block.text.trim() };
        } else if (block.type === "server_tool_use" && block.name === "web_search") {
          const q = (block.input as { query?: string })?.query ?? "";
          if (q) {
            yield { type: "phase", phase: "searching" };
            yield { type: "search", query: q };
          }
        } else if (block.type === "web_search_tool_result") {
          // Server tool results: surface each consulted source live.
          const content = (block as { content?: unknown }).content;
          if (Array.isArray(content)) {
            yield { type: "phase", phase: "reading" };
            for (const r of content as Array<{ type?: string; url?: string; title?: string }>) {
              if (r?.type === "web_search_result" && r.url) {
                yield { type: "source", url: r.url, title: r.title ?? r.url };
              }
            }
          }
        } else if (block.type === "tool_use" && block.name === "add_cards") {
          yield { type: "phase", phase: "generating" };
          const parsed = addCardsSchema.safeParse(block.input);
          if (parsed.success) {
            for (const card of parsed.data.cards) {
              collected.push(card);
              yield { type: "card", card };
            }
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: `Added ${parsed.data.cards.length} card(s). Total so far: ${collected.length}. Keep going or call finish_deck when done.`,
            });
          } else {
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              is_error: true,
              content: `Invalid card data: ${parsed.error.message}. Please call add_cards again with valid data (each card needs front, back and a source URL).`,
            });
          }
        } else if (block.type === "tool_use" && block.name === "emit_study_doc") {
          yield { type: "phase", phase: "writing" };
          const parsed = studyDocSchema.safeParse(block.input);
          if (parsed.success) {
            studyDoc = parsed.data.markdown;
            yield { type: "study_doc", markdown: studyDoc };
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: "Study guide saved. Now call finish_deck with a friendly name.",
            });
          } else {
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              is_error: true,
              content: `Invalid study guide: ${parsed.error.message}. Call emit_study_doc again with non-empty Markdown.`,
            });
          }
        } else if (block.type === "tool_use" && block.name === "finish_deck") {
          const parsed = finishDeckSchema.safeParse(block.input);
          if (!parsed.success) {
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              is_error: true,
              content: `Invalid input: ${parsed.error.message}. Call finish_deck with a non-empty deckName.`,
            });
          } else if (collected.length === 0) {
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              is_error: true,
              content: "No cards were added yet. Call add_cards with verified cards before finishing.",
            });
          } else {
            yield { type: "status", message: "Mazo completo y verificado." };
            yield {
              type: "done",
              cards: { deckName: parsed.data.deckName, cards: collected, studyDoc },
            };
            return;
          }
        }
      }

      if (response.stop_reason === "end_turn" && toolResults.length === 0) {
        // The model stopped talking. If it produced cards, salvage the deck.
        if (collected.length > 0) {
          yield { type: "done", cards: { deckName: topic, cards: collected, studyDoc } };
        } else {
          yield {
            type: "error",
            message: "El agente terminó sin generar tarjetas. Intenta otro tema.",
          };
        }
        return;
      }

      if (toolResults.length > 0) {
        messages.push({ role: "user", content: toolResults });
      }
      // web_search is a server tool: results are appended automatically, so we
      // just continue the loop to let the model keep reasoning.
    }

    // Ran out of turns: keep whatever was verified rather than losing it.
    if (collected.length > 0) {
      yield { type: "done", cards: { deckName: topic, cards: collected, studyDoc } };
    } else {
      yield { type: "error", message: "Se alcanzó el límite de iteraciones sin tarjetas." };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    yield { type: "error", message: `Error del agente: ${message}` };
  }
}
