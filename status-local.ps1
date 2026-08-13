$ErrorActionPreference = 'Continue'

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$PostgresService = 'postgresql-x64-18'
$WatchdogLog = Join-Path $Root 'run-logs\watchdog.log'
$BackendOut = Join-Path $Root 'run-logs\backend.out.log'
$FrontendErr = Join-Path $Root 'run-logs\frontend.err.log'

function Test-Endpoint {
  param([string]$Name, [string]$Url)

  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 6
    Write-Host "$Name OK $([int]$response.StatusCode) - $Url"
  } catch {
    Write-Host "$Name FALHOU - $Url - $($_.Exception.Message)"
  }
}

function Show-PortOwners {
  param([int[]]$Ports)

  foreach ($port in $Ports) {
    $listeners = netstat -ano -p tcp |
      Select-String 'LISTENING' |
      Where-Object { $_.Line -match "[:.]$port\s+" }

    foreach ($listener in $listeners) {
      $parts = $listener.Line.Trim() -split '\s+'
      $pidValue = [int]$parts[$parts.Length - 1]
      try {
        $process = Get-CimInstance Win32_Process -Filter "ProcessId = $pidValue" -ErrorAction Stop
        $commandLine = [string]$process.CommandLine
        if ($commandLine.Length -gt 180) {
          $commandLine = $commandLine.Substring(0, 177) + '...'
        }
        Write-Host "Porta $port PID $pidValue - $($process.Name) - $commandLine"
      } catch {
        try {
          $fallbackProcess = Get-Process -Id $pidValue -ErrorAction Stop
          Write-Host "Porta $port PID $pidValue - $($fallbackProcess.ProcessName) - comando indisponivel"
        } catch {
          Write-Host "Porta $port PID $pidValue - processo nao encontrado"
        }
      }
    }
  }
}

Write-Host 'Status local LAppui'

try {
  $service = Get-Service -Name $PostgresService -ErrorAction SilentlyContinue
  if ($service) {
    Write-Host "PostgreSQL $($service.Status) ($($service.StartType))"
  } else {
    Write-Host "PostgreSQL nao encontrado como servico $PostgresService"
  }
} catch {
  Write-Host "PostgreSQL status indisponivel: $($_.Exception.Message)"
}

Test-Endpoint -Name 'Backend' -Url 'http://localhost:3000/ready'
Test-Endpoint -Name 'Frontend' -Url 'http://127.0.0.1:5173/login'

Write-Host ''
Write-Host 'Portas em escuta:'
netstat -ano -p tcp | Select-String -Pattern ':3000|:5173' | Select-Object -First 12

Write-Host ''
Write-Host 'Donos das portas:'
Show-PortOwners -Ports @(3000, 5173)

Write-Host ''
Write-Host 'Logs recentes:'
if (Test-Path -LiteralPath $WatchdogLog) {
  Write-Host 'watchdog.log'
  Get-Content -LiteralPath $WatchdogLog -Tail 8
}

if (Test-Path -LiteralPath $BackendOut) {
  Write-Host 'backend.out.log'
  Get-Content -LiteralPath $BackendOut -Tail 4
}

if (Test-Path -LiteralPath $FrontendErr) {
  $frontendErrorFile = Get-Item -LiteralPath $FrontendErr
  $frontendErrors = if ($frontendErrorFile.LastWriteTime -gt (Get-Date).AddMinutes(-10)) {
    Get-Content -LiteralPath $FrontendErr -Tail 6
  } else {
    @()
  }
  if ($frontendErrors) {
    Write-Host 'frontend.err.log'
    $frontendErrors
  }
}
