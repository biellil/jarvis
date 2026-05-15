# Phase 70: LLM Config Migration - Context

**Gathered:** 2026-05-11
**Status:** Ready for planning

<domain>
## Phase Boundary

A configuração LLM do JARVIS deixa de ser editável via Settings UI. Toda config (provider, API keys, LM Studio URL, streaming events flag) vive exclusivamente no arquivo `.env` na raiz do monorepo. O backend (que já lê do `.env` via `loadConfig()` em `apps/backend-ts/src/llm/config.ts`) é a única fonte. Renderer não tem mais conhecimento de provider.

Migração automática: no boot do Electron, valores que hoje residem em electron-store (`llmProvider`, `lmStudioUrl`, `geminiApiKey`, `openaiApiKey`, `anthropicApiKey`, `streamingLMStudioEventsEnabled`) são gravados nas keys correspondentes do `.env` apenas se a key ainda não existe ou está vazia; após gravação bem-sucedida, as keys são removidas do electron-store. Idempotente — pode rodar a cada boot sem efeito colateral.

Settings UI perde as seções "LLM Configuration" e "Servidor MCP" (incluindo o sub-block "Cliente MCP" preservado por P69 D-11). IPCs LLM (`llm:reload`, `llm:set-provider`, `llm:set-streaming-events`) e IPCs MCP Client (`mcp-client:reload`, `mcp-client:status`, broadcast `mcp-client:status-changed`) são deletados — `window.mcp` bridge inteiro some do preload.

Backend endpoint `POST /internal/reload-llm` é deletado: "restart aplica novo provider" significa restart de processo do Electron, não hot reload. O env-watcher de MCP-CLI (P65, `apps/backend-ts/src/index.ts §85-90`) **não é estendido** para LLM — mantém somente reload do MCP Client conforme atual.

**Fora de escopo desta phase:**
- Localização writable de `.env` em packaged app (P71 trata via `app.getPath('userData')` ou equivalente)
- Hot reload de LLM via `.env` watcher (decisão consciente — restart é literal)
- Migração de outras keys do electron-store não-LLM (whisper, kokoro, ptt, etc. permanecem)
- Distribuição multi-plataforma (P71)

</domain>

<scout_findings>
## Scout findings — alinhamento com o código atual

### Backend já lê `.env` (SIMP-04 quase pronto)
`apps/backend-ts/src/llm/config.ts:12-32` define Zod schema com `LLM_PROVIDER`, `LM_STUDIO_URL`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `USE_LM_STUDIO_STREAMING_EVENTS` — todos com defaults. `loadConfig()` parseia `process.env` no startup, falha-fast se inválido. **SIMP-04 já está implementado pelo lado do backend** — Phase 70 não toca este arquivo.

### Renderer → backend hoje passa por IPC + HTTP
Fluxo atual de mudança de provider:
1. `LlmSection.tsx` chama `window.settings.reloadLlm(...)`
2. Preload IPC `llm:reload` → main handler `apps/desktop/src/main/ipc/settings.ts:316-364`
3. Main faz `fetch('http://localhost:8001/internal/reload-llm', { body: { provider, lmStudioUrl, openaiApiKey, ... } })`
4. Backend `apps/backend-ts/src/routes/reload-llm.ts:30` reaplica config sem ler `.env`

P70 demole esse fluxo inteiro. Sem renderer-driven reload, o endpoint `/internal/reload-llm` e tudo entre os passos 1-4 fica órfão.

### `.env` é carregado de path dev-only
`apps/desktop/src/main/index.ts:15` resolve `path.resolve(import.meta.dirname, '../../../../.env')` — monorepo root. Funciona em dev (`pnpm dev` roda do root). **Quebra em packaged app** (P71 problema). Phase 70 mantém esse path inalterado.

### `process.loadEnvFile` é Node 21+ nativo
`apps/desktop/src/main/index.ts:16` usa `process.loadEnvFile(envPath)` — sem dependência de `dotenv`. Backend usa `dotenv` (via `parse`) só em `apps/backend-ts/src/mcp/client/env-diff.ts` para diff parsing. Migração precisa **escrever** `.env`, não só ler — `process.loadEnvFile` não cobre writes. Opções: implementar serializer simples (Plan-phase decide) ou adicionar `dotenv` no `apps/desktop`.

