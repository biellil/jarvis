---
phase: 38-rolling-summarization
reviewed: 2026-04-25T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - apps/backend-ts/src/memory/manager.test.ts
  - apps/backend-ts/src/memory/manager.ts
  - apps/backend-ts/src/memory/store.test.ts
  - apps/backend-ts/src/memory/store.ts
  - apps/backend-ts/src/session/chat-session.test.ts
  - apps/backend-ts/src/session/chat-session.ts
findings:
  critical: 0
  warning: 4
  info: 4
  total: 8
status: issues_found
---

# Phase 38: Code Review Report

**Reviewed:** 2026-04-25
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

A Phase 38 (rolling summarization) está bem estruturada — segue fielmente os padrões fire-and-forget estabelecidos em Phases 36 e 37, com tratamento de erro silencioso (MEM-05), early-exit em threshold, e cobertura de testes ampla (vitest com mocks). O design respeita o contrato de divergência consciente do `buildContext()` introduzido na Phase 37.

Pontos críticos (zero achados Critical) — não há vulnerabilidades de segurança nem bugs que travem o pipeline. Os achados Warning concentram-se em três áreas:

1. **`_generateRollingSummary` não trata `MessageContent` em formato array** — quebra silenciosamente com providers Anthropic (que retornam blocos estruturados em vez de string).
2. **Race condition entre múltiplos `send()` concorrentes** — duas summarizações fire-and-forget podem sobrepor, gastando LLM duplicado e gerando dois inserts em `summaries` para o mesmo lote.
3. **Inconsistência semântica entre `countMessages` (filtra roles) e `getOldestMessages` (não filtra)** — em conversas com `system` messages no DB, a contagem subestima e o lote de delete pode incluir/excluir rows inesperadas.
4. **`_latestSummary` não é repopulado no startup** — após restart do backend, o cache está vazio até a próxima sumarização rodar, deixando `buildContext()` sem o summary mais recente do SQLite (D-04b explicitamente deixou em discricionariedade do Claude, mas o efeito é uma janela de "amnésia" pós-restart).

Sugestão geral: a fase está pronta para shippar, mas vale endereçar pelo menos WR-01 (content array) e WR-03 (race condition) antes de promover para produção com providers Anthropic e múltiplas tabs/clientes WebSocket.

## Warnings

### WR-01: `_generateRollingSummary` ignora `MessageContent` em formato array

**File:** `apps/backend-ts/src/memory/manager.ts:269`
**Issue:** `result.content` em LangChain core é tipado como `string | Array<ContentBlock>`. Provedores como Anthropic (langchain-anthropic) retornam content como array de blocos (`[{ type: 'text', text: '...' }]`), não string. O código atual:

```ts
const text = typeof result.content === 'string' ? result.content.trim() : '';
```

Quando `content` é array, `text` vira `''` → o método retorna `''` → `runRollingSummarization` early-returns sem deletar nada nem persistir o sumário. O bug é silencioso (sem log indicando "skipped because non-string content") e particularmente perigoso porque a stack inclui `langchain-anthropic` como dependência declarada no CLAUDE.md (Multi-LLM mandatório).

