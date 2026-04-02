# Feature Research

**Domain:** Local AI Personal Assistant (voice + text, PC control, long-term memory, multi-LLM)
**Researched:** 2026-04-02
**Confidence:** MEDIUM-HIGH (core feature categorization HIGH; UX edge cases MEDIUM)

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete or broken.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Natural language conversation | Core loop — the assistant must understand intent, not just keywords | LOW | LLM handles this; complexity is in reliable tool routing |
| Voice input (STT) | "Personal assistant" implies voice; text-only feels like a CLI wrapper | MEDIUM | Whisper offline is the standard; faster-whisper reduces latency further |
| Text-to-speech response (TTS) | Voice in, voice out — without TTS, voice mode is half-broken | MEDIUM | pyttsx3 is simple but robotic; Kokoro-82M is best speed/quality local balance (2026) |
| Persistent conversation history | Users expect the assistant to "remember" yesterday's conversation | MEDIUM | SQLite for structured storage; every session must be auto-saved |
| Graceful fallback when STT fails | Deaf assistant = frustrating; must handle noise, silence, mic errors | LOW | Timeout + retry + text fallback |
| Configurable LLM backend | Users want to swap models without code changes | LOW | Already in scope; abstract provider layer from day 1 |
| Basic tool execution (file + app) | "Open Chrome", "find my resume" — these are baseline commands | MEDIUM | Platform abstraction required: Win32 / X11 / macOS APIs differ |
| Web search on demand | LLMs' knowledge is stale; users expect current information | LOW | Wrap a search API (DuckDuckGo, Brave, Tavily) — not a full browser |
| Clear indication of state (listening, thinking, speaking) | Without feedback, users don't know if the assistant heard them | LOW | TUI or audio cues; essential for voice UX |
| Error messages in plain language | "Tool failed" is unusable; must explain what went wrong and what to do | LOW | Prompt engineering in system prompt |

### Differentiators (Competitive Advantage)

