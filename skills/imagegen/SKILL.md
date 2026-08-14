---
name: "imagegen"
description: "Generate or edit raster images when the task benefits from AI-created bitmap visuals such as photos, illustrations, textures, sprites, mockups, or transparent-background cutouts. Use when the agent should create a brand-new image, transform an existing image, or derive visual variants from references, and the output should be a bitmap asset rather than repo-native code or vector. Do not use when the task is better handled by editing existing SVG/vector/code-native assets, extending an established icon or logo system, or building the visual directly in HTML/CSS/canvas."
---

# Image Generation (Claude Code adapter over Codex's imagegen skill)

This is a **thin adapter**. All prompting craft, model behavior, size rules, and API detail live
upstream and are deliberately NOT duplicated here:

- `upstream/` → symlink to `~/.codex/skills/.system/imagegen`, updated by the Codex app itself.
- Read `upstream/SKILL.md` for the prompt scaffolding and workflow.
- Read `upstream/references/cli.md` for CLI flags and invocation examples.
- Read `upstream/references/image-api.md` for the current model table and per-model constraints.
- Read `upstream/references/prompting.md` and `upstream/references/sample-prompts.md` for prompt craft.

## What this adapter changes, and why

Upstream is written for Codex, which has a **built-in `image_gen` tool** and treats the Python CLI as
an explicit-only fallback. **Claude Code has no such built-in tool.** Three overrides follow.

### 1. CLI mode is the only mode

Ignore every upstream instruction that says to prefer, default to, or route through built-in
`image_gen`. In Claude Code that tool does not exist. `upstream/scripts/image_gen.py` is the sole path.
Upstream's "never silently downgrade to the CLI / ask before using the CLI fallback" rules are Codex
mode-selection guardrails and do **not** apply here — there is nothing to downgrade from.

### 2. Never hardcode a model

**Do not pass `--model` unless you specifically need a non-default model.** Omitting it applies the
CLI's own `DEFAULT_MODEL`, which the Codex app bumps on every update. This is the entire
freshness mechanism — hardcoding a model id here or in your command would re-pin the staleness this
adapter exists to avoid.

To see the current default and the live model table:

```bash
~/.agents/skills/imagegen/run.sh --check        # prints the CLI's current default model
sed -n '1,40p' ~/.agents/skills/imagegen/upstream/references/image-api.md
```

The only routine reason to set `--model` explicitly is true native transparency (see §4).

### 3. Always invoke through `run.sh` — never call the Python CLI directly

`run.sh` resolves `OPENAI_API_KEY` internally and execs the CLI, so **the secret never appears in
your tool output**. Calling `upstream/scripts/image_gen.py` yourself would force you to handle the
key in a visible command line. Don't.

```bash
RUN="$HOME/.agents/skills/imagegen/run.sh"

"$RUN" --check                                    # key source + current default model, no secret
"$RUN" --verify                                   # live auth check against /v1/models (free)
"$RUN" generate --prompt "..." --out path/img.png
"$RUN" edit --image in.png --prompt "..." --out out.png
```

Use `--check` for offline plumbing questions and `--verify` when you need to know the key actually
works. `--verify` costs nothing — `/v1/models` is not a billed endpoint — so prefer it over a test
generation when diagnosing failures.

**`--verify` returning 200 does NOT guarantee a generation will succeed.** Because `/v1/models` is
unbilled, it passes even when the organization has exhausted its credit or hit a spend cap. The
failure surfaces only on the first real call, as:

```
openai.BadRequestError: Error code: 400 - 'Billing hard limit has been reached.'
                        type: billing_limit_user_error, code: billing_hard_limit_reached
```

That is a **billing** state, not a key problem — do not treat it as a bad key, do not retry, and do
not fall back to another model (every image model bills the same way). Stop and tell the user to
add credit or raise the cap at
https://platform.openai.com/settings/organization/billing/overview. No charge is incurred and no
output file is written when this fires.

