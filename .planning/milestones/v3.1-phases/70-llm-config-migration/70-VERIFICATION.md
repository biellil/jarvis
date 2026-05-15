---
phase: 70-llm-config-migration
verified: 2026-05-12T13:30:00Z
status: human_needed
score: 11/11 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Smoke test boot Electron com store legado simulado"
    expected: "Console mostra log [migration] LLM config: migrated N key(s) to .env [...]; M already present [...]; X store key(s) cleaned; arquivo .env contém as keys migradas; ~/.config/jarvis-desktop/config.json NÃO contém mais llmProvider/lmStudioUrl/*ApiKey/streamingLMStudioEventsEnabled"
    why_human: "Migração só roda em runtime do Electron (app.whenReady → main process). Tests cobrem pure function isoladamente; runtime hook não é testado programaticamente. Validar fim-a-fim requer pré-popular store JSON manualmente e bootar."
  - test: "Smoke test Settings UI — abrir Configurações no app rodando"
    expected: "Nav lateral mostra: Push-to-Talk, Always-Listening, TTS, Whisper Model, Wake Word, Vision/Hotkeys, Proactive Notifications. NÃO mostra 'LLM' nem 'Servidor MCP'. Nenhum dropdown de provider, nenhum campo API key, nenhum campo LM Studio URL, nenhum toggle de streaming events visível em qualquer section."
    why_human: "Verificação visual da UI requer renderização real. Static analysis confirma componentes deletados, mas pixel-level / nav-list real precisa olho humano."
  - test: "Restart aplica novo provider via .env"
    expected: "Editar .env, mudar LLM_PROVIDER=lmstudio para LLM_PROVIDER=openai (com OPENAI_API_KEY válido), reiniciar app, fazer pergunta → resposta vem do OpenAI (não LM Studio). Backend startup log mostra provider correto."
    why_human: "Requer LLM real respondendo + observação manual de qual provider atendeu. Roadmap Success Criterion 4 explícito sobre restart."
  - test: "Migração idempotente — segunda execução"
    expected: "Bootar pela segunda vez após primeira migração: console NÃO mostra log [migration] (early return D-03 porque store sem keys LLM); arquivo .env permanece idêntico ao da primeira run; nenhuma duplicação."
    why_human: "Pure function tests cobrem (test #8), mas idempotência ao nível de runtime + filesystem requer observação."
---

# Phase 70: LLM Config Migration — Verification Report

