import { z } from "zod";
import { CATEGORIES, DIFFICULTIES, LIMITS, SCHEMA_VERSION } from "./constants.js";

const id = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,63}$/, "must be lowercase letters, digits and dashes (max 64)")
  .describe("Stable identifier: lowercase letters, digits and dashes. Keep it unchanged across versions.");

const assetRef = id.describe("The `id` of an entry in `assets`.");

const shortText = (max: number) => z.string().trim().min(1).max(max);

const richText = z
  .string()
  .trim()
  .min(1)
  .max(LIMITS.markdownChars)
  .describe(
    "Markdown (CommonMark subset, no raw HTML, no images). Mark glossary terms as [[term]] or [[term|shown text]].",
  );

// ---------------------------------------------------------------------------
// Content blocks
// ---------------------------------------------------------------------------

export const markdownBlock = z
  .strictObject({ type: z.literal("markdown"), text: richText })
  .describe("Paragraphs, lists, emphasis, links (https only), inline code.");

export const calloutBlock = z.strictObject({
  type: z.literal("callout"),
  variant: z.enum(["info", "tip", "warning", "example"]),
  title: shortText(120).optional(),
  text: richText,
});

export const imageBlock = z.strictObject({
  type: z.literal("image"),
  asset: assetRef,
  caption: shortText(300).optional(),
});

