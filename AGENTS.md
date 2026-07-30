> Setting up a new device? Follow [SETUP.md](./SETUP.md) — symlinks, skills, and theme, step by step.

## General Prefernces
- Always use conventional commits with gitmojis
- When reporting information to me, be concise. Sacrifice grammar for the sake of concision.

## tRPC + React Query Rules

- For server-side query prefetching, **never await** `prefetchQuery` / `prefetchInfiniteQuery`.
- When a server component prefetches a query for a client surface, consume it with suspense on the client (`useSuspenseQuery` or equivalent hook).

## Type Safety and Invariants
- Before any TypeScript work, type-related refactor, type review, or schema/API typing change, load and follow the `quality-code` skill
- Avoid suppressions (`any`, ignores) unless the project explicitly permits and you have no alternative.

## Reports & Deliverables
- Never publish Claude Artifacts (claude.ai artifact pages). Deliver reports, audits, and summaries directly in chat, or as local files in the repo/scratchpad when they're too long for chat.
