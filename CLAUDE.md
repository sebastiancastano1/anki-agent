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

## Reglas
- El agente DEBE devolver tarjetas vía la tool `emit_cards` validada con Zod (`cardSetSchema`). Nunca parsear prosa.
- Modelo del agente: `claude-opus-4-8` (juicio/investigación).
- SM-2: ease nunca baja de 1.3; `again` reinicia repeticiones e intervalo.
- Sin login ni multiusuario (YAGNI).

## Desarrollo
```bash
npm install
npm run db:generate && npm run db:push   # crea SQLite
npm run dev                              # requiere ANTHROPIC_API_KEY en .env
npm test                                 # tests de SM-2 y schema
```
