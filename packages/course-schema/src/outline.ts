import type { Course, CourseMeta } from "./schema.js";

/** What anonymous visitors may see: metadata and the table of contents, no lesson content. */
export interface CourseOutline {
  meta: CourseMeta;
  sections: { id: string; title: string; summary: string; steps: { id: string; title: string }[] }[];
  stats: { sections: number; steps: number; glossaryTerms: number; quizQuestions: number };
}

export function toOutline(course: Course): CourseOutline {
  return {
    meta: course.meta,
    sections: course.sections.map((s) => ({
      id: s.id,
      title: s.title,
      summary: s.summary,
      steps: s.steps.map((st) => ({ id: st.id, title: st.title })),
    })),
    stats: {
      sections: course.sections.length,
      steps: course.sections.reduce((n, s) => n + s.steps.length, 0),
      glossaryTerms: course.sections.reduce((n, s) => n + s.glossary.length, 0),
      quizQuestions: course.finalQuiz.questions.length,
    },
  };
}

/** Course content for the player. The final quiz is served separately, without answers. */
export type PlayerCourse = Omit<Course, "finalQuiz"> & { quizQuestionCount: number };

export function toPlayerCourse(course: Course): PlayerCourse {
  const { finalQuiz, ...rest } = course;
  return { ...rest, quizQuestionCount: finalQuiz.questions.length };
}
