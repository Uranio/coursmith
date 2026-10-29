import { after } from "next/server";
import { authenticateCli } from "@/lib/api/auth";
import { handle, json } from "@/lib/api/http";
import { runModerationJobs } from "@/lib/moderation/jobs";
import { finalizeSubmission } from "@/lib/submissions";

// Asset processing, then the moderation review runs after the response is sent.
export const maxDuration = 300;

export const POST = handle(async (request: Request, ctx: RouteContext<"/api/v1/submissions/[id]/finalize">) => {
  const caller = await authenticateCli(request);
  const { id } = await ctx.params;
  const result = await finalizeSubmission(caller, id);
  if (result.status === "in_review") {
    after(() => runModerationJobs({ max: 1, budgetMs: 250_000 }).catch((err) => console.error("moderation:", err)));
  }
  return json(result, result.status === "needs_revision" ? 422 : 200);
});
