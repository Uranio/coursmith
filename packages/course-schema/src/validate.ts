import { compile } from "vega-lite";
import { IMAGE_EXTENSIONS, LIMITS, MERMAID_DIAGRAM_TYPES, SVG_EXTENSION } from "./constants.js";
import { blockTexts, entryKeys, findTermRefs, normalizeTerm } from "./glossary.js";
import { formatPath, IssueList, type Issue } from "./issues.js";
import { course as courseSchema, type Block, type Course, type VisualBlock } from "./schema.js";

export interface AssetFileInfo {
  bytes: number;
}

export interface ValidateOptions {
  /**
   * Files present in the bundle, keyed by path relative to the course folder (e.g. `assets/cover.webp`).
   * When given, asset files are checked for existence and size.
   */
  files?: ReadonlyMap<string, AssetFileInfo>;
}

export interface ValidationResult {
  ok: boolean;
  /** Parsed course with defaults applied; present when the structure is valid. */
  course?: Course;
  issues: Issue[];
}

/** Validates the raw text of course.json (size, JSON syntax, then {@link validateCourse}). */
export function validateCourseText(raw: string, options: ValidateOptions = {}): ValidationResult {
  const bytes = new TextEncoder().encode(raw).byteLength;
  if (bytes > LIMITS.courseJsonBytes) {
    return fail("limits.course_json_size", "", `course.json is ${bytes} bytes; the limit is ${LIMITS.courseJsonBytes}.`);
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    return fail("json.syntax", "", `course.json is not valid JSON: ${(err as Error).message}`);
  }
  return validateCourse(data, options);
}

export function validateCourse(input: unknown, options: ValidateOptions = {}): ValidationResult {
  const parsed = courseSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => ({
        severity: "error" as const,
        code: `schema.${i.code}`,
        path: formatPath(i.path),
        message: i.message,
      })),
    };
  }

  const course = parsed.data;
  const issues = new IssueList();
  checkIds(course, issues);
  checkLimits(course, issues);
  checkAssets(course, issues, options.files);
  checkGlossary(course, issues);
  checkContent(course, issues);
  checkQuestions(course, issues);

  return { ok: !issues.hasErrors, course, issues: issues.items };
}

function fail(code: string, path: string, message: string): ValidationResult {
  return { ok: false, issues: [{ severity: "error", code, path, message }] };
}

// ---------------------------------------------------------------------------

function duplicates<T>(values: T[]): Set<T> {
  const seen = new Set<T>();
  const dup = new Set<T>();
  for (const v of values) (seen.has(v) ? dup : seen).add(v);
  return dup;
}

function checkIds(course: Course, issues: IssueList): void {
  const groups: Array<[string, string[]]> = [
    ["section", course.sections.map((s) => s.id)],
    ["step", course.sections.flatMap((s) => s.steps.map((st) => st.id))],
    ["asset", course.assets.map((a) => a.id)],
    ["quiz question", course.finalQuiz.questions.map((q) => q.id)],
    ["asset file", course.assets.map((a) => a.file)],
  ];
  for (const [label, ids] of groups) {
    for (const d of duplicates(ids)) issues.error("ids.duplicate", "", `Duplicate ${label} "${d}".`);
  }
}

function checkLimits(course: Course, issues: IssueList): void {
  const steps = course.sections.reduce((n, s) => n + s.steps.length, 0);
  if (steps > LIMITS.stepsTotal) {
    issues.error("limits.steps", "sections", `The course has ${steps} steps; the limit is ${LIMITS.stepsTotal}.`);
  }
}

// ---------------------------------------------------------------------------
// Assets

interface AssetUse {
  id: string;
  path: string;
  requireKind?: "svg";
}

function* visualAssetUses(v: VisualBlock | Block, path: string): Generator<AssetUse> {
  if (v.type === "image") yield { id: v.asset, path: `${path}.asset` };
  if (v.type === "animation") {
    const a = v.animation;
    if (a.preset === "highlight-svg") yield { id: a.asset, path: `${path}.animation.asset`, requireKind: "svg" };
    if (a.preset === "compare") {
      if (a.before.asset) yield { id: a.before.asset, path: `${path}.animation.before.asset` };
      if (a.after.asset) yield { id: a.after.asset, path: `${path}.animation.after.asset` };
    }
  }
}

