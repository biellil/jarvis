# Phase 56: Always-Listening Soak Test — Research

**Researched:** 2026-05-06
**Domain:** Memory leak validation, performance monitoring, diagnostic reporting
**Confidence:** HIGH

## Summary

Phase 56 refactors the Phase 44 soak test script (`apps/desktop/scripts/soak-test.ts`) to validate QA-01 requirements: 8-hour continuous Always-Listening execution with heap growth <100MB, RSS growth <200MB, event loop p99 <50ms, and stable AudioContext count = 1. The refactoring shifts from local process.memoryUsage() polling to HTTP-based metrics collection from the gateway (via new GET /internal/diagnostics endpoint), incorporates Node.js perf_hooks.monitorEventLoopDelay() for event loop measurement, and generates an HTML report with Chart.js visualization.

**Primary recommendation:** Refactor soak-test.ts to poll HTTP endpoint instead of local Node.js metrics; add /internal/diagnostics route to backend; integrate perf_hooks event loop monitoring in main process; generate static HTML report with Chart.js (CDN-hosted).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** AudioContext count medido via IPC bridge: renderer → main process → gateway
- **D-02:** Event loop medido no main process via `perf_hooks.monitorEventLoopDelay()` — p99 calculado sobre todas as amostras das 8h
- **D-03:** Relatório gerado como arquivo HTML com Chart.js via CDN — `soak-report-{timestamp}.html`
- **D-04:** Script refatorado para polling HTTP externo contra gateway (porta 3000)
- **D-05:** Nova rota `GET /internal/diagnostics` no Express backend retorna JSON com heapUsed, rss, eventLoopP99Ms, audioContextCount, timestamp
- **D-06:** Main process coleta métricas e as expõe ao gateway via IPC ou endpoint interno
- **D-07:** Thresholds atualizados: heap delta FAIL=100MB, RSS delta FAIL=200MB, event loop p99 FAIL=50ms, AudioContext count FAIL=>1

### Claude's Discretion
- Nome exato do IPC channel renderer→main para expor AudioContext count
- Se o gateway puxa métricas do main via IPC a cada request ou o main faz push periódico
- Intervalo de atualização do `monitorEventLoopDelay()` (resolução em ms)
- Como calcular p99 incrementalmente ao longo de 8h (array de amostras vs histograma)
- `--duration` flag para testes rápidos (ex: `--duration 60000` para 1 minuto de validação local)

### Deferred Ideas (OUT OF SCOPE)
Nenhuma — discussão ficou dentro do escopo da fase.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| QA-01 | Script de soak test 8h valida que Always-Listening não tem memory leak: heap growth <100MB, RSS growth <200MB, event loop p99 <50ms, AudioContext count = 1 estável | HTTP polling architecture, perf_hooks integration, event loop p99 calculation, AudioContext count via IPC |
</phase_requirements>

## Standard Stack

### Core Technologies
| Technology | Version | Purpose | Why Standard |
|------------|---------|---------|--------------|
| Node.js perf_hooks | native (17.0+) | Event loop latency monitoring | Built-in, no dependencies; monitorEventLoopDelay() available in all Electron versions; p99 percentile supports 8h sampling |
| Chart.js | 4.x (CDN) | HTML report visualization | Lightweight, CDN-hosted (no build dependency); renders line charts with threshold markers; static HTML output |
| Express.js | 4.x | Backend /internal/ route | Already in backend-ts; /internal prefix follows Phase 54/55 pattern (not proxied by gateway) |
| Electron IPC | native | AudioContext count bridge | Existing singleton pattern via audioContextSingleton.ts; renderer→main→gateway flow established |

### Supporting Libraries (Existing Stack)
| Library | Version | Purpose | Already Used |
|---------|---------|---------|--------------|
| Node.js process | native | Memory metrics via process.memoryUsage() | Standard for heap/RSS measurement |
| http/https | native | HTTP client for polling | Core Node.js, used by openai SDK |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| perf_hooks.monitorEventLoopDelay() | manual event loop instrumentation | Would require patching all async operations; perf_hooks is standard and non-invasive |
| HTTP polling to /internal/diagnostics | Direct process memory query via IPC | HTTP polling decouples soak test from Electron runtime; cleaner for external script |
| Chart.js CDN | D3.js / Plotly.js | Chart.js is minimal, lightweight; others add 200KB+; CDN avoids build dependency |
| Static HTML report | JSON report only | HTML with interactive chart provides instant visual feedback; JSON alone requires separate tooling |

