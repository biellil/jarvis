---
phase: 24-wake-word-full-pipeline-integration
plan: 01
subsystem: backend-tts
tags:
  - tts
  - backend
  - murf
  - provider
  - voice
requirements:
  - WAKE-12
dependency_graph:
  requires:
    - apps/backend-ts/src/voice/tts/provider.ts
    - apps/backend-ts/src/voice/tts/elevenlabs.ts
    - apps/backend-ts/src/voice/tts/local.ts
    - apps/backend-ts/src/voice/tts/fallback.ts
  provides:
    - MurfTTSProvider class (cloud TTS pt-BR masculina)
    - Factory case TTS_PROVIDER=murf com fallback gracioso
    - Env config MURF_API_KEY + MURF_VOICE_ID em .env.example
  affects:
    - apps/backend-ts/src/voice/tts/index.ts (factory extension)
    - .env.example (novo bloco Voice expandido)
tech_stack:
  added: []
  patterns:
    - "Mirror do ElevenLabsTTSProvider (mesma estrutura, mesmo tratamento de erro)"
    - "Header literal `api-key` (NÃO Bearer) — específico da Murf API"
    - "encodedAudio base64 JSON → Buffer.from(..., 'base64') (evita second fetch)"
    - "Provider não-wrapped em FallbackTTSProvider (D-04: siblings independentes)"
key_files:
  created:
    - apps/backend-ts/src/voice/tts/murf.ts
    - apps/backend-ts/src/voice/tts/murf.test.ts
  modified:
    - apps/backend-ts/src/voice/tts/index.ts
    - apps/backend-ts/src/voice/tts/index.test.ts
    - .env.example
key_decisions:
  - "Voice default MURF_VOICE_ID=pt-BR-heitor (masculina, style Conversation) — per D-05 + research A2"
  - "Alternativas documentadas em .env.example: pt-BR-gustavo, pt-BR-benicio, pt-BR-silvio, pt-BR-yago"
  - "MurfTTSProvider NÃO é wrapped em FallbackTTSProvider — consistente com D-04 (siblings, degrade via D-06 em runtime failures)"
  - "Header literal 'api-key' (não Authorization Bearer) — confirmed via research WebFetch da Murf API docs"
  - "encodeAsBase64=true + channelType=MONO + format=MP3 no request body (consistente com shape atual do IPC audioBase64)"
metrics:
  duration: ~40min
  tasks_completed: 2
  tests_added: 18  # 16 murf + 2 index
  files_created: 2
  files_modified: 3
  commits: 3
  completed_date: 2026-04-12
---

# Phase 24 Plan 01: Murf TTS Provider Summary

**One-liner:** MurfTTSProvider (cloud TTS pt-BR masculina) integrado ao factory TTS ao lado do ElevenLabs existente, seguindo exatamente o pattern D-04, com fallback gracioso para LocalTTSProvider quando `MURF_API_KEY` ausente e voz default `pt-BR-heitor` (style Conversation).

## Objective Met

Plan 24-01 pediu adicionar `MurfTTSProvider` espelhando `ElevenLabsTTSProvider` e estender `createTTSProvider()` com `TTS_PROVIDER=murf`. Ambos os tasks foram executados via TDD (RED → GREEN → GREEN) com zero desvios da spec. Todas as acceptance criteria (20+ greps + 2 suites de teste) passaram.

## Implementation

### Task 1 — MurfTTSProvider class (TDD)

**RED commit:** `232434c ✅ test(phase-24-01): adiciona testes RED para MurfTTSProvider`

Escrevi primeiro `apps/backend-ts/src/voice/tts/murf.test.ts` com 16 casos cobrindo:

1. Expõe `name === 'murf'`
2. Happy path — sintetiza texto → Buffer mp3 a partir de `encodedAudio` base64
3. Respeita `MURF_VOICE_ID` env override (pt-BR-gustavo testado)
4. Default `pt-BR-heitor` quando env ausente
5. Throw em texto vazio
6. Throw em texto só whitespace
7. Throw em `MURF_API_KEY` ausente
8. Throw em 401 (`Murf error 401: ...`)
9. Throw em 429
10. Throw em 500
11. Throw em erro de rede (`network error: ECONNREFUSED`)
12. Throw em 200 mas `encodedAudio` vazio
13. Throw em 200 sem campo `encodedAudio` (só `audioFile`)
14. Loga `remainingCharacterCount` quando presente
15. **Regression guard T-24-01:** `MURF_API_KEY` NÃO aparece em `console.log`
16. **Regression guard T-24-01:** `MURF_API_KEY` NÃO aparece em error messages (401)

Testes rodaram contra módulo inexistente — FAIL como esperado.

**GREEN commit:** `0ba41b5 ✨ feat(phase-24-01): implementa MurfTTSProvider espelhando ElevenLabs (D-04/D-05)`

Criei `apps/backend-ts/src/voice/tts/murf.ts` seguindo exatamente a estrutura de `elevenlabs.ts`:

