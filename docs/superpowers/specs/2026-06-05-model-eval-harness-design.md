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
    golden.json          # set curado versionado (ver "Formato del dataset")
    edge-cases.json      # casos límite (ambiguos, nicho, multirespuesta)
    fixtures/            # decks malos conocidos (negative controls) para test del harness
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

## Formato del dataset

Cada ítem tiene un `id` explícito y estable (clave de idempotencia — **no** el `topic`,
que puede repetirse con distinto `count`/`tags`). Campos de referencia opcionales que
enriquecen la evaluación de factualidad y cobertura sin obligar a curarlos para todos:

```ts
type EvalItem = {
  id: string;                 // p.ej. "python-generators-basic-001"
  topic: string;
  count: number;
  tags: string[];
  notes?: string;
  difficulty?: "basic" | "intermediate" | "advanced";
  expectedCoverage?: string[]; // sub-temas que un buen deck debería cubrir
  referenceFacts?: string[];   // hechos curados para anclar factual_accuracy
};
```

Solo los ítems más importantes necesitan `referenceFacts`/`expectedCoverage`.

## Componentes

### `runAgent.ts`
Envuelve el async-generator `runResearchAgent(topic, count)`. Consume todos los
`ProgressEvent` y captura:
- El `done` final (deck: tarjetas + studyDoc).
- Métricas de proceso: nº de turnos, nº de `web_search`, si hubo reintentos por schema
  inválido, si terminó en `error`.
Devuelve `{ deck | null, process, error | null }`. Un fallo del agente no rompe la corrida.

### `deterministic.ts` (sin LLM)
Actúan como **guardrails**, no como el juicio principal.
- `schema_valid`: el deck pasa `cardSetSchema` (Zod) → 0/1.
- `count`: numérico, no booleano. Reporta `count_requested`, `count_generated`,
  `count_delta`, `count_ratio` y `count_match` (0/1). Distingue déficit vs exceso.
- `duplication`: dos capas sobre texto normalizado, con `threshold` configurable:
  - `near_duplicate_text`: similitud(front + back) > threshold.
  - `same_question_different_answer` y `different_question_same_answer` (frecuentes en
    flashcards: misma respuesta para preguntas distintas, o pregunta reformulada).
- `atomicity_heuristic`: **señal auxiliar**, no score fuerte. Devuelve
  `{ flag: boolean, reasons: string[] }` (p.ej. conjunciones, longitud). No afecta el
  score final por sí solo; sirve para priorizar revisión y contrastar con el juez.
- `process`: turnos, #search, reintentos (del runner).

### `judge.ts` (`claude -p`, Opus 4.8)
LLM-as-judge **por tarjeta**, escala 1–5 con anclas explícitas en la rúbrica. Cada
criterio devuelve `{ score, reason, confidence: "low"|"medium"|"high" }`:
- `factual_accuracy` — correcta y verificable. **Con referencia**: si el ítem tiene
  `referenceFacts`, se evalúa contra ellas. **Sin referencia**: se evalúa como
  `factual_plausibility` (conocimiento interno del juez) y se fuerza `confidence` ≤ medium,
  marcando el score como menos confiable. La distinción queda registrada en el score.
- `clarity` — pregunta/respuesta claras, sin ambigüedad.
- `atomicity` — un solo concepto por tarjeta.
- `relevance` — pertinente al tema.
- `answerability` — la pregunta se responde sin pistas externas.
- `retrieval_value` — ¿entrena recuerdo activo o es superficial/trivial?
- `front_back_fit` — ¿la respuesta responde exactamente lo que pregunta el frente?

Criterio auxiliar de respuesta: `minimal_answer` (¿la respuesta es suficientemente corta
y directa para una flashcard, no un párrafo?).

Juicio **a nivel de deck**: `coverage` (cubre lo importante; usa `expectedCoverage` si
existe), `redundancy`, y opcionales `difficulty_balance` y `progression` (básico→avanzado).

Salvaguardas de industria:
- Salida JSON estructurada forzada; 2 reintentos si no parsea.
- Anclas por score en la rúbrica (qué es 1 vs 5) para reducir varianza.
- `temperature 0` en el juez para reproducibilidad.
- `confidence` por criterio para ponderar/auditar (clave en factualidad sin referencia).
- Reference-free para `clarity`/`atomicity`/`relevance`/`answerability`/`retrieval_value`/
  `front_back_fit`: el juez recibe la tarjeta + el tema, **no** el razonamiento del agente
  (evita el sesgo de "se esforzó"). `factual_accuracy` sí usa `referenceFacts` cuando hay.

