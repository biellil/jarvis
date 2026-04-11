---
phase: 23-orb-ux-polish
reviewed: 2026-04-11T00:00:00Z
depth: standard
files_reviewed: 16
files_reviewed_list:
  - apps/desktop/src/main/__tests__/store.test.ts
  - apps/desktop/src/main/__tests__/tray.test.ts
  - apps/desktop/src/main/ipc/__tests__/settings.test.ts
  - apps/desktop/src/main/ipc/settings.ts
  - apps/desktop/src/main/store.ts
  - apps/desktop/src/main/tray.ts
  - apps/desktop/src/preload/index.ts
  - apps/desktop/src/renderer/components/Orb/Orb.tsx
  - apps/desktop/src/renderer/components/Orb/OrbContext.tsx
  - apps/desktop/src/renderer/components/Orb/__tests__/Orb.test.tsx
  - apps/desktop/src/renderer/components/Orb/__tests__/OrbContext.test.tsx
  - apps/desktop/src/renderer/hooks/__tests__/useWakeWord.test.ts
  - apps/desktop/src/renderer/hooks/useWakeWord.ts
  - apps/desktop/src/renderer/src/styles/globals.css
  - apps/desktop/src/shared/ipc-types.ts
  - apps/desktop/tailwind.config.ts
findings:
  critical: 0
  warning: 3
  info: 6
  total: 9
status: issues_found
---

# Phase 23: Code Review Report

**Reviewed:** 2026-04-11
**Depth:** standard
**Files Reviewed:** 16
**Status:** issues_found

## Summary

A Phase 23 entrega o polish do orb (paused visual, wake burst, reduced-motion) e o kill switch do tray (pause/resume persistente no store, broadcast via IPC). A arquitetura ficou limpa:

- **Semântica invertida** (`wakeWordEnabled` → `wakeWordPaused`) aplicada consistentemente em store, tray, IPC, preload, hook e Orb.
- **Defensive boolean check** em `setWakeWordPaused` protege contra gravação corrompida.
- **Cleanup de timeouts** no `OrbContext.triggerWakeBurst` bem feito (unmount guard + re-arm).
- **Gates anti self-trigger** de 3 camadas no `useWakeWord.onDetected` (state, paused ref, voiceInputManager).
- **Testes cobrem os D-itens** do CONTEXT.md com bom nível de isolamento via mocks hoisted.

Encontrei **3 warnings** (sendo 1 bug CSS que escapou no refactor, 1 timeout leak no burst delay e 1 potential stale closure) e **6 info items** (dead config no Tailwind, style leaks, nitpicks de typing). Nenhum crítico.

## Warnings

### WR-01: CSS `* { margin: 10; }` é valor inválido e quase certamente bug

**File:** `apps/desktop/src/renderer/src/styles/globals.css:10`
**Issue:** O seletor universal declara `margin: 10;` — sem unidade. Em CSS, valores não-zero de comprimento REQUEREM unidade; o parser descarta esta declaração como inválida, então na prática o código "funciona" por acidente (margin fica implicitamente 0 porque a declaração foi descartada). A intenção óbvia é `margin: 0` (comum no reset universal combinado com `padding: 0; box-sizing: border-box`). Esse valor inválido não está listado no diff da Phase 23, mas está no arquivo tocado pelo plan e merece correção enquanto o arquivo está aberto. Se alguém um dia rodar um linter CSS estrito, vai falhar.

**Fix:**
```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}
```

### WR-02: `setTimeout` do burst→listening delay não é tracked nem cancelado no cleanup

**File:** `apps/desktop/src/renderer/hooks/useWakeWord.ts:189`
**Issue:** O delay de 350ms entre `triggerWakeBurst()` e `setState('listening')` é agendado como `setTimeout(proceed, WAKE_BURST_TO_LISTENING_DELAY_MS)` sem guardar o handle. Se:

1. O componente unmounta entre `onDetected` e os 350ms, `proceed()` dispara em árvore morta e chama `setState('listening')`, `audioRecorder.startRecording()` e arma um VAD timeout de 3s, tudo num hook morto. React vai logar warning e o startRecording pode vazar uma MediaStream.
2. Outro `onDetected` disparar dentro dos 350ms (improvável por causa do `debounceMs: 2000` no engine, mas não impossível se o engine for reconfigurado), teríamos dois `proceed()` em voo concorrentes.

