# scripts/schedule-backup-task.ps1
# Script para agendar o backup automático do banco de dados no Windows Task Scheduler (Agendador de Tarefas)

$ErrorActionPreference = 'Stop'

# 1. Verificar privilégios de Administrador
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Error "Este script precisa ser executado como Administrador para registrar tarefas agendadas no sistema."
    Write-Host "Por favor, abra o PowerShell como Administrador e execute o script novamente."
    exit 1
}

# 2. Obter caminhos absolutos
$PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackupScriptPath = Join-Path $PSScriptRoot "backup-db.ps1"

if (-not (Test-Path -LiteralPath $BackupScriptPath)) {
    Write-Error "Script de backup não encontrado em: $BackupScriptPath"
    exit 1
}

$TaskName = "EstetiSafe_DB_Backup"
$Description = "Executa o backup diário rotativo do banco de dados do EstetiSafe."

# 3. Definir Ação da Tarefa
$PowerShellPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$BackupScriptPath`""
$Action = New-ScheduledTaskAction -Execute $PowerShellPath -Argument $Arguments

# 4. Definir Gatilho (Trigger): Diariamente às 02:00 da manhã
$Trigger = New-ScheduledTaskTrigger -Daily -At "02:00"

# 5. Definir Configurações Adicionais
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

# 6. Registrar a tarefa rodando como SYSTEM (para não exigir senha de usuário e rodar mesmo deslogado)
Write-Host "Registrando tarefa agendada '$TaskName' no Windows..."

try {
    # Verifica se a tarefa já existe e a remove antes de registrar novamente para atualização
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "Tarefa antiga removida com sucesso."
    }

    Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -User "NT AUTHORITY\SYSTEM" -Description $Description | Out-Null
    
    Write-Host "=================================================="
    Write-Host "🎉 SUCESSO! A tarefa agendada foi criada."
    Write-Host "Nome: $TaskName"
    Write-Host "Horário: Diariamente às 02:00"
    Write-Host "Ação: Executar $BackupScriptPath"
    Write-Host "=================================================="
} catch {
    Write-Error "Falha ao registrar a tarefa no Windows: $($_.Exception.Message)"
    exit 1
}