### `langfuse.ts`
Cliente REST contra Langfuse self-hosted (`:3001`), auth con `LANGFUSE_*` de `.env`:
- Upsert del dataset (idempotente por **`id`**, no por `topic`).
- Crear dataset run con metadata (modelo, fecha, git SHA, versión de rúbrica, **provenance
  del juez**: provider `claude-cli`, modelo `opus-4.8`, `cliVersion`, `temperature`).
- Postear scores por ítem y por criterio, cada uno con su `comment` (justificación) y el
  `confidence` del juez.

## Manejo de errores

- `runAgent` falla → ítem marcado `agent_error`, se registra y se continúa.
- `claude -p` no devuelve JSON válido → 2 reintentos ("solo JSON"); si persiste, score
  `null` + flag `judge_failed` (auditable; no se inventa número).
- Cuando `claude -p` falla: se captura `exit code` y `stderr` en el artefacto del ítem.
- Concurrencia limitada (~3-4 ítems) para no saturar API ni CLI.
- Idempotencia: dataset upsert por **`id`**; re-correr no duplica ítems.

## Agregación y score final

Se reportan **siempre** los scores por criterio (la inspección por dimensión es lo
primario). Además se calcula un `overall_score` explícito por ítem y por run, para
responder "¿cuál modelo elegimos?". Pesos versionados junto a la rúbrica (ajustables):

```
overall_score =
    0.30 * factual_accuracy
  + 0.20 * atomicity
  + 0.15 * clarity
  + 0.15 * retrieval_value
  + 0.10 * coverage
  + 0.05 * answerability
  - 0.05 * redundancy_penalty
```

El `overall_score` **no** reemplaza la inspección por criterio; es una ayuda de decisión.
Scores con `confidence: low` (p.ej. factualidad sin referencia) se marcan en el reporte.

## Comparación de modelos (rigor)

- Cada modelo = un *run* nombrado sobre el **mismo** dataset → comparación pareada por ítem.
- Se reporta media + desviación por criterio, `overall_score`, y un resumen en consola
  (tabla modelo×criterio).
- `--repeat N`: repetir el juicio N veces y promediar para reducir ruido del juez.
  Por defecto 1; subible cuando la decisión importe.

## Artefactos crudos (auditoría)

Por cada ítem y run, en `results/<run-name>/<item-id>.json`, se guarda todo lo necesario
para responder "¿por qué este modelo perdió?":
- input del agente (topic, count, ítem completo), eventos del agente, deck final.
- raw judge prompt, raw judge output (stdout), parsed judge output, `exitCode`/`stderr`.
- resultados deterministas.
- bloque `judge` con provenance: `provider`, `model`, `temperature`, `rubricVersion`,
  `cliVersion`, `rawOutputPath`.

## Reproducibilidad

- Golden set, rúbrica y código versionados en git.
- `temperature 0` en el juez.
- Cada run guarda metadata (modelo, fecha, git SHA, versión de rúbrica) en Langfuse y en
  `results/`.

## Pruebas del propio harness

- Unit tests (vitest) para `deterministic.ts` (duplicados en sus dos capas, count_delta,
  atomicity flag) y para el parser de `judge.ts` (JSON bien/mal formado → comportamiento).
- `--dry-run`: deck fijo de fixtures + juez mock → valida el pipeline sin gastar API ni CLI.
- **Negative controls** (`dataset/fixtures/`): decks malos conocidos —con duplicados,
  respuestas demasiado largas, tarjetas no atómicas, errores factuales, schema inválido,
  déficit de tarjetas— para verificar que el harness **detecta** los problemas, no solo
  que corre.
- No se testea el juicio del LLM en sí (no determinista); sí su integración (parsing,
  agregación, subida de scores).

## Fuera de alcance (YAGNI)

- Integración en CI (se corre local por ahora).
- Fine-tuning o auto-mejora de prompts a partir del eval.
- Evaluación pareada (A/B) entre modelos en una sola llamada del juez. **Futuro posible**:
  añadirla como desempate cuando dos modelos tengan `overall_score` pointwise muy cercanos
  (el pointwise puede no ser suficientemente sensible en decisiones finas).
