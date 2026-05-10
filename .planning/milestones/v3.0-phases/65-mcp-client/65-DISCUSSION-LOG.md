# Phase 65: MCP Client - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in 65-CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-08
**Phase:** 65-mcp-client
**Areas discussed:** Config & auth no .env, Namespace das tools externas, Reload + discovery sem restart, Aprovação + degradação em runtime

---

## Config & auth no .env

### Q1 — Formato mínimo das variáveis no .env

| Option | Description | Selected |
|--------|-------------|----------|
| URL + Bearer token (Recomendado) | MCP_SERVER_URL + MCP_SERVER_BEARER. Cobre n8n/Pipedream/Zapier MCP. Simples de validar. | ✓ |
| URL + headers JSON arbitrário | MCP_SERVER_HEADERS_JSON='{...}'. Flexível mas fácil errar JSON em .env. | |
| Apenas URL (sem auth) | MCP_SERVER_URL só. Não conecta na maioria dos serviços reais. | |

**User's choice:** URL + Bearer token
**Notes:** Cobre o caso de uso primário (n8n) sem complicar.

### Q2 — Identifier do servidor

| Option | Description | Selected |
|--------|-------------|----------|
| User-defined em MCP_SERVER_NAME (Recomendado) | Curto, controlado, usado em prefixos/logs/erros. | ✓ |
| Auto-derivado do host da URL | Zero config a mais, mas pode dar nomes feios. | |
| Hardcoded "external" | Simples mas perde origem em logs. | |

**User's choice:** User-defined em MCP_SERVER_NAME

### Q3 — Boot quando MCP_SERVER_URL vazio/inválido

| Option | Description | Selected |
|--------|-------------|----------|
| Boot continua silencioso, MCP cliente desligado (Recomendado) | Opt-in, log info único. | ✓ |
| Boot continua + warning visível | Toast + log warning. | |
| Boot falha com erro útil | Recusa subir se URL malformada. | |

**User's choice:** Boot continua silencioso

### Q4 — Onde vivem as envs

| Option | Description | Selected |
|--------|-------------|----------|
| .env do repositório com .env.local override (Recomendado) | Padrão dotenv existente do JARVIS. | ✓ |
| Só .env.local (gitignored) | Mais seguro contra commit acidental, mais setup manual. | |
| Settings UI já nesta phase | Viola escopo (MCP-CLI-05 deferred v3.1). | |

**User's choice:** .env do repositório com .env.local override

---

## Namespace das tools externas

### Q1 — Como o LLM enxerga os nomes das tools

| Option | Description | Selected |
|--------|-------------|----------|
| Prefixo com MCP_SERVER_NAME (Recomendado) | n8n.send_email, n8n.create_invoice. Sem colisão, origem óbvia. | ✓ |
| Sem prefixo (nome cru) | Mais curto, mas risco de colisão com nativas. | |
| Prefixo genérico mcp_* | Diferencia mas perde info de servidor. | |

**User's choice:** Prefixo com MCP_SERVER_NAME

### Q2 — Estratégia em colisão pós-prefixo

| Option | Description | Selected |
|--------|-------------|----------|
| Tool nativa sempre vence + warning (Recomendado) | Externa ignorada com log claro. JARVIS nunca perde recall_memory/openFile. | ✓ |
| Externa vence (override) | Substitui nativa. Perigoso. | |
| Falha boot do MCP client | Conservador demais. | |

**User's choice:** Tool nativa sempre vence + warning

### Q3 — Description repassada ao LLM

| Option | Description | Selected |
|--------|-------------|----------|
| Anotada com origem (Recomendado) | "[via {SERVER_NAME}] {desc original}". LLM sabe contexto externo. | ✓ |
| Pura, exatamente como veio | Mais fiel ao protocolo, mas LLM perde contexto. | |
| Reescrita por JARVIS | Custoso, raramente melhora. | |

**User's choice:** Anotada com origem

### Q4 — Filtro/limite de tools

| Option | Description | Selected |
|--------|-------------|----------|
| Todas, sem filtro (Recomendado) | LLMs modernos lidam com 30-50 tools. Otimizar só se virar dor. | ✓ |
| Allowlist via env (MCP_TOOLS_ALLOW=...) | Mais seguro/barato em tokens, mas duplica config. | |
| Limite numérico (top N) | Arbitrário. | |

**User's choice:** Todas, sem filtro

---

## Reload + discovery sem restart

### Q1 — Mecanismo de detecção de mudança no .env

| Option | Description | Selected |
|--------|-------------|----------|
| IPC Settings + botão "Reconectar MCP" (Recomendado) | Padrão RELOAD_LLM da Phase 57. Sem file-watcher complexo. | |
| File watcher do .env (chokidar) | Detecta automático, mágico. Mais código mas chokidar já está na stack. | ✓ |
| Comando no chat | Charmoso mas frágil. | |

**User's choice:** File watcher do .env (chokidar)
**Notes:** User priorizou ergonomia "magia automática" sobre simplicidade. Phase 65 ainda inclui botão manual em Settings como fallback (D-10).

### Q2 — Aplicar reload mid-conversation

