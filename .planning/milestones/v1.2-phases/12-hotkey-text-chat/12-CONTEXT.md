# Phase 12: Hotkey + Text Chat - Context

**Gathered:** 2026-04-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Ativação por hotkey global e envio de mensagens de texto que percorrem a cadeia IPC completa (renderer → preload → main → gateway → FastAPI) e retornam resposta, com o orb transitando de estado durante o ciclo.

**NOT in scope:** Voice input (Fase 13), settings UI complexa, chat history/persistence.

</domain>

<decisions>
## Implementation Decisions

### Input UI
- **D-01:** Widget tem um **botão** (posicionado próximo ao orb)
- **D-02:** Ao clicar no botão → **input de texto aparece abaixo do orb**
- **D-03:** Input é **fallback para quando voz não está disponível** (sem microfone ou áudio desabilitado)
- **D-04:** Usuário digita mensagem e pressiona **Enter** para enviar

### Hotkey Configuration
- **D-05:** Hotkey padrão: **Ctrl+Shift+J**
- **D-06:** Configuração via **submenu no tray icon** (junto com Show/Hide/Quit)
- **D-07:** Submenu apresenta **opções pré-definidas**: Ctrl+Shift+J, Ctrl+Alt+J, Ctrl+Shift+Space, etc.
- **D-08:** Usuário clica em opção → hotkey **muda imediatamente**
- **D-09:** Hotkey salvo em **electron-store** (persiste entre sessões)
- **D-10:** Se hotkey falhar ao registrar → continua funcional via tray icon (Show)

### Response Display
- **D-11:** Resposta aparece como **balão/speech bubble acima do orb**
- **D-12:** Balão **cresce para mostrar toda a resposta** (sem scroll, sem limite de altura)
- **D-13:** Balão **permanece visível até próxima mensagem ser enviada**
- **D-14:** No futuro (fora desta fase), API retornará **texto + áudio opcional** — se houver áudio, reproduz; senão, mostra texto

### Claude's Discretion
- **Orb Feedback Timing:** Quando exatamente transicionar entre idle → processing → responding → idle (baseado em eventos: envio, aguardando API, resposta recebida)
- **Balão Styling:** Cores, sombras, animação de entrada/saída (manter consistente com tema futurístico do orb)
- **Botão de Input:** Ícone, posição exata, tamanho (deve ser discreto mas descobrível)
- **Error Handling:** Como mostrar erros de rede/API (balão de erro, notificação, ou outro feedback)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture
- `apps/desktop/src/shared/ipc-types.ts` — Padrão IPC com Result<T>, channel registry, JarvisAPI interface
- `apps/desktop/src/main/ipc/index.ts` — Registry pattern para handlers IPC

### Existing Integrations
- `apps/desktop/src/preload/index.ts` — contextBridge pattern, sendText já implementado
- `apps/desktop/src/main/tray.ts` — Tray module com Show/Hide/Quit (adicionar submenu de hotkey aqui)
- `apps/desktop/src/renderer/components/Orb/OrbContext.tsx` — setState para transições visuais

### API Endpoints
- `apps/gateway/src/routes/chat.ts` — POST /api/chat já configurado, proxia para FastAPI

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **IPC Bridge:** `window.jarvis.sendText(message)` já funciona (Fase 9) — retorna `IpcResult<SendTextData>`
- **OrbContext:** `useOrbContext()` hook com `setState('processing' | 'responding' | 'idle')` — Fase 11
- **Tray Module:** `createTray()` em `src/main/tray.ts` — adicionar submenu aqui
- **Position Module:** `electron-store` já usado para salvar posição do widget — reutilizar para salvar hotkey

### Established Patterns
- **IPC Pattern:** Handler em `main/ipc/{feature}.ts` → registrado em `setupIpcHandlers()` → exposto via preload → tipado em `shared/ipc-types.ts`
- **Result<T> Pattern:** Nunca throw em IPC handlers, sempre retornar `{ success: boolean, data?, error? }`
- **Security:** `contextIsolation: true`, `nodeIntegration: false` — IPC é a ÚNICA ponte

### Integration Points
- **Electron globalShortcut API:** `globalShortcut.register(accelerator, callback)` para hotkey global
- **React Form:** Input + onSubmit → chama `window.jarvis.sendText()` → aguarda resposta → atualiza estado
- **Orb States:** `setState('processing')` ao enviar → `setState('responding')` ao receber → `setState('idle')` após mostrar balão

</code_context>

<specifics>
## Specific Ideas

**Hotkey Submenu Structure (tray):**
```
JARVIS
├─ Show
├─ Hide
├─ Configure Hotkey ▶
│  ├─ Ctrl+Shift+J    ✓
│  ├─ Ctrl+Alt+J
│  ├─ Ctrl+Shift+Space
│  └─ Ctrl+`
└─ Quit
```

**Response Flow Esperado:**
1. Usuário pressiona Enter no input
2. Orb → `processing` (azul/violeta girando)
3. IPC → main → POST /api/chat → aguarda
4. Resposta chega → Orb → `responding` (anéis azuis)
5. Balão aparece acima do orb com texto
6. Orb volta para `idle` após animação

**Botão de Input:**
- Ícone de teclado ou chat bubble
- Posicionado discretamente (abaixo/ao lado do orb)
- Ao clicar: widget cresce verticalmente para mostrar input

</specifics>

<deferred>
## Deferred Ideas

- **Chat History UI:** Mostrar histórico de mensagens anteriores — complexo, não essencial para MVP
- **Markdown Rendering:** Formatação rica nas respostas (code blocks, listas) — API retorna texto puro por enquanto
- **Streaming de Resposta:** Mostrar resposta token-a-token em tempo real — gateway já tem /stream, mas widget não precisa disso agora
- **Custom Hotkey Input:** Permitir usuário digitar qualquer combinação (ex: "Alt+Shift+K") — submenu com opções pré-definidas é suficiente

</deferred>

---

*Phase: 12-hotkey-text-chat*
*Context gathered: 2026-04-06*
