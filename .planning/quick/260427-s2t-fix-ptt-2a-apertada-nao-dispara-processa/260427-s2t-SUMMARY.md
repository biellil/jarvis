---
phase: 260427-s2t
plan: 01
subsystem: voice/ptt
tags:
  - bug-fix
  - diagnostics
  - ptt
  - audio-recorder
  - electron
  - logging
  - timeout-defense
dependency_graph:
  requires:
    - apps/desktop/src/renderer/hooks/usePttHandler.ts (e72aed1, 3d77a34, 6a8679d, c0939a8)
    - apps/desktop/src/renderer/hooks/useAudioRecorder.ts (c0939a8 — cached stream + timeslice 100ms)
  provides:
    - Diagnóstico instrumentado do fluxo PTT completo (start + stop)
    - Defesa contra Promise travada em stopRecording (timeout 3s)
    - Listener de stop resistente a sobrescrita (addEventListener + once)
  affects:
    - voiceInputManager (consumidor — sem mudança)
    - sendAudioAndHandle (consumidor — sem mudança)
tech_stack:
  added: []
  patterns:
    - "EventTarget.addEventListener(..., { once: true }) preferido sobre slot única .onstop em MediaRecorder"
    - "Timeout defensivo + safeResolve helper para prevenir Promise travada quando evento esperado não dispara"
    - "Logging escalonado com prefixo de subsistema [usePttHandler]/[useAudioRecorder] para rastrear fluxo assíncrono cross-hook"
    - "try/catch/finally em handler com setState('idle') no catch + log no finally (não setState — caller já garante invariant)"
key_files:
  created: []
  modified:
    - apps/desktop/src/renderer/hooks/usePttHandler.ts
    - apps/desktop/src/renderer/hooks/useAudioRecorder.ts
decisions:
  - "Não tentar adivinhar a causa raiz — instrumentar o caminho com logs e adicionar defesas (timeout 3s, addEventListener) para que a próxima reprodução revele exatamente onde trava"
  - "Timeout de 3s na Promise de stopRecording (vs 1s ou 5s): 3s é grande o suficiente para não causar falso-positivo em hardware lento (Electron renderer + IPC + MediaRecorder buffer flush) e curto o suficiente para o usuário perceber o orb voltando a idle ao invés de assumir freeze"
  - "Finally no branch STOP do handler apenas LOGA (não chama setState('idle')) — sendAudioAndHandle já tem invariante de idle no finally interno, e o catch externo já cobre throws no caminho de stopRecording"
  - "addEventListener com { once: true } em vez de mediaRecorder.onstop = ... — onstop é uma slot única que pode ser sobrescrita por código externo; addEventListener é aditivo e { once: true } evita memory leak"
  - "safeResolve helper com flag resolved previne race entre evento stop normal e timeout (caso raro mas possível: evento dispara em T=2.99s e timeout em T=3.0s)"
metrics:
  duration: ~25min
  tasks_completed: 2
  human_verify_pending: 1
  completed_date: "2026-04-27"
---

# Quick 260427-s2t: Fix PTT 2ª apertada não dispara processamento — Summary

## One-liner

Instrumentação completa do fluxo PTT com logs de diagnóstico e defesa via timeout 3s + addEventListener para evitar orb travado em amarelo eterno quando MediaRecorder.stop() não emite evento.

## Contexto do bug

Após 4 commits seguidos consertando PTT (e72aed1, 3d77a34, 6a8679d, c0939a8):

- 1ª apertada: orb vai para AMARELO (listening) — OK
- 2ª apertada: orb FICA AMARELO eternamente
- Logs do main process NÃO mostram `[IPC:chat:send-audio]` após a 2ª apertada
- Sem stack traces visíveis nos logs do main

Sem causa raiz confirmada (logs do renderer ausentes), esta passada foca em:

