# Eval Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir un harness de evaluación que corre el agente real (`runResearchAgent`) vía API, juzga la calidad de las tarjetas con `claude -p` (Opus 4.8) y checks deterministas, y publica datasets/runs/scores en Langfuse para comparar modelos.

**Architecture:** Script `tsx` orquestador (`eval/src/runDataset.ts`) que, por cada ítem de un golden set versionado, ejecuta el agente (API real), aplica checks deterministas (sin LLM) y un juez LLM-as-judge (CLI), agrega un `overall_score`, guarda artefactos crudos en `results/`, y sube dataset-items + run-items + scores a Langfuse. La lógica pura (deterministic, parser del juez, agregación) se desarrolla con TDD; los módulos de I/O se validan con un modo `--dry-run` con juez mock.

**Tech Stack:** TypeScript + tsx, Vitest, Zod (ya presente), `@anthropic-ai/sdk` (ya presente), `langfuse` SDK (nuevo), `claude` CLI v2.1.165, `dotenv`.

---

## File Structure

```
eval/
  dataset/
    golden.json          # set curado (EvalItem[])
    edge-cases.json      # casos límite (EvalItem[])
    fixtures/
      bad-decks.json     # decks malos conocidos (negative controls)
  rubric/
    card-quality.md      # rúbrica del juez (texto, versionada)
    weights.json         # pesos del overall_score (versionados)
  src/
    types.ts             # tipos compartidos (EvalItem, scores, resultados)
    deterministic.ts     # checks sin LLM (PURO, testeado)
    deterministic.test.ts
    judge.ts             # prompt + parser + runner del juez CLI
    judge.test.ts        # tests del parser (PURO)
    aggregate.ts         # overall_score + agregación de run (PURO, testeado)
    aggregate.test.ts
    runAgent.ts          # envuelve runResearchAgent (API real)
    langfuse.ts          # cliente Langfuse (dataset/run/scores)
    runDataset.ts        # orquestador + CLI
  results/               # (gitignored) artefactos crudos por run
  README.md
```

Decomposición: la lógica pura (`deterministic`, `judge` parser, `aggregate`) vive separada de la I/O (`runAgent`, `langfuse`, `runDataset`) para poder testearla sin API/CLI/red.

---

## Task 0: Tooling y scaffold

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`
- Modify: `.env.example`
- Create: `eval/.gitkeep`

- [ ] **Step 1: Instalar dependencias de dev**

Run:
```bash
npm install --save-dev tsx dotenv && npm install langfuse
```
Expected: instala `tsx`, `dotenv` (devDeps) y `langfuse` (dep). Sin errores.

- [ ] **Step 2: Añadir el script `eval` a `package.json`**

En `package.json`, dentro de `"scripts"`, después de la línea `"test": "vitest run",` añade:

```json
    "eval": "tsx eval/src/runDataset.ts",
```

- [ ] **Step 3: Ignorar artefactos de results en git**

Añade al final de `.gitignore`:

```
# Eval harness raw artifacts
eval/results/
```

- [ ] **Step 4: Documentar las llaves de Langfuse en `.env.example`**

En `.env.example`, debajo del bloque existente `LANGFUSE_OTEL_AUTH=`, añade:

```
# --- Langfuse API (para el eval harness) ---
# Llaves del proyecto creadas en la UI de Langfuse (http://localhost:3001):
LANGFUSE_HOST=http://localhost:3001
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=
# Modelo del juez (claude CLI) para el eval:
EVAL_JUDGE_MODEL=claude-opus-4-8
```

- [ ] **Step 5: Crear carpeta eval con placeholder**

Run:
```bash
mkdir -p eval/src eval/dataset/fixtures eval/rubric eval/results && touch eval/.gitkeep
```

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .gitignore .env.example eval/.gitkeep
git commit -m "chore(eval): tooling y scaffold del harness de eval"
```

---

## Task 1: Tipos compartidos

**Files:**
- Create: `eval/src/types.ts`

- [ ] **Step 1: Escribir `types.ts`**

