---
phase: quick-260427-qzg
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/desktop/src/renderer/hooks/useAudioRecorder.ts
  - apps/desktop/src/renderer/hooks/useWakeWord.ts
  - apps/desktop/src/renderer/hooks/useMultiTurnWindow.ts
  - apps/desktop/src/renderer/src/App.tsx
  - apps/desktop/src/preload/index.ts
  - apps/desktop/src/main/ipc/voiceMode.ts
  - apps/desktop/src/main/ipc/index.ts
  - apps/desktop/src/shared/ipc-types.ts
autonomous: false
requirements: []
must_haves:
  truths:
    - "Pressionar PTT N vezes seguidas produz no máximo 1 prompt de permissão de mídia (na primeira vez)."
    - "Após o ciclo PTT (apertar → falar → apertar → resposta com TTS), o microfone fica fechado e nenhum áudio é enviado ao gateway até o próximo aperto manual."
    - "Em modo ptt-only, wake word engine e multi-turn follow-up window NÃO ficam ativos."
    - "Em modo wake-word, comportamento atual (wake word + multi-turn) continua funcionando."
  artifacts:
    - path: "apps/desktop/src/renderer/hooks/useAudioRecorder.ts"
      provides: "MediaStream cacheado entre toggles PTT — getUserMedia chamado lazy só na 1ª vez"
    - path: "apps/desktop/src/renderer/hooks/useWakeWord.ts"
      provides: "Boot gated por voice mode (skip se ptt-only)"
    - path: "apps/desktop/src/renderer/hooks/useMultiTurnWindow.ts"
      provides: "afterPlay hook gated por voice mode (skip se ptt-only)"
    - path: "apps/desktop/src/preload/index.ts"
      provides: "window.jarvis.voiceMode.getMode() + onChange()"
    - path: "apps/desktop/src/main/ipc/voiceMode.ts"
      provides: "Handler ipcMain.handle('voiceMode:get') retornando voiceModeManager.getMode()"
  key_links:
    - from: "useAudioRecorder.ts"
      to: "navigator.mediaDevices.getUserMedia"
      via: "Cache em streamRef + flag warmStream — só chama getUserMedia se streamRef.current === null"
      pattern: "streamRef\\.current === null"
    - from: "App.tsx"
      to: "useWakeWord / useMultiTurnWindow"
      via: "voice mode lido via window.jarvis.voiceMode.getMode() — hooks só montam logic se mode !== 'ptt-only'"
      pattern: "mode !== 'ptt-only'"
    - from: "preload/index.ts"
      to: "main/ipc/voiceMode.ts"
      via: "ipcRenderer.invoke('voiceMode:get')"
      pattern: "voiceMode:get"
---

<objective>
Corrigir dois bugs do push-to-talk no renderer Electron do JARVIS:

1. **Bug 1 — Permissão de mídia pedida toda vez:** cada toggle do PTT chama `navigator.mediaDevices.getUserMedia()` de novo. Isso emite o log `[permission] request: media from: http://localhost:5173/` em todo aperto e gera fricção. Causa raiz: `useAudioRecorder.stopRecording()` chama `stream.getTracks().forEach(t => t.stop())` e zera `streamRef`, então a próxima chamada precisa re-prompt.

2. **Bug 2 — Mic fica aberto após resposta + transcrição fantasma " e aí":** mesmo em modo `ptt-only`, o renderer monta `useWakeWord()` e `useMultiTurnWindow()` no `App.tsx`. Quando o TTS termina, o `registerTTSHooks.afterPlay` do `useMultiTurnWindow` abre uma janela VAD de 8s reusando o stream que o `useWakeWord` já adquiriu — VAD pega ruído de fundo e manda " e aí" ao gateway com `source: 'followup'`. Em PTT-only o ciclo correto é: aperta → grava → aperta → envia → mic FECHADO.

Purpose: PTT em modo `ptt-only` deve ter exatamente 1 prompt de mic por sessão (na primeira vez) e mic 100% fechado entre apertos manuais.

Output: hooks de captura/wake word gateados pelo voice mode atual; stream cacheado no `useAudioRecorder` entre toggles.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/STATE.md

