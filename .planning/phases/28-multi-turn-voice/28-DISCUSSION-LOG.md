# Phase 28: Multi-Turn Voice - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-13
**Phase:** 28-multi-turn-voice
**Areas discussed:** Detecção de fala na janela, Timeout e transição silenciosa, Estado visual 'aguardando follow-up', Trigger da listening window pós-TTS

---

## Detecção de Fala na Janela

| Option | Description | Selected |
|--------|-------------|----------|
| Reusar VAD do useWakeWord | Aproveitar a instância MicVAD já existente com mesma config (mais eficiente, menos código) | ✓ |
| Nova instância VAD dedicada | MicVAD separada com config específica para follow-up (mais controle, isolação clara) | |
| Você decide | Claude escolhe baseado em performance e manutenção | |

**User's choice:** Reusar VAD do useWakeWord
**Notes:** Aproveitar infraestrutura existente, mais eficiente

---

| Option | Description | Selected |
|--------|-------------|----------|
| Flag na função sendAudioAndHandle | Adicionar parâmetro source: 'wakeword' \| 'followup' para tracking/debug | ✓ |
| Mesmo tratamento para ambos | Não diferenciar - backend trata igual de qualquer forma | |
| Você decide | Claude escolhe baseado em telemetria e debugging | |

**User's choice:** Flag na função sendAudioAndHandle
**Notes:** Útil para tracking e debugging

---

| Option | Description | Selected |
|--------|-------------|----------|
| Ser cancelado imediatamente | Assim que VAD detecta fala, cancela o timer e processa normalmente (mais limpo) | ✓ |
| Continuar em background | Timer continua mas não afeta nada se você já está falando | |
| Você decide | Claude escolhe a abordagem mais simples e segura | |

**User's choice:** Ser cancelado imediatamente
**Notes:** Mais limpo, usuário já decidiu continuar

---

| Option | Description | Selected |
|--------|-------------|----------|
| Desabilitar wake word completamente | Durante janela follow-up, wake word engine fica pausado (mais simples, sem conflito) | ✓ |
| Wake word fica ativo mas ignorado | Engine roda mas detecções são ignoradas durante follow-up | |
| Você decide | Claude escolhe baseado em performance e clareza | |

**User's choice:** Desabilitar wake word completamente
**Notes:** Mais simples, sem conflitos

---

## Timeout e Transição Silenciosa

| Option | Description | Selected |
|--------|-------------|----------|
| Fade suave sem animação | Transição gradual de opacidade/cor, sem keyframes (MTURN-02 - silenciosa) | ✓ |
| Instantânea sem feedback | Muda estado direto, sem transição visual alguma | |
| Você decide | Claude escolhe baseado em UX e requirement MTURN-02 | |

**User's choice:** Fade suave sem animação
**Notes:** Transição silenciosa mas não brusca

---

| Option | Description | Selected |
|--------|-------------|----------|
| Cancelar janela imediatamente | Se minimizar/perder foco, cancela follow-up e volta pro idle (mais seguro) | |
| Continuar em background | Timer continua mesmo minimizado (pode ser confuso) | |
| Pausar e retomar ao voltar | Pausa timer ao minimizar, retoma ao restaurar (complexo) | ✓ |
| Você decide | Claude escolhe baseado em simplicidade | |

**User's choice:** Pausar e retomar ao voltar
**Notes:** Mais inteligente, demonstra que JARVIS "sabe" quando usuário não está prestando atenção

---

| Option | Description | Selected |
|--------|-------------|----------|
| Sem indicação de tempo | Usuário não vê countdown, só sabe que pode falar (mais limpo) | |
| Sutil progress ring/fade | Anel ou opacidade que diminui gradualmente nos 8s (feedback visual) | |
| Você decide | Claude escolhe baseado em UX minimalista | ✓ |

**User's choice:** Você decide
**Notes:** Claude's discretion sobre indicação visual

---

| Option | Description | Selected |
|--------|-------------|----------|
| 8 segundos é bom | Tempo razoável para formular próxima pergunta (recomendado) | ✓ |
| Mais curto (5-6s) | Menos espera se não for falar | |
| Mais longo (10-12s) | Mais tempo para pensar na próxima pergunta | |
| Você decide | Claude escolhe baseado em padrões de conversas | |

**User's choice:** 8 segundos é bom
**Notes:** Default adequado conforme ROADMAP.md

---

## Estado Visual 'Aguardando Follow-Up'