```ts
import type { GeneratedCard, GeneratedCardSet } from "../../lib/agent/schema";

export type { GeneratedCard, GeneratedCardSet };

/** Un ítem del dataset de evaluación. `id` es la clave de idempotencia. */
export type EvalItem = {
  id: string;
  topic: string;
  count: number;
  tags: string[];
  notes?: string;
  difficulty?: "basic" | "intermediate" | "advanced";
  expectedCoverage?: string[];
  referenceFacts?: string[];
};

/** Métricas de proceso capturadas mientras corre el agente. */
export type ProcessMetrics = {
  turns: number;
  searches: number;
  schemaRetries: number;
  endedInError: boolean;
};

/** Resultado de ejecutar el agente sobre un ítem. */
export type AgentRunResult = {
  deck: GeneratedCardSet | null;
  studyDoc: string | null;
  process: ProcessMetrics;
  error: string | null;
  events: unknown[];
};

/** Resultado de los checks deterministas. */
export type DeterministicResult = {
  schemaValid: boolean;
  count: {
    requested: number;
    generated: number;
    delta: number;
    ratio: number;
    match: 0 | 1;
  };
  duplication: {
    nearDuplicatePairs: Array<[number, number]>;
    sameQuestionDifferentAnswer: Array<[number, number]>;
    differentQuestionSameAnswer: Array<[number, number]>;
  };
  atomicity: Array<{ index: number; flag: boolean; reasons: string[] }>;
};

export type Confidence = "low" | "medium" | "high";

export type CriterionScore = {
  score: number; // 1-5
  reason: string;
  confidence: Confidence;
};

/** Criterios por tarjeta que devuelve el juez. */
export type CardJudgement = {
  factual_accuracy: CriterionScore;
  clarity: CriterionScore;
  atomicity: CriterionScore;
  relevance: CriterionScore;
  answerability: CriterionScore;
  retrieval_value: CriterionScore;
  front_back_fit: CriterionScore;
  minimal_answer: CriterionScore;
};

/** Criterios a nivel de deck. */
export type DeckJudgement = {
  coverage: CriterionScore;
  redundancy: CriterionScore;
  difficulty_balance?: CriterionScore;
  progression?: CriterionScore;
};

export type JudgeProvenance = {
  provider: "claude-cli" | "mock";
  model: string;
  temperature: number;
  rubricVersion: string;
  cliVersion: string;
  rawOutputPath?: string;
};
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: PASS (sin errores nuevos en `eval/src/types.ts`).

- [ ] **Step 3: Commit**

```bash
git add eval/src/types.ts
git commit -m "feat(eval): tipos compartidos del harness"
```

---

## Task 2: Hacer el modelo configurable en el agente

El agente fija el modelo en una `const`. El eval necesita inyectarlo para comparar modelos.

**Files:**
- Modify: `lib/agent/researchAgent.ts:17` y `:71-74` y `:123`

- [ ] **Step 1: Añadir parámetro `model` opcional a la firma**

En `lib/agent/researchAgent.ts`, reemplaza la firma de la función:

```ts
export async function* runResearchAgent(
  topic: string,
  count?: number
): AsyncGenerator<ProgressEvent> {
```

por:

```ts
export async function* runResearchAgent(
  topic: string,
  count?: number,
  modelOverride?: string
): AsyncGenerator<ProgressEvent> {
  const model = modelOverride ?? MODEL;
```

- [ ] **Step 2: Usar `model` en la llamada a la API**

En la misma función, en la llamada `client.messages.create({ model: MODEL, ... })` (≈línea 123), cambia `model: MODEL,` por `model,`.

- [ ] **Step 3: Verificar que compila y los tests existentes pasan**

Run: `npx tsc --noEmit && npm test`
Expected: PASS. El comportamiento por defecto no cambia (sin `modelOverride` usa `MODEL`).

- [ ] **Step 4: Commit**

```bash
git add lib/agent/researchAgent.ts
git commit -m "feat(agent): permitir override de modelo en runResearchAgent"
```

---

## Task 3: Checks deterministas (TDD)

**Files:**
- Create: `eval/src/deterministic.ts`
- Test: `eval/src/deterministic.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

```ts
import { describe, it, expect } from "vitest";
import {
  normalizeText,
  similarity,
  countMetrics,
  detectDuplication,
  atomicityHeuristic,
} from "./deterministic";
import type { GeneratedCard } from "./types";

const card = (front: string, back: string): GeneratedCard => ({
  front,
  back,
  source: "https://example.com",
});

describe("normalizeText", () => {
  it("lowercases, strips punctuation and collapses whitespace", () => {
    expect(normalizeText("  Hola, MUNDO!!  ")).toBe("hola mundo");
  });
});

describe("similarity", () => {
  it("is 1 for identical normalized strings", () => {
    expect(similarity("a b c", "a b c")).toBe(1);
  });
  it("is 0 for fully disjoint strings", () => {
    expect(similarity("a b", "c d")).toBe(0);
  });
});

describe("countMetrics", () => {
  it("reports delta, ratio and match for a deficit", () => {
    expect(countMetrics(10, 9)).toEqual({
      requested: 10,
      generated: 9,
      delta: -1,
      ratio: 0.9,
      match: 0,
    });
  });
  it("match is 1 only when generated equals requested", () => {
    expect(countMetrics(10, 10).match).toBe(1);
    expect(countMetrics(10, 25).match).toBe(0);
  });
});

describe("detectDuplication", () => {
  it("flags near-duplicate front+back pairs", () => {
    const cards = [
      card("What is a closure?", "A function with captured scope."),
      card("What is a closure?", "A function with captured scope."),
    ];
    const r = detectDuplication(cards, 0.8);
    expect(r.nearDuplicatePairs).toContainEqual([0, 1]);
  });
  it("flags same question with different answer", () => {
    const cards = [
      card("Define X", "answer one alpha beta"),
      card("Define X", "totally different gamma delta"),
    ];
    const r = detectDuplication(cards, 0.8);
    expect(r.sameQuestionDifferentAnswer).toContainEqual([0, 1]);
  });
  it("flags different question with same answer", () => {
    const cards = [
      card("Question alpha beta", "Paris is the capital"),
      card("Totally other gamma delta", "Paris is the capital"),
    ];
    const r = detectDuplication(cards, 0.8);
    expect(r.differentQuestionSameAnswer).toContainEqual([0, 1]);
  });
});

describe("atomicityHeuristic", () => {
  it("flags long answers with multiple conjunctions", () => {
    const long = "uno y dos y tres y cuatro y cinco y seis y siete y ocho mas nueve";
    const r = atomicityHeuristic(card("Q?", long));
    expect(r.flag).toBe(true);
    expect(r.reasons.length).toBeGreaterThan(0);
  });
  it("does not flag a short single-concept answer", () => {
    const r = atomicityHeuristic(card("Capital de Francia?", "París"));
    expect(r.flag).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar para ver el fallo**

Run: `npx vitest run eval/src/deterministic.test.ts`
Expected: FAIL — "Cannot find module './deterministic'".

- [ ] **Step 3: Implementar `deterministic.ts`**

```ts
import { cardSetSchema } from "../../lib/agent/schema";
import type {
  DeterministicResult,
  GeneratedCard,
  GeneratedCardSet,
} from "./types";

/** Minúsculas, sin puntuación, espacios colapsados. */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Similitud Jaccard sobre tokens del texto normalizado (0..1). */
export function similarity(a: string, b: string): number {
  const ta = new Set(normalizeText(a).split(" ").filter(Boolean));
  const tb = new Set(normalizeText(b).split(" ").filter(Boolean));
  if (ta.size === 0 && tb.size === 0) return 1;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function countMetrics(
  requested: number,
  generated: number
): DeterministicResult["count"] {
  const delta = generated - requested;
  const ratio = requested === 0 ? 0 : generated / requested;
  return {
    requested,
    generated,
    delta,
    ratio,
    match: delta === 0 ? 1 : 0,
  };
}

export function detectDuplication(
  cards: GeneratedCard[],
  threshold: number
): DeterministicResult["duplication"] {
  const nearDuplicatePairs: Array<[number, number]> = [];
  const sameQuestionDifferentAnswer: Array<[number, number]> = [];
  const differentQuestionSameAnswer: Array<[number, number]> = [];
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      const qSim = similarity(cards[i].front, cards[j].front);
      const aSim = similarity(cards[i].back, cards[j].back);
      const bothSim = similarity(
        `${cards[i].front} ${cards[i].back}`,
        `${cards[j].front} ${cards[j].back}`
      );
      if (bothSim >= threshold) nearDuplicatePairs.push([i, j]);
      if (qSim >= threshold && aSim < threshold)
        sameQuestionDifferentAnswer.push([i, j]);
      if (qSim < threshold && aSim >= threshold)
        differentQuestionSameAnswer.push([i, j]);
    }
  }
  return {
    nearDuplicatePairs,
    sameQuestionDifferentAnswer,
    differentQuestionSameAnswer,
  };
}

const CONJ = /\b(y|e|o|u|and|or|así como|además|también)\b/giu;

/** Señal auxiliar de no-atomicidad. NO es un score fuerte. */
export function atomicityHeuristic(card: GeneratedCard): {
  flag: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  const words = normalizeText(card.back).split(" ").filter(Boolean).length;
  const conjunctions = (card.back.match(CONJ) ?? []).length;
  if (words > 25) reasons.push(`respuesta larga (${words} palabras)`);
  if (conjunctions >= 3)
    reasons.push(`muchas conjunciones (${conjunctions})`);
  // Solo se marca si AMBAS señales coinciden (longitud + conjunciones),
  // para no castigar relaciones legítimas tipo "X e Y".
  const flag = reasons.length >= 2;
  return { flag, reasons };
}

/** Aplica todos los checks deterministas a un deck. */
export function runDeterministic(
  deck: GeneratedCardSet | null,
  requestedCount: number,
  threshold = 0.8
): DeterministicResult {
  const parsed = deck ? cardSetSchema.safeParse(deck) : { success: false as const };
  const cards = deck?.cards ?? [];
  return {
    schemaValid: parsed.success,
    count: countMetrics(requestedCount, cards.length),
    duplication: detectDuplication(cards, threshold),
    atomicity: cards.map((c, index) => ({
      index,
      ...atomicityHeuristic(c),
    })),
  };
}
```

- [ ] **Step 4: Ejecutar los tests**

Run: `npx vitest run eval/src/deterministic.test.ts`
Expected: PASS (todos verdes).

- [ ] **Step 5: Commit**

```bash
git add eval/src/deterministic.ts eval/src/deterministic.test.ts
git commit -m "feat(eval): checks deterministas con tests"
```

---

## Task 4: Rúbrica + pesos

**Files:**
- Create: `eval/rubric/card-quality.md`
- Create: `eval/rubric/weights.json`

- [ ] **Step 1: Escribir la rúbrica**

Crea `eval/rubric/card-quality.md`:

```markdown
# Rúbrica de calidad de flashcards — v2026-06-05

Eres un evaluador experto de tarjetas de estudio (flashcards). Evalúas UNA tarjeta
a la vez sobre un tema dado. Devuelve SOLO JSON válido, sin texto adicional.

Para cada criterio da: `score` (entero 1-5), `reason` (1 frase), `confidence`
(`low` | `medium` | `high`).

## Criterios por tarjeta

- **factual_accuracy**: ¿La respuesta es correcta y verificable?
  Si se te dan `referenceFacts`, evalúa CONTRA ellas. Si NO hay referencia, evalúa
  plausibilidad con tu conocimiento y usa `confidence` ≤ medium.
  - 1: claramente falsa. 3: parcialmente correcta o imprecisa. 5: correcta y precisa.
- **clarity**: ¿Pregunta y respuesta claras, sin ambigüedad? 1: confusa. 5: cristalina.
- **atomicity**: ¿Un solo concepto por tarjeta? 1: multi-concepto. 5: atómica.
- **relevance**: ¿Pertinente al tema? 1: irrelevante. 5: central.
- **answerability**: ¿La pregunta se responde sin pistas externas? 1: no. 5: sí.
- **retrieval_value**: ¿Entrena recuerdo activo o es trivial/superficial?
  1: trivial. 5: alto valor de recuerdo.
- **front_back_fit**: ¿La respuesta responde EXACTAMENTE lo que pregunta el frente?
  1: desalineada. 5: encaja perfecto.
- **minimal_answer**: ¿La respuesta es corta y directa (no un párrafo)? 1: párrafo. 5: mínima.

## Formato de salida (tarjeta)

{
  "factual_accuracy": {"score": 1-5, "reason": "...", "confidence": "low|medium|high"},
  "clarity": {...}, "atomicity": {...}, "relevance": {...},
  "answerability": {...}, "retrieval_value": {...},
  "front_back_fit": {...}, "minimal_answer": {...}
}

## Criterios por deck

- **coverage**: ¿Cubre lo importante del tema? Si hay `expectedCoverage`, contrasta con ella.
- **redundancy**: ¿Hay tarjetas redundantes? 5 = sin redundancia.
- **difficulty_balance** (opcional): ¿Mezcla básico/intermedio/avanzado?
- **progression** (opcional): ¿Ordena de básico a avanzado?

## Formato de salida (deck)

{
  "coverage": {...}, "redundancy": {...},
  "difficulty_balance": {...}, "progression": {...}
}
```

- [ ] **Step 2: Escribir los pesos del overall_score**

Crea `eval/rubric/weights.json`:

```json
{
  "version": "2026-06-05",
  "card": {
    "factual_accuracy": 0.30,
    "atomicity": 0.20,
    "clarity": 0.15,
    "retrieval_value": 0.15,
    "answerability": 0.05
  },
  "deck": {
    "coverage": 0.10,
    "redundancy_penalty": 0.05
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add eval/rubric/card-quality.md eval/rubric/weights.json
git commit -m "feat(eval): rúbrica del juez y pesos del overall_score"
```

---

## Task 5: Parser del juez (TDD)

El parser es lógica pura: extrae y valida el JSON del juez. El *runner* del CLI se añade después y se mantiene separado para poder mockearlo.

**Files:**
- Create: `eval/src/judge.ts`
- Test: `eval/src/judge.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

```ts
import { describe, it, expect } from "vitest";
import { parseCardJudgement, extractJson } from "./judge";

const validCard = {
  factual_accuracy: { score: 5, reason: "ok", confidence: "high" },
  clarity: { score: 4, reason: "ok", confidence: "high" },
  atomicity: { score: 4, reason: "ok", confidence: "medium" },
  relevance: { score: 5, reason: "ok", confidence: "high" },
  answerability: { score: 5, reason: "ok", confidence: "high" },
  retrieval_value: { score: 4, reason: "ok", confidence: "medium" },
  front_back_fit: { score: 5, reason: "ok", confidence: "high" },
  minimal_answer: { score: 5, reason: "ok", confidence: "high" },
};

describe("extractJson", () => {
  it("extracts a JSON object wrapped in prose/code fences", () => {
    const raw = "Aquí está:\n```json\n{\"a\":1}\n```\nfin";
    expect(extractJson(raw)).toEqual({ a: 1 });
  });
  it("throws on text without any JSON object", () => {
    expect(() => extractJson("no json here")).toThrow();
  });
});

