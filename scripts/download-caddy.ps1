param(
    [string]$Version = "",
    [string]$Platform = ""
)
$ErrorActionPreference = "Stop"
if (-not $Version) {
    $Version = (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'caddy-release.json') -Raw | ConvertFrom-Json).version
}
& node (Join-Path $PSScriptRoot 'download-caddy.mjs') $Version $Platform
exit $LASTEXITCODE
