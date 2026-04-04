# Roadmap: JARVIS

## Overview

JARVIS is built in five phases that reflect the natural dependency stack of a local-first AI personal assistant. Phase 1 establishes the text conversation loop and multi-LLM abstraction — the foundation every other phase depends on. Phase 2 adds persistent long-term memory, the primary differentiator that makes JARVIS more than a stateless chatbot. Phase 3 adds the full voice pipeline (push-to-talk STT, neural TTS, state indication, wake word), completing the core experience. Phase 4 wraps the agent with PC control tools behind a platform abstraction layer, making JARVIS genuinely useful for daily tasks. Phase 5 adds screen analysis and smart LLM routing, pushing the system toward its advanced capabilities. Each phase is independently verifiable before the next begins.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Text conversation loop with configurable multi-LLM backend (completed 2026-04-02)
- [x] **Phase 2: Memory** - Persistent long-term semantic memory and user profile (completed 2026-04-04)
- [ ] **Phase 3: Voice Pipeline** - Push-to-talk STT, neural TTS, state indication, and wake word
- [ ] **Phase 4: PC Control** - Platform-abstracted tools for files, apps, and system control
- [ ] **Phase 5: Advanced Features** - Screen analysis, smart LLM routing, and hot config reload

## Phase Details

### Phase 1: Foundation
**Goal**: Users can have a text conversation with JARVIS using any configured LLM backend
**Depends on**: Nothing (first phase)
**Requirements**: CONV-01, LLM-01, LLM-02, ARCH-01, ARCH-03, ARCH-04
**Success Criteria** (what must be TRUE):
  1. User can type a message in the terminal and receive a coherent response from JARVIS
  2. User can switch between LM Studio (local) and a cloud provider (Claude or OpenAI) by changing one config value — no code change required
  3. JARVIS reports at startup which LLM is active and what capabilities it detected (tool calling, vision, context window size)
  4. JARVIS fails fast with a clear, actionable error message if a required dependency version is not met or a configured LLM is unreachable
  5. JARVIS runs on Linux, Windows, and macOS — OS-specific code lives only in the platform module
**Plans:** 4/4 plans complete
Plans:
- [x] 01-01-PLAN.md — Project scaffold, config layer, test stubs
- [x] 01-02-PLAN.md — Multi-LLM factory and capability detection
- [x] 01-03-PLAN.md — Cross-platform abstraction module
- [x] 01-04-PLAN.md — Startup validation, chat session, CLI entry point

### Phase 2: Memory
**Goal**: JARVIS remembers every previous conversation and learns the user's preferences over time
**Depends on**: Phase 1
**Requirements**: MEM-01, MEM-02, MEM-03, MEM-04, MEM-05, CONV-06
**Success Criteria** (what must be TRUE):
  1. Every conversation is automatically saved to SQLite with a timestamp — user never has to think about it
  2. JARVIS surfaces semantically relevant memories from past sessions and incorporates them into its response without being asked
  3. JARVIS remembers user preferences and facts (e.g., "I prefer dark mode", "I work in Python") across separate sessions
  4. At session end, JARVIS generates a summary that compresses the session for future recall
  5. JARVIS maintains coherent context throughout a session (references earlier turns correctly)
**Plans**: TBD

### Phase 3: Voice Pipeline
**Goal**: Users can speak to JARVIS and hear it respond, with clear state indication throughout
**Depends on**: Phase 2
**Requirements**: CONV-02, CONV-03, CONV-04, CONV-05, ARCH-02
**Success Criteria** (what must be TRUE):
  1. User can press a key to activate the microphone, speak naturally, and JARVIS transcribes and responds — no background noise triggers false transcription
  2. JARVIS responds by voice using a natural-sounding neural TTS voice (kokoro), streaming sentence by sentence rather than waiting for the full response
  3. JARVIS clearly displays its current state (LISTENING / THINKING / SPEAKING) so the user always knows what is happening
  4. User can say "Hey JARVIS" to activate the assistant without pressing any key
  5. The voice pipeline is fully asynchronous — speaking to JARVIS never blocks the terminal or freezes the interface
**Plans**: TBD
**UI hint**: yes

### Phase 4: PC Control
**Goal**: Users can control their computer through JARVIS using natural language
**Depends on**: Phase 3
**Requirements**: TOOL-01, TOOL-02, TOOL-03, TOOL-04, TOOL-05
**Success Criteria** (what must be TRUE):
  1. User can ask JARVIS to open, move, search, and list files by natural language description and it executes correctly
  2. User can ask JARVIS to open or close an application by name and it works on the current OS
  3. User can ask JARVIS to adjust volume, change brightness, or list active processes and JARVIS performs the action
  4. When JARVIS is about to delete a file or kill a process, it explicitly asks for confirmation and does nothing until the user confirms
  5. Every tool call (successful or not) is recorded in an auditable SQLite log with timestamp, tool name, parameters, and outcome
**Plans**: TBD

### Phase 5: Advanced Features
**Goal**: JARVIS can analyze the screen and intelligently route tasks to the best available model
**Depends on**: Phase 4
**Requirements**: VISION-01, VISION-02, VISION-03, LLM-03, LLM-04
**Success Criteria** (what must be TRUE):
  1. User can ask "what's on my screen?" and JARVIS captures a screenshot, analyzes it, and gives a meaningful answer
  2. When a vision task arrives and the active local model lacks vision support, JARVIS automatically falls back to OCR (pytesseract) or routes to a cloud vision model — the user receives an answer either way
  3. JARVIS routes vision tasks to vision-capable models and computationally simple tasks to faster local models without user intervention
  4. User can change the active LLM model in the config file and JARVIS picks it up without restarting
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 4/4 | Complete   | 2026-04-02 |
| 2. Memory | 1/1 | Complete   | 2026-04-04 |
| 3. Voice Pipeline | 0/TBD | Not started | - |
| 4. PC Control | 0/TBD | Not started | - |
| 5. Advanced Features | 0/TBD | Not started | - |