function* assetUses(course: Course): Generator<AssetUse> {
  yield { id: course.meta.coverImage, path: "meta.coverImage" };
  for (const [si, s] of course.sections.entries()) {
    for (const [ti, st] of s.steps.entries()) {
      const stepPath = `sections[${si}].steps[${ti}]`;
      if (st.visual) yield* visualAssetUses(st.visual, `${stepPath}.visual`);
      for (const [bi, b] of st.blocks.entries()) yield* visualAssetUses(b, `${stepPath}.blocks[${bi}]`);
    }
  }
}

function checkAssets(course: Course, issues: IssueList, files?: ReadonlyMap<string, AssetFileInfo>): void {
  const byId = new Map(course.assets.map((a) => [a.id, a]));
  const used = new Set<string>();

  for (const use of assetUses(course)) {
    const a = byId.get(use.id);
    used.add(use.id);
    if (!a) {
      issues.error("assets.unknown", use.path, `Asset "${use.id}" is not declared in assets.`);
    } else if (use.requireKind && a.kind !== use.requireKind) {
      issues.error("assets.kind", use.path, `Asset "${use.id}" must be of kind "${use.requireKind}".`);
    }
  }

  for (const [i, a] of course.assets.entries()) {
    const path = `assets[${i}]`;
    const ext = a.file.slice(a.file.lastIndexOf(".")).toLowerCase();
    if (a.kind === "svg" && ext !== SVG_EXTENSION) {
      issues.error("assets.extension", `${path}.file`, `An svg asset must use the .svg extension.`);
    }
    if (a.kind === "image" && !(IMAGE_EXTENSIONS as readonly string[]).includes(ext)) {
      issues.error("assets.extension", `${path}.file`, `An image asset must be ${IMAGE_EXTENSIONS.join(", ")}.`);
    }
    if (!used.has(a.id)) issues.warning("assets.unused", path, `Asset "${a.id}" is never used.`);
    if (files) {
      const info = files.get(a.file);
      if (!info) issues.error("assets.missing_file", `${path}.file`, `File "${a.file}" is not in the bundle.`);
      else if (info.bytes > LIMITS.assetBytes) {
        issues.error("assets.size", `${path}.file`, `"${a.file}" is ${info.bytes} bytes; the limit is ${LIMITS.assetBytes}.`);
      }
    }
  }

  if (files) {
    const total = [...files.values()].reduce((n, f) => n + f.bytes, 0);
    if (total > LIMITS.bundleBytes) {
      issues.error("limits.bundle_size", "assets", `Assets total ${total} bytes; the limit is ${LIMITS.bundleBytes}.`);
    }
  }
}

// ---------------------------------------------------------------------------
// Glossary: every [[term]] must be defined in the current or an earlier section.

