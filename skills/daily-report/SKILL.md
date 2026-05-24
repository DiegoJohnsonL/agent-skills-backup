---
name: daily-report
description: Generate a daily progress report from git history across all repos. Use when user says "daily report", "what did I do today", or wants a summary of today's work.
---

# Daily Report Generator

You generate a daily progress report for the user's manager by reading git history across all active project repos.

## Step 1 — Gather commits

Run this for each known project repo (discover repos under `~/dev/`):

```bash
git -C <repo-path> log --oneline --all --since="midnight" --author="$(git -C <repo-path> config user.name)" --format="%h %s"
```

If the user asks for a different date, adjust `--since` and `--until` accordingly.

To get more detail on what changed per commit when commit messages aren't descriptive enough:

```bash
git -C <repo-path> log --since="midnight" --author="$(git -C <repo-path> config user.name)" --stat --format="%h %s%n%b"
```

**Known repos** (update this list as you discover more):
- `~/dev/wedly-workspace/wedly-web` — Wedly
- `~/dev/course-playlist-creator` — Ponla Ya
- `~/dev/fin-ai` — XyRadar
- `~/dev/innkeep` — Vestia

If a repo has zero commits for the day, skip it from the report.

## Step 2 — Compact into report

### Format

WhatsApp-friendly — bold with asterisks (*text*), bullet points with •, no markdown links, no headers, no code formatting.

### Structure

```
*Progress update — {Month Day}*

*{Project Name}* {deploy/QA status}
• {Compact bullet}
• {Compact bullet}

*{Project Name}* {deploy/QA status}
• {Compact bullet}
```

### Writing rules

- **Write for a non-technical boss** — lead with the business outcome, not the implementation. Say "Rebuilt the notification system to support email, WhatsApp, and SMS from a single API" NOT "Wrote the PRD, broke it into 8 vertical slices, completed #59 and #60, 19 tests passing".
- **No implementation details** — don't mention file names, test counts, tRPC, migrations, hooks, contexts, prefetching, CDN domains, DB columns, or framework internals. Those are for the commit log, not the boss.
- **Group by project** — one section per project, sorted by most work done.
- **Each bullet is one logical change** — merge related commits/tasks into a single bullet. If 5 commits were all part of one feature, that's one bullet.
- **Include numbers when meaningful** — "8 new sections", "all 4 languages" — but only when it adds value, not for test counts or issue numbers.
- **Skip trivial work** — don't mention lint fixes, typo corrections, or dependency bumps unless they were the main task.
- **Keep it scannable** — max 8 bullets per project. If you have more, you're not compacting enough.

## Step 3 — Ask for status & notes

Before saving, ask the user:
1. **Deploy/QA status per project** — tag each project header:
   - ✅ pushed & QA'd
   - ✅ pushed — {feature X} QA'd, rest pending QA
   - ⏳ pending deploy — needs QA
   - ⚠️ with a note if something isn't working 100%
2. **Anything missing?** — git only captures code work. Ask if they did anything else (planning, design, meetings, QA) that should be included.

## Step 4 — Save

- **Two versions**: English and Spanish (natural Spanish, not literal translation).
- **Save location**: `~/dev/daily-reports/YYYY-MM-DD.md` (English) and `~/dev/daily-reports/YYYY-MM-DD-es.md` (Spanish).
- If a report for that date already exists, ask before overwriting.
- Show the draft for review before saving.
