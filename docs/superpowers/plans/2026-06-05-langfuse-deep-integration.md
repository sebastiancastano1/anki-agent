# Langfuse Deep Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ligar el trace real de generación (tokens/costo) al run-item de Langfuse, añadir Human Annotation para calibrar el juez, y usar score types (categórico/boolean) + expectedOutput.

**Architecture:** El proceso de eval inicializa OpenLLMetry, envuelve la generación en un workflow OTel y captura su `traceId`; los scores y el link del dataset cuelgan de ese trace real. Un módulo de anotación crea score-configs y encola una muestra de traces a una annotation queue de Langfuse.

**Tech Stack:** TypeScript + tsx, `@traceloop/node-server-sdk`, `@opentelemetry/api`, `langfuse` SDK, `fetch` para REST de Langfuse.

---

## Task 1: Tipos — traceId y score tipado

**Files:** Modify `eval/src/types.ts`

- [ ] **Step 1: Añadir `traceId` a AgentRunResult**

En `eval/src/types.ts`, dentro de `export type AgentRunResult = { ... }`, añade un campo:
```ts
  traceId: string | null;
```
(colócalo junto a `error: string | null;`).

- [ ] **Step 2: Verificar tsc**

Run: `npx tsc --noEmit`
Expected: aparecerán errores en `runAgent.ts`/`runDataset.ts` por el campo faltante — eso se resuelve en tareas siguientes. Si SOLO hay errores de "missing property traceId", continúa. Si hay otros, reporta.

- [ ] **Step 3: Commit**
```bash
git add eval/src/types.ts
git commit -m "feat(eval): AgentRunResult.traceId para ligar trace real"
```

---

## Task 2: Módulo de telemetría del eval

**Files:** Create `eval/src/otel.ts`

- [ ] **Step 1: Crear `eval/src/otel.ts`**

```ts
import * as traceloop from "@traceloop/node-server-sdk";
import * as AnthropicModule from "@anthropic-ai/sdk";

let initialized = false;

/**
 * Inicializa OpenLLMetry para el PROCESO de eval (standalone, fuera de Next).
 * Sin esto, el agente no emite spans al Collector y el trace de Langfuse queda
 * vacío (sin tokens/costo). Idéntico en espíritu a instrumentation.node.ts.
 */
export function initEvalTelemetry(): void {
  if (initialized) return;
  traceloop.initialize({
    appName: process.env.OTEL_SERVICE_NAME ?? "anki-agent-eval",
    baseUrl: process.env.TRACELOOP_BASE_URL ?? "http://localhost:4318",
    apiKey: process.env.TRACELOOP_API_KEY,
    disableBatch: true, // export inmediato; el eval es corto y queremos el trace ya
    instrumentModules: { anthropic: AnthropicModule },
  });
  initialized = true;
}

/** Fuerza el envío de spans pendientes antes de salir. Best-effort. */
export async function flushEvalTelemetry(): Promise<void> {
  try {
    await traceloop.forceFlush();
  } catch {
    // best-effort: no rompemos el eval por un fallo de flush
  }
}
```

- [ ] **Step 2: Verificar tsc**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos en `otel.ts` (los de traceId persisten hasta tareas siguientes).

- [ ] **Step 3: Commit**
```bash
git add eval/src/otel.ts
git commit -m "feat(eval): init de OpenLLMetry para el proceso de eval"
```

---

## Task 3: runAgent — workflow OTel + captura de traceId

**Files:** Modify `eval/src/runAgent.ts`

- [ ] **Step 1: Reescribir `eval/src/runAgent.ts` EXACTAMENTE así**

```ts
import * as traceloop from "@traceloop/node-server-sdk";
import { trace } from "@opentelemetry/api";
import { runResearchAgent } from "../../lib/agent/researchAgent";
import type { AgentRunResult, GeneratedCardSet } from "./types";

/**
 * Ejecuta el agente real sobre un ítem y captura el deck + métricas de proceso.
 * Envuelve la generación en un workflow OTel ("eval_generation") para que los
 * spans del agente cuelguen de una traza con id conocido, que devolvemos en
 * `traceId` para ligarla al run-item de Langfuse (con tokens/costo).
 * Nunca lanza: un fallo del agente se devuelve en `error`.
 */
export async function runAgent(
  topic: string,
  count: number,
  model: string,
  itemId?: string
): Promise<AgentRunResult> {
  const events: unknown[] = [];
  const cards: GeneratedCardSet["cards"] = [];
  let deckName = "";
  let studyDoc: string | null = null;
  let searches = 0;
  let error: string | null = null;
  let turns = 0;
  let traceId: string | null = null;

  try {
    await traceloop.withWorkflow(
      { name: "eval_generation", associationProperties: { item_id: itemId ?? topic } },
      async () => {
        traceId = trace.getActiveSpan()?.spanContext().traceId ?? null;
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
      }
    );
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
      schemaRetries: 0,
      endedInError: error !== null,
    },
    error,
    traceId,
    events,
  };
}
```

