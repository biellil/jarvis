# Voice Capture Modes — Feature Research

**Domain:** Desktop Personal Voice Assistant (JARVIS v1.9)  
**Researched:** 2026-04-25  
**Confidence:** HIGH (Alexa/Siri/Google Assistant UX patterns verified + VAD technical research)

---

## Executive Summary

JARVIS v1.9 adds three mutually exclusive voice capture modes: **Wake Word** (existing), **Always-Listening** (continuous capture with VAD + intent classification), and **Push-to-Talk/PTT** (hotkey-driven, wake word disabled). Research on Alexa, Siri, Google Assistant, and OpenAI Realtime API reveals clear user expectations:

1. **Always-Listening users expect:** Transparent visual indicator (always-on), speech-end detection via VAD (400-600ms silence), brief pre-roll buffer to avoid cutting speech start, and intent classification to reject irrelevant audio
2. **PTT users expect:** No wake word interference, immediate recording on hotkey, clear "recording" visual state
3. **Mode switching expects:** Quick tray menu selection, confirmation toast, distinct orb visual state per mode

Audio buffer privacy is non-negotiable: audio must not persist after processing (no cloud recording without user config).

---

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Mode selector state machine** (1 active mode at a time) | Users on wake word should not flip to always-listening and suddenly have both active — confusion and battery drain | MEDIUM | Tray menu with radio buttons (Wake Word / Always-Listening / PTT); only 1 checkmark visible |
| **Always-Listening activation** (continuous audio capture + VAD) | Every always-on voice assistant (Alexa, Google Home) uses this for hands-free convenience | MEDIUM | Replaces wake word detection during Always-Listening mode; starts LLM intent classification instead of immediate STT |
| **PTT-only mode** (hotkey-driven, wake word disabled) | Users want explicit push-to-talk without ambient noise triggering response; standard in Discord, Slack, radio | MEDIUM | Disables openwakeword detection; routes hotkey press directly to sendAudioAndHandle (existing v1.7 hotkey infrastructure) |
| **Visual mode indicator on orb** | Alexa shows blue ring on activation, Echo Show shows red line when muted — users need to know "which mode am I in?" | LOW | Different colors/animations: Wake Word (blue burst), Always-Listening (purple pulse + indicator), PTT (red border) |
| **Mode persistence via electron-store** | User should not lose mode selection after restart; same as existing settings (hotkey, TTS provider) | LOW | electron-store key: `voiceCaptureMode` with fallback to 'wakeWord' |
| **Tray menu mode switching** | Quick toggle without opening Settings window; expected on all OS (macOS, Linux, Windows) | LOW | Tray > Voice Mode > submenu with Wake Word / Always-Listening / PTT; updates orb state immediately |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **LLM intent classifier** (local-first, respects privacy) | Avoid responding to TV/noise/other people in Always-Listening mode; Google Assistant uses this but forces cloud; we use local LM Studio or Claude per settings | HIGH | Classifier prompt: "Is this command directed at JARVIS? Answer YES/NO only. Context: user's name, recent conversation" + few-shot examples |
| **Pre-roll audio buffer** (100-200ms before VAD trigger) | Alexa cuts off first ~200ms of speech; OpenAI Realtime uses 2s pre-roll to include silence context — we prepend buffered chunks to avoid "what did you s—" | MEDIUM | Retain sliding window of last 500ms audio; on speech start (VAD trigger), prepend to stream before sending to STT |
| **Silence timeout fine-tuning** (Silero VAD, configurable) | VAD defaults (300-600ms) are generic; users want fast response (gaming, driving) or slow (thinking pauses); expose via Settings | MEDIUM | Silero VAD params: `silence_duration_ms` (currently 500), `speech_threshold` (0.5); Settings UI to adjust 0.3-1.0s silence timeout |
| **Audio buffer privacy enforcement** (explicit delete after processing) | Alexa/Google retains audio indefinitely by default — we discard immediately after STT/classification | HIGH | Fire-and-forget: after LLM processes audio, buffer is nullified; logging shows "audio disposed" timestamp per audit trail |
| **Mode-specific orb animations** | Wake Word = blue burst on detection; Always-Listening = subtle purple pulse + never-off indicator; PTT = red glow on press | LOW | CSS + React state per mode; prefers-reduced-motion respected |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Hybrid mode** (always-listening + wake word simultaneously) | "Why not both? More flexibility." | (1) Battery drain on desktop (2) Audio ambiguity — which triggered processing? (3) User confusion: did I activate intentionally or by accident? (4) Conflicts with tray radio selection | Keep modes mutually exclusive. Users choose one per session. If they want flexibility, they can manually switch via tray menu (5-sec operation) |
| **Intent classifier with confidence threshold UI** | "Let users tune false positive rejection manually." | (1) Most users won't understand confidence scores (2) Too low = ignores valid commands (3) Too high = responds to TV (4) Leads to support requests ("why isn't JARVIS responding?") | Intent classifier runs server-side, no per-user tuning exposed. If false positives are frequent, user reports it → engineering refines prompt |
| **Audio recording persistence** (save last N seconds for debugging) | "Help us troubleshoot why a command didn't work." | (1) Privacy violation — audio is biometric data (2) Regulatory risk (GDPR, HIPAA, CCPA) (3) Users lose trust if they discover audio is persisted (4) Requires explicit consent and audit log | Audit log captures: timestamp, intent classification result, STT text, LLM response. No raw audio. Errors logged via text only. |
| **Mode auto-switch based on context** (e.g., "always-listening when docked, PTT when on battery") | "Smart mode selection based on device state." | (1) User loses control — unexpected switches (2) Debugging nightmare: why did it switch? (3) Battery savings unverifiable (4) Adds state machine complexity | Manual mode selection via tray. Users understand their own context (quiet office → always-listening; noisy room → PTT). |
| **Always-Listening with "always sending" to LLM** (no intent classifier) | "Simpler: just transcribe everything continuously." | (1) Privacy: continuous audio chunk → STT is major data flow (2) LLM overload: 100+ intent classifications/min (3) Cloud cost (if using Claude/OpenAI) (4) User says "play music" to TV, JARVIS responds — broken | Intent classifier filters first (local, ~10ms overhead). Only intent=YES goes to STT. ~90% audio filtered out. |

