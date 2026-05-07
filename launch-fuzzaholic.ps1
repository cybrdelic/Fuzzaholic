$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$PreferredPort = if ($env:PORT) { [int]$env:PORT } else { 3000 }
$Node = "C:\nvm4w\nodejs\node.exe"

if (-not (Test-Path -LiteralPath $Node)) {
  $cmd = Get-Command node -ErrorAction Stop
  $Node = $cmd.Source
}

function Test-Fuzzaholic($Port) {
  try {
    $health = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 2
    return $health.StatusCode -eq 200 -and $health.Content -like '*fuzzaholic.sqlite*'
  } catch {
    return $false
  }
}

function Test-PortOpen($Port) {
  return [bool](Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1)
}

$Port = $PreferredPort
if (-not (Test-Fuzzaholic $Port)) {
  if (Test-PortOpen $Port) {
    $Port = 3010
    while ((Test-PortOpen $Port) -and -not (Test-Fuzzaholic $Port)) {
      $Port++
    }
  }
}

$Url = "http://127.0.0.1:$Port/"

if (-not (Test-Fuzzaholic $Port)) {
  Start-Process `
    -FilePath "powershell.exe" `
    -ArgumentList "-NoProfile", "-Command", "`$env:PORT='$Port'; Set-Location '$ProjectRoot'; & '$Node' server.mjs" `
    -WorkingDirectory $ProjectRoot `
    -WindowStyle Hidden

  $deadline = (Get-Date).AddSeconds(20)
  do {
    Start-Sleep -Milliseconds 350
    if (Test-Fuzzaholic $Port) { break }
    if ((Get-Date) -gt $deadline) {
      throw "Fuzzaholic did not start on port $Port"
    }
  } while ((Get-Date) -lt $deadline)
}

Start-Process $Url
