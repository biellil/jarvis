# Feature Landscape: v3.0 Agentic JARVIS (MCP, Agentic Tasks, Offline TTS, Vision TS, Proactive)

**Domain:** Personal AI assistant — autonomous agentic upgrade  
**Researched:** 2026-05-07  
**Milestone:** v3.0 (after v2.3 LLM Providers & System Actions — shipped 2026-05-07)  
**Confidence:** MEDIUM (new protocols and patterns; verified via official specs, ecosystem surveys, and production examples)

---

## Executive Summary

JARVIS v3.0 transforms from reactive assistant (respond to user query) to autonomous agent (plan multi-step tasks, execute without supervision, monitor proactively). Six interconnected feature categories enable this transition:

1. **MCP Client** — JARVIS connects to external MCP servers (GitHub, Notion, filesystem) and executes their tools within agent loop
2. **MCP Server** — JARVIS exposes its tools (file access, PC control, memory) via MCP protocol for Claude Desktop, Cursor, etc.
3. **Agentic Tasks** — Multi-step execution loop: plan → execute → verify → iterate (ReAct pattern from LangChain.js)
4. **Offline TTS** — Kokoro.js neural TTS in Node.js (86 MB quantized model, no cloud, privacy-first)
5. **Vision TS** — Screenshot analysis migrated to TypeScript (no Python backend dependency)
6. **Proactive Behavior** — Scheduled reminders, event monitoring, daily briefings via autonomous task scheduler

The ecosystem is clear: MCP is table stakes (97M SDK downloads, 500+ servers, Linux Foundation governs), agentic workflows are proven (ReAct ubiquitous in LLM products), offline TTS is solved (Kokoro.js tested in production), and proactive scheduling is expected in all personal assistants (Rahi, Lindy, etc. all ship it).

---

## Table Stakes

Features users expect. Missing = product feels incomplete or regresses from v2.3.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **MCP client — agent calls external tools** | Standard for modern AI assistants (Claude Desktop, Cursor, VS Code extensions all use MCP); users expect JARVIS to access GitHub, Notion, filesystem tools without hardcoding | High | Requires JSON-RPC 2.0 transport (stdio/HTTP), capability negotiation, tool discovery + LangChain.js integration. 500+ public servers available. |
| **Agentic task execution without constant prompting** | v2.3 requires "JARVIS, create reminder" → human waits for response. v3.0 users expect "Set a reminder for tomorrow" → agent figures out steps autonomously | Medium | ReAct pattern proven; planning phase (break goal into steps) + execution phase (call tools) + feedback loop. LangGraph already integrated (v1.3+). |
| **Offline TTS fallback parity with v1.4** | v1.4 shipped Murf.ai cloud TTS; users expect privacy-first alternative (Kokoro offline) when no API key or network issues. Voice quality must not regress. | Medium | Kokoro.js npm package available; 86 MB quantized model; integrates with existing Electron TTS pipeline. No breaking changes to voice pipeline. |
| **Vision in TypeScript without Python backend** | v2.3 uses Python backend for screenshot analysis; migration to TS is required or user loses capability on Python removal | High | LangChain.js ChatMultiModal stable; requires sharp/jimp for image processing, base64 encoding. No new LLM models needed. |
| **Scheduled reminders / proactive notifications** | Every personal assistant 2026 has this (Rahi, Lindy, Notion, etc.); users expect "remind me at 3pm" and "send daily summary" without manual trigger | Medium-High | Requires task scheduler (cron-like or event loop), SQLite persistence, ability to wake agent from idle state. |

---

## Differentiators

