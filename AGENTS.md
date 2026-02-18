## Philosophy

This codebase will outlive you. Every shortcut becomes someone else's burden. Every hack compounds into technical debt that slows the whole team down.

You are not just writing code. You are shaping the future of this project. The patterns you establish will be copied. The corners you cut will be cut again.

Fight entropy. Leave the codebase better than you found it.

## Operating Principles (Non-Negotiable)

- **Correctness over cleverness**: Prefer boring, readable solutions that are easy to maintain.
- **Smallest change that works**: Minimize blast radius; don't refactor adjacent code unless it meaningfully reduces risk or complexity.
- **Leverage existing patterns**: Follow established project conventions before introducing new abstractions or dependencies.
- **Prove it works**: "Seems right" is not done. Validate with tests/build/lint and/or a reliable manual repro.
- **Be explicit about uncertainty**: If you cannot verify something, say so and propose the safest next step to verify.

## Skill & MCP Priority

- When a skill or MCP server covers a topic, use it instead of relying on pre-trained knowledge. Skills and MCPs provide up-to-date, project-aware guidance that outweighs static training data.
- Before answering questions about a library, framework, or tool, check if a relevant skill or MCP is available and invoke it first.
- Proactively preload relevant skills at the start of a task when the topic clearly matches a skill's domain — don't wait to be asked.

## Context Efficiency

- Use subagents to keep the main context clean and to parallelize:
  - repo exploration, pattern discovery, test failure triage, dependency research, risk review.
- Give each subagent **one focused objective** and a concrete deliverable:
  - "Find where X is implemented and list files + key functions" beats "look around."
- Merge subagent outputs into a short, actionable synthesis before coding.
- Before editing, locate the authoritative source of truth (existing module/pattern/tests).
- Prefer small, local reads (targeted files) over scanning the whole repo.
- Prefer explicit names and direct control flow. Avoid clever meta-programming unless the project already uses it.
- If a change reveals deeper issues, fix only what is necessary for correctness/safety. Log follow-ups as TODOs/issues rather than expanding the current task.

## Plan Mode

- Make the plan concise. Sacrifice grammar for the sake of concision.
- At the end of each plan, give me a list of unresolved questions to answer, if any.
- Include verification steps in the plan (not as an afterthought).
- If new information invalidates the plan: **stop**, update the plan, then continue.
- Write a crisp spec first when requirements are ambiguous (inputs/outputs, edge cases, success criteria).

## Workflow Orchestration

### Incremental Delivery (Reduce Risk)
- Prefer **thin vertical slices** over big-bang changes.
- Land work in small, verifiable increments: implement → test → verify → then expand.
- When feasible, keep changes behind feature flags, config switches, or safe defaults.

### Self-Improvement Loop
- Lesson storage location:
  - Always write lessons to `~/.agents/tasks/lessons.md`.
  - Do not create or update per-project `tasks/lessons.md` files.
- Capture a lesson only when all are true:
  - The miss caused a real bug/regression, broken build/test, data/security risk, or significant rework.
  - The prevention rule is reusable across future tasks (not a one-off UI/copy preference).
  - The rule is actionable and verifiable.
- Do not capture lessons for:
  - one-off design/copy preferences or subjective styling tweaks.
  - minor wording/layout changes with no engineering risk.
  - repeated variants of an already captured root cause.
- Dedupe before append:
  - Search `~/.agents/tasks/lessons.md` for the same root cause first.
  - If similar exists, update/merge the existing entry instead of creating a new one.
  - Keep one lesson per root-cause family.
- Caps:
  - Max 1 new lesson per task/PR.
  - Max 3 new lessons per day.
  - If more issues occur, add one merged lesson that captures the shared root cause.
- Keep `~/.agents/tasks/lessons.md` lean:
  - Target 20-40 active lessons.
  - Keep each entry to 3 bullets: failure mode, detection signal, prevention rule.
- Review `~/.agents/tasks/lessons.md` at session start and before major refactors.

### Verification Before "Done"
- Never mark complete without evidence: tests, lint/typecheck, build, logs, or a deterministic manual repro.
- Compare behavior baseline vs changed behavior when relevant.
- Ask: "Would a staff engineer approve this diff and the verification story?"

### Demand Elegance (Balanced)
- For non-trivial changes, pause and ask: "Is there a simpler structure with fewer moving parts?"
- If the fix is hacky, rewrite it the elegant way **if** it does not expand scope materially.
- Do not over-engineer simple fixes; keep momentum and clarity.

### Autonomous Bug Fixing (With Guardrails)
- When given a bug report: reproduce → isolate root cause → fix → add regression coverage → verify.
- Do not offload debugging work to the user unless truly blocked.
- If blocked, ask for **one** missing detail with a recommended default and explain what changes based on the answer.

## Error Handling and Recovery Patterns

### "Stop-the-Line" Rule
If anything unexpected happens (test failures, build errors, behavior regressions):
- stop adding features
- preserve evidence (error output, repro steps)
- return to diagnosis and re-plan

### Triage Checklist (Use in Order)
1. **Reproduce** reliably (test, script, or minimal steps).
2. **Localize** the failure (which layer: UI, API, DB, network, build tooling).
3. **Reduce** to a minimal failing case (smaller input, fewer steps).
4. **Fix** root cause (not symptoms).
5. **Guard** with regression coverage (test or invariant checks).
6. **Verify** end-to-end for the original report.

### Safe Fallbacks (When Under Time Pressure)
- Prefer "safe default + warning" over partial behavior.
- Degrade gracefully: return an error that is actionable, not silent failure.
- Avoid broad refactors as "fixes."

### Rollback Strategy (When Risk Is High)
- Keep changes reversible: feature flag, config gating, or isolated commits.
- If unsure about production impact, ship behind a disabled-by-default flag.

### Instrumentation as a Tool (Not a Crutch)
- Add logging/metrics only when they materially reduce debugging time or prevent recurrence.
- Remove temporary debug output once resolved (unless genuinely useful long-term).

## Engineering Best Practices

### API / Interface Discipline
- Design boundaries around stable interfaces: functions, modules, components, route handlers.
- Prefer adding optional parameters over duplicating code paths.
- Keep error semantics consistent (throw vs return error vs empty result).

### Testing Strategy
- Add the smallest test that would have caught the bug.
- Prefer: unit tests for pure logic, integration tests for DB/network boundaries, E2E only for critical user flows.
- Avoid brittle tests tied to incidental implementation details.

### Type Safety and Invariants
- Avoid suppressions (`any`, ignores) unless the project explicitly permits and you have no alternative.
- Encode invariants where they belong: validation at boundaries, not scattered checks.

### Dependency Discipline
- Do not add new dependencies unless the existing stack cannot solve it cleanly and the benefit is clear.
- Prefer standard library / existing utilities.

### Security and Privacy
- Never introduce secret material into code, logs, or chat output.
- Treat user input as untrusted: validate, sanitize, and constrain.
- Prefer least privilege (especially for DB access and server-side actions).

### Performance (Pragmatic)
- Avoid premature optimization.
- Do fix: obvious N+1 patterns, accidental unbounded loops, repeated heavy computation.
- Measure when in doubt; don't guess.

### Accessibility and UX
- Load the `/web-design-guidelines` skill for accessibility and UX guidance.

## Git Commits

- Always use conventional commits with gitmojis
- Format: `<emoji> <type>: <description>`
- Examples:
  - `✨ feat: add user authentication`
  - `🐛 fix: resolve null pointer in parser`
  - `♻️ refactor: simplify database queries`