Features that set JARVIS apart. Not universally expected, but high value when present.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Long-term memory with semantic recall | Most assistants forget everything after the session; JARVIS never forgets — it recalls relevant past conversations by semantic similarity | HIGH | ChromaDB + embeddings; store-retrieve-augment pattern; inject top-k memories into context on each request |
| User profile that evolves | JARVIS learns your name, preferences, routines — feels like a real personal assistant rather than a generic chatbot | MEDIUM | Separate SQLite table; explicit (user-stated) + implicit (inferred from patterns) persistence |
| Screen analysis (vision LLM) | "What's on my screen?" — enables tasks no other tool routing can handle; bridges the gap between natural language and the visual desktop | HIGH | Screenshot via PIL; send to vision-capable LLM (cloud or local); not all local models support vision — must detect capability |
| Multi-LLM routing with per-task selection | Use fast/cheap local model for simple queries, route to Claude/GPT-4 for hard reasoning — no assistant lock-in | MEDIUM | Already architected; the key differentiator is a smart routing policy, not just config |
| Fully offline / privacy-first default | Cloud by configuration, not by default — all conversation stays local unless the user explicitly enables cloud | LOW | Architecture decision already made; privacy angle is a strong selling point vs commercial assistants |
| Cross-platform, single install | Siri is macOS-only, Cortana is Windows-only — JARVIS runs everywhere the user works | MEDIUM | OS-specific modules (pywin32, python-xlib, pyobjc) behind a common interface; hardest on Linux (X11 vs Wayland) |
| Wake word activation (always-on) | Hands-free trigger — important for immersive use while working | HIGH | Picovoice Porcupine or openWakeWord for local detection; must run concurrently with assistant without mic contention; false positive rate is a real UX concern |
| System control commands | Volume, brightness, process kill — makes JARVIS a true system operator, not just a chat wrapper | MEDIUM | Cross-platform abstractions needed; psutil covers processes; display brightness varies by OS |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems, especially for a v1 personal assistant.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| GUI dashboard / rich UI | Looks impressive; easier to demo | Doubles the scope; delays the core value loop; TUI + voice is faster to ship and validates the assistant before investing in UI | Ship CLI + voice first; add optional PyQt6/Electron layer in v2 only if text/voice proves insufficient |
| Always-on microphone (no wake word, pure VAD) | Feels more natural — no need to say a keyword | False positives are constant; competes with media audio; drains resources; privacy perception is poor | Wake word (Porcupine/openWakeWord) OR push-to-talk hotkey — both are more reliable than pure VAD in desktop environments |
| Fine-tuning / model training | "Personalized model" sounds impressive | Weeks of work, GPU requirements, degrades on drift — completely out of scope for a personal productivity tool | Achieve personalization through long-term memory + user profile injection, not model weights |
| Cloud sync of conversation history | "Access from anywhere" | Contradicts the privacy-first design; adds authentication, encryption, and service maintenance overhead | Local only in v1; v2 can add optional encrypted export |
| Calendar / email integration | Feels like a complete personal assistant | OAuth flows, provider-specific APIs (Google, Outlook), token refresh — each is its own mini-project | Scope to web search + file access first; add calendar as a discrete tool in a later phase |
| Multi-user support | "Share with family" | Contradicts the single-user personalization model; adds auth, data isolation, permission layers | Out of scope by design; JARVIS is a personal tool, not a platform |
| Proactive notifications / interruptions | "Remind me" sounds simple | Requires a background scheduler, interrupt logic, and robust state machine — high complexity for unclear value in v1 | Build reactive first (user asks → JARVIS responds); add scheduled reminders as an isolated tool later |
| Real-time translation | Seems like a natural LLM capability | Adds latency to every voice response; requires multilingual TTS; complicates the memory/retrieval pipeline | Use the LLM's native multilingual ability on request without building a dedicated translation layer |
| Image generation | "Generate a picture of X" | Requires Stable Diffusion or API call — a separate model pipeline unrelated to the assistant's core value | Defer to v2; can be added as a discrete tool without touching the core |
| Super-agent with 20+ tools at once | "More tools = smarter assistant" | Tool selection confusion degrades routing accuracy; context window bloat; proven to cause more hallucination | Start with 5-7 high-value tools; expand incrementally based on actual use |

---

## Feature Dependencies

```
[Wake Word Detection]
    └──requires──> [Microphone Access / Audio Pipeline]
                       └──requires──> [Concurrent Process Management]

[Voice Input (STT)]
    └──requires──> [Audio Pipeline]
    └──requires──> [Whisper Model (local)]

[Voice Output (TTS)]
    └──requires──> [Audio Pipeline]

[Long-Term Memory Recall]
    └──requires──> [Conversation Persistence (SQLite)]
    └──requires──> [Embeddings Model]
    └──requires──> [ChromaDB Vector Store]

[User Profile Evolution]
    └──requires──> [Conversation Persistence (SQLite)]
    └──enhances──> [Long-Term Memory Recall]

[Screen Analysis (Vision LLM)]
    └──requires──> [LLM Abstraction Layer (must detect vision capability)]
    └──requires──> [Screenshot capture (PIL/pyautogui)]

[PC Control Tools]
    └──requires──> [Platform Abstraction Layer (Win/Linux/macOS)]
    └──enhances──> [Screen Analysis] (vision guides what to click/open)

[Multi-LLM Routing]
    └──requires──> [LLM Abstraction Layer]
    └──enhances──> [All tool execution] (smart routing = better results per task)

[Web Search Tool]
    └──requires──> [Agent / Tool Executor (LangChain)]

[File Manager Tool]
    └──requires──> [Platform Abstraction Layer]

[App Launcher Tool]
    └──requires──> [Platform Abstraction Layer]

[System Control Tool]
    └──requires──> [Platform Abstraction Layer]
```

