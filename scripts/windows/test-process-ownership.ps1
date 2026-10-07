$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'process-ownership.ps1')
$node = (Get-Command node.exe -ErrorAction Stop).Source
$owned = $null
$unrelated = $null
try {
    # Two disposable node processes; no browser, tunnel, credentials or network.
    $owned = Start-Process -FilePath $node -ArgumentList '-e "setInterval(()=>{},1000)"' -WindowStyle Hidden -PassThru
    $unrelated = Start-Process -FilePath $node -ArgumentList '-e "setInterval(()=>{},1000)"' -WindowStyle Hidden -PassThru
    $record = Get-OwnedProcessRecord $owned
    $wrong = [pscustomobject]@{ Id=$record.Id; StartTicks='0'; Executable=$record.Executable; CommandLine=$record.CommandLine }
    $refused = $false
    try { Stop-OwnedProcess $wrong } catch { $refused = $true }
    if (-not $refused) { throw 'Mismatched identity was not refused.' }
    $owned.Refresh()
    if ($owned.HasExited) { throw 'Mismatched identity killed a process.' }
    foreach ($field in @('Executable', 'CommandLine')) {
        $altered = [pscustomobject]@{ Id=$record.Id; StartTicks=$record.StartTicks; Executable=$record.Executable; CommandLine=$record.CommandLine }
        $altered.$field = 'synthetic-invalid-value'
        $refused = $false
        try { Stop-OwnedProcess $altered } catch { $refused = $true }
        if (-not $refused) { throw 'Altered process identity was accepted.' }
    }
    Stop-OwnedProcess $record
    $owned.Refresh()
    if (-not $owned.HasExited) { throw 'Owned process was not stopped.' }
    $unrelated.Refresh()
    if ($unrelated.HasExited) { throw 'Unrelated process was stopped.' }
    Stop-OwnedProcess $record # Missing process is harmless.
    Write-Host 'PASS process identity refusal, owned stop, unrelated Node preserved, idempotent stop'
} finally {
    foreach ($process in @($owned, $unrelated)) {
        if ($process) { $process.Refresh(); if (-not $process.HasExited) { $process.Kill(); $process.WaitForExit(5000) | Out-Null } }
    }
}
