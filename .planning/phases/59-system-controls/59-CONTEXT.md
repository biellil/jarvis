# Phase 59: System Controls - Context

**Gathered:** 2026-05-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Adicionar controle de volume do sistema e reprodução de mídia por comando de voz. O LLM aciona LangGraph tools que retornam payloads dispatch para o Electron, que executa os comandos de SO via ferramentas nativas por plataforma.

</domain>

<decisions>
## Implementation Decisions

### Volume — adjust_volume

- **D-01:** Nova tool `adjust_volume` com `delta: number` — o LLM escolhe livremente o valor (ex: +15 para "aumenta bastante", -10 para "diminui um pouco"). Nenhum delta fixo.
- **D-02:** O handler lê o volume atual e aplica o delta, clampando no intervalo [0, 100].
- **D-03:** A tool `set_volume` existente permanece para comandos de nível absoluto ("coloca o volume em 50").

### Volume — toggle_mute

- **D-04:** Nova tool `toggle_mute` sem argumentos. LLM usa quando ouve "muta", "silencia", "tira o mudo", "unmute".
- **D-05:** Handler verifica o estado atual de mute e inverte.

### Cross-platform volume (adjust_volume + toggle_mute)

- **D-06:** Suporte completo às 3 plataformas na mesma fase:
  - **Linux:** `pactl` (já disponível via `runExecFile`)
  - **macOS:** `osascript` — AppleScript para ajuste e mute
  - **Windows:** PowerShell (`Set-Volume`, `Get-AudioDevice`) ou `nircmd`
- **D-07:** Seguir o padrão de `set-brightness.ts` — handler único com `switch(process.platform)` ou helpers internos por plataforma.

### Mídia — media_control

- **D-08:** Uma tool `media_control` com schema `{ command: 'play_pause' | 'next_track' | 'prev_track' }`. Segue o padrão de enum de `set_volume`.
- **D-09:** Mecanismo por plataforma:
  - **Linux:** `playerctl play-pause`, `playerctl next`, `playerctl previous`
  - **macOS:** `osascript` AppleScript — simular media keys via System Events
  - **Windows:** PowerShell `SendKeys` (`{MEDIA_PLAY_PAUSE}`, `{MEDIA_NEXT_TRACK}`, `{MEDIA_PREV_TRACK}`) via WScript ou nircmd
- **D-10:** Se `playerctl` não estiver instalado no Linux, o handler retorna `fail('playerctl not found — install playerctl')` com mensagem descritiva.

### macOS Accessibility permission gate

- **D-11:** Reutilizar exatamente o padrão do Phase 44 (mic permission) — toast acionável "Abrir System Settings" se a permissão de Accessibility não estiver concedida. Media commands não falham silenciosamente.

### Tool registration

- **D-12:** As novas tools (`adjust_volume`, `toggle_mute`, `media_control`) são registradas via `createAllPcTools()` seguindo o padrão das 9 PC tools existentes. Nenhum novo canal IPC necessário.

### Claude's Discretion

- Schema Zod exato de `adjust_volume` (range hints, descrição dos campos)
- Se usar `switch(process.platform)` inline ou arquivos separados por plataforma para os handlers
- Estratégia de fallback no Windows caso `nircmd` não esteja disponível
- Detalhes do AppleScript para volume no macOS (set volume vs output volume)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requisitos da fase
- `.planning/REQUIREMENTS.md` §SYSCTRL-01, SYSCTRL-02 — os 2 requisitos que esta fase entrega

### Roadmap e success criteria
- `.planning/ROADMAP.md` §Phase 59 — 4 success criteria concretos que definem "done"

### Padrões existentes do codebase
- `apps/desktop/src/main/actions/set-volume.ts` — handler existente (Linux/pactl, nível absoluto) — estender ou usar como referência para adjust_volume
- `apps/desktop/src/main/actions/set-brightness.ts` — padrão de handler simples com `runExecFile`
- `apps/desktop/src/main/actions/validators.ts` — `assertLevel0to100`, `runExecFile`, `ActionValidationError`
- `apps/desktop/src/main/actions/types.ts` — `ActionHandler`, `ok()`, `fail()`
- `apps/desktop/src/main/actions/index.ts` — `ACTION_HANDLERS` map + `REQUIRES_CONFIRMATION` set — onde registrar os novos handlers
- `apps/backend-ts/src/session/pc-tools.ts` — onde adicionar `createAdjustVolumeTool`, `createToggleMuteTool`, `createMediaControlTool`
- `apps/backend-ts/src/session/chat-session.ts` — onde `createAllPcTools()` é chamado — verificar se as novas tools são incluídas automaticamente
- `apps/backend-ts/src/session/system-prompt.ts` — onde atualizar a lista de tools disponíveis para o LLM

### Padrão de permission gate (macOS)
- `.planning/phases/44-hardening-migration/44-CONTEXT.md` — padrão do toast "Abrir System Settings" para falta de permissão

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `setVolumeHandler` (`set-volume.ts`): padrão `ok()/fail()` + `runExecFile` — copiar estrutura para `adjustVolumeHandler` e `toggleMuteHandler`
- `assertLevel0to100` (`validators.ts`): útil para clampar o resultado de delta + nível atual
- `runExecFile` (`validators.ts`): wrapper seguro sobre `execFile` — usar para playerctl/osascript/PowerShell
- `ACTION_HANDLERS` (`index.ts`): simplesmente adicionar entradas `adjust_volume`, `toggle_mute`, `media_control`

### Established Patterns
- Handler: arquivo isolado por ação, sem side effects no import, exporta uma constante `*Handler`
- Tool: fábrica `create*Tool()` retorna LangGraph `tool()` com `responseFormat: 'content_and_artifact'`
- Payload: `{ action: string, args: Record<string, unknown> }` — action name matches ACTION_HANDLERS key
- Cross-platform: `process.platform` switch interno no handler (ver `set-brightness.ts` como referência — embora seja Linux-only, a estrutura é o modelo)

### Integration Points
- `apps/desktop/src/main/actions/index.ts`: adicionar novos handlers ao `ACTION_HANDLERS`
- `apps/backend-ts/src/session/pc-tools.ts`: adicionar 3 novas fábricas de tools
- `apps/backend-ts/src/session/chat-session.ts`: verificar se `createAllPcTools()` precisa ser atualizado
- `apps/backend-ts/src/session/system-prompt.ts`: atualizar prompt do sistema com as novas capabilities

</code_context>

<specifics>
## Specific Ideas

- "Aumenta bastante" → LLM escolhe delta alto (ex: +20); "aumenta um pouco" → delta pequeno (ex: +5). A liberdade do LLM é intencional.
- `playerctl` é a abordagem Linux — se não estiver instalado, erro descritivo (não silencioso).
- Windows: testar se `nircmd` ou PowerShell WScript é mais confiável para media keys.

</specifics>

<deferred>
## Deferred Ideas

- Controle de mídia por app específico (Spotify, YouTube Music) — v2.4 per REQUIREMENTS.md
- Controle de brilho cross-platform (atual é Linux-only) — v2.4 per REQUIREMENTS.md
- Volume por app (mixer individual) — não mencionado, seria nova capability

</deferred>

---

*Phase: 59-system-controls*
*Context gathered: 2026-05-06*