describe("parseCardJudgement", () => {
  it("parses a valid card judgement", () => {
    const r = parseCardJudgement(JSON.stringify(validCard));
    expect(r.factual_accuracy.score).toBe(5);
  });
  it("throws when a criterion is missing", () => {
    const { clarity, ...rest } = validCard;
    expect(() => parseCardJudgement(JSON.stringify(rest))).toThrow();
  });
  it("throws when a score is out of range", () => {
    const bad = { ...validCard, clarity: { score: 9, reason: "x", confidence: "high" } };
    expect(() => parseCardJudgement(JSON.stringify(bad))).toThrow();
  });
});
```

- [ ] **Step 2: Ejecutar para ver el fallo**

Run: `npx vitest run eval/src/judge.test.ts`
Expected: FAIL — "Cannot find module './judge'".

- [ ] **Step 3: Implementar `judge.ts` (prompt + parser + runner)**

```ts
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
```

- [ ] **Step 4: Ejecutar los tests**

Run: `npx vitest run eval/src/judge.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add eval/src/judge.ts eval/src/judge.test.ts
git commit -m "feat(eval): juez LLM-as-judge (prompt, parser, runner CLI) con tests"
```

---

## Task 6: Agregación y overall_score (TDD)

**Files:**
- Create: `eval/src/aggregate.ts`
- Test: `eval/src/aggregate.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

