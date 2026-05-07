# Requirements: JARVIS v3.0 — Agentic JARVIS

**Defined:** 2026-05-07
**Core Value:** Conversar naturalmente com o JARVIS e ter ele lembrando de tudo — toda interação anterior, preferências, contexto — como um parceiro que nunca esquece.

## v3.0 Requirements

### MCP Server (JARVIS expõe tools via MCP)

- [ ] **MCP-SRV-01**: Usuário pode usar JARVIS como servidor MCP via stdio, expondo PC control tools para clientes como Claude Desktop e Cursor
- [ ] **MCP-SRV-02**: Clientes MCP externos podem consultar memória do JARVIS (histórico de conversas + preferências do usuário)
- [ ] **MCP-SRV-03**: Usuário pode ativar/desativar o servidor MCP e ver quais clientes estão conectados na Settings UI

### MCP Client (JARVIS conecta a servidores externos)

- [ ] **MCP-CLI-01**: Usuário pode configurar URL de servidor MCP estático via `.env` (HTTP transport, ex: n8n)
- [ ] **MCP-CLI-02**: JARVIS usa as tools do servidor MCP configurado em conversas normais, sem configuração adicional
- [ ] **MCP-CLI-03**: JARVIS descobre e registra tools disponíveis do servidor MCP ao conectar, repassando-as ao agente LLM

### Agentic Tasks

- [ ] **AGENT-01**: Usuário pode solicitar tarefa multi-step por texto ou voz e JARVIS executa a sequência completa sem interrupção
- [ ] **AGENT-02**: JARVIS exibe plano de execução com etapas e pede confirmação do usuário antes de iniciar
- [ ] **AGENT-03**: Progresso em tempo real visível no chat e no orb a cada etapa da tarefa em execução
- [ ] **AGENT-04**: Usuário pode cancelar tarefa em execução a qualquer momento sem efeitos colaterais

### Offline TTS (Kokoro)

- [x] **TTS-OFF-01**: JARVIS usa Kokoro TTS local por padrão — zero dependência de cloud para síntese de voz
- [x] **TTS-OFF-02**: Fallback automático para Murf.ai quando Kokoro falha ou não está disponível
- [x] **TTS-OFF-03**: Usuário pode escolher TTS provider (Kokoro local / Murf cloud) em Settings sem restart
- [x] **TTS-OFF-04**: JARVIS baixa modelo Kokoro (~350MB) na primeira inicialização com progress bar e sem bloquear uso do app
- [x] **TTS-OFF-05**: Usuário pode ativar modo "apenas local" em Settings — fallback para Murf desabilitado, JARVIS usa só Kokoro mesmo se falhar

### JARVIS Proativo

- [ ] **PROACT-01**: Usuário pode criar lembrete por voz ou texto com horário/intervalo ("me lembra em 30min de X")
- [ ] **PROACT-02**: JARVIS dispara lembrete com áudio via TTS + toast visual no widget
- [ ] **PROACT-03**: JARVIS envia notificação nativa do Windows com texto do lembrete
- [ ] **PROACT-04**: Usuário pode configurar quiet hours — nenhuma notificação proativa no período configurado
- [ ] **PROACT-05**: JARVIS monitora pasta configurada e notifica quando novo arquivo chega
- [ ] **PROACT-06**: JARVIS gera e entrega resumo diário em áudio + texto no horário configurado pelo usuário

### Vision Pipeline TS

- [ ] **VISION-01**: Usuário pode perguntar "o que está na minha tela?" e JARVIS captura, codifica em base64 e analisa com LLM vision
- [ ] **VISION-02**: Usuário pode colar ou arrastar imagem no chat — JARVIS recebe como base64 e analisa com LLM vision
- [ ] **VISION-03**: Usuário pode usar hotkey configurável para capturar a tela e imediatamente iniciar conversa sobre o conteúdo

## Future Requirements (v3.1+)

### MCP Avançado

- **MCP-SRV-04**: JARVIS servidor MCP via HTTP Streamable transport (para acesso remoto / containerização)
- **MCP-CLI-04**: Suporte a múltiplos servidores MCP configurados simultaneamente
- **MCP-CLI-05**: UI em Settings para adicionar/remover servidores MCP sem editar `.env`

### Agentic Avançado

- **AGENT-05**: JARVIS gera relatório de execução com log de cada etapa após tarefa concluída
- **AGENT-06**: Usuário pode reexecutar tarefa anterior com os mesmos parâmetros

### Proativo Avançado

- **PROACT-07**: Tarefas recorrentes (ex: "todo dia às 9h resume meu email")
- **PROACT-08**: Quiet hours com detecção automática por plataforma (macOS pmset, Windows WinRT)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Multi-agent orchestration | Complexidade alta, deferred v3.2+ |
| MCP server exposto externamente (internet) | Segurança — uso pessoal local apenas |
| Vision automática sem trigger | Custo de tokens incontrolável |
| Notificação por WhatsApp/SMS | Requer serviço terceiro, v3.1+ |
| Bree job scheduler | node-cron suficiente para v3.0 |
| Firebase Cloud Tasks | Overhead de infraestrutura desnecessário |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TTS-OFF-01 | Phase 62 | Complete |
| TTS-OFF-02 | Phase 62 | Complete |
| TTS-OFF-03 | Phase 62 | Complete |
| TTS-OFF-04 | Phase 62 | Complete |
| TTS-OFF-05 | Phase 62 | Complete |
| VISION-01 | Phase 63 | Pending |
| VISION-02 | Phase 63 | Pending |
| VISION-03 | Phase 63 | Pending |
| MCP-SRV-01 | Phase 64 | Pending |
| MCP-SRV-02 | Phase 64 | Pending |
| MCP-SRV-03 | Phase 64 | Pending |
| MCP-CLI-01 | Phase 65 | Pending |
| MCP-CLI-02 | Phase 65 | Pending |
| MCP-CLI-03 | Phase 65 | Pending |
| AGENT-01 | Phase 66 | Pending |
| AGENT-02 | Phase 66 | Pending |
| AGENT-03 | Phase 66 | Pending |
| AGENT-04 | Phase 66 | Pending |
| PROACT-01 | Phase 67 | Pending |
| PROACT-02 | Phase 67 | Pending |
| PROACT-03 | Phase 67 | Pending |
| PROACT-04 | Phase 67 | Pending |
| PROACT-05 | Phase 67 | Pending |
| PROACT-06 | Phase 67 | Pending |

**Coverage:**
- v3.0 requirements: 24 total
- Mapped to phases: 23 ✓
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-07*
*Last updated: 2026-05-07 — traceability filled after roadmap creation (Phases 62-67)*
