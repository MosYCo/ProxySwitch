#!/usr/bin/env bash
set -euo pipefail

# Download Caddy binaries for Tauri sidecar
# Usage: ./scripts/download-caddy.sh [version] [platform]
#   version: Caddy version (default: latest from GitHub API)
#   platform: linux|macos-arm|macos-intel|windows|all (default: current platform)

VERSION="${1:-}"
PLATFORM="${2:-}"
BIN_DIR="$(cd "$(dirname "$0")/.." && pwd)/src-tauri/binaries"
BASE_URL="https://github.com/caddyserver/caddy/releases/download"

# Resolve latest version if not specified
if [ -z "$VERSION" ]; then
  echo "Fetching latest Caddy version..."
  VERSION=$(curl -s "https://api.github.com/repos/caddyserver/caddy/releases/latest" \
    | grep '"tag_name"' | sed 's/.*"v\(.*\)".*/\1/')
  echo "Latest version: v${VERSION}"
fi

mkdir -p "$BIN_DIR"

download_caddy() {
  local os_arch="$1"
  local archive="$2"
  local target_name="$3"
  local ext
  if [[ "$archive" == "zip" ]]; then
    ext=".zip"
  else
    ext=".tar.gz"
  fi
  local url="${BASE_URL}/v${VERSION}/caddy_${VERSION}_${os_arch}${ext}"

  echo "Downloading Caddy v${VERSION} for ${os_arch}..."
  curl -fSL "${url}" -o "/tmp/caddy_${os_arch}${ext}"

  local tmp_file="/tmp/caddy_${os_arch}${ext}"
  echo "Extracting to ${BIN_DIR}/${target_name}..."
  if [[ "$archive" == "zip" ]]; then
    unzip -jo "$tmp_file" caddy.exe -d "$BIN_DIR"
    mv "$BIN_DIR/caddy.exe" "$BIN_DIR/$target_name"
  else
    tar xzf "$tmp_file" -C "$BIN_DIR" caddy
    mv "$BIN_DIR/caddy" "$BIN_DIR/$target_name"
  fi
  chmod +x "$BIN_DIR/$target_name"

  rm -f "$tmp_file"
  echo "Done: ${target_name}"
}

detect_platform() {
  case "$(uname -s)-$(uname -m)" in
    Linux-x86_64)   echo "linux" ;;
    Linux-aarch64)  echo "linux-arm" ;;
    Darwin-arm64)   echo "macos-arm" ;;
    Darwin-x86_64)  echo "macos-intel" ;;
    *)              echo "unknown" ;;
  esac
}

if [ -z "$PLATFORM" ]; then
  PLATFORM=$(detect_platform)
  echo "Auto-detected platform: ${PLATFORM}"
fi

case "$PLATFORM" in
  linux)
    download_caddy "linux_amd64" "tar.gz" "caddy-x86_64-unknown-linux-gnu"
    ;;
  macos-arm)
    download_caddy "mac_arm64" "tar.gz" "caddy-aarch64-apple-darwin"
    ;;
  macos-intel)
    download_caddy "mac_amd64" "tar.gz" "caddy-x86_64-apple-darwin"
    ;;
  windows)
    download_caddy "windows_amd64" "zip" "caddy-x86_64-pc-windows-msvc.exe"
    ;;
  all)
    download_caddy "linux_amd64" "tar.gz" "caddy-x86_64-unknown-linux-gnu"
    download_caddy "mac_arm64" "tar.gz" "caddy-aarch64-apple-darwin"
    download_caddy "mac_amd64" "tar.gz" "caddy-x86_64-apple-darwin"
    download_caddy "windows_amd64" "zip" "caddy-x86_64-pc-windows-msvc.exe"
    ;;
  *)
    echo "Unknown platform: ${PLATFORM}"
    echo "Usage: $0 [version] [linux|macos-arm|macos-intel|windows|all]"
    exit 1
    ;;
esac

echo ""
echo "All done! Binaries in: ${BIN_DIR}/"
ls -lh "$BIN_DIR"/caddy-*