@apps/desktop/src/renderer/hooks/useAudioRecorder.ts
@apps/desktop/src/renderer/hooks/usePttHandler.ts
@apps/desktop/src/renderer/hooks/useWakeWord.ts
@apps/desktop/src/renderer/hooks/useMultiTurnWindow.ts
@apps/desktop/src/renderer/src/App.tsx
@apps/desktop/src/preload/index.ts
@apps/desktop/src/shared/ipc-types.ts
@apps/desktop/src/main/voiceMode/index.ts

<interfaces>
<!-- Tipos e contratos chave que o executor precisa. Extraídos do codebase. -->
<!-- Use direto — não precisa explorar mais o codebase. -->

From apps/desktop/src/shared/ipc-types.ts:
```typescript
export type VoiceMode = 'wake-word' | 'always-listening' | 'ptt-only';

export interface VoiceModeChangeEvent {
  oldMode: VoiceMode;
  newMode: VoiceMode;
  reason: 'user' | 'system';
  timestamp: number;
}

export const IPC_CHANNELS = {
  // ... existentes
  VOICE_MODE_CHANGE: 'voiceMode:change', // já existe (main → renderer broadcast)
  // ADICIONAR: VOICE_MODE_GET: 'voiceMode:get'  (renderer → main invoke)
} as const;
```

From apps/desktop/src/main/voiceMode/index.ts:
```typescript
// VoiceModeManager (singleton no main) já expõe:
getMode(): VoiceMode | null
// Existe um voiceModeManager singleton importado em tray.ts:
//   const currentMode = voiceModeManager.getMode();
```

From apps/desktop/src/renderer/hooks/useAudioRecorder.ts:
```typescript
export interface AudioRecorderAPI {
  isRecording: boolean;
  error: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<Uint8Array | null>;
}
// Uso atual: streamRef + mediaRecorderRef. PROBLEMA: stopRecording() faz
// stream.getTracks().forEach(t => t.stop()) e zera streamRef.
// Solução: separar lifecycle do stream do lifecycle do MediaRecorder.
// O stream é warm/cacheado; só o MediaRecorder e os chunks são reciclados.
```

From apps/desktop/src/main/ipc/index.ts:
```typescript
// Já existe:
import { registerOpenSystemSettingsHandler } from './voiceMode';
// ADICIONAR: registerGetVoiceModeHandler() no mesmo arquivo voiceMode.ts e chamar do index.ts.
```
</interfaces>

<root-cause-analysis>
**Bug 1 — re-prompt de permissão**
- `useAudioRecorder.startRecording()` linha 54: `await navigator.mediaDevices.getUserMedia({ audio: true })` é chamado SEMPRE.
- `useAudioRecorder.stopRecording()` linha 117: `stream.getTracks().forEach(t => t.stop())` mata o stream.
- Linha 129: `streamRef.current = null` apaga a referência.
- Resultado: cada PTT toggle = novo getUserMedia = novo log `[permission] request: media`.

**Fix:** o stream pode viver pela vida toda do hook (até unmount). Apenas o `MediaRecorder` precisa ser recriado por gravação (não dá pra reusar um MediaRecorder que já foi `stop()`). Em `stopRecording()`, NÃO chamar `track.stop()` — apenas `mediaRecorder.stop()` e descartar chunks.

**Bug 2 — mic aberto + fantasma " e aí"**
- `App.tsx` monta `useWakeWord()` (linha 25) e `useMultiTurnWindow()` (linha 80) incondicionalmente.
- `useWakeWord` chama `getUserMedia` (linha 261) e roda o engine.
- `useMultiTurnWindow` registra `afterPlay` que abre VAD por 8s após TTS terminar.
- Em `ptt-only`, ambos NÃO deveriam estar ativos. Quando o TTS de uma resposta PTT termina, o multi-turn fala "vou abrir 8s de VAD compartilhado", VAD pega ruído ambiente, envia " e aí" como follow-up.

**Fix:** expor o voice mode atual ao renderer. Hooks só rodam se `mode === 'wake-word'` (mais conservador: skip em `ptt-only` E `always-listening`, ambos já têm seus próprios pipelines no main). Reagir ao evento `voiceMode:change` para start/stop sem reload da janela.

**Quem paga o custo?** O `usePttHandler` continua igual; ele não depende do mode. Mas quando o usuário troca para `wake-word`, o `useWakeWord` precisa bootar tardiamente (não foi inicializado no mount) — solução simples: `App.tsx` re-renderiza e remonta os hooks com base no `mode` lido via state. Hook React é trivialmente desmontado/remontado quando o componente pai muda a chave de renderização.
</root-cause-analysis>

