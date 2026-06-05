import { runResearchAgent } from "../../lib/agent/researchAgent";
import type { AgentRunResult, GeneratedCardSet } from "./types";

/**
 * Ejecuta el agente real sobre un ítem y captura el deck + métricas de proceso.
 * Nunca lanza: un fallo del agente se devuelve en `error`.
 */
export async function runAgent(
  topic: string,
  count: number,
  model: string
): Promise<AgentRunResult> {
  const events: unknown[] = [];
  const cards: GeneratedCardSet["cards"] = [];
  let deckName = "";
  let studyDoc: string | null = null;
  let searches = 0;
  let error: string | null = null;
  // El agente itera turnos internamente; contamos 'phase'/'search' como proxy.
  // 'turns' se aproxima por nº de eventos de fase de generación.
  let turns = 0;

  try {
    for await (const ev of runResearchAgent(topic, count, model)) {
      events.push(ev);
      const e = ev as { type: string; [k: string]: unknown };
      if (e.type === "search") searches++;
      if (e.type === "phase") turns++;
      if (e.type === "card") cards.push(e.card as GeneratedCardSet["cards"][number]);
      if (e.type === "study_doc") studyDoc = e.markdown as string;
      if (e.type === "done") {
        const done = e.cards as GeneratedCardSet & { studyDoc: string | null };
        deckName = done.deckName;
        studyDoc = done.studyDoc ?? studyDoc;
      }
      if (e.type === "error") error = e.message as string;
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const deck: GeneratedCardSet | null =
    cards.length > 0 ? { deckName: deckName || topic, cards } : null;

  return {
    deck,
    studyDoc,
    process: {
      turns,
      searches,
      schemaRetries: 0, // el agente reintenta internamente; no expuesto aún
      endedInError: error !== null,
    },
    error,
    events,
  };
}
