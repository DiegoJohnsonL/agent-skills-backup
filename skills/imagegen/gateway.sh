#!/usr/bin/env bash
# Image generation through Vercel AI Gateway, for when OpenAI direct billing is
# unavailable or you want gateway observability/credits.
#
# WHY THIS EXISTS INSTEAD OF run.sh:
#   1. The gateway requires provider-prefixed slugs ("openai/gpt-image-2"), which
#      Codex's _validate_model() rejects (it demands a literal "gpt-image-" prefix).
#      Patching upstream is not an option — Codex overwrites it on app update.
#   2. The gateway has NO /v1/images/edits route (verified 404). Reference-image
#      editing is therefore impossible here; use run.sh against OpenAI direct for that.
#
#   gateway.sh --verify
#   gateway.sh --models
#   gateway.sh generate --model openai/gpt-image-2 --prompt "..." --out img.png
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE="https://ai-gateway.vercel.sh/v1"
KEYCHAIN_SERVICE="vercel-ai-gateway-key"
DEFAULT_MODEL="openai/gpt-image-2"

KEY="${AI_GATEWAY_API_KEY:-}"
KEY_SOURCE="environment"
if [ -z "$KEY" ] && command -v security >/dev/null 2>&1; then
  if k="$(security find-generic-password -a "$USER" -s "$KEYCHAIN_SERVICE" -w 2>/dev/null)"; then
    [ -n "$k" ] && { KEY="$k"; KEY_SOURCE="keychain"; }
  fi
fi

need_key() {
  if [ -z "$KEY" ]; then
    echo "NO GATEWAY KEY. Store one with:" >&2
    echo "  security add-generic-password -a \"\$USER\" -s $KEYCHAIN_SERVICE -w" >&2
    echo "or export AI_GATEWAY_API_KEY. Stop and ask the user — do not retry." >&2
    exit 1
  fi
}

case "${1:-}" in
  --models)
    # Public endpoint: no auth needed, so this works even before a key is stored.
    curl -s -m 20 "$BASE/models" | python3 -c "
import json,sys
ids=[m.get('id','') for m in json.load(sys.stdin).get('data',[])]
img=[i for i in ids if 'image' in i.lower()]
print(f'{len(ids)} models total; image-capable:')
[print(' ', i) for i in img]"
    exit 0 ;;
  --verify)
    need_key
    code="$(curl -s -m 20 -o /tmp/gw_verify -w '%{http_code}' "$BASE/models" -H "Authorization: Bearer $KEY")"
    echo "source: $KEY_SOURCE"
    case "$code" in
      200) echo "auth  : OK (200) — gateway key is live" ;;
      401|403) echo "auth  : FAILED ($code) — gateway key invalid"; exit 1 ;;
      *) echo "auth  : unexpected $code"; head -c 200 /tmp/gw_verify; exit 1 ;;
    esac
    echo "note  : gateway credit balance is shown at https://vercel.com/dashboard → AI Gateway"
    exit 0 ;;
esac

case "${1:-}" in
  generate|edit) shift ;;
  *) echo "usage: gateway.sh [--models|--verify|generate ...|edit --image src.png ...]" >&2; exit 2 ;;
esac
need_key

RUNNER="$SKILL_DIR/gateway/imagegen.mjs"
if [ ! -d "$SKILL_DIR/gateway/node_modules/ai" ]; then
  echo "Gateway runner deps missing. Install once with:" >&2
  echo "  (cd $SKILL_DIR/gateway && npm install)" >&2
  exit 1
fi

# Everything passes through to the runner, which owns its own node_modules and so
# works from any cwd / any repo. Editing is only possible via this AI SDK path.
exec env AI_GATEWAY_API_KEY="$KEY" node "$RUNNER" "$@"
