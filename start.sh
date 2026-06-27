#!/bin/bash
# Digital Human Studio — Start script
# Usage: ./start.sh
set -e
cd "$(dirname "${BASH_SOURCE[0]}")"

if [ ! -f .env ]; then
  echo "No .env file found — copying from .env.example"
  cp .env.example .env
fi

# Load .env
set -a; source .env; set +a

echo ""
echo "🎬 Starting Digital Human Studio..."
echo "   Port:    ${PORT:-4200}"
echo "   Runtime: ${AI_RUNTIME_MODE:-hybrid}"
echo "   TTS:     ${TTS_PROVIDER:-system}"
echo "   Lipsync: ${LIPSYNC_PROVIDER:-static}"
echo ""

node server.js
