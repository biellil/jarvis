---
phase: 44-hardening-migration
reviewed: 2026-04-27T00:00:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - README.md
  - apps/desktop/scripts/soak-test.ts
  - apps/desktop/src/main/__tests__/store.test.ts
  - apps/desktop/src/main/__tests__/tray.test.ts
  - apps/desktop/src/main/ipc/index.ts
  - apps/desktop/src/main/ipc/voiceMode.ts
  - apps/desktop/src/main/tray.ts
  - apps/desktop/src/preload/index.ts
  - apps/desktop/src/renderer/src/App.tsx
  - apps/desktop/src/renderer/src/chat/ChatContext.tsx
  - apps/desktop/src/renderer/src/components/Toast.tsx
  - apps/desktop/src/shared/ipc-types.ts
findings:
  critical: 0
  warning: 3
  info: 4
  total: 7
status: issues_found
---

# Phase 44: Code Review Report

**Reviewed:** 2026-04-27T00:00:00Z
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

A fase 44 (VHARD-01) introduz três entregáveis principais: (1) permission gate macOS para microfone no tray antes de trocar Voice Mode, (2) toast acionável no renderer com botão "Abrir System Settings", e (3) soak test de 8 horas para validação de heap.

O code está bem estruturado — a hardening de segurança no IPC (URL hardcoded, sem relay de parâmetro externo) e a proteção `isDestroyed()` no broadcast estão corretas. As três warnings abaixo são bugs reais ou riscos de comportamento inesperado, não preferências de estilo.

---

## Warnings

### WR-01: `registerOpenSystemSettingsHandler` usa `ipcMain.handle` mas `openSystemSettings` no preload usa `ipcRenderer.send` — canal nunca responde

**File:** `apps/desktop/src/main/ipc/voiceMode.ts:40` e `apps/desktop/src/preload/index.ts:86`

**Issue:** O handler no main é registrado com `ipcMain.handle` (que espera `ipcRenderer.invoke` do lado do renderer), mas o preload chama `ipcRenderer.send` — que é fire-and-forget e não emparelha com `ipcMain.handle`. O resultado prático: `shell.openExternal()` **nunca é chamado** quando o usuário clica em "Abrir System Settings". O canal fica sem resposta, sem erro visível.

```
main:    ipcMain.handle('shell:open-system-settings', async () => { ... })
preload: ipcRenderer.send('shell:open-system-settings')   // ← mismatch
```

**Fix:** Alinhar um dos dois lados. O caminho mais simples é trocar o handler do main para `ipcMain.on`:

```typescript
// apps/desktop/src/main/ipc/voiceMode.ts
export function registerOpenSystemSettingsHandler(): void {
  ipcMain.on(IPC_CHANNELS.SHELL_OPEN_SYSTEM_SETTINGS, (_event) => {
    // URL hardcoded — nunca de IPC (prevenção T-44-02)
    shell.openExternal(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
    ).catch((err) => console.error('[voiceMode] shell.openExternal failed:', err));
  });
}
```

Alternativamente, trocar o preload para `ipcRenderer.invoke` (e tratar a promise). A escolha entre `send`/`on` ou `invoke`/`handle` é indiferente aqui porque o renderer não precisa da resposta — mas os dois lados precisam usar o mesmo par.

---

### WR-02: Toast fecha automaticamente em 5 s mesmo quando tem um botão de ação pendente

**File:** `apps/desktop/src/renderer/src/components/Toast.tsx:43-47`

**Issue:** O `useEffect` do auto-close dispara incondicionalmente com `autoCloseMs = 5000` (default). Para o toast de "Microfone negado — abrir configurações?", o auto-close de 5 s fecha o toast antes que o usuário possa clicar em "Abrir System Settings", especialmente em macOS onde a janela pode estar minimizada. O toast desaparece sem que o usuário tome nenhuma ação, e a permissão continua negada sem feedback.