</context>

<tasks>

<task type="auto">
  <name>Task 1: Expor voice mode atual ao renderer via IPC</name>
  <files>
    apps/desktop/src/shared/ipc-types.ts,
    apps/desktop/src/main/ipc/voiceMode.ts,
    apps/desktop/src/main/ipc/index.ts,
    apps/desktop/src/preload/index.ts
  </files>
  <action>
1. Em `apps/desktop/src/shared/ipc-types.ts`:
   - Adicionar nova entrada em `IPC_CHANNELS`: `VOICE_MODE_GET: 'voiceMode:get'` (logo abaixo do `VOICE_MODE_CHANGE` existente).
   - Adicionar ao `JarvisAPI` (procurar a interface — provavelmente no mesmo arquivo) um campo `voiceMode: { getMode(): Promise<VoiceMode | null>; onChange(cb: (event: VoiceModeChangeEvent) => void): () => void; }`. Se `JarvisAPI` está em outro arquivo do `shared/`, atualize lá.

2. Em `apps/desktop/src/main/ipc/voiceMode.ts` (já existe — adicionar handler):
   - Importar `voiceModeManager` (já há `getMode()` disponível — confira o import existente em `tray.ts` para o caminho exato).
   - Exportar nova função `registerGetVoiceModeHandler(): void` que faz `ipcMain.handle(IPC_CHANNELS.VOICE_MODE_GET, () => voiceModeManager.getMode())`.
   - Garantir registro idempotente: chamar `ipcMain.removeHandler(IPC_CHANNELS.VOICE_MODE_GET)` antes do `handle()` (mesmo padrão dos outros handlers).

3. Em `apps/desktop/src/main/ipc/index.ts`:
   - Importar e chamar `registerGetVoiceModeHandler()` junto com os outros handlers do voiceMode.

4. Em `apps/desktop/src/preload/index.ts`:
   - Adicionar `voiceMode: { getMode, onChange }` ao objeto `api`:
     ```typescript
     voiceMode: {
       getMode: (): Promise<VoiceMode | null> =>
         ipcRenderer.invoke(IPC_CHANNELS.VOICE_MODE_GET),
       onChange: (cb: (event: VoiceModeChangeEvent) => void) => {
         const handler = (_event: unknown, payload: VoiceModeChangeEvent) => cb(payload);
         ipcRenderer.on(IPC_CHANNELS.VOICE_MODE_CHANGE, handler);
         return () => ipcRenderer.removeListener(IPC_CHANNELS.VOICE_MODE_CHANGE, handler);
       },
     },
     ```
   - Importar `VoiceMode`, `VoiceModeChangeEvent` no topo do preload.

NÃO incluir lógica de gating ainda — esta task é só plumbing IPC. Não tocar nos hooks do renderer ainda.
  </action>
  <verify>
    <automated>cd /root/jarvis/apps/desktop && pnpm typecheck 2>&1 | tail -20</automated>
  </verify>
  <done>
    - `IPC_CHANNELS.VOICE_MODE_GET` existe em ipc-types.ts.
    - `JarvisAPI.voiceMode.getMode()` e `onChange()` tipados.
    - `registerGetVoiceModeHandler` registrado no ipc/index.ts.
    - `window.jarvis.voiceMode` exposto no preload.
    - `pnpm typecheck` passa sem erros novos.
  </done>
</task>

<task type="auto">
  <name>Task 2: Cachear MediaStream no useAudioRecorder + gatear hooks por voice mode</name>
  <files>
    apps/desktop/src/renderer/hooks/useAudioRecorder.ts,
    apps/desktop/src/renderer/hooks/useWakeWord.ts,
    apps/desktop/src/renderer/hooks/useMultiTurnWindow.ts,
    apps/desktop/src/renderer/src/App.tsx
  </files>
  <action>
**Parte A — `useAudioRecorder.ts` (corrige Bug 1):**

Refatorar para cachear o MediaStream pela vida do hook:

1. Adicionar `useEffect` de cleanup que dá `stop()` em todas as tracks SOMENTE no unmount do hook (cleanup function).
2. Em `startRecording()`:
   - SE `streamRef.current === null` → chama `getUserMedia({ audio: true })` (1ª vez).
   - SE `streamRef.current` existe E todas as tracks `readyState === 'live'` → reusa.
   - SE existe mas alguma track morreu (readyState !== 'live' ou ended) → recria stream (track.stop() + getUserMedia novo). Caso típico: usuário desconectou USB mic.
