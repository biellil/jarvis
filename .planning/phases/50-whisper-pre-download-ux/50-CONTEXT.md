# Phase 50: Whisper Pre-Download UX - Context

**Gathered:** 2026-05-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Trocar um modelo Whisper na seção Whisper das Settings dispara download imediato (sem aguardar restart) com feedback visual usando o `Progress` primitivo da Phase 48. Modelos já em cache aplicam instantaneamente. Erros de rede/disco mostram mensagem clara com botão Try again. Após conclusão, o backend ativa o novo modelo sem restart manual (próxima transcrição usa o novo modelo).

**NÃO inclui:** download em background no boot, gerenciamento avançado de cache (deletar modelos), cancelamento explícito de download, fila de downloads paralelos, suporte a modelos custom além dos da enum `WhisperModelOption`.
</domain>

<decisions>
## Implementation Decisions

### Trigger & UX Flow
- **D-01:** Download dispara **imediato no `onChange`** do Select Whisper (sem precisar Save) — fluxo "select → download → ativo". A persistência do override no store ocorre quando o Save bar é clicado normalmente.
- **D-02:** Cache hit → aplicar instantâneo + Toast info `Model already cached`
- **D-03:** Opção `auto` → resolver para modelo concreto via VRAM detection (já existente em `vramDetection.ts`/`selectWhisperModel.ts`) e baixar esse — se já em cache, comportamento de cache hit
- **D-04:** Download é **fire-and-forget** — não há botão Cancel explícito. Trocar para outro modelo durante download cancela o anterior (drop the in-flight promise; libera tmp file).

### Progress UX
- **D-05:** Componente: `Progress variant="linear"` da Phase 48 (D-11) **abaixo do Select** dentro da `WhisperSection`, com texto `Downloading {modelLabel}… {N}%`
- **D-06:** Granularidade: **determinate** baseado em bytes (`content-length`) — backend já lê em `whisperResources.ts:139`
- **D-07:** Estado pós-conclusão: indicator transita para `success` (cor `emerald-500`) + check icon por **~1.5s**, depois desaparece. Field.Helper passa a mostrar `Model: {name} (ready)` discreto.
- **D-08:** Tamanho: mostrar `{N} / {Total} MB` em `text-xs fg-subtle` ao lado do %. Ex: `Downloading base… 42% (60 / 142 MB)`

### Backend & IPC Contract
- **D-09:** Trigger via IPC: renderer chama `window.whisper.downloadModel(option)` (novo) — main coordena download via `ensureWhisperModel` modificado e emite progresso
- **D-10:** Canal de progresso: main → renderer broadcast em `whisper:download-progress` com payload `{ model: string, status: 'downloading' | 'success' | 'error', percent: number, downloadedBytes: number, totalBytes: number, errorMessage?: string }`
- **D-11:** Refatorar `whisperResources.ts`: adicionar parâmetro opcional `onProgress?: (progress: { downloadedBytes: number; totalBytes: number; percent: number }) => void` ao `ensureWhisperModel` (mantém compat com chamadas existentes em `getWhisperInstance` que não passam callback) e expor função `isWhisperModelCached(model: WhisperModel): boolean`
- **D-12:** Resolver `WhisperModelOption` (UI: `auto | tiny | base | small | medium | large-v3-turbo`) → backend `WhisperModel` (`tiny | base | medium | large`):
  - `auto` → resolve via VRAM detection (lib existente)
  - `tiny`, `base`, `medium` → mesmo nome
  - `small` → mapear para `base` (não há URL `small`; fallback documentado)
  - `large-v3-turbo` → mapear para `large` (já é large-v3 segundo `MODEL_FILENAMES`; documentar que é o mesmo arquivo)
  - **Recomendação:** Adicionar função pura `resolveWhisperModel(option, vramMb)` em `whisperResources.ts` ou novo arquivo `whisperModelResolver.ts` para centralizar o mapeamento

