---
phase: 67-jarvis-proativo
plan: 13
subsystem: desktop-renderer
tags: [proactive, ui, react, gap-closure, PROACT-02]
dependency_graph:
  requires:
    - 67-09  # ProactiveEventBubble + ChatContext com addProactiveMessage
  provides:
    - ProactiveMessageList component renderizado no App.tsx
  affects:
    - apps/desktop/src/renderer/src/App.tsx
    - apps/desktop/src/renderer/src/chat/ProactiveMessageList.tsx
tech_stack:
  added: []
  patterns:
    - useState para dismissed IDs (sem remover do ChatContext)
    - TDD RED→GREEN com vi.mock para isolamento de useChat e ProactiveEventBubble
key_files:
  created:
    - apps/desktop/src/renderer/src/chat/ProactiveMessageList.tsx
    - apps/desktop/src/renderer/src/chat/__tests__/ProactiveMessageList.test.tsx
  modified:
    - apps/desktop/src/renderer/src/App.tsx
decisions:
  - "Dismiss gerenciado por Set<string> interno (dismissedIds) sem remover do ChatContext — mantém histórico para eventual MessageList completo"
  - "MAX_VISIBLE=5 implementado via .slice(-MAX_VISIBLE) conforme T-67-13-02 (DoS mitigation)"
  - "Strip posicionada como div absolute top-2 left-2 right-2 z-10 acima do Orb"
metrics:
  duration_minutes: 8
  completed_date: "2026-05-10"
  tasks_completed: 2
  files_created: 2
  files_modified: 1
---

# Phase 67 Plan 13: ProactiveMessageList + App.tsx Integration Summary

**One-liner:** ProactiveMessageList renderiza bubbles proativas do ChatContext com dismiss interno, integrado como strip absoluta acima do Orb no App.tsx, fechando o PROACT-02 gap 3.

## What Was Built

Criado `ProactiveMessageList.tsx` que consome `useChat().messages`, filtra por `role='proactive'`, limita aos 5 mais recentes (MAX_VISIBLE=5), e renderiza cada um via `ProactiveEventBubble`. O dismiss é gerenciado por estado interno (`Set<string>` de IDs dispensados) sem tocar no ChatContext — o evento permanece no histórico. O componente foi integrado no `App.tsx` como um `<div className="absolute top-2 left-2 right-2 z-10">` posicionado antes da `app-container` do Orb, criando um strip visual de notificações proativas no topo do widget.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Failing tests for ProactiveMessageList | ea6e5af | chat/__tests__/ProactiveMessageList.test.tsx |
| 1 (GREEN) | Criar ProactiveMessageList.tsx | 7e8eb77 | chat/ProactiveMessageList.tsx |
| 2 | Integrar ProactiveMessageList no App.tsx | 8db7264 | App.tsx, test fix |

## Verification Results

```
# Testes unitários
✓ 5/5 PASS (ProactiveMessageList test suite)
  - Test 1: null quando messages vazio
  - Test 2: null quando sem role=proactive
  - Test 3: 1 bubble para 1 mensagem proativa
  - Test 4: 2 bubbles para 2 mensagens proativas
  - Test 5: dismiss remove bubble da lista

# Integração no App.tsx
✓ linha 4: import { ProactiveMessageList } from './chat/ProactiveMessageList'
✓ linha 306: <ProactiveMessageList />

# TODO removido
✓ grep "Phase 67 TODO" retornou vazio

# TypeScript (arquivos deste plano)
✓ 0 erros em ProactiveMessageList.tsx, App.tsx, ChatContext.tsx
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Campo `reminderId` não existe no tipo ReminderEvent**
- **Found during:** Task 2 — TypeScript check pós-integração
- **Issue:** O teste usava `reminderId: 1` mas `ipc-types.ts` define o campo como `id: number`
- **Fix:** Substituído `reminderId` por `id` no objeto `reminderEvent` do teste
- **Files modified:** `chat/__tests__/ProactiveMessageList.test.tsx`
- **Commit:** 8db7264

## Key Decisions

1. **Dismiss via estado interno:** `Set<string>` de IDs dispensados em vez de remover do ChatContext — não existe `removeMessage` no contexto e o histórico deve ser mantido para futura MessageList completa.

2. **MAX_VISIBLE=5 com `.slice(-MAX_VISIBLE)`:** Mantém os 5 eventos mais recentes (não os mais antigos), conforme T-67-13-02 (DoS mitigation). Eventos antigos ficam no ChatContext mas não são exibidos.

3. **Posicionamento absoluto:** `div absolute top-2 left-2 right-2 z-10` — strip na parte superior do widget Electron (160x160), sem interferir no Orb abaixo. Escopo mínimo conforme objetivo do plano.

## Known Stubs

Nenhum stub identificado. O componente consome dados reais via `useChat().messages` que são populados pelo IPC listener existente em App.tsx (linha 263-280, `addProactiveMessage`).

## Threat Flags

Nenhuma nova superfície de segurança introduzida. ProactiveMessageList herda a proteção T-67-13-01 (JSX auto-escape) do ProactiveEventBubble — sem `dangerouslySetInnerHTML`.

## PROACT-02 Gap Closure

**Gap 3 do 67-VERIFICATION.md: FECHADO**

- Antes: `ProactiveEventBubble` implementado mas nunca renderizado no DOM. App.tsx só renderizava `<Orb/>`. ChatContext armazenava `role='proactive'` mas sem consumer visual.
- Depois: `ProactiveMessageList` consome `useChat().messages`, filtra proativos, e renderiza via `ProactiveEventBubble`. App.tsx tem strip absoluta acima do Orb.
- Key link `ChatContext → ProactiveEventBubble` agora está WIRED.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| ProactiveMessageList.tsx | FOUND |
| ProactiveMessageList.test.tsx | FOUND |
| 67-13-SUMMARY.md | FOUND |
| Commit ea6e5af (RED) | FOUND |
| Commit 7e8eb77 (GREEN) | FOUND |
| Commit 8db7264 (App.tsx) | FOUND |
