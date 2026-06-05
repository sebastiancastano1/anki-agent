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
