# Phase 27: Conversation Quality - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-12
**Phase:** 27-conversation-quality
**Areas discussed:** System Prompt pt-BR, Memory Recall Strategy, Tool Description & Invocation, Context Injection Point

---

## System Prompt pt-BR

### Question 1: Qual tom/personalidade o JARVIS deve ter nas respostas?

| Option | Description | Selected |
|--------|-------------|----------|
| Formal e profissional | Tratamento formal ('senhor', 'você'), linguagem técnica quando apropriado. Como assistente executivo. | |
| Casual e amigável | Tratamento informal ('você', 'tu' regional ok), linguagem natural. Como amigo prestativo. | ✓ |
| Técnico e direto | Respostas concisas, foco em precisão, menos social. Como terminal/CLI assistant. | |

**User's choice:** Casual e amigável
**Notes:** Alinha com "Just A Rather Very Intelligent System" — referência cultural informal.

---

### Question 2: Como o JARVIS deve lidar com idioma nas respostas?

| Option | Description | Selected |
|--------|-------------|----------|
| Sempre pt-BR, instrução explícita | System prompt instrui: 'Sempre responda em português brasileiro'. Garante consistência mesmo com input em inglês. | ✓ |
| Adaptar ao idioma do usuário | Responder no mesmo idioma que o usuário usou (pt/en/es). Mais flexível mas não garante pt-BR. | |
| pt-BR sem instruir | Confiar que exemplos/contexto farão o LLM responder em pt-BR. Menos explícito. | |

**User's choice:** Sempre pt-BR, instrução explícita
**Notes:** Cumpre CONV-07 diretamente.

---

### Question 3: Além do idioma, o que o system prompt deve incluir?

| Option | Description | Selected |
|--------|-------------|----------|
| Identidade (nome JARVIS) | Explicitar 'Você é o JARVIS'. Reforça persona. | ✓ |
| Capacidades (memória, ações) | 'Você lembra de tudo, executa ações no PC'. Ajuda LLM saber o que pode fazer. | ✓ |
| Comportamento esperado | 'Seja prestativo, use tools quando necessário'. Orienta uso de tools. | ✓ |
| Minimalista | Só idioma + identidade. Menos instruções = menos viés. | ✓ |

**User's choice:** Todas as opções (multiSelect)
**Notes:** Interpretado na Q4 como "conciso mas completo" — todos elementos mas sem verbosidade.

---

### Question 4: Nível de detalhe do prompt

| Option | Description | Selected |
|--------|-------------|----------|
| Conciso mas completo | Identidade + capacidades + comportamento, mas em poucas frases diretas. | ✓ |
| Só essencial | Apenas idioma + 'Você é o JARVIS'. Deixa o LLM inferir o resto. | |
| Detalhado | Incluir exemplos, edge cases, instruções específicas de quando usar tools. | |

**User's choice:** Conciso mas completo
**Notes:** Interpreta 'minimalista' como estilo, não exclusão de conteúdo.

---

## Memory Recall Strategy

### Question 1: Quantos resultados de memória devem ser retornados por busca?

| Option | Description | Selected |
|--------|-------------|----------|
| 5 resultados (atual) | Padrão atual. Equilíbrio entre contexto e ruído. | |
| 3 resultados | Mais conservador, menos chance de ruído irrelevante. | |
| 10 resultados | Mais contexto, mas pode incluir itens menos relevantes. | |
| Dinâmico (3-10) | Variar com base na query ou qualidade dos matches. Mais complexo. | ✓ |

**User's choice:** Dinâmico (3-10)
**Notes:** Favorece qualidade sobre quantidade fixa.

---

### Question 2: Como determinar quantos resultados retornar dinamicamente?

| Option | Description | Selected |
|--------|-------------|----------|
| Por qualidade (similarity) | Retornar todos acima de threshold alto (ex: >0.7), limitado a 10. Favorece precisão. | ✓ |
| Por tipo de query | Queries específicas (nome, data) = menos resultados; queries amplas = mais. Requer classificação. | |
| Por tamanho do contexto | Ajustar com base no token budget disponível. Mais técnico. | |
| Você decide | Claude escolhe estratégia apropriada durante implementação. | |

**User's choice:** Por qualidade (similarity)
**Notes:** Garante só matches relevantes.

---

### Question 3: Qual threshold de similaridade usar?

| Option | Description | Selected |
|--------|-------------|----------|
| 0.5 (atual) | 50% de similaridade mínima. Permite matches moderados. Padrão comum. | ✓ |
| 0.7 (alto) | 70% de similaridade. Mais seletivo, só matches fortes. | |
| 0.3 (baixo) | 30% de similaridade. Mais permissivo, pode incluir matches fracos. | |
| Você decide | Claude escolhe threshold apropriado. | |

