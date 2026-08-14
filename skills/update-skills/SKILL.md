---
name: update-skills
description: Update installed skills with the skills.sh CLI and repair renamed, moved, or removed skills
disable-model-invocation: true
---

# Update skills

Update the skill library in `~/.agents/skills` with the skills.sh CLI, then repair what the CLI skips.

The layout: `~/.agents/skills/<name>` holds each skill. Agent dirs such as `~/.claude/skills/<name>` hold symlinks into it. `~/.agents/.skill-lock.json` maps each skill to its upstream repo (`source`) and file path (`skillPath`).

CLI behavior, verified on v1.5.22: `update` matches skills by installed name and `skillPath` only. When upstream renames a skill folder or moves it to another directory, `update` skips it silently — the old copy stays on disk, stale. `update` also re-links every skill it refreshes into every detected agent dir, which resurrects symlinks that were removed on purpose. `add` writes a real directory into `~/.claude/skills/` and replaces the symlink there; it leaves `~/.agents/skills` untouched. All three quirks are repaired in the steps below.

## Steps

1. **Baseline.** In `~/.agents`, commit all pending changes. Done when `git status` is clean.

2. **Update.** Run `npx -y skills@latest update --global --yes` from `~/.agents`.

3. **Dedup against the Vercel plugin.** Claude Code gets `vercel:*` skills from the `vercel` plugin, so the library copies duplicate them in Claude only; Codex has no plugin and reads them from `~/.agents`. Remove the Claude symlink for each of: `ai-sdk`, `chat-sdk`, `shadcn`, `workflow`, `vercel-cli`, `vercel-react-best-practices`. Keep `vercel-blob` (the plugin's `vercel-storage` overlaps it only partially) and keep every library copy in `~/.agents/skills`. Done when none of the six names is present in `~/.claude/skills`.

4. **Find the untouched.** Run `git diff .skill-lock.json`. A skill whose `updatedAt` stayed unchanged is either already current or silently skipped as broken — the diff alone cannot tell them apart. Done when every unchanged entry is on your list — sweep the whole lock file, all sources.

5. **Classify each untouched skill** against its upstream tree:
   `gh api "repos/<source>/git/trees/HEAD?recursive=1" --jq '.tree[]'`
   - Folder still at the lock's `skillPath` and its tree `sha` equals the lock's `skillFolderHash` → **current**: drop it from the list.
   - Same folder name under a new path → **moved**: reinstall by name.
   - Folder gone, a new folder covers the same job (check the repo's release notes and compare view for remove/add pairs) → **renamed**: install the new name, delete the old.
   - Folder gone with no successor → **removed**: delete it.

6. **Reinstall** each moved skill and each rename's new name:
   `npx -y skills@latest add <source> -g -y --skill <name> --agent claude-code`
   Repeat `--skill` per name; the CLI reads a comma list as one name. Then repair the layout: move each installed directory from `~/.claude/skills/<name>` to `~/.agents/skills/<name>` and symlink it back. For the six plugin-duplicated names from step 3, leave the Claude symlink out — move the directory into the library and stop there.

7. **Delete** each removed skill and each rename's old name in all three places: the directory in `~/.agents/skills`, the symlink in every agent dir, and the entry in `.skill-lock.json`.

8. **Verify and commit.** Done when every library entry in `~/.claude/skills` is a symlink into `~/.agents/skills`, every lock entry carries today's `updatedAt` or was deliberately deleted, and `~/.agents` holds one new commit (gitmoji + conventional message) with a clean tree after it.
