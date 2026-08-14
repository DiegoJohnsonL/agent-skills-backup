#!/usr/bin/env bash
# Wrapper around Codex's image_gen.py that resolves OPENAI_API_KEY internally.
#
# The key is never written to stdout, so an agent invoking this never sees the
# secret in its tool output. Always call the CLI through this wrapper.
#
#   run.sh --check                          # report key source only, no value
#   run.sh generate --prompt "..." --out x.png
#   run.sh edit --image in.png --prompt "..." --out out.png
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI="$SKILL_DIR/upstream/scripts/image_gen.py"
KEYCHAIN_SERVICE="openai-api-key"
SECRET_FILE="$HOME/.agents/secrets/openai.env"

if [ ! -f "$CLI" ]; then
  echo "BROKEN: $CLI missing. Is the Codex app still installed?" >&2
  exit 1
fi

# Resolution order: env -> macOS Keychain -> chmod 600 file -> Codex auth.json.
# KEY_SOURCE is safe to print; OPENAI_API_KEY is not.
KEY_SOURCE=""

if [ -n "${OPENAI_API_KEY:-}" ]; then
  KEY_SOURCE="environment"
fi

if [ -z "$KEY_SOURCE" ] && command -v security >/dev/null 2>&1; then
  if k="$(security find-generic-password -a "$USER" -s "$KEYCHAIN_SERVICE" -w 2>/dev/null)"; then
    [ -n "$k" ] && { OPENAI_API_KEY="$k"; KEY_SOURCE="keychain"; }
  fi
fi

if [ -z "$KEY_SOURCE" ] && [ -f "$SECRET_FILE" ]; then
  k="$(grep -m1 -E '^(export +)?OPENAI_API_KEY=' "$SECRET_FILE" 2>/dev/null | sed -E 's/^(export +)?OPENAI_API_KEY=//; s/^["'"'"']//; s/["'"'"']$//')"
  [ -n "$k" ] && { OPENAI_API_KEY="$k"; KEY_SOURCE="file:$SECRET_FILE"; }
fi

if [ -z "$KEY_SOURCE" ] && [ -f "$HOME/.codex/auth.json" ]; then
  k="$(python3 -c "
import json,os
try: print(json.load(open(os.path.expanduser('~/.codex/auth.json'))).get('OPENAI_API_KEY') or '')
except Exception: print('')" 2>/dev/null)"
  [ -n "$k" ] && { OPENAI_API_KEY="$k"; KEY_SOURCE="codex-auth.json"; }
fi

export OPENAI_API_KEY="${OPENAI_API_KEY:-}"

if [ "${1:-}" = "--check" ]; then
  # Always report the model; it is useful with or without a key.
  echo "default model: $(grep -oE 'DEFAULT_MODEL = "[^"]*"' "$CLI" | head -1 | cut -d'"' -f2)"
  if [ -z "$KEY_SOURCE" ]; then
    echo "key: NOT FOUND — see 'Adding a key' in SKILL.md"
    exit 1
  fi
  # Report shape only, never the value.
  case "$OPENAI_API_KEY" in
    sk-*) echo "key: found via $KEY_SOURCE (looks like a platform key, ${#OPENAI_API_KEY} chars)" ; exit 0 ;;
    *)    echo "key: found via $KEY_SOURCE but does NOT start with sk- — probably not a platform key" ; exit 1 ;;
  esac
fi

if [ "${1:-}" = "--verify" ]; then
  # Live auth check against a free endpoint. Never prints the key.
  if [ -z "$KEY_SOURCE" ]; then
    echo "key: NOT FOUND — nothing to verify (see 'Adding a key' in SKILL.md)"
    exit 1
  fi
  hdr="$(mktemp)"; body="$(mktemp)"
  trap 'rm -f "$hdr" "$body"' EXIT
  code="$(curl -s -m 20 -o "$body" -D "$hdr" -w '%{http_code}' \
    -H "Authorization: Bearer $OPENAI_API_KEY" https://api.openai.com/v1/models)"
  echo "source: $KEY_SOURCE"
  case "$code" in
    200)
      echo "auth  : OK (200) — key is live"
      n="$(grep -c '"id"' "$body" 2>/dev/null || echo '?')"
      echo "models: $n visible to this key"
      grep -qi '"id": *"gpt-image' "$body" \
        && echo "images: gpt-image models visible" \
        || echo "images: NO gpt-image model visible — key may lack image access"
      ;;
    401) echo "auth  : FAILED (401) — key invalid, revoked, or wrong org" ;;
    429) echo "auth  : key valid but RATE LIMITED / quota exhausted (429)"
         grep -i '^x-ratelimit' "$hdr" | sed 's/^/        /' ;;
    *)   echo "auth  : unexpected HTTP $code"; head -c 300 "$body" ;;
  esac
  # Rate-limit budget for the current window. NOT account credit.
  grep -i '^x-ratelimit-remaining' "$hdr" | sed 's/^/limit : /' || true
  echo "note  : remaining account credit is NOT exposed to API keys —"
  echo "        see https://platform.openai.com/settings/organization/billing/overview"
  [ "$code" = "200" ] && exit 0 || exit 1
fi

if [ -z "$KEY_SOURCE" ]; then
  echo "NO USABLE KEY — stop and ask the user to add one (see 'Adding a key' in SKILL.md)." >&2
  echo "Do not retry; the API call will fail at the auth boundary." >&2
  exit 1
fi

# The CLI needs the `openai` SDK (and Pillow for --downscale / chroma-key work), which is not
# installed on system Python. Prefer uv so dependencies resolve into a managed, throwaway env
# instead of polluting the user's interpreter. Falls back to plain python3 if uv is absent.
if command -v uv >/dev/null 2>&1; then
  exec uv run --quiet --with openai --with pillow python3 "$CLI" "$@"
fi

if ! python3 -c "import openai" >/dev/null 2>&1; then
  echo "MISSING DEPENDENCY: the 'openai' SDK is not installed for $(command -v python3)." >&2
  echo "Install uv (recommended) or run: pip3 install openai pillow" >&2
  exit 1
fi

exec python3 "$CLI" "$@"