**User's choice:** 0.5 (atual)
**Notes:** Balanceado entre recall e precision, já testado.

---

### Question 4: Como formatar as memórias recuperadas?

| Option | Description | Selected |
|--------|-------------|----------|
| Lista markdown (atual) | ### Recall from past conversations\n- "texto1"\n- "texto2". Formato atual já implementado. | |
| Prosaico | 'O usuário mencionou: texto1. Também disse: texto2.' Mais natural. | |
| Estruturado JSON | JSON com metadata (timestamp, similarity). Mais dados mas menos legível. | |
| Você decide | Claude escolhe formato apropriado. | ✓ |

**User's choice:** Você decide (Claude's discretion)
**Notes:** Pode manter markdown ou tornar mais natural.

---

## Tool Description & Invocation

### Question 1: A descrição atual da tool está clara?

| Option | Description | Selected |
|--------|-------------|----------|
| Sim, manter atual | Descrição já explica bem: busca memórias passadas + perfil. | ✓ |
| Adicionar exemplos | Incluir casos de uso: 'Ex: nome do usuário, preferências, decisões anteriores'. | |
| Mais explícita | 'SEMPRE use esta tool antes de responder perguntas sobre o usuário'. | |
| Você decide | Claude escolhe descrição apropriada. | |

**User's choice:** Sim, manter atual
**Notes:** Concisa e clara.

---

### Question 2: O esquema de input (query: string) é adequado?

| Option | Description | Selected |
|--------|-------------|----------|
| Sim, query string ok | LLM extrai termos relevantes e passa como query. Simples e flexível. | ✓ |
| Adicionar filtros | query + opcional timeRange, role, etc. Mais controle mas mais complexo. | |
| Você decide | Claude escolhe esquema apropriado. | |

**User's choice:** Sim, query string ok
**Notes:** Já implementado, funciona.

---

### Question 3: Quando o agente deve invocar recall_memory?

| Option | Description | Selected |
|--------|-------------|----------|
| A critério do agente | Deixar o ReAct agent decidir com base na pergunta. Autônomo. | ✓ |
| Sempre no início | Chamar recall_memory antes de toda resposta. Garante contexto mas aumenta latência. | |
| Com gatilhos específicos | Keywords na query ('lembrar', 'anterior', etc) acionam tool. Menos flexível. | |
| Você decide | Claude escolhe estratégia apropriada. | |

**User's choice:** A critério do agente
**Notes:** Agente já tem a descrição da tool.

---

### Question 4: Como lidar quando recall_memory não encontra resultados ou retorna erro?

| Option | Description | Selected |
|--------|-------------|----------|
| Retornar mensagem (atual) | 'Nenhuma memória relevante encontrada' ou 'Erro ao buscar'. Tool nunca propaga exceções. | ✓ |
| Silent fail | Retornar string vazia, agente responde sem contexto. | |
| Retry automático | Tentar novamente com query reformulada. | |
| Você decide | Claude escolhe estratégia apropriada. | |

**User's choice:** Retornar mensagem (atual)
**Notes:** Já implementado, agente continua normalmente.

---

## Context Injection Point

### Question 1: Onde injetar as memórias recuperadas?

| Option | Description | Selected |
|--------|-------------|----------|
| Via tool response (atual) | Agente chama recall_memory, recebe resultado via ToolMessage. Autônomo, agente decide quando buscar. | ✓ |
| System prompt | Buscar automaticamente e injetar no system prompt. Sempre disponível mas aumenta tokens. | |
| Mensagem separada | Adicionar SystemMessage com contexto após user message. Híbrido. | |
| Você decide | Claude escolhe abordagem apropriada. | |

**User's choice:** Via tool response (atual)
**Notes:** Já implementado, alinhado com ReAct pattern.

---

### Question 2: Como lidar com profile facts?

| Option | Description | Selected |
|--------|-------------|----------|
| Incluir no recall (atual) | buildContext() retorna profile facts + recall results juntos. Sempre disponível. | ✓ |
| Separar em tool própria | get_profile tool separada. Mais granular mas mais chamadas. | |
| Injetar no system prompt | Profile sempre visível sem tool call. Mais tokens mas sempre presente. | |
| Você decide | Claude escolhe abordagem apropriada. | |

**User's choice:** Incluir no recall (atual)
**Notes:** Já implementado.

---

## Claude's Discretion

**Areas where user delegated implementation choices to Claude:**
- Formato exato do contexto de memória (D-07): pode manter lista markdown ou tornar mais prosáico conforme apropriado

## Deferred Ideas

Nenhuma — discussão permaneceu dentro do escopo da fase.
