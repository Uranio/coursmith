export const SCHEMA_VERSION = "1.0" as const;

/** Minimum percentage of correct answers needed to pass the final quiz. */
export const PASSING_SCORE_PERCENT = 70;

export const DIFFICULTIES = ["beginner", "intermediate", "advanced"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

/** Fixed catalog taxonomy. Changing it requires a matching seed migration. */
export const CATEGORIES = [
  "technology",
  "programming",
  "data-ai",
  "science",
  "mathematics",
  "engineering",
  "business",
  "finance",
  "marketing",
  "design",
  "arts-music",
  "languages",
  "history",
  "humanities",
  "health-wellness",
  "environment",
  "law-policy",
  "personal-development",
  "education",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const LIMITS = {
  courseJsonBytes: 2 * 1024 * 1024,
  assetBytes: 3 * 1024 * 1024,
  bundleBytes: 25 * 1024 * 1024,
  sections: 12,
  stepsTotal: 80,
  stepsPerSection: 15,
  blocksPerStep: 20,
  assets: 60,
  quizMinQuestions: 10,
  quizMaxQuestions: 40,
  markdownChars: 20_000,
  glossaryPerSection: 40,
} as const;

export const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"] as const;
export const SVG_EXTENSION = ".svg" as const;

/** Mermaid diagram types the portal renders. */
export const MERMAID_DIAGRAM_TYPES = [
  "flowchart",
  "graph",
  "sequenceDiagram",
  "classDiagram",
  "stateDiagram",
  "stateDiagram-v2",
  "erDiagram",
  "gantt",
  "pie",
  "journey",
  "mindmap",
  "timeline",
  "quadrantChart",
  "xychart-beta",
] as const;
