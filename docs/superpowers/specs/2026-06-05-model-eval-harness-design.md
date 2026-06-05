# Eval del agente de investigación — Diseño

**Fecha:** 2026-06-05
**Estado:** Aprobado (diseño)
**Autor:** Sebastian Castano

## Objetivo

Construir un proceso de evaluación con estándares de industria para el agente de
investigación que genera tarjetas (`runResearchAgent`). El eval mide tres cosas:

1. **Calidad de las tarjetas** producidas por el agente.
2. **Comportamiento del agente** (uso de `web_search`, turnos, validez de schema, reintentos).
3. **Comparación de modelos** (modelo actual vs candidatos) sobre la misma tarea.

## Decisiones clave

- **Generación bajo prueba:** el agente real (`runResearchAgent`) vía API de Anthropic
  (SDK), para fidelidad con producción: `web_search` nativo + tools (`add_cards`,
  `emit_study_doc`, `finish_deck`).
- **Juez:** `claude -p` con Opus 4.8 (LLM-as-judge). Esto evita gastar tokens de la
  plataforma Anthropic en el grueso del eval (el juicio es lo que más se repite).
- **Backend de resultados:** Langfuse v3 self-hosted (ya montado en `otel/`). Se usan sus
  primitivas nativas: **Datasets → Runs → Scores**, que es el patrón estándar de evals.
- **Dataset:** híbrido — golden set curado a mano + edge cases, versionado en el repo.

## Arquitectura

```
eval/
  dataset/
    golden.json          # set curado versionado: {topic, count, tags, notes}
    edge-cases.json      # casos límite (ambiguos, nicho, multirespuesta)
  rubric/
    card-quality.md      # rúbrica del juez (criterios + escala con anclas)
  src/
    runDataset.ts        # orquestador
    runAgent.ts          # envuelve runResearchAgent (API real); captura deck + métricas de proceso
    judge.ts             # invoca `claude -p` con la rúbrica → JSON; parsing + retry
    deterministic.ts     # checks sin LLM
    langfuse.ts          # cliente REST: upsert dataset, crear run, postear scores
    types.ts
  results/               # (gitignored) dumps JSON por corrida, respaldo local
  README.md
```

### Flujo de una corrida

Invocación: `npm run eval -- --model claude-sonnet-4-6 --run-name baseline`

```
golden.json ─► upsert Langfuse Dataset
     │
     └─► por cada ítem (concurrencia limitada ~3-4):
           runAgent (API real) ─► deck + proceso(turnos, #search, schema ok, reintentos)
                 │                         │
                 ▼                         ▼
           judge (claude -p, Opus 4.8)   deterministic checks
                 │                         │
                 └────────► scores ───────┘
                                │
                                ▼
                    Langfuse dataset-run-item + scores
```

Comparar modelos = misma invocación con `--model X --run-name Y`. Cada corrida es un
*run* del mismo dataset → la UI de Langfuse los enfrenta lado a lado por ítem.

## Componentes

### `runAgent.ts`
Envuelve el async-generator `runResearchAgent(topic, count)`. Consume todos los
`ProgressEvent` y captura:
- El `done` final (deck: tarjetas + studyDoc).
- Métricas de proceso: nº de turnos, nº de `web_search`, si hubo reintentos por schema
  inválido, si terminó en `error`.
Devuelve `{ deck | null, process, error | null }`. Un fallo del agente no rompe la corrida.

### `deterministic.ts` (sin LLM)
- `schema_valid`: el deck pasa `cardSetSchema` (Zod) → 0/1.
- `count_match`: ¿generó el nº de tarjetas pedido?
- `duplication`: tarjetas casi-duplicadas (similitud de texto normalizado) → penalización.
- `atomicity_heuristic`: proxy por longitud / conjunciones, señal barata de no-atomicidad.
- `process`: turnos, #search, reintentos (del runner).

### `judge.ts` (`claude -p`, Opus 4.8)
LLM-as-judge **por tarjeta**, escala 1–5 con anclas explícitas en la rúbrica:
- `factual_accuracy` — respuesta correcta y verificable.
- `clarity` — pregunta/respuesta claras, sin ambigüedad.
- `atomicity` — un solo concepto por tarjeta.
- `relevance` — pertinente al tema.
- `answerability` — la pregunta se responde sin pistas externas.

Juicio **a nivel de deck**: `coverage` (cubre lo importante) y `redundancy`.

Salvaguardas de industria:
- Salida JSON estructurada forzada (`{criterio: {score, reason}}`); 2 reintentos si no parsea.
- Anclas por score en la rúbrica (qué es 1 vs 5) para reducir varianza.
- `temperature 0` en el juez para reproducibilidad.
- Reference-free: el juez recibe la tarjeta + el tema, **no** el razonamiento del agente
  (evita el sesgo de "se esforzó").

### `langfuse.ts`
Cliente REST contra Langfuse self-hosted (`:3001`), auth con `LANGFUSE_*` de `.env`:
- Upsert del dataset (idempotente por `topic`).
- Crear dataset run con metadata (modelo, fecha, git SHA, versión de rúbrica).
- Postear scores por ítem y por criterio, cada uno con su `comment` (justificación del juez).

## Manejo de errores

- `runAgent` falla → ítem marcado `agent_error`, se registra y se continúa.
- `claude -p` no devuelve JSON válido → 2 reintentos ("solo JSON"); si persiste, score
  `null` + flag `judge_failed` (auditable; no se inventa número).
- Concurrencia limitada (~3-4 ítems) para no saturar API ni CLI.
- Idempotencia: dataset upsert por `topic`; re-correr no duplica ítems.

## Comparación de modelos (rigor)

- Cada modelo = un *run* nombrado sobre el **mismo** dataset → comparación pareada por ítem.
- Se reporta media + desviación por criterio, y un resumen en consola (tabla modelo×criterio).
- `--repeat N`: repetir el juicio N veces y promediar para reducir ruido del juez.
  Por defecto 1; subible cuando la decisión importe.

## Reproducibilidad

- Golden set, rúbrica y código versionados en git.
- `temperature 0` en el juez.
- Cada run guarda metadata (modelo, fecha, git SHA, versión de rúbrica) en Langfuse y en
  `results/`.

## Pruebas del propio harness

- Unit tests (vitest) para `deterministic.ts` (duplicados, atomicidad) y para el parser
  de `judge.ts` (JSON bien/mal formado → comportamiento correcto).
- `--dry-run`: deck fijo de fixtures + juez mock → valida el pipeline sin gastar API ni CLI.
- No se testea el juicio del LLM en sí (no determinista); sí su integración (parsing,
  agregación, subida de scores).

## Fuera de alcance (YAGNI)

- Integración en CI (se corre local por ahora).
- Fine-tuning o auto-mejora de prompts a partir del eval.
- Evaluación pareada (A/B) entre modelos en una sola llamada del juez; se usa pointwise +
  comparación de runs, suficiente para la decisión.
