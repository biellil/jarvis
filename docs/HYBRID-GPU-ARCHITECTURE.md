# Arquitetura Híbrida: Docker CPU + GPU Host (Windows)

**Contexto:** Docker Desktop no Windows não suporta GPU AMD nativamente. Esta arquitetura permite usar GPU AMD (Vulkan) no host enquanto mantém backend-ts no Docker.

## Arquitetura

```
┌──────────────────────────────────────────────────┐
│              Windows Host                        │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │  whisper-gpu-service (Python FastAPI)     │  │
│  │  Porta: 9000                               │  │
│  │  GPU: AMD Radeon RX 7600 (Vulkan)         │  │
│  │  Binary: C:\whisper.cpp\build\bin\main.exe│  │
│  │  Model: ggml-medium.bin (1.5GB)           │  │
│  └────────────────────────────────────────────┘  │
│                    ↑                              │
│                    │ HTTP POST /transcribe        │
│                    │ (audio file)                 │
│  ┌────────────────────────────────────────────┐  │
│  │      Docker Desktop (WSL2)                 │  │
│  │  ┌──────────────────────────────────────┐  │  │
│  │  │  backend-ts:8001 (Node.js)           │  │  │
│  │  │  - Recebe áudio do Electron          │  │  │
│  │  │  - Envia para host:9000 (GPU)        │  │  │
│  │  │  - Fallback: CPU se GPU offline      │  │  │
│  │  └──────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

## Implementação

### 1. Compile whisper.cpp no Host (Vulkan)

Siga `docs/GPU-SETUP-WINDOWS-AMD.md`:

```powershell
# Clone e compile com Vulkan
cd C:\
git clone https://github.com/ggerganov/whisper.cpp
cd whisper.cpp

# Configure e compile (Developer PowerShell for VS 2022)
cmake -B build -DGGML_VULKAN=ON -DCMAKE_BUILD_TYPE=Release
cmake --build build --config Release -j

# Baixe modelo medium
Invoke-WebRequest -Uri 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin' -OutFile 'models\ggml-medium.bin'

# Teste
.\build\bin\Release\main.exe -m models\ggml-medium.bin -f samples\jfk.wav -l pt
# Deve mostrar: "using Vulkan device: AMD Radeon RX 7600"
```

### 2. Crie Serviço HTTP GPU no Host

```powershell
# Crie diretório
mkdir C:\whisper-gpu-service
cd C:\whisper-gpu-service
```

**Arquivo: `C:\whisper-gpu-service\app.py`**

```python
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse
import subprocess
import tempfile
import os
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Whisper GPU Service")

WHISPER_BIN = r"C:\whisper.cpp\build\bin\Release\main.exe"
MODEL_PATH = r"C:\whisper.cpp\models\ggml-medium.bin"

# Valida binário e modelo na inicialização
if not os.path.exists(WHISPER_BIN):
    raise FileNotFoundError(f"Whisper binary not found: {WHISPER_BIN}")
if not os.path.exists(MODEL_PATH):
    raise FileNotFoundError(f"Model not found: {MODEL_PATH}")

@app.get("/health")
async def health():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "gpu": "AMD Radeon RX 7600",
        "backend": "Vulkan",
        "model": "medium",
        "model_path": MODEL_PATH
    }

@app.post("/transcribe")
async def transcribe(audio: UploadFile = File(...)):
    """
    Transcreve áudio usando whisper.cpp com GPU Vulkan.

    Args:
        audio: Arquivo de áudio (WAV, MP3, etc.)

    Returns:
        JSON: {"text": "transcrição...", "duration_ms": 1234}
    """
    temp_path = None
    try:
        # Salva áudio temporário
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as f:
            content = await audio.read()
            f.write(content)
            temp_path = f.name

        logger.info(f"Transcribing audio: {temp_path} ({len(content)} bytes)")

        # Chama whisper.cpp com GPU
        import time
        start = time.time()

        result = subprocess.run(
            [WHISPER_BIN, "-m", MODEL_PATH, "-f", temp_path, "-l", "pt", "--output-txt"],
            capture_output=True,
            text=True,
            timeout=60,
            encoding='utf-8'
        )

        duration_ms = int((time.time() - start) * 1000)

        if result.returncode != 0:
            logger.error(f"Whisper failed: {result.stderr}")
            raise HTTPException(
                status_code=500,
                detail=f"Transcription failed: {result.stderr}"
            )

        text = result.stdout.strip()
        logger.info(f"Transcription complete: {len(text)} chars in {duration_ms}ms")

        return JSONResponse({
            "text": text,
            "duration_ms": duration_ms,
            "model": "medium",
            "backend": "vulkan"
        })

    except subprocess.TimeoutExpired:
        logger.error("Whisper timeout")
        raise HTTPException(status_code=504, detail="Transcription timeout")
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Limpa arquivo temporário
        if temp_path and os.path.exists(temp_path):
            os.unlink(temp_path)

if __name__ == "__main__":
    import uvicorn
    logger.info(f"Starting Whisper GPU Service on port 9000")
    logger.info(f"Binary: {WHISPER_BIN}")
    logger.info(f"Model: {MODEL_PATH}")
    uvicorn.run(app, host="0.0.0.0", port=9000, log_level="info")
```

**Instale dependências:**

```powershell
cd C:\whisper-gpu-service
pip install fastapi uvicorn python-multipart
```

**Rode o serviço:**

```powershell
python app.py
```

**Teste:**

```powershell
# Em outro terminal
curl http://localhost:9000/health
# {"status":"healthy","gpu":"AMD Radeon RX 7600",...}
```

### 3. Configure backend-ts para usar GPU Service

**Arquivo: `apps/backend-ts/src/voice/transcribe.ts`**

```typescript
import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