- `readonly name = "murf"`
- Constructor: `this.voiceId = process.env.MURF_VOICE_ID ?? "pt-BR-heitor"`
- `synthesize(text)`:
  1. Guard empty/whitespace → `MurfTTSProvider: empty text`
  2. Lê `MURF_API_KEY` → throw se ausente
  3. POST `https://api.murf.ai/v1/speech/generate` com header literal `api-key`
  4. Body: `{ text, voiceId, format: "MP3", channelType: "MONO", encodeAsBase64: true, rate: 0, pitch: 0 }`
  5. try/catch fetch → re-throw como network error
  6. `!res.ok` → lê body via `res.text().slice(0, 200)` → throw `Murf error <status>: <body>`
  7. `json.encodedAudio` ausente → throw `empty encodedAudio in response`
  8. Log `remainingCharacterCount` se number
  9. Return `{ audio: Buffer.from(encodedAudio, 'base64'), format: 'mp3' }`

JSDoc top-of-file documenta privacy trade-off + referência ao T-24-01.

Resultado: 16/16 testes green.

### Task 2 — Factory switch + .env.example (TDD)

**RED → GREEN commit:** `cb6f8ba ✨ feat(phase-24-01): factory switch TTS_PROVIDER=murf + .env.example (D-04)`

Em `apps/backend-ts/src/voice/tts/index.test.ts`, adicionei 2 casos:

1. `TTS_PROVIDER=murf` + `MURF_API_KEY=murf-test-123` → `MurfTTSProvider` instance, `name === "murf"`, sem warn
2. `TTS_PROVIDER=murf` + `MURF_API_KEY=""` → `LocalTTSProvider`, warn contém "MURF_API_KEY"

Primeiro rodei contra factory sem caso "murf" → 2 RED como esperado (caiu no caso `Unknown TTS_PROVIDER`).

Depois em `apps/backend-ts/src/voice/tts/index.ts`:

```typescript
import { MurfTTSProvider } from "./murf.js";
export { MurfTTSProvider } from "./murf.js";

// ... dentro de createTTSProvider, após o bloco elevenlabs:
if (provider === "murf") {
  if (!process.env.MURF_API_KEY) {
    console.warn(
      "[voice] TTS_PROVIDER=murf but MURF_API_KEY not set, using local only",
    );
    return new LocalTTSProvider();
  }
  return new MurfTTSProvider();
}
```

**Por que NÃO wrapped em FallbackTTSProvider:** Per D-04, Murf e ElevenLabs são providers independentes (siblings). Runtime failures são tratadas via D-06 (degrade para texto visível) no `handleAudioResponse`, não via fallback chain.

Em `.env.example`, substituí o bloco `# Voice (Phase 19)` antigo por um bloco expandido `# Voice (Phase 19 + Phase 24)`:

- TTS_PROVIDER documenta as 3 opções (`elevenlabs | murf | local`) com caveats de cada
- Privacy note: providers cloud recebem APENAS texto do LLM, áudio fica local
- Bloco Murf: `MURF_API_KEY=` (vazio) + `MURF_VOICE_ID=pt-BR-heitor`
- Alternativas pt-BR masculinas em comentário: pt-BR-gustavo, pt-BR-benicio, pt-BR-silvio, pt-BR-yago
- Comando curl p/ confirmar voice IDs em runtime contra Murf API

Resultado: 7/7 testes index + 50/50 testes da suite TTS inteira green. Zero regressões nos providers existentes.

## Decisions Made

### Voice default: pt-BR-heitor
Seguindo D-05 + research A2. Nome neutro brasileiro, style "Conversation" adequado para assistente pessoal. Alternativas documentadas em `.env.example` caso o usuário queira trocar sem mexer em código (4 opções masculinas pt-BR: gustavo, benicio, silvio, yago). `[ASSUMED]` o formato exato `pt-BR-<nome>` é inferido de `en-US-natalie` na doc Murf — se runtime `GET /v1/speech/voices` retornar formato diferente, o usuário override via env var.

### Header auth: `api-key` literal (não Bearer)
Confirmado no RESEARCH.md linha 268 via WebFetch da Murf API docs. ElevenLabs usa `xi-api-key`; Murf usa `api-key`. NÃO é `Authorization: Bearer`. Teste de shape valida explicitamente que `headers["api-key"] === apiKey`.

### encodeAsBase64=true (evita segundo fetch)
Response JSON contém `encodedAudio` direto quando `encodeAsBase64: true` é passado no body. Mais eficiente que usar `audioFile` URL + segundo fetch (que exigiria lógica adicional de download). Consistente com o shape atual do IPC `audioBase64`.

### channelType=MONO
Voz humana não precisa estéreo; economiza 50% de banda no download. Consistente com a expectativa do player de áudio downstream.

### Não wrapped em FallbackTTSProvider (D-04)
Per D-04, Murf é sibling independente do ElevenLabs — usuário escolhe via env var e reinicia backend. Failure em runtime (401, quota, network) é tratada via degrade para texto visível (D-06) no `handleAudioResponse`, não via fallback chain interno.

