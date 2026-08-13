# EstetiSafe - WhatsApp Meta Cloud API Setup (Windows PowerShell)
# Use este script para configurar facilmente as variáveis de ambiente do WhatsApp no Windows.

$EnvPath = "./backend/backend/.env"

Write-Host "==================================================" -ForegroundColor Gold
Write-Host "   EstetiSafe - WhatsApp Meta Cloud API Setup     " -ForegroundColor Gold
Write-Host "==================================================" -ForegroundColor Gold
Write-Host ""

if (-not (Test-Path $EnvPath)) {
    Write-Host "Aviso: Arquivo .env não encontrado em $EnvPath" -ForegroundColor Yellow
    Write-Host "Criando um novo arquivo .env a partir de .env.example..." -ForegroundColor Gray
    Copy-Item "./backend/backend/.env.example" $EnvPath
}

Write-Host "Para ativar o WhatsApp, você precisará informar:" -ForegroundColor White
Write-Host "1. O token de verificação de webhook do WhatsApp (WHATSAPP_VERIFY_TOKEN)" -ForegroundColor White
Write-Host "2. O segredo do aplicativo da Meta (WHATSAPP_APP_SECRET)" -ForegroundColor White
Write-Host ""

$verify_token = Read-Host "Digite o WHATSAPP_VERIFY_TOKEN (verify token do webhook)"
$app_secret = Read-Host "Digite o WHATSAPP_APP_SECRET (meta app secret)"

if ([string]::IsNullOrWhiteSpace($verify_token) -or [string]::IsNullOrWhiteSpace($app_secret)) {
    Write-Host ""
    Write-Host "Aviso: Configurações incompletas. Operação cancelada." -ForegroundColor Red
    Exit 1
}

function Update-EnvVar($key, $value) {
    $content = Get-Content $EnvPath -Raw
    $pattern = "(?m)^$key=.*"
    if ($content -match $pattern) {
        $content = $content -replace $pattern, "$key=`"$value`""
    } else {
        $content = $content + "`n$key=`"$value`""
    }
    # Remover quebras de linha duplicadas se houver
    $content = $content -replace "`r`n`r`n`r`n", "`r`n`r`n"
    Set-Content $EnvPath $content -NoNewline
}

# Gerar chave aleatória se não existir no .env
$content = Get-Content $EnvPath -Raw
if (-not ($content -match "(?m)^WHATSAPP_TOKEN_ENCRYPTION_KEY=")) {
    $bytes = New-Object Byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    $encryption_key = [System.BitConverter]::ToString($bytes) -replace '-'
    $rng.Dispose()
    Update-EnvVar "WHATSAPP_TOKEN_ENCRYPTION_KEY" $encryption_key
}

Write-Host ""
Write-Host "Atualizando configurações em $EnvPath..." -ForegroundColor Gray

Update-EnvVar "WHATSAPP_VERIFY_TOKEN" $verify_token
Update-EnvVar "WHATSAPP_WEBHOOK_VERIFY_TOKEN" $verify_token
Update-EnvVar "WHATSAPP_APP_SECRET" $app_secret
Update-EnvVar "WHATSAPP_CONFIRMATION_JOB_ENABLED" "true"

Write-Host ""
Write-Host "==================================================" -ForegroundColor Green
Write-Host "Configuração do WhatsApp atualizada com sucesso!" -ForegroundColor Green
Write-Host "Verifique o arquivo $EnvPath para validar." -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
Write-Host ""
