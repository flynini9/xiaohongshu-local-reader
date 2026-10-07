param(
  [Parameter(Mandatory=$true)][string]$Profile
)

$ErrorActionPreference = 'Stop'
if (-not (Get-Command tunnel-client -ErrorAction SilentlyContinue)) {
  throw '找不到 tunnel-client。请先使用 OpenAI Platform Tunnel settings 中的下载版本，并把它加入 PATH。'
}

Write-Host "Checking tunnel profile: $Profile"
tunnel-client doctor --profile $Profile --explain
Write-Host "Starting tunnel profile: $Profile"
tunnel-client run --profile $Profile
