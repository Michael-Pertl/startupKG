#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="$ROOT_DIR/web"
APP_PORT="${APP_PORT:-5180}"
APP_URL="http://127.0.0.1:${APP_PORT}/"
ASK_PORT="${GRAPH_ASSISTANT_PORT:-8787}"
ASK_PID=""

is_port_open() {
  timeout 1 bash -c "cat < /dev/null > /dev/tcp/127.0.0.1/$1" >/dev/null 2>&1
}

cleanup() {
  if [ -n "$ASK_PID" ] && kill -0 "$ASK_PID" 2>/dev/null; then
    kill "$ASK_PID"
  fi
}

trap cleanup EXIT INT TERM

cd "$WEB_DIR"

python3 "$ROOT_DIR/scripts/refresh_platform.py"

if [ ! -d node_modules ]; then
  echo "Installing web dependencies..."
  npm install
fi

if [ -f .env.local ] && is_port_open "$ASK_PORT"; then
  echo "Ask assistant proxy already appears to be running on port $ASK_PORT. Reusing it."
elif [ -f .env.local ]; then
  echo "Starting graph assistant proxy..."
  npm run ask-server &
  ASK_PID=$!
else
  echo "No web/.env.local found. Starting without the Ask assistant."
fi

echo "Starting AI Market Graph at $APP_URL"
echo "If port $APP_PORT is busy, Vite will print the next available URL."
npm run dev -- --port "$APP_PORT"
