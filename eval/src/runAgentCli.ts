import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CLI_SYSTEM_PROMPT, userPrompt } from "../../lib/agent/prompts";
import { cardSetSchema } from "../../lib/agent/schema";
import { extractJson } from "./judge";
import type { AgentRunResult, GeneratedCardSet, RunUsage } from "./types";

/**
 * Runner ALTERNATIVO de generación vía el Claude Code CLI (`claude -p`), que usa
 * la suscripción del usuario en vez de créditos de la API de Anthropic.
 *
 * No reemplaza al runner SDK (`runAgent`); se selecciona con `--runner cli`.
 * Diferencias frente al runner SDK:
 *  - No hay tools nativas add_cards/finish_deck → el modelo devuelve el deck como
 *    un único JSON (CLI_SYSTEM_PROMPT), validado con el mismo `cardSetSchema`.
 *  - La búsqueda web es la tool WebSearch de Claude Code (no el server tool de la
 *    API). El costo no se liga a un span OTel: `traceId` queda null y el costo lo
 *    reporta el propio CLI (`total_cost_usd`), no el Collector.
 */

type CliModelUsage = {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadInputTokens?: number;
  webSearchRequests?: number;
};

type CliEnvelope = {
  type: string;
  is_error?: boolean;
  result?: string;
  num_turns?: number;
  total_cost_usd?: number;
  modelUsage?: Record<string, CliModelUsage>;
};

/** Suma el uso por-modelo del envelope del CLI a un RunUsage. */
function usageFromEnvelope(env: CliEnvelope): RunUsage {
  const models = Object.values(env.modelUsage ?? {});
  const sum = (pick: (u: CliModelUsage) => number | undefined) =>
    models.reduce((n, u) => n + (pick(u) ?? 0), 0);
  return {
    costUsd: env.total_cost_usd ?? 0,
    inputTokens: sum((u) => u.inputTokens),
    outputTokens: sum((u) => u.outputTokens),
    cacheReadTokens: sum((u) => u.cacheReadInputTokens),
    webSearches: sum((u) => u.webSearchRequests),
  };
}

function stripApiAuth(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const copy = { ...env };
  delete copy.ANTHROPIC_API_KEY;
  delete copy.ANTHROPIC_AUTH_TOKEN;
  return copy;
}

function runClaudeCli(
  systemPrompt: string,
  userMessage: string,
  model: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  // cwd fuera del repo: si corre dentro del proyecto, `claude -p` carga CLAUDE.md
  // y todo el toolset de Claude Code (Bash/Read/Edit), y el modelo se comporta
  // como agente de coding (pide permisos, narra sobre el repo) en vez de
  // investigar. Un dir temporal aislado da una sesión limpia de research.
  const cwd = mkdtempSync(join(tmpdir(), "anki-cli-"));
  return new Promise((resolve) => {
    const child = spawn(
      "claude",
      [
        "-p",
        "--model",
        model,
        "--append-system-prompt",
        systemPrompt,
        // Solo búsqueda web; nada de Bash/Edit/etc. que confundan al modelo.
        "--allowedTools",
        "WebSearch",
        "WebFetch",
        "--disallowedTools",
        "Bash",
        "Edit",
        "Write",
        "Read",
        "--output-format",
        "json",
      ],
      {
        stdio: ["pipe", "pipe", "pipe"],
        cwd,
        // Clave del enfoque: quitar ANTHROPIC_API_KEY/AUTH_TOKEN del entorno del
        // hijo. Si están presentes, el CLI usa la API (con créditos); sin ellas
        // cae al login de suscripción de Claude Code — el objetivo de este runner.
        env: stripApiAuth(process.env),
      }
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => resolve({ stdout, stderr, exitCode: code ?? -1 }));
    child.stdin.write(userMessage);
    child.stdin.end();
  });
}

export async function runAgentViaCli(
  topic: string,
  count: number,
  model: string
): Promise<AgentRunResult> {
  const events: unknown[] = [];
  let error: string | null = null;
  let deck: GeneratedCardSet | null = null;
  let searches = 0;
  let turns = 0;
  let usage: RunUsage | undefined;

  try {
    const res = await runClaudeCli(CLI_SYSTEM_PROMPT, userPrompt(topic, count), model);
    if (res.exitCode !== 0) {
      throw new Error(`claude CLI exited ${res.exitCode}: ${res.stderr.slice(0, 300)}`);
    }
    const envelope = JSON.parse(res.stdout) as CliEnvelope;
    events.push(envelope);
    if (envelope.is_error || typeof envelope.result !== "string") {
      throw new Error(`CLI sin resultado válido: ${res.stdout.slice(0, 300)}`);
    }
    turns = envelope.num_turns ?? 0;
    usage = usageFromEnvelope(envelope);
    searches = usage.webSearches;
    const parsed = cardSetSchema.parse(extractJson(envelope.result));
    deck = { deckName: parsed.deckName, cards: parsed.cards };
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return {
    deck: deck && deck.cards.length > 0 ? deck : null,
    studyDoc: null,
    process: { turns, searches, schemaRetries: 0, endedInError: error !== null },
    error,
    // El runner CLI no produce un span OTel propio: no hay trace real que ligar.
    traceId: null,
    events,
    usage,
  };
}
