import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isQuotaError } from "./openrouter";
import { moderateVersion } from "./pipeline";

const MAX_ATTEMPTS = 3;
/** Out of OpenRouter credits or free quota: wait without using up the course's attempts. */
const CREDITS_RETRY_MS = 15 * 60_000;

/**
 * Processes queued moderation jobs until the queue is empty, `max` jobs are done or the time budget
 * runs out. Called right after a submission (via `after()`) and by the cron route as a safety net.
 */
export async function runModerationJobs({ max = 5, budgetMs = 240_000 } = {}): Promise<{ processed: number }> {
  const db = createAdminClient();
  const deadline = Date.now() + budgetMs;
  let processed = 0;

  while (processed < max && Date.now() < deadline) {
    const { data, error } = await db.rpc("claim_moderation_job");
    if (error) throw error;
    const job = (data as { id: string; version_id: string; attempts: number }[] | null)?.[0];
    if (!job) break;
    processed++;

    try {
      await moderateVersion(job.version_id);
      await db
        .from("moderation_jobs")
        .update({ status: "done", last_error: null, updated_at: new Date().toISOString() })
        .eq("id", job.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`moderation job ${job.id} failed (attempt ${job.attempts}):`, message);
      if (isQuotaError(err)) {
        const retryAt = err.retryAt ? err.retryAt.getTime() + 60_000 : Date.now() + CREDITS_RETRY_MS;
        await db
          .from("moderation_jobs")
          .update({
            status: "queued",
            attempts: job.attempts - 1,
            last_error: message.slice(0, 2_000),
            run_after: new Date(retryAt).toISOString(),
            locked_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id);
        break; // every other job would fail the same way
      }
      const failed = job.attempts >= MAX_ATTEMPTS;
      await db
        .from("moderation_jobs")
        .update({
          status: failed ? "failed" : "queued",
          last_error: message.slice(0, 2_000),
          run_after: new Date(Date.now() + 60_000 * 2 ** job.attempts).toISOString(),
          locked_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
    }
  }
  return { processed };
}
