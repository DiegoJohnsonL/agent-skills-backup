#!/usr/bin/env bash
# Installs or refreshes the paid animations.dev skills into the shared library
# and links them into every agent dir. The skills.sh CLI cannot manage these
# (no GitHub source), so this script owns them.
#
# Token: ~/.agents/secrets/animationsdev-token (one line) or $ANIMATIONSDEV_TOKEN.
# Get it from the install command shown at https://animations.dev/learn/skills.
set -euo pipefail

LIB="$HOME/.agents/skills"
TOKEN="${ANIMATIONSDEV_TOKEN:-$(cat "$HOME/.agents/secrets/animationsdev-token" 2>/dev/null || true)}"
[ -n "$TOKEN" ] || { echo "no token: write it to ~/.agents/secrets/animationsdev-token" >&2; exit 1; }

# upstream name -> library name. Renamed where a library skill already owns the name.
rename() { case "$1" in prototype) echo animation-prototype ;; *) echo "$1" ;; esac; }

# Agent dirs that receive symlinks: "dir|link-target-prefix"
AGENT_DIRS=(
  "$HOME/.claude/skills|../../.agents/skills"
  "$HOME/.codex/skills|../../.agents/skills"
  "$HOME/.gemini/skills|../../.agents/skills"
  "$HOME/.config/opencode/skills|$HOME/.agents/skills"
)

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
# --project writes into $STAGE/<agent>/skills instead of the real agent dirs,
# so nothing is written through an existing symlink. The codex variant is the
# superset: same files plus agents/openai.yaml.
(cd "$STAGE" && npx -y @animationsdev/install@latest --token="$TOKEN" --project -y >/dev/null)
SRC="$STAGE/.codex/skills"
[ -d "$SRC" ] || { echo "installer wrote nothing to $SRC" >&2; exit 1; }

installed=()
for dir in "$SRC"/*/; do
  upstream="$(basename "$dir")"
  name="$(rename "$upstream")"
  rm -rf "$LIB/$name"
  cp -R "$dir" "$LIB/$name"
  if [ "$name" != "$upstream" ]; then
    sed -i '' "s/^name: $upstream\$/name: $name/" "$LIB/$name/SKILL.md"
  fi
  for entry in "${AGENT_DIRS[@]}"; do
    agent_dir="${entry%%|*}"; prefix="${entry##*|}"
    [ -d "$agent_dir" ] || continue
    rm -rf "$agent_dir/$name"
    ln -s "$prefix/$name" "$agent_dir/$name"
  done
  installed+=("$name")
done

printf 'installed %d skills: %s\n' "${#installed[@]}" "${installed[*]}"
