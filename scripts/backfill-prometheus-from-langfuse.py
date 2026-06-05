#!/usr/bin/env python3
"""
Backfill de Prometheus a partir de la data REAL guardada en Langfuse.

Contexto: la memoria de Tempo/Prometheus se borró, pero Langfuse conservó las
trazas (el mismo span llega a ambos por el fan-out del Collector). Este script
lee las observaciones GENERATION de la API pública de Langfuse y reconstruye las
métricas de costo y tokens *en el mismo formato que produce el OTel Collector*
(mismos nombres y label `gen_ai_response_model`), con los TIMESTAMPS ORIGINALES.

Salida: un archivo OpenMetrics que `promtool tsdb create-blocks-from openmetrics`
convierte en bloques TSDB inyectables en el volumen de Prometheus. Grafana sigue
leyendo de Prometheus (NO de Langfuse).

El costo se RECALCULA con las mismas tarifas que collector-config.yaml para que
coincida exactamente con lo que habría producido el pipeline en vivo.

Uso:
  python3 scripts/backfill-prometheus-from-langfuse.py > otel/backfill.openmetrics

Variables (opcionales):
  LANGFUSE_BASE_URL   (default http://localhost:3001)
  LANGFUSE_OTEL_AUTH  base64(public:secret) — si no, se lee de .env
"""
import base64
import json
import os
import sys
import urllib.request
from datetime import datetime, timezone

# --- Tarifas USD por 1M tokens (idénticas a otel/collector-config.yaml) -------
RATE_INPUT = 3.0
RATE_OUTPUT = 15.0
RATE_CACHE_WRITE = 3.75
RATE_CACHE_READ = 0.30

BASE_URL = os.environ.get("LANGFUSE_BASE_URL", "http://localhost:3001").rstrip("/")

# Etiquetas job/instance que añade el scrape de Prometheus al exporter del
# Collector, para que las series del backfill se fusionen con las futuras en vivo.
JOB = "otel-collector"
INSTANCE = "otel-collector:8889"


def log(*a):
    print(*a, file=sys.stderr)


def read_auth():
    auth = os.environ.get("LANGFUSE_OTEL_AUTH", "").strip()
    if not auth:
        env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
        try:
            with open(env_path) as f:
                for line in f:
                    if line.startswith("LANGFUSE_OTEL_AUTH="):
                        auth = line.split("=", 1)[1].strip()
                        break
        except FileNotFoundError:
            pass
    if not auth:
        log("ERROR: LANGFUSE_OTEL_AUTH vacío (no hay keys para la API de Langfuse).")
        sys.exit(1)
    return base64.b64decode(auth).decode()  # "public:secret"


def fetch_observations(userpass):
    token = base64.b64encode(userpass.encode()).decode()
    page = 1
    out = []
    while True:
        url = f"{BASE_URL}/api/public/observations?type=GENERATION&limit=100&page={page}"
        req = urllib.request.Request(url, headers={"Authorization": f"Basic {token}"})
        with urllib.request.urlopen(req, timeout=30) as r:
            payload = json.load(r)
        out.extend(payload.get("data", []))
        total_pages = payload.get("meta", {}).get("totalPages", 1)
        if page >= total_pages:
            break
        page += 1
    return out


def iso_to_epoch(s):
    # "2026-06-05T17:03:58.961Z" -> epoch segundos (float, precisión ms)
    dt = datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(timezone.utc)
    return dt.timestamp()


def num(d, *keys):
    for k in keys:
        v = d.get(k)
        if isinstance(v, (int, float)):
            return v
    return 0


# Familias OpenMetrics: family_name -> (HELP, lambda tokens-dict -> valor incremental)
# Las muestras se exponen con sufijo _total (convención OpenMetrics de counter).
def build(observations):
    # 1) Normaliza cada observación a (epoch, model, dict de incrementos por familia)
    rows = []
    for o in observations:
        st = o.get("startTime")
        ud = o.get("usageDetails") or {}
        if not st or not ud:
            continue
        model = o.get("model") or "unknown"
        tok_in = num(ud, "input")
        tok_out = num(ud, "output")
        tok_cr = num(ud, "input_cached_tokens", "cache_read_input_tokens")
        tok_cw = num(ud, "input_cache_creation", "cache_creation_input_tokens")
        inc = {
            "gen_ai_tokens_input": tok_in,
            "gen_ai_tokens_output": tok_out,
            "gen_ai_tokens_cache_read": tok_cr,
            "gen_ai_tokens_cache_write": tok_cw,
            "gen_ai_cost_input_usd": tok_in / 1e6 * RATE_INPUT,
            "gen_ai_cost_output_usd": tok_out / 1e6 * RATE_OUTPUT,
            "gen_ai_cost_cache_read_usd": tok_cr / 1e6 * RATE_CACHE_READ,
            "gen_ai_cost_cache_write_usd": tok_cw / 1e6 * RATE_CACHE_WRITE,
        }
        inc["gen_ai_cost_usd"] = (
            inc["gen_ai_cost_input_usd"]
            + inc["gen_ai_cost_output_usd"]
            + inc["gen_ai_cost_cache_read_usd"]
            + inc["gen_ai_cost_cache_write_usd"]
        )
        rows.append((iso_to_epoch(st), model, inc))

    rows.sort(key=lambda r: r[0])

    helps = {
        "gen_ai_cost_usd": "Costo total LLM (USD).",
        "gen_ai_cost_input_usd": "Costo input no-cacheado (USD).",
        "gen_ai_cost_output_usd": "Costo output (USD).",
        "gen_ai_cost_cache_read_usd": "Costo lectura de caché (USD).",
        "gen_ai_cost_cache_write_usd": "Costo escritura de caché (USD).",
        "gen_ai_tokens_input": "Tokens input no-cacheados.",
        "gen_ai_tokens_output": "Tokens output.",
        "gen_ai_tokens_cache_read": "Tokens leídos de caché.",
        "gen_ai_tokens_cache_write": "Tokens de escritura de caché.",
    }
    families = list(helps.keys())

    # 2) Acumula counters monotónicos por (familia, modelo) en orden temporal.
    cum = {}  # (family, model) -> running total
    samples = {f: [] for f in families}  # family -> list[(model, value, epoch)]
    for epoch, model, inc in rows:
        for f in families:
            key = (f, model)
            cum[key] = cum.get(key, 0.0) + inc[f]
            samples[f].append((model, cum[key], epoch))

    # 3) Emite OpenMetrics.
    lines = []
    for f in families:
        lines.append(f"# HELP {f} {helps[f]}")
        lines.append(f"# TYPE {f} counter")
        for model, val, epoch in samples[f]:
            labels = (
                f'gen_ai_response_model="{model}",'
                f'job="{JOB}",instance="{INSTANCE}"'
            )
            # valor: enteros limpios para tokens, alta precisión para costo
            v = f"{val:.10g}"
            lines.append(f"{f}_total{{{labels}}} {v} {epoch:.3f}")
    lines.append("# EOF")
    return "\n".join(lines) + "\n", len(rows)


def main():
    userpass = read_auth()
    obs = fetch_observations(userpass)
    log(f"Observaciones GENERATION leídas: {len(obs)}")
    text, n = build(obs)
    log(f"Filas con usage procesadas: {n}")
    sys.stdout.write(text)


if __name__ == "__main__":
    main()