### Padrão de hot-reload via .env existe (P65)
`apps/backend-ts/src/index.ts:85-90` + `apps/backend-ts/src/config/env-watcher.ts` + `apps/backend-ts/src/mcp/client/env-diff.ts` formam um chokidar watcher que detecta mudança em `MCP_SERVER_*` no `.env` e dispara `mcpManager.reload()`. **Não estender para LLM nesta phase** (decisão C-01) — manter restart-only por simplicidade.

### electron-store schema atual das keys LLM
`apps/desktop/src/main/store.ts`:
- `lmStudioUrl?: string` (linha 49) + getter/setter §292-298
- `llmProvider?: LlmProvider` (linha 51) + getter/setter §305-317
- `streamingLMStudioEventsEnabled?: boolean` (linha 59) + getter/setter §375-381
- `geminiApiKey?: { key: string }` (linha 61) + getter/setter §390-395
- `openaiApiKey?: { key: string }` (linha 62) + getter/setter §399-403
- `anthropicApiKey?: { key: string }` (linha 63) + getter/setter §407-411

Aproximadamente 120 linhas de schema + accessors saem do store.ts.

### LlmSection consome 8 props
`LlmSection.tsx:32-44` recebe via SettingsLayout: `lmStudioUrl`, `onLmStudioUrlChange`, `llmProvider`, `onLlmProviderChange`, `openaiApiKey`, `anthropicApiKey`, `geminiApiKey`, `onReloadLlm`, `streamingLMStudioEventsEnabled`, `onStreamingLMStudioEventsChange`. Todos esses props somem de `SettingsSectionProps` em SettingsLayout.

### `llm:provider-changed` event broadcast
`apps/desktop/src/main/ipc/settings.ts:234` envia `mainWindow.webContents.send('llm:provider-changed', provider)` quando `LLM_SET_PROVIDER` handler executa. Grep mostra **zero listeners** no renderer. Confirma C-03 — evento é órfão, deleta junto.

### MCP HTTP routes ficam vivas ou somem?
`apps/backend-ts/src/routes/mcp-client.ts` (`/internal/mcp-client/reload`, `/status`) seguem o padrão de `reload-llm.ts`. Hoje são chamadas indiretamente pelo IPC handler do Electron. Sem IPC, ninguém chama. **Decisão Claude's Discretion no planner**: deletar junto (consistente com filosofia) ou manter como dev tool (mais conservador). Recomendação: deletar para minimizar surface area.

</scout_findings>

<decisions>
## Implementation Decisions

### Migração + `.env` location

- **D-01 (Área 1):** Local do `.env` permanece no monorepo root (`apps/desktop/src/main/index.ts:15` inalterado). Migração escreve no mesmo path. Localização writable em packaged app é problema de P71. *Razão:* sem usuários packaged em produção ainda; em dev o `.env` já está populado pelo workflow `.env.example` → `.env`.
- **D-02 (Área 1):** Estratégia de conflito — **`.env` vence**. Para cada key, se o `.env` já contém a key com valor não-vazio, migração **não sobrescreve**. Só preenche keys ausentes do `.env` ou keys presentes com valor vazio (`KEY=`). *Razão:* usuário que editou `.env` manualmente preserva suas escolhas; SIMP-03 fala em migração de configs existentes, não em sincronização contínua.
- **D-03 (Área 1):** Detecção idempotente sem flag. Migração roda a cada boot. No-op natural quando: (a) electron-store não tem mais as keys (já apagadas pela run anterior — D-06), ou (b) `.env` já tem todas as keys preenchidas. Zero estado extra em electron-store ou disk. *Razão:* simplicidade > defensividade; D-06 garante que migração apaga sua própria fonte de input.
- **D-04 (Área 1):** Hook point — migração executa em `apps/desktop/src/main/index.ts` **antes** de `process.loadEnvFile(envPath)` (linha 16). Sequência:
  1. (novo) `migrateLlmConfigToEnv(envPath)` — lê electron-store + lê `.env`, faz diff, grava `.env`
  2. `process.loadEnvFile(envPath)` — carrega arquivo já atualizado para `process.env`
  3. (existente) spawn do backend-ts via `backend-client.ts` herda `process.env` correto

  *Razão:* evita race entre disk write e in-memory `process.env`. Backend-ts spawn lê `.env` atualizado direto do disco via seu próprio loader.
