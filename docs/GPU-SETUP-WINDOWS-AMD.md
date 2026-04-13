# GPU Setup Guide - Windows + AMD Radeon RX 7600

**Hardware detectado:** AMD Radeon RX 7600 (Driver 32.0.23033.1002)
**Path recomendado:** Vulkan (AMD tem suporte excelente)

## Pré-requisitos

### 1. Instalar Vulkan SDK

```powershell
# Baixe e instale Vulkan SDK:
# https://vulkan.lunarg.com/sdk/home#windows

# Versão recomendada: 1.3.280 ou superior
# Durante instalação, selecione:
#   [x] Vulkan SDK Core Components
#   [x] Vulkan Memory Allocator
#   [x] SPIRV-Tools
```

**Verificar instalação:**
```powershell
# Deve mostrar sua GPU AMD
vulkaninfo --summary
```

### 2. Instalar Build Tools

**Opção A: Visual Studio Build Tools (Recomendado)**
```powershell
# Baixe: https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022
# Durante instalação, selecione:
#   [x] Desktop development with C++
#   [x] CMake tools for Windows
```

**Opção B: MinGW-w64 (Alternativa leve)**
```powershell
# Baixe: https://www.mingw-w64.org/
# Ou via MSYS2: https://www.msys2.org/
```

### 3. Instalar CMake

```powershell
# Baixe: https://cmake.org/download/
# Ou via winget:
winget install Kitware.CMake

# Verifique:
cmake --version  # Deve ser 3.20+
```

### 4. Instalar Git (se não tiver)

```powershell
winget install Git.Git
```

## Compilar whisper.cpp com Vulkan

### Passo 1: Clone whisper.cpp

```powershell
cd C:\
git clone https://github.com/ggerganov/whisper.cpp
cd whisper.cpp
```

### Passo 2: Compile com Vulkan

**Se usando Visual Studio Build Tools:**
```powershell
# Abra "Developer PowerShell for VS 2022" (não PowerShell normal!)

cd C:\whisper.cpp

# Configure com Vulkan
cmake -B build -DGGML_VULKAN=ON -DCMAKE_BUILD_TYPE=Release

# Compile (usa todos os cores)
cmake --build build --config Release -j

# Binário final estará em:
# build\bin\Release\main.exe
```

**Se usando MinGW:**
```powershell
cd C:\whisper.cpp

cmake -B build -G "MinGW Makefiles" -DGGML_VULKAN=ON -DCMAKE_BUILD_TYPE=Release
cmake --build build --config Release -j

# Binário final:
# build\bin\main.exe
```

### Passo 3: Baixar modelo medium

```powershell
cd C:\whisper.cpp

# Baixar ggml-medium.bin (~1.5GB)
powershell -Command "Invoke-WebRequest -Uri 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin' -OutFile 'models\ggml-medium.bin'"

# Verificar download
dir models\ggml-medium.bin
```

### Passo 4: Testar GPU

```powershell
cd C:\whisper.cpp

# Teste com arquivo de exemplo
.\build\bin\Release\main.exe -m models\ggml-medium.bin -f samples\jfk.wav -l pt

# Você deve ver no output:
# "using Vulkan device: AMD Radeon RX 7600"
# Latência esperada: 2-5x mais rápido que CPU
```

## Benchmark esperado (RX 7600)

| Modelo | CPU (estimado) | GPU Vulkan (estimado) | Speedup |
|--------|----------------|----------------------|---------|
| base | ~3s (10s áudio) | ~1s | 3x |
| medium | ~6s (10s áudio) | ~2s | 3x |

**Sua RX 7600 deve processar áudio quase em tempo real com modelo medium!**

## Integrar no JARVIS backend-ts

### Opção 1: Usar binário compilado diretamente

Edite `apps/backend-ts/src/voice/transcribe.ts`:

```typescript
// Trocar de nodejs-whisper para whisper.cpp compilado
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);

async function transcribeWithGPU(audioPath: string): Promise<string> {
  const whisperBin = 'C:\\whisper.cpp\\build\\bin\\Release\\main.exe';
  const modelPath = 'C:\\whisper.cpp\\models\\ggml-medium.bin';

  const { stdout } = await execAsync(
    `"${whisperBin}" -m "${modelPath}" -f "${audioPath}" -l pt --output-txt`
  );

  return stdout.trim();
}
```

### Opção 2: Copiar binário para projeto

```powershell
# Crie pasta para binários nativos
mkdir C:\jarvis\native\whisper-gpu

# Copie binário e dependências
copy C:\whisper.cpp\build\bin\Release\main.exe C:\jarvis\native\whisper-gpu\
copy C:\whisper.cpp\build\bin\Release\*.dll C:\jarvis\native\whisper-gpu\

# Copie modelo
mkdir C:\jarvis\native\whisper-gpu\models
copy C:\whisper.cpp\models\ggml-medium.bin C:\jarvis\native\whisper-gpu\models\
```

Depois use path relativo no código:
```typescript
const whisperBin = path.join(__dirname, '../../native/whisper-gpu/main.exe');
```

## Troubleshooting

### "Vulkan device not found"
```powershell
# Verifique drivers AMD atualizados:
# https://www.amd.com/en/support

# Verifique Vulkan detecta GPU:
vulkaninfo --summary | findstr "deviceName"
```

### "CMake error: Vulkan not found"
```powershell
# Adicione Vulkan SDK ao PATH:
$env:VULKAN_SDK = "C:\VulkanSDK\1.3.280.0"
$env:Path += ";$env:VULKAN_SDK\Bin"
```

### Build lento demais
```powershell
# Use compilação paralela:
cmake --build build --config Release -j 16

# Ou específico para VS:
cmake --build build --config Release -- /m:16
```

## Próximos passos

1. **Teste standalone** primeiro (Passo 4 acima)
2. **Meça latência** — compare CPU vs GPU
3. **Integre no backend-ts** (Opção 1 ou 2 acima)
4. **Ajuste backend** para escolher CPU/GPU via env var

```env
# .env
WHISPER_USE_GPU=true
WHISPER_GPU_BINARY=C:\whisper.cpp\build\bin\Release\main.exe
```

---

**Gerado em:** 2026-04-13
**GPU:** AMD Radeon RX 7600
**Driver:** 32.0.23033.1002
**Path:** Vulkan (não CUDA - AMD não suporta CUDA)
