# Phase 73: Terminal Chat - Context

**Gathered:** 2026-05-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Substituir o placeholder `while True: time.sleep(1)` em `__main__.py` por um loop de chat funcional: lê input do usuário → envia para `GET /api/chat/stream?message=...` (SSE) → imprime tokens conforme chegam → repete. Health check já existe (Phase 72) — Phase 73 usa como pré-condição, não reimplementa.

**No escopo:** loop de chat, streaming SSE, API key/auth, tratamento de erros de stream.
**Fora do escopo:** rich UI, STT/TTS, voice modes, histórico multi-sessão, retry automático.

</domain>

<decisions>
## Implementation Decisions

### Apresentação do terminal
- **D-01:** Usar `print()` simples — sem rich nesta fase. Rich entra em Phase 77 com o status line.
- **D-02:** Prompt de input: `input('> ')` — padrão com seta, sem label extra.

### Histórico da sessão
- **D-03:** Histórico via scroll natural do terminal — nenhum código extra. Terminal já mantém tudo na tela; usuário rola para ver mensagens anteriores. Satisfaz PYCHAT-03.
- **D-04:** Cada mensagem é independente — sem contexto multi-turno enviado ao gateway no MVP. O gateway gerencia memória no backend-ts.

### API key / auth
- **D-05:** Adicionar campo `api_key: str = ""` ao `JarvisConfig` — extensão válida do schema (D-07/D-08 do Phase 72 permitem adicionar campos, não redefinir existentes).
- **D-06:** Load order do `api_key`: `.env JARVIS_API_KEY` → `config.json api_key`. Se não-vazio, o cliente injeta `Authorization: Bearer {api_key}` no request SSE.
- **D-07:** Gateway local sem auth funciona normalmente — `api_key` fica `""` e nenhum header é enviado.

### Falha mid-stream
- **D-08:** Se stream cair no meio: imprimir tokens já recebidos + `\n[erro: conexão perdida]`. Usuário vê o parcial e sabe que falhou.
- **D-09:** Se gateway offline ao enviar mensagem (após health check inicial): mostrar erro e voltar ao prompt — loop continua. Usuário pode tentar novamente sem reiniciar.

### Claude's Discretion
- Estrutura interna do módulo de chat (ex: `chat.py` separado ou inline em `__main__.py`)
- Formato exato da mensagem de erro (desde que seja claro e não cause crash)
- Timeout para SSE request

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Gateway API
- `apps/gateway/src/routes/chat.ts` — endpoint `GET /chat/stream?message=...` (GW-02, SSE) e `POST /chat` (GW-01, não-streaming). Phase 73 usa GW-02.
- `apps/gateway/src/middleware/validate.ts` — `ChatRequestSchema` (relevante para entender o shape esperado)

### Infrastructure existente (Phase 72)
- `apps/desktop-py/src/jarvis_desktop/__main__.py` — entry point atual com placeholder de Phase 73 na linha `# Phase 73 replaces this with chat loop`
- `apps/desktop-py/src/jarvis_desktop/config.py` — `JarvisConfig` schema e `load_config()` — D-05 adiciona `api_key` aqui
- `apps/desktop-py/src/jarvis_desktop/health.py` — `check_health()` já em uso no `__main__.py`

### Requirements
- `.planning/REQUIREMENTS.md` §PYCHAT-01..03 — critérios de aceite desta fase

### Stack e decisões de tecnologia
- `CLAUDE.md` §Technology Stack — versões pinadas
- `CLAUDE.md` §What NOT to Use — libs proibidas

### Sem specs externos adicionais
- Nenhum ADR externo referenciado. Requirements completamente capturados nas decisões acima.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `jarvis_desktop/health.py` — `check_health(gateway_url)` já implementado com stdlib; Phase 73 chama antes de iniciar o loop
- `jarvis_desktop/config.py` — `load_config()` e `JarvisConfig` prontos; Phase 73 adiciona campo `api_key`
- `jarvis_desktop/__main__.py` — `main()` já carrega config + chama health check; chat loop vai substituir o `while True: time.sleep(1)` no final

### Established Patterns
- **stdlib-first:** `health.py` usa `urllib.request` sem terceiros. O SSE request pode usar `urllib.request` também (streaming via read em chunks), ou `httpx` (já no stack como dependência do openai SDK)
- **Nunca crashar em erro de gateway (D-11 Phase 72):** padrão a manter no loop de chat — erros viram mensagens, não exceptions não tratadas

### Integration Points
- `GET {config.gateway_url}/api/chat/stream?message={encoded_message}` — endpoint SSE a consumir
- `Authorization: Bearer {config.api_key}` — header opcional se `api_key` não-vazio
- `apps/desktop-py/pyproject.toml` — onde adicionar httpx se necessário

</code_context>

<specifics>
## Specific Ideas

- O loop começa imediatamente após o health check no `main()` — não há tela de boas-vindas separada
- Ctrl+C encerra o app (já tem handler de SIGINT em `__main__.py`)
- Tokens chegam via SSE `data: {token}\n\n` — imprimir com `print(token, end='', flush=True)` para aparecer conforme chegam, depois `print()` para nova linha ao fim

</specifics>

<deferred>
## Deferred Ideas

None — discussão ficou dentro do escopo da fase.

</deferred>

---

*Phase: 73-terminal-chat*
*Context gathered: 2026-05-18*
