# Only processes recorded by this launcher may be stopped. A reused PID is refused.
function Get-OwnedProcessRecord($Process) {
    $Process.Refresh()
    $cim = Get-CimInstance Win32_Process -Filter "ProcessId=$($Process.Id)" -ErrorAction Stop
    if (-not $cim -or -not $cim.CommandLine) { throw 'Cannot establish process ownership.' }
    return [pscustomobject]@{
        Id = $Process.Id
        StartTicks = $Process.StartTime.ToUniversalTime().Ticks.ToString()
        Executable = $Process.Path
        CommandLine = $cim.CommandLine
    }
}

function Stop-OwnedProcess($Record) {
    $process = Get-Process -Id $Record.Id -ErrorAction SilentlyContinue
    if (-not $process) { return }
    # Pin the original OS process handle before checking identity (PID reuse).
    $pinnedHandle = $process.Handle
    $process.Refresh()
    $cim = Get-CimInstance Win32_Process -Filter "ProcessId=$($Record.Id)" -ErrorAction Stop
    if ($process.StartTime.ToUniversalTime().Ticks.ToString() -ne $Record.StartTicks -or
        $process.Path -ne $Record.Executable -or -not $cim -or $cim.CommandLine -cne $Record.CommandLine) {
        throw 'Process identity changed; refusing to stop it.'
    }
    # Keep the validated process handle instead of looking up a PID again.
    $process.Kill()
    if (-not $process.WaitForExit(5000)) { throw 'Owned process did not exit.' }
}