Features that set JARVIS apart. Not expected, but valued by users who notice.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **MCP server — JARVIS exposes tools to Claude Desktop** | Bidirectional integration: users ask Claude "use JARVIS to open this folder"; Claude calls JARVIS back. Unique convergence of local + cloud AI. Network effects. | High | Requires server-mode MCP stack (stdio/HTTP), tool definitions as MCP resources, possible tunnel for cloud clients. Most personal assistants don't expose themselves as servers. |
| **Voice-driven agentic loops** | User speaks "create a daily standup reminder for 9am that summarizes my calendar" → agent plans, executes, persists. Zero typing friction. | Medium | Voice pipeline exists (v1.4+); glue voice input → agent planner. Differentiator: frictionless task creation compared to typing. |
| **Memory-augmented task execution** | Agent recalls prior context ("user prefers email summaries as bullet points") when executing tasks. Personalized automation without explicit instruction each time. | Medium | Integrates existing memory system (SQLite + ChromaDB v1.8+). Tool execution feeds back to memory extraction (fire-and-forget). |
| **Proactive briefings with voice delivery** | Daily summary email + calendar briefing generated autonomously at wake time, delivered via spoken TTS. User wakes to voice briefing, not silent notification. | Medium | Combines proactive scheduling + voice TTS + memory recall. No other personal assistant delivers briefings via voice. |
| **Multi-agent task decomposition** | For complex tasks (e.g., "organize GitHub issues by priority and email summaries"), JARVIS spawns specialist sub-agents (one for GitHub, one for email, one for scheduling) with parallel execution. | High | Requires agent factory, inter-agent IPC, result aggregation. LangGraph supports via subgraphs. Reduces latency vs sequential ReAct. Still emerging; advanced feature. |

---

## Anti-Features

Features to explicitly NOT build. Guardrails for responsible agentic automation.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Agent without user consent loop** | Unrestricted agentic execution (send emails, delete files, execute scripts without asking) invites data loss and trust erosion. Silent failures. | Every destructive action (delete, send, execute) requires explicit user confirmation. Non-destructive read actions (query, summarize) can auto-execute. Store confirmations in memory for pattern learning ("user always approves calendar summaries → next time auto-approve"). |
| **Unbounded tool access** | Giving agent access to 500+ MCP servers = impossible to reason about failure modes, impossible to audit, agent confusion about which tool to use. Token bloat. | Whitelist approach: user explicitly enables MCP servers they trust (GitHub, Notion, Filesystem). Start with 3-5 most common. Scale incrementally. Tool search/ranking in v3.1+. |
| **Agent hallucination into persistent storage** | Agent believes it sent email but didn't (LLM hallucinated) → no actual execution → silent failure → user doesn't know. Trust erosion. | Every tool call verified with ground truth (HTTP response codes, file system checks, DB queries return actual results). Agent sees real outcome, not LLM assertion. Must confirm success before reporting to user. |
| **Voice-only agentic UX** | Agent executes complex task (e.g., "reorganize my files") via voice with no visual feedback → user can't see progress or errors → anxiety spike ("did it work?"). | Always show agent's plan before execution starts ("I will: 1) query GitHub for PRs, 2) email summary, 3) schedule reminder"). Show steps as they execute. Toast per step. Final confirmation. |
| **Proactive notifications without quiet hours** | Daily briefing at 2am or reminder every 5 minutes = annoying and breaks trust. Users expect smart scheduling. | Respect system quiet hours (do-not-disturb), ask user for preferred briefing time in onboarding, allow granular notification settings per task type (reminders vs briefings vs alerts have different rules). |
| **Offline Kokoro with worse quality than Murf.ai** | Users expect parity or upgrade from v1.4 TTS. Switching to Kokoro and getting robotic voice = regression. Loss of trust in voice feature. | Kokoro.js quality is near-parity with Murf.ai for neural quality. Benchmark first; if quality gap detected, keep Murf.ai as default and offer Kokoro as optional privacy-first alternative. Never degrade perceived quality. |
| **Vision TS without multimodal LLM fallback** | Pure client-side image processing (OCR, edge detection) is limited. Can't answer "what's on screen?". | TypeScript vision = screenshot capture + lightweight processing (blur detection, UI density). For semantic analysis ("what is user asking about?"), send base64 to LangChain.js ChatMultiModal (same flow as v2.3). Hybrid approach. |
| **Agentic scheduler without persistence** | Device restart = all scheduled tasks vanish. Unreliable. User loses trust in proactive features. | All scheduled tasks stored in SQLite with source_id for deduplication. Job scheduler (node-schedule or Bull queue) reads from DB on startup. Failed executions logged and reported. Audit trail. |
| **MCP server without security controls** | JARVIS exposes all tools to Claude Desktop → anyone with access to local Claude can abuse JARVIS tools. Delete files, send emails. | MCP server requires explicit user approval before exposing (Settings checkbox "Allow other apps to use JARVIS tools"). Audit log for all remote tool calls. Scope controls (read-only mode for certain tools). |

