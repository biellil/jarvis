# Pitfalls Research

**Domain:** Local AI Personal Assistant (Voice + Multi-LLM + Memory + PC Control)
**Researched:** 2026-04-02
**Confidence:** HIGH (voice/STT pitfalls), HIGH (LangChain/LangGraph), HIGH (memory), MEDIUM (cross-platform audio)

---

## Critical Pitfalls

### Pitfall 1: Synchronous Voice Pipeline Blocking Everything

**What goes wrong:**
Building the voice pipeline with blocking synchronous calls — `microphone.read()` blocks while STT processes, STT blocks while LLM generates, LLM blocks while TTS plays. The user hears silence for 4-8 seconds, perceives the assistant as broken, and either repeats themselves (double-trigger) or gives up.

**Why it happens:**
Developers prototype with simple `whisper.transcribe(audio_file)` + `llm.invoke(text)` + `tts.say(response)` and it works in notebooks. The sequential prototype ships to "production" because adding concurrency feels premature.

**How to avoid:**
Design the pipeline as an async queue from day one: VAD fills an audio buffer → STT worker drains it → LLM worker receives transcript → TTS worker receives LLM stream token-by-token (streaming, not buffered). Use Python `asyncio` + `asyncio.Queue`. Never use `time.sleep()` in any audio path. Key: TTS must start speaking on the **first sentence**, not the full response. Use LLM streaming output and sentence-split before handing to TTS.

**Warning signs:**
- STT and LLM are called sequentially in the same function
- TTS receives the full `response` string (not a stream of chunks)
- User-perceived latency exceeds 3 seconds in testing
- Any `response = llm.invoke(prompt)` call in the audio path (blocking invoke, not stream)

**Phase to address:**
Phase 1 (Voice Core) — architecture decision must be made before writing a single audio line. Retrofitting async is a near-rewrite.

---

### Pitfall 2: Whisper Without VAD Transcribing Silence and Noise

**What goes wrong:**
Whisper without Voice Activity Detection (VAD) attempts to transcribe background noise, silence, keyboard clicks, and ambient sounds. It outputs hallucinated text ("Thank you.", "I see.", "Hmm.", etc.) that triggers the agent on phantom input. The agent responds to nothing, confusing the user and wasting LLM calls.

**Why it happens:**
Developers test Whisper in quiet environments or with clean audio files. The VAD parameter in `faster-whisper` is not enabled by default. In production (desk with fan, music, keyboard), the false transcription rate is catastrophic.

**How to avoid:**
Always use `faster-whisper` (not the original `openai-whisper`) with `vad_filter=True`. Combine with Silero VAD as a pre-filter: only pass audio segments to Whisper when VAD confirms speech was detected. Minimum 500ms of confirmed speech before Whisper invocation. Tune `vad_parameters` aggressively: `min_silence_duration_ms=500`, `speech_pad_ms=400`.

**Warning signs:**
- Using `openai-whisper` directly (not `faster-whisper`)
- No VAD step before Whisper call
- Console logs showing frequent short transcriptions ("okay", "hm", "yeah") with no user input
- Agent responding when user hasn't spoken

**Phase to address:**
Phase 1 (Voice Core) — VAD must be in the initial implementation, not added as a fix later.

---

### Pitfall 3: GPU Contention Between Whisper, LLM, and TTS

**What goes wrong:**
Whisper large-v3, local LLM (via LM Studio/Ollama), and GPU-accelerated TTS all compete for VRAM. On systems with 8-16GB VRAM, running them simultaneously causes OOM errors, severe latency spikes, or silent fallback to CPU (making everything slow). The user hears stuttering TTS while Whisper degrades.

**Why it happens:**
Each component is developed and tested in isolation. Whisper is tested alone and works fast. LLM is tested alone and works fine. TTS is added last and seems to work. Under concurrent load all three fight for GPU and none perform as benchmarked.

