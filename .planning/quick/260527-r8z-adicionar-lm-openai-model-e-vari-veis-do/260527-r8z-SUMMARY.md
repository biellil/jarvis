# Quick Task 260527-r8z: Summary

**Date:** 2026-05-27
**Status:** complete

## What was done

Adicionado suporte a overrides de modelo específicos por provider, seguindo o padrão já existente do `LM_STUDIO_MODEL`:

### Files changed

- **`apps/backend-ts/src/llm/config.ts`** — adicionados `LM_OPENAI_MODEL` e `GEMINI_MODEL` ao envSchema (optional, default `''`)
- **`apps/backend-ts/src/llm/factory.ts`** — casos `openai` e `gemini` agora usam `cfg.LM_OPENAI_MODEL || cfg.LLM_MODEL` e `cfg.GEMINI_MODEL || cfg.LLM_MODEL` respectivamente
- **`.env.example`** — documentados `GEMINI_MODEL=` e `LM_OPENAI_MODEL=` nas seções correspondentes

## Priority chain (per provider)

| Provider | Priority |
|----------|----------|
| lmstudio | `LM_STUDIO_MODEL` → `LLM_MODEL` → `'default'` |
| openai   | `LM_OPENAI_MODEL` → `LLM_MODEL` → `'gpt-4o-mini'` |
| gemini   | `GEMINI_MODEL` → `LLM_MODEL` → `'gemini-2.0-flash'` |
| anthropic | `LLM_MODEL` → `'claude-3-5-haiku-20241022'` |

## Tests

33/33 passing (config.test.ts + factory.test.ts)