- **D-05 (Área 1):** Se `.env` **não existir** no path resolvido, migração é **no-op total** (não cria arquivo novo). Log warning informativo: `[migration] .env not found at <path>, skipping`. *Razão:* em dev `.env` sempre existe (workflow obrigatório copiar de `.env.example`); criar arquivo sem template do `.env.example` pode resultar em arquivo malformado/incompleto. P71 lida com o caso packaged.
- **D-06 (Área 1):** Cleanup do electron-store — após gravação bem-sucedida no `.env` para uma key (ou após constatar que `.env` já tem essa key e migração foi skipped por D-02), **deletar a key correspondente do electron-store**. Cobre: `llmProvider`, `lmStudioUrl`, `geminiApiKey`, `openaiApiKey`, `anthropicApiKey`, `streamingLMStudioEventsEnabled`. *Razão:* API keys em settings.json plaintext são risco de privacidade; deletion é consistente com a remoção dos accessors em D-12; e zera o input pra futuras runs (reforça D-03 idempotência).

### Streaming LM Studio Events

- **D-07 (Área 2):** `streamingLMStudioEventsEnabled` do electron-store migra como `USE_LM_STUDIO_STREAMING_EVENTS` no `.env`. Backend Zod schema (`apps/backend-ts/src/llm/config.ts:23`) já espera essa key com `z.coerce.boolean().default(false)`. Migração serializa o boolean como `true`/`false` literal. *Razão:* consistência total com outras keys LLM.
- **D-08 (Área 2):** `.env.example` ganha entrada `USE_LM_STUDIO_STREAMING_EVENTS=false` com comentário curto explicando: "true = usa SSE nativo /api/v1/chat do LM Studio (mais rápido); false = fallback OpenAI-compat". Inserir abaixo de `LM_STUDIO_MODEL` na section "LLM". *Razão:* dev users devem ver a flag explicitamente; sem isso vira config invisível.

### Backend reload — restart-only

- **D-09 (Área 3):** "Restart aplica novo provider" (ROADMAP critério 4) significa **restart de processo do Electron**, não hot reload. Backend lê `.env` somente em `loadConfig()` no startup. Sem watcher LLM, sem reload IPC. *Razão:* SIMP-04 fala em restart explícito; minimiza surface area e código; o pattern de `.env` watcher existe (P65) mas estendê-lo para LLM é otimização prematura.
- **D-10 (Área 3):** Deletar `apps/backend-ts/src/routes/reload-llm.ts` completamente. Remover import e `app.use(createReloadLlmRouter(...))` de `apps/backend-ts/src/app.ts:6`. Sem callers após P70. *Razão:* dead code; mantê-lo como "dev tool" é hipotético (planner pode preservar se identificar use case real, mas default é deletar).
- **D-11 (Área 3):** Deletar IPCs no Electron:
  - `IPC_CHANNELS.LLM_SET_PROVIDER` (`'llm:set-provider'`) + handler em `settings.ts:226-244`
  - `IPC_CHANNELS.RELOAD_LLM` (`'llm:reload'`) + handler em `settings.ts:316-364`
  - `IPC_CHANNELS.STREAMING_LM_STUDIO_EVENTS_SET` (`'streaming-lm-studio-events:set'`) + handler em `settings.ts:277-309`
  - Preload bridge methods em `apps/desktop/src/preload/settings.ts`: `reloadLlm`, `setLlmProvider`, `setStreamingLMStudioEventsEnabled`, e os channels `RELOAD_LLM_CHANNEL`, `LLM_SET_PROVIDER_CHANNEL`, `STREAMING_LM_STUDIO_EVENTS_SET_CHANNEL`
  - Types em `apps/desktop/src/shared/ipc-types.ts`: `ReloadLlmRequest`, `LlmProvider` (avaliar — pode ser usado em outros lugares; planner decide), e as channel keys correspondentes
- **D-12 (Área 3):** Investigar `'llm:provider-changed'` broadcast em `settings.ts:234`. Scout confirmou **zero listeners** no renderer. Deletar junto com `LLM_SET_PROVIDER` handler. *Razão:* evento órfão, no-op atual.

### Settings UI cleanup

