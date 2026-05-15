# Phase 70: LLM Config Migration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-11
**Phase:** 70-llm-config-migration
**Areas discussed:** Localização + migração do .env, Fate do streaming LM Studio toggle, Backend /internal/reload-llm endpoint, Settings UI: LLM e MCP somem por completo

---

## Localização + migração do .env

### Q1: Onde o arquivo .env deve viver quando o JARVIS for empacotado (P71)?

| Option | Description | Selected |
|--------|-------------|----------|
| userData dir (recomendado) | app.getPath('userData')/.env. Writable por padrão, isolado por OS user, mesmo padrão do hf-cache. Multi-OS friendly. | |
| .env ao lado do executável | app.getAppPath() / process.execPath dir. Quebra em NSIS Program Files, AppImage read-only, macOS .app read-only. | |
| Monorepo root sempre (atual) | Mantém index.ts:15 como está. Funciona SOMENTE em dev. P71 vai precisar de mudança tarde. | ✓ |

**User's choice:** Monorepo root sempre (atual)
**Notes:** Decisão consciente — P70 não fixa packaging; P71 trata. Deferred idea registrada.

---

### Q2: Quando .env existente já tem LLM_PROVIDER e electron-store também tem, quem vence?

| Option | Description | Selected |
|--------|-------------|----------|
| .env vence (recomendado) | Usuário que editou .env manualmente não quer ser sobrescrito. electron-store só preenche keys vazias/ausentes. Idempotente. | ✓ |
| electron-store vence (overwrite) | Valores salvos via UI são 'verdade' e migram pra .env, sobrescrevendo. | |
| Nunca sobrescrever — migrar só keys ausentes | Igual ao primeiro mas pegando ausentes apenas. | |

**User's choice:** .env vence (recomendado)

---

### Q3: Como detectar se a migração já rodou?

| Option | Description | Selected |
|--------|-------------|----------|
| Idempotente sem flag (recomendado) | Rodar todo boot. Se .env já tem a key, no-op. Zero estado extra. | ✓ |
| Flag _v31MigrationDone em electron-store | Marcar boolean após primeira migração. Adiciona estado. | |
| Detectar pela presença de keys legadas | Se electron-store tem llmProvider populado, migrar. Acopla migration logic ao schema cleanup. | |

**User's choice:** Idempotente sem flag (recomendado)

---

### Q4: Onde plugar o passo de migração no boot do Electron?

| Option | Description | Selected |
|--------|-------------|----------|
| main/index.ts antes do loadEnv (recomendado) | Roda ANTES de process.loadEnvFile. Backend ts spawn pega valores corretos sem race. | ✓ |
| Após loadEnv mas antes de spawn do backend-ts | loadEnv carrega .env atual, migração escreve diff, sincroniza process.env em memória. | |
| Em paralelo, não bloqueante | Sem garantia de timing. Não recomendado. | |

**User's choice:** main/index.ts antes do loadEnv (recomendado)

---

### Q5: Se o arquivo .env não existir, o que a migração faz?

| Option | Description | Selected |
|--------|-------------|----------|
| Cria .env novo a partir do electron-store (recomendado) | Se electron-store tem keys e .env não existe, criar arquivo. | |
| Só cria se electron-store tem qualquer key LLM populada | Não criar arquivo vazio. Backend usa defaults Zod. | |
| Nunca cria — só atualiza .env existente | Migração é no-op se .env ausente. User precisa criar manualmente. | ✓ |

**User's choice:** Nunca cria — só atualiza .env existente
**Notes:** Consistente com D-01 (monorepo root sempre, dev tem .env por workflow). Packaged future = P71 problem.

---

### Q6: Apago as keys do electron-store após migração bem-sucedida?

| Option | Description | Selected |
|--------|-------------|----------|
| Sim, apagar após gravar no .env (recomendado) | store.delete() — boots futuros: electron-store vazio, migração no-op sem flag. Permite remover schema/accessors. Reduz histórico sensível. | ✓ |
| Não apagar — deixar key órfã (padrão P69 D-10) | Manter consistência com phases anteriores. Schema vivo. Risco: API keys ficam em settings.json indefinidamente. | |
| Apagar só API keys, manter llmProvider/lmStudioUrl | Compromisso meio-termo. Complexidade pouco útil. | |

**User's choice:** Sim, apagar após gravar no .env (recomendado)

---

## Fate do streaming LM Studio toggle

### Q7: Como tratar a key `streamingLMStudioEventsEnabled` do electron-store na migração?

| Option | Description | Selected |
|--------|-------------|----------|
| Migrar como USE_LM_STUDIO_STREAMING_EVENTS (recomendado) | Tratar como qualquer outra key LLM. UI toggle some junto com LlmSection. | ✓ |
| Migrar só se for true (não-default) | Mantém .env mais enxuto. Risco: explicitude da config se perde. | |
| Não migrar — perder valor salvo | Apaga store key sem gravação. User volta pro default false. | |

**User's choice:** Migrar como USE_LM_STUDIO_STREAMING_EVENTS (recomendado)

---

### Q8: A entry USE_LM_STUDIO_STREAMING_EVENTS=false aparece no .env.example após P70?

| Option | Description | Selected |
|--------|-------------|----------|
| Sim, com comentário explicando o efeito (recomendado) | Insere abaixo de LM_STUDIO_MODEL. Comentário curto sobre SSE nativo. | ✓ |
| Sim mas sem comentário | Só key e default. Mínimo invasivo. | |
| Não adicionar no .env.example | Deixar como dev-only / power-user. Inconsistente. | |

**User's choice:** Sim, com comentário explicando o efeito (recomendado)

---

## Backend /internal/reload-llm endpoint

### Q9: 'restart aplica novo provider' — como interpretar?

