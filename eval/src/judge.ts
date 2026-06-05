import { spawn } from "node:child_process";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  CardJudgement,
  DeckJudgement,
  EvalItem,
  GeneratedCard,
  GeneratedCardSet,
} from "./types";

const criterion = z.object({
  score: z.number().int().min(1).max(5),
  reason: z.string(),
  confidence: z.enum(["low", "medium", "high"]),
});

const cardJudgementSchema = z.object({
  factual_accuracy: criterion,
  clarity: criterion,
  atomicity: criterion,
  relevance: criterion,
  answerability: criterion,
  retrieval_value: criterion,
  front_back_fit: criterion,
  minimal_answer: criterion,
});

const deckJudgementSchema = z.object({
  coverage: criterion,
  redundancy: criterion,
  difficulty_balance: criterion.optional(),
  progression: criterion.optional(),
});

/** Extrae el primer objeto JSON de un texto (tolera prosa y code fences). */
export function extractJson(raw: string): unknown {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("No JSON object found in judge output");
  }
  return JSON.parse(raw.slice(start, end + 1));
}

export function parseCardJudgement(raw: string): CardJudgement {
  return cardJudgementSchema.parse(extractJson(raw));
}

export function parseDeckJudgement(raw: string): DeckJudgement {
  return deckJudgementSchema.parse(extractJson(raw));
}

const RUBRIC_PATH = join(process.cwd(), "eval/rubric/card-quality.md");
export const RUBRIC = readFileSync(RUBRIC_PATH, "utf8");
export const RUBRIC_VERSION = "2026-06-05";

export function buildCardPrompt(card: GeneratedCard, item: EvalItem): string {
  const ref = item.referenceFacts?.length
    ? `\n\nreferenceFacts:\n- ${item.referenceFacts.join("\n- ")}`
    : "\n\n(No hay referenceFacts: evalúa factual_accuracy como plausibilidad, confidence ≤ medium.)";
  return [
    RUBRIC,
    `\n\n## Tarea\nTema: ${item.topic}${ref}`,
    `\n\nTarjeta a evaluar:\nfront: ${card.front}\nback: ${card.back}`,
    `\n\nDevuelve SOLO el JSON de la tarjeta.`,
  ].join("");
}

export function buildDeckPrompt(deck: GeneratedCardSet, item: EvalItem): string {
  const cov = item.expectedCoverage?.length
    ? `\n\nexpectedCoverage:\n- ${item.expectedCoverage.join("\n- ")}`
    : "";
  const list = deck.cards
    .map((c, i) => `${i + 1}. Q: ${c.front} | A: ${c.back}`)
    .join("\n");
  return [
    RUBRIC,
    `\n\n## Tarea (nivel deck)\nTema: ${item.topic}${cov}`,
    `\n\nDeck (${deck.cards.length} tarjetas):\n${list}`,
    `\n\nDevuelve SOLO el JSON del deck.`,
  ].join("");
}

/** Resultado crudo de invocar el CLI. */
export type CliResult = { stdout: string; stderr: string; exitCode: number };

/** Invoca `claude -p --model <model>` con el prompt por stdin. */
export function runClaudeCli(prompt: string, model: string): Promise<CliResult> {
  return new Promise((resolve) => {
    const child = spawn("claude", ["-p", "--model", model], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) =>
      resolve({ stdout, stderr, exitCode: code ?? -1 })
    );
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

/** Tipo de función inyectable, para mockear el CLI en dry-run/tests. */
export type JudgeExec = (prompt: string, model: string) => Promise<CliResult>;

/** Juzga una tarjeta con 2 reintentos si el JSON no parsea. */
export async function judgeCard(
  card: GeneratedCard,
  item: EvalItem,
  model: string,
  exec: JudgeExec = runClaudeCli
): Promise<
  | { ok: true; judgement: CardJudgement; raw: string }
  | { ok: false; raw: string; stderr: string; exitCode: number }
> {
  const prompt = buildCardPrompt(card, item);
  let last: CliResult = { stdout: "", stderr: "", exitCode: -1 };
  for (let attempt = 0; attempt < 3; attempt++) {
    last = await exec(
      attempt === 0 ? prompt : `${prompt}\n\nIMPORTANTE: responde SOLO JSON válido.`,
      model
    );
    try {
      const judgement = parseCardJudgement(last.stdout);
      return { ok: true, judgement, raw: last.stdout };
    } catch {
      // reintenta
    }
  }
  return {
    ok: false,
    raw: last.stdout,
    stderr: last.stderr,
    exitCode: last.exitCode,
  };
}

/** Juzga el deck (mismos reintentos). */
export async function judgeDeck(
  deck: GeneratedCardSet,
  item: EvalItem,
  model: string,
  exec: JudgeExec = runClaudeCli
): Promise<
  | { ok: true; judgement: DeckJudgement; raw: string }
  | { ok: false; raw: string; stderr: string; exitCode: number }
> {
  const prompt = buildDeckPrompt(deck, item);
  let last: CliResult = { stdout: "", stderr: "", exitCode: -1 };
  for (let attempt = 0; attempt < 3; attempt++) {
    last = await exec(
      attempt === 0 ? prompt : `${prompt}\n\nIMPORTANTE: responde SOLO JSON válido.`,
      model
    );
    try {
      return { ok: true, judgement: parseDeckJudgement(last.stdout), raw: last.stdout };
    } catch {
      // reintenta
    }
  }
  return { ok: false, raw: last.stdout, stderr: last.stderr, exitCode: last.exitCode };
}
