# Script de setup automatizado para GPU Service
# Uso: .\scripts\setup-gpu-service.ps1

Write-Host "=== Whisper GPU Service Setup ===" -ForegroundColor Cyan
Write-Host ""

# 1. Verifica se whisper.cpp foi compilado
$whisperBin = "C:\whisper.cpp\build\bin\Release\main.exe"
$modelPath = "C:\whisper.cpp\models\ggml-medium.bin"

if (-not (Test-Path $whisperBin)) {
    Write-Host "❌ whisper.cpp não encontrado em $whisperBin" -ForegroundColor Red
    Write-Host "   Siga o guia: docs/GPU-SETUP-WINDOWS-AMD.md" -ForegroundColor Yellow
    Write-Host "   Ou rode: .\scripts\compile-whisper-vulkan.ps1" -ForegroundColor Yellow
    exit 1
}

if (-not (Test-Path $modelPath)) {
    Write-Host "❌ Modelo medium não encontrado em $modelPath" -ForegroundColor Red
    Write-Host "   Baixando modelo medium (1.5GB)..." -ForegroundColor Yellow

    New-Item -ItemType Directory -Force -Path "C:\whisper.cpp\models" | Out-Null

    Invoke-WebRequest `
        -Uri "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin" `
        -OutFile $modelPath

    Write-Host "✅ Modelo baixado" -ForegroundColor Green
}

Write-Host "✅ whisper.cpp compilado: $whisperBin" -ForegroundColor Green
Write-Host "✅ Modelo medium: $modelPath" -ForegroundColor Green
Write-Host ""

# 2. Cria diretório do serviço
$serviceDir = "C:\whisper-gpu-service"
if (-not (Test-Path $serviceDir)) {
    New-Item -ItemType Directory -Path $serviceDir | Out-Null
    Write-Host "✅ Criado: $serviceDir" -ForegroundColor Green
}

# 3. Cria app.py
$appPy = @"
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse
import subprocess
import tempfile
import os
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Whisper GPU Service", version="1.0.0")

WHISPER_BIN = r"$whisperBin"
MODEL_PATH = r"$modelPath"

# Valida na inicialização
if not os.path.exists(WHISPER_BIN):
    raise FileNotFoundError(f"Whisper binary not found: {WHISPER_BIN}")
if not os.path.exists(MODEL_PATH):
    raise FileNotFoundError(f"Model not found: {MODEL_PATH}")

@app.get("/")
async def root():
    return {"service": "Whisper GPU Service", "status": "running"}

@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "gpu": "AMD Radeon RX 7600",
        "backend": "Vulkan",
        "model": "medium",
        "model_size": "1.5GB",
        "binary": WHISPER_BIN,
        "model_path": MODEL_PATH
    }

@app.post("/transcribe")
async def transcribe(audio: UploadFile = File(...)):
    temp_path = None
    try:
        # Salva áudio temporário
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as f:
            content = await audio.read()
            f.write(content)
            temp_path = f.name

        logger.info(f"Transcribing: {temp_path} ({len(content)} bytes)")

        import time
        start = time.time()

        # Chama whisper.cpp
        result = subprocess.run(
            [WHISPER_BIN, "-m", MODEL_PATH, "-f", temp_path, "-l", "pt"],
            capture_output=True,
            text=True,
            timeout=60,
            encoding='utf-8',
            errors='ignore'
        )

        duration_ms = int((time.time() - start) * 1000)

        if result.returncode != 0:
            logger.error(f"Whisper failed: {result.stderr}")
            raise HTTPException(500, f"Transcription failed: {result.stderr}")

        text = result.stdout.strip()
        logger.info(f"Done: {len(text)} chars in {duration_ms}ms")

        return JSONResponse({
            "text": text,
            "duration_ms": duration_ms,
            "model": "medium",
            "backend": "vulkan",
            "audio_size_bytes": len(content)
        })

    except subprocess.TimeoutExpired:
        logger.error("Timeout")
        raise HTTPException(504, "Transcription timeout")
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        raise HTTPException(500, str(e))
    finally:
        if temp_path and os.path.exists(temp_path):
            os.unlink(temp_path)

