/**
 * Human Annotation en Langfuse vía REST: crea las score-configs (escalas) que el
 * humano usará y encola una muestra de traces a una annotation queue existente.
 * La cola se crea una vez en la UI (no hay API estable para crearla en esta versión).
 */

export type ScoreConfig = {
  name: string;
  dataType: "NUMERIC" | "CATEGORICAL" | "BOOLEAN";
  minValue?: number;
  maxValue?: number;
};

/** Escalas humanas para calibrar al juez (1-5, comparables con los scores LLM). */
export const HUMAN_CONFIGS: ScoreConfig[] = [
  { name: "human.factual_accuracy", dataType: "NUMERIC", minValue: 1, maxValue: 5 },
  { name: "human.atomicity", dataType: "NUMERIC", minValue: 1, maxValue: 5 },
  { name: "human.overall", dataType: "NUMERIC", minValue: 1, maxValue: 5 },
];

/** Filtra las configs que aún no existen (idempotencia por nombre). */
export function missingConfigs(
  existing: Array<{ name: string }>
): ScoreConfig[] {
  const have = new Set(existing.map((c) => c.name));
  return HUMAN_CONFIGS.filter((c) => !have.has(c.name));
}

function authHeader(): string {
  const pk = process.env.LANGFUSE_PUBLIC_KEY ?? "";
  const sk = process.env.LANGFUSE_SECRET_KEY ?? "";
  return "Basic " + Buffer.from(`${pk}:${sk}`).toString("base64");
}

function host(): string {
  return process.env.LANGFUSE_HOST ?? "http://localhost:3001";
}

/** Crea (idempotente) las score-configs humanas que falten. */
export async function ensureScoreConfigs(): Promise<void> {
  const headers = { authorization: authHeader(), "content-type": "application/json" };
  const res = await fetch(`${host()}/api/public/score-configs?limit=100`, { headers });
  const existing: Array<{ name: string }> = res.ok
    ? ((await res.json()).data ?? [])
    : [];
  for (const cfg of missingConfigs(existing)) {
    await fetch(`${host()}/api/public/score-configs`, {
      method: "POST",
      headers,
      body: JSON.stringify(cfg),
    });
  }
}

/** Encola traces para anotación humana en una cola existente. */
export async function enqueueForAnnotation(
  queueId: string,
  traceIds: string[]
): Promise<void> {
  const headers = { authorization: authHeader(), "content-type": "application/json" };
  for (const traceId of traceIds) {
    await fetch(`${host()}/api/public/annotation-queues/${queueId}/items`, {
      method: "POST",
      headers,
      body: JSON.stringify({ objectId: traceId, objectType: "TRACE" }),
    });
  }
}