---

## Feature Dependencies & Integration Points

```
Vision TS
  ← Screenshot capture (existing v1.0)
  ← LangChain.js ChatMultiModal (existing v1.3+)
  [No new dependencies for semantic LLM calls]

Offline TTS (Kokoro.js)
  ← Electron TTS pipeline (existing v1.4+)
  ← kokoro-js npm package (new)
  ← sounddevice + audio playback (existing)
  [Drop-in replacement for Murf.ai in voice handler]

MCP Client
  ← Tool definitions + tool execution (existing v2.3)
  ← JSON-RPC 2.0 transport library (new)
  ← LangChain.js tool integration (existing)
  ← LangGraph agent loop (existing v1.3+)
  [Central integration point for agentic tasks]

MCP Server
  ← MCP Client (must have client first)
  ← stdio/HTTP server stack (new)
  ← Tool export + capability negotiation (new)
  [Optional; deferred to v3.1+]

Agentic Tasks
  ← LangChain.js Agent Executor (existing)
  ← ReAct loop pattern (existing)
  ← Tool definitions (existing v2.3)
  ← MCP Client (for external tools)
  → Memory System (agent recalls context, stores outcomes)
  → Proactive Scheduler (for scheduled task execution)
  [Core orchestration layer]

Proactive Scheduling
  ← Agentic Tasks (for task execution)
  ← Job scheduler: node-schedule or Bull queue (new)
  ← SQLite persistent storage (existing + schema extension)
  ← Event system / IPC (to wake agent from idle)
  → Voice TTS (deliver briefings)
  → Memory recall (personalized briefing content)
  [Depends on agentic execution; enables autonomous behavior]

Voice-Driven Agentic UX
  ← Voice input pipeline (existing v1.4+)
  ← Agentic Tasks (planning + execution)
  → Voice TTS output (Kokoro or Murf.ai)
  [Glue between voice capture and agent loop]

Memory-Augmented Agent
  ← Existing memory system (SQLite + ChromaDB)
  ← Agent loop + tool execution
  → Fire-and-forget memory extraction (existing v1.8+)
  [Memory recalls prior context → agent personalizes task execution]

Multi-Agent Orchestration (v3.2+ — deferred)
  ← Agentic Tasks v3.0 (single agent ReAct)
  ← LangGraph subgraph support (existing)
  ← Agent factory + spawn logic (new)
  ← Inter-agent IPC / result aggregation (new)
```

---

## MVP Recommendation for v3.0

**Tier 1 (Must-have for v3.0 GA — 4-5 weeks effort):**
1. **Agentic Tasks** (ReAct loop + tool execution) — Core of v3.0 pitch. Foundation for all other features.
2. **MCP Client** (execute external tools) — Table stakes. Agent connects to GitHub, Notion, filesystem servers.
3. **Offline TTS (Kokoro.js)** — Drop-in replacement for Murf.ai. Privacy differentiator. No regression.

**Tier 2 (v3.1 GA — ship after Tier 1 stable — 3-4 weeks effort):**
4. **Vision TS** — Screenshot analysis in TypeScript. Completes migration from Python.
5. **Proactive Scheduling** — Reminders, daily briefings. Autonomous behavior.
6. **Voice-driven agentic UX** — Voice input → agent planning. Glue Tier 1 to voice pipeline.

