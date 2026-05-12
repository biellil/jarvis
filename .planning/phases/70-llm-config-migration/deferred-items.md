# Phase 70 — Deferred Items

Pre-existing issues discovered during execution that are out-of-scope for this phase.

## Plan 70-03 — Workspace Typecheck / Test Failures (Pre-existing)

### TypeScript Errors (Pre-existing, NOT caused by Plan 70-03 strip)

Baseline `pnpm exec tsc --noEmit` em `apps/desktop`: **131 erros pré-existentes** (verificado via `git stash` antes do strip).
Após Plan 70-03: **119 erros** (−12, todos removidos por força do strip — nenhum erro novo introduzido).

Categorias pré-existentes:
- `SettingsData` missing `quietHours/folderWatch/dailySummary` em `ipc/settings.ts:55` — payload `settings:get` nunca incluiu esses fields. Interface requer mas handler não popula.
- `vi.fn<[], T>` syntax errors em `settings.test.ts` (60 erros) e `voiceHandler.streaming.test.ts` — vitest 4.x mudou type signature, antiga sintaxe `vi.fn<[args], ret>` agora aceita 0-1 type args. Migração pendente.
- `WebkitAppRegion` CSS prop em `ChatInput.tsx` — não tipado em CSSProperties (config tsconfig pode resolver).
- `MicVAD` properties `onSpeechStart/onSpeechEnd` em `useMultiTurnWindow.ts` — typing do `@ricky0123/vad-web` desatualizado.
- `Cannot find module '../../../../../shared/ipc-types'` em alguns tests — paths relativos incorretos.

### Vitest Failures (Pre-existing)

Baseline: **44 failed / 898 passed** (953 total).
Após Plan 70-03: **42 failed / 900 passed** (953 total) — 2 falhas removidas, 2 passes adicionados. Nenhuma regressão introduzida.

Falhas pré-existentes (não relacionadas ao strip LLM/MCP):
- `vramDetection.test.ts` — VRAM-based model selection logs diferentes (test expectativa desatualizada vs implementação que sempre seleciona 'base' em fallback).
- `whisper-gpu-detection.test.ts` — env Linux sem `libcudart.so.12` faz CUDA falhar; fallback CPU não combina com test mock expectations.
- `integration-chat.test.ts` — mock gateway port 3001 não responde no env.
- `voiceMode/alwaysListening.test.ts` — `settings:get` retorna shape esperado mas tests usam mock outdated.
- `tray.platform.test.ts` — tray menu em pt-BR ("Sair") vs test que espera 'Quit' em EN-US.
- `voiceHandler.test.ts` — TTS/whisper-cli não disponível no env de teste.
- `ttsPlayer.test.ts` — `AudioContext` mocks happy-dom desatualizados.
- `modelLoader.test.ts`, `chat-send-audio.test.ts`, `tts-providers.test.ts` — failure de file/mock setup.

**Recomendação:** Phase pós-71 (cleanup de testes) ou abordar incrementalmente quando tocar o código relacionado.

## Plan 70-02 — Backend TypeScript Errors (Pre-existing)

5 erros TS no `apps/backend-ts` (documentados no SUMMARY do Plan 70-02):
- `src/index.ts:105` — Property 'llm' is private
- `src/proactive/folder-watcher.ts:111` — Argument type incompatibility
- `src/proactive/scheduler.ts:195` — BetterSQLite3Database type mismatch
- `src/routes/__tests__/proactive.route.test.ts:96` (×2) — Property 'response' não existe