**How to avoid:**
Run TTS on CPU only (Piper or Kokoro are fast enough on CPU — under 200ms for typical sentence lengths). Reserve GPU exclusively for Whisper and LLM inference. If using `faster-whisper`, set `device="cuda"` only for Whisper when LLM is not actively generating (use a GPU lock/semaphore). For most personal hardware (single GPU), architect for serial GPU usage: Whisper completes → GPU released → LLM generates → GPU released.

**Warning signs:**
- VRAM usage above 80% during voice pipeline under normal operation
- TTS configured with `device="cuda"` or GPU acceleration
- Latency of LLM inference increases 3-5x when Whisper runs
- `torch.cuda.OutOfMemoryError` in logs

**Phase to address:**
Phase 1 (Voice Core) — GPU resource model must be defined before integrating all three components.

---

### Pitfall 4: LangChain Context Window Overflow Silently Degrades Quality

**What goes wrong:**
After 20-30 conversation turns, the accumulated message history exceeds the model's context window. The LLM either returns an error (if the provider enforces it), silently truncates old messages (losing critical context), or returns confused/incoherent responses. The user notices the assistant "forgot" what they discussed 10 minutes ago — but doesn't know why.

**Why it happens:**
`ConversationBufferMemory` stores every message forever. Developers test with 5-10 turns and never hit the limit. In real usage, a 1-hour session with tool call outputs (which can be hundreds of tokens each) blows the limit fast. Local models often have smaller context windows (4K-8K tokens) than cloud models (128K+).

**How to avoid:**
Never use `ConversationBufferMemory` for the agent's primary memory. Use `ConversationSummaryBufferMemory` with a `max_token_limit` set to 70% of the smallest model's context window (assume 4096 for local models). Separately, always log the full conversation to SQLite — the buffer is the LLM's working memory, not the source of truth. For tool call outputs, truncate to a 500-token summary before injecting into context. Monitor token count on every LLM call.

**Warning signs:**
- `ConversationBufferMemory` used anywhere in agent code
- No `max_token_limit` set on memory objects
- Tool outputs injected verbatim into context (not summarized)
- Agent responses degrade in quality after 15+ turns
- `InvalidRequestError: This model's maximum context length is...` appearing in logs

**Phase to address:**
Phase 2 (Agent + Memory) — context management strategy must be specified before implementing the agent loop.

---

### Pitfall 5: ChromaDB Embedding Model Mismatch Silently Corrupts Memory

**What goes wrong:**
The collection is created with embedding model A. At some point the code is updated to use embedding model B (different dimensions, e.g., 384 vs 1536). Old memories are queried with new-model embeddings — the cosine similarity scores are meaningless. The assistant retrieves irrelevant memories confidently or retrieves nothing at all. The "remembers everything" core value is silently broken.

**Why it happens:**
Changing the embedding model (e.g., from `all-MiniLM-L6-v2` to `text-embedding-3-small`) feels like an upgrade. ChromaDB does not enforce model consistency between inserts and queries — it will silently compute distances between incompatible vectors if you bypass its built-in embedding function.

**How to avoid:**
Store the embedding model name and version in ChromaDB collection metadata at creation time. On every startup, assert that the configured model matches the stored metadata. If the model changes, create a new collection and re-embed all historical memories (provide a migration script). Never bypass the ChromaDB embedding function by pre-computing embeddings externally unless a strict versioning system is in place.

**Warning signs:**
- Embedding model can be changed via config without any migration step
- No model metadata stored in collection
- Memory recall quality varies wildly (retrieves irrelevant 5-turn-old conversations for recent queries)
- `InvalidDimensionException` errors in ChromaDB logs

**Phase to address:**
Phase 2 (Memory) — enforce model metadata at collection creation. Build migration tooling before shipping persistent memory.

---

### Pitfall 6: PC Control Tools Execute Without Confirmation (Destructive Actions)

**What goes wrong:**
The agent calls `FileManager.delete("/home/user/Documents")` or `SystemControl.kill_process("chrome")` because the LLM misinterpreted intent or hallucinated a tool call. Since there is no confirmation step, the action executes immediately. Files are gone. The user loses trust permanently.