**Tier 3 (v3.2+ — optional but valuable — deferred):**
7. **MCP Server** — Expose JARVIS tools to Claude Desktop. Bidirectional integration. Niche but powerful.
8. **Multi-agent orchestration** — Specialized sub-agents for parallel task decomposition. Advanced.

**Defer from v3.0:**
- Quiet hours / granular notification settings (table stakes but can wait for v3.1)
- Tool search/relevance ranking (manual whitelist sufficient for v3.0; rank in v3.1)
- Agent memory pruning at scale (test with <100K memory entries first)
- Security audit logging for MCP server (v3.1 if shipping server)

---

## Complexity Assessment by Feature

| Feature | Tier | Dev Effort | Integration Risk | Testing Surface | Notes |
|---------|------|-----------|------------------|-----------------|-------|
| **Agentic Tasks** | 1 | 2-3 weeks | Low (LangGraph integrated v1.3+; ReAct patterns proven) | Agent loop E2E tests, step verification, error recovery, timeout handling | Core feature; unlocks all others |
| **MCP Client** | 1 | 3-4 weeks | Medium (tool definitions, capability mismatch with servers, version changes) | 30+ MCP integration tests + real server testing (GitHub, Notion, filesystem), fallback paths | JSON-RPC transport, capability negotiation, tool registration |
| **Offline TTS (Kokoro)** | 1 | 1-2 weeks | Low (drop-in for Murf.ai in voice pipeline; npm package stable) | Quality parity testing vs Murf.ai, latency measurement, voice coverage, quantization impact | Non-blocking; voice pipeline already exists |
| **Vision TS** | 2 | 2-3 weeks | Low-Medium (screenshot pipeline exists; LangChain.js ChatMultiModal stable) | Screenshot capture, base64 encoding, LLM response parsing, edge cases (dark UI, dense buttons) | Migration from Python; no new LLM models |
| **Proactive Scheduling** | 2 | 3-4 weeks | Medium-High (job scheduler + trigger system + notification queue + device sleep handling) | Task persistence, scheduler reliability, notification timing, edge cases (device sleep, network lag, DST), restart resilience | Most complex feature; many edge cases |
| **Voice-Driven Agentic UX** | 2 | 2-3 weeks | Low (glue layer between existing voice + agentic tasks) | Voice input intent detection, agent plan visualization, real-time step feedback | Depends on Tier 1 completion |
| **MCP Server** | 3 | 4-5 weeks | High (reverse orchestration, firewall/tunnel complexity, security controls) | Server startup, tool registration, client connection negotiation, stdio/HTTP switching, security audit | Niche feature; low priority |
| **Multi-Agent Orchestration** | 3 | 4-6 weeks | High (agent coordination, result aggregation, timeout handling, failure cascades) | Agent spawning, IPC, failure recovery, parallel execution correctness, resource limits | Advanced; defer until Tier 1+2 stable |

**Total Tier 1 effort: ~6-9 weeks**  
**Total Tier 1+2 effort: ~12-15 weeks**

---

## User Stories

### Story 1: Voice-Driven Task Creation (Tier 1 priority)
```
As a user, when I say:
  "Remind me tomorrow at 3pm to review the weekly standup"
  
JARVIS agent should:
  1. Understand intent (create reminder) via LLM intent classification
  2. Extract entities (time=tomorrow 3pm, content=review weekly standup)
  3. Plan steps (break into: create event, set notification, store in memory)
  4. Show plan to user: "I will create a reminder for tomorrow at 3pm. Continue? (yes/no)"
  5. Execute steps: call reminder tool, store in SQLite, add to ChromaDB
  6. Confirm: "Reminder set for tomorrow at 3pm"
  
No additional user input needed after initial voice command.
```

