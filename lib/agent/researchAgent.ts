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
 * Mutable state shared across the agent loop: every validated card and the
 * (optional) study guide accumulated so far.
 */
type DeckState = {
  cards: GeneratedCard[];
  studyDoc: string | null;
};

/**
 * Outcome of processing a single content block from the model. A block may emit
 * progress events, queue a `tool_result` for the next turn, and/or finish the
 * deck. All three are optional and independent.
 */
type BlockOutcome = {
  events?: ProgressEvent[];
  toolResult?: Anthropic.ToolResultBlockParam;
  done?: DoneDeck;
};

const ok = (tool_use_id: string, content: string): Anthropic.ToolResultBlockParam => ({
  type: "tool_result",
  tool_use_id,
  content,
});

const fail = (tool_use_id: string, content: string): Anthropic.ToolResultBlockParam => ({
  type: "tool_result",
  tool_use_id,
  is_error: true,
  content,
});

// --- Per-block handlers --------------------------------------------------
// Each handler owns exactly one block type / tool, so the main loop stays a
// flat dispatch instead of a deeply nested if/else chain.

function handleText(block: Anthropic.TextBlock): BlockOutcome {
  const message = block.text.trim();
  return message ? { events: [{ type: "thinking", message }] } : {};
}

function handleWebSearchUse(block: Anthropic.ServerToolUseBlock): BlockOutcome {
  const query = (block.input as { query?: string })?.query ?? "";
  if (!query) return {};
  return {
    events: [
      { type: "phase", phase: "searching" },
      { type: "search", query },
    ],
  };
}

function handleWebSearchResult(block: { content?: unknown }): BlockOutcome {
  if (!Array.isArray(block.content)) return {};
  const results = block.content as Array<{ type?: string; url?: string; title?: string }>;
  const events: ProgressEvent[] = [{ type: "phase", phase: "reading" }];
  for (const r of results) {
    if (r?.type === "web_search_result" && r.url) {
      events.push({ type: "source", url: r.url, title: r.title ?? r.url });
    }
  }
  return { events };
}

function handleAddCards(block: Anthropic.ToolUseBlock, state: DeckState): BlockOutcome {
  const parsed = addCardsSchema.safeParse(block.input);
  if (!parsed.success) {
    return {
      events: [{ type: "phase", phase: "generating" }],
      toolResult: fail(
        block.id,
        `Invalid card data: ${parsed.error.message}. Please call add_cards again with valid data (each card needs front, back and a source URL).`
      ),
    };
  }

  const events: ProgressEvent[] = [{ type: "phase", phase: "generating" }];
  for (const card of parsed.data.cards) {
    state.cards.push(card);
    events.push({ type: "card", card });
  }
  return {
    events,
    toolResult: ok(
      block.id,
      `Added ${parsed.data.cards.length} card(s). Total so far: ${state.cards.length}. Keep going or call finish_deck when done.`
    ),
  };
}

function handleStudyDoc(block: Anthropic.ToolUseBlock, state: DeckState): BlockOutcome {
  const parsed = studyDocSchema.safeParse(block.input);
  if (!parsed.success) {
    return {
      events: [{ type: "phase", phase: "writing" }],
      toolResult: fail(
        block.id,
        `Invalid study guide: ${parsed.error.message}. Call emit_study_doc again with non-empty Markdown.`
      ),
    };
  }

  state.studyDoc = parsed.data.markdown;
  return {
    events: [
      { type: "phase", phase: "writing" },
      { type: "study_doc", markdown: state.studyDoc },
    ],
    toolResult: ok(block.id, "Study guide saved. Now call finish_deck with a friendly name."),
  };
}

function handleFinishDeck(block: Anthropic.ToolUseBlock, state: DeckState): BlockOutcome {
  const parsed = finishDeckSchema.safeParse(block.input);
  if (!parsed.success) {
    return {
      toolResult: fail(
        block.id,
        `Invalid input: ${parsed.error.message}. Call finish_deck with a non-empty deckName.`
      ),
    };
  }
  if (state.cards.length === 0) {
    return {
      toolResult: fail(
        block.id,
        "No cards were added yet. Call add_cards with verified cards before finishing."
      ),
    };
  }
  return {
    events: [{ type: "status", message: "Mazo completo y verificado." }],
    done: { deckName: parsed.data.deckName, cards: state.cards, studyDoc: state.studyDoc },
  };
}

/** Route one content block to its handler. Unknown blocks are ignored. */
function processBlock(block: Anthropic.ContentBlock, state: DeckState): BlockOutcome {
  if (block.type === "text") return handleText(block);
  if (block.type === "server_tool_use" && block.name === "web_search")
    return handleWebSearchUse(block);
  if (block.type === "web_search_tool_result")
    return handleWebSearchResult(block as { content?: unknown });
  if (block.type === "tool_use") {
    if (block.name === "add_cards") return handleAddCards(block, state);
    if (block.name === "emit_study_doc") return handleStudyDoc(block, state);
    if (block.name === "finish_deck") return handleFinishDeck(block, state);
  }
  return {};
}

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

  // Accumulates every validated card and the study guide across the loop.
  const state: DeckState = { cards: [], studyDoc: null };

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
        const outcome = processBlock(block, state);

        for (const event of outcome.events ?? []) yield event;
        if (outcome.toolResult) toolResults.push(outcome.toolResult);
        if (outcome.done) {
          yield { type: "done", cards: outcome.done };
          return;
        }
      }

      if (response.stop_reason === "end_turn" && toolResults.length === 0) {
        // The model stopped talking. If it produced cards, salvage the deck.
        if (state.cards.length > 0) {
          yield { type: "done", cards: { deckName: topic, cards: state.cards, studyDoc: state.studyDoc } };
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
    if (state.cards.length > 0) {
      yield { type: "done", cards: { deckName: topic, cards: state.cards, studyDoc: state.studyDoc } };
    } else {
      yield { type: "error", message: "Se alcanzó el límite de iteraciones sin tarjetas." };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    yield { type: "error", message: `Error del agente: ${message}` };
  }
}
