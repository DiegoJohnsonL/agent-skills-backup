## Philosophy

This codebase will outlive you. Every shortcut becomes someone else's burden. Every hack compounds into technical debt that slows the whole team down.

You are not just writing code. You are shaping the future of this project. The patterns you establish will be copied. The corners you cut will be cut again.

Fight entropy. Leave the codebase better than you found it.

## tRPC + React Query Rules

- For server-side query prefetching, **never await** `prefetchQuery` / `prefetchInfiniteQuery`.
- When a server component prefetches a query for a client surface, consume it with suspense on the client (`useSuspenseQuery` or equivalent suspense hook).

## Type Safety and Invariants
- Before any TypeScript work, type-related refactor, type review, or schema/API typing change, load and follow the `quality-code` skill
- Avoid suppressions (`any`, ignores) unless the project explicitly permits and you have no alternative.

## Git Commits
- Always use conventional commits with gitmojis