### Story 2: Multi-Tool Task with MCP (Tier 1 priority)
```
As a user, when I say:
  "Create a GitHub issue for the broken login flow and send me a summary"
  
JARVIS agent should:
  1. Recognize task requires GitHub tool (via MCP client)
  2. Plan: "I will: 1) query GitHub for context, 2) create issue, 3) generate summary, 4) send email"
  3. Show plan for approval
  4. Execute step 1: use GitHub MCP tool to get related issues
  5. Execute step 2: create issue with description
  6. Extract issue URL, status → store in memory
  7. Execute step 3: generate summary via LLM (using memory for user preferences)
  8. Execute step 4: send via email tool (if available) or reply in chat
  9. Log execution in memory ("GitHub issue created on 2026-05-07, summarized")
  
Error handling: If GitHub MCP unavailable, fallback to user creating issue manually + set reminder.
Confirmation at each step; agent doesn't execute destructive actions without approval.
```

### Story 3: Proactive Briefing (Tier 2 priority)
```
As a user, I configure in Settings:
  "Daily briefing at 8am: summarize my calendar, list high-priority emails, read summary aloud"
  
JARVIS scheduler should:
  1. At 8am, wake agent from idle
  2. Agent recalls calendar + email memory
  3. Generates briefing via LLM (personalized via memory: "user prefers bullet points")
  4. Converts to speech via Kokoro offline TTS
  5. Plays voice summary via speakers (no cloud call)
  6. Shows text summary in Electron widget
  7. Logs briefing in memory ("8am briefing delivered: X calendar items, Y emails")
  8. Returns to idle
  
User doesn't need to ask; JARVIS acts proactively. User can snooze/dismiss briefing.
No network required (offline TTS + local calendar/email memory).
```

### Story 4: MCP Server Bidirectional (Tier 3 — deferred)
```
As a user, with MCP server enabled in Settings:
  User opens Claude Desktop and says:
  "Use JARVIS to open my project folder"
  
Claude agent should:
  1. Discover JARVIS as available MCP server (via discovery mechanism or manual registration)
  2. Request JARVIS to list available tools
  3. Claude selects openFolder tool
  4. Claude calls JARVIS: "openFolder('/Users/user/projects/myproject')"
  5. JARVIS Electron app opens folder in file explorer
  6. Claude receives confirmation: "Folder opened successfully"
  
Network effect: Cloud + local AI work together. User can delegate to Claude, which delegates to JARVIS.
Requires: MCP server registration, tool export, security controls (user approval).
```

---

## Ecosystem Patterns Observed (2026)

### MCP (Model Context Protocol) — Table Stakes
- **Maturity:** 97M SDK downloads (Q1 2026), 81K GitHub stars, Linux Foundation governance since Dec 2025
- **Availability:** 500+ public MCP servers (GitHub, Notion, Filesystem, Web search, API aggregators)
- **Consumer adoption:** Claude Desktop, Cursor, VS Code extensions all ship MCP client support
- **Transport:** stdio (local subprocess) or HTTP/SSE (remote). JARVIS should support both.
- **Security model:** JSON-RPC 2.0 messages; capability negotiation (client declares what it needs, server declares what it offers)
- **JARVIS differentiation:**
  - Bidirectional: also exposes tools as MCP server (not common in personal assistants)
  - Voice-driven server selection (enable/disable via voice command)
  - Offline-capable: JARVIS can work without cloud servers if needed

### Agentic Workflows — Production Patterns (2026)
- **Dominant pattern:** ReAct (interleave reasoning + action at each step: think → act → observe → repeat)
- **Alternative pattern:** Plan-Then-Execute (generate full plan once, then execute steps sequentially, replan only on failure)
- **Multi-step execution:** Tool use, loop timeout, max iterations (e.g., 10 steps max), explicit user confirmation for destructive actions
- **Failure handling:**
  - Most production systems narrow tool access aggressively (whitelist, not open)
  - Verify tool outcomes with ground truth (HTTP responses, file system state, DB queries)
  - Agent sees actual result, not LLM assertion (prevents hallucination into persistent storage)
- **Multi-agent trend (emerging in 2026):**
  - Lead agent breaks goal into sub-tasks → delegates to specialist agents (e.g., GitHub agent, email agent, scheduler agent)
  - Results aggregated → lead agent synthesizes final response
  - Still not standard in personal assistants; enterprise/multimodal systems use it
  - LangGraph supports via subgraphs
