# PRD Template (Single File With Embedded Spec)

## Goal

Implement `<feature>` with small, verifiable increments suitable for Ralph loops.

## In Scope

- Core runtime behavior for `<feature>`.
- Required interfaces, data flow, and integration points.
- Validation and feedback loop coverage for changed paths.

## Out of Scope

- Unrelated refactors and non-essential polish.
- Broad architecture changes not required for `<feature>`.
- Non-deterministic or unverifiable acceptance criteria.

## Shared Implementation Contract

1. One logical task per iteration.
2. Prioritize risky and integration tasks before lower-risk polish.
3. Keep interfaces explicit and backward-compatible unless otherwise stated.
4. Update task status as work completes.
5. Append concise progress notes for the next iteration.

## Failure Behavior

- If checks fail, do not commit.
- If scope is ambiguous, constrain work to explicit PRD tasks.
- If blocked, mark task as blocked with a concrete reason.

## Verification Requirements

- Run type checks, tests, and lint before completion.
- Validate acceptance criteria per task before marking complete.
- Confirm no pending PRD tasks at finish.

## Assumptions

- Task source of truth is PRD JSON in markdown.
- Feedback loop commands are available in the target repo.
- Completion is deterministic and machine-checkable.

## Deliverable Shape

- One PRD markdown file containing both spec sections and task JSON.

## Tasks (JSON)

```json
{
  "description": "<clear end-state description>",
  "tasks": [
    {
      "id": "1",
      "title": "<task title>",
      "description": "Context: <why this task exists> Task: <what to implement> Validation: <how to verify done>",
      "status": "pending"
    }
  ]
}
```
