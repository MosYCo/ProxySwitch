param(
    [Parameter(Mandatory = $true)]
    [string] $InstallDirectory
)

$ErrorActionPreference = 'Stop'

try {
    $executable = [IO.Path]::GetFullPath((Join-Path $InstallDirectory 'caddy.exe'))
    foreach ($process in @(Get-Process -Name caddy -ErrorAction SilentlyContinue)) {
        # An executable path is required: a shared name or admin port does not
        # establish ownership. Other installations and external Caddy stay alone.
        try {
            try { $processPath = $process.Path } catch { continue }
            if (-not $processPath -or -not [string]::Equals($processPath, $executable, [StringComparison]::OrdinalIgnoreCase)) { continue }
            if ($process.HasExited) { continue }
            try { $process.Kill() } catch { if (-not $process.HasExited) { throw } }
            if (-not $process.WaitForExit(10000)) {
                throw "Timed out waiting for installed Caddy to exit (PID $($process.Id))."
            }
        } finally {
            $process.Dispose()
        }
    }
    # A signalled process can briefly retain its image lock while Windows
    # releases remaining handles. Confirm the actual overwrite is possible.
    $deadline = [DateTime]::UtcNow.AddSeconds(10)
    while (Test-Path -LiteralPath $executable -PathType Leaf) {
        try {
            $file = [IO.File]::Open($executable, [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::Read)
            $file.Dispose()
            break
        } catch [IO.IOException] {
            if ([DateTime]::UtcNow -ge $deadline) { throw }
            Start-Sleep -Milliseconds 50
        }
    }
    exit 0
} catch {
    [Console]::Error.WriteLine("Unable to stop Caddy in the installation directory: $($_.Exception.Message)")
    exit 1
}