## Architecture Patterns

### Recommended Project Structure
```
apps/desktop/scripts/
├── soak-test.ts          # Refactored: HTTP polling + baseline/sampling + HTML report generation
└── soak-report-{ts}.html # Generated: static HTML with Chart.js visualization

apps/backend-ts/src/routes/
├── diagnostics.ts        # NEW: GET /internal/diagnostics endpoint
└── actions-log.ts        # Existing /internal/ pattern reference

apps/desktop/src/main/
├── index.ts              # Main process — initialize perf_hooks monitoring
├── ipc/
│   └── index.ts          # Register AudioContext count handler
└── diagnostics/
    └── collector.ts      # NEW: Collect heap/RSS/eventLoop/audioContextCount metrics
```

### Pattern 1: HTTP-Driven Soak Test (External Script)

**What:** Soak test script polls gateway GET /internal/diagnostics every 30 minutes for 8 hours. No direct process.memoryUsage() calls — all metrics come from HTTP endpoint.

**When to use:** For external validation scripts that must not depend on internal process state.

**Example:**
```typescript
// Source: Phase 56, D-04 decision
interface DiagnosticsResponse {
  heapUsed: number;        // bytes (process.memoryUsage().heapUsed)
  rss: number;             // bytes (process.memoryUsage().rss)
  eventLoopP99Ms: number;  // milliseconds (perf_hooks p99)
  audioContextCount: number; // count (IPC from renderer)
  timestamp: string;       // ISO timestamp
}

// Soak test polling loop
const baseline = await fetch('http://localhost:3000/internal/diagnostics').then(r => r.json());
// ... 30-min sample loop ...
const final = await fetch('http://localhost:3000/internal/diagnostics').then(r => r.json());

// Calculate deltas against baseline
const heapDeltaMb = (final.heapUsed - baseline.heapUsed) / 1024 / 1024;
const rssDeltaMb = (final.rss - baseline.rss) / 1024 / 1024;
const eventLoopP99Ms = final.eventLoopP99Ms;

// Pass/fail against QA-01 thresholds
const passes = (
  heapDeltaMb < 100 &&
  rssDeltaMb < 200 &&
  eventLoopP99Ms < 50 &&
  final.audioContextCount === 1
);
```

### Pattern 2: Main Process Metrics Collection via perf_hooks

**What:** Electron main process initializes perf_hooks.monitorEventLoopDelay() at startup, accumulates samples throughout execution, and exposes p99 percentile via IPC or internal HTTP endpoint.

**When to use:** For measuring Node.js event loop responsiveness in long-running processes without overhead.

**Example:**
```typescript
// Source: Node.js perf_hooks documentation + Phase 56, D-02
import { monitorEventLoopDelay } from 'perf_hooks';

// At main process startup
const histogram = monitorEventLoopDelay({ resolution: 10 }); // 10ms resolution
histogram.enable();

// Collect samples for entire soak duration
// histogram.percentile(99) = p99 milliseconds

// At shutdown or on request
const p99Ms = histogram.percentile(99);
histogram.disable();
```

### Pattern 3: AudioContext Count via Existing Singleton + IPC

**What:** audioContextSingleton.ts already enforces single AudioContext (Phase 53 mandate). Main process reads count via IPC from renderer and includes in diagnostics response.

**When to use:** For validating that singleton pattern is maintained throughout soak test.

**Example:**
```typescript
// Renderer (audioContextSingleton.ts — existing)
export function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

// NEW IPC channel in ipc-types.ts
GET_AUDIO_CONTEXT_COUNT: 'diagnostics:get-audio-context-count'

// Renderer IPC handler (in actions.ts or new diagnostics.ts)
ipcMain.handle('diagnostics:get-audio-context-count', async () => {
  // Invoke renderer to count active AudioContexts
  const count = await mainWindow.webContents.invoke('get-audio-context-count');
  return count; // should always be 1 in soak test
});
```

### Pattern 4: Static HTML Report with Chart.js (CDN)

**What:** Soak test generates `soak-report-{timestamp}.html` with embedded Chart.js CDN link. Report contains line charts for heap, RSS, event loop p99 with threshold markers.