export const codeBlock = z.strictObject({
  type: z.literal("code"),
  language: z.string().regex(/^[a-z0-9+#.-]{1,30}$/).describe("Language for syntax highlighting, e.g. python, ts, bash."),
  code: z.string().min(1).max(10_000),
  caption: shortText(300).optional(),
});

export const mathBlock = z.strictObject({
  type: z.literal("math"),
  tex: z.string().min(1).max(4_000).describe("LaTeX rendered with KaTeX."),
  caption: shortText(300).optional(),
});

export const tableBlock = z.strictObject({
  type: z.literal("table"),
  headers: z.array(shortText(200)).min(1).max(10),
  rows: z.array(z.array(z.string().max(500)).min(1).max(10)).min(1).max(50),
  caption: shortText(300).optional(),
});

export const quoteBlock = z.strictObject({
  type: z.literal("quote"),
  text: richText,
  cite: shortText(200).optional(),
});

export const chartBlock = z.strictObject({
  type: z.literal("chart"),
  title: shortText(200).optional(),
  caption: shortText(300).optional(),
  spec: z
    .record(z.string(), z.unknown())
    .describe("Vega-Lite v6 specification. Data must be inline (`data.values`); `url` data sources are rejected."),
});

export const diagramBlock = z.strictObject({
  type: z.literal("diagram"),
  syntax: z.literal("mermaid"),
  code: z.string().min(1).max(8_000).describe("Mermaid source. No `click` handlers and no `%%{init}%%` directives."),
  caption: shortText(300).optional(),
});

// Animation presets: declarative parameters, rendered by the portal.

const sequencePreset = z.strictObject({
  preset: z.literal("sequence"),
  layout: z.enum(["row", "column", "grid"]).default("row"),
  items: z
    .array(
      z.strictObject({
        label: shortText(80),
        description: shortText(240).optional(),
        icon: z.string().max(8).optional().describe("A single emoji."),
      }),
    )
    .min(2)
    .max(12),
});

const flowPreset = z.strictObject({
  preset: z.literal("flow"),
  direction: z.enum(["LR", "TB"]).default("LR"),
  nodes: z.array(z.strictObject({ id, label: shortText(60) })).min(2).max(12),
  edges: z.array(z.strictObject({ from: id, to: id, label: shortText(40).optional() })).min(1).max(24),
});

const timelinePreset = z.strictObject({
  preset: z.literal("timeline"),
  events: z
    .array(z.strictObject({ date: shortText(40), title: shortText(80), description: shortText(240).optional() }))
    .min(2)
    .max(16),
});

const processPreset = z.strictObject({
  preset: z.literal("process"),
  steps: z.array(z.strictObject({ title: shortText(80), description: shortText(240).optional() })).min(2).max(10),
});

const compareSide = z.strictObject({
  label: shortText(60),
  text: shortText(400).optional(),
  asset: assetRef.optional(),
});

const comparePreset = z.strictObject({
  preset: z.literal("compare"),
  before: compareSide,
  after: compareSide,
});

const counterPreset = z.strictObject({
  preset: z.literal("counter"),
  items: z
    .array(
      z.strictObject({
        label: shortText(80),
        from: z.number().default(0),
        to: z.number(),
        unit: z.string().max(12).optional(),
        decimals: z.number().int().min(0).max(4).default(0),
      }),
    )
    .min(1)
    .max(6),
});

const highlightSvgPreset = z.strictObject({
  preset: z.literal("highlight-svg"),
  asset: assetRef.describe("An asset of kind `svg`."),
  highlights: z
    .array(
      z.strictObject({
        elementId: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/).describe("`id` attribute of an element in the SVG."),
        label: shortText(80),
        description: shortText(240).optional(),
      }),
    )
    .min(1)
    .max(12),
});

export const animationSpec = z.discriminatedUnion("preset", [
  sequencePreset,
  flowPreset,
  timelinePreset,
  processPreset,
  comparePreset,
  counterPreset,
  highlightSvgPreset,
]);

export const animationBlock = z.strictObject({
  type: z.literal("animation"),
  caption: shortText(300).optional(),
  animation: animationSpec,
});

export const visualBlock = z
  .discriminatedUnion("type", [chartBlock, diagramBlock, animationBlock, imageBlock])
  .describe("The step's main visual. Pinned beside the text in scrollytelling, split-screen in stepper and slides.");

export const block = z.discriminatedUnion("type", [
  markdownBlock,
  calloutBlock,
  imageBlock,
  codeBlock,
  mathBlock,
  tableBlock,
  quoteBlock,
  chartBlock,
  diagramBlock,
  animationBlock,
]);

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

const option = z.strictObject({ id, text: shortText(300) });

const questionBase = {
  id,
  prompt: shortText(600),
  explanation: shortText(1_200).describe("Why the correct answer is correct; shown after answering."),
};

const singleQuestion = z.strictObject({
  ...questionBase,
  type: z.literal("single"),
  options: z.array(option).min(2).max(6),
  correct: id.describe("The `id` of the correct option."),
});

const multipleQuestion = z.strictObject({
  ...questionBase,
  type: z.literal("multiple"),
  options: z.array(option).min(3).max(8),
  correct: z.array(id).min(1).describe("The `id`s of all correct options."),
});

const trueFalseQuestion = z.strictObject({
  ...questionBase,
  type: z.literal("true_false"),
  correct: z.boolean(),
});

const orderingQuestion = z.strictObject({
  ...questionBase,
  type: z.literal("ordering"),
  items: z.array(option).min(3).max(8).describe("Listed in the CORRECT order; the portal shuffles them."),
});

export const inlineQuestion = z
  .discriminatedUnion("type", [singleQuestion, multipleQuestion, trueFalseQuestion])
  .describe("Optional quick check at the end of a step (not scored).");

export const quizQuestion = z.discriminatedUnion("type", [
  singleQuestion.extend({ sectionRef: id.describe("Section this question tests.") }),
  multipleQuestion.extend({ sectionRef: id }),
  trueFalseQuestion.extend({ sectionRef: id }),
  orderingQuestion.extend({ sectionRef: id }),
]);

// ---------------------------------------------------------------------------
// Course
// ---------------------------------------------------------------------------

export const glossaryEntry = z.strictObject({
  term: shortText(80),
  definition: shortText(800),
  aliases: z.array(shortText(80)).max(8).optional().describe("Other spellings or inflections that refer to the term."),
});

export const step = z.strictObject({
  id,
  title: shortText(160),
  visual: visualBlock.optional(),
  blocks: z.array(block).min(1).max(LIMITS.blocksPerStep),
  check: inlineQuestion.optional(),
});

export const section = z.strictObject({
  id,
  title: shortText(160),
  summary: shortText(600),
  steps: z.array(step).min(1).max(LIMITS.stepsPerSection),
  glossary: z
    .array(glossaryEntry)
    .min(1)
    .max(LIMITS.glossaryPerSection)
    .describe("Every concept introduced and every technical term used in this section."),
});

export const asset = z.strictObject({
  id,
  kind: z.enum(["image", "svg"]),
  file: z
    .string()
    .regex(/^assets\/[A-Za-z0-9._-]+\.(png|jpe?g|webp|svg)$/, "must be a file directly inside assets/")
    .describe("Path relative to the course folder, e.g. assets/cover.webp."),
  alt: shortText(300).describe("Text alternative for screen readers."),
  caption: shortText(300).optional(),
  credit: shortText(200).optional(),
  generatedBy: shortText(100).optional().describe("Tool or model that produced the asset, if AI-generated."),
});

export const meta = z.strictObject({
  title: shortText(120),
  subtitle: shortText(200).optional(),
  description: shortText(2_000),
  language: z
    .string()
    .regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/, "must be a BCP-47 tag such as it, en, pt-BR")
    .describe("Language of the course content (BCP-47)."),
  difficulty: z.enum(DIFFICULTIES),
  category: z.enum(CATEGORIES),
  tags: z.array(z.string().regex(/^[\p{L}\p{N}][\p{L}\p{N} -]{0,39}$/u)).max(10).default([]),
  estimatedMinutes: z.number().int().min(5).max(600),
  learningObjectives: z.array(shortText(240)).min(2).max(10),
  prerequisites: z.array(shortText(240)).max(10).default([]),
  coverImage: assetRef,
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional()
    .describe("Hex color used to tint the course pages."),
});

export const course = z.strictObject({
  $schema: z.string().optional(),
  schemaVersion: z.literal(SCHEMA_VERSION),
  courseId: z.uuid().optional().describe("Set by the CLI after the first submission; do not invent it."),
  meta,
  assets: z.array(asset).min(1).max(LIMITS.assets),
  sections: z.array(section).min(1).max(LIMITS.sections),
  finalQuiz: z.strictObject({
    questions: z.array(quizQuestion).min(LIMITS.quizMinQuestions).max(LIMITS.quizMaxQuestions),
  }),
});

export type Course = z.infer<typeof course>;
export type CourseMeta = z.infer<typeof meta>;
export type Section = z.infer<typeof section>;
export type Step = z.infer<typeof step>;
export type Block = z.infer<typeof block>;
export type VisualBlock = z.infer<typeof visualBlock>;
export type AnimationSpec = z.infer<typeof animationSpec>;
export type Asset = z.infer<typeof asset>;
export type GlossaryEntry = z.infer<typeof glossaryEntry>;
export type InlineQuestion = z.infer<typeof inlineQuestion>;
export type QuizQuestion = z.infer<typeof quizQuestion>;