**Remaining credit is not obtainable from an API key.** No `/v1` endpoint exposes account balance;
`/dashboard/billing/*` is a session-token dashboard route, not an API-key one. If the user asks
"how much is left", point them to
https://platform.openai.com/settings/organization/billing/overview — do not invent a number and do
not infer one from rate-limit headers. The `x-ratelimit-remaining-*` headers `--verify` prints are
the current rate-limit window's budget, unrelated to money.

Organization spend *is* queryable via `/v1/organization/costs` and `/v1/organization/usage/images`,
but those require an Admin key (`sk-admin-…`), not the project key used for generation, and they
report spend-to-date rather than remaining balance.

Every flag documented in `upstream/references/cli.md` passes straight through. Add `--dry-run` to
inspect the resolved payload without spending money.

Resolution order: `$OPENAI_API_KEY` → macOS Keychain → `~/.agents/secrets/openai.env` →
`~/.codex/auth.json`. If none yields a key, `run.sh` exits 1 without calling the API.

`run.sh` also handles dependencies: the CLI needs the `openai` SDK (and Pillow for `--downscale`
and chroma-key work), which is **not** installed on system Python. When `uv` is present the wrapper
runs via `uv run --with openai --with pillow`, resolving them into a managed env rather than
polluting the user's interpreter. First invocation takes a few seconds to fetch; later ones are
cached. Without `uv` it fails with an explicit install hint instead of a confusing ImportError.

**On failure, stop and ask the user — do not retry and do not work around it.** Never echo, log, or
write the key anywhere.

Note a ChatGPT/Codex subscription does **not** provide a usable key: with `auth_mode: "chatgpt"`,
`~/.codex/auth.json` holds OAuth tokens and its `OPENAI_API_KEY` field is `null`. Codex gets images
from its built-in tool in that mode — precisely what Claude Code lacks. This CLI needs a platform
key from https://platform.openai.com/api-keys, billed per image.

#### Adding a key (user runs this, not the agent)

Keychain is preferred — nothing lands in plaintext on disk:

```bash
security add-generic-password -a "$USER" -s openai-api-key -w   # prompts; paste the key
```

Or a permission-locked file:

```bash
mkdir -p ~/.agents/secrets && chmod 700 ~/.agents/secrets
printf 'OPENAI_API_KEY=sk-REPLACE\n' > ~/.agents/secrets/openai.env
chmod 600 ~/.agents/secrets/openai.env
```

Codex also reads the Keychain entry if you `export OPENAI_API_KEY` from it in your shell profile,
so one key serves both agents.

### 3b. Vercel AI Gateway fallback (`gateway.sh`)

When OpenAI direct billing is capped or you want gateway credits/observability, use the sibling
wrapper `gateway.sh`. It talks to `https://ai-gateway.vercel.sh/v1` with an `AI_GATEWAY_API_KEY`
(env, or Keychain service `vercel-ai-gateway-key`).

```bash
~/.agents/skills/imagegen/gateway.sh --models    # public, works with no key
~/.agents/skills/imagegen/gateway.sh --verify
~/.agents/skills/imagegen/gateway.sh generate --prompt "..." --out img.png
~/.agents/skills/imagegen/gateway.sh edit --image src.png --prompt "..." --out out.png
```

**Editing works through the gateway — but NOT on the route you would expect.**
`POST /v1/images/edits` returns 404; the OpenAI-compatible surface is generate-only. Editing is
reachable only through the AI SDK, where the source image goes inside the prompt object rather than
a separate parameter:

```js
generateImage({ model: 'openai/gpt-image-2',
                prompt: { images: [buf], text: '...', mask: maskBuf } })
```

Do not conclude from a 404 on `/v1/images/edits` that gateway editing is unsupported — that was a
wrong inference once already. `gateway.sh edit` wraps this correctly.

**Prompt scaffolding is available on this path too.** `gateway/imagegen.mjs` ports Codex's
`_augment_prompt_fields`, so the same labeled structure and field ordering apply:

```bash
gateway.sh edit --image src.png --prompt "..." --out o.png \
  --use-case app-icon --subject "..." --style "..." --composition "..." \
  --lighting "..." --palette "..." --materials "..." \
  --text "Herenzia" --constraints "..." --avoid "..."
```

`--text` is quoted in the assembled prompt so the model treats it as literal copy to render — use it
for wordmarks instead of burying the string in prose. `--no-augment` sends the prompt raw.
`--dry-run` prints the resolved prompt and params without spending anything — use it to check
assembly before a billed run.

The prompting *guidance* is unchanged and still applies here: read
`upstream/references/prompting.md` and `upstream/references/sample-prompts.md` before writing
prompts. Those live upstream and are not duplicated.

Implementation notes:

- The runner is `gateway/imagegen.mjs`, with its **own `package.json` and `node_modules`** in the
  skill directory. That is deliberate: it resolves `ai` from its own location, so it works from any
  cwd in any repo, with or without a project that depends on the AI SDK. Plain `.mjs`, so no
  TypeScript toolchain is needed. If deps are missing: `(cd <skill>/gateway && npm install)`.
- **Slugs are `provider/model`** — `openai/gpt-image-2`, not `gpt-image-2`. This is why `gateway.sh`
  exists rather than reusing the Codex CLI, whose `_validate_model()` demands a literal `gpt-image-`
  prefix and rejects the slug. Never patch upstream to work around it; Codex overwrites it on update.

`openai/gpt-image-2` constraints when editing (all verified live against the gateway):

| Constraint | Value |
|---|---|
| `size` | `{w}x{h}`, both dimensions **divisible by 16**; `aspectRatio` unsupported |
| `quality` | `low` / `medium` / `high` / `auto` (also `standard` / `hd`) |
| `inputFidelity` | **Rejected** — "does not support the 'input_fidelity' parameter" |
| transparency | **Rejected** — "Transparent background is not supported for this model" |
| input images | multiple accepted in one call; `mask` supported for inpainting |

Because gpt-image-2 refuses transparent backgrounds, transparent assets need either
`openai/gpt-image-1.5` or the chroma-key path in §4.

Gateway credit balance is on the Vercel dashboard, not queryable from the key — same caveat as
OpenAI's.

### 4. Transparency

Upstream's default transparent path is built-in `image_gen` on a flat chroma-key background, then
local removal. The chroma-key half still works here — just generate the flat background with the CLI
instead of the built-in tool, then run the upstream helper:

```bash
"$RUN" generate --prompt "<subject>, centered, on a flat #00FF00 chroma green background, even lighting, no shadows" --out tmp/imagegen/subject.png
uv run --quiet --with pillow python3 ~/.agents/skills/imagegen/upstream/scripts/remove_chroma_key.py tmp/imagegen/subject.png
```

Prefer that path — it keeps the newer default model's quality. Fall back to true model-native
transparency (`--model gpt-image-1.5 --background transparent --output-format png`) only when the
subject defeats chroma keying: hair, fur, feathers, smoke, glass, liquids, translucency, reflections,
soft shadows, or subject colors that clash with every practical key color. That flag combination is
the one documented case where naming a model is correct — check `upstream/references/image-api.md`
first, since which models support `background=transparent` can change with an update.

### 5. Save paths

Upstream defaults outputs to `$CODEX_HOME/generated_images/`. In Claude Code, always pass an explicit
`--out` (or `--out-dir` for batches) under the current project — `tmp/imagegen/` for scratch, a real
workspace path for project-bound assets. Never leave a project asset only in the Codex default.

## Staying current

`upstream/` is a symlink, so Codex app updates land immediately with no action from you —
model bumps, new flags, and revised guidance all flow through. Only this file is hand-maintained.

Run `bash ~/.agents/skills/imagegen/check-drift.sh` to detect when upstream restructures in a way
that could invalidate the overrides above. If it reports drift, re-read `upstream/SKILL.md` and
reconcile this adapter before relying on it.
