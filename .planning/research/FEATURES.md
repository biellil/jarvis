# Feature Research — v1.4 Voice & UX Polish

**Domain:** Desktop voice assistant — wake word activation + orb widget refinement
**Researched:** 2026-04-11
**Confidence:** HIGH (wake word UX / Electron patterns) · MEDIUM (specific orb polish micro-interactions)
**Scope:** ONLY features needed for v1.4 — wake word detection (regression recovery from v1.3) + orb visual polish. Assumes existing PTT hotkey, 4-state orb, frameless transparent window, tray menu, and speech bubble are already shipped.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features every "always-listening" desktop assistant ships. Missing any of these makes the wake word feel broken, creepy, or untrustworthy.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **WW-TS-01 — Wake word detection "Hey JARVIS"** | Core regression from v1.3 — CONV-05 existed in Python, must be reimplemented in Node/TS | MEDIUM | Use `bumblebee-hotword-node` (Apache-2, no API key, ships `jarvis` keyword pre-trained) OR openwakeword via `onnxruntime-node`. Runs in Electron main or hidden renderer with mic access. |
| **WW-TS-02 — Visual "wake detected" feedback on orb** | Every Alexa/Siri/Google shows a light-ring flash within ~150ms of detection. Silent wake = user doesn't know if it worked and re-speaks | LOW | Transient `awakened` pulse state on orb before transitioning to `listening`. Matches industry 200–500ms micro-interaction window. Reuse existing OrbContext — add one transient state or piggy-back on `listening` with an entry burst. |
| **WW-TS-03 — Mic on/off kill switch** | Privacy baseline — users need a single, obvious toggle to stop listening without quitting the app | LOW | Tray menu item ("Pause listening" / "Resume listening") + global hotkey. State persists to electron-store. |
| **WW-TS-04 — Persistent mic status indicator** | Users must know at-a-glance "is it listening right now?" without hovering or clicking. Invisible mic = spyware feeling | LOW | Orb idle gradient differs when wake word is ACTIVE vs PAUSED. Tray icon also changes (dot vs dash, or color). No separate HUD needed. |
| **WW-TS-05 — Auto-resume after command finishes** | After TTS responds, JARVIS must go back to listening for next wake word without user action. Otherwise it becomes PTT-with-extra-steps | LOW | State machine: `listening-for-wake → awakened → listening (STT) → processing → responding → listening-for-wake`. Single flag toggled by session boundaries. |
| **WW-TS-06 — False-positive recovery (short timeout)** | If wake word fires spuriously and no speech follows within ~3–5s, return to idle. Otherwise every cough freezes the orb in "listening" | LOW | VAD-backed silence timer after wake (2–5s) → abort session, return to idle listening. Reuse Silero VAD if using openwakeword, or simple energy threshold if using bumblebee. |
| **WW-TS-07 — Sensitivity threshold configurable via .env** | Noisy vs quiet environments need different thresholds. Default 0.5; user tunes up (fewer false positives) or down (easier trigger) | LOW | Single env var `WAKE_WORD_THRESHOLD=0.5`. openwakeword and bumblebee both expose `sensitivity` 0.0–1.0. No UI needed — power user only. |
| **WW-TS-08 — Graceful mic permission failure** | If user denies mic or device is unplugged, wake word path must fall back to PTT-only and log error, not crash the widget | LOW | Try/catch on getUserMedia/mic init → fallback to PTT-only mode, tray shows "mic unavailable" state. Existing PTT path continues to work. |
| **WW-TS-09 — No audio sent to cloud by default** | Privacy-first is a pillar of JARVIS (CLAUDE.md constraint). Wake word ALWAYS runs locally | LOW | Both candidate libs are 100% local/offline. Document this explicitly. Matches existing STT stance (nodejs-whisper is local). |

