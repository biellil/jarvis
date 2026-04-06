# Phase 12: Hotkey + Text Chat - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-06
**Phase:** 12-hotkey-text-chat
**Areas discussed:** Input UI, Hotkey Fallback, Response Display

---

## Input UI

| Option | Description | Selected |
|--------|-------------|----------|
| Abaixo do orb (sempre visível) | Input fixo abaixo da bola azul - widget fica maior (~200px altura). Simples, sempre acessível. | |
| Sobreposto ao orb (aparece ao ativar) | Widget mantém tamanho pequeno (128px). Input aparece por cima do orb quando ativado via hotkey ou clique. | |
| Popup separado ao lado | Segunda janela pequena que aparece ao lado do orb quando ativado. Mais complexo, mas orb mantém visual limpo. | |

**User's choice:** "so vai parece texto quando tive desativao a voz e quando nao teve o arquivo de audio ai vai apraece abaixo da orb"

**Notes:** Input de texto é um **fallback** - só aparece quando voz está desativada ou não há áudio disponível. Widget tem um **botão** que ao ser clicado faz o input aparecer abaixo do orb.

---

## Hotkey Fallback

### Primeira Pergunta

| Option | Description | Selected |
|--------|-------------|----------|
| Tentar alternativa automática | Sistema tenta Ctrl+Alt+J, depois Ctrl+Shift+Space, etc. Mostra notificação com qual funcionou. | |
| Avisar usuário e usar tray | Mostra erro dizendo que hotkey falhou. Usuário pode ativar via tray icon (clique). Mais simples. | |
| Deixar configurável | Permite usuário escolher outro atalho nas configurações. Precisa UI de settings (fora do escopo agora). | ✓ |

**User's choice:** "Deixar configurável"

**Notes:** Usuário quer configuração, mas sem criar tela de settings separada. Solução: adicionar no menu do tray (onde já tem Show/Hide/Quit).

### Segunda Pergunta (Refinamento)

| Option | Description | Selected |
|--------|-------------|----------|
| Submenu com opções | Configure Hotkey > Ctrl+Shift+J, Ctrl+Alt+J, Ctrl+Space, etc. Clica e troca na hora. | ✓ |
| Dialog para gravar teclas | Clica em Configure Hotkey → abre janelinha 'Press your hotkey' → usuário aperta as teclas → salva. | |
| Input de texto simples | Abre prompt nativo do Electron pedindo pra digitar (ex: 'Ctrl+Shift+J'). Rápido mas menos intuitivo. | |

**User's choice:** "Submenu com opções"

**Notes:** Submenu no tray icon com lista pré-definida de hotkeys. Simples, direto, sem necessidade de UI complexa.

---

## Response Display

### Primeira Pergunta

| Option | Description | Selected |
|--------|-------------|----------|
| Balão/bubble acima do orb | Tooltip-style ou speech bubble que aparece por cima do orb com a resposta. Desaparece após alguns segundos. | |
| Texto abaixo do input | Resposta aparece como texto abaixo da caixa de input (chat-style). Fica visível até próxima mensagem. | |
| Notificação do sistema | Usa notificação nativa do Windows/macOS. Simples mas sai do widget. | |
| Só TTS (sem texto) | Resposta só falada (Fase 13). Widget não mostra texto, só orb muda estado. Minimalista. | Initially selected |

**User's choice:** "Só TTS (sem texto)"

**Notes:** Usuário inicialmente queria só voz, mas após clarificação sobre o roadmap (TTS vem depois, Fase 12 é text chat), decidiu usar balão de texto por enquanto. No futuro, API retornará texto + áudio opcional.

### Segunda Pergunta (Refinamento após clarificação)

| Option | Description | Selected |
|--------|-------------|----------|
| Balão acima do orb | Tooltip/speech bubble que aparece por cima. Desaparece após leitura. | ✓ |
| Texto abaixo do input | Chat-style: mensagem do usuário, depois resposta do JARVIS abaixo. Histórico visível. | |
| Sobreposto ao orb | Texto aparece por cima do orb, centralizado. Widget cresce temporariamente. | |
| Notificação nativa | Usa sistema de notificações do Windows. Sai do widget mas é menos trabalho. | |

**User's choice:** "Balão acima do orb"

**Notes:** Speech bubble acima do orb. Permanece visível até próxima mensagem ser enviada. Cresce verticalmente para mostrar toda a resposta (sem scroll, sem limite).

---

## Claude's Discretion

- **Orb Feedback Timing:** Quando exatamente mudar estados (idle → processing → responding → idle)
- **Balão Styling:** Cores, sombras, animação de entrada/saída
- **Botão de Input:** Ícone, posição exata, tamanho
- **Error Handling:** Feedback de erros de rede/API

---

## Deferred Ideas

Durante a discussão foram mencionadas ideias que pertencem a fases futuras:
- Chat history UI persistente
- Markdown rendering em respostas
- Streaming token-a-token no widget
- Custom hotkey input (digitar qualquer combinação)