3. Criar novo `MediaRecorder` com o stream cacheado (sempre — MediaRecorder não pode ser reusado após stop).
4. Em `stopRecording()`:
   - Chamar `mediaRecorder.stop()` normalmente.
   - REMOVER as linhas que dão `stream.getTracks().forEach(t => t.stop())` e `streamRef.current = null`.
   - Manter `mediaRecorderRef.current = null` e `chunksRef.current = []`.
5. Adicionar comentário em pt-BR explicando: "Stream cacheado entre gravações pra evitar prompt de permissão de mídia a cada toggle do PTT (bug 260427-qzg). Só liberamos as tracks no unmount do hook."

**Parte B — `App.tsx` (corrige Bug 2 — gating):**

Adicionar leitura do voice mode no topo do `AppContent()`:
```tsx
const [voiceMode, setVoiceMode] = useState<VoiceMode | null>(null);
useEffect(() => {
  let cancelled = false;
  void window.jarvis.voiceMode.getMode().then((m) => {
    if (!cancelled) setVoiceMode(m);
  });
  const unsub = window.jarvis.voiceMode.onChange((evt) => {
    setVoiceMode(evt.newMode);
  });
  return () => { cancelled = true; unsub(); };
}, []);

const wakeFeaturesEnabled = voiceMode === 'wake-word';
```

Passar `wakeFeaturesEnabled` como prop pros hooks `useWakeWord` e `useMultiTurnWindow`. (Ver Parte C/D abaixo para a interface dos hooks.)

NÃO mexer no `usePttHandler` — ele deve continuar montado em todos os modos pra que PTT funcione mesmo durante o boot quando `voiceMode === null`.

**Parte C — `useWakeWord.ts`:**

Aceitar parâmetro de gating:
```ts
export function useWakeWord(options: { enabled: boolean } = { enabled: true }): UseWakeWordState
```

Dentro do `useEffect` de boot, no início do `boot()`, adicionar:
```ts
if (!options.enabled) {
  setHookState({ status: 'unavailable', error: 'Disabled — voice mode is not wake-word' });
  return;
}
```

A dep array do `useEffect` continua vazia (mount-once); para reagir a mudanças de mode, NÃO basta isso — adicionar segundo useEffect com `[options.enabled]` que faz teardown completo (engine.stop, vad.pause, clearTimeout) quando `enabled` vira false após estar true, e remount quando volta a true. **OU mais simples:** fazer o callsite (`App.tsx`) usar uma `key={voiceMode}` em um wrapper para forçar unmount/remount do hook. Vou pelo caminho da key — mais robusto e menos código:

No `App.tsx`, extrair `useWakeWord()` + `useMultiTurnWindow()` para um sub-componente `<WakeWordFeatures />` que só é renderizado quando `voiceMode === 'wake-word'`:

```tsx
function WakeWordFeatures({ multiTurnEnabled, windowMs }: { ... }) {
  const wakeWordState = useWakeWord();
  useMultiTurnWindow({ vadInstance: wakeWordState.vadInstance, enabled: multiTurnEnabled, windowMs });
  return null;
}

// Em AppContent:
{wakeFeaturesEnabled && <WakeWordFeatures multiTurnEnabled={multiTurnEnabled} windowMs={windowMs} />}
```

Isso garante que: (1) em ptt-only o `useWakeWord` NUNCA é chamado, (2) ao trocar pra wake-word o hook bota; ao sair, hook desmonta e roda o cleanup que já existe (linha 381 do hook).

**Parte D — `useMultiTurnWindow.ts`:**

Nenhuma mudança interna se a Parte C usar a abordagem de sub-componente com gating no callsite. Confirmar que o cleanup do hook (linha 216-221) cancela timeouts e roda `registerTTSHooks({})` no unmount — ler o final do hook pra garantir.

