# Phase 13: Audio Endpoint + Voice Input - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-07
**Phase:** 13-audio-endpoint-voice-input
**Areas discussed:** Interação do botão PTT, Formato de áudio, Tratamento de erros

---

## Interação do botão PTT

### Question 1: Como o botão de push-to-talk deve funcionar?

| Option | Description | Selected |
|--------|-------------|----------|
| Press-and-hold (recomendado) | Segura o botão → grava. Solta → para e envia. Natural para voz, menos cliques, já é padrão em apps de voz | |
| Toggle (click pra ligar/desligar) | Clica 1x → começa a gravar. Clica 2x → para e envia. Mais fácil em touchscreens, mas pode esquecer de parar | |
| Híbrido (hold OU toggle) | Aceita ambos: segurar OU clicar. Mais flexível, mas UX pode confundir | |

**User's choice:** "no caso quero ativa por comando de voz mesmo como 'javris oi como esta o cliena hj' ai palva de ativasao seria ajvers mais tmb quero de opiçao de apretao o botao ai fala quando salta o botao vai ser procesaod"

**Notes:**
- Usuário quer ativação por comando de voz (wake word "jarvis") + opção de apertar botão
- Wake word já existe no v1.0 Python, mas integração com Electron é fora do escopo
- Deferred para fase futura
- PTT será via hotkey (não botão visual), comportamento press-and-hold

---

### Question 2: Onde posicionar o botão de PTT no widget?

| Option | Description | Selected |
|--------|-------------|----------|
| Substituir botão de texto (recomendado) | Botão muda de ícone: teclado → microfone ao clicar. Economiza espaço, input de texto fica escondido quando em modo voz | |
| Adicionar separado do texto | Texto e voz disponíveis ao mesmo tempo. Mais opções visíveis, mas widget fica maior/mais poluído | |
| Sobrepor o orb | Orb vira botão interativo: clica no orb = PTT. Minimalista, mas pode confundir (orb é feedback, não controle) | |

**User's choice:** "nao vai ser botao no visail e sum um botao configurado no telado"

**Notes:**
- Não é botão visual no widget
- PTT via hotkey configurável no teclado
- Configuração no tray menu (igual Ctrl+Shift+J do widget)

---

### Question 3: Qual tecla padrão para push-to-talk?

| Option | Description | Selected |
|--------|-------------|----------|
| Space (recomendado) | Fácil de alcançar, comum em games/Discord. Pode conflitar se usuário estiver digitando em outro app | |
| Ctrl+Space | Menos conflito que Space sozinho, ainda fácil de segurar | |
| CapsLock (hold) | Tecla grande, fácil de segurar. Mas CapsLock tem comportamento especial no OS | |
| Tecla customizável (menu tray) | Usuário escolhe via menu (igual hotkey do widget Ctrl+Shift+J). Sem padrão inicial | ✓ |

**User's choice:** Tecla customizável (menu tray)

**Notes:**
- Sem padrão inicial — usuário escolhe via tray menu
- Opções pré-definidas: Space, Ctrl+Space, CapsLock (hold), etc.
- Persistência via electron-store

---

## Formato de áudio

### Question 4: MediaRecorder grava em webm/opus (formato web). Converter para WAV antes de enviar ao FastAPI?

| Option | Description | Selected |
|--------|-------------|----------|
| Converter para WAV no renderer (recomendado) | AudioContext.decodeAudioData() + PCM encoding no frontend antes de enviar. Whisper aceita WAV direto. Mais compatibilidade, arquivo maior (~10x) | ✓ |
| Enviar webm direto, converter no FastAPI | FastAPI recebe webm, usa ffmpeg/pydub para converter antes do Whisper. Arquivo menor na rede, mais processamento no servidor | |
| Enviar webm, Whisper aceita direto | faster-whisper pode aceitar webm? Precisa testar. Melhor caso: sem conversão. Risco: Whisper pode não suportar | |

**User's choice:** Converter para WAV no renderer (recomendado)

**Notes:**
- AudioContext.decodeAudioData() + PCM encoding no renderer
- FastAPI recebe WAV pronto para Whisper
- Taxa de amostragem: 16kHz (padrão Whisper)
- Mais compatibilidade, garantia de funcionamento

---

## Tratamento de erros

### Question 5: Como mostrar NotAllowedError (sem permissão de microfone)?

| Option | Description | Selected |
|--------|-------------|----------|
| Balão de erro acima do orb (recomendado) | Mesmo local da resposta, mas vermelho: 'Microfone bloqueado. Libere nas configurações do sistema.' Consistente com UI existente | |
| Notificação do OS | Electron notification API. Mais visível se widget minimizado, mas sai do contexto visual | |
| Orb vermelho + tooltip | Orb fica vermelho, hover mostra erro. Sutil, mas pode passar despercebido | ✓ |

**User's choice:** Orb vermelho + tooltip

**Notes:**
- Orb fica vermelho quando erro acontece
- Tooltip mostra mensagem de erro ao passar mouse
- Persiste até usuário tentar novamente

---

### Question 6: Como tratar timeout de rede ou falha ao enviar áudio?

| Option | Description | Selected |
|--------|-------------|----------|
| Balão de erro (recomendado) | 'Erro ao enviar áudio. Tente novamente.' Mesmo padrão do texto (Phase 12 já trata assim) | |
| Orb vermelho + retry automático | Orb vermelho, tenta reenviar 2x antes de mostrar erro. Menos friction, mas delay pode confundir | ✓ |
| Silêncio (volta ao idle) | Ignora erro, volta ao idle. Usuário percebe que não respondeu e tenta de novo. Minimalista, mas sem feedback | |

**User's choice:** Orb vermelho + retry automático

**Notes:**
- Retry automático: 2 tentativas antes de mostrar erro definitivo
- Orb vermelho brevemente a cada retry
- Erro definitivo: orb vermelho permanente + tooltip "Erro ao conectar"

---

## Claude's Discretion

**Implementation details left to planner/executor:**
- Formato exato do buffer IPC (Uint8Array, ArrayBuffer, base64)
- Nome do campo multipart (audio, file, recording)
- Gateway proxy: buffer em memória vs temp file
- FastAPI temp file handling
- Backoff entre retries
- Max recording duration (30s, 60s, ilimitado)

---

## Deferred Ideas

**Wake Word Integration (Electron):**
- Usuário quer ativação por comando de voz ("jarvis")
- v1.0 já tem wake word no Python CLI
- Integração com Electron requer audio stream contínuo + VAD
- Deferred para Phase 14 ou v1.3
- Rationale: Phase 13 foca em PTT básico funcionando