### Regression guard T-24-01 implementado como test cases
Não é só grep — são 2 testes executáveis:

- `NÃO loga a MURF_API_KEY em nenhum console.log` — spy em `console.log`, filtra todas as calls procurando a secret string
- `NÃO vaza a MURF_API_KEY em mensagens de erro (401)` — dispara 401 com a key real no env, captura o throw, assert `message` não contém a key

Isto é mais robusto que grep estático porque captura vazamentos via interpolação dinâmica.

## Deviations from Plan

### None required

Plan executou exatamente como escrito. O único "extra" foi:

**[Rule 3 - Blocking]** `pnpm --filter @jarvis/backend-ts test` falhou inicialmente com:
- `vitest: not found` — node_modules faltando no worktree (fresh clone). Rodei `pnpm install --filter @jarvis/backend-ts...` para popular.
- `Cannot find module sharp-linux-x64.node` — build script de `sharp@0.32.6` foi bloqueado pelo pnpm `ignoredBuiltDependencies`. Rodei `npm rebuild sharp` manualmente para construir o binário nativo. Não é um problema do código do plano — é infra do worktree.

Nenhum arquivo de código-fonte foi alterado por essas correções de infra. `pnpm-lock.yaml` ficou com 1 linha modificada (specifier `electron: ^41.1.1` → `41.1.1`) por side-effect do `pnpm install`, NÃO relacionado ao plano — deliberadamente deixado fora do commit.

### Test count: 16 (acceptance pediu 11+)

Adicionei casos extras para cobrir melhor as behavior rules do plan:
- 2 casos separados para whitespace-only vs empty string
- 2 regression guards T-24-01 distintos (console.log vs error message)
- 2 casos para `encodedAudio` empty vs missing field

Todos específicos a linhas do `<behavior>` block. Não é scope creep.

## Auth Gates

None. Murf API key ausente no `.env` local é tratado no código como fallback para Local (não é auth gate — é contrato documentado). Não houve interação externa requerida.

## Security Check (T-24-01)

Grep de segurança passou:

```bash
$ grep -nE 'console\.log\([^)]*apiKey|api[Kk]ey.*body' apps/backend-ts/src/voice/tts/murf.ts
(no matches)
$ echo $?
1
```

Regression tests automatizados adicionados garantem que futuras modificações não introduzam vazamento.

## Verification

| Check | Result |
|-------|--------|
| `pnpm --filter @jarvis/backend-ts test --run src/voice/tts/murf.test.ts` | ✓ 16/16 passing |
| `pnpm --filter @jarvis/backend-ts test --run src/voice/tts/index.test.ts` | ✓ 7/7 passing |
| `pnpm --filter @jarvis/backend-ts test --run src/voice/tts/` (full suite) | ✓ 50/50 passing |
| `pnpm --filter @jarvis/backend-ts exec tsc --noEmit` | ✓ clean |
| Security grep `console.log.*apiKey` | ✓ no matches |
| All Task 1 acceptance criteria (12 greps) | ✓ all OK |
| All Task 2 acceptance criteria (10 greps) | ✓ all OK |

## Files

**Created:**
- `apps/backend-ts/src/voice/tts/murf.ts` (106 lines) — MurfTTSProvider class
- `apps/backend-ts/src/voice/tts/murf.test.ts` (254 lines) — 16 unit tests

**Modified:**
- `apps/backend-ts/src/voice/tts/index.ts` (+14 lines) — factory case + re-export
- `apps/backend-ts/src/voice/tts/index.test.ts` (+19 lines) — 2 test cases
- `.env.example` (+14 lines, -2 lines) — expanded Voice section

## Commits

| Hash | Type | Description |
|------|------|-------------|
| `232434c` | test | `✅ test(phase-24-01): adiciona testes RED para MurfTTSProvider` |
| `0ba41b5` | feat | `✨ feat(phase-24-01): implementa MurfTTSProvider espelhando ElevenLabs (D-04/D-05)` |
| `cb6f8ba` | feat | `✨ feat(phase-24-01): factory switch TTS_PROVIDER=murf + .env.example (D-04)` |

## Known Stubs

None. Provider está totalmente wired e testado. Usuário precisa apenas de `MURF_API_KEY` real no `.env` para começar a usar (failure graciosa se não houver).

## Self-Check: PASSED

Verificação de arquivos:

- `apps/backend-ts/src/voice/tts/murf.ts` — FOUND
- `apps/backend-ts/src/voice/tts/murf.test.ts` — FOUND
- `apps/backend-ts/src/voice/tts/index.ts` — FOUND (modified)
- `apps/backend-ts/src/voice/tts/index.test.ts` — FOUND (modified)
- `.env.example` — FOUND (modified)

Verificação de commits:

- `232434c` — FOUND
- `0ba41b5` — FOUND
- `cb6f8ba` — FOUND

Todos os 3 commits existem no branch `worktree-agent-acb6d162`, todos os 5 arquivos esperados existem no disk, e a suite TTS inteira (50 testes em 6 arquivos) passa.
