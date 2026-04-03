---
phase: "02"
name: memory
status: decisions_captured
created: 2026-04-02
updated: 2026-04-02
---

# Phase 02: Memory — Context

## Domain Boundary

Transformar JARVIS de chatbot stateless em parceiro que lembra. Toda conversa salva automaticamente, memórias semanticamente relevantes injetadas no contexto, perfil do usuário aprendido ao longo do tempo, e contexto comprimido quando a janela de contexto enche — sem interrupção.

Esta fase NÃO inclui: voz, ferramentas de PC, roteamento inteligente de LLM.

---

## Decisions

### D-01: Injeção de memória — automático em todo turno

**Decisão:** Em todo turno de conversa, recuperar top-K memórias por similaridade semântica e injetar no system prompt antes de enviar ao LLM.

**Comportamento:** Sempre busca, sempre injeta se houver resultados. Sem threshold de corte — confia no ranqueamento do ChromaDB.

**Impacto no código:** `ChatSession.send()` precisará fazer lookup no ChromaDB antes de montar a lista de mensagens para o LLM.

**Canonical refs:** REQUIREMENTS.md → MEM-02

---

### D-02: Arquitetura de sessão — in-memory por sessão, SQLite para histórico

**Decisão:** Manter `ChatSession` com histórico in-memory (list de mensagens). Quando a sessão encerra (exit/quit/Ctrl+C), o histórico da sessão é salvo no SQLite. Próxima sessão começa limpa.

**Comportamento:**
- Dentro de uma sessão: contexto completo in-memory (igual Phase 1)
- Entre sessões: histórico não é restaurado como mensagens ativas — só fica no SQLite pra consulta e embedding
- Sem LangGraph checkpointer por agora — pode evoluir em fase futura

**Impacto no código:** `__main__.py` chama `session.save()` no bloco `finally` antes de encerrar. `ChatSession` ganha método `save(db)`.

**Canonical refs:** REQUIREMENTS.md → MEM-01, CONV-06

---

### D-03: Perfil do usuário — extração implícita + comando explícito

**Decisão:** Duas formas de aprender preferências e fatos sobre o usuário:

1. **Implícito:** Após cada turno, um LLM call leve analisa se a mensagem do usuário contém fatos ou preferências pessoais (ex: "eu trabalho com Python", "prefiro código sem comentários"). Se sim, extrai e salva no perfil (SQLite + vetor).

2. **Explícito:** Usuário pode dizer `"lembra que..."` ou `"minha preferência é..."` e JARVIS reconhece e salva com prioridade alta.

**Formato de armazenamento:** Pares `(chave, valor, fonte, timestamp)` no SQLite. Chaves livres (não schema fixo) — ex: `("linguagem_favorita", "Python", "implícito", ...)`.

**Impacto no código:** Pipeline pós-resposta em `ChatSession.send()` ou worker leve. Não bloqueia o streaming.

**Canonical refs:** REQUIREMENTS.md → MEM-03

---

### D-04: Limite de contexto — rolling summary (compressão sem parar)

**Decisão:** Quando o histórico in-memory se aproximar do limite da janela de contexto do modelo ativo (`settings` já expõe `context_window` via `detect_capabilities()`), JARVIS comprime as mensagens mais antigas num sumário e substitui:

```
[SystemMessage: system prompt]
[AIMessage: "Resumo da conversa até aqui: ..."]   ← sumário comprimido
[HumanMessage: ...mensagens recentes...]
[AIMessage: ...]
```

**Comportamento:**
- Threshold: quando `len(history) * avg_tokens > context_window * 0.75`
- Compressão é síncrona mas rápida — uma chamada ao LLM com o histórico antigo
- Sumário é salvo no SQLite (mesmo que a sessão encerre logo depois)
- Conversa continua sem interrupção para o usuário

**Impacto no código:** Método `ChatSession._maybe_compress()` chamado antes de cada `send()`. Recebe o LLM já instanciado.

**Canonical refs:** REQUIREMENTS.md → MEM-04, MEM-05

---

### D-05: Embedding model — local, sentence-transformers

**Decisão:** `sentence-transformers/all-MiniLM-L6-v2` (22 MB, 384-dim, offline). ChromaDB em modo embutido (sem servidor). Path configurável via `settings.chroma_path` e `settings.sqlite_path`.

**Privacidade:** Nenhum dado de conversa sai do dispositivo por padrão (constraint core do projeto).

**Canonical refs:** REQUIREMENTS.md → MEM-05, CLAUDE.md → Technology Stack

---

## Canonical Refs

- `.planning/REQUIREMENTS.md` — MEM-01 a MEM-05, CONV-06
- `.planning/PROJECT.md` — Core Value, Constraints (privacy-first, multi-LLM abstraction)
- `./CLAUDE.md` — Technology Stack (ChromaDB 1.5.x, sentence-transformers 3.x, SQLite stdlib)
- `src/jarvis/core/session.py` — ChatSession a ser estendida
- `src/jarvis/config.py` — Settings a receber chroma_path, sqlite_path
- `src/jarvis/llm/capabilities.py` — detect_capabilities() expõe context_window

---

## Deferred Ideas

_(ideias surgidas na discussão mas fora do escopo de Phase 2)_

- Restaurar contexto completo entre sessões (LangGraph checkpointer) — Phase futura
- LLM decide quando buscar memória (tool call approach) — opção descartada por agora, pode revisitar
- Sumário assíncrono em background thread — descartado em favor de síncrono rápido