- **D-13 (Área 4):** Deletar arquivos:
  - `apps/desktop/src/renderer/src/settings/sections/LlmSection.tsx`
  - `apps/desktop/src/renderer/src/settings/sections/McpSection.tsx`
  - Tests correspondentes em `apps/desktop/src/renderer/src/settings/sections/__tests__/` (verificar `LlmSection.test.tsx`, `McpSection.test.tsx` e qualquer test que importe os sections)
  *Razão:* deletion pura — consistente com filosofia cirúrgica P68/P69.
- **D-14 (Área 4):** Remover do `SettingsLayout.tsx`:
  - State variables: `lmStudioUrl`, `llmProvider`, `streamingLMStudioEventsEnabled`, `openaiApiKey`, `anthropicApiKey`, `geminiApiKey`, `mcpClients` (e qualquer state MCP Client residual)
  - Handlers: `handleLmStudioUrlChange`, `handleLlmProviderChange`, `handleReloadLlm`, `handleStreamingLMStudioEventsChange`, `handleMcpClientReload`
  - SectionKey union: remover `'llm'` e `'mcp-server'`
  - Nav entries (linhas 30-31 aprox): "LLM" e "Servidor MCP"
  - Imports: `LlmSection`, `McpSection`
  - Props passados no fetch settings (linhas 156-164, 181-182, 528-536, 555)
  - Type `SettingsSectionProps`: remover prop interfaces LLM + MCP
  - Default section ativa: ajustar para um valid key remanescente (Whisper, Hotkey, etc.)
- **D-15 (Área 4):** Reload MCP Client button **some completamente**. Sem replacement UI. *Razão:* env-watcher de P65 (`apps/backend-ts/src/index.ts:85-90` + `config/env-watcher.ts` + `mcp/client/env-diff.ts`) já detecta mudanças em `MCP_SERVER_*` no `.env` e dispara `mcpManager.reload()` automaticamente. User edita `.env`, hot reload acontece. Status do client fica acessível via logs ou (se planner manter) endpoint HTTP `/internal/mcp-client/status` para curl.
- **D-16 (Área 4):** Deletar IPCs MCP Client + `window.mcp` bridge inteiro:
  - `apps/desktop/src/main/ipc/mcp-settings.ts` — arquivo inteiro deletado (P69 D-07 já tinha removido handlers server-side; aqui finaliza com remoção dos 3 handlers client + broadcast)
  - Handlers a remover: `MCP_CLIENT_RELOAD`, `MCP_CLIENT_GET_STATUS`, broadcast `MCP_CLIENT_STATUS_CHANGED`
  - `apps/desktop/src/preload/settings.ts` — apaga `contextBridge.exposeInMainWorld('mcp', ...)` inteiro
  - `apps/desktop/src/shared/ipc-types.ts` — remove channels `MCP_CLIENT_RELOAD`, `MCP_CLIENT_GET_STATUS`, `MCP_CLIENT_STATUS_CHANGED` (§325-327) e types `McpClientStatus` (§476-499)
  - `apps/desktop/src/main/main.ts` ou onde `setupMcpSettingsHandlers()` é chamado — remove a chamada
- **D-17 (Área 4):** Apagar do `apps/desktop/src/main/store.ts`:
  - Schema interface entries (§49, §51, §59, §61, §62, §63): `lmStudioUrl`, `llmProvider`, `streamingLMStudioEventsEnabled`, `geminiApiKey`, `openaiApiKey`, `anthropicApiKey`
  - JSON Schema entries correspondentes (se houver — verificar `schemaShape`)
  - Accessors §292-317 (`getLmStudioUrl`, `setLmStudioUrl`, `getLlmProvider`, `setLlmProvider`)
  - Accessors §375-381 (`getStreamingLMStudioEventsEnabled`, `setStreamingLMStudioEventsEnabled`)
  - Accessors §390-411 (`getGeminiApiKey`, `setGeminiApiKey`, `getOpenaiApiKey`, `setOpenaiApiKey`, `getAnthropicApiKey`, `setAnthropicApiKey`)

  Reduz ~120 linhas. Migração (D-06) usa `store.delete(key)` antes dos accessors serem removidos — então a função de migração lê via `store.get(key)` direto, sem depender dos getters.