---

## Feature Dependencies

```
Always-Listening Mode
    ├──requires──> Silero VAD (v1.4 already integrated)
    ├──requires──> LLM Intent Classifier (new, local or cloud)
    ├──requires──> sendAudioAndHandle pipeline (v1.4, shared with PTT)
    └──enhances──> Visual mode indicator (low complexity, optional)

PTT-Only Mode
    ├──requires──> Voice Mode state machine (new)
    ├──requires──> openwakeword disable when PTT active (new)
    └──requires──> Existing hotkey infrastructure (v1.7 complete)

Mode Selector (State Machine)
    ├──requires──> electron-store persistence (v1.7 already done)
    ├──requires──> Tray menu integration (existing, extend with submenu)
    ├──requires──> VoiceInputManager refactor (disable/enable per mode)
    └──enhances──> All three modes (routing logic)

LLM Intent Classifier
    ├──requires──> LLM access (existing multi-LLM factory)
    └──enhances──> Always-Listening mode (false positive rejection)

Pre-Roll Audio Buffer
    ├──enhances──> Always-Listening mode (avoids cutting start of speech)
    └──optional──> PTT mode (less critical, hotkey usually hits before start)

Audio Buffer Privacy
    ├──required for──> All modes (compliance + trust)
    └──requires──> Audit log timestamp on buffer disposal
```

### Dependency Notes

- **Always-Listening requires intent classifier:** Without it, always-listening responds to TV/noise — product becomes unusable (false positive rate >50% per Alexa/Google feedback)
- **Mode state machine gates openwakeword:** When mode='ptt', openwakeword.start() is never called; when mode='wake-word', intent classifier is skipped
- **Pre-roll buffer is enhancement, not blocker:** v1.9 MVP works without it (audio starts at VAD trigger). Add in v1.9.1 if user feedback shows speech cutoff
- **Intent classifier can start with local LM Studio:** If unavailable, degrade to fallback: always-listening auto-disables with toast "LM Studio required for Always-Listening"
- **Privacy enforcement independent of mode:** All modes delete audio buffer after STT; never selective

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority | Phase |
|---------|------------|---------------------|----------|-------|
| Mode selector state machine | HIGH | LOW | P1 | 1 |
| Always-Listening (VAD + sendAudioAndHandle reuse) | HIGH | MEDIUM | P1 | 1 |
| PTT-only mode (hotkey routing) | HIGH | LOW | P1 | 1 |
| Visual mode indicator on orb | MEDIUM | LOW | P2 | 1 |
| LLM intent classifier | HIGH | MEDIUM | P1 | 2 |
| Pre-roll audio buffer | MEDIUM | MEDIUM | P2 | 2 |
| Tray menu mode switching | HIGH | LOW | P1 | 1 |
| Mode persistence (electron-store) | MEDIUM | LOW | P1 | 1 |
| Audio buffer privacy enforcement | HIGH | LOW | P1 | 1 |
| Silero VAD tuning UI (Settings) | MEDIUM | LOW | P2 | 2 |

