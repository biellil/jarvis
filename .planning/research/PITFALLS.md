# Integration Pitfalls: v3.0 Agentic JARVIS

**Domain:** Adding MCP, Agentic orchestration, offline TTS, vision pipeline, and proactive scheduling to existing Electron + TypeScript + LangChain.js assistant

**Researched:** 2026-05-07

**Overall confidence:** MEDIUM-HIGH (pitfalls sourced from production deployments, but v3.0 features are relatively new to market)

---

## Critical Pitfalls

### Pitfall 1: MCP Configuration Path Failures (Silent Failure)

**What goes wrong:** When exposing JARVIS as MCP server to Claude Desktop, relative paths in the Claude Desktop config file fail silently. Claude Desktop spawns the process from its own working directory (not your project root), so `./dist/mcp-server.js` never resolves. Server appears to load but has no tools available.

**Why it happens:** MCP is a process-spawning protocol. Claude Desktop doesn't cd into your project directory before launching your server — it uses its own cwd. Developers assume cwd is inherited or use relative paths from habit.

**Consequences:** 
- Claude Desktop shows "JARVIS" in MCP settings but "No tools available"
- No error logs visible in Claude Desktop UI
- Frustrating troubleshooting: user thinks code is broken, actually config is wrong
- Integration appears to fail weeks into development

**Prevention:**
- Always use absolute paths in Claude Desktop config: `/Users/alice/projects/jarvis/dist/mcp-server.js`
- Document the path-resolution gotcha in setup guide
- Add validation: MCP server startup logs absolute path it's running from
- Test manually: `node /absolute/path/to/mcp-server.js` to verify before adding to Claude Desktop config