**Fix:**
```ts
function extractTextFromContent(content: unknown): string {
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((block) =>
        typeof block === 'string'
          ? block
          : (block && typeof block === 'object' && 'text' in block && typeof (block as any).text === 'string')
            ? (block as { text: string }).text
            : '',
      )
      .join('')
      .trim();
  }
  return '';
}

// Em _generateRollingSummary:
const text = extractTextFromContent(result.content);
return text ? `### Resumo da Conversa Anterior\n${text}` : '';
```

Adicionar teste com mock de LLM Anthropic-like que retorne `content: [{ type: 'text', text: '- Resumo' }]`.

---

### WR-02: `countMessages` filtra por role mas `getOldestMessages` não — inconsistência ao deletar

**File:** `apps/backend-ts/src/memory/store.ts:181-197`
**Issue:** `countMessages` aplica `inArray(messages.role, ['user', 'assistant'])` (linha 164) — alinhado com D-05. Já `getOldestMessages` (linha 181) NÃO filtra por role e retorna qualquer message da conversation, incluindo possíveis `system`. Em duas situações isso machuca:

1. Se em algum ponto o codebase passar a inserir messages com `role='system'` (o enum permite — `messageRoleEnum` em `schema.ts:5`), o threshold de 20 baseado só em user+assistant pode ser atingido, mas o `getOldestMessages(convId, 10)` retornaria 10 incluindo system messages como mais antigas — sumarizando-as incorretamente e deletando-as.
2. O `runRollingSummarization` confia que "as 10 mais antigas" são as que devem ser sumarizadas (D-06). A inconsistência viola essa premissa quando role mistura.

Hoje, o codebase só insere user/assistant via `saveTurn` e `saveMessages`, então o problema é latente — mas o enum permite system, então uma futura adição (ex: persistir SystemMessage de prompt) ativa o bug silenciosamente.

**Fix:** Aplicar o mesmo filtro de role em `getOldestMessages`:

```ts
getOldestMessages(convId: number, limit: number): MessageWithId[] {
  try {
    const rows = this.db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, convId),
          inArray(messages.role, ['user', 'assistant']),
        ),
      )
      .orderBy(asc(messages.id))
      .limit(limit)
      .all();
    return rows as unknown as MessageWithId[];
  } catch (exc) {
    console.warn(
      `MemoryStore.getOldestMessages failed (convId=${convId}): ${(exc as Error).message}`,
    );
    return [];
  }
}
```

Adicionar teste em `store.test.ts` que insira 1 system + 5 user para verificar que `getOldestMessages` retorna apenas as 5 user.

---

### WR-03: Race condition entre múltiplas summarizations fire-and-forget concorrentes

**File:** `apps/backend-ts/src/session/chat-session.ts:169` and `apps/backend-ts/src/session/chat-session.ts:230`
**Issue:** `void this.memory.runRollingSummarization(this._convId)` é fire-and-forget. Se dois `send()` (ou `sendStream()`) rodarem em paralelo na mesma `ChatSession` (ex: dois clientes WebSocket simultâneos, ou um teste de stress) e ambos atingirem a chamada antes de qualquer um deletar mensagens, o seguinte acontece:

1. T1: `countMessages` retorna 20.
2. T2: `countMessages` retorna 20 (T1 ainda não deletou).
3. T1: `getOldestMessages` retorna `[1..10]`.
4. T2: `getOldestMessages` retorna `[1..10]` (mesma lista).
5. T1: chama LLM → gasta tokens.
6. T2: chama LLM → gasta tokens (duplicado).
7. T1: deleta `[1..10]`, insere summary `S1`.
8. T2: deleta `[1..10]` (no-op, já foi), insere summary `S2`.
9. Resultado: 2 entries em `summaries` para o mesmo lote → `_latestSummary` reflete só S2 (last writer wins) mas SQLite tem ambos. Custo de LLM dobrado, ruído na tabela.

A vulnerabilidade existe porque não há lock/mutex em torno de `runRollingSummarization`. O comentário em `manager.ts:209-213` diz "fire-and-forget" mas não menciona idempotência.

**Fix:** Adicionar um in-memory mutex no `MemoryManager` para evitar runs concorrentes na mesma instância:

```ts
private _summarizationInProgress = false;

async runRollingSummarization(convId: number | null): Promise<void> {
  if (convId === null) return;
  if (this._summarizationInProgress) return; // idempotência: só uma corrida por vez
  this._summarizationInProgress = true;

  try {
    // ... lógica atual ...
  } catch (err) {
    console.warn(/* ... */);
  } finally {
    this._summarizationInProgress = false;
  }
}
```

Adicionar teste em `manager.test.ts`: invocar `runRollingSummarization` duas vezes em paralelo e verificar que `llm.invoke` foi chamado uma única vez.

---

### WR-04: `_latestSummary` não é repopulado no startup — janela de "amnésia" pós-restart

**File:** `apps/backend-ts/src/memory/manager.ts:36-43`
**Issue:** D-04b explicitamente deixa em discricionariedade do implementador "se popular `_latestSummary` no startup buscando do SQLite". O implementador escolheu NÃO popular. Consequência: após qualquer restart do backend (deploy, crash recovery, dev hot-reload), `_latestSummary` é `null` e `buildContext()` não injeta nenhum summary até a próxima sumarização rodar (próximas 20 mensagens, ~10-30 minutos de conversa).

A função `getLatestSummary(convId)` já existe e está testada (`store.test.ts:184-190`). O custo de uma única SELECT no construtor é desprezível.

Não é bug funcional (D-04b permite explicitamente), mas é trade-off com efeito visível: o JARVIS "esquece" temporariamente o resumo da conversa anterior após restart — viola o "core value" do projeto declarado no CLAUDE.md ("ele lembrando de tudo entre sessões").

**Fix:** Não repopular no construtor (que é síncrono) — em vez disso, expor um método `loadLatestSummary(convId)` chamado pelo `ChatSession.create()` após `startConversation`:

```ts
// manager.ts
async loadLatestSummary(convId: number): Promise<void> {
  try {
    const summary = this.store.getLatestSummary(convId);
    if (summary) this._latestSummary = summary;
  } catch (err) {
    console.warn(`MemoryManager.loadLatestSummary failed: ${(err as Error).message}`);
  }
}

