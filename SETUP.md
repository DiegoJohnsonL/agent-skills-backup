# Set up Claude Code on this device

**For the agent:** run these steps in order on a fresh Claude Code install. Every command is idempotent — safe to re-run. Stop and report if any step fails.

Paths use `~` / `$HOME` only. Nothing here is machine-specific.

---

## Step 1 — Make sure this repo is at `~/.agents`

```bash
[ -d ~/.agents/skills ] && echo "OK: already here" || \
  git clone https://github.com/DiegoJohnsonL/agent-skills-backup.git ~/.agents
```

Everything below assumes `~/.agents/AGENTS.md` and `~/.agents/skills/` exist.

---

## Step 2 — Link the global memory file

`~/.claude/CLAUDE.md` is a symlink to this repo's `AGENTS.md`, so global preferences follow the repo.

```bash
mkdir -p ~/.claude
rm -f ~/.claude/CLAUDE.md
ln -s ~/.agents/AGENTS.md ~/.claude/CLAUDE.md
```

---

## Step 3 — Link every skill

One symlink per skill dir. The target is **relative** (`../../.agents/...`) so it resolves from inside `~/.claude/skills/`.

```bash
mkdir -p ~/.claude/skills
for d in ~/.agents/skills/*/; do
  name=$(basename "$d")
  ln -sfn "../../.agents/skills/$name" ~/.claude/skills/"$name"
done
echo "linked $(find ~/.claude/skills -maxdepth 1 -type l | wc -l) skills"
```

Never copy skills into `~/.claude/skills` — always symlink, so edits flow back to this repo and get committed. If a real (non-symlink) dir shows up there later, move it into `~/.agents/skills/` and replace it with a link.

---

## Step 4 — Install the theme

```bash
mkdir -p ~/.claude/themes
cat > ~/.claude/themes/ghostty-glass.json <<'JSON'
{
  "name": "Ghostty Glass",
  "base": "dark-ansi",
  "overrides": {
    "userMessageBackground": "#3e2e3f",
    "userMessageBackgroundHover": "#4a3649"
  }
}
JSON
```

---

## Step 5 — Select the theme

```bash
python3 - <<'PY'
import json, pathlib
p = pathlib.Path.home() / ".claude" / "settings.json"
cfg = json.loads(p.read_text()) if p.exists() else {}
cfg["theme"] = "custom:ghostty-glass"
p.write_text(json.dumps(cfg, indent=2) + "\n")
print("theme set ->", cfg["theme"])
PY
```

Takes effect on the next session start. Manual equivalent: `/config` → Theme → **Ghostty Glass**.

---

## Step 6 — Install the status bar

Two halves: the widget layout (this repo) and the wiring that invokes it (`settings.json`). The layout lives in `~/.config/ccstatusline/`, **outside** both `~/.claude` and this repo — it survives a `~/.claude` wipe, but is lost if the machine is.

```bash
npm install -g ccstatusline
mkdir -p ~/.config/ccstatusline
cp ~/.agents/ccstatusline.json ~/.config/ccstatusline/settings.json
```

Then point Claude Code at it:

```bash
python3 - <<'PY'
import json, pathlib
p = pathlib.Path.home() / ".claude" / "settings.json"
cfg = json.loads(p.read_text()) if p.exists() else {}
cfg["statusLine"] = {"type": "command", "command": "ccstatusline"}
p.write_text(json.dumps(cfg, indent=2) + "\n")
print("statusline wired ->", cfg["statusLine"]["command"])
PY
```

Renders `~/.agents · main · 124.0k/1.0M · 12.4%`. Needs ccstatusline **≥ 2.1** — older builds hardcode a 200k context window and report a wrong percentage on 1M-context models.

`ccstatusline` is installed per Node version. If you switch Node, re-run the `npm install -g`, or swap the command to `npx -y ccstatusline@latest`.

---

## Step 7 — Verify

```bash
readlink ~/.claude/CLAUDE.md
echo "skills in repo: $(ls ~/.agents/skills | wc -l)"
echo "symlinks:       $(find ~/.claude/skills -maxdepth 1 -type l | wc -l)"
echo "broken links:"; find ~/.claude/skills -maxdepth 1 -type l ! -exec test -e {} \; -print
python3 -c 'import json;json.load(open("'"$HOME"'/.claude/themes/ghostty-glass.json"));print("theme JSON valid")'
command -v ccstatusline >/dev/null && echo "ccstatusline $(ccstatusline --version 2>/dev/null || echo '?')" || echo "MISSING: ccstatusline"
jq -e '.statusLine.command' ~/.claude/settings.json
```

Pass = `CLAUDE.md` points at `~/.agents/AGENTS.md`, the two skill counts match, and no broken links are listed.

Then restart the session and confirm the theme applied.

---

## Not covered here (rebuild per device)

Deliberately excluded — these are machine-specific or need re-auth anyway:
model and effort settings, permission allowlists, hooks, plugins, MCP servers, login.

---

## Keeping this repo in sync

Skills are edited through the symlinks, so changes land in `~/.agents` directly. Commit and push from there:

```bash
git -C ~/.agents add -A
git -C ~/.agents commit -m "✨ chore: <what changed>"
git -C ~/.agents push origin main
```
