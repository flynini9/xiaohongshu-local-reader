param([Parameter(Mandatory=$true)][ValidateSet('start', 'stop')][string]$Action)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'process-ownership.ps1')
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$runtimeDir = Join-Path $projectRoot '.xhs-reader'
$stateFile = Join-Path $runtimeDir 'processes.json'
$records = @()
$unrecordedProcess = $null
$lock = $null
try {
    New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
    $lock = [IO.File]::Open((Join-Path $runtimeDir 'launcher.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
    if ($Action -eq 'stop') {
        if (-not (Test-Path -LiteralPath $stateFile)) { Write-Host 'No launcher-owned services recorded.'; exit 0 }
        $records = Get-Content -Raw -LiteralPath $stateFile | ConvertFrom-Json
        foreach ($record in $records) { Stop-OwnedProcess $record }
        Remove-Item -LiteralPath $stateFile
        Write-Host 'Launcher-owned MCP and tunnel stopped. Browser remains available.'
        exit 0
    }
    if (Test-Path -LiteralPath $stateFile) { throw 'Existing launcher state found. Run stop before starting again.' }
    if (-not $env:CONTROL_PLANE_API_KEY -or $env:CONTROL_PLANE_API_KEY -eq 'YOUR_API_KEY') {
        throw 'Set CONTROL_PLANE_API_KEY in this process environment; never put it in a script.'
    }
    if (-not $env:XHS_TUNNEL_PROFILE -or $env:XHS_TUNNEL_PROFILE -eq 'YOUR_PROFILE_NAME' -or
        $env:XHS_TUNNEL_PROFILE -notmatch '^[A-Za-z0-9_-]+$') {
        throw 'Set XHS_TUNNEL_PROFILE to an initialized profile name (letters, numbers, underscore, hyphen).'
    }
    $node = (Get-Command node.exe -ErrorAction Stop).Source
    $tunnel = if ($env:XHS_TUNNEL_CLIENT) { (Resolve-Path -LiteralPath $env:XHS_TUNNEL_CLIENT).Path }
              else { (Get-Command tunnel-client.exe -ErrorAction Stop).Source }
    $portNumber = 3333
    if ($env:PORT) {
        if (-not [int]::TryParse($env:PORT, [ref]$portNumber) -or $portNumber -lt 1 -or $portNumber -gt 65535) {
            throw 'PORT must be an integer from 1 to 65535.'
        }
    }
    if (Get-NetTCPConnection -State Listen -LocalPort $portNumber -ErrorAction SilentlyContinue) {
        throw 'MCP port is occupied. Choose a free PORT and update your tunnel profile; no process was stopped.'
    }
    $env:HOST = '127.0.0.1'
    $env:PORT = $portNumber.ToString()
    if (-not $env:CDP_ENDPOINT) { $env:CDP_ENDPOINT = 'http://127.0.0.1:9222' }
    $cdp = [uri]$env:CDP_ENDPOINT
    if (-not $cdp.IsLoopback -or $cdp.Scheme -ne 'http') { throw 'Use a loopback HTTP CDP_ENDPOINT.' }
    Invoke-RestMethod -Uri ($env:CDP_ENDPOINT.TrimEnd('/') + '/json/version') -TimeoutSec 4 | Out-Null
    # The server does not need the control-plane credential.
    $savedKey = $env:CONTROL_PLANE_API_KEY
    try {
        $env:CONTROL_PLANE_API_KEY = $null
        $process = Start-Process -FilePath $node -ArgumentList ('"' + (Join-Path $projectRoot 'scripts/server.mjs') + '"') -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeDir 'mcp.log') -RedirectStandardError (Join-Path $runtimeDir 'mcp-error.log')
    } finally { $env:CONTROL_PLANE_API_KEY = $savedKey; $savedKey = $null }
    $unrecordedProcess = $process
    $pinnedHandle = $process.Handle
    $records += Get-OwnedProcessRecord $process
    $unrecordedProcess = $null
    ConvertTo-Json -InputObject @($records) | Set-Content -LiteralPath $stateFile -Encoding UTF8
    $healthy = $false
    for ($i = 0; $i -lt 20; $i++) {
        $process.Refresh()
        if ($process.HasExited) { throw 'MCP exited during startup. Inspect private local logs.' }
        try {
            $health = Invoke-RestMethod -Uri "http://127.0.0.1:$portNumber/healthz" -TimeoutSec 1
            if ($health.ok -and $health.service -eq 'xiaohongshu-local-reader') { $healthy = $true; break }
        } catch { }
        Start-Sleep -Milliseconds 250
    }
    if (-not $healthy) { throw 'MCP startup health check failed.' }
    $process = Start-Process -FilePath $tunnel -ArgumentList @('run', '--profile', $env:XHS_TUNNEL_PROFILE, '--control-plane.api-key', 'env:CONTROL_PLANE_API_KEY', '--log.http-raw-unsafe=false') -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeDir 'tunnel.log') -RedirectStandardError (Join-Path $runtimeDir 'tunnel-error.log')
    $unrecordedProcess = $process
    $pinnedHandle = $process.Handle
    $records += Get-OwnedProcessRecord $process
    $unrecordedProcess = $null
    ConvertTo-Json -InputObject @($records) | Set-Content -LiteralPath $stateFile -Encoding UTF8
    Start-Sleep -Milliseconds 750
    $process.Refresh()
    if ($process.HasExited) { throw 'Tunnel exited during startup. Inspect private local logs.' }
    Write-Host "Local MCP healthy: http://127.0.0.1:$portNumber/mcp"
    Write-Host 'Tunnel process started; confirm tunnel readiness in its local admin UI. Logs and state are private in .xhs-reader/.'
} catch {
    if ($unrecordedProcess) {
        try { if (-not $unrecordedProcess.HasExited) { $unrecordedProcess.Kill(); $unrecordedProcess.WaitForExit(5000) | Out-Null } } catch { }
    }
    if ($Action -eq 'start' -and $records.Count) {
        $rollbackOk = $true
        foreach ($record in $records) {
            try { Stop-OwnedProcess $record } catch { $rollbackOk = $false }
        }
        if ($rollbackOk -and (Test-Path -LiteralPath $stateFile)) { Remove-Item -LiteralPath $stateFile }
    }
    # Do not print exception text from external tools or credentials.
    Write-Host ('Launcher failed: ' + $(if ($_.Exception.Message -match '^(Set |Existing launcher|MCP |Use a loopback|PORT |Tunnel exited|Cannot establish|Process identity|Owned process)') { $_.Exception.Message } else { 'Check configuration, executable paths, browser CDP and private local logs.' }))
    exit 1
} finally { if ($lock) { $lock.Dispose() } }