// chat-session.ts em create():
const convId = await opts.memory.startConversation();
if (convId !== null) await opts.memory.loadLatestSummary(convId);
```

Alternativa (lazy): no `buildContext()`, se `_latestSummary` é null e `convId` está disponível, fazer uma SELECT lazy. Mas isso torna `buildContext` dependente de `convId` que hoje não recebe.

## Info

### IN-01: Comentário desatualizado em `sendStream` sobre não passar pelo agent ReAct

**File:** `apps/backend-ts/src/session/chat-session.ts:175-177`
**Issue:** O JSDoc do método `sendStream` diz:

> Divergência consciente: NÃO passa pelo agent ReAct — sem tool calling no modo streaming.

Mas o código IMPLEMENTA via agent ReAct (linha 195: `this._agent.stream(...)`). O comentário data do plano 17-02 e o plano 18-04 (mencionado mais abaixo no mesmo bloco) reverteu a decisão. O JSDoc inicial confunde leitores.

**Fix:** Remover ou reescrever o trecho da linha 175-177 para refletir a realidade pós-18-04. Sugestão:

```ts
/**
 * Stream tokens um a um via agent.stream() com streamMode 'messages' (plano 18-04).
 * O agent ReAct é usado também no streaming, então tool calls funcionam — mas o
 * history pós-stream só guarda a AIMessage final (chunks concatenados), não as
 * ToolMessages internas. Audit log SQLite é fonte da verdade para tool dispatches.
 * Per D-02: não imprime em stdout.
 * ...
 */
```

---

### IN-02: Mensagem de erro do LLM em `_generateRollingSummary` não inclui `convId`

**File:** `apps/backend-ts/src/memory/manager.ts:272`
**Issue:** O log diz `[summarization] LLM invocation failed: <msg>` — sem indicar QUAL conversa estava sendo sumarizada. Em produção com múltiplas conversas concorrentes, o log fica difícil de correlacionar.

**Fix:** Como `_generateRollingSummary` recebe `msgs` (que contêm `conversationId`), incluir esse campo no log:

```ts
const cid = msgs[0]?.conversationId ?? '?';
console.warn(`[summarization] LLM invocation failed (convId=${cid}): ${(err as Error).message}`);
```

---

### IN-03: Não há log de sucesso em `runRollingSummarization`

**File:** `apps/backend-ts/src/memory/manager.ts:236-237`
**Issue:** O método loga apenas erros (linha 240). Em produção, identificar "a sumarização rodou e funcionou" exige inferência indireta (ver SQLite). Para debug e métricas (ex: quantos sumários por dia), um log informativo de sucesso seria útil.

**Fix:** Adicionar log estruturado após `_latestSummary = summary`:

```ts
this._latestSummary = summary;
console.info(
  `[summarization] convId=${convId} ok: ${ids.length} msgs deletadas, summary=${summary.length}ch`,
);
```

(O CLAUDE.md sugere `loguru` em Python; em TS, `loguru` não existe — `console.info` é aceitável até Phase X introduzir um logger estruturado.)

---

### IN-04: Teste 'sendStream chama runRollingSummarization' usa `AIMessageChunk({ content: 'chunk1' })` — outros testes usam string direto

**File:** `apps/backend-ts/src/session/chat-session.test.ts:299-300`
**Issue:** Pequena inconsistência de estilo entre testes:

```ts
// linha 206 (forma curta)
yield [new AIMessageChunk('oi'), {}];

// linha 299 (forma objeto)
yield [new AIMessageChunk({ content: 'chunk1' }), {}];
```

Não é bug — as duas formas funcionam. Mas a inconsistência atrapalha quem ler o arquivo procurando padrões. Padronizar reduz fricção cognitiva.

**Fix:** Trocar linhas 299-300 para a forma curta:

```ts
yield [new AIMessageChunk('chunk1'), {}];
yield [new AIMessageChunk('chunk2'), {}];
```

---

_Reviewed: 2026-04-25_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