- **D-18 (Área 4):** Atualizar `apps/desktop/src/main/ipc/settings.ts` payload de `settings:get` (linhas 83-90): remover `lmStudioUrl`, `llmProvider`, `streamingLMStudioEventsEnabled`, `openaiApiKey`, `anthropicApiKey`, `geminiApiKey`, `mcpServerEnabled` (já removido em P69 D-08 — confirmar). Tipo `SettingsApi['get']` retorno em ipc-types ajustado.
- **D-19 (Área 4):** Atualizar `apps/desktop/src/main/ipc/__tests__/settings.test.ts` — remover mocks de `getLmStudioUrl`, `getLlmProvider`, `getOpenaiApiKey`, etc., e quaisquer fixtures/expectations que mencionem essas keys no payload.

### MCP HTTP routes — Claude's Discretion

- **D-20 (Área 3 follow-up):** `apps/backend-ts/src/routes/mcp-client.ts` (`/internal/mcp-client/{reload,status}`) — recomendação: deletar junto, sem callers após P70. Planner pode preservar se identificar utilidade dev (curl manual para inspecionar status). Default: deletar para minimizar surface area.

### Claude's Discretion

- Ordem dos plans dentro da phase: provavelmente (1) migração + electron-store cleanup; (2) backend route deletion + .env.example update; (3) renderer + IPC strip + tests. Planner decide.
- Implementação da migração: parser simples (regex-based) ou adicionar `dotenv` como dep em `apps/desktop/package.json` (e usar `dotenv.parse` + writer custom). Recomendação: dotenv parse + writer custom (menos código, formato preservado).
- Logging da migração: silencioso vs informativo. Recomendação: log informativo curto no console (`[migration] migrated 3 keys to .env: LLM_PROVIDER, OPENAI_API_KEY, USE_LM_STUDIO_STREAMING_EVENTS`) — útil pro dev e zero ruído quando no-op.
- Comentários históricos `// Phase 57 (LLM-PROV-01)`, `// Phase 60 (LLM-PROV-02)`, `// Phase 52 (SEXT-01/02)` em arquivos remanescentes — limpar ou deixar. Claude's discretion.
- Section default ativa em SettingsLayout após remover 'llm' (era default?) — verificar e ajustar para 'whisper' ou primeira key restante.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Migração + .env (core implementation)
- `apps/desktop/src/main/index.ts` §12-18 — hook point da migração (D-04)
- `.env.example` — adicionar `USE_LM_STUDIO_STREAMING_EVENTS=false` com comentário (D-08); seção "LLM" abaixo de `LM_STUDIO_MODEL`
- `apps/desktop/src/main/store.ts` §49, §51, §59, §61, §62, §63 — schema entries a apagar (D-17); §292-317, §375-381, §390-411 — accessors a apagar (D-17)