### Erros, Estado & Persistência
- **D-13:** Erros exibidos em **dois canais simultaneamente**:
  - `Field.Error` abaixo do Select com mensagem curta — ex: `Couldn't download. Check your connection and try again.`
  - Toast existente (severity `error`) com mensagem técnica mais detalhada (ex: `Download failed: HTTP 503` ou `ENOSPC: not enough space on disk`)
- **D-14:** Botão `Try again` aparece ao lado do `Field.Error` quando há erro — `<Button variant="ghost" size="sm">Try again</Button>` que re-dispara IPC para o mesmo modelo
- **D-15:** Durante download: Select **disabled** (evita troca mid-download). Após sucesso/erro, volta a habilitado.
- **D-16:** Hot-swap sem restart: backend chama `setActiveWhisperModel(model)` que atualiza estado interno usado por `voiceHandler.ts` na próxima transcrição. Transcrições em andamento terminam com o modelo antigo (limitação aceita; documentar em PR).

### Claude's Discretion
- Nome exato do canal IPC (`IPC_CHANNELS.WHISPER_DOWNLOAD_MODEL` / `WHISPER_DOWNLOAD_PROGRESS`) — seguir convenções existentes em `shared/ipc-types.ts`
- Localização exata da função `setActiveWhisperModel` (provavelmente em `voiceHandler.ts` ou um helper novo) — executor decide baseado na arquitetura atual
- Threshold mínimo de update do progresso para evitar excesso de IPC (ex: emitir só quando `pct` muda em 1%) — atualmente o backend já faz isso a cada 10%, mas para UX fluida convém reduzir para 1% ou ~250ms throttle
- Visual exato do Toast vs Field.Error (já há `Toast` component) — usar padrão atual de `showToast` em `SettingsLayout`
- Como cancelar download em curso ao trocar modelo (D-04) — abortar request HTTP via `req.destroy()` e limpar tmp file; executor implementa
- Comportamento se `getWhisperInstance()` for chamada durante um download via UI (e.g., Always-Listening dispara): aguardar a in-flight promise (já é o comportamento atual via `_downloadPromises`)
- Texto exato dos labels nas opções de Whisper Model (`Tiny`, `Base`, `Small`, etc.) — manter o que já está em `SettingsLayout`/`WhisperSection`

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project context
- `.planning/PROJECT.md` — JARVIS overview
- `.planning/REQUIREMENTS.md` — WHISPER-01, WHISPER-02
- `.planning/ROADMAP.md` — Phase 50 success criteria
- `CLAUDE.md` — convenções de commits

### Phase 48 (dependência — Progress primitive)
- `.planning/phases/48-design-system-foundation/48-UI-SPEC.md` — spec do `Progress` (linear/circular, determinate/indeterminate, success/error states)
- `apps/desktop/src/renderer/src/components/ui/Progress.tsx` — primitivo entregue

### Phase 49 (dependência — layout & Whisper section)
- `.planning/phases/49-settings-layout-refactor/49-CONTEXT.md` — D-12 (manter helper text Whisper)
- `apps/desktop/src/renderer/src/settings/sections/WhisperSection.tsx` — local da modificação primária
- `apps/desktop/src/renderer/src/settings/SettingsLayout.tsx` — owner do state (whisperModel, dirty), eventualmente passa `onWhisperDownload` handler

### Backend a integrar
- `apps/desktop/src/main/voiceInput/whisperResources.ts` — `ensureWhisperModel`, `getWhisperModelPath`, `MODEL_FILENAMES`, `MODEL_URLS`, `_downloadPromises` (cache de in-flight)
- `apps/desktop/src/main/voiceInput/selectWhisperModel.ts` — VRAM-based auto resolver (já existente)
- `apps/desktop/src/main/voiceInput/vramDetection.ts` — VRAM probing
- `apps/desktop/src/main/voiceInput/voiceHandler.ts` — onde transcrições rodam; ponto onde `setActiveWhisperModel` precisa influenciar
- `apps/desktop/src/main/ipc/settings.ts` — handler atual de `setWhisperModelOverride` (apenas persiste, não dispara download)
- `apps/desktop/src/main/store.ts` — `getWhisperModelOverride/setWhisperModelOverride`
- `apps/desktop/src/shared/ipc-types.ts` — `WhisperModelOption`, `IPC_CHANNELS` enum (adicionar novos canais aqui)
- `apps/desktop/src/preload.ts` (ou equivalente) — expor `window.whisper.downloadModel` e listener de progresso