```ts
import { describe, it, expect } from "vitest";
import { overallScore, meanStd } from "./aggregate";
import type { CardJudgement, DeckJudgement } from "./types";

const c = (score: number): { score: number; reason: string; confidence: "high" } => ({
  score,
  reason: "x",
  confidence: "high",
});

const cardJ: CardJudgement = {
  factual_accuracy: c(5),
  clarity: c(5),
  atomicity: c(5),
  relevance: c(5),
  answerability: c(5),
  retrieval_value: c(5),
  front_back_fit: c(5),
  minimal_answer: c(5),
};

const deckJ: DeckJudgement = {
  coverage: c(5),
  redundancy: c(5),
};

describe("overallScore", () => {
  it("returns 5 when every weighted criterion is maxed and no redundancy penalty", () => {
    // redundancy 5 => penalty 0; pesos suman 0.95 sobre escala 5 => normalizado a 5
    expect(overallScore(cardJ, deckJ)).toBeCloseTo(5, 5);
  });
  it("drops when redundancy is poor", () => {
    const bad: DeckJudgement = { ...deckJ, redundancy: c(1) };
    expect(overallScore(cardJ, bad)).toBeLessThan(overallScore(cardJ, deckJ));
  });
});

describe("meanStd", () => {
  it("computes mean and population std", () => {
    expect(meanStd([2, 4])).toEqual({ mean: 3, std: 1 });
  });
  it("handles empty arrays", () => {
    expect(meanStd([])).toEqual({ mean: 0, std: 0 });
  });
});
```

