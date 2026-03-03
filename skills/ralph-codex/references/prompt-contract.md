# Prompt Contract

This file is the single source of truth for Ralph/Codex iteration workflow directives.

## Objective
Complete one meaningful PRD task per iteration with verifiable evidence.

## Required Outcomes Per Iteration
1. Read the PRD and progress files first.
2. Select exactly one incomplete PRD task and keep scope to that task.
3. Prioritize task selection by risk:
   - architectural decisions and core abstractions
   - integration points between modules
   - unknowns/spikes
   - standard implementation tasks
   - polish/cleanup
4. Choose, create, or reuse the worktree/branch that best fits the selected task.
   - Reuse an existing worktree/branch when related tasks share the same integration surface.
   - Start a new worktree/branch when coupling would reduce clarity or increase risk.
5. Copy `.env` and `.env.local` from the source repo root into that task worktree before checks (if the files exist).
6. Implement the selected task deliverable in the task worktree.
7. Add or update tests/verification artifacts required by the task's validation criteria.
8. Run required checks in the task worktree (task validation checks plus launcher-provided checks).
9. Update PRD/progress in the main repo source-of-truth paths.
10. Push commits for the active branch each iteration.
11. Create a PR as early as practical for the branch, then keep pushing subsequent related-task commits to the same PR.
12. If a PR already exists for the active branch, update it with new commits and refreshed context.
13. Mark a task complete only when its PRD validation criteria are satisfied with evidence.

## Guardrails
- Do not mark a task complete based only on intent or partial progress.
- Treat PRD task `status` as backlog source of truth; use `progress.txt` as execution log/evidence handoff.
- If checks fail unexpectedly, stop scope expansion and debug/fix first.
- Commit granularity is agent-decided

## Completion Signal
Emit `<promise>COMPLETE</promise>` only when every PRD task is complete.
