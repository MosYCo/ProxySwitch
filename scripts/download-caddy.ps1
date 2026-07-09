#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Download Caddy binaries for Tauri sidecar.
.DESCRIPTION
    Downloads the Caddy binary for the current or specified platform
    and places it in src-tauri/binaries/ for Tauri sidecar bundling.
.PARAMETER Version
    Caddy version to download (default: latest from GitHub API).
.PARAMETER Platform
    Target platform: linux | macos-arm | macos-intel | windows | all
    (default: auto-detect current platform).
.EXAMPLE
    ./scripts/download-caddy.ps1
    ./scripts/download-caddy.ps1 -Version 2.9.1
    ./scripts/download-caddy.ps1 -Platform all
#>
param(
    [string]$Version = "",
    [ValidateSet("linux", "macos-arm", "macos-intel", "windows", "all")]
    [string]$Platform = ""
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BinDir = Join-Path (Split-Path -Parent $ScriptDir) "src-tauri" "binaries"
$BaseUrl = "https://github.com/caddyserver/caddy/releases/download"

# Resolve latest version if not specified
if ([string]::IsNullOrEmpty($Version)) {
    Write-Host "Fetching latest Caddy version..."
    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/caddyserver/caddy/releases/latest"
    $Version = $release.tag_name -replace "^v", ""
    Write-Host "Latest version: v$Version"
}

# Ensure binaries directory exists
New-Item -ItemType Directory -Force -Path $BinDir | Out-Null

function Download-Caddy {
    param(
        [string]$OsArch,
        [string]$Archive,
        [string]$TargetName
    )

    $url = "${BaseUrl}/v${Version}/caddy_${Version}_${OsArch}"
    $tmpFile = Join-Path $env:TEMP "caddy_${OsArch}"

    Write-Host "Downloading Caddy v$Version for $OsArch..."
    Invoke-WebRequest -Uri $url -OutFile $tmpFile -UseBasicParsing

    $targetPath = Join-Path $BinDir $TargetName
    Write-Host "Extracting to $targetPath..."

    if ($Archive -eq "zip") {
        $extractDir = Join-Path $env:TEMP "caddy_extract"
        if (Test-Path $extractDir) { Remove-Item -Recurse -Force $extractDir }
        Expand-Archive -Path $tmpFile -DestinationPath $extractDir
        $exeFile = Get-ChildItem -Path $extractDir -Recurse -Filter "caddy.exe" | Select-Object -First 1
        if ($exeFile) {
            Move-Item -Path $exeFile.FullName -Destination $targetPath -Force
        } else {
            Write-Error "caddy.exe not found in archive"
            exit 1
        }
        Remove-Item -Recurse -Force $extractDir
    } else {
        # tar.gz — extract with tar
        $extractDir = Join-Path $env:TEMP "caddy_extract"
        if (Test-Path $extractDir) { Remove-Item -Recurse -Force $extractDir }
        New-Item -ItemType Directory -Force -Path $extractDir | Out-Null
        tar xzf $tmpFile -C $extractDir
        $caddyFile = Join-Path $extractDir "caddy"
        Move-Item -Path $caddyFile -Destination $targetPath -Force
        Remove-Item -Recurse -Force $extractDir
    }

    Remove-Item -Force $tmpFile -ErrorAction SilentlyContinue
    Write-Host "Done: $TargetName"
}

function Get-CurrentPlatform {
    if ($IsLinux) {
        $arch = uname -m
        if ($arch -eq "aarch64") { return "linux-arm" }
        return "linux"
    } elseif ($IsMacOS) {
        $arch = uname -m
        if ($arch -eq "arm64") { return "macos-arm" }
        return "macos-intel"
    } else {
        return "windows"
    }
}

# Auto-detect platform if not specified
if ([string]::IsNullOrEmpty($Platform)) {
    $Platform = Get-CurrentPlatform
    Write-Host "Auto-detected platform: $Platform"
}

switch ($Platform) {
    "linux" {
        Download-Caddy -OsArch "linux_amd64" -Archive "tar.gz" -TargetName "caddy-x86_64-unknown-linux-gnu"
    }
    "macos-arm" {
        Download-Caddy -OsArch "mac_arm64" -Archive "tar.gz" -TargetName "caddy-aarch64-apple-darwin"
    }
    "macos-intel" {
        Download-Caddy -OsArch "mac_amd64" -Archive "tar.gz" -TargetName "caddy-x86_64-apple-darwin"
    }
    "windows" {
        Download-Caddy -OsArch "windows_amd64" -Archive "zip" -TargetName "caddy-x86_64-pc-windows-msvc.exe"
    }
    "all" {
        Download-Caddy -OsArch "linux_amd64" -Archive "tar.gz" -TargetName "caddy-x86_64-unknown-linux-gnu"
        Download-Caddy -OsArch "mac_arm64" -Archive "tar.gz" -TargetName "caddy-aarch64-apple-darwin"
        Download-Caddy -OsArch "mac_amd64" -Archive "tar.gz" -TargetName "caddy-x86_64-apple-darwin"
        Download-Caddy -OsArch "windows_amd64" -Archive "zip" -TargetName "caddy-x86_64-pc-windows-msvc.exe"
    }
    default {
        Write-Error "Unknown platform: $Platform"
        Write-Host "Usage: .\download-caddy.ps1 [-Version <version>] [-Platform linux|macos-arm|macos-intel|windows|all]"
        exit 1
    }
}

Write-Host ""
Write-Host "All done! Binaries in: $BinDir"
Get-ChildItem -Path $BinDir -Filter "caddy-*" | Format-Table Name, Length -AutoSize
