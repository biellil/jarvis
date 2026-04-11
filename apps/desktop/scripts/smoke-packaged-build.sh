#!/usr/bin/env bash
# Smoke test — valida que o artefato empacotado contém os 4 ONNX models via extraResources.
# Roda DEPOIS de `pnpm --filter @jarvis/desktop build:dist`.
#
# Phase 22 Plan 04 — VERIFICAÇÃO 7 do checkpoint manual.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -d "release" ]; then
  echo "[smoke] FAIL — release-v2/ dir not found — rode 'pnpm build:dist' primeiro"
  exit 1
fi

# Procura o unpacked build (Windows/Linux/macOS têm layouts diferentes)
UNPACKED_DIRS=(
  "release-v2/win-unpacked/resources/wakeword-models"
  "release-v2/linux-unpacked/resources/wakeword-models"
  "release-v2/mac/JARVIS.app/Contents/Resources/wakeword-models"
  "release-v2/mac-arm64/JARVIS.app/Contents/Resources/wakeword-models"
)

FOUND=0
for dir in "${UNPACKED_DIRS[@]}"; do
  if [ -d "$dir" ]; then
    COUNT=$(ls "$dir"/*.onnx 2>/dev/null | wc -l)
    echo "[smoke] ${dir}: ${COUNT} .onnx files"
    if [ "$COUNT" -eq 4 ]; then
      FOUND=1
      echo "[smoke] PASS — 4 ONNX models encontrados em $dir"
    else
      echo "[smoke] FAIL — esperado 4, encontrado $COUNT em $dir"
    fi
  fi
done

if [ $FOUND -eq 0 ]; then
  echo "[smoke] FAIL — nenhum unpacked build contém os 4 ONNX models"
  echo "[smoke] Verifique electron-builder.yml extraResources config"
  exit 1
fi

echo "[smoke] PASS"
