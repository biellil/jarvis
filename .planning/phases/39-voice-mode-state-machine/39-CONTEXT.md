# Phase 39: Voice Mode State Machine - Context

**Gathered:** 2026-04-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 39 entrega **infraestrutura interna** para gerenciar qual dos 3 modos de captura de voz (Wake Word / Always-Listening / PTT-only) está ativo, persistir essa escolha entre restarts, e notificar módulos consumidores (tray, orb, voiceInputManager) quando o modo muda. **Sem comportamento visível ao usuário** — pure foundation para Phases 40-44.

**Não inclui:** UI de tray menu (Phase 41), orb visual per-modo (Phase 42), implementação concreta de qualquer modo (Phases 40, 43), permission re-check (Phase 44).

</domain>

<decisions>
## Implementation Decisions

### Transition Guard Policy
- **D-01:** Quando user tenta trocar de modo durante captura ativa, a state machine retorna `false` e bloqueia silenciosamente (sem toast, sem error throw). UX feedback (toast "Aguarde") é responsabilidade da Phase 41 (tray) — Phase 39 só fornece a API que retorna o motivo.
- **D-02:** Detecção de captura ativa via `Strategy.getStatus()` retornando `'idle' | 'capturing' | 'processing'`. State machine consulta a Strategy ativa antes de permitir transição. Se status ≠ `'idle'`, bloqueia.

### Strategy Interface
- **D-03:** Cada Strategy expõe apenas 4 métodos: `start()`, `stop()`, `dispose()`, `getStatus()`. Sem `pause/resume/forceFlush/reconfigure` — adicionar quando Phase 40+ pedir, não antecipar.
- **D-04:** Strategy lifecycle é **lazy** — VoiceModeManager instancia apenas a Strategy ativa, dispose() a antiga em mode switch. Memory-efficient, evita cold-start de modelos ONNX da Phase 40 quando user nunca troca pra Always-Listening.

### Mode Change Event Payload
- **D-05:** EventEmitter dispara payload **rich**: `{oldMode, newMode, reason, timestamp}` — `reason: 'user' | 'migration' | 'system'`. Suporta audit log futuro, debugging, e UX condicional (toast só quando reason='user') sem custo adicional agora.
- **D-06:** Tipos do payload declarados em [shared/ipc-types.ts](apps/desktop/src/shared/ipc-types.ts) — pattern já estabelecido v1.7. Renderer (orb, Phase 42) e main (tray, Phase 41) consomem o mesmo type.

### Migration v1.8 → v1.9
- **D-07:** Migration via **default implícito no read** — quando `store.get('voiceMode')` retorna undefined, retorna `'wake-word'` por default. Próxima escrita persiste o campo. Zero código de migration explícita; funciona pra qualquer schema future-add.
- **D-08:** Migration é **silenciosa** — não emite event de mode change no startup quando default é aplicado. Listeners (orb, tray) só recebem events quando user trocar manualmente (reason='user'). Evita toast confuso "modo mudou pra wake-word" pra usuários v1.8 que nunca trocaram nada.

### Claude's Discretion

