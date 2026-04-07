# Milestones

## v1.2 Desktop UI (Shipped: 2026-04-07)

**Phases completed:** 5 phases, 14 plans, 9 tasks

**Key accomplishments:**

- One-liner:
- Commits:
- Status:
- Status:

---

## v1.0 MVP (Shipped: 2026-04-05)

**Phases completed:** 5 phases, 21 plans, 21 tasks

**Key accomplishments:**

- Installable jarvis package with pydantic-settings config layer, ARCH-03 version pins, and 17 xfail test stubs covering all Phase 1 requirements
- Multi-provider LLM factory (lmstudio/openai/anthropic) via create_llm() and heuristic model capability detection via detect_capabilities() — no hardcoded providers, streaming always on
- One-liner:
- Startup validation with Portuguese errors + streaming ChatSession using BaseChatModel.astream() wired into Rich CLI entry point
- SQLite MemoryStore with 4-table schema (conversations/messages/summaries/user_profile), Settings extended with memory paths, and chromadb+sentence-transformers added as dependencies
- One-liner:
- One-liner:
- Human-verified that session history, SQLite persistence, user profile extraction, cross-session profile injection, and ChromaDB semantic recall all work in live LLM conversations.
- CONV-06 formally deferred to v2: within-session coherence satisfied by ChatSession plain message history; LangGraph checkpointer cross-session resume is a v2 concern
- WhisperTranscriber with lazy-loaded faster-whisper, async-safe transcription via asyncio.to_thread(), and 9 mocked unit tests
- argparse --voice flag, /voice command dispatch, and D-08 state messages wired into __main__.py with 13 new integration tests
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- 9 @tool payload functions across files/apps/system modules plus ToolLogger audit class — tools return structured dicts for local execution, never call subprocess directly
- ActionExecutor dispatches tool payloads to Linux handlers with confirmation flow, ToolLogger wiring, and graceful error handling for missing system tools
- One-liner:
- 1. [Rule 1 - Bug] pyautogui import fails on headless Linux without DISPLAY
- One-liner:

---