### Backend (delete LLM reload path)
- `apps/backend-ts/src/llm/config.ts` — Zod schema atual (NÃO TOCAR, já está correto); referência canonical do contrato `.env` ↔ backend
- `apps/backend-ts/src/routes/reload-llm.ts` — apagar arquivo inteiro (D-10)
- `apps/backend-ts/src/app.ts` §6 — remover import + `app.use` do reload-llm router (D-10)
- `apps/backend-ts/src/routes/mcp-client.ts` — avaliar deletion (D-20 Claude's discretion)
- `apps/backend-ts/src/index.ts` §85-90 — env-watcher de MCP-CLI (NÃO TOCAR, P70 não estende para LLM por D-09)

### Electron — IPC + preload (strip cirúrgico)
- `apps/desktop/src/main/ipc/settings.ts` §83-90 — payload de `settings:get` (D-18); §226-244 — handler LLM_SET_PROVIDER (D-11); §277-309 — handler STREAMING_LM_STUDIO_EVENTS_SET (D-11); §316-364 — handler RELOAD_LLM (D-11)
- `apps/desktop/src/main/ipc/mcp-settings.ts` — deletar arquivo inteiro (D-16)
- `apps/desktop/src/preload/settings.ts` §18 (RELOAD_LLM_CHANNEL), §51 (reloadLlm method), e qualquer outra prop LLM em `window.settings`; bloco `contextBridge.exposeInMainWorld('mcp', ...)` inteiro (D-16)
- `apps/desktop/src/shared/ipc-types.ts` §293 (RELOAD_LLM), §325-327 (MCP_CLIENT_*), §476-499 (McpClientStatus), §539 (reloadLlm signature), e channels LLM_SET_PROVIDER / STREAMING_LM_STUDIO_EVENTS_SET
- `apps/desktop/src/main/main.ts` (ou wherever `setupMcpSettingsHandlers` é chamado) — remover call (D-16)
- `apps/desktop/src/main/ipc/__tests__/settings.test.ts` — strip mocks LLM (D-19)

### Renderer — Settings UI (strip cirúrgico)
- `apps/desktop/src/renderer/src/settings/sections/LlmSection.tsx` — apagar arquivo (D-13)
- `apps/desktop/src/renderer/src/settings/sections/McpSection.tsx` — apagar arquivo (D-13)
- `apps/desktop/src/renderer/src/settings/sections/__tests__/LlmSection.test.tsx` (se existir) — apagar
- `apps/desktop/src/renderer/src/settings/sections/__tests__/McpSection.test.tsx` (se existir) — apagar
- `apps/desktop/src/renderer/src/settings/SettingsLayout.tsx` §12 (imports), §49-77 (Props interface — entries LLM/MCP), §108-118 (state init), §156-164 (fetch settings unpack), §181-182, §252 (sync), §268 (formValues), §469-494 (props pass-down), §528-536 (LlmSection mount), §555 (McpSection mount), e nav SectionKey definitions (linhas ~21-35) — strip completo (D-14)
- `apps/desktop/src/renderer/src/lib/tokenizer.ts` (se import de `estimateContextTokens` ficar órfão após LlmSection apagado) — verificar uso e limpar se dead

### Project-level docs
- `.planning/PROJECT.md` — Phase 70 em "Current Milestone v3.1"; atualizar status de LLM-PROV-01, SEXT-01/02, LLM-PROV-02 (features movidas pra .env-only)
- `.planning/REQUIREMENTS.md` — SIMP-01, SIMP-02, SIMP-03, SIMP-04 são os requirements desta phase
- `.planning/ROADMAP.md` §Phase 70 — Goal e success criteria

### Historical context (predecessor phases)
- Phase 52 (SEXT-01/02) — entregou LM Studio URL input + provider dropdown na Settings UI. P70 desfaz.
- Phase 57 (LLM-PROV-01) — entregou Google Gemini como 4o provider + API key inputs conditionais + `reloadLlm` IPC. P70 deleta UI e IPC.
- Phase 60 (LLM-PROV-02) — entregou toggle `USE_LM_STUDIO_STREAMING_EVENTS` na UI + IPC + reload. P70 migra valor pro `.env` e deleta UI/IPC.
- Phase 65 (MCP-CLI-01 D-09) — env-watcher para MCP_SERVER_* hot-reload. Reuso conceitual (não estendido para LLM em P70 — D-09).
- Phase 68 D-07 — padrão de read-time normalization para store key obsoleta. **Não aplicável aqui** porque P70 tem migração ATIVA + cleanup (D-06, D-17), não normalização passiva.
- Phase 69 D-10 — padrão "leave orphan keys" sem migração. **Não aplicável aqui** pelo mesmo motivo (D-06 deleta após migrar).
- Phase 69 D-13/D-14 — McpSection key `'mcp-server'` e label "Servidor MCP" mantidos em P69 esperando P70. **P70 cumpre essa promessa** (D-14, D-16).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`apps/backend-ts/src/llm/config.ts:loadConfig`** — Zod schema já cobre todas as keys de SIMP-04 com defaults. SIMP-04 já é satisfeita pelo backend; P70 só remove o caminho IPC paralelo.
- **`process.loadEnvFile(envPath)` (Node 21+ nativo)** — usado em `apps/desktop/src/main/index.ts:16`. Suficiente pra ler `.env`. Pra escrever, planner decide entre regex custom ou adicionar `dotenv` como dep de `apps/desktop`.
- **Padrão `mcp/client/env-diff.ts:parse from dotenv`** — backend usa `dotenv.parse(text)` pra parsing puro de texto `.env`. Mesma lib pode ser usada pelo Electron main pra migração (já está no monorepo via backend-ts).
- **Chokidar env-watcher (P65)** — em `apps/backend-ts/src/config/env-watcher.ts`. **Não estender para LLM** (D-09). Listado como insight pra evitar confusão futura.

### Established Patterns
- **Cirúrgico > refactor (P68, P69)** — minimizar diff, máximo isolamento de risco. P70 segue mesma filosofia.
- **Deletion total quando feature sai** (P69 D-04, D-07) — sem deprecation, sem "comment-out". Apaga arquivo, apaga import, apaga test.
- **Pure functions em módulos isolados** (P65, P68) — migração deve ser pure function testável (input: electron-store snapshot + .env content; output: novo .env content + keys a deletar). Side effects (disk write, store.delete) ficam num wrapper.
- **Read-time normalization** (P68 D-07, P69 D-10) — padrão pra keys obsoletas SEM migração ativa. **P70 não usa este padrão** porque migra ativamente e apaga (D-06).

### Integration Points
- **Boot sequence do Electron main** — `migrateLlmConfigToEnv()` plugada entre lines 14-17 de `index.ts`. Síncrona (não-bloqueante imperceptível por ser disk I/O local).
- **Backend-ts spawn** — `backend-client.ts:38` herda `process.env` do main. Como migração + `loadEnvFile` rodam antes do spawn (D-04), backend pega config correta sem coordenação extra.
- **electron-store JSON** — vive em `app.getPath('userData')/config.json` (path padrão do electron-store). Migração lê via `store.get()`, escreve via `store.delete()` — mesmo path usado pelo resto do código.

### Constraint
- **Sem dependência nova obrigatória** — `dotenv` já está no monorepo (transitively via backend-ts). Planner avalia se vale promover pra direct dep em `apps/desktop/package.json` ou se basta regex parser (~30 linhas).

</code_context>

<specifics>
## Specific Ideas

- **Privacidade > UX rica:** user explicitamente prioriza `.env` over UI por princípio de privacy-first (PROJECT.md). API keys saem do JSON desencriptado para arquivo plain-text controlado por OS file perms — mesma confiança que dev users já têm.
- **"Restart" é literal:** ROADMAP critério 4 — sem hot reload mesmo tendo a infra (env-watcher P65). Decisão consciente de simplificar (D-09).
- **P70 é o último cleanup pré-distribuição:** P71 empacota o que sobrar. Diff agressivo em P70 = binary final menor + menos surface area pra bugs de packaging.
- **MCP Client `.env` hot-reload já funciona end-to-end** (P65). User edita `MCP_SERVER_URL` no `.env`, watcher reagiu, ChatSession nova tem tools atualizadas. Reload button era UX redundante.
- **Migração one-shot:** após primeira run pós-v3.1, electron-store fica sem as keys (D-06). Boots seguintes: no-op silencioso. Comportamento idêntico ao "flag _v31MigrationDone" mas sem o estado explícito.

</specifics>

<deferred>
## Deferred Ideas

- **`.env` location em packaged app** — `app.getPath('userData')/.env` ou similar; resolver em P71. Adicionar como D-NN do P71 CONTEXT quando chegar a hora. Implica também adaptar o path em `index.ts:15` com fallback dev/packaged.
- **Hot reload de LLM via env-watcher** — infra existe (P65), mas D-09 prefere restart. Pode ser reavaliado em futuro milestone se UX virar reclamação.
- **`/internal/reload-llm` como dev tool** — D-10 deleta. Se planner identificar use case real (debugging multi-provider sem restart), pode preservar com flag dev-only.
- **MCP HTTP routes `/internal/mcp-client/*`** — D-20 Claude's discretion. Pode ficar para limpeza pós-P70 se planner preferir manter.
- **Refactor de `LlmProvider` type** — definido em `ipc-types.ts`; usado primariamente por código que vai sair. Avaliar se algum survivor usa (chat session, capabilities). Se ninguém usa, deletar tipo também.
- **Limpar comentários históricos** "Phase 57/52/60" — Claude's discretion no planner; baixa prioridade.
- **electron-store key cleanup com prefixo de schema version** — pattern alternativo onde armazenamos `_schema: 'v3.1'` e migrations rodam baseado em versão. Overengineered pra este caso, mas pode entrar em futura milestone se schema crescer.

</deferred>

---

*Phase: 70-llm-config-migration*
*Context gathered: 2026-05-11*