Se NÃO houver `registerTTSHooks({})` no cleanup do `useMultiTurnWindow`, ADICIONAR no return do useEffect que chama `registerTTSHooks` (linha ~213):
```ts
return () => {
  if (windowTimeoutRef.current) clearTimeout(windowTimeoutRef.current);
  windowTimeoutRef.current = null;
  registerTTSHooks({}); // ← desregistra afterPlay quando hook desmonta
};
```
**Crítico:** sem isso, mesmo desmontando o componente, o callback `afterPlay` registrado fica "fantasma" no módulo singleton `ttsPlayer` e continua disparando.

CUIDADO: o `useWakeWord` ALSO chama `registerTTSHooks(...)` (linha 454-465). Se ambos os hooks rodarem `registerTTSHooks({})` no cleanup, o último ganha — está OK porque ambos só vivem juntos.

**Imports a adicionar em App.tsx:**
- `useState` (já tem useEffect)
- `VoiceMode, VoiceModeChangeEvent` de `'../../shared/ipc-types'`

Comentário em pt-BR no topo do `WakeWordFeatures`:
```tsx
/**
 * 260427-qzg fix bug 2: wake word + multi-turn só rodam em mode 'wake-word'.
 * Em ptt-only ou always-listening, este componente NÃO é renderizado, então
 * useWakeWord/useMultiTurnWindow nunca chamam getUserMedia nem registram
 * afterPlay no ttsPlayer — eliminando o " e aí" fantasma após resposta PTT.
 */
```
  </action>
  <verify>
    <automated>cd /root/jarvis/apps/desktop && pnpm typecheck 2>&1 | tail -20 && pnpm test --run useAudioRecorder 2>&1 | tail -30</automated>
  </verify>
  <done>
    - `useAudioRecorder.ts`: stream só é solicitado uma vez por mount; tracks são paradas só no cleanup do hook.
    - `App.tsx`: lê voice mode via `window.jarvis.voiceMode.getMode()`, escuta `onChange`, condicionalmente renderiza `<WakeWordFeatures />`.
    - `useMultiTurnWindow.ts`: cleanup chama `registerTTSHooks({})` para desregistrar afterPlay.
    - `pnpm typecheck` passa sem erros novos.
    - Testes existentes (`useAudioRecorder*`, se houver) continuam verdes — se nenhum existir, `pnpm test --run` global passa sem regressão.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Verificação manual — PTT no app real</name>
  <what-built>
    - Bug 1: useAudioRecorder agora cacheia MediaStream entre toggles PTT.
    - Bug 2: useWakeWord + useMultiTurnWindow só rodam em modo wake-word.
    - Plumbing IPC: window.jarvis.voiceMode.getMode() + onChange().
  </what-built>
  <how-to-verify>
1. Iniciar o app desktop:
   ```bash
   cd /root/jarvis/apps/desktop && pnpm dev
   ```
2. Garantir que o voice mode está em `ptt-only` (via tray menu, opção "PTT only").
3. Abrir DevTools do renderer (Ctrl+Shift+I no orb) e a janela de logs do main.
4. **Teste Bug 1** — apertar PTT 5 vezes seguidas (apertar → falar → apertar → esperar resposta → repetir 4x):
   - **Esperado:** apenas 1 ocorrência de `[permission] request: media from: http://localhost:5173/` na sessão (ou 0 se já tinha permissão concedida persistida).
   - **Antes do fix:** 5+ ocorrências.
5. **Teste Bug 2** — após uma resposta com TTS terminar:
   - **Esperado:** nenhum log `[multiTurnWindow] opening follow-up window` aparece. Mic FECHADO até próximo aperto. Nenhuma transcrição " e aí" enviada ao gateway.
   - **Antes do fix:** logs de multiTurnWindow + envio de " e aí" para o backend.
6. **Teste de regressão modo wake-word** — trocar voice mode para `wake-word` no tray:
   - **Esperado:** logs `[wakeWord] engine started` aparecem (boot late do hook). Falar "Hey JARVIS" + uma frase ainda funciona normalmente.
7. **Teste de regressão troca de modo durante uso** — em wake-word ativo, trocar para ptt-only via tray:
   - **Esperado:** logs de cleanup (`engine.stop()`) aparecem; depois disso, falar "Hey JARVIS" não dispara mais nada; PTT continua funcionando.

Confirmar todos os 4 cenários passam (1 prompt, sem fantasma " e aí", wake-word boot tardio funciona, troca de modo limpa engine).
  </how-to-verify>
  <resume-signal>Type "approved" se os 4 testes passaram, ou descreva qual falhou (com logs).</resume-signal>