- [ ] **Step 2: Ejecutar para ver el fallo**

Run: `npx vitest run eval/src/aggregate.test.ts`
Expected: FAIL — "Cannot find module './aggregate'".

- [ ] **Step 3: Implementar `aggregate.ts`**

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CardJudgement, DeckJudgement } from "./types";

type Weights = {
  version: string;
  card: Record<string, number>;
  deck: { coverage: number; redundancy_penalty: number };
};

export const WEIGHTS: Weights = JSON.parse(
  readFileSync(join(process.cwd(), "eval/rubric/weights.json"), "utf8")
);

/**
 * overall_score (escala 1-5). Combina criterios ponderados de tarjeta + deck,
 * restando una penalización por redundancia. Normaliza por la suma de pesos
 * positivos para mantener la escala original.
 */
export function overallScore(card: CardJudgement, deck: DeckJudgement): number {
  const cw = WEIGHTS.card;
  let weighted = 0;
  let posWeight = 0;
  for (const [k, w] of Object.entries(cw)) {
    weighted += w * (card as Record<string, { score: number }>)[k].score;
    posWeight += w;
  }
  weighted += WEIGHTS.deck.coverage * deck.coverage.score;
  posWeight += WEIGHTS.deck.coverage;

  // redundancy: score alto = bueno; la penalización crece cuando el score baja.
  const redundancyPenalty =
    WEIGHTS.deck.redundancy_penalty * (5 - deck.redundancy.score);

  return (weighted - redundancyPenalty) / posWeight;
}

export function meanStd(xs: number[]): { mean: number; std: number } {
  if (xs.length === 0) return { mean: 0, std: 0 };
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const variance =
    xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
  return { mean, std: Math.sqrt(variance) };
}

