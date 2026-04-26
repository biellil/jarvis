# Phase 43: PTT-only + Integration - Context

**Gathered:** 2026-04-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Implementar `PttOnlyStrategy` (modo de captura via hotkey global) + integrar override manual de PTT em Always-Listening (VPTT-03) + endurecer mode switching contra race conditions, listener leaks, e factory failures.

**Não inclui:**
- Reconfiguração da hotkey PTT (reusa exatamente a hotkey já configurada em v1.7 — VPTT-02)
- Mudança no comportamento visual da tray ou orb (Phase 42 já entrega)
- Investigação de native modules para keyup detection (deferido — ver Deferred Ideas)

**Depende de:** Phase 39 (state machine), Phase 41 (tray submenu)
**Requirements:** VPTT-01, VPTT-02, VPTT-03

</domain>

<decisions>
## Implementation Decisions

### PTT Semantics (VPTT-01)
- **D-01:** PTT-only mode usa **toggle** (press = start, press de novo = stop), NÃO press-and-hold. Limitação técnica do Electron `globalShortcut` (não detecta keyup) aceita como decisão consciente. VPTT-01 ("segura→fala→solta→envia") é satisfeito em espírito — usuário ainda controla início/fim manualmente. Documentar a discrepância em release notes / docs do modo.

### Always-Listening Hotkey Override (VPTT-03)
- **D-02:** Em Always-Listening mode, press da hotkey PTT = **force-flush imediato do VAD** quando strategy está em estado `capturing`. Comportamento de cada estado:
  - `capturing` com samples > 0 → fecha utterance agora, envia, continua escutando
  - `capturing` com 0 samples → no-op silencioso (não toca microfone)
  - `idle` → no-op silencioso
  - `processing` → no-op silencioso (já enviou, esperando STT)
  - **NÃO** suspende AL nem alterna pra modo PTT-style — só força o boundary do utterance.

### Hotkey Ownership
- **D-03:** `apps/desktop/src/main/ptt-hotkey.ts` permanece o único módulo que registra `globalShortcut` (registrado uma vez no `app.whenReady()`). Strategies não registram nada — apenas ouvem o evento IPC `'ptt:action' = 'toggle'` que `ptt-hotkey.ts` emite. Distribuição:
  - `PttOnlyStrategy.start()` → adiciona listener `ipcMain.on('ptt:action', ...)` que toggle start/stop do mic; `dispose()` remove o listener
  - `AlwaysListeningStrategy.start()` → adiciona listener `'ptt:action'` que invoca o force-flush (D-02); `dispose()` remove
  - `WakeWordStrategy` → não registra listener; ignora o evento
- **Justificativa:** VPTT-02 (reusa hotkey v1.7 sem reconfigurar) fica trivial — módulo já existe e funciona. Strategies viram listeners simples. Wake Word ignora "vazamento" de IPC sem custo.

### Mode Switch Robustness (closes follow-up note phase-43-dispose-before-factory.md)
- **D-04:** `VoiceModeManager.setMode()` adota **plano B em catch** — se factory da nova strategy lança, **re-instancia a strategy antiga via factory dela** e dá `start()` de novo. Sistema nunca fica em estado zumbi (currentMode aponta pra X mas activeStrategy === null). Implementação:
  - VoiceModeManager guarda referência ao mode atual + factory dele
  - Em catch da nova factory: chama factory antiga, atribui ao activeStrategy, start()
  - Se re-create da antiga **também** falhar (cenário extremo): log de erro + `currentMode = null` + activeStrategy = null. Documentado como fallback de último caso.

### Race Condition Testing (SC4)
- **D-05:** Testes de integração reais em `apps/desktop/src/main/__tests__/voiceMode.race.test.ts` com 3 cenários:
  1. **Sequencial rápido:** 5 trocas Wake→AL→PTT→Wake→AL com `await` entre cada. Assertions: `currentMode` final correto, `ipcMain.listenerCount('ptt:action')` ≤ 1, sem listeners órfãos.
  2. **Concorrente:** `await Promise.all([5 setMode em paralelo])`. Assertions: transitioning guard rejeita as concorrentes (retornam false), estado final consistente, currentMode === última que entrou no try block (não a última do array).
  3. **Plano B em catch sob race (D-04):** força factory de PttOnlyStrategy lançar uma vez, valida que WakeWordStrategy é re-instanciada e ativa.