| Option | Description | Selected |
|--------|-------------|----------|
| Próxima conversa pega novas tools (Recomendado) | ChatSession ativa termina turno com tools antigas. Sem race conditions. | ✓ |
| Rebuild imediato do agent na sessão ativa | Mais imediato mas risco de bug em tool-loop ativo. | |
| Encerra sessão atual silenciosamente | Mata sessão, próxima mensagem cria nova. UX ruim. | |

**User's choice:** Próxima conversa pega novas tools

### Q3 — Re-discovery de tools novas no servidor

| Option | Description | Selected |
|--------|-------------|----------|
| Re-discovery só ao reconectar (Recomendado) | listTools() roda no connect e fica estático. | ✓ |
| Polling periódico (cada 5min) | Tráfego extra desnecessário. | |
| Reagir a notifications/tools/list_changed | Elegante mas n8n ainda não emite. | |

**User's choice:** Re-discovery só ao reconectar

### Q4 — Boot com servidor fora do ar

| Option | Description | Selected |
|--------|-------------|----------|
| Tenta uma vez, fail fast, retry sob demanda (Recomendado) | Connect timeout 5s, próxima trigger (watcher/botão) tenta de novo. | ✓ |
| Reconnect automático com exponential backoff | Mais código, log spam. | |
| Boot bloqueia até conectar | Vai contra SC#3 (degradação limpa). | |

**User's choice:** Tenta uma vez, fail fast

---

## Aprovação + degradação em runtime

### Q1 — Confirmação antes de executar tool externa

| Option | Description | Selected |
|--------|-------------|----------|
| Toast de confirmação como Phase 54 (Recomendado) | Reusa pendingActionFlow + ActionConfirmationToast. Consistência + segurança. | |
| Executar direto (trust) | Sem fricção. User configurou .env, então trust. Risco: side effects indevidos. | ✓ |
| Allowlist em .env de tools auto-executáveis | Meio-termo. Adiciona config no MVP. | |

**User's choice:** Executar direto (trust)
**Notes:** Decisão deliberada e divergente de Phase 54/55. User aceita o trade-off entre fluxo de voz sem fricção e risco de tool calls indesejadas pelo LLM. CONTEXT.md D-14 destaca que toast de aprovação volta como follow-up se UX revelar problemas reais.

### Q2 — Audit log de execução

| Option | Description | Selected |
|--------|-------------|----------|
| Reusar ToolLogger existente com tag mcp-external (Recomendado) | Sem novo arquivo, sem novo schema. Queryable. | ✓ |
| Apenas logs do logger (pino) sem persistência | Mais leve, perde queryability. | |
| Sem log específico | Trust total — não recomendado mesmo. | |

**User's choice:** Reusar ToolLogger existente com tag mcp-external

### Q3 — Comportamento quando servidor cai mid-call

| Option | Description | Selected |
|--------|-------------|----------|
| Erro estruturado volta ao LLM, ele explica em pt-BR (Recomendado) | Padrão idêntico ao Phase 64 D-07. LLM tenta alternativa. | ✓ |
| JARVIS interrompe e responde direto sem o LLM | Mais rápido mas quebra fluxo. | |
| Retry transparente até timeout | User espera sem entender. | |

**User's choice:** Erro estruturado volta ao LLM

### Q4 — Tool timeout default

| Option | Description | Selected |
|--------|-------------|----------|
| 30s default, sem override (Recomendado) | Alinhado com Phase 64. Suficiente para n8n. | ✓ |
| 10s default | Quebra workflows n8n legítimos. | |
| 60s default | Margem ampla mas voz fica esperando muito. | |

**User's choice:** 30s default

---

## Claude's Discretion

Áreas onde Claude (researcher/planner) tem flexibilidade:

- HTTP transport variant: `StreamableHTTPClientTransport` vs `SSEClientTransport`
- Estrutura interna do `McpClientManager` (singleton vs lazy/per-session, lifecycle do transport, cache de tools)
- API exata para passar tools externas a `chat-session.ts:create()`
- Detecção precisa de mudança no .env (re-parse vs comparison de keys MCP_*)
- Wrapping de tools MCP em formato `tool()` LangChain (JSON Schema → Zod ou aceitar JSON Schema diretamente)
- Path/integração do file watcher (debounce, paths absolutos, .env vs .env.local)

## Deferred Ideas

Capturadas durante a discussão para não perder, mas fora do escopo da Phase 65:

- Toast de aprovação per-tool externa (revisit se trust mode der problemas reais)
- Allowlist `MCP_AUTO_APPROVE=...` em `.env`
- Polling periódico de `listTools()` ou subscribe a `notifications/tools/list_changed`
- Reconnect automático com exponential backoff
- Rebuild imediato do agent ReAct na sessão ativa
- Override `MCP_TOOL_TIMEOUT_MS` per-deployment
- Audit trail persistido em DB (à la Phase 54 ActionLogger)

Já formalizadas no roadmap/backlog v3.1:
- MCP-CLI-04 (múltiplos servidores)
- MCP-CLI-05 (Settings UI para gerenciar servidores)
- MCP-SRV-04 (HTTP Streamable transport para o servidor)