if __name__ == "__main__":
    import uvicorn
    logger.info("Starting Whisper GPU Service on port 9000")
    logger.info(f"GPU: AMD Radeon RX 7600 (Vulkan)")
    logger.info(f"Model: {MODEL_PATH}")
    uvicorn.run(app, host="0.0.0.0", port=9000, log_level="info")
"@

Set-Content -Path "$serviceDir\app.py" -Value $appPy -Encoding UTF8
Write-Host "✅ Criado: $serviceDir\app.py" -ForegroundColor Green

# 4. Cria requirements.txt
$requirements = @"
fastapi==0.115.0
uvicorn[standard]==0.32.0
python-multipart==0.0.12
"@

Set-Content -Path "$serviceDir\requirements.txt" -Value $requirements
Write-Host "✅ Criado: $serviceDir\requirements.txt" -ForegroundColor Green

# 5. Instala dependências Python
Write-Host ""
Write-Host "Instalando dependências Python..." -ForegroundColor Yellow

try {
    python --version | Out-Null
} catch {
    Write-Host "❌ Python não encontrado no PATH" -ForegroundColor Red
    Write-Host "   Instale Python: https://www.python.org/downloads/" -ForegroundColor Yellow
    exit 1
}

Push-Location $serviceDir
pip install -r requirements.txt --quiet
Pop-Location

Write-Host "✅ Dependências instaladas" -ForegroundColor Green

# 6. Cria script de start
$startScript = @"
@echo off
echo === Starting Whisper GPU Service ===
echo.
echo GPU: AMD Radeon RX 7600 (Vulkan)
echo Port: 9000
echo Model: medium (1.5GB)
echo.
cd /d C:\whisper-gpu-service
python app.py
pause
"@

Set-Content -Path "$serviceDir\start.bat" -Value $startScript
Write-Host "✅ Criado: $serviceDir\start.bat" -ForegroundColor Green

# 7. Testa o serviço
Write-Host ""
Write-Host "=== Teste do Serviço ===" -ForegroundColor Cyan
Write-Host "Iniciando serviço de teste (5 segundos)..." -ForegroundColor Yellow

$job = Start-Job -ScriptBlock {
    Set-Location "C:\whisper-gpu-service"
    python app.py
}

Start-Sleep -Seconds 5

try {
    $response = Invoke-RestMethod -Uri "http://localhost:9000/health" -TimeoutSec 3
    Write-Host "✅ Serviço funcionando!" -ForegroundColor Green
    Write-Host "   Status: $($response.status)" -ForegroundColor Gray
    Write-Host "   GPU: $($response.gpu)" -ForegroundColor Gray
    Write-Host "   Backend: $($response.backend)" -ForegroundColor Gray
} catch {
    Write-Host "⚠️  Serviço não respondeu (pode precisar de mais tempo)" -ForegroundColor Yellow
}

Stop-Job $job
Remove-Job $job

Write-Host ""
Write-Host "=== Setup Completo! ===" -ForegroundColor Green
Write-Host ""
Write-Host "Próximos passos:" -ForegroundColor Cyan
Write-Host "1. Rode o serviço GPU: C:\whisper-gpu-service\start.bat" -ForegroundColor White
Write-Host "2. Configure backend-ts:" -ForegroundColor White
Write-Host "   - Adicione ao docker-compose.yml:" -ForegroundColor Gray
Write-Host "     WHISPER_GPU_SERVICE_URL=http://host.docker.internal:9000" -ForegroundColor Gray
Write-Host "3. Restart Docker: docker compose restart backend-ts" -ForegroundColor White
Write-Host ""
Write-Host "Teste: curl http://localhost:9000/health" -ForegroundColor Yellow
