// Builds a standalone CLI: bundles @coursmith/course-schema (and its zod / vega-lite deps) into dist/index.js
// and copies the agent skill into skill/, so the published package works outside the monorepo.
import { chmodSync, cpSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

rmSync(resolve(root, "dist"), { recursive: true, force: true });
await build({
  entryPoints: [resolve(root, "src/index.ts")],
  outfile: resolve(root, "dist/index.js"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  // Runtime dependencies listed in package.json stay external; `open` ships helper scripts next to its code.
  external: ["commander", "open"],
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
  minify: true,
  legalComments: "none",
  logLevel: "warning",
});
chmodSync(resolve(root, "dist/index.js"), 0o755);

const skillSrc = resolve(root, "../../plugin/skills/coursmith-course");
const skillDest = resolve(root, "skill/coursmith-course");
rmSync(resolve(root, "skill"), { recursive: true, force: true });
cpSync(skillSrc, skillDest, {
  recursive: true,
  // Course state written by `coursmith submit` while testing the example must not ship.
  filter: (src) => !src.endsWith(".coursmith.json"),
});
console.log("built dist/index.js and skill/coursmith-course");
