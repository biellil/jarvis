# Quick Task 260609-qtd — Summary

**Task:** Fazer o `.env` ser fonte de verdade para a Gateway URL do desktop-py
**Date:** 2026-06-09
**Status:** Complete

## Problem

`jd` (desktop-py client) connected to a stale/unreachable gateway at
`http://10.0.0.22:3000` instead of the real gateway running at `http://localhost:3000`.

Root cause (two combined issues):
1. The monorepo root `.env` never defined the `GATEWAY_URL` key that `config.py`
   reads via `os.getenv("GATEWAY_URL")`.
2. `~/.jarvis/config.json` held the stale value, and `load_config()` let config.json
   **override** the env-derived `gateway_url` — contradicting the module docstring,
   which promised `.env > config.json`.

## Changes

| File | Change | Committed |
|------|--------|-----------|
| `/Users/biellil/Documents/jarvis/.env` | Added `GATEWAY_URL=http://localhost:3000` (line 37) | No (gitignored, disk-only) |
| `~/.jarvis/config.json` | Corrected stale `gateway_url` → `http://localhost:3000` | No (outside repo, disk-only) |
| `apps/desktop-py/src/jarvis_desktop/config.py` | `GATEWAY_URL` from env (`.env` or shell) now wins over config.json | Yes |
| `apps/desktop-py/tests/conftest.py` | Autouse `_isolate_dotenv` fixture — tests never read the dev's real `.env` | Yes |
| `apps/desktop-py/tests/test_config.py` | 2 precedence tests + env-isolation on defaults test | Yes |

## Implementation note (correction)

The first execution captured the env sentinel **before** `load_dotenv` ran, so a value
coming from `.env` (the actual feature) was invisible and config.json still won — verified
empirically. Corrected to capture the sentinel **after** `load_dotenv`, so `.env`-provided
`GATEWAY_URL` wins. When `GATEWAY_URL` is absent everywhere, config.json/default wins
(backward compat). The test-isolation work also exposed and fixed a latent bug:
`load_config()` did not actually auto-create `~/.jarvis/config.json` with defaults when
missing (it only wrote the file as a side effect of env secret-fill).

## Verification

- `test_config.py`: **25 passed**, including `test_gateway_url_env_wins_over_config_json`
  and `test_gateway_url_config_json_wins_when_env_absent`.
- Empirical: with `GATEWAY_URL` only in `.env` + stale config.json → client resolves
  `http://localhost:3000` (env wins). PASS.
- 1 pre-existing unrelated failure (`test_show_config_menu_item8_when_chatterbox`,
  stale menu-rendering assertion) — not in scope.

## Commits

- `d79c4f2c` 🔧 chore(config): make GATEWAY_URL env var win over config.json (initial)
- `bd1f4ea9` ✅ test(config): add GATEWAY_URL precedence tests
- `7233f8a8` 🐛 fix(config): make .env GATEWAY_URL actually win over config.json (correction + auto-create fix)
