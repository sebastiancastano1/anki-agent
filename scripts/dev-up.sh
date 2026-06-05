#!/usr/bin/env bash
# Levanta TODO el entorno de anki-agent con un solo comando:
#   - App Next.js          → http://localhost:3000   (primer plano)
#   - Grafana (dashboards) → http://localhost:3002
#   - Prometheus           → http://localhost:9090
#   - Tempo (trazas)       → vía Grafana / :3200
#   - OTel Collector OTLP   → http://localhost:4318
#   - Langfuse (LLM obs)   → http://localhost:3001
#
# Uso:  npm run start:all          (o:  bash scripts/dev-up.sh)
#       OBS=0 npm run start:all       → solo la app, sin observabilidad
#       LANGFUSE=0 npm run start:all  → observabilidad SIN Langfuse (más ligero)
set -euo pipefail

cd "$(dirname "$0")/.."

# --- 1. Comprobaciones básicas -------------------------------------------------
if [ ! -f .env ]; then
  echo "⚠️  No existe .env — cópialo de .env.example y pon tu ANTHROPIC_API_KEY:"
  echo "      cp .env.example .env"
  exit 1
fi

if ! grep -q '^ANTHROPIC_API_KEY="\?sk-' .env 2>/dev/null; then
  echo "⚠️  ANTHROPIC_API_KEY no parece estar configurada en .env (debe empezar por sk-)."
fi

# --- 2. Dependencias + base de datos ------------------------------------------
if [ ! -d node_modules ]; then
  echo "📦 Instalando dependencias…"
  npm install
fi

echo "🗄️  Preparando base de datos (SQLite)…"
npm run db:setup >/dev/null

# --- 3. Stack de observabilidad (opcional, requiere Docker) -------------------
OBS="${OBS:-1}"
LANGFUSE="${LANGFUSE:-1}"
if [ "$OBS" = "1" ]; then
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    if [ "$LANGFUSE" = "1" ]; then
      echo "📈 Levantando observabilidad COMPLETA (Grafana :3002, Prometheus :9090, Collector :4318, Langfuse :3001)…"
      # WSL2/Docker Desktop a veces deja bind-mounts cacheados "stale" y el Collector
      # falla al montar collector-config.yaml. Recrear el contenedor lo evita.
      npm run obs:langfuse:up -- --force-recreate
      echo "   → Grafana:    http://localhost:3002"
      echo "   → Prometheus: http://localhost:9090"
      echo "   → Langfuse:   http://localhost:3001"
      if ! grep -q '^LANGFUSE_OTEL_AUTH=.\+' .env 2>/dev/null; then
        echo ""
        echo "   ⚠️  LANGFUSE_OTEL_AUTH está vacío en .env: Langfuse arranca pero NO recibirá trazas."
        echo "      Crea un proyecto en http://localhost:3001, copia las API keys y:"
        echo "        echo -n 'pk-lf-xxxx:sk-lf-xxxx' | base64 -w0   → pégalo en LANGFUSE_OTEL_AUTH"
        echo "        npm run obs:langfuse:up                         → reinicia el Collector"
      fi
    else
      echo "📈 Levantando observabilidad (Grafana :3002, Prometheus :9090, Collector :4318)…"
      npm run obs:up
      echo "   → Grafana:    http://localhost:3002"
      echo "   → Prometheus: http://localhost:9090"
    fi
  else
    echo "⏭️  Docker no disponible — se omite el stack de observabilidad."
    echo "    (la app funciona igual; las trazas OTLP fallarán en silencio)"
  fi
else
  echo "⏭️  OBS=0 — se omite el stack de observabilidad."
fi

# --- 4. App en primer plano ---------------------------------------------------
echo ""
echo "🚀 Arrancando la app en http://localhost:3000  (Ctrl+C para detener)"
echo ""
exec npm run dev
