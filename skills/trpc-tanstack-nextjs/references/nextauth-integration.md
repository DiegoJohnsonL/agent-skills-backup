# NextAuth/Auth.js + tRPC Integration

Add session and user data to tRPC context using NextAuth v5 (Auth.js).

## Modified Context

```typescript
// trpc/init.ts
import { initTRPC, TRPCError } from "@trpc/server";
import { headers } from "next/headers";
import superjson from "superjson";
import { ZodError } from "zod";
import { auth } from "@/lib/auth"; // Your NextAuth config
import { db } from "@/lib/db";

type Session = Awaited<ReturnType<typeof auth>>;

export interface TRPCContext {
  db: typeof db;
  session: Session;
  headers: Headers;
}

export const createTRPCContext = async (): Promise<TRPCContext> => {
  const headersList = await headers();
  const session = await auth();
  return { db, session, headers: headersList };
};

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(async (opts) => {
  if (!opts.ctx.session?.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in",
    });
  }
  return opts.next({
    ctx: { session: opts.ctx.session, user: opts.ctx.session.user },
  });
});
```

## Auth.js Config

```typescript
// lib/auth.ts
import NextAuth from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/lib/db";
import Google from "next-auth/providers/google";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
});
```

## Extend Session Types

```typescript
// types/next-auth.d.ts
import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}
```