- [ ] **Step 2: Verificar tsc**

Run: `npx tsc --noEmit`
Expected: sin errores en runAgent.ts ni types (queda pendiente runDataset.ts hasta Task 6).

- [ ] **Step 3: Commit**
```bash
git add eval/src/runAgent.ts
git commit -m "feat(eval): runAgent envuelve generación en workflow OTel y captura traceId"
```

---

## Task 4: langfuse.ts — trace real, score tipado, expectedOutput

**Files:** Modify `eval/src/langfuse.ts`

- [ ] **Step 1: Actualizar `upsertDataset` para incluir expectedOutput**

En `eval/src/langfuse.ts`, dentro de `upsertDataset`, en la llamada a `lf.createDatasetItem`, añade el campo `expectedOutput` después de `input`:
```ts
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
```

- [ ] **Step 2: Extender `ScoreInput` con dataType y valor string**

Reemplaza la definición de `ScoreInput` por:
```ts
export type ScoreInput = {
  name: string;
  value: number | string;
  comment?: string;
  /** confianza del juez, anexada al comment para auditoría */
  confidence?: string;
  /** tipo de score en Langfuse; default NUMERIC */
  dataType?: "NUMERIC" | "CATEGORICAL" | "BOOLEAN";
};
```

- [ ] **Step 3: Reescribir `recordRunItem` para usar el trace real y scores tipados**

Reemplaza la función `recordRunItem` completa por:
```ts
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
```

- [ ] **Step 4: Verificar tsc**

Run: `npx tsc --noEmit`
Expected: sin errores en langfuse.ts. Si el SDK exige otra forma para `value`/`dataType`
(p.ej. un método distinto para categóricos), AJUSTA al mínimo según los tipos reales en
`node_modules/langfuse/lib/index.d.ts` y deja una nota; no inventes API.

- [ ] **Step 5: Commit**
```bash
git add eval/src/langfuse.ts
git commit -m "feat(eval): recordRunItem liga trace real + scores tipados + expectedOutput"
```

---

## Task 5: annotation.ts — score-configs + encolar (REST) con test

**Files:** Create `eval/src/annotation.ts`, `eval/src/annotation.test.ts`

- [ ] **Step 1: Escribir el test que falla `eval/src/annotation.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { missingConfigs, HUMAN_CONFIGS } from "./annotation";

describe("missingConfigs", () => {
  it("returns configs whose name is not already present", () => {
    const existing = [{ name: "human.overall" }];
    const missing = missingConfigs(existing);
    const names = missing.map((c) => c.name);
    expect(names).not.toContain("human.overall");
    expect(names).toContain("human.factual_accuracy");
    expect(missing.length).toBe(HUMAN_CONFIGS.length - 1);
  });
  it("returns all when none exist", () => {
    expect(missingConfigs([]).length).toBe(HUMAN_CONFIGS.length);
  });
});
```

- [ ] **Step 2: Ejecutar para ver el fallo**

Run: `npx vitest run eval/src/annotation.test.ts`
Expected: FAIL — "Cannot find module './annotation'".

- [ ] **Step 3: Implementar `eval/src/annotation.ts`**

```ts
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
```

- [ ] **Step 4: Ejecutar el test**

Run: `npx vitest run eval/src/annotation.test.ts`
Expected: PASS. También `npx tsc --noEmit` sin errores en annotation.ts.

- [ ] **Step 5: Commit**
```bash
git add eval/src/annotation.ts eval/src/annotation.test.ts
git commit -m "feat(eval): score-configs y encolado para Human Annotation con test"
```

---

## Task 6: runDataset — wiring de las 3 features + README

**Files:** Modify `eval/src/runDataset.ts`, `eval/README.md`

- [ ] **Step 1: Importar los nuevos módulos**

En `eval/src/runDataset.ts`, junto a los imports existentes, añade:
```ts
import { initEvalTelemetry, flushEvalTelemetry } from "./otel";
import { ensureScoreConfigs, enqueueForAnnotation } from "./annotation";
```

- [ ] **Step 2: Añadir los flags de anotación**

Después de la línea `const LIMIT = arg("limit") ? Number(arg("limit")) : undefined;` añade:
```ts
const ANNOTATE_SAMPLE = Number(arg("annotate-sample", "0"));
const ANNOTATION_QUEUE_ID = arg("annotation-queue-id") ?? process.env.LANGFUSE_ANNOTATION_QUEUE_ID;
```

- [ ] **Step 3: Pasar itemId a runAgent y el traceId a recordRunItem**

En `processItem`, cambia la llamada al agente:
```ts
  const agentRes = await runAgent(item.topic, item.count, AGENT_MODEL, item.id);
```
y en la llamada a `recordRunItem(lf, { ... })` añade el campo `traceId`:
```ts
    await recordRunItem(lf, {
      itemId: item.id,
      runName: RUN_NAME,
      input: { topic: item.topic, count: item.count },
      output: agentRes.deck,
      provenance,
      scores,
      traceId: agentRes.traceId,
    });
```

