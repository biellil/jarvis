# Requirements: JARVIS

**Defined:** 2026-04-02
**Core Value:** Conversar naturalmente com o JARVIS e ter ele lembrando de tudo — toda interação anterior, preferências, contexto — como um parceiro que nunca esquece.

## v1 Requirements

### Conversa (CONV)

- [x] **CONV-01**: Usuário pode conversar com o JARVIS via texto no terminal (CLI loop)
- [x] **CONV-02**: Usuário pode falar com o JARVIS via push-to-talk (tecla ativa microfone, Whisper transcreve)
- [x] **CONV-03**: JARVIS responde por voz (TTS neural via kokoro, offline)
- [x] **CONV-04**: JARVIS indica claramente seu estado: ouvindo / pensando / falando
- [x] **CONV-05**: Usuário pode ativar JARVIS por wake word ("Hey JARVIS") sem precisar pressionar tecla
- [ ] **CONV-06**: ~~JARVIS mantém contexto coerente dentro de uma sessão via LangGraph checkpointer~~ — Deferred to v2. Within-session coherence achieved via plain message history in ChatSession (D-01 excluded LangGraph classes). LangGraph checkpointer adds cross-session resume which is a v2 concern.

### Memória (MEM)

- [x] **MEM-01**: Toda conversa é salva automaticamente com timestamp no SQLite
- [x] **MEM-02**: JARVIS recupera memórias semanticamente relevantes de sessões anteriores e injeta no contexto
- [x] **MEM-03**: JARVIS mantém perfil do usuário com preferências, fatos e rotinas aprendidos ao longo do tempo
- [x] **MEM-04**: Ao final de cada sessão, JARVIS gera um sumário automático para compressão de contexto
- [x] **MEM-05**: JARVIS nunca perde dados: toda persistência tem fallback e o embedding model é versionado

### Multi-LLM (LLM)

- [x] **LLM-01**: Usuário pode configurar qual LLM usar (LM Studio local, Claude, OpenAI) via arquivo de config
- [x] **LLM-02**: JARVIS detecta automaticamente as capabilities do modelo ativo (tool calling, vision, context window)
- [ ] **LLM-03**: JARVIS faz roteamento inteligente: tarefas de visão vão para modelos com vision, tarefas simples para modelos locais
- [ ] **LLM-04**: Troca de modelo não requer reiniciar o JARVIS; configuração é recarregável

### PC Control (TOOL)

- [x] **TOOL-01**: Usuário pode pedir ao JARVIS para abrir, mover, buscar e listar arquivos por linguagem natural
- [x] **TOOL-02**: Usuário pode pedir ao JARVIS para abrir e fechar aplicativos por nome
- [x] **TOOL-03**: Usuário pode pedir ao JARVIS para ajustar volume, brilho e ver processos ativos
- [x] **TOOL-04**: Ferramentas destrutivas (deletar arquivo, fechar processo) exigem confirmação explícita antes de executar
- [x] **TOOL-05**: Toda chamada de ferramenta é registrada em log auditável no SQLite

### Visão (VISION)

- [ ] **VISION-01**: Usuário pode pedir ao JARVIS para capturar e analisar o que está na tela
- [ ] **VISION-02**: JARVIS usa OCR (pytesseract) para extrair texto de imagens quando o modelo não tem vision
- [ ] **VISION-03**: JARVIS faz fallback automático para modelo cloud com vision quando o modelo local não suporta

### Arquitetura (ARCH)

- [x] **ARCH-01**: JARVIS roda em Linux, Windows e macOS — código OS-específico isolado em módulo de plataforma
- [x] **ARCH-02**: Pipeline de voz é totalmente assíncrono (asyncio.Queue) — sem bloqueio na thread principal
- [x] **ARCH-03**: Dependências críticas de segurança pinadas: langchain-core>=1.2.22, langgraph-checkpoint-sqlite>=3.0.1
- [x] **ARCH-04**: JARVIS valida versões e capabilities na inicialização e falha com mensagem clara se algo estiver errado

## v2 Requirements

### Proatividade

- **PROA-01**: JARVIS sugere ações com base em padrões de rotina detectados
- **PROA-02**: JARVIS envia lembretes proativos de compromissos
- **PROA-03**: JARVIS monitora eventos do sistema e notifica o usuário

### IoT / Raspberry Pi

- **IOT-01**: JARVIS comunica com Raspberry Pi via MQTT
- **IOT-02**: JARVIS controla dispositivos domésticos conectados
- **IOT-03**: JARVIS monitora sensores ambientais

### Interface Gráfica

- **UI-01**: Dashboard web ou desktop para histórico de conversas e configurações
- **UI-02**: Avatar visual com sincronização de fala

### Integrações

- **INT-01**: Integração com Google Calendar / Outlook
- **INT-02**: Integração com email (leitura e sumarização)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Multi-usuário / autenticação | Uso pessoal — um único usuário, sem necessidade de auth |
| Fine-tuning de modelos | Usa modelos prontos via API; treinar próprios é projeto separado |
| Cloud sync de histórico | Contradiz design privacy-first; todo dado fica local |
| Geração de imagens | Ferramenta discreta, sem dependência do core |
| App mobile | Validar CLI + voz primeiro; mobile é projeto separado |
| WebSearch | Removido de v1 — LLMs locais têm conhecimento suficiente para uso pessoal, adicionar depois se necessário |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ARCH-01 | Phase 1 | Complete |
| ARCH-03 | Phase 1 | Complete |
| ARCH-04 | Phase 1 | Complete |
| CONV-01 | Phase 1 | Complete |
| LLM-01 | Phase 1 | Complete |
| LLM-02 | Phase 1 | Complete |
| CONV-06 | v2 | Deferred |
| MEM-01 | Phase 2 | Complete |
| MEM-02 | Phase 2 | Complete |
| MEM-03 | Phase 2 | Complete |
| MEM-04 | Phase 2 | Complete |
| MEM-05 | Phase 2 | Complete |
| ARCH-02 | Phase 3 | Complete |
| CONV-02 | Phase 3 | Complete |
| CONV-03 | Phase 3 | Complete |
| CONV-04 | Phase 3 | Complete |
| CONV-05 | Phase 3 | Complete |
| TOOL-01 | Phase 4 | Complete |
| TOOL-02 | Phase 4 | Complete |
| TOOL-03 | Phase 4 | Complete |
| TOOL-04 | Phase 4 | Complete |
| TOOL-05 | Phase 4 | Complete |
| LLM-03 | Phase 5 | Pending |
| LLM-04 | Phase 5 | Pending |
| VISION-01 | Phase 5 | Pending |
| VISION-02 | Phase 5 | Pending |
| VISION-03 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 27 total
- Mapped to phases: 27
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-02*
*Last updated: 2026-04-04 — CONV-06 deferred to v2 (gap closure 02-06)*