/** Promedia un criterio de tarjeta sobre todas las tarjetas de un ítem. */
export function meanCriterion(
  cards: CardJudgement[],
  key: keyof CardJudgement
): number {
  return meanStd(cards.map((c) => c[key].score)).mean;
}
```

- [ ] **Step 4: Ejecutar los tests**

Run: `npx vitest run eval/src/aggregate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add eval/src/aggregate.ts eval/src/aggregate.test.ts
git commit -m "feat(eval): agregación y overall_score con tests"
```

---

## Task 7: Runner del agente (I/O)

**Files:**
- Create: `eval/src/runAgent.ts`

- [ ] **Step 1: Implementar `runAgent.ts`**

```ts
import { runResearchAgent } from "../../lib/agent/researchAgent";
import type { AgentRunResult, GeneratedCardSet } from "./types";

/**
 * Ejecuta el agente real sobre un ítem y captura el deck + métricas de proceso.
 * Nunca lanza: un fallo del agente se devuelve en `error`.
 */
export async function runAgent(
  topic: string,
  count: number,
  model: string
): Promise<AgentRunResult> {
  const events: unknown[] = [];
  const cards: GeneratedCardSet["cards"] = [];
  let deckName = "";
  let studyDoc: string | null = null;
  let searches = 0;
  let error: string | null = null;
  // El agente itera turnos internamente; contamos 'phase'/'search' como proxy.
  // 'turns' se aproxima por nº de eventos de fase de generación.
  let turns = 0;

  try {
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
      schemaRetries: 0, // el agente reintenta internamente; no expuesto aún
      endedInError: error !== null,
    },
    error,
    events,
  };
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add eval/src/runAgent.ts
git commit -m "feat(eval): runner del agente real con captura de proceso"
```

---

## Task 8: Cliente Langfuse (I/O)

Usa el SDK oficial `langfuse` (REST por debajo): crea/actualiza dataset e items por `id`, liga cada ítem a un trace por run y publica scores.

**Files:**
- Create: `eval/src/langfuse.ts`

- [ ] **Step 1: Implementar `langfuse.ts`**

```ts
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
  value: number;
  comment?: string;
  /** confianza del juez, anexada al comment para auditoría */
  confidence?: string;
};

