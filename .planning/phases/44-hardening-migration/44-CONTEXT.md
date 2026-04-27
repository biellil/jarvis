# Phase 44: Hardening & Migration - Context

**Gathered:** 2026-04-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Production-readiness hardening para JARVIS v1.9:
1. macOS microphone permission check em cada mode switch para `always-listening` ou `ptt-only`
2. Validation tests para o upgrade path v1.8→v1.9 (store sem campo `voiceMode`)
3. Script de soak test para validar heap memory no modo Always-Listening

Fora de escopo: UI changes, novos voice modes, melhorias no intent classifier, ou permission systems cross-platform além do macOS.
</domain>

<decisions>
## Implementation Decisions

### macOS Microphone Permission Gate
- **D-01:** Verificar `systemPreferences.getMediaAccessStatus('microphone')` no click handler de `tray.ts`, ANTES de chamar `voiceModeManager.setMode()`
- **D-02:** Check aplica-se a AMBOS `always-listening` E `ptt-only` (ambos usam microfone)
- **D-03:** Quando permissão negada: broadcast `VoiceModeSwitchResult` com campos estendidos `blockedReason: 'mic-permission-denied'` e `settingsUrl: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone'`
- **D-04:** Renderer exibe toast acionável (consistente com UX Phase 42) com link clicável para System Settings. Main abre URL via `shell.openExternal()` quando usuário clica.
- **D-05:** Check somente no macOS (`process.platform === 'darwin'`). Linux e Windows cobertos pelo `session.setPermissionRequestHandler` existente em `index.ts`.
- **D-06:** Usar `systemPreferences.getMediaAccessStatus('microphone')` (não `askForMediaAccess`) — lê estado atual sem exibir prompt do OS. Statuses tratados como "não concedido": `'not-determined'`, `'denied'`, `'restricted'`.

### Soak Test
- **D-07:** Implementar como script standalone `apps/desktop/scripts/soak-test.ts` — NÃO parte do suite de testes normal (muito lento para CI)
- **D-08:** Medir `process.memoryUsage().heapUsed` no main process
- **D-09:** Baseline: capturar heap em t=30s (após warm-up) e comparar com t=8h; delta deve ser <10MB
- **D-10:** Script documentado no README como "run before release to validate Always-Listening heap stability"

### Migration Tests (v1.8→v1.9)
- **D-11:** Unit tests apenas no arquivo de teste de `store.ts`
- **D-12:** Cenário foco: store sem campo `voiceMode` → `getVoiceMode()` retorna `'wake-word'` (sem crash)
- **D-13:** A lógica de migration em `store.ts:getVoiceMode()` é a implementação canônica — nenhuma nova lógica de migration necessária

### Cross-Platform Degradation
- **D-14:** Escopo limitado ao macOS mic permission (VHARD-01). Sem comportamentos de degradação adicionais para Linux/Windows nesta fase.

### Claude's Discretion
- Tipo exato do campo `blockedReason` no `VoiceModeSwitchResult` (string literal type vs string)
- Texto exato do toast no renderer para o cenário de permissão negada
- Duração do soak test (se <8h for suficiente para validação), intervalo de amostragem e formato do relatório
- Wording da mensagem acionável no toast

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Voice Mode Core
- `apps/desktop/src/main/tray.ts` — click handler de mode switch (ponto de inserção D-01)
- `apps/desktop/src/main/voiceMode/index.ts` — VoiceModeManager state machine
- `apps/desktop/src/main/store.ts` — electron-store wrapper com `getVoiceMode()` (migration logic existente)
- `apps/desktop/src/shared/ipc-types.ts` — `VoiceModeSwitchResult` interface e `IPC_CHANNELS` (D-03: precisa de `blockedReason` + `settingsUrl`)
- `apps/desktop/src/main/ipc/voiceMode.ts` — `broadcastModeSwitch()` helper IPC

### Permission Handling
- `apps/desktop/src/main/index.ts` — `session.setPermissionRequestHandler` e `setPermissionCheckHandler` existentes (contexto para D-05)

### Strategies (contexto do que usa mic)
- `apps/desktop/src/main/voiceMode/strategies/alwaysListening.ts` — AlwaysListeningStrategy
- `apps/desktop/src/main/voiceMode/strategies/pttOnly.ts` — PttOnlyStrategy

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `broadcastModeSwitch(result: VoiceModeSwitchResult)` em `ipc/voiceMode.ts` — já usado para success e failure IPC; estender para permission denied
- `VoiceModeSwitchResult` interface em `ipc-types.ts` — adicionar `blockedReason?: string` e `settingsUrl?: string`
- `session.setPermissionRequestHandler` em `index.ts` — padrão existente para media permission no renderer side
- `getVoiceMode()` em `store.ts` — já tem o guard de migration default (retorna `'wake-word'` se campo ausente ou inválido)

### Established Patterns
- `tray.ts` click handler: `const success = await voiceModeManager.setMode(option.mode, 'user')` seguido de `broadcastModeSwitch({ success, ... })` — check de D-01 insere ANTES da chamada a `setMode()`
- Phase 42 renderer toast UX: renderer já processa canal `voice-mode:switch-result` para exibir toast
- D-04 plano B recovery (Phase 43): recovery acontece dentro de `setMode()` — não interfere com o bail early de permissão no tray

### Integration Points
- `tray.ts:click` → permission check (NEW, macOS only) → `voiceModeManager.setMode()` → `broadcastModeSwitch()`
- `ipc-types.ts:VoiceModeSwitchResult` → adicionar `blockedReason?: string` e `settingsUrl?: string`
- Arquivo de testes de `store.ts` → adicionar unit test de migration

</code_context>

<specifics>
## Specific Ideas

- macOS System Settings deep link: `x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone`
- Status values de `getMediaAccessStatus('microphone')`: `'not-determined' | 'granted' | 'denied' | 'restricted'` — tratar qualquer valor != `'granted'` como "não concedido"
- Soak test: baseline capturado após 30s de warm-up; comparação com reading em t=8h; delta >10MB = falha
</specifics>

<deferred>
## Deferred Ideas

- VPOLISH-03: Graceful degrade UX se intent classifier falha >5% — toast warning + opção de auto-disable Always-Listening (v1.10+)
- VTEL-02: Memory/heap monitoring contínuo para detectar leaks em sessões longas (v1.10+)
- VPOLISH-01: Hotkey conflict detection cross-platform (v1.10+)

</deferred>

---

*Phase: 44-hardening-migration*
*Context gathered: 2026-04-27*