**Why it happens:**
During development, "confirmation dialogs" feel like friction that slows testing. Developers skip them to iterate faster, intending to add them "later." Later never comes. Also, LangGraph's default tool execution has no interrupt point — tools run when called.

**How to avoid:**
Implement a two-tier tool safety model from day one:
- **Tier 1 (Safe/Read-only):** `AppLauncher.open()`, `FileManager.list()`, `ScreenAnalyzer.capture()`, `SystemControl.get_volume()` — execute immediately, no confirmation.
- **Tier 2 (Destructive/Irreversible):** `FileManager.delete()`, `FileManager.move()`, `SystemControl.kill_process()`, `AppLauncher.close()` — require explicit user confirmation via voice ("Please confirm: delete Documents folder?") before execution.

Use LangGraph's `interrupt_before` node feature to pause execution before Tier 2 tools and require human-in-the-loop confirmation. Log all tool calls (both confirmed and rejected) to SQLite for audit trail.

**Warning signs:**
- Tools with destructive side effects have no confirmation step
- No tool categorization (safe vs. destructive)
- LangGraph agent has no `interrupt_before` configured
- Tests pass without ever confirming a destructive action

**Phase to address:**
Phase 3 (PC Control Tools) — safety model must be defined in the tool interface contract, not bolted on after tools are implemented.

---

### Pitfall 7: LangChain/LangGraph Version Lock-In and Breaking Changes

**What goes wrong:**
The project pins `langchain==0.1.x` because it was current at development start. Six months later, security patches (CVE-2025-68664 CVSS 9.3, CVE-2026-34070 path traversal) require upgrading to `langchain-core>=1.2.22`. The migration requires rewriting agent memory integration, tool registration, and callback handlers due to the `langchain-core` / `langchain-community` / `langchain` package split. Entire modules need rewriting.

**Why it happens:**
LangChain has had 3 major API restructurings (0.0.x → 0.1.x → 0.2.x → 0.3.x → 1.0) in 2 years. Each required migration work. Developers who don't track changelogs get blindsided. The `langchain` package is now a thin wrapper — actual code lives in `langchain-core` and provider-specific packages.

**How to avoid:**
Pin to `langchain>=1.0.0` (the first stable release with no-breaking-changes commitment until 2.0). Subscribe to the LangChain changelog. Structure code so LangChain types are imported only in the `agent/` layer — never in `memory/`, `tools/`, or `voice/` layers. This isolates migration blast radius. Keep a `requirements.in` with loose bounds and a locked `requirements.txt` generated by pip-tools.

**Warning signs:**
- `from langchain.agents import AgentExecutor` imports (old-style, pre-1.0)
- `langchain` version pinned to `<0.3`
- LangChain types leaking into domain modules (tools, memory, voice)
- No changelog subscription or dependency monitoring

**Phase to address:**
Phase 2 (Agent Core) — dependency strategy set at project initialization. Import discipline enforced in code review from phase 1.

---

### Pitfall 8: LangChain SQL Injection via LangGraph SQLite Checkpoint (CVE-2025-67644)

**What goes wrong:**
LangGraph's SQLite checkpoint implementation (used for agent state persistence) has a confirmed SQL injection vulnerability (CVE-2025-67644, CVSS 7.3). User input that reaches metadata filter keys can manipulate SQL queries against the checkpoint database, potentially exposing conversation history. For JARVIS, this means any input processed by the agent could theoretically extract past conversations.

**Why it happens:**
Using `langgraph-checkpoint-sqlite` without pinning to `>=3.0.1` (the patched version). This is a supply chain issue — not a code pattern issue.

**How to avoid:**
Pin `langgraph-checkpoint-sqlite>=3.0.1` explicitly in `requirements.txt`. Add a startup assertion that validates the installed version. Never expose the LangGraph checkpoint database file directly to any network interface. For JARVIS (local only, no network), the risk is lower but the patch should still be applied.

