import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validateCourse, validateCourseText, type AssetFileInfo } from "../src/index.js";

const sampleDir = resolve(import.meta.dirname, "../../../plugin/skills/coursmith-course/examples/sample-course");
const sampleText = readFileSync(join(sampleDir, "course.json"), "utf8");

function sample(): any {
  return JSON.parse(sampleText);
}

function sampleFiles(): Map<string, AssetFileInfo> {
  const files = new Map<string, AssetFileInfo>();
  for (const name of readdirSync(join(sampleDir, "assets"))) {
    files.set(`assets/${name}`, { bytes: statSync(join(sampleDir, "assets", name)).size });
  }
  return files;
}

function errorCodes(input: unknown, files?: Map<string, AssetFileInfo>): string[] {
  return validateCourse(input, { files }).issues.filter((i) => i.severity === "error").map((i) => i.code);
}

describe("sample course", () => {
  it("is valid with its bundled assets and has no warnings", () => {
    const result = validateCourseText(sampleText, { files: sampleFiles() });
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
  });
});

describe("structure", () => {
  it("rejects invalid JSON", () => {
    expect(validateCourseText("{").issues[0]?.code).toBe("json.syntax");
  });

  it("rejects unknown keys", () => {
    const c = sample();
    c.meta.author = "someone";
    expect(errorCodes(c)).toContain("schema.unrecognized_keys");
  });

  it("requires a glossary in every section", () => {
    const c = sample();
    c.sections[1].glossary = [];
    const result = validateCourse(c);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.path === "sections[1].glossary")).toBe(true);
  });

  it("requires at least 10 quiz questions", () => {
    const c = sample();
    c.finalQuiz.questions = c.finalQuiz.questions.slice(0, 9);
    expect(validateCourse(c).issues.some((i) => i.path === "finalQuiz.questions")).toBe(true);
  });

  it("rejects an unknown difficulty", () => {
    const c = sample();
    c.meta.difficulty = "expert";
    expect(validateCourse(c).ok).toBe(false);
  });
});

describe("semantic rules", () => {
  it("flags glossary terms that are not defined", () => {
    const c = sample();
    c.sections[0].steps[0].blocks[0].text += " See also [[quantum tunnelling]].";
    expect(errorCodes(c)).toContain("glossary.undefined_term");
  });

  it("accepts terms defined in an earlier section", () => {
    const c = sample();
    c.sections[2].steps[0].blocks[0].text += " It runs at 230 [[voltage|volts]].";
    expect(validateCourse(c).ok).toBe(true);
  });

  it("rejects terms defined only in a later section", () => {
    const c = sample();
    c.sections[0].steps[0].blocks[0].text += " Later we meet the [[transformer]].";
    expect(errorCodes(c)).toContain("glossary.undefined_term");
  });

  it("warns about glossary entries never marked in the text", () => {
    const c = sample();
    c.sections[0].glossary.push({ term: "ohm", definition: "Unit of electrical resistance." });
    const result = validateCourse(c);
    expect(result.ok).toBe(true);
    expect(result.issues.map((i) => i.code)).toContain("glossary.unreferenced");
  });

  it("requires every section to be covered by the final quiz", () => {
    const c = sample();
    for (const q of c.finalQuiz.questions) if (q.sectionRef === "home") q.sectionRef = "grid";
    expect(errorCodes(c)).toContain("quiz.uncovered_section");
  });

  it("checks that the correct option exists", () => {
    const c = sample();
    c.finalQuiz.questions[0].correct = "z";
    expect(errorCodes(c)).toContain("question.unknown_correct");
  });

  it("rejects duplicate step ids across sections", () => {
    const c = sample();
    c.sections[1].steps[0].id = c.sections[0].steps[0].id;
    expect(errorCodes(c)).toContain("ids.duplicate");
  });

  it("rejects references to undeclared assets", () => {
    const c = sample();
    c.meta.coverImage = "missing";
    expect(errorCodes(c)).toContain("assets.unknown");
  });

  it("requires highlight-svg to use an svg asset", () => {
    const c = sample();
    c.assets[1].kind = "image";
    c.assets[1].file = "assets/home-panel.png";
    expect(errorCodes(c)).toContain("assets.kind");
  });

  it("reports asset files missing from the bundle", () => {
    const files = sampleFiles();
    files.delete("assets/cover.svg");
    expect(errorCodes(sample(), files)).toContain("assets.missing_file");
  });

  it("rejects oversized assets", () => {
    const files = sampleFiles();
    files.set("assets/cover.svg", { bytes: 10 * 1024 * 1024 });
    expect(errorCodes(sample(), files)).toContain("assets.size");
  });
});

describe("content safety rules", () => {
  it("rejects charts loading external data", () => {
    const c = sample();
    c.sections[0].steps[2].visual.spec.data = { url: "https://example.com/data.csv" };
    expect(errorCodes(c)).toContain("chart.external");
  });

  it("rejects specs Vega-Lite cannot compile", () => {
    const c = sample();
    c.sections[0].steps[2].visual.spec.mark = "not-a-mark";
    expect(errorCodes(c)).toContain("chart.invalid");
  });

  it("rejects Mermaid click handlers and init directives", () => {
    const c = sample();
    const d = c.sections[1].steps[1].blocks[1];
    d.code = `%%{init: {"securityLevel": "loose"}}%%\n${d.code}\n  click P "https://evil.example"`;
    const codes = errorCodes(c);
    expect(codes).toContain("diagram.directive");
    expect(codes).toContain("diagram.interaction");
  });

  it("rejects unsupported Mermaid diagram types", () => {
    const c = sample();
    c.sections[1].steps[1].blocks[1].code = "sankey-beta\n a,b,1";
    expect(errorCodes(c)).toContain("diagram.type");
  });

  it("rejects raw HTML, Markdown images and non-https links", () => {
    const c = sample();
    c.sections[0].steps[0].blocks[0].text += "\n\n<script>alert(1)</script> ![x](a.png) [site](http://example.com)";
    const codes = errorCodes(c);
    expect(codes).toContain("markdown.html");
    expect(codes).toContain("markdown.image");
    expect(codes).toContain("markdown.link");
  });

  it("allows https links and does not confuse [[terms]] with links", () => {
    const c = sample();
    c.sections[0].steps[0].blocks[0].text += " Read more on [Wikipedia](https://en.wikipedia.org/wiki/Electricity).";
    expect(validateCourse(c).ok).toBe(true);
  });

  it("rejects flow edges pointing to unknown nodes", () => {
    const c = sample();
    c.sections[0].steps[1].visual.animation.edges.push({ from: "grid", to: "nowhere" });
    expect(errorCodes(c)).toContain("animation.unknown_node");
  });
});
