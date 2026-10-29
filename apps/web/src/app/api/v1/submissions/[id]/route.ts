import { authenticateCli } from "@/lib/api/auth";
import { handle, json } from "@/lib/api/http";
import { getSubmissionStatus } from "@/lib/submissions";

export const GET = handle(async (request: Request, ctx: RouteContext<"/api/v1/submissions/[id]">) => {
  const caller = await authenticateCli(request);
  const { id } = await ctx.params;
  return json(await getSubmissionStatus(caller, id));
});
