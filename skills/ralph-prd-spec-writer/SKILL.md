---
name: ralph-prd-spec-writer
description: Generate and lint Ralph-compatible single-file PRDs that include spec sections, atomic task JSON, risk-first ordering, and explicit verification criteria. Use when drafting new PRDs, converting briefs, or validating planning artifacts.
---

# Ralph Single-File PRD Writer

Use this skill when the user needs a reusable PRD artifact for Ralph loops, with all specification content embedded in the same file.

## Clarification-First Protocol (Required)

Before writing or editing a PRD, run a clarification pass first.

1. Ask targeted open questions until intent is concrete enough to avoid major assumptions.
2. Cover at minimum:
   - objective and user outcome
   - in-scope vs out-of-scope boundaries
   - canonical input/output examples
   - data model/schema constraints
   - failure behavior and fallback expectations
   - verification/acceptance criteria
   - rollout/migration constraints and dependencies
3. If tool mode supports structured question collection, prefer that mechanism.
4. If tool mode does not support it, ask the questions directly in chat before drafting.
5. Do not produce the final PRD until unanswered material questions are resolved or explicitly accepted as assumptions by the user.
6. In the PRD, list any remaining assumptions explicitly.

## Authoring Workflow (No Scripts)

1. Read `references/ralph-guidelines.md`.
2. Read `references/prd-template.md`.
3. Read `references/task-quality-checklist.md`.
4. Create or update one markdown file (`PRD.md` unless the user provides a different path).
5. Write the spec sections and the PRD task JSON directly in that same file.
6. Do not run scripts to generate planning files. The LLM must author the file content directly from the guide and templates.
7. Validate each task against the checklist before finalizing.

## Output Contract

1. Output is one file only: `PRD.md` (or user-specified filename/path).
2. The PRD contains spec headings:
   - `## Goal`
   - `## In Scope`
   - `## Out of Scope`
   - `## Shared Implementation Contract`
   - `## Failure Behavior`
   - `## Verification Requirements`
   - `## Assumptions`
   - `## Deliverable Shape`
3. The same PRD contains one fenced JSON object with `description` and `tasks[]`.
4. Every task has string `id`, `title`, `description`, `status`.
5. Task description must include `Context:`, `Task:`, and `Validation:`.

## Ralph Recommendations Embedded

1. Scope is explicit and end-state driven.
2. Risky and integration tasks are prioritized.
3. Tasks are small and commit-friendly.
4. Type test lint checks are mandatory quality gates.
5. Progress notes stay concise for next iterations.
6. Completion criteria are compatible with AFK stop rules.

## References

- `references/ralph-guidelines.md`
- `references/prd-template.md`
- `references/task-quality-checklist.md`
