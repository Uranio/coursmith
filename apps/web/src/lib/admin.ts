import "server-only";
import { notFound } from "next/navigation";
import { getCurrentUser, type CurrentUser } from "@/lib/auth";
import { invalidateCatalog } from "@/lib/cache";
import { publishVersion } from "@/lib/moderation/pipeline";
import { createAdminClient } from "@/lib/supabase/admin";

/** Admin pages answer 404 to everyone else, so their existence is not advertised. */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") notFound();
  return user;
}

export type OverrideDecision = "approved" | "needs_revision" | "rejected";

/** An administrator's decision replaces the agent's: recorded as a review with `overridden_by`. */
export async function overrideDecision(adminId: string, versionId: string, decision: OverrideDecision, note: string) {
  const db = createAdminClient();
  const message = note.trim() || (decision === "approved" ? "Approved by an administrator." : "Decided by an administrator.");
  const { error } = await db.from("moderation_reviews").insert({
    version_id: versionId,
    decision,
    summary: message,
    issues:
      decision === "approved" || !note.trim()
        ? []
        : [{ severity: "error", code: "admin.note", path: "", message: note.trim() }],
    overridden_by: adminId,
  });
  if (error) throw error;

  if (decision === "approved") {
    await publishVersion(versionId);
  } else {
    // Taking down the live version also takes the course out of the catalog.
    const { data: v } = await db.from("course_versions").select("course_id, status").eq("id", versionId).single();
    await db.from("course_versions").update({ status: decision, decided_at: new Date().toISOString() }).eq("id", versionId);
    if (v?.status === "approved") {
      await db.from("courses").update({ current_version_id: null, status: "draft" }).eq("id", v.course_id);
      invalidateCatalog();
    }
  }
  await db.from("moderation_jobs").update({ status: "done", updated_at: new Date().toISOString() }).eq("version_id", versionId);
}

export async function retryModeration(versionId: string) {
  const db = createAdminClient();
  await db.from("course_versions").update({ status: "in_review", decided_at: null }).eq("id", versionId);
  await db
    .from("moderation_jobs")
    .upsert(
      { version_id: versionId, status: "queued", attempts: 0, run_after: new Date().toISOString(), last_error: null, locked_at: null },
      { onConflict: "version_id" },
    );
}

export async function setCourseRemoved(courseId: string, removed: boolean) {
  const db = createAdminClient();
  const { data: c } = await db.from("courses").select("current_version_id").eq("id", courseId).single();
  await db
    .from("courses")
    .update({ status: removed ? "removed" : c?.current_version_id ? "published" : "draft" })
    .eq("id", courseId);
  invalidateCatalog();
}

export async function resolveReport(adminId: string, reportId: string, status: "resolved" | "dismissed") {
  await createAdminClient()
    .from("reports")
    .update({ status, resolved_by: adminId, resolved_at: new Date().toISOString() })
    .eq("id", reportId);
}

export async function setReviewVisibility(reviewId: string, visible: boolean) {
  await createAdminClient().from("course_reviews").update({ status: visible ? "visible" : "hidden" }).eq("id", reviewId);
  invalidateCatalog();
}
