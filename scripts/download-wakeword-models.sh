#!/usr/bin/env bash
# Thin wrapper — delega para o script Node cross-platform.
set -euo pipefail
exec node "$(dirname "$0")/download-wakeword-models.mjs" "$@"
