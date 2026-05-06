# Phase 57: Google Gemini Provider — Context

**Gathered:** 2026-05-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Adicionar Google Gemini como 4º provider LLM — factory, config, tipos, Settings UI e live reload sem restart. Inclui também unificação do padrão de API key: OpenAI e Anthropic passam a ter inputs na UI (electron-store), como Gemini.

</domain>

<decisions>
## Implementation Decisions

### Live Reload sem Restart (SC-1)

- **D-01:** Backend-ts expõe `POST /internal/reload-llm` (segue padrão `/internal/` das fases 54/55). Após salvar settings, Electron chama esse endpoint com o novo provider e as API keys relevantes.
- **D-02:** O endpoint re-cria apenas o LLM (`createLLM(newConfig)`) e chama `ChatSession.swapLLM(newLlm)` — histórico e memória da sessão são preservados. ChatSession não é resetado.
- **D-03:** Após o reload, backend-ts re-executa capability detection para atualizar o console log. Para LM Studio, usa `GET /v1/models` do LM Studio para saber o modelo atualmente carregado.

### API Key Storage — Todos os Cloud Providers

- **D-04:** GEMINI_API_KEY, OPENAI_API_KEY e ANTHROPIC_API_KEY são armazenadas no electron-store (mesmo padrão do TTS API key), não em `.env`. Usuário digita na Settings UI.
- **D-05:** Electron passa as keys ao backend-ts no body do `POST /internal/reload-llm` (não como env vars). Backend-ts usa essas keys diretamente ao criar o LLM — não depende de `process.env` para keys configuradas via UI.
- **D-06:** Keys existentes em `process.env` continuam funcionando como fallback (para usuários que já tinham `.env` configurado). Priority: electron-store > process.env.

### Settings UI

- **D-07:** Input de API key renderizado **condicionalmente** — apenas o campo do provider atualmente selecionado é exibido. LM Studio não mostra campo de key (não usa).
- **D-08:** Label do Gemini no dropdown: `"Google Gemini"` — alinha com o padrão atual: `"LM Studio (Local)"`, `"OpenAI"`, `"Anthropic (Claude)"`, `"Google Gemini"`.
- **D-09:** Esta fase adiciona inputs de API key para **todos os cloud providers** (Gemini, OpenAI, Anthropic) na LlmSection — não só Gemini.

### Gemini no Factory

- **D-10:** Pacote LangChain: `@langchain/google-genai` (Google AI Studio API — sem Vertex AI overhead).
- **D-11:** Modelo padrão do Gemini: `"gemini-2.0-flash"` (velocidade/qualidade ideal para chat conversacional).
- **D-12:** Provider adicionado como `"gemini"` no union type `LLMProvider` em todos os arquivos: `types.ts`, `config.ts`, `ipc-types.ts`, `store.ts`.

### Error Handling (SC-3 e SC-4)

- **D-13:** GEMINI_API_KEY ausente ou inválida → backend degrada para LM Studio E mostra toast de erro acionável: `"GEMINI_API_KEY inválida — usando LM Studio"`.
- **D-14:** Safety filter null content do Gemini → toast: `"JARVIS não pôde responder"` (sem crash, sem blank response).

### tokenizer.ts

- **D-15:** Adicionar entrada `gemini` no `CONTEXT_WINDOWS` do tokenizer: `1000000` (Gemini 2.0 Flash tem 1M tokens de contexto). Isso previne false overflow warnings ao trocar para Gemini.

### LM Studio — `/v1/models`

- **D-16:** No endpoint `POST /internal/reload-llm`, após recriar o LLM do LM Studio, backend chama `GET {LM_STUDIO_URL}/models` para detectar o modelo carregado e logar. Erros nessa chamada são silenciosos (non-fatal) — LM Studio pode estar offline.

### Claude's Discretion

