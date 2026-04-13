# Script para compilar whisper.cpp com Vulkan (AMD RX 7600)
# Uso: .\scripts\compile-whisper-vulkan.ps1

Write-Host "=== Whisper.cpp Vulkan Compilation ===" -ForegroundColor Cyan
Write-Host ""

# 1. Verifica pré-requisitos
Write-Host "Verificando pré-requisitos..." -ForegroundColor Yellow

# CMake
try {
    $cmakeVersion = cmake --version | Select-String -Pattern "(\d+\.\d+\.\d+)"
    Write-Host "✅ CMake: $($cmakeVersion.Matches.Value)" -ForegroundColor Green
} catch {
    Write-Host "❌ CMake não encontrado" -ForegroundColor Red
    Write-Host "   Instale: winget install Kitware.CMake" -ForegroundColor Yellow
    exit 1
}

# Git
try {
    git --version | Out-Null
    Write-Host "✅ Git instalado" -ForegroundColor Green
} catch {
    Write-Host "❌ Git não encontrado" -ForegroundColor Red
    Write-Host "   Instale: winget install Git.Git" -ForegroundColor Yellow
    exit 1
}

# Visual Studio Build Tools
$vsWhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
if (Test-Path $vsWhere) {
    $vsPath = & $vsWhere -latest -property installationPath
    Write-Host "✅ Visual Studio Build Tools: $vsPath" -ForegroundColor Green
} else {
    Write-Host "❌ Visual Studio Build Tools não encontrado" -ForegroundColor Red
    Write-Host "   Instale: https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022" -ForegroundColor Yellow
    Write-Host "   Durante instalação, selecione:" -ForegroundColor Yellow
    Write-Host "   - Desktop development with C++" -ForegroundColor Gray
    Write-Host "   - CMake tools for Windows" -ForegroundColor Gray
    exit 1
}

# Vulkan SDK
$vulkanSDK = $env:VULKAN_SDK
if ($vulkanSDK -and (Test-Path $vulkanSDK)) {
    Write-Host "✅ Vulkan SDK: $vulkanSDK" -ForegroundColor Green
} else {
    Write-Host "❌ Vulkan SDK não encontrado" -ForegroundColor Red
    Write-Host "   Instale: https://vulkan.lunarg.com/sdk/home#windows" -ForegroundColor Yellow
    Write-Host "   Versão recomendada: 1.3.280 ou superior" -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# 2. Clone whisper.cpp
$whisperDir = "C:\whisper.cpp"

if (Test-Path $whisperDir) {
    Write-Host "⚠️  Diretório já existe: $whisperDir" -ForegroundColor Yellow
    $response = Read-Host "Remover e clonar novamente? (y/N)"
    if ($response -eq 'y' -or $response -eq 'Y') {
        Remove-Item -Recurse -Force $whisperDir
    } else {
        Write-Host "Usando diretório existente..." -ForegroundColor Yellow
    }
}

if (-not (Test-Path $whisperDir)) {
    Write-Host "Clonando whisper.cpp..." -ForegroundColor Yellow
    git clone https://github.com/ggerganov/whisper.cpp C:\whisper.cpp
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Falha ao clonar repositório" -ForegroundColor Red
        exit 1
    }
    Write-Host "✅ Repositório clonado" -ForegroundColor Green
}

# 3. Compile com Vulkan
Write-Host ""
Write-Host "Compilando whisper.cpp com Vulkan..." -ForegroundColor Yellow
Write-Host "Isso pode levar 2-5 minutos..." -ForegroundColor Gray
Write-Host ""

Push-Location $whisperDir

# Configura ambiente Visual Studio
$vcvarsPath = "$vsPath\VC\Auxiliary\Build\vcvars64.bat"
if (-not (Test-Path $vcvarsPath)) {
    Write-Host "❌ vcvars64.bat não encontrado" -ForegroundColor Red
    Pop-Location
    exit 1
}