- [ ] **Step 4: Hacer `schema_valid` BOOLEAN y subir confidence categórico**

En `processItem`, localiza el push de scores deterministas y el de los confidence del deck.
Reemplaza la línea:
```ts
  scores.push({ name: "schema_valid", value: determ.schemaValid ? 1 : 0 });
```
por:
```ts
  scores.push({ name: "schema_valid", value: determ.schemaValid ? 1 : 0, dataType: "BOOLEAN" });
```
Y dentro del bloque `if (agentRes.deck && cardJudgements.length > 0)`, después de los dos
`scores.push` de `deck.coverage`/`deck.redundancy`, añade los confidence como categóricos:
```ts
    scores.push({ name: "deck.coverage.confidence", value: deckJudgement.coverage.confidence, dataType: "CATEGORICAL" });
    scores.push({ name: "deck.redundancy.confidence", value: deckJudgement.redundancy.confidence, dataType: "CATEGORICAL" });
```

- [ ] **Step 5: Inicializar telemetría y procesar anotación en `main`**

En `main()`, justo después del `console.log("Eval: ...")` inicial, añade:
```ts
  if (!DRY_RUN) initEvalTelemetry();
```
La función `processItem` devuelve un `ItemSummary`. Para encolar necesitamos los traceIds,
así que añade `traceId` al tipo `ItemSummary`:
```ts
type ItemSummary = {
  itemId: string;
  agentError: string | null;
  judgeFailed: boolean;
  overall: number | null;
  traceId: string | null;
};
```
y en el `return` de `processItem` añade `traceId: agentRes.traceId,`.

Luego, en `main()`, DESPUÉS de `const summaries = await mapPool(...)` y ANTES del resumen,
añade el flush y el encolado:
```ts
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
```

- [ ] **Step 6: Verificar tsc y tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS, 0 errores; todos los tests verdes.

- [ ] **Step 7: Actualizar `eval/README.md`**

Añade al final de `eval/README.md` esta sección:
```markdown
## Integración profunda con Langfuse

### Trace real + costo
El eval inicializa OpenLLMetry y liga cada run-item al **trace real** de generación, así
que en Langfuse ves **tokens, costo y latencia** junto a la calidad. Requiere el Collector
con fan-out a Langfuse arriba: `npm run obs:langfuse:up` (y `LANGFUSE_OTEL_AUTH` en `.env`).
Si el Collector no está, el harness degrada a un trace sintético (sin costo), sin romper.

### Score types
- `schema_valid` se sube como **BOOLEAN**.
- `deck.*.confidence` del juez como **CATEGORICAL** (low/medium/high).
- El resto, NUMERIC. Esto enriquece Scores → Analytics (distribución, correlación, heatmaps).

### Human Annotation (calibrar el juez)
1. En la UI: **Human Annotation → New queue**, selecciona las score-configs `human.*`
   (el harness las crea automáticamente la primera vez que usas `--annotate-sample`).
2. Copia el id de la cola y corre:
   ` ` `bash
   npm run eval -- --run-name baseline --annotate-sample 5 --annotation-queue-id <id>
   ` ` `
   (o exporta `LANGFUSE_ANNOTATION_QUEUE_ID`).
3. Anota esas tarjetas a mano en la UI.
4. En **Scores → Analytics** selecciona `human.overall` y `overall_score` → la correlación
   te dice qué tan bien puntúa el juez. Baja correlación = ajustar la rúbrica.

### expectedOutput
Cada ítem del dataset incluye `referenceFacts` y `expectedCoverage` como expectedOutput,
visible en la vista de Datasets/Runs para comparar esperado-vs-real.
```
(Recuerda: en el archivo real usa triple backtick de verdad en el bloque bash.)

- [ ] **Step 8: Commit**
```bash
git add eval/src/runDataset.ts eval/README.md
git commit -m "feat(eval): wiring trace real + annotation + score types en el orquestador"
```

---

## Self-Review Notes

**Cobertura del spec (addendum):**
- Feature 1 (trace real + costo) → Tasks 2, 3, 4 (otel init, withWorkflow+traceId, recordRunItem traceId). ✓
- Feature 2 (Human Annotation) → Task 5 (annotation.ts) + Task 6 (flags, ensure+enqueue). ✓
- Feature 3 (score types + expectedOutput) → Task 4 (expectedOutput, ScoreInput.dataType) + Task 6 (boolean/categorical pushes). ✓
- Degradación elegante sin Collector → Task 4 (traceId opcional) + README. ✓
- Test de idempotencia de configs → Task 5. ✓

**Verificación final (manual, tras implementar):** smoke real `--limit 1` y confirmar en
Langfuse que el run-item cuelga de un trace con costo/tokens y `schema_valid` es BOOLEAN.
