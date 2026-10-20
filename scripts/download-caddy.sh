#!/usr/bin/env bash
set -euo pipefail

# All platforms share the pinned version, extraction, and verification logic.
node "$(cd "$(dirname "$0")" && pwd)/download-caddy.mjs" "${1:-}" "${2:-}"
