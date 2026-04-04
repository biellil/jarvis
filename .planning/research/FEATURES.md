# Feature Landscape

**Domain:** AI Personal Assistant with PC Control (CLI-first, local-first)
**Project:** JARVIS — Just A Rather Very Intelligent System
**Researched:** 2026-04-04
**Overall confidence:** MEDIUM (domain knowledge + project context; web search unavailable)

---

## Table Stakes

Features users expect from an AI personal assistant with PC control. Missing any of these makes the product feel broken or unusable.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Natural language understanding | Core value prop — user speaks naturally, not commands | Low (delegated to LLM) | Quality depends on LLM choice; prompt engineering matters |
| Shell command execution | Primary productivity action; power users demand it | Low | Safety: dry-run mode, confirmation prompts for destructive ops |
| File management (read/write/delete/move) | Most common PC task users want to automate | Medium | Path resolution, permissions, error handling edge cases |
| Persistent conversation history (session memory) | Without it, every message is stateless — frustrating | Low | In-memory for session; flush to DB at session end |
| Configurable LLM backend | Privacy and cost concerns drive this — users need local option | Medium | OpenAI-compatible interface covers both GPT-4 and LM Studio |
| Error handling with human-readable feedback | Tool failures without explanation cause abandonment | Low | LLM should explain what went wrong in natural language |
| CLI interface with readable output | This IS the interface for v1 — must be usable | Low | Streaming output, color/formatting, prompt clarity |
| Graceful handling of ambiguous requests | Users say "delete old files" — must ask before acting | Low | Clarification loop via LLM; no silent destructive actions |

---

## Differentiators

Features that distinguish JARVIS from generic chatbots or simple automation scripts. Not universally expected, but provide competitive advantage.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Long-term vector memory (ChromaDB) | Remembers facts, preferences, past context across sessions | High | ChromaDB + embeddings; retrieval must be fast and relevant |
| Screen reading / OCR | Can "see" what's on screen — enables context-aware actions | High | pytesseract + OpenCV; screenshot capture varies by platform |
| App launcher | Opens apps by natural name ("open my browser") | Medium | xdg-open on Linux; requires app discovery/mapping |
| LangChain tool registry | Extensible architecture — add new capabilities without core changes | High | Tool schema discipline is critical; poor schemas = LLM errors |
| LangGraph multi-step reasoning | Handles complex multi-step tasks ("research X, then write a summary to ~/notes") | High | Requires solid foundation first; do not attempt before tools are stable |
| Local-first privacy mode | 100% offline operation with LM Studio — no data leaves the machine | Medium | Same code path; just swap LLM backend config |
| Cross-platform abstraction | Works on Linux, macOS, Windows — platform layer already exists | Medium | Abstract shell/file/launcher calls; platform module already scaffolded |
| Memory-augmented context injection | Automatically injects relevant past memories into LLM context | High | Retrieval quality determines usefulness; risk of noise injection |
| Structured output / command confirmation | Shows user what action will be taken before executing | Low | Improves trust significantly; especially for shell commands |
| Session summarization | Compresses long conversations into summary for long-term storage | Medium | Reduces token cost; improves quality of long-term retrieval |

---

## Anti-Features

Features to explicitly NOT build in v1. Building these early causes scope creep and delays the core value delivery.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Web/graphical UI | Frontend overhead distracts from AI and PC control core | CLI first; UI is a future milestone explicitly scoped out |
| Voice input/output (STT/TTS) | Adds audio pipeline complexity with no CLI benefit | Mark as future milestone; keep interface pure text |
| GPT-4 Vision / advanced computer vision | Complex dependency; OCR covers the primary use case | pytesseract + OpenCV satisfies screen-reading for v1 |
| IoT / device control | Requires hardware; entire different problem domain | Future milestone; foundation must be solid first |
| Multi-user support | Adds auth, isolation, data separation complexity | Single-user local tool for now |
| Plugin marketplace / community extensions | Premature infrastructure; tool registry is the extension point | Keep tool registry clean; external plugins = future |
| Cloud sync of memories | Privacy violation for a local-first tool; trust issue | SQLite + ChromaDB stay local; sync = future opt-in |
| Browser automation (Playwright/Selenium) | High complexity; separate agent category | Separate future tool if needed; not v1 |
| Scheduled / background tasks (cron-like) | Requires daemon process, job store, notification system | Reactive assistant first; proactive scheduling = future |
| Web search integration | Useful but adds external API dependency and error surface | Add as a discrete tool in a later milestone, not core |

