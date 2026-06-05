# Integración profunda con Langfuse — Diseño (addendum)

**Fecha:** 2026-06-05
**Estado:** Propuesto
**Base:** extiende `2026-06-05-model-eval-harness-design.md` (harness ya implementado y validado).

## Objetivo

Aprovechar a fondo Langfuse en el eval, con tres mejoras elegidas:
1. **Ligar el trace real de generación + costo** al dataset run-item.
2. **Human Annotation** para calibrar el juez LLM (humano vs juez).
3. **Tipos de score** (categórico/boolean) + **expectedOutput** en los ítems.

Contexto verificado: el Collector OTLP responde en `:4318`; Langfuse auth OK en `:3001`;
el script `tsx` de eval NO carga `instrumentation.node.ts` (lo carga Next), así que hoy
no emite spans de generación. Langfuse expone REST para `score-configs` y
`annotation-queues/{id}/items`; los scores aceptan `dataType NUMERIC|CATEGORICAL|BOOLEAN`.

---

## Feature 1 — Trace real de generación + costo

**Problema:** `recordRunItem` crea un trace sintético vacío (`lf.trace(...)`). No tiene
tokens ni costo. Además el eval standalone no inicializa OpenLLMetry, así que el agente no
emite spans a Langfuse.

**Diseño:**
- Nuevo módulo `eval/src/otel.ts`: `initEvalTelemetry()` que llama
  `traceloop.initialize({ appName: "anki-agent-eval", baseUrl: TRACELOOP_BASE_URL ?? "http://localhost:4318", disableBatch: true, instrumentModules: { anthropic: AnthropicModule } })`.
  Idéntico a `instrumentation.node.ts` pero para el proceso de eval. Se llama una vez al
  inicio de `runDataset.main()` (antes de procesar ítems), salvo en `--dry-run`.
- `runAgent` envuelve la generación en `traceloop.withWorkflow({ name: "eval_generation", associationProperties: { item_id } }, ...)` y captura el trace id de OTel con
  `trace.getActiveSpan()?.spanContext().traceId` (32-hex). Lo devuelve en `AgentRunResult.traceId`.
  - `AgentRunResult` gana el campo `traceId: string | null`.
- `recordRunItem` acepta `traceId?: string`. Si viene:
  - **No** crea un trace nuevo; usa `lf.trace({ id: traceId })` (mismo id que el span OTLP),
    de modo que los scores y el link cuelgan del trace REAL con `gen_ai.usage.*` (Langfuse
    calcula el costo desde esos tokens). Si no viene (p.ej. dry-run), conserva el comportamiento actual.
  - Linkea el dataset run-item a ese trace id.
- Los scores se postean al mismo trace id.

**Dependencias / caveats (documentar en README):**
- Requiere el stack Langfuse + Collector con fan-out (`npm run obs:langfuse:up`,
  `LANGFUSE_OTEL_AUTH` en `.env`). Ya están activos.
- Consistencia eventual: el span OTLP puede llegar a Langfuse poco después de postear los
  scores; Langfuse asocia por trace id aunque el trace llegue luego. Hacemos `flushAsync`
  del SDK y dependemos del export sin batch del Collector.
- Si el Collector no está, no hay trace: `traceId` será `null` y caemos al trace sintético
  (degradación elegante, no error).

---

## Feature 2 — Human Annotation (calibrar el juez)

**Objetivo:** comparar puntajes humanos vs juez LLM sobre una muestra, y usar
Scores → Analytics (dos scores → correlación/heatmap) para validar al juez.

**Diseño:**
- Nuevo módulo `eval/src/annotation.ts`:
  - `ensureScoreConfigs(host, auth)`: crea (idempotente, vía `POST /api/public/score-configs`)
    configs **CATEGORICAL/NUMERIC** para anotación humana, una por criterio que queremos
    calibrar: `human.factual_accuracy`, `human.atomicity`, `human.overall` (escala 1-5).
    Idempotencia: listar con `GET /api/public/score-configs` y crear solo los faltantes por nombre.
  - `enqueueForAnnotation(host, auth, queueId, traceIds)`: añade los traces de una muestra
    a una cola existente vía `POST /api/public/annotation-queues/{queueId}/items`
    (`objectType: "TRACE"`).
- Flag nuevo en el orquestador: `--annotate-sample <n>` (default 0 = off). Tras procesar los
  ítems, toma los primeros N traces y los encola; requiere `--annotation-queue-id <id>`
  (o env `LANGFUSE_ANNOTATION_QUEUE_ID`).
- La **cola** se crea una vez en la UI (Human Annotation → New queue) seleccionando esas
  score-configs; la creación de cola no está expuesta de forma estable por API en esta
  versión, así que se documenta el paso manual. El harness crea las configs y encola.

**Flujo de uso (README):** correr eval con `--annotate-sample 5` → en la UI anotas esas 5 a
mano → en Scores → Analytics seleccionas `human.overall` y `overall_score` → ves correlación
juez-vs-humano. Baja correlación = el juez necesita ajuste de rúbrica.

---

## Feature 3 — Tipos de score + expectedOutput

**Scores tipados:** `ScoreInput` gana `dataType?: "NUMERIC"|"CATEGORICAL"|"BOOLEAN"` y, para
categóricos, el `value` puede ser string.
- `schema_valid` → `BOOLEAN` (value 0/1, dataType BOOLEAN).
- Los `confidence` del juez (coverage/redundancy) se suben como score **CATEGORICAL** aparte:
  `deck.coverage.confidence` con value `"low"|"medium"|"high"`.
- El resto sigue NUMERIC.
- `recordRunItem` pasa `dataType` (y string value cuando aplique) a `trace.score(...)`.

**expectedOutput en el dataset:** `upsertDataset` añade a `createDatasetItem`:
`expectedOutput: { referenceFacts: item.referenceFacts ?? [], expectedCoverage: item.expectedCoverage ?? [] }`.
Así la vista de Datasets/Runs muestra esperado-vs-real.

---

## Cambios por archivo

- **Nuevo** `eval/src/otel.ts` — init de telemetría para el proceso de eval.
- **Nuevo** `eval/src/annotation.ts` — score-configs + encolar a annotation queue (REST).
- `eval/src/types.ts` — `AgentRunResult.traceId`; `ScoreInput.dataType` + value string.
- `eval/src/runAgent.ts` — `withWorkflow` + captura de traceId.
- `eval/src/langfuse.ts` — `recordRunItem` usa traceId real; `upsertDataset` con expectedOutput;
  score tipado.
- `eval/src/runDataset.ts` — `initEvalTelemetry()` al inicio; flags `--annotate-sample`,
  `--annotation-queue-id`; subir confidence categórico y schema_valid boolean.
- `eval/README.md` — documentar dependencia del Collector, flujo de anotación, tipos de score.

## Pruebas

- `annotation.ts`: test del filtro de idempotencia (configs existentes no se recrean) con
  fetch mockeado.
- `langfuse.ts`: el score tipado y el path con/sin traceId se cubren con un test del armado
  del payload (sin red) si es práctico; si no, se valida por tsc + smoke real.
- Smoke real `--limit 1`: confirmar en Langfuse que el run-item cuelga de un trace con
  **costo/tokens** y que `schema_valid` aparece como BOOLEAN.

## Fuera de alcance

- Creación de annotation queue por API (UI manual, una vez).
- Evaluators gestionados de Langfuse (usan API key con tokens; mantenemos `claude -p`).
- Dashboards custom (se pueden armar en la UI sin código).
