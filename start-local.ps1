param(
  [switch]$RebuildFrontend,
  [switch]$NoWatchdog
)

$ErrorActionPreference = 'Continue'

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$FrontendDir = Join-Path $Root 'frontend'
$FrontendIndex = Join-Path $FrontendDir 'dist\index.html'
$WatchdogScript = Join-Path $Root 'run-logs\local-stack-watchdog.ps1'
$StatusScript = Join-Path $Root 'status-local.ps1'
$PostgresService = 'postgresql-x64-18'
$RunLogsDir = Join-Path $Root 'run-logs'

function Resolve-NodeExe {
  $bundledNode = 'C:\Users\manoe\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
  if (Test-Path -LiteralPath $bundledNode) {
    return $bundledNode
  }

  $pathNode = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($pathNode?.Source) {
    return $pathNode.Source
  }

  $pathNode = Get-Command node -ErrorAction SilentlyContinue
  if ($pathNode?.Source) {
    return $pathNode.Source
  }

  return $null
}

function Get-LatestFrontendSourceWriteTime {
  $sourceExtensions = @('.ts', '.tsx', '.css', '.html', '.json')
  $latest = Get-ChildItem -LiteralPath $FrontendDir -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object {
      $_.FullName -notlike '*\node_modules\*' -and
      $_.FullName -notlike '*\dist\*' -and
      $sourceExtensions -contains $_.Extension
    } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

  if ($latest) {
    return $latest.LastWriteTime
  }

  return [DateTime]::MinValue
}

function Test-FrontendBuildIsFresh {
  if (-not (Test-Path -LiteralPath $FrontendIndex)) {
    return $false
  }

  $index = Get-Item -LiteralPath $FrontendIndex
  $latestSourceWriteTime = Get-LatestFrontendSourceWriteTime
  return $index.LastWriteTime -ge $latestSourceWriteTime
}

function Wait-Endpoint {
  param(
    [string]$Name,
    [string]$Url,
    [int]$TimeoutSeconds = 30
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 4
      if ([int]$response.StatusCode -ge 200 -and [int]$response.StatusCode -lt 500) {
        Write-Host "$Name pronto - $Url"
        return $true
      }
    } catch {
      Start-Sleep -Seconds 2
    }
  }

  Write-Host "$Name ainda nao respondeu em $TimeoutSeconds segundos - $Url"
  return $false
}

$NodeExe = Resolve-NodeExe
if (-not (Test-Path -LiteralPath $RunLogsDir)) {
  New-Item -ItemType Directory -Path $RunLogsDir | Out-Null
}

Write-Host 'Iniciando stack local LAppui...'

try {
  $service = Get-Service -Name $PostgresService -ErrorAction SilentlyContinue
  if ($service -and $service.Status -ne 'Running') {
    Write-Host 'Iniciando PostgreSQL local...'
    Start-Service -Name $PostgresService
  }
} catch {
  Write-Host "Nao foi possivel iniciar o PostgreSQL automaticamente: $($_.Exception.Message)"
}

if ($RebuildFrontend -or -not (Test-FrontendBuildIsFresh)) {
  if ($NodeExe -and (Test-Path -LiteralPath $NodeExe)) {
    Write-Host 'Gerando build atualizado do frontend...'
    Push-Location $FrontendDir
    try {
      & $NodeExe 'node_modules\vite\bin\vite.js' build
    } finally {
      Pop-Location
    }
  } else {
    Write-Host 'Node local nao encontrado. Instale o Node.js ou ajuste o PATH antes de iniciar.'
  }
}

if ($NoWatchdog) {
  Write-Host 'Watchdog nao iniciado porque -NoWatchdog foi informado.'
} elseif (Test-Path -LiteralPath $WatchdogScript) {
  Start-Process -FilePath "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -ArgumentList @(
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    $WatchdogScript
  ) -WindowStyle Hidden
  Write-Host 'Watchdog iniciado em segundo plano.'
} else {
  Write-Host "Watchdog nao encontrado em $WatchdogScript"
}

Wait-Endpoint -Name 'Backend' -Url 'http://localhost:3000/ready' -TimeoutSeconds 35 | Out-Null
Wait-Endpoint -Name 'Frontend' -Url 'http://127.0.0.1:5173/login' -TimeoutSeconds 35 | Out-Null

if (Test-Path -LiteralPath $StatusScript) {
  & $StatusScript
} else {
  Write-Host 'Front: http://127.0.0.1:5173/login'
  Write-Host 'Back : http://localhost:3000/ready'
}

Write-Host ""
Write-Host "=================================================="
Write-Host "Servidores locais do EstetiSafe / L'Appui estao ATIVOS!"
Write-Host "  Front-end: http://127.0.0.1:5173/login"
Write-Host "  Back-end : http://localhost:3000/ready"
Write-Host "=================================================="
Write-Host ""
Write-Host "Para manter os servidores rodando, nao feche esta janela."
Read-Host "Pressione [Enter] para encerrar todos os servidores..."

Write-Host "Encerrando servidores..."
$ports = @(3000, 5173)
foreach ($port in $ports) {
  $pattern = "[:.]$port\s+"
  $pids = netstat -ano -p tcp | Select-String 'LISTENING' | Where-Object { $_.Line -match $pattern } | ForEach-Object {
    $parts = $_.Line.Trim() -split '\s+'
    [int]$parts[$parts.Length - 1]
  } | Select-Object -Unique
  foreach ($pid in $pids) {
    try {
      Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
    } catch {}
  }
}
Write-Host "Servidores encerrados com sucesso."
