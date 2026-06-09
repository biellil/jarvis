---
phase: quick
plan: 260609-qtd
type: execute
wave: 1
depends_on: []
files_modified:
  - .env
  - apps/desktop-py/src/jarvis_desktop/config.py
  - apps/desktop-py/tests/test_config.py
autonomous: true
requirements: []
must_haves:
  truths:
    - "Running `jd` connects to http://localhost:3000, not http://10.0.0.22:3000"
    - "GATEWAY_URL set in .env wins over gateway_url in ~/.jarvis/config.json"
    - "Preference fields (tts_provider, api_key, etc.) still follow config.json > env order"
    - "All existing config tests pass"
  artifacts:
    - path: ".env"
      provides: "GATEWAY_URL=http://localhost:3000 key"
      contains: "GATEWAY_URL"
    - path: "apps/desktop-py/src/jarvis_desktop/config.py"
      provides: "load_config() with env-wins-for-gateway_url sentinel logic"
      contains: "_gateway_url_env"
    - path: "apps/desktop-py/tests/test_config.py"
      provides: "Test asserting GATEWAY_URL env beats config.json"
      contains: "test_gateway_url_env_wins_over_config_json"
  key_links:
    - from: ".env"
      to: "load_config() Step 2"
      via: "python-dotenv load_dotenv + os.getenv(GATEWAY_URL)"
      pattern: "os\\.getenv.*GATEWAY_URL"
    - from: "load_config() _gateway_url_env sentinel"
      to: "config after Step 3 merge"
      via: "re-apply if _gateway_url_env is not None"
      pattern: "_gateway_url_env is not None"
---

<objective>
Make .env the source of truth for the Gateway URL in the desktop-py client.