O cleanup do useEffect boot (linha 252) já cancela `vadTimeoutRef` mas não vê esse timeout do burst delay.

**Fix:**
```ts
// Adicionar ref no topo do hook (próximo a vadTimeoutRef)
const burstDelayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

// No onDetected, trocar o setTimeout plano:
if (prefersReducedMotion()) {
  proceed();
} else {
  if (burstDelayTimeoutRef.current) clearTimeout(burstDelayTimeoutRef.current);
  burstDelayTimeoutRef.current = setTimeout(() => {
    burstDelayTimeoutRef.current = null;
    proceed();
  }, WAKE_BURST_TO_LISTENING_DELAY_MS);
}

// No cleanup do useEffect boot:
return () => {
  cancelled = true;
  if (vadTimeoutRef.current) { clearTimeout(vadTimeoutRef.current); vadTimeoutRef.current = null; }
  if (burstDelayTimeoutRef.current) { clearTimeout(burstDelayTimeoutRef.current); burstDelayTimeoutRef.current = null; }
  void engineRef.current?.stop();
  engineRef.current = null;
};
```

### WR-03: Stale closure em `audioRecorder.startRecording` / `stopRecording` dentro do engine

**File:** `apps/desktop/src/renderer/hooks/useWakeWord.ts:161,176`
**Issue:** O engine é criado uma única vez no `useEffect(..., [])` do boot. Dentro do `onDetected`, o closure captura `audioRecorder` do primeiro render. Se `useAudioRecorder()` retornar nova referência de `startRecording`/`stopRecording` em renders subsequentes (ex: porque `isRecording` mudou e a função é recriada), o engine continuará chamando a versão antiga. Para `state` isso foi resolvido com `stateRef.current`; para `wakeWordPaused` com `wakeWordPausedRef.current`; mas para `audioRecorder` não há espelho em ref.

Hoje funciona porque `useAudioRecorder` provavelmente retorna funções estáveis (useCallback), mas isso é invariante implícita não validada.

**Fix (paridade com os outros refs):**
```ts
const audioRecorderRef = useRef(audioRecorder);
audioRecorderRef.current = audioRecorder;

// No onDetected / VAD timeout:
void audioRecorderRef.current.startRecording();
// ...
void audioRecorderRef.current.stopRecording();
```

Alternativa mais barata: adicionar um comment explícito no `useAudioRecorder` dizendo que `startRecording`/`stopRecording` MUST ser estáveis e cobrir com teste.

## Info

### IN-01: Tailwind config carrega tokens obsoletos

**File:** `apps/desktop/tailwind.config.ts:12-15,39-43`
**Issue:** Os tokens `orb-idle`, `orb-listen`, `orb-process`, `orb-respond` (cores e boxShadow) não são referenciados em nenhum lugar do código renderer (`grep` do diretório confirmou 0 matches). O Orb.tsx atual usa `filter: drop-shadow()` inline + gradients hardcoded com valores diferentes (`#2BA8D4` em vez do token `#06B6D4`). Como teste `Orb.test.tsx` literalmente comenta que "#06B6D4 never existed in Orb.tsx", há divergência documentada entre config e código. O mesmo vale para `glass-bg`, `glass-border`, `backdropBlur.glass`, `spacing.orb`, `borderRadius.glass`, `boxShadow.glass`, `fontSize.body/label/heading` — 0 referências.

**Fix:** Remover os tokens dead da `tailwind.config.ts` (ou, se forem reservados para uma página de settings futura, documentar no próprio arquivo). Manter apenas keyframes/animation que o Orb usa (`animate-pulse-idle`, `animate-pulse-listen`, `animate-spin-process`, `animate-ripple`, `animate-wake-burst`, `animate-wake-burst-ring`).

### IN-02: `preload/index.ts` ipcRenderer escape hatch bypassa canais type-safe

