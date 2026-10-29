import "server-only";
import type { Course } from "@coursmith/course-schema";
import { aggregate, type AggregateResult } from "./aggregate";
import { addUsage, chatJson, emptyUsage, type ContentPart, type Usage } from "./openrouter";
import {
  QUALITY_SCHEMA,
  QUALITY_SYSTEM,
  SAFETY_SCHEMA,
  SAFETY_SYSTEM,
  type QualityOutput,
  type SafetyOutput,
} from "./prompts";
import { fullCourseText, metaText, outlineText, quizText, sectionText } from "./serialize";

export interface ReviewImage {
  assetId: string;
  index: number;
  alt: string;
  /** data: URL of a raster rendering (SVGs are rasterized first). */
  dataUrl: string;
}

export interface ReviewOutcome extends AggregateResult {
  usage: Usage;
  models: { safety: string; review: string };
}

/** Courses up to this size are sent whole to the quiz/coherence reviewer. */
const FULL_TEXT_LIMIT = 120_000;
const MAX_IMAGES = 20;
const CONCURRENCY = 4;

function models() {
  const safety = process.env.MODERATION_MODEL_SAFETY;
  const review = process.env.MODERATION_MODEL_REVIEW;
  if (!safety || !review) throw new Error("Set MODERATION_MODEL_SAFETY and MODERATION_MODEL_REVIEW.");
  return { safety, review };
}

async function pool<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]!();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

const wrap = (text: string) => `<course>\n${text}\n</course>`;

/** Runs the safety and editorial reviewers over a course and aggregates their findings into a decision. */
export async function reviewCourse(course: Course, images: ReviewImage[]): Promise<ReviewOutcome> {
  const m = models();
  let usage = emptyUsage();
  const track = async <T,>(p: Promise<{ data: T; usage: Usage }>) => {
    const r = await p;
    usage = addUsage(usage, r.usage);
    return r.data;
  };

  const header = `Course metadata:\n${metaText(course)}\n\nOutline:\n${outlineText(course)}`;

  // Safety: the whole course in one call when it fits (fewer requests on rate-limited free models),
  // otherwise metadata + quiz + images first and each section separately.
  const full = fullCourseText(course);
  const imageParts: ContentPart[] = images.slice(0, MAX_IMAGES).flatMap((img): ContentPart[] => [
    { type: "text", text: `Image assets[${img.index}] id="${img.assetId}" alt="${img.alt}":` },
    { type: "image_url", image_url: { url: img.dataUrl } },
  ]);
  const safetyCall = (content: string | ContentPart[]) => () =>
    track(chatJson<SafetyOutput>({ model: m.safety, system: SAFETY_SYSTEM, schemaName: "safety_review", schema: SAFETY_SCHEMA, content }));
  const safetyTasks: (() => Promise<SafetyOutput>)[] =
    full.length <= FULL_TEXT_LIMIT
      ? [safetyCall([{ type: "text", text: wrap(full) }, ...imageParts])]
      : [
          safetyCall([{ type: "text", text: wrap(`${header}\n\n## Final quiz\n${quizText(course)}`) }, ...imageParts]),
          ...course.sections.map((s, si) => safetyCall(wrap(`Course title: ${course.meta.title}\n\n${sectionText(s, si)}`))),
        ];

  // Editorial: each section in context, then the quiz and overall coherence.
  const qualityTasks: (() => Promise<QualityOutput>)[] = [
    ...course.sections.map(
      (s, si) => () =>
        track(
          chatJson<QualityOutput>({
            model: m.review,
            system: QUALITY_SYSTEM,
            schemaName: "editorial_review",
            schema: QUALITY_SCHEMA,
            maxTokens: 16_000,
            content: wrap(
              `${header}\n\nReview ONLY this section (earlier sections' glossaries also count as defined):\n` +
                `Glossary terms defined in earlier sections: ${course.sections
                  .slice(0, si)
                  .flatMap((p) => p.glossary.map((g) => g.term))
                  .join(", ") || "none"}\n\n${sectionText(s, si)}`,
            ),
          }),
        ),
    ),
    () =>
      track(
        chatJson<QualityOutput>({
          model: m.review,
          system: QUALITY_SYSTEM,
          schemaName: "editorial_review",
          schema: QUALITY_SCHEMA,
          maxTokens: 16_000,
          content: wrap(
            `Review ONLY the final quiz (correct answers, wording, explanations, coverage of the course) and the ` +
              `metadata (title, description and learning objectives must match the content, declared language and ` +
              `difficulty must be right). Sections are reviewed separately.\n\n` +
              (full.length <= FULL_TEXT_LIMIT
                ? full
                : `${header}\n\n${course.sections.map((s, si) => `sections[${si}] glossary: ${s.glossary.map((g) => `${g.term}: ${g.definition}`).join("; ")}`).join("\n")}\n\n## Final quiz\n${quizText(course)}`),
          ),
        }),
      ),
  ];

  const [safety, quality] = await Promise.all([pool(safetyTasks, CONCURRENCY), pool(qualityTasks, CONCURRENCY)]);
  return { ...aggregate(safety, quality), usage, models: m };
}
