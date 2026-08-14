---
name: quality-code
description: Use when writing or reviewing TypeScript — typing a schema or API surface, refactoring types, or writing tests.
---

# Writing quality full-stack TypeScript

Every section below binds every change: apply each one while writing, check the code against each one while reviewing.

Type every value precisely. Where a value is genuinely unknown, take `unknown` at the boundary and narrow it.

## Make impossible states unrepresentable

Use the type system to make invalid states fail at compile time. Fewer reachable states = easier code to read and change.

### Branded types — parse, don't validate

Brand primitives at the boundary; downstream code trusts the type.

```ts
type PhoneNumber = string & { __brand: "PhoneNumber" };

function parsePhone(input: string): PhoneNumber {
  if (!/^\+?\d{10,15}$/.test(input)) throw new Error(`Invalid: ${input}`);
  return input as PhoneNumber;
}
```

If the project already uses a library with native branded-type support (e.g. Effect), use its primitives.

For a library or shared code that shouldn't pick a validator, accept `StandardSchemaV1<unknown, T>` at the boundary.

### Discriminated unions over flag bags

```ts
// { loading: boolean; user?: User; error?: string } — invalid combos representable
type State =
  | { status: "loading" }
  | { status: "success"; user: User }
  | { status: "error"; error: string };
```

### Options objects over positional args

`sendEmail({ to, body })` — with positional strings, swapped args still compile. Skip only on hot perf-critical paths.

## Let the types flow end-to-end

DB schema → server → client share types through the project's end-to-end tool (tRPC, oRPC, Elysia, TanStack Start). A `users.email` branded as `Email` arrives on the client still branded.

Derive types instead of restating them — reach for `Pick`, `Omit`, `Parameters`, `ReturnType`, `Awaited`, `typeof` before writing a new interface:

```ts
type User = Awaited<ReturnType<typeof db.query.users.findFirst>>;
function renderUser(u: Pick<User, "id" | "email">) {}
```

## Tests as real as possible

Spin up real services: LocalStack for AWS, Miniflare for Cloudflare Workers, real Postgres/SQLite (e.g. `bun:sqlite`). Mock only third-party services that have no test environment.
