# Lessons Learned

- Date: 2026-02-18
  - Failure mode: I trusted dependency upgrade output without re-verifying latest versions after a just-published release.
  - Detection signal: `package.json` versions diverged from registry `dist-tags/latest` after upgrade commands.
  - Prevention rule: For dependency upgrades, verify registry `dist-tags` and run package-by-package current-vs-latest checks before finishing.

- Date: 2026-02-18
  - Failure mode: I removed tRPC app-router exports during dead-code cleanup without checking contract usage.
  - Detection signal: User flagged `RouterInputs`/`RouterOutputs` as an active contract surface.
  - Prevention rule: Treat shared router exports as contract-level and require explicit confirmation before removal.

- Date: 2026-02-18
  - Failure mode: I changed hook output shapes during migration and broke nullable/optional compatibility.
  - Detection signal: Build failed on `string | null` vs `string | undefined` type mismatches in downstream props.
  - Prevention rule: Preserve existing output contracts during incremental migrations, or normalize at the boundary until all consumers migrate together.

- Date: 2026-02-18
  - Failure mode: I assumed generated SDK responses always had a defined `data` payload.
  - Detection signal: Build failed because `response.data` can be `undefined`.
  - Prevention rule: Treat generated SDK payloads as optional at boundaries and null-guard before mapping fields.

- Date: 2026-02-18
  - Failure mode: I mapped runtime tables with `pgSchema("public")`, which Drizzle rejects.
  - Detection signal: Tests/build failed with `You can't specify 'public' as schema name`.
  - Prevention rule: Use `pgTable(...)` for default schema tables; reserve `pgSchema(...)` for non-default schemas.

- Date: 2026-02-18
  - Failure mode: I mixed non-canonical raw SQL usage into runtime app logic and trusted SQL result shapes too early.
  - Detection signal: Build/type failures occurred when strict domain fields received non-validated SQL values.
  - Prevention rule: Default runtime data access to Drizzle query APIs; if raw SQL is necessary, add explicit runtime type guards at the boundary.

- Date: 2026-02-17
  - Failure mode: I refactored generated client interceptors away from the established callback shape and created churn.
  - Detection signal: Build failed on interceptor signature mismatch and behavior diverged from project pattern.
  - Prevention rule: Preserve established interceptor callback shapes unless doing a full typed migration validated end-to-end.

- Date: 2026-02-17
  - Failure mode: I registered auth interceptors in an effect, allowing early requests to fire before token setup.
  - Detection signal: Initial dashboard requests failed with auth/validation errors before interceptor readiness.
  - Prevention rule: Register auth-critical interceptors before initial query execution and initialize token refs immediately.

- Date: 2026-02-17
  - Failure mode: I configured Better Auth + Drizzle without passing the explicit auth schema object.
  - Detection signal: OAuth flow returned 500 with missing `verification` model in schema.
  - Prevention rule: Always pass `{ user, session, account, verification }` via `drizzleAdapter(..., { schema })`.

- Date: 2026-02-17
  - Failure mode: I changed shared auth helper return types without updating all dependents.
  - Detection signal: Build failed on `null` vs `undefined` contract mismatch.
  - Prevention rule: Keep shared helper return types stable unless all dependents are migrated in the same change.

- Date: 2026-02-17
  - Failure mode: I kept building advanced UX after the user narrowed scope to MVP fields and exposed internal linkage fields in host UI.
  - Detection signal: User explicitly asked to remove advanced field logic and hide internal identifiers.
  - Prevention rule: When scope narrows, remove optional complexity end-to-end and keep internal linkage identifiers derived server-side, not user-entered.

- Date: 2026-02-16
  - Failure mode: I misaligned SSR hydration/prefetch strategy with query consumption mode.
  - Detection signal: Hydration mismatches appeared when prefetched/dehydrated state and client query mode were inconsistent.
  - Prevention rule: Ensure provider/hydration order and prefetch strategy match the query pattern; await prefetch only when SSR HTML depends on resolved data.

- Date: 2026-02-16
  - Failure mode: I pursued UI-layer assumptions before first validating request status and backend route behavior.
  - Detection signal: Pending/default UI states traced back to backend status and route-level issues.
  - Prevention rule: For hangs or fallback metrics, first check network status/curl results and add step-level server route logging before rewiring UI.

- Date: 2026-02-16
  - Failure mode: I simplified frontend behavior without fully removing related backend/schema/client contracts.
  - Detection signal: User asked whether backend ordering logic and contracts were still present.
  - Prevention rule: For domain simplification, remove or align schema, controller behavior, OpenAPI, and generated client contracts in the same pass.

- Date: 2026-02-16
  - Failure mode: I introduced custom integration scaffolding instead of starting from the documented baseline and dominant in-repo patterns.
  - Detection signal: User rejected custom scaffolding and requested official flow/pattern alignment.
  - Prevention rule: Implement official baseline integration first, then layer abstractions only when a proven need exists.

