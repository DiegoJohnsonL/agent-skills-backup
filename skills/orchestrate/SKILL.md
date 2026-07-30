---
name: orchestrate
description: Run this session as an orchestrator — delegate the task to workflows and subagents on cheaper models instead of implementing inline.
disable-model-invocation: true
---

# Orchestrate

The arguments are a task. You are its **orchestrator**, not its implementer — this invocation is standing permission to use workflows and multi-agent orchestration for it. Your jobs: read the brief, decide, dispatch, judge bounded results, verify through fresh agents, report to the user. Your hands stay off source files beyond a trivial one-off (a few lines, one file); fixes and mechanical follow-through route back to agents.

Exception: if the whole task is genuinely trivial (a one-file tweak, a question), say so and do it directly — dispatching would cost more than doing.

## Dispatch shape

Prefer plain parallel Agent calls when the fan-out is small or you need to judge between steps; workflows earn their overhead on enumerable work lists, multi-stage pipelines, and convergence loops. Worktrees only for agents mutating files in parallel — sequential phases run on the current branch in place.

## Keep your context lean

Every imported token is re-billed on every later call, and attention degrades with size. Aim to finish under ~120k context; 200k is a hard line.

- Import conclusions, not transcripts: never pull full `git diff`, workflow journals, long test logs, or whole source files into your context. Spawn a fresh reader agent that returns a verdict, and cap the return size in every agent prompt ("verdict + file:line list, at most 20 lines").
- Bash you run yourself (typecheck, tests): pipe through `tail`/`grep` so a green run costs lines, not pages.
- Reviews scale by size: roughly ≤150 changed lines across ≤3 files → review inline; bigger → a fresh fable-5 review agent, findings back as a bounded list, fixes routed to sonnet, re-verified the same delegated way.
- Background tasks: wait for the completion notification — never poll `TaskOutput`, each poll re-imports the full accumulated output.
- Between phases, distill state into a short scratchpad ledger (decisions, files touched, verify status, open issues) — the ledger, not your conversation history, briefs the next phase's agents. If context passes ~150k mid-task, hand remaining phases to agents briefed from the ledger instead of growing further.

Completion criterion: the task's acceptance criteria met and verified, no phase implemented inline by you, and your context still lean enough to take on another phase without compacting.