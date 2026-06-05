import * as traceloop from "@traceloop/node-server-sdk";
import * as AnthropicModule from "@anthropic-ai/sdk";

// Instrumentación OpenLLMetry (OTel) — se ejecuta una sola vez al arrancar.
// El costo NO se calcula aquí: la app solo emite tokens estándar (gen_ai.usage.*)
// y atributos custom (app.gen_ai.*). El costo se deriva en el OTel Collector (OTTL).
//
// En Next hay que pasar `instrumentModules` explícito: el bundler impide el
// auto-parcheo por carga de módulo, así que entregamos la clase Anthropic para
// que Traceloop parchee su prototipo `messages.create`.
traceloop.initialize({
  appName: process.env.OTEL_SERVICE_NAME ?? "anki-agent",
  baseUrl: process.env.TRACELOOP_BASE_URL ?? "http://localhost:4318",
  apiKey: process.env.TRACELOOP_API_KEY,
  // En dev exportamos sin batch para ver las trazas de inmediato.
  disableBatch: process.env.NODE_ENV !== "production",
  instrumentModules: { anthropic: AnthropicModule },
});
