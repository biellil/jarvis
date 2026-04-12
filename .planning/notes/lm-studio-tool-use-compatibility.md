# LM Studio — Compatibilidade de Tool Use com LangChain

**Contexto:** Descoberto durante UAT da Phase 24 (2026-04-12). O Ministral 3B retornava texto vazio no pipeline de voz porque o LangChain `createReactAgent` envia tool calls no formato OpenAI, e o modelo não tinha suporte nativo.

## Problema

O LM Studio tem dois modos de tool use:

1. **Native** — modelo tem chat template com suporte a tools. LM Studio parseia os tool_calls corretamente no formato OpenAI (`response.choices[0].message.tool_calls`).
2. **Default** — modelo NÃO tem template nativo. LM Studio injeta um system prompt custom com `[TOOL_REQUEST]` tags. Resultados variam por modelo.

O LangChain `createReactAgent` espera o formato OpenAI nativo. Quando o modelo usa o modo Default, as tool_calls vêm malformadas ou vazias → o agent nunca gera uma AIMessage final → `extractFinalAiText` retorna string vazia → TTS recebe "empty text" → HTTP 500.

## Modelos com suporte nativo no LM Studio

| Modelo | Download | Tamanho | Tool Use |
|--------|----------|---------|----------|
| **Qwen 2.5 7B Instruct** | `lmstudio-community/Qwen2.5-7B-Instruct-GGUF` | ~4.7 GB | Nativo |
| **Llama 3.1 8B Instruct** | `lmstudio-community/Meta-Llama-3.1-8B-Instruct-GGUF` | ~4.9 GB | Nativo |
| **Ministral 8B Instruct** | `bartowski/Ministral-8B-Instruct-2410-GGUF` | ~4.7 GB | Nativo |
| Ministral 3B | `mistralai/ministral-3-3b` | ~2 GB | Default (NÃO funciona) |

Modelos com suporte nativo aparecem com badge de martelo no LM Studio.

## Como verificar se um modelo funciona

```bash
curl http://localhost:1234/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "MODELO_AQUI",
    "messages": [{"role": "user", "content": "que horas são?"}],
    "tools": [{
      "type": "function",
      "function": {
        "name": "get_time",
        "description": "Returns current time",
        "parameters": {"type": "object", "properties": {}, "required": []}
      }
    }]
  }'
```

Se `response.choices[0].message.tool_calls` vier preenchido → funciona.
Se `response.choices[0].message.content` vier com `[TOOL_REQUEST]` em texto → modo Default, NÃO funciona com LangChain.

## Configuração no .env

Após carregar o modelo no LM Studio, verificar o nome exato:

```bash
curl http://localhost:1234/v1/models
```

Usar o `id` retornado nos dois campos:

```env
LLM_MODEL=<id do modelo>
LM_STUDIO_MODEL=<id do modelo>
```

## Bug relacionado corrigido

`extractFinalAiText` usava `instanceof AIMessage` que não detectava `AIMessageChunk` (retornado pelo `createReactAgent`). Fix: trocado para `_getType() === 'ai'`. Commit: `1dbd3c9`.

## Fonte

- LM Studio docs: Tool Use (https://lmstudio.ai/docs/developer/tool-use)
- Lista de modelos com suporte nativo está na seção "Supported Models" da doc
