# Observabilidad — anki-agent

Stack de telemetría LLM portado de `AISDLC/Observability` (LIT-22). Instrumentamos
una sola vez con OpenLLMetry (Traceloop JS); el **costo se calcula en el Collector**
(OTTL), no en la app.

```
app (Next.js) ──OTLP/HTTP:4318──▶ otel-collector ──┬─▶ tempo        (trazas)
   withWorkflow → withTask → anthropic.messages     │   transform OTTL: costo AQUÍ
                                                     └─▶ prometheus   (métricas)
                                                              └─▶ grafana :3000
```

## Levantar el stack

```bash
cd otel
docker compose up -d
```

Servicios:
- **Grafana** → http://localhost:3000 (login anónimo, rol Admin). Dashboard
  *"anki-agent · LLM cost & traces"* ya provisionado.
- **Prometheus** → http://localhost:9090
- **Tempo** (vía datasource de Grafana, Explore)
- **Collector OTLP** → `http://localhost:4318` (valor de `TRACELOOP_BASE_URL`)

> **Nota:** este stack usa los puertos estándar (4317/4318/9090/3000/3200), los mismos
> que el `poc-min` de LIT-22. Si tienes ese POC corriendo, bájalo (`docker compose down`)
> o remapea los puertos en `docker-compose.yml` antes de levantar este.

## Conectar la app

En `.env` de la app:

```
TRACELOOP_BASE_URL=http://localhost:4318
OTEL_SERVICE_NAME=anki-agent
```

Genera un mazo en `/research`. En Grafana → Explore (Tempo) verás la traza:

```
research_pipeline           (workflow — un run)
└─ research_turn_N          (task — un turno; app.gen_ai.cache_hit, prompt_hash, ...)
   └─ anthropic.chat        (auto-span — gen_ai.usage.* + app.cost.* inyectado por el Collector)
```

## Cambiar precios

Editar `collector-config.yaml` (processor `transform/llm_cost`) y reiniciar el
Collector: `docker compose restart otel-collector`. Tarifas actuales de
`claude-sonnet-4-6` (USD/1M): input $3 · output $15 · cache-write $3.75 · cache-read $0.30.