- Date: 2026-02-16
  - Failure mode: I handled Strapi data integrity in narrow code paths without validating the true persistence model.
  - Detection signal: Cleanup or constraints missed real entry points/storage tables.
  - Prevention rule: Prefer lifecycle hooks for cross-entry-point cleanup and inspect actual DB table layout before writing relation migrations.

- Date: 2026-02-16
  - Failure mode: I implemented before clarifying solution space on exploratory requests.
  - Detection signal: User clarified they wanted options/tradeoff research first.
  - Prevention rule: For exploratory asks, present official options and tradeoffs first, then implement only after direction is confirmed.

- Date: 2026-02-13
  - Failure mode: I applied feature/flow changes in one surface but missed other callsites and stale domain terms.
  - Detection signal: Old tabs/terms/conditions still appeared in secondary flows after rollout.
  - Prevention rule: For shared components and replaced flows, audit all callsites plus copy/validation gates across host and guest surfaces.

- Date: 2026-02-13
  - Failure mode: I debugged auth redirect issues without validating effective env precedence.
  - Detection signal: Local auth unexpectedly redirected to production due to `.env.local` overrides.
  - Prevention rule: For redirect/cookie host mismatches, verify effective env precedence and provider callback origins before changing code.

- Date: 2026-02-13
  - Failure mode: I added route-specific shared-component props as required and broke other callers.
  - Detection signal: Build failed due to missing new prop on another callsite.
  - Prevention rule: Make new route-specific props optional by default or update all callsites atomically.

- Date: 2026-02-13
  - Failure mode: I over-scoped integration work beyond the approved release slice.
  - Detection signal: User requested rollback to configuration-only behavior for the milestone.
  - Prevention rule: Lock production vs test-only scope before coding and reject runtime wiring outside the approved slice.

- Date: 2026-02-13
  - Failure mode: I regenerated API client artifacts against the wrong active backend/docs source.
  - Detection signal: Generated output diverged from expected branch source-of-truth.
  - Prevention rule: Before codegen, verify the running backend belongs to the active branch and required fields exist in live docs.

- Date: 2026-02-12
  - Failure mode: I added new rendering/dependency paths without validating installed export surface and type support early.
  - Detection signal: Build failed with missing module export paths and missing type declarations.
  - Prevention rule: After adding new backends/dependencies, validate package exports and run type checks immediately before deeper implementation.

- Date: 2026-02-11
  - Failure mode: I passed unresolved CSS color tokens to canvas/WebGL paths with wrong format assumptions.
  - Detection signal: Runtime color conversion failed on `hsl(lab(...))` style input.
  - Prevention rule: Resolve CSS variables to concrete `rgb(...)`/numeric values before passing colors to rendering libraries.

- Date: 2026-02-11
  - Failure mode: I reported completion before explicitly proving each requested change landed.
  - Detection signal: User follow-up asked for a missing explicit change that should have been verified.
  - Prevention rule: Before marking complete, run direct grep/diff checks for explicit user-requested edits and report that evidence.

- Date: 2026-02-06
  - Failure mode: I introduced shared-entity and bulk update logic without enforcing consistent write/read synchronization rules.
  - Detection signal: First-run races, stale UI after bulk operations, and reload mismatches appeared in relationship flows.
  - Prevention rule: In bulk/shared-entity flows, pre-create shared entities, use stable IDs, batch invalidations once, update populate/read paths, and verify with hard reload.

- Date: 2026-02-08
  - Failure mode: I treated nested popover/table editor state as straightforward and missed dismissal/cache/draft-sync edge cases.
  - Detection signal: Parent editor closed unexpectedly, labels lagged until reload, and drafts reset during rerenders.
  - Prevention rule: In nested editors, guard parent close during child interactions/completion, refresh the exact cache used for labels, and never resync local draft from props while open.

- Date: 2026-02-09
  - Failure mode: I assumed Strapi bulk API method availability without runtime verification.
  - Detection signal: Runtime error showed method unavailable and bulk requests soft-failed.
  - Prevention rule: Prefer Strapi bulk document methods, but verify runtime support and keep a version-safe fallback path.

- Date: 2026-02-09
  - Failure mode: I treated async authorization checks as binary and mutated URL/state before resolution.
  - Detection signal: Deep-link edit-mode behavior risked breaking while auth state was still loading.
  - Prevention rule: Model async auth as tri-state (`unknown`/`false`/`true`) and avoid URL/state mutation until authorization resolves.

- Date: 2026-02-17
  - Failure mode: I used internal identifiers as user-facing labels and issued shell commands with unquoted metacharacter paths.
  - Detection signal: UI showed opaque IDs and zsh commands failed with `no matches found` on route-group paths.
  - Prevention rule: Use user-facing identity fields for labels (never primary fallback to `documentId`) and always quote shell paths containing metacharacters.

- Date: 2026-02-18
  - Failure mode: I over-refactored shared filter state logic (`filter-value` and debounced input) while chasing React Doctor state/effect rules, which introduced UX regressions.
  - Detection signal: User reported filter value behavior looked buggy immediately after the change.
  - Prevention rule: For shared interaction-heavy controls, prefer minimal behavior-preserving edits and verify core UX manually before keeping rule-driven refactors.