function checkGlossary(course: Course, issues: IssueList): void {
  const known = new Set<string>();
  const referenced = new Set<string>();

  for (const [si, s] of course.sections.entries()) {
    const sectionKeys = new Set<string>();
    for (const [gi, entry] of s.glossary.entries()) {
      for (const key of entryKeys(entry)) {
        const path = `sections[${si}].glossary[${gi}]`;
        if (sectionKeys.has(key)) issues.error("glossary.duplicate", path, `"${key}" is defined twice in this section.`);
        else if (known.has(key)) {
          issues.warning("glossary.redefined", path, `"${key}" was already defined in an earlier section.`);
        }
        sectionKeys.add(key);
      }
    }
    for (const k of sectionKeys) known.add(k);

    for (const [ti, st] of s.steps.entries()) {
      for (const [bi, b] of st.blocks.entries()) {
        for (const text of blockTexts(b)) {
          for (const ref of findTermRefs(text)) {
            const key = normalizeTerm(ref.term);
            referenced.add(key);
            if (!known.has(key)) {
              issues.error(
                "glossary.undefined_term",
                `sections[${si}].steps[${ti}].blocks[${bi}]`,
                `[[${ref.term}]] is not defined in the glossary of this section or of an earlier one.`,
              );
            }
          }
        }
      }
    }
  }

  for (const [si, s] of course.sections.entries()) {
    for (const [gi, entry] of s.glossary.entries()) {
      if (!entryKeys(entry).some((k) => referenced.has(k))) {
        issues.warning(
          "glossary.unreferenced",
          `sections[${si}].glossary[${gi}]`,
          `"${entry.term}" is never marked as [[${entry.term}]] in the text, so readers get no tooltip for it.`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Markdown, charts, diagrams, animations

const RAW_HTML = /<\/?[A-Za-z][\w-]*(\s[^<>]*)?\/?>/;
const MD_IMAGE = /!\[[^\]]*\]\([^)]*\)/;
const MD_LINK = /(?<![[!])\[[^\]]+\]\(\s*<?([^)\s>]+)/g;

function checkMarkdown(text: string, path: string, issues: IssueList): void {
  if (RAW_HTML.test(text)) issues.error("markdown.html", path, "Raw HTML is not allowed in Markdown.");
  if (MD_IMAGE.test(text)) issues.error("markdown.image", path, "Use an image block instead of Markdown images.");
  for (const m of text.matchAll(MD_LINK)) {
    if (!/^https:\/\//i.test(m[1]!)) issues.error("markdown.link", path, `Link "${m[1]}" must use https://.`);
  }
}

function findForbiddenKeys(value: unknown, keys: ReadonlySet<string>, path = ""): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => findForbiddenKeys(v, keys, `${path}[${i}]`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => {
      const p = path ? `${path}.${k}` : k;
      return keys.has(k) ? [p] : findForbiddenKeys(v, keys, p);
    });
  }
  return [];
}

const VEGA_FORBIDDEN = new Set(["url", "href"]);

function checkChart(spec: Record<string, unknown>, path: string, issues: IssueList): void {
  if (JSON.stringify(spec).length > 200_000) {
    issues.error("chart.size", path, "The chart spec is larger than 200 KB; aggregate the data first.");
    return;
  }
  const forbidden = findForbiddenKeys(spec, VEGA_FORBIDDEN);
  for (const p of forbidden) {
    issues.error("chart.external", `${path}.spec.${p}`, "External data (url) and links (href) are not allowed in charts.");
  }
  if (forbidden.length) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    compile(spec as any);
  } catch (err) {
    issues.error("chart.invalid", `${path}.spec`, `Vega-Lite cannot compile this spec: ${(err as Error).message}`);
  }
}

function checkMermaid(code: string, path: string, issues: IssueList): void {
  const lines = code.split("\n").map((l) => l.trim());
  if (lines.some((l) => l.startsWith("%%{"))) {
    issues.error("diagram.directive", path, "Mermaid %%{init}%% directives are not allowed.");
  }
  if (lines.some((l) => /^click\s/.test(l) || /\bhref\b/.test(l))) {
    issues.error("diagram.interaction", path, "Mermaid click handlers and links are not allowed.");
  }
  const first = lines.find((l) => l && !l.startsWith("%%") && l !== "---");
  const kind = first?.split(/\s/)[0];
  if (!kind || !(MERMAID_DIAGRAM_TYPES as readonly string[]).includes(kind)) {
    issues.error(
      "diagram.type",
      path,
      `Unsupported Mermaid diagram "${kind ?? ""}". Use one of: ${MERMAID_DIAGRAM_TYPES.join(", ")}.`,
    );
  }
}

function checkBlock(b: Block | VisualBlock, path: string, issues: IssueList): void {
  switch (b.type) {
    case "markdown":
    case "callout":
    case "quote":
      checkMarkdown(b.text, path, issues);
      break;
    case "chart":
      checkChart(b.spec, path, issues);
      break;
    case "diagram":
      checkMermaid(b.code, path, issues);
      break;
    case "table":
      for (const [ri, row] of b.rows.entries()) {
        if (row.length !== b.headers.length) {
          issues.error("table.columns", `${path}.rows[${ri}]`, `Row has ${row.length} cells; expected ${b.headers.length}.`);
        }
      }
      break;
    case "animation": {
      const a = b.animation;
      if (a.preset === "flow") {
        const nodeIds = new Set(a.nodes.map((n) => n.id));
        for (const d of duplicates(a.nodes.map((n) => n.id))) {
          issues.error("animation.duplicate_node", `${path}.animation`, `Duplicate node "${d}".`);
        }
        for (const [ei, e] of a.edges.entries()) {
          for (const end of [e.from, e.to]) {
            if (!nodeIds.has(end)) {
              issues.error("animation.unknown_node", `${path}.animation.edges[${ei}]`, `Unknown node "${end}".`);
            }
          }
        }
      }
      if (a.preset === "compare") {
        for (const side of ["before", "after"] as const) {
          if (!a[side].text && !a[side].asset) {
            issues.error("animation.compare_empty", `${path}.animation.${side}`, "Provide text or an asset.");
          }
        }
      }
      break;
    }
    default:
      break;
  }
}

function checkContent(course: Course, issues: IssueList): void {
  for (const [si, s] of course.sections.entries()) {
    for (const [ti, st] of s.steps.entries()) {
      const stepPath = `sections[${si}].steps[${ti}]`;
      if (st.visual) checkBlock(st.visual, `${stepPath}.visual`, issues);
      for (const [bi, b] of st.blocks.entries()) checkBlock(b, `${stepPath}.blocks[${bi}]`, issues);
    }
  }
}

// ---------------------------------------------------------------------------
// Questions

type AnyQuestion = Course["finalQuiz"]["questions"][number] | NonNullable<Course["sections"][number]["steps"][number]["check"]>;

function checkQuestion(q: AnyQuestion, path: string, issues: IssueList): void {
  if (q.type === "single" || q.type === "multiple") {
    const ids = q.options.map((o) => o.id);
    for (const d of duplicates(ids)) issues.error("question.duplicate_option", path, `Duplicate option id "${d}".`);
    const correct = q.type === "single" ? [q.correct] : q.correct;
    for (const c of correct) {
      if (!ids.includes(c)) issues.error("question.unknown_correct", `${path}.correct`, `"${c}" is not an option id.`);
    }
    if (q.type === "multiple") {
      for (const d of duplicates(q.correct)) issues.error("question.duplicate_correct", `${path}.correct`, `"${d}" repeated.`);
      if (new Set(q.correct).size === ids.length) {
        issues.warning("question.all_correct", `${path}.correct`, "Every option is correct; the question tests nothing.");
      }
    }
  }
  if (q.type === "ordering") {
    for (const d of duplicates(q.items.map((o) => o.id))) {
      issues.error("question.duplicate_option", path, `Duplicate item id "${d}".`);
    }
  }
}

function checkQuestions(course: Course, issues: IssueList): void {
  const sectionIds = new Set(course.sections.map((s) => s.id));
  const covered = new Set<string>();

  for (const [qi, q] of course.finalQuiz.questions.entries()) {
    const path = `finalQuiz.questions[${qi}]`;
    checkQuestion(q, path, issues);
    if (!sectionIds.has(q.sectionRef)) {
      issues.error("quiz.unknown_section", `${path}.sectionRef`, `Section "${q.sectionRef}" does not exist.`);
    }
    covered.add(q.sectionRef);
  }
  for (const [si, s] of course.sections.entries()) {
    if (!covered.has(s.id)) {
      issues.error("quiz.uncovered_section", `sections[${si}]`, `No final quiz question tests section "${s.id}".`);
    }
  }
  for (const [si, s] of course.sections.entries()) {
    for (const [ti, st] of s.steps.entries()) {
      if (st.check) checkQuestion(st.check, `sections[${si}].steps[${ti}].check`, issues);
    }
  }
}
