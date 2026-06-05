# Eval Harness — Agente de investigación

Evalúa la calidad de las tarjetas y el comportamiento del agente, y compara modelos.
- **Generación:** agente real (`runResearchAgent`) vía API Anthropic.
- **Juez:** `claude -p` con Opus 4.8 (LLM-as-judge) — no gasta tokens de plataforma.
- **Backend:** Langfuse (datasets/runs/scores) en http://localhost:3001.

## Requisitos
- `ANTHROPIC_API_KEY` en `.env` (generación).
- `claude` CLI logueado (juez).
- Langfuse arriba: `npm run obs:langfuse:up`; crea proyecto en la UI, copia las llaves a
  `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` / `LANGFUSE_HOST` en `.env`.

## Uso
```bash
# Baseline con el modelo actual:
npm run eval -- --model claude-sonnet-4-6 --run-name baseline

# Comparar otro modelo (mismo dataset => comparación lado a lado en Langfuse):
npm run eval -- --model claude-opus-4-8 --run-name opus-candidate

# Smoke test sin Langfuse (juez mock):
npm run eval -- --dry-run --run-name smoke

# Reintentos del juez (toma el primer juicio válido):
npm run eval -- --model claude-sonnet-4-6 --run-name baseline --repeat 3
```

## Flags
- `--model <id>`: modelo del agente bajo prueba.
- `--run-name <name>`: nombre del run en Langfuse.
- `--repeat <n>`: nº máximo de intentos del juez por tarjeta; toma el primer juicio
  válido (reintenta si el JSON no parsea). Default 1. (No promedia aún — ver Limitaciones.)
- `--concurrency <n>`: ítems en paralelo (default 3).
- `--dry-run`: juez mock, no sube a Langfuse.
- `EVAL_JUDGE_MODEL` (env): modelo del juez (default `claude-opus-4-8`).

## Qué se mide
- **Deterministas** (`deterministic.ts`): schema, count, duplicación (3 capas), atomicidad.
- **Juez** (`judge.ts`): 8 criterios por tarjeta + cobertura/redundancia por deck, con `confidence`.
- **overall_score** (`aggregate.ts`): combinación ponderada (pesos en `rubric/weights.json`).

## Artefactos
`eval/results/<run-name>/<item-id>.json` — input del agente, eventos, deck, raw judge
output, scores, provenance del juez (modelo, cliVersion, rubricVersion). Gitignored.

## Limitaciones conocidas
- El `claude` CLI no expone `--temperature`; la reproducibilidad del juez se apoya en
  prompt determinista + `--repeat` para promediar. `temperature: 0` se registra como
  intención en la provenance.
- `schemaRetries` del agente no está expuesto por el generador todavía (queda en 0).
- `--repeat` actualmente toma el **primer juicio válido**, no promedia N juicios. El
  promedio para reducir varianza queda como extensión (el código está preparado para ello).
