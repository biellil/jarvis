# Phase 73: Terminal Chat - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — este log preserva as alternativas consideradas.

**Date:** 2026-05-18
**Phase:** 73-terminal-chat
**Areas discussed:** Apresentação do terminal, Histórico da sessão, API key / auth, Falha mid-stream

---

## Apresentação do terminal

| Option | Description | Selected |
|--------|-------------|----------|
| plain print() — sem rich | Prompt `> `, tokens impressos direto. Zero dep nova. Phase 77 traz rich. | ✓ |
| rich já aqui — colorido | Usuário em azul, JARVIS em verde, erros em vermelho. | |
| rich + markdown rendered | Respostas passam por rich.Markdown para headers, bold, code blocks. | |

**User's choice:** plain print() — sem rich
**Notes:** Rich entra em Phase 77 com o status line. MVP sem overhead de styling.

Prompt de input: `input('> ')` — padrão com seta, sem label extra.

---

## Histórico da sessão

| Option | Description | Selected |
|--------|-------------|----------|
| Scroll natural do terminal | Sem código extra — terminal mantém tudo na tela. | ✓ |
| Lista em memória + /history | Armazena pares (user, assistant), acessível via /history. | |
| Exibição automática no início | Mostra N últimos turnos ao iniciar. | |

**User's choice:** Scroll natural do terminal
**Notes:** Satisfaz PYCHAT-03 sem overhead. Terminal já é o histórico.

Contexto multi-turno: cada mensagem é independente — sem envio de histórico ao gateway no MVP.

---

## API key / auth

| Option | Description | Selected |
|--------|-------------|----------|
| Não — sem auth no MVP | Gateway local, sem Bearer. Adicionar quando houver deploy remoto. | |
| Sim — adicionar api_key ao JarvisConfig agora | Campo api_key: str = '' — extensão do schema (D-07/D-08 compatível). | ✓ |

**User's choice:** Sim — adicionar api_key ao JarvisConfig agora
**Notes:** Load order: `.env JARVIS_API_KEY` → `config.json api_key`. Se não-vazio, injeta `Authorization: Bearer`. Gateway local sem auth funciona com api_key vazio.

---

## Falha mid-stream

| Option | Description | Selected |
|--------|-------------|----------|
| Mostrar parcial + mensagem de erro | Tokens chegados + `[erro: conexão perdida]` | ✓ |
| Descartar parcial + só o erro | Limpa linha incompleta, mostra só o erro. | |
| Retry automático (1x) | Reconecta uma vez antes de falhar. | |

**User's choice:** Mostrar parcial + mensagem de erro
**Notes:** Usuário vê o que estava chegando e sabe que falhou.

Gateway offline pós-health-check: mostrar erro e voltar ao prompt — loop continua, usuário pode tentar novamente.

---

## Claude's Discretion

- Estrutura interna do módulo de chat (chat.py separado vs inline em __main__.py)
- Formato exato das mensagens de erro
- Timeout para SSE request
- Biblioteca para SSE (urllib.request vs httpx)

## Deferred Ideas

Nenhuma ideia fora do escopo surgiu durante a discussão.
