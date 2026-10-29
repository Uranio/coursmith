import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildQuizPaper, gradeQuiz, toOutline, toPlayerCourse, validateCourse, type Course } from "../src/index.js";

const course = validateCourse(
  JSON.parse(
    readFileSync(
      resolve(import.meta.dirname, "../../../plugin/skills/coursmith-course/examples/sample-course/course.json"),
      "utf8",
    ),
  ),
).course as Course;
const questions = course.finalQuiz.questions;

const allCorrect = Object.fromEntries(
  questions.map((q) => [q.id, q.type === "ordering" ? q.items.map((i) => i.id) : q.correct]),
);

describe("buildQuizPaper", () => {
  it("never leaks answers or explanations", () => {
    const text = JSON.stringify(buildQuizPaper(questions, "seed-1"));
    expect(text).not.toContain('"correct"');
    expect(text).not.toContain('"explanation"');
  });

  it("is deterministic per seed and differs between seeds", () => {
    const a = buildQuizPaper(questions, "attempt-a");
    expect(buildQuizPaper(questions, "attempt-a")).toEqual(a);
    expect(buildQuizPaper(questions, "attempt-b").map((q) => q.id)).not.toEqual(a.map((q) => q.id));
  });

  it("never presents ordering items already in the correct order", () => {
    for (let i = 0; i < 50; i++) {
      const paper = buildQuizPaper(questions, `s${i}`);
      const ordering = paper.find((q) => q.type === "ordering");
      expect(ordering && "items" in ordering && ordering.items.map((x) => x.id)).not.toEqual([
        "plant",
        "step-up",
        "transmission",
        "step-down",
        "home",
      ]);
    }
  });
});

describe("gradeQuiz", () => {
  it("scores a perfect attempt", () => {
    const r = gradeQuiz(questions, allCorrect);
    expect(r).toMatchObject({ correctCount: 10, total: 10, percent: 100, passed: true, sectionsToReview: [] });
  });

  it("passes at exactly 70%", () => {
    const answers = { ...allCorrect, q1: "b", q5: "b", q9: "b" };
    const r = gradeQuiz(questions, answers);
    expect(r.percent).toBe(70);
    expect(r.passed).toBe(true);
    expect(r.sectionsToReview).toEqual(["generation", "grid", "home"]);
  });

  it("fails below 70% and treats missing answers as wrong", () => {
    const { q1: _a, q2: _b, q3: _c, q4: _d, ...rest } = allCorrect;
    const r = gradeQuiz(questions, rest);
    expect(r.percent).toBe(60);
    expect(r.passed).toBe(false);
    expect(r.results.find((x) => x.id === "q1")?.given).toBeNull();
  });

  it("requires the exact set for multiple choice", () => {
    expect(gradeQuiz(questions, { ...allCorrect, q3: ["a", "c"] }).results.find((x) => x.id === "q3")?.correct).toBe(false);
    expect(gradeQuiz(questions, { ...allCorrect, q3: ["d", "a", "c"] }).results.find((x) => x.id === "q3")?.correct).toBe(true);
  });

  it("checks ordering position by position", () => {
    const wrong = ["step-up", "plant", "transmission", "step-down", "home"];
    expect(gradeQuiz(questions, { ...allCorrect, q6: wrong }).results.find((x) => x.id === "q6")?.correct).toBe(false);
  });
});

describe("outline and player views", () => {
  it("outline contains no lesson content", () => {
    const outline = toOutline(course);
    expect(outline.stats).toEqual({ sections: 3, steps: 8, glossaryTerms: 31, quizQuestions: 10 });
    expect(JSON.stringify(outline)).not.toContain("blocks");
  });

  it("player course omits the final quiz", () => {
    const player = toPlayerCourse(course);
    expect("finalQuiz" in player).toBe(false);
    expect(player.quizQuestionCount).toBe(10);
  });
});
