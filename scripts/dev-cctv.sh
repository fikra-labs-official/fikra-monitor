#!/usr/bin/env bash
set -euo pipefail
# CCTV is registered by the regular launcher; there is no separate network-exposed mode.
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/dev-fresh.sh" "$@"
