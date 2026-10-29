import { timingSafeEqual } from "node:crypto";
import { json } from "@/lib/api/http";
import { runModerationJobs } from "@/lib/moderation/jobs";

export const maxDuration = 300;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization") ?? "";
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(given);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Vercel Cron: picks up jobs that `after()` did not finish (crashes, timeouts, retries). */
export async function GET(request: Request) {
  if (!authorized(request)) return json({ error: "unauthorized" }, 401);
  return json(await runModerationJobs({ max: 10, budgetMs: 240_000 }));
}
