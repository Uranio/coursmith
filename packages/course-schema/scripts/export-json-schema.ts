// Writes the course JSON Schema and the content policy into the build output and the agent skill's references.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { courseJsonSchema } from "../src/json-schema.js";
import { CONTENT_POLICY } from "../src/policy.js";

const here = dirname(fileURLToPath(import.meta.url));
const json = `${JSON.stringify(courseJsonSchema(), null, 2)}\n`;
const targets = [
  resolve(here, "../dist/course.schema.json"),
  resolve(here, "../../../plugin/skills/coursmith-course/references/course.schema.json"),
];
for (const target of targets) {
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, json);
  console.log(`wrote ${target}`);
}

const policyTarget = resolve(here, "../../../plugin/skills/coursmith-course/references/content-policy.md");
writeFileSync(policyTarget, CONTENT_POLICY);
console.log(`wrote ${policyTarget}`);