const GPU_SERVICE_URL = process.env.WHISPER_GPU_SERVICE_URL;

export async function transcribe(audioPath: string): Promise<string> {
  // Se GPU service configurado, usa GPU no host
  if (GPU_SERVICE_URL) {
    try {
      return await transcribeWithGPU(audioPath);
    } catch (error) {
      console.warn('GPU transcription failed, falling back to CPU:', error);
      // Fallback para CPU (nodejs-whisper)
      return transcribeWithCPU(audioPath);
    }
  }

  // Caso contrário, usa CPU dentro do Docker
  return transcribeWithCPU(audioPath);
}

async function transcribeWithGPU(audioPath: string): Promise<string> {
  const formData = new FormData();
  formData.append('audio', fs.createReadStream(audioPath));

  const response = await fetch(`${GPU_SERVICE_URL}/transcribe`, {
    method: 'POST',
    body: formData,
    headers: formData.getHeaders(),
    timeout: 60000 // 60s timeout
  });

  if (!response.ok) {
    throw new Error(`GPU service error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  console.log(`GPU transcription: ${data.duration_ms}ms (${data.backend})`);
  return data.text;
}

async function transcribeWithCPU(audioPath: string): Promise<string> {
  // Implementação atual com nodejs-whisper
  // ... código existente ...
}
```

**Atualize `docker-compose.yml`:**

```yaml
services:
  backend-ts:
    environment:
      - WHISPER_MODEL=medium
      # GPU service no host (opcional - fallback para CPU se ausente)
      - WHISPER_GPU_SERVICE_URL=http://host.docker.internal:9000
```

### 4. Rodando o Sistema

**Terminal 1: GPU Service no Host**
```powershell
cd C:\whisper-gpu-service
python app.py
```

**Terminal 2: Docker**
```powershell
cd C:\jarvis
docker compose up
```

**Fluxo:**
1. Electron envia áudio → Gateway (3000)
2. Gateway → backend-ts:8001 (Docker)
3. backend-ts → host.docker.internal:9000 (GPU service)
4. GPU service → whisper.cpp com Vulkan
5. Resultado volta para Electron

## Performance Esperada

### RX 7600 + Vulkan + Medium Model

| Áudio | CPU (Docker) | GPU (Host Vulkan) | Speedup |
|-------|--------------|-------------------|---------|
| 5s    | ~3s          | ~1s               | 3x      |
| 10s   | ~6s          | ~2s               | 3x      |
| 30s   | ~18s         | ~6s               | 3x      |

**Latência total:** ~2-3s para transcrição típica (incluindo HTTP overhead)

## Troubleshooting

### GPU service não inicia

```powershell
# Verifique binário existe
Test-Path C:\whisper.cpp\build\bin\Release\main.exe

# Verifique modelo existe
Test-Path C:\whisper.cpp\models\ggml-medium.bin

# Teste whisper.cpp standalone
cd C:\whisper.cpp
.\build\bin\Release\main.exe -m models\ggml-medium.bin -f samples\jfk.wav -l pt
```

### Docker não alcança GPU service

```powershell
# Dentro do container backend-ts
docker exec -it jarvis-backend-ts sh
curl http://host.docker.internal:9000/health

# Se falhar, verifique firewall Windows
```

### GPU não está sendo usada

```powershell
# Verifique logs do GPU service
# Deve mostrar: "using Vulkan device: AMD Radeon RX 7600"

# Verifique Vulkan detecta GPU
vulkaninfo --summary | findstr "deviceName"
```

## Vantagens da Arquitetura Híbrida

✅ **GPU AMD funciona** — Vulkan no host Windows
✅ **Docker simples** — não precisa de nvidia-docker ou imagens CUDA
✅ **Fallback automático** — CPU se GPU service offline
✅ **Fácil debug** — GPU service roda standalone, fácil testar
✅ **Independente** — GPU service pode ser reiniciado sem parar Docker
✅ **Escalável** — múltiplos containers podem usar mesmo GPU service

## Desvantagens

❌ **Mais um serviço** — precisa rodar GPU service separado
❌ **Latência HTTP** — ~10-50ms overhead (desprezível vs ganho GPU)
❌ **Complexidade** — mais peças móveis

## Alternativas

### Opção 1: Tudo no Host (sem Docker)

Rode backend-ts diretamente no host, compile whisper.cpp com Vulkan, use GPU nativamente.

**Vantagem:** Mais simples, sem overhead HTTP
**Desvantagem:** Perde isolamento Docker, mais difícil deploy

### Opção 2: Cloud API (OpenAI Whisper API)

```env
STT_PROVIDER=openai
OPENAI_API_KEY=sk-...
```

**Vantagem:** Zero setup, rápido, sem GPU local
**Desvantagem:** Custo por requisição, dados vão para cloud

### Opção 3: Aceitar CPU no Docker

Modelo medium em CPU é aceitável para assistente pessoal.

**Vantagem:** Setup simples, funciona out-of-the-box
**Desvantagem:** 3x mais lento que GPU (mas ainda ok)

## Recomendação

**Para uso pessoal:**
- **Comece com CPU no Docker** (situação atual) — funciona bem
- **Se latência incomodar** → implemente arquitetura híbrida
- **Se ainda lento** → considere cloud API

O modelo medium já vai **melhorar muito a acurácia** em português. GPU é nice-to-have, não essencial.

---

**Criado:** 2026-04-13
**Hardware:** AMD Radeon RX 7600
**Modelo:** whisper medium (1.5GB)
**Backend:** Vulkan (não CUDA)