- Mock `globalShortcut` e `ipcMain` minimamente (testes não precisam do Electron real). Strategies usam factories test-doubles que respeitam o lifecycle real.

### Claude's Discretion

Áreas onde Claude tem flexibilidade na implementação:
- **Localização do PttOnlyStrategy** — pode ser `apps/desktop/src/main/voiceMode/strategies/pttOnly.ts` (consistente com `alwaysListening.ts`) ou outra estrutura. Recomenda manter o pattern.
- **Como guardar a "factory antiga" no VoiceModeManager** — Map.get() do `strategyFactories` mais o oldMode antes da troca, OU campo dedicado `previousFactoryRef`. Decisão de Claude conforme legibilidade do diff.
- **Naming do método de re-create** — `restorePreviousStrategy()` ou inline em catch. Claude decide.
- **Test helper para mock factories** — pode ser inline no test file ou em `__tests__/helpers/strategyFactoryMocks.ts`. Recomenda helper se o boilerplate ficar repetitivo entre testes.
- **Edge case do `transitioning` guard durante recovery** — quando re-create da antiga roda, o flag transitioning está true. Claude decide se mantém true (atomicidade do switch inteiro) ou libera antes do recovery (permite outra troca enquanto recover). Recomenda manter atomicidade.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### State Machine + Strategy Interface (Phase 39)
- `.planning/phases/39-voice-mode-state-machine/39-CONTEXT.md` — D-03 (interface mínima 4 métodos), D-04 (lazy lifecycle)
- `apps/desktop/src/main/voiceMode/index.ts` — `VoiceCaptureStrategy` interface + `VoiceModeManager` (alvo da modificação D-04)

### Always-Listening Strategy (Phase 40 reference pattern)
- `apps/desktop/src/main/voiceMode/strategies/alwaysListening.ts` — pattern de strategy real a replicar para PttOnlyStrategy. Lifecycle, dispose() idempotente, status reporting.

### Tray Submenu (Phase 41)
- `.planning/phases/41-tray-menu-mode-switch-ux/41-CONTEXT.md` — D-02 (canal IPC `voice-mode:switch-result`)
- `.planning/phases/41-tray-menu-mode-switch-ux/41-03-SUMMARY.md` — gap closure que removeu gate `getStatus() !== 'idle'` (relevante pra D-04)
- `.planning/notes/phase-43-dispose-before-factory.md` — root cause + opções de fix do estado zumbi (closed by D-04)
- `.planning/debug/41-mode-switch-blocked-during-capture.md` — análise técnica do gate removido na gap closure 41-03

### PTT Hotkey Infrastructure (v1.7)
- `apps/desktop/src/main/ptt-hotkey.ts` — `registerPttHotkey(mainWindow)` + `unregisterPttHotkey()`. Emite IPC `'ptt:action' = 'toggle'`. NÃO modificar (D-03 mantém como único registrador).
- `apps/desktop/src/main/store.ts` — `getPttHotkey()` / `setPttHotkey()` (electron-store accessors). VPTT-02: reusar valor existente sem migração.

### Voice Input Manager (renderer)
- `apps/desktop/src/renderer/src/voice/voiceInputManager.ts` — acquire/release/getCurrentSource API. PTT-only strategy precisa coordenar com este manager via IPC quando captura inicia.

