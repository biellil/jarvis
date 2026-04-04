# Roadmap: JARVIS

## Overview

JARVIS is built in four phases. Phase 1 delivers a working CLI that can converse with an LLM using a configurable backend — the foundation everything else depends on. Phase 2 adds persistent memory so JARVIS recalls context across sessions. Phase 3 wires in shell and file system tools, making JARVIS capable of executing real PC actions with safety gates. Phase 4 completes PC control by adding an app launcher and screen reader, resulting in a fully functional local AI assistant that controls the computer through natural language.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - CLI, LLM abstraction, FastAPI service, and agent architecture
- [ ] **Phase 2: Memory** - SQLite session history, ChromaDB long-term vector memory, context injection
- [ ] **Phase 3: Shell & File Tools** - Shell execution, file management, safety confirmation gates
- [ ] **Phase 4: App Launcher & Screen Reader** - App control, screenshot OCR, full agent wired to all tools

## Phase Details

### Phase 1: Foundation
**Goal**: Users can converse with JARVIS via CLI using a configurable LLM backend (OpenAI or LM Studio), with a FastAPI service as the agent core and full platform abstraction in place
**Depends on**: Nothing (first phase)
**Requirements**: CLI-01, CLI-02, CLI-03, CLI-04, CLI-05, LLM-01, LLM-02, LLM-03, ARCH-01, ARCH-02, ARCH-03
**Success Criteria** (what must be TRUE):
  1. User can start JARVIS in terminal and receive streaming LLM responses with formatted output
  2. User can switch between OpenAI and LM Studio by changing only environment variables — no code changes
  3. JARVIS asks for confirmation before any destructive action and shows natural-language error messages when tools fail
  4. FastAPI service is the agent core — CLI communicates through it
  5. All PC tools are registered in the LangChain tool registry with Pydantic schemas and the agent iteration budget is enforced
**Plans**: 4 plans (complete)

Plans:
- [x] 01-01: Project scaffold, pyproject.toml, config.py, environment wiring
- [x] 01-02: LLM factory, capabilities abstraction, OpenAI + LM Studio unified client
- [x] 01-03: FastAPI service, ChatSession, CLI entry point with streaming and rich output
- [x] 01-04: Platform abstraction layer (Linux/macOS/Windows stubs), agent safety guards

### Phase 2: Memory
**Goal**: JARVIS maintains conversation history within a session, persists sessions to SQLite, stores facts and preferences in ChromaDB, and automatically injects relevant past context into each new conversation
**Depends on**: Phase 1
**Requirements**: MEM-01, MEM-02, MEM-03, MEM-04, MEM-05
**Success Criteria** (what must be TRUE):
  1. JARVIS remembers everything said earlier in the current session when answering follow-up questions
  2. Conversation history is written to SQLite when the session ends and survives process restarts
  3. JARVIS surfaces relevant information from previous sessions without being explicitly told to look
  4. User can ask "do you remember when I told you X?" and JARVIS retrieves the correct context from past sessions
**Plans**: 4 plans

Plans:
- [ ] 02-01: SQLite MemoryStore schema and CRUD layer (conversations, messages, tool_calls tables)
- [ ] 02-02: ChromaDB embedder with sentence-transformers all-MiniLM-L6-v2, local embedding pipeline
- [ ] 02-03: MemoryManager coordinator — load_context() at turn start, extract_and_embed() at session end
- [ ] 02-04: Wire MemoryManager into ChatSession and FastAPI endpoints; token budget and trim_messages()

### Phase 3: Shell & File Tools
**Goal**: User can ask JARVIS in natural language to run shell commands and manage files, with explicit confirmation gates before any destructive or irreversible operation
**Depends on**: Phase 2
**Requirements**: TOOL-01, TOOL-02, TOOL-03, TOOL-04, TOOL-05
**Success Criteria** (what must be TRUE):
  1. User can say "run ls -la in my home directory" and JARVIS shows the command, waits for confirmation, executes it, and returns the output
  2. User can say "move report.pdf to the docs folder" and JARVIS does it without needing explicit paths
  3. JARVIS refuses to delete any file or run destructive shell commands (rm, dd, chmod, kill) until the user explicitly confirms
  4. When a shell command fails due to permissions or an invalid path, JARVIS explains the error in plain language and suggests a fix
**Plans**: 3 plans

Plans:
- [ ] 03-01: Shell tool — subprocess execution with allowlist, command category gating, confirmation protocol
- [ ] 03-02: File management tool — list, create, move, rename with path resolution and permission handling
- [ ] 03-03: File deletion safety gate and tool error handler — structured error returns and natural-language UX

### Phase 4: App Launcher & Screen Reader
**Goal**: User can ask JARVIS to open any application by name and read what is currently visible on screen; all four PC control tool categories are wired into the live agent
**Depends on**: Phase 3
**Requirements**: TOOL-06, TOOL-07, TOOL-08, TOOL-09
**Success Criteria** (what must be TRUE):
  1. User can say "open VS Code" and JARVIS launches it, discovering the binary from .desktop files or PATH without hardcoded names
  2. User can say "read what's on my screen" and JARVIS returns the text found via OCR within a few seconds
  3. All four tool categories (shell, file, launcher, screen) are available to the agent in a single conversation without restarting
  4. JARVIS handles app-not-found and OCR-no-text cases with a clear natural-language explanation
**Plans**: 3 plans

Plans:
- [ ] 04-01: App launcher tool — .desktop file discovery, PATH scanning, xdg-open execution, name fuzzy matching
- [ ] 04-02: Screen reader tool — mss screenshot capture, Pillow preprocessing, pytesseract OCR with confidence gating
- [ ] 04-03: Full agent integration test — all tools registered and exercised end-to-end in a single session
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 4/4 | Complete | 2026-04-04 |
| 2. Memory | 1/4 | In progress | - |
| 3. Shell & File Tools | 0/3 | Not started | - |
| 4. App Launcher & Screen Reader | 0/3 | Not started | - |