```typescript
// Toast.tsx linha 43-47
useEffect(() => {
  if (autoCloseMs <= 0) return;       // só desativa se explicitamente 0
  const t = setTimeout(onClose, autoCloseMs);
  return () => clearTimeout(t);
}, [onClose, autoCloseMs, message]);
```

**Fix:** Quando `action` estiver presente, desabilitar o auto-close (ou aumentar o timeout substancialmente). O caller no `App.tsx` não passa `autoCloseMs`, então recebe o default de 5 s. Duas opções:

Opção A — desabilitar auto-close quando há ação (mais segura):
```typescript
// Toast.tsx
useEffect(() => {
  if (autoCloseMs <= 0 || action) return;   // ação presente = usuário decide fechar
  const t = setTimeout(onClose, autoCloseMs);
  return () => clearTimeout(t);
}, [onClose, autoCloseMs, message, action]);
```

Opção B — passar `autoCloseMs={0}` no caller `App.tsx` quando for um toast de permissão:
```typescript
// App.tsx, na chamada setToast
setToast({
  message: 'Microfone negado — abrir configurações?',
  variant: 'warning',
  autoCloseMs: 0,          // usuário deve fechar manualmente
  action: { ... },
});
```

---

### WR-03: `soak-test.ts` não é executável como script TypeScript via `node` direto — a instrução de execução no README está errada

**File:** `README.md:291-292` e `apps/desktop/scripts/soak-test.ts:1`

**Issue:** O README instrui:
```
node --expose-gc apps/desktop/scripts/soak-test.ts
```
`node` não executa TypeScript diretamente. O arquivo tem shebang `#!/usr/bin/env node` (linha 1), mas isso não habilita TypeScript. O comando vai falhar com `SyntaxError: Unexpected token 'interface'` (ou similar) porque `node` não entende `interface MemSample {}` ou `: string` annotations.

O comando correto já está documentado como alternativa (`npx tsx`), mas a ordem das instruções coloca o comando errado como primário ("recomendado"). Quem seguir o exemplo principal vai encontrar um erro imediato.

**Fix:** Inverter a ordem ou corrigir o comando principal no README:

```markdown
# Requer tsx instalado (já está em devDependencies do workspace)
npx tsx --expose-gc apps/desktop/scripts/soak-test.ts

# Alternativa: compilar antes de rodar com --expose-gc (nativo Node, sem tsx overhead)
# pnpm -F desktop build:scripts && node --expose-gc dist/scripts/soak-test.js
```

Ou adicionar um script em `apps/desktop/package.json`:
```json
"scripts": {
  "soak-test": "tsx --expose-gc scripts/soak-test.ts"
}
```

---

## Info

### IN-01: `ipcRenderer` exposto via `contextBridge` aceita qualquer canal (`channel: string`) — sem allowlist

**File:** `apps/desktop/src/preload/index.ts:93-100`

**Issue:** A propriedade `ipcRenderer` do objeto `jarvis` expõe `on`/`off` com `channel: string` sem nenhuma restrição de canal. Qualquer código no renderer pode escutar ou parar de escutar qualquer canal IPC, incluindo canais sensíveis que o main não espera que o renderer consuma diretamente. Não é uma vulnerabilidade ativa (o renderer não tem acesso ao `ipcMain`), mas vai contra a prática recomendada do Electron de usar allowlists no preload.

**Fix:** Definir uma allowlist de canais permitidos para `on`/`off`:
```typescript
const ALLOWED_LISTEN_CHANNELS: ReadonlySet<string> = new Set([
  IPC_CHANNELS.VOICE_MODE_SWITCH_RESULT,
  IPC_CHANNELS.VOICE_MODE_CHANGE,
  IPC_CHANNELS.VOICE_MODE_DEGRADED,
  IPC_CHANNELS.ALWAYS_LISTENING_START,
  IPC_CHANNELS.ALWAYS_LISTENING_STOP,
  IPC_CHANNELS.ALWAYS_LISTENING_VAD_THRESHOLD,
  IPC_CHANNELS.ALWAYS_LISTENING_FORCE_FLUSH,
]);

ipcRenderer: {
  on: (channel: string, callback: (...) => void) => {
    if (!ALLOWED_LISTEN_CHANNELS.has(channel)) return;
    ipcRenderer.on(channel, callback);
  },
  off: (channel: string, callback: (...) => void) => {
    if (!ALLOWED_LISTEN_CHANNELS.has(channel)) return;
    ipcRenderer.removeListener(channel, callback);
  },
},
```