### Requirements
- `.planning/REQUIREMENTS.md` — VPTT-01, VPTT-02, VPTT-03 + traceability table

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`ptt-hotkey.ts`** — Já registra globalShortcut e emite `'ptt:action' = 'toggle'`. D-03 mantém intacto. Strategies só consomem o IPC.
- **`AlwaysListeningStrategy`** — Pattern de referência para `PttOnlyStrategy`: dispose() idempotente, status `'idle' | 'capturing' | 'processing'`, integração com voiceInputManager via IPC.
- **`VoiceModeManager.setMode()` (após gap closure 41-03)** — Não tem mais gate `getStatus() !== 'idle'`. Estrutura atual: dispose old → factory new → start. D-04 modifica esse fluxo adicionando recovery em catch.
- **`useWakeWord` + `voiceInputManager.acquire('ptt' | 'wakeword')`** — `PttOnlyStrategy` precisa coordenar com este manager (via IPC pra renderer) para capturar mic sem conflitar com wake word loop residual.

### Established Patterns
- **Strategy lifecycle:** start() → captura ativa, stop() → drena utterance pendente, dispose() → libera tudo. Pattern já em `alwaysListening.ts`.
- **Listener cleanup:** strategies adicionam `ipcMain.on(...)` em start() e removem em dispose() com `ipcMain.removeListener(...)` mantendo referência à callback.
- **Test doubles para Strategy:** vitest com `vi.fn()` pra mock factories, sem precisar Electron real.
- **electron-store accessors:** `getXxx()/setXxx()` em `store.ts`. Reusa pra hotkey (D-03 + VPTT-02).

### Integration Points
- **VoiceModeManager.setMode()** ([apps/desktop/src/main/voiceMode/index.ts](apps/desktop/src/main/voiceMode/index.ts)) — alvo principal de modificação (D-04 plano B em catch)
- **Strategy factory map** ([apps/desktop/src/main/index.ts](apps/desktop/src/main/index.ts)) — adicionar `'ptt-only': createPttOnlyFactory(...)` quando criar a strategy
- **`'ptt:action'` IPC channel** — strategy se conecta como listener; renderer já emite via ptt-hotkey.ts
- **voiceInputManager IPC bridge** — PttOnlyStrategy precisa enviar comandos pro renderer (start/stop mic) via canal existente ou novo (decisão de planning baseada em código real)

</code_context>

<specifics>
## Specific Ideas

- **Toggle como decisão consciente** — não é "limitação aceita por preguiça", é uma escolha técnica documentada. Release notes do v1.9 devem mencionar: "PTT-only mode uses toggle (press to start, press to stop) due to Electron framework limitations. Native keyup detection (uIOhook) under consideration for future versions."
- **Force-flush comportamento exato (D-02)** — modelo mental do usuário: "press = manda agora". Sem timing implícito, sem mudar de modo, sem suspender AL. Edge cases (idle/processing/0-samples) são silenciosos pra não confundir com "tecla quebrou".
- **Race test cobertura SC4** — meta dos testes é proteger contra a regressão clássica "troca de modo deixa hotkey duplicada / listener vazado". Listener count ≤ 1 é a verificação mais importante.

</specifics>

<deferred>
## Deferred Ideas

- **Native keyup detection (uIOhook ou alternativa)** — Para implementar PTT real "press-and-hold" em vez de toggle. Requer dep nativa multiplataforma, permissões macOS Accessibility, possíveis issues em Wayland/macOS Sandbox. Revisitar em v2.x se o feedback de usuários indicar dor real com toggle. Estimativa: dedicação de 1-2 phases dedicadas (research + integration + cross-platform testing).

- **AL override via "Start-stop manual" (Opção B do área 2)** — Modo onde press = ignora VAD, captura como PTT até segundo press = envia. Mais flexível pra ditado longo. Adiar até demanda concreta — D-02 (force-flush) cobre 90%+ dos casos.

- **Per-strategy hotkey customization** — Permitir hotkeys diferentes por modo (ex: F12 pra PTT-only, F11 pra AL override). Atualmente todos compartilham o `getPttHotkey()` v1.7. Não pedido em VPTT-* — fica como nice-to-have v2.x.

</deferred>

---

*Phase: 43-ptt-only-integration*
*Context gathered: 2026-04-26*
