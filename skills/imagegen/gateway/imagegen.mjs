/**
 * Image generation AND editing through Vercel AI Gateway.
 *
 * Repo-agnostic by design: this directory owns its own package.json/node_modules,
 * so `ai` resolves from the script's own location no matter what cwd or project
 * the agent is working in. Plain .mjs so no tsx/TypeScript toolchain is required.
 *
 * WHY THIS EXISTS: the gateway's OpenAI-compatible `/v1/images/edits` route 404s.
 * Editing is only reachable through the AI SDK, where the source image goes in
 * `prompt.images` rather than a separate parameter.
 *
 *   node imagegen.mjs --prompt "..." --out img.png                  # text-to-image
 *   node imagegen.mjs --image src.png --prompt "..." --out out.png  # edit
 *
 * Repeat --image for multiple references. --mask enables inpainting.
 */
import { generateImage } from "ai";
import fs from "node:fs";
import path from "node:path";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1];
  if (fallback !== undefined) return fallback;
  throw new Error(`missing required --${name}`);
}

/** Collect every occurrence of a repeatable flag. */
function argAll(name) {
  const out = [];
  process.argv.forEach((a, i) => {
    if (a === `--${name}` && process.argv[i + 1]) out.push(process.argv[i + 1]);
  });
  return out;
}

/**
 * Structured prompt scaffolding, ported from Codex's image_gen.py
 * (`_augment_prompt_fields`) so the gateway path keeps parity with the CLI path.
 * Same labels and same ordering — do not reorder; the field order is part of what
 * the model was tuned against. Disable with --no-augment.
 */
function buildPrompt(primary) {
  if (process.argv.includes("--no-augment")) return primary;

  const optional = (flag) => {
    const i = process.argv.indexOf(`--${flag}`);
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
  };

  const sections = [];
  const useCase = optional("use-case");
  if (useCase) sections.push(`Use case: ${useCase}`);
  sections.push(`Primary request: ${primary}`);
  for (const [flag, label] of [
    ["scene", "Scene/background"],
    ["subject", "Subject"],
    ["style", "Style/medium"],
    ["composition", "Composition/framing"],
    ["lighting", "Lighting/mood"],
    ["palette", "Color palette"],
    ["materials", "Materials/textures"],
  ]) {
    const v = optional(flag);
    if (v) sections.push(`${label}: ${v}`);
  }
  // Quoted so the model treats it as literal copy to render, not as instruction.
  const verbatim = optional("text");
  if (verbatim) sections.push(`Text (verbatim): "${verbatim}"`);
  const constraints = optional("constraints");
  if (constraints) sections.push(`Constraints: ${constraints}`);
  const avoid = optional("avoid");
  if (avoid) sections.push(`Avoid: ${avoid}`);

  return sections.join("\n");
}

async function main() {
  if (!process.env.AI_GATEWAY_API_KEY) {
    throw new Error("AI_GATEWAY_API_KEY is not set — stop and ask the user, do not retry.");
  }

  const out = arg("out");
  const text = buildPrompt(arg("prompt"));
  const model = arg("model", "openai/gpt-image-2");
  const size = arg("size", "1024x1024");
  const quality = arg("quality", "high");
  const images = argAll("image");
  const maskPath = argAll("mask")[0];

  for (const p of images) {
    if (!fs.existsSync(p)) throw new Error(`--image not found: ${p}`);
  }

  // A bare string prompt is text-to-image; the object form triggers editing.
  const prompt = images.length
    ? {
        images: images.map((p) => fs.readFileSync(p)),
        text,
        ...(maskPath ? { mask: fs.readFileSync(maskPath) } : {}),
      }
    : text;

  if (process.argv.includes("--dry-run")) {
    console.log(JSON.stringify({ model, size, quality, out, refs: images, mask: maskPath ?? null }, null, 2));
    console.log("--- resolved prompt ---\n" + text);
    return;
  }

  const result = await generateImage({
    model,
    prompt,
    size,
    providerOptions: { openai: { quality, outputFormat: "png" } },
  });

  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, Buffer.from(result.images[0].base64, "base64"));

  const mode = images.length ? `edit(${images.length} ref)` : "generate";
  console.log(`wrote ${out}  [${mode} ${model} ${size} q=${quality}]`);
  // Warnings surface silently-dropped params (e.g. unsupported inputFidelity).
  if (result.warnings?.length) console.log("warnings:", JSON.stringify(result.warnings));
}

main().catch((e) => {
  console.error(`FAILED: ${e?.message ?? e}`);
  process.exit(1);
});