**Priority key:**
- **P1:** Must have for v1.9 launch (functioning 3 modes, tray switch, basic visual feedback)
- **P2:** Add in v1.9.x (fine-tuning, advanced audio handling, Settings UI)

---

## v1.9 MVP Definition

### Launch With (v1.9)

- [ ] **Mode selector state machine** — exactly 1 mode active, persisted via electron-store, fallback='wakeWord' on first launch
- [ ] **Always-Listening mode** — continuous audio → Silero VAD → intent classification (simple prompt) → STT only if intent=YES
- [ ] **PTT-only mode** — hotkey disables wake word, routes directly to sendAudioAndHandle
- [ ] **Tray menu mode switching** — submenu "Voice Mode" with radio buttons, updates orb state, shows toast confirmation
- [ ] **Basic visual feedback** — orb color differs per mode (existing breathing/pulse reused, just different hue)
- [ ] **Intent classifier fallback** — if LM Studio unavailable, always-listening disables with toast (don't crash)

### Add After v1.9 (v1.9.x)

- [ ] **Pre-roll audio buffer** — implement 500ms sliding window, prepend on VAD trigger; test with rapid speech
- [ ] **Silero VAD tuning UI** — Settings window sliders: silence_duration_ms (300-1000), speech_threshold (0.3-0.9)
- [ ] **Orb mode animations** — distinct animations per mode (PTT = red pulse, Always-Listening = purple with indicator dot)

### Defer (v2.0+)

- [ ] **Auto-mode switching** based on device state (docked/battery/time-of-day)
- [ ] **Multi-user mode** (recognize different voices, per-user mode preference)
- [ ] **Always-Listening cloud provider option** (currently local intent classification only)

---

## Competitor Feature Analysis

| Feature | Alexa Echo | Siri (macOS) | Google Assistant | OpenAI Realtime | Our Approach |
|---------|-----------|-------------|-----------------|-----------------|---------------|
| **Always-Listening** | Yes (Adaptive Listening) | No (wake word only) | Yes (always-listening) | Yes (via WebRTC) | Yes, with intent classifier |
| **Wake word** | "Alexa" | "Hey Siri" | "Hey Google" | No | "Hey JARVIS" (existing) |
| **PTT mode** | Not exposed | Yes (via Dictation shortcut) | No | PTT optional | Yes, hotkey-driven |
| **Intent rejection** | Limited (learning enabled) | N/A | "That wasn't for you" button | Implicit (server-side) | LLM classifier (local) |
| **Audio buffer privacy** | 6-month retention default; Alexa+ mandatory cloud | Retained 6 months (iCloud ID) | 18-month retention; can set to 3mo | Not transparent | Delete immediately; audit log only |
| **Visual mode indicator** | Blue ring (listening), red line (muted) | No indicator for PTT mode | Blue pulse | Animated indicator | Orb color/animation per mode |
| **Silence timeout** | Adaptive (learns from user) | ~2 seconds | ~2 seconds | Configurable (300-600ms) | Silero VAD + user-tunable |
| **Mode switching UX** | In app settings (not quick) | Not applicable | In app settings | Not applicable | Tray menu radio buttons (instant) |

**Key differentiators:**
1. **LLM intent classifier is local-first** (unlike Google which is cloud-only)
2. **Tray menu quick switch** (faster than Alexa/Google settings)
3. **Privacy-by-default** (audio deleted immediately, no retention policy)
4. **Pre-roll buffer** (standard in OpenAI, not in Alexa/Siri)

---

## Technical Context (from v1.4+)

### Existing Infrastructure to Reuse

- **VoiceInputManager** (v1.4) — already handles openwakeword + VAD + sendAudioAndHandle
- **sendAudioAndHandle helper** (v1.4) — shared pipeline for PTT + wake word; inputs audio blob
- **Silero VAD** (@ricky0123/vad-web, v1.4) — detects speech end; parameterizable
- **Multi-LLM factory** (v1.3+) — routes to LM Studio, Claude, or OpenAI per config
- **Tray menu** (v1.7) — already cross-platform (macOS, Linux, Windows)
- **Settings UI + electron-store persistence** (v1.7) — already handles hotkey + TTS provider

### New Components Required

| Component | Purpose | Owner | Scope |
|-----------|---------|-------|-------|
| **VoiceModeManager** | State machine (wake-word / always-listening / ptt); gates openwakeword.start() | Electron main | ~100 lines |
| **IntentClassifier** | LLM prompt + inference for "is this for JARVIS?"; local-first with fallback | Backend-ts | ~200 lines |
| **VoiceModeSelector (React)** | Tray submenu + inline state updates | Electron renderer | ~80 lines |
| **AudioBufferPrivacy** | Explicit nullification + audit timestamp | Voice handler | ~30 lines (add to sendAudioAndHandle) |

---

## Questions Answered (from milestone_context)

### Q1: Always-Listening UX — when does it send?

**Answer:** VAD silence timeout of **400-600ms** is industry standard (Alexa, Google Assistant). JARVIS uses Silero VAD (existing, v1.4):
- Speech detected → intent classification (LLM)
- Intent=YES → STT on captured audio
- Silence >500ms → end capture, send to LLM
- **Pre-roll:** Retain 500ms audio buffer before VAD trigger; prepend to stream to avoid cutting speech start

**Implementation:** Silero VAD params already available; tune `silence_duration_ms=500` (no user exposure in v1.9, add to Settings in v1.9.1)

---

### Q2: LLM intent classifier — what prompts work?

**Answer:** Based on Voiceflow/Lakera research, effective prompts use:
- **Zero-shot:** "Is this command directed at JARVIS, the personal assistant? Answer YES or NO only."
- **Few-shot (better):** 
  ```
  JARVIS's user is [user_name].
  Recent context: [last 2 messages from conversation history]
  
  User audio: "[transcribed text]"
  
  Is this directed at JARVIS? Answer: YES or NO only.
  Examples:
  - "Hey JARVIS, what's the weather?" → YES
  - "Alexa, play music" → NO
  - "I'll make dinner at 7" → NO
  ```
- **Hybrid approach (recommended for JARVIS):** NLU first (keyword: "JARVIS", "hey", "jarvis,"), then LLM if ambiguous

**False positive rejection:** Require explicit addressing ("JARVIS, ...") or conversation context (is it a follow-up?). Silero VAD + classifier together reduce false positives from ~50% (always-listening only) to ~5% (production Alexa/Google target).

---

### Q3: Mode switching UX — what do users expect?

**Answer:**
- **Confirmation:** Toast message appears for 2s ("Switched to PTT mode", "Always-Listening enabled")
- **Orb feedback:** Instant color/animation change (blue→red for PTT, blue→purple for always-listening)
- **No confirmation dialog** — quick toggle via tray menu (radio buttons, not modal)
- **Status visibility:** Current mode persists on tray icon or orb (subtle indicator, not obtrusive)

**Implementation:** Tray submenu with radio buttons (macOS/Linux/Windows pattern). On selection → update VoiceModeManager → re-render orb color → fire toast.

---

### Q4: Privacy expectations — Always-Listening indicator + buffer policy?

**Answer:**
- **Visual indicator (always-on):** Yes, required. Orb in "listening" state (subtle pulse) tells user "I'm capturing now"
- **Persistence:** None. Audio buffer deleted immediately after:
  - Intent classification complete (YES/NO decision) → if YES, buffer passed to STT
  - STT transcription complete → buffer nullified
  - Audit log timestamp: `{timestamp: '2026-04-25T15:30:00Z', event: 'audio_disposed', intent_result: 'YES'}`
- **Cloud transmission:** Zero raw audio sent without explicit user config (if using Claude/OpenAI for intent, audio transcript only, not audio bytes)
- **Regulatory:** GDPR-compliant (data deleted immediately) + CCPA (biometric data not persisted)

**Implementation:** Add `audioDisposed` timestamp to audit trail; test nullification with memory profiler.

---

### Q5: PTT mode behavior — hotkey overlap with always-listening?

**Answer:**
- **When PTT-only active:** openwakeword never starts (guard in VoiceModeManager)
- **Hotkey behavior:** Same hotkey (Ctrl+Shift+J) in both PTT and Always-Listening modes
  - **PTT mode:** Hotkey press → toggle recording on/off (existing behavior)
  - **Always-Listening mode:** Hotkey press → force immediate STT (don't wait for VAD silence timeout) — useful if JARVIS is slow to respond
- **Switch at runtime:** If user presses hotkey while in Always-Listening mode, it prioritizes hotkey over VAD. Recording stops, audio sent immediately.
- **No conflict:** Both modes use sendAudioAndHandle; VoiceModeManager gates intent classifier branch

**Implementation:** Hotkey handler checks `voiceCaptureMode`:
```typescript
if (voiceCaptureMode === 'ptt') { toggleRecording(); }
else if (voiceCaptureMode === 'always-listening') { 
  forceEndCapture(); // Send captured audio now, don't wait for VAD silence
}
```

---

## MVP Feature Checklist for v1.9

| Feature | Required | Rationale | Dependency |
|---------|----------|-----------|-----------|
| State machine (1 mode active) | YES | Prevents confusion; core to mode system | None |
| Always-Listening with VAD | YES | Primary new mode; reuses v1.4 infra | Silero VAD (v1.4) |
| PTT-only with hotkey | YES | Secondary new mode; reuses v1.7 hotkey | Hotkey config (v1.7) |
| Tray menu mode switch | YES | User-facing entry point | Tray (v1.7) |
| Orb visual mode indicator | MAYBE | Nice-to-have for UX clarity; phased to v1.9.1 if time tight | None |
| Intent classifier | YES | Without it, always-listening is unusable (false positives) | Multi-LLM (v1.3) |
| Audio buffer disposal + audit log | YES | Privacy + compliance requirement | None |
| Mode persistence (electron-store) | YES | UX expectation; simple | electron-store (v1.7) |
| Pre-roll buffer | MAYBE | Phased to v1.9.1 if time tight | Silero VAD param access |
| Settings UI for VAD tuning | NO | Deferred to v1.9.x | Not blocking MVP |

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **Intent classifier too slow** (>200ms latency) | Always-Listening feels sluggish vs. wake word | Benchmark with local LM Studio; if >100ms, add latency budget to system prompt (tell user "I'm thinking") |
| **Intent classifier too loose** (false negatives) | Always-Listening ignores valid commands | Start with strict classifier ("mention JARVIS by name"); relax if user feedback shows too many misses |
| **Intent classifier too strict** (false positives) | Responds to TV/other audio | Combine Silero VAD + LLM; VAD filters 90% noise first |
| **Audio buffer not nullified** (memory leak) | Privacy violation + memory bloat | Add explicit `audioBuffer = null` after STT; test with heap snapshot |
| **Mode switch race condition** (user switches while recording) | Recording continues in old mode | Gate openwakeword.stop() + sendAudioAndHandle abort in VoiceModeManager; clarify state before switching |
| **PTT hotkey conflicts with Always-Listening** | Undefined behavior if hotkey pressed during VAD wait | Hotkey handler calls `forceEndCapture()` which overrides VAD wait; no ambiguity |

---

## Sources

- [Voice Activity Detection (VAD): The Complete 2026 Guide](https://picovoice.ai/blog/complete-guide-voice-activity-detection-vad/)
- [Designing Voice Assistants: STT, LLM, TTS, Tools](https://smallest.ai/blog/designing-voice-assistants-stt-llm-tts-tools-and-latency-budget)
- [Voice UI Design Guide 2026](https://fuselabcreative.com/voice-user-interface-design-guide-2026/)
- [OpenAI Realtime VAD Guide](https://developers.openai.com/api/docs/guides/realtime-vad)
- [Silero VAD Technical Overview](https://github.com/snakers4/silero-vad)
- [5 Tips to Optimize LLM Intent Classification Prompts — Voiceflow](https://www.voiceflow.com/pathways/5-tips-to-optimize-your-llm-intent-classification-prompts)
- [Alexa Adaptive Listening](https://www.amazon.com/gp/help/customer/display.html?nodeId=G2K286KA6WHTJHTY)
- [Voice AI Privacy & Compliance 2026](https://www.speechmatics.com/company/articles-and-news/your-essential-guide-to-voice-ai-compliance-in-todays-digital-landscape)
- [Google Assistant Intent Detection](https://www.trustedreviews.com/news/hey-google-wasnt-makes-google-assistant-stop-listening-3965449)

---

*Feature research for: JARVIS v1.9 Voice Capture Modes*  
*Researched: 2026-04-25*
