#!/usr/bin/env bash
# Detects when Codex's upstream imagegen skill changes in ways that could invalidate
# the Claude Code adapter in SKILL.md. Model-version bumps are expected and fine;
# structural changes to mode selection are what need a human look.
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UPSTREAM="$SKILL_DIR/upstream"
BASELINE="$SKILL_DIR/.upstream-baseline"

if [ ! -d "$UPSTREAM" ]; then
  echo "BROKEN: $UPSTREAM does not resolve. Is the Codex app still installed?"
  echo "Expected target: ~/.codex/skills/.system/imagegen"
  exit 1
fi

current_hash() {
  cat "$UPSTREAM/SKILL.md" "$UPSTREAM/references/cli.md" "$UPSTREAM/references/image-api.md" 2>/dev/null \
    | shasum -a 256 | cut -d' ' -f1
}

model="$(grep -oE 'DEFAULT_MODEL = "[^"]*"' "$UPSTREAM/scripts/image_gen.py" | head -1 | cut -d'"' -f2)"
hash="$(current_hash)"

echo "current CLI default model : ${model:-UNKNOWN}"
echo "upstream doc hash         : ${hash:0:12}"

if [ ! -f "$BASELINE" ]; then
  printf '%s\n%s\n' "$hash" "$model" > "$BASELINE"
  echo "status                    : baseline recorded (first run)"
  exit 0
fi

old_hash="$(sed -n 1p "$BASELINE")"
old_model="$(sed -n 2p "$BASELINE")"

[ "$model" != "$old_model" ] && echo "MODEL BUMP: $old_model -> $model (expected; adapter needs no change)"

if [ "$hash" != "$old_hash" ]; then
  echo "status                    : DRIFT — upstream docs changed"
  echo "Re-read upstream/SKILL.md and confirm these adapter assumptions still hold:"
  echo "  1. built-in 'image_gen' is still the upstream default mode (we override it)"
  echo "  2. scripts/image_gen.py still takes: generate | generate-batch | edit"
  echo "  3. transparency still routes via chroma-key + remove_chroma_key.py"
  echo "  4. --model is still optional and defaults to DEFAULT_MODEL"
  printf '%s\n%s\n' "$hash" "$model" > "$BASELINE"
else
  echo "status                    : in sync"
fi