/**
 * Liga un ítem del dataset a un trace del run y publica sus scores.
 * `provenance` (modelo del juez, cliVersion, rúbrica) va en metadata del trace.
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
  }
): Promise<void> {
  const dataset = await lf.getDataset(DATASET_NAME);
  const datasetItem = dataset.items.find((i) => i.id === args.itemId);
  const trace = lf.trace({
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
      value: s.value,
      comment: s.confidence ? `[${s.confidence}] ${s.comment ?? ""}` : s.comment,
    });
  }
  await lf.flushAsync();
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: PASS. (No requiere red para compilar.)

- [ ] **Step 3: Commit**

```bash
git add eval/src/langfuse.ts
git commit -m "feat(eval): cliente Langfuse (dataset/run-items/scores)"
```

---

## Task 9: Dataset golden + edge cases + fixtures

**Files:**
- Create: `eval/dataset/golden.json`
- Create: `eval/dataset/edge-cases.json`
- Create: `eval/dataset/fixtures/bad-decks.json`

- [ ] **Step 1: Escribir `golden.json` (semilla curada)**

```json
[
  {
    "id": "python-generators-basic-001",
    "topic": "Python generators",
    "count": 8,
    "tags": ["python", "programming", "basic"],
    "difficulty": "basic",
    "notes": "Enfocar en uso práctico de yield.",
    "expectedCoverage": ["yield", "lazy evaluation", "generator expressions", "StopIteration"],
    "referenceFacts": [
      "yield pausa la función y devuelve un valor, reanudando en la siguiente llamada a next().",
      "Los generadores son iteradores perezosos (lazy).",
      "Una generator expression usa paréntesis: (x for x in xs)."
    ]
  },
  {
    "id": "photosynthesis-basic-001",
    "topic": "Photosynthesis",
    "count": 10,
    "tags": ["biology", "science", "basic"],
    "difficulty": "basic",
    "expectedCoverage": ["light reactions", "Calvin cycle", "chlorophyll", "ATP", "CO2"],
    "referenceFacts": [
      "La fotosíntesis convierte CO2 y agua en glucosa y oxígeno usando luz.",
      "Ocurre en los cloroplastos; la clorofila captura la luz.",
      "El ciclo de Calvin no requiere luz directamente (reacciones independientes de la luz)."
    ]
  },
  {
    "id": "french-revolution-inter-001",
    "topic": "Causes of the French Revolution",
    "count": 10,
    "tags": ["history", "intermediate"],
    "difficulty": "intermediate",
    "expectedCoverage": ["fiscal crisis", "Estates-General", "Enlightenment ideas", "bread prices"]
  },
  {
    "id": "http-status-codes-basic-001",
    "topic": "HTTP status codes",
    "count": 12,
    "tags": ["web", "networking", "basic"],
    "difficulty": "basic",
    "referenceFacts": [
      "200 OK indica éxito.",
      "404 Not Found: el recurso no existe.",
      "500 Internal Server Error: fallo del servidor.",
      "301 es redirección permanente; 302 temporal."
    ]
  },
  {
    "id": "big-o-notation-inter-001",
    "topic": "Big-O notation",
    "count": 8,
    "tags": ["cs", "algorithms", "intermediate"],
    "difficulty": "intermediate",
    "expectedCoverage": ["O(1)", "O(n)", "O(log n)", "O(n^2)", "worst case"]
  }
]
```

- [ ] **Step 2: Escribir `edge-cases.json`**

```json
[
  {
    "id": "ambiguous-mercury-001",
    "topic": "Mercury",
    "count": 6,
    "tags": ["ambiguous"],
    "difficulty": "basic",
    "notes": "Tema ambiguo: planeta vs elemento vs dios. Buen deck debería desambiguar o cubrir el más probable."
  },
  {
    "id": "niche-recent-001",
    "topic": "WebGPU compute shaders",
    "count": 6,
    "tags": ["niche", "recent", "web"],
    "difficulty": "advanced",
    "notes": "Tema nicho/reciente: la factualidad sin referencia será de baja confianza."
  },
  {
    "id": "multi-answer-001",
    "topic": "Differences between TCP and UDP",
    "count": 8,
    "tags": ["comparison", "networking"],
    "difficulty": "intermediate",
    "expectedCoverage": ["reliability", "ordering", "connection", "use cases"]
  }
]
```

- [ ] **Step 3: Escribir `fixtures/bad-decks.json` (negative controls)**

```json
{
  "duplicates": {
    "deckName": "Dup deck",
    "cards": [
      { "front": "What is a closure?", "back": "A function with captured scope.", "source": "https://e.com" },
      { "front": "What is a closure?", "back": "A function with captured scope.", "source": "https://e.com" }
    ]
  },
  "longAnswers": {
    "deckName": "Long deck",
    "cards": [
      { "front": "Explain HTTP", "back": "HTTP es un protocolo y además tiene métodos y también códigos de estado y headers y cuerpos y versiones y cookies y caché y conexiones persistentes y mucho más texto largo", "source": "https://e.com" }
    ]
  },
  "deficit": {
    "deckName": "Few deck",
    "cards": [
      { "front": "Q1", "back": "A1", "source": "https://e.com" }
    ]
  },
  "invalidSchema": {
    "deckName": "",
    "cards": []
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add eval/dataset/golden.json eval/dataset/edge-cases.json eval/dataset/fixtures/bad-decks.json
git commit -m "feat(eval): golden set, edge cases y fixtures de control negativo"
```

---

## Task 10: Test de control negativo (detección de problemas)

Verifica que el harness **detecta** decks malos, no solo que corre.

**Files:**
- Create: `eval/src/fixtures.test.ts`

- [ ] **Step 1: Escribir el test**

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runDeterministic } from "./deterministic";
import type { GeneratedCardSet } from "./types";

const bad = JSON.parse(
  readFileSync(join(process.cwd(), "eval/dataset/fixtures/bad-decks.json"), "utf8")
) as Record<string, GeneratedCardSet>;

describe("negative controls", () => {
  it("detecta duplicados", () => {
    const r = runDeterministic(bad.duplicates, 2);
    expect(r.duplication.nearDuplicatePairs.length).toBeGreaterThan(0);
  });
  it("marca respuesta excesivamente larga como no atómica", () => {
    const r = runDeterministic(bad.longAnswers, 1);
    expect(r.atomicity.some((a) => a.flag)).toBe(true);
  });
  it("detecta déficit de tarjetas", () => {
    const r = runDeterministic(bad.deficit, 10);
    expect(r.count.match).toBe(0);
    expect(r.count.delta).toBeLessThan(0);
  });
  it("detecta schema inválido", () => {
    const r = runDeterministic(bad.invalidSchema, 5);
    expect(r.schemaValid).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar**

Run: `npx vitest run eval/src/fixtures.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add eval/src/fixtures.test.ts
git commit -m "test(eval): controles negativos verifican detección de decks malos"
```

---

## Task 11: Orquestador + CLI

**Files:**
- Create: `eval/src/runDataset.ts`

- [ ] **Step 1: Implementar `runDataset.ts`**

```ts
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runAgent } from "./runAgent";
import { runDeterministic } from "./deterministic";
import {
  judgeCard,
  judgeDeck,
  RUBRIC_VERSION,
  type JudgeExec,
} from "./judge";
import { overallScore, meanCriterion, meanStd } from "./aggregate";
import { makeClient, upsertDataset, recordRunItem } from "./langfuse";
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
const RUN_NAME = arg("run-name", `run-${AGENT_MODEL}`)!;
const JUDGE_MODEL = process.env.EVAL_JUDGE_MODEL ?? "claude-opus-4-8";
const REPEAT = Number(arg("repeat", "1"));
const DRY_RUN = hasFlag("dry-run");
const CONCURRENCY = Number(arg("concurrency", "3"));

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
};

async function processItem(item: EvalItem): Promise<ItemSummary> {
  const exec = DRY_RUN ? mockExec : undefined;
  const resultsDir = join(process.cwd(), "eval/results", RUN_NAME);
  mkdirSync(resultsDir, { recursive: true });

  const agentRes = await runAgent(item.topic, item.count, AGENT_MODEL);
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
  const scores: Array<{ name: string; value: number; comment?: string; confidence?: string }> = [];

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

    // overall: usa promedio de tarjetas como "tarjeta representativa"
    const avgCard = Object.fromEntries(
      criteria.map((k) => [k, { score: meanCriterion(cardJudgements, k), reason: "avg", confidence: "medium" }])
    ) as unknown as CardJudgement;
    overall = overallScore(avgCard, deckJudgement);
    scores.push({ name: "overall_score", value: overall });
  }

  // scores deterministas
  scores.push({ name: "schema_valid", value: determ.schemaValid ? 1 : 0 });
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
    });
  }

  return {
    itemId: item.id,
    agentError: agentRes.error,
    judgeFailed,
    overall,
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
  const items = [...golden, ...edge];

  console.log(
    `Eval: model=${AGENT_MODEL} judge=${JUDGE_MODEL} run=${RUN_NAME} ` +
      `items=${items.length} dryRun=${DRY_RUN}`
  );

  if (!DRY_RUN) {
    const lf = makeClient();
    await upsertDataset(lf, items);
    await lf.flushAsync();
  }

  const summaries = await mapPool(items, CONCURRENCY, processItem);

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
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Probar el pipeline completo en dry-run (sin API ni CLI ni Langfuse)**

> Nota: `--dry-run` igualmente ejecuta el agente real (`runAgent`), que llama a la API.
> Para una prueba 100% sin red, comenta temporalmente la llamada o usa un ítem trivial.
> El objetivo de este paso es validar que orquestador + juez mock + artefactos funcionan.

Run: `npm run eval -- --dry-run --run-name smoke --concurrency 1`
Expected: imprime el resumen, crea `eval/results/smoke/<id>.json` por ítem, sin tocar Langfuse.

- [ ] **Step 4: Commit**

```bash
git add eval/src/runDataset.ts
git commit -m "feat(eval): orquestador CLI (dry-run, concurrencia, resumen, Langfuse)"
```

---

## Task 12: README del harness

**Files:**
- Create: `eval/README.md`

- [ ] **Step 1: Escribir `eval/README.md`**

```markdown
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

# Reducir ruido del juez:
npm run eval -- --model claude-sonnet-4-6 --run-name baseline --repeat 3
```

## Flags
- `--model <id>`: modelo del agente bajo prueba.
- `--run-name <name>`: nombre del run en Langfuse.
- `--repeat <n>`: nº de juicios por tarjeta (default 1).
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
```

- [ ] **Step 2: Commit**

```bash
git add eval/README.md
git commit -m "docs(eval): README del harness de eval"
```

---

## Self-Review Notes

**Cobertura del spec:**
- Generación con API real → Task 2 (modelo configurable) + Task 7 (runAgent). ✓
- Juez `claude -p` Opus 4.8 → Task 5 (judge.ts, runner CLI). ✓
- Langfuse datasets/runs/scores → Task 8 + Task 11. ✓
- Dataset híbrido con `id` explícito → Task 1 (EvalItem) + Task 9. ✓
- factual con/sin referencia + confidence → Task 4 (rúbrica) + Task 5 (schema confidence). ✓
- Criterios flashcard (retrieval_value, front_back_fit, minimal_answer) → Task 1 + Task 4/5. ✓
- count numérico (delta/ratio) → Task 3. ✓
- duplicación 3 capas → Task 3. ✓
- atomicity como flag auxiliar → Task 3. ✓
- overall_score ponderado → Task 4 (weights) + Task 6. ✓
- pairwise como futuro → documentado en spec, fuera de alcance. ✓
- provenance del juez → Task 1 (JudgeProvenance) + Task 11. ✓
- artefactos crudos → Task 11. ✓
- negative controls → Task 9 (fixtures) + Task 10 (test). ✓
- comparación de modelos por run → Task 8/11 (runName) + Task 12 (README). ✓
- tests del harness → Tasks 3, 5, 6, 10. ✓

**Limitaciones registradas (no bloqueantes):** temperature del CLI y `schemaRetries`
del agente — documentadas en el README (Task 12) para honestidad, no ocultas.
```
