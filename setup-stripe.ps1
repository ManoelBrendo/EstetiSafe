# EstetiSafe - Stripe Payment Gateway Setup (Windows PowerShell)
# Use este script para configurar facilmente as chaves do Stripe no ambiente Windows.

$EnvPath = "./backend/backend/.env"

Write-Host "==================================================" -ForegroundColor Gold
Write-Host "   EstetiSafe - Stripe Payment Gateway Setup      " -ForegroundColor Gold
Write-Host "==================================================" -ForegroundColor Gold
Write-Host ""

if (-not (Test-Path $EnvPath)) {
    Write-Host "Aviso: Arquivo .env não encontrado em $EnvPath" -ForegroundColor Yellow
    Write-Host "Criando um novo arquivo .env a partir de .env.example..." -ForegroundColor Gray
    Copy-Item "./backend/backend/.env.example" $EnvPath
}

Write-Host "Para ativar o Stripe, você precisará informar:" -ForegroundColor White
Write-Host "1. A chave secreta de API (STRIPE_SECRET_KEY) obtida no painel do Stripe" -ForegroundColor White
Write-Host "2. O segredo de assinatura do Webhook (BILLING_WEBHOOK_SECRET ou STRIPE_WEBHOOK_SECRET)" -ForegroundColor White
Write-Host ""

$stripe_key = Read-Host "Digite a STRIPE_SECRET_KEY (começa com sk_live_ ou sk_test_)"
$webhook_secret = Read-Host "Digite o BILLING_WEBHOOK_SECRET (começa com whsec_)"

if ([string]::IsNullOrWhiteSpace($stripe_key) -or [string]::IsNullOrWhiteSpace($webhook_secret)) {
    Write-Host ""
    Write-Host "Aviso: Nenhuma chave informada. Operação cancelada." -ForegroundColor Red
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

Write-Host ""
Write-Host "Atualizando configurações em $EnvPath..." -ForegroundColor Gray

Update-EnvVar "BILLING_GATEWAY_PROVIDER" "STRIPE"
Update-EnvVar "STRIPE_SECRET_KEY" $stripe_key
Update-EnvVar "BILLING_WEBHOOK_SECRET" $webhook_secret
Update-EnvVar "STRIPE_WEBHOOK_SECRET" $webhook_secret

Write-Host ""
Write-Host "==================================================" -ForegroundColor Green
Write-Host "Configuração do Stripe atualizada com sucesso!" -ForegroundColor Green
Write-Host "Verifique o arquivo $EnvPath para validar." -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
Write-Host ""