Áreas onde Claude tem flexibilidade na implementação:
- **Module structure** — pode ser arquivo único `voiceMode.ts` ou folder `voiceMode/{manager.ts, strategies/, events.ts}`. Recomenda folder se ficar > 200 linhas.
- **Strategy interface naming** — `IVoiceCaptureStrategy` ou `VoiceCaptureStrategy` (sem prefix I). Codebase atual não usa I-prefix; manter consistência.
- **electron-store schema field name** — `voiceMode` é o nome canônico, mas se houver conflito com algum outro campo, Claude decide.
- **EventEmitter type** — Node.js builtin `EventEmitter` ou `Electron.IpcMain` events. Builtin é mais leve e não precisa cross-process aqui (state machine vive 100% no main).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` — VMODE-01, VMODE-02, VMODE-03 são as fontes de verdade pros must-haves
- `.planning/milestones/v1.9-ROADMAP.md` §"Phase 39: Voice Mode State Machine" — goal, success criteria, depends-on

### Research (v1.9)
- `.planning/research/SUMMARY.md` — overview e build order
- `.planning/research/ARCHITECTURE.md` §"State Machine + Strategy pattern" — design pattern recomendado, data flow
- `.planning/research/PITFALLS.md` §"Mode Switch Race Condition" — bug pattern a evitar

### Codebase patterns (v1.7 carry-forward)
- `apps/desktop/src/main/store.ts` — electron-store wrapper + StoreSchema typed interface (D-07 estende esse arquivo)
- `apps/desktop/src/shared/ipc-types.ts` — typed message contracts (D-06 estende esse arquivo)
- `apps/desktop/src/main/voiceInput/voiceHandler.ts` — pure function + DI pattern (Strategy implementations devem seguir)
- `apps/desktop/src/main/hotkey.ts` — globalShortcut register/unregister lifecycle (referência pra PTT Strategy futura)
- `apps/desktop/src/main/ptt-hotkey.ts` — PTT preference persistence pattern

### Project context
- `.planning/PROJECT.md` §"Current Milestone v1.9" — target features e key constraints
- `CLAUDE.md` — git commit conventions (português, emoji + Conventional Commits)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **electron-store wrapper** ([store.ts](apps/desktop/src/main/store.ts)): Single instance, typed `StoreSchema`. Phase 39 estende `StoreSchema` adicionando `voiceMode?: 'wake-word' | 'always-listening' | 'ptt-only'`.
- **IPC type contracts** ([shared/ipc-types.ts](apps/desktop/src/shared/ipc-types.ts)): Pattern já usado em SETTINGS_GET/SAVE (v1.7). Phase 39 adiciona `VoiceModeChangeEvent` type aqui.
- **Pure function + DI** ([voiceHandler.ts](apps/desktop/src/main/voiceInput/voiceHandler.ts)): Voice handlers usam pure functions com injected deps, sem classes. Strategy implementations devem seguir mesmo pattern.

### Established Patterns
- **Hotkey lifecycle (v1.7)**: register em startup, unregister em settings change. Strategy implementations futuras (Phase 43) usarão `globalShortcut.register/unregister` da mesma forma.
- **Settings BrowserWindow + IPC handler (v1.7)**: SETTINGS_GET retorna current state, SETTINGS_SAVE valida e persiste. Mode switch IPC (Phase 41) seguirá este pattern.
- **Default value via `||` no read** (`store.get('hotkey') || DEFAULT_HOTKEY`): Idiom já em uso. D-07 aplica idêntico para `voiceMode`.

### Integration Points
- **Phase 40 (Always-Listening)**: instancia `AlwaysListeningStrategy` quando voiceMode = 'always-listening'. Reusa Silero VAD existente.
- **Phase 41 (Tray)**: ouve EventEmitter events e chama `voiceMode.setMode()` em radio click. UI agnóstica de Strategy interna.
- **Phase 42 (Orb)**: renderer consome `VoiceModeChangeEvent` via IPC, atualiza CSS class.
- **Phase 43 (PTT)**: `PttOnlyStrategy` registra hotkey em start(), unregister em stop().
- **Phase 44 (Hardening)**: re-check macOS permission antes de chamar Strategy.start() em mode switch.

</code_context>

<specifics>
## Specific Ideas

- **Default mode = `'wake-word'`** — preserva comportamento do v1.8, evita disruption de usuários existentes (alinha com VMODE-02).
- **Silenciar event de migration** — implícito no D-08. Não há toast/notificação no primeiro startup pós-update.
- **API retorna `false` em transição bloqueada** — não throw, não Promise reject. Mode switch é fire-and-check, não fire-and-forget.

</specifics>

<deferred>
## Deferred Ideas

- **Toast UX para "modo bloqueado durante captura"** — pertence à Phase 41 (tray) ou Phase 42 (orb feedback). Phase 39 só expõe API; UI consome.
- **Strategy.pause() / resume()** — útil para hipotético "meeting mode" mas não requerido em v1.9. Adicionar em phase futura se feature pedir.
- **Strategy.forceFlush()** — necessário para VPTT-03 (hotkey override em Always-Listening). Phase 43 adicionará à interface quando implementar; D-03 mantém minimal por enquanto.
- **electron-store schema versioning formal** — usar feature `migrations: { '2.0.0': () => {...} }` quando houver 2+ migrações simultâneas. Hoje 1 campo é YAGNI.
- **Audit log de mode changes** — payload rich (D-05) já suporta. Listener separado pode ser adicionado em Phase 44 se hardening pedir.
- **Cross-process state machine (renderer também tem cópia local)** — renderer só recebe events; state of truth fica em main. Adicionar mirror se UI virar slow.

</deferred>

---

*Phase: 39-voice-mode-state-machine*
*Context gathered: 2026-04-25*
