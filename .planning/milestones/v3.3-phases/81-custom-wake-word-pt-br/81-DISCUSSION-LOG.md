# Phase 81: Custom Wake Word pt-BR - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-21
**Phase:** 81-custom-wake-word-pt-br
**Areas discussed:** Approach de treino, UX de gravação, Corpus negativo, Isolamento do script

---

## Approach de Treino

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-detect + branch | Calibra scores primeiro; verifier se mediana > 0.25; Colab fallback se não | ✓ |
| Full openwakeword training | Piper TTS + train.py; requer WSL2 no Windows; ~15 GB deps | |
| Verifier model apenas | Logistic regression por cima do hey_jarvis_v0.1.onnx; nativo no Windows | |
| Colab only | Notebook Colab; processo manual; sem execução local | |

**User's choice:** Auto-detect + branch (Recomendado)
**Notes:** Approach pragmático que evita a fricção do full training no Windows enquanto mantém caminho para modelo de qualidade via Colab se necessário.

---

## UX de Gravação

| Option | Description | Selected |
|--------|-------------|----------|
| Countdown + auto-stop | "Gravando em 3...2...1..." com janela 2.5s; zero deps novas; rich animado | ✓ |
| PTT (push-to-talk) | Tecla para iniciar/parar; controle total; msvcrt/pynput | |
| Silence detection | Para no silêncio; webrtcvad dep; calibração de threshold | |
| Hybrid countdown + silence | Countdown + silence fallback + 2s hard cap | |

**User's choice:** Countdown + auto-stop (Recomendado)
**Notes:** PTT disponível como flag `--ptt` para power users. Feedback de RMS por amostra para indicar qualidade do sinal.

---

## Corpus Negativo

| Option | Description | Selected |
|--------|-------------|----------|
| AudioSet/FMA fetch + gravação ao vivo | ~1-2 GB cached + 5 min ambiente do usuário | ✓ |
| Só AudioSet/FMA | Apenas corpus público; sem sessão extra de gravação | |
| Só gravação ao vivo | 5-15 min ambiente; offline total; corpus pequeno | |
| TTS sintético + gravação ao vivo | kokoro gera frases pt-BR + ambiente; offline total | |

**User's choice:** AudioSet/FMA fetch + gravação ao vivo (Recomendado)
**Notes:** Camada adicional de TTS sintético via kokoro (frases pt-BR como "olá jarvis", "google") como D-08.

---

## Isolamento do Script

| Option | Description | Selected |
|--------|-------------|----------|
| PEP 723 inline metadata | Bloco `# /// script` no topo do arquivo; uv isola automaticamente | ✓ |
| pyproject.toml em tools/ | Dir separado + pyproject.toml + uv.lock | |
| uv run --with flags | Deps via CLI flags; zero arquivos; sem locking | |

**User's choice:** PEP 723 inline metadata (Recomendado)
**Notes:** `uv run apps/desktop-py/tools/train_wake_word.py` — uv cria venv isolado automaticamente, sem tocar no venv principal.

---

## Claude's Discretion

- Threshold exato de mediana para branch decision (0.25 é ponto de partida)
- URLs de download do AudioSet/FMA slice
- Arquitetura interna do verifier (logistic regression vs. SVM vs. gradient boosting)
- Formato do `.pkl` e como converter para `.onnx` via skl2onnx
- Número de chunks do ACAV100M feature extractor usados como input

## Deferred Ideas

- Retreino incremental sem refazer todo o processo — milestone futuro
- GUI Electron para o script de treino — fora do escopo desta fase
- Múltiplos wake words customizados — v3.4+
