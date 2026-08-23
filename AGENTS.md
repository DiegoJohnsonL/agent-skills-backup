## Communication
- Be concise when reporting to me. Sacrifice grammar for concision.
- Talk in ASD-STE100 Simplified Technical English. Always read CONTEXT.md files and use their ubiquitous language.

## Code
- Write self-explanatory code: names and structure carry the explanation, so files read comment-free. A comment earns its line only by stating a constraint the code cannot show — an invariant, an external system's quirk. Test every comment before keeping it: delete it; if the code still says everything, it stays deleted.
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

## Writing
- Apply the unslop rules below to everything you write: chat replies, commit messages, PR descriptions, docs, and comments.

@~/.agents/skills/unslop/SKILL.md
