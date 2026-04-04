# Requirements: JARVIS

**Defined:** 2026-04-04
**Core Value:** Conversar com o JARVIS via CLI e ter ele executar ações reais no computador — sem precisar decorar comandos, só falar naturalmente.

## v1 Requirements

### CLI & Interação

- [ ] **CLI-01**: Usuário pode iniciar o JARVIS via terminal e conversar em linguagem natural
- [ ] **CLI-02**: Respostas do JARVIS são exibidas com streaming (tokens aparecem progressivamente)
- [ ] **CLI-03**: Output é formatado com cores e estrutura legível (rich/prompt_toolkit)
- [ ] **CLI-04**: JARVIS pede confirmação antes de executar ações destrutivas ou irreversíveis
- [ ] **CLI-05**: JARVIS exibe erro em linguagem natural quando uma ferramenta falha

### LLM & Configuração

- [ ] **LLM-01**: Usuário pode configurar o backend LLM via variável de ambiente (OpenAI ou LM Studio)
- [ ] **LLM-02**: Sistema usa a mesma interface de código para OpenAI GPT-4 e LM Studio local
- [ ] **LLM-03**: Troca de backend LLM não requer mudança de código — apenas config

### Memória

- [ ] **MEM-01**: JARVIS mantém histórico da conversa durante a sessão ativa
- [ ] **MEM-02**: Histórico da sessão é salvo em SQLite ao encerrar
- [ ] **MEM-03**: JARVIS armazena fatos e preferências em banco vetorial (ChromaDB) entre sessões
- [ ] **MEM-04**: JARVIS injeta contexto relevante de sessões anteriores no prompt automaticamente
- [ ] **MEM-05**: Usuário pode perguntar ao JARVIS sobre algo discutido em sessões passadas

### Ferramentas de PC — Shell & Arquivos

- [ ] **TOOL-01**: Usuário pode pedir ao JARVIS para executar comandos shell via linguagem natural
- [ ] **TOOL-02**: JARVIS exibe o comando que será executado e aguarda confirmação antes de rodar
- [ ] **TOOL-03**: Usuário pode pedir ao JARVIS para listar, criar, mover e renomear arquivos/pastas
- [ ] **TOOL-04**: JARVIS pede confirmação explícita antes de deletar qualquer arquivo ou pasta
- [ ] **TOOL-05**: JARVIS lida com erros de permissão e caminhos inválidos com mensagem clara

### Ferramentas de PC — Apps & Tela

- [ ] **TOOL-06**: Usuário pode pedir ao JARVIS para abrir aplicativos pelo nome ("abre o VS Code")
- [ ] **TOOL-07**: JARVIS descobre apps disponíveis no sistema (Linux: .desktop files + PATH)
- [ ] **TOOL-08**: Usuário pode pedir ao JARVIS para "ler o que está na tela"
- [ ] **TOOL-09**: JARVIS captura screenshot, aplica OCR (pytesseract) e retorna o texto encontrado

### Arquitetura de Agente

- [ ] **ARCH-01**: Todas as ferramentas de PC são registradas no LangChain tool registry com schemas Pydantic
- [ ] **ARCH-02**: Agente Python (FastAPI) é o serviço central de IA — CLI comunica diretamente com ele
- [ ] **ARCH-03**: Número máximo de iterações do agente é configurável (proteção contra loop infinito)

## v2 Requirements

### LangGraph & Fluxos Complexos

- **LANG-01**: Agente usa LangGraph StateGraph para tarefas multi-etapa (ReAct loop)
- **LANG-02**: JARVIS consegue encadear múltiplas ferramentas autonomamente em sequência
- **LANG-03**: Sessões de fluxo complexo têm estado persistido para retomar se interrompidas

### Express Gateway & UI

- **API-01**: Express (Node.js/pnpm) atua como gateway HTTP para o serviço FastAPI Python
- **API-02**: Express repassa respostas em streaming (SSE) do FastAPI para clientes externos
- **UI-01**: Interface Electron desktop para conversar com o JARVIS fora do terminal
- **UI-02**: UI exibe histórico de conversa com formatação de código e markdown

### Voz

- **VOZ-01**: Usuário pode falar com o JARVIS (Whisper para STT)
- **VOZ-02**: JARVIS responde em voz (pyttsx3 ou ElevenLabs para TTS)
- **VOZ-03**: Wake word para ativar o JARVIS sem digitar

### Memória Avançada

- **MEM-06**: Sessões longas são sumarizadas antes de salvar no vetor (reduz ruído)
- **MEM-07**: Usuário pode ver, editar e deletar memórias armazenadas

## Out of Scope

| Feature | Motivo |
|---------|--------|
| IoT / Raspberry Pi | Domínio diferente — milestone futuro separado |
| Busca web | Dependência de API externa — adicionar como tool discreta depois |
| Automação de browser (Playwright) | Alta complexidade — categoria separada de agente |
| Suporte multi-usuário | Ferramenta local single-user por design |
| Sync de memórias na nuvem | Viola privacidade local-first |
| Plugin marketplace | Prematuro — tool registry é o ponto de extensão |
| Tarefas agendadas / background (cron) | Requer daemon — assistente reativo primeiro |
| GPT-4 Vision / visão avançada | OCR cobre o caso de uso de v1; visão avançada depois |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CLI-01 | Phase 1 | Pending |
| CLI-02 | Phase 1 | Pending |
| CLI-03 | Phase 1 | Pending |
| CLI-04 | Phase 1 | Pending |
| CLI-05 | Phase 1 | Pending |
| LLM-01 | Phase 1 | Pending |
| LLM-02 | Phase 1 | Pending |
| LLM-03 | Phase 1 | Pending |
| ARCH-01 | Phase 1 | Pending |
| ARCH-02 | Phase 1 | Pending |
| ARCH-03 | Phase 1 | Pending |
| MEM-01 | Phase 2 | Pending |
| MEM-02 | Phase 2 | Pending |
| MEM-03 | Phase 2 | Pending |
| MEM-04 | Phase 2 | Pending |
| MEM-05 | Phase 2 | Pending |
| TOOL-01 | Phase 3 | Pending |
| TOOL-02 | Phase 3 | Pending |
| TOOL-03 | Phase 3 | Pending |
| TOOL-04 | Phase 3 | Pending |
| TOOL-05 | Phase 3 | Pending |
| TOOL-06 | Phase 4 | Pending |
| TOOL-07 | Phase 4 | Pending |
| TOOL-08 | Phase 4 | Pending |
| TOOL-09 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 25 total
- Mapeados para fases: 25
- Não mapeados: 0 ✓

---
*Requirements definidos: 2026-04-04*
*Última atualização: 2026-04-04 após definição inicial*