- **Latency expectations:**
  - Voice-to-response <4s expected for single-step tasks
  - Multi-step tasks may take 10-30s; user expects progress visibility (steps shown in real-time)

### Offline TTS (Kokoro.js) — Solved Problem
- **Model maturity:** 82M parameters (vs multi-billion proprietary models), Apache licensed, open weights
- **Quality parity:** Near-equivalent to Murf.ai cloud TTS for neural quality; users notice minimal gap
- **Resource footprint:** ~86 MB (quantized int8), runs on CPU, no VRAM required beyond LLM
- **Node.js support:** Kokoro.js npm package stable; WASM backend (onnxruntime.wasm)
- **Voices available:** 24+ voices across multiple languages; pt-BR community models available
- **Streaming support:** Available in v1.2.0+; sentence-by-sentence synthesis for lower perceived latency (vs waiting for full response)
- **Key differentiator:** Privacy-first (no audio leaves device), no API key required, works offline
- **Benchmarks:** Inference latency ~1-3s per sentence on CPU; GPU acceleration available but not required

### Vision Language Models (2026) — Multimodal Standard
- **SOTA models:** GLM-4.6V (native multimodal tool calling), InternVL3 (enhanced reasoning), LLaVA, Qwen-VL
- **LangChain.js landscape:** ChatMultiModal API stable; vision-language routing well-understood
- **Screenshot analysis pattern:** Asynchronous capture (sharp/jimp) → base64 encoding → LLM inference → structured JSON parsing
- **Failure modes:** Low-light screenshots, UI density (many buttons), non-English text, code blocks. LLMs handle better than 2024 but still imperfect.
- **JARVIS differentiation:**
  - Custom prompt for desktop UI context (Windows taskbar, Electron-specific elements)
  - Memory-augmented ("remember user prefers folder view over list view")
  - Lightweight client-side processing (blur detection, ROI crop) before LLM call