1. **DIAGNÓSTICO** — logging detalhado em cada ponto do fluxo
2. **DEFESA** — timeout 3s na Promise + addEventListener mais seguro + setState('idle') garantido em todos os caminhos

## Mudanças aplicadas

### Task 1 — `usePttHandler.ts` — commit `3969259`

Logs adicionados (todos com prefixo `[usePttHandler]`):

- **Entrada do handler:** `ptt:action recebido — currentSource: <X>`
- **Decisão de branch:** `branch=STOP — chamando stopRecording()` ou `branch=START — adquirindo mic`
- **Branch STOP** (dentro do try):
  - `stopRecording resolveu — audioBuffer: <N bytes ou null>`
  - `audioBuffer null — setState(idle) e retornando`
  - `chamando sendAudioAndHandle — <N> bytes`
  - `sendAudioAndHandle completou`
- **Catch do branch STOP:** `erro no branch STOP: <error>` + setToast + setState('idle')
- **Finally do branch STOP:** `branch STOP finally — fluxo terminou` (não chama setState — sendAudioAndHandle tem invariant interno)
- **Branch START:**
  - `grant adquirido — chamando startRecording()`
  - `startRecording resolveu — setState(listening)`

Estrutura: branch STOP envolvido em `try { try { ... } catch { ... } } finally { ... }` — o try interno é o existente; o finally externo só loga.

NÃO mexido: estrutura do useEffect, dependências, lógica de voiceInputManager.

### Task 2 — `useAudioRecorder.ts` — commit `1d89657`

Refatoração da Promise em `stopRecording()`:

- **`mediaRecorder.onstop = ...` → `mediaRecorder.addEventListener('stop', onStop, { once: true })`** — slot única substituída por listener aditivo com cleanup automático
- **Timeout defensivo de 3s** — `setTimeout(() => { warn + cleanup + safeResolve(null) }, 3000)` armado ANTES de `mediaRecorder.stop()`
- **`safeResolve` helper** — flag `resolved` previne resolve duplo se evento stop e timeout disparam quase simultâneos
- **`clearTimeout(timeoutId)` dentro de `onStop`** — cancela timer no caminho feliz
- **Logs novos (todos com prefixo `[useAudioRecorder]`):**
  - `stopRecording chamado — recorder state: <state ou null>`
  - `chamando mediaRecorder.stop() + armando timeout 3s`
  - `evento stop recebido — chunks: <N>`
  - `resolvendo com <N> bytes`
  - `TIMEOUT 3s — evento stop não disparou. Forçando resolve(null). recorder.state era: <state>`

NÃO mexido: `startRecording`, cache de stream (`streamRef`), cleanup do useEffect de unmount, `isStreamUsable`, threshold de 200 bytes (defesa em profundidade preservada).

## Verificação automática

```bash
cd /root/jarvis/apps/desktop && npx tsc --noEmit 2>&1 | grep -E "(usePttHandler|useAudioRecorder)"
# (no output — zero erros TS nos arquivos modificados)
```

Erros pré-existentes em `src/main/**` e `src/renderer/__tests__/**` permanecem (escopo fora desta passada — Rule: out-of-scope).

## Verificação humana pendente — Task 3 (checkpoint:human-verify)

**A ser executada pelo usuário após esta passada — NÃO bloqueia o commit.**

### Passo 1 — Build e rodar app

```bash
cd /root/jarvis/apps/desktop
pnpm dev
```

### Passo 2 — Abrir DevTools do renderer no Electron

- Com a janela do orb visível, pressione **`Ctrl+Shift+I`** (Linux/Windows) ou **`Cmd+Opt+I`** (macOS)
- Se não abrir: clique com botão direito no orb → "Inspect Element" (se habilitado), OU rode com `pnpm dev --inspect-renderer`
- Vá para a aba **Console**
- **Limpe o console** (botão 🚫 ou `Ctrl+L`)

### Passo 3 — Reproduzir o bug

