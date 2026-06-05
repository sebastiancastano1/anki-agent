import { Langfuse } from "langfuse";
import type { EvalItem, JudgeProvenance } from "./types";

export function makeClient(): Langfuse {
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const baseUrl = process.env.LANGFUSE_HOST ?? "http://localhost:3001";
  if (!publicKey || !secretKey) {
    throw new Error("Faltan LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY en el entorno.");
  }
  return new Langfuse({ publicKey, secretKey, baseUrl });
}

export const DATASET_NAME = "anki-agent-eval";

/** Crea el dataset (idempotente) y hace upsert de los items por su `id`. */
export async function upsertDataset(
  lf: Langfuse,
  items: EvalItem[]
): Promise<void> {
  await lf.createDataset({ name: DATASET_NAME });
  for (const item of items) {
    await lf.createDatasetItem({
      datasetName: DATASET_NAME,
      id: item.id, // mismo id => upsert, no duplica
      input: { topic: item.topic, count: item.count },
      expectedOutput: {
        referenceFacts: item.referenceFacts ?? [],
        expectedCoverage: item.expectedCoverage ?? [],
      },
      metadata: {
        tags: item.tags,
        difficulty: item.difficulty,
        notes: item.notes,
      },
    });
  }
}

export type ScoreInput = {
  name: string;
  value: number | string;
  comment?: string;
  /** confianza del juez, anexada al comment para auditoría */
  confidence?: string;
  /** tipo de score en Langfuse; default NUMERIC */
  dataType?: "NUMERIC" | "CATEGORICAL" | "BOOLEAN";
};

/**
 * Liga un ítem del dataset a un trace y publica sus scores. Si `traceId` viene
 * (trace real de generación con tokens/costo), se reutiliza ese id; si no, se
 * crea uno sintético (p.ej. dry-run). `provenance` va en metadata del trace.
 */
export async function recordRunItem(
  lf: Langfuse,
  args: {
    itemId: string;
    runName: string;
    input: unknown;
    output: unknown;
    provenance: JudgeProvenance;
    scores: ScoreInput[];
    traceId?: string | null;
  }
): Promise<void> {
  const dataset = await lf.getDataset(DATASET_NAME);
  const datasetItem = dataset.items.find((i) => i.id === args.itemId);
  const trace = lf.trace({
    id: args.traceId ?? undefined, // reutiliza el trace OTLP real si existe
    name: `eval:${args.runName}`,
    input: args.input,
    output: args.output,
    metadata: { judge: args.provenance },
  });
  if (datasetItem) {
    await datasetItem.link(trace, args.runName, {
      metadata: { judge: args.provenance },
    });
  }
  for (const s of args.scores) {
    trace.score({
      name: s.name,
      value: s.value as never, // number | string según dataType
      dataType: s.dataType ?? "NUMERIC",
      comment: s.confidence ? `[${s.confidence}] ${s.comment ?? ""}` : s.comment,
    });
  }
  await lf.flushAsync();
}