| Option | Description | Selected |
|--------|-------------|----------|
| Novo estado 'awaiting-followup' | Adicionar 5º estado ao OrbState type (mais explícito, MTURN-03 compliant) | ✓ |
| Modifier flag no idle | Manter 4 estados, adicionar inFollowUpWindow: boolean (menos invasivo) | |
| Você decide | Claude escolhe baseado em manutenção e clareza | |

**User's choice:** Novo estado 'awaiting-followup'
**Notes:** Mais explícito e compliant com MTURN-03

---

| Option | Description | Selected |
|--------|-------------|----------|
| Azul suave diferente do idle | Tom azul mais claro ou saturado que idle (sutil mas distinguível) | ✓ |
| Âmbar/laranja suave | Entre idle (azul) e listening (âmbar forte) - meio termo visual | |
| Verde suave | Cor neutra indicando 'pronto para ouvir' | |
| Você decide | Claude escolhe baseado em teoria de cores e UX | |

**User's choice:** Azul suave diferente do idle
**Notes:** Mantém família de cor (azul = passivo)

---

| Option | Description | Selected |
|--------|-------------|----------|
| Pulsação lenta constante | Similar ao idle breathing mas um pouco mais rápida (indica 'aguardando') | ✓ |
| Static sem animação | Cor fixa, sem movimento (minimalista) | |
| Anel externo pulsante | Core static, anel externo pulsa suavemente | |
| Você decide | Claude escolhe baseado em feedback visual sutil | |

**User's choice:** Pulsação lenta constante
**Notes:** Similar idle breathing, levemente mais rápida

---

| Option | Description | Selected |
|--------|-------------|----------|
| Mesmo tratamento que outros estados | Aplicar @media (prefers-reduced-motion: reduce) para remover/reduzir animação (consistente com Phase 23) | ✓ |
| Sempre static nesse estado | Ignorar preferência, sempre sem animação | |
| Você decide | Claude segue padrão existente | |

**User's choice:** Mesmo tratamento que outros estados
**Notes:** Consistente com Phase 23 (ORB-POL-01)

---

## Trigger da Listening Window Pós-TTS

| Option | Description | Selected |
|--------|-------------|----------|
| Hook no afterPlay do TTS | registerTTSHooks afterPlay callback inicia janela (reusa infraestrutura existente) | |
| Event listener no AudioContext | Ouvir evento 'ended' do TTS diretamente | |
| setState('responding') → callback | Quando orb sai de 'responding', triggera automaticamente | |
| Você decide | Claude escolhe baseado em arquitetura existente | ✓ |

**User's choice:** Você decide
**Notes:** Claude's discretion sobre melhor fit arquitetural

---

| Option | Description | Selected |
|--------|-------------|----------|
| Toda resposta TTS | Sempre que JARVIS fala, abre janela (comportamento consistente) | ✓ |
| Apenas respostas curtas | Só ativa se resposta < 20 palavras (evita follow-up em explicações longas) | |
| Feature flag toggleável | Usuário pode ativar/desativar via config (mais flexível) | |
| Você decide | Claude escolhe baseado em UX natural | |

**User's choice:** Toda resposta TTS
**Notes:** Comportamento consistente, não depende de comprimento

---

| Option | Description | Selected |
|--------|-------------|----------|
| Fechar janela e voltar ao idle | Cancela follow-up, mostra toast de erro (como PTT atual) | ✓ |
| Manter janela aberta | Permite retry mesmo com erro anterior | |
| Você decide | Claude escolhe baseado em recovery patterns | |

**User's choice:** Fechar janela e voltar ao idle
**Notes:** Consistente com padrão PTT de error handling

---

| Option | Description | Selected |
|--------|-------------|----------|
| Sem delay (imediato) | TTS termina → instantly entra em awaiting-followup | |
| Pequeno delay (200-300ms) | Breve pausa antes de ativar janela (respiro natural) | ✓ |
| Você decide | Claude escolhe baseado em UX de conversa | |

**User's choice:** Pequeno delay (200-300ms)
**Notes:** Respiro natural na conversa, não é latência

---

## Claude's Discretion

- Indicação visual do tempo restante (D-07) — pode ser sutil progress ring/fade ou sem indicação
- Trigger mechanism exato (D-13) — registerTTSHooks afterPlay vs estado callback

## Deferred Ideas

Nenhuma ideia foi diferida — discussão permaneceu dentro do escopo da fase.
