# Phase 77: Minimal Terminal UI - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-18
**Phase:** 77-minimal-terminal-ui
**Areas discussed:** Status line rendering, Estado do JARVIS, Config menu trigger, Config menu escopo e navegação

---

## Status line: rendering approach

| Option | Description | Selected |
|--------|-------------|----------|
| Rich Console takeover total | rich.Console substitui todos os print(); Live display no rodapé; sem artifacts | ✓ |
| Status line isolada via ANSI | Mantém print() nos módulos, usa ANSI para sobrescrever última linha; possíveis artifacts | |
| Status só em mudanças de estado | Linha impressa apenas quando estado muda; não é persistente em tempo real | |

**User's choice:** Rich Console takeover total

---

| Option | Description | Selected |
|--------|-------------|----------|
| Módulo ui.py singleton | Novo módulo ui.py com console global e update_status(); segue padrão singletons | ✓ |
| Console importado diretamente do rich | Cada módulo cria seu próprio Console() | |

**User's choice:** Módulo ui.py singleton

---

| Option | Description | Selected |
|--------|-------------|----------|
| Linha fixa no rodapé (rich Live + Layout) | Status fixado na última linha; chat output acima; rich.Live transient=False | ✓ |
| Status como header simples | Re-impresso antes do prompt a cada mudança; sem rich.Live; mais simples | |

**User's choice:** Linha fixa no rodapé (rich Live + Layout)

---

## Estado do JARVIS: quem gerencia

| Option | Description | Selected |
|--------|-------------|----------|
| ui.py gerencia o estado | ui.py expõe set_state(state); módulos chamam quando mudam de estado | ✓ |
| Estado no voice_modes.py | voice_modes.get_state(); chat.py e tts.py precisam de mecanismo separado | |
| Estado global em __init__.py | Variável de módulo compartilhada no pacote | |

**User's choice:** ui.py gerencia o estado

---

| Option | Description | Selected |
|--------|-------------|----------|
| 4 estados: idle/listening/thinking/speaking | Conforme PYUI-01 | ✓ |
| 5 estados: inclui 'processing' separado de 'thinking' | Mais granular | |
| 2 estados: idle/active | Simplificado | |

**User's choice:** 4 estados: idle/listening/thinking/speaking

---

## Config menu: como abrir

| Option | Description | Selected |
|--------|-------------|----------|
| Comando digitado no chat: /config | chat_loop() detecta '/' e trata como comando local; não envia ao gateway | ✓ |
| Atalho de teclado global: Ctrl+, | pynput detecta Ctrl+,; requer coordenação com voice_modes threading | |
| Tecla Esc no terminal | Comportamento variável entre OSes/terminais | |

**User's choice:** Comando digitado no chat: /config

---

| Option | Description | Selected |
|--------|-------------|----------|
| Pausa todos os modos de voz | voice_modes.stop_mode() ao entrar; start_mode() ao sair | ✓ |
| Modos continuam em background | Voice modes seguem rodando; risco de capturar input do menu como fala | |

**User's choice:** Pausa todos os modos de voz ao entrar no menu

---

## Config menu: escopo e navegação

| Option | Description | Selected |
|--------|-------------|----------|
| Apenas os 3 do requirement | Whisper model, TTS provider, voice mode — escopo mínimo conforme PYUI-02 | ✓ |
| 5 campos: inclui kokoro_voice e wake_word_threshold | Mais completo mas aumenta escopo | |
| Todos os campos editáveis do JarvisConfig | Muito para uma fase | |

**User's choice:** Apenas os 3 do requirement (Whisper model, TTS provider, voice mode)

---

| Option | Description | Selected |
|--------|-------------|----------|
| Lista numerada simples | Usuário digita número; funciona em qualquer terminal | ✓ |
| Setas interativas via rich Prompt | Mais polido; pode falhar em WSL/remoto/terminais sem raw mode | |

**User's choice:** Lista numerada simples

---

| Option | Description | Selected |
|--------|-------------|----------|
| Imediatamente ao confirmar cada campo | switch_mode()/reload imediato + save_config() por campo; feedback instantâneo | ✓ |
| Só ao sair do menu (Apply & Exit) | Múltiplas mudanças confirmadas ao sair; mais seguro para combinar | |

**User's choice:** Imediatamente ao confirmar cada campo

---

## Claude's Discretion

- Formato exato do status line visual (layout, cores, separadores)
- Mecanismo de sincronização threading para rich.Live + tokens SSE concorrentes
- Se stt.py precisa de reload_model() nova ou se o singleton pode ser reinicializado
- Se tts.py precisa de set_provider() nova ou se init_tts(config) é reutilizado
- Schema exato do rich.Layout (proporção, panel style)
- Posição do init_ui() na sequência de __main__.py

## Deferred Ideas

- kokoro_voice no menu — fora do escopo desta fase
- PTT hotkey reconfigurável no menu — fora do escopo
- wake_word_threshold no menu — fora do escopo
- local_only toggle no menu — fora do escopo