**Detection:**
- MCP server starts but tools unavailable in Claude Desktop
- Check Claude Desktop logs: `~/Library/Logs/Claude/` (macOS) or `%APPDATA%\Claude\` (Windows)
- Add console.error() at MCP server startup with `__filename` and `process.cwd()`

**Phase recommendation:** Phase 1 (MCP server implementation) must include manual integration testing with actual Claude Desktop, not just unit tests.

---

### Pitfall 2: MCP Server Process Lifecycle Management

**What goes wrong:** Multiple instances of JARVIS MCP server spawn simultaneously when Claude Desktop restarts, or server becomes zombie process on JARVIS Electron app crash, eating memory and preventing new connections.

**Why it happens:** 
- No graceful shutdown handler in MCP server code
- Electron main process may crash but stdio transport to Claude Desktop stays open
- stdio transport doesn't have explicit keep-alive; stale processes consume resources indefinitely

**Consequences:**
- Memory leak: each MCP server instance ~50–100MB, after 10 restarts = 500MB+
- Port conflicts if switching to HTTP transport later
- Claude Desktop loses connection mid-session, requires manual restart
- User perceives JARVIS as unreliable/broken

**Prevention:**
- Implement SIGTERM/SIGINT handlers in MCP server:
  ```typescript
  process.on('SIGTERM', async () => {
    await server.close();
    process.exit(0);
  });
  ```
- Add process.on('uncaughtException') with server cleanup
- Use process manager (systemd on Linux, launchd on macOS, NSSM on Windows) to ensure only one instance
- For Electron integration: track MCP server pid, kill on app exit
- Add liveness check: periodically ping server from Electron main, restart if dead

**Detection:**
- Monitor process list: `ps aux | grep mcp-server`
- Add metrics logging to MCP server: instance count, uptime
- Heap snapshots before/after 10 Claude Desktop restarts

**Phase recommendation:** Phase 1 must include lifecycle stress test (10 fast restarts, verify no zombie processes).

---

### Pitfall 3: Kokoro TTS Latency Undermines Real-Time Voice

**What goes wrong:** Kokoro TTS introduction delays voice response. User hears 2-3 second gap between question and first audio, breaking conversational flow. User reverts to Murf.ai fallback anyway.

**Why it happens:**
- Kokoro model (~350MB) is a 82M-parameter neural network, not optimized for inference speed
- ONNX Runtime inference on CPU takes 500ms–2s for a 10-word sentence on typical laptop
- Model download on first use adds 30–60s startup latency
- No prefetching/warmup implemented

**Consequences:**
- Voice UX feels sluggish vs. cloud TTS (100-200ms latency)
- Users disable USE_KOKORO_TTS, defeating privacy goal
- Perceived as regression vs. v2.3 (Murf.ai was faster)
- Feature marked as "beta" or abandoned mid-development

**Prevention:**
- Benchmark Kokoro latency on target hardware BEFORE committing to v3.0 roadmap
  - Goal: <500ms per sentence on CPU, <200ms on GPU
  - If exceeds 1s consistently, defer Kokoro to v3.1 or use as fallback only
- Profile on minimum-spec machine (4GB RAM, Intel i5 from 2015)
- Implement model caching: download on app startup, not first use
- Warm up model on app launch: generate dummy audio once, measure latency
- Add Settings UI slider: "TTS Latency Priority" → Cloud (fast) vs. Local (private)
- Set Murf.ai as default, Kokoro as opt-in until latency proven <500ms
- Batch TTS requests if multi-sentence response: generate all at once, avoid sequential inference

**Detection:**
- Time from LLM response end to first audio sample playback
- If >1.5s consistently, investigate Kokoro vs. Murf overhead
- Add tracing: LLM finish → TTS start → audio play, log each delta

**Phase recommendation:** Phase 2 (Kokoro integration) must include latency soak test (100 voice turns, measure p95 latency). Fail phase if p95 > 800ms.

---

### Pitfall 4: Vision Pipeline Token Budget Explosion

**What goes wrong:** Vision analysis burns 5–10K tokens per request. Agent loops calling vision repeatedly (e.g., "analyze screen every 2 seconds", "check progress on all open windows"). Token budget depletes in minutes; expensive models (GPT-4V) cost USD 0.30+ per query.

**Why it happens:**
- Vision LLM calls are not rate-limited by default
- No per-user token budget or request throttling
- User thinks "quick screenshot check" is cheap; it's not
- Naive ReAct loop calls vision at every reflection step

**Consequences:**
- Cost explosion: scheduled task running every 30min = 48 calls/day × 8K tokens = 384K tokens/day
  - Claude 3 vision: ~$0.005/1K input tokens = $1.92/day = $57/month unexpected cost
- API rate limiting kicks in mid-agent, breaking agentic loop
- User discovers massive bill and disables feature entirely
- Trust in JARVIS "local-first" promise broken

**Prevention:**
- Implement hard rate limits at the LLM call layer:
  ```typescript
  const VISION_RATE_LIMIT = 1 call per 30 seconds
  const DAILY_VISION_BUDGET = 10 calls (configurable)
  ```
- Add Settings UI with vision controls:
  - "Vision Analysis Interval" slider (5s–5m, default 30s)
  - "Daily Vision Limit" counter (show usage)
  - "Use Local Vision" toggle (route to LM Studio Llava instead of Claude if available)
- In agent code: check budget before calling vision, skip if exceeded
- Log every vision call: timestamp, tokens used, cost (if cloud), response
- Warn user if approaching daily limit: toast "5 vision checks remaining today"
- For Kokoro/offline TTS: never call vision in critical path

**Detection:**
- Add vision_call_count metric to SQLite
- Alert if daily vision calls > threshold
- Monitor token logs for vision vs. normal chat ratio (should be <10%)

**Phase recommendation:** Phase 3 (vision TS) must include rate-limiting guards before any LLM integration tests. Require user opt-in for scheduled vision tasks, with warnings.

---

### Pitfall 5: LangGraph State Persistence Races in Multi-Step Tasks

**What goes wrong:** Multi-step agentic task saves state to SQLite checkpoint. User interrupts mid-task (closes Electron app). Task resumes on restart, but intermediate state is stale. Tool executed twice (e.g., file moved twice, payment processed twice).

**Why it happens:**
- LangGraph checkpointer doesn't guarantee atomicity of tool execution + state save
- Task graph has non-idempotent tools (file deletion, API calls)
- No transactional guard between "tool result received" and "checkpoint written"
- Async error handling swallows exceptions silently

**Consequences:**
- File operations corrupted: duplicates, missing state, orphaned temp files
- User loses trust in agentic tasks: "JARVIS deleted my file twice"
- Debugging nightmare: state mismatch between graph checkpoint and actual filesystem
- Workaround: user disables agentic mode, manually runs tasks

**Prevention:**
- Every tool must be idempotent or have dedupe guard:
  ```typescript
  // Bad: deleteFile("/path/to/file") can't be retried safely
  // Good: deleteFile("/path/to/file") checks if exists first, no-op if already deleted
  
  // Better: each tool returns checksum of result
  const result = await moveFile(src, dst);
  return { moved: true, checksum: hash(result) };
  // On resume, verify checksum matches what checkpoint says
  ```
- Wrap tool execution in SQLite transaction:
  ```typescript
  await db.transaction(async () => {
    const result = await tool.invoke(...);
    await checkpointer.save({...result});
  });
  ```
- Add deduplication: track tool call ID, skip if already executed for this task
- Implement compensation logic: if task fails mid-execution, have rollback steps
- Never assume user will wait: design for interruptions, add "Undo" button in Electron UI

**Detection:**
- Test: execute 5-step task, force-close Electron at step 3, restart, resume
- Check for duplicate files, double-moved items, duplicate DB records
- Add audit log: every tool call + result + checkpoint timestamp
- Monitor: if same tool called with same args twice for same task, alert

**Phase recommendation:** Phase 4 (agentic multi-step) must include interrupt-resume stress test. Require 100% idempotency or explicit rollback logic for all new tools.

---

### Pitfall 6: Proactive Scheduling Creates Notification Spam

**What goes wrong:** User enables multiple proactive tasks (daily standup, file monitor, memory rollup). Each task generates toast notification. By 9am, 5 toasts stacked up, user dismisses all unread. Important alerts buried. User disables all notifications.

**Why it happens:**
- Each proactive task fires independently, no coordination
- Toast notification is default output, too noisy for background tasks
- No user preference for batch vs. individual notifications
- No intelligent dedup: same insight (e.g., "large files detected") appears multiple times

**Consequences:**
- Notification fatigue: user ignores all JARVIS alerts
- Proactive value lost: "I never see the reminders anyway"
- Negative sentiment: "JARVIS is spammy"
- User reverts to manual task execution

**Prevention:**
- Implement notification aggregation:
  - Batch proactive task results, show summary at specific time (e.g., 9am standup, all tasks)
  - Deduplicate insights: if "new files in Downloads" triggered, don't also toast "100 files in Downloads"
- Add Settings UI for proactive notification control:
  - "Proactive Task Mode": Off / Batch (9am summary) / Real-time (per task)
  - "Which tasks to enable": checkboxes for each (standup, file monitor, memory rollup, etc.)
  - "Quiet hours": 10pm–8am no notifications
- In task code: return structured result (no auto-toast), let orchestrator decide notification
  ```typescript
  // Don't: toast('New files: ' + files.length);
  // Do: return { type: 'file-monitor', files, urgency: 'low' };
  // Orchestrator decides: queue for 9am batch or immediate toast
  ```
- Log proactive task results to SQLite proactive_tasks table, show history in UI

**Detection:**
- Track notification count/hour, alert if >5 in 1 hour
- Monitor user interaction: % of toasts dismissed without action
- Survey: "Do you read JARVIS notifications?" — if <50%, re-evaluate design

**Phase recommendation:** Phase 5 (proactive scheduling) must include Settings UI with notification control before shipping any scheduled tasks.

---

### Pitfall 7: MCP Client + External Server Process Leaks

**What goes wrong:** JARVIS as MCP client connects to external MCP servers (GitHub, Notion, filesystem). External process crashes or hangs. JARVIS agent loop blocks waiting for tool response that will never come. User experience: JARVIS freezes for 30+ seconds, times out ungracefully.

**Why it happens:**
- External MCP server process not managed by JARVIS (separate npm package, subprocess)
- No timeout on IPC calls to external server
- No heartbeat/keep-alive between JARVIS and external server
- Agent loop doesn't distinguish "slow response" from "hung process"

**Consequences:**
- Perceived hang: user thinks JARVIS crashed
- Cascading failures: if filesystem server hangs, all file operations timeout
- Resource leak: if external server crashes, subprocess.kill() not called, orphaned process
- Debugging nightmare: whose fault is it? JARVIS or external server?

**Prevention:**
- Implement strict timeouts on MCP client calls:
  ```typescript
  const timeout = 5000; // 5 seconds
  const result = await Promise.race([
    client.callTool(...),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('MCP timeout')), timeout)
    ),
  ]).catch(err => {
    console.error(`Tool ${name} timed out or failed:`, err);
    // Return graceful fallback
  });
  ```
- Add health check before calling external server:
  ```typescript
  const healthy = await checkMcpServerHealth(serverId, timeout=1000);
  if (!healthy) {
    // Log, alert user, skip this tool, try next
  }
  ```
- Manage subprocess lifecycle explicitly:
  ```typescript
  const proc = spawn('node', ['external-mcp-server.js']);
  process.on('exit', () => proc.kill()); // Cleanup on JARVIS exit
  proc.on('error', (err) => console.error('MCP process error:', err));
  ```
- Wrap external server tool calls in retry + fallback:
  ```typescript
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await mcpClient.callTool(...);
    } catch (err) {
      if (attempt === 2) return { error: 'Tool unavailable', fallback: true };
      await delay(100 * (attempt + 1));
    }
  }
  ```

**Detection:**
- Monitor MCP client call latency: p99 should be <3s; if >5s, investigate
- Log MCP server health checks every 30s, create alert if 3 consecutive failures
- Test: kill external MCP server mid-call, verify JARVIS recovers gracefully within 5s

**Phase recommendation:** Phase 2 (MCP client implementation) must include external server timeout + health check tests. Require fail-open behavior (return error to user, don't block).

---

## Moderate Pitfalls

### Pitfall 8: Electron IPC State Sync Race Conditions

**What goes wrong:** Backend-ts updates chat state (new message, memory recall). Simultaneously, Electron main sends PC tool command. States diverge. Electron shows "message sent" while backend hasn't saved it yet. Restart = message lost.

**Why it happens:**
- IPC is async fire-and-forget, no ordering guarantees across multiple messages
- Backend state and Electron state are separate, no single source of truth
- No explicit locking or version tracking

**Prevention:**
- Implement message sequencing: include version/timestamp in every IPC message
  ```typescript
  // Electron → Backend: { type: 'chat-send', messageId: uuid(), timestamp, version: currentVersion }
  // Backend → Electron: { type: 'ack', messageId, newVersion }
  ```
- Use event-sourcing pattern: backend publishes state deltas to Electron, Electron reconciles
- Add SQLite transaction guards: tool execution + state save are atomic
- Test: parallel IPC calls (chat + tool simultaneously), verify no state corruption

**Phase recommendation:** Phase 1 (setup) — review existing IPC patterns from v2.3, document any observed races. Add test suite.

---

### Pitfall 9: Offline Kokoro Model Download Blocking Startup

**What goes wrong:** First JARVIS launch with Kokoro enabled. App downloads 350MB model. UI appears frozen for 60–120 seconds. User thinks app is broken, force-quits.

**Why it happens:**
- Kokoro model download happens in main thread, blocks Electron window rendering
- No progress indicator
- Default behavior of AI libraries is synchronous download

**Prevention:**
- Defer model download to background: app launches, shows "Loading voice model..." UI, downloads in separate process
- Add progress bar: show % downloaded, ETA
- Gracefully degrade: if download takes >30s, fall back to cloud TTS (Murf.ai) while downloading
- Cache model: once downloaded, persist to disk, don't re-download
- Add "Pre-download Model" button in Settings for proactive users

**Phase recommendation:** Phase 2 (Kokoro) must implement background download with progress UI before shipping.

---

### Pitfall 10: LangGraph Node Error Handling Swallows Exceptions

**What goes wrong:** A tool in LangGraph node throws error (network timeout, bad argument). Error is logged but not surfaced to user. Agent silently skips the tool, produces hallucinated result. User receives wrong output, no idea why.

**Why it happens:**
- LangGraph try-catch in graph logic swallows exceptions by design (graceful degradation)
- No explicit error node in graph topology
- Error logs aren't shown in Electron UI

**Prevention:**
- Add explicit error handling node in graph:
  ```typescript
  const graph = StateGraph(AgentState)
    .addNode("call_tools", callToolsNode)
    .addEdge("call_tools", "handle_errors");
    .addNode("handle_errors", (state) => {
      if (state.lastToolError) {
        return { response: `Tool failed: ${state.lastToolError.message}` };
      }
    });
  ```
- Surface tool errors to user: "I tried to list your files but got a permission error"
- Log all errors with stack traces to SQLite error_log table, show in UI

**Phase recommendation:** Phase 4 (agentic) must include error node and error surfacing before shipping.

---

### Pitfall 11: Chokidar File Watcher Memory Leak

**What goes wrong:** Proactive file monitoring via chokidar watches Downloads folder. After 7 days of running, JARVIS memory usage climbs to 500MB. Electron crashes.

**Why it happens:**
- Chokidar v5 (ESM) has lingering event handlers if not properly closed
- File change events pile up in queue if processing is slow
- No explicit cleanup on watch removal

**Prevention:**
- Implement explicit watcher cleanup:
  ```typescript
  let watcher = chokidar.watch('/path', { ...options });
  process.on('exit', () => watcher.close()); // Always cleanup
  // Not: just stop using watcher, it stays alive
  ```
- Add memory monitoring: log RSS every hour, alert if >300MB
- Implement queue size limit: if file events backlog >1000, stop watching until queue drains
- Add Settings toggle: "Enable file monitoring" off by default, opt-in

**Detection:**
- Soak test: run chokidar watch for 24h, check memory growth rate
- If linear growth (>10MB/hour), investigate

**Phase recommendation:** Phase 5 (proactive) must include memory monitoring tests.

---

### Pitfall 12: Vision LLM Hallucination on Partial Screenshots

**What goes wrong:** User asks "What's on the bottom-right of my screen?" JARVIS calls vision LLM with full screenshot. LLM generates confident but wrong description (hallucination). User follows bad advice.

**Why it happens:**
- Vision models hallucinate, especially on partial/cropped images
- No validation of vision output against actual screen
- LLM treats screenshot as authoritative source

**Prevention:**
- Don't use vision for critical decisions without confirmation:
  - "I see X, should I do Y?" → "Are you sure you want Y?" (confirmation toast)
  - Don't auto-execute tool based solely on vision
- Add structured vision output via withStructuredOutput:
  ```typescript
  const schema = z.object({
    objects: z.array(z.object({ name: string, confidence: z.number() })),
    actions: z.array(z.string()),
  });
  const visionResult = await llm.withStructuredOutput(schema).invoke([imageMessage]);
  // Only recommend action if confidence >0.8
  ```
- Implement counter-confirmation: "I see a 'Delete' button. Would you like me to click it?" (user confirms)

**Phase recommendation:** Phase 3 (vision TS) must include confidence scores + user confirmation for any vision-driven actions.

---

## Minor Pitfalls

### Pitfall 13: Node-cron Job Overlaps with Long-Running Tasks

**What goes wrong:** Daily standup cron job scheduled for 9am. User runs long-running task at 8:50am (organize entire Downloads folder). Both jobs fire simultaneously at 9am. Resource contention, both slow down.

**Why it happens:**
- node-cron doesn't track job completion, just fires on schedule
- No per-task concurrency limit
- No queue between scheduled and manual tasks

**Prevention:**
- Wrap proactive tasks in p-queue with concurrency limit:
  ```typescript
  const proactiveQueue = new PQueue({ concurrency: 1 });
  cron.schedule('0 9 * * *', () => proactiveQueue.add(() => standupJob()));
  ```
- Check if similar task is running before scheduling:
  ```typescript
  if (isTaskRunning('file-organize')) {
    console.log('Skipping standup, file organization in progress');
    return; // Don't queue, just skip this run
  }
  ```

**Phase recommendation:** Phase 5 (proactive) — use p-queue from v2.3 Phase 61 to manage task concurrency.

---

### Pitfall 14: MCP Tool Argument Validation Not Type-Checked

**What goes wrong:** MCP tool schema defined as Zod, but implementation doesn't validate at runtime. Claude Desktop sends malformed args. Tool crashes with cryptic error. Claude Desktop gets 500 error, marks tool as broken.

**Why it happens:**
- MCP SDK registers tool with schema (Zod), but doesn't enforce validation before calling handler
- Developer assumes schema validation happens implicitly

**Prevention:**
- Always explicitly parse args in tool handler:
  ```typescript
  const handler = async (args: unknown) => {
    const validated = myToolSchema.parse(args); // Will throw if invalid
    // Then use validated.property
  };
  ```
- Add error boundary around tool execution:
  ```typescript
  try {
    return await handler(args);
  } catch (err) {
    if (err instanceof ZodError) {
      return { error: 'Invalid arguments', details: err.errors };
    }
    return { error: err.message };
  }
  ```

**Phase recommendation:** Phase 2 (MCP server) — add zod validation tests for all tools.

---

### Pitfall 15: Proactive Task Doesn't Respect Always-Listening State

**What goes wrong:** User in Always-Listening mode (VAD running continuously). Proactive task fires, triggers voice output. VAD detects audio, thinks it's new user input, starts listening. Feedback loop: JARVIS responds to its own voice.

**Why it happens:**
- Proactive task doesn't check voice mode before speaking
- VAD doesn't distinguish "system audio" from "user voice"

**Prevention:**
- Check voice mode before proactive output:
  ```typescript
  if (settings.voiceMode === 'always-listening') {
    // Don't speak, just show toast or save result
  } else {
    // Safe to speak
  }
  ```
- Pause VAD during system TTS:
  ```typescript
  await voiceManager.pause();
  await tts.speak(result);
  await voiceManager.resume();
  ```

**Phase recommendation:** Phase 5 (proactive) — add voice mode checks in all proactive output paths.

---

## Phase-Specific Warnings

| Phase | Topic | Likely Pitfall | Mitigation |
|-------|-------|---------------|-----------|
| **Phase 1: MCP Server** | Process lifecycle | Zombie processes, multiple instances | SIGTERM handler, process manager, liveness checks |
| **Phase 1: MCP Server** | Configuration | Relative path failures in Claude Desktop config | Use absolute paths, automated path validation |
| **Phase 2: Kokoro TTS** | Latency | Voice response feels sluggish (>1s) | Benchmark before committing, model warmup, fallback strategy |
| **Phase 2: Kokoro TTS** | Model download | UI freeze during 350MB download | Background download, progress indicator, graceful degrade |
| **Phase 2: MCP Client** | External servers | Hangs, timeouts, zombie subprocesses | Strict timeouts, health checks, subprocess lifecycle mgmt |
| **Phase 3: Vision TS** | Token budget | Vision calls cost 5–10K tokens, explodes budget | Rate limiting, Settings UI controls, daily budget counter |
| **Phase 3: Vision TS** | LLM hallucination | Confident wrong answers on vision tasks | Confidence scores, user confirmation, no auto-execute |
| **Phase 4: Agentic Tasks** | State persistence | Tool executed twice on interrupt/resume | Idempotent tools, deduplication, transactional checkpoints |
| **Phase 4: Agentic Tasks** | Error handling | Exceptions swallowed, user gets hallucinated result | Explicit error nodes, error surfacing, detailed logging |
| **Phase 5: Proactive Scheduling** | Notification spam | User ignores all alerts, disables notifications | Notification aggregation, batch mode, quiet hours |
| **Phase 5: Proactive Scheduling** | File watcher memory | chokidar leak, RSS climbs to 500MB | Explicit cleanup, memory monitoring, queue limits |
| **Phase 5: Proactive Scheduling** | Voice mode conflict | Proactive speech triggers VAD in always-listening mode | Voice mode checks, pause VAD during system audio |
| **Phase 5: Proactive Scheduling** | Job overlaps | Long-running task + scheduled cron fire simultaneously | p-queue concurrency limit, skip if already running |

---

## Verification Protocol for Phase Readiness

Before shipping each phase, verify:

- [ ] **Phase 1 (MCP Server):** Absolute path test + 10-restart lifecycle test (no zombie processes)
- [ ] **Phase 2 (Kokoro):** Latency benchmark on min-spec hardware; if p95 > 800ms, defer or make opt-in
- [ ] **Phase 2 (MCP Client):** External server timeout test (kill subprocess mid-call, verify recovery <5s)
- [ ] **Phase 3 (Vision):** Rate-limit test (verify max 10 vision calls/day enforced), hallucination confidence score test
- [ ] **Phase 4 (Agentic):** Interrupt-resume test (force-close mid-task, verify no double-execution)
- [ ] **Phase 4 (Agentic):** Error node test (tool throws, verify error surfaced to user, no hallucination)
- [ ] **Phase 5 (Proactive):** 7-day soak test (memory growth <20MB/day)
- [ ] **Phase 5 (Proactive):** Notification aggregation test (5+ tasks fire, verify batch display, not spam)

---

## Sources

- [MCP Developer Guide 2026: Build, Deploy & Secure AI Tool Integrations](https://lushbinary.com/blog/mcp-model-context-protocol-developer-guide-2026/)
- [Build an MCP Server with TypeScript: 2026 Tutorial](https://dev.to/jangwook_kim_e31e7291ad98/build-an-mcp-server-with-typescript-2026-tutorial-1ipk)
- [9 Things I wish I knew before building agentic workflows with LangGraph](https://medium.com/@isuru_r/9-things-i-wish-i-knew-before-building-agentic-workflows-with-langgraph-aa2a4f39a5dd)
- [LangGraph Multi-Agent Orchestration: Complete Framework Guide + Architecture Analysis 2025](https://latenode.com/blog/ai-frameworks-technical-infrastructure/langgraph-multi-agent-orchestration/langgraph-multi-agent-orchestration-complete-framework-guide-architecture-analysis-2025)
- [Local Text-to-Speech with Cloud Quality (2026)](https://picovoice.ai/blog/local-text-to-speech-with-cloud-quality/)
- [Text-to-Speech Latency: How to Read Vendor Claims and Minimize TTS Latency](https://picovoice.ai/blog/text-to-speech-latency/)
- [Scheduling tasks in Node.js using node-cron](https://blog.logrocket.com/task-scheduling-or-cron-jobs-in-node-using-node-cron/)
- [Cron Jobs vs Real Task Schedulers: A Love Story](https://dev.to/elvissautet/cron-jobs-vs-real-task-schedulers-a-love-story-1fka)
- [Electron IPC Response/Request architecture with TypeScript](https://blog.logrocket.com/electron-ipc-response-request-architecture-with-typescript/)
- [Syncing State between Electron Contexts](https://brunoscheufler.com/blog/2023-10-29-syncing-state-between-electron-contexts)
- [Generating structured data from an image with GPT vision and Langchain](https://medium.com/@bpothier/generating-structured-data-from-an-image-with-gpt-vision-and-langchain-34aaf3dcb215)
- [Using ChatGPT Vision API with LangChain in JavaScript](https://www.js-craft.io/blog/vision-api-langchain-javascript/)
