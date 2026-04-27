---
phase: 44
slug: hardening-migration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-27
---

# Phase 44 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.2 |
| **Config file** | `apps/desktop/vitest.config.ts` (ou herda de root vite.config.ts) |
| **Quick run command** | `cd apps/desktop && npm test -- store.test.ts --run` |
| **Full suite command** | `cd apps/desktop && npm test -- --run` |
| **Estimated runtime** | ~2s (quick) / ~30s (full suite) |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/desktop && npm test -- store.test.ts --run`
- **After every plan wave:** Run `cd apps/desktop && npm test -- --run`
- **Before `/gsd-verify-work`:** Full suite green + soak test manual
- **Max feedback latency:** 2 seconds (quick) / 30 seconds (full)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 44-01-01 | 01 | 1 | VHARD-01 | — | VoiceModeSwitchResult com blockedReason não aceita input de IPC do renderer | unit | `npm test -- store.test.ts -t "migration default" --run` | ✅ | ⬜ pending |
| 44-01-02 | 01 | 1 | VHARD-01 | — | Valor inválido no store retorna 'wake-word' (corruption guard) | unit | `npm test -- store.test.ts -t "invalid value" --run` | ✅ | ⬜ pending |
| 44-02-01 | 02 | 2 | VHARD-01 | T-44-permission | macOS: permission check antes de setMode(); denied → toast acionável | manual | Run app no macOS, negar mic, tentar mode switch, verificar toast | ❌ W0 | ⬜ pending |
| 44-02-02 | 02 | 2 | VHARD-01 | T-44-permission | settingsUrl é hardcoded no código, não derivado de IPC | manual | Inspeção de código: tray.ts usa literal string URL | ❌ W0 | ⬜ pending |
| 44-03-01 | 03 | 3 | VHARD-01 | — | Soak test 8h: delta heap <10MB em Always-Listening mode | soak (manual) | `node --expose-gc apps/desktop/scripts/soak-test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/desktop/src/main/__tests__/tray.test.ts` — stubs para permission check (Electron native API — mocking difícil; prioridade baixa; manual OK)
- [ ] `apps/desktop/scripts/soak-test.ts` — script standalone de soak test (não é unit test; rodado manualmente antes de release)
- [ ] Verificação manual de deep link macOS (`x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone`) em macOS 12+

**Nota:** Migration tests em store.test.ts (linhas 177-204) já existem — nenhum novo scaffolding necessário para `getVoiceMode()` default behavior.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| macOS: mic permission denied → toast acionável com link para System Settings | VHARD-01 | Electron `systemPreferences` é binding C++ — difícil de mockar em vitest | 1. Abrir JARVIS no macOS. 2. Em System Settings > Privacy & Security > Microphone, remover JARVIS. 3. Clicar em "Always-Listening" no tray menu. 4. Verificar toast aparece com link clicável. 5. Clicar no link → deve abrir System Settings na aba de Microphone. |
| shell.openExternal abre URL correta (não phishing redirect) | VHARD-01 | Requer macOS hardware | Verificar em code review que URL é literal hardcoded, não derivada de IPC. Log da abertura no console. |
| Soak test 8h: heap não cresce >10MB | VHARD-01 | Teste leva 8 horas reais | 1. Rodar `node --expose-gc apps/desktop/scripts/soak-test.ts`. 2. Aguardar 8h. 3. Verificar delta < 10MB no relatório final. |
| Upgrade v1.8→v1.9: usuário sem voiceMode no store inicia em wake-word sem crash | VHARD-01 | Requer estado de store específico | 1. Criar store com campos v1.8 (sem voiceMode). 2. Iniciar JARVIS. 3. Verificar modo é wake-word no tray. 4. Verificar nenhum crash no log. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
