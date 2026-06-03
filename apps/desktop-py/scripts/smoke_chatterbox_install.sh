#!/usr/bin/env bash
# Phase 86 — Smoke test de instalação do Chatterbox (CHTB-02).
#
# Valida que `uv sync --extra chatterbox` resolve sem conflito e que
# faster-whisper continua funcional após o sync.
#
# Uso:
#   ./scripts/smoke_chatterbox_install.sh
#
# Sai com exit 0 em sucesso, exit não-zero em qualquer falha.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$APP_DIR"

echo "[smoke] cwd: $APP_DIR"
echo "[smoke] Etapa 1/3 — uv sync --extra chatterbox"
uv sync --extra chatterbox

echo "[smoke] Etapa 2/3 — verificar faster-whisper ainda importa"
uv run python -c "from faster_whisper import WhisperModel; print('faster-whisper OK')"

echo "[smoke] Etapa 3/3 — verificar chatterbox importa (lazy — sem load do modelo)"
uv run python -c "from chatterbox.mtl_tts import ChatterboxMultilingualTTS; print('chatterbox OK')"

echo "[smoke] Sucesso — Chatterbox + faster-whisper coexistem."