**Phase Goal:** Usuário vê uma Settings UI sem seções "LLM Provider" e "Servidor MCP"; backend lê toda config LLM do `.env`; configs existentes migram automaticamente sem intervenção manual.
**Verified:** 2026-05-12T13:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Settings UI não exibe dropdown provider, API keys (Gemini/OpenAI/Anthropic) nem campo LM Studio URL (SC-1, SIMP-01) | ✓ VERIFIED | `LlmSection.tsx` deletado; `SettingsLayout.tsx` SectionKey union sem `'llm'`; NAV_ITEMS sem entry "LLM"; nenhum state var `lmStudioUrl`/`llmProvider`/`*ApiKey` no SettingsLayout (grep zero) |
| 2 | Settings UI não exibe seção "Servidor MCP" (toggle + lista clientes) (SC-2, SIMP-02) | ✓ VERIFIED | `McpSection.tsx` deletado; SectionKey union sem `'mcp-server'`; nenhum ref `handleMcpClientReload` no SettingsLayout; `window.mcp` bridge deletado de preload |
| 3 | Primeiro startup migra electron-store legado para `.env` sem intervenção manual (SC-3, SIMP-03) | ✓ VERIFIED | `migrateLlmConfigToEnv` pure fn (179 linhas, 10/10 tests pass); `runLlmConfigMigration` runner com atomic write + batch delete; hook em `index.ts:18` chamado antes de `process.loadEnvFile` em `:27`; idempotência D-03 via early-return quando store sem keys |
| 4 | Backend lê LLM_PROVIDER, GEMINI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, LM_STUDIO_URL do `.env` no startup (SC-4, SIMP-04) | ✓ VERIFIED | `apps/backend-ts/src/llm/config.ts:12-37` define Zod schema completo; 5 chaves enumeradas + `USE_LM_STUDIO_STREAMING_EVENTS` via `z.preprocess` corrigido; 20/20 tests pass em config.test.ts |
| 5 | Backend não expõe mais `/internal/reload-llm` nem `/internal/mcp-client/*` (SIMP-04, dead code) | ✓ VERIFIED | `apps/backend-ts/src/routes/reload-llm.ts` deletado; `apps/backend-ts/src/routes/mcp-client.ts` deletado; `app.ts` sem `createReloadLlmRouter`/`createMcpClientRouter` (grep zero) |
| 6 | `.env.example` canônico com USE_LM_STUDIO_STREAMING_EVENTS=false + GEMINI_API_KEY= + comments (D-08, SIMP-01 doc) | ✓ VERIFIED | linhas 12-13 com comments D-08; linha 14 `USE_LM_STUDIO_STREAMING_EVENTS=false`; linha 17 `GEMINI_API_KEY=`; posicionado abaixo de LM_STUDIO_MODEL e antes de OPENAI_API_KEY |
| 7 | Schema interface (6 entries) + 10 accessors LLM removidos de `store.ts` (SIMP-04 store-side) | ✓ VERIFIED | Apenas comentário sobre Phase 70 na linha 52; grep por `lmStudioUrl/llmProvider/*ApiKey/streamingLMStudioEventsEnabled/get*/set*` retorna zero matches funcionais |
| 8 | IPC handlers LLM_SET_PROVIDER, RELOAD_LLM, STREAMING_LM_STUDIO_EVENTS_SET removidos + payload `settings:get` sem 6 fields LLM (SIMP-04 IPC-side) | ✓ VERIFIED | `ipc/settings.ts` sem grep matches; 6 handlers restantes (whisper, settings, wake-word, etc.) preservados; payload retorna shape sem fields LLM |
| 9 | Preload bridge `window.settings.reloadLlm/setLlmProvider/setStreamingLMStudioEventsEnabled` + `window.mcp` extintos | ✓ VERIFIED | `preload/settings.ts` sem channels LLM/MCP nem methods; bloco `exposeInMainWorld('mcp', ...)` removido; `window.settings` bridge intact com sobreviventes |
| 10 | Types LlmProvider/ReloadLlmRequest/McpClientStatus extintos do ipc-types.ts; cascade global limpo | ✓ VERIFIED | `ipc-types.ts` zero matches; cascade global mostra apenas: (a) cópia LOCAL standalone em `llm-config.ts` (intencional + documentado), (b) comentários em `mcp/client/manager.ts`, (c) mock names em `SettingsForm.test.tsx` (mocks órfãos que não afetam funcionalidade) |
| 11 | Zod schema USE_LM_STUDIO_STREAMING_EVENTS trata "false" string corretamente como false (T-70-06 mitigation) | ✓ VERIFIED | `llm/config.ts:25-28` usa `z.preprocess` em vez de `z.coerce.boolean()` quebrado; test guardrail RED/GREEN aplicado (4 cenários em config.test.ts cobrem "true"/"false"/missing/boolean literal) |

