# Phase 29: STT Core Infrastructure - Context

**Gathered:** 2026-04-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Integrar `@fugood/whisper.node` no Electron main process: GPU auto-detection (CUDA → Vulkan → Metal → CPU), normalização de áudio WebM → 16kHz PCM mono via ffmpeg-static, rollout seguro via feature flag `USE_WHISPER_CPP` (default false), e empacotamento correto dos binários .node nativos via asarUnpack.

**Phase 30 depends on this PoC being verified manually before proceeding.**

</domain>

<decisions>
## Implementation Decisions

### Packaging dos Binários Nativos (.node)

- **D-01:** Usar `asarUnpack` no electron-builder para os binários `.node` do `@fugood/whisper.node` — não `extraResources`. Native addons precisam de path de filesystem real para `require()` funcionar. Os .onnx do wakeword usam `extraResources` por serem assets externos (não native addons) — essa diferença é intencional.
- **D-02:** Criar `apps/desktop/src/main/voiceInput/whisperResources.ts` seguindo o padrão exato de `voiceInput/resources.ts` — usa `app.isPackaged` para resolver `app.asar.unpacked/` em prod vs path de dev. Mesma estrutura, mesma convenção.

### Distribuição do Modelo Whisper

- **D-03:** Modelo baixado no primeiro uso (não bundled no instalador). Salvar em `app.getPath('userData')` — mesmo diretório usado para electron-store e outros dados persistentes do app.
- **D-04:** Download bloqueia até completar antes do STT estar disponível — app aguarda, sem fallback parcial. Log visível no console durante o download. Phase 29 é PoC — UX de download mais refinada (toast com progresso) fica para quando `USE_WHISPER_CPP` virar default true.
- **D-05:** Modelo para Phase 29 PoC: `whisper base` (~142MB). Seleção automática por VRAM (STT-02) fica para Phase 30.

### Normalização de Áudio

- **D-06:** Usar `ffmpeg-static` para converter WebM/Opus (output do MediaRecorder) para 16kHz PCM mono WAV antes de passar ao whisper.cpp. Conversão executada no main process via `child_process.spawn` com ffmpeg-static.
- **D-07:** `audiobuffer-to-wav` (já em apps/desktop) é biblioteca de browser — usa `AudioBuffer` API que não existe no Node.js main process. Não reutilizável para este caso.
- **D-08:** Verificar na pesquisa se `ffmpeg-static` já está como dep em `apps/desktop`. Se não, adicionar. Se já está no monorepo root ou em outro package, avaliar se pode ser compartilhado ou precisa ser adicionado como dep explícita do desktop.

### GPU Auto-Detection

- **D-09:** Detecção GPU acontece **na inicialização do app** (quando `USE_WHISPER_CPP=true`), não lazy nem por transcrição. Resultado cacheado em memória — zero overhead por transcri-ção individual.
- **D-10:** Ordem de tentativa: CUDA (NVIDIA) → Vulkan (AMD/Intel) → Metal (Apple Silicon) → CPU (fallback universal).
- **D-11:** Falha em todos os backends acelerados → fallback silencioso para CPU + log `"Falling back to CPU"` no console. Não exibe toast no widget para fallback de GPU — é comportamento normal para máquinas sem GPU compatível.
- **D-12:** Log de sucesso na detecção: `"Using GPU backend: [cuda|vulkan|metal]"` — exigido pelo success criteria 1 da phase. Log de fallback: `"Falling back to CPU"`.

### Feature Flag

- **D-13:** `USE_WHISPER_CPP` lida do `.env` (default `false`). Quando `false`, o fluxo existente de `handleSendAudio` no `ipc/chat.ts` é preservado intacto — sem nenhuma mudança de comportamento. Flag verificada na inicialização do main process.

### Claude's Discretion

- Estrutura interna do módulo whisper (singleton vs instância por transcrição) — implementar da forma mais simples que satisfaça os success criteria.
- Timeout para o download do modelo — usar um valor razoável (ex: sem timeout explícito na Phase 29, deixar o Node.js default).
- Tratamento de erro se download falhar — log + lança erro, STT fica indisponível. Retry logic fica para Phase posterior.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase & Requirements
- `.planning/ROADMAP.md` §Phase 29 — goal, success criteria (5 itens), stack additions
- `.planning/REQUIREMENTS.md` — STT-01, STT-03, STT-04, INFRA-01, INFRA-02

### Packaging & Build
- `apps/desktop/electron-builder.yml` — configuração atual: `extraResources` para .onnx, `asarUnpack` será adicionado para .node. Ler os comentários — há decisões arquiteturais documentadas inline.
- `apps/desktop/src/main/voiceInput/resources.ts` — padrão a seguir para `whisperResources.ts`: `app.isPackaged` check, ESM __dirname polyfill, estrutura de retorno.

### IPC & Audio Pipeline
- `apps/desktop/src/main/ipc/chat.ts` — `handleSendAudio` é o handler existente que deve ser PRESERVADO quando `USE_WHISPER_CPP=false`. Ler para entender o ponto de bifurcação da feature flag.
- `apps/desktop/src/renderer/src/voice/sendAudioAndHandle.ts` — ponto de entrada no renderer side. Ler para entender o contrato atual do pipeline de áudio.

### Padrões do Projeto
- `apps/desktop/src/main/index.ts` — onde a inicialização do app acontece; local provável para a detecção GPU na startup.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `voiceInput/resources.ts`: padrão estabelecido para path resolution dev vs prod — `whisperResources.ts` deve seguir exatamente essa estrutura.
- `ffmpeg-static`: verificar localização no monorepo. Já usado no Dockerfile para compilar whisper-cli no backend Docker.
- `electron-store` (já em apps/desktop): pode ser usado para cachear o path do modelo baixado ou a seleção de backend GPU.

### Established Patterns
- **IPC handlers**: pure functions com deps injetadas (ver `handleSendText`, `handleSendAudio`) — testáveis sem mockar ipcMain. Novo handler whisper deve seguir o mesmo padrão.
- **Feature flags**: lidas de `process.env` via `loadBackendConfig` ou acesso direto. Verificar padrão em `backend-client.ts`.
- **ESM in main process**: electron-vite bundla como ESM — usar `import.meta.dirname` ou fileURLToPath polyfill para __dirname.

### Integration Points
- `apps/desktop/src/main/ipc/chat.ts`: local onde a feature flag bifurca entre o fluxo antigo (POST `/api/chat/audio`) e o novo (whisper.cpp local).
- `apps/desktop/src/main/index.ts`: onde inicializar a detecção GPU quando `USE_WHISPER_CPP=true`.

</code_context>

<specifics>
## Specific Ideas

- Phase 29 é intencionalmente um **PoC**: success criteria 5 exige "uma chamada de transcrição de teste retorna texto correto — PoC verificado manualmente". Não é necessário integrar com o fluxo PTT/wake word nesta phase — isso é Phase 30/31.
- A ordem exata das strings de log está nos success criteria: `"Using GPU backend: [backend]"` e `"Falling back to CPU"` — essas strings são verificáveis e devem ser exatas.

</specifics>

<deferred>
## Deferred Ideas

- UX de download com toast de progresso percentual — deferred para quando `USE_WHISPER_CPP` virar default true
- Seleção automática de modelo por VRAM (whisper large/base/tiny) — Phase 30 (STT-02)
- Retry logic para download de modelo — Phase posterior
- Streaming TTS / STT — fora de escopo v1.6 (ver REQUIREMENTS.md Out of Scope)

</deferred>

---

*Phase: 29-stt-core-infrastructure*
*Context gathered: 2026-04-13*