</task>

<task type="auto">
  <name>Task 4: Commit em pt-BR seguindo convenções do projeto</name>
  <files>
    .git
  </files>
  <action>
Após o checkpoint humano aprovar, criar UM commit seguindo as convenções do CLAUDE.md (Conventional Commits + emoji, mensagens em pt-BR, SEM linhas "Generated with Claude Code" ou "Co-Authored-By: Claude").

Comando:
```bash
cd /root/jarvis && git add \
  apps/desktop/src/renderer/hooks/useAudioRecorder.ts \
  apps/desktop/src/renderer/hooks/useWakeWord.ts \
  apps/desktop/src/renderer/hooks/useMultiTurnWindow.ts \
  apps/desktop/src/renderer/src/App.tsx \
  apps/desktop/src/preload/index.ts \
  apps/desktop/src/main/ipc/voiceMode.ts \
  apps/desktop/src/main/ipc/index.ts \
  apps/desktop/src/shared/ipc-types.ts \
  .planning/quick/260427-qzg-fix-push-to-talk-pedir-permiss-o-de-m-di/

git commit -m "$(cat <<'EOF'
🐛 fix(ptt): cachear MediaStream e desativar wake word em modo ptt-only

- useAudioRecorder agora reusa o MediaStream entre toggles do PTT — chama
  getUserMedia uma única vez por sessão. Antes, cada aperto gerava um novo
  prompt [permission] request: media e fricção visível nos logs.
- useWakeWord e useMultiTurnWindow só montam em modo 'wake-word' via
  componente <WakeWordFeatures> condicional. Em ptt-only, multi-turn não
  abre janela VAD após TTS — elimina transcrição fantasma " e aí" enviada
  ao gateway sem ação do usuário.
- Adiciona window.jarvis.voiceMode.getMode() e onChange() ao preload para
  o renderer reagir a mudanças de modo via tray sem reload.
- useMultiTurnWindow agora desregistra afterPlay no unmount (registerTTSHooks
  vazio), prevenindo callback fantasma no singleton ttsPlayer.
EOF
)"
```

Se algum dos arquivos não foi modificado (ex: ipc-types.ts não precisou se o tipo VoiceMode já existia em local diferente), remova do `git add` antes do commit. Verifique com `git status` antes.

Garantir que o commit NÃO contém:
- `🤖 Generated with [Claude Code]`
- `Co-Authored-By: Claude`
  </action>
  <verify>
    <automated>cd /root/jarvis && git log -1 --pretty=%B | grep -E "(Generated with|Co-Authored-By: Claude)" && exit 1 || git log -1 --pretty=%s | grep -E "^🐛 fix\(ptt\)"</automated>
  </verify>
  <done>
    - Commit criado com prefixo `🐛 fix(ptt):`.
    - Mensagem em pt-BR.
    - Sem linhas proibidas (Generated with / Co-Authored-By Claude).
    - `git status` limpo após commit.
  </done>
</task>

</tasks>

<verification>
**Pós-execução, confirmar via observação manual no app rodando:**

1. PTT em modo ptt-only: 1 prompt de mídia em N apertos, mic fechado entre apertos.
2. Em modo wake-word: comportamento original preservado (wake word + multi-turn).
3. Troca de modo via tray funciona sem reload da janela.
4. Nenhum console error novo no DevTools.
5. `pnpm typecheck` no `apps/desktop` passa.
</verification>

<success_criteria>
- Bug 1 fechado: ≤ 1 prompt de `[permission] request: media` por sessão de PTT em ptt-only.
- Bug 2 fechado: nenhuma transcrição " e aí" enviada após TTS terminar; nenhum log `[multiTurnWindow] opening` em ptt-only.
- Modo wake-word continua funcional (regressão zero).
- Troca de modo dinâmica (ptt-only ↔ wake-word) via tray funciona sem reload.
- Commit segue padrão do projeto (`🐛 fix(ptt):` + pt-BR + sem assinaturas Claude).
</success_criteria>

<output>
Após completar, criar resumo em `.planning/quick/260427-qzg-fix-push-to-talk-pedir-permiss-o-de-m-di/260427-qzg-SUMMARY.md` com:
- Bugs fechados (1 e 2)
- Arquivos tocados
- SHA do commit
- Quaisquer observações inesperadas durante a verificação manual
</output>