**Score:** 11/11 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/desktop/src/main/migrations/llm-config.ts` | Pure migration function | ✓ VERIFIED | 181 linhas, exports LLM_STORE_KEYS, LlmStoreSnapshot, MigrationResult, migrateLlmConfigToEnv; importado em runner + test |
| `apps/desktop/src/main/migrations/llm-config-runner.ts` | I/O wrapper com atomic write + batch delete + CR-01 chmod 0600 | ✓ VERIFIED | 121 linhas; CR-01 security fix aplicado (chmod 0o600 + applyRestrictivePerms helper); importado em `index.ts:11` |
| `apps/desktop/src/main/migrations/__tests__/llm-config.test.ts` | 9 cenários do test matrix + WR-02 guard | ✓ VERIFIED | 10 testes (9 originais + WR-02 empty-string llmProvider guard); 10/10 passing |
| `apps/desktop/src/main/index.ts` | Hook D-04 antes de loadEnvFile | ✓ VERIFIED | Import linha 11; chamada linha 18 (try/catch non-fatal); loadEnvFile linha 27 (ordem OK) |
| `apps/desktop/src/main/store.ts` | Schema sem 6 LLM entries + sem 10 accessors | ✓ VERIFIED | Grep zero matches funcionais; default export `store` preservado; outros accessors (whisper/kokoro/ptt) intactos |
| `apps/backend-ts/src/app.ts` | Sem reload-llm/mcp-client routers | ✓ VERIFIED | Imports e `app.use` removidos; outros routers preservados |
| `apps/backend-ts/src/llm/config.ts` | z.preprocess para USE_LM_STUDIO_STREAMING_EVENTS | ✓ VERIFIED | Linhas 25-28 com fix; comentário explicativo OQ-1 |
| `.env.example` | USE_LM_STUDIO_STREAMING_EVENTS=false + GEMINI_API_KEY= | ✓ VERIFIED | Linhas 12-17 com comments D-08 |
| `apps/desktop/src/renderer/src/settings/SettingsLayout.tsx` | Sem LLM/MCP imports/state/handlers/nav/switch | ✓ VERIFIED | SectionKey union limpa; activeSection default `'ptt'` preservado |
| `apps/desktop/src/main/ipc/settings.ts` | Sem 3 handlers LLM/MCP + sem 6 payload fields | ✓ VERIFIED | 6 ipcMain.handle restantes (não-LLM/MCP) |
| `apps/desktop/src/main/ipc/index.ts` | Sem setupMcpSettingsHandlers | ✓ VERIFIED | Grep zero |
| `apps/desktop/src/preload/settings.ts` | Sem channels/methods LLM/MCP + sem window.mcp | ✓ VERIFIED | Grep zero |
| `apps/desktop/src/shared/ipc-types.ts` | Sem types/channels/fields LLM/MCP | ✓ VERIFIED | Grep zero |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `index.ts` | `migrations/llm-config-runner.ts` | `import runLlmConfigMigration` + chamada ANTES de loadEnvFile | ✓ WIRED | Linhas 11 (import), 18 (call), 27 (loadEnvFile) — ordering correta D-04 |
| `llm-config-runner.ts` | `store.ts` | `store.get('llmProvider')` etc. + `store.store = current` batch delete | ✓ WIRED | Linhas 54-61 (snapshot via direct .get); linha 109 (batch delete) |
| `llm-config-runner.ts` | `migrations/llm-config.ts` | `import migrateLlmConfigToEnv, LLM_STORE_KEYS` | ✓ WIRED | Linha 24 import; linha 70 call |
| `llm-config.ts` | `dotenv` | `import { parse as parseDotenv } from 'dotenv'` | ✓ WIRED | Linha 16; `apps/desktop/package.json` declara `"dotenv": "^17.4.2"` |
| `app.ts` (backend) | (rotas deletadas) | ausência de imports | ✓ WIRED (negativo) | grep zero para createReloadLlmRouter/createMcpClientRouter |
| `ipc/index.ts` | (mcp-settings deletado) | ausência de setupMcpSettingsHandlers | ✓ WIRED (negativo) | grep zero |
| `SettingsLayout.tsx` | `window.settings.get()` | retorna shape sem fields LLM | ✓ WIRED | settings:get handler payload sem lmStudioUrl/llmProvider/*ApiKey |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `migrateLlmConfigToEnv` | `parsed[envKey]` | `parseDotenv(envContent)` real (não mock) | Sim — dotenv lib produz Record<string,string> real | ✓ FLOWING |
| `runLlmConfigMigration` | `snapshot` | `store.get(key)` direto no electron-store JSON | Sim — store é singleton da app, persistido em disk | ✓ FLOWING |
| `runLlmConfigMigration` (write) | `result.newEnvContent` | `writeFileSync(tmpPath) + renameSync` com mode 0o600 (CR-01) | Sim — atomic write real ao FS | ✓ FLOWING |
| `runLlmConfigMigration` (delete) | `current = { ...store.store }` | batch delete via `store.store = current` | Sim — electron-store persiste 1 write atômico | ✓ FLOWING |
| Backend `loadConfig` | `process.env.LLM_PROVIDER` etc. | `process.loadEnvFile(envPath)` populou após migration | Sim — Zod parse fail-fast com error claro | ✓ FLOWING |
| `SettingsLayout` data | `settings` payload | `window.settings.get()` IPC → `settings:get` handler em `ipc/settings.ts` | Sim — store-backed real (sem stubs) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Migration pure function tests pass | `pnpm exec vitest run src/main/migrations/__tests__/llm-config.test.ts` (desktop) | Test Files 1 passed; Tests 10 passed | ✓ PASS |
| Backend Zod schema tests pass (incl. boolean coerce guard) | `pnpm exec vitest run src/llm/config.test.ts` (backend-ts) | Test Files 1 passed; Tests 20 passed | ✓ PASS |
| Desktop IPC settings tests pass | `pnpm exec vitest run src/main/ipc/__tests__/settings.test.ts` (desktop) | Test Files 1 passed; Tests 39 passed | ✓ PASS |
| Store tests pass after mock strip | `pnpm exec vitest run src/main/__tests__/store.test.ts` (desktop) | Test Files 1 passed; Tests 40 passed | ✓ PASS |
| SettingsForm/Layout tests pass | `pnpm exec vitest run src/renderer/src/settings/__tests__/SettingsForm.test.tsx` (desktop) | Test Files 1 passed; Tests 23 passed, 2 skipped (Radix portal) | ✓ PASS |
| Workspace typecheck verde | `pnpm exec tsc --noEmit` (root) | 0 erros TS | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SIMP-01 | 70-02, 70-03 | Settings UI sem seção LLM Provider | ✓ SATISFIED | LlmSection deletado + SettingsLayout strippado; UI verificação visual pendente em human_verification |
| SIMP-02 | 70-03 | Settings UI sem seção Servidor MCP | ✓ SATISFIED | McpSection deletado + nav entry removido + ipc/mcp-settings.ts deletado + window.mcp removido |
| SIMP-03 | 70-01 | Migração automática electron-store → .env primeira execução | ✓ SATISFIED (smoke pendente) | Pure function 10/10 tests; runner com atomic write + chmod 0o600 (CR-01); hook D-04 antes de loadEnvFile; smoke test runtime em human_verification |
| SIMP-04 | 70-01, 70-02, 70-03 | Backend lê todas as LLM keys do .env no startup; restart aplica mudanças | ✓ SATISFIED (restart smoke pendente) | Zod schema canônico em config.ts; routes dead-code deletadas; store accessors deletados; IPC handlers deletados; restart-aplica-provider em human_verification |

**Orphaned requirements:** Nenhuma. REQUIREMENTS.md atribui apenas SIMP-01..04 a Phase 70 e todas estão cobertas.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `apps/desktop/src/renderer/src/settings/__tests__/SettingsForm.test.tsx` | 48-49, 68-69 | Mocks órfãos `lmStudioUrl/llmProvider/setLmStudioUrl/setLlmProvider` em `mockSettingsGet` payload e `window.settings` mock | ℹ️ Info | Funcionalmente benigno: mocks são setup que o código real nunca consome (SettingsForm = re-export de SettingsLayout, que perdeu LLM refs); 23/25 tests passam. Cosmético — limpeza recomendada mas não bloqueia phase goal. |
| `apps/backend-ts/src/app.ts` | 40-41 | `createProactiveRouter()` montado em 2 prefixes (`/api/proactive` e `/api/settings`) | ⚠️ Warning (pré-existente) | WR-03 do REVIEW — não introduzido por Phase 70; bug Phase 67 que escapou. Não bloqueia phase goal. |
| `apps/desktop/src/main/store.ts` | 52 | Comentário histórico "Phase 70 — LLM config" referencia chaves removidas | ℹ️ Info | Intencional — comentário documentando o strip; mantido para arqueologia do código. |

**REVIEW.md status:**
- CR-01 (Critical, .env mode 0o600) → **RESOLVIDO** (commit 4ed1647): runner aplica `writeFileSync(...mode:0o600)` + `applyRestrictivePerms` defensive chmod
- WR-02 (Warning, empty-string llmProvider guard) → **RESOLVIDO**: `extractStoreValue` linha 111 guarda contra `''`; test #10 valida (WR-02 guard test)
- WR-01, WR-03, WR-04 → Warnings pré-existentes ou cosméticos; não bloqueiam phase goal

### Deferred Items (filtrados Step 9b)

Nenhum item deferido para phases futuras dentro do milestone v3.1. Roadmap v3.1 tem apenas Phase 71 (Distribution) restante, que não cobre nenhum gap relacionado a SIMP-01..04. Itens deferidos genuínos (TypeScript errors pré-existentes, Vitest 4.x migration, AudioContext mocks etc.) estão documentados em `deferred-items.md` mas são out-of-scope explícito — não são gaps do phase goal.

### Human Verification Required

Phase 70 atinge todos os 11 must-haves programaticamente verificáveis, mas requer 4 verificações humanas para fechar end-to-end:

1. **Smoke boot com store legado** — pré-popular electron-store com 6 keys LLM, bootar Electron, observar log `[migration]` no console e diff em `config.json` + `.env`
2. **UI visual da Settings** — abrir Settings no app rodando, confirmar nav sem "LLM"/"Servidor MCP" e nenhum dropdown/campo de provider/API key visível
3. **Restart aplica provider** — editar `.env`, restart, confirmar provider novo atende
4. **Idempotência runtime** — segundo boot é silencioso (no log `[migration]`, no diff em `.env`)

Veja seção `human_verification:` do frontmatter para detalhes.

### Gaps Summary

Nenhum gap funcional encontrado. Toda implementação esperada está presente no código:
- Pure function migration + runner + hook em index.ts (Plan 01)
- Routes dead-code deletadas + Zod fix + .env.example canonizado (Plan 02)
- UI/IPC/types stripped (Plan 03)
- Security fix CR-01 aplicado (chmod 0o600 + atomic write com mode option)
- WR-02 guard aplicado

Os 4 itens em `human_verification:` não são gaps — são confirmações finais que exigem runtime/visual observation que o verifier automatizado não pode fazer sem rodar o Electron app interativamente.

**Mocks órfãos em SettingsForm.test.tsx (linhas 48-49, 68-69):** cosméticos; tests passam; recomendado limpeza em phase futura ou junto com Phase 71 cleanup, mas não bloqueia goal achievement.

---

_Verified: 2026-05-12T13:30:00Z_
_Verifier: Claude (gsd-verifier)_
