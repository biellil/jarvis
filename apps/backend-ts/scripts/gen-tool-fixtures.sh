#!/usr/bin/env bash
# Gera fixtures JSON das 9 PC tools Python para uso como snapshot no TS.
#
# REPRODUCIBILITY: os inputs canônicos abaixo são FIXOS. Se mudar qualquer input,
# atualize também `apps/backend-ts/test/session/pc-tools.test.ts` para casar com
# o novo payload, senão os snapshot tests quebram.
#
# Uso: pnpm fixtures:tools   (ou bash scripts/gen-tool-fixtures.sh)
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

OUT_DIR="apps/backend-ts/test/fixtures/tools"
mkdir -p "$OUT_DIR"

if command -v uv >/dev/null 2>&1; then
  PY_RUN=(uv run python -c)
else
  export PYTHONPATH="src${PYTHONPATH:+:$PYTHONPATH}"
  PY_RUN=(python3 -c)
fi

gen() {
  local name="$1"
  local py="$2"
  "${PY_RUN[@]}" "$py" > "$OUT_DIR/$name.json"
  echo "wrote $OUT_DIR/$name.json"
}

gen open_app "import json; from jarvis.tools.apps import open_app; print(json.dumps(open_app.invoke({'app_name': 'firefox'})))"
gen close_app "import json; from jarvis.tools.apps import close_app; print(json.dumps(close_app.invoke({'app_name': 'vlc'})))"
gen list_files "import json; from jarvis.tools.files import list_files; print(json.dumps(list_files.invoke({'directory': '/tmp'})))"
gen search_files "import json; from jarvis.tools.files import search_files; print(json.dumps(search_files.invoke({'pattern': '*.py', 'directory': '.'})))"
gen move_file "import json; from jarvis.tools.files import move_file; print(json.dumps(move_file.invoke({'source': 'a.txt', 'destination': 'b.txt'})))"
gen delete_file "import json; from jarvis.tools.files import delete_file; print(json.dumps(delete_file.invoke({'file_path': '/tmp/x'})))"
gen set_volume "import json; from jarvis.tools.system import set_volume; print(json.dumps(set_volume.invoke({'level': 50})))"
gen set_brightness "import json; from jarvis.tools.system import set_brightness; print(json.dumps(set_brightness.invoke({'level': 70})))"
gen list_processes "import json; from jarvis.tools.system import list_processes; print(json.dumps(list_processes.invoke({})))"