**Warning signs:**
- `langgraph-checkpoint-sqlite<3.0.1` in installed packages
- `pip list` not showing patched version
- No version assertion on startup

**Phase to address:**
Phase 2 (Agent Core) — dependency pinning and security audit must occur before first agent state persistence.

---

### Pitfall 9: Local LLM API Incompatibility Disguised as "OpenAI-Compatible"

**What goes wrong:**
LM Studio and Ollama advertise "OpenAI-compatible API" but diverge on: function/tool calling formats, JSON mode reliability, streaming behavior, token counting, and error codes. Code written against OpenAI's actual API (or Claude's API via LangChain) silently fails on local models — tools are not called, JSON is malformed, streaming stops mid-response.

**Why it happens:**
"OpenAI-compatible" means "accepts the same HTTP format" not "behaves identically." Local model capabilities (JSON schema adherence, tool call reliability) vary dramatically by model family and quantization level. A Llama-3.2-8B-Instruct-Q4 model does not call tools as reliably as GPT-4o.

**How to avoid:**
Build a model capability matrix into the provider abstraction layer. Define at minimum: `supports_tool_calling: bool`, `supports_json_mode: bool`, `context_window_tokens: int`, `reliable_json_schema: bool`. The agent must adapt its prompt strategy based on these flags — use constrained generation fallbacks (regex/grammar-based JSON) for models that don't reliably produce structured output. Test each new local model against a standard capability test suite before adding to the supported model list.

**Warning signs:**
- Tool calling tested only against OpenAI/Claude, not against LM Studio models
- `response.tool_calls` used without fallback for None/empty
- Structured output assumed reliable without model-specific validation
- Local model integration added but not tested in CI

**Phase to address:**
Phase 1 (Multi-LLM Abstraction) — capability matrix is part of the provider interface definition, not a later addition.

---

### Pitfall 10: Memory "Remembers Everything" Becomes Retrieval Noise at Scale

**What goes wrong:**
After weeks of use, ChromaDB contains thousands of embeddings. Similarity search starts returning stale, low-relevance memories that happen to be semantically close to the current query. The assistant confidently references outdated preferences ("you said you prefer vim" — but that was 6 months ago and user switched to VSCode). The "never forgets" value prop becomes "constantly reminds you of wrong things."

**Why it happens:**
Cosine similarity has no concept of time. A memory from 2 years ago about topic X is retrieved with the same priority as a memory from yesterday about topic X. Without temporal decay or recency weighting, old data pollutes retrieval.

**How to avoid:**
Store `timestamp` and `session_id` as metadata on every ChromaDB document. Use ChromaDB's `where` filter to weight recent memories: implement a retrieval function that queries with recency filter (last 30 days at higher `n_results`, older at lower `n_results`). For user preferences/facts, implement an "update" pattern: when a preference is updated, mark the old entry as `superseded=True` and filter it out. Use hybrid retrieval: vector similarity + recency score combined.

**Warning signs:**
- No `timestamp` metadata stored with memory embeddings
- Retrieval uses only cosine similarity with no recency filter
- User profile preferences stored as immutable embeddings (no update/supersede mechanism)
- Retrieval quality not periodically evaluated