### Tests
- `apps/desktop/src/main/__tests__/whisper-*.test.ts` — testes existentes do whisper (mocks de `ensureWhisperModel` precisam acomodar nova assinatura)
- `apps/desktop/src/renderer/src/settings/__tests__/SettingsForm.test.tsx` — adicionar teste de download UX (mock IPC)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Progress` primitive (Phase 48 D-11) com variantes linear/circular, determinate, success/error states, indicador de % — pronto para uso
- `ensureWhisperModel(modelName)` em `whisperResources.ts` — já tem download HTTP, follow redirects, content-length, in-flight promise dedup, tmp file rename atômico
- `_downloadPromises` Map já dedupa downloads concorrentes
- VRAM auto-resolution já existe em `selectWhisperModel.ts`
- Toast (`apps/desktop/src/renderer/src/components/Toast.tsx`) já usado em `SettingsLayout`

### Established Patterns
- IPC: handlers em `main/ipc/*.ts`, canais em `shared/ipc-types.ts` enum, expostos via `preload.ts` como `window.{namespace}.method`
- Progress emission atual em `whisperResources.ts:142-150` é por `console.log` a cada 10% — substituir por callback opcional
- Settings save é atômico via `IPC_CHANNELS.SETTINGS_SAVE` — download não interfere com save flow
- Tests usam Vitest com mocks de `electron`/`fs`/`https`

### Integration Points
- `WhisperSection.tsx` recebe `whisperModel`/`onWhisperModelChange` via `SettingsSectionProps`. Adicionar props para estado de download: `whisperDownloadState: { status, percent, downloadedBytes, totalBytes, errorMessage } | null`, `onTryAgain: () => void`
- `SettingsLayout.tsx` adiciona estado `whisperDownload` + handler que chama `window.whisper.downloadModel` no `onWhisperModelChange` + listener no mount em `whisper:download-progress`
- `whisperResources.ts:91` — `ensureWhisperModel` ganha 2º parâmetro `onProgress?` opcional. Existing call em `getWhisperInstance` (linha 181) continua funcionando sem callback (silent download como hoje, mas com console.log preservado).
- `voiceHandler.ts` — adicionar/expor função para reagir a mudança de modelo ativo (provavelmente um getter `getCurrentWhisperModel()` que lê do store + cached instance reset quando muda)

</code_context>

<specifics>
## Specific Ideas

- Reutilizar `MODEL_FILENAMES` e tamanhos aproximados (75/142/1500 MB) para mostrar `Total MB` mesmo antes do `content-length` chegar (fallback display)
- Throttle do progress emit: emitir no máximo 1× a cada 250ms ou a cada 1% — o que vier primeiro
- O resolver `WhisperModelOption → WhisperModel` deve ser **pura função** testável (input deterministic exceto `auto` que recebe `vramMb` como parâmetro)
- Quando UI aciona troca para `auto` e o resolved já está em cache: status sequence é `resolving → success` instantaneamente (skip download)
- Toast e Field.Error usam mesma mensagem-base; Toast mostra detalhes técnicos extras

</specifics>

<deferred>
## Deferred Ideas

- Cancelar download via UI (botão Cancel explícito) — fora de escopo
- Excluir modelos baixados (cleanup UI)
- Download em background no boot
- Mostrar uso de disco / espaço livre antes do download
- Suporte real a `small` (URL do modelo small) — atualmente mapeado para `base`
- Download paralelo de múltiplos modelos
- Resume de download interrompido (atualmente recomeça do zero ao retry)
- Métricas de velocidade (MB/s) e ETA
- Verificação de checksum/integridade do modelo após download

</deferred>

---

*Phase: 50-whisper-pre-download-ux*
*Context gathered: 2026-05-03 (smart discuss via /gsd:autonomous)*