| Option | Description | Selected |
|--------|-------------|----------|
| Restart de processo — user fecha e abre o app (recomendado) | Backend lê .env só no startup via loadConfig(). Sem watcher, sem reload IPC. Endpoint DELETADO. | ✓ |
| Hot reload via env-watcher (existente do MCP) | Estender chokidar watcher pra LLM. Endpoint permanece. Mais código, ROADMAP diz 'restart'. | |
| Endpoint permanece como dev tool (curl-only) | Sem watcher, mas endpoint vivo. Compromisso. | |

**User's choice:** Restart de processo — user fecha e abre o app (recomendado)

---

### Q10: IPC channels LLM (LLM_SET_PROVIDER, RELOAD_LLM, STREAMING_LM_STUDIO_EVENTS_SET) — deletados?

| Option | Description | Selected |
|--------|-------------|----------|
| Deletar todos — deletion cirúrgica (recomendado) | Remover de IPC_CHANNELS, bridge window.settings, handlers, tests. Mesma filosofia P69 D-07. | ✓ |
| Manter handlers como dead code | Inconsistente com P69. | |

**User's choice:** Deletar todos — deletion cirúrgica (recomendado)

---

### Q11: Evento `llm:provider-changed` enviado para mainWindow — alguém escuta?

| Option | Description | Selected |
|--------|-------------|----------|
| Investigar e deletar se ninguém escuta (recomendado) | grep no renderer por 'llm:provider-changed'. Se órfão, apaga junto. | ✓ |
| Manter para extensibilidade futura | Código morto mas barato. | |

**User's choice:** Investigar e deletar se ninguém escuta (recomendado)
**Notes:** Scout pós-resposta confirmou zero listeners no renderer — confirma deletion (D-12).

---

## Settings UI: LLM e MCP somem por completo

### Q12: LlmSection.tsx e McpSection.tsx — deletar arquivos ou manter como placeholder?

| Option | Description | Selected |
|--------|-------------|----------|
| Deletar ambos os arquivos (recomendado) | rm dos .tsx. SectionKey perde 'llm' e 'mcp-server'. Nav entries removidas. Filosofia P69: deletion pura. | ✓ |
| Manter LlmSection vazia mostrando '.env-managed' | Section read-only educa user. Mais código, contradiz minimalismo. | |
| Deletar McpSection, manter LlmSection read-only | Inconsistência entre seções. | |

**User's choice:** Deletar ambos os arquivos (recomendado)

---

### Q13: Reload button do MCP Client (window.mcp.reloadClient) — some junto?

| Option | Description | Selected |
|--------|-------------|----------|
| Some — toda McpSection deletada (recomendado) | env-watcher P65 já cobre hot-reload. User não precisa de botão. Status via console/logs. | ✓ |
| Move botão e status pra outra section (System/About) | Cria/move seção. Mais código. | |
| Deleta botão, mantém apenas IPC bridges window.mcp ativos | Código IPC fica pra console. Inconsistente. | |

**User's choice:** Some — toda McpSection deletada (recomendado)

---

### Q14: store.ts — schema entries e accessors das keys migradas/deletadas?

| Option | Description | Selected |
|--------|-------------|----------|
| Apagar schema + accessors completamente (recomendado) | Remove ~120 linhas. llmProvider, lmStudioUrl, *ApiKey, streamingLMStudioEventsEnabled. Tests atualizados. | ✓ |
| Manter schema, apagar só accessors | Keys ainda válidas no schema sem funções exportadas. Históricos JSON continuam válidos. | |
| Manter tudo, não tocar em store.ts | Padrão P69 D-10. Inconsistente com migração ATIVA + delete. | |

**User's choice:** Apagar schema + accessors completamente (recomendado)

---

### Q15: SettingsLayout.tsx — state, handlers e props LLM/MCP, como tratar?

| Option | Description | Selected |
|--------|-------------|----------|
| Strip cirúrgico completo (recomendado) | Remove state, handlers, prop interfaces, data unpack. Tests atualizados. Mesmo padrão P69 D-12. | ✓ |
| Comentar sem deletar | Inconsistente com P69. | |

**User's choice:** Strip cirúrgico completo (recomendado)

---

### Q16: IPCs do MCP Client (mcp-client:reload, mcp-client:status, broadcast) — deletar também?

| Option | Description | Selected |
|--------|-------------|----------|
| Deletar todos os 3 + window.mcp bridge inteiro (recomendado) | Sem caller. Env-watcher P65 cobre. Status via /internal/mcp-client/status HTTP. window.mcp some do preload. mcp-settings.ts deletado. | ✓ |
| Manter IPCs como dead code | Inconsistente. Bridge sem consumer. | |
| Deletar IPCs renderer-facing, manter rotas HTTP do backend | Mata IPC, mantém routes pra curl. Compromisso. | |

**User's choice:** Deletar todos os 3 + window.mcp bridge inteiro (recomendado)
**Notes:** D-20 (HTTP routes mcp-client) fica Claude's Discretion no planner.

---

## Claude's Discretion

- Ordem dos plans dentro da phase
- Implementação do migrador (regex parser vs dotenv dep)
- Logging da migração (silencioso vs informativo)
- Comentários históricos `// Phase 57/52/60` em arquivos remanescentes
- Section default ativa após remover 'llm'
- Refactor do tipo `LlmProvider` se órfão
- HTTP routes /internal/mcp-client/* (D-20)

## Deferred Ideas

- .env location em packaged app → P71
- Hot reload LLM via env-watcher → futuro milestone
- /internal/reload-llm como dev tool → D-10 deleta, planner pode preservar
- MCP HTTP routes cleanup → Claude's discretion
- Refactor LlmProvider type
- Limpar comentários históricos
- electron-store schema version cleanup pattern
