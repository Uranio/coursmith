import "server-only";
import { buildQuizPaper, type Course, type QuizResult } from "@coursmith/course-schema";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Loads an attempt for its owner. The full course content (with answers) stays on the server:
 * only `paper` (no answers) and, once submitted, `result` are meant for the browser.
 */
export async function loadAttempt(attemptId: string, userId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(attemptId)) return null;
  const db = createAdminClient();
  const { data: attempt } = await db
    .from("quiz_attempts")
    .select("id, user_id, seed, version_id, course_id, submitted_at, result, score_percent, passed")
    .eq("id", attemptId)
    .maybeSingle();
  if (!attempt || attempt.user_id !== userId) return null;
  const { data: version } = await db.from("course_versions").select("content").eq("id", attempt.version_id).single();
  const content = version!.content as Course;
  return {
    attempt: attempt as typeof attempt & { result: QuizResult | null },
    content,
    paper: buildQuizPaper(content.finalQuiz.questions, attempt.seed),
  };
}