**When to use:** For instant visual inspection of test results without external dependencies.

**Example:**
```html
<!-- Source: Phase 56, D-03 decision -->
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.min.js"></script>

<div style="width: 900px; height: 400px;">
  <canvas id="memoryChart"></canvas>
</div>

<script>
  const ctx = document.getElementById('memoryChart').getContext('2d');
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['t+0h', 't+2h', 't+4h', 't+6h', 't+8h'],
      datasets: [
        {
          label: 'Heap (MB)',
          data: [125.4, 126.1, 127.3, 128.5, 129.1],
          borderColor: 'rgb(75, 192, 192)',
          borderWidth: 2
        },
        {
          label: 'FAIL threshold (100MB delta)',
          data: [125.4+100, 125.4+100, 125.4+100, 125.4+100, 125.4+100],
          borderColor: 'red',
          borderDash: [5, 5],
          pointRadius: 0
        }
      ]
    }
  });
</script>
```

### Anti-Patterns to Avoid

- **Measuring from soak script process instead of target:** Adds observer effect; use HTTP polling instead
- **Accumulating ALL samples in memory for 8h:** Array of 480 samples (30-min interval) is fine; but avoid storing 1000s of high-frequency samples
- **Hardcoding gateway URL (localhost:3000):** Use environment variable or config file
- **Blocking the main process event loop to calculate p99:** perf_hooks is non-blocking; just read histogram.percentile() when needed
- **Creating new AudioContext during soak test for measurement:** Defeats singleton mandate; read count via IPC instead

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Event loop latency measurement | Custom setTimeout-based calculation | Node.js perf_hooks.monitorEventLoopDelay() | Perf_hooks is non-blocking, accurate to nanosecond resolution; custom solutions miss edge cases and add overhead |
| Percentile calculation over 480 samples | Sorting every request | histogram.percentile() method | Histogram maintains O(1) percentile queries; sorting is O(n log n) |
| HTML report generation with charts | Canvas manipulation in Node.js | Chart.js CDN + static HTML template | Chart.js library handles cross-browser rendering; CDN avoids build dependency |
| IPC bridge for AudioContext count | New singleton pattern | Existing audioContextSingleton.ts + simple IPC handler | Singleton already exists; reuse instead of rolling new pattern |
| HTTP endpoint for metrics | Custom socket or file polling | Express GET /internal/diagnostics route | Express already in use; /internal prefix follows established pattern |

**Key insight:** Soak test is a validation script, not production code. Prefer off-the-shelf tools (perf_hooks, Chart.js CDN, Express) over custom solutions that would require separate testing and maintenance.

## Common Pitfalls

### Pitfall 1: Observer Effect — Soak Test Process Consumes Memory
**What goes wrong:** Soak test process itself accumulates memory as it polls and logs for 8 hours, confusing the measurement of JARVIS Always-Listening memory usage.

**Why it happens:** Storing all samples in an array, logging to file without rotation, or keeping HTTP connections open all cause observer overhead.

**How to avoid:** 
- Keep sample array small (480 samples for 30-min interval = ~24 KB)
- Use streaming/append for file logging, not in-memory buffer
- Reuse HTTP connections (keep-alive) or use a fresh connection per request
- Run soak test script in a separate lightweight process (not in renderer)

**Warning signs:** Soak test's own memory grows during test; discrepancy between reported metrics and actual JARVIS process growth.

### Pitfall 2: Event Loop Measurement Overhead
**What goes wrong:** Calling perf_hooks or custom latency checks too frequently can inflate the very latency being measured.

**Why it happens:** If histogram.percentile() or manual setTimeout checks run on every I/O, they block the event loop.

**How to avoid:** 
- perf_hooks.monitorEventLoopDelay() runs in background thread — no blocking
- Read histogram.percentile() only when responding to HTTP requests (not in tight loops)
- Don't mix event loop measurement with other heavy operations

**Warning signs:** Event loop p99 gradually increases during test; CPU usage higher than expected.

### Pitfall 3: AudioContext Singleton Lifecycle Misunderstanding
**What goes wrong:** Report shows audioContextCount = 2 or higher, but it's actually the same context being recreated after pause/resume or error recovery.

**Why it happens:** AudioContext.state transitions (running → paused → running) might be counted as separate contexts, or error handlers recreate context without cleanup.

