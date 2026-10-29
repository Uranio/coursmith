import { PASSING_SCORE_PERCENT } from "./constants.js";
import type { QuizQuestion } from "./schema.js";

/** A quiz question as sent to the learner: no correct answers, no explanations, options shuffled. */
export type QuizPaperQuestion =
  | { id: string; type: "single" | "multiple"; prompt: string; options: { id: string; text: string }[] }
  | { id: string; type: "true_false"; prompt: string }
  | { id: string; type: "ordering"; prompt: string; items: { id: string; text: string }[] };

/** single: option id · multiple: option ids · true_false: boolean · ordering: item ids in chosen order. */
export type QuizAnswer = string | string[] | boolean;

export interface QuestionResult {
  id: string;
  sectionRef: string;
  correct: boolean;
  given: QuizAnswer | null;
  expected: QuizAnswer;
  explanation: string;
}

export interface QuizResult {
  correctCount: number;
  total: number;
  percent: number;
  passed: boolean;
  results: QuestionResult[];
  /** Sections with at least one wrong answer, in course order of first appearance in the quiz. */
  sectionsToReview: string[];
}

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a: number): () => number {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic Fisher–Yates shuffle, so the same attempt seed always yields the same paper. */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const rand = mulberry32(hashSeed(seed));
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export function buildQuizPaper(questions: readonly QuizQuestion[], seed: string): QuizPaperQuestion[] {
  return seededShuffle(questions, seed).map((q): QuizPaperQuestion => {
    const s = `${seed}:${q.id}`;
    switch (q.type) {
      case "single":
      case "multiple":
        return { id: q.id, type: q.type, prompt: q.prompt, options: seededShuffle(q.options, s) };
      case "true_false":
        return { id: q.id, type: q.type, prompt: q.prompt };
      case "ordering": {
        let items = seededShuffle(q.items, s);
        // Never hand out the solution already in order.
        if (items.every((it, i) => it.id === q.items[i]!.id)) items = [...items.slice(1), items[0]!];
        return { id: q.id, type: q.type, prompt: q.prompt, items };
      }
    }
  });
}

function expectedAnswer(q: QuizQuestion): QuizAnswer {
  switch (q.type) {
    case "single":
    case "multiple":
    case "true_false":
      return q.correct;
    case "ordering":
      return q.items.map((i) => i.id);
  }
}

function isCorrect(q: QuizQuestion, given: QuizAnswer | undefined): boolean {
  if (given === undefined) return false;
  switch (q.type) {
    case "single":
      return given === q.correct;
    case "true_false":
      return given === q.correct;
    case "multiple": {
      if (!Array.isArray(given)) return false;
      const g = new Set(given);
      return g.size === q.correct.length && q.correct.every((c) => g.has(c));
    }
    case "ordering":
      return Array.isArray(given) && given.length === q.items.length && q.items.every((it, i) => given[i] === it.id);
  }
}

export function gradeQuiz(
  questions: readonly QuizQuestion[],
  answers: Readonly<Record<string, QuizAnswer>>,
  passingPercent = PASSING_SCORE_PERCENT,
): QuizResult {
  const results = questions.map((q): QuestionResult => {
    const given = Object.hasOwn(answers, q.id) ? answers[q.id]! : undefined;
    return {
      id: q.id,
      sectionRef: q.sectionRef,
      correct: isCorrect(q, given),
      given: given ?? null,
      expected: expectedAnswer(q),
      explanation: q.explanation,
    };
  });
  const correctCount = results.filter((r) => r.correct).length;
  const total = results.length;
  const percent = total ? Math.round((correctCount / total) * 1000) / 10 : 0;
  const sectionsToReview = [...new Set(results.filter((r) => !r.correct).map((r) => r.sectionRef))];
  return { correctCount, total, percent, passed: percent >= passingPercent, results, sectionsToReview };
}
