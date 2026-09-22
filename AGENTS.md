## Code
- Names and structure carry the explanation, so files read comment-free. A comment earns its line only by stating what the code cannot show: an invariant, an external system's quirk.
- Choose the simplest implementation that fully meets the current requirements. Avoid speculative abstractions, configuration, and indirection.
- Do not preserve backward compatibility. Remove obsolete paths instead of adding compatibility layers, fallbacks, or migrations.
- Prefer established, well-maintained libraries when they reduce overall complexity or improve reliability. Lean on the dependencies already in the project before writing your own implementation or adding packages, and check a library's documentation and types before assuming it lacks a capability.
- Before adding a fallback or safeguard, zoom out to the full flow of the feature and decide if the case would actually happen.
- tRPC with React Query: never await server-side `prefetchQuery` / `prefetchInfiniteQuery`; when a server component prefetches for a client, consume it with `useSuspenseQuery`.

## Architecture
- I love to build: ambitious ideas, simple systems, software that feels obvious. Understand the real constraint, then fight for the smallest model that makes the correct behavior unsurprising. Preserved complexity and impressive-looking machinery both fail this test.
- Grow the system in layers. Start from the smallest version that works end to end, and add each capability on top of a product that already works. Never trade a working product for unfinished complexity.
- Make architectural decisions for the long term. Do not accept a stopgap that only works for now.

## Git & PRs
- Always use conventional commits with gitmojis.
- PRs should be simple and easy to understand. Descriptions open with a minimal clear statement of the problem, then how you solved it.
- Add a blurb at the end of the PR description about what model and harness made the change.
- Rebase onto the latest base branch before opening. Stale branches conflict and waste a review round.

## Memory
- Write a memory only when I ask in that message ("remember this", "save that"). Recall stays on: read and cite freely.

## Writing
Write like a person with opinions. Plain words, active voice, one idea per sentence, varied rhythm, first person when it fits. Be specific: "agents churning away at 3am" beats "this is concerning". Say what a thing does or give the number, never how it feels. Cut any sentence that could sit unchanged in another project's docs.

- Punctuation: periods and commas only. No em dashes, en dashes, or parentheses as asides. Colons only before a list or example. Straight quotes, sentence-case headings, no decorative emojis.
- Bold only a lead-in that ends in a period and is followed by new detail. Everything else stays plain.
- Delete on sight: chatbot phrases ("Hope this helps", "Great question"), filler ("in order to", "it is important to note"), stacked hedges, puffery and AI vocabulary (pivotal, testament, landscape, delve, crucial, leverage), abstract metaphor nouns (substrate, vector, primitive, harness, north star, flywheel), fancy "is" ("serves as", "boasts"), "not just X but Y", forced triads, "from X to Y" false ranges, adverbs propping up weak verbs.
- Finish with a self-audit: "What makes this obviously AI generated?" Fix what you find.

## TypeScript
- Type every value precisely. Take `unknown` at the boundary and narrow it.
- Make impossible states unrepresentable: discriminated unions over flag bags, options objects over positional args, branded types parsed at the boundary (parse, don't validate). Use the project's own primitives when it has them (e.g. Effect); shared code that shouldn't pick a validator accepts `StandardSchemaV1<unknown, T>`.
- Let types flow end to end through the project's tool (tRPC, oRPC, Elysia, TanStack Start). Derive with `Pick`, `Omit`, `ReturnType`, `Awaited`, `typeof` before writing a new interface.
- Tests as real as possible: real Postgres/SQLite, LocalStack, Miniflare. Mock only third parties with no test environment.
