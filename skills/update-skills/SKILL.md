---
name: update-skills
description: Update installed skills with the skills.sh CLI and repair renamed, moved, or removed skills
disable-model-invocation: true
---

# Update skills

Update the skill library in `~/.agents/skills` with the skills.sh CLI, then repair what the CLI skips.

The layout: `~/.agents/skills/<name>` holds each skill. Agent dirs such as `~/.claude/skills/<name>` hold symlinks into it. `~/.agents/.skill-lock.json` maps each skill to its upstream repo (`source`) and file path (`skillPath`).

CLI behavior, verified on v1.5.22: `update` matches skills by installed name and `skillPath` only. When upstream renames a skill folder or moves it to another directory, `update` skips it silently — the old copy stays on disk, stale. `add` writes a real directory into `~/.claude/skills/` and replaces the symlink there; it leaves `~/.agents/skills` untouched. Both quirks are repaired in the steps below.

## Steps

1. **Baseline.** In `~/.agents`, commit all pending changes. Done when `git status` is clean.

2. **Update.** Run `npx -y skills@latest update --global --yes` from `~/.agents`.

3. **Find the skipped.** Run `git diff .skill-lock.json`. Every skill whose `updatedAt` stayed unchanged was skipped: upstream renamed, moved, or deleted it. Done when every unchanged entry is on your list — sweep the whole lock file, all sources.

4. **Classify each skipped skill** by listing its upstream `SKILL.md` paths:
   `gh api "repos/<source>/git/trees/HEAD?recursive=1" --jq '.tree[] | select(.path | endswith("SKILL.md")) | .path'`
   - Same folder name under a new path → **moved**: reinstall by name.
   - Folder gone, a new folder covers the same job (check the repo's release notes and compare view for remove/add pairs) → **renamed**: install the new name, delete the old.
   - Folder gone with no successor → **removed**: delete it.

5. **Reinstall** each moved skill and each rename's new name:
   `npx -y skills@latest add <source> -g -y --skill <name> --agent claude-code`
   Repeat `--skill` per name; the CLI reads a comma list as one name. Then repair the layout: move each installed directory from `~/.claude/skills/<name>` to `~/.agents/skills/<name>` and symlink it back.

6. **Delete** each removed skill and each rename's old name in all three places: the directory in `~/.agents/skills`, the symlink in every agent dir, and the entry in `.skill-lock.json`.

7. **Verify and commit.** Done when every library entry in `~/.claude/skills` is a symlink into `~/.agents/skills`, every lock entry carries today's `updatedAt` or was deliberately deleted, and `~/.agents` holds one new commit (gitmoji + conventional message) with a clean tree after it.