---

## Feature Dependencies

```
CLI interface
  └── Shell command execution (CLI is the transport)
  └── Session memory (CLI accumulates context)

Session memory
  └── Long-term vector memory (session memories flush to vector store)
  └── Session summarization (compresses sessions before flush)

LangChain tool registry
  └── Shell command execution (registered as tool)
  └── File management (registered as tool)
  └── App launcher (registered as tool)
  └── Screen reading / OCR (registered as tool)
  └── Memory retrieval (registered as tool)

Configurable LLM backend
  └── Everything (all LLM calls route through this)

Screen reading / OCR
  └── pytesseract + OpenCV (platform dependency)
  └── Screenshot capture (platform-specific: Linux xwd/scrot)

Long-term vector memory
  └── ChromaDB (vector store)
  └── Embeddings model (either OpenAI embeddings or local sentence-transformers)
  └── Session summarization (quality input = quality retrieval)

LangGraph multi-step reasoning
  └── LangChain tool registry (tools must be stable before graph workflows)
  └── Long-term memory (graph nodes need memory access)
```

---

## MVP Recommendation

The minimum viable JARVIS that delivers the core value ("talk to it and it does PC things"):

**Must have:**
1. CLI interface (input/output loop, streaming, formatted output)
2. Configurable LLM backend (OpenAI + LM Studio via env config)
3. Session memory (conversation history in-process)
4. Shell command execution tool (with confirmation prompt)
5. File management tools (read, list, write, move — no delete without confirm)
6. LangChain tool registry wiring (clean tool schema discipline from day one)
7. Long-term memory foundation (SQLite for structured facts; ChromaDB for vector)

**Build second:**
- App launcher tool
- Screen reading / OCR tool
- Memory-augmented context injection
- Session summarization

**Defer entirely (not v1):**
- LangGraph multi-step reasoning
- Web/voice UI
- IoT, web search, browser automation

**Rationale for ordering:**
Shell + file tools are the fastest path to demonstrating value. Memory foundation comes early because retrofitting it later is painful — schema migrations and retrieval quality depend on consistent ingestion from the start. OCR comes after tools are stable because it introduces a heavy platform dependency (OpenCV, tesseract) that can destabilize early development.

---

## Phase-Specific Feature Notes

| Phase Topic | Feature Concerns |
|-------------|-----------------|
| Foundation (CLI + LLM) | Streaming output quality, LM Studio latency vs OpenAI, config schema flexibility |
| Memory (SQLite + ChromaDB) | Embedding model choice affects local-only constraint; sentence-transformers recommended for offline |
| PC Control tools | Shell tool safety is the highest-risk feature — confirmation flow must be designed carefully |
| OCR / Screen reading | Platform dependency is Linux-specific for now; test coverage is hard (visual) |
| LangGraph workflows | Introduce only after all individual tools are proven; premature graph complexity causes cascading failures |

---

## Confidence Notes

| Area | Confidence | Notes |
|------|------------|-------|
| Table stakes identification | MEDIUM | Based on domain knowledge of similar products (Open Interpreter, Jan.ai, GPT-Engineer, Aider); web search unavailable to verify current market |
| Differentiators | MEDIUM | LangChain/LangGraph capability set from training data (Aug 2025); verify against current LangChain docs before implementation |
| Anti-features | HIGH | Directly derived from PROJECT.md "Out of Scope" decisions + standard product scoping principles |
| Feature dependencies | HIGH | Technical dependencies are deterministic from architecture choices |
| MVP ordering | MEDIUM | Ordering is opinionated but grounded in project goals; validate with team |

---

## Sources

- `/root/jarvis/.planning/PROJECT.md` — Project requirements, constraints, out-of-scope decisions (HIGH confidence, authoritative)
- Domain knowledge: Open Interpreter, Jan.ai, Aider, GPT-Engineer, AutoGPT, LangChain agent patterns (MEDIUM confidence — training data, Aug 2025 cutoff)
- LangChain tool/agent architecture: training data knowledge of LangChain 0.2+ patterns (MEDIUM confidence — verify against current Context7 docs before implementation)
- Note: WebSearch was unavailable during this research session. Market comparison findings should be validated before roadmap finalization.
