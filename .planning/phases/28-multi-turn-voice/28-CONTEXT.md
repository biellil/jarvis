# Phase 28: Multi-Turn Voice - Context

**Gathered:** 2026-04-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Permitir que o usuário continue conversando por voz após a resposta TTS do JARVIS sem precisar repetir "Hey JARVIS", com janela de escuta configurável (8 segundos default) e estado visual próprio no orb.

Inclui:
- Janela de follow-up pós-TTS com timeout configurável (MTURN-01)
- Transição silenciosa para idle se não houver fala (MTURN-02)
- Estado visual distinto 'awaiting-followup' no orb (MTURN-03)

Não inclui: Mudanças no backend (só renderer), barge-in durante TTS, multi-turn com contexto persistente multi-sessão.

</domain>

<decisions>
## Implementation Decisions

### Detecção de Fala na Janela (MTURN-01)

- **D-01:** Reusar VAD do useWakeWord — aproveitar instância MicVAD já existente com mesma config (@ricky0123/vad-web), mais eficiente que criar nova instância
- **D-02:** Flag source na sendAudioAndHandle — adicionar parâmetro `source: 'wakeword' | 'followup' | 'ptt'` para tracking/debug/telemetria
- **D-03:** Cancelar timer imediatamente — quando VAD detecta início de fala (`onSpeechStart`), cancela timeout da janela e processa normalmente
- **D-04:** Desabilitar wake word durante follow-up — wake word engine fica pausado completamente durante janela (sem conflito, sem detecções ignoradas)

### Timeout e Transição Silenciosa (MTURN-02)

- **D-05:** Fade suave sem animação — ao expirar janela sem fala, transição gradual de opacidade/cor para idle (sem keyframes bruscas, sem toast)
- **D-06:** Pausar e retomar timer ao minimizar — se app perde foco, pausa timer; ao restaurar, retoma de onde parou (UX inteligente)
- **D-07:** Indicação visual do tempo restante — Claude's discretion (pode ser sutil progress ring/fade ou sem indicação)
- **D-08:** 8 segundos (VITE_MULTI_TURN_WINDOW_MS) é adequado — tempo razoável para formular próxima pergunta

### Estado Visual 'Aguardando Follow-Up' (MTURN-03)

- **D-09:** Novo estado 'awaiting-followup' no OrbState — adicionar 5º estado ao type `'idle' | 'listening' | 'processing' | 'responding' | 'awaiting-followup'` (mais explícito que modifier flag)
- **D-10:** Azul suave diferente do idle — tom azul mais claro ou saturado que idle normal (distinguível mas sutil)
- **D-11:** Pulsação lenta constante — similar ao idle breathing mas um pouco mais rápida (indica "aguardando")
- **D-12:** prefers-reduced-motion support — aplicar @media (prefers-reduced-motion: reduce) consistente com outros estados (Phase 23 pattern)

### Trigger da Listening Window Pós-TTS (MTURN-01)

- **D-13:** Trigger mechanism — Claude's discretion (hook no registerTTSHooks afterPlay callback vs useState effect, escolher baseado em arquitetura existente)
- **D-14:** Ativar em TODA resposta TTS — janela abre sempre que JARVIS fala (comportamento consistente, não depende de comprimento)
- **D-15:** Error handling — se erro backend durante janela, fechar follow-up e voltar ao idle + toast (mesmo padrão PTT)
- **D-16:** Pequeno delay 200-300ms — breve pausa entre TTS terminar e janela abrir (respiro natural na conversa)

### Claude's Discretion

- Indicação visual do tempo restante (D-07) — pode ser sutil ou ausente, baseado em UX minimalista
- Trigger mechanism exato (D-13) — registerTTSHooks afterPlay vs estado callback, escolher melhor fit arquitetural

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

Nenhum spec externo — todos os requirements estão capturados nas decisões acima.

### Renderer Code Context
- `apps/desktop/src/renderer/hooks/useWakeWord.ts` — hook wake word com VAD (@ricky0123/vad-web)
- `apps/desktop/src/renderer/components/Orb/OrbContext.tsx` — OrbState type e provider (4 estados atuais)
- `apps/desktop/src/renderer/src/voice/sendAudioAndHandle.ts` — pipeline compartilhado PTT + wake word
- `apps/desktop/src/renderer/src/audio/ttsPlayer.ts` — registerTTSHooks com beforePlay/afterPlay callbacks
- `apps/desktop/src/renderer/components/Orb/Orb.tsx` — visual rendering por estado + prefers-reduced-motion CSS

### Requirements
- REQUIREMENTS.md — MTURN-01, MTURN-02, MTURN-03

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **OrbContext** — 4 estados atuais ('idle' | 'listening' | 'processing' | 'responding'), setState, triggerWakeBurst()
- **useWakeWord hook** — MicVAD instance, voiceInputManager integration, registerTTSHooks pause/resume
- **sendAudioAndHandle** — função compartilhada PTT + wake word → backend (Phase 24)
- **registerTTSHooks** — beforePlay/afterPlay callbacks para coordenação TTS + wake word
- **@ricky0123/vad-web** — VAD real com onSpeechStart/onSpeechEnd callbacks (Phase 24)

### Established Patterns
- Estados do orb são enum literal no OrbContext, renderizados via switch/case em Orb.tsx
- Animações CSS com @keyframes, controladas via classe condicional baseada em estado
- prefers-reduced-motion aplicado via @media query nas keyframes (Phase 23 - ORB-POL-01)
- registerTTSHooks já usado para pausar wake word durante TTS (Phase 23/24)
- voiceInputManager coordena PTT vs wake word (Phase 22 - "PTT sempre ganha")

### Integration Points
- **afterPlay callback** — ponto natural para triggerar janela de follow-up após TTS terminar
- **OrbState type** — precisa adicionar 'awaiting-followup' e atualizar switch cases em Orb.tsx
- **useWakeWord** — precisa integrar lógica de pausar durante follow-up (além de pausar durante TTS)
- **sendAudioAndHandle** — precisa aceitar source: 'followup' além de 'wakeword' e 'ptt'

</code_context>

<specifics>
## Specific Ideas

**Respiro natural de 200-300ms:** Delay entre TTS terminar e janela abrir reflete pausa natural em conversas humanas — não é latência, é UX intencional.

**Azul suave vs idle:** Tom mais claro/saturado diferencia visualmente mas mantém família de cor (azul = passivo/aguardando, âmbar = ativo/gravando).

**Pausar timer ao minimizar:** Se usuário minimiza app durante janela, pausar timer demonstra que JARVIS "sabe" que você não está prestando atenção — retoma quando volta.

**Cancelar timer ao falar:** Assim que VAD detecta início de fala, cancela timer porque usuário já decidiu continuar — não precisa esperar timeout.

</specifics>

<deferred>
## Deferred Ideas

Nenhuma — discussão permaneceu dentro do escopo da fase.

</deferred>

---

*Phase: 28-multi-turn-voice*
*Context gathered: 2026-04-13*
