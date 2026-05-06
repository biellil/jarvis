# Phase 56: Always-Listening Soak Test — Context

**Gathered:** 2026-05-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Atualizar o script de soak test (`apps/desktop/scripts/soak-test.ts`) para cobrir os 4 critérios de QA-01: heap growth <100MB, RSS growth <200MB, event loop p99 <50ms, e AudioContext count = 1 estável ao longo de 8h. O script atual (Phase 44) já mede heap/RSS com thresholds antigos (10MB/50MB) e roda standalone em Node.js — esta fase o refatora para polling HTTP contra o gateway e gera relatório HTML com gráfico ao final.

</domain>

<decisions>
## Implementation Decisions

### AudioContext Count (QA-01 critério 4)

- **D-01:** AudioContext count medido via IPC bridge: renderer → main process → gateway. O `audioContextSingleton.ts` já garante singleton; o bridge expõe o count atual. Gateway agrega e retorna via `GET /internal/diagnostics`.

### Event Loop Measurement (QA-01 critério 3)

- **D-02:** Event loop medido no **main process** via `perf_hooks.monitorEventLoopDelay()`. p99 calculado sobre todas as amostras das 8h. Renderer loop não é medido diretamente — medir via IPC contaminaria a própria medição.

### Report Format (QA-01 critério 5)

- **D-03:** Relatório gerado como arquivo HTML com Chart.js via CDN — `soak-report-{timestamp}.html` na raiz do projeto ou em `apps/desktop/scripts/`. Contém linha do tempo de heap, RSS e event loop p99 por amostra. Zero dependência adicionada ao build.

### Execution Environment (D-04)

- **D-04:** Script refatorado para **polling HTTP externo** — faz `GET /internal/diagnostics` a cada 30 minutos contra o gateway (porta 3000). Requer que o JARVIS esteja rodando em modo Always-Listening durante o teste. Script não mede `process.memoryUsage()` local — todas as métricas vêm do gateway.

### Gateway — Endpoint de Diagnóstico

- **D-05:** Nova rota `GET /internal/diagnostics` no Express gateway, seguindo o padrão `/internal/` já estabelecido (Phase 54/55). Resposta JSON:
  ```json
  {
    "heapUsed": 123456789,
    "rss": 234567890,
    "eventLoopP99Ms": 12.4,
    "audioContextCount": 1,
    "timestamp": "2026-05-06T10:00:00.000Z"
  }
  ```
- **D-06:** Main process coleta as métricas — `process.memoryUsage()` para heap/RSS, `perf_hooks.monitorEventLoopDelay()` para p99, IPC do renderer para audioContextCount — e as expõe ao gateway via IPC existente ou endpoint interno.

### Thresholds Atualizados (QA-01)

- **D-07:** Thresholds do script atualizado:
  - Heap delta FAIL: **100MB** (era 10MB na Phase 44)
  - RSS delta FAIL: **200MB** (era apenas WARNING na Phase 44)
  - Event loop p99 FAIL: **50ms**
  - AudioContext count FAIL: **> 1**

### Claude's Discretion

- Nome exato do IPC channel renderer→main para expor AudioContext count.
- Se o gateway puxa métricas do main via IPC a cada request ou o main faz push periódico e o gateway serve o último valor.
- Intervalo de atualização do `monitorEventLoopDelay()` (resolução em ms).
- Como calcular p99 incrementalmente ao longo de 8h (array de amostras vs histograma).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requisito da fase
- `.planning/REQUIREMENTS.md` §QA-01 — critério único desta fase, com os 4 thresholds exatos

### Roadmap e success criteria
- `.planning/ROADMAP.md` §Phase 56 — 5 success criteria concretos que definem "done"

### Script existente a refatorar
- `apps/desktop/scripts/soak-test.ts` — script Phase 44; mede heap/RSS standalone; thresholds antigos (10MB/50MB); base para refatoração

### Padrões de endpoint /internal/ a seguir
- `apps/gateway/src/routes/actions-log.ts` — padrão de rota `/internal/` (Phase 54)
- `apps/gateway/src/routes/` — diretório onde adicionar `diagnostics.ts`

### AudioContext singleton (base do IPC bridge)
- `apps/desktop/src/renderer/src/audio/audioContextSingleton.ts` — singleton que garante count=1; ponto de leitura para IPC bridge

### Padrão IPC renderer→main existente
- `apps/desktop/src/shared/ipc-types.ts` — onde registrar novo channel de diagnóstico
- `apps/desktop/src/main/` — onde adicionar handler IPC que agrega métricas

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/desktop/scripts/soak-test.ts`: estrutura de baseline + sampling loop + report + SIGINT handler — reutilizar a lógica, substituir coleta local por HTTP polling
- `apps/desktop/src/renderer/src/audio/audioContextSingleton.ts`: referência singleton existente; expor `.getCount()` ou similar para IPC
- `apps/gateway/src/routes/actions-log.ts`: template de rota `/internal/` a copiar para `diagnostics.ts`

### Established Patterns
- Endpoints `/internal/` no gateway: não proxiados externamente, só acessíveis internamente
- IPC apply-sem-restart: configurações e métricas fluem via IPC sem restart
- `perf_hooks.monitorEventLoopDelay()`: API Node.js nativa disponível no main process do Electron

### Integration Points
- Gateway `src/routes/` → nova rota `diagnostics.ts` registrada em `src/index.ts`
- Electron main → novo IPC handler que coleta heap/RSS/eventLoop/audioContextCount
- Renderer → novo IPC emitter que reporta audioContextCount ao main on-demand

</code_context>

<specifics>
## Specific Ideas

- HTML report com Chart.js CDN: linha do tempo com 3 séries (heap MB, RSS MB, event loop p99 ms) + linha horizontal nos thresholds de FAIL — visualmente claro onde o teste passa ou falha
- Script deve aceitar `--duration` flag para testes rápidos (ex: `--duration 60000` para 1 minuto de validação local antes de rodar 8h)

</specifics>

<deferred>
## Deferred Ideas

Nenhum — discussão ficou dentro do escopo da fase.

</deferred>

---

*Phase: 56-always-listening-soak-test*
*Context gathered: 2026-05-06*
