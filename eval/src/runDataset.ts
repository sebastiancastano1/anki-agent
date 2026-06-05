import "dotenv/config";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runAgent } from "./runAgent";
import { runAgentViaCli } from "./runAgentCli";
import { runDeterministic } from "./deterministic";
import {
  judgeCard,
  judgeDeck,
  RUBRIC_VERSION,
  type JudgeExec,
} from "./judge";
import { overallScore, meanCriterion, meanStd } from "./aggregate";
import { makeClient, upsertDataset, recordRunItem, type ScoreInput } from "./langfuse";
import { initEvalTelemetry, flushEvalTelemetry } from "./otel";
import { ensureScoreConfigs, enqueueForAnnotation } from "./annotation";
import type {
  CardJudgement,
  EvalItem,
  JudgeProvenance,
} from "./types";

// ---- CLI args -------------------------------------------------------------
function arg(name: string, fallback?: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.split("=").slice(1).join("=");
  const idx = process.argv.indexOf(`--${name}`);
  if (idx !== -1 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith("--"))
    return process.argv[idx + 1];
  return fallback;
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

const AGENT_MODEL = arg("model", "claude-sonnet-4-6")!;
// Runner de generación: "sdk" (default, API de Anthropic) o "cli" (claude -p,
// usa la suscripción de Claude Code en vez de créditos de API).
const RUNNER = (arg("runner", "sdk") as "sdk" | "cli");
const RUN_NAME = arg("run-name", `run-${AGENT_MODEL}`)!;
const JUDGE_MODEL = process.env.EVAL_JUDGE_MODEL ?? "claude-opus-4-8";
const REPEAT = Number(arg("repeat", "1"));
const DRY_RUN = hasFlag("dry-run");
const CONCURRENCY = Number(arg("concurrency", "3"));
const LIMIT = arg("limit") ? Number(arg("limit")) : undefined;
const ANNOTATE_SAMPLE = Number(arg("annotate-sample", "0"));
const ANNOTATION_QUEUE_ID = arg("annotation-queue-id") ?? process.env.LANGFUSE_ANNOTATION_QUEUE_ID;
const SKIP_EXISTING = hasFlag("skip-existing");

// ---- juez: real o mock (dry-run) -----------------------------------------
const MOCK_CARD = JSON.stringify({
  factual_accuracy: { score: 4, reason: "mock", confidence: "medium" },
  clarity: { score: 4, reason: "mock", confidence: "high" },
  atomicity: { score: 4, reason: "mock", confidence: "high" },
  relevance: { score: 4, reason: "mock", confidence: "high" },
  answerability: { score: 4, reason: "mock", confidence: "high" },
  retrieval_value: { score: 4, reason: "mock", confidence: "medium" },
  front_back_fit: { score: 4, reason: "mock", confidence: "high" },
  minimal_answer: { score: 4, reason: "mock", confidence: "high" },
});
const MOCK_DECK = JSON.stringify({
  coverage: { score: 4, reason: "mock", confidence: "medium" },
  redundancy: { score: 5, reason: "mock", confidence: "high" },
});
const mockExec: JudgeExec = async (prompt) => ({
  stdout: prompt.includes("nivel deck") ? MOCK_DECK : MOCK_CARD,
  stderr: "",
  exitCode: 0,
});

function cliVersion(): string {
  try {
    return execFileSync("claude", ["--version"]).toString().trim();
  } catch {
    return "unknown";
  }
}

// ---- pool de concurrencia simple -----------------------------------------
async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker)
  );
  return results;
}

// ---- procesamiento de un ítem --------------------------------------------
type ItemSummary = {
  itemId: string;
  agentError: string | null;
  judgeFailed: boolean;
  overall: number | null;
  traceId: string | null;
};

