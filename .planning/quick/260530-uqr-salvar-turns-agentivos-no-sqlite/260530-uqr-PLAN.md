---
phase: 260530-uqr
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/backend-ts/src/session/chat-session.ts
  - apps/backend-ts/src/routes/chat.ts
autonomous: true
requirements: [UQR-01]
must_haves:
  truths:
    - "Turns agentivos (task:done) ficam persistidos no SQLite após completar"
    - "Turns do caminho de resume de confirmação também ficam persistidos"
    - "Falhas de persistência não quebram o fluxo SSE (warn-only)"
  artifacts:
    - path: apps/backend-ts/src/session/chat-session.ts
      provides: "Método público saveTurn() delegando para memory.saveTurn()"
    - path: apps/backend-ts/src/routes/chat.ts
      provides: "Chamadas a session.saveTurn() nos dois caminhos agentivos"
  key_links:
    - from: apps/backend-ts/src/routes/chat.ts
      to: apps/backend-ts/src/session/chat-session.ts
      via: "session.saveTurn(message, taskOutput)"
      pattern: "session\\.saveTurn"
---

<objective>
Persistir turns agentivos no SQLite — atualmente o caminho agentico em chat.ts chama
graph.stream() diretamente sem passar por session.send() ou session.sendStream(), fazendo
com que saveTurn() nunca seja chamado para essas mensagens.

Purpose: Memória contínua funciona para turns normais mas perde todos os turns agentivos —
o JARVIS "esquece" qualquer conversa que passou pelo grafo de tarefas.
Output: Dois pontos de persistência adicionados (agentic turn + resume de confirmação).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@apps/backend-ts/src/session/chat-session.ts
@apps/backend-ts/src/routes/chat.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Expor saveTurn público no ChatSession</name>
  <files>apps/backend-ts/src/session/chat-session.ts</files>
  <action>
Adicionar um método público `saveTurn(userText: string, assistantText: string): void`
ao `ChatSession` que delega para `memory.saveTurn()` com o mesmo padrão fire-and-forget
já usado internamente em send() e sendStream().

Inserir após o método `clearAwaitingConfirmation()` (linha ~373), antes de `send()`:

```typescript
/**
 * Public facade para persistência de turns externos (ex: caminho agentivo em chat.ts).
 * Fire-and-forget — mesmo padrão de send() e sendStream().
 */
saveTurn(userText: string, assistantText: string): void {
  if (this._convId !== null) {
    void this.memory.saveTurn(this._convId, userText, assistantText);
  }
}
```

Não alterar nada mais — especialmente não modificar send() ou sendStream() que já chamam
memory.saveTurn() diretamente.
  </action>
  <verify>
    <automated>cd apps/backend-ts && npx tsc --noEmit 2>&1 | head -20</automated>
  </verify>
  <done>ChatSession.saveTurn() existe e compila sem erros de tipo</done>
</task>

<task type="auto">
  <name>Task 2: Chamar session.saveTurn() nos dois caminhos agentivos de chat.ts</name>
  <files>apps/backend-ts/src/routes/chat.ts</files>
  <action>
Adicionar chamadas a `session.saveTurn()` em dois pontos do arquivo:

**Ponto 1 — Caminho agentico principal (em torno da linha 260-268):**
No bloco `} else if (isTerminal) {` após o `for await` do agentic turn, chamar saveTurn
quando `taskOutput` estiver definido. Adicionar APÓS `void taskCheckpointer.deleteThread(taskId).catch(...)`:

```typescript
// Persist agentic turn to SQLite (message + task summary)
if (taskOutput) {
  session.saveTurn(message, taskOutput);
}
```

**Ponto 2 — Caminho de resume de confirmação (em torno da linha 154-157):**
No bloco `if (isTerminal) {` após o `for await` do resumeStream, adicionar APÓS
`void taskCheckpointer.deleteThread(pendingTaskId).catch(...)`:

```typescript
// Persist resume turn to SQLite (message + task summary)
if (resumeOutput) {
  session.saveTurn(message, resumeOutput);
}
```

Verificar que `message` está disponível em ambos os escopos (é extraído do body do
request antes desses blocos — sim, está disponível).

Não adicionar saveTurn no bloco catch — turn incompleto não deve ser persistido.
  </action>
  <verify>
    <automated>cd apps/backend-ts && npx tsc --noEmit 2>&1 | head -20</automated>
  </verify>
  <done>
TypeScript compila sem erros. grep confirma duas ocorrências de session.saveTurn em chat.ts:
`grep -n "session.saveTurn" apps/backend-ts/src/routes/chat.ts` retorna 2 linhas.
  </done>
</task>

</tasks>

<verification>
cd apps/backend-ts && npx tsc --noEmit
grep -n "session\.saveTurn" apps/backend-ts/src/routes/chat.ts
grep -n "saveTurn" apps/backend-ts/src/session/chat-session.ts
</verification>

<success_criteria>
- TypeScript compila sem erros em apps/backend-ts
- `session.saveTurn` aparece 2x em chat.ts (agentic turn + resume turn)
- `public saveTurn(` aparece 1x em chat-session.ts
- Padrão fire-and-forget mantido (void, sem await, sem try/catch extra)
</success_criteria>

<output>
Após completar, criar `.planning/quick/260530-uqr-salvar-turns-agentivos-no-sqlite/260530-uqr-01-SUMMARY.md`
</output>
