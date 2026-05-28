# Phase 84: Fix PC Control Tools - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-28
**Phase:** 84-fix-pc-control-python-native-fallback
**Areas discussed:** Qual é o bug exato

---

## Qual é o bug exato

| Option | Description | Selected |
|--------|-------------|----------|
| open_folder não funciona no Windows | os.startfile falha ou abre pasta errada | |
| launch_app não encontra o app | shutil.which() retorna None | |
| Ambos falham em cenários específicos | Os dois têm problemas | |
| Falha de import / dependência ausente | Biblioteca não instalada quebra módulo | |
| (Freeform) | "só foi implementado conexão entre LLM e Electron em questão de abrir pasta. No Python dá erro avisando que Electron não está aberto" | ✓ |

**User's choice:** Root cause: `request_file_action` requer `clientId` do Electron; Python client não envia `x-jarvis-client-id` header → erro "Electron não conectado"

**Notes:** Codebase investigation revelou: system prompt instrui LLM a usar `request_file_action` (não as velhas `open_folder`/`open_app` tools). Tool faz fetch para `/internal/dispatch-action` no gateway, que busca WS Electron por clientId. Python nunca envia clientId → erro imediato antes de qualquer SSE event.

---

## Abordagem de fix

| Option | Description | Selected |
|--------|-------------|----------|
| Mudar o roteamento da tool | request_file_action cai no SSE quando clientId vazio | |
| Trocar a tool usada pelo LLM | System prompt usa open_folder/open_app para Python | |
| Python envia clientId + gateway adiciona SSE path | Padrão simétrico ao WS do Electron | ✓ |

**User's choice:** Abordagem arquitetural correta — Python envia clientId, gateway adiciona SSE dispatch path

---

## Registro do Python no gateway

| Option | Description | Selected |
|--------|-------------|----------|
| SSE persistente dedicada | Python abre /api/actions/events?clientId={uuid} no boot | ✓ |
| Reutilizar SSE stream do chat | Stream existente, mas é per-mensagem | |

**User's choice:** SSE persistente — espelha o padrão WS do Electron, mas usando SSE

---

## ACK do Python

| Option | Description | Selected |
|--------|-------------|----------|
| POST /api/actions/ack (novo endpoint) | Python executa e POSTa {requestId, status} | ✓ |
| Incluso no próximo chat message | Mais simples mas não funciona async | |

**User's choice:** POST /api/actions/ack — espelha exatamente o WS action_ack do Electron

---

## Confirmação no terminal

| Option | Description | Selected |
|--------|-------------|----------|
| Não — executar direto | Ações não-destrutivas, sem fricção | |
| Sim — pedir confirmação via terminal | Mais cauteloso | ✓ |

**User's choice:** Pedir confirmação via terminal (5s timeout)

---

## Escopo closeFile

| Option | Description | Selected |
|--------|-------------|----------|
| Incluir na mesma fase | close_app() já existe via psutil | ✓ |
| Deixar fora desta fase | Focar só em openFolder/openFile | |

**User's choice:** Incluir — reutiliza close_app() sem esforço extra

---

## Claude's Discretion

- UUID in-memory vs persistido em disco
- Nome exato do Map para SSE clients no gateway
- Formato exato do evento SSE
- Detecção de clientType (prefix no clientId vs registro separado)
- Timeout de reconexão SSE

## Deferred Ideas

- viewContent via Python SSE dispatch (mesma arquitetura, extensão natural)
- Python como cliente WS em vez de SSE+POST (mais simétrico mas mais trabalho)
- Confirmação por voz (confirm_destructive() já suporta, mas não é foco desta fase)
