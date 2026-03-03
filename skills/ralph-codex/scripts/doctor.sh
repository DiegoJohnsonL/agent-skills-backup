#!/usr/bin/env bash
set -euo pipefail

EXIT_CODE=0

check_cmd() {
  local name="$1"
  if command -v "$name" >/dev/null 2>&1; then
    echo "[OK] $name"
  else
    echo "[MISSING] $name"
    EXIT_CODE=1
  fi
}

check_optional() {
  local name="$1"
  if command -v "$name" >/dev/null 2>&1; then
    echo "[OK] $name (optional)"
  else
    echo "[WARN] $name not found (PR creation will be skipped)"
  fi
}

check_cmd codex
check_cmd git
check_cmd jq
check_cmd python3
check_optional gh

if [ "$EXIT_CODE" -eq 0 ]; then
  echo "ralph-codex doctor passed"
else
  echo "ralph-codex doctor failed"
fi

exit "$EXIT_CODE"