Purpose: The jd command has been connecting to a stale IP (http://10.0.0.22:3000) because
~/.jarvis/config.json overrides the env-derived gateway_url in load_config(). The module
docstring promises ".env > config.json > defaults" but the code inverts this for gateway_url.
This plan fixes the code to match the documented contract, adds GATEWAY_URL to .env, and
corrects the stale value in ~/.jarvis/config.json.

Output: .env with GATEWAY_URL key, config.py with sentinel re-apply logic, new precedence
test, and corrected ~/.jarvis/config.json.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@apps/desktop-py/src/jarvis_desktop/config.py
@apps/desktop-py/tests/test_config.py
@apps/desktop-py/tests/conftest.py
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add GATEWAY_URL to .env and fix load_config() precedence</name>
  <files>.env, apps/desktop-py/src/jarvis_desktop/config.py</files>
  <action>
**Part A — .env (monorepo root /Users/biellil/Documents/jarvis/.env):**

Add `GATEWAY_URL=http://localhost:3000` near the existing gateway-related keys
(GATEWAY_PORT and JARVIS_BACKEND_URL). Insert it on its own line adjacent to those keys.
Note: .env is gitignored — the edit happens on disk but will not be committed.

**Part B — config.py load_config() sentinel logic:**

In `load_config()` in `apps/desktop-py/src/jarvis_desktop/config.py`, make two targeted
changes:

1. Capture the raw env value BEFORE load_dotenv is called (it may already be set in
   process env) AND after. The simplest approach: capture it right after the load_dotenv
   block, before Step 2. Add this line immediately after the `load_dotenv` block (before
   Step 2 comment):

   ```python
   _gateway_url_env = os.getenv("GATEWAY_URL")
   ```

2. After Step 3 (the config.json merge at line ~184), add a re-apply block. Insert it
   immediately after the `except` clause that handles JSONDecodeError (after line ~187),
   before Step 4:

   ```python
   # Re-apply GATEWAY_URL from env if it was explicitly set — env wins over config.json
   # per module docstring. Sentinel: None means "absent from env", preserving backward
   # compat (config.json or default wins when GATEWAY_URL is not set).
   if _gateway_url_env is not None:
       config = JarvisConfig(**{**config.model_dump(), "gateway_url": _gateway_url_env})
   ```

Do NOT change precedence for any other field. Do NOT modify JarvisConfig schema fields
or defaults. Do NOT alter the module docstring (it already correctly states the intended
order).

Also update the load_config() docstring to match the actual behavior — change line:
  "3. ~/.jarvis/config.json (user preferences — overrides env for preference fields)"
to:
  "3. ~/.jarvis/config.json (user preferences — overrides env EXCEPT for GATEWAY_URL)"

**Part C — ~/.jarvis/config.json (user home, NOT in repo):**

Read the file at `/Users/biellil/.jarvis/config.json`. Find the `"gateway_url"` key and
change its value from `"http://10.0.0.22:3000"` to `"http://localhost:3000"`. Use the
Read tool to read the file first, then Write to update it. This file is NOT committed.
  </action>
  <verify>
    <automated>cd /Users/biellil/Documents/jarvis && grep "GATEWAY_URL" .env && python -c "
import sys, os
sys.path.insert(0, 'apps/desktop-py/src')
os.environ['HOME'] = '/tmp/test-jarvis-home-verify'
import pathlib; pathlib.Path('/tmp/test-jarvis-home-verify/.jarvis').mkdir(parents=True, exist_ok=True)
import json; pathlib.Path('/tmp/test-jarvis-home-verify/.jarvis/config.json').write_text(json.dumps({'gateway_url': 'http://10.0.0.22:3000'}))
os.environ['GATEWAY_URL'] = 'http://localhost:3000'
from jarvis_desktop.config import load_config
cfg = load_config()
assert cfg.gateway_url == 'http://localhost:3000', f'Expected localhost, got {cfg.gateway_url}'
print('PASS: env wins over config.json gateway_url')
"
    </automated>
  </verify>
  <done>
    - .env contains GATEWAY_URL=http://localhost:3000 line
    - load_config() returns gateway_url=http://localhost:3000 even when config.json has http://10.0.0.22:3000
    - ~/.jarvis/config.json has corrected gateway_url value
    - _gateway_url_env sentinel is None when GATEWAY_URL is absent (backward compat preserved)
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Add precedence test for GATEWAY_URL env over config.json</name>
  <files>apps/desktop-py/tests/test_config.py</files>
  <behavior>
    - Test: GATEWAY_URL set in env + config.json has stale IP → load_config() returns env value
    - Test: GATEWAY_URL absent from env + config.json has custom URL → load_config() returns config.json value (backward compat)
    - Existing test_load_config_returns_defaults must add monkeypatch.delenv("GATEWAY_URL", raising=False) to be env-isolated
  </behavior>
  <action>
Add two new tests to `apps/desktop-py/tests/test_config.py` in the "Env var fallback"
section (after the existing `test_tts_provider_config_json_wins_over_env` test):

```python
def test_gateway_url_env_wins_over_config_json(tmp_home, jarvis_config_dir, monkeypatch):
    """GATEWAY_URL env var wins over gateway_url in config.json — env is source of truth."""
    import json
    from pathlib import Path
    from jarvis_desktop.config import load_config

    monkeypatch.setenv("GATEWAY_URL", "http://localhost:3000")
    config_file = Path(tmp_home) / ".jarvis" / "config.json"
    config_file.write_text(json.dumps({"gateway_url": "http://10.0.0.22:3000"}))

    config = load_config()
    assert config.gateway_url == "http://localhost:3000"


def test_gateway_url_config_json_wins_when_env_absent(tmp_home, jarvis_config_dir, monkeypatch):
    """When GATEWAY_URL is absent from env, config.json value wins (backward compat)."""
    import json
    from pathlib import Path
    from jarvis_desktop.config import load_config

    monkeypatch.delenv("GATEWAY_URL", raising=False)
    config_file = Path(tmp_home) / ".jarvis" / "config.json"
    config_file.write_text(json.dumps({"gateway_url": "http://192.168.1.100:8080"}))

    config = load_config()
    assert config.gateway_url == "http://192.168.1.100:8080"
```

Also update `test_load_config_returns_defaults` (first test in the file) to add
`monkeypatch.delenv("GATEWAY_URL", raising=False)` alongside the other monkeypatches
so it is isolated from any GATEWAY_URL already in the process environment.

This function currently has `tmp_home` and `monkeypatch` args — just add one more
`monkeypatch.delenv` call after the existing ones.
  </action>
  <verify>
    <automated>cd /Users/biellil/Documents/jarvis/apps/desktop-py && python -m pytest tests/test_config.py -x -q 2>&1 | tail -20</automated>
  </verify>
  <done>
    - test_gateway_url_env_wins_over_config_json passes (RED then GREEN)
    - test_gateway_url_config_json_wins_when_env_absent passes
    - All pre-existing test_config.py tests still pass
    - pytest exits 0
  </done>
</task>

</tasks>

<verification>
Full test suite for config module:
cd /Users/biellil/Documents/jarvis/apps/desktop-py && python -m pytest tests/test_config.py -v 2>&1 | tail -30

Smoke test the actual jd binary resolves to localhost:
cd /Users/biellil/Documents/jarvis && python -c "
import sys; sys.path.insert(0, 'apps/desktop-py/src')
from jarvis_desktop.config import load_config
cfg = load_config()
print('gateway_url =', cfg.gateway_url)
assert 'localhost' in cfg.gateway_url or '127.0.0.1' in cfg.gateway_url, f'Still using stale IP: {cfg.gateway_url}'
print('OK — desktop-py will connect to', cfg.gateway_url)
"
</verification>

<success_criteria>
- .env contains GATEWAY_URL=http://localhost:3000
- load_config() returns gateway_url=http://localhost:3000 regardless of stale config.json value
- ~/.jarvis/config.json no longer has the stale 10.0.0.22 IP
- All test_config.py tests pass (including 2 new gateway_url precedence tests)
- No regressions in tts_provider / api_key / other preference field precedence behavior
</success_criteria>

<output>
After completion, create `.planning/quick/260609-qtd-fazer-o-env-ser-fonte-de-verdade-para-a-/260609-qtd-SUMMARY.md`
</output>