**Phase to address:**
Phase 2 (Memory) — metadata schema must include temporal fields from the first insert. Retrofitting timestamps on existing embeddings is lossy.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| `ConversationBufferMemory` for agent | Simple to set up, no config needed | Context overflow after 20+ turns, silent quality degradation | Never — use `SummaryBufferMemory` from day one |
| Synchronous `whisper.transcribe()` in audio loop | Simpler code, faster prototyping | Blocks all input/output, 4-8s user-perceived latency | Prototype only — must be async before any real use |
| Hardcode `openai` provider in LLM calls | Fastest to get running | Impossible to switch to local LLM without rewrite | Never — provider abstraction is day-one requirement |
| Skip VAD, send all audio to Whisper | Fewer moving parts | False transcriptions from noise, agent responding to nothing | Never — VAD is mandatory for real microphone input |
| Run TTS on GPU | Marginally faster TTS | VRAM contention degrades Whisper + LLM performance | Never on single-GPU systems |
| Single ChromaDB collection for all memories | Simple schema | Cannot update embedding model without full migration | MVP only if migration script exists |
| Skip tool confirmation dialogs | Faster development iteration | Destructive actions execute on misinterpreted intent | Never for destructive tools |
| Pin `langchain<1.0` | Stable known API | CVE exposure, no path to security patches | Never after LangChain 1.0 is stable |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| LM Studio API | Assuming tool calling works identically to OpenAI | Test tool calling per-model; use grammar/regex fallback for unreliable models |
| ChromaDB + LangChain | Using LangChain's `Chroma` wrapper without specifying `embedding_function` | Always explicitly pass `embedding_function` — default changes between LangChain versions |
| faster-whisper | Using `model_size="large-v3"` on GPU with LLM simultaneously | Use `large-v3-turbo` or `medium` to leave VRAM headroom; run VAD on CPU |
| pyttsx3 (offline TTS) | Assuming it works cross-platform without driver configuration | On Linux requires `espeak` system package; test on each OS target before committing |
| LangGraph checkpoint SQLite | Using default `SqliteSaver` without version pin | Pin `langgraph-checkpoint-sqlite>=3.0.1` to avoid CVE-2025-67644 SQL injection |
| pyaudio (cross-platform audio) | Installing via `pip install pyaudio` on Windows | Windows requires precompiled wheel or MSVC build tools; use `sounddevice` as fallback |
| openWakeWord / Porcupine | Running wake word model on CPU without async | Wake word detection must be non-blocking async loop; never call synchronously |
| Anthropic Claude + LangChain | Using `langchain-anthropic` with old `from langchain.llms import Anthropic` | Use `langchain-anthropic` package with `ChatAnthropic` class; old import removed in 0.2+ |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Full history injected into every LLM call | LLM latency increases linearly with conversation length | Implement context window budget with `max_token_limit` | After 20-30 turns or any long tool output |
| ChromaDB `query()` without result count limit | Single query returns 100+ irrelevant memories | Always set `n_results=5-10` with relevance threshold filter | After ~500 stored memories |
| Blocking `tts.speak()` in main thread | User cannot interrupt speech; new voice input ignored until TTS completes | Run TTS in dedicated thread with interrupt signal | From first real use |
| Whisper `large-v3` model loaded for every request | 2-3 second model load time added to every response | Load model once at startup, keep in memory | Every request if not pre-loaded |
| LangGraph graph recompiled on every invocation | Noticeable startup latency per conversation turn | Compile graph once, reuse `app = graph.compile()` across turns | Immediately visible, slows every turn |
| Embedding computed synchronously at memory write time | Adds 100-500ms to every message save | Write to SQLite synchronously, embed asynchronously in background worker | After any real conversation |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| LangGraph SQLite checkpoint unpatched (`<3.0.1`) | SQL injection via user input exposes conversation history (CVE-2025-67644) | Pin `langgraph-checkpoint-sqlite>=3.0.1`; add startup version assertion |
| LangChain serialization injection unpatched (`<1.2.5`) | Secret extraction from env vars via prompt injection (CVE-2025-68664, CVSS 9.3) | Pin `langchain-core>=1.2.22`; never deserialize untrusted LangChain objects |
| Destructive tools without confirmation | LLM hallucination deletes/modifies files on misinterpreted command | Two-tier tool safety model; `interrupt_before` in LangGraph for destructive tools |
| API keys in plain config file | Key exposure via `ScreenAnalyzer` screenshot or file listing | Store API keys in OS keychain (`keyring` library); never in `config.json` or `.env` in project root |
| Subprocess tool executing shell commands from LLM output | Prompt injection could execute arbitrary commands | Never pass LLM output directly to `subprocess.run(shell=True)`; use explicit allowlist of commands |
| LangChain path traversal unpatched (`<1.2.22`) | Arbitrary file read via crafted prompt template (CVE-2026-34070) | Pin `langchain-core>=1.2.22` |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No barge-in / interrupt support | User must wait for full TTS to finish before giving next command; feels robotic | Implement microphone monitoring during TTS; stop playback on wake word detection |
| TTS reading entire LLM response before speaking | 3-8 second silence before user hears anything | Stream LLM output → sentence-split → TTS each sentence as it arrives |
| No visual/audio indicator that wake word was detected | User unsure if assistant heard them; repeats; double-triggers | Play a short tone or print indicator immediately on wake word detection, before STT |
| Silent tool execution (agent acts without narrating) | User doesn't know what the agent is doing; alarming for PC control actions | Narrate tool calls: "Opening Chrome..." before executing `AppLauncher.open("chrome")` |
| Memory retrieval injected silently (user unaware) | User confused when assistant references things they said weeks ago | On memory recall, briefly signal: "I remember you mentioned..." |
| Same voice pipeline for fast commands and complex queries | Simple "open Chrome" takes 5 seconds same as complex question | Implement intent classification to fast-path simple commands (skip memory retrieval) |

