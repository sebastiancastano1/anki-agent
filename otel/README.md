# Observabilidad — anki-agent

Stack de telemetría LLM portado de `AISDLC/Observability` (LIT-22). Instrumentamos
una sola vez con OpenLLMetry (Traceloop JS); el **costo se calcula en el Collector**
(OTTL), no en la app.

```
app (Next.js) ──OTLP/HTTP:4318──▶ otel-collector ──┬─▶ tempo        (trazas)
   withWorkflow → withTask → anthropic.messages     │   transform OTTL: costo AQUÍ
                                                     └─▶ prometheus   (métricas)
                                                              └─▶ grafana :3002
```

## Levantar el stack

```bash
cd otel
docker compose up -d
```

Servicios:
- **Grafana** → http://localhost:3002 (login anónimo, rol Admin). Dashboard
  *"anki-agent · LLM cost & traces"* ya provisionado.
- **Prometheus** → http://localhost:9090
- **Tempo** (vía datasource de Grafana, Explore)
- **Collector OTLP** → `http://localhost:4318` (valor de `TRACELOOP_BASE_URL`)

> **Nota:** Grafana se publica en `:3002` para dejar libre el `:3000` a la app Next.js
> (Langfuse usa `:3001`). El resto son los puertos estándar (4317/4318/9090/3200). Si
> tienes el `poc-min` de LIT-22 corriendo, bájalo o remapea antes de levantar este.

> **Persistencia:** Tempo (`tempo_data`), Prometheus (`prometheus_data`, retención 30d) y
> Grafana (`grafana_data`) usan volúmenes nombrados, así que las trazas y métricas
> **sobreviven a `docker compose down`**. Para borrarlas a propósito usa `down -v`
> (⚠️ elimina también los volúmenes de Langfuse).

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

## Segunda fuente: Langfuse (observabilidad LLM)

Además de Grafana (métricas + trazas), puedes mandar **el mismo span** a Langfuse
vía *fan-out del Collector* (exporter `otlphttp/langfuse`), sin tocar la app:

```
                                   ┌─▶ tempo + prometheus → grafana :3002   (fuente 1)
app ──OTLP:4318──▶ otel-collector ─┤
                                   └─▶ langfuse-web :3001                    (fuente 2)
```

Arranque en **dos pasos** (Langfuse necesita un proyecto antes de poder autenticar):

1. Copia las vars `LANGFUSE_*` de `.env.example` a `.env` y pon secretos reales
   (`openssl rand -hex 32`). Deja `LANGFUSE_OTEL_AUTH` vacío por ahora y levanta:

   ```bash
   cd otel
   docker compose -f docker-compose.yml -f docker-compose.langfuse.yml up -d
   ```

2. Abre **http://localhost:3001**, crea cuenta + organización + proyecto, y copia
   las API keys (public + secret). Calcula el header y reinicia el Collector:

   ```bash
   echo -n 'pk-lf-xxxx:sk-lf-xxxx' | base64 -w0    # → pega en LANGFUSE_OTEL_AUTH del .env
   docker compose -f docker-compose.yml -f docker-compose.langfuse.yml up -d otel-collector
   ```

Genera un mazo en `/research` y verás la MISMA traza en Grafana (Tempo) y en
Langfuse (sección *Tracing*). Mientras `LANGFUSE_OTEL_AUTH` esté vacío, el
exporter falla en silencio por span y el resto del fan-out (Tempo/Prometheus) sigue.

> **Puertos:** Langfuse UI en `:3001`, app Next.js en `:3000`, Grafana en `:3002`. El stack añade
> postgres/clickhouse/redis/minio — es pesado, levántalo solo cuando lo uses.

## Cambiar precios

Editar `collector-config.yaml` (processor `transform/llm_cost`) y reiniciar el
Collector: `docker compose restart otel-collector`. Tarifas actuales de
`claude-sonnet-4-6` (USD/1M): input $3 · output $15 · cache-write $3.75 · cache-read $0.30.
