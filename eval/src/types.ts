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
  traceId: string | null;
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