### Dependency Notes

- **Wake word requires audio pipeline:** The Whisper STT loop and the wake word detector both need microphone access. These must be separate processes or use multiplexed audio input — running them naively in the same thread causes mic conflicts.
- **Long-term memory requires persistence first:** ChromaDB retrieval is meaningless without prior stored conversations. The SQLite persistence layer must be built before semantic recall can be tested.
- **Vision LLM requires capability detection:** Local models (Llama, Mistral) often do not support vision. The LLM abstraction layer must check whether the active model accepts image inputs before routing screen analysis requests — otherwise fall back to cloud.
- **All PC control tools require platform abstraction:** The abstraction layer is a prerequisite for any OS-specific tool. Building it correctly once early prevents platform-specific rewrites later.
- **User profile enhances memory recall:** Profile data (name, preferences, routines) should be injected into the system prompt alongside recalled memories, not stored in ChromaDB as raw conversation chunks.

---

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed to validate JARVIS's core value proposition (natural conversation + persistent memory + PC control).

- [ ] Text input + text output conversation loop — validate intent parsing and tool routing before adding voice complexity
- [ ] LLM abstraction layer with LM Studio (local) and at least one cloud provider — validates multi-LLM architecture
- [ ] Conversation persistence (SQLite) — every session saved automatically
- [ ] Long-term memory (ChromaDB) — semantic recall on next session; this IS the core differentiator, must be v1
- [ ] User profile (SQLite) — basic facts and preferences persisted explicitly
- [ ] File Manager tool — open, search, move files by natural language
- [ ] App Launcher tool — open/close applications by name
- [ ] Web Search tool — current information on demand
- [ ] Voice input via Whisper (push-to-talk initially, not wake word) — lower complexity than always-on wake word; validates STT before adding concurrency challenges
- [ ] TTS output via Kokoro-82M or pyttsx3 — voice responses complete the loop
- [ ] Platform abstraction layer — cross-platform from day 1 to avoid rewrites

### Add After Validation (v1.x)

Features to add once core loop is proven to work.

- [ ] Wake word detection (Porcupine or openWakeWord) — add only after push-to-talk voice is stable; wake word adds concurrency complexity
- [ ] Screen analysis (vision LLM) — high value but requires vision-capable model detection; add after basic tool routing is solid
- [ ] System control (volume, brightness, processes) — natural extension once file/app tools work
- [ ] Richer user profile inference (implicit preferences from conversation patterns)

### Future Consideration (v2+)

Features to defer until product-market fit is established for personal use.

- [ ] IoT / Raspberry Pi integration — already out of scope per PROJECT.md
- [ ] Scheduled automations / proactive reminders — high complexity, unclear v1 value
- [ ] Calendar and email integration — each provider is a separate integration project
- [ ] GUI dashboard — only if CLI + voice proves insufficient for daily use
- [ ] Image generation — discrete tool addition, no core dependency
- [ ] Voice cloning / custom TTS voice — enhancement, not core

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Conversation loop (text) | HIGH | LOW | P1 |
| LLM abstraction layer | HIGH | LOW | P1 |
| Conversation persistence (SQLite) | HIGH | LOW | P1 |
| Long-term memory (ChromaDB) | HIGH | MEDIUM | P1 |
| File Manager tool | HIGH | MEDIUM | P1 |
| App Launcher tool | HIGH | LOW | P1 |
| Web Search tool | HIGH | LOW | P1 |
| Platform abstraction layer | HIGH | MEDIUM | P1 |
| Voice input (push-to-talk STT) | HIGH | MEDIUM | P1 |
| TTS output | MEDIUM | LOW | P1 |
| User profile persistence | MEDIUM | LOW | P1 |
| Wake word detection | MEDIUM | HIGH | P2 |
| Screen analysis (vision LLM) | HIGH | HIGH | P2 |
| System control (volume, brightness) | MEDIUM | MEDIUM | P2 |
| Smart LLM routing policy | MEDIUM | MEDIUM | P2 |
| Implicit preference inference | MEDIUM | HIGH | P3 |
| Scheduled automations | LOW | HIGH | P3 |
| Calendar/email integration | MEDIUM | HIGH | P3 |
| GUI dashboard | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when core is stable
- P3: Nice to have, future consideration