**How to avoid:** 
- Read count via IPC only after checking audioContextSingleton.getAudioContext() — it enforces singleton
- If count > 1, immediately check logs for "new AudioContext()" calls outside singleton
- Test singleton in isolation before 8h soak (unit test in Phase 53 already covers this)

**Warning signs:** AudioContext count spikes but then returns to 1; logs show multiple initialization messages.

### Pitfall 4: Threshold Values Confusion with Phase 44 Baselines
**What goes wrong:** Script uses old Phase 44 thresholds (heap 10MB, RSS 50MB) instead of QA-01 thresholds (100MB, 200MB).

**Why it happens:** Copy-pasting Phase 44 soak-test.ts without updating constants (HEAP_DELTA_FAIL_THRESHOLD_MB, RSS_DELTA_WARN_THRESHOLD_MB).

**How to avoid:** 
- Replace Phase 44 constants with QA-01 values during refactor
- Add validation check at startup: `if (HEAP_DELTA_FAIL_THRESHOLD_MB !== 100) { throw new Error(...) }`
- Document in comments where thresholds come from (QA-01 requirement)

**Warning signs:** Test reports FAIL but metrics are well within new thresholds; review constants first.

### Pitfall 5: HTTP Connection Timeout During 8h Test
**What goes wrong:** Single HTTP fetch() call times out, soak test crashes, or metrics gap for an entire sample window.

**Why it happens:** Gateway processes hanging, network flake, or 30-min silence on connection (idle timeout).

**How to avoid:** 
- Wrap fetch() in try-catch, log errors but continue
- Use explicit timeout: `fetch(url, { signal: AbortSignal.timeout(10_000) })`
- Implement retry logic: 3 attempts with exponential backoff on 5xx errors
- Monitor gateway health separately (include health check in script output)

**Warning signs:** Gaps in chart data; "Failed to fetch" errors in logs at regular intervals.

### Pitfall 6: p99 Percentile Calculation Edge Cases
**What goes wrong:** Percentile reported as 0ms or NaN, or p99 calculation fails when histogram is empty.

**Why it happens:** perf_hooks histogram not enabled, histogram disabled before reading, or histogram accessed after histogram.disable().

**How to avoid:** 
- Call histogram.enable() immediately after monitorEventLoopDelay()
- Only disable at shutdown, not during test
- Check histogram.exceeds (count of samples) before reading percentile
- Handle error: `const p99 = histogram.percentile(99) || 0; // fallback to 0 if disabled`

**Warning signs:** p99 value is missing from response; NaN in chart; "histogram is not enabled" errors in logs.

## Code Examples

Verified patterns from existing codebase:

### /internal/ Route Pattern (Phase 54/55 Reference)
```typescript
// Source: apps/backend-ts/src/routes/actions-log.ts (Phase 54)
import { Router } from 'express';
import { z } from 'zod';

export const diagnosticsRouter = Router();

// Define schema for validation
const DiagnosticsResponseSchema = z.object({
  heapUsed: z.number().int().positive(),
  rss: z.number().int().positive(),
  eventLoopP99Ms: z.number().nonnegative(),
  audioContextCount: z.number().int().nonnegative(),
  timestamp: z.string().datetime(),
});

// Route handler
diagnosticsRouter.get('/diagnostics', (req, res) => {
  // Collect metrics from main process via IPC or shared state
  const metrics = {
    heapUsed: process.memoryUsage().heapUsed,
    rss: process.memoryUsage().rss,
    eventLoopP99Ms: getEventLoopP99(), // NEW: from perf_hooks
    audioContextCount: getAudioContextCount(), // NEW: via IPC
    timestamp: new Date().toISOString(),
  };

  const parsed = DiagnosticsResponseSchema.safeParse(metrics);
  if (!parsed.success) {
    res.status(500).json({ error: 'Invalid metrics', issues: parsed.error.issues });
    return;
  }

  res.json(parsed.data);
});
```

### perf_hooks Event Loop Monitoring (Node.js Pattern)
```typescript
// Source: Node.js perf_hooks documentation
import { monitorEventLoopDelay } from 'perf_hooks';

let eventLoopHistogram: ReturnType<typeof monitorEventLoopDelay> | null = null;

export function initEventLoopMonitoring(): void {
  eventLoopHistogram = monitorEventLoopDelay({ resolution: 10 });
  eventLoopHistogram.enable();
}

export function getEventLoopP99(): number {
  if (!eventLoopHistogram) {
    return 0; // Not initialized
  }
  return eventLoopHistogram.percentile(99);
}

export function disableEventLoopMonitoring(): void {
  if (eventLoopHistogram) {
    eventLoopHistogram.disable();
  }
}
```

