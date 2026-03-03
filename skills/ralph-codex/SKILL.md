---
name: ralph-codex
description: Run Codex in a Ralph loop with fresh context per iteration. Use when users ask for autonomous coding loops, ralph-once, afk-ralph, or iterative task execution from PRD files.
---

# Ralph Codex

Use this skill when the user wants a Ralph-style coding loop using Codex.

## Core Rules

1. Use a fresh Codex process every iteration (`codex exec --ephemeral`).
2. Never use a single long-lived session loop.
3. Work from PRD plus progress files each iteration.
4. Run Codex in full-access execution mode for uninterrupted AFK operation.
5. Prioritize risky tasks first (architecture, integrations, unknowns), then lower-risk tasks.
6. Pick the worktree/branch that best fits the task; reuse branch/PR for related tasks when appropriate.
7. Hard-pin Codex runtime to `gpt-5.3-codex` with `model_reasoning_effort="high"`.
8. Follow `references/prompt-contract.md` as the single source of truth for workflow directives.

## Commands

- `ralph-codex once --repo <abs> --prd <path> --progress <path> [--checks "<cmd>"] [--base-branch <name>]`
- `ralph-codex afk --repo <abs> --prd <path> --progress <path> --iterations <n> [--checks "<cmd>"] [--base-branch <name>]`
- `ralph-codex status --repo <abs> --prd <path>`
- `ralph-codex doctor`

## Usage Workflow

1. Run `ralph-codex doctor`.
2. Start with HITL mode using `once` to refine behavior.
3. Move to `afk` with bounded iterations once stable.
4. Review agent-created PRs as tasks complete.

## References

- Prompt contract: `references/prompt-contract.md`
