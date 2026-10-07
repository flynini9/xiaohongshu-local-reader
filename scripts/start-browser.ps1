param(
    [int]$Port = 9222,
    [string]$ProfileDir = ''
)

$ErrorActionPreference = 'Stop'

if (-not $ProfileDir) {
    $ProfileDir = Join-Path $env:LOCALAPPDATA 'xiaohongshu-local-reader-profile'
}

$candidates = @(
    (Get-Command msedge.exe -ErrorAction SilentlyContinue).Source,
    (Get-Command chrome.exe -ErrorAction SilentlyContinue).Source,
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
$candidates = @($candidates)

if (-not $candidates) {
    throw 'Chrome or Edge was not found.'
}

New-Item -ItemType Directory -Force -Path $ProfileDir | Out-Null

$browser = $candidates[0]

$arguments = @(
    "--remote-debugging-port=$Port",
    ('--user-data-dir="' + $ProfileDir + '"'),
    '--no-first-run',
    '--no-default-browser-check',
    'https://www.xiaohongshu.com/'
)

# This is an interactive browser: the user must see it to log in manually.
Start-Process -FilePath $browser -ArgumentList $arguments -WindowStyle Normal

Write-Host "Browser started: $browser"
Write-Host "Please log in to Xiaohongshu manually in the opened browser."
Write-Host "CDP endpoint: http://127.0.0.1:$Port"