# Cria build script temporário
$buildScript = @"
@echo off
call "$vcvarsPath"
cd /d $whisperDir
cmake -B build -DGGML_VULKAN=ON -DCMAKE_BUILD_TYPE=Release
if %errorlevel% neq 0 (
    echo CMake configuration failed
    exit /b 1
)
cmake --build build --config Release -j
if %errorlevel% neq 0 (
    echo Build failed
    exit /b 1
)
echo Build complete
"@

$tempBat = "$env:TEMP\build-whisper.bat"
Set-Content -Path $tempBat -Value $buildScript

# Executa build
& cmd /c $tempBat

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Compilação falhou" -ForegroundColor Red
    Pop-Location
    exit 1
}

Remove-Item $tempBat

Pop-Location

Write-Host "✅ Compilação concluída!" -ForegroundColor Green

# 4. Verifica binário
$binaryPath = "$whisperDir\build\bin\Release\main.exe"
if (Test-Path $binaryPath) {
    Write-Host "✅ Binário: $binaryPath" -ForegroundColor Green

    # Testa se Vulkan está funcionando
    Write-Host ""
    Write-Host "Testando Vulkan..." -ForegroundColor Yellow

    Push-Location $whisperDir
    $testOutput = & $binaryPath --help 2>&1 | Out-String
    Pop-Location

    if ($testOutput -match "Vulkan" -or $testOutput -match "vulkan") {
        Write-Host "✅ Suporte Vulkan compilado" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Vulkan pode não estar habilitado" -ForegroundColor Yellow
    }
} else {
    Write-Host "❌ Binário não encontrado" -ForegroundColor Red
    exit 1
}

# 5. Baixa modelo medium
Write-Host ""
Write-Host "Baixando modelo medium (1.5GB)..." -ForegroundColor Yellow

$modelDir = "$whisperDir\models"
New-Item -ItemType Directory -Force -Path $modelDir | Out-Null

$modelPath = "$modelDir\ggml-medium.bin"

if (Test-Path $modelPath) {
    Write-Host "⚠️  Modelo já existe: $modelPath" -ForegroundColor Yellow
} else {
    Invoke-WebRequest `
        -Uri "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin" `
        -OutFile $modelPath

    Write-Host "✅ Modelo baixado: $modelPath" -ForegroundColor Green
}

# 6. Teste final
Write-Host ""
Write-Host "=== Teste Final ===" -ForegroundColor Cyan

if (Test-Path "$whisperDir\samples\jfk.wav") {
    Write-Host "Testando com samples/jfk.wav..." -ForegroundColor Yellow

    Push-Location $whisperDir
    $output = & $binaryPath -m $modelPath -f "samples\jfk.wav" 2>&1 | Out-String
    Pop-Location

    if ($output -match "Vulkan") {
        Write-Host "✅ GPU Vulkan detectada e em uso!" -ForegroundColor Green
        Write-Host ($output -split "`n" | Select-String "Vulkan") -ForegroundColor Gray
    }

    if ($output -match "transcribed") {
        Write-Host "✅ Transcrição funcionando!" -ForegroundColor Green
    }
} else {
    Write-Host "⚠️  Arquivo de teste não encontrado, pulando teste" -ForegroundColor Yellow
}

# 7. Resumo
Write-Host ""
Write-Host "=== Setup Completo! ===" -ForegroundColor Green
Write-Host ""
Write-Host "Binário: $binaryPath" -ForegroundColor White
Write-Host "Modelo: $modelPath" -ForegroundColor White
Write-Host "GPU: AMD Radeon RX 7600 (Vulkan)" -ForegroundColor White
Write-Host ""
Write-Host "Próximos passos:" -ForegroundColor Cyan
Write-Host "1. Rode: .\scripts\setup-gpu-service.ps1" -ForegroundColor White
Write-Host "   (Cria serviço HTTP que Docker pode usar)" -ForegroundColor Gray
Write-Host ""
Write-Host "Ou teste standalone:" -ForegroundColor Cyan
Write-Host "  cd C:\whisper.cpp" -ForegroundColor Gray
Write-Host "  .\build\bin\Release\main.exe -m models\ggml-medium.bin -f samples\jfk.wav -l pt" -ForegroundColor Gray
