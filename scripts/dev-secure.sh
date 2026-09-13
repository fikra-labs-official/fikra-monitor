#!/usr/bin/env bash
set -euo pipefail
# Compatibility alias: keep credential precedence and loopback checks in one launcher.
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/dev-fresh.sh" "$@"