---

### IN-02: `VoiceModeSwitchResult.settingsUrl` é transportada via IPC mesmo sendo URL hardcoded em tray.ts

**File:** `apps/desktop/src/shared/ipc-types.ts:187` e `apps/desktop/src/main/tray.ts:104-107`

**Issue:** O campo `settingsUrl` em `VoiceModeSwitchResult` é enviado no broadcast IPC (tray → renderer). O `App.tsx` ignora o valor recebido e chama `window.jarvis.openSystemSettings?.()`, que usa a URL hardcoded no main. A URL transportada pelo IPC não é utilizada, mas a sua presença no tipo induz futuros desenvolvedores a pensar que é seguro usar `result.settingsUrl` diretamente em `shell.openExternal()` — o que seria uma vulnerabilidade de URL injection (T-44-02).

**Fix:** Remover `settingsUrl` de `VoiceModeSwitchResult` e do payload enviado em `tray.ts`, e deixar comentário explicando que a URL é sempre hardcoded no handler `registerOpenSystemSettingsHandler`:

```typescript
// ipc-types.ts — remover:
/** D-03 (Phase 44 VHARD-01): Deep link URL para System Settings (macOS). */
settingsUrl?: string;
```

```typescript
// tray.ts — remover settingsUrl do broadcastModeSwitch call:
broadcastModeSwitch({
  success: false,
  blockedReason: 'mic-permission-denied',
  // settingsUrl removido — URL é hardcoded no handler do main (T-44-02)
});
```

---

### IN-03: `counter` em `ChatContext.tsx` é uma variável de módulo — não é resetada entre testes

**File:** `apps/desktop/src/renderer/src/chat/ChatContext.tsx:40-43`

**Issue:** O `counter` usado pelo `nextId()` é declarado no escopo do módulo (`let counter = 0`), não dentro do componente. Em ambientes de teste onde os testes rodam no mesmo processo (como vitest), o contador persiste entre testes. IDs gerados em testes sequenciais podem ser determinísticos de forma não intencional (ex.: `1730000000000-1` em qualquer teste), o que pode mascarar bugs de identificação de mensagens.

**Fix:** Mover o contador para dentro de um `useRef` ou `useState`, ou exportar um `__resetCounter()` exclusivo para testes:

```typescript
// Opção A: contador por instância de provider (recomendado)
export function ChatProvider({ children }: { children: ReactNode }) {
  const counterRef = useRef(0);
  const nextId = useCallback(() => {
    counterRef.current += 1;
    return `${Date.now()}-${counterRef.current}`;
  }, []);
  // ...
}
```

---

### IN-04: Testes em `tray.test.ts` que testam comportamento futuro/planejado usam `it.skip` sem prazo ou issue associada

**File:** `apps/desktop/src/main/__tests__/tray.test.ts:19-67`

**Issue:** Há 8 blocos `it.skip` comentando "removido em Phase 41" ou referenciando comportamentos que já não existem. Esses testes skipados documentam intenções antigas que foram abandonadas, e não comportamentos futuros planejados. Manter testes skipados indefinidamente cria ruído na suite e pode esconder quando um comportamento inadvertidamente volta a ser introduzido.

**Fix:** Remover os blocos `it.skip` que documentam comportamentos **já removidos** (não planejados para o futuro). O comportamento de remoção já está coberto pelos testes ativos (ex.: `'D-03: "Pause listening" e "Resume listening" NÃO aparecem em tray.ts'`).

---

_Reviewed: 2026-04-27T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