---

## "Looks Done But Isn't" Checklist

- [ ] **Voice pipeline:** Works in test with clean audio file — verify with real microphone in noisy environment with VAD enabled
- [ ] **Memory persistence:** Memories saved to ChromaDB — verify they survive process restart and are retrievable with correct embedding model
- [ ] **Multi-LLM abstraction:** Works with OpenAI API — verify tool calling works with LM Studio local model (Llama/Mistral)
- [ ] **PC control tools:** AppLauncher opens Chrome — verify it works on all three target OS (Linux/Windows/macOS) with platform-specific backend
- [ ] **Context window management:** Agent answers correctly in first 10 turns — verify behavior at turn 50+ with tool call history accumulated
- [ ] **Destructive tool safety:** Tools are implemented — verify confirmation gate cannot be bypassed by LLM prompt manipulation
- [ ] **Cross-platform audio:** Audio works in dev (Linux) — verify PyAudio/sounddevice installs cleanly on Windows and macOS
- [ ] **LangChain security patches:** Framework installed — verify `langchain-core>=1.2.22` and `langgraph-checkpoint-sqlite>=3.0.1` in pip freeze
- [ ] **TTS latency:** TTS plays after response generated — verify first audio byte plays within 2 seconds of transcript received (streaming path)
- [ ] **Embedding model consistency:** ChromaDB populated — verify collection metadata contains model name and startup asserts model match

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Synchronous voice pipeline blocking | HIGH | Near full rewrite of audio path; requires async architecture from scratch |
| ChromaDB embedding model mismatch | MEDIUM | Create new collection, re-embed all historical SQLite conversations, update collection metadata |
| Context window overflow strategy missing | MEDIUM | Swap memory class, implement token counter, test all conversation paths; no data loss |
| Missing VAD causing phantom transcriptions | LOW | Add `vad_filter=True` to faster-whisper call; test with ambient noise; one-day fix |
| Destructive tool without confirmation | MEDIUM | Add `interrupt_before` to LangGraph graph definition; add confirmation dialogue per tool; no data migration |
| LangChain security CVE exposure | LOW | Pin versions in `requirements.txt`, run `pip install -U langchain-core>=1.2.22`, run tests |
| GPU VRAM contention | LOW | Move TTS to CPU in TTS initialization config; one-line change + retest |
| LangChain breaking changes on upgrade | HIGH | If using pre-1.0 APIs: rewrite agent/memory integration layer; if using 1.0+: minimal migration |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Synchronous voice pipeline | Phase 1 (Voice Core) | Integration test: measure time from wake word to first audio byte — must be under 3s |
| Whisper without VAD | Phase 1 (Voice Core) | Test with ambient noise playback; verify zero phantom transcriptions in 10-minute soak test |
| GPU VRAM contention | Phase 1 (Voice Core) | Monitor `nvidia-smi` during simultaneous Whisper + LLM generation; VRAM under 80% |
| LangChain context overflow | Phase 2 (Agent + Memory) | Conversation test: 50+ turns with tool calls; verify consistent response quality throughout |
| ChromaDB embedding mismatch | Phase 2 (Memory) | Change embedding model in config; verify startup raises assertion error rather than silently corrupting |
| PC control without confirmation | Phase 3 (PC Control Tools) | Automated test: send destructive command via voice; verify confirmation prompt fires before execution |
| LangChain version / CVEs | Phase 1 (Project Init) | `pip freeze` audit; startup check asserts minimum patched versions |
| Local LLM API incompatibility | Phase 1 (Multi-LLM Abstraction) | Run capability test suite against each target local model in CI |
| Memory retrieval noise at scale | Phase 2 (Memory) | Seed 1000 memories, verify top-5 retrieval matches last-session content over 6-month-old content |
| LangGraph SQL injection CVE | Phase 2 (Agent State) | `pip show langgraph-checkpoint-sqlite` confirms `>=3.0.1` |

