import { z } from "zod";
import { course } from "./schema.js";

export const COURSE_SCHEMA_ID = "https://coursmith.dev/schema/course-1.0.json";

/** JSON Schema of course.json in the shape an author writes it (defaults optional). */
export function courseJsonSchema(): Record<string, unknown> {
  return {
    ...z.toJSONSchema(course, { io: "input", target: "draft-2020-12" }),
    $id: COURSE_SCHEMA_ID,
    title: "Coursmith course",
  };
}
