# scripts/backup-db.ps1
# Script de Backup Automático para Banco de Dados PostgreSQL (EstetiSafe)

$ErrorActionPreference = 'Stop'

# 1. Definir caminhos relativos
$PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendRoot = Split-Path -Parent $PSScriptRoot
$EnvFile = Join-Path $BackendRoot '.env'
$BackupDir = Join-Path $BackendRoot 'run-logs\backups'

Write-Host "Iniciando processo de backup do banco de dados..."

# 2. Garantir diretório de backups
if (-not (Test-Path -LiteralPath $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir | Out-Null
    Write-Host "Diretório de backups criado em: $BackupDir"
}

# 3. Ler DATABASE_URL do arquivo .env
if (-not (Test-Path -LiteralPath $EnvFile)) {
    Write-Error "Arquivo de ambiente .env não encontrado em: $EnvFile"
    exit 1
}

$DatabaseUrl = $null
Get-Content -LiteralPath $EnvFile | ForEach-Object {
    if ($_ -match '^DATABASE_URL\s*=\s*["'']?(postgresql://[^"'']+)["'']?') {
        $DatabaseUrl = $Matches[1]
    }
}

if (-not $DatabaseUrl) {
    Write-Error "DATABASE_URL não configurada ou inválida no arquivo .env"
    exit 1
}

# 4. Parsing da URL de conexão PostgreSQL
# Formato esperado: postgresql://usuario:senha@host:port/nome_banco
if ($DatabaseUrl -match 'postgresql://([^:]+):([^@]+)@([^:/]+):?(\d*)/([^?]+)') {
    $User = $Matches[1]
    $Password = $Matches[2]
    $DbHost = $Matches[3]
    $Port = if ($Matches[4]) { $Matches[4] } else { 5432 }
    $DbName = $Matches[5]
} else {
    Write-Error "Não foi possível fazer o parsing da DATABASE_URL. Formato inválido."
    exit 1
}

# 5. Definir arquivo de destino do backup
$Timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$BackupFileName = "lappui_backup_$Timestamp.dump"
$BackupFilePath = Join-Path $BackupDir $BackupFileName

# 6. Definir senha temporária do PostgreSQL no ambiente
$env:PGPASSWORD = $Password

Write-Host "Efetuando o dump do banco de dados '$DbName' a partir de ${DbHost}:${Port}..."

# 7. Executar pg_dump
try {
    # Busca pelo executável pg_dump no PATH
    $PgDumpPath = Get-Command pg_dump -ErrorAction SilentlyContinue
    if (-not $PgDumpPath) {
        # Fallback para caminhos comuns de instalação do PostgreSQL no Windows
        $commonPaths = @(
            "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe",
            "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe",
            "C:\Program Files\PostgreSQL\16\bin\pg_dump.exe",
            "C:\Program Files\PostgreSQL\15\bin\pg_dump.exe"
        )
        foreach ($path in $commonPaths) {
            if (Test-Path -LiteralPath $path) {
                $PgDumpPath = $path
                break
            }
        }
    }

    if (-not $PgDumpPath) {
        throw "pg_dump.exe não encontrado no PATH nem nos diretórios padrão de instalação do PostgreSQL."
    }

    & $PgDumpPath -h $DbHost -p $Port -U $User -F c -b -v -f $BackupFilePath $DbName
    Write-Host "Backup concluído com sucesso: $BackupFileName"
} catch {
    Write-Error "Falha ao executar o backup: $($_.Exception.Message)"
    exit 1
} finally {
    # Limpa a senha do ambiente
    Remove-Item env:PGPASSWORD -ErrorAction SilentlyContinue
}

# 8. Rotação de backups: Manter apenas os últimos 7 arquivos
Write-Host "Executando rotação de backups (limite: 7 dumps)..."
$ExistingBackups = Get-ChildItem -LiteralPath $BackupDir -File -Filter "lappui_backup_*.dump" |
    Sort-Object LastWriteTime -Descending

if ($ExistingBackups.Count -gt 7) {
    $BackupsToDelete = $ExistingBackups | Select-Object -Skip 7
    foreach ($oldBackup in $BackupsToDelete) {
        try {
            Remove-Item -LiteralPath $oldBackup.FullName -Force
            Write-Host "Backup antigo removido: $($oldBackup.Name)"
        } catch {
            Write-Warning "Não foi possível remover o backup antigo $($oldBackup.Name): $($_.Exception.Message)"
        }
    }
}

Write-Host "Processo concluído com sucesso."