async function processItem(item: EvalItem): Promise<ItemSummary> {
  const exec = DRY_RUN ? mockExec : undefined;
  const resultsDir = join(process.cwd(), "eval/results", RUN_NAME);
  mkdirSync(resultsDir, { recursive: true });

  const agentRes =
    RUNNER === "cli"
      ? await runAgentViaCli(item.topic, item.count, AGENT_MODEL)
      : await runAgent(item.topic, item.count, AGENT_MODEL, item.id);
  const determ = runDeterministic(agentRes.deck, item.count);

  const provenance: JudgeProvenance = {
    provider: DRY_RUN ? "mock" : "claude-cli",
    model: JUDGE_MODEL,
    temperature: 0,
    rubricVersion: RUBRIC_VERSION,
    cliVersion: DRY_RUN ? "mock" : cliVersion(),
  };

  let judgeFailed = false;
  const cardJudgements: CardJudgement[] = [];
  if (agentRes.deck) {
    for (const card of agentRes.deck.cards) {
      // --repeat: promediar N juicios reduciría ruido; aquí tomamos el primer
      // juicio válido de REPEAT intentos para simplicidad (extensible).
      let got: CardJudgement | null = null;
      for (let r = 0; r < REPEAT && !got; r++) {
        const j = await judgeCard(card, item, JUDGE_MODEL, exec);
        if (j.ok) got = j.judgement;
        else judgeFailed = true;
      }
      if (got) cardJudgements.push(got);
    }
  }

  let overall: number | null = null;
  const scores: ScoreInput[] = [];

  if (agentRes.deck && cardJudgements.length > 0) {
    const deckJ = await judgeDeck(agentRes.deck, item, JUDGE_MODEL, exec);
    if (!deckJ.ok) judgeFailed = true;
    const deckJudgement = deckJ.ok
      ? deckJ.judgement
      : { coverage: { score: 3, reason: "fallback", confidence: "low" as const }, redundancy: { score: 3, reason: "fallback", confidence: "low" as const } };

    // promedios por criterio de tarjeta
    const criteria: Array<keyof CardJudgement> = [
      "factual_accuracy", "clarity", "atomicity", "relevance",
      "answerability", "retrieval_value", "front_back_fit", "minimal_answer",
    ];
    for (const k of criteria) {
      scores.push({ name: `card.${k}`, value: meanCriterion(cardJudgements, k) });
    }
    scores.push({ name: "deck.coverage", value: deckJudgement.coverage.score, confidence: deckJudgement.coverage.confidence });
    scores.push({ name: "deck.redundancy", value: deckJudgement.redundancy.score, confidence: deckJudgement.redundancy.confidence });
    scores.push({ name: "deck.coverage.confidence", value: deckJudgement.coverage.confidence, dataType: "CATEGORICAL" });
    scores.push({ name: "deck.redundancy.confidence", value: deckJudgement.redundancy.confidence, dataType: "CATEGORICAL" });

    // overall: usa promedio de tarjetas como "tarjeta representativa"
    const avgCard = Object.fromEntries(
      criteria.map((k) => [k, { score: meanCriterion(cardJudgements, k), reason: "avg", confidence: "medium" }])
    ) as unknown as CardJudgement;
    overall = overallScore(avgCard, deckJudgement);
    scores.push({ name: "overall_score", value: overall });
  }

  // scores deterministas
  scores.push({ name: "schema_valid", value: determ.schemaValid ? 1 : 0, dataType: "BOOLEAN" });
  scores.push({ name: "count_ratio", value: determ.count.ratio });
  scores.push({ name: "near_duplicates", value: determ.duplication.nearDuplicatePairs.length });

  // artefacto crudo
  writeFileSync(
    join(resultsDir, `${item.id}.json`),
    JSON.stringify({ item, agentRes, determ, cardJudgements, scores, provenance }, null, 2)
  );

  // Langfuse (omitido en dry-run)
  if (!DRY_RUN) {
    const lf = makeClient();
    await recordRunItem(lf, {
      itemId: item.id,
      runName: RUN_NAME,
      input: { topic: item.topic, count: item.count },
      output: agentRes.deck,
      provenance,
      scores,
      traceId: agentRes.traceId,
    });
  }

  return {
    itemId: item.id,
    agentError: agentRes.error,
    judgeFailed,
    overall,
    traceId: agentRes.traceId,
  };
}

// ---- main -----------------------------------------------------------------
async function main() {
  const golden = JSON.parse(
    readFileSync(join(process.cwd(), "eval/dataset/golden.json"), "utf8")
  ) as EvalItem[];
  const edge = JSON.parse(
    readFileSync(join(process.cwd(), "eval/dataset/edge-cases.json"), "utf8")
  ) as EvalItem[];
  const all = LIMIT ? [...golden, ...edge].slice(0, LIMIT) : [...golden, ...edge];
  // --skip-existing: omite ítems cuyo artefacto ya existe para este run
  // (reanuda tras un fallo parcial sin re-generar lo ya logrado).
  const items = SKIP_EXISTING
    ? all.filter(
        (it) =>
          !existsSync(join(process.cwd(), "eval/results", RUN_NAME, `${it.id}.json`))
      )
    : all;

  console.log(
    `Eval: model=${AGENT_MODEL} runner=${RUNNER} judge=${JUDGE_MODEL} run=${RUN_NAME} ` +
      `items=${items.length} dryRun=${DRY_RUN}`
  );

  if (!DRY_RUN) initEvalTelemetry();

  if (!DRY_RUN) {
    const lf = makeClient();
    await upsertDataset(lf, items);
    await lf.flushAsync();
  }

  const summaries = await mapPool(items, CONCURRENCY, processItem);

  if (!DRY_RUN) await flushEvalTelemetry();

  if (!DRY_RUN && ANNOTATE_SAMPLE > 0) {
    if (!ANNOTATION_QUEUE_ID) {
      console.warn(
        "⚠️  --annotate-sample requiere --annotation-queue-id (o LANGFUSE_ANNOTATION_QUEUE_ID). Omitido."
      );
    } else {
      await ensureScoreConfigs();
      const sample = summaries
        .map((s) => s.traceId)
        .filter((t): t is string => !!t)
        .slice(0, ANNOTATE_SAMPLE);
      await enqueueForAnnotation(ANNOTATION_QUEUE_ID, sample);
      console.log(`Encolados ${sample.length} traces para anotación humana (queue ${ANNOTATION_QUEUE_ID}).`);
    }
  }

  // resumen en consola
  const overalls = summaries.map((s) => s.overall).filter((x): x is number => x !== null);
  const { mean, std } = meanStd(overalls);
  console.log("\n=== Resumen ===");
  console.log(`Run: ${RUN_NAME}`);
  console.log(`overall_score: mean=${mean.toFixed(3)} std=${std.toFixed(3)} (n=${overalls.length})`);
  console.log(`agent errors: ${summaries.filter((s) => s.agentError).length}`);
  console.log(`judge failures: ${summaries.filter((s) => s.judgeFailed).length}`);
  for (const s of summaries) {
    console.log(`  ${s.itemId}: overall=${s.overall?.toFixed(3) ?? "n/a"}${s.agentError ? ` ERROR(${s.agentError})` : ""}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