### Soak Test HTTP Polling Pattern
```typescript
// Source: Phase 56 refactored soak-test.ts (Draft)
import fetch from 'node-fetch'; // or use native fetch in Node 18+

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3000';
const SOAK_DURATION_MS = 8 * 60 * 60 * 1000;
const SAMPLE_INTERVAL_MS = 30 * 60 * 1000;

interface Sample {
  time: number;
  heapUsed: number;
  rss: number;
  eventLoopP99Ms: number;
  audioContextCount: number;
}

const samples: Sample[] = [];
let baseline: Sample | null = null;

async function fetchMetrics(): Promise<Sample | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch(`${GATEWAY_URL}/internal/diagnostics`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      console.error(`[soak-test] Metrics fetch failed: ${response.status}`);
      return null;
    }

    const data = await response.json();
    return {
      time: Date.now(),
      heapUsed: data.heapUsed,
      rss: data.rss,
      eventLoopP99Ms: data.eventLoopP99Ms,
      audioContextCount: data.audioContextCount,
    };
  } catch (err) {
    console.error(`[soak-test] Fetch error: ${(err as Error).message}`);
    return null;
  }
}

async function runSoak(): Promise<void> {
  console.log('Starting 8h soak test — HTTP polling every 30 minutes...');

  // Warm-up
  await new Promise(resolve => setTimeout(resolve, 30_000));

  baseline = await fetchMetrics();
  if (!baseline) {
    console.error('Failed to establish baseline');
    process.exit(1);
  }

  const intervalId = setInterval(async () => {
    const sample = await fetchMetrics();
    if (sample) {
      samples.push(sample);
      console.log(`[t+${((sample.time - baseline!.time) / 1000 / 60).toFixed(1)}m] heap=${(sample.heapUsed / 1024 / 1024).toFixed(1)}MB rss=${(sample.rss / 1024 / 1024).toFixed(1)}MB p99=${sample.eventLoopP99Ms.toFixed(1)}ms ctx=${sample.audioContextCount}`);
    }
  }, SAMPLE_INTERVAL_MS);

  setTimeout(() => {
    clearInterval(intervalId);
    generateReport(baseline!, samples);
    process.exit(0);
  }, SOAK_DURATION_MS);
}

runSoak().catch(err => {
  console.error('Soak test failed:', err);
  process.exit(1);
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Phase 44: Local process.memoryUsage() polling in Node.js script | Phase 56: HTTP-driven metrics from gateway endpoint | v2.2 QA requirement | Decouples test from Electron internals; enables remote monitoring |
| Phase 44: Heap only (heapUsed measurement) | Phase 56: Quad-metric validation (heap + RSS + event loop + AudioContext) | QA-01 requirement | More comprehensive leak detection; catches native leaks and event loop stalls |
| Phase 44: Thresholds 10MB/50MB | Phase 56: Thresholds 100MB/200MB + 50ms event loop + 1 AudioContext | QA-01 requirement | Realistic thresholds for 8h soak; event loop < 50ms ensures responsiveness |
| Phase 44: Console output only | Phase 56: HTML report with Chart.js visualization | D-03 decision | Instant visual inspection; threshold markers on chart; shareable artifact |

**Deprecated/outdated:**
- Phase 44 soak-test.ts constants (HEAP_DELTA_FAIL_THRESHOLD_MB = 10, RSS_DELTA_WARN_THRESHOLD_MB = 50) — superseded by QA-01 values

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js perf_hooks | Event loop p99 measurement | ✓ | native (v17.0+) | Disable event loop measurement, report p99=0 |
| Chart.js CDN | HTML report generation | ✓ | 4.x (CDN-hosted) | Use plain <table> or text output if CDN unavailable |
| HTTP client (fetch/node-fetch) | Metrics polling | ✓ | native (Node 18+) | Use require('http') for older Node |
| Gateway (http://localhost:3000) | /internal/diagnostics polling | ? | TBD (Phase 56 implementation) | Fallback to local process.memoryUsage() |

**Missing dependencies with no fallback:**
- Electron main process with perf_hooks enabled — soak test won't start if gateway unavailable

**Missing dependencies with fallback:**
- Chart.js CDN — report can be text-only if CDN inaccessible

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Manual soak test (no unit tests required) |
| Config file | apps/desktop/scripts/soak-test.ts — constants for SOAK_DURATION_MS, SAMPLE_INTERVAL_MS, thresholds |
| Quick run command | `node soak-test.ts --duration 60000` (1-minute quick test before 8h run) |
| Full suite command | `node soak-test.ts` (8-hour full soak test) |

### Phase Requirements → Validation Map
| Req ID | Behavior | Validation Method | Notes |
|--------|----------|-------------------|-------|
| QA-01 | Heap growth <100MB after 8h | HTTP fetch /internal/diagnostics every 30min; compare baseline to final | Requires gateway running; soak test monitors endpoint availability |
| QA-01 | RSS growth <200MB after 8h | Same endpoint; RSS delta threshold in HTML report | Native memory leaks show here first |
| QA-01 | Event loop p99 <50ms entire 8h | Same endpoint; p99 calculated in main process via perf_hooks | Indicates responsiveness; >50ms = blocked event loop |
| QA-01 | AudioContext count = 1 stable | Same endpoint; count > 1 = FAIL immediately | Singleton mandate from Phase 53; IPC reports count |

### Sampling Strategy
- **Per-request:** Fetch metrics every 30 minutes (16 samples over 8h)
- **Per-phase:** N/A — single long-running test, not multi-phase
- **Phase gate:** Full 8-hour test required; no early exit

### Wave 0 Gaps
- [ ] `apps/backend-ts/src/routes/diagnostics.ts` — NEW /internal/diagnostics endpoint (includes perf_hooks collection + AudioContext count IPC call)
- [ ] `apps/desktop/src/main/diagnostics/collector.ts` — NEW module to initialize perf_hooks and handle AudioContext count IPC
- [ ] Update `apps/backend-ts/src/app.ts` to mount diagnosticsRouter at /internal prefix
- [ ] Update `apps/desktop/src/main/ipc/index.ts` to register AudioContext count handler
- [ ] Update `apps/desktop/scripts/soak-test.ts` — refactor to HTTP polling + HTML report generation
- [ ] Update `apps/desktop/src/shared/ipc-types.ts` — add `DIAGNOSTICS_GET_AUDIO_CONTEXT_COUNT` channel if new IPC is needed

*(If new IPC channel needed: add to ipc-types.ts; if reusing existing pattern from Phase 54/55, minimal changes required.)*

## Sources

### Primary (HIGH confidence)
- **Node.js perf_hooks documentation** — monitorEventLoopDelay() available in all Electron versions (17.0+); percentile() method documented
- **Existing codebase pattern** (apps/backend-ts/src/routes/actions-log.ts) — /internal/ route structure and error handling
- **audioContextSingleton.ts** (Phase 53) — singleton pattern already enforced in codebase
- **CONTEXT.md Phase 56** — all 7 design decisions locked and verified

### Secondary (MEDIUM confidence)
- **Chart.js documentation** — CDN-hosted v4.x confirmed available via jsdelivr.net; no build dependency required
- **Phase 44 soak-test.ts** — existing script structure, baseline/sampling loop patterns reusable

### Tertiary (LOW confidence)
- None — all critical sources verified with existing codebase or official Node.js docs

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — perf_hooks and Chart.js are stable, well-documented technologies; /internal/ route pattern established in Phase 54/55
- Architecture: **HIGH** — HTTP polling and IPC bridge patterns already exist in codebase; minimal new patterns required
- Pitfalls: **HIGH** — Phase 44 soak test identified common pitfalls; Phase 53 AudioContext singleton addresses main leak risk

**Research date:** 2026-05-06
**Valid until:** 2026-05-13 (7 days — Node.js/Chart.js are stable; soak test is Phase 44 refactor, not new tech)

**Critical decisions requiring verification during planning:**
1. IPC channel name for AudioContext count — confirm if new channel needed or if existing mechanism can be reused
2. perf_hooks histogram.percentile(99) accuracy — verify p99 calculation is valid for 8h cumulative samples (vs. sliding window)
3. Gateway port 3000 hardcoded in soak test vs. environment variable — confirm before implementation
