## Code
- Write self-explanatory code: names and structure carry the explanation, so files read comment-free. A comment earns its line only by stating a constraint the code cannot show, an invariant or an external system's quirk. Test every comment before keeping it: delete it, and if the code still says everything, it stays deleted.
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
Edit text to remove AI patterns and add human voice. Scan for the patterns below, rewrite preserving meaning and tone, then self-audit: "What makes this obviously AI generated?" Fix what remains.

### Adding soul
Removing patterns is half the job. Sterile, voiceless writing is just as obvious. Have opinions and react to facts. Vary rhythm: short sentences, then longer ones that take their time. Acknowledge complexity ("impressive but also kind of unsettling"). Use "I" when it fits. Let some mess in. Be specific: not "this is concerning" but "there's something unsettling about agents churning away at 3am."

### Content
- **Puffery and promotional language.** "pivotal moment", "testament to", "evolving landscape", "nestled", "vibrant", "groundbreaking". State what happened in neutral words.
- **Vague attributions and name-dropping.** "Experts believe", "Industry reports suggest", a list of outlets with no quote. Name the source and what it said, or delete.
- **Superficial -ing phrases.** "highlighting...", "ensuring...", "showcasing...", "fostering...". Delete or expand with real sources.

### Language
- **AI vocabulary.** Additionally, crucial, delve, enduring, enhance, fostering, garner, interplay, intricate, landscape (abstract), pivotal, showcase, tapestry (abstract), testament, underscore, vibrant. Replace with plain words.
- **Fancy ways to say "is".** "serves as", "stands as", "boasts", "features". Just say "is" or "has".
- **"Not just X, but Y."** State the point directly.
- **Rule of three.** Forcing ideas into groups of three. Use the natural number.
- **Synonym cycling.** Protagonist, main character, central figure, hero in one paragraph. Pick one, repeat it.
- **False ranges.** "from X to Y" where X and Y aren't on a meaningful scale. List topics directly.

### Style
- **Em dashes.** Avoid them entirely. Periods or commas only, with no parentheses, en dashes, or hyphens standing in as a dash. If a thought needs separation, end the sentence.
- **Colons.** Fine before a list or example, never as a mid-sentence connector. Rewrite so the point stands on its own.
- **Boldface.** Don't bold every proper noun or acronym.
- **Inline-header lists.** A bold label and colon that restates the line ("**Performance:** Performance improved...") becomes prose. A bold lead-in ending in a period, naming the item, followed by new detail ("**Schema in TypeScript.** Tables live in one file.") is fine.
- **Sentence case headings, no decorative emojis, straight quotes.**

### Communication artifacts
- **Chatbot phrases.** "I hope this helps!", "Let me know if...", "Of course!", "Certainly!", "Found the smoking gun!" Remove.
- **Cutoff disclaimers.** "While specific details are limited..." Find sources or remove.
- **Sycophantic tone.** "Great question! You're absolutely right!" Respond directly.

### Filler
- **Filler phrases.** "In order to" becomes "To". "Due to the fact that" becomes "Because". "It is important to note that" gets deleted.
- **Excessive hedging.** "could potentially possibly be argued that it might" becomes "may".
- **Generic conclusions.** "The future looks bright." State specific plans or facts.

### Jargon
- **Abstract metaphor nouns.** Substrate, wedge, vector, locus, vantage, nexus, primitive (as noun), harness (as metaphor), surface (as in "API surface"), bedrock, scaffolding (as metaphor), modality, paradigm, gold-plating, ratchet (as metaphor), evacuate (for moving code), endgame, north star, flywheel. Pick the concrete word: "substrate" becomes "base", "wedge in" becomes "add", "vector" becomes "way", "gold-plating" becomes "more than the job needs", "evacuate" becomes "move out", "endgame" becomes "the last phase".

### Plain speech
- **Say what it does, not how it feels.** "the database stays close at hand", "SQL you can read" name a feeling. Name the mechanism or a number instead: "`.toSQL()` returns the exact string sent to the database", "a column rename fails the build". If you can't restate it as a concrete instruction, fact, or number, cut it. If the sentence could appear unchanged in another project's docs, it says nothing about this one. Cut it.
- **One idea per sentence.** If the reader has to backtrack, break it in two or drop clauses.
- **Active voice.** Catch "is/are/was/were + past participle" and name the actor: "queries are validated" becomes "the compiler validates queries". Passive only when the actor is unknown or doesn't matter.
- **Cut adverbs, or use a stronger verb.** "runs quickly" becomes "is fast" or the number. "significantly improves" becomes the measured delta.
- **Prefer the plain word.** "utilize" becomes "use", "leverage" becomes "use", "facilitate" becomes "help", "numerous" becomes "many", "in the event that" becomes "if".

## TypeScript
- Type every value precisely. Take `unknown` at the boundary and narrow it.
- Make impossible states unrepresentable: discriminated unions over flag bags, branded types parsed at the boundary (parse, don't validate). Use the project's own primitives when it has them (e.g. Effect); shared code that shouldn't pick a validator accepts `StandardSchemaV1<unknown, T>`.
- Options objects over positional args: `sendEmail({ to, body })`. With positional strings, swapped args still compile. Skip only on hot perf-critical paths.
- Let types flow end to end through the project's tool (tRPC, oRPC, Elysia, TanStack Start). Derive with `Pick`, `Omit`, `ReturnType`, `Awaited`, `typeof` before writing a new interface.
- Tests as real as possible: real Postgres/SQLite, LocalStack, Miniflare. Mock only third parties with no test environment.