- Schema exato do body de `POST /internal/reload-llm` (quais campos, validação Zod).
- Como `ChatSession.swapLLM()` é implementado internamente (mutex para evitar race com request em andamento).
- Nome exato das chaves no electron-store para as API keys de cloud providers.
- Se o `CONTEXT_WINDOWS` do tokenizer para `lmstudio` deve ser atualizado também (atualmente sem valor definido no código lido).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requisito da fase
- `.planning/REQUIREMENTS.md` §LLM-PROV-01 — requisito único desta fase

### Roadmap e success criteria
- `.planning/ROADMAP.md` §Phase 57 — 4 success criteria concretos

### Factory e config existentes (base para extensão)
- `apps/backend-ts/src/llm/factory.ts` — switch statement a estender com case `gemini`
- `apps/backend-ts/src/llm/config.ts` — Zod schema a estender com `gemini` e `GEMINI_API_KEY`
- `apps/backend-ts/src/llm/types.ts` — `LLMProvider` type a atualizar

### Settings UI existente (base para extensão)
- `apps/desktop/src/renderer/src/settings/sections/LlmSection.tsx` — adicionar input de API key condicional e `"Google Gemini"` no `PROVIDER_LABELS`
- `apps/desktop/src/shared/ipc-types.ts` — `LlmProvider` type e `SettingsData` a atualizar
- `apps/desktop/src/main/store.ts` — `StoreSchema` e `VALID_LLM_PROVIDERS` a atualizar
- `apps/desktop/src/main/ipc/settings.ts` — handlers de settings a estender

### Tokenizer (context window por provider)
- `apps/desktop/src/renderer/src/lib/tokenizer.ts` — `CONTEXT_WINDOWS` a estender com `gemini: 1000000`

### Padrão de endpoints /internal/ a seguir
- `apps/gateway/src/routes/actions-log.ts` — padrão de rota `/internal/` (Phase 54)
- `apps/backend-ts/src/index.ts` — onde registrar o novo endpoint `/internal/reload-llm`

### LM Studio model detection
- LM Studio expõe `GET {LM_STUDIO_URL}/models` (OpenAI-compatible `/v1/models`) — usar após reload para detectar modelo carregado

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ChatSession` em `apps/backend-ts/src/session/chat-session.js` — adicionar método `swapLLM(newLlm: BaseChatModel)`
- `createLLM(provider?, config?)` já aceita overrides — reusar para criar LLM no reload
- `getTtsApiKey / setTtsApiKey` em `store.ts` — padrão exato para replicar com `getGeminiApiKey / setGeminiApiKey`
- Endpoint `/internal/actions-log` (Phase 54) — template para `POST /internal/reload-llm`

### Established Patterns
- API keys de cloud providers: electron-store → Electron passa no body do request → backend usa diretamente (não via process.env)
- Settings apply-without-restart: `ipcMain.handle(channel, handler)` que chama store setter e dispara efeito colateral (ex: `reinitializeTTS`)
- Toast de erro: `Toast` component em `apps/desktop/src/renderer/src/components/Toast.tsx`

### Integration Points
- `POST /internal/reload-llm` no backend-ts → chamado por Electron settings IPC handler após salvar LLM provider/key
- `CONTEXT_WINDOWS` no tokenizer → adicionar `gemini: 1000000` para o modal de overflow funcionar corretamente

</code_context>

<specifics>
## Specific Ideas

- LM Studio: usar `GET /v1/models` para detectar modelo carregado após reload (D-16) — não hardcodar o model name
- Gemini safety filter null: tratar explicitamente no agent/session level antes de retornar ao usuário

</specifics>

<deferred>
## Deferred Ideas

- Inputs de API key para OpenAI e Anthropic foram incluídos nesta fase (não diferidos) — decisão D-09.
- Model selector por provider (ex: dropdown para escolher entre gemini-2.0-flash e gemini-1.5-pro) — fora do escopo desta fase.

</deferred>

---

*Phase: 57-google-gemini-provider*
*Context gathered: 2026-05-06*