### Proactive AI Assistants (2026) — Becoming Standard
- **Top implementations:** Rahi (memory + proactive + cross-app), Lindy (agentic scheduling), Notion AI, Slack Assistant
- **Standard features:** Scheduled reminders, event monitoring, daily briefings, email follow-up tracking, task automation
- **Failure modes:** Over-notification, scheduling conflicts (double reminders), execution failure when device offline, task loss on restart
- **User control requirements:**
  - Respect system quiet hours (do-not-disturb)
  - Granular notification settings (reminders vs briefings have different rules)
  - Show upcoming tasks in UI (user can see what's scheduled)
  - Allow snooze/dismiss for individual notifications
- **JARVIS differentiators:**
  - Voice delivery of briefings (no other personal assistant does this)
  - Voice-driven task creation ("remind me when..." spoken command)
  - Offline-capable scheduling (no cloud dependency for reminders)

---

## Potential Pitfalls (Flag for Phase-Specific Research)

| Pitfall | Why It Happens | Severity | Mitigation Strategy | Detection Signs |
|---------|-----------------|----------|-------------------|-----------------|
| **MCP tool explosion** | User enables 50+ MCP servers → agent confused about which tool to use → token bloat in prompt → slow LLM inference | Medium | Whitelist approach (v3.0: 3-5 servers max). Tool search/relevance ranking (v3.1+). Tool grouping by domain. | Agent context >30K tokens, response latency >10s |
| **Agent loop never terminates** | ReAct without max-iterations → infinite tool calls → token exhaustion → cost spiral (cloud) or hang (local) | High | Set max iterations (e.g., 10 steps), timeout per task (5 minutes), require human approval after N iterations, explicit abort mechanism | Agent runs >5 minutes on single task, token count >100K |
| **Agentic hallucination into persistent storage** | Agent believes it sent email but LLM lied → no actual execution → user doesn't know → silent failure → trust erosion | High | Every tool call verified with ground truth (HTTP response, file stat, DB query). Agent sees actual result, not LLM assertion. Must confirm before reporting success. | User reports "I asked JARVIS to send email but friend never got it", audit log shows no email sent but memory says "sent" |
| **Kokoro quality gap with Murf.ai pt-BR** | Kokoro generic pt-BR voice lower quality than Murf.ai fine-tuned pt-BR voice → regression from v1.4 | Medium | Benchmark quality A/B testing first (MOS scores). If gap >0.5 on 5-point scale, keep Murf.ai as default, offer Kokoro as optional privacy-first. Never degrade perceived quality. | User feedback: "voice sounds robotic now", quality decline after upgrade |
| **Proactive tasks lost on device restart** | Job scheduler only in memory → restart = scheduled tasks vanish → user misses reminder | High | All tasks stored in SQLite with source_id. Scheduler reads from DB on startup. Failed execution logged. Audit trail for all scheduled tasks. | User says "I set a reminder yesterday but it didn't fire", restart happened between then and now |
| **MCP server unavailable at execution time** | User enables GitHub MCP, agent executes task, GitHub MCP disconnects mid-task → tool call fails → broken UX | Medium | Graceful degradation: try MCP, fallback to alternative tool or manual instruction if unavailable. Remember availability status per server. Suggest fallback in UI. | Agent fails with "GitHub MCP unavailable", no fallback offered to user |
| **Vision TS bottleneck: screenshot latency** | sharp library slow on large screenshots (4K monitors) → LLM vision call delayed → voice response >4s | Medium | Optimize capture (crop ROI if possible, downscale), cache screenshots if unchanged, parallelize encoding + LLM call. Measure p95 latency. | Voice response for vision queries >4s, perception of slowness |
| **Scheduling collision with system sleep** | Proactive task scheduled for 3am when device sleeping → wakelock not requested → task never fires until next boot | Medium-High | Detect system state (system sleep/wake events), reschedule missed tasks, show user "reminder was missed, execute now?". Platform-specific wakelock (macOS pmset, Windows SetThreadExecutionState). | User: "My 11pm briefing didn't deliver", device was sleeping, task in DB but never executed |
| **Memory flooding during proactive tasks** | Many scheduled briefings → memory extraction fires frequently → ChromaDB grows unbounded → queries slow | Medium | Implement memory pruning/summarization (rolling summarization v1.8 pattern), set retention policy (e.g., 30-day rolling window), archive old entries. Monitor ChromaDB collection size. | ChromaDB query latency increases over weeks, briefing generation slows |
| **Agent plan too complex for user confidence** | Agent shows 20-step plan for "send me a summary" → user loses trust ("why so many steps?") → doesn't approve | Low-Medium | Show simplified plan ("I will: 1) gather info, 2) summarize, 3) send") with expandable detail. Predict likelihood of success and show user (e.g., "Confidence: 95%"). Allow "quick execute" for trusted tasks. | User feedback: "plan was too complicated", always rejects multi-step tasks |
| **Tool execution race condition** | Agent creates reminder, scheduler simultaneously tries to execute existing reminder → duplicate reminders | Low | DB-level constraints (UNIQUE on (task_id, execution_time)), idempotency keys, scheduled task deduplication via source_id (already in design) | User sees duplicate reminders, audit log shows double execution |
| **MCP server security: tool abuse** | JARVIS exposes file deletion tool via MCP → Claude Desktop (untrusted client) calls delete → data loss | High | MCP server requires explicit user approval before exposing (Settings checkbox). Audit log for all remote tool calls. Scope controls (read-only mode for certain tools). Never expose destructive tools via server; document risk. | User: "Someone used Claude to delete my files through JARVIS" |

---

## Sources (Verified)

### MCP (Model Context Protocol)
- [Model Context Protocol Specification 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25) — Protocol design, security principles, transport options (stdio/HTTP)
- [Essa Mamdani: Complete Guide to MCP in 2026](https://www.essamamdani.com/blog/complete-guide-model-context-protocol-mcp-2026) — Ecosystem maturity (97M SDK downloads, 81K stars, Linux Foundation governance)
- [The 2026 MCP Roadmap](https://blog.modelcontextprotocol.io/posts/2026-mcp-roadmap/) — H2 2026 priorities (stateless operation, MCP Server Cards, A2A coordination)

### Agentic Workflows & LLM Reasoning
- [Vellum: Agentic Workflows in 2026](https://www.vellum.ai/blog/agentic-workflows-emerging-architectures-and-design-patterns) — ReAct vs Plan-Execute patterns, multi-agent systems, failure handling in production
- [Sitepoint: Agentic Design Patterns 2026](https://www.sitepoint.com/the-definitive-guide-to-agentic-design-patterns-in-2026/) — Tool narrowing, verification patterns, multi-agent coordination
- [LangChain.js 2026 Update](https://dzone.com/articles/top-js-ts-genai-frameworks-2026) — Agent API design, Deep Agents, LangGraph for complex workflows

### Offline TTS (Kokoro.js)
- [Kokoro.js on Hugging Face](https://huggingface.co/posts/Xenova/503648859052804) — 82M parameters, 86 MB quantized, WASM backend, streaming support v1.2.0+, voice coverage
- [Kokoro TTS GitHub](https://github.com/hexgrad/kokoro) — Model details, licensing (Apache), official weights, community implementations

### Vision Language Models
- [BentoML: Multimodal AI & Open-Source Vision Models 2026](https://www.bentoml.com/blog/multimodal-ai-a-guide-to-open-source-vision-language-models) — GLM-4.6V (multimodal tool calling), InternVL3, LLaVA capabilities, screenshot analysis patterns
- [DataCamp: Top 10 Vision Language Models 2026](https://www.datacamp.com/blog/top-vision-language-models) — SOTA benchmarks, use cases, failure modes
- [Urlbox: AI Screenshot Analysis with Structured JSON](https://urlbox.com/llm-structured-output) — Practical implementation patterns for screenshot → LLM → JSON

### Proactive AI & Scheduling
- [Lindy: Proactive AI Agents 2026](https://www.lindy.ai/blog/ai-scheduling-assistant) — Scheduling, event monitoring, briefings, quiet hours, execution reliability
- [Slack: Proactive AI Agents](https://slack.com/blog/productivity/proactive-ai-agents-definition-core-components-and-business-value) — Components of proactive behavior, user control, notification strategies
- [Morgen: Best AI Planning Assistants 2026](https://www.morgen.so/blog-posts/best-ai-planning-assistants) — Market survey, feature comparison, user expectations

---

## Next Steps for Phase Planning

This research informs v3.0 roadmap. Recommended phase structure:

| Phase Group | Feature | Est. Effort | Est. Duration | Dependencies |
|-------------|---------|-------------|---------------|--------------|
| **Tier 1 Foundation** | Agentic Tasks (ReAct) | 2-3 weeks | Weeks 1-3 | None; foundational |
| | MCP Client integration | 3-4 weeks | Weeks 4-7 | Agentic Tasks |
| | Offline TTS (Kokoro) | 1-2 weeks | Weeks 2-3 (parallel) | Voice pipeline v1.4+ |
| **Tier 2 Completion** | Vision TS migration | 2-3 weeks | Weeks 8-10 | Agentic Tasks, LangChain.js |
| | Proactive Scheduling | 3-4 weeks | Weeks 8-11 | Agentic Tasks, SQLite schema |
| | Voice-Driven Agentic UX | 2-3 weeks | Weeks 9-11 (parallel) | Voice pipeline + Agentic Tasks |
| **Tier 3 Advanced** | MCP Server | 4-5 weeks | v3.2+ | Agentic Tasks, MCP Client |
| | Multi-Agent Orchestration | 4-6 weeks | v3.2+ | LangGraph subgraphs, Agentic Tasks |

---

*Research completed 2026-05-07. Ready for phase planning and requirements specification.*
