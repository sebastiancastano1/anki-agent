import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT, userPrompt } from "./prompts";
import { cardSetJsonSchema, cardSetSchema, type GeneratedCardSet } from "./schema";

const MODEL = "claude-opus-4-8";
const MAX_TURNS = 12;

export type ProgressEvent =
  | { type: "status"; message: string }
  | { type: "search"; query: string }
  | { type: "thinking"; message: string }
  | { type: "done"; cards: GeneratedCardSet }
  | { type: "error"; message: string };

/**
 * Run the deep-research agent. Yields progress events and finally a "done"
 * event carrying the validated card set (or an "error" event).
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
      name: "emit_cards",
      description: "Emit the final, verified set of flashcards. Call exactly once.",
      input_schema: cardSetJsonSchema,
    },
  ];

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userPrompt(topic, count) },
  ];

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
          if (q) yield { type: "search", query: q };
        } else if (block.type === "tool_use" && block.name === "emit_cards") {
          const parsed = cardSetSchema.safeParse(block.input);
          if (parsed.success) {
            yield { type: "status", message: "Tarjetas generadas y verificadas." };
            yield { type: "done", cards: parsed.data };
            return;
          }
          // Ask the model to fix the structure and continue the loop.
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            is_error: true,
            content: `Invalid card data: ${parsed.error.message}. Please call emit_cards again with valid data.`,
          });
        }
      }

      if (response.stop_reason === "end_turn" && toolResults.length === 0) {
        yield {
          type: "error",
          message: "El agente terminó sin generar tarjetas. Intenta otro tema.",
        };
        return;
      }

      if (toolResults.length > 0) {
        messages.push({ role: "user", content: toolResults });
      }
      // web_search is a server tool: results are appended automatically, so we
      // just continue the loop to let the model keep reasoning.
    }

    yield { type: "error", message: "Se alcanzó el límite de iteraciones sin tarjetas." };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    yield { type: "error", message: `Error del agente: ${message}` };
  }
}
