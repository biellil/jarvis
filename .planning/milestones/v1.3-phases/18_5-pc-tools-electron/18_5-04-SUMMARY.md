---
phase: 18_5-pc-tools-electron
plan: 04
subsystem: desktop/main
tags: [electron, actions, queue, dedup, dialog]
requires: [18_5-02, 18_5-03]
provides: [createActionExecutor]
key-files:
  created:
    - apps/desktop/src/main/action-executor.ts
    - apps/desktop/src/main/__tests__/action-executor.test.ts
decisions:
  - "Queue FIFO via cadeia de promises — sem libs externas, zero paralelismo garantido"
  - "Dedup TTL 5min via Map<id, ts> com sweep lazy no enqueue"
  - "processEvent nunca propaga erro — senão quebra o .then da queue"
  - "Confirmação: response !== 1 = negação (cancelId=0 garante fechar janela = cancelar)"
metrics:
  tasks: 2
  tests: 10
  duration: "~5min"
---

# Phase 18.5 Plan 04: ActionExecutor com queue, dialog e dedup — Summary

ActionExecutor do Electron main process serializa actions SSE com dedup por tool_call_id (TTL 5min), dialog de confirmação em pt-BR para destrutivas, dispatch via ACTION_HANDLERS e reporting estruturado via backendClient.postToolCallResult.

## API

```typescript
createActionExecutor({
  handlers: Record<string, ActionHandler>,
  requiresConfirmation?: Set<string>,
  backendClient: { postToolCallResult(id, result): Promise<void> },
  dialog: { showMessageBox(opts): Promise<{response: number}> },
  now?: () => number,
}): {
  enqueue(event: ActionEvent): void;
  shutdown(): Promise<void>;
}

type ActionEvent = {
  tool_call_id: number;
  action: string;
  args: Record<string, unknown>;
  requires_confirmation: boolean;
};
```

## Comportamento

1. **enqueue** — sweep de entradas expiradas (>5min); duplicata → warn + return; senão registra ts e encadeia em `queue = queue.then(() => processEvent(event))`.
2. **processEvent**:
   - Handler inexistente → `{success:false, error:'unknown_action: <name>'}`.
   - `event.requires_confirmation` OU `requiresConfirmation.has(action)` → `dialog.showMessageBox({buttons:['Cancelar','Sim, executar'], cancelId:0, defaultId:0, type:'warning'})`. `response !== 1` → `{success:false, error:'user_denied'}`.
   - Handler throw → `{success:false, error:'handler_crash: <msg>'}`.
   - Outcome vai pra `backendClient.postToolCallResult`. Erro do post → `console.warn`, queue continua.
3. **shutdown** — `await queue`.

## Cobertura de testes (10/10 passed)

- Dedup: tool_call_id duplicado ignora 2ª chamada
- TTL: após 5min+1ms o mesmo id pode reprocessar (via `now` injetado)
- FIFO: 3 eventos concorrentes executam em ordem, `maxActive === 1`
- Sem confirmação → handler + post chamados, dialog NÃO chamado
- Com `requires_confirmation=true` + aprovação → handler + post chamados
- Com `requiresConfirmation` set + negação → handler NÃO chamado, post recebe `user_denied`
- Handler `{success:false}` → reportado verbatim
- Handler throw → `handler_crash: kaboom`
- Action desconhecida → `unknown_action: nuke_world`
- post lança na 1ª chamada → warn logado, 2ª action processa normalmente

## Próximo passo

Pronto pra wire em `apps/desktop/src/main/ipc/chat.ts` (Plan 18_5-05): instanciar via `createActionExecutor({handlers: ACTION_HANDLERS, requiresConfirmation: REQUIRES_CONFIRMATION, backendClient, dialog})` e chamar `exec.enqueue(payload)` dentro do `onAction` do `openChatStream`.

## Self-Check: PASSED

- action-executor.ts exists
- action-executor.test.ts exists (10 tests passing)
- Commit registered