---

## Competitor Feature Analysis

| Feature | Siri / Alexa / Google | Khoj (open source) | JARVIS (our plan) |
|---------|----------------------|---------------------|-------------------|
| Voice input | Yes (cloud STT) | Yes (via app) | Yes — local Whisper, offline-first |
| Long-term memory | Limited / cloud-only | Partial (document search) | Full semantic recall, every session, local |
| PC control | Minimal | None (web/mobile focus) | Full: file, app, screen, system |
| Privacy (offline default) | No (cloud required) | Partial (self-hostable) | Yes — local by default, cloud opt-in |
| Multi-LLM routing | No (single provider) | Yes (configurable) | Yes — abstract provider layer |
| Cross-platform | Platform-locked (Siri=Apple) | Yes | Yes — Linux, Windows, macOS |
| User profile learning | Cloud-stored, opaque | Not documented | Explicit + implicit, local SQLite |
| Screen analysis | No | No | Yes — vision LLM integration |
| Open source / hackable | No | Yes | Yes (personal use) |
| Wake word | Yes | No | Yes (push-to-talk first, wake word v1.x) |

---

## Sources

- [Building a Fully Local LLM Voice Assistant — Towards AI](https://pub.towardsai.net/building-a-fully-local-llm-voice-assistant-a-practical-architecture-guide-6a506aee6020) — architecture patterns (MEDIUM confidence; article behind soft paywall)
- [Khoj AI Features Documentation](https://docs.khoj.dev/category/features/) — competitor feature baseline (HIGH confidence; official docs)
- [Khoj GitHub](https://github.com/khoj-ai/khoj) — open-source personal AI assistant feature set (HIGH confidence)
- [llm-guy/jarvis GitHub](https://github.com/llm-guy/jarvis) — reference local Jarvis implementation with wake word + tool calling (HIGH confidence)
- [Mistakes I Made Building My AI Assistant — State Transition](https://www.statetransition.co/p/mistakes-i-made-building-my-ai-assistant) — scope creep, context window degradation, monolithic design pitfalls (MEDIUM confidence; personal blog)
- [Top 3 Mistakes Building AI Agents — Langflow](https://www.langflow.org/blog/top-three-mistakes-building-agents) — over-tooling, super-agent anti-pattern (MEDIUM confidence)
- [Complete Guide to Wake Word Detection — Picovoice](https://picovoice.ai/blog/complete-guide-to-wake-word/) — wake word UX tradeoffs, false positive issues (HIGH confidence; vendor docs)
- [12 Best Open-Source TTS Models Compared — Inferless](https://www.inferless.com/learn/comparing-different-tts-models-part-2) — Kokoro-82M vs pyttsx3 vs Coqui quality/speed (MEDIUM confidence)
- [Using ChromaDB as Long-Term Memory for AI Agents — Medium](https://medium.com/@techlatest.net/using-chromadb-as-long-term-memory-for-ai-agents-da96ed843e75) — store-retrieve-augment pattern (MEDIUM confidence)
- [Personal LLM Agents Survey — arXiv](https://arxiv.org/html/2401.05459v2) — capability/limitation analysis of personal LLM agents (HIGH confidence; academic)
- [AI Agent with Multi-Session Memory — Towards Data Science](https://towardsdatascience.com/ai-agent-with-multi-session-memory/) — multi-session memory architecture patterns (MEDIUM confidence)

---
*Feature research for: Local AI Personal Assistant (JARVIS)*
*Researched: 2026-04-02*