1. Aperte o atalho global do PTT (configurado pelo usuário)
2. Fale alguma coisa por 1-2 segundos
3. Aperte o atalho do PTT de novo (esta é a **2ª apertada**, onde o bug acontece)
4. Espere até **5 segundos** observando o orb

### Passo 4 — Coletar e reportar

Copie e cole **TODO** o output do console do renderer (filtrar por `[usePttHandler]` e `[useAudioRecorder]`) e descreva o comportamento visual do orb:

| Comportamento do orb            | Diagnóstico                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Voltou pra idle (cyan)          | Bug mitigado pelos fixes — logs revelam se foi pelo caminho normal OU pelo timeout 3s                  |
| Travou em listening (amarelo)   | Bug NÃO mitigado — logs vão mostrar exatamente onde parou                                              |
| Foi pra processing (roxo) → idle | Bug mitigado completamente — fluxo normal funcionou                                                   |

### Sinais a observar nos logs

| Log                                                              | Hipótese                                                                                                        |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `[useAudioRecorder] TIMEOUT 3s`                                  | **H1 confirmada:** `onstop` nunca dispara. Próxima passada: investigar Electron/Chromium + cached stream        |
| `[usePttHandler] erro no branch STOP: <X>`                       | **H2 confirmada:** throw silencioso — mensagem de erro mostra a causa                                           |
| Sem nenhum log após `[usePttHandler] ptt:action recebido` na 2ª  | **H3 confirmada:** handler desmontado entre apertadas — problema no `useEffect off()/on()`                      |
| `[usePttHandler] sendAudioAndHandle completou` mas orb amarelo    | Bug está em outro lugar — setState não propaga (ou OrbContext está com state stale)                             |

## Hipóteses (até a coleta dos logs)

| # | Descrição                                                                                                                                | Probabilidade | Mitigação aplicada                                  |
| - | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------- | --------------------------------------------------- |
| 1 | `mediaRecorder.onstop` nunca dispara → Promise trava → handler trava → orb fica em listening                                             | Alta          | Timeout 3s + addEventListener resolve `null`        |
| 2 | Throw silencioso no caminho que não é logado                                                                                             | Média         | Logs em cada ponto + catch já existente             |
| 3 | Handler nunca executa a 2ª vez (off/on do useEffect perdeu o evento)                                                                     | Baixa         | Log de entrada do handler revelaria ausência        |

## Próxima ação recomendada

1. **Usuário roda app, abre DevTools (`Ctrl+Shift+I`), reproduz o bug com 2 toggles do PTT, copia logs do console** prefixados `[usePttHandler]` e `[useAudioRecorder]`
2. Reportar de volta para próxima passada decidir:
   - Causa raiz identificada → fix definitivo (não mais paliativo)
   - Bug mitigado pelo timeout (orb volta a idle em ≤3s) mas `onstop` ainda não dispara → investigar Electron/Chromium + cached MediaStream
   - Outro fix necessário (ex: handler desmontado, setState não propaga)

## Self-Check: PASSED

- usePttHandler.ts modificado: FOUND (commit 3969259)
- useAudioRecorder.ts modificado: FOUND (commit 1d89657)
- TypeScript zero erros nos arquivos modificados: VERIFIED
- Logs prefixados [usePttHandler] em entrada/branch/stop/audioBuffer/sendAudio/finally/start: VERIFIED
- Logs prefixados [useAudioRecorder] em entrada/stop()/onstop/resolvendo/TIMEOUT: VERIFIED
- addEventListener('stop', onStop, { once: true }) substituiu .onstop: VERIFIED
- setTimeout 3000ms armado antes de mediaRecorder.stop(), clearTimeout em onStop: VERIFIED
- safeResolve helper previne resolve duplo: VERIFIED
- Branch STOP envolvido em try/catch/finally — finally só loga: VERIFIED
- Commits em pt-BR, Conventional Commits + emoji 🐛, sem "Generated with Claude Code" / "Co-Authored-By: Claude": VERIFIED