**Dependencies on existing features:**
- WW-TS-01 depends on existing STT pipeline (AUDIO-01/02) — wake word only triggers it, STT already works via PTT
- WW-TS-02 depends on existing OrbContext + 4-state machine (ORB-01..04)
- WW-TS-03, WW-TS-04 depend on existing tray menu (DESK-04) and electron-store (DESK-05)
- WW-TS-05 depends on existing agent session lifecycle (ACTV-02)

---

### Differentiators (Competitive Advantage / Polish)

Features that elevate JARVIS above "yet another voice assistant" without scope creep. Each must pay for itself in perceived quality or the user experience.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **ORB-POL-01 — "Wake burst" animation on detection** | Confirms detection with a satisfying visual beat (amber expanding ring + scale bump). The difference between "maybe it heard me" and "yes, JARVIS is ready" | LOW | Single CSS keyframe: 0→100% scale 1.0→1.1→1.0 + ring opacity 0→0.8→0 over ~350ms. Runs ONCE on wake transition, then hands off to standard listening pulse. Fits 200–500ms industry micro-interaction sweet spot. |
| **ORB-POL-02 — Drag-to-reposition orb** | Users want to move the orb out of the way of fullscreen content (games, video). Current auto-position is fine for default but rigid | LOW | `-webkit-app-region: drag` on a drag handle OR custom mousedown → `BrowserWindow.setPosition()`. Persist new position to electron-store (reuses DESK-05 infra). Must exclude drag region from click-through logic. |
| **ORB-POL-03 — Hover state reveals subtle tooltip / state label** | First-time users hover and wonder "is this listening? processing? idle?" A 1-second delayed text pill ("Listening for Hey JARVIS…") teaches the state vocabulary | LOW | Framer Motion / CSS `:hover` + `transition-delay`. Small pill below orb, fades in after 800ms, fades out immediately on unhover. Must NOT break click-through on non-hover. |
| **ORB-POL-04 — Subtle gradient shift/hue drift over time (idle breathing)** | Static idle gradient looks dead. A ~4–8s hue rotation (±10°) or position drift makes the orb feel "alive" without being distracting. This is the Siri/Apple Intelligence trick | LOW | CSS `@keyframes` animating `background-position` or `filter: hue-rotate()` on idle layer. Already have pulse — layer hue drift on top. Respects `prefers-reduced-motion`. |
| **ORB-POL-05 — Click-to-toggle PTT (direct interaction)** | Clicking the orb feels like it should DO something. Currently pointer-events: none. Making click = PTT toggle gives the orb a second activation path (wake word + click + hotkey) | MEDIUM | Requires releasing click-through on orb body (not window), adding IPC to trigger PTT flow. Conflicts with current `pointer-events: none`. Careful — must still allow drag-to-reposition. |
| **ORB-POL-06 — Specular highlight parallax on cursor movement** | As cursor moves over the orb, the bright top-left highlight shifts slightly to fake 3D. Premium apps (macOS Sonoma controls, iOS widgets) all do this now | MEDIUM | Read mouse position relative to orb center, offset Layer 2 (specular) by ±5–10px. Runs on requestAnimationFrame, throttled. Only active when orb is hovered (perf). |
| **ORB-POL-07 — Reduced-motion accessibility mode** | `prefers-reduced-motion: reduce` users get still/faded gradient instead of pulse/spin/ripple. Industry baseline (SmoothUI's Siri Orb already does this) | LOW | CSS media query wrapping keyframe animations. Minimal code — one media query, one override block. |
| **ORB-POL-08 — Smoother state transition crossfade** | Current transitions are `0.4s ease-in-out` on gradient. OK but abrupt on state change. Crossfading two stacked gradient layers with opacity gives buttery smoothness | LOW | Render two absolute-positioned layers; on state change, fade in new layer over old, remove old after transition. ~20 LOC in Orb.tsx. |

**Dependencies:**
- ORB-POL-01 ↔ WW-TS-02 (same feature, viewed from two angles — differentiator quality bar vs table-stakes existence)
- ORB-POL-02 conflicts with current full-window `setIgnoreMouseEvents` (click-through). Needs a small non-click-through drag handle region.
- ORB-POL-05 conflicts with ORB-POL-02 (click vs drag) — needs threshold: <5px movement = click, ≥5px = drag. Standard pattern.
- ORB-POL-06 requires hover events → cannot coexist with full click-through on orb area.

---

### Anti-Features (Requested but Should NOT Ship in v1.4)

Features that sound good for a voice assistant orb but create complexity, scope creep, or conflict with user's explicit deferrals. The user already deferred Settings UI, Speech bubble redesign, and History panel — stay ruthless.

| Anti-Feature | Why Requested | Why Problematic | Alternative |
|--------------|---------------|-----------------|-------------|
| **Settings/preferences UI panel** (mic device, threshold, voice, hotkey) | "Users want to configure their assistant" | Explicitly deferred by user. Full settings UI = new window, form state, validation, persistence UI — easily 2–3 phases of work | Continue using `.env` for power-user knobs (threshold, hotkey, mic device). Document in README. |
| **Custom/user-trained wake words** ("Hey Friday", "Computer") | "Personalization = cool" | Training pipeline, dataset collection, model hosting, UX for recording samples — huge scope. openwakeword custom training requires hours of data. bumblebee-hotword ships fixed keyword set only. | Ship with "jarvis" (bumblebee has it pre-trained) or "hey jarvis" (openwakeword). Project is literally called JARVIS — one pre-trained word is on-brand. |
| **Visual waveform / audio level meter on orb** | "Siri shows a waveform, we should too" | Requires FFT of live mic audio, drives another render loop, adds perf cost while listening. Low value for a 128px orb — can't read fine detail anyway | Use the existing `listening` amber pulse as the "I hear you" signal. Pulse speed already signals activity. Defer FFT visuals to v2+. |
| **Particle effects / bloom / fancy WebGL shader orb** | "Make it look like a Marvel movie hologram" | Full-screen particle system = GPU cost + complexity. Current CSS radial-gradient + specular layer already looks premium. Diminishing return vs engineering time | Ship the 8 ORB-POL items above — they're 80% of the perceived polish at 10% of the cost of a shader pipeline. |
| **Command/intent history panel** ("what did I ask earlier?") | "Like a chat log" | Explicitly deferred by user (PROJECT.md: "Settings/preferences UI, Speech bubble redesign, History/context panel" deferred). Also: memory is already persisted via SQLite — user can query JARVIS for history conversationally | Defer to v2+. Backend already logs everything. |
| **Voice activity detection (VAD) as primary activation** (no wake word, just "speak anytime") | "More natural than a wake word" | Nightmare false-positive rate in noisy environments. Every cough, background conversation, or TV dialog triggers STT → LLM → tokens. Expensive and creepy | Wake word is the industry-correct answer. VAD is a component INSIDE wake word flow (silence detection post-wake). Not a replacement. |
| **Multi-language wake word** ("Ei JARVIS" in pt-BR) | User speaks Portuguese to JARVIS | bumblebee ships "jarvis" trained on English corpus; "Hey JARVIS" is phonetically close enough across languages for a single-user app. Adding multi-lang means dual models + runtime switching | Ship English "jarvis" / "hey jarvis" only. User's existing CLI conversation is already in pt-BR via LLM; wake word being English-phonetic is a non-issue. |
| **Always-on activity light separate from orb** | "Like Alexa's blue ring" | Orb IS the activity light. Adding a second indicator = visual noise, more IPC, more window real estate | Use orb gradient + glow variation between "listening-for-wake" (dim) and "awakened" (bright). Already planned in WW-TS-04. |
| **Cloud-based wake word (Picovoice Porcupine with access key)** | Better accuracy, lower false positive rate | Requires Picovoice AccessKey — violates privacy-first constraint in CLAUDE.md. User explicitly wants no-key libs | Use bumblebee-hotword-node (Apache 2.0, no key) or openwakeword via onnxruntime-node. |
| **Whisper running continuously (no wake word, full transcription)** | "More powerful" | GPU/CPU burn 24/7, massive transcript log, privacy concern. Defeats purpose of wake word entirely | Wake word gate → STT window → close. Existing v1.3 design is correct. |

---

## Feature Dependencies

```
WW-TS-01 (wake detect)
    ├──requires──> existing STT pipeline (AUDIO-01/02, already shipped)
    ├──requires──> existing OrbContext state machine (ORB-01..04, shipped)
    └──enables───> WW-TS-02 (visual wake feedback)
                        └──is──> ORB-POL-01 (wake burst animation)

WW-TS-03 (mic kill switch)
    ├──requires──> tray menu (DESK-04, shipped)
    └──requires──> electron-store (DESK-05, shipped)

WW-TS-04 (persistent status) ──uses──> orb idle gradient + tray icon
WW-TS-05 (auto-resume) ──requires──> session lifecycle (ACTV-02, shipped)
WW-TS-06 (false-positive timeout) ──uses──> VAD from wake lib or simple timer
WW-TS-07 (threshold .env) ──requires──> WW-TS-01
WW-TS-08 (permission failure) ──requires──> WW-TS-01 + fallback to PTT path

ORB-POL-02 (drag reposition) ──conflicts──> current click-through full-window
    └──pairs-with──> ORB-POL-05 (click-to-PTT) — same non-click-through region
ORB-POL-06 (specular parallax) ──requires──> hover events on orb (not click-through)
ORB-POL-07 (reduced motion) ──orthogonal, ships with all orb work
ORB-POL-04 (idle hue drift) ──orthogonal, pure CSS
ORB-POL-08 (crossfade transitions) ──orthogonal, refactor of Orb.tsx render
```

**Critical dependency note:** Current `Orb.tsx` has `pointerEvents: 'none'` at the root. Any polish feature that needs hover (POL-03, POL-06), click (POL-05), or drag (POL-02) must relax that for the orb body specifically — probably by exposing a small pointer-events-auto region. Whole-window click-through (`setIgnoreMouseEvents` with forward option) is the Electron-recommended path to combine click-through background with an interactive orb center.

---

## MVP Definition (v1.4 scope)

### Must Ship (v1.4 MVP)

Core regression recovery + minimum visual polish to make wake word feel "real."

- [x] **WW-TS-01** — Wake word detection via bumblebee-hotword-node or openwakeword
- [x] **WW-TS-02 / ORB-POL-01** — Visible wake burst on detection (same feature, two labels)
- [x] **WW-TS-03** — Mic pause/resume toggle in tray menu
- [x] **WW-TS-04** — Persistent status indicator (orb idle differs when listening for wake)
- [x] **WW-TS-05** — Auto-resume listening-for-wake after each command cycle
- [x] **WW-TS-06** — Post-wake silence timeout (3–5s) aborts session cleanly
- [x] **WW-TS-07** — Threshold via `.env` (no UI)
- [x] **WW-TS-08** — Mic permission failure falls back to PTT-only
- [x] **WW-TS-09** — Zero cloud audio (verified via library choice)
- [x] **ORB-POL-07** — Reduced-motion mode (accessibility baseline)

### Should Ship (v1.4 if time allows)

Polish that significantly improves perceived quality, each is small enough to squeeze in.

- [ ] **ORB-POL-04** — Idle breathing hue drift (pure CSS, ~15 LOC)
- [ ] **ORB-POL-08** — Crossfade state transitions (refactor, ~30 LOC)
- [ ] **ORB-POL-02** — Drag-to-reposition (needs click-through carveout)

### Defer (v1.5+)

Nice ideas that introduce complexity or touch deferred surfaces.

- [ ] **ORB-POL-03** — Hover tooltip (needs pointer-events rework; can pair with POL-02)
- [ ] **ORB-POL-05** — Click-to-toggle PTT (needs drag-vs-click arbitration first)
- [ ] **ORB-POL-06** — Specular cursor parallax (pure polish, high effort for payoff)

---

## Feature Prioritization Matrix

| Feature | User Value | Cost | Priority | Rationale |
|---------|------------|------|----------|-----------|
| WW-TS-01 Wake word detection | HIGH | MEDIUM | **P1** | Milestone goal. Regression recovery. |
| WW-TS-02 Visual wake feedback | HIGH | LOW | **P1** | Silent wake = broken-feeling product. |
| WW-TS-03 Mic kill switch | HIGH | LOW | **P1** | Privacy baseline. |
| WW-TS-04 Persistent status | HIGH | LOW | **P1** | Trust baseline. |
| WW-TS-05 Auto-resume | HIGH | LOW | **P1** | Without this, wake word is PTT-with-extra-steps. |
| WW-TS-06 Silence timeout | HIGH | LOW | **P1** | False positives otherwise freeze the orb. |
| WW-TS-07 Threshold .env | MED  | LOW | **P1** | Env-noise tolerance. No UI needed. |
| WW-TS-08 Permission fallback | MED  | LOW | **P1** | Don't crash on mic denial. |
| WW-TS-09 No cloud audio | HIGH | LOW | **P1** | Constraint, not feature. Verified by lib choice. |
| ORB-POL-01 Wake burst animation | HIGH | LOW | **P1** | Same as WW-TS-02. |
| ORB-POL-07 Reduced motion | MED  | LOW | **P1** | A11y baseline. Trivial to add. |
| ORB-POL-04 Idle hue drift | MED  | LOW | **P2** | "Alive" feeling. Pure CSS. |
| ORB-POL-08 Crossfade transitions | MED  | LOW | **P2** | Quality feel. Small refactor. |
| ORB-POL-02 Drag reposition | MED  | MED  | **P2** | Useful, but needs click-through rework. |
| ORB-POL-03 Hover tooltip | LOW  | LOW | **P3** | Nice but rework cost only justifies with POL-02/POL-05. |
| ORB-POL-05 Click-to-PTT | MED  | MED  | **P3** | Adds third activation path; not needed with wake+hotkey. |
| ORB-POL-06 Specular parallax | LOW  | MED  | **P3** | Pure eye candy; defer. |

**Legend:** P1 = ship in v1.4 · P2 = ship if phase budget allows · P3 = defer to v1.5+

---

## Competitor / Reference Analysis

Quick scan of how comparable assistants handle the same problems.

| Feature | Alexa / Echo | Siri (macOS) | Mycroft | Home Assistant Voice | JARVIS v1.4 Plan |
|---------|--------------|--------------|---------|----------------------|------------------|
| Wake word visual | Blue ring pulse on device | Menu-bar orb glow + waveform | Screen-mounted image popup | Light bar on hardware | Orb wake burst + listening pulse |
| Mic kill switch | Hardware button + ring turns red | System Pref toggle | `mycroft-stop` command | Hardware mute | Tray menu item + orb gradient change |
| False-positive recovery | ~8s listen window then idle | ~5s listen, then close | Configurable timeout via Precise | 2–5s VAD-based | 3–5s VAD + silence timer |
| Sensitivity tuning | Automatic (no user control) | Hidden (Apple tunes) | `precise.sensitivity` 0.0–1.0 | Configurable per wake word | `.env` threshold 0.0–1.0, default 0.5 |
| Persistent status | Always-on light ring | Menu-bar icon state | Eye animation | Light bar | Orb idle gradient + tray icon variant |
| Privacy stance | Cloud STT after wake | Cloud + on-device hybrid | Fully local | Fully local | Fully local (matches Mycroft / HA) |
| Micro-interaction timing | ~300ms wake pulse | ~400ms orb transitions | N/A (screen-bound) | ~200ms ring flash | ~350ms wake burst (inside 200–500ms sweet spot) |

**Takeaway:** JARVIS's planned approach aligns with the Mycroft / Home Assistant school (fully local, user-controlled threshold) with Apple-tier orb visuals (mesh/radial gradients, specular highlights, reduced-motion support). No innovation needed in the wake word UX space — execute table stakes cleanly and the existing orb design does the differentiation.

---

## Research Notes — Library Choice (informational, not binding for FEATURES)

Two viable no-key wake word libs for Node/Electron, both surfaced in STACK research:

1. **bumblebee-hotword-node** (Apache-2) — ships with `jarvis` keyword pre-trained. Sensitivity 0.0–1.0. Accepts Float32Array 16kHz mic stream from Electron. Minimal surface. Last significant activity ~2020 — MEDIUM maintenance risk.
2. **openwakeword via `onnxruntime-node`** — Python-first lib; Node port exists via onnxruntime. Pre-trained "hey jarvis" model. Default threshold 0.5. Silero VAD bundled → free WW-TS-06. More active project but needs Node wiring glue.

**Recommendation:** Prototype bumblebee-hotword-node first (simpler API, fewer moving parts). If maintenance risk or accuracy issues surface, fall back to openwakeword-onnx. This is a STACK-level decision — mentioned here only because it affects WW-TS-06 (bumblebee needs custom silence timer; openwakeword gets VAD free) and WW-TS-07 (both expose threshold).

---

## Sources

- [Wake Word Detection Guide 2026 — Picovoice](https://picovoice.ai/blog/complete-guide-to-wake-word/) — threshold / FAR / FRR trade-off concepts (HIGH confidence)
- [openWakeWord GitHub](https://github.com/dscripka/openWakeWord) — default 0.5 threshold, Silero VAD bundled (HIGH confidence)
- [Rhasspy Wake Word docs](https://rhasspy.readthedocs.io/en/latest/wake-word/) — sensitivity semantics (HIGH confidence)
- [bumblebee-hotword-node on GitHub](https://github.com/jaxcore/bumblebee-hotword-node) — Apache-2, supports "jarvis" keyword, Float32Array input for Electron (HIGH confidence)
- [bumblebee-hotword-node on npm](https://www.npmjs.com/package/bumblebee-hotword-node) — install and usage (HIGH confidence)
- [Home Assistant Wake Word sensitivity discussion](https://community.home-assistant.io/t/wake-word-sensitivity/629189) — real-world tuning patterns (MEDIUM confidence — community thread)
- [Handling False Positives in Wake Word Datasets — FutureBee AI](https://www.futurebeeai.com/knowledge-hub/false-positives-wake-word) — FP mitigation strategies (MEDIUM confidence)
- [Tuning Sensitivity in Wake Word Recognition — FutureBee AI](https://www.futurebeeai.com/knowledge-hub/tune-sensitivity-wake-word) — threshold tuning methodology (MEDIUM confidence)
- [Electron Frameless Window docs](https://zeke.github.io/electron.atom.io/docs/api/frameless-window/) — `-webkit-app-region: drag` pattern, `setIgnoreMouseEvents` for click-through (HIGH confidence)
- [electron/electron #23042 — click-through + transparent window](https://github.com/electron/electron/issues/23042) — known constraints on transparent click-through (HIGH confidence — official repo)
- [UI/UX Evolution 2026: Micro-Interactions — Primotech](https://primotech.com/ui-ux-evolution-2026-why-micro-interactions-and-motion-matter-more-than-ever/) — 200–500ms micro-interaction sweet spot (MEDIUM confidence — design blog)
- [SmoothUI Siri Orb component](https://smoothui.dev/docs/components/siri-orb) — `prefers-reduced-motion` pattern (HIGH confidence)
- [metasidd/Orb — SwiftUI mesmerizing orb](https://github.com/metasidd/Orb) — particle / glow / mesh gradient reference design (HIGH confidence)
- [Mycroft Precise wake word docs](https://mycroft-ai.gitbook.io/docs/mycroft-technologies/precise) — sensitivity 0.1–0.9, default 0.5 (HIGH confidence)
- [MMM-mycroft-wakeword visual indicator module](https://forum.magicmirror.builders/topic/14895/mmm-mycroft-wakeword) — open source wake-visual-feedback reference (MEDIUM confidence — community module)

---
*Feature research for: JARVIS v1.4 Voice & UX Polish*
*Researched: 2026-04-11*
