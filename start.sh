#!/bin/bash
# APEX Trading System v4.0 — Start All Services
set -e
trap 'kill 0' EXIT

DIR="$(cd "$(dirname "$0")" && pwd)"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  APEX TRADING SYSTEM v4.0"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check .env
if [ ! -f "$DIR/.env" ]; then
  echo "WARNING: .env file not found. Copying from .env.example..."
  cp "$DIR/.env.example" "$DIR/.env"
  echo "Please edit .env with your API keys."
fi

# Start Python Engine
echo "[1/3] Starting Python Analysis Engine (port 8000)..."
cd "$DIR/packages/engine"
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 &
ENGINE_PID=$!

# Start Node.js Server
echo "[2/3] Starting Node.js Server (port 3001)..."
cd "$DIR/packages/server"
npx tsx src/index.ts &
SERVER_PID=$!

# Start React Client
echo "[3/3] Starting React Dashboard (port 5173)..."
cd "$DIR/packages/client"
npx vite --port 5173 &
CLIENT_PID=$!

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Dashboard:  http://localhost:5173"
echo "  API Server: http://localhost:3001"
echo "  Engine:     http://localhost:8000"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Press Ctrl+C to stop all services"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

wait
