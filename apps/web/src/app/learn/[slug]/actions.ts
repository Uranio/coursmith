"use server";

import { randomBytes } from "node:crypto";
import { gradeQuiz, type Course, type QuizAnswer } from "@coursmith/course-schema";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { invalidateCatalog } from "@/lib/cache";
import { chatJson, isQuotaError } from "@/lib/moderation/openrouter";
import { SAFETY_SCHEMA, SAFETY_SYSTEM, type SafetyOutput } from "@/lib/moderation/prompts";
import { allStepIds, getPublishedCourse, PLAYER_MODES, type PlayerMode } from "@/lib/player";
import { createAdminClient } from "@/lib/supabase/admin";

// Every action re-checks the session and only touches the caller's own rows.

async function enrollmentFor(userId: string, courseId: string) {
  const { data } = await createAdminClient()
    .from("enrollments")
    .select("version_id, completed_steps, completed_at")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .maybeSingle();
  return data;
}

async function versionContent(versionId: string): Promise<Course> {
  const { data, error } = await createAdminClient().from("course_versions").select("content").eq("id", versionId).single();
  if (error) throw error;
  return data.content as Course;
}

export async function saveProgress(courseId: string, viewed: string[], lastStepId: string | null) {
  const user = await requireUser("/");
  const enrollment = await enrollmentFor(user.id, courseId);
  if (!enrollment) return;
  const valid = new Set(allStepIds(await versionContent(enrollment.version_id)));
  const merged = [...new Set([...(enrollment.completed_steps ?? []), ...viewed.filter((id) => valid.has(id))])];
  await createAdminClient()
    .from("enrollments")
    .update({
      completed_steps: merged,
      last_step_id: lastStepId && valid.has(lastStepId) ? lastStepId : undefined,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id)
    .eq("course_id", courseId);
}

export async function savePreferredMode(courseId: string, mode: PlayerMode) {
  const user = await requireUser("/");
  if (!PLAYER_MODES.includes(mode)) return;
  await createAdminClient().from("enrollments").update({ preferred_mode: mode }).eq("user_id", user.id).eq("course_id", courseId);
}

/** Moves the learner to the live version, keeping progress on steps that still exist. */
export async function switchToLatestVersion(formData: FormData) {
  const slug = String(formData.get("slug"));
  const user = await requireUser(`/learn/${slug}`);
  const course = await getPublishedCourse(slug);
  const enrollment = course && (await enrollmentFor(user.id, course.id));
  if (!course || !enrollment) redirect(`/courses/${slug}`);
  const valid = new Set(allStepIds(await versionContent(course.current_version_id)));
  await createAdminClient()
    .from("enrollments")
    .update({
      version_id: course.current_version_id,
      completed_steps: (enrollment.completed_steps ?? []).filter((id: string) => valid.has(id)),
    })
    .eq("user_id", user.id)
    .eq("course_id", course.id);
  redirect(`/learn/${slug}`);
}

export async function startQuiz(formData: FormData) {
  const slug = String(formData.get("slug"));
  const user = await requireUser(`/learn/${slug}`);
  const course = await getPublishedCourse(slug);
  const enrollment = course && (await enrollmentFor(user.id, course.id));
  if (!course || !enrollment) redirect(`/courses/${slug}`);
  const { data, error } = await createAdminClient()
    .from("quiz_attempts")
    .insert({
      user_id: user.id,
      course_id: course.id,
      version_id: enrollment.version_id,
      seed: randomBytes(12).toString("base64url"),
    })
    .select("id")
    .single();
  if (error) throw error;
  redirect(`/learn/${slug}/quiz/${data.id}`);
}

const CERT_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const certificateCode = () =>
  Array.from(randomBytes(10), (b) => CERT_ALPHABET[b % CERT_ALPHABET.length]).join("");

export async function submitQuiz(attemptId: string, answers: Record<string, QuizAnswer>) {
  const user = await requireUser("/");
  const db = createAdminClient();
  const { data: attempt } = await db
    .from("quiz_attempts")
    .select("id, user_id, course_id, version_id, submitted_at")
    .eq("id", attemptId)
    .maybeSingle();
  if (!attempt || attempt.user_id !== user.id) throw new Error("Attempt not found.");
  const { data: course } = await db.from("courses").select("slug").eq("id", attempt.course_id).single();
  if (attempt.submitted_at) redirect(`/learn/${course!.slug}/quiz/${attemptId}`);

  const content = await versionContent(attempt.version_id);
  const result = gradeQuiz(content.finalQuiz.questions, answers);
  await db
    .from("quiz_attempts")
    .update({
      answers,
      result,
      correct_count: result.correctCount,
      total: result.total,
      score_percent: result.percent,
      passed: result.passed,
      submitted_at: new Date().toISOString(),
    })
    .eq("id", attemptId);

  if (result.passed) {
    await db
      .from("enrollments")
      .update({ completed_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("course_id", attempt.course_id)
      .is("completed_at", null);
    const { data: existing } = await db
      .from("certificates")
      .select("id, score_percent")
      .eq("user_id", user.id)
      .eq("course_id", attempt.course_id)
      .maybeSingle();
    if (!existing) {
      await db.from("certificates").insert({
        code: certificateCode(),
        user_id: user.id,
        course_id: attempt.course_id,
        version_id: attempt.version_id,
        attempt_id: attemptId,
        score_percent: result.percent,
      });
    } else if (result.percent > Number(existing.score_percent)) {
      await db
        .from("certificates")
        .update({ score_percent: result.percent, attempt_id: attemptId, version_id: attempt.version_id })
        .eq("id", existing.id);
    }
  }
  redirect(`/learn/${course!.slug}/quiz/${attemptId}`);
}

export type ReviewState = { ok: boolean; message: string } | null;

export async function submitReview(_prev: ReviewState, formData: FormData): Promise<ReviewState> {
  const courseId = String(formData.get("courseId"));
  const user = await requireUser("/");
  const rating = Number(formData.get("rating"));
  const body = String(formData.get("body") ?? "").trim().slice(0, 2000);
  if (!(rating >= 1 && rating <= 5)) return { ok: false, message: "Choose a rating from 1 to 5 stars." };

  const db = createAdminClient();
  const { data: cert } = await db.from("certificates").select("id").eq("user_id", user.id).eq("course_id", courseId).maybeSingle();
  if (!cert) return { ok: false, message: "You can review a course after passing its quiz." };

  // Reviews are public, so their text goes through the same safety reviewer as courses.
  if (body) {
    const model = process.env.MODERATION_MODEL_SAFETY;
    try {
      if (model) {
        const { data } = await chatJson<SafetyOutput>({
          model,
          system: SAFETY_SYSTEM,
          schemaName: "safety_review",
          schema: SAFETY_SCHEMA,
          content: `<course>\nA learner's public review of a course:\n${body}\n</course>`,
          maxTokens: 800,
        });
        if (data.verdict !== "safe") {
          return { ok: false, message: "Your review was not published: please keep it respectful and on topic." };
        }
      }
    } catch (err) {
      // Moderation quota exhausted or provider down: publish the rating, hold the text back.
      if (!isQuotaError(err)) console.error("review moderation:", err);
      await db.from("course_reviews").upsert(
        { course_id: courseId, user_id: user.id, rating, body, status: "hidden", updated_at: new Date().toISOString() },
        { onConflict: "course_id,user_id" },
      );
      return { ok: true, message: "Thanks! Your review will appear once it has been checked." };
    }
  }

  const { error } = await db
    .from("course_reviews")
    .upsert(
      { course_id: courseId, user_id: user.id, rating, body: body || null, status: "visible", updated_at: new Date().toISOString() },
      { onConflict: "course_id,user_id" },
    );
  if (error) return { ok: false, message: "Could not save your review. Try again." };
  invalidateCatalog();
  return { ok: true, message: "Thanks for your review!" };
}