**File:** `apps/desktop/src/preload/index.ts:76-83`
**Issue:** A API `ipcRenderer.on(channel: string, ...)` aceita QUALQUER canal de string sem checar contra `IPC_CHANNELS`, efetivamente desfazendo o contract do tipado `JarvisAPI`. Qualquer renderer pode escutar `'wakeWord:pause-toggle'` diretamente via esse escape hatch, por exemplo. Funciona, mas derrota o propósito de `contextBridge` estrito.

**Fix:** Restringir o canal a `IpcChannel` (a união já exportada em `shared/ipc-types.ts`):
```ts
ipcRenderer: {
  on: (channel: IpcChannel, callback: (event: unknown, ...args: unknown[]) => void) => {
    ipcRenderer.on(channel, callback);
  },
  off: (channel: IpcChannel, callback: (event: unknown, ...args: unknown[]) => void) => {
    ipcRenderer.removeListener(channel, callback);
  },
}
```

### IN-03: `getWakeWordPaused()` não valida tipo do valor lido do disk

**File:** `apps/desktop/src/main/store.ts:63-66`
**Issue:** O setter valida `typeof paused !== 'boolean'` (T-23-02-01 mitigation), mas o getter confia cegamente no valor lido de `store.get('wakeWordPaused')`. Se o arquivo JSON do electron-store for editado manualmente com `"wakeWordPaused": "yes"`, o getter retorna a string, que vai vazar para o React como `wakeWordPaused: "yes"` (truthy em JSX, passa gates, mas `=== true` falha). Simetria com o setter faz sentido.

**Fix:**
```ts
export function getWakeWordPaused(): boolean {
  const config = store.get('wakeWordPaused');
  if (typeof config !== 'boolean') return DEFAULT_WAKE_WORD_PAUSED;
  return config;
}
```

### IN-04: `registerTTSHooks({})` no cleanup sobrescreve estado global sem guard

**File:** `apps/desktop/src/renderer/hooks/useWakeWord.ts:332-334`
**Issue:** Se dois componentes eventualmente consumirem `ttsPlayer`, o cleanup de um zeraria os hooks do outro. Hoje `useWakeWord` é provavelmente single-instance (montado uma vez no `App`), então não é um bug ativo — apenas uma restrição de design implícita. Vale um comment ou um `if (engineRef.current === this)` sentinel.

**Fix (comment-only, opt-in):**
```ts
return () => {
  // ASSUMPTION: useWakeWord é single-instance. Se isso mudar, trocar
  // registerTTSHooks({}) por uma versão que desregistra apenas os hooks
  // previamente registrados (com token/handle).
  registerTTSHooks({});
};
```

### IN-05: `tray.ts` → `ipc/settings.ts` — direção de import incomum

**File:** `apps/desktop/src/main/tray.ts:26`
**Issue:** O tray (módulo de UI do main process) importa `broadcastPauseToggle` do diretório `ipc/` (que tipicamente só expõe handlers de requests do renderer). Não há ciclo e funciona, mas arquitetonicamente `broadcastPauseToggle` é um utility de pub/sub main→renderer e poderia morar em `main/events.ts` ou `main/wakeWordBus.ts` para deixar a camada `ipc/` 100% dedicada a `ipcMain.handle`. Zero urgência.

**Fix:** Considerar extrair `broadcastPauseToggle` para `apps/desktop/src/main/wakeWordBus.ts` em uma futura refactor.

### IN-06: `tray.test.ts` usa assertions source-level (fragil a refactor)

**File:** `apps/desktop/src/main/__tests__/tray.test.ts:12-117`
**Issue:** O teste `readFileSync('../tray.ts')` e faz matches de string no código fonte. Isso acopla o teste ao texto literal — renomear `paused` para `isPaused` ou trocar `setContextMenu` por um helper `updateMenu(...)` quebra os testes sem nenhum regression real. Para um módulo core de UX como o tray, um teste behavior-level (montar `buildContextMenu` com stubs de Electron e inspecionar o menu template) seria mais robusto.

**Fix:** Migração futura — extrair `buildContextMenu` para função pura e testar o Menu template retornado (sem depender de `fs.readFileSync`). Documentação no próprio arquivo já reconhece a migração como deferred, então apenas anotar.

---

_Reviewed: 2026-04-11_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