---

## Sources

- [LangChain and LangGraph Vulnerabilities (CVE-2025-68664, CVE-2026-34070)](https://thehackernews.com/2026/03/langchain-langgraph-flaws-expose-files.html) — HIGH confidence, patched versions documented
- [Critical LangChain Core Serialization Injection (CVE-2025-68664 CVSS 9.3)](https://thehackernews.com/2025/12/critical-langchain-core-vulnerability.html) — HIGH confidence, CVE confirmed
- [LangGraph SQL Injection in SQLite Checkpoint (CVE-2025-67644)](https://nvd.nist.gov/vuln/detail/CVE-2025-68664) — HIGH confidence, NVD confirmed
- [LangChain 1.0 Stable Release and Breaking Changes Policy](https://changelog.langchain.com/announcements/langchain-1-0-now-generally-available) — HIGH confidence, official announcement
- [LangChain Current Limitations 2025 — Community Discussion](https://community.latenode.com/t/current-limitations-of-langchain-and-langgraph-frameworks-in-2025/30994) — MEDIUM confidence, community consensus
- [Context Management for Deep Agents — LangChain Blog](https://blog.langchain.com/context-management-for-deepagents/) — HIGH confidence, official documentation
- [Voice Assistant Pipeline Latency — faster-whisper + VAD](https://community.home-assistant.io/t/even-faster-whisper-for-local-voice-low-latency-stt/864762) — MEDIUM confidence, community benchmarks
- [GPU Resource Contention in Local Voice Pipelines](https://towardsai.net/p/machine-learning/building-a-fully-local-llm-voice-assistant-a-practical-architecture-guide) — MEDIUM confidence, architecture guide
- [TTS Latency Reality vs Marketing Claims](https://picovoice.ai/blog/text-to-speech-latency/) — HIGH confidence, independent benchmark
- [ChromaDB Embedding Model Mismatch — Chroma Cookbook FAQ](https://cookbook.chromadb.dev/faq/) — HIGH confidence, official documentation
- [LangChain Agent Token Limit Handling](https://medium.com/@techie_chandan/langchain-token-limitation-handling-strategies-1056db9e11d6) — MEDIUM confidence
- [AI Agent Guardrails Enforcement vs Suggestions](https://dev.to/brianrhall/your-agents-guardrails-are-suggestions-not-enforcement-2c8k) — MEDIUM confidence
- [Concurrent Voice AI Pipeline Design](https://www.gladia.io/blog/concurrent-pipelines-for-voice-ai) — MEDIUM confidence, production deployment lessons
- [openWakeWord — VAD threshold and false positive reduction](https://github.com/dscripka/openWakeWord) — HIGH confidence, official documentation
- [LangChain Context Engineering for Agents](https://blog.langchain.com/context-engineering-for-agents/) — HIGH confidence, official blog

---
*Pitfalls research for: Local AI Personal Assistant (JARVIS)*
*Researched: 2026-04-02*
