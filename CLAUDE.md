# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Cozy Anki — Agente de investigación

App tipo Anki (sin login) cuyo núcleo es un agente de investigación profunda que genera
tarjetas a partir de un tema.

## Stack
- Next.js 15 (App Router) + TypeScript estricto
- Tailwind CSS v3 + Framer Motion (UI cozy, animaciones)
- Prisma + SQLite (persistencia local)
- `@anthropic-ai/sdk` (agente con herramienta nativa `web_search`)
- Vitest (tests unitarios)

## Estructura
- `lib/agent/` — el agente: `researchAgent.ts` (loop), `prompts.ts`, `schema.ts` (Zod + JSON schema).
- `lib/srs.ts` — algoritmo SM-2 clásico (`scheduleNext`).
- `lib/db.ts` — singleton de Prisma.
- `app/api/` — `research` (SSE stream), `decks`, `cards`, `review`.
- `app/` — páginas: home, `research`, `deck/[id]`, `study/[id]`.
- `components/` — UI client: CardFlip, ResearchProgress, ReviewButtons, DeckList, DeckView, StudySession.

## Flujo del agente (`researchAgent.ts`)
- `runResearchAgent(topic, count)` es un **async generator** que emite `ProgressEvent`s
  (`status` | `search` | `thinking` | `done` | `error`). El loop corre hasta `MAX_TURNS` (12).
- Dos herramientas: `web_search` (server tool nativo, `max_uses: 8`, resultados anexados
  automáticamente — solo se continúa el loop) y `emit_cards` (client tool).
- Cuando llega `emit_cards`, se valida con `cardSetSchema`. Si **falla**, se devuelve un
  `tool_result` con `is_error: true` y el mensaje de Zod para que el modelo reintente; si
  **pasa**, se emite `done` y se retorna. Mantener `cardSetJsonSchema` (JSON Schema para el
  tool input) sincronizado a mano con `cardSetSchema` (Zod).

## SSE (`app/api/research/route.ts`)
- POST devuelve un `ReadableStream` `text/event-stream`; cada `ProgressEvent` se serializa como
  `data: {json}\n\n`. `runtime = "nodejs"`, `maxDuration = 300`. El cliente
  (`ResearchProgress.tsx`) consume estos eventos para mostrar progreso en vivo.

## Datos (Prisma)
- `Deck 1—N Card 1—N ReviewLog`, todo con `onDelete: Cascade`. El estado SM-2 vive en `Card`
  (`ease` default 2.5, `interval` 0, `repetitions` 0, `dueDate`). `ReviewLog.rating` es Int.

## Reglas
- El agente DEBE devolver tarjetas vía la tool `emit_cards` validada con Zod (`cardSetSchema`). Nunca parsear prosa.
- Modelo del agente: `claude-sonnet-4-6` (buen juicio para research/tool-use a menor costo que Opus).
- SM-2 (`scheduleNext`): grades `again=1 hard=3 good=4 easy=5`; `q<3` reinicia repeticiones e
  interval a 0; ease nunca baja de 1.3.
- Sin login ni multiusuario (YAGNI).

## Observabilidad (OpenTelemetry / OpenLLMetry)
- Instrumentación con `@traceloop/node-server-sdk`. Init en `instrumentation.node.ts`
  (cargado por `instrumentation.ts` solo en runtime nodejs). Hay que pasar
  `instrumentModules: { anthropic: Anthropic }` y mantener el SDK en
  `serverExternalPackages` (`next.config.ts`) o no se generan spans.
- Estructura del trace por run: `research_pipeline` (workflow, `app/api/research/route.ts`)
  → `research_turn_N` (task por turno, `researchAgent.ts`) → `anthropic.chat` (auto-span con
  `gen_ai.usage.*`). El turno cuelga atributos custom `app.gen_ai.cache_hit` y `prompt_hash`.
- **El costo se calcula en el OTel Collector** (OTTL en `otel/collector-config.yaml`), no en
  el código. Cambiar tarifa = editar ese YAML. Stack completo (Collector/Tempo/Prometheus/
  Grafana) en `otel/` — ver `otel/README.md`. Variables: `TRACELOOP_BASE_URL`, `OTEL_SERVICE_NAME`.

## Desarrollo
```bash
npm install
npm run db:generate && npm run db:push   # crea SQLite
npm run dev                              # requiere ANTHROPIC_API_KEY en .env
npm test                                 # tests de SM-2 y schema
cd otel && docker compose up -d          # opcional: stack de telemetría (Grafana :3000)
```
